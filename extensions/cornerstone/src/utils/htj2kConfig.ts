/**
 * HTJ2K 중앙 설정 관리자
 * 모든 HTJ2K 관련 설정을 한 곳에서 관리
 *
 * @description
 * HTJ2K Progressive Decoding 관련 설정을 중앙 집중화하여 관리합니다.
 * config/default.js의 htj2k 섹션에서 설정을 로드하고,
 * 런타임에서 동적으로 설정을 변경할 수 있습니다.
 *
 * @see htj2kRangeRequest.ts - HTTP Range Request 기능
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - Server API 연동 구현
 */

import { initRangeRequestConfig } from './htj2kRangeRequest';

/**
 * 서버 API 설정 인터페이스
 *
 * @description
 * DICOMweb 서버의 HTJ2K Level 추출 API 설정입니다.
 * 서버가 `?level=N` 및 `?complement=N` 파라미터를 지원하면
 * Progressive Network Loading이 가능합니다.
 *
 * @example
 * ```
 * // Volume 요청 시
 * GET /frames/1?level=2   → ~100KB (Level 2까지 완전한 HTJ2K)
 *
 * // Background 요청 시
 * GET /frames/1?complement=2  → ~550KB (Level 2 이후 데이터)
 *
 * // 병합
 * level2Data[:-2] + complementData + EOC = Full HTJ2K
 * ```
 *
 * @see PROMPT-SERVER-HTJ2K-API.md - 서버 API 스펙
 */
export interface HTJ2KServerApiConfig {
  /** 서버 API 사용 여부 (기본: false, 서버 지원 확인 후 config에서 true로 설정) */
  enabled: boolean;
  /** Level 파라미터 이름 (기본: 'level') - URL에 ?level=2 형태로 추가 */
  levelParam: string;
  /** Complement 파라미터 이름 (기본: 'complement') - URL에 ?complement=2 형태로 추가 */
  complementParam: string;
  /** Volume 요청 시 Level (기본: 2 = 1/4 해상도) */
  volumeLevel: number;
  /** 서버 응답 헤더로 지원 여부 자동 감지 (X-HTJ2K-Level 헤더 확인) */
  autoDetect: boolean;
}

/** HTJ2K 설정 인터페이스 */
export interface HTJ2KConfig {
  /** HTJ2K 기능 활성화 여부 */
  enabled: boolean;
  /** Volume(MPR)용 decodeLevel (0=Full, 1=1/2, 2=1/4, 3=1/8) */
  volumeDecodeLevel: number;
  /** Stack(Axial)용 초기 decodeLevel */
  stackDecodeLevel: number;
  /** 스크롤 시 Full Resolution으로 전환 여부 */
  stackFullResolutionOnScroll: boolean;
  /** fetch streaming 사용 여부 (false=xhr, true=fetch) */
  streaming: boolean;
  /** 서버 API 설정 (Progressive Network Loading) */
  serverApi?: HTJ2KServerApiConfig;
}

/**
 * 서버 API 기본 설정
 *
 * @description
 * 기본값은 disabled (서버 지원 확인 후 config에서 활성화)
 * 서버가 ?level=N, ?complement=N 파라미터를 지원해야 동작합니다.
 */
const DEFAULT_SERVER_API_CONFIG: HTJ2KServerApiConfig = {
  enabled: false, // ⚠️ 기본값 false - 서버 지원 확인 후 config에서 true로 설정
  levelParam: 'level',
  complementParam: 'complement',
  volumeLevel: 2,
  autoDetect: true,
};

/**
 * 기본값 (config에서 오버라이드 가능)
 *
 * @property volumeDecodeLevel - Volume/MPR은 Level 2 (1/4 해상도)로 빠른 초기 표시
 * @property stackDecodeLevel - Stack은 Level 0 (Full 해상도)로 고화질 진단
 * @property streaming - WASM 메모리 오류 방지를 위해 비활성화
 * @property serverApi - 서버 API 설정 (기본 비활성화)
 */
