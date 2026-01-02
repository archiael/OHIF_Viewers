/**
 * HTJ2K Background Progressive Loader
 *
 * @description
 * Volume 로딩 완료 후 Background에서 나머지 HTJ2K 데이터를 로드합니다.
 * Stack 스크롤 시 Level 0 디코딩에 사용됩니다.
 *
 * ## 네트워크 흐름 (Range Request 방식)
 * 1차 요청 (Foreground): bytes=0-99999 → Level 2 디코딩 → Volume 표시
 * 2차 요청 (Background): bytes=100000-끝 → HTJ2K 캐시 보관
 * 스크롤 시: 캐시된 전체 데이터로 Level 0 디코딩
 *
 * ## 네트워크 흐름 (Server API 방식) - 추가
 * 1차 요청 (Foreground): ?level=2 → Level 2 완전한 HTJ2K → Volume 표시
 * 2차 요청 (Background): ?complement=2 → Level 2 이후 데이터 → 병합하여 캐시
 * 스크롤 시: 병합된 전체 데이터로 Level 0 디코딩
 *
 * @see document/TASK-72-LEVEL2-MPR-VOLUME.md - Phase 5 설계
 * @see document/PROMPT-SERVER-HTJ2K-API.md - Server API 스펙
 */

import { htj2kLog } from './htj2kDebugLogger';
import { getRangeRequestConfig, DEFAULT_RANGE_CONFIG } from './htj2kRangeRequestCore';
import {
  isServerApiEnabled,
  getServerApiConfig,
  appendComplementParam,
  getHTJ2KConfig,
} from './htj2kConfig';
import {
  mergeHTJ2KData,
  safeMergeHTJ2KData,
  formatDataSize,
} from './htj2kDataMerger';

/**
 * DICOMweb 데이터소스 설정에서 인증 정보 추출
 *
 * @description
 * window.config.dataSources에서 DICOMweb 데이터소스의 인증 정보를 가져옵니다.
 * requestOptions.auth 형식: 'username:password' → Base64 인코딩 후 Authorization 헤더로 사용
 *
 * @returns Authorization 헤더 값 (Basic base64) 또는 null
 */
function getAuthorizationHeader(): string | null {
  try {
    const config = (window as any).config;
    if (!config?.dataSources) {
      return null;
    }

    // DICOMweb 데이터소스 찾기
    const dicomwebSource = config.dataSources.find(
      (ds: any) =>
        ds.namespace?.includes('dicomweb') ||
        ds.sourceName === 'dicomweb'
    );

    if (!dicomwebSource?.configuration?.requestOptions?.auth) {
      return null;
    }

    // 'username:password' 형식을 Base64 인코딩
    const auth = dicomwebSource.configuration.requestOptions.auth;
    const base64Auth = btoa(auth);
    return `Basic ${base64Auth}`;
  } catch (e) {
    console.warn('[HTJ2K-BG] Failed to get authorization header:', e);
    return null;
  }
}

/**
 * HTJ2K 데이터 캐시 항목 인터페이스
 *
 * @description
 * Range Request 방식과 Server API 방식을 모두 지원합니다.
 *
 * ## Range Request 방식
 * - partialData: 1차 요청 (bytes=0-N) 데이터
 * - fullData: partialData + 2차 요청 데이터 병합
 *
 * ## Server API 방식
 * - levelData: 1차 요청 (?level=N) 완전한 HTJ2K
 * - levelValue: 요청한 Level 값 (예: 2)
 * - complementData: 2차 요청 (?complement=N) 데이터
 * - fullData: levelData + complementData 병합 결과
 */
interface HTJ2KCacheEntry {
  /** 부분 데이터 (Range Request: bytes=0-N 데이터) */
  partialData: ArrayBuffer | null;
  /** 전체 데이터 (Background 로드 완료 후) */
  fullData: ArrayBuffer | null;
  /** 로딩 상태 */
  status: 'none' | 'partial' | 'loading' | 'complete' | 'error';
  /** 파일 전체 크기 (Content-Range 또는 X-HTJ2K-Original-Size에서 추출) */
  totalBytes: number | null;
  /** 마지막 업데이트 시간 */
  lastUpdated: number;

  // ==========================================================================
  // Server API 전용 필드
  // ==========================================================================

  /** Server API Level 데이터 (?level=N 응답, 완전한 HTJ2K) */
  levelData: ArrayBuffer | null;
  /** 요청한 Level 값 (예: 2 = 1/4 해상도) */
  levelValue: number | null;
  /** Complement 데이터 (?complement=N 응답, 헤더/EOC 없는 raw 데이터) */
  complementData: ArrayBuffer | null;
  /** Complement 로딩 상태 */
  complementStatus: 'none' | 'loading' | 'complete' | 'error';
}

/**
 * HTJ2K 데이터 캐시
 */
interface HTJ2KDataCache {
  /** imageId → 캐시 항목 */
  entries: Map<string, HTJ2KCacheEntry>;
  /** 최대 캐시 크기 (바이트) - 기본 200MB */
  maxCacheSize: number;
  /** 현재 캐시 크기 (바이트) */
  currentCacheSize: number;
}

const htj2kCache: HTJ2KDataCache = {
  entries: new Map(),
  maxCacheSize: 200 * 1024 * 1024, // 200MB
  currentCacheSize: 0,
};

/**
 * Background 로딩 진행 콜백 타입
 */
type ProgressCallback = (info: {
  loaded: number;
  total: number;
  percent: number;
  currentImageId: string;
}) => void;

/**
 * Background 로딩 완료 콜백 타입
 */
type CompleteCallback = (info: {
  totalImages: number;
  successCount: number;
  failCount: number;
  totalBytes: number;
}) => void;

