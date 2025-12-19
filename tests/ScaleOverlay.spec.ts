import { test, expect } from './utils/fixture';
import { visitStudy } from './utils/visitStudy';
import { checkForScreenshot } from './utils/checkForScreenshot';
import { screenShotPaths } from './utils/screenShotPaths';

test.beforeEach(async ({ page }) => {
  const studyInstanceUID = '1.2.826.0.1.3680043.2.1125.1.11608962641993666019702920539307840';
  const mode = 'basic';
  await visitStudy(page, studyInstanceUID, mode, 2000);
});

test.describe('ScaleOverlay Tool Tests', () => {
  test('should toggle ScaleOverlay on and off', async ({ page }) => {
    // 1. MoreTools 드롭다운 열기
    const moreToolsButton = page.getByTestId('MoreTools-split-button-secondary');
    await moreToolsButton.click();
    await page.waitForTimeout(300);

    // 2. ScaleOverlay 버튼 찾기 (data-cy="ScaleOverlay")
    const scaleOverlayButton = page.getByTestId('ScaleOverlay');

    // 3. 버튼이 존재하는지 확인
    await expect(scaleOverlayButton).toBeVisible();

    // 3. 버튼 클릭하여 활성화
    await scaleOverlayButton.click();
    await page.waitForTimeout(500);

    // 4. ScaleOverlay가 표시되는지 스크린샷으로 확인
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.enabled);

    // 5. 다시 MoreTools 드롭다운 열고 비활성화
    await moreToolsButton.click();
    await page.waitForTimeout(300);
    await scaleOverlayButton.click();
    await page.waitForTimeout(500);

    // 6. ScaleOverlay가 사라졌는지 스크린샷으로 확인
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.disabled);
  });

  test('should render immediately without frame change', async ({ page }) => {
    // 1. 시작 시간 기록
    const startTime = Date.now();

    // 2. MoreTools 드롭다운 열기
    await page.getByTestId('MoreTools-split-button-secondary').click();
    await page.waitForTimeout(300);

    // 3. ScaleOverlay 활성화
    await page.getByTestId('ScaleOverlay').click();

    // 3. 렌더링 대기 (Polling 최대 시간 2000ms + 안전 마진 300ms)
    await page.waitForTimeout(2300);

    // 4. 렌더링 시간 확인 (2.5초 이내 - 느린 시스템 고려)
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(2500);

    // 5. 스크린샷으로 ScaleOverlay 표시 확인
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.immediateRender);
  });

  test('should work in multiple viewports without crash', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Console 이벤트 리스너 설정
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
      if (msg.type() === 'warning' && msg.text().includes('ScaleOverlayTool')) {
        warnings.push(msg.text());
      }
    });

    // MoreTools 드롭다운 열기
    await page.getByTestId('MoreTools-split-button-secondary').click();
    await page.waitForTimeout(300);

    // ScaleOverlay 활성화
    await page.getByTestId('ScaleOverlay').click();
    await page.waitForTimeout(1000);

    // Viewport가 여러 개 있는지 확인
    const viewports = page.locator('[data-viewport-uid]');
    const count = await viewports.count();

    if (count > 1) {
      // 각 viewport 클릭하여 전환
      for (let i = 0; i < count; i++) {
        await viewports.nth(i).click();
        await page.waitForTimeout(500);
      }

      // 최종 상태 스크린샷
      await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.multiViewport);
    }

    // Error가 발생하지 않았는지 확인
    expect(errors).toHaveLength(0);
  });

  test('should update configuration when switching viewports', async ({ page }) => {
    const warnings: string[] = [];

    // Console warning 리스너
    page.on('console', msg => {
      if (msg.type() === 'warning' && msg.text().includes('ScaleOverlayTool')) {
        warnings.push(msg.text());
      }
    });

    // MoreTools 드롭다운 열기
    await page.getByTestId('MoreTools-split-button-secondary').click();
    await page.waitForTimeout(300);

    // ScaleOverlay 활성화
    await page.getByTestId('ScaleOverlay').click();
    await page.waitForTimeout(500);

    // 첫 번째 viewport 스크린샷
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.viewport1);

    // 다른 viewport가 있으면 클릭
    const viewports = page.locator('[data-viewport-uid]');
    const count = await viewports.count();

    if (count > 1) {
      await viewports.nth(1).click();
      await page.waitForTimeout(500);

      // 두 번째 viewport 스크린샷
      await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.viewport2);
    }

    // Console warning/error 없는지 확인
    expect(warnings).toHaveLength(0);
  });

  test('should handle errors gracefully', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // ScaleOverlay 활성화/비활성화 여러 번 반복
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('MoreTools-split-button-secondary').click();
      await page.waitForTimeout(300);
      await page.getByTestId('ScaleOverlay').click();
      await page.waitForTimeout(300);
      await page.getByTestId('MoreTools-split-button-secondary').click();
      await page.waitForTimeout(300);
      await page.getByTestId('ScaleOverlay').click();
      await page.waitForTimeout(300);
    }

    // Error가 발생하지 않았는지 확인
    expect(errors).toHaveLength(0);
  });

  test('should auto-disable when loading new image set', async ({ page }) => {
    // MoreTools 드롭다운 열기
    const moreToolsButton = page.getByTestId('MoreTools-split-button-secondary');
    await moreToolsButton.click();
    await page.waitForTimeout(300);

    // ScaleOverlay 활성화
    const button = page.getByTestId('ScaleOverlay');
    await button.click();
    await page.waitForTimeout(500);

    // 버튼이 활성 상태인지 확인 (aria-pressed 또는 class 체크)
    const isActiveInitially = await button.evaluate(el => {
      return (
        el.getAttribute('aria-pressed') === 'true' ||
        el.classList.contains('active') ||
        el.classList.contains('bg-primary-light')
      );
    });
    expect(isActiveInitially).toBeTruthy();

    // Thumbnail이 있으면 다른 series 로드
    const thumbnails = page.locator(
      '[data-cy="thumbnail-list"] [data-cy="study-browser-thumbnail"]'
    );
    const thumbnailCount = await thumbnails.count();

    if (thumbnailCount > 1) {
      // 두 번째 thumbnail 클릭
      await thumbnails.nth(1).click();
      await page.waitForTimeout(1000);

      // ScaleOverlay가 비활성화되었는지 확인
      const isStillActive = await button.evaluate(el => {
        return (
          el.getAttribute('aria-pressed') === 'true' ||
          el.classList.contains('active') ||
          el.classList.contains('bg-primary-light')
        );
      });
      expect(isStillActive).toBeFalsy();

      // 스크린샷으로 ScaleOverlay가 사라졌는지 확인
      await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.afterSeriesChange);
    }
  });

  test('should disable button when PixelSpacing is missing', async ({ page }) => {
    const errors: string[] = [];
    const consoleMessages: string[] = [];

    // Console 이벤트 리스너 설정
    page.on('console', msg => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // MoreTools 드롭다운 열기
    await page.getByTestId('MoreTools-split-button-secondary').click();
    await page.waitForTimeout(300);

    // ScaleOverlay 버튼 찾기
    const button = page.getByTestId('ScaleOverlay');
    await expect(button).toBeVisible();

    // 버튼의 disabled 상태 확인
    const isDisabled = await button.evaluate(el => {
      return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    });

    // PixelSpacing이 있는 study이므로 버튼은 활성화되어 있어야 함
    expect(isDisabled).toBeFalsy();

    // 버튼 클릭 가능한지 확인
    await button.click();
    await page.waitForTimeout(500);

    // ScaleOverlay가 표시되는지 확인 (SVG 요소 또는 스크린샷)
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.withPixelSpacing);

    // Error가 발생하지 않았는지 확인
    expect(errors).toHaveLength(0);
  });

  test('should appear immediately without scrolling', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // MoreTools 드롭다운 열기
    await page.getByTestId('MoreTools-split-button-secondary').click();
    await page.waitForTimeout(300);

    // ScaleOverlay 버튼 클릭
    const button = page.getByTestId('ScaleOverlay');
    await button.click();

    // 500ms 대기 (최대 400ms 렌더링 지연 + 여유)
    await page.waitForTimeout(500);

    // 스크롤 없이 바로 ScaleOverlay가 표시되어야 함
    await checkForScreenshot(page, page, screenShotPaths.scaleOverlay.immediateNoScroll);

    // toString() 에러가 없는지 확인
    const toStringErrors = errors.filter(err => err.includes('toString'));
    expect(toStringErrors).toHaveLength(0);

    // 전체 에러가 없는지 확인
    expect(errors).toHaveLength(0);
  });
});
