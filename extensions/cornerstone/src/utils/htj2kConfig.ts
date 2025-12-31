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
 */

import { initRangeRequestConfig } from './htj2kRangeRequest';

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
}

/**
 * 기본값 (config에서 오버라이드 가능)
 *
 * @property volumeDecodeLevel - Volume/MPR은 Level 2 (1/4 해상도)로 빠른 초기 표시
 * @property stackDecodeLevel - Stack은 Level 0 (Full 해상도)로 고화질 진단
 * @property streaming - WASM 메모리 오류 방지를 위해 비활성화
 */
const DEFAULT_CONFIG: HTJ2KConfig = {
  enabled: true,  // HTJ2K 기능 활성화
  volumeDecodeLevel: 2,  // Volume/MPR: Level 2 (1/4 해상도, 메모리 효율)
  stackDecodeLevel: 0,   // Stack: Level 0 (Full 해상도, 고화질 진단)
  stackFullResolutionOnScroll: true,
  streaming: false, // fetch streaming 비활성화 (HTJ2K 메모리 오류 발생)
};

/** 런타임 설정 저장소 */
let currentConfig: HTJ2KConfig = { ...DEFAULT_CONFIG };

/** 초기화 완료 여부 */
let initialized = false;

/**
 * config에서 HTJ2K 설정 로드
 * @param appConfig - window.config 객체
 */
export function initHTJ2KConfig(appConfig: any): void {
  console.log('[HTJ2K-Config] initHTJ2KConfig called, appConfig.htj2k:', appConfig?.htj2k);

  const htj2kConfig = appConfig?.htj2k || {};

  currentConfig = {
    ...DEFAULT_CONFIG,
    ...htj2kConfig,
  };
  initialized = true;

  console.log('[HTJ2K-Config] currentConfig after merge:', currentConfig);

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
  currentConfig = { ...DEFAULT_CONFIG };
}