const DEFAULT_CONFIG: HTJ2KConfig = {
  enabled: true,  // HTJ2K 기능 활성화
  volumeDecodeLevel: 2,  // Volume/MPR: Level 2 (1/4 해상도, 메모리 효율)
  stackDecodeLevel: 0,   // Stack: Level 0 (Full 해상도, 고화질 진단)
  stackFullResolutionOnScroll: true,
  streaming: false, // fetch streaming 비활성화 (HTJ2K 메모리 오류 발생)
  serverApi: { ...DEFAULT_SERVER_API_CONFIG },
};

/** 런타임 설정 저장소 */
let currentConfig: HTJ2KConfig = { ...DEFAULT_CONFIG };

/** 초기화 완료 여부 */
let initialized = false;

/**
 * config에서 HTJ2K 설정 로드
 *
 * @description
 * window.config.htj2k 섹션에서 HTJ2K 관련 설정을 로드합니다.
 * serverApi 설정이 포함되어 있으면 Server API 기능도 초기화됩니다.
 *
 * @param appConfig - window.config 객체
 */
export function initHTJ2KConfig(appConfig: any): void {
  console.log('[HTJ2K-Config] initHTJ2KConfig called, appConfig.htj2k:', appConfig?.htj2k);

  const htj2kConfig = appConfig?.htj2k || {};

  // serverApi 설정 병합 (중첩 객체이므로 별도 처리)
  const mergedServerApi = {
    ...DEFAULT_SERVER_API_CONFIG,
    ...(htj2kConfig.serverApi || {}),
  };

  currentConfig = {
    ...DEFAULT_CONFIG,
    ...htj2kConfig,
    serverApi: mergedServerApi,
  };
  initialized = true;

  console.log('[HTJ2K-Config] currentConfig after merge:', currentConfig);

  // Server API 설정 로깅
  if (mergedServerApi.enabled) {
    console.log('[HTJ2K-Config] Server API enabled:', {
      levelParam: mergedServerApi.levelParam,
      complementParam: mergedServerApi.complementParam,
      volumeLevel: mergedServerApi.volumeLevel,
      autoDetect: mergedServerApi.autoDetect,
    });
  } else {
    console.log('[HTJ2K-Config] Server API disabled (default)');
  }

  // Range Request 설정 초기화
  if (htj2kConfig.rangeRequest) {
    console.log('[HTJ2K-Config] Initializing Range Request with:', htj2kConfig.rangeRequest);
    initRangeRequestConfig(htj2kConfig.rangeRequest);
  } else {
    console.warn('[HTJ2K-Config] No rangeRequest config found in appConfig.htj2k');
  }
}

/**
 * 현재 HTJ2K 설정 반환
 * @returns 현재 HTJ2K 설정 복사본
 */
export function getHTJ2KConfig(): HTJ2KConfig {
  return { ...currentConfig };
}

/**
 * HTJ2K 기능 활성화 여부 반환
 * @returns HTJ2K 활성화 여부
 */
export function isHTJ2KEnabled(): boolean {
  return currentConfig.enabled;
}

/**
 * decodeLevel 반환
 * @param type - 'volume' 또는 'stack'
 * @returns decodeLevel (0=Full, 1=1/2, 2=1/4, 3=1/8)
 */
export function getDecodeLevel(type: 'volume' | 'stack' = 'volume'): number {
  if (!currentConfig.enabled) {
    return 0; // HTJ2K 비활성화 시 Full Resolution
  }
  return type === 'volume'
    ? currentConfig.volumeDecodeLevel
    : currentConfig.stackDecodeLevel;
}

/**
 * Resolution Factor 계산 (2^decodeLevel)
 * @param type - 'volume' 또는 'stack'
 * @returns Resolution Factor (1, 2, 4, 8)
 */
export function getResolutionFactor(type: 'volume' | 'stack' = 'volume'): number {
  return Math.pow(2, getDecodeLevel(type));
}

/**
 * streaming 설정 반환
 * @returns streaming 활성화 여부
 */
export function isStreamingEnabled(): boolean {
  return currentConfig.streaming;
}

