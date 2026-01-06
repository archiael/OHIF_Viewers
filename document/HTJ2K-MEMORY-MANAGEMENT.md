# HTJ2K 메모리 관리 가이드

## 개요

OHIF Viewer에서 HTJ2K 이미지를 처리할 때 발생하는 메모리 관련 이슈와 해결 방안을 정리한 문서입니다.

---

## ⚠️ 절대 변경 금지 항목

### Stack Viewport의 decodeLevel (stackDecodeLevel: 0)

**Stack Viewport는 반드시 Level 0 (Full Resolution)으로 유지해야 합니다.**

```javascript
// local_dcm4chee.js
htj2k: {
  volumeDecodeLevel: 2,  // Volume: 1/4 해상도 (빠른 로딩)
  stackDecodeLevel: 0,   // ⚠️ Stack: 원본 해상도 - 절대 변경 금지!
}
```

**이유:**
- Stack Viewport는 Axial 슬라이스를 **원본 화질 그대로** 보기 위한 용도
- MPR (Volume)은 빠른 3D 렌더링을 위해 1/4 해상도 허용
- 하지만 Stack에서는 진단 품질의 원본 이미지가 필수

**메모리 문제 해결 시에도 stackDecodeLevel은 건드리지 말 것!**
- WASM 힙 문제 → `maxNumberOfWebWorkers`, `maxNumRequests` 조정
- 캐시 문제 → Volume 캐시 정리, Stack 스크롤 시 요청 큐 정리
- **stackDecodeLevel 변경은 해결책이 아님**

---

## 메모리 구조

### 1. Cornerstone 캐시 시스템

Cornerstone.js는 두 가지 주요 캐시를 관리합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Cornerstone Cache                        │
├─────────────────────────────────────────────────────────────┤
│  _imageCache (Map)           │  _volumeCache (Map)          │
│  - 개별 이미지 저장           │  - Volume 데이터 저장         │
│  - LRU 자동 정리 ✅           │  - 자동 정리 안됨 ❌          │
│  - decacheIfNecessary 적용   │  - 명시적 해제 필요           │
├─────────────────────────────────────────────────────────────┤
│  maxCacheSize: 설정 가능 (기본 3GB)                          │
│  현재 설정: 2GB (config에서 지정)                            │
└─────────────────────────────────────────────────────────────┘
```

### 2. WASM 디코더 힙 메모리

OpenJPH WASM 디코더는 별도의 힙 메모리를 사용합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                 OpenJPH WASM Heap                           │
├─────────────────────────────────────────────────────────────┤
│  - 고정 크기 힙 (컴파일 시 결정)                             │
│  - 동시 디코딩 시 힙 경쟁 발생                               │
│  - 힙 부족 시 abort() 호출 → RuntimeError                   │
│  - Cornerstone 캐시와 독립적                                 │
└─────────────────────────────────────────────────────────────┘
```

### 3. HTJ2K 데이터 캐시 (커스텀)

`htj2kBackgroundLoader.ts`에서 관리하는 별도 캐시:

```
┌─────────────────────────────────────────────────────────────┐
│                   HTJ2K Data Cache                          │
├─────────────────────────────────────────────────────────────┤
│  위치: extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts
│  - partialData: Range Request로 받은 부분 데이터             │
│  - fullData: 전체 HTJ2K 데이터                              │
│  - levelData: Server API Level 데이터                       │
│  - complementData: Server API Complement 데이터             │
│  - maxCacheSize: 200MB (기본값)                             │
│  - cleanupCacheForVolumeLoading(): Volume 로딩 전 정리       │
└─────────────────────────────────────────────────────────────┘
```

---

## 메모리 관리 전략

### 핵심 원칙

**HTJ2K 원본 데이터는 최대한 유지하고, 디코딩된 캐시만 정리**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      메모리 관리 우선순위                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [유지] HTJ2K 원본 데이터 (200MB 캐시)                                  │
│     └─ 네트워크 재요청 없이 재디코딩 가능                                │
│     └─ Stack ↔ Volume 전환 시 빠른 로딩                                 │
│     └─ 시리즈 전환 후 돌아와도 즉시 재디코딩                             │
│                                                                         │
│  [정리 1순위] Stack Image 캐시 (디코딩된 Full Resolution)                │
│     └─ HTJ2K 데이터로 다시 디코딩 가능                                  │
│     └─ LRU 자동 정리 (Cornerstone 원본)                                 │
│                                                                         │
│  [정리 2순위] Volume 캐시 (디코딩된 Level 2)                             │
│     └─ HTJ2K 데이터로 다시 디코딩 가능                                  │
│     └─ LRU 자동 정리 (패치 추가)                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 시나리오 예시

```
1. 시리즈 A 로딩
   └─ Volume (Level 2) 디코딩 → Volume 캐시에 저장
   └─ Stack (Full) 디코딩 → Image 캐시에 저장
   └─ HTJ2K 원본 데이터 → HTJ2K 캐시에 저장 ⭐

2. 시리즈 B 로딩 시 메모리 부족
   └─ Stack Image 캐시 정리 (LRU) - 시리즈 A의 Stack 해제
   └─ 그래도 부족하면 Volume 캐시 정리 - 시리즈 A의 Volume 해제
   └─ HTJ2K 원본 데이터는 유지! ⭐

3. 다시 시리즈 A로 전환
   └─ HTJ2K 캐시에서 원본 데이터 조회
   └─ 네트워크 요청 없이 즉시 재디코딩
   └─ 빠른 시리즈 전환!
```

### 구현 상태

| 기능 | 상태 | 위치 |
|------|------|------|
| HTJ2K 데이터 캐싱 | ✅ 완료 | `customWadorsLoader.ts` beforeProcessing 훅 |
| Stack에서 HTJ2K 캐시 사용 | ✅ 완료 | `customWadorsLoader.ts:354` |
| Image 캐시 LRU 정리 | ✅ 원본 | Cornerstone `decacheIfNecessaryUntilBytesAvailable` |
| Volume 캐시 자동 정리 | ✅ 패치 | `init.tsx` |
| Server API 데이터 캐싱 | ✅ 완료 | `customWadorsLoader.ts:715-727` |

---

## 주요 문제와 원인

### 문제 1: WASM 힙 메모리 부족

**에러 메시지:**
```
RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
Couldn't process because 411399112
```

