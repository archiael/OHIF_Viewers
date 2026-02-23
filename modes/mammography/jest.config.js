const baseConfig = require('../../jest.config.base.js');

module.exports = {
  ...baseConfig,
  displayName: 'mammography',
  rootDir: '../../',
  testMatch: [
    '<rootDir>/modes/mammography/src/**/*.test.ts',
    '<rootDir>/modes/mammography/src/**/*.test.tsx',
  ],
  // @ohif/* 패키지를 소스 경로로 resolve (monorepo 환경)
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^@ohif/core$': '<rootDir>/platform/core/src/index.ts',
    // @ohif/core/src/... 경로를 platform/core/src/...로 매핑 (src 중복 방지)
    // 반드시 '^@ohif/core/(.*)$' 보다 먼저 선언해야 함
    '^@ohif/core/src/(.*)$': '<rootDir>/platform/core/src/$1',
    '^@ohif/core/(.*)$': '<rootDir>/platform/core/src/$1',
    '^@ohif/ui$': '<rootDir>/platform/ui/src/index.ts',
    '^@ohif/mode-basic$': '<rootDir>/modes/basic/src/index.ts',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/modes/mammography/src/__mocks__/fileMock.js',
    '\\.(css|less)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: [
    '<rootDir>/modes/mammography/src/**/*.{ts,tsx}',
    '!<rootDir>/modes/mammography/src/**/*.test.{ts,tsx}',
    '!<rootDir>/modes/mammography/src/**/__tests__/**',
    '!<rootDir>/modes/mammography/src/**/*.d.ts',
    // index.tsx: OHIF mode entry file (requires browser/cornerstone environment)
    '!<rootDir>/modes/mammography/src/index.tsx',
    // toolbarButtons.ts: pure data definitions with no logic
    '!<rootDir>/modes/mammography/src/toolbarButtons.ts',
    // id.ts: module ID constant only
    '!<rootDir>/modes/mammography/src/id.ts',
    // initToolGroups.ts: cornerstone tool group setup (browser environment)
    '!<rootDir>/modes/mammography/src/initToolGroups.ts',
  ],
  coverageThreshold: {
    global: {
      // commandsModule.ts contains browser/cornerstone-dependent helper functions
      // (detectViewportViewPosition, applyMirrorModeToViewport, cacheChestWallWorldAfterSetDisplayArea)
      // that cannot be unit tested without a full browser environment.
      // Core logic (store, evaluators, commands) is tested at 100%.
      branches: 30,
      functions: 60,
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/modes/mammography/src/__tests__/setup.ts'],
  // Override reporters to only use default (no jest-junit)
  reporters: ['default'],
};
