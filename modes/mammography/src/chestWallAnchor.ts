/**
 * Chest Wall Anchor Algorithm for Mirror Mode
 *
 * @description
 * Mirror Mode ON 상태에서 Pan/Zoom 후 흉벽이 viewport edge에서 이탈하는 것을 방지합니다.
 * CAMERA_MODIFIED 이벤트 핸들러에서 호출됩니다.
 *
 * 이 파일은 @ohif/core 등 외부 의존성이 없습니다.
 * 순수하게 Cornerstone viewport API만 사용하여 독립적으로 테스트 가능합니다.
 *
 * ALGORITHM (Canvas Pixel Space 기반):
 * ======================================
 * Cornerstone의 setDisplayAreaFit()은 canvas pixel 공간에서 Pan을 조작합니다.
 * focalPoint world 좌표 직접 조작은 작동하지 않습니다.
 *
 * 1. chestWallWorld (canvasToWorld로 미리 계산됨) → 흉벽의 world 좌표
 * 2. viewport.worldToCanvas(chestWallWorld) → 현재 canvas pixel 좌표
 * 3. targetCanvasX = R breast: canvasWidth, L breast: 0
 * 4. deltaX = targetCanvasX - chestWallCanvas[0]
 * 5. newPan[0] = currentPan[0] + deltaX
 *
 * WHY +deltaX? (Viewport.js:638 setPan 소스 기반)
 * ===============================================
 * setPan(pan): delta2 = pan - currentPan
 *              delta = canvasToWorld(delta2) - canvasToWorld([0,0])  (world delta)
 *              newFocal = focalPoint - delta
 *
 * delta2 > 0 → delta는 양수 canvas X 방향 world 벡터 → focal이 LEFT 이동 → 이미지가 RIGHT로 이동
 * 따라서: 이미지를 오른쪽으로 이동(deltaX > 0)하려면 delta2 > 0 필요
 *         delta2 = newPan - currentPan = deltaX > 0 → newPan = currentPan + deltaX
 *
 * WHY chestWallWorld PARAMETER (not indexToWorld)?
 * ================================================
 * 이전 구현은 imageData.indexToWorld([0, dims[1]/2, 0]) (DICOM 픽셀 col=0)을 사용했지만,
 * 유방촬영 DICOM 이미지는 ImageOrientationPatient에 의해 수평 반전될 수 있습니다.
 * 이 경우 DICOM col=0이 화면 오른쪽에 표시되어 HP의 imagePoint=[0.0, 0.5]와 불일치 발생:
 *   - 잘못된 deltaX = 0 - canvasWidth = -canvasWidth (매우 큰 음수)
 *   - newPan += canvasWidth → 이미지가 왼쪽으로 급격히 이탈하는 버그
 *
 * SOLUTION:
 *   setDisplayArea() 호출 직후 viewport.canvasToWorld([targetX, canvasH/2])로
 *   렌더링된 흉벽 가장자리의 world 좌표를 가져옵니다.
 *   이 방법은 이미지 방향/반전에 관계없이 항상 올바른 world 좌표를 반환합니다.
 *   (commandsModule.ts의 cacheChestWallWorldAfterSetDisplayArea 참조)
 *
 * WHY NOT setDisplayArea() AGAIN?
 *   setDisplayArea() 내부에서 setCamera(fitToCanvasCamera)를 먼저 호출하여
 *   Zoom을 리셋합니다. → Zoom이 깨짐. 사용 불가.
 *
 * WHY setPan() CAUSES CAMERA_MODIFIED?
 *   setPan() → setCamera() → triggerCameraModifiedEventIfNecessary() → CAMERA_MODIFIED
 *   따라서 isAnchoring flag가 반드시 필요합니다.
 *   isAnchoring은 viewport별로 독립적이어야 합니다 (index.tsx 참조).
 *
 * SOURCE REFERENCE:
 *   Viewport.js:445 setDisplayAreaFit() - canvas pixel 계산 방식
 *   Viewport.js:614 getPan() - initialCamera 기준 canvas pixel delta
 *   Viewport.js:638 setPan() - canvas pixel → world focalPoint 변환 → setCamera()
 *   Viewport.js:734 setCamera() - storeAsInitialCamera, triggerCameraModifiedEventIfNecessary
 *   Viewport.js:813 triggerCameraModifiedEventIfNecessary() - _suppressCameraModifiedEvents 체크
 */