/**
 * 부분 데이터 캐시 등록
 *
 * @description
 * 1차 요청(Foreground)에서 받은 Level 2 데이터를 캐시에 등록합니다.
 * Background 로드 시 이 데이터와 병합합니다.
 *
 * @param imageId - 이미지 ID
 * @param partialData - Level 2 로드 시 받은 부분 데이터
 * @param totalBytes - 파일 전체 크기 (Content-Range에서 추출, 선택)
 */
export function registerPartialData(
  imageId: string,
  partialData: ArrayBuffer,
  totalBytes?: number
): void {
  const existingEntry = htj2kCache.entries.get(imageId);

  if (existingEntry?.status === 'complete') {
    // 이미 전체 데이터가 있으면 무시
    return;
  }

  const entry: HTJ2KCacheEntry = {
    partialData,
    fullData: null,
    status: 'partial',
    totalBytes: totalBytes ?? null,
    lastUpdated: Date.now(),
    // Server API 필드 초기화
    levelData: null,
    levelValue: null,
    complementData: null,
    complementStatus: 'none',
  };

  htj2kCache.entries.set(imageId, entry);
  htj2kCache.currentCacheSize += partialData.byteLength;

  htj2kLog('htj2kBackgroundLoader', 'Partial data registered', {
    imageId: imageId.substring(0, 50),
    partialSize: partialData.byteLength,
    totalBytes,
  });
}

/**
 * imageId에서 URL 추출
 *
 * @param imageId - wadors:// 형식의 이미지 ID
 * @returns HTTP URL
 */
function imageIdToUrl(imageId: string): string {
  // wadors:https://server/... → https://server/...
  if (imageId.startsWith('wadors:')) {
    return imageId.substring(7);
  }
  return imageId;
}

/**
 * imageId에서 level 파라미터 제거
 *
 * @description
 * Server API 사용 시 viewport의 imageId에 ?level=N이 포함될 수 있습니다.
 * 캐시 조회 및 complement URL 생성을 위해 level 파라미터를 제거합니다.
 *
 * @param imageId - level 파라미터가 포함될 수 있는 imageId
 * @returns level 파라미터가 제거된 imageId
 *
 * @example
 * ```typescript
 * stripLevelFromImageId('wadors:http://server/frames/1?level=2')
 * // => 'wadors:http://server/frames/1'
 * ```
 */
function stripLevelFromImageId(imageId: string): string {
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
    urlObj.searchParams.delete(levelParam);

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
      .replace(/\?$/, '');
    return prefix + cleanedUrl;
  }
}

/**
 * 두 ArrayBuffer 병합
 *
 * @param first - 첫 번째 버퍼
 * @param second - 두 번째 버퍼
 * @returns 병합된 버퍼
 */
function mergeArrayBuffers(
  first: ArrayBuffer | null,
  second: ArrayBuffer
): ArrayBuffer {
  if (!first) {
    return second;
  }

  const merged = new Uint8Array(first.byteLength + second.byteLength);
  merged.set(new Uint8Array(first), 0);
  merged.set(new Uint8Array(second), first.byteLength);
  return merged.buffer;
}

/**
 * 캐시 크기 관리 - LRU 정책으로 오래된 항목 제거
 *
 * @param requiredBytes - 확보해야 할 바이트 수
 */
function ensureCacheSpace(requiredBytes: number): void {
  if (htj2kCache.currentCacheSize + requiredBytes <= htj2kCache.maxCacheSize) {
    return;
  }

  // LRU: lastUpdated 기준 오래된 항목부터 제거
  const entries = Array.from(htj2kCache.entries.entries()).sort(
    (a, b) => a[1].lastUpdated - b[1].lastUpdated
  );

  for (const [imageId, entry] of entries) {
    if (htj2kCache.currentCacheSize + requiredBytes <= htj2kCache.maxCacheSize) {
      break;
    }

    const entrySize =
      (entry.partialData?.byteLength ?? 0) + (entry.fullData?.byteLength ?? 0);

    htj2kCache.entries.delete(imageId);
    htj2kCache.currentCacheSize -= entrySize;

    htj2kLog('htj2kBackgroundLoader', 'Cache entry evicted (LRU)', {
      imageId: imageId.substring(0, 50),
      freedBytes: entrySize,
    });
  }
}

/**
 * Volume 로딩 시작 전 캐시 정리 (메모리 최적화)
 *
 * @description
 * Volume 로딩이 시작될 때 호출하여 캐시 사용량이 높으면
 * 오래된 캐시를 정리합니다. WASM 디코더의 힙 메모리 부족을 방지합니다.
 *
 * 타이밍: customWadorsLoader에서 hasTargetBuffer가 true일 때 (Volume 로딩)
 *
 * @param thresholdPercent - 캐시 정리 임계값 (0-100), 기본 50%
 * @param targetPercent - 정리 후 목표 사용량 (0-100), 기본 30%
 *
 * @returns 정리된 캐시 크기 (바이트)
 *
 * @example
 * ```typescript
 * // Volume 로딩 시작 시
 * if (hasTargetBuffer) {
 *   cleanupCacheForVolumeLoading(50, 30);  // 50% 이상 사용 시 30%로 정리
 * }
 * ```
 */