**원인:**
1. 너무 많은 동시 디코딩 요청 (maxNumRequests가 너무 높음)
2. Full Resolution (Level 0) 디코딩은 Level 2 대비 16배 메모리 필요
3. 여러 WebWorker가 동시에 WASM 힙 메모리 경쟁

**스택 트레이스 특징:**
- `std::__2::vector`, `std::__2::__split_buffer` 등 C++ 메모리 할당 함수
- `operator new(unsigned long)` 실패
- WASM 메모리 주소 (숫자)가 에러 메시지에 포함

### 문제 2: Volume 캐시 자동 해제 안됨

**Cornerstone 캐시 동작 (cache.js):**

```javascript
// decacheIfNecessaryUntilBytesAvailable 함수
// ⚠️ Image 캐시만 정리, Volume은 건드리지 않음!

decacheIfNecessaryUntilBytesAvailable(numBytes, volumeImageIds) {
  // 1. sharedCacheKey가 없는 이미지만 필터링
  const cachedImages = Array.from(this._imageCache.values())
    .filter((cachedImage) => !cachedImage.sharedCacheKey);

  // 2. 오래된 이미지부터 제거 (LRU)
  cachedImages.sort(compare);

  // 3. Image만 제거, Volume은 유지!
  for (const imageId of imageIdsToPurge) {
    this.removeImageLoadObject(imageId);
    // ...
  }

  // ❌ _volumeCache는 건드리지 않음!
}
```

**결과:**
- 새 Volume 로딩 시 이전 Volume이 메모리에 남아있음
- `maxCacheSize`를 초과해도 Volume은 자동 해제되지 않음
- WASM 힙에서 새 Volume 디코딩 실패

---

## 해결 방안

### 1. Config 설정 최적화

**`platform/app/public/config/local_dcm4chee.js`:**

```javascript
{
  // Cornerstone 캐시 크기 (2GB)
  maxCacheSize: 2 * 1024 * 1024 * 1024,

  // WebWorker 수 제한 (WASM 힙 경쟁 방지)
  // ⚠️ Stack Level 0 디코딩 시 WASM 힙 메모리를 많이 사용하므로 1개로 제한
  maxNumberOfWebWorkers: 1,

  // 동시 요청 수 제한 (WASM 힙 안정성)
  // Stack Level 0 (Full 해상도) 디코딩 시 이미지당 ~50MB WASM 힙 사용
  maxNumRequests: {
    interaction: 2,    // Stack Level 0 디코딩용 (매우 낮게 설정)
    thumbnail: 4,      // 썸네일 로딩
    prefetch: 1,       // 백그라운드 프리로드
  },

  htj2k: {
    volumeDecodeLevel: 2,  // 1/4 해상도 (메모리 효율)
    stackDecodeLevel: 0,   // ⚠️ Full 해상도 - 절대 변경 금지!
  },
}
```

### 2. Volume 캐시 자동 해제 (Enhanced decacheIfNecessaryUntilBytesAvailable) ✅

**위치:** `extensions/cornerstone/src/init.tsx`

원본 Cornerstone의 `decacheIfNecessaryUntilBytesAvailable`는 Image 캐시만 정리하므로,
이를 monkey-patch하여 Image 정리 후에도 메모리가 부족하면 **Volume 캐시도 자동으로 정리**합니다.

```typescript
// extensions/cornerstone/src/init.tsx (약 86-155줄)

const originalDecacheIfNecessary = cornerstone.cache.decacheIfNecessaryUntilBytesAvailable.bind(
  cornerstone.cache
);

cornerstone.cache.decacheIfNecessaryUntilBytesAvailable = function (
  numBytes: number,
  volumeImageIds?: string[]
): number | undefined {
  // 1. 원본 함수 호출 (Image 캐시 정리)
  let bytesAvailable = originalDecacheIfNecessary(numBytes, volumeImageIds);

  // 2. 충분한 공간이 확보되었으면 반환
  if (bytesAvailable !== undefined && bytesAvailable >= numBytes) {
    return bytesAvailable;
  }

  // 3. Image 정리 후에도 부족하면 Volume 캐시 정리 (LRU)
  bytesAvailable = cornerstone.cache.getBytesAvailable();
  if (bytesAvailable < numBytes) {
    const volumeCache = (cornerstone.cache as any)._volumeCache;
    // 오래된 Volume부터 제거 (timestamp 기준 정렬)
    // 현재 로딩 중인 Volume은 보호 (volumeImageIds 파라미터)
    // ...
  }

  return cornerstone.cache.getBytesAvailable();
};
```

**동작 방식:**

```
┌─────────────────────────────────────────────────────────────┐
│           Enhanced decacheIfNecessaryUntilBytesAvailable    │
├─────────────────────────────────────────────────────────────┤
│  1. 원본 함수 호출                                          │
│     └─ Image 캐시 LRU 정리 (sharedCacheKey 없는 것만)        │
│                                                             │
│  2. 공간 충분? ─── Yes ──→ 반환                              │
│         │                                                   │
│         No                                                  │
│         ↓                                                   │
│  3. Volume 캐시 LRU 정리                                    │
│     └─ 오래된 Volume부터 제거                               │
│     └─ 현재 로딩 중인 Volume은 보호                         │
│                                                             │
│  4. 최종 가용 공간 반환                                     │
└─────────────────────────────────────────────────────────────┘
```

**장점:**
- ✅ 명시적 해제 코드 불필요 (자동)
- ✅ Cornerstone의 기존 메모리 관리 로직과 통합
- ✅ LRU 정책 일관성 유지
- ✅ 현재 로딩 중인 Volume 보호

**콘솔 로그:**
```
🧹 [Cache] Image decache insufficient (xxx < yyy), trying Volume decache...
🗑️ [Cache] Removing old volume: cornerstoneStreamingImageVolume:1.2.3...
✅ [Cache] Volume decache successful, available: zzz
```

### 3. Stack 스크롤 시 메모리 관리 ✅

**위치:** `modes/usmpr/src/index.tsx` (scrollListener 함수, 약 2011-2071줄)

Stack Viewport에서 스크롤할 때 WASM 힙 메모리 보호를 위한 두 가지 메커니즘:

**3-1. 요청 큐 정리**
```typescript
// 빠른 스크롤 시 수십 개의 이미지 요청이 큐에 쌓여 WASM 힙 폭발 방지
imageLoadPoolManager.clearRequestStack('interaction');
imageLoadPoolManager.clearRequestStack('prefetch');
```

