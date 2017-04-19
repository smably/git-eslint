'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var Git = require('nodegit');
var CLIEngine = require('eslint').CLIEngine;
var minimatch = require('minimatch');
var path = require('path');

var ALL_LINES = Symbol('all lines');

var INDEX_COMMIT = Symbol('index commit');
var INDEX_TREE = Symbol('index tree');

// For some reason ESLint doesn't provide these as constants :(
var WARNING_SEVERITY = 1;
var ERROR_SEVERITY = 2;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function getLines(patch) {
  var flatten = function flatten(arr) {
    var _ref;

    return (_ref = []).concat.apply(_ref, _toConsumableArray(arr));
  };
  return patch.hunks().then(function (hunks) {
    return Promise.all(hunks.map(function (hunk) {
      return hunk.lines();
    }));
  }).then(flatten);
}

function filterResults(results, delta) {
  var totals = {
    errorCount: 0,
    warningCount: 0,
    filteredErrorCount: 0,
    filteredWarningCount: 0
  };

  results.forEach(function (result) {
    var filteredErrorCount = 0;
    var filteredWarningCount = 0;

    var fileLinesAdded = delta.get(result.filePath);

    if (fileLinesAdded !== ALL_LINES) {
      var filteredMessages = result.messages.filter(function (message) {
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
    filteredWarningCount: totals.filteredWarningCount
  };
}

//------------------------------------------------------------------------------
// Main class
//------------------------------------------------------------------------------

var DeltaLinter = function () {
  function DeltaLinter() {
    _classCallCheck(this, DeltaLinter);

    this.eslint = new CLIEngine();
  }

  _createClass(DeltaLinter, [{
    key: 'init',
    value: function init(oldRev, newRev) {
      var _this = this;

      return Git.Repository.openExt('.', 0, '').then(function (repo) {
        _this.repo = repo;
      }).then(function () {
        var revs = { old: oldRev, new: newRev };

        if (!oldRev && !newRev) {
          revs.old = 'HEAD'; // No revs passed, so diff HEAD against the index (special logic will handle null case)
        } else if (!oldRev) {
          revs.old = 'master'; // Only newRev was passed, so diff master against newRev
        }

        return Promise.all([_this.getCommit(revs.old), _this.getCommit(revs.new)]);
      }).then(function (_ref2) {
        var _ref3 = _slicedToArray(_ref2, 2),
            oldCommit = _ref3[0],
            newCommit = _ref3[1];

        return Promise.all([_this.getBaseCommit(oldCommit, newCommit), Promise.resolve(newCommit || INDEX_COMMIT)]);
      }).then(function (_ref4) {
        var _ref5 = _slicedToArray(_ref4, 2),
            oldCommit = _ref5[0],
            newCommit = _ref5[1];

        _this.oldCommit = oldCommit;
        _this.newCommit = newCommit;
      }).then(function () {
        return Promise.all([_this.oldCommit.getTree(), _this.newCommit === INDEX_COMMIT ? Promise.resolve(INDEX_TREE) : _this.newCommit.getTree()]);
      }).then(function (_ref6) {
        var _ref7 = _slicedToArray(_ref6, 2),
            oldTree = _ref7[0],
            newTree = _ref7[1];

        _this.oldTree = oldTree;
        _this.newTree = newTree;
      });
    }
  }, {
    key: 'getCommit',
    value: function getCommit(rev) {
      var _this2 = this;

      if (!rev) {
        return Promise.resolve(null);
      }

      return Git.Revparse.single(this.repo, rev).then(function (revObj) {
        return _this2.repo.getCommit(revObj.id());
      });
    }

    // Get the merge base (nearest common ancestor) in case this.oldCommit isn't an ancestor of this.newCommit

  }, {
    key: 'getBaseCommit',
    value: function getBaseCommit(oldCommit, newCommit) {
      var _this3 = this;

      if (!newCommit) {
        return oldCommit;
      }

      return Git.Merge.base(this.repo, oldCommit.id(), newCommit.id()).then(function (baseId) {
        return baseId === oldCommit.id() ? oldCommit : _this3.repo.getCommit(baseId);
      });
    }
  }, {
    key: 'getPatches',
    value: function getPatches() {
      var diffPromise = this.newTree === INDEX_TREE ? Git.Diff.treeToIndex(this.repo, this.oldTree) : Git.Diff.treeToTree(this.repo, this.oldTree, this.newTree);

      return diffPromise.then(function (diff) {
        return diff.findSimilar().then(function () {
          return diff.patches();
        });
      });
    }
  }, {
    key: 'getDelta',
    value: function getDelta(fileGlob, countAllLines) {
      var _this4 = this;

      var matchFileGlob = function matchFileGlob(patch) {
        return fileGlob ? minimatch(patch.newFile().path(), fileGlob) : true;
      };
      var includeAllLines = function includeAllLines(patch) {
        return {
          filePath: patch.newFile().path(),
          lines: ALL_LINES
        };
      };
      var includeChangedLines = function includeChangedLines(patch) {
        return new Promise(function (resolve) {
          getLines(patch).then(function (lines) {
            resolve({
              filePath: patch.newFile().path(),
              lines
            });
          });
        });
      };

      return this.getPatches().then(function (patches) {
        var matchingPatches = patches.filter(matchFileGlob);
        var newFilePatches = matchingPatches.filter(function (patch) {
          return patch.isAdded();
        });
        var modifiedFilePatches = matchingPatches.filter(function (patch) {
          return patch.isModified() || patch.isRenamed();
        });
        var newFileLines = newFilePatches.map(includeAllLines);

        // If countAllLines flag is passed, skip changed line calculation and include entirety of changed files in delta
        if (countAllLines) {
          var modifiedFileLines = modifiedFilePatches.map(includeAllLines);
          return Promise.resolve(_this4.processLines(newFileLines.concat(modifiedFileLines)));
        }

        var fileLinePromises = modifiedFilePatches.map(includeChangedLines);

        return Promise.all(fileLinePromises).then(function (modifiedFileLines) {
          return newFileLines.concat(modifiedFileLines);
        }).then(function (files) {
          return _this4.processLines(files);
        });
      });
    }
  }, {
    key: 'processLines',
    value: function processLines(files) {
      var _this5 = this;

      if (files.length === 0) {
        return null;
      }

      var delta = files.map(function (file) {
        var absolutePath = path.resolve(_this5.repo.workdir(), file.filePath);

        if (file.lines === ALL_LINES) {
          return [absolutePath, ALL_LINES];
        }

        var fileLinesAdded = new Set(file.lines.filter(function (line) {
          return line.oldLineno() < 0;
        }).map(function (line) {
          return line.newLineno();
        }));

        return [absolutePath, fileLinesAdded];
      });

      return new Map(delta);
    }
  }, {
    key: 'getFormatter',
    value: function getFormatter() {
      return this.eslint.getFormatter();
    }
  }, {
    key: 'hasPartiallyStagedFiles',
    value: function hasPartiallyStagedFiles(stagedFiles) {
      var _this6 = this;

      return stagedFiles.some(function (filePath) {
        var status = Git.Status.file(_this6.repo, path.relative(_this6.repo.workdir(), filePath));
        return (status & Git.Status.STATUS.WT_MODIFIED) !== 0; // eslint-disable-line no-bitwise
      });
    }
  }, {
    key: 'lint',
    value: function lint(delta) {
      var _this7 = this;

      var deltaFiles = [].concat(_toConsumableArray(delta.keys()));
      var resultsPromise = void 0;

      var getRelativePath = function getRelativePath(absolutePath) {
        return path.relative(_this7.repo.workdir(), absolutePath);
      };
      var getBlobText = function getBlobText(id, filePath) {
        return _this7.repo.getBlob(id).then(function (blob) {
          return [blob.toString(), filePath];
        });
      };
      var getLintResults = function getLintResults(fileContentsPromise) {
        return fileContentsPromise.then(function (files) {
          var reports = files.map(function (file) {
            var _eslint;

            return (_eslint = _this7.eslint).executeOnText.apply(_eslint, _toConsumableArray(file));
          });
          return reports.reduce(function (partialResults, report) {
            return partialResults.concat(report.results);
          }, []);
        });
      };

      if (this.newTree === INDEX_TREE && !this.hasPartiallyStagedFiles(deltaFiles)) {
        // Simple case: running ESLint on staged files and no changes in the working dir
        resultsPromise = Promise.resolve(this.eslint.executeOnFiles(deltaFiles).results);
      } else if (this.newTree === INDEX_TREE) {
        resultsPromise = getLintResults(this.repo.index().then(function (index) {
          return Promise.all(deltaFiles.map(function (filePath) {
            var indexEntry = index.getByPath(getRelativePath(filePath), 0);
            return getBlobText(indexEntry.id, filePath);
          }));
        }));
      } else {
        resultsPromise = getLintResults(Promise.all(deltaFiles.map(function (filePath) {
          return _this7.newCommit.getEntry(getRelativePath(filePath)).then(function (entry) {
            return getBlobText(entry.id(), filePath);
          });
        })));
      }

      return resultsPromise.then(function (results) {
        return filterResults(results, delta);
      });
    }
  }]);

  return DeltaLinter;
}();

module.exports = DeltaLinter;