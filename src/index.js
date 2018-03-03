// @flow

import Git from 'nodegit';
import { CLIEngine } from 'eslint';
import minimatch from 'minimatch';
import path from 'path';

type LineSpec = { allLines: boolean, lineSet: Set<number> };
type Delta = Map<string, LineSpec>;

const ALL_LINES: LineSpec = {
  allLines: true,
  lineSet: new Set(),
};

// For some reason ESLint doesn't provide these as constants :(
const WARNING_SEVERITY = 1;
const ERROR_SEVERITY = 2;

export type Rev = {
  id: ?string,
  isWorkdir?: boolean,
  isIndex?: boolean,
};

export const HEAD: Rev = { id: 'HEAD' };
export const INDEX: Rev = { id: null, isIndex: true };
export const WORKDIR: Rev = { id: null, isWorkdir: true };

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

async function getLinesAdded(patch: Git.ConvenientPatch) {
  const flatten = arr => [].concat(...arr);
  const hunks = await patch.hunks();
  const hunkLines = await Promise.all(hunks.map(hunk => hunk.lines()));
  const lines = flatten(hunkLines);
  const addedLineNumbers = lines.filter(line => line.oldLineno() < 0).map(line => line.newLineno());

  return {
    allLines: false,
    lineSet: new Set(addedLineNumbers),
  };
}

function filterResults(oldResults: LintResults, newResults: LintResults, delta: Delta) {
  const totals = {
    errorCount: 0,
    warningCount: 0,
    filteredErrorCount: 0,
    filteredWarningCount: 0,
    filteredFixableErrorCount: 0,
    filteredFixableWarningCount: 0,
  };

  const filteredResults = newResults.map(fileResult => {
    const fileLinesAdded = delta.get(fileResult.filePath);
    const oldFileResult = oldResults.find(o => o.filePath === fileResult.filePath);

    if (fileLinesAdded == null) {
      throw new Error(`Fatal: missing lint results for file ${fileResult.filePath}`);
    }

    if (oldFileResult == null) {
      throw new Error(`Fatal: couldn't find file in old lint results ${fileResult.filePath}`);
    }

    const filteredErrors = [];
    const filteredWarnings = [];
    let filteredFixableErrorCount = 0;
    let filteredFixableWarningCount = 0;

    const isAddedLine = message => {
      if (fileLinesAdded.lineSet.has(message.line)) {
        return true;
      }

      if (message.severity === WARNING_SEVERITY) {
        filteredWarnings.push(message);

        if (message.fix) {
          filteredFixableWarningCount++;
        }
      } else if (message.severity === ERROR_SEVERITY) {
        filteredErrors.push(message);

        if (message.fix) {
          filteredFixableErrorCount++;
        }
      }

      return false;
    };

    const messages = fileLinesAdded === ALL_LINES ? fileResult.messages : fileResult.messages.filter(isAddedLine);

    const isSameProblem = (message1, message2) =>
      message1.ruleId === message2.ruleId && message1.source === message2.source && message1.column === message2.column;

    const oldErrors = filteredErrors.filter(filteredError => {
      if (!oldFileResult.messages.find(message => isSameProblem(message, filteredError))) {
        messages.push(filteredError);

        if (filteredError.fix) {
          filteredFixableErrorCount--;
        }

        return false;
      }

      return true;
    });

    const oldWarnings = filteredWarnings.filter(filteredWarning => {
      if (!oldFileResult.messages.find(message => isSameProblem(message, filteredWarning))) {
        messages.push(filteredWarning);

        if (filteredWarning.fix) {
          filteredFixableWarningCount--;
        }

        return false;
      }

      return true;
    });

    const oldErrorCount = oldErrors.length;
    const oldWarningCount = oldWarnings.length;

    const errorCount = fileResult.errorCount - oldErrorCount;
    const warningCount = fileResult.warningCount - oldWarningCount;
    const fixableErrorCount = fileResult.fixableErrorCount - filteredFixableErrorCount;
    const fixableWarningCount = fileResult.fixableWarningCount - filteredFixableWarningCount;

    totals.errorCount += errorCount;
    totals.warningCount += warningCount;
    totals.filteredErrorCount += oldErrorCount;
    totals.filteredWarningCount += oldWarningCount;
    totals.filteredFixableErrorCount += filteredFixableErrorCount;
    totals.filteredFixableWarningCount += filteredFixableWarningCount;

    return {
      ...fileResult,
      messages,
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount,
    };
  });

  return {
    results: filteredResults,
    errorCount: totals.errorCount,
    warningCount: totals.warningCount,
    filteredErrorCount: totals.filteredErrorCount,
    filteredWarningCount: totals.filteredWarningCount,
  };
}

