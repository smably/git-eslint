# git-eslint

A tool to filter ESLint output by git history.

## Installation and Usage

### Local Installation

Install via npm:

```sh
$ npm install git-eslint --save-dev
```

### CLI

`git-eslint` uses the same command format as `git`. Two commands are supported: `show` and `diff`. They act similarly to
the corresponding `git` commands.

For example, `git-eslint diff` will show any ESLint errors or warnings on lines changed or added in the working tree
relative to the index. `git-eslint diff --cached` operates the same, but on the index relative to HEAD. The `diff`
command also accepts a commit ref (a SHA, branch name, tag, or any other valid git identifier), which will show errors
or warnings on lines changed or added between the specified commit and the working directory. If two commit refs are
specified, the output will reflect the changes between those commits.

`git-eslint show` will show any ESLint errors or warnings on lines changed or added in the last commit.
`git-eslint show` also accepts a commit ref, which will show ESLint errors and warnings on lines changed in that commit.

If you know how to use `git diff` and `git show`, you know how to use `git-eslint`!

### Library

You can use the underlying library code by requiring it in your project:

```js
import DeltaLinter from 'git-eslint';

const dl = new DeltaLinter();

const oldRev = { id: '626f2f21b95a2bbe86fc3ed88e5274ab11218987' };
const newRev = { isWorkdir: true };

dl
  .init(oldRev, newRev)
  .then(() => dl.getDelta('**/*.js'))
  .then(delta => dl.lint(delta))
  .then(report => {
    console.log(dl.getFormatter()(report.results));
  });
```
