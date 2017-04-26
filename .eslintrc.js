module.exports = {
  "extends": [
    "airbnb-base",
    "prettier"
  ],
  "plugins": [
    "import",
    "prettier"
  ],
  "rules": {
    "no-plusplus": "off",
    "prettier/prettier": ["error", { "printWidth": 120, "singleQuote": true, "trailingComma": "all" }]
  }
};