//------------------------------------------------------------------------------
// Main class
//------------------------------------------------------------------------------
export default class DeltaLinter {
  eslint: CLIEngine;
  repo: Git.Repository;
  oldRev: Rev;
  newRev: Rev;
  oldCommit: Git.Commit;
  newCommit: ?Git.Commit;
  oldTree: Git.Tree;
  newTree: ?Git.Tree;

  constructor() {
    this.eslint = new CLIEngine();
  }

  async init(oldRev: ?Rev, newRev: Rev, findBase: boolean) {
    if (oldRev != null && oldRev.id == null) {
      throw new Error('Old rev did not contain a valid rev ID.');
    }

    if (oldRev == null && newRev.id == null) {
      throw new Error('Single rev provided did not contain a valid rev ID.');
    }

    // Use ~ to get the parent of the new rev if the old rev is not set (handles the `show rev` case)
    this.oldRev = oldRev || { ...newRev, id: `${newRev.id || ''}~` };
    this.newRev = newRev;

    this.repo = await Git.Repository.openExt('.', 0, '');

    const oldCommit = await this.getCommit(this.oldRev.id || ''); // TODO is there a cleaner way to satisfy flow than falling bock to the empty string?
    const newCommit = newRev.id ? await this.getCommit(newRev.id) : null;

    this.oldCommit = findBase ? await this.getBaseCommit(oldCommit, newCommit) : oldCommit;
    this.newCommit = newCommit;

    this.oldTree = await this.oldCommit.getTree();
    this.newTree = this.newCommit ? await this.newCommit.getTree() : null;
  }

  async getCommit(rev: string) {
    const revObj = await Git.Revparse.single(this.repo, rev);

    return this.repo.getCommit(revObj.id());
  }

  // Get the merge base (nearest common ancestor) in case this.oldCommit isn't an ancestor of this.newCommit
  async getBaseCommit(oldCommit: Git.Commit, newCommit: ?Git.Commit) {
    if (!newCommit) {
      return oldCommit;
    }

    const baseId = await Git.Merge.base(this.repo, oldCommit.id(), newCommit.id());

    if (baseId === oldCommit.id()) {
      return oldCommit;
    }

    return this.repo.getCommit(baseId);
  }

  getDiff() {
    if (this.newRev.isWorkdir) {
      return Git.Diff.treeToWorkdir(this.repo, this.oldTree);
    }

    if (this.newRev.isIndex) {
      return Git.Diff.treeToIndex(this.repo, this.oldTree);
    }

    return Git.Diff.treeToTree(this.repo, this.oldTree, this.newTree);
  }

  async getPatches() {
    const diff = await this.getDiff();
    await diff.findSimilar();

    return diff.patches();
  }

