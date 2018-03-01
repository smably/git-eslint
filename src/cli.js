#!/usr/bin/env node

// @flow
/* eslint-disable no-console */

import path from 'path';
import yargs from 'yargs';
import colors from 'colors/safe';

import DeltaLinter, { HEAD, INDEX, WORKDIR } from './index';
import type { Rev } from './index';

type DiffSpec = {
  oldRev?: Rev,
  newRev: Rev,
  findBase: boolean,
};

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

const FILE_EXTENSIONS = ['.js', '.jsx'];

const { argv } = yargs
  .usage('Usage: $0 <show|diff> [commit]')
  .command('show [commit]', 'show lint errors introduced in a commit')
  .command({
    command: 'diff [commits..]',
    desc: 'show lint errors introduced between commits or in the working dir',
    builder: y => y.option('cached').option('staged'),
  })
  .option('a', {
    alias: 'all',
    desc: 'Show all violations for modified files (not just violations from changed lines)',
    boolean: true,
  })
  .option('debug', {
    desc: 'Print debug messages',
    boolean: true,
  })
  .demandCommand(1)
  .strict()
  .help('h')
  .alias('h', 'help');

function printIgnoreStats(errorCount, warningCount) {
  let errorCountMessage = '';
  let warningCountMessage = '';

  if (errorCount === 1) {
    errorCountMessage += colors.red.bold('1 error');
  } else if (errorCount > 1) {
    errorCountMessage += colors.red.bold(`${errorCount} errors`);
  }

  if (errorCount && warningCount) {
    warningCountMessage += ' and';
  }

  if (warningCount === 1) {
    warningCountMessage += colors.yellow(' 1 warning');
  } else if (warningCount > 1) {
    warningCountMessage += colors.yellow(` ${warningCount} warnings`);
  }

  const totalCount = errorCount + warningCount;
  const [, scriptPath, ...scriptArgs] = process.argv;
  const command = `${path.relative(process.cwd(), scriptPath)} ${scriptArgs.join(' ')} --all`;

  console.log(
    `Ignored ${errorCountMessage}${warningCountMessage} that ${
      totalCount === 1 ? 'was' : 'were'
    } found outside the added or modified lines.`,
  );
  console.log(`(Run ${colors.yellow(command)} to show all errors and warnings.)\n`);
}

function getRevIDs([arg1, arg2]) {
  if (arg1.includes('...')) {
    const [oldRevID, newRevID] = arg1.split('...');
    return { oldRevID, newRevID, findBase: true };
  }

  if (arg1.includes('..')) {
    const [oldRevID, newRevID] = arg1.split('..');
    return { oldRevID, newRevID, findBase: false };
  }

  return { oldRevID: arg1, newRevID: arg2, findBase: false };
}

function getRevs(command): DiffSpec {
  // Diff with at least one commit arg
  if (command === 'diff') {
    const { commits } = argv;

    if (Array.isArray(commits)) {
      const { oldRevID, newRevID, findBase } = getRevIDs(commits);

      const oldRev: Rev = { id: oldRevID };
      const newRev: Rev = newRevID ? { id: newRevID } : HEAD;

      return { oldRev, newRev, findBase };
    }

    // Diff with no commits specified
    return {
      oldRev: HEAD,
      newRev: argv.cached || argv.staged ? INDEX : WORKDIR,
      findBase: false,
    };
  }

  if (command === 'show') {
    const { commit } = argv;
    const newRev: Rev = commit ? { id: commit } : HEAD;

    return { newRev, findBase: false };
  }

  throw new Error(`Unknown command ${command}.`);
}

const [command] = argv._;
const { oldRev, newRev, findBase } = getRevs(command);

const { debug } = argv;

const dl = new DeltaLinter();

dl
  .init(oldRev, newRev, findBase)
  .catch(err => {
    console.error(colors.red.bold('Error while initializing linter:'));
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    if (debug) {
      console.log('OldRev:', oldRev);
      console.log('NewRev:', newRev);
      console.log('FindBase:', findBase);
    }
    return dl.getDelta(`**/*{${FILE_EXTENSIONS.join(',')}}`, argv.all);
  })
  .then(delta => {
    if (!delta) {
      process.exit(0);
      return;
    }

    dl
      .lint(delta)
      .then(report => {
        if (report.errorCount + report.warningCount === 0) {
          process.exit(0);
        }

        const formatter = dl.getFormatter();
        console.log(formatter(report.results));

        if (report.filteredErrorCount + report.filteredWarningCount > 0) {
          printIgnoreStats(report.filteredErrorCount, report.filteredWarningCount);
        }

        if (report.errorCount > 0) {
          process.exit(1);
        }
      })
      .catch(err => {
        console.log('Error occurred when trying to lint:');
        console.log(err);
        process.exit(1);
      });
  });
