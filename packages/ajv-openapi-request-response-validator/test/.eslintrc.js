module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: 'tsconfig.json',
      sourceType: 'module',
      tsconfigRootDir: __dirname,
    },
    extends: ["../.eslintrc.js"]
}