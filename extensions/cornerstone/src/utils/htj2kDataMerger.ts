/**
 * HTJ2K Data Merger
 *
 * @description
 * Server API에서 받은 Level 데이터와 Complement 데이터를 병합하여
 * Full Resolution HTJ2K 데이터를 생성합니다.
 *
 * 병합 공식:
 * ```
 * fullData = levelData[:-2] + complementData + EOC
 * ```
 *
 * - levelData: Level N까지 포함된 완전한 HTJ2K (EOC 포함)
 * - complementData: Level N 이후 데이터 (헤더/EOC 없음)
 * - EOC: End of Codestream 마커 (0xFF 0xD9)
 *
 * @example
 * ```typescript
 * import { mergeHTJ2KData, validateMergedData } from './htj2kDataMerger';
 *
 * // Level 2 데이터와 Complement 데이터 병합
 * const fullData = mergeHTJ2KData(level2Data, complementData);
 *
 * // 병합 결과 검증
 * const validation = validateMergedData(fullData, expectedSize);
 * if (!validation.valid) {
 *   console.error('Merge failed:', validation.error);
 * }
 * ```
 *
 * @see PROMPT-SERVER-HTJ2K-API.md - Server API 스펙
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - 클라이언트 구현 작업지시서
 */

import { htj2kLog } from './htj2kDebugLogger';

// =============================================================================
// Constants
// =============================================================================

/**
 * JPEG 2000 End of Codestream (EOC) 마커
 * @see ISO/IEC 15444-1 - JPEG 2000 Part 1: Core coding system
 */
export const EOC_MARKER = new Uint8Array([0xFF, 0xD9]);

/**
 * JPEG 2000 Start of Codestream (SOC) 마커
 * @see ISO/IEC 15444-1 - JPEG 2000 Part 1: Core coding system
 */
export const SOC_MARKER = new Uint8Array([0xFF, 0x4F]);

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * EOC 마커 유효성 검증
 *
 * @description
 * HTJ2K 데이터의 마지막 2바이트가 EOC 마커(0xFF 0xD9)인지 확인합니다.
 * 완전한 HTJ2K 파일은 반드시 EOC 마커로 끝나야 합니다.
 *
 * @param data - HTJ2K 데이터
 * @returns EOC 마커가 올바른지 여부
 *
 * @example
 * ```typescript
 * const data = new Uint8Array([0xFF, 0x4F, ..., 0xFF, 0xD9]);
 * console.log(hasValidEOC(data)); // true
 * ```
 */
export function hasValidEOC(data: Uint8Array): boolean {
  if (!data || data.length < 2) {
    return false;
  }
  return data[data.length - 2] === 0xFF && data[data.length - 1] === 0xD9;
}

/**
 * SOC 마커 유효성 검증
 *
 * @description
 * HTJ2K 데이터의 처음 2바이트가 SOC 마커(0xFF 0x4F)인지 확인합니다.
 * 완전한 HTJ2K 파일은 반드시 SOC 마커로 시작해야 합니다.
 *
 * @param data - HTJ2K 데이터
 * @returns SOC 마커가 올바른지 여부
 *
 * @example
 * ```typescript
 * const data = new Uint8Array([0xFF, 0x4F, ...]);
 * console.log(hasValidSOC(data)); // true
 * ```
 */
export function hasValidSOC(data: Uint8Array): boolean {
  if (!data || data.length < 2) {
    return false;
  }
  return data[0] === 0xFF && data[1] === 0x4F;
}

/**
 * 병합 결과 검증 결과 인터페이스
 */
export interface MergeValidationResult {
  /** 검증 성공 여부 */
  valid: boolean;
  /** 실패 시 오류 메시지 */
  error?: string;
  /** 검증된 데이터 정보 */
  details?: {
    /** 데이터 크기 (bytes) */
    size: number;
    /** SOC 마커 존재 여부 */
    hasSOC: boolean;
    /** EOC 마커 존재 여부 */
    hasEOC: boolean;
    /** 예상 크기와 일치 여부 */
    sizeMatch: boolean | null;
  };
}

