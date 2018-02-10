module.exports = {
  "parser": "babel-eslint",
  "extends": [
    "airbnb-base",
    "plugin:flowtype/recommended",
    "prettier"
  ],
  "plugins": [
    "flowtype",
    "import",
    "prettier"
  ],
  "rules": {
    "no-plusplus": "off",
    "prettier/prettier": ["error", { "printWidth": 120, "singleQuote": true, "trailingComma": "all" }]
  }
};
