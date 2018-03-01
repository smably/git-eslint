'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WORKDIR = exports.INDEX = exports.HEAD = undefined;

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

var getLinesAdded = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(patch) {
    var flatten, hunks, hunkLines, lines, addedLineNumbers;
    return _regenerator2.default.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            flatten = function flatten(arr) {
              var _ref2;

              return (_ref2 = []).concat.apply(_ref2, (0, _toConsumableArray3.default)(arr));
            };

            _context.next = 3;
            return patch.hunks();

          case 3:
            hunks = _context.sent;
            _context.next = 6;
            return _promise2.default.all(hunks.map(function (hunk) {
              return hunk.lines();
            }));

          case 6:
            hunkLines = _context.sent;
            lines = flatten(hunkLines);
            addedLineNumbers = lines.filter(function (line) {
              return line.oldLineno() < 0;
            }).map(function (line) {
              return line.newLineno();
            });
            return _context.abrupt('return', {
              allLines: false,
              lineSet: new _set2.default(addedLineNumbers)
            });

          case 10:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this);
  }));

  return function getLinesAdded(_x) {
    return _ref.apply(this, arguments);
  };
}();

var _nodegit = require('nodegit');

var _nodegit2 = _interopRequireDefault(_nodegit);

var _eslint = require('eslint');

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ALL_LINES = {
  allLines: true,
  lineSet: new _set2.default()
};

// For some reason ESLint doesn't provide these as constants :(
var WARNING_SEVERITY = 1;
var ERROR_SEVERITY = 2;

var HEAD = exports.HEAD = { id: 'HEAD' };
var INDEX = exports.INDEX = { id: null, isIndex: true };
var WORKDIR = exports.WORKDIR = { id: null, isWorkdir: true };

