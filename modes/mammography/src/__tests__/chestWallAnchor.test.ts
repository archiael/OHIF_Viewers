/**
 * Unit tests for computeChestWallAnchorPan and getLateralityFromViewportId
 *
 * @description
 * [C-1 FIX] 핵심 알고리즘 검증:
 * - computeChestWallAnchorPan: canvas pixel space에서 흉벽 anchor pan 계산
 * - getLateralityFromViewportId: viewportId 기반 laterality 결정
 *
 * ALGORITHM OVERVIEW:
 * ==================
 * 1. chestWallWorld (canvasToWorld로 미리 계산됨) → 흉벽 world 좌표
 * 2. viewport.worldToCanvas(chestWallWorld) → 현재 canvas pixel 좌표
 * 3. targetX = R breast: canvasWidth, L breast: 0
 * 4. deltaX = targetX - chestWallCanvas[0]
 * 5. newPan[0] = currentPan[0] + deltaX
 *
 * WHY +deltaX? (Viewport.js:638 setPan 소스 기반)
 * ===============================================
 * setPan(pan): delta2 = pan - currentPan
 *              delta = canvasToWorld(delta2) - canvasToWorld([0,0])
 *              newFocal = focalPoint - delta
 *
 * delta2 > 0 → focal이 LEFT 이동 → 이미지가 RIGHT로 이동
 * 따라서: 이미지를 오른쪽으로 이동(deltaX > 0)하려면 delta2 = deltaX > 0 필요
 *         newPan = currentPan + deltaX
 *
 * WHY chestWallWorld PARAMETER?
 * =============================
 * indexToWorld([0, ...]) = DICOM 픽셀 col=0 이지만,
 * 수평 반전 이미지에서 col=0은 화면 오른쪽에 표시됩니다.
 * setDisplayArea 직후 canvasToWorld([targetX, canvasH/2])를 사용하면
 * 이미지 방향/반전에 관계없이 올바른 흉벽 world 좌표를 얻을 수 있습니다.
 *
 * SOURCE: Viewport.js:445 setDisplayAreaFit()
 *         Viewport.js:614 getPan()
 *         Viewport.js:638 setPan()
 */

// chestWallAnchor.ts는 @ohif/core 의존성이 없어 mock 불필요
import { computeChestWallAnchorPan, computeChestWallAnchorPanDynamic } from '../chestWallAnchor';

/**
 * Cornerstone viewport Mock 생성 헬퍼
 *
 * @param options 커스터마이징 옵션
 *
 * NOTE: imageData/indexToWorld 관련 mock은 더 이상 필요 없습니다.
 *       computeChestWallAnchorPan은 chestWallWorld를 직접 받아서 worldToCanvas를 호출합니다.
 */
function createMockViewport(options: {
  canvasWidth?: number;
  chestWallCanvasX?: number; // 흉벽의 현재 canvas X 위치 (worldToCanvas 반환값)
  currentPanX?: number;
  currentPanY?: number;
  worldToCanvasShouldFail?: boolean;
  getPanShouldFail?: boolean;
} = {}) {
  const {
    canvasWidth = 800,
    chestWallCanvasX = 400, // 기본: canvas 중앙
    currentPanX = 0,
    currentPanY = 0,
    worldToCanvasShouldFail = false,
    getPanShouldFail = false,
  } = options;

  const mockElement = document.createElement('div');
  Object.defineProperty(mockElement, 'clientWidth', { value: canvasWidth });

  return {
    worldToCanvas: jest.fn((_world) => {
      if (worldToCanvasShouldFail) throw new Error('worldToCanvas failed');
      // 어떤 world 좌표를 받아도 지정된 canvas X 반환 (mock 단순화)
      return [chestWallCanvasX, 256]; // Y는 항상 중앙
    }),
    getPan: jest.fn(() => {
      if (getPanShouldFail) throw new Error('getPan failed');
      return [currentPanX, currentPanY];
    }),
    element: mockElement,
  };
}

/**
 * 테스트용 흉벽 world 좌표 상수
 *
 * 실제로는 setDisplayArea 직후 canvasToWorld([targetX, canvasH/2])로 계산됩니다.
 * 테스트에서는 world 좌표 자체는 중요하지 않습니다.
 * computeChestWallAnchorPan은 world → worldToCanvas로 변환만 하므로
 * mock viewport에서 worldToCanvas의 반환값(chestWallCanvasX)으로 테스트합니다.
 */