export function cleanupCacheForVolumeLoading(
  thresholdPercent: number = 50,
  targetPercent: number = 30
): number {
  const usagePercent = (htj2kCache.currentCacheSize / htj2kCache.maxCacheSize) * 100;

  // 임계값 미만이면 정리 불필요
  if (usagePercent < thresholdPercent) {
    return 0;
  }

  const targetSize = htj2kCache.maxCacheSize * (targetPercent / 100);
  const bytesToFree = htj2kCache.currentCacheSize - targetSize;

  if (bytesToFree <= 0) {
    return 0;
  }

  htj2kLog('htj2kBackgroundLoader', '🧹 Pre-Volume cache cleanup starting', {
    currentUsage: `${usagePercent.toFixed(1)}%`,
    targetUsage: `${targetPercent}%`,
    bytesToFree: formatDataSize(bytesToFree),
  });

  // LRU: lastUpdated 기준 오래된 항목부터 제거
  const entries = Array.from(htj2kCache.entries.entries()).sort(
    (a, b) => a[1].lastUpdated - b[1].lastUpdated
  );

  let freedBytes = 0;
  let removedCount = 0;

  for (const [imageId, entry] of entries) {
    if (freedBytes >= bytesToFree) {
      break;
    }

    const entrySize =
      (entry.partialData?.byteLength ?? 0) +
      (entry.fullData?.byteLength ?? 0) +
      (entry.levelData?.byteLength ?? 0) +
      (entry.complementData?.byteLength ?? 0);

    htj2kCache.entries.delete(imageId);
    htj2kCache.currentCacheSize -= entrySize;
    freedBytes += entrySize;
    removedCount++;
  }

  htj2kLog('htj2kBackgroundLoader', '✅ Pre-Volume cache cleanup complete', {
    removedCount,
    freedBytes: formatDataSize(freedBytes),
    newUsage: `${((htj2kCache.currentCacheSize / htj2kCache.maxCacheSize) * 100).toFixed(1)}%`,
  });

  return freedBytes;
}

/**
 * 단일 이미지의 나머지 데이터 로드
 *
 * @description
 * 1차 요청(Foreground)에서 Level 2용 데이터(~100KB)만 받았으므로,
 * 나머지 데이터(bytes=100000-)를 Background에서 요청합니다.
 *
 * @param imageId - 이미지 ID
 * @returns 성공 여부
 */
async function loadRemainingDataForImage(imageId: string): Promise<boolean> {
  let entry = htj2kCache.entries.get(imageId);

  // 캐시 엔트리가 없으면 새로 생성 (partialData 없이)
  if (!entry) {
    entry = {
      partialData: null,
      fullData: null,
      status: 'none',
      totalBytes: null,
      lastUpdated: Date.now(),
      // Server API 필드 초기화
      levelData: null,
      levelValue: null,
      complementData: null,
      complementStatus: 'none',
    };
    htj2kCache.entries.set(imageId, entry);
  }

  if (entry.status === 'complete') {
    return true;
  }

  if (entry.status === 'loading') {
    // 이미 로딩 중
    return false;
  }

  // 로딩 시작 표시
  entry.status = 'loading';

  // 1차 요청에서 받은 바이트 수 또는 기본값 사용 (Level 2 = 100KB)
  // partialData가 있으면 그 크기 사용, 없으면 Range Request 설정의 Level 2 기본값 사용
  const defaultLevel2Bytes = DEFAULT_RANGE_CONFIG.initialRangeBytes[2]; // 100000
  const startByte = entry.partialData?.byteLength ?? defaultLevel2Bytes;
  const url = imageIdToUrl(imageId);

  try {
    const rangeConfig = getRangeRequestConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), rangeConfig.timeout);

    // 인증 헤더 구성
    const headers: Record<string, string> = {
      Range: `bytes=${startByte}-`,
      Accept: 'application/octet-stream',
    };

    const authHeader = getAuthorizationHeader();
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 206) {
      // 부분 콘텐츠 수신
      const remainingData = await response.arrayBuffer();

      // 전체 크기 추출
      const contentRange = response.headers.get('Content-Range');
      if (contentRange && !entry.totalBytes) {
        const match = contentRange.match(/\/(\d+)/);
        if (match) {
          entry.totalBytes = parseInt(match[1], 10);
        }
      }

      // 캐시 공간 확보
      ensureCacheSpace(remainingData.byteLength);

      // 데이터 병합
      entry.fullData = mergeArrayBuffers(entry.partialData, remainingData);
      entry.status = 'complete';
      entry.lastUpdated = Date.now();

      // 캐시 크기 업데이트 (partialData는 제거)
      htj2kCache.currentCacheSize -= entry.partialData?.byteLength ?? 0;
      htj2kCache.currentCacheSize += entry.fullData.byteLength;
      entry.partialData = null; // 메모리 해제

      htj2kLog('htj2kBackgroundLoader', 'Full data loaded', {
        imageId: imageId.substring(0, 50),
        fullSize: entry.fullData.byteLength,
        totalBytes: entry.totalBytes,
      });

      return true;
    } else if (response.status === 200) {
      // 서버가 Range를 무시하고 전체 반환
      const fullData = await response.arrayBuffer();

      ensureCacheSpace(fullData.byteLength);

      entry.fullData = fullData;
      entry.status = 'complete';
      entry.lastUpdated = Date.now();
      entry.totalBytes = fullData.byteLength;

      htj2kCache.currentCacheSize -= entry.partialData?.byteLength ?? 0;
      htj2kCache.currentCacheSize += fullData.byteLength;
      entry.partialData = null;

      htj2kLog('htj2kBackgroundLoader', 'Full download (no Range support)', {
        imageId: imageId.substring(0, 50),
        size: fullData.byteLength,
      });

      return true;
    } else {
      throw new Error(`Unexpected response status: ${response.status}`);
    }
  } catch (error) {
    entry.status = 'error';
    console.error(
      `[HTJ2K-BG] Failed to load remaining data for ${imageId}:`,
      error
    );
    return false;
  }
}

/**
 * Background에서 나머지 HTJ2K 데이터 로드
 *
 * @description
 * Volume 로딩 완료 후 호출하여 Background에서 나머지 데이터를 로드합니다.
 * 모든 이미지의 전체 HTJ2K 데이터를 캐시에 보관합니다.
 *
 * @param imageIds - 로드할 이미지 ID 배열
 * @param onProgress - 진행률 콜백 (선택)
 * @param onComplete - 완료 콜백 (선택)
 */