/**
 * 병합된 데이터 검증
 *
 * @description
 * 병합된 HTJ2K 데이터가 유효한지 검증합니다.
 * - SOC 마커 (0xFF 0x4F) 존재 확인
 * - EOC 마커 (0xFF 0xD9) 존재 확인
 * - 예상 크기와 일치 여부 확인 (선택적)
 *
 * @param mergedData - 병합된 데이터
 * @param expectedSize - 예상 크기 (서버 X-HTJ2K-Original-Size 헤더 값)
 * @returns 검증 결과
 *
 * @example
 * ```typescript
 * const result = validateMergedData(mergedData, 654320);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.error);
 * }
 * ```
 */
export function validateMergedData(
  mergedData: Uint8Array,
  expectedSize?: number
): MergeValidationResult {
  const hasSOC = hasValidSOC(mergedData);
  const hasEOC = hasValidEOC(mergedData);
  const sizeMatch = expectedSize !== undefined
    ? mergedData.length === expectedSize
    : null;

  const details = {
    size: mergedData.length,
    hasSOC,
    hasEOC,
    sizeMatch,
  };

  // SOC 마커 확인
  if (!hasSOC) {
    return {
      valid: false,
      error: 'Invalid SOC marker: HTJ2K data must start with 0xFF 0x4F',
      details,
    };
  }

  // EOC 마커 확인
  if (!hasEOC) {
    return {
      valid: false,
      error: 'Invalid EOC marker: HTJ2K data must end with 0xFF 0xD9',
      details,
    };
  }

  // 크기 검증 (선택적)
  if (expectedSize !== undefined && mergedData.length !== expectedSize) {
    return {
      valid: false,
      error: `Size mismatch: expected ${expectedSize} bytes, got ${mergedData.length} bytes`,
      details,
    };
  }

  return { valid: true, details };
}

// =============================================================================
// Merge Functions
// =============================================================================

/**
 * Level 데이터와 Complement 데이터 병합
 *
 * @description
 * Server API에서 받은 Level 데이터와 Complement 데이터를 병합하여
 * Full Resolution HTJ2K 데이터를 생성합니다.
 *
 * 병합 과정:
 * 1. Level 데이터에서 EOC 마커 제거 (마지막 2바이트)
 * 2. Complement 데이터 추가
 * 3. EOC 마커 추가
 *
 * @param levelData - Level N까지 포함된 완전한 HTJ2K (EOC 포함)
 * @param complementData - Level N 이후 데이터 (헤더/EOC 없음)
 * @returns 병합된 Full Resolution HTJ2K 데이터
 *
 * @throws {Error} levelData가 2바이트 미만인 경우
 *
 * @example
 * ```typescript
 * // Level 2 데이터 (~100KB) + Complement (~550KB) = Full (~650KB)
 * const fullData = mergeHTJ2KData(level2Data, complementData);
 * ```
 */
export function mergeHTJ2KData(
  levelData: Uint8Array,
  complementData: Uint8Array
): Uint8Array {
  // 입력 검증
  if (!levelData || levelData.length < 2) {
    throw new Error('Invalid levelData: must be at least 2 bytes');
  }

  // EOC 마커 검증 (Level 데이터는 완전한 HTJ2K이어야 함)
  if (!hasValidEOC(levelData)) {
    htj2kLog('htj2kDataMerger', 'Warning: levelData does not have valid EOC marker', {
      lastTwoBytes: [levelData[levelData.length - 2], levelData[levelData.length - 1]],
    });
  }

  // 1. Level 데이터에서 EOC 마커 제거 (마지막 2바이트)
  const levelWithoutEOC = levelData.slice(0, -2);

  // 2. 병합된 데이터 크기 계산
  const mergedLength = levelWithoutEOC.length + complementData.length + EOC_MARKER.length;

  // 3. 병합 배열 생성
  const mergedData = new Uint8Array(mergedLength);

  // 4. 데이터 복사
  let offset = 0;

  // Level 데이터 (EOC 제외)
  mergedData.set(levelWithoutEOC, offset);
  offset += levelWithoutEOC.length;

  // Complement 데이터
  if (complementData.length > 0) {
    mergedData.set(complementData, offset);
    offset += complementData.length;
  }

  // EOC 마커
  mergedData.set(EOC_MARKER, offset);

  htj2kLog('htj2kDataMerger', 'Data merged successfully', {
    levelSize: levelData.length,
    complementSize: complementData.length,
    mergedSize: mergedData.length,
    formula: `${levelData.length - 2} + ${complementData.length} + 2 = ${mergedData.length}`,
  });

  return mergedData;
}