/**
 * 런타임에서 설정 업데이트 (디버깅/테스트용)
 * @param updates - 업데이트할 설정 항목들
 */
export function updateHTJ2KConfig(updates: Partial<HTJ2KConfig>): void {
  currentConfig = { ...currentConfig, ...updates };
}

/**
 * Stack viewport를 Full Resolution으로 전환
 */
export function switchStackToFullResolution(): void {
  currentConfig.stackDecodeLevel = 0;
}

/**
 * Stack viewport를 원래 설정으로 복원
 * @param level - 복원할 decodeLevel (기본값: 2)
 */
export function resetStackDecodeLevel(level: number = 2): void {
  currentConfig.stackDecodeLevel = level;
}

/**
 * 설정을 기본값으로 초기화
 */
export function resetHTJ2KConfig(): void {
  currentConfig = {
    ...DEFAULT_CONFIG,
    serverApi: { ...DEFAULT_SERVER_API_CONFIG },
  };
}

// =============================================================================
// Server API 관련 함수들
// =============================================================================

/** 서버 API 지원 여부 캐시 (자동 감지 결과 저장) */
let serverApiDetectedSupport: boolean | null = null;

/**
 * 서버 API 활성화 여부 확인
 *
 * @description
 * HTJ2K가 활성화되어 있고, serverApi.enabled가 true인 경우에만 true 반환.
 * 자동 감지가 활성화되어 있고 감지 결과가 false이면 false 반환.
 *
 * @returns 서버 API 사용 가능 여부
 */
export function isServerApiEnabled(): boolean {
  if (!currentConfig.enabled) {
    return false;
  }

  const serverApi = currentConfig.serverApi;
  if (!serverApi?.enabled) {
    return false;
  }

  // 자동 감지 결과가 false이면 비활성화
  if (serverApi.autoDetect && serverApiDetectedSupport === false) {
    return false;
  }

  return true;
}

/**
 * 서버 API 설정 반환
 *
 * @returns 현재 서버 API 설정 (없으면 기본값)
 */
export function getServerApiConfig(): HTJ2KServerApiConfig {
  return currentConfig.serverApi || { ...DEFAULT_SERVER_API_CONFIG };
}

/**
 * URL에 Level 파라미터 추가
 *
 * @description
 * 서버 API가 활성화된 경우 URL에 ?level=N 파라미터를 추가합니다.
 * 기존 query string이 있으면 &로 연결합니다.
 *
 * @param url - 원본 URL
 * @param level - 요청할 Level (기본값: serverApi.volumeLevel)
 * @returns Level 파라미터가 추가된 URL (비활성화 시 원본 URL)
 *
 * @example
 * ```typescript
 * appendLevelParam('https://server/frames/1', 2)
 * // => 'https://server/frames/1?level=2'
 *
 * appendLevelParam('https://server/frames/1?existing=param', 2)
 * // => 'https://server/frames/1?existing=param&level=2'
 * ```
 */
export function appendLevelParam(url: string, level?: number): string {
  if (!isServerApiEnabled()) {
    return url;
  }

  const serverApi = getServerApiConfig();
  const paramName = serverApi.levelParam;
  const levelValue = level ?? serverApi.volumeLevel;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${paramName}=${levelValue}`;
}

/**
 * URL에 Complement 파라미터 추가
 *
 * @description
 * 서버 API가 활성화된 경우 URL에 ?complement=N 파라미터를 추가합니다.
 * Complement는 지정된 Level 이후의 데이터만 요청합니다.
 *
 * @param url - 원본 URL
 * @param level - 기준 Level (이 Level 이후 데이터 요청)
 * @returns Complement 파라미터가 추가된 URL (비활성화 시 원본 URL)
 *
 * @example
 * ```typescript
 * appendComplementParam('https://server/frames/1', 2)
 * // => 'https://server/frames/1?complement=2'
 * ```
 */
export function appendComplementParam(url: string, level: number): string {
  if (!isServerApiEnabled()) {
    return url;
  }

  const serverApi = getServerApiConfig();
  const paramName = serverApi.complementParam;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${paramName}=${level}`;
}