export async function loadRemainingHTJ2KData(
  imageIds: string[],
  onProgress?: ProgressCallback,
  onComplete?: CompleteCallback
): Promise<void> {
  const totalImages = imageIds.length;
  let loadedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let totalBytes = 0;

  // 병렬 로드 제한 (동시 5개)
  const CONCURRENT_LIMIT = 5;
  const queue = [...imageIds];

  const loadOne = async (): Promise<void> => {
    while (queue.length > 0) {
      const imageId = queue.shift();
      if (!imageId) continue;

      const success = await loadRemainingDataForImage(imageId);

      loadedCount++;
      if (success) {
        successCount++;
        const entry = htj2kCache.entries.get(imageId);
        if (entry?.fullData) {
          totalBytes += entry.fullData.byteLength;
        }
      } else {
        failCount++;
      }

      onProgress?.({
        loaded: loadedCount,
        total: totalImages,
        percent: Math.round((loadedCount / totalImages) * 100),
        currentImageId: imageId,
      });
    }
  };

  // 병렬 워커 시작
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENT_LIMIT, totalImages); i++) {
    workers.push(loadOne());
  }

  await Promise.all(workers);

  htj2kLog('htj2kBackgroundLoader', 'Background loading complete', {
    totalImages,
    successCount,
    failCount,
    totalBytes,
  });

  onComplete?.({
    totalImages,
    successCount,
    failCount,
    totalBytes,
  });
}

/**
 * 캐시된 전체 데이터 조회
 *
 * @param imageId - 이미지 ID
 * @returns 전체 HTJ2K 데이터 또는 null
 */
export function getFullHTJ2KData(imageId: string): ArrayBuffer | null {
  const entry = htj2kCache.entries.get(imageId);

  if (entry?.status === 'complete' && entry.fullData) {
    // LRU 업데이트
    entry.lastUpdated = Date.now();
    return entry.fullData;
  }

  return null;
}

/**
 * 캐시된 HTJ2K 전체 데이터로 Level 0 디코딩 준비
 *
 * @description
 * Stack 스크롤 시 호출하여 캐시된 전체 HTJ2K 데이터를 반환합니다.
 * 실제 디코딩은 cornerstone dicom-image-loader가 수행합니다.
 *
 * @param imageId - 이미지 ID
 * @returns Level 0 디코딩에 사용할 전체 HTJ2K 데이터 또는 null
 */
export function decodeFullResolution(imageId: string): ArrayBuffer | null {
  const fullData = getFullHTJ2KData(imageId);
  const status = getCacheStatus(imageId);

  if (!fullData || status !== 'complete') {
    htj2kLog('htj2kBackgroundLoader', 'Full data not available for decoding', {
      imageId: imageId.substring(0, 50),
      status,
    });
    return null;
  }

  htj2kLog('htj2kBackgroundLoader', 'Returning full data for Level 0 decode', {
    imageId: imageId.substring(0, 50),
    dataSize: fullData.byteLength,
  });

  // 전체 HTJ2K 데이터 반환 - cornerstone이 Level 0으로 디코딩
  return fullData;
}

/**
 * 이미지 캐시 상태 조회
 *
 * @param imageId - 이미지 ID
 * @returns 캐시 상태
 */
export function getCacheStatus(
  imageId: string
): 'none' | 'partial' | 'loading' | 'complete' | 'error' {
  return htj2kCache.entries.get(imageId)?.status ?? 'none';
}

/**
 * 전체 캐시 상태 조회
 *
 * @returns 캐시 통계
 */
export function getCacheStats(): {
  totalEntries: number;
  completeEntries: number;
  partialEntries: number;
  currentSizeBytes: number;
  maxSizeBytes: number;
} {
  let completeCount = 0;
  let partialCount = 0;

  Array.from(htj2kCache.entries.values()).forEach(entry => {
    if (entry.status === 'complete') completeCount++;
    else if (entry.status === 'partial') partialCount++;
  });

  return {
    totalEntries: htj2kCache.entries.size,
    completeEntries: completeCount,
    partialEntries: partialCount,
    currentSizeBytes: htj2kCache.currentCacheSize,
    maxSizeBytes: htj2kCache.maxCacheSize,
  };
}

/**
 * 캐시 초기화
 *
 * @description
 * 모든 캐시 데이터를 제거합니다. 메모리 해제 목적.
 */
export function clearHTJ2KCache(): void {
  htj2kCache.entries.clear();
  htj2kCache.currentCacheSize = 0;
  urlToImageIdMap.clear();

  htj2kLog('htj2kBackgroundLoader', 'Cache cleared', {});
}

/**
 * 시리즈 변경 시 캐시 정리 (메모리 최적화)
 *
 * @description
 * 새 시리즈 로딩 시 이전 시리즈의 HTJ2K 캐시를 정리하여
 * 메모리 부족으로 인한 디코딩 오류를 방지합니다.
 *
 * @param keepSeriesUIDs - 유지할 시리즈 UID 목록 (현재 표시 중인 시리즈)
 *
 * @example
 * ```typescript
 * // 새 시리즈 로딩 시
 * clearCacheForSeriesChange(['1.2.3.4.5']);  // 해당 시리즈만 유지
 *
 * // 모든 캐시 정리 (시리즈 UID 모를 때)
 * clearCacheForSeriesChange([]);
 * ```
 */