**3-2. 먼 이미지 캐시 정리**
```typescript
// 현재 위치 ± 2 슬라이스만 캐시에 유지 (범위 축소: 5 → 2)
const shouldBeLoaded: Set<string> = new Set();
for (let offset = -2; offset <= 2; offset++) {
  const index = imageIdIndex + offset;
  if (index >= 0 && index < imageIds.length) {
    shouldBeLoaded.add(imageIds[index]);
  }
}

// 범위 외 이미지는 캐시에서 제거
loadedLevel0Images.forEach(imageId => {
  if (!shouldBeLoaded.has(imageId)) {
    cornerstoneCore.cache.removeImageLoadObject(imageId);
  }
});
```

**동작 방식:**
```
┌─────────────────────────────────────────────────────────────┐
│             Stack 스크롤 시 메모리 관리                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 요청 큐 정리 (imageLoadPoolManager.clearRequestStack)   │
│     └─ interaction, prefetch 요청 스택 모두 클리어          │
│     └─ 빠른 스크롤 시 대기 중인 디코딩 요청 취소            │
│                                                             │
│  2. 캐시 유지 범위 계산 (현재 위치 ± 2 슬라이스)             │
│     └─ 총 5개 이미지만 캐시에 유지                          │
│                                                             │
│  3. 범위 외 이미지 캐시에서 제거                            │
│     └─ removeImageLoadObject() 호출                         │
│     └─ loadedLevel0Images 추적 Set에서도 제거               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**콘솔 로그:**
```
[StackSync] 🗑️ Cleared 15 distant images from cache (keeping 5 near current position)
```

### 4. HTJ2K 캐시 정리

**`htj2kBackgroundLoader.ts`의 함수들:**

```typescript
// Volume 로딩 전 캐시 정리 (50% 이상 사용 시 30%로 정리)
cleanupCacheForVolumeLoading(50, 30);

// 시리즈 변경 시 다른 시리즈 캐시 정리
clearCacheForSeriesChange(currentSeriesUIDs);

// 전체 HTJ2K 캐시 클리어
clearHTJ2KCache();

// 캐시 상태 확인
const stats = getCacheStats();
console.log(`Cache: ${stats.currentSizeBytes} / ${stats.maxSizeBytes}`);
```

### 5. WASM 오류 시 재시도 로직 ✅

**위치:** `extensions/cornerstone/src/utils/decodeRetryManager.ts`

WASM 힙 메모리 부족 시 자동으로 재시도하는 로직:

```typescript
// WASM 메모리 오류 패턴 감지
const wasmErrorPatterns = [
  /Couldn't process because/i,
  /Couldn't decode/i,
  /RuntimeError: Aborted/i,
  /out of memory/i,
  /memory access out of bounds/i,
  /allocation failed/i,
  /Cannot enlarge memory/i,
];

// 지수 백오프 재시도 (200ms → 400ms → 800ms, 최대 3회)
export function withDecodeRetry<T>(imageId: string, loadFn: () => Promise<T>): Promise<T>
```

**위치:** `extensions/cornerstone/src/utils/customWadorsLoader.ts`

```typescript
// 이미지 로딩 시 WASM 오류 감지 및 재시도
const wrappedPromise = imageLoadObject.promise
  .then(processLoadedImage)
  .catch((error: any) => {
    if (isWasmMemoryError(error)) {
      return withDecodeRetry(modifiedImageId, retryLoad);
    }
    throw error;
  });
```

### 6. 시리즈 변경 시 Volume 캐시 정리 ✅

**위치:** `modes/usmpr/src/index.tsx` (VIEWPORTS_READY 이벤트 핸들러, 약 1265-1296줄)

```typescript
// 현재 시리즈에 속하지 않는 Volume만 제거
const volumesToRemove = volumes
  .filter((vol: any) => {
    if (!vol.volumeId) return false;
    const belongsToCurrentSeries = currentSeriesUIDs.some(uid => vol.volumeId.includes(uid));
    return !belongsToCurrentSeries;  // 현재 시리즈에 속하지 않으면 제거 대상
  })
  .map((vol: any) => vol.volumeId);

volumesToRemove.forEach((volumeId: string) => {
  cs3DCache.removeVolumeLoadObject(volumeId);
});
```

### 7. Drag & Drop 시 Volume 캐시 정리 ✅

**위치:** `extensions/default/src/customizations/onDropHandlerCustomization.ts`

```typescript
// 캐시에 실제로 존재하는 Volume만 필터링 후 제거
const cachedVolumeIds = new Set(
  (cache.getVolumes?.() || []).map((v: any) => v.volumeId)
);

volumeIdsToRemove.forEach(volumeId => {
  if (!cachedVolumeIds.has(volumeId)) {
    console.log(`ℹ️ [DRAG DROP CACHE] Volume not in cache, skipping: ${volumeId}`);
    return;
  }
  cache.removeVolumeLoadObject(volumeId);
});
```

---

## 메모리 관련 설정 요약

| 설정 | 위치 | 현재값 | 설명 |
|------|------|--------|------|
| `maxCacheSize` | config | 2GB | Cornerstone 캐시 최대 크기 |
| `maxNumberOfWebWorkers` | config | **1** | 동시 디코딩 워커 수 (WASM 힙 안정성) |
| `maxNumRequests.interaction` | config | **2** | Stack Level 0 디코딩용 (매우 낮게) |
| `maxNumRequests.thumbnail` | config | 4 | 썸네일 로딩 |
| `maxNumRequests.prefetch` | config | 1 | 백그라운드 프리로드 |
| `volumeDecodeLevel` | htj2k config | 2 | Volume 디코딩 레벨 (2=1/4 해상도) |
| `stackDecodeLevel` | htj2k config | **0** | ⚠️ Stack 디코딩 레벨 (절대 변경 금지!) |
| Stack 캐시 유지 범위 | scrollListener | ±2 | 현재 위치 기준 유지할 슬라이스 수 |
| HTJ2K Cache maxSize | htj2kBackgroundLoader | 200MB | HTJ2K 데이터 캐시 크기 |

---

## 디버깅 방법

### 1. Cornerstone 캐시 상태 확인

```javascript
// 브라우저 콘솔에서 실행
const cache = cornerstone.cache;