function filterResults(results, delta) {
  var totals = {
    errorCount: 0,
    warningCount: 0,
    filteredErrorCount: 0,
    filteredWarningCount: 0,
    filteredFixableErrorCount: 0,
    filteredFixableWarningCount: 0
  };

  var filteredResults = results.map(function (fileResult) {
    var filteredErrorCount = 0;
    var filteredWarningCount = 0;
    var filteredFixableErrorCount = 0;
    var filteredFixableWarningCount = 0;

    var fileLinesAdded = delta.get(fileResult.filePath);

    if (fileLinesAdded == null) {
      throw new Error(`Fatal: missing lint results for file ${fileResult.filePath}`);
    }

    var isAddedLine = function isAddedLine(message) {
      if (fileLinesAdded.lineSet.has(message.line)) {
        return true;
      }

      if (message.severity === WARNING_SEVERITY) {
        filteredWarningCount++;

        if (message.fix) {
          filteredFixableWarningCount++;
        }
      } else if (message.severity === ERROR_SEVERITY) {
        filteredErrorCount++;

        if (message.fix) {
          filteredFixableErrorCount++;
        }
      }

      return false;
    };

    var messages = fileLinesAdded === ALL_LINES ? fileResult.messages : fileResult.messages.filter(isAddedLine);
    var errorCount = fileResult.errorCount - filteredErrorCount;
    var warningCount = fileResult.warningCount - filteredWarningCount;
    var fixableErrorCount = fileResult.fixableErrorCount - filteredFixableErrorCount;
    var fixableWarningCount = fileResult.fixableWarningCount - filteredFixableWarningCount;

    totals.errorCount += errorCount;
    totals.warningCount += warningCount;
    totals.filteredErrorCount += filteredErrorCount;
    totals.filteredWarningCount += filteredWarningCount;
    totals.filteredFixableErrorCount += filteredFixableErrorCount;
    totals.filteredFixableWarningCount += filteredFixableWarningCount;

    return (0, _extends3.default)({}, fileResult, {
      messages,
      errorCount,
      warningCount,
      fixableErrorCount,
      fixableWarningCount
    });
  });

  return {
    results: filteredResults,
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
    (0, _classCallCheck3.default)(this, DeltaLinter);

    this.eslint = new _eslint.CLIEngine();
  }

  (0, _createClass3.default)(DeltaLinter, [{
    key: 'init',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(oldRev, newRev, findBase) {
        var oldCommit, newCommit;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!(oldRev != null && oldRev.id == null)) {
                  _context2.next = 2;
                  break;
                }

                throw new Error('Old rev did not contain a valid rev ID.');

              case 2:
                if (!(oldRev == null && newRev.id == null)) {
                  _context2.next = 4;
                  break;
                }

                throw new Error('Single rev provided did not contain a valid rev ID.');

              case 4:

                // Use ~ to get the parent of the new rev if the old rev is not set (handles the `show rev` case)
                this.oldRev = oldRev || (0, _extends3.default)({}, newRev, { id: `${newRev.id || ''}~` });
                this.newRev = newRev;

                _context2.next = 8;
                return _nodegit2.default.Repository.openExt('.', 0, '');

              case 8:
                this.repo = _context2.sent;
                _context2.next = 11;
                return this.getCommit(this.oldRev.id || '');

              case 11:
                oldCommit = _context2.sent;

                if (!newRev.id) {
                  _context2.next = 18;
                  break;
                }

                _context2.next = 15;
                return this.getCommit(newRev.id);

              case 15:
                _context2.t0 = _context2.sent;
                _context2.next = 19;
                break;

              case 18:
                _context2.t0 = null;

              case 19:
                newCommit = _context2.t0;

                if (!findBase) {
                  _context2.next = 26;
                  break;
                }

                _context2.next = 23;
                return this.getBaseCommit(oldCommit, newCommit);

              case 23:
                _context2.t1 = _context2.sent;
                _context2.next = 27;
                break;

              case 26:
                _context2.t1 = oldCommit;

              case 27:
                this.oldCommit = _context2.t1;

                this.newCommit = newCommit;

                _context2.next = 31;
                return this.oldCommit.getTree();

              case 31:
                this.oldTree = _context2.sent;

                if (!this.newCommit) {
                  _context2.next = 38;
                  break;
                }

                _context2.next = 35;
                return this.newCommit.getTree();

              case 35:
                _context2.t2 = _context2.sent;
                _context2.next = 39;
                break;

              case 38:
                _context2.t2 = null;

              case 39:
                this.newTree = _context2.t2;

              case 40:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function init(_x2, _x3, _x4) {
        return _ref3.apply(this, arguments);
      }

      return init;
    }()
  }, {
    key: 'getCommit',
    value: function () {
      var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(rev) {
        var revObj;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                _context3.next = 2;
                return _nodegit2.default.Revparse.single(this.repo, rev);

              case 2:
                revObj = _context3.sent;
                return _context3.abrupt('return', this.repo.getCommit(revObj.id()));

              case 4:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function getCommit(_x5) {
        return _ref4.apply(this, arguments);
      }

      return getCommit;
    }()

    // Get the merge base (nearest common ancestor) in case this.oldCommit isn't an ancestor of this.newCommit

  }, {
    key: 'getBaseCommit',
    value: function () {
      var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(oldCommit, newCommit) {
        var baseId;
        return _regenerator2.default.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                if (newCommit) {
                  _context4.next = 2;
                  break;
                }

                return _context4.abrupt('return', oldCommit);

              case 2:
                _context4.next = 4;
                return _nodegit2.default.Merge.base(this.repo, oldCommit.id(), newCommit.id());

              case 4:
                baseId = _context4.sent;

                if (!(baseId === oldCommit.id())) {
                  _context4.next = 7;
                  break;
                }

                return _context4.abrupt('return', oldCommit);

              case 7:
                return _context4.abrupt('return', this.repo.getCommit(baseId));

              case 8:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function getBaseCommit(_x6, _x7) {
        return _ref5.apply(this, arguments);
      }

      return getBaseCommit;
    }()
  }, {
    key: 'getDiff',
    value: function getDiff() {
      if (this.newRev.isWorkdir) {
        return _nodegit2.default.Diff.treeToWorkdir(this.repo, this.oldTree);
      }

      if (this.newRev.isIndex) {
        return _nodegit2.default.Diff.treeToIndex(this.repo, this.oldTree);
      }

      return _nodegit2.default.Diff.treeToTree(this.repo, this.oldTree, this.newTree);
    }
  }, {
    key: 'getPatches',
    value: function () {
      var _ref6 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5() {
        var diff;
        return _regenerator2.default.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                _context5.next = 2;
                return this.getDiff();

              case 2:
                diff = _context5.sent;
                _context5.next = 5;
                return diff.findSimilar();

              case 5:
                return _context5.abrupt('return', diff.patches());

              case 6:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function getPatches() {
        return _ref6.apply(this, arguments);
      }

      return getPatches;
    }()
  }, {
    key: 'getDelta',
    value: function () {
      var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7(fileGlob, countAllLines) {
        var _this = this;

        var matchFileGlob, getAllPatchLines, getAddedPatchLines, patches, matchingPatches, newFilePatches, modifiedFilePatches, newFileLines, _modifiedFileLines, modifiedFileLines;

        return _regenerator2.default.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                matchFileGlob = function matchFileGlob(patch) {
                  return fileGlob ? (0, _minimatch2.default)(patch.newFile().path(), fileGlob) : true;
                };

                getAllPatchLines = function getAllPatchLines(patch) {
                  return {
                    filePath: patch.newFile().path(),
                    lines: ALL_LINES
                  };
                };

                getAddedPatchLines = function () {
                  var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(patch) {
                    var filePath, lines;
                    return _regenerator2.default.wrap(function _callee6$(_context6) {
                      while (1) {
                        switch (_context6.prev = _context6.next) {
                          case 0:
                            filePath = patch.newFile().path();
                            _context6.next = 3;
                            return getLinesAdded(patch);

                          case 3:
                            lines = _context6.sent;
                            return _context6.abrupt('return', { filePath, lines });

                          case 5:
                          case 'end':
                            return _context6.stop();
                        }
                      }
                    }, _callee6, _this);
                  }));

                  return function getAddedPatchLines(_x10) {
                    return _ref8.apply(this, arguments);
                  };
                }();

                _context7.next = 5;
                return this.getPatches();

              case 5:
                patches = _context7.sent;
                matchingPatches = patches.filter(matchFileGlob);
                newFilePatches = matchingPatches.filter(function (patch) {
                  return patch.isAdded();
                });
                modifiedFilePatches = matchingPatches.filter(function (patch) {
                  return patch.isModified() || patch.isRenamed();
                });
                newFileLines = newFilePatches.map(getAllPatchLines);

                // If countAllLines flag is passed, skip changed line calculation and include entirety of changed files in delta

                if (!countAllLines) {
                  _context7.next = 13;
                  break;
                }

                _modifiedFileLines = modifiedFilePatches.map(getAllPatchLines);
                return _context7.abrupt('return', this.processLines(newFileLines.concat(_modifiedFileLines)));

              case 13:
                _context7.next = 15;
                return _promise2.default.all(modifiedFilePatches.map(getAddedPatchLines));

              case 15:
                modifiedFileLines = _context7.sent;
                return _context7.abrupt('return', this.processLines(newFileLines.concat(modifiedFileLines)));

              case 17:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      function getDelta(_x8, _x9) {
        return _ref7.apply(this, arguments);
      }

      return getDelta;
    }()
  }, {
    key: 'processLines',
    value: function processLines(files) {
      var _this2 = this;

      if (files.length === 0) {
        return null;
      }

      var delta = files.map(function (file) {
        var absolutePath = _path2.default.resolve(_this2.repo.workdir(), file.filePath);
        return [absolutePath, file.lines];
      });

      return new _map2.default(delta);
    }
  }, {
    key: 'getFormatter',
    value: function getFormatter() {
      return this.eslint.getFormatter();
    }
  }, {
    key: 'hasPartiallyStagedFiles',
    value: function hasPartiallyStagedFiles(stagedFiles) {
      var _this3 = this;

      return stagedFiles.some(function (filePath) {
        var status = _nodegit2.default.Status.file(_this3.repo, _path2.default.relative(_this3.repo.workdir(), filePath));

        /* eslint-disable no-bitwise */
        var hasStagedChanges = (status & _nodegit2.default.Status.STATUS.INDEX_MODIFIED) !== 0;
        var hasUnstagedChanges = (status & _nodegit2.default.Status.STATUS.WT_MODIFIED) !== 0;
        /* eslint-enable no-bitwise */

        return hasStagedChanges && hasUnstagedChanges;
      });
    }
  }, {
    key: 'lintFiles',
    value: function () {
      var _ref9 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee11(deltaFiles) {
        var _this4 = this;

        var getRelativePath, getBlobText, getLintResults, deltaHasPartiallyStagedFiles, _eslint$executeOnFile, results, index, _getFileContents, _files, getFileContents, files;

        return _regenerator2.default.wrap(function _callee11$(_context11) {
          while (1) {
            switch (_context11.prev = _context11.next) {
              case 0:
                getRelativePath = function getRelativePath(absolutePath) {
                  return _path2.default.relative(_this4.repo.workdir(), absolutePath);
                };

                getBlobText = function () {
                  var _ref10 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(id, filePath) {
                    var blob;
                    return _regenerator2.default.wrap(function _callee8$(_context8) {
                      while (1) {
                        switch (_context8.prev = _context8.next) {
                          case 0:
                            _context8.next = 2;
                            return _this4.repo.getBlob(id);

                          case 2:
                            blob = _context8.sent;
                            return _context8.abrupt('return', [blob.toString(), filePath]);

                          case 4:
                          case 'end':
                            return _context8.stop();
                        }
                      }
                    }, _callee8, _this4);
                  }));

                  return function getBlobText(_x12, _x13) {
                    return _ref10.apply(this, arguments);
                  };
                }();

                getLintResults = function () {
                  var _ref11 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee9(fileContents) {
                    var reports;
                    return _regenerator2.default.wrap(function _callee9$(_context9) {
                      while (1) {
                        switch (_context9.prev = _context9.next) {
                          case 0:
                            reports = fileContents.map(function (_ref12) {
                              var _ref13 = (0, _slicedToArray3.default)(_ref12, 2),
                                  fileText = _ref13[0],
                                  filePath = _ref13[1];

                              return _this4.eslint.executeOnText(fileText, filePath);
                            });
                            return _context9.abrupt('return', reports.reduce(function (partialResults, report) {
                              return partialResults.concat(report.results);
                            }, []));

                          case 2:
                          case 'end':
                            return _context9.stop();
                        }
                      }
                    }, _callee9, _this4);
                  }));

                  return function getLintResults(_x14) {
                    return _ref11.apply(this, arguments);
                  };
                }();

                deltaHasPartiallyStagedFiles = this.hasPartiallyStagedFiles(deltaFiles);

                if (!((this.newRev.isIndex || this.newRev.isWorkdir) && !deltaHasPartiallyStagedFiles)) {
                  _context11.next = 7;
                  break;
                }

                // Simple case: no partially staged files, so we can run ESLint directly on the filesystem
                _eslint$executeOnFile = this.eslint.executeOnFiles(deltaFiles), results = _eslint$executeOnFile.results;
                return _context11.abrupt('return', results);

              case 7:
                if (!this.newRev.isIndex) {
                  _context11.next = 16;
                  break;
                }

                _context11.next = 10;
                return this.repo.index();

              case 10:
                index = _context11.sent;

                _getFileContents = function _getFileContents(filePath) {
                  var indexEntry = index.getByPath(getRelativePath(filePath), 0);
                  return indexEntry ? getBlobText(indexEntry.id, filePath) : null;
                };

                _context11.next = 14;
                return _promise2.default.all(deltaFiles.map(_getFileContents).filter(Boolean));

              case 14:
                _files = _context11.sent;
                return _context11.abrupt('return', getLintResults(_files));

              case 16:
                if (!this.newRev.isWorkdir) {
                  _context11.next = 18;
                  break;
                }

                throw new Error("Not yet implemented: can't run diff with partially staged changes.");

              case 18:
                getFileContents = function () {
                  var _ref14 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee10(filePath) {
                    var entry;
                    return _regenerator2.default.wrap(function _callee10$(_context10) {
                      while (1) {
                        switch (_context10.prev = _context10.next) {
                          case 0:
                            if (!(_this4.newCommit == null)) {
                              _context10.next = 2;
                              break;
                            }

                            throw new Error('Expected new commit to be non-null');

                          case 2:
                            _context10.next = 4;
                            return _this4.newCommit.getEntry(getRelativePath(filePath));

                          case 4:
                            entry = _context10.sent;
                            return _context10.abrupt('return', getBlobText(entry.id(), filePath));

                          case 6:
                          case 'end':
                            return _context10.stop();
                        }
                      }
                    }, _callee10, _this4);
                  }));

                  return function getFileContents(_x15) {
                    return _ref14.apply(this, arguments);
                  };
                }();

                _context11.next = 21;
                return _promise2.default.all(deltaFiles.map(getFileContents));

              case 21:
                files = _context11.sent;
                return _context11.abrupt('return', getLintResults(files));

              case 23:
              case 'end':
                return _context11.stop();
            }
          }
        }, _callee11, this);
      }));

      function lintFiles(_x11) {
        return _ref9.apply(this, arguments);
      }

      return lintFiles;
    }()
  }, {
    key: 'lint',
    value: function () {
      var _ref15 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee12(delta) {
        var deltaFiles, results;
        return _regenerator2.default.wrap(function _callee12$(_context12) {
          while (1) {
            switch (_context12.prev = _context12.next) {
              case 0:
                deltaFiles = [].concat((0, _toConsumableArray3.default)(delta.keys()));
                _context12.next = 3;
                return this.lintFiles(deltaFiles);

              case 3:
                results = _context12.sent;
                return _context12.abrupt('return', filterResults(results, delta));

              case 5:
              case 'end':
                return _context12.stop();
            }
          }
        }, _callee12, this);
      }));

      function lint(_x16) {
        return _ref15.apply(this, arguments);
      }

      return lint;
    }()
  }]);
  return DeltaLinter;
}();

exports.default = DeltaLinter;