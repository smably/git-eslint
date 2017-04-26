# git-eslint

A tool to filter ESLint output by git history.

## Installation and Usage

### Local Installation

Install via npm:

```sh
$ npm install git-eslint --save-dev
```

### CLI

`git-eslint` uses the same command format as `git`. Two commands are supported:
`show` and `diff`. They act similarly to the corresponding `git` commands.

For example, `git-eslint diff` will show any ESLint errors or warnings on lines
changed or added in the working tree relative to the index. `git-eslint diff
--staged` operates the same, but on the index relative to HEAD. The `diff`
command also accepts a commit ref, which will show errors or warnings on lines
changed or added between the specified commit and the working directory. If two
commit refs are specified, the output will reflect the changes between those
commits.

`git-eslint show` will show any ESLint errors or warnings on lines changed or
added in the last commit. `git-eslint show` also accepts a commit ref, which
will show ESLint errors and warnings on lines changed in that commit.
`git-eslint show <commit-id>` is just syntactic sugar for `git-eslint diff
<commit-id>~ <commit-id>`.

### Library

You can use the underlying library code by requiring it in your project:

```js
const DeltaLinter = require('git-eslint/lib/delta');

const dl = new DeltaLinter();

dl.init(oldRev, newRev)
  .then(() => dl.getDelta('**/*.js'))
  .then(delta => dl.lint(delta))
  .then(report => {
    const formatter = dl.getFormatter();
    console.log(formatter(report.results));
  });
```
