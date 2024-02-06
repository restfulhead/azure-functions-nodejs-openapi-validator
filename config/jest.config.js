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
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/test', '<rootDir>/dist', '<rootDir>/deploy'],
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}'],
  testMatch: ['**/test/**/*.spec.ts'],
  moduleNameMapper: {
    '@restfulhead/ajv-openapi-request-response-validator/(.*)': '<rootDir>/../ajv-openapi-request-response-validator/dist/$1',
  },
  silent: true,
  testTimeout: 10000,
}
module.exports = {
  ...tsPreset,
  ...jestConfig,
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
}
