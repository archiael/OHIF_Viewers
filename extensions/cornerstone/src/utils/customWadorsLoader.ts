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
import {
  isHTJ2KEnabled,
  getDecodeLevel,
  isServerApiEnabled,
  appendLevelParamToImageId,
  getServerApiConfig,
  detectServerApiSupportFromXHR,
  detectFallbackFromXHR,
} from './htj2kConfig';
import { addRangeRequestToRetrieveOptions, isRangeRequestEnabled } from './htj2kRangeRequest';
import { htj2kLog } from './htj2kDebugLogger';
import {
  cacheHTJ2KData,
  getCachedHTJ2KData,
  cacheLevelData,
  cacheFullDataAsFallback,
  isServerApiDataReady,
  getFullResolutionData,
  cleanupCacheForVolumeLoading,
} from './htj2kBackgroundLoader';

// HTJ2K Transfer Syntax UID (기본값)
const DEFAULT_HTJ2K_TRANSFER_SYNTAX = '1.2.840.10008.1.2.4.201';

const { imageRetrieveMetadataProvider } = utilities;
const { ImageQualityStatus } = Enums;

/**
 * Multipart 응답에서 pixelData 추출
 *
 * @description
 * dicomImageLoader.wadors.extractMultipart가 export되지 않으므로
 * 간단한 버전을 직접 구현합니다.
 *
 * @param data - multipart 응답 데이터
 * @returns 추출된 pixelData
 */
