/**
 * HTJ2K Range Request Core 유틸리티
 *
 * @description
 * HTJ2K Progressive Decoding을 위한 HTTP Range Request 기능의 핵심 동기 함수들입니다.
 * async 함수를 제외하여 Jest Babel 변환 문제를 회피합니다.
 *
 * @see https://tools.ietf.org/html/rfc7233 - HTTP Range Requests
 * @see document/htj2k-range-request-work-order.md - 작업 지시서
 */

/**
 * Range Request 설정 인터페이스
 */
export interface RangeRequestConfig {
  /** Range Request 기능 활성화 여부 */
  enabled: boolean;
  /** 적응형 재요청 활성화 여부 */
  adaptiveRetry: boolean;
  /** 최대 재시도 횟수 */
  maxRetries: number;
  /** 요청 타임아웃 (ms) */
  timeout: number;
  /** decodeLevel별 초기 요청 바이트 크기 */
  initialRangeBytes: RangeByDecodeLevel;
  /** 재시도 시 바이트 증가 배율 */
  retryMultiplier: number;
}

/**
 * decodeLevel별 바이트 크기 매핑
 * @description
 * HTJ2K RPCL(Resolution-Position-Component-Layer) 구조 기반으로
 * 각 해상도 레벨에 필요한 대략적인 바이트 수를 정의합니다.
 *
 * - decodeLevel 0: Full Resolution (100%) - Range Request 사용 안 함
 * - decodeLevel 1: 1/2 Resolution (~6.25% + 마진)
 * - decodeLevel 2: 1/4 Resolution (~1.56% + 마진)
 * - decodeLevel 3: 1/8 Resolution (~0.4% + 마진)
 */
export interface RangeByDecodeLevel {
  /** decodeLevel 1 (1/2 해상도)용 바이트 */
  1: number;
  /** decodeLevel 2 (1/4 해상도)용 바이트 */
  2: number;
  /** decodeLevel 3 (1/8 해상도)용 바이트 */
  3: number;
}

/**
 * 기본 Range Request 설정
 * @description
 * 보수적인 초기값을 사용하여 대부분의 이미지에서 첫 요청으로 성공하도록 설정
 */
export const DEFAULT_RANGE_CONFIG: RangeRequestConfig = {
  enabled: true, // Range Request 활성화
  adaptiveRetry: true,
  maxRetries: 3,
  timeout: 30000,
  // Level N 디코딩에 필요한 데이터 비율: (1/2)^(2*N)
  // Level 1: 25%, Level 2: 6.25%, Level 3: 1.56%
  initialRangeBytes: {
    1: 1500000, // 1.5MB for Level 1 (1/2 resolution, ~25% data needed)
    2: 500000,  // 500KB for Level 2 (1/4 resolution, ~6.25% data needed)
    3: 100000,  // 100KB for Level 3 (1/8 resolution, ~1.56% data needed)
  },
  retryMultiplier: 2.0,
};

/** 현재 Range Request 설정 */
let rangeConfig: RangeRequestConfig = { ...DEFAULT_RANGE_CONFIG };

/**
 * Range Request 설정 초기화
 *
 * @param config - window.config.htj2k.rangeRequest 객체
 * @example
 * ```typescript
 * initRangeRequestConfig({
 *   enabled: true,
 *   adaptiveRetry: true,
 *   initialRangeBytes: { 1: 600000, 2: 150000, 3: 50000 }
 * });
 * ```
 */
export function initRangeRequestConfig(config?: Partial<RangeRequestConfig>): void {
  if (config) {
    rangeConfig = {
      ...DEFAULT_RANGE_CONFIG,
      ...config,
      // initialRangeBytes는 깊은 병합 필요
      initialRangeBytes: {
        ...DEFAULT_RANGE_CONFIG.initialRangeBytes,
        ...config.initialRangeBytes,
      },
    };
    // 디버그: 설정 확인
    console.log('[RangeRequest] Config initialized:', rangeConfig);
  }
}

/**
 * 현재 Range Request 설정 반환
 *
 * @returns 현재 Range Request 설정 복사본
 */
export function getRangeRequestConfig(): RangeRequestConfig {
  return { ...rangeConfig };
}

/**
 * Range Request 활성화 여부 확인
 *
 * @returns Range Request 활성화 여부
 */
export function isRangeRequestEnabled(): boolean {
  return rangeConfig.enabled;
}

