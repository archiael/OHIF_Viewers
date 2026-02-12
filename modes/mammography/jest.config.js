const baseConfig = require('../../jest.config.base.js');

module.exports = {
  ...baseConfig,
  displayName: 'mammography',
  rootDir: '../../../',
  testMatch: [
    '<rootDir>/modes/mammography/src/**/*.test.ts',
    '<rootDir>/modes/mammography/src/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    '<rootDir>/modes/mammography/src/**/*.{ts,tsx}',
    '!<rootDir>/modes/mammography/src/**/*.test.{ts,tsx}',
    '!<rootDir>/modes/mammography/src/**/__tests__/**',
    '!<rootDir>/modes/mammography/src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/modes/mammography/src/__tests__/setup.ts'],
  // Override reporters to only use default (no jest-junit)
  reporters: ['default'],
};