export function clearCacheForSeriesChange(keepSeriesUIDs: string[] = []): void {
  if (keepSeriesUIDs.length === 0) {
    // 유지할 시리즈가 없으면 전체 정리
    clearHTJ2KCache();
    return;
  }

  // 시리즈 UID가 포함된 imageId만 유지
  let freedBytes = 0;
  let removedCount = 0;

  const entriesToRemove: string[] = [];

  htj2kCache.entries.forEach((entry, imageId) => {
    // imageId에서 시리즈 UID 추출 시도
    // 예: wadors:http://server/studies/.../series/1.2.3.4.5/instances/.../frames/1
    const shouldKeep = keepSeriesUIDs.some(uid => imageId.includes(uid));

    if (!shouldKeep) {
      const entrySize =
        (entry.partialData?.byteLength ?? 0) +
        (entry.fullData?.byteLength ?? 0) +
        (entry.levelData?.byteLength ?? 0) +
        (entry.complementData?.byteLength ?? 0);
      freedBytes += entrySize;
      removedCount++;
      entriesToRemove.push(imageId);
    }
  });

  // 삭제 (iteration 중 삭제 방지)
  entriesToRemove.forEach(imageId => {
    htj2kCache.entries.delete(imageId);
  });

  htj2kCache.currentCacheSize = Math.max(0, htj2kCache.currentCacheSize - freedBytes);

  htj2kLog('htj2kBackgroundLoader', '🧹 Cache cleared for series change', {
    removedCount,
    freedBytes: formatDataSize(freedBytes),
    remainingEntries: htj2kCache.entries.size,
    keepSeriesUIDs: keepSeriesUIDs.join(', '),
  });
}

// =============================================================================
// URL 기반 HTJ2K 데이터 캐시 (DICOMweb 중복 다운로드 방지)
// =============================================================================

/**
 * URL → imageId 매핑 (URL에서 imageId 추출용)
 */
const urlToImageIdMap = new Map<string, string>();

/**
 * URL에서 캐시 키(imageId) 추출
 *
 * @param url - WADO-RS URL
 * @returns 캐시 키로 사용할 imageId
 */
function urlToCacheKey(url: string): string {
  // URL 정규화: query string 제거하고 핵심 부분만 추출
  // 예: http://server/studies/.../frames/1 → frames/1 부분이 핵심
  const urlObj = new URL(url, 'http://localhost');
  return urlObj.pathname;
}

/**
 * HTJ2K 원본 데이터 저장 (다운로드 후 호출)
 *
 * @description
 * xhrRequest의 beforeProcessing 훅에서 호출하여 다운로드된 HTJ2K 데이터를 캐싱합니다.
 * Volume 로딩 시 저장된 데이터를 Stack 로딩 시 재사용합니다.
 *
 * @param url - 요청 URL
 * @param imageId - 이미지 ID
 * @param data - HTJ2K ArrayBuffer 데이터
 */
export function cacheHTJ2KData(
  url: string,
  imageId: string,
  data: ArrayBuffer
): void {
  const cacheKey = imageId || urlToCacheKey(url);

  // URL → imageId 매핑 저장
  if (imageId) {
    urlToImageIdMap.set(urlToCacheKey(url), imageId);
  }

  // 이미 complete 상태면 무시
  const existingEntry = htj2kCache.entries.get(cacheKey);
  if (existingEntry?.status === 'complete') {
    return;
  }

  // 캐시 공간 확보
  ensureCacheSpace(data.byteLength);

  const entry: HTJ2KCacheEntry = {
    partialData: null,
    fullData: data,
    status: 'complete',
    totalBytes: data.byteLength,
    lastUpdated: Date.now(),
    // Server API 필드 초기화
    levelData: null,
    levelValue: null,
    complementData: null,
    complementStatus: 'none',
  };

  htj2kCache.entries.set(cacheKey, entry);
  htj2kCache.currentCacheSize += data.byteLength;

  htj2kLog('htj2kBackgroundLoader', 'HTJ2K data cached', {
    url: url.substring(0, 80),
    imageId: cacheKey.substring(0, 50),
    size: data.byteLength,
  });
}

/**
 * 캐시된 HTJ2K 데이터 조회
 *
 * @param imageId - 이미지 ID 또는 URL
 * @returns 캐시된 ArrayBuffer 또는 null
 */
export function getCachedHTJ2KData(imageId: string): ArrayBuffer | null {
  // 직접 조회
  let entry = htj2kCache.entries.get(imageId);

  // URL로 변환하여 재조회
  if (!entry && imageId.startsWith('wadors:')) {
    const url = imageId.substring(7);
    const cacheKey = urlToCacheKey(url);
    entry = htj2kCache.entries.get(cacheKey);

    // URL 매핑으로 재조회
    if (!entry) {
      const mappedImageId = urlToImageIdMap.get(cacheKey);
      if (mappedImageId) {
        entry = htj2kCache.entries.get(mappedImageId);
      }
    }
  }

  if (entry?.status === 'complete' && entry.fullData) {
    entry.lastUpdated = Date.now(); // LRU 업데이트
    return entry.fullData;
  }

  return null;
}

/**
 * 캐시 존재 여부 확인
 *
 * @param imageId - 이미지 ID
 * @returns 캐시 존재 여부
 */
export function hasHTJ2KCache(imageId: string): boolean {
  return getCachedHTJ2KData(imageId) !== null;
}

/**
 * 특정 이미지 캐시 제거
 *
 * @param imageId - 제거할 이미지 ID
 */
export function removeCacheEntry(imageId: string): void {
  const entry = htj2kCache.entries.get(imageId);
  if (entry) {
    const size =
      (entry.partialData?.byteLength ?? 0) + (entry.fullData?.byteLength ?? 0);
    htj2kCache.entries.delete(imageId);
    htj2kCache.currentCacheSize -= size;
  }
}

/**
 * 캐시 최대 크기 설정
 *
 * @param maxSizeBytes - 최대 캐시 크기 (바이트)
 */
export function setCacheMaxSize(maxSizeBytes: number): void {
  htj2kCache.maxCacheSize = maxSizeBytes;

  // 현재 크기가 새 최대 크기를 초과하면 정리
  if (htj2kCache.currentCacheSize > maxSizeBytes) {
    ensureCacheSpace(0);
  }
}

// =============================================================================
// Server API 지원 함수들 (?level=N, ?complement=N)
// =============================================================================