/**
 * decodeLevel에 따른 초기 Range 바이트 계산
 *
 * @param decodeLevel - 목표 디코딩 레벨 (0=Full, 1=1/2, 2=1/4, 3=1/8)
 * @returns 요청할 바이트 수 (decodeLevel 0이면 undefined 반환 - 전체 다운로드)
 *
 * @example
 * ```typescript
 * const bytes = calculateInitialRangeBytes(2);
 * // returns 100000 (100KB for 1/4 resolution)
 *
 * const fullBytes = calculateInitialRangeBytes(0);
 * // returns undefined (full download, no range request)
 * ```
 */
export function calculateInitialRangeBytes(decodeLevel: number): number | undefined {
  // decodeLevel 0은 Full Resolution이므로 Range Request 사용 안 함
  if (decodeLevel === 0 || decodeLevel === undefined) {
    return undefined;
  }

  // 유효한 decodeLevel 범위 확인 (1-3)
  const validLevel = Math.max(1, Math.min(3, decodeLevel)) as 1 | 2 | 3;

  return rangeConfig.initialRangeBytes[validLevel];
}

/**
 * 재시도 시 확장된 Range 바이트 계산
 *
 * @param previousBytes - 이전 요청의 바이트 수
 * @param retryCount - 현재 재시도 횟수 (1부터 시작)
 * @returns 확장된 바이트 수
 *
 * @example
 * ```typescript
 * const extendedBytes = calculateRetryRangeBytes(100000, 1);
 * // returns 200000 (100KB * 2.0 multiplier)
 *
 * const secondRetry = calculateRetryRangeBytes(100000, 2);
 * // returns 400000 (100KB * 2.0^2 multiplier)
 * ```
 */
export function calculateRetryRangeBytes(previousBytes: number, retryCount: number): number {
  return Math.ceil(previousBytes * Math.pow(rangeConfig.retryMultiplier, retryCount));
}

/**
 * retrieveOptions에 Range Request 정보 추가
 *
 * @description
 * Cornerstone의 retrieveOptions에 rangeIndex를 설정하여
 * Range Request를 트리거합니다.
 *
 * @param retrieveOptions - 기존 retrieveOptions 객체
 * @param decodeLevel - 목표 디코딩 레벨
 * @returns Range Request 정보가 추가된 retrieveOptions
 *
 * @example
 * ```typescript
 * const options = addRangeRequestToRetrieveOptions(
 *   { streaming: false, decodeLevel: 2 },
 *   2
 * );
 *
 * // options.chunkSize가 설정되고, options.rangeIndex가 0으로 설정됨
 * // → getPixelData에서 rangeRequest.js를 사용하게 됨
 * ```
 */
export function addRangeRequestToRetrieveOptions(
  retrieveOptions: Record<string, unknown>,
  decodeLevel: number
): Record<string, unknown> {
  // Range Request 비활성화 또는 decodeLevel 0이면 원본 반환
  if (!rangeConfig.enabled || decodeLevel === 0) {
    return retrieveOptions;
  }

  const rangeBytes = calculateInitialRangeBytes(decodeLevel);
  if (!rangeBytes) {
    return retrieveOptions;
  }

  return {
    ...retrieveOptions,
    // rangeIndex를 설정하면 getPixelData.js에서 rangeRequest.js 사용
    rangeIndex: 0,
    // chunkSize를 decodeLevel에 맞는 바이트로 설정
    chunkSize: rangeBytes,
  };
}

/**
 * Range Request 설정 업데이트 (런타임)
 *
 * @param updates - 업데이트할 설정
 *
 * @example
 * ```typescript
 * // Range Request 활성화
 * updateRangeRequestConfig({ enabled: true });
 *
 * // 초기 바이트 크기 조정
 * updateRangeRequestConfig({
 *   initialRangeBytes: { 1: 800000, 2: 200000, 3: 60000 }
 * });
 * ```
 */
export function updateRangeRequestConfig(updates: Partial<RangeRequestConfig>): void {
  rangeConfig = {
    ...rangeConfig,
    ...updates,
    initialRangeBytes: {
      ...rangeConfig.initialRangeBytes,
      ...updates.initialRangeBytes,
    },
  };
}

/**
 * Range Request 설정 초기화 (기본값으로)
 */
export function resetRangeRequestConfig(): void {
  rangeConfig = { ...DEFAULT_RANGE_CONFIG };
}
