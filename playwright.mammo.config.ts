/**
 * Mammography 디버그 전용 Playwright 설정
 *
 * DCM4CHEE PACS 서버 연동, JPEG Lossless auto-windowing 진단용
 *
 * 실행: npx playwright test --config=playwright.mammo.config.ts
 *
 * 주의: 이 설정은 포트 3001에 dcm4chee 전용 서버를 자동으로 시작합니다.
 *       포트 3000(기본 dev 서버)과 충돌하지 않습니다.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/MammographyAutoWindowing.spec.ts', '**/MammographyMirrorMode.spec.ts', '**/MammographyDebugErrors.spec.ts', '**/MammographyWindowCheck.spec.ts', '**/MammographyNetworkAnalysis.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: './tests/test-results-mammo',
  reporter: [['html', { outputFolder: './tests/playwright-report-mammo', open: 'never' }], ['line']],
  globalTimeout: 300_000,
  timeout: 120_000,
  use: {
    // dcm4chee 전용 dev 서버 (포트 3001)
    baseURL: 'http://localhost:3001',
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    testIdAttribute: 'data-cy',
    actionTimeout: 15_000,
    launchOptions: {
      ignoreDefaultArgs: ['--hide-scrollbars'],
      args: [
        '--enable-unsafe-swiftshader', // 소프트웨어 WebGL 활성화 (Cornerstone3D 렌더링)
        '--disable-gpu-sandbox',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
    },
  ],

  // dcm4chee 전용 dev 서버를 포트 3001에서 시작
  // 포트 3000(기존 dev 서버)과 분리된 독립적인 서버
  webServer: {
    command: 'cross-env NODE_ENV=development WEBPACK_SERVE=true OHIF_PORT=3001 APP_CONFIG=config/local_dcm4chee.js webpack serve --config .webpack/webpack.pwa.js',
    url: 'http://localhost:3001',
    reuseExistingServer: true, // 이미 실행 중인 서버 재사용
    cwd: './platform/app',
    timeout: 180_000, // 3분 - 초기 빌드 시간
  },
});