const MOCK_CHEST_WALL_WORLD = [100.0, 200.0, 0]; // 임의의 world 좌표

describe('computeChestWallAnchorPan', () => {
  /**
   * ───────────────────────────────────────────────────────
   * RIGHT BREAST TESTS
   * 목표: 흉벽(이미지 오른쪽 가장자리)이 viewport 오른쪽 edge에 위치
   * targetX = canvasWidth
   * ───────────────────────────────────────────────────────
   */
  describe('R breast (chest wall → right edge)', () => {
    it('should return null when chest wall is already at right edge', () => {
      // 흉벽이 이미 canvas 오른쪽 edge에 있음 (deltaX < 1px)
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 800, // targetX와 동일 → deltaX = 0
        currentPanX: 100,
        currentPanY: 50,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      // 이미 정렬됨 → null
      expect(result).toBeNull();
    });

    it('should return corrected pan when chest wall is to the left of right edge', () => {
      // 흉벽이 canvas 중앙(400)에 있고, targetX = canvasWidth(800)
      // deltaX = 800 - 400 = 400
      // newPan[0] = currentPan[0] + deltaX = 0 + 400 = 400
      // delta2 = 400 - 0 = 400 > 0 → focal LEFT → 이미지 RIGHT → 흉벽 800으로 이동 ✓
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
        currentPanX: 0,
        currentPanY: 50,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.newPan[0]).toBe(400); // X 보정: 흉벽을 오른쪽으로 이동
      expect(result!.newPan[1]).toBe(50);  // Y 변경 없음 (세로 Pan 자유)
      expect(result!.deltaX).toBe(400);
    });

    it('should return corrected pan when chest wall is beyond right edge', () => {
      // 흉벽이 canvas 밖(900)에 있고, targetX = 800
      // deltaX = 800 - 900 = -100 (왼쪽으로 보정 필요)
      // newPan[0] = 0 + (-100) = -100
      // delta2 = -100 < 0 → 이미지 LEFT → 흉벽 900에서 800으로 이동 ✓
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 900,
        currentPanX: 0,
        currentPanY: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.newPan[0]).toBe(-100); // 흉벽을 왼쪽으로 당김
      expect(result!.deltaX).toBe(-100);
    });

    it('should use provided chestWallWorld to call worldToCanvas', () => {
      // worldToCanvas가 제공된 world 좌표로 호출되는지 확인
      // (indexToWorld 대신 canvasToWorld 기반 캐시된 world 좌표 사용)
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
      });
      const specificWorld = [123.0, 456.0, 0];

      computeChestWallAnchorPan(viewport, 'R', specificWorld);

      expect(viewport.worldToCanvas).toHaveBeenCalledWith(specificWorld);
    });

    it('should preserve Y pan (vertical pan is free in Mirror Mode)', () => {
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
        currentPanX: 10,
        currentPanY: 300, // 세로 pan이 적용된 상태
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      // Y pan은 그대로 유지되어야 함 (세로 이동 자유)
      expect(result!.newPan[1]).toBe(300);
    });
  });

  /**
   * ───────────────────────────────────────────────────────
   * LEFT BREAST TESTS
   * 목표: 흉벽(이미지 왼쪽 가장자리)이 viewport 왼쪽 edge에 위치
   * targetX = 0
   * ───────────────────────────────────────────────────────
   */
  describe('L breast (chest wall → left edge)', () => {
    it('should return null when chest wall is already at left edge', () => {
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 0, // targetX = 0 → deltaX = 0
        currentPanX: 0,
        currentPanY: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'L', MOCK_CHEST_WALL_WORLD);

      expect(result).toBeNull();
    });

    it('should return corrected pan when chest wall is to the right of left edge', () => {
      // 흉벽이 canvas 중앙(400)에 있고, targetX = 0
      // deltaX = 0 - 400 = -400
      // newPan[0] = 0 + (-400) = -400
      // delta2 = -400 < 0 → 이미지 LEFT → 흉벽 400에서 0으로 이동 ✓
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
        currentPanX: 0,
        currentPanY: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'L', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.newPan[0]).toBe(-400); // X 보정: 흉벽을 왼쪽으로 이동
      expect(result!.deltaX).toBe(-400);
    });

    it('should return corrected pan for flipped L breast image', () => {
      // 반전 이미지: DICOM col=0이 화면 오른쪽(780px)에 표시됨
      // chestWallWorld는 canvasToWorld([0, canvasH/2])로 계산 → 화면 왼쪽 edge의 world 좌표
      // worldToCanvas(chestWallWorld)는 현재 pan 상태에서 흉벽이 780px에 있음을 반환
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 780, // 반전 이미지: 흉벽이 오른쪽(780)에 있음
        currentPanX: 0,
        currentPanY: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'L', MOCK_CHEST_WALL_WORLD);

      // deltaX = 0 - 780 = -780 → newPan = 0 + (-780) = -780 → 흉벽을 왼쪽으로 이동
      expect(result).not.toBeNull();
      expect(result!.deltaX).toBe(-780);
      expect(result!.newPan[0]).toBe(-780);
    });
  });

  /**
   * ───────────────────────────────────────────────────────
   * EDGE CASES & ERROR HANDLING
   * ───────────────────────────────────────────────────────
   */
  describe('edge cases and error handling', () => {
    it('should return null when canvasWidth is zero (element not rendered)', () => {
      const viewport = createMockViewport({ canvasWidth: 0 });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).toBeNull();
    });

    it('should return null when worldToCanvas throws', () => {
      const viewport = createMockViewport({ worldToCanvasShouldFail: true });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).toBeNull();
    });

    it('should return null when getPan throws', () => {
      const viewport = createMockViewport({ getPanShouldFail: true });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).toBeNull();
    });

    it('should ignore sub-pixel differences (deltaX < 1px)', () => {
      // deltaX = 0.5 (1px 미만) → return null (불필요한 setCamera 방지)
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 799.5, // 0.5px 차이
        currentPanX: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      // 1px 미만 차이는 무시
      expect(result).toBeNull();
    });

    it('should handle non-zero existing pan correctly', () => {
      // currentPanX = 50, chestWallCanvasX = 600, targetX = 800
      // deltaX = 800 - 600 = 200
      // newPan[0] = 50 + 200 = 250
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 600,
        currentPanX: 50,
        currentPanY: -30,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.newPan[0]).toBe(250);
      expect(result!.newPan[1]).toBe(-30); // Y 유지
    });

    it('should return null when element is not available', () => {
      // element가 없는 viewport (비정상 상태)
      const viewport = {
        worldToCanvas: jest.fn(() => [400, 256]),
        getPan: jest.fn(() => [0, 0]),
        element: null, // 없음
      };

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).toBeNull();
    });
  });

  /**
   * ───────────────────────────────────────────────────────
   * PAN DIRECTION CORRECTNESS
   * setPan(pan)의 방향성 검증 (Viewport.js 소스 기반)
   * ───────────────────────────────────────────────────────
   */
  describe('pan direction correctness', () => {
    /**
     * Cornerstone setPan(pan) 내부 동작:
     *   delta2 = pan - currentPan
     *   delta = canvasToWorld(delta2) - canvasToWorld([0,0])
     *   newFocal = focalPoint - delta
     *
     * delta2 > 0 → focal이 LEFT 이동 → 이미지가 RIGHT로 이동
     * delta2 < 0 → focal이 RIGHT 이동 → 이미지가 LEFT로 이동
     *
     * 흉벽을 오른쪽으로 이동(deltaX > 0)하려면 → delta2 > 0 → newPan > currentPan
     * newPan = currentPan + deltaX (deltaX > 0 → newPan 증가)
     */
    it('R breast: deltaX > 0 → newPan > currentPan (image moves right)', () => {
      // 흉벽이 canvas 중앙(400), 목표 오른쪽 edge(800)
      // deltaX = 400 > 0, newPan = 0 + 400 = 400 > 0 = currentPan
      // delta2 = 400 > 0 → 이미지 RIGHT → 흉벽 오른쪽으로 ✓
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
        currentPanX: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.deltaX).toBeGreaterThan(0); // 오른쪽으로 이동 필요
      expect(result!.newPan[0]).toBeGreaterThan(0); // pan 증가 → delta2 > 0 → 이미지 RIGHT
    });

    it('L breast: deltaX < 0 → newPan < currentPan (image moves left)', () => {
      // 흉벽이 canvas 중앙(400), 목표 왼쪽 edge(0)
      // deltaX = -400 < 0, newPan = 0 + (-400) = -400 < 0 = currentPan
      // delta2 = -400 < 0 → 이미지 LEFT → 흉벽 왼쪽으로 ✓
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 400,
        currentPanX: 0,
      });

      const result = computeChestWallAnchorPan(viewport, 'L', MOCK_CHEST_WALL_WORLD);

      expect(result).not.toBeNull();
      expect(result!.deltaX).toBeLessThan(0); // 왼쪽으로 이동 필요
      expect(result!.newPan[0]).toBeLessThan(0); // pan 감소 → delta2 < 0 → 이미지 LEFT
    });
  });

  /**
   * ───────────────────────────────────────────────────────
   * IMAGE ORIENTATION FLIP HANDLING
   * 수평 반전 이미지에서의 동작 검증
   * ───────────────────────────────────────────────────────
   */
  describe('horizontal flip image handling', () => {
    /**
     * 문제: indexToWorld([0, ...])를 사용하면 반전 이미지에서 버그 발생
     *   - DICOM col=0 → 화면 오른쪽(canvasWidth)에 표시됨
     *   - L breast: deltaX = 0 - canvasWidth = -canvasWidth (매우 큰 음수)
     *   - 이미지가 왼쪽으로 급격히 이탈
     *
     * 해결: canvasToWorld([targetX, canvasH/2])로 흉벽 world 좌표 계산
     *   - targetX = 0 (L breast) → 화면 왼쪽 edge의 world 좌표
     *   - 이미지 방향과 무관하게 항상 올바른 anchor 적용
     */
    it('L breast flipped: chestWallWorld from canvasToWorld([0,...]) correctly anchors', () => {
      // 반전 이미지에서 canvasToWorld([0, canvasH/2])로 얻은 world 좌표를 사용
      // setDisplayArea 직후 흉벽은 canvas x=0에 위치
      // → chestWallWorld를 canvasToWorld([0, canvasH/2])로 계산했으면
      //   worldToCanvas(chestWallWorld) = 0 → deltaX = 0 → no correction (이미 정렬됨)
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 0, // setDisplayArea 직후: 흉벽이 canvas x=0에 있음
      });

      const result = computeChestWallAnchorPan(viewport, 'L', MOCK_CHEST_WALL_WORLD);

      // 흉벽이 이미 정렬됨 → null
      expect(result).toBeNull();
    });

    it('R breast flipped: chestWallWorld from canvasToWorld([canvasWidth,...]) correctly anchors', () => {
      // 반전 이미지에서 canvasToWorld([canvasWidth, canvasH/2])로 얻은 world 좌표를 사용
      // setDisplayArea 직후 흉벽은 canvas x=canvasWidth에 위치
      // → deltaX = 0 → no correction
      const viewport = createMockViewport({
        canvasWidth: 800,
        chestWallCanvasX: 800, // setDisplayArea 직후: 흉벽이 canvas x=canvasWidth에 있음
      });

      const result = computeChestWallAnchorPan(viewport, 'R', MOCK_CHEST_WALL_WORLD);

      // 흉벽이 이미 정렬됨 → null
      expect(result).toBeNull();
    });
  });
});