console.log('Cache Size:', cache.getCacheSize());
console.log('Max Size:', cache.getMaxCacheSize());
console.log('Available:', cache.getBytesAvailable());
console.log('Volumes:', cache.getVolumes().map(v => v.volumeId));
```

### 2. HTJ2K 캐시 상태 확인

```javascript
// htj2kConfig가 window에 노출된 경우
console.log('[HTJ2K-Config] currentConfig:', window.htj2kConfig);
```

### 3. 메모리 사용량 모니터링

```javascript
// Performance API 사용
if (performance.memory) {
  console.log('Used JS Heap:', performance.memory.usedJSHeapSize / 1024 / 1024, 'MB');
  console.log('Total JS Heap:', performance.memory.totalJSHeapSize / 1024 / 1024, 'MB');
}
```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `node_modules/@cornerstonejs/core/dist/esm/cache/cache.js` | Cornerstone 캐시 원본 구현 |
| `extensions/cornerstone/src/init.tsx` | **Volume 자동 해제 패치**, maxCacheSize 설정 |
| `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts` | HTJ2K 데이터 캐시 관리 |
| `extensions/cornerstone/src/utils/htj2kConfig.ts` | HTJ2K 설정 관리 |
| `extensions/cornerstone/src/utils/customWadorsLoader.ts` | 커스텀 이미지 로더 |
| `modes/usmpr/src/index.tsx` | 시리즈 변경 시 Stack 캐시 정리 |
| `platform/app/public/config/local_dcm4chee.js` | 메모리 관련 설정 |
| `platform/app/public/config/default.js` | 기본 메모리 설정 |
| `extensions/cornerstone/src/utils/cacheEnhancement.test.ts` | **메모리 관리 단위 테스트** |

---

## 테스트 코드

메모리 관리 로직의 정확성을 검증하기 위한 단위 테스트가 구현되어 있습니다.

**위치:** `extensions/cornerstone/src/utils/cacheEnhancement.test.ts`

**실행 방법:**
```bash
yarn test:unit extensions/cornerstone/src/utils/cacheEnhancement.test.ts
```

**테스트 항목:**

| 테스트 | 설명 |
|--------|------|
| 공간 충분 시 즉시 반환 | 메모리가 충분하면 캐시 정리 없이 반환 |
| Image 캐시 LRU 정리 | sharedCacheKey 없는 이미지부터 오래된 순서로 정리 |
| Volume 캐시 정리 | Image 정리 후에도 부족하면 Volume도 정리 |
| 현재 로딩 Volume 보호 | volumeImageIds 파라미터로 지정된 Volume은 보호 |
| LRU 순서 검증 | 오래된 Volume부터 먼저 제거됨 |
| HTJ2K 데이터 독립성 | Cornerstone 캐시 정리 시에도 HTJ2K 데이터는 유지 |
| 시리즈 전환 시나리오 | 시리즈 A → B 전환 시 A의 캐시 정리, B는 유지 |

**테스트 결과 (2025-01-05):** 7개 모두 통과 ✅

---

## 결론

1. ~~**Cornerstone은 Volume 캐시를 자동으로 해제하지 않음**~~ → **패치로 해결** ✅
   - `extensions/cornerstone/src/init.tsx`에서 `decacheIfNecessaryUntilBytesAvailable` 확장
   - Image 정리 후에도 부족하면 Volume도 LRU로 자동 정리

2. **WASM 힙 메모리는 Cornerstone 캐시와 독립적** → 동시 디코딩 수 극도로 제한 필요
   - `maxNumberOfWebWorkers: 1` (순차 디코딩으로 힙 경쟁 방지)
   - `maxNumRequests.interaction: 2` (Stack Level 0 디코딩은 메모리 많이 사용)

3. **HTJ2K Level 디코딩 전략**
   - `volumeDecodeLevel: 2` (1/4 해상도, 메모리 16배 절약)
   - `stackDecodeLevel: 0` ⚠️ **절대 변경 금지!** (원본 화질 필수)

4. **Stack 스크롤 시 메모리 관리** ✅
   - 요청 큐 정리: `imageLoadPoolManager.clearRequestStack()` 호출
   - 캐시 유지 범위: 현재 위치 ± 2 슬라이스만 유지 (나머지 제거)
   - WASM 힙 폭발 방지

5. **WASM 오류 시 재시도** ✅
   - `decodeRetryManager.ts`에서 WASM 메모리 오류 패턴 감지
   - 지수 백오프로 재시도 (200ms → 400ms → 800ms, 최대 3회)

---

## 관련 파일 (업데이트)

| 파일 | 역할 |
|------|------|
| `extensions/cornerstone/src/init.tsx` | **Volume 자동 해제 패치**, maxCacheSize 설정 |
| `extensions/cornerstone/src/utils/decodeRetryManager.ts` | **WASM 오류 재시도 로직** |
| `extensions/cornerstone/src/utils/customWadorsLoader.ts` | 커스텀 이미지 로더, 재시도 적용 |
| `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts` | HTJ2K 데이터 캐시 관리 |
| `extensions/cornerstone/src/utils/cacheEnhancement.test.ts` | 메모리 관리 단위 테스트 |
| `extensions/default/src/customizations/onDropHandlerCustomization.ts` | **Drag&Drop 시 Volume 캐시 정리** |
| `modes/usmpr/src/index.tsx` | **Stack 스크롤 메모리 관리**, 시리즈 변경 시 Volume 정리 |
| `platform/app/public/config/local_dcm4chee.js` | 메모리 관련 설정 |

---

## 🔬 WASM 힙 메모리 근본 원인 분석 (2025-01-05)

### 조사 결과

JavaScript 캐시를 아무리 정리해도 WASM 힙 메모리 오류가 계속 발생하는 근본 원인을 찾았습니다.

#### 문제 1: OpenJPH 디코더가 메모리를 해제하지 않음 ❌

**위치:** `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeHTJ2K.js`

```javascript
async function decodeAsync(compressedImageFrame, imageInfo) {
  await initialize();
  const decoder = new local.codec.HTJ2KDecoder();  // ← WASM 힙에 메모리 할당

  // ... 디코딩 수행 ...

  return { pixelData, ... };  // ← decoder.delete() 호출 없이 반환!
}
```

**문제:**
- 매번 새로운 `HTJ2KDecoder` 인스턴스 생성
- **`decoder.delete()` 호출 없음** → WASM 힙 메모리 누수
- Emscripten WASM 객체는 명시적으로 `delete()` 호출해야 메모리 해제
- GC가 JavaScript 래퍼를 정리해도 WASM 힙 메모리는 그대로 남음

### 디코더별 메모리 관리 분석

| 디코더 | WASM 사용 | 인스턴스 생성 패턴 | delete() 호출 | 상태 |
|--------|----------|-------------------|---------------|------|
| **decodeHTJ2K** | ✅ OpenJPH | 매번 `new HTJ2KDecoder()` | ❌ 없음 | **⚠️ 메모리 누수** |
| **decodeJPEG2000** | ✅ OpenJPEG | 싱글톤 `local.decoder` 재사용 | 불필요 | ✅ 정상 |
| **decodeJPEGLS** | ✅ CharLS | 싱글톤 `local.decoder` 재사용 | 불필요 | ✅ 정상 |
| **decodeJPEGLossless** | ❌ Pure JS | 매번 `new Decoder()` | 불필요 | ✅ JS GC 처리 |

**결론:** HTJ2K 디코더만 문제. 다른 WASM 디코더들은 싱글톤 패턴 사용으로 메모리 누수 없음.

#### 문제 2: JavaScript 캐시 정리와 WASM 힙은 독립적

```
┌─────────────────────────────────────────────────────────────┐
│                    JavaScript World                         │
├─────────────────────────────────────────────────────────────┤
│  Cornerstone Cache                                          │
│  - _imageCache: LRU 자동 정리 ✅                            │
│  - _volumeCache: 패치로 자동 정리 ✅                        │
│                                                             │
│  removeImageLoadObject() 호출 시                            │
│  → JavaScript 객체 해제                                     │
│  → BUT WASM 힙 메모리는 그대로! ❌                          │
└─────────────────────────────────────────────────────────────┘
                         ↕ (독립적)
