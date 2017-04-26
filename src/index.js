const Git = require('nodegit');
const CLIEngine = require('eslint').CLIEngine;
const minimatch = require('minimatch');
const path = require('path');

const ALL_LINES = Symbol('all lines');

const INDEX_COMMIT = Symbol('index commit');
const INDEX_TREE = Symbol('index tree');

// For some reason ESLint doesn't provide these as constants :(
const WARNING_SEVERITY = 1;
const ERROR_SEVERITY = 2;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

async function getLines(patch) {
  const flatten = arr => [].concat(...arr);
  const hunks = await patch.hunks();
  const hunkLines = await Promise.all(hunks.map(hunk => hunk.lines()));

  return flatten(hunkLines);
}

function filterResults(results, delta) {
  const totals = {
    errorCount: 0,
    warningCount: 0,
    filteredErrorCount: 0,
    filteredWarningCount: 0,
  };

  results.forEach(result => {
    let filteredErrorCount = 0;
    let filteredWarningCount = 0;

    const fileLinesAdded = delta.get(result.filePath);

    if (fileLinesAdded !== ALL_LINES) {
      const filteredMessages = result.messages.filter(message => {
        if (fileLinesAdded.has(message.line)) {
          return true;
        }

        if (message.severity === WARNING_SEVERITY) {
          filteredWarningCount++;
        } else if (message.severity === ERROR_SEVERITY) {
          filteredErrorCount++;
        }

        return false;
      });

      /* eslint-disable no-param-reassign */
      result.messages = filteredMessages;
      result.errorCount -= filteredErrorCount;
      result.warningCount -= filteredWarningCount;
      /* eslint-enable no-param-reassign */
    }

    totals.errorCount += result.errorCount;
    totals.warningCount += result.warningCount;
    totals.filteredErrorCount += filteredErrorCount;
    totals.filteredWarningCount += filteredWarningCount;
  });

  return {
    results,
    errorCount: totals.errorCount,
    warningCount: totals.warningCount,
    filteredErrorCount: totals.filteredErrorCount,
    filteredWarningCount: totals.filteredWarningCount,
  };
}

//------------------------------------------------------------------------------
// Main class
//------------------------------------------------------------------------------

class DeltaLinter {
  constructor() {
    this.eslint = new CLIEngine();
  }

  async init(oldRev, newRev) {
    this.repo = await Git.Repository.openExt('.', 0, '');

    const revs = { old: oldRev, new: newRev };

    if (!oldRev && !newRev) {
      revs.old = 'HEAD'; // No revs passed, so diff HEAD against the index (special logic will handle null case)
    } else if (!oldRev) {
      revs.old = 'master'; // Only newRev was passed, so diff master against newRev
    }

    const oldCommit = await this.getCommit(revs.old);
    const newCommit = await this.getCommit(revs.new);

    this.oldCommit = await this.getBaseCommit(oldCommit, newCommit);
    this.newCommit = (await newCommit) || INDEX_COMMIT;

    this.oldTree = await this.oldCommit.getTree();
    this.newTree = await (this.newCommit === INDEX_COMMIT ? Promise.resolve(INDEX_TREE) : this.newCommit.getTree());
  }

  async getCommit(rev) {
    if (!rev) {
      return null;
    }

    const revObj = await Git.Revparse.single(this.repo, rev);

    return this.repo.getCommit(revObj.id());
  }

  // Get the merge base (nearest common ancestor) in case this.oldCommit isn't an ancestor of this.newCommit
  async getBaseCommit(oldCommit, newCommit) {
    if (!newCommit) {
      return oldCommit;
    }

    const baseId = await Git.Merge.base(this.repo, oldCommit.id(), newCommit.id());

    if (baseId === oldCommit.id()) {
      return oldCommit;
    }

    return this.repo.getCommit(baseId);
  }

