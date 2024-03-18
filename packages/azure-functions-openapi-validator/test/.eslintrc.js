module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: 'tsconfig.json',
      sourceType: 'module',
      tsconfigRootDir: __dirname,
    },
    extends: ["../.eslintrc.js"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "no-console": "off"
    }
}