/**
 * 흉벽 anchor pan 보정값 계산
 *
 * @param viewport - Cornerstone viewport 인스턴스 (getCornerstoneViewport() 결과)
 * @param laterality - 'R' (오른쪽 흉벽 → canvas 오른쪽) | 'L' (왼쪽 흉벽 → canvas 왼쪽)
 * @param chestWallWorld - 흉벽 anchor point의 world 좌표
 *                         setDisplayArea() 직후 canvasToWorld([targetX, canvasH/2])로 계산.
 *                         commandsModule.ts의 chestWallWorldCache에서 가져옵니다.
 * @returns 적용할 새 pan 값과 delta 또는 null (이미 정렬됨 / 데이터 없음)
 *
 * @example
 * // CAMERA_MODIFIED 핸들러에서:
 * const chestWallWorld = chestWallWorldCache.get(viewportId);
 * if (!chestWallWorld) return; // 캐시 미스: setDisplayArea 호출 전
 * const result = computeChestWallAnchorPan(viewport, 'R', chestWallWorld);
 * if (result) {
 *   isAnchoring = true;
 *   try {
 *     viewport.setPan(result.newPan, false);
 *     viewport.render();
 *   } finally {
 *     isAnchoring = false;
 *   }
 * }
 */
/**
 * 동적 흉벽 anchor pan 보정값 계산 (캐시 불필요 버전)
 *
 * @description
 * chestWallWorldCache 사전 캐싱 없이 매 CAMERA_MODIFIED마다 imageData.indexToWorld()로
 * 흉벽 canvas 위치를 동적으로 계산합니다.
 *
 * WHY THIS INSTEAD OF computeChestWallAnchorPan?
 * ===============================================
 * computeChestWallAnchorPan은 사전 캐시(chestWallWorldCache)에 의존합니다.
 * 캐시는 setDisplayArea 직후 canvasToWorld([targetX, canvasH/2])로 채워지는데,
 * VIEWPORT_DATA_CHANGED 시점에 canvas.clientWidth === 0이면 캐시가 채워지지 않습니다.
 * IMAGE_RENDERED에서 재시도해도 CSS 레이아웃 타이밍에 따라 여전히 0일 수 있습니다.
 *
 * REFLECTION HANDLING:
 * ====================
 * 일부 유방촬영 DICOM 이미지는 ImageOrientationPatient가 수평 반전되어
 * DICOM col=0이 화면 오른쪽에 표시될 수 있습니다.
 * indexToWorld([0,...]) = 화면 오른쪽, indexToWorld([dims[0]-1,...]) = 화면 왼쪽
 *
 * Math.max / Math.min으로 반전 여부에 관계없이 올바른 흉벽 canvas X를 구합니다:
 *   R breast → Math.max(leftCanvas[0], rightCanvas[0]) = 화면상 가장 오른쪽 이미지 가장자리
 *   L breast → Math.min(leftCanvas[0], rightCanvas[0]) = 화면상 가장 왼쪽 이미지 가장자리
 *
 * @param viewport - Cornerstone viewport 인스턴스
 * @param laterality - 'R' | 'L'
 * @returns newPan + deltaX, 또는 null (이미 정렬됨 / 데이터 없음)
 */
export function computeChestWallAnchorPanDynamic(
  viewport: any,
  laterality: 'R' | 'L'
): { newPan: [number, number]; deltaX: number } | null {
  const element = viewport.element as HTMLElement;
  if (!element) return null;

  // Canvas 너비 (CSS pixel)
  const canvasEl = (viewport as any).canvas as HTMLCanvasElement | undefined;
  const canvasWidth = canvasEl?.clientWidth || element.clientWidth;
  if (canvasWidth === 0) return null;

  // 이미지 데이터 가져오기
  let imageData: any;
  try {
    imageData = viewport.getDefaultImageData?.();
  } catch (e) {
    return null;
  }
  if (!imageData) return null;

  let dims: number[];
  try {
    dims = imageData.getDimensions();
  } catch (e) {
    return null;
  }
  if (!dims || dims.length < 2) return null;

  // 이미지 양쪽 가장자리(col=0, col=max)의 canvas X 위치 계산
  // worldToCanvas는 imageOrientationPatient 등 반전 여부를 반영합니다.
  let leftCanvas: number[], rightCanvas: number[];
  try {
    const leftWorld = imageData.indexToWorld([0, dims[1] / 2, 0]);
    const rightWorld = imageData.indexToWorld([dims[0] - 1, dims[1] / 2, 0]);
    leftCanvas = viewport.worldToCanvas(leftWorld);
    rightCanvas = viewport.worldToCanvas(rightWorld);
  } catch (e) {
    console.warn('[computeChestWallAnchorPanDynamic] worldToCanvas failed:', e);
    return null;
  }

  // 흉벽 canvas X (반전 이미지 자동 처리)
  // R breast: 화면상 우측에 있는 이미지 가장자리 = Math.max
  // L breast: 화면상 좌측에 있는 이미지 가장자리 = Math.min
  const chestWallCanvasX =
    laterality === 'R'
      ? Math.max(leftCanvas[0], rightCanvas[0])
      : Math.min(leftCanvas[0], rightCanvas[0]);

  // 목표 canvas X (흉벽이 있어야 할 위치)
  const targetX = laterality === 'R' ? canvasWidth : 0;
  const deltaX = targetX - chestWallCanvasX;

  // 1px 미만 차이는 무시
  if (Math.abs(deltaX) < 1) return null;

  // Pan 보정 계산
  let currentPan: number[];
  try {
    currentPan = viewport.getPan();
  } catch (e) {
    return null;
  }

  const newPan: [number, number] = [currentPan[0] + deltaX, currentPan[1]];
  return { newPan, deltaX };
}