┌─────────────────────────────────────────────────────────────┐
│                      WASM World                             │
├─────────────────────────────────────────────────────────────┤
│  OpenJPH WASM Heap (고정 크기)                              │
│  - 디코딩할 때마다 HTJ2KDecoder 인스턴스 생성               │
│  - delete() 호출 없이 누적                                  │
│  - 힙 가득 차면 → RuntimeError: memory access out of bounds │
└─────────────────────────────────────────────────────────────┘
```

### 해결책 조사 결과

#### 해결책 1: WASM 워커 재시작 (실현 가능 ✅)

**발견:** Cornerstone core에 `CentralizedWorkerManager` 클래스 존재

```typescript
import { getWebWorkerManager } from '@cornerstonejs/core';

// 워커 재시작으로 WASM 힙 리셋
function restartDecoderWorkers() {
  const workerManager = getWebWorkerManager();
  workerManager.terminate('dicomImageLoader');  // 모든 워커 종료
  // 다음 디코딩 요청 시 자동으로 새 워커 생성됨
}
```

**API 분석:**
- `terminate(workerName)`: 특정 워커 타입의 모든 인스턴스 종료
- `terminateWorkerInstance(workerName, index)`: 특정 워커 인스턴스만 종료
- `terminateIdleWorkers(workerName, idleTimeThreshold)`: 유휴 워커 자동 종료

**워커 이름:** `'dicomImageLoader'` (init.js에서 확인)

**장점:**
- ✅ WASM 힙 메모리 완전 리셋
- ✅ 공식 API 사용 (해킹 아님)
- ✅ 다음 디코딩 요청 시 자동으로 새 워커 생성

**단점:**
- ⚠️ 워커 재생성 시 OpenJPH WASM 초기화 필요 (수백ms)
- ⚠️ 진행 중인 디코딩 작업 중단됨
- ⚠️ 적절한 시점 선택 필요 (시리즈 전환 시?)

**워커 재시작 시간 (예상):**
- Worker 종료: ~10ms
- 새 Worker 생성: ~50ms
- OpenJPH WASM 초기화: ~200-500ms (첫 디코딩 시)
- **총: ~300-600ms** (사용자 체감 지연 있음)

#### 해결책 2: OpenJPH 디코더에 delete() 호출 추가 (근본 해결 ⭐)

**문제 위치:** `decodeHTJ2K.js` 내부 (node_modules)

```javascript
// 수정 필요한 코드 (현재)
async function decodeAsync(compressedImageFrame, imageInfo) {
  const decoder = new local.codec.HTJ2KDecoder();
  // ... 디코딩 ...
  return result;  // ❌ delete() 호출 없음
}

// 수정된 코드 (필요)
async function decodeAsync(compressedImageFrame, imageInfo) {
  const decoder = new local.codec.HTJ2KDecoder();
  try {
    // ... 디코딩 ...
    return result;
  } finally {
    decoder.delete();  // ✅ WASM 힙 메모리 해제
  }
}
```

**문제:**
- node_modules 내부 파일 직접 수정 불가
- @cornerstonejs/dicom-image-loader 패키지 자체 수정 필요
- 또는 patch-package로 패치 적용

### 적용된 해결 방안 ✅

#### 시리즈 전환 시 WASM 워커 재시작

**위치:** `modes/usmpr/src/index.tsx`

**patch-package 방식의 문제:**
- `decoder.delete()` 호출 시 WASM 버퍼가 무효화되어 두 번째 시리즈 이미지가 표시되지 않음
- 싱글톤 패턴도 Web Worker 환경에서 동시 디코딩 시 버퍼 충돌 문제 발생
- **결론:** decodeHTJ2K.js 직접 수정은 부작용이 큼

**워커 재시작 방식:**
- 시리즈 전환 시 `getWebWorkerManager().terminate('dicomImageLoader')` 호출
- WASM 워커가 종료되면서 WASM 힙 메모리 완전 해제
- 다음 디코딩 요청 시 새 워커 자동 생성 (WASM 재초기화)

```typescript
// modes/usmpr/src/index.tsx - 시리즈 변경 감지 시
import { getWebWorkerManager } from '@cornerstonejs/core';