  async getDelta(fileGlob: string, countAllLines: boolean) {
    const matchFileGlob = patch => (fileGlob ? minimatch(patch.newFile().path(), fileGlob) : true);
    const getAllPatchLines = (patch: Git.ConvenientPatch) => ({
      filePath: patch.newFile().path(),
      lines: ALL_LINES,
    });
    const getAddedPatchLines = async (patch: Git.ConvenientPatch) => {
      const filePath = patch.newFile().path();
      const lines = await getLinesAdded(patch);

      return { filePath, lines };
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

    const modifiedFileLines: { filePath: string, lines: LineSpec }[] = await Promise.all(
      modifiedFilePatches.map(getAddedPatchLines),
    );

    return this.processLines(newFileLines.concat(modifiedFileLines));
  }

  processLines(files: { filePath: string, lines: LineSpec }[]): ?Delta {
    if (files.length === 0) {
      return null;
    }

    const delta = files.map(file => {
      const absolutePath = path.resolve(this.repo.workdir(), file.filePath);
      return [absolutePath, file.lines];
    });

    return new Map(delta);
  }

  getFormatter() {
    return this.eslint.getFormatter();
  }

  hasPartiallyStagedFiles(stagedFiles: string[]) {
    return stagedFiles.some(filePath => {
      const status = Git.Status.file(this.repo, path.relative(this.repo.workdir(), filePath));

      /* eslint-disable no-bitwise */
      const hasStagedChanges = (status & Git.Status.STATUS.INDEX_MODIFIED) !== 0;
      const hasUnstagedChanges = (status & Git.Status.STATUS.WT_MODIFIED) !== 0;
      /* eslint-enable no-bitwise */

      return hasStagedChanges && hasUnstagedChanges;
    });
  }

  async lintFiles(deltaFiles: string[]) {
    const getRelativePath = absolutePath => path.relative(this.repo.workdir(), absolutePath);
    const getBlobText = async (id, filePath) => {
      const blob = await this.repo.getBlob(id);
      return [blob.toString(), filePath];
    };
    const getLintResults = async (fileContents: [string, string][]) => {
      const reports = fileContents.map(([fileText, filePath]) => this.eslint.executeOnText(fileText, filePath));
      return reports.reduce((partialResults, report) => partialResults.concat(report.results), []);
    };

    const deltaHasPartiallyStagedFiles = this.hasPartiallyStagedFiles(deltaFiles);

    if ((this.newRev.isIndex || this.newRev.isWorkdir) && !deltaHasPartiallyStagedFiles) {
      // Simple case: no partially staged files, so we can run ESLint directly on the filesystem
      const { results } = this.eslint.executeOnFiles(deltaFiles);
      return [results, results];
    }

    if (this.newRev.isIndex) {
      // Fallback case: running with --staged when there are partially staged files (need to get the file content from the index)
      const index = await this.repo.index();

      const getFileContents = filePath => {
        const indexEntry = index.getByPath(getRelativePath(filePath), 0);
        return indexEntry ? getBlobText(indexEntry.id, filePath) : null;
      };

      const files = await Promise.all(deltaFiles.map(getFileContents).filter(Boolean));
      const results = await getLintResults(files);

      return [results, results];
    }

    if (this.newRev.isWorkdir) {
      // Really tough case: running ESLint without --staged when there are partially staged files
      // Need to do something like:
      //  * do a Diff.indexToWorkdir to get a diff of the changes in the index
      //  * apply the diff... in reverse? to the file contents in the index to reconstruct the unstaged changes
      // For now, bail out with an informative error
      throw new Error("Not yet implemented: can't run diff with partially staged changes.");
    }

    const getOldFileContents = async filePath => {
      const oldEntry = await this.oldCommit.getEntry(getRelativePath(filePath));

      return getBlobText(oldEntry.id(), filePath);
    };

    const getNewFileContents = async filePath => {
      if (this.newCommit == null) {
        throw new Error('Expected new commit to be non-null');
      }

      const newEntry = await this.newCommit.getEntry(getRelativePath(filePath));

      return getBlobText(newEntry.id(), filePath);
    };

    const oldFiles = await Promise.all(deltaFiles.map(getOldFileContents));
    const newFiles = await Promise.all(deltaFiles.map(getNewFileContents));

    return Promise.all([getLintResults(oldFiles), getLintResults(newFiles)]);
  }

  async lint(delta: Delta) {
    const deltaFiles = [...delta.keys()];
    const [oldResults, newResults] = await this.lintFiles(deltaFiles);

    return filterResults(oldResults, newResults, delta);
  }
}
