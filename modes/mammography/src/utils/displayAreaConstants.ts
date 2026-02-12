/**
 * Display Area Constants for Mammography Mode
 *
 * FR-2.5.5: Mirror Mode Toggle 기능을 위한 DisplayArea 설정 상수
 *
 * DisplayArea는 viewport에 이미지를 배치하는 방법을 정의합니다:
 * - imageArea: [scaleX, scaleY] - 이미지 표시 크기 (1.0 = 100%)
 * - imageCanvasPoint:
 *   - imagePoint: [x, y] - 이미지 좌표계에서의 기준점 (0.0~1.0)
 *   - canvasPoint: [x, y] - Canvas 좌표계에서의 기준점 (0.0~1.0)
 *
 * 사용처:
 * - modes/mammography/src/commandsModule.ts - toggleMirrorMode()
 * - modes/mammography-compare/src/commandsModule.ts - toggleMirrorMode()
 */

/**
 * 우측 유방(R)용 DisplayArea
 *
 * 이미지 우측 가장자리(chest wall)를 Canvas 좌측 가장자리에 고정
 *
 * 예시:
 *   imagePoint: [1.0, 0.5]  - 이미지 우측 가장자리 중앙
 *   canvasPoint: [0.0, 0.5] - Canvas 좌측 가장자리 중앙
 *   → 이미지 우측이 Canvas 좌측에 닿도록 배치 (chest wall이 중앙을 향함)
 *
 * @constant {DisplayAreaConfig}
 * @used-by toggleMirrorMode() in modes/mammography/commandsModule.ts
 * @used-by toggleMirrorMode() in modes/mammography-compare/commandsModule.ts
 */
export const RIGHT_BREAST_DISPLAY_AREA = {
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [1.0, 0.5],  // 이미지 우측 가장자리 중앙
    canvasPoint: [0.0, 0.5], // Canvas 좌측 가장자리 중앙
  },
  storeAsInitialCamera: false,
} as const;

/**
 * 좌측 유방(L)용 DisplayArea
 *
 * 이미지 좌측 가장자리(chest wall)를 Canvas 우측 가장자리에 고정
 *
 * 예시:
 *   imagePoint: [0.0, 0.5]  - 이미지 좌측 가장자리 중앙
 *   canvasPoint: [1.0, 0.5] - Canvas 우측 가장자리 중앙
 *   → 이미지 좌측이 Canvas 우측에 닿도록 배치 (chest wall이 중앙을 향함)
 *
 * @constant {DisplayAreaConfig}
 * @used-by toggleMirrorMode() in modes/mammography/commandsModule.ts
 * @used-by toggleMirrorMode() in modes/mammography-compare/commandsModule.ts
 */
export const LEFT_BREAST_DISPLAY_AREA = {
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [0.0, 0.5],  // 이미지 좌측 가장자리 중앙
    canvasPoint: [1.0, 0.5], // Canvas 우측 가장자리 중앙
  },
  storeAsInitialCamera: false,
} as const;

/**
 * 중앙 정렬용 DisplayArea
 *
 * 이미지 중앙을 Canvas 중앙에 배치 (일반적인 의료 영상 뷰어 배치)
 * Mirror Mode OFF 시 사용
 *
 * @constant {DisplayAreaConfig}
 * @used-by toggleMirrorMode() in modes/mammography/commandsModule.ts
 * @used-by toggleMirrorMode() in modes/mammography-compare/commandsModule.ts
 */
export const CENTER_DISPLAY_AREA = {
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],  // 이미지 중앙
    canvasPoint: [0.5, 0.5], // Canvas 중앙
  },
  storeAsInitialCamera: false,
} as const;

/**
 * DisplayArea 설정 타입 정의 (TypeScript 타입 체킹용)
 *
 * DisplayArea는 Cornerstone Viewport에 이미지를 배치하는 방법을 정의합니다:
 *
 * @typedef {Object} DisplayAreaConfig
 * @property {[number, number]} imageArea - 이미지 표시 크기 (1.0 = 100%)
 * @property {Object} imageCanvasPoint - 이미지 좌표와 Canvas 좌표 매핑
 * @property {[number, number]} imageCanvasPoint.imagePoint - 이미지 좌표계 기준점 (0.0~1.0)
 * @property {[number, number]} imageCanvasPoint.canvasPoint - Canvas 좌표계 기준점 (0.0~1.0)
 * @property {boolean} storeAsInitialCamera - 초기 카메라 상태로 저장할지 여부
 *
 * @example
 * // 이미지 우측 가장자리를 Canvas 좌측에 고정
 * {
 *   imageArea: [1.0, 1.0],
 *   imageCanvasPoint: {
 *     imagePoint: [1.0, 0.5],   // 이미지 우측 가장자리 중앙
 *     canvasPoint: [0.0, 0.5],  // Canvas 좌측 가장자리 중앙
 *   },
 *   storeAsInitialCamera: false,
 * }
 */
export type DisplayAreaConfig = {
  imageArea: [number, number];
  imageCanvasPoint: {
    imagePoint: [number, number];
    canvasPoint: [number, number];
  };
  storeAsInitialCamera: boolean;
};