if (seriesChanged) {
  // 🔄 [HTJ2K-WASM-RESET] WASM 워커 재시작으로 WASM 힙 메모리 완전 해제
  try {
    const workerManager = getWebWorkerManager();
    if (workerManager && typeof workerManager.terminate === 'function') {
      console.log('🔄 [HTJ2K-WASM-RESET] Terminating dicomImageLoader workers to reset WASM heap...');
      workerManager.terminate('dicomImageLoader');
      console.log('✅ [HTJ2K-WASM-RESET] Workers terminated, WASM heap will be reset on next decode');
    }
  } catch (e) {
    console.warn('[HTJ2K-WASM-RESET] Failed to terminate workers:', e);
  }

  // ... Volume 캐시 정리 등
}
```

**효과:**
- ✅ 시리즈 전환 시 WASM 힙 메모리 완전 리셋
- ✅ 기존 이미지 표시 기능에 영향 없음
- ✅ Cornerstone 공식 API 사용 (안정적)

**오버헤드:**
- ⚠️ 워커 재생성 시 ~300-600ms 지연 (첫 번째 이미지 로딩 시)
- WASM 재초기화가 필요하지만, 시리즈 전환은 자주 발생하지 않으므로 수용 가능

#### Stack 스크롤 중 WASM 오류 시 자동 워커 재시작

**문제:** 시리즈 전환 없이 Stack 스크롤만 해도 빠른 스크롤 시 WASM 힙 메모리 오류 발생

**해결:**
1. `loadImage.js`에서 디코딩 오류 발생 시 `htj2k-wasm-error` 커스텀 이벤트 발생
2. `decodeRetryManager.ts`에서 이벤트 수신하여 WASM 오류 카운터 증가
3. 연속 5회 오류 발생 시 워커 자동 재시작 (최소 3초 간격)

**구현 파일:**
- `patches/@cornerstonejs+dicom-image-loader+4.14.4.patch` - loadImage.js에 오류 감지 추가
- `extensions/cornerstone/src/utils/decodeRetryManager.ts` - 워커 재시작 로직
- `extensions/cornerstone/src/index.tsx` - 이벤트 리스너 설치

```typescript
// decodeRetryManager.ts
const WASM_ERROR_THRESHOLD = 5; // 연속 5회 오류 시 워커 재시작
const MIN_RESTART_INTERVAL_MS = 3000; // 최소 3초 간격