/**
 * computeChestWallAnchorPanDynamic 테스트
 *
 * @description
 * 캐시 없이 imageData.indexToWorld()로 동적 계산하는 새 함수 검증.
 * 반전 이미지(ImageOrientationPatient)도 Math.max/Math.min으로 자동 처리.
 */
describe('computeChestWallAnchorPanDynamic', () => {
  /**
   * 동적 계산용 mock viewport 생성 헬퍼
   *
   * 이 mock은 imageData.indexToWorld()와 viewport.worldToCanvas()를 포함합니다.
   * leftCanvasX / rightCanvasX: DICOM col=0 / col=max 의 canvas X 위치
   * (반전 이미지는 leftCanvasX > rightCanvasX)
   */
  function createDynamicMockViewport(options: {
    canvasWidth?: number;
    leftCanvasX?: number;   // worldToCanvas(indexToWorld([0, ...]))[0]
    rightCanvasX?: number;  // worldToCanvas(indexToWorld([dims[0]-1, ...]))[0]
    currentPanX?: number;
    currentPanY?: number;
    imageDataAvailable?: boolean;
  } = {}) {
    const {
      canvasWidth = 800,
      leftCanvasX = 0,
      rightCanvasX = 800,
      currentPanX = 0,
      currentPanY = 0,
      imageDataAvailable = true,
    } = options;

    const mockElement = document.createElement('div');
    Object.defineProperty(mockElement, 'clientWidth', { value: canvasWidth });

    const leftWorld = [0, 100, 0];
    const rightWorld = [200, 100, 0];

    const mockImageData = {
      getDimensions: jest.fn(() => [512, 1024, 1]),
      indexToWorld: jest.fn((idx: number[]) => {
        if (idx[0] === 0) return leftWorld;
        return rightWorld; // col=max
      }),
    };

    return {
      element: mockElement,
      getDefaultImageData: jest.fn(() => imageDataAvailable ? mockImageData : null),
      worldToCanvas: jest.fn((world: number[]) => {
        if (world === leftWorld) return [leftCanvasX, 300];
        if (world === rightWorld) return [rightCanvasX, 300];
        return [canvasWidth / 2, 300];
      }),
      getPan: jest.fn(() => [currentPanX, currentPanY]),
    };
  }

  describe('R breast (chest wall → right edge)', () => {
    it('normal image: right column (col=max) is at canvas right → already aligned', () => {
      // 정방향 이미지: col=max (rightCanvasX=800) = canvas 오른쪽 = 흉벽
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 0,
        rightCanvasX: 800,  // = canvasWidth → 흉벽이 이미 오른쪽 edge에 있음
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'R');
      expect(result).toBeNull(); // 이미 정렬됨
    });

    it('normal image: chest wall drifted left → apply correction', () => {
      // 사용자가 왼쪽으로 pan → 흉벽이 600으로 이동
      // deltaX = 800 - 600 = 200, newPan = 0 + 200 = 200
      // delta2 = 200 > 0 → 이미지 RIGHT → 흉벽 600에서 800으로 이동 ✓
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 0,
        rightCanvasX: 600, // 흉벽이 왼쪽으로 이탈
        currentPanX: 0,
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'R');
      expect(result).not.toBeNull();
      expect(result!.newPan[0]).toBe(200);
      expect(result!.deltaX).toBe(200);
    });

    it('reflected image: col=0 appears at canvas right (Math.max handles it)', () => {
      // 반전 이미지: DICOM col=0 → canvas X=800(오른쪽), col=max → canvas X=0(왼쪽)
      // R breast 흉벽 = 화면상 오른쪽 = Math.max(800, 0) = 800 = canvasWidth → 정렬됨
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 800,   // DICOM col=0 → 화면 오른쪽 (반전)
        rightCanvasX: 0,    // DICOM col=max → 화면 왼쪽 (반전)
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'R');
      expect(result).toBeNull(); // Math.max(800, 0) = 800 = targetX → 이미 정렬됨
    });

    it('reflected image: chest wall drifted → Math.max corrects properly', () => {
      // 반전 이미지에서 사용자가 pan → 흉벽(col=0)이 600으로 이동
      // chestWallCanvasX = Math.max(600, 0) = 600
      // deltaX = 800 - 600 = 200, newPan = 10 + 200 = 210
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 600,  // 반전: DICOM col=0이 흉벽, 현재 600 위치
        rightCanvasX: 0,
        currentPanX: 10,
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'R');
      expect(result).not.toBeNull();
      expect(result!.deltaX).toBe(200);
      expect(result!.newPan[0]).toBe(210);
    });

    it('preserves Y pan', () => {
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        rightCanvasX: 400,
        currentPanY: 150,
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'R');
      expect(result).not.toBeNull();
      expect(result!.newPan[1]).toBe(150); // Y 유지
    });
  });

  describe('L breast (chest wall → left edge)', () => {
    it('normal image: left column (col=0) is at canvas left → already aligned', () => {
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 0,    // = targetX → 이미 정렬됨
        rightCanvasX: 800,
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'L');
      expect(result).toBeNull();
    });

    it('normal image: chest wall drifted right → apply correction', () => {
      // 흉벽(col=0)이 400으로 이동 → targetX=0, deltaX = 0-400 = -400
      // newPan = 0 + (-400) = -400
      // delta2 = -400 < 0 → 이미지 LEFT → 흉벽 400에서 0으로 이동 ✓
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 400,  // 흉벽이 우측으로 이탈
        rightCanvasX: 800,
        currentPanX: 0,
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'L');
      expect(result).not.toBeNull();
      expect(result!.deltaX).toBe(-400);
      expect(result!.newPan[0]).toBe(-400);
    });

    it('reflected image: Math.min picks correct chest wall', () => {
      // 반전 이미지: col=0 → 오른쪽(800), col=max → 왼쪽(0)
      // L breast 흉벽 = 화면 왼쪽 = Math.min(800, 0) = 0 = targetX → 정렬됨
      const viewport = createDynamicMockViewport({
        canvasWidth: 800,
        leftCanvasX: 800,  // DICOM col=0 → 반전으로 우측
        rightCanvasX: 0,   // DICOM col=max → 반전으로 좌측 (실제 흉벽)
      });

      const result = computeChestWallAnchorPanDynamic(viewport, 'L');
      expect(result).toBeNull(); // Math.min(800, 0) = 0 = targetX → 이미 정렬됨
    });
  });

  describe('error handling', () => {
    it('returns null when canvasWidth is 0', () => {
      const viewport = createDynamicMockViewport({ canvasWidth: 0 });
      expect(computeChestWallAnchorPanDynamic(viewport, 'R')).toBeNull();
    });

    it('returns null when imageData is not available', () => {
      const viewport = createDynamicMockViewport({ imageDataAvailable: false });
      expect(computeChestWallAnchorPanDynamic(viewport, 'R')).toBeNull();
    });

    it('returns null when element is null', () => {
      const viewport = {
        element: null,
        getDefaultImageData: jest.fn(),
        worldToCanvas: jest.fn(),
        getPan: jest.fn(),
      };
      expect(computeChestWallAnchorPanDynamic(viewport, 'R')).toBeNull();
    });
  });
});

