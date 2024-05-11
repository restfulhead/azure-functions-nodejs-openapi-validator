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
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    }
}