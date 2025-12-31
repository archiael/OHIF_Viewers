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
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { isHTJ2KEnabled, getDecodeLevel } from './htj2kConfig';
import { addRangeRequestToRetrieveOptions, isRangeRequestEnabled } from './htj2kRangeRequest';
import { htj2kLog } from './htj2kDebugLogger';

const { imageRetrieveMetadataProvider } = utilities;
const { ImageQualityStatus } = Enums;

/**
 * 이미지 로더 옵션 인터페이스
 * @cornerstonejs/core의 Types.ImageLoaderOptions가 없으므로 직접 정의
 */
interface ImageLoaderOptions {
  retrieveType?: string;
  decodeLevel?: number;
  retrieveOptions?: {
    single?: { decodeLevel?: number; streaming?: boolean };
    default?: { decodeLevel?: number };
    decodeLevel?: number;
  };
  streamingData?: { chunkSize?: number };
  mediaType?: string;
  [key: string]: unknown;
}

/**
 * 메타데이터 Provider 반환 타입
 */
interface RetrieveMetadata {
  retrieveOptions?: {
    single?: { decodeLevel?: number };
    default?: { decodeLevel?: number };
  };
}


/**
 * Original wadors loader reference
 * init 시점에 설정되어 OHIF 초기화 후 올바른 함수 참조를 보장
 */
let originalWadorsLoader: Types.ImageLoaderFn | null = null;

/**
 * retrieveOptions에서 decodeLevel 추출
 */