/**
 * getLateralityFromViewportId 테스트
 *
 * @description
 * index.tsx 내부 함수를 직접 테스트하기 어려우므로
 * viewportId 패턴 매핑 규칙을 별도 검증합니다.
 * (해당 함수는 export되지 않으므로 동등한 로직으로 테스트)
 */
describe('getLateralityFromViewportId', () => {
  /**
   * viewportId 패턴 → laterality 매핑 규칙
   * hpMammo.ts 기반:
   * - mammo-rcc → R
   * - mammo-lcc → L
   * - mammo-rmlo → R
   * - mammo-lmlo → L
   * - mammo-compare-rcc → R
   * - mammo-compare-lcc → L
   */
  function getLateralityFromViewportId(viewportId: string): 'R' | 'L' | null {
    if (viewportId.includes('rcc') || viewportId.includes('rmlo')) return 'R';
    if (viewportId.includes('lcc') || viewportId.includes('lmlo')) return 'L';
    return null;
  }

  const rightBreastViewportIds = [
    'mammo-rcc',
    'mammo-rmlo',
    'mammo-compare-rcc',
    'mammo-compare-rmlo',
  ];

  const leftBreastViewportIds = ['mammo-lcc', 'mammo-lmlo', 'mammo-compare-lcc', 'mammo-compare-lmlo'];

  const unknownViewportIds = [
    'mammo-fallback',
    'mammo-unknown',
    'viewport-1',
    '',
    'some-other-viewport',
  ];

  test.each(rightBreastViewportIds)('%s → R', (viewportId) => {
    expect(getLateralityFromViewportId(viewportId)).toBe('R');
  });

  test.each(leftBreastViewportIds)('%s → L', (viewportId) => {
    expect(getLateralityFromViewportId(viewportId)).toBe('L');
  });

  test.each(unknownViewportIds)('%s → null (anchor not applied)', (viewportId) => {
    expect(getLateralityFromViewportId(viewportId)).toBeNull();
  });
});
