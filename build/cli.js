#!/usr/bin/env node
'use strict';

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _toArray2 = require('babel-runtime/helpers/toArray');

var _toArray3 = _interopRequireDefault(_toArray2);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _yargs = require('yargs');

var _yargs2 = _interopRequireDefault(_yargs);

var _safe = require('colors/safe');

var _safe2 = _interopRequireDefault(_safe);

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*

  Base support: show
    - git-eslint show
    - git-eslint show <commit>

  Base support: diff (** should we handle --no-index?)
    - git-eslint diff [-- <path>]
    - git-eslint diff --cached [-- <path>]
    - git-eslint diff <commit> [-- <path>]
    - git-eslint diff <commit> <commit> [-- <path>]
    - git-eslint diff <commit>..<commit> [-- <path>]
    - git-eslint diff <commit>...<commit> [-- <path>]

  Future enhancement: add an '--ext' option (like eslint) to override file extensions

*/

/* eslint-disable no-console */

var FILE_EXTENSIONS = ['.js', '.jsx'];

var _yargs$usage$command$ = _yargs2.default.usage('Usage: $0 <show|diff> [commit]').command('show [commit]', 'show lint errors introduced in a commit').command({
  command: 'diff [commits..]',
  desc: 'show lint errors introduced between commits or in the working dir',
  builder: function builder(y) {
    return y.option('cached').option('staged');
  }
}).option('a', {
  alias: 'all',
  desc: 'Show all violations for modified files (not just violations from changed lines)',
  boolean: true
}).option('debug', {
  desc: 'Print debug messages',
  boolean: true
}).demandCommand(1).strict().help('h').alias('h', 'help'),
    argv = _yargs$usage$command$.argv;

function printIgnoreStats(errorCount, warningCount) {
  var errorCountMessage = '';
  var warningCountMessage = '';

  if (errorCount === 1) {
    errorCountMessage += _safe2.default.red.bold('1 error');
  } else if (errorCount > 1) {
    errorCountMessage += _safe2.default.red.bold(`${errorCount} errors`);
  }

  if (errorCount && warningCount) {
    warningCountMessage += ' and';
  }

  if (warningCount === 1) {
    warningCountMessage += _safe2.default.yellow(' 1 warning');
  } else if (warningCount > 1) {
    warningCountMessage += _safe2.default.yellow(` ${warningCount} warnings`);
  }

  var totalCount = errorCount + warningCount;

  var _process$argv = (0, _toArray3.default)(process.argv),
      scriptPath = _process$argv[1],
      scriptArgs = _process$argv.slice(2);

  var command = `${_path2.default.relative(process.cwd(), scriptPath)} ${scriptArgs.join(' ')} --all`;

  console.log(`Ignored ${errorCountMessage}${warningCountMessage} that ${totalCount === 1 ? 'was' : 'were'} found outside the added or modified lines.`);
  console.log(`(Run ${_safe2.default.yellow(command)} to show all errors and warnings.)\n`);
}

function getRevIDs(_ref) {
  var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
      arg1 = _ref2[0],
      arg2 = _ref2[1];

  if (arg1.includes('...')) {
    var _arg1$split = arg1.split('...'),
        _arg1$split2 = (0, _slicedToArray3.default)(_arg1$split, 2),
        oldRevID = _arg1$split2[0],
        newRevID = _arg1$split2[1];

    return { oldRevID, newRevID, findBase: true };
  }

  if (arg1.includes('..')) {
    var _arg1$split3 = arg1.split('..'),
        _arg1$split4 = (0, _slicedToArray3.default)(_arg1$split3, 2),
        _oldRevID = _arg1$split4[0],
        _newRevID = _arg1$split4[1];

    return { oldRevID: _oldRevID, newRevID: _newRevID, findBase: false };
  }

  return { oldRevID: arg1, newRevID: arg2, findBase: false };
}

function getRevs(command) {
  // Diff with at least one commit arg
  if (command === 'diff') {
    var commits = argv.commits;


    if (Array.isArray(commits)) {
      var _getRevIDs = getRevIDs(commits),
          oldRevID = _getRevIDs.oldRevID,
          newRevID = _getRevIDs.newRevID,
          _findBase = _getRevIDs.findBase;

      var _oldRev = { id: oldRevID };
      var _newRev = newRevID ? { id: newRevID } : _index.HEAD;

      return { oldRev: _oldRev, newRev: _newRev, findBase: _findBase };
    }

    // Diff with no commits specified
    return {
      oldRev: _index.HEAD,
      newRev: argv.cached || argv.staged ? _index.INDEX : _index.WORKDIR,
      findBase: false
    };
  }

  if (command === 'show') {
    var commit = argv.commit;

    var _newRev2 = commit ? { id: commit } : _index.HEAD;

    return { newRev: _newRev2, findBase: false };
  }

  throw new Error(`Unknown command ${command}.`);
}

var _argv$_ = (0, _slicedToArray3.default)(argv._, 1),
    command = _argv$_[0];

var _getRevs = getRevs(command),
    oldRev = _getRevs.oldRev,
    newRev = _getRevs.newRev,
    findBase = _getRevs.findBase;

var debug = argv.debug;


var dl = new _index2.default();

dl.init(oldRev, newRev, findBase).catch(function (err) {
  console.error(_safe2.default.red.bold('Error while initializing linter:'));
  console.error(err);
  process.exit(1);
}).then(function () {
  if (debug) {
    console.log('OldRev:', oldRev);
    console.log('NewRev:', newRev);
    console.log('FindBase:', findBase);
  }
  return dl.getDelta(`**/*{${FILE_EXTENSIONS.join(',')}}`, argv.all);
}).then(function (delta) {
  if (!delta) {
    process.exit(0);
    return;
  }

  dl.lint(delta).then(function (report) {
    if (report.errorCount + report.warningCount === 0) {
      process.exit(0);
    }

    var formatter = dl.getFormatter();
    console.log(formatter(report.results));

    if (report.filteredErrorCount + report.filteredWarningCount > 0) {
      printIgnoreStats(report.filteredErrorCount, report.filteredWarningCount);
    }

    if (report.errorCount > 0) {
      process.exit(1);
    }
  }).catch(function (err) {
    console.log('Error occurred when trying to lint:');
    console.log(err);
    process.exit(0);
  });
});