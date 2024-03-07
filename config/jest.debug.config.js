const sharedConfig = require('./jest.config')
module.exports = {
  ...sharedConfig,
  collectCoverage: false,
  silent: false,
}
