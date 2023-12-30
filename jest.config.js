const tsPreset = require('ts-jest/jest-preset')
const jestConfig = {
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['dist'],
  globals: {
    'ts-jest': {
      tsconfig: 'test/tsconfig.json',
    },
  },
  collectCoverage: true,
  coverageReporters: ['lcov', 'text-summary'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/test',
    '<rootDir>/dist',
    '<rootDir>/dist-test',
  ],
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}'],
  testMatch: ['**/test/**/*.spec.ts']
}
module.exports = {
  ...tsPreset,
  ...jestConfig,
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
}
