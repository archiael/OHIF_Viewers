# Task #72-2: 클라이언트 측 Server API 연동 구현

**상태**: ✅ 구현 완료
**우선순위**: High
**의존성**: Task #72 (서버 완료)
**작성일**: 2025-12-31
**최종 업데이트**: 2026-01-02

---

## ✅ 현재 상황 (2026-01-02)

### 서버: ✅ 완료

- `?level=N`, `?complement=N` API 구현
- `X-HTJ2K-Fallback: true` 헤더 반환 (PLT 없는 경우)
- CORS 헤더 노출 설정 완료

### 클라이언트: ✅ 구현 완료

| 기능 | 상태 | 구현 위치 |
|------|------|----------|
| Server API 설정 관리 | ✅ | `htj2kConfig.ts` |
| URL에 `?level=N` 파라미터 추가 | ✅ | `customWadorsLoader.ts` |
| Level 데이터 캐싱 | ✅ | `htj2kBackgroundLoader.ts` |
| Level + Complement 병합 | ✅ | `htj2kDataMerger.ts` |
| X-HTJ2K-Fallback 헤더 감지 | ✅ | `htj2kConfig.ts:detectFallbackFromXHR()` |
| Fallback 시 전체 데이터 캐싱 | ✅ | `htj2kBackgroundLoader.ts:cacheFullDataAsFallback()` |
| Fallback 시 complement 요청 생략 | ✅ | `htj2kBackgroundLoader.ts:loadComplementData()` |
| 저해상도 디코딩 | ✅ | `customWadorsLoader.ts:forcedDecodeLevel` (항상 적용) |

### 통합 테스트: ⏳ 미확인

- 테스트 이미지에 PLT 마커가 없음 → Fallback 동작 확인 필요

---

## 목표

서버의 HTJ2K Level 추출 API (`?level=2`, `?complement=2`)를 활용하여 **Progressive Network Loading** 구현

### 기대 효과

| 항목 | 현재 | 구현 후 |
|------|------|---------|
| **초기 Volume 표시** | 130MB 다운로드 후 | **20MB 다운로드 후** |
| **초기 로딩 시간** | ~10초 | **~1.5초** (6.5배 향상) |
| **총 네트워크 전송** | 130MB | 130MB (동일) |
| **Full Resolution 준비** | 즉시 가능 | Background 로딩 후 |

---

## 구현 개요

### 동작 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: Volume 즉시 표시                                           │
├─────────────────────────────────────────────────────────────────────┤
│ 1. 클라이언트가 ?level=2 파라미터로 요청                            │
│ 2. 서버가 Level 2 완전한 HTJ2K 반환 (~100KB)                        │
│ 3. OpenJPH로 즉시 디코딩                                            │
│ 4. Volume 렌더링 및 표시                                            │
│ 5. Level 2 데이터 캐시에 저장                                       │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: Background에서 나머지 로딩                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Volume 표시 완료 후 Background 로딩 시작                         │
│ 2. ?complement=2 파라미터로 나머지 데이터 요청                      │
│ 3. Complement 데이터 캐시에 저장                                    │
│ 4. 진행률 표시 (선택적)                                             │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: Stack 스크롤 시 Full Resolution                            │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Stack Viewport에서 스크롤 발생                                   │
│ 2. 캐시에서 Level 2 + Complement 데이터 로드                        │
│ 3. 병합: level2[:-2] + complement + EOC                             │
│ 4. OpenJPH로 Level 0 (Full) 디코딩                                  │
│ 5. Stack Viewport에 고해상도 이미지 표시                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 수정 파일 목록

| 파일 | 수정 유형 | 설명 |
|------|----------|------|
| `htj2kConfig.ts` | 수정 | 서버 API 설정 추가 |
| `customWadorsLoader.ts` | 수정 | `?level=2` 파라미터 추가 (imageId 수정) |
| `htj2kBackgroundLoader.ts` | 수정 | `?complement=2` 요청 및 기존 캐시 재활용 |
| `htj2kDataMerger.ts` | **신규** | Level + Complement 데이터 병합 유틸 |
| `htj2kLevelCache.ts` | **신규** | Server API용 Level/Complement 데이터 캐시 |

### 캐시 아키텍처 결정

**기존 캐시 재활용 방식** (권장):
- `htj2kBackgroundLoader.ts`의 기존 `HTJ2KCacheEntry`를 확장
- Server API 관련 필드 추가 (`level`, `levelData`, `complementData`, `serverApiSupported`)
- 별도 `htj2kLevelCache.ts` 생성 대신 기존 캐시 확장으로 메모리 효율화

```typescript
// 기존 HTJ2KCacheEntry 확장
interface HTJ2KCacheEntry {
  // 기존 필드 (HTTP Range Request용)
  partialData: ArrayBuffer | null;
  fullData: ArrayBuffer | null;
  status: 'none' | 'partial' | 'loading' | 'complete' | 'error';
  totalBytes: number | null;
  lastUpdated: number;

  // 신규 필드 (Server API용)
  serverApi?: {
    level: number;                  // 저장된 Level (2)
    levelData: Uint8Array;          // Level 데이터 (완전한 HTJ2K)
    complementData?: Uint8Array;    // Complement 데이터
    originalSize: number;           // 원본 전체 파일 크기
    status: 'level-only' | 'complete';
  };
}
```

