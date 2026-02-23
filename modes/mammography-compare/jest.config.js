const baseConfig = require('../../jest.config.base.js');

module.exports = {
  ...baseConfig,
  displayName: 'mammography-compare',
  rootDir: '../../',
  testMatch: [
    '<rootDir>/modes/mammography-compare/src/**/*.test.ts',
    '<rootDir>/modes/mammography-compare/src/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    '<rootDir>/modes/mammography-compare/src/**/*.{ts,tsx}',
    '!<rootDir>/modes/mammography-compare/src/**/*.test.{ts,tsx}',
    '!<rootDir>/modes/mammography-compare/src/**/__tests__/**',
    '!<rootDir>/modes/mammography-compare/src/**/*.d.ts',
    // index.tsx: OHIF mode entry file (requires browser/cornerstone environment)
    '!<rootDir>/modes/mammography-compare/src/index.tsx',
    // toolbarButtons.ts: pure data definitions with no logic
    '!<rootDir>/modes/mammography-compare/src/toolbarButtons.ts',
    // id.ts: module ID constant only
    '!<rootDir>/modes/mammography-compare/src/id.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/modes/mammography-compare/src/__tests__/setup.ts'],
  // Override reporters to only use default (no jest-junit)
  reporters: ['default'],
};
