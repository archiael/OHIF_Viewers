/**
 * Jest setup file for Mammography Compare Mode tests
 *
 * @description
 * This file runs before each test file.
 * Use it to configure global test environment and mocks.
 */

// Add any global test setup here
// For example: global mocks, polyfills, etc.

// Mock window.matchMedia (required for some UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