---

## Phase 1: htj2kConfig.ts 수정

### 목표
서버 API 지원 여부 및 관련 설정 추가

### 수정 위치
`extensions/cornerstone/src/utils/htj2kConfig.ts`

### 추가할 설정

```typescript
interface HTJ2KConfig {
  // 기존 설정
  enabled: boolean;
  volumeDecodeLevel: number;
  stackDecodeLevel: number;
  streaming: boolean;

  // 신규: 서버 API 설정
  serverApi: {
    enabled: boolean;           // 서버 API 사용 여부
    levelParam: string;         // 파라미터 이름 (기본: 'level')
    complementParam: string;    // 파라미터 이름 (기본: 'complement')
    volumeLevel: number;        // Volume 요청 시 Level (기본: 2)
    autoDetect: boolean;        // 서버 지원 여부 자동 감지
  };
}

const DEFAULT_CONFIG: HTJ2KConfig = {
  enabled: true,
  volumeDecodeLevel: 2,
  stackDecodeLevel: 0,
  streaming: false,

  serverApi: {
    enabled: false,             // ⚠️ 기본값 false - 서버 지원 확인 후 config에서 true로 설정
    levelParam: 'level',
    complementParam: 'complement',
    volumeLevel: 2,
    autoDetect: true,           // X-HTJ2K-Level 헤더로 지원 여부 감지
  },
};
```

### 추가할 함수

```typescript
/**
 * 서버 API 지원 여부 확인
 */
export function isServerApiEnabled(): boolean {
  return htj2kConfig.enabled && htj2kConfig.serverApi?.enabled;
}

/**
 * Level 파라미터가 포함된 URL 생성
 */
export function appendLevelParam(url: string, level: number): string {
  if (!isServerApiEnabled()) return url;

  const param = htj2kConfig.serverApi.levelParam;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${param}=${level}`;
}

/**
 * Complement 파라미터가 포함된 URL 생성
 */
