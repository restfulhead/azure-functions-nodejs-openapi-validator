module.exports = {
  root: true,
  env: {
    browser: false,
    es6: false,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  extends: [
    'plugin:@typescript-eslint/recommended', // uses the recommended rules from the @typescript-eslint/eslint-plugin
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:prettier/recommended', // enables eslint-plugin-prettier and displays prettier errors as eslint errors. Make sure this is always the last configuration in the extends array.
  ],
  plugins: ['prettier', 'import', 'unused-imports'],
  rules: {
    'import/no-unresolved': ['error', { ignore: ['^@bertelsmann-dev'] }],
    'require-await': 'error',
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
}
