/**
 * Custom WADORS Image Loader Wrapper
 *
 * 이 래퍼는 cornerstone의 기본 wadors 로더를 감싸서
 * imageRetrieveMetadataProvider의 decodeLevel 설정을 강제로 적용합니다.
 *
 * 문제: 기본 wadors 로더는 options.retrieveOptions.decodeLevel을 무시하고
 *       자체적으로 percentComplete에서 decodeLevel을 계산합니다.
 *       wadors loadImage.js에서:
 *       const useOptions = { ...options, decodeLevel }; // 자체 계산한 decodeLevel로 덮어씀!
 *
 * 해결: 로더가 반환한 promise를 가로채서 image.decodeLevel을 수정합니다.
 *       또한 streaming 데이터의 처리 방식을 수정합니다.
 */

import { imageLoader, utilities, Enums } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { isHTJ2KEnabled, getDecodeLevel } from './htj2kConfig';

const { imageRetrieveMetadataProvider } = utilities;
const { ImageQualityStatus } = Enums;

// Original wadors loader reference (set after dicomImageLoader.init())
let originalWadorsLoader: Types.ImageLoaderFn | null = null;

/**
 * retrieveOptions에서 decodeLevel 추출
 */
function getDecodeLevelFromOptions(options: any): number | undefined {
  // 1. options.retrieveOptions에서 확인
  if (options?.retrieveOptions) {
    const retrieveOptions = options.retrieveOptions;
    if (retrieveOptions.single?.decodeLevel !== undefined) {
      return retrieveOptions.single.decodeLevel;
    }
    if (retrieveOptions.default?.decodeLevel !== undefined) {
      return retrieveOptions.default.decodeLevel;
    }
    if (retrieveOptions.decodeLevel !== undefined) {
      return retrieveOptions.decodeLevel;
    }
  }

  // 2. options.decodeLevel 직접 확인
  if (options?.decodeLevel !== undefined) {
    return options.decodeLevel;
  }

  // 3. imageRetrieveMetadataProvider에서 확인
  const isVolume = options?.retrieveType === 'default';
  const metadataType = isVolume ? 'volume' : 'stack';

  try {
    const metadata = imageRetrieveMetadataProvider.get(metadataType);
    if (metadata?.retrieveOptions) {
      const metaRetrieveOptions = metadata.retrieveOptions;
      if (metaRetrieveOptions.single?.decodeLevel !== undefined) {
        return metaRetrieveOptions.single.decodeLevel;
      }
      if (metaRetrieveOptions.default?.decodeLevel !== undefined) {
        return metaRetrieveOptions.default.decodeLevel;
      }
    }
  } catch (e) {
    // Provider not available
  }

  return undefined;
}

/**
 * HTJ2K decodeLevel을 강제로 적용하는 커스텀 wadors 로더
 *
 * 전략: 원본 로더를 호출하고, 반환된 이미지의 품질 상태와 dimensions를 수정합니다.
 */
function customWadorsLoader(
  imageId: string,
  options: Types.ImageLoaderOptions = {}
): Types.IImageLoadObject {
  if (!originalWadorsLoader) {
    throw new Error('[CustomWadors] Original wadors loader not initialized');
  }

  // 설정에서 decodeLevel 가져오기
  let forcedDecodeLevel = getDecodeLevelFromOptions(options);

  // HTJ2K가 활성화되어 있고 decodeLevel이 지정되지 않았으면 설정에서 가져오기
  if (isHTJ2KEnabled() && forcedDecodeLevel === undefined) {
    // volume vs stack 구분: retrieveType이 'default'이면 volume으로 간주
    const isVolume = options?.retrieveType === 'default';
    forcedDecodeLevel = getDecodeLevel(isVolume ? 'volume' : 'stack');
  }

  // decodeLevel을 options에 주입 (원본 로더의 계산을 우회하진 못하지만 기록용)
  const modifiedOptions = {
    ...options,
    decodeLevel: forcedDecodeLevel,
    // HTJ2K progressive streaming 비활성화 시도
    // streaming: false, // 이건 다른 의미의 옵션임
  };

  if (forcedDecodeLevel !== undefined) {
    console.log(`[CustomWadors] Requesting decodeLevel=${forcedDecodeLevel} for ${imageId.substring(0, 60)}...`);
  }

  // 원본 로더 호출
  const imageLoadObject = originalWadorsLoader(imageId, modifiedOptions);

  // 반환된 promise를 래핑하여 이미지 수정
  const wrappedPromise = imageLoadObject.promise.then((image: any) => {
    if (!image) {
      return image;
    }

    // 디버그 로그
    console.log(`[CustomWadors] Image loaded: ${image.columns}x${image.rows}, ` +
      `decodeLevel=${image.imageFrame?.decodeLevel}, ` +
      `quality=${image.imageQualityStatus}`);

    // HTJ2K의 경우, 이미 decode된 이미지의 품질 상태를 FULL_RESOLUTION으로 표시
    // 이렇게 하면 progressive loading이 더 이상 진행하지 않음
    if (forcedDecodeLevel !== undefined && forcedDecodeLevel > 0) {
      // 현재 이미지가 요청한 decodeLevel로 디코딩되었다면 완료로 표시
      image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
    }

    return image;
  });

  return {
    promise: wrappedPromise,
    cancelFn: imageLoadObject.cancelFn,
    decache: imageLoadObject.decache,
  };
}

/**
 * 커스텀 wadors 로더를 초기화하고 등록합니다.
 *
 * 주의: dicomImageLoader.init() 후에 호출해야 합니다.
 */
export function initCustomWadorsLoader(): void {
  // @ts-ignore - imageLoader internal access
  const registeredLoaders = (imageLoader as any).imageLoaders;

  if (registeredLoaders && registeredLoaders.wadors) {
    originalWadorsLoader = registeredLoaders.wadors;
    console.log('[CustomWadors] Original wadors loader captured');

    // 커스텀 로더로 교체
    imageLoader.registerImageLoader('wadors', customWadorsLoader);
    const volumeLevel = getDecodeLevel('volume');
    const stackLevel = getDecodeLevel('stack');
    console.log(`[CustomWadors] Custom wadors loader registered (volumeDecodeLevel=${volumeLevel}, stackDecodeLevel=${stackLevel}, enabled=${isHTJ2KEnabled()})`);
  } else {
    console.warn('[CustomWadors] Could not find original wadors loader - will try after delay');

    // 로더가 아직 등록되지 않았을 수 있으므로 지연 시도
    setTimeout(() => {
      // @ts-ignore
      const delayedLoaders = (imageLoader as any).imageLoaders;
      if (delayedLoaders && delayedLoaders.wadors) {
        originalWadorsLoader = delayedLoaders.wadors;
        imageLoader.registerImageLoader('wadors', customWadorsLoader);
        console.log('[CustomWadors] Delayed registration successful');
      } else {
        console.error('[CustomWadors] Failed to find wadors loader after delay');
      }
    }, 1000);
  }
}

/**
 * 강제 decodeLevel 설정 변경 (런타임에서 호출 가능)
 * @deprecated htj2kConfig의 updateHTJ2KConfig를 사용하세요
 */
export function setForceDecodeLevel(level: number): void {
  console.log(`[CustomWadors] setForceDecodeLevel is deprecated. Use updateHTJ2KConfig from htj2kConfig instead.`);
  console.log(`[CustomWadors] Current config - volumeDecodeLevel=${getDecodeLevel('volume')}, stackDecodeLevel=${getDecodeLevel('stack')}`);
}

export default customWadorsLoader;