export function computeChestWallAnchorPan(
  viewport: any,
  laterality: 'R' | 'L',
  chestWallWorld: number[]
): { newPan: [number, number]; deltaX: number } | null {
  // Canvas 크기 (CSS pixel 기준 — worldToCanvas()와 동일 단위)
  //
  // WHY viewport.canvas?.clientWidth 우선?
  // Cornerstone 내부적으로 setDisplayAreaFit()과 worldToCanvas()는 동일 단위를 사용합니다.
  // setDisplayAreaFit() (Viewport.js:445): canvasWidth = this.sWidth / devicePixelRatio
  //   → this.sWidth = canvas.width (물리 픽셀), devicePixelRatio로 CSS 픽셀 변환
  // worldToCanvas() (StackViewport.js:277): canvasX / devicePixelRatio → CSS 픽셀 반환
  //
  // viewport.canvas.clientWidth === canvas CSS 픽셀 너비 = sWidth / devicePixelRatio
  // element.clientWidth === element CSS 픽셀 너비 (동일하지만 element/canvas 크기가 다를 수 있음)
  //
  // HiDPI(Retina) 디스플레이 및 이상한 레이아웃에서 element와 canvas 크기가 다를 경우를 대비하여
  // viewport.canvas.clientWidth를 우선 사용하고, 없으면 element.clientWidth로 fallback.
  const element = viewport.element as HTMLElement;
  if (!element) return null;
  const canvasEl = (viewport as any).canvas as HTMLCanvasElement | undefined;
  const canvasWidth = canvasEl?.clientWidth || element.clientWidth;
  if (canvasWidth === 0) return null;

  // 흉벽 world 좌표 → canvas pixel 좌표 (현재 카메라 상태 기준)
  //
  // chestWallWorld는 setDisplayArea() 직후 canvasToWorld([targetX, canvasH/2])로 계산됩니다.
  // 이미지 방향/반전에 관계없이 렌더링된 흉벽 가장자리의 정확한 world 좌표를 제공합니다.
  let chestWallCanvas: number[];
  try {
    chestWallCanvas = viewport.worldToCanvas(chestWallWorld);
  } catch (e) {
    console.warn('[computeChestWallAnchorPan] worldToCanvas failed:', e);
    return null;
  }

  // 목표 canvas X (흉벽이 놓여야 할 위치)
  // R breast → viewport 오른쪽 edge (= canvasWidth)
  // L breast → viewport 왼쪽 edge (= 0)
  const targetX = laterality === 'R' ? canvasWidth : 0;

  // 현재 흉벽 위치와 목표 위치의 차이
  const deltaX = targetX - chestWallCanvas[0];

  // 1px 미만 차이는 무시 (불필요한 setCamera 호출 방지 + setPan 내 threshold와 일치)
  if (Math.abs(deltaX) < 1) {
    return null; // 이미 정렬됨
  }

  // Pan 보정 계산 (+deltaX: Viewport.js:638 setPan 소스 기반)
  // setPan(pan): delta2 = pan - currentPan
  //             delta = canvasToWorld(delta2) - canvasToWorld([0,0])
  //             newFocal = focalPoint - delta
  //             delta2 > 0 → focal이 LEFT 이동 → 이미지가 RIGHT로 이동
  //             이미지를 오른쪽으로 이동(deltaX > 0)하려면 delta2 = deltaX > 0 필요
  //             → newPan[0] = currentPan[0] + deltaX
  let currentPan: number[];
  try {
    currentPan = viewport.getPan();
  } catch (e) {
    console.warn('[computeChestWallAnchorPan] getPan failed:', e);
    return null;
  }

  const newPan: [number, number] = [
    currentPan[0] + deltaX, // X: 흉벽을 edge로 이동
    currentPan[1],           // Y: 세로 Pan 자유 (변경 없음)
  ];

  return { newPan, deltaX };
}
