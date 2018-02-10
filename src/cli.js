#!/usr/bin/env node

const argv = require('yargs')
  .usage('Usage: $0 <staged|commit|branch>')
  .command({
    command: 'staged',
    desc: 'Lint staged changes',
  })
  .command({
    command: 'commit',
    desc: 'Lint changes from a single commit (HEAD by default)',
    builder: yargs =>
      yargs.option('r', {
        alias: 'rev',
        description: 'A revision identifier corresponding to a commit, as recognized by git rev-parse',
        default: 'HEAD',
      }),
  })
  .command({
    command: 'branch',
    desc: 'Lint changes from the specified revision (HEAD by default), relative to a base branch (master by default)',
    builder: yargs =>
      yargs
        .option('b', {
          alias: 'base',
          description: 'The identifier of the base revision, as recognized by git rev-parse',
          default: 'master',
        })
        .option('r', {
          alias: 'rev',
          description:
            'The identifier of the revision to diff against the base revision, as recognized by git rev-parse',
          default: 'HEAD',
        }),
  })
  .option('a', {
    alias: 'all',
    desc: 'Show all violations for modified files (not just violations from changed lines)',
    boolean: true,
  })
  .option('hook', {
    desc: 'Run as as Git hook (use exit status to indicate lint result)',
    boolean: true,
  })
  .demandCommand(1)
  .strict()
  .help('h')
  .alias('h', 'help').argv;

require('colors'); // no need to assign it to anything as it extends String.prototype
const DeltaLinter = require('./DeltaLinter');
const path = require('path');

const BANNER = `
  ███████╗███████╗██╗     ██╗███╗   ██╗████████╗
  ██╔════╝██╔════╝██║     ██║████╗  ██║╚══██╔══╝
  █████╗  ███████╗██║     ██║██╔██╗ ██║   ██║
  ██╔══╝  ╚════██║██║     ██║██║╚██╗██║   ██║
  ███████╗███████║███████╗██║██║ ╚████║   ██║
  ╚══════╝╚══════╝╚══════╝╚═╝╚═╝  ╚═══╝   ╚═╝
`;

function printIgnoreStats(errorCount, warningCount) {
  let errorCountMessage = '';
  let warningCountMessage = '';

  if (errorCount === 1) {
    errorCountMessage += '1 error'.red;
  } else if (errorCount > 1) {
    errorCountMessage += `${errorCount} errors`.red;
  }

  if (errorCount && warningCount) {
    warningCountMessage += ' and';
  }

  if (warningCount === 1) {
    warningCountMessage += ' 1 warning'.yellow;
  } else if (warningCount > 1) {
    warningCountMessage += ` ${warningCount} warnings`.yellow;
  }

  const totalCount = errorCount + warningCount;
  const [, scriptPath, ...scriptArgs] = process.argv;
  const command = `${path.relative(process.cwd(), scriptPath)} ${scriptArgs.join(' ')} --all`;

  console.log(
    `Ignored ${errorCountMessage}${warningCountMessage} that ${
      totalCount === 1 ? 'was' : 'were'
    } found outside the added or modified lines.`,
  );
  console.log(`(Run ${command.yellow} to show all errors and warnings.)\n`);
}

const [command] = argv._;

const dl = new DeltaLinter();
let oldRev, newRev;

switch (command) {
  case 'staged':
    oldRev = 'HEAD';
    break;
  case 'commit':
    oldRev = `${argv.rev}~`;
    newRev = argv.rev;
    break;
  case 'branch':
    oldRev = argv.base;
    newRev = argv.rev;
    break;
  default:
    throw new Error(`Unknown command ${command}.`);
}

const initMessage =
  command === 'staged'
    ? 'Linting staged changes...\n'
    : `Linting changes between ${oldRev.yellow} and ${newRev.yellow}...\n`;

dl
  .init(oldRev, newRev)
  .catch(err => {
    console.error('Error while initializing linter:'.red.bold);
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    console.log(initMessage);
    return dl.getDelta('**/*.{js,jss,jsx}', argv.all);
  })
  .then(delta => {
    if (delta) {
      console.log(BANNER);
    } else {
      console.log('Nothing to lint!');
      process.exit(0);
    }

    dl.lint(delta).then(report => {
      const successMessage = '🎉  LINT OK! 🎉'.green.bold;
      const failureMessage = '💩  LINT FAILED! 💩'.red.bold;

      if (report.errorCount + report.warningCount === 0) {
        console.log();
        console.log(successMessage);
        process.exit(0);
      }

      const formatter = dl.getFormatter();
      console.log(formatter(report.results));

      if (report.filteredErrorCount + report.filteredWarningCount > 0) {
        printIgnoreStats(report.filteredErrorCount, report.filteredWarningCount);
      }

      const hasErrors = report.errorCount > 0;
      if (hasErrors) {
        console.log(failureMessage);

        if (command === 'branch' && argv.hook) {
          console.log('\n☞  You will not be able to merge this branch until you fix the errors above.'.yellow);
        }

        process.exit(argv.hook ? 1 : 0);
      }
    });
  });