/**
 * Fallback 시 전체 HTJ2K 데이터 캐싱
 *
 * @description
 * 서버가 PLT 마커가 없어서 Level 추출이 불가능한 경우,
 * 전체 HTJ2K를 반환합니다. 이 데이터는 이미 완전한 HTJ2K이므로
 * complement 요청이 필요 없습니다.
 *
 * X-HTJ2K-Fallback: true 헤더를 감지하면 이 함수를 호출합니다.
 *
 * @param imageId - 원본 이미지 ID (level 파라미터 없는 URL)
 * @param data - 전체 HTJ2K 데이터
 *
 * @example
 * ```typescript
 * // Fallback 감지 시
 * const fallbackResult = detectFallbackFromXHR(xhr);
 * if (fallbackResult === true) {
 *   cacheFullDataAsFallback('wadors:https://server/frames/1', response);
 * }
 * ```
 *
 * @see TASK-72-CLIENT-FALLBACK-FIX.md - 클라이언트 Fallback 처리 작업지시서
 */
export function cacheFullDataAsFallback(
  imageId: string,
  data: ArrayBuffer
): void {
  // 이미 complete 상태면 무시
  const existingEntry = htj2kCache.entries.get(imageId);
  if (existingEntry?.status === 'complete' && existingEntry.fullData) {
    htj2kLog('htj2kBackgroundLoader', 'cacheFullDataAsFallback: Already complete, skipping', {
      imageId: imageId.substring(0, 50),
    });
    return;
  }

  // 캐시 공간 확보
  ensureCacheSpace(data.byteLength);

  const entry: HTJ2KCacheEntry = {
    partialData: null,
    fullData: data,
    status: 'complete',  // 이미 전체 데이터
    totalBytes: data.byteLength,
    lastUpdated: Date.now(),
    // Level 데이터도 동일하게 설정 (Fallback이므로)
    levelData: data,
    levelValue: null,  // Level 값은 의미 없음 (전체 데이터)
    complementData: null,
    complementStatus: 'complete',  // complement 불필요
  };

  htj2kCache.entries.set(imageId, entry);
  htj2kCache.currentCacheSize += data.byteLength;

  htj2kLog('htj2kBackgroundLoader', '⚠️ Fallback: Full HTJ2K cached (no complement needed)', {
    imageId: imageId.substring(0, 50),
    size: formatDataSize(data.byteLength),
  });
}

/**
 * Server API Level 데이터 캐싱
 *
 * @description
 * customWadorsLoader의 beforeProcessing 훅에서 호출됩니다.
 * ?level=N 요청 응답을 캐시에 저장합니다.
 *
 * @param imageId - 원본 이미지 ID (level 파라미터 없는 URL)
 * @param data - Level 데이터 (완전한 HTJ2K)
 * @param level - 요청한 Level 값 (예: 2)
 *
 * @example
 * ```typescript
 * // ?level=2 응답 저장
 * cacheLevelData('wadors:https://server/frames/1', levelData, 2);
 * ```
 */
export function cacheLevelData(
  imageId: string,
  data: ArrayBuffer,
  level: number
): void {
  let entry = htj2kCache.entries.get(imageId);

  // 이미 전체 데이터가 있으면 무시
  if (entry?.status === 'complete' && entry.fullData) {
    htj2kLog('htj2kBackgroundLoader', 'cacheLevelData: Already complete, skipping', {
      imageId: imageId.substring(0, 50),
    });
    return;
  }

  // 캐시 공간 확보
  ensureCacheSpace(data.byteLength);

  if (entry) {
    // 기존 엔트리 업데이트
    entry.levelData = data;
    entry.levelValue = level;
    entry.status = 'partial';
    entry.lastUpdated = Date.now();
    htj2kCache.currentCacheSize += data.byteLength;
  } else {
    // 새 엔트리 생성
    entry = {
      partialData: null,
      fullData: null,
      status: 'partial',
      totalBytes: null,
      lastUpdated: Date.now(),
      levelData: data,
      levelValue: level,
      complementData: null,
      complementStatus: 'none',
    };
    htj2kCache.entries.set(imageId, entry);
    htj2kCache.currentCacheSize += data.byteLength;
  }

  htj2kLog('htj2kBackgroundLoader', '📦 Level data cached (Server API)', {
    imageId: imageId.substring(0, 50),
    level,
    size: formatDataSize(data.byteLength),
  });
}

/**
 * 단일 이미지의 Complement 데이터 로드 (Server API)
 *
 * @description
 * ?complement=N 요청으로 Level N 이후 데이터를 로드하고
 * Level 데이터와 병합하여 전체 HTJ2K를 생성합니다.
 *
 * @param imageId - 원본 이미지 ID
 * @returns 성공 여부
 */