  async getPatches() {
    const diff = this.newTree === INDEX_TREE
      ? await Git.Diff.treeToIndex(this.repo, this.oldTree)
      : await Git.Diff.treeToTree(this.repo, this.oldTree, this.newTree);

    await diff.findSimilar();

    return diff.patches();
  }

  async getDelta(fileGlob, countAllLines) {
    const matchFileGlob = patch => (fileGlob ? minimatch(patch.newFile().path(), fileGlob) : true);
    const getAllPatchLines = patch => ({
      filePath: patch.newFile().path(),
      lines: ALL_LINES,
    });
    const getModifiedPatchLines = async patch => {
      const lines = await getLines(patch);

      return {
        filePath: patch.newFile().path(),
        lines,
      };
    };

    const patches = await this.getPatches();

    const matchingPatches = patches.filter(matchFileGlob);
    const newFilePatches = matchingPatches.filter(patch => patch.isAdded());
    const modifiedFilePatches = matchingPatches.filter(patch => patch.isModified() || patch.isRenamed());
    const newFileLines = newFilePatches.map(getAllPatchLines);

    // If countAllLines flag is passed, skip changed line calculation and include entirety of changed files in delta
    if (countAllLines) {
      const modifiedFileLines = modifiedFilePatches.map(getAllPatchLines);
      return this.processLines(newFileLines.concat(modifiedFileLines));
    }

    const modifiedFileLines = await Promise.all(modifiedFilePatches.map(getModifiedPatchLines));

    return this.processLines(newFileLines.concat(modifiedFileLines));
  }

  processLines(files) {
    if (files.length === 0) {
      return null;
    }

    const delta = files.map(file => {
      const absolutePath = path.resolve(this.repo.workdir(), file.filePath);

      if (file.lines === ALL_LINES) {
        return [absolutePath, ALL_LINES];
      }

      const fileLinesAdded = new Set(file.lines.filter(line => line.oldLineno() < 0).map(line => line.newLineno()));

      return [absolutePath, fileLinesAdded];
    });

    return new Map(delta);
  }

  getFormatter() {
    return this.eslint.getFormatter();
  }

  hasPartiallyStagedFiles(stagedFiles) {
    return stagedFiles.some(filePath => {
      const status = Git.Status.file(this.repo, path.relative(this.repo.workdir(), filePath));
      return (status & Git.Status.STATUS.WT_MODIFIED) !== 0; // eslint-disable-line no-bitwise
    });
  }

  async lint(delta) {
    const deltaFiles = [...delta.keys()];
    let results;

    const getRelativePath = absolutePath => path.relative(this.repo.workdir(), absolutePath);
    const getBlobText = async (id, filePath) => {
      const blob = this.repo.getBlob(id);
      return [blob.toString(), filePath];
    };
    const getLintResults = async fileContentsPromise => {
      const files = await fileContentsPromise;
      const reports = files.map(file => this.eslint.executeOnText(...file));
      return reports.reduce((partialResults, report) => partialResults.concat(report.results), []);
    };

    if (this.newTree === INDEX_TREE && !this.hasPartiallyStagedFiles(deltaFiles)) {
      // Simple case: running ESLint on staged files and no changes in the working dir
      results = this.eslint.executeOnFiles(deltaFiles).results;
    } else if (this.newTree === INDEX_TREE) {
      const index = await this.repo.index();
      const getFileContents = async filePath => {
        const indexEntry = await index.getByPath(getRelativePath(filePath), 0);
        return getBlobText(indexEntry.id, filePath);
      };
      const files = await Promise.all(deltaFiles.map(getFileContents));

      results = await getLintResults(files);
    } else {
      const getFileContents = async filePath => {
        const entry = await this.newCommit.getEntry(getRelativePath(filePath));
        return getBlobText(entry.id(), filePath);
      };
      const files = await Promise.all(deltaFiles.map(getFileContents));

      results = await getLintResults(files);
    }

    return filterResults(results, delta);
  }
}

module.exports = DeltaLinter;
