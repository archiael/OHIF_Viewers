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
 * Fetch API 래핑 - Range Request 시 Accept 헤더 강제 변경
 *
 * rangeRequest.js는 fetch()를 사용하므로, fetch를 래핑해서
 * Range 헤더가 있고 Accept가 multipart인 경우 application/octet-stream으로 변경
 */
let fetchWrapped = false;

function wrapFetchForRangeRequest(): void {
  if (fetchWrapped) return;
  fetchWrapped = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      // Range 헤더가 있는 요청인지 확인
      const headers = init?.headers;
      let hasRangeHeader = false;
      let acceptValue: string | null = null;

      if (headers) {
        if (headers instanceof Headers) {
          hasRangeHeader = headers.has('Range');
          acceptValue = headers.get('Accept');
        } else if (Array.isArray(headers)) {
          for (const [key, value] of headers) {
            if (key.toLowerCase() === 'range') hasRangeHeader = true;
            if (key.toLowerCase() === 'accept') acceptValue = value;
          }
        } else {
          // Record<string, string>
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'range') hasRangeHeader = true;
            if (key.toLowerCase() === 'accept') acceptValue = (headers as Record<string, string>)[key];
          }
        }
      }

      // Range Request이면서 Accept가 multipart인 경우 수정
      if (hasRangeHeader && acceptValue && acceptValue.includes('multipart')) {
        console.log('[FetchWrapper] Range Request detected, changing Accept header');
        console.log('[FetchWrapper] URL:', typeof input === 'string' ? input.substring(0, 100) : 'Request object');

        // headers를 plain object로 변환
        const newHeaders: Record<string, string> = {};

        if (headers instanceof Headers) {
          headers.forEach((value, key) => {
            newHeaders[key] = key.toLowerCase() === 'accept' ? 'application/octet-stream' : value;
          });
        } else if (Array.isArray(headers)) {
          for (const [key, value] of headers) {
            newHeaders[key] = key.toLowerCase() === 'accept' ? 'application/octet-stream' : value;
          }
        } else if (headers) {
          for (const key of Object.keys(headers)) {
            newHeaders[key] =
              key.toLowerCase() === 'accept'
                ? 'application/octet-stream'
                : (headers as Record<string, string>)[key];
          }
        }

        console.log('[FetchWrapper] Modified headers:', newHeaders);
        return originalFetch(input, { ...init, headers: newHeaders });
      }

      return originalFetch(input, init);
    } catch (error) {
      console.error('[FetchWrapper] Error in fetch wrapper:', error);
      // 에러 발생 시 원본 fetch 호출
      return originalFetch(input, init);
    }
  };

  console.log('[FetchWrapper] fetch() wrapped for Range Request Accept header fix');
}

/**
 * Original wadors loader reference
 * @cornerstonejs/dicom-image-loader에서 직접 가져온 원본 loadImage 함수
 */
const originalWadorsLoader: Types.ImageLoaderFn = dicomImageLoader.wadors.loadImage;

// Debug: originalWadorsLoader 함수 내용 확인
console.log('[CustomWadors] originalWadorsLoader:', originalWadorsLoader.toString().substring(0, 500));
console.log('[CustomWadors] dicomImageLoader.wadors keys:', Object.keys(dicomImageLoader.wadors));
console.log('[CustomWadors] dicomImageLoader.wadors.loadImage === originalWadorsLoader:', dicomImageLoader.wadors.loadImage === originalWadorsLoader);

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
  options: Types.ImageLoaderOptions = {}
): Types.IImageLoadObject {
  htj2kLog('customWadorsLoader', 'called', { imageId: imageId.substring(0, 50) });

  // 설정에서 decodeLevel 가져오기
  let forcedDecodeLevel = getDecodeLevelFromOptions(options);

  // HTJ2K가 활성화되어 있고 decodeLevel이 지정되지 않았으면 설정에서 가져오기
  if (isHTJ2KEnabled() && forcedDecodeLevel === undefined) {
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
      retrieveOptions: rangeEnabledOptions,
      streamingData: streamingData,
      // singlepart 요청을 위한 mediaType 설정 (Range Request는 multipart에서 동작하지 않음)
      mediaType: 'application/octet-stream',
    };

    htj2kLog('customWadorsLoader', 'Range Request enabled', {
      decodeLevel: forcedDecodeLevel,
      rangeIndex: rangeEnabledOptions.rangeIndex,
      chunkSize: rangeEnabledOptions.chunkSize,
      mediaType: 'application/octet-stream',
    });
  }

  htj2kLog('customWadorsLoader', 'calling originalWadorsLoader', {
    retrieveOptions: modifiedOptions.retrieveOptions,
    mediaType: modifiedOptions.mediaType,
  });

  // 원본 로더 호출 직전 로그
  console.log('[CustomWadors] BEFORE originalWadorsLoader call - imageId:', imageId.substring(0, 50));
  console.log('[CustomWadors] modifiedOptions:', JSON.stringify({
    mediaType: modifiedOptions.mediaType,
    retrieveOptions: modifiedOptions.retrieveOptions,
    decodeLevel: modifiedOptions.decodeLevel,
  }, null, 2));

  // 원본 로더 호출
  const imageLoadObject = originalWadorsLoader(imageId, modifiedOptions);

  // 원본 로더 호출 직후 로그
  console.log('[CustomWadors] AFTER originalWadorsLoader call - imageLoadObject:', !!imageLoadObject);

  // 반환된 promise를 래핑하여 이미지 수정
  const wrappedPromise = imageLoadObject.promise.then((image: any) => {
    if (!image) {
      return image;
    }

    // HTJ2K의 경우, 이미 decode된 이미지의 품질 상태를 FULL_RESOLUTION으로 표시
    // 이렇게 하면 progressive loading이 더 이상 진행하지 않음
    if (forcedDecodeLevel !== undefined && forcedDecodeLevel > 0) {
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
 * @description
 * 기존 wadors 로더를 커스텀 로더로 교체하여 HTJ2K Range Request 기능을 활성화합니다.
 * dicomImageLoader.init() 후에 호출해야 합니다.
 *
 * 원본 로더는 @cornerstonejs/dicom-image-loader에서 직접 import하므로
 * 내부 API 접근이 필요 없습니다.
 */
export function initCustomWadorsLoader(): void {
  // fetch API 래핑 - Range Request 시 Accept 헤더 강제 변경
  // DCM4CHEE 서버에서 CORS 설정이 필요함
  wrapFetchForRangeRequest();

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