/**
 * imageId에 Level 파라미터 추가
 *
 * @description
 * wadors:// 스킴의 imageId에 ?level=N 파라미터를 추가합니다.
 * imageId 형식: wadors:https://server/.../frames/1
 *
 * @param imageId - 원본 imageId (wadors:// 스킴)
 * @param level - 요청할 Level
 * @returns Level 파라미터가 추가된 imageId
 *
 * @example
 * ```typescript
 * appendLevelParamToImageId('wadors:https://server/frames/1', 2)
 * // => 'wadors:https://server/frames/1?level=2'
 * ```
 */
export function appendLevelParamToImageId(imageId: string, level?: number): string {
  if (!isServerApiEnabled()) {
    return imageId;
  }

  // wadors: prefix가 아니면 원본 반환
  if (!imageId.startsWith('wadors:')) {
    return imageId;
  }

  const url = imageId.substring(7); // "wadors:" 제거
  const modifiedUrl = appendLevelParam(url, level);
  return `wadors:${modifiedUrl}`;
}

/**
 * 서버 응답에서 API 지원 여부 감지
 *
 * @description
 * 서버 응답 헤더에서 X-HTJ2K-Level 헤더가 있으면 서버 API 지원으로 판단합니다.
 * 자동 감지(autoDetect)가 활성화된 경우 결과를 캐시합니다.
 *
 * @param response - fetch Response 객체
 * @returns 서버 API 지원 여부
 */
export function detectServerApiSupport(response: Response): boolean {
  const hasLevelHeader = response.headers.has('X-HTJ2K-Level');

  // 자동 감지가 활성화되어 있으면 결과 캐시
  if (currentConfig.serverApi?.autoDetect) {
    serverApiDetectedSupport = hasLevelHeader;

    if (hasLevelHeader) {
      console.log('[HTJ2K-Config] Server API support detected via X-HTJ2K-Level header');
    }
  }

  return hasLevelHeader;
}

/**
 * XHR 응답에서 서버 API 지원 여부 감지
 *
 * @description
 * XMLHttpRequest 응답 헤더에서 X-HTJ2K-Level 헤더를 확인합니다.
 * beforeProcessing 훅에서 사용됩니다.
 *
 * @param xhr - XMLHttpRequest 객체
 * @returns 서버 API 지원 여부
 */
export function detectServerApiSupportFromXHR(xhr: XMLHttpRequest): boolean {
  let hasLevelHeader = false;

  try {
    // CORS 정책으로 인해 헤더 접근이 거부될 수 있음
    // 서버에서 Access-Control-Expose-Headers: X-HTJ2K-Level 설정 필요
    const levelHeader = xhr.getResponseHeader('X-HTJ2K-Level');
    hasLevelHeader = levelHeader !== null;
  } catch (e) {
    // CORS 오류 무시 - 헤더 접근 불가 시 false 반환
  }

  // 자동 감지가 활성화되어 있으면 결과 캐시
  if (currentConfig.serverApi?.autoDetect) {
    serverApiDetectedSupport = hasLevelHeader;

    if (hasLevelHeader) {
      console.log('[HTJ2K-Config] Server API support detected via X-HTJ2K-Level header (XHR)');
    }
  }

  return hasLevelHeader;
}

/**
 * 서버 API 감지 결과 초기화
 *
 * @description
 * 서버 API 자동 감지 결과를 초기화합니다.
 * 다른 서버로 전환하거나 테스트 시 사용합니다.
 */
export function resetServerApiDetection(): void {
  serverApiDetectedSupport = null;
  console.log('[HTJ2K-Config] Server API detection reset');
}

/**
 * 서버 API 감지 상태 반환
 *
 * @returns 감지 상태 (null: 미감지, true: 지원, false: 미지원)
 */
export function getServerApiDetectionStatus(): boolean | null {
  return serverApiDetectedSupport;
}