export function handleWasmError(): void {
  wasmErrorCount++;
  if (wasmErrorCount >= WASM_ERROR_THRESHOLD && (now - lastWorkerRestartTime) > MIN_RESTART_INTERVAL_MS) {
    workerManager.terminate('dicomImageLoader');
    wasmErrorCount = 0;
  }
}
```

**효과:**
- ✅ Stack 스크롤 중에도 WASM 힙 메모리 오류 자동 복구
- ✅ 불필요한 워커 재시작 방지 (임계치 및 최소 간격)
- ✅ Uncaught runtime error 화면 표시 최소화

### 시도했으나 실패한 방안

#### 1. patch-package로 decoder.delete() 추가 ❌

```javascript
// decodeHTJ2K.js - 시도했으나 실패
try {
    // ... 디코딩 ...
    const decodedBufferCopy = new Uint8Array(decodedBufferInWASM.length);
    decodedBufferCopy.set(decodedBufferInWASM);
    let pixelData = getPixelData(frameInfo, decodedBufferCopy);
    return result;
} finally {
    decoder.delete();  // ❌ 이후 두 번째 시리즈 이미지 표시 안됨
}
```

**실패 원인:** `decoder.delete()` 후 어떤 이유로 두 번째 시리즈 이미지가 표시되지 않음

#### 2. 싱글톤 패턴 (JPEGLS처럼) ❌

```javascript
// 싱글톤 디코더 재사용 시도
const decoder = local.decoder;  // initialize()에서 생성한 인스���스 재사용
```

**실패 원인:** Web Worker 환경에서 동시 디코딩 요청 시 싱글톤 내부 버퍼가 덮어써져 데이터 손상

### 대안 해결 방안 (참고)

| 방안 | 구현 난이도 | 효과 | 상태 |
|------|------------|------|------|
| 워커 재시작 (시리즈 전환 시) | 쉬움 | 중간 | ✅ 적용됨 |
| patch-package로 decodeHTJ2K 패치 | 중간 | - | ❌ 실패 (부작용) |
| Cornerstone에 PR 제출 | 어려움 | 최고 | 권장 (장기) |

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2025-01-05 | 문서 생성 |
| 2025-01-05 | Volume 자동 해제 패치 추가 (`init.tsx`) |
| 2025-01-05 | WASM 오류 재시도 로직 추가 (`decodeRetryManager.ts`) |
| 2025-01-05 | Stack 스크롤 시 요청 큐 정리 + 캐시 정리 추가 |
| 2025-01-05 | maxNumberOfWebWorkers: 1, maxNumRequests.interaction: 2로 축소 |
| 2025-01-05 | Drag&Drop 시 Volume 캐시 존재 확인 후 제거 로직 추가 |
| 2025-01-05 | 시리즈 변경 시 현재 시리즈 외 Volume 제거 로직 수정 |
| 2025-01-05 | **stackDecodeLevel: 0 절대 변경 금지** 명시 |
| 2025-01-05 | **WASM 힙 메모리 근본 원인 분석** - OpenJPH decoder.delete() 미호출 발견 |
| 2025-01-05 | **워커 재시작 API 조사** - getWebWorkerManager().terminate('dicomImageLoader') |
| 2025-01-05 | **디코더별 메모리 관리 분석** - HTJ2K만 문제, 다른 WASM 디코더는 싱글톤 패턴 사용 |
| 2025-01-05 | **❌ patch-package 패치 시도** - decoder.delete() 추가 → 두 번째 시리즈 이미지 표시 안됨 |
| 2025-01-05 | **❌ 싱글톤 패턴 시도** - 동시 디코딩 시 버퍼 충돌 문제 발생 |
| 2025-01-05 | **✅ 워커 재시작 방식 적용** - 시리즈 전환 시 `getWebWorkerManager().terminate('dicomImageLoader')` |
| 2025-01-06 | **✅ Stack 스크롤 WASM 오류 자동 복구** - 연속 5회 오류 시 워커 자동 재시작 |

---

## 📊 전체 메모리 흐름 분석 (2025-01-06)

### 3-Layer 캐시 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     3-Layer Cache Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 3: WASM Heap (OpenJPH) - 고정 크기                       │
│  ├── 컴파일 시 결정된 힙 크기                                    │
│  ├── decoder.delete() 미호출로 누수 ⚠️                           │
│  ├── JavaScript GC로 해제 불가                                   │
│  └── 워커 재시작만 리셋 가능                                     │
│                                                                  │
│  Layer 2: Cornerstone Cache - LRU 관리                          │
│  ├── _imageCache: 디코딩된 2D 이미지 (LRU 자동 정리 ✅)          │
│  ├── _volumeCache: 디코딩된 3D 볼륨 (패치로 자동 정리 ✅)        │
│  └── maxCacheSize: 2GB                                          │
│                                                                  │
│  Layer 1: HTJ2K Data Cache - 원본 보존                          │
│  ├── fullData: 완전한 HTJ2K 바이트스트림                         │
│  ├── levelData + complementData: Server API용                   │
│  └── maxCacheSize: 200MB (LRU)                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 데이터 로딩 흐름 (Local vs DICOMweb)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        데이터 로딩 흐름 비교                                │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────────┐       ┌─────────────────────┐                   │
│  │     Local 로딩       │       │   DICOMweb 로딩      │                   │
│  └──────────┬──────────┘       └──────────┬──────────┘                   │
│             │                             │                               │
│             ▼                             ▼                               │
│  ┌─────────────────────────────────────────────────────┐                 │
│  │              DicomLocalDataSource                    │                 │
│  │              DicomWebDataSource                      │                 │
│  │  - 메타데이터 조정 (getAdjustedImagePixelModule)     │                 │
│  │  - Rows/Columns ÷ 4 (Level 2 시)                    │                 │
│  │  - PixelSpacing × 4                                 │                 │
│  └──────────────────────┬──────────────────────────────┘                 │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐                 │
│  │              customWadorsLoader.ts                   │                 │
│  │  - Volume/Stack 판단 (hasTargetBuffer)              │                 │
│  │  - 캐시 조회 (Stack 시)                              │                 │
│  │  - Server API ?level=N 파라미터 추가 (Volume 시)    │                 │
│  │  - decodeLevel 강제 적용                            │                 │
│  └──────────────────────┬──────────────────────────────┘                 │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐                 │
│  │              beforeProcessing 훅                     │                 │
│  │  - 다운로드된 HTJ2K 데이터 캐싱                      │                 │
│  │  - Server API 지원 감지 (X-HTJ2K-Level 헤더)        │                 │
│  │  - Fallback 감지 (X-HTJ2K-Fallback 헤더)           │                 │
│  └──────────────────────┬──────────────────────────────┘                 │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐                 │
│  │              Web Worker (디코딩)                     │                 │
│  │  - decodeHTJ2K.js → OpenJPH WASM                    │                 │
│  │  - new HTJ2KDecoder() → WASM 힙 할당                │                 │
│  │  - decoder.delete() 미호출 ⚠️ → 메모리 누수         │                 │
│  └──────────────────────┬──────────────────────────────┘                 │
│                         │                                                 │
│                         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐                 │
│  │              Cornerstone Cache                       │                 │
│  │  - Volume → _volumeCache                            │                 │
│  │  - Image → _imageCache                              │                 │
│  └─────────────────────────────────────────────────────┘                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Local vs DICOMweb 상세 비교

| 단계 | Local | DICOMweb |
|------|-------|----------|
| **1. 메타데이터** | 파일에서 직접 파싱 | JSON 서버 조회 |
| **2. 메타데이터 조정** | `getAdjustedImagePixelModule()` | 동일 |
| **3. decodeLevel 적용** | `customWadorsLoader.ts` | 동일 |
| **4. 데이터 요청** | 파일 전체 읽기 | Range Request / Server API |
| **5. 캐싱** | `beforeProcessing` 훅 | 동일 |
| **6. 디코딩** | Web Worker → WASM | 동일 |
| **7. 인증** | 불필요 | Authorization 헤더 |

### 메모리 해제 시점

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        메모리 해제 타이밍                                   │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  시점 1: Volume 로딩 시작 시                                              │
│  ├── cleanupCacheForVolumeLoading(50, 30)                                │
│  └── HTJ2K 캐시 50% → 30%로 선제적 정리                                  │
│                                                                           │
│  시점 2: 새 이미지 로딩 시 메모리 부족                                    │
│  ├── decacheIfNecessaryUntilBytesAvailable() 호출                        │
│  ├── 1차: Image 캐시 LRU 정리 (Cornerstone 원본)                         │
│  └── 2차: Volume 캐시 LRU 정리 (패치, init.tsx)                          │
│                                                                           │
│  시점 3: 시리즈 변경 시                                                   │
│  ├── ❌ WASM 워커 재시작 - 비활성화 (Volume 로딩 중단 문제)               │
│  ├── 디코딩 카운터 리셋 (resetDecodeCount)                                │
│  ├── HTJ2K 캐시 정리 - 항상 실행 (이전 시리즈 캐시 제거)                  │
│  │   └── clearCacheForSeriesChange([newSeriesUID])                       │
│  └── Volume 캐시 정리 - 별도 로직 (removeVolumeLoadObject)               │
│                                                                           │
│  시점 4: Stack 스크롤 시                                                  │
│  ├── 요청 큐 정리 (clearRequestStack)                                    │
│  └── 현재 위치 ±2 슬라이스만 유지                                        │
│                                                                           │
│  시점 5: WASM 오류 연속 발생 시                                           │
│  ├── 5회 연속 오류 → 워커 자동 재시작                                    │
│  └── 최소 3초 간격 제한                                                  │
│                                                                           │
│  시점 6: 누적 디코딩 카운터 (모니터링만)                                  │
│  ├── incrementDecodeCount() → 카운터 증가만                               │
│  └── ⚠️ 워커 재시작 비활성화 (Volume 로딩 중단 문제)                      │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### decodeHTJ2K.js 상세 분석 (WASM 누수 원인)

```javascript
// node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeHTJ2K.js

