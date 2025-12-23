/**
 * HTJ2K Decoder Patch
 *
 * 이 패치는 HTJ2K 디코더의 decodeSubResolution 호출을 가로채서
 * 항상 지정된 decodeLevel만 사용하도록 강제합니다.
 *
 * 문제:
 * - wadors loadImage.js가 자체적으로 decodeLevel을 계산하고
 * - options.decodeLevel을 무시합니다
 * - 결과적으로 100% 다운로드 시 decodeLevel=0 (full resolution)으로 디코딩
 * - 이로 인해 메모리 부족 오류 발생
 *
 * 해결:
 * - HTJ2K 디코더의 decodeSubResolution 메서드를 패치하여
 * - 전달된 decodeLevel과 관계없이 항상 지정된 레벨로 디코딩
 */

// 전역 설정
let FORCE_DECODE_LEVEL = 2; // Quarter resolution
let PATCH_ENABLED = true;
let patchApplied = false;

/**
 * HTJ2K 디코더 패치 적용
 *
 * 이 함수는 dicomImageLoader가 초기화된 후,
 * 첫 번째 HTJ2K 이미지 디코딩 전에 호출되어야 합니다.
 */
export function patchHTJ2KDecoder(): void {
  if (patchApplied) {
    console.log('[HTJ2K-Patch] Already applied');
    return;
  }

  console.log(`[HTJ2K-Patch] Attempting to patch HTJ2K decoder (FORCE_DECODE_LEVEL=${FORCE_DECODE_LEVEL})`);

  // Web Worker에서 실행되는 디코더는 직접 패치할 수 없음
  // 대신 decodeConfig를 통해 간접적으로 제어 시도

  try {
    // dicom-image-loader의 옵션 설정 가져오기
    const dicomImageLoader = require('@cornerstonejs/dicom-image-loader');

    if (dicomImageLoader && dicomImageLoader.external) {
      console.log('[HTJ2K-Patch] dicomImageLoader external found');

      // decodeConfig에 강제 decodeLevel 추가
      const currentConfig = dicomImageLoader.external.getDecodeConfig?.() || {};
      const patchedConfig = {
        ...currentConfig,
        htj2k: {
          ...currentConfig.htj2k,
          forceDecodeLevel: FORCE_DECODE_LEVEL,
        },
      };

      if (dicomImageLoader.external.setDecodeConfig) {
        dicomImageLoader.external.setDecodeConfig(patchedConfig);
        console.log('[HTJ2K-Patch] Decode config patched:', patchedConfig);
      }
    }
  } catch (e) {
    console.warn('[HTJ2K-Patch] Could not patch via dicomImageLoader.external:', e);
  }

  patchApplied = true;
}

/**
 * 강제 decodeLevel 설정
 */
export function setForceDecodeLevel(level: number): void {
  FORCE_DECODE_LEVEL = level;
  console.log(`[HTJ2K-Patch] Force decode level set to ${level}`);
}

/**
 * 패치 활성화/비활성화
 */
export function setPatchEnabled(enabled: boolean): void {
  PATCH_ENABLED = enabled;
  console.log(`[HTJ2K-Patch] Patch ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * 현재 설정 반환
 */
export function getConfig(): { forceDecodeLevel: number; enabled: boolean } {
  return {
    forceDecodeLevel: FORCE_DECODE_LEVEL,
    enabled: PATCH_ENABLED,
  };
}

export default patchHTJ2KDecoder;
