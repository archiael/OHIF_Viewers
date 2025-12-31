/**
 * HTJ2K Background Progressive Loader
 *
 * @description
 * Volume 로딩 완료 후 Background에서 나머지 HTJ2K 데이터를 로드합니다.
 * Stack 스크롤 시 Level 0 디코딩에 사용됩니다.
 *
 * 네트워크 흐름:
 * 1차 요청 (Foreground): bytes=0-99999 → Level 2 디코딩 → Volume 표시
 * 2차 요청 (Background): bytes=100000-끝 → HTJ2K 캐시 보관
 * 스크롤 시: 캐시된 전체 데이터로 Level 0 디코딩
 *
 * @see document/TASK-72-LEVEL2-MPR-VOLUME.md - Phase 5 설계
 */

import { htj2kLog } from './htj2kDebugLogger';
import { getRangeRequestConfig, DEFAULT_RANGE_CONFIG } from './htj2kRangeRequestCore';

/**
 * HTJ2K 데이터 캐시 항목 인터페이스
 */
interface HTJ2KCacheEntry {
  /** 부분 데이터 (Level 2 로드 시 받은 데이터) */
  partialData: ArrayBuffer | null;
  /** 전체 데이터 (Background 로드 완료 후) */
  fullData: ArrayBuffer | null;
  /** 로딩 상태 */
  status: 'none' | 'partial' | 'loading' | 'complete' | 'error';
  /** 파일 전체 크기 (Content-Range에서 추출) */
  totalBytes: number | null;
  /** 마지막 업데이트 시간 */
  lastUpdated: number;
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

    const response = await fetch(url, {
      headers: {
        Range: `bytes=${startByte}-`,
        Accept: 'application/octet-stream',
      },
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

  htj2kLog('htj2kBackgroundLoader', 'Cache cleared', {});
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