export function appendComplementParam(url: string, level: number): string {
  if (!isServerApiEnabled()) return url;

  const param = htj2kConfig.serverApi.complementParam;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${param}=${level}`;
}

/**
 * 서버 응답에서 API 지원 여부 감지
 */
export function detectServerApiSupport(response: Response): boolean {
  return response.headers.has('X-HTJ2K-Level');
}
```

### 체크리스트
- [x] `HTJ2KConfig` 인터페이스에 `serverApi` 추가
- [x] `DEFAULT_CONFIG`에 기본값 설정
- [x] `isServerApiEnabled()` 함수 구현
- [x] `appendLevelParam()` 함수 구현
- [x] `appendComplementParam()` 함수 구현
- [x] `detectServerApiSupport()` 함수 구현
- [x] `local_dcm4chee.js` 설정 파일 업데이트

---

## Phase 2: customWadorsLoader.ts 수정

### 목표
Volume 요청 시 `?level=2` 파라미터 추가

### 수정 위치
`extensions/cornerstone/src/utils/customWadorsLoader.ts`

### 현재 코드 분석 (중요!)

```typescript
// ⚠️ 실제 코드는 직접 fetch가 아닌 originalWadorsLoader 사용
// customWadorsLoader.ts:361
const imageLoadObject = loader(imageId, modifiedOptions);
```

**핵심**: `imageId`는 `wadors:https://server/.../frames/1` 형식입니다.
**파라미터 추가 방법**: `imageId` 자체에 `?level=2`를 추가해야 합니다.

### 수정 코드

```typescript
import {
  isServerApiEnabled,
  appendLevelParam,
  getDecodeLevel,
} from './htj2kConfig';

/**
 * imageId에 Server API 파라미터 추가
 *
 * @param imageId - wadors:https://server/.../frames/1
 * @param level - 요청할 Level (2)
 * @returns wadors:https://server/.../frames/1?level=2
 */
function appendLevelParamToImageId(imageId: string, level: number): string {
  // wadors: prefix 분리
  if (!imageId.startsWith('wadors:')) {
    return imageId;
  }

  const url = imageId.substring(7); // "wadors:" 제거
  const modifiedUrl = appendLevelParam(url, level);
  return `wadors:${modifiedUrl}`;
}

// customWadorsLoader 함수 내부 수정
function customWadorsLoader(
  imageId: string,
  options: ImageLoaderOptions = {}
): Types.IImageLoadObject {
  // ... 기존 코드 ...

  // Volume 요청인지 확인
  const isVolume = options?.retrieveType === 'default';

  // ✅ Server API 활성화 시 imageId에 ?level=2 파라미터 추가
  let modifiedImageId = imageId;
  if (isVolume && isServerApiEnabled()) {
    const level = getDecodeLevel('volume'); // 2
    modifiedImageId = appendLevelParamToImageId(imageId, level);
    htj2kLog('customWadorsLoader', `Server API: ?level=${level}`, {
      originalImageId: imageId.substring(0, 50),
      modifiedImageId: modifiedImageId.substring(0, 80),
    });
  }

  // ... 기존 코드 ...

  // 원본 로더 호출 (수정된 imageId 사용)
  const imageLoadObject = loader(modifiedImageId, modifiedOptions);

  // ... 기존 코드 ...
}
```

### beforeProcessing 훅에서 Server API 응답 처리

```typescript
// installBeforeProcessingHook 함수 수정
internal.setOptions({
  beforeProcessing: (xhr: XMLHttpRequest) => {
    // ... 기존 코드 ...

    return responsePromise.then((response: ArrayBuffer) => {
      if (xhr.status === 200 || xhr.status === 206) {
        const url = xhr.responseURL || '';

        // ✅ Server API 응답 헤더 확인
        const htj2kLevel = xhr.getResponseHeader('X-HTJ2K-Level');
        const originalSize = xhr.getResponseHeader('X-HTJ2K-Original-Size');

        if (htj2kLevel) {
          // Server API 지원 확인됨
          htj2kLog('customWadorsLoader', 'Server API response detected', {
            level: htj2kLevel,
            originalSize,
            receivedSize: response.byteLength,
          });

          // ✅ 기존 캐시에 Server API 데이터 저장
          const imageId = `wadors:${url.split('?')[0]}`; // 파라미터 제거
          cacheServerApiData(imageId, {
            level: parseInt(htj2kLevel),
            levelData: new Uint8Array(response),
            originalSize: parseInt(originalSize || '0'),
            status: 'level-only',
          });
        } else {
          // 기존 캐싱 로직
          const imageId = `wadors:${url}`;
          cacheHTJ2KData(url, imageId, response);
        }
      }

      return response;
    });
  },
});
```

### 응답 처리

```typescript
// 서버 응답 헤더 확인
const htj2kLevel = response.headers.get('X-HTJ2K-Level');
const originalSize = response.headers.get('X-HTJ2K-Original-Size');
const complementSize = response.headers.get('X-HTJ2K-Complement-Size');

if (htj2kLevel) {
  htj2kLog('customWadorsLoader', 'Server API response', {
    level: htj2kLevel,
    originalSize,
    complementSize,
    receivedSize: arrayBuffer.byteLength,
  });

  // Level 2 데이터 캐시에 저장 (Background 로딩용)
  htj2kLevelCache.set(imageId, {
    level: parseInt(htj2kLevel),
    data: new Uint8Array(arrayBuffer),
    originalSize: parseInt(originalSize || '0'),
    complementSize: parseInt(complementSize || '0'),
  });
}
```

### 체크리스트
- [x] `isServerApiEnabled()` import
- [x] Volume 요청 감지 로직 추가
- [x] `?level=2` 파라미터 추가 로직
- [x] 서버 API 지원 여부 감지 로직
- [x] 응답 헤더 파싱 및 로깅
- [x] Level 2 데이터 캐시 저장

---

## Phase 3: htj2kBackgroundLoader.ts 수정

### 목표
Volume 로딩 완료 후 Background에서 `?complement=2` 요청

### 수정 위치
`extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts`

### 추가할 기능

```typescript
import { appendComplementParam, isServerApiEnabled } from './htj2kConfig';
import { htj2kLevelCache } from './htj2kLevelCache';

/**
 * Background에서 Complement 데이터 로딩
 *
 * Volume 로딩 완료 후 호출됨
 */
export async function loadComplementData(
  imageIds: string[],
  onProgress?: (percent: number) => void,
  onComplete?: () => void
): Promise<void> {
  if (!isServerApiEnabled()) {
    console.log('[HTJ2K-BG] Server API disabled, skipping complement loading');
    onComplete?.();
    return;
  }

  const totalImages = imageIds.length;
  let loadedCount = 0;
  const CONCURRENT_LIMIT = 10; // 동시 요청 수

  console.log(`[HTJ2K-BG] Starting complement loading for ${totalImages} images`);

  const loadOne = async (imageId: string): Promise<void> => {
    try {
      // 캐시에서 Level 2 데이터 확인
      const levelData = htj2kLevelCache.get(imageId);
      if (!levelData || levelData.complementData) {
        // 이미 완료됨
        return;
      }

      // URL 추출 및 complement 파라미터 추가
      const url = imageIdToUrl(imageId);
      const complementUrl = appendComplementParam(url, levelData.level);

      // Complement 데이터 요청
      const response = await fetch(complementUrl, {
        headers: { Accept: 'application/octet-stream' },
      });

      if (!response.ok) {
        throw new Error(`Complement fetch failed: ${response.status}`);
      }

      const complementData = new Uint8Array(await response.arrayBuffer());

      // 캐시에 Complement 데이터 저장
      levelData.complementData = complementData;
      levelData.status = 'complete';

      htj2kLog('htj2kBackgroundLoader', 'Complement loaded', {
        imageId: imageId.substring(0, 50),
        complementSize: complementData.byteLength,
      });

    } catch (error) {
      console.error(`[HTJ2K-BG] Failed to load complement for ${imageId}:`, error);
    } finally {
      loadedCount++;
      onProgress?.(Math.round((loadedCount / totalImages) * 100));
    }
  };

  // 병렬 처리
  const queue = [...imageIds];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < CONCURRENT_LIMIT; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const imageId = queue.shift();
          if (imageId) await loadOne(imageId);
        }
      })()
    );
  }

  await Promise.all(workers);
  console.log('[HTJ2K-BG] Complement loading complete');
  onComplete?.();
}
```

### Volume 로딩 완료 후 트리거

```typescript
// modes/usmpr/src/index.tsx 또는 적절한 위치에서

// Volume 로딩 완료 이벤트 구독
eventTarget.addEventListener(EVENTS.VOLUME_VIEWPORT_NEW_VOLUME, async (event) => {
  const { volumeId, viewportId } = event.detail;

  // Volume의 imageIds 가져오기
  const volume = cache.getVolume(volumeId);
  if (!volume) return;

  const imageIds = volume.imageIds;

  // Background에서 Complement 로딩 시작
  loadComplementData(
    imageIds,
    (percent) => {
      console.log(`[HTJ2K-BG] Progress: ${percent}%`);
      // 선택적: UI에 진행률 표시
    },
    () => {
      console.log('[HTJ2K-BG] All complement data ready for full resolution');
    }
  );
});
```

### 체크리스트
- [x] `loadBackgroundHTJ2KData()` 함수 구현 (Server API 방식)
- [x] `?complement=2` URL 생성
- [x] 병렬 요청 처리 (동시 10개)
- [x] 진행률 콜백 구현
- [x] 캐시에 Complement 데이터 저장
- [x] Volume 로딩 완료 이벤트에서 트리거 (modes/usmpr/index.tsx)

---

## Phase 4: htj2kDataMerger.ts 신규 생성

### 목표
Level 2 데이터와 Complement 데이터를 병합하여 Full HTJ2K 생성

### 파일 위치
`extensions/cornerstone/src/utils/htj2kDataMerger.ts`

### 구현 코드

```typescript
/**
 * HTJ2K Data Merger
 *
 * Level 2 데이터와 Complement 데이터를 병합하여 Full Resolution HTJ2K 생성
 *
 * 병합 공식:
 * fullData = level2Data[:-2] + complementData + EOC
 *
 * @see PROMPT-SERVER-HTJ2K-API.md
 */

const EOC_MARKER = new Uint8Array([0xFF, 0xD9]); // End of Codestream

/**
 * Level 데이터와 Complement 데이터를 병합
 *
 * @param levelData - Level 2까지의 완전한 HTJ2K 데이터 (EOC 포함)
 * @param complementData - Level 2 이후의 데이터 (EOC 미포함)
 * @returns 병합된 Full Resolution HTJ2K 데이터
 */
export function mergeHTJ2KData(
  levelData: Uint8Array,
  complementData: Uint8Array
): Uint8Array {
  // 1. Level 데이터에서 EOC 마커 제거 (마지막 2바이트)
  const levelWithoutEOC = levelData.slice(0, -2);

  // 2. 병합: levelData (EOC 제외) + complementData + EOC
  const mergedLength = levelWithoutEOC.length + complementData.length + EOC_MARKER.length;
  const mergedData = new Uint8Array(mergedLength);

  let offset = 0;
  mergedData.set(levelWithoutEOC, offset);
  offset += levelWithoutEOC.length;

  mergedData.set(complementData, offset);
  offset += complementData.length;

  mergedData.set(EOC_MARKER, offset);

  return mergedData;
}

/**
 * EOC 마커 검증
 *
 * @param data - HTJ2K 데이터
 * @returns EOC 마커가 올바른지 여부
 */
export function hasValidEOC(data: Uint8Array): boolean {
  if (data.length < 2) return false;
  return data[data.length - 2] === 0xFF && data[data.length - 1] === 0xD9;
}

/**
 * 병합 결과 검증
 *
 * @param mergedData - 병합된 데이터
 * @param expectedSize - 예상 크기 (서버에서 받은 originalSize)
 * @returns 검증 결과
 */
export function validateMergedData(
  mergedData: Uint8Array,
  expectedSize?: number
): { valid: boolean; error?: string } {
  // EOC 마커 확인
  if (!hasValidEOC(mergedData)) {
    return { valid: false, error: 'Invalid EOC marker' };
  }

  // SOC 마커 확인 (0xFF 0x4F)
  if (mergedData[0] !== 0xFF || mergedData[1] !== 0x4F) {
    return { valid: false, error: 'Invalid SOC marker' };
  }

  // 크기 검증 (선택적)
  if (expectedSize && mergedData.length !== expectedSize) {
    return {
      valid: false,
      error: `Size mismatch: expected ${expectedSize}, got ${mergedData.length}`
    };
  }

  return { valid: true };
}
```

### 사용 예시

```typescript
import { mergeHTJ2KData, validateMergedData } from './htj2kDataMerger';
import { htj2kLevelCache } from './htj2kLevelCache';

/**
 * Full Resolution 데이터 가져오기
 *
 * @param imageId - 이미지 ID
 * @returns Full HTJ2K 데이터 또는 null
 */
export function getFullResolutionData(imageId: string): Uint8Array | null {
  const cached = htj2kLevelCache.get(imageId);

  if (!cached) {
    console.warn('[HTJ2K] No cached data for', imageId);
    return null;
  }

  // Complement 데이터가 없으면 Level 데이터 반환 (서버 API 미지원 또는 로딩 중)
  if (!cached.complementData) {
    console.log('[HTJ2K] Complement not ready, using level data', imageId);
    return cached.data;
  }

  // 병합
  const mergedData = mergeHTJ2KData(cached.data, cached.complementData);

  // 검증
  const validation = validateMergedData(mergedData, cached.originalSize);
  if (!validation.valid) {
    console.error('[HTJ2K] Merge validation failed:', validation.error);
    return cached.data; // Fallback to level data
  }

  return mergedData;
}
```

### 체크리스트
- [x] `htj2kDataMerger.ts` 파일 생성
- [x] `mergeHTJ2KData()` 함수 구현
- [x] `hasValidEOC()` 함수 구현
- [x] `hasValidSOC()` 함수 구현
- [x] `validateMergedData()` 함수 구현
- [x] `canMerge()` 함수 구현
- [x] `safeMergeHTJ2KData()` 함수 구현
- [x] `formatDataSize()` 함수 구현
- [x] `calculateMergeRatio()` 함수 구현
- [x] Unit Test 작성 (`htj2kDataMerger.test.ts`)

---

## Phase 5: htj2kLevelCache.ts 신규 생성

### 목표
Level 데이터와 Complement 데이터를 관리하는 캐시

### 파일 위치
`extensions/cornerstone/src/utils/htj2kLevelCache.ts`

### 구현 코드

```typescript
/**
 * HTJ2K Level Cache
 *
 * Level 데이터와 Complement 데이터를 관리
 */

interface HTJ2KLevelCacheEntry {
  level: number;                    // 저장된 Level (2)
  data: Uint8Array;                 // Level 데이터 (완전한 HTJ2K)
  complementData?: Uint8Array;      // Complement 데이터
  originalSize: number;             // 원본 전체 파일 크기
  complementSize: number;           // Complement 크기
  status: 'level-only' | 'complete'; // 상태
  timestamp: number;                // 저장 시간
}

class HTJ2KLevelCache {
  private cache: Map<string, HTJ2KLevelCacheEntry> = new Map();
  private maxSize: number = 500; // 최대 엔트리 수

  /**
   * Level 데이터 저장
   */
  set(imageId: string, entry: Omit<HTJ2KLevelCacheEntry, 'timestamp' | 'status'>): void {
    // LRU: 캐시가 가득 차면 오래된 항목 제거
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(imageId, {
      ...entry,
      status: entry.complementData ? 'complete' : 'level-only',
      timestamp: Date.now(),
    });
  }

  /**
   * 캐시 조회
   */
  get(imageId: string): HTJ2KLevelCacheEntry | undefined {
    const entry = this.cache.get(imageId);
    if (entry) {
      // LRU: 접근 시 타임스탬프 갱신
      entry.timestamp = Date.now();
    }
    return entry;
  }

  /**
   * Complement 데이터 추가
   */
  setComplement(imageId: string, complementData: Uint8Array): boolean {
    const entry = this.cache.get(imageId);
    if (!entry) return false;

    entry.complementData = complementData;
    entry.status = 'complete';
    entry.timestamp = Date.now();
    return true;
  }

  /**
   * 특정 imageId가 Full Resolution 준비되었는지 확인
   */
  isFullResolutionReady(imageId: string): boolean {
    const entry = this.cache.get(imageId);
    return entry?.status === 'complete';
  }

  /**
   * 캐시 통계
   */
  getStats(): { total: number; complete: number; levelOnly: number } {
    let complete = 0;
    let levelOnly = 0;

    this.cache.forEach((entry) => {
      if (entry.status === 'complete') complete++;
      else levelOnly++;
    });

    return { total: this.cache.size, complete, levelOnly };
  }

  /**
   * 캐시 클리어
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 특정 Volume의 캐시 클리어
   */
  clearByPrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) keysToDelete.push(key);
    });
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
}

export const htj2kLevelCache = new HTJ2KLevelCache();
```

### 체크리스트
- [x] 기존 `htj2kBackgroundLoader.ts`의 캐시 구조 확장 (별도 파일 생성 대신)
- [x] `HTJ2KCacheEntry` 인터페이스에 Server API 필드 추가
- [x] LRU 정책 구현
- [x] `cacheLevelData()` 함수 구현
- [x] `isServerApiDataReady()` 함수 구현
- [x] `getFullResolutionData()` 함수 구현

---

## Phase 6: Stack Viewport 통합

### 목표
Stack Viewport에서 스크롤 시 Full Resolution 데이터 사용

### 수정 위치
`extensions/cornerstone/src/utils/customWadorsLoader.ts`

### 현재 코드 분석

기존 `createImageFromCache()` 함수 (`customWadorsLoader.ts:104-177`)가 이미 캐시된 HTJ2K 데이터로 이미지를 생성하는 기능을 제공합니다.

### 수정 코드

```typescript
import { getFullResolutionData, isServerApiDataReady } from './htj2kBackgroundLoader';

// customWadorsLoader 함수 내부, HTJ2K 캐시 확인 부분 수정
// Stack 로딩 시에만 캐시 확인 (Volume은 항상 다운로드)
if (!isVolume) {
  // ✅ 1순위: Server API로 병합된 Full Resolution 데이터 확인
  if (isServerApiEnabled() && isServerApiDataReady(imageId)) {
    const fullData = getFullResolutionData(imageId);
    if (fullData) {
      htj2kLog('customWadorsLoader', '🚀 Using Server API merged full resolution', {
        imageId: imageId.substring(0, 50),
        size: fullData.byteLength,
      });

      // ✅ 기존 createImageFromCache 재사용 (네트워크 요청 없음)
      return createImageFromCache(imageId, fullData.buffer, {
        ...options,
        decodeLevel: 0, // Full Resolution
      });
    }
  }

  // ✅ 2순위: 기존 캐시 확인 (HTTP Range Request 또는 전체 다운로드)
  const cachedData = getCachedHTJ2KData(imageId);
  if (cachedData) {
    htj2kLog('customWadorsLoader', '📦 HTJ2K cache hit!', {
      imageId: imageId.substring(0, 50),
      cachedSize: cachedData.byteLength,
    });

    return createImageFromCache(imageId, cachedData, {
      ...options,
      decodeLevel: 0,
    });
  }
}
```

### 체크리스트
- [x] Stack 요청 감지 로직 (기존 코드 활용)
- [x] Server API 캐시 우선 확인 (`isServerApiEnabled() && isServerApiDataReady()`)
- [x] `getFullResolutionData()` 호출하여 병합된 데이터 획득
- [x] 기존 `createImageFromCache()` 재사용
- [x] Fallback: 기존 캐시 → 네트워크 요청

---

## 설정 파일 업데이트

### local_dcm4chee.js

```javascript
window.config = {
  // ... 기존 설정 ...

  htj2k: {
    enabled: true,
    volumeDecodeLevel: 2,
    stackDecodeLevel: 0,
    streaming: false,

    // 서버 API 설정 추가
    serverApi: {
      enabled: true,           // 서버 API 활성화
      levelParam: 'level',     // ?level=2
      complementParam: 'complement', // ?complement=2
      volumeLevel: 2,          // Volume용 Level
      autoDetect: true,        // 서버 지원 자동 감지
    },
  },
};
```

---

## 테스트 체크리스트

### 기능 테스트

- [ ] **Volume 로딩 (서버 API 지원)**
  - [ ] `?level=2` 파라미터가 요청에 포함되는지 확인
  - [ ] 응답 크기가 ~100KB인지 확인
  - [ ] Volume이 정상적으로 렌더링되는지 확인

- [ ] **Volume 로딩 (서버 API 미지원)**
  - [ ] 파라미터가 무시되고 전체 파일이 반환되는지 확인
  - [ ] Fallback으로 정상 동작하는지 확인

- [ ] **Background Complement 로딩**
  - [ ] Volume 로딩 완료 후 자동 시작되는지 확인
  - [ ] `?complement=2` 파라미터가 요청에 포함되는지 확인
  - [ ] 진행률이 콘솔에 출력되는지 확인

- [ ] **Stack Full Resolution**
  - [ ] Complement 로딩 완료 후 Stack 스크롤 시
  - [ ] 캐시에서 데이터를 가져오는지 확인 (네트워크 요청 없음)
  - [ ] Full Resolution 이미지가 표시되는지 확인

### 성능 테스트

- [ ] 초기 Volume 표시 시간: 130MB → 20MB (약 6.5배 향상)
- [ ] Background 로딩이 UI를 블로킹하지 않는지 확인
- [ ] 메모리 사용량이 적절한지 확인

### 호환성 테스트

- [ ] 서버 API 미지원 시 기존 동작과 동일
- [ ] Local 파일 로딩 시 영향 없음
- [ ] 다른 Transfer Syntax (non-HTJ2K) 영향 없음

---

## 구현 순서

| 순서 | Phase | 파일 | 예상 시간 |
|------|-------|------|----------|
| 1 | Phase 1 | `htj2kConfig.ts` | - |
| 2 | Phase 5 | `htj2kLevelCache.ts` (신규) | - |
| 3 | Phase 4 | `htj2kDataMerger.ts` (신규) | - |
| 4 | Phase 2 | `customWadorsLoader.ts` | - |
| 5 | Phase 3 | `htj2kBackgroundLoader.ts` | - |
| 6 | Phase 6 | Stack 통합 | - |
| 7 | - | 설정 파일 업데이트 | - |
| 8 | - | 테스트 | - |

---

## Unit Test 구현

### 테스트 파일 위치
`extensions/cornerstone/src/utils/htj2kDataMerger.test.ts`

### 테스트 케이스

```typescript
import { describe, it, expect } from 'vitest';
import {
  mergeHTJ2KData,
  hasValidEOC,
  validateMergedData,
} from './htj2kDataMerger';

describe('htj2kDataMerger', () => {
  // EOC 마커: 0xFF 0xD9
  const EOC = new Uint8Array([0xFF, 0xD9]);
  // SOC 마커: 0xFF 0x4F
  const SOC = new Uint8Array([0xFF, 0x4F]);

  describe('hasValidEOC', () => {
    it('should return true for valid EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      expect(hasValidEOC(data)).toBe(true);
    });

    it('should return false for invalid EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0x00, 0x00]);
      expect(hasValidEOC(data)).toBe(false);
    });

    it('should return false for empty data', () => {
      const data = new Uint8Array([]);
      expect(hasValidEOC(data)).toBe(false);
    });

    it('should return false for data with only 1 byte', () => {
      const data = new Uint8Array([0xD9]);
      expect(hasValidEOC(data)).toBe(false);
    });
  });

  describe('mergeHTJ2KData', () => {
    it('should correctly merge level data and complement data', () => {
      // Level 데이터: SOC + 데이터 + EOC
      const levelData = new Uint8Array([0xFF, 0x4F, 0x01, 0x02, 0xFF, 0xD9]);
      // Complement 데이터: 추가 데이터 (EOC 없음)
      const complementData = new Uint8Array([0x03, 0x04, 0x05]);

      const merged = mergeHTJ2KData(levelData, complementData);

      // 예상 결과: SOC + 데이터 + complement + EOC
      expect(merged).toEqual(new Uint8Array([
        0xFF, 0x4F, 0x01, 0x02, // level data without EOC
        0x03, 0x04, 0x05,       // complement data
        0xFF, 0xD9              // EOC
      ]));
    });

    it('should handle empty complement data', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0x01, 0x02, 0xFF, 0xD9]);
      const complementData = new Uint8Array([]);

      const merged = mergeHTJ2KData(levelData, complementData);

      // EOC 제거 후 빈 complement 추가 후 EOC 다시 추가 = 원본과 동일
      expect(merged).toEqual(levelData);
    });

    it('should produce valid HTJ2K with EOC marker', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0x01, 0xFF, 0xD9]);
      const complementData = new Uint8Array([0x02, 0x03]);

      const merged = mergeHTJ2KData(levelData, complementData);

      expect(hasValidEOC(merged)).toBe(true);
    });
  });

  describe('validateMergedData', () => {
    it('should validate correct merged data', () => {
      // 올바른 HTJ2K: SOC + 데이터 + EOC
      const data = new Uint8Array([0xFF, 0x4F, 0x01, 0x02, 0xFF, 0xD9]);

      const result = validateMergedData(data);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject data without SOC marker', () => {
      const data = new Uint8Array([0x00, 0x00, 0x01, 0x02, 0xFF, 0xD9]);

      const result = validateMergedData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('SOC');
    });

    it('should reject data without EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x01, 0x02, 0x00, 0x00]);

      const result = validateMergedData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('EOC');
    });

    it('should validate size when expectedSize is provided', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x01, 0x02, 0xFF, 0xD9]);

      const resultCorrect = validateMergedData(data, 6);
      expect(resultCorrect.valid).toBe(true);

      const resultWrong = validateMergedData(data, 10);
      expect(resultWrong.valid).toBe(false);
      expect(resultWrong.error).toContain('Size mismatch');
    });
  });
});
```

### 추가 테스트 파일
`extensions/cornerstone/src/utils/htj2kConfig.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendLevelParam,
  appendComplementParam,
  isServerApiEnabled,
  initHTJ2KConfig,
  resetHTJ2KConfig,
} from './htj2kConfig';

describe('htj2kConfig - Server API', () => {
  beforeEach(() => {
    resetHTJ2KConfig();
  });

  describe('appendLevelParam', () => {
    it('should append level param to URL without query string', () => {
      initHTJ2KConfig({ htj2k: { serverApi: { enabled: true } } });

      const url = 'https://server/dicomweb/studies/1/series/2/instances/3/frames/1';
      const result = appendLevelParam(url, 2);

      expect(result).toBe(`${url}?level=2`);
    });

    it('should append level param to URL with existing query string', () => {
      initHTJ2KConfig({ htj2k: { serverApi: { enabled: true } } });

      const url = 'https://server/frames/1?existing=param';
      const result = appendLevelParam(url, 2);

      expect(result).toBe(`${url}&level=2`);
    });

    it('should return original URL when server API is disabled', () => {
      initHTJ2KConfig({ htj2k: { serverApi: { enabled: false } } });

      const url = 'https://server/frames/1';
      const result = appendLevelParam(url, 2);

      expect(result).toBe(url);
    });
  });

  describe('appendComplementParam', () => {
    it('should append complement param to URL', () => {
      initHTJ2KConfig({ htj2k: { serverApi: { enabled: true } } });

      const url = 'https://server/frames/1';
      const result = appendComplementParam(url, 2);

      expect(result).toBe(`${url}?complement=2`);
    });
  });

  describe('isServerApiEnabled', () => {
    it('should return false when HTJ2K is disabled', () => {
      initHTJ2KConfig({ htj2k: { enabled: false, serverApi: { enabled: true } } });

      expect(isServerApiEnabled()).toBe(false);
    });

    it('should return false when serverApi is disabled', () => {
      initHTJ2KConfig({ htj2k: { enabled: true, serverApi: { enabled: false } } });

      expect(isServerApiEnabled()).toBe(false);
    });

    it('should return true when both are enabled', () => {
      initHTJ2KConfig({ htj2k: { enabled: true, serverApi: { enabled: true } } });

      expect(isServerApiEnabled()).toBe(true);
    });
  });
});
```

### 테스트 실행

```bash
# 단일 파일 테스트
yarn test extensions/cornerstone/src/utils/htj2kDataMerger.test.ts

# 전체 HTJ2K 관련 테스트
yarn test --grep="htj2k"
```

### 테스트 체크리스트
- [x] `htj2kDataMerger.test.ts` 생성 (31개 테스트)
  - [x] `hasValidEOC()` 테스트
  - [x] `hasValidSOC()` 테스트
  - [x] `mergeHTJ2KData()` 테스트
  - [x] `validateMergedData()` 테스트
  - [x] `canMerge()` 테스트
  - [x] `safeMergeHTJ2KData()` 테스트
  - [x] Edge case: 빈 데이터, 1바이트 데이터, null/undefined
- [x] `htj2kConfig.test.ts` 생성 (53개 테스트)
  - [x] `appendLevelParam()` 테스트
  - [x] `appendComplementParam()` 테스트
  - [x] `isServerApiEnabled()` 테스트
  - [x] Edge case: URL에 기존 query string 있는 경우
- [x] `htj2kBackgroundLoader.test.ts` 생성 (20개 테스트)
  - [x] 캐시 CRUD 테스트
  - [x] LRU 정책 테스트
- [x] 모든 테스트 통과 확인 (120/120)

---

## 참고 문서

- [TASK-72-LEVEL2-MPR-VOLUME.md](./TASK-72-LEVEL2-MPR-VOLUME.md) - 메인 작업지시서
- [REPORT-HTJ2K-PROGRESSIVE-LOADING.md](./REPORT-HTJ2K-PROGRESSIVE-LOADING.md) - 전체 경과 보고서
- [TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md](./TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md) - Fallback 구현 가이드
- `extensions/cornerstone/src/utils/htj2kConfig.ts` - 현재 HTJ2K 설정
- `extensions/cornerstone/src/utils/customWadorsLoader.ts` - 현재 로더
- `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts` - 현재 Background 로더

---

## 구현 결과 요약

### 생성/수정된 파일

| 파일 | 유형 | 설명 |
|------|------|------|
| `htj2kConfig.ts` | 수정 | Server API 설정 및 URL 파라미터 함수 추가 |
| `htj2kConfig.test.ts` | 신규 | Server API 설정 테스트 (53개) |
| `htj2kDataMerger.ts` | 신규 | Level + Complement 데이터 병합 유틸리티 |
| `htj2kDataMerger.test.ts` | 신규 | 데이터 병합 테스트 (31개) |
| `htj2kBackgroundLoader.ts` | 수정 | Server API 캐시 구조 확장, Background 로딩 함수 |
| `htj2kBackgroundLoader.test.ts` | 신규 | 캐시 및 로더 테스트 (20개) |
| `customWadorsLoader.ts` | 수정 | Stack Viewport Server API 캐시 통합 |
| `modes/usmpr/index.tsx` | 수정 | Volume 로딩 완료 후 Background 로딩 트리거 |
| `local_dcm4chee.js` | 수정 | Server API 설정 활성화 |

### 테스트 결과

- htj2kConfig.test.ts: 53/53 통과
- htj2kDataMerger.test.ts: 31/31 통과
- htj2kBackgroundLoader.test.ts: 20/20 통과
- htj2kRangeRequestCore.test.ts: 16/16 통과

---

## 변경 이력

| 날짜 | 작업 내용 |
|------|----------|
| 2025-12-31 | 작업지시서 작성 |
| 2025-12-31 | Phase 1-6 구현 완료 |
| 2025-12-31 | Unit Test 작성 및 통과 확인 |
| 2025-12-31 | 빌드 검증 완료 |
| 2026-01-02 | 문서 정리 - 삭제된 문서 참조 업데이트 |