function extractPixelDataFromMultipart(data: Uint8Array): Uint8Array {
  // \r\n\r\n 찾기 (헤더 끝)
  let headerEnd = -1;
  for (let i = 0; i < data.length - 3; i++) {
    if (data[i] === 0x0D && data[i + 1] === 0x0A &&
        data[i + 2] === 0x0D && data[i + 3] === 0x0A) {
      headerEnd = i;
      break;
    }
  }

  if (headerEnd === -1) {
    // 헤더를 찾지 못하면 원본 반환
    return data;
  }

  // 데이터 시작 (헤더 + \r\n\r\n 뒤)
  const dataStart = headerEnd + 4;

  // boundary 찾기 (--로 시작하는 라인)
  // 헤더에서 boundary 추출
  const header = String.fromCharCode.apply(null, Array.from(data.slice(0, headerEnd)));
  const boundaryMatch = header.match(/^--[^\r\n]+/m);

  if (!boundaryMatch) {
    // boundary를 찾지 못하면 나머지 전체 반환
    return data.slice(dataStart);
  }

  const boundary = boundaryMatch[0];

  // 끝 boundary 찾기
  let dataEnd = data.length;
  const boundaryBytes = new TextEncoder().encode(boundary);

  for (let i = dataStart; i < data.length - boundaryBytes.length; i++) {
    let match = true;
    for (let j = 0; j < boundaryBytes.length; j++) {
      if (data[i + j] !== boundaryBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      dataEnd = i - 2; // \r\n 제외
      break;
    }
  }

  return data.slice(dataStart, dataEnd);
}

/**
 * 캐시된 HTJ2K 데이터로 이미지 생성
 *
 * @description
 * Volume 로딩 시 캐시된 HTJ2K 데이터를 사용하여 Stack 로딩 시
 * 네트워크 요청 없이 이미지를 생성합니다.
 *
 * @param imageId - 이미지 ID
 * @param cachedData - 캐시된 HTJ2K ArrayBuffer (multipart 또는 raw)
 * @param options - 이미지 로더 옵션
 * @returns 이미지 로드 객체
 */
function createImageFromCache(
  imageId: string,
  cachedData: ArrayBuffer,
  options: ImageLoaderOptions
): Types.IImageLoadObject {
  htj2kLog('customWadorsLoader', '🚀 Loading from HTJ2K cache', {
    imageId: imageId.substring(0, 50),
    cacheSize: cachedData.byteLength,
  });

  const decodeLevel = options.decodeLevel ?? 0;

  // 캐시된 데이터에서 pixelData 추출
  // multipart 응답인 경우 extractMultipart 필요, 아닌 경우 그대로 사용
  const rawData = new Uint8Array(cachedData);

  // multipart/related 체크: 첫 바이트가 '-'(boundary 시작)인지 확인
  // 또는 HTJ2K signature (0xFF, 0x4F, 0xFF, 0x51) 체크
  let pixelData: Uint8Array;
  const isHTJ2KSignature = rawData[0] === 0xFF && rawData[1] === 0x4F;
  const isMultipart = rawData[0] === 0x2D && rawData[1] === 0x2D; // "--"

  if (isHTJ2KSignature) {
    // 이미 HTJ2K 데이터 (extractMultipart 불필요)
    pixelData = rawData;
    htj2kLog('customWadorsLoader', 'Cache data is raw HTJ2K');
  } else if (isMultipart) {
    // multipart 응답 - extractPixelDataFromMultipart 사용
    try {
      pixelData = extractPixelDataFromMultipart(rawData);
      htj2kLog('customWadorsLoader', 'Extracted from multipart cache', {
        originalSize: rawData.length,
        extractedSize: pixelData.length,
      });
    } catch (e) {
      console.warn('[CustomWadors] extractMultipart failed, using raw data:', e);
      pixelData = rawData;
    }
  } else {
    // 기타 형식 - 그대로 사용
    pixelData = rawData;
  }

  // 이미지 생성 Promise
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imagePromise = (dicomImageLoader.createImage as any)(
    imageId,
    pixelData,
    DEFAULT_HTJ2K_TRANSFER_SYNTAX,
    {
      ...options,
      decodeLevel,
    }
  ).then((image: any) => {
    // Stack 로딩 (캐시에서 Level 0 디코딩)
    image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
    image.decodeLevel = decodeLevel;
    image.fromCache = true; // 캐시에서 로드됨을 표시

    htj2kLog('customWadorsLoader', '✅ Image created from cache', {
      imageId: imageId.substring(0, 50),
      decodeLevel,
      dimensions: `${image.width}x${image.height}`,
    });

    return image;
  });

  return {
    promise: imagePromise,
    cancelFn: undefined,
    decache: undefined,
  };
}

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
  const hasTargetBuffer = !!options?.targetBuffer;
  const metadataType = hasTargetBuffer ? 'volume' : 'stack';

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
  // Volume 로딩 판단: targetBuffer가 있으면 Volume
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
    // Silent error handling
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

  // ==========================================================================
  // HTJ2K 캐시 확인: Stack 로딩 시 Volume 로딩에서 캐시된 데이터 재사용
  // ==========================================================================
  // Volume 로딩 판단: targetBuffer가 있으면 Volume (retrieveType은 항상 'single')
  const hasTargetBuffer = !!options?.targetBuffer;

  // ==========================================================================
  // Volume 로딩 시작 전 캐시 정리 (메모리 최적화)
  // ==========================================================================
  // WASM 디코더 힙 메모리 부족 방지: 캐시 사용량 50% 초과 시 30%로 정리
  if (hasTargetBuffer) {
    cleanupCacheForVolumeLoading(50, 30);
  }

  // Stack 로딩 시에만 캐시 확인 (Volume은 항상 다운로드)
  if (!hasTargetBuffer) {
    // =========================================================================
    // 캐시 조회를 위한 원본 imageId 추출
    // ?stackView=xxx, ?level=N 등의 파라미터 제거
    // =========================================================================
    const cacheKeyImageId = extractCacheKeyFromImageId(imageId);

    htj2kLog('customWadorsLoader', '🔍 Stack cache lookup', {
      originalImageId: imageId.substring(0, 60),
      cacheKeyImageId: cacheKeyImageId.substring(0, 60),
    });

    // =========================================================================
    // Phase 6: Server API Full Resolution 데이터 우선 확인
    // =========================================================================
    // 1순위: Server API로 병합된 Full Resolution 데이터 확인
    // Volume 로딩 시 ?level=2로 받고, Background에서 ?complement=2로 받아 병합한 데이터
    if (isServerApiEnabled() && isServerApiDataReady(cacheKeyImageId)) {
      const fullData = getFullResolutionData(cacheKeyImageId);
      if (fullData) {
        htj2kLog('customWadorsLoader', '🚀 Server API Full Resolution cache hit!', {
          imageId: imageId.substring(0, 50),
          cacheKeyImageId: cacheKeyImageId.substring(0, 50),
          cachedSize: fullData.byteLength,
          source: 'Server API merged (level + complement)',
        });

        // 병합된 Full Resolution 데이터로 이미지 생성 (네트워크 요청 없음)
        return createImageFromCache(imageId, fullData, {
          ...options,
          decodeLevel: 0, // Full Resolution
        });
      }
    }

    // =========================================================================
    // 2순위: 기존 HTJ2K 캐시 확인 (전체 다운로드 또는 Range Request 데이터)
    // =========================================================================
    const cachedData = getCachedHTJ2KData(cacheKeyImageId);
    if (cachedData) {
      htj2kLog('customWadorsLoader', '📦 HTJ2K cache hit!', {
        imageId: imageId.substring(0, 50),
        cacheKeyImageId: cacheKeyImageId.substring(0, 50),
        cachedSize: cachedData.byteLength,
      });

      // 캐시된 데이터로 Level 0 이미지 생성 (네트워크 요청 없음)
      return createImageFromCache(imageId, cachedData, {
        ...options,
        decodeLevel: 0, // Stack은 항상 Full Resolution
      });
    }
  }

  // ==========================================================================
  // Server API: Volume 요청 시 ?level=N 파라미터 추가
  // ==========================================================================
  // 원본 imageId 저장 (캐시 키로 사용)
  const originalImageId = imageId;
  let modifiedImageId = imageId;
  let serverApiLevel: number | undefined;

  if (hasTargetBuffer && isServerApiEnabled()) {
    const serverApiConfig = getServerApiConfig();
    serverApiLevel = serverApiConfig.volumeLevel;

    // imageId에 ?level=N 파라미터 추가
    modifiedImageId = appendLevelParamToImageId(imageId, serverApiLevel);

    htj2kLog('customWadorsLoader', '🔗 Server API: Adding level parameter', {
      originalImageId: imageId.substring(0, 50),
      modifiedImageId: modifiedImageId.substring(0, 50),
      level: serverApiLevel,
    });
  }

  // 설정에서 decodeLevel 가져오기
  let forcedDecodeLevel = getDecodeLevelFromOptions(options);

  // HTJ2K가 활성화되어 있고 decodeLevel이 지정되지 않았으면 설정에서 가져오기
  if (forcedDecodeLevel === undefined) {
    forcedDecodeLevel = getDecodeLevel(hasTargetBuffer ? 'volume' : 'stack');
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
    imageId: modifiedImageId.substring(0, 80),
    retrieveOptions: modifiedOptions.retrieveOptions,
    mediaType: modifiedOptions.mediaType,
    serverApiEnabled: serverApiLevel !== undefined,
  });

  // 원본 로더 호출 (Server API 활성화 시 modifiedImageId 사용)
  const imageLoadObject = loader(modifiedImageId, modifiedOptions);

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
      if (hasTargetBuffer) {
        // Volume은 Level 2로 완료 처리 - 메모리 효율을 위해 더 높은 해상도 로드 안 함
        image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
        image.decodeLevel = forcedDecodeLevel;

        // Server API 사용 시 추가 메타데이터 설정
        if (serverApiLevel !== undefined) {
          image.serverApiLevel = serverApiLevel;
          image.originalImageId = originalImageId; // 원본 imageId 저장 (캐시 키)
          htj2kLog('customWadorsLoader', 'Volume: Server API Level data loaded', {
            originalImageId: originalImageId.substring(0, 50),
            serverApiLevel,
            decodeLevel: forcedDecodeLevel,
          });
        } else {
          htj2kLog('customWadorsLoader', 'Volume: FULL_RESOLUTION (Level 2 final)', {
            imageId: originalImageId.substring(0, 50),
            decodeLevel: forcedDecodeLevel,
          });
        }
      } else {
        // Stack은 나중에 Full Resolution(Level 0)으로 업그레이드 가능
        image.imageQualityStatus = ImageQualityStatus.SUBRESOLUTION;
        image.decodeLevel = forcedDecodeLevel;
        htj2kLog('customWadorsLoader', 'Stack: SUBRESOLUTION (upgradeable)', {
          imageId: originalImageId.substring(0, 50),
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

/** beforeProcessing 훅 설치 여부 */
let beforeProcessingHookInstalled = false;

/**
 * imageId에서 캐시 조회용 키 추출
 *
 * @description
 * imageId에서 ?stackView=xxx, ?level=N 등의 파라미터를 제거하여
 * 캐시 조회에 사용할 원본 imageId를 반환합니다.
 *
 * Stack View 전환 시 imageId에 ?stackView=xxx가 추가되는데,
 * 캐시는 원본 imageId로 저장되므로 이 파라미터를 제거해야 합니다.
 *
 * @param imageId - 파라미터가 포함될 수 있는 imageId
 * @returns 캐시 조회용 원본 imageId
 *
 * @example
 * ```typescript
 * extractCacheKeyFromImageId('wadors:http://server/frames/1?stackView=22')
 * // => 'wadors:http://server/frames/1'
 *
 * extractCacheKeyFromImageId('wadors:http://server/frames/1?level=2')
 * // => 'wadors:http://server/frames/1'
 * ```
 */
function extractCacheKeyFromImageId(imageId: string): string {
  const serverApiConfig = getServerApiConfig();
  const levelParam = serverApiConfig.levelParam;

  // wadors: prefix 분리
  let prefix = '';
  let url = imageId;
  if (imageId.startsWith('wadors:')) {
    prefix = 'wadors:';
    url = imageId.substring(7);
  }

  try {
    const urlObj = new URL(url);

    // level 파라미터 제거
    urlObj.searchParams.delete(levelParam);

    // stackView 파라미터 제거
    urlObj.searchParams.delete('stackView');

    // 쿼리 파라미터가 없으면 ? 제거
    let result = urlObj.toString();
    if (result.endsWith('?')) {
      result = result.slice(0, -1);
    }

    return prefix + result;
  } catch {
    // URL 파싱 실패 시 정규식으로 처리
    const cleanedUrl = url
      .replace(new RegExp(`[?&]${levelParam}=\\d+`), '')
      .replace(/[?&]stackView=\d+/, '')
      .replace(/\?$/, '');
    return prefix + cleanedUrl;
  }
}

/**
 * URL에서 level 파라미터 제거하여 원본 URL 추출
 *
 * @description
 * Server API 요청 URL에서 ?level=N 또는 &level=N 파라미터를 제거합니다.
 *
 * @param url - level 파라미터가 포함된 URL
 * @returns level 파라미터가 제거된 원본 URL
 *
 * @example
 * ```typescript
 * extractOriginalUrl('https://server/frames/1?level=2')
 * // => 'https://server/frames/1'
 *
 * extractOriginalUrl('https://server/frames/1?existing=param&level=2')
 * // => 'https://server/frames/1?existing=param'
 * ```
 */
function extractOriginalUrl(url: string): string {
  const serverApiConfig = getServerApiConfig();
  const levelParam = serverApiConfig.levelParam;

  // URL 파싱
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete(levelParam);

    // 쿼리 파라미터가 없으면 ? 제거
    const result = urlObj.toString();
    return result.endsWith('?') ? result.slice(0, -1) : result;
  } catch {
    // URL 파싱 실패 시 정규식으로 처리
    return url
      .replace(new RegExp(`[?&]${levelParam}=\\d+`), '')
      .replace(/\?$/, '');
  }
}

/**
 * URL에서 level 파라미터 값 추출
 *
 * @param url - 검사할 URL
 * @returns level 값 또는 undefined (파라미터 없는 경우)
 */
function extractLevelFromUrl(url: string): number | undefined {
  const serverApiConfig = getServerApiConfig();
  const levelParam = serverApiConfig.levelParam;

  try {
    const urlObj = new URL(url);
    const levelValue = urlObj.searchParams.get(levelParam);
    return levelValue !== null ? parseInt(levelValue, 10) : undefined;
  } catch {
    // URL 파싱 실패 시 정규식으로 처리
    const match = url.match(new RegExp(`[?&]${levelParam}=(\\d+)`));
    return match ? parseInt(match[1], 10) : undefined;
  }
}

/**
 * beforeProcessing 훅 설치 - 다운로드된 HTJ2K 데이터를 캐싱
 *
 * @description
 * xhrRequest가 완료된 후 호출되어 응답 데이터를 HTJ2K 캐시에 저장합니다.
 * 이후 동일 이미지 요청 시 캐시에서 데이터를 가져와 재다운로드를 방지합니다.
 *
 * Server API 지원 감지:
 * - X-HTJ2K-Level 응답 헤더가 있으면 서버 API 지원으로 판단
 * - level 파라미터가 있는 요청은 Level 데이터로 별도 캐싱 (complement 병합용)
 */
function installBeforeProcessingHook(): void {
  if (beforeProcessingHookInstalled) {
    return;
  }

  const internal = dicomImageLoader.internal;
  if (!internal?.setOptions) {
    console.warn('[CustomWadors] dicomImageLoader.internal.setOptions not available');
    return;
  }

  // 기존 beforeProcessing 함수 저장
  const currentOptions = internal.getOptions?.() || {};
  const originalBeforeProcessing = currentOptions.beforeProcessing;

  internal.setOptions({
    beforeProcessing: (xhr: XMLHttpRequest) => {
      // 원본 beforeProcessing 호출 (xhr.response 반환)
      const responsePromise = originalBeforeProcessing
        ? originalBeforeProcessing(xhr)
        : Promise.resolve(xhr.response);

      return responsePromise.then((response: ArrayBuffer) => {
        // 성공적인 응답만 캐싱 (200 또는 206)
        if (xhr.status === 200 || xhr.status === 206) {
          const url = xhr.responseURL || '';

          // =================================================================
          // Server API 지원 감지 (X-HTJ2K-Level 헤더 확인)
          // autoDetect가 활성화된 경우에만 헤더 체크 (CORS 문제 방지)
          // =================================================================
          if (getServerApiConfig().autoDetect) {
            detectServerApiSupportFromXHR(xhr);
          }

          // =================================================================
          // Level 파라미터가 있는 요청인지 확인
          // =================================================================
          const levelValue = extractLevelFromUrl(url);

          if (levelValue !== undefined) {
            // Server API Level 요청
            const originalUrl = extractOriginalUrl(url);
            const originalImageId = `wadors:${originalUrl}`;

            // =============================================================
            // Fallback 감지: 서버가 전체 HTJ2K를 반환했는지 확인
            // =============================================================
            // 3단계 우선순위:
            // 1. X-HTJ2K-Fallback 헤더 (명시적)
            // 2. X-HTJ2K-Original-Size vs Content-Length 비교
            // 3. null (판단 불가 - 표준 DICOMweb 서버)
            const fallbackResult = detectFallbackFromXHR(xhr);

            if (fallbackResult === true) {
              // =========================================================
              // 명시적 Fallback: 전체 HTJ2K를 fullData로 캐싱
              // =========================================================
              // 서버가 PLT 없어서 전체 HTJ2K를 반환한 경우
              // complement 요청 불필요
              htj2kLog('customWadorsLoader', '⚠️ Server API Fallback detected (header)', {
                originalImageId: originalImageId.substring(0, 50),
                level: levelValue,
                size: response.byteLength,
              });
              cacheFullDataAsFallback(originalImageId, response);
            } else if (fallbackResult === false) {
              // =========================================================
              // 명시적 정상: Level 데이터로 캐싱
              // =========================================================
              // 서버가 정상적으로 Level 데이터만 반환한 경우
              // 나중에 complement와 병합
              htj2kLog('customWadorsLoader', '📦 Server API: Level data cached (confirmed)', {
                originalImageId: originalImageId.substring(0, 50),
                level: levelValue,
                size: response.byteLength,
              });
              cacheLevelData(originalImageId, response, levelValue);
            } else {
              // =========================================================
              // fallbackResult === null: 표준 DICOMweb 서버
              // =========================================================
              // 커스텀 헤더가 없으므로 일단 Level 데이터로 캐싱
              // Background loader에서 크기 비교로 Fallback 감지
              htj2kLog('customWadorsLoader', '📦 Server API: Level data cached (standard DICOMweb)', {
                originalImageId: originalImageId.substring(0, 50),
                level: levelValue,
                size: response.byteLength,
              });
              cacheLevelData(originalImageId, response, levelValue);
            }
          } else {
            // 일반 요청 - 전체 HTJ2K 데이터 캐싱
            const imageId = `wadors:${url}`;
            cacheHTJ2KData(url, imageId, response);
          }
        }

        return response;
      });
    },
  });

  beforeProcessingHookInstalled = true;
  console.log('[CustomWadors] beforeProcessing hook installed for HTJ2K caching (with Server API support)');
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

  // beforeProcessing 훅 설치 (HTJ2K 데이터 캐싱용)
  installBeforeProcessingHook();

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