function getDecodeLevelFromOptions(options: ImageLoaderOptions): number | undefined {
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
    const metadata = imageRetrieveMetadataProvider.get(metadataType) as RetrieveMetadata | undefined;
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
 * HTJ2K decodeLevel과 Range Request를 강제로 적용하는 커스텀 wadors 로더
 *
 * @description
 * 원본 wadors 로더를 래핑하여 HTJ2K Progressive Decoding 및
 * HTTP Range Request 기능을 추가합니다.
 *
 * @param imageId - DICOM 이미지 ID (wadors:// 스킴)
 * @param options - 이미지 로더 옵션
 * @returns 이미지 로드 객체 (promise, cancelFn 등)
 */
function customWadorsLoader(
  imageId: string,
  options: ImageLoaderOptions = {}
): Types.IImageLoadObject {
  htj2kLog('customWadorsLoader', 'called', { imageId: imageId.substring(0, 50) });

  // 원본 로더가 초기화되지 않은 경우 직접 호출
  const loader = originalWadorsLoader || dicomImageLoader.wadors.loadImage;

  // HTJ2K 비활성화 시 원본 로더를 수정 없이 호출
  if (!isHTJ2KEnabled()) {
    htj2kLog('customWadorsLoader', 'HTJ2K disabled, using original loader');
    return loader(imageId, options);
  }

  // 설정에서 decodeLevel 가져오기
  let forcedDecodeLevel = getDecodeLevelFromOptions(options);

  // HTJ2K가 활성화되어 있고 decodeLevel이 지정되지 않았으면 설정에서 가져오기
  if (forcedDecodeLevel === undefined) {
    // volume vs stack 구분: retrieveType이 'default'이면 volume으로 간주
    const isVolume = options?.retrieveType === 'default';
    forcedDecodeLevel = getDecodeLevel(isVolume ? 'volume' : 'stack');
  }

  // decodeLevel을 options에 주입
  let modifiedOptions: any = {
    ...options,
    decodeLevel: forcedDecodeLevel,
  };

  // Range Request 활성화 시 retrieveOptions에 rangeIndex와 chunkSize 추가
  // getPixelData.js에서 rangeIndex !== undefined이면 rangeRequest.js를 사용함
  const rangeEnabled = isRangeRequestEnabled();
  if (rangeEnabled && forcedDecodeLevel !== undefined && forcedDecodeLevel > 0) {
    const currentRetrieveOptions = modifiedOptions.retrieveOptions || {};
    const rangeEnabledOptions = addRangeRequestToRetrieveOptions(currentRetrieveOptions, forcedDecodeLevel);

    // streamingData에도 chunkSize 설정 (rangeRequest.js가 여기서 먼저 확인함)
    const streamingData = modifiedOptions.streamingData || {};
    streamingData.chunkSize = rangeEnabledOptions.chunkSize;

    modifiedOptions = {
      ...modifiedOptions,
      retrieveOptions: {
        ...rangeEnabledOptions,
        // 부분 데이터 로드 시 SUBRESOLUTION으로 설정하여 적절한 decodeLevel 사용
        // FULL_RESOLUTION이면 decodeLevel=0이 되어 부분 데이터로 디코딩 실패함
        imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
      },
      streamingData: streamingData,
      // singlepart 요청을 위한 mediaType 설정 (Range Request는 multipart에서 동작하지 않음)
      mediaType: 'application/octet-stream',
    };

    htj2kLog('customWadorsLoader', 'Range Request enabled', {
      decodeLevel: forcedDecodeLevel,
      rangeIndex: rangeEnabledOptions.rangeIndex,
      chunkSize: rangeEnabledOptions.chunkSize,
      mediaType: 'application/octet-stream',
      imageQualityStatus: 'SUBRESOLUTION',
    });
  }

  htj2kLog('customWadorsLoader', 'calling originalWadorsLoader', {
    retrieveOptions: modifiedOptions.retrieveOptions,
    mediaType: modifiedOptions.mediaType,
  });

  // 원본 로더 호출
  const imageLoadObject = loader(imageId, modifiedOptions);

  // 반환된 promise를 래핑하여 이미지 수정
  const wrappedPromise = imageLoadObject.promise.then((image: any) => {
    if (!image) {
      return image;
    }

    /**
     * HTJ2K Progressive Decoding 품질 상태 설정
     *
     * Volume: FULL_RESOLUTION - Level 2에서 완료 (더 이상 로딩하지 않음)
     * Stack: SUBRESOLUTION - 추후 Full Resolution(Level 0)으로 업그레이드 가능
     *
     * @see htj2kConfig.ts - stackFullResolutionOnScroll 설정
     */
    if (forcedDecodeLevel !== undefined && forcedDecodeLevel > 0) {
      // retrieveType이 'default'이면 Volume, 그 외는 Stack
      const isVolume = options?.retrieveType === 'default';

      if (isVolume) {
        // Volume은 Level 2로 완료 처리 - 메모리 효율을 위해 더 높은 해상도 로드 안 함
        image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
        image.decodeLevel = forcedDecodeLevel;
        htj2kLog('customWadorsLoader', 'Volume: FULL_RESOLUTION (Level 2 final)', {
          imageId: imageId.substring(0, 50),
          decodeLevel: forcedDecodeLevel,
        });
      } else {
        // Stack은 나중에 Full Resolution(Level 0)으로 업그레이드 가능
        image.imageQualityStatus = ImageQualityStatus.SUBRESOLUTION;
        image.decodeLevel = forcedDecodeLevel;
        htj2kLog('customWadorsLoader', 'Stack: SUBRESOLUTION (upgradeable)', {
          imageId: imageId.substring(0, 50),
          decodeLevel: forcedDecodeLevel,
        });
      }
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
 * @description
 * 기존 wadors 로더를 커스텀 로더로 교체하여 HTJ2K Range Request 기능을 활성화합니다.
 * dicomImageLoader.init() 후에 호출해야 합니다.
 *
 * 원본 로더는 init 시점에 저장하여 OHIF 초기화 완료 후 올바른 참조를 보장합니다.
 */
export function initCustomWadorsLoader(): void {
  // 원본 wadors 로더 저장 (OHIF 초기화 완료 후)
  originalWadorsLoader = dicomImageLoader.wadors.loadImage;
  console.log('[CustomWadors] Original wadors loader saved:', !!originalWadorsLoader);

  // 커스텀 wadors 로더를 등록하여 기존 로더 덮어쓰기
  imageLoader.registerImageLoader('wadors', customWadorsLoader);
  console.log('[CustomWadors] Custom wadors loader registered successfully');
}

/**
 * 강제 decodeLevel 설정 변경 (런타임에서 호출 가능)
 * @deprecated htj2kConfig의 updateHTJ2KConfig를 사용하세요
 */
export function setForceDecodeLevel(_level: number): void {
  // Deprecated - use updateHTJ2KConfig from htj2kConfig instead
}

export default customWadorsLoader;
