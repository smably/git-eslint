# eslint-delta

A tool to filter ESLint output by changed lines in git diffs.

## Installation and Usage

### Local Installation

Install via npm:

```sh
$ npm install eslint-delta --save-dev
```

### Usage

You can use it by requiring it in your project:

```js
const DeltaLinter = require('eslint-delta');

const dl = new DeltaLinter();

dl.init(oldRev, newRev)
  .then(() => dl.getDelta('**/*.js'))
  .then(delta => dl.lint(delta))
  .then(report => {
    const formatter = dl.getFormatter();
    console.log(formatter(report.results));
  });
```

### Examples

There is an example lint script in the `examples` directory, including argument and error handling.