async function loadComplementDataForImage(imageId: string): Promise<boolean> {
  // imageId에서 ?level=N 파라미터 제거 (캐시 키와 일치시키기 위해)
  const normalizedImageId = stripLevelFromImageId(imageId);

  console.log('[HTJ2K-BG] loadComplementDataForImage:', {
    originalImageId: imageId.substring(0, 80),
    normalizedImageId: normalizedImageId.substring(0, 80),
  });

  const entry = htj2kCache.entries.get(normalizedImageId);

  // Level 데이터가 없으면 로드 불가
  if (!entry?.levelData || entry.levelValue === null) {
    htj2kLog('htj2kBackgroundLoader', 'loadComplementData: No level data', {
      imageId: normalizedImageId.substring(0, 50),
      hasEntry: !!entry,
      hasLevelData: !!entry?.levelData,
      levelValue: entry?.levelValue,
    });
    return false;
  }

  // 이미 완료됨
  if (entry.status === 'complete') {
    return true;
  }

  // 이미 Complement 로딩 중
  if (entry.complementStatus === 'loading') {
    return false;
  }

  // 로딩 시작
  entry.complementStatus = 'loading';

  // 원본 URL (level 파라미터 없음)에 complement 파라미터 추가
  const url = imageIdToUrl(normalizedImageId);
  const complementUrl = appendComplementParam(url, entry.levelValue);

  htj2kLog('htj2kBackgroundLoader', '🔄 Loading complement data (Server API)', {
    imageId: imageId.substring(0, 50),
    level: entry.levelValue,
    url: complementUrl.substring(0, 80),
  });

  try {
    const rangeConfig = getRangeRequestConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), rangeConfig.timeout);

    // 인증 헤더 구성
    // complement 데이터는 raw HTJ2K이므로 single-part 형식 요청
    // multipart/related 대신 image/jph로 요청하여 boundary 없는 순수 데이터 수신
    const headers: Record<string, string> = {
      Accept: 'image/jph, application/octet-stream, */*',
    };

    const authHeader = getAuthorizationHeader();
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    console.log('[HTJ2K-BG] Complement request URL:', complementUrl);
    console.log('[HTJ2K-BG] Complement request headers:', headers);

    const response = await fetch(complementUrl, {
      headers,
      signal: controller.signal,
    });

    console.log('[HTJ2K-BG] Complement response status:', response.status);

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Complement request failed: ${response.status}`);
    }

    const complementData = await response.arrayBuffer();

    // Level 데이터와 Complement 데이터 준비
    const levelDataArray = new Uint8Array(entry.levelData!);
    const complementDataArray = new Uint8Array(complementData);

    console.log('[HTJ2K-BG] Complement data received:', {
      levelSize: levelDataArray.byteLength,
      complementSize: complementDataArray.byteLength,
    });

    // =======================================================================
    // Fallback 감지: 서버가 파라미터를 지원하지 않는 경우
    // =======================================================================
    // 케이스 1: complement가 0-byte → level이 이미 full
    // 케이스 2: levelSize == complementSize → 둘 다 전체 데이터 반환 (fallback)
    // 케이스 3: levelSize가 예상 Level 2 크기보다 훨씬 큼 (> 500KB) → fallback 가능성
    const isFallback =
      complementDataArray.byteLength === 0 ||
      levelDataArray.byteLength === complementDataArray.byteLength;

    if (isFallback) {
      const reason = complementDataArray.byteLength === 0
        ? 'complement is 0-byte'
        : 'levelSize equals complementSize (both fallback to full)';

      htj2kLog('htj2kBackgroundLoader', `✅ Server fallback detected: ${reason}`, {
        imageId: normalizedImageId.substring(0, 50),
        levelSize: levelDataArray.byteLength,
        complementSize: complementDataArray.byteLength,
      });

      // levelData를 그대로 fullData로 사용 (이미 전체 데이터)
      const fullBuffer = entry.levelData!;

      // 캐시 업데이트
      entry.fullData = fullBuffer;
      entry.complementData = complementData;
      entry.complementStatus = 'complete';
      entry.status = 'complete';
      entry.totalBytes = fullBuffer.byteLength;
      entry.lastUpdated = Date.now();

      return true;
    }

    // =======================================================================
    // 일반 병합: levelData + complementData → fullData
    // =======================================================================
    // 디버그: 병합 전 데이터 정보 출력
    console.log('[HTJ2K-BG] Merge debug info:', {
      levelSize: levelDataArray.byteLength,
      levelFirstBytes: Array.from(levelDataArray.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')),
      levelLastBytes: Array.from(levelDataArray.slice(-4)).map(b => b.toString(16).padStart(2, '0')),
      complementSize: complementDataArray.byteLength,
      complementFirstBytes: Array.from(complementDataArray.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')),
      complementLastBytes: Array.from(complementDataArray.slice(-4)).map(b => b.toString(16).padStart(2, '0')),
      calculatedMergeSize: levelDataArray.byteLength - 2 + complementDataArray.byteLength + 2,
    });

    const mergedData = safeMergeHTJ2KData(
      levelDataArray,
      complementDataArray,
      undefined // expectedSize 검증 스킵
    );

    if (!mergedData) {
      throw new Error('Data merge validation failed');
    }

    // 캐시 업데이트
    const mergedBuffer = mergedData.buffer.slice(
      mergedData.byteOffset,
      mergedData.byteOffset + mergedData.byteLength
    );

    // 캐시 공간 확보 (Level 데이터는 제거됨)
    const additionalSize = mergedBuffer.byteLength - (entry.levelData?.byteLength ?? 0);
    ensureCacheSpace(Math.max(0, additionalSize));

    // 캐시 크기 업데이트
    htj2kCache.currentCacheSize -= entry.levelData?.byteLength ?? 0;
    htj2kCache.currentCacheSize += mergedBuffer.byteLength;

    entry.fullData = mergedBuffer;
    entry.complementData = complementData;
    entry.complementStatus = 'complete';
    entry.status = 'complete';
    entry.totalBytes = mergedBuffer.byteLength;
    entry.lastUpdated = Date.now();

    // Level 데이터 메모리 해제 (병합 완료 후)
    entry.levelData = null;

    htj2kLog('htj2kBackgroundLoader', '✅ Complement data merged (Server API)', {
      imageId: imageId.substring(0, 50),
      levelSize: levelDataArray.byteLength,
      complementSize: complementData.byteLength,
      fullSize: mergedBuffer.byteLength,
    });

    return true;
  } catch (error) {
    entry.complementStatus = 'error';
    console.error(
      `[HTJ2K-BG] Failed to load complement data for ${imageId}:`,
      error
    );
    return false;
  }
}

/**
 * Background에서 Complement 데이터 로드 (Server API)
 *
 * @description
 * Volume 로딩 완료 후 호출하여 모든 이미지의 Complement 데이터를 로드합니다.
 * Level 데이터와 병합하여 전체 HTJ2K를 캐시에 보관합니다.
 *
 * @param imageIds - 로드할 이미지 ID 배열
 * @param onProgress - 진행률 콜백 (선택)
 * @param onComplete - 완료 콜백 (선택)
 */
export async function loadComplementHTJ2KData(
  imageIds: string[],
  onProgress?: ProgressCallback,
  onComplete?: CompleteCallback
): Promise<void> {
  // Server API가 비활성화되어 있으면 기존 Range Request 방식 사용
  if (!isServerApiEnabled()) {
    htj2kLog('htj2kBackgroundLoader', 'Server API disabled, using Range Request fallback');
    return loadRemainingHTJ2KData(imageIds, onProgress, onComplete);
  }

  const totalImages = imageIds.length;
  let loadedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let totalBytes = 0;

  // 순차 로드 (Sequential Loading - 기술 검토 피드백 반영)
  // 병렬 로드는 메모리 문제를 유발할 수 있음
  for (const imageId of imageIds) {
    const success = await loadComplementDataForImage(imageId);

    loadedCount++;
    if (success) {
      successCount++;
      const entry = htj2kCache.entries.get(imageId);
      if (entry?.fullData) {
        totalBytes += entry.fullData.byteLength;
      }
    } else {
      failCount++;
    }

    onProgress?.({
      loaded: loadedCount,
      total: totalImages,
      percent: Math.round((loadedCount / totalImages) * 100),
      currentImageId: imageId,
    });
  }

  htj2kLog('htj2kBackgroundLoader', '✅ Complement loading complete (Server API)', {
    totalImages,
    successCount,
    failCount,
    totalBytes: formatDataSize(totalBytes),
  });

  onComplete?.({
    totalImages,
    successCount,
    failCount,
    totalBytes,
  });
}

/**
 * Background 데이터 로드 통합 함수
 *
 * @description
 * Server API 사용 가능 여부에 따라 적절한 방식으로 Background 로딩을 수행합니다.
 * - Server API 활성화: ?complement=N 요청 사용
 * - Server API 비활성화: Range Request 사용
 *
 * @param imageIds - 로드할 이미지 ID 배열
 * @param onProgress - 진행률 콜백 (선택)
 * @param onComplete - 완료 콜백 (선택)
 */
export async function loadBackgroundHTJ2KData(
  imageIds: string[],
  onProgress?: ProgressCallback,
  onComplete?: CompleteCallback
): Promise<void> {
  if (isServerApiEnabled()) {
    htj2kLog('htj2kBackgroundLoader', 'Using Server API for background loading');
    return loadComplementHTJ2KData(imageIds, onProgress, onComplete);
  } else {
    htj2kLog('htj2kBackgroundLoader', 'Using Range Request for background loading');
    return loadRemainingHTJ2KData(imageIds, onProgress, onComplete);
  }
}

/**
 * Level 데이터 존재 여부 확인
 *
 * @param imageId - 이미지 ID
 * @returns Level 데이터 존재 여부
 */
export function hasLevelData(imageId: string): boolean {
  const entry = htj2kCache.entries.get(imageId);
  return entry?.levelData !== null && entry?.levelValue !== null;
}

/**
 * 캐시된 Level 데이터 조회
 *
 * @param imageId - 이미지 ID
 * @returns Level 데이터 또는 null
 */
export function getLevelData(imageId: string): ArrayBuffer | null {
  const entry = htj2kCache.entries.get(imageId);
  if (entry?.levelData) {
    entry.lastUpdated = Date.now();
    return entry.levelData;
  }
  return null;
}

// =============================================================================
// Phase 6: Stack Viewport Full Resolution 통합
// =============================================================================

/**
 * Server API Full Resolution 데이터 준비 여부 확인
 *
 * @description
 * Server API로 Level 데이터와 Complement 데이터가 병합되어
 * Full Resolution HTJ2K가 준비되었는지 확인합니다.
 *
 * Stack Viewport에서 이미지 요청 전에 호출하여
 * 캐시된 Full Resolution 데이터 사용 가능 여부를 판단합니다.
 *
 * @param imageId - 이미지 ID
 * @returns Full Resolution 데이터 준비 여부
 *
 * @example
 * ```typescript
 * if (isServerApiDataReady(imageId)) {
 *   const fullData = getFullResolutionData(imageId);
 *   // 네트워크 요청 없이 캐시 데이터 사용
 * }
 * ```
 *
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - Phase 6
 */
export function isServerApiDataReady(imageId: string): boolean {
  const entry = htj2kCache.entries.get(imageId);

  if (!entry) {
    return false;
  }

  // 상태가 complete이고 fullData가 있으면 준비됨
  if (entry.status === 'complete' && entry.fullData !== null) {
    return true;
  }

  return false;
}

/**
 * Full Resolution 데이터 반환 (Server API 병합된 데이터)
 *
 * @description
 * Server API로 Level 데이터와 Complement 데이터가 병합된
 * Full Resolution HTJ2K 데이터를 반환합니다.
 *
 * Stack Viewport에서 이미지 로딩 시 호출하여
 * 네트워크 요청 없이 캐시된 데이터로 이미지를 생성합니다.
 *
 * @param imageId - 이미지 ID
 * @returns Full Resolution HTJ2K 데이터 또는 null
 *
 * @example
 * ```typescript
 * const fullData = getFullResolutionData(imageId);
 * if (fullData) {
 *   // createImageFromCache(imageId, fullData, { decodeLevel: 0 });
 * }
 * ```
 *
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - Phase 6
 */
export function getFullResolutionData(imageId: string): ArrayBuffer | null {
  const entry = htj2kCache.entries.get(imageId);

  if (!entry) {
    return null;
  }

  // 상태가 complete이고 fullData가 있으면 반환
  if (entry.status === 'complete' && entry.fullData) {
    // LRU 업데이트
    entry.lastUpdated = Date.now();

    htj2kLog('htj2kBackgroundLoader', '🚀 Returning Full Resolution data (Server API)', {
      imageId: imageId.substring(0, 50),
      size: formatDataSize(entry.fullData.byteLength),
    });

    return entry.fullData;
  }

  return null;
}
