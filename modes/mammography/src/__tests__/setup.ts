/**
 * Jest setup file for mammography mode tests
 */

// Mock window.cornerstone
global.window = global.window || {};
(global.window as any).cornerstone = {
  metaData: {
    get: jest.fn(),
  },
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