async function decodeAsync(compressedImageFrame, imageInfo) {
  await initialize();

  // ⚠️ 매번 새 인스턴스 생성 - WASM 힙 할당
  const decoder = new local.codec.HTJ2KDecoder();

  // 인코딩된 데이터를 WASM 버퍼로 복사
  const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
  encodedBufferInWASM.set(compressedImageFrame);

  // 디코딩 수행 (decodeLevel 적용)
  decoder.decodeSubResolution(imageInfo.decodeLevel || 0);

  // 디코딩된 데이터를 JavaScript로 복사
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);
  imageFrame.set(decodedBufferInWASM);  // ← 복사본 생성

  // ... pixelData 생성 ...

  return { pixelData, ... };
  // ⚠️ decoder.delete() 호출 없음!
  // → WASM 힙에 할당된 메모리가 해제되지 않음
  // → JavaScript GC는 WASM 힙을 관리하지 않음
}
```

**문제점:**
1. `new HTJ2KDecoder()`로 WASM 힙에 메모리 할당
2. 디코딩 완료 후 `decoder.delete()` 미호출
3. JavaScript GC가 래퍼 객체를 정리해도 WASM 힙은 그대로
4. 누적되면 → `RuntimeError: memory access out of bounds`

### 다른 WASM 디코더와의 비교

| 디코더 | 파일 | WASM | 패턴 | delete() | 상태 |
|--------|------|------|------|----------|------|
| **HTJ2K** | decodeHTJ2K.js | OpenJPH | 매번 new | ❌ 없음 | **🚨 누수** |
| JPEG2000 | decodeJPEG2000.js | OpenJPEG | 싱글톤 | 불필요 | ✅ 정상 |
| JPEGLS | decodeJPEGLS.js | CharLS | 싱글톤 | 불필요 | ✅ 정상 |
| JPEGLossless | decodeJPEGLossless.js | Pure JS | 매번 new | 불필요 | ✅ GC 처리 |

**결론:** HTJ2K만 WASM 메모리 누수 문제가 있음.
- JPEG2000, JPEGLS는 싱글톤 패턴으로 디코더 재사용
- JPEGLossless는 Pure JavaScript라 GC가 처리

---

## 🔧 향후 개선 방안

### 방안 A: decoder.delete() 패치 재시도

```diff
// decodeHTJ2K.js 패치
async function decodeAsync(compressedImageFrame, imageInfo) {
  const decoder = new local.codec.HTJ2KDecoder();
+ try {
    // ... 디코딩 로직 ...
+   // 디코딩 결과를 JavaScript 메모리로 완전히 복사
+   const imageFrame = new Uint8Array(decodedBufferInWASM.length);
+   imageFrame.set(decodedBufferInWASM);
    return result;
+ } finally {
+   decoder.delete();  // WASM 힙 메모리 해제
+ }
}
```

**조사 필요:**
- `decoder.delete()` 후 왜 두 번째 시리즈가 안 보였는지
- `imageFrame.set()` 시점에 데이터 복사가 완료되었는지
- 비동기 처리 중 버퍼 무효화 문제는 없는지

### 방안 B: 싱글톤 + 락 패턴

```javascript
// JPEGLS처럼 싱글톤 사용하되, 동시 접근 방지
let decoderLock = Promise.resolve();

async function decodeAsync(compressedImageFrame, imageInfo) {
  await initialize();

  // 락 획득 (순차 디코딩 보장)
  decoderLock = decoderLock.then(async () => {
    const decoder = local.decoder;  // 싱글톤
    // ... 디코딩 ...
  });

  return decoderLock;
}
```

**문제:** 병렬 처리 성능 저하

### 방안 C: Cornerstone PR 제출 (권장)

- 공식 저장소에 `decoder.delete()` 추가 PR
- 또는 싱글톤 패턴으로 변경 제안
- 가장 근본적인 해결책

### 방안 D: WASM 힙 크기 증가

```bash
# OpenJPH 빌드 시 힙 크기 증가
emcc -s INITIAL_MEMORY=512MB -s MAXIMUM_MEMORY=1GB ...
```

**문제:** @cornerstonejs/codec-openjph 패키지 자체를 다시 빌드해야 함

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2025-01-05 | 문서 생성 |
| 2025-01-05 | Volume 자동 해제 패치 추가 (`init.tsx`) |
| 2025-01-05 | WASM 오류 재시도 로직 추가 (`decodeRetryManager.ts`) |
| 2025-01-05 | Stack 스크롤 시 요청 큐 정리 + 캐시 정리 추가 |
| 2025-01-05 | maxNumberOfWebWorkers: 1, maxNumRequests.interaction: 2로 축소 |
| 2025-01-05 | Drag&Drop 시 Volume 캐시 존재 확인 후 제거 로직 추가 |
| 2025-01-05 | 시리즈 변경 시 현재 시리즈 외 Volume 제거 로직 수정 |
| 2025-01-05 | **stackDecodeLevel: 0 절대 변경 금지** 명시 |
| 2025-01-05 | **WASM 힙 메모리 근본 원인 분석** - OpenJPH decoder.delete() 미호출 발견 |
| 2025-01-05 | **워커 재시작 API 조사** - getWebWorkerManager().terminate('dicomImageLoader') |
| 2025-01-05 | **디코더별 메모리 관리 분석** - HTJ2K만 문제, 다른 WASM 디코더는 싱글톤 패턴 사용 |
| 2025-01-05 | **❌ patch-package 패치 시도** - decoder.delete() 추가 → 두 번째 시리즈 이미지 표시 안됨 |
| 2025-01-05 | **❌ 싱글톤 패턴 시도** - 동시 디코딩 시 버퍼 충돌 문제 발생 |
| 2025-01-05 | **✅ 워커 재시작 방식 적용** - 시리즈 전환 시 `getWebWorkerManager().terminate('dicomImageLoader')` |
| 2025-01-06 | **✅ Stack 스크롤 WASM 오류 자동 복구** - 연속 5회 오류 시 워커 자동 재시작 |
| 2025-01-06 | **📊 전체 메모리 흐름 분석** - 3-Layer 아키텍처, Local/DICOMweb 비교, 해제 시점 정리 |
| 2025-01-06 | **❌ 주기적 워커 재시작 시도** - 100회 디코딩마다 워커 재시작 → Volume 로딩 중단 문제로 비활성화 |
| 2025-01-06 | **✅ HTJ2K 캐시 정리 적극화** - 시리즈 변경 시 항상 이전 시리즈 캐시 정리 (80% 조건 제거) |
| 2025-01-06 | **❌ 시리즈 변경 시 워커 재시작** - Volume 로딩 중단 문제로 비활성화 |
| 2025-01-06 | **✅ 병렬 처리 설정 복원** - maxNumberOfWebWorkers: 최대 8, maxNumRequests 증가 |
| 2025-01-06 | **✅ WASM 오류 자동 복구에 의존** - 연속 5회 오류 시에만 워커 재시작 (decodeRetryManager) |

---

*Last Updated: 2025-01-06*
