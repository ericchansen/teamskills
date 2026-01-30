module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/backend/tests/**/*.test.js'],
  coverageDirectory: 'coverage/backend',
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/tests/**',
    '!**/node_modules/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/backend/tests/setup.js'],
  testTimeout: 10000,
};