/**
 * 병합 가능 여부 확인
 *
 * @description
 * Level 데이터와 Complement 데이터가 병합 가능한 상태인지 확인합니다.
 *
 * @param levelData - Level 데이터
 * @param complementData - Complement 데이터 (null이면 아직 로딩 안 됨)
 * @returns 병합 가능 여부
 */
export function canMerge(
  levelData: Uint8Array | null | undefined,
  complementData: Uint8Array | null | undefined
): boolean {
  // Level 데이터가 없으면 병합 불가
  if (!levelData || levelData.length < 2) {
    return false;
  }

  // Complement 데이터가 없으면 병합 불가 (아직 로딩 중)
  if (!complementData) {
    return false;
  }

  return true;
}

/**
 * 안전한 병합 (검증 포함)
 *
 * @description
 * Level 데이터와 Complement 데이터를 병합하고 결과를 검증합니다.
 * 병합 실패 시 null을 반환합니다.
 *
 * @param levelData - Level 데이터
 * @param complementData - Complement 데이터
 * @param expectedSize - 예상 크기 (선택적)
 * @returns 병합된 데이터 또는 null (실패 시)
 *
 * @example
 * ```typescript
 * const fullData = safeMergeHTJ2KData(level2Data, complementData, 654320);
 * if (!fullData) {
 *   console.error('Merge failed');
 *   // Fallback: use level2Data only
 * }
 * ```
 */
export function safeMergeHTJ2KData(
  levelData: Uint8Array | null | undefined,
  complementData: Uint8Array | null | undefined,
  expectedSize?: number
): Uint8Array | null {
  // 병합 가능 여부 확인
  if (!canMerge(levelData, complementData)) {
    htj2kLog('htj2kDataMerger', 'Cannot merge: missing data', {
      hasLevelData: !!levelData,
      levelDataSize: levelData?.length ?? 0,
      hasComplementData: !!complementData,
      complementDataSize: complementData?.length ?? 0,
    });
    return null;
  }

  try {
    // 병합 수행
    const mergedData = mergeHTJ2KData(levelData!, complementData!);

    // 검증
    const validation = validateMergedData(mergedData, expectedSize);
    if (!validation.valid) {
      htj2kLog('htj2kDataMerger', 'Merge validation failed', {
        error: validation.error,
        details: validation.details,
      });
      return null;
    }

    return mergedData;
  } catch (error) {
    htj2kLog('htj2kDataMerger', 'Merge error', {
      error: String(error),
    });
    return null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 데이터 크기 포맷 (KB 단위)
 *
 * @param bytes - 바이트 수
 * @returns 포맷된 문자열 (예: "100.5 KB")
 */
export function formatDataSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * 병합 비율 계산
 *
 * @description
 * Level 데이터와 Complement 데이터의 비율을 계산합니다.
 *
 * @param levelSize - Level 데이터 크기
 * @param complementSize - Complement 데이터 크기
 * @returns 비율 정보
 */
export function calculateMergeRatio(
  levelSize: number,
  complementSize: number
): { totalSize: number; levelPercent: number; complementPercent: number } {
  const totalSize = levelSize + complementSize - 2; // EOC 중복 제거
  const levelPercent = ((levelSize - 2) / totalSize) * 100;
  const complementPercent = (complementSize / totalSize) * 100;

  return {
    totalSize,
    levelPercent: Math.round(levelPercent * 10) / 10,
    complementPercent: Math.round(complementPercent * 10) / 10,
  };
}