/**
 * XHR 응답에서 Fallback 여부 감지
 *
 * @description
 * 서버가 PLT 마커가 없어서 Level 추출이 불가능한 경우,
 * 전체 HTJ2K를 반환하고 X-HTJ2K-Fallback: true 헤더를 설정합니다.
 *
 * 이 함수는 3단계 우선순위로 Fallback 여부를 판단합니다:
 * 1. X-HTJ2K-Fallback 헤더 (명시적) - 커스텀 서버
 * 2. X-HTJ2K-Original-Size vs Content-Length 비교 (암묵적) - 커스텀 서버
 * 3. null 반환 (판단 불가) - 표준 DICOMweb 서버
 *
 * 표준 DICOMweb 서버 호환성을 위해 헤더가 없는 경우 null을 반환하여
 * 기존 크기 기반 Fallback 감지 로직이 동작하도록 합니다.
 *
 * @param xhr - XMLHttpRequest 객체
 * @returns true=Fallback 발생, false=정상 Level 데이터, null=판단 불가 (표준 DICOMweb)
 *
 * @example
 * ```typescript
 * const fallbackResult = detectFallbackFromXHR(xhr);
 *
 * if (fallbackResult === true) {
 *   // 명시적 Fallback: 전체 HTJ2K를 fullData로 캐싱
 *   cacheFullDataAsFallback(originalImageId, response);
 * } else if (fallbackResult === false) {
 *   // 명시적 정상: Level 데이터로 캐싱
 *   cacheLevelData(originalImageId, response, levelValue);
 * } else {
 *   // fallbackResult === null (표준 DICOMweb 서버)
 *   // 기존 로직: 일단 Level 데이터로 캐싱
 *   // Background loader에서 크기 비교로 Fallback 감지
 *   cacheLevelData(originalImageId, response, levelValue);
 * }
 * ```
 *
 * @see TASK-72-CLIENT-FALLBACK-FIX.md - 클라이언트 Fallback 처리 작업지시서
 */
export function detectFallbackFromXHR(xhr: XMLHttpRequest): boolean | null {
  try {
    // =======================================================================
    // 1순위: X-HTJ2K-Fallback 헤더 (명시적)
    // =======================================================================
    // 커스텀 서버가 PLT 없어서 전체 HTJ2K를 반환한 경우
    // 이 헤더가 있으면 가장 신뢰할 수 있음
    const fallbackHeader = xhr.getResponseHeader('X-HTJ2K-Fallback');
    if (fallbackHeader !== null) {
      const isFallback = fallbackHeader.toLowerCase() === 'true';
      console.log('[HTJ2K-Config] Fallback detected via X-HTJ2K-Fallback header:', isFallback);
      return isFallback;
    }

    // =======================================================================
    // 2순위: X-HTJ2K-Original-Size vs Content-Length 비교
    // =======================================================================
    // X-HTJ2K-Fallback 헤더가 없지만 Original-Size가 있는 경우
    // Original-Size == Content-Length면 전체 데이터 반환 (Fallback)
    const originalSize = xhr.getResponseHeader('X-HTJ2K-Original-Size');
    const contentLength = xhr.getResponseHeader('Content-Length');

    if (originalSize !== null && contentLength !== null) {
      const origSize = parseInt(originalSize, 10);
      const contLen = parseInt(contentLength, 10);

      if (!isNaN(origSize) && !isNaN(contLen)) {
        const isFallback = origSize === contLen;
        console.log('[HTJ2K-Config] Fallback detected via size comparison:', {
          originalSize: origSize,
          contentLength: contLen,
          isFallback,
        });
        return isFallback;
      }
    }

    // =======================================================================
    // 3순위: 판단 불가 (표준 DICOMweb 서버)
    // =======================================================================
    // 커스텀 헤더가 전혀 없는 경우 - 표준 DICOMweb 서버로 추정
    // null을 반환하여 기존 크기 기반 Fallback 감지 로직 사용
    return null;
  } catch (e) {
    // CORS 오류 등으로 헤더 접근 불가 - 판단 불가
    console.warn('[HTJ2K-Config] detectFallbackFromXHR error:', e);
    return null;
  }
}
