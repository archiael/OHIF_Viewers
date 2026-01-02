# Task #72-3: 클라이언트 X-HTJ2K-Fallback 헤더 처리

**상태**: ✅ 구현 완료 (2026-01-02)
**우선순위**: High
**의존성**: 서버 PLT Fallback 수정 완료 (2026-01-02)
**작성일**: 2026-01-02

---

## 설계 원칙

### 호환성 요구사항

1. **표준 DICOMweb 서버 지원**: 커스텀 헤더가 없는 서버에서도 정상 동작
2. **커스텀 서버 최적화**: X-HTJ2K-* 헤더 지원 서버에서 추가 최적화
3. **Graceful Degradation**: 헤더가 없으면 기존 로직(데이터 크기 기반 판단)으로 Fallback

### 헤더 우선순위

```
1순위: X-HTJ2K-Fallback 헤더 확인 (있으면 신뢰)
2순위: X-HTJ2K-Original-Size vs Content-Length 비교
3순위: 데이터 크기 기반 추정 (기존 로직)
```

---

## 배경

서버 측 PLT Fallback 수정이 완료되었으나, 클라이언트에서 여전히 디코딩 오류 발생:

```
ojph info 0x00010002 at HTJ2KDecoder.hpp:41: v0.6 HTJ2K Decoder
Couldn't decode 411334808
[OHIF] Image load failed: 411334808
```

### 서버 응답 (정상)

```
HTTP/1.1 200
X-HTJ2K-Original-Size: 655964
X-HTJ2K-Decomposition-Levels: 5
X-HTJ2K-Fallback: true              ← 핵심: Fallback 발생
X-HTJ2K-Level: 2
X-HTJ2K-Mode: level
Content-Type: image/jph
Content-Length: 655964              ← 전체 HTJ2K 반환
```

---

## 문제 분석

### 현재 클라이언트 동작

1. `?level=2` 요청 → 서버가 전체 HTJ2K 반환 (655KB)
2. 클라이언트가 `X-HTJ2K-Fallback` 헤더를 **읽지 않음**
3. Level 데이터로 캐싱 (실제로는 전체 데이터)
4. 디코더가 Level 2 데이터로 기대하고 처리 → ???

### 코드 분석 결과

| 파일 | 현재 상태 | 문제점 |
|------|----------|--------|
| `htj2kConfig.ts` | `X-HTJ2K-Level` 헤더만 확인 | `X-HTJ2K-Fallback` 미확인 |
| `customWadorsLoader.ts` | `autoDetect: false`로 헤더 감지 비활성화 | 헤더 읽기 안함 |
| `htj2kBackgroundLoader.ts` | 데이터 크기로 Fallback 추정 | 헤더 기반 판단 아님 |

### 핵심 설정 문제

`local_dcm4chee.js`:
```javascript
serverApi: {
  enabled: true,
  autoDetect: false,  // ← 헤더 감지 비활성화됨
}
```

---

## 수정 방안

### 방안 1: autoDetect 활성화 (최소 수정)

```javascript
// local_dcm4chee.js
serverApi: {
  enabled: true,
  autoDetect: true,  // ← true로 변경
}
```

**장점**: 코드 수정 없음
**단점**: `X-HTJ2K-Fallback` 헤더를 별도로 처리하지 않음

### 방안 2: X-HTJ2K-Fallback 헤더 처리 추가 (권장)

#### 2-1. htj2kConfig.ts 수정

```typescript
/**
 * XHR 응답에서 Fallback 여부 감지
 *
 * 우선순위:
 * 1. X-HTJ2K-Fallback 헤더 (명시적)
 * 2. X-HTJ2K-Original-Size vs Content-Length 비교 (암묵적)
 * 3. null 반환 (판단 불가 - 기존 로직 사용)
 *
 * @returns true=Fallback, false=정상, null=판단불가
 */
export function detectFallbackFromXHR(xhr: XMLHttpRequest): boolean | null {
  try {
    // 1순위: X-HTJ2K-Fallback 헤더 (명시적)
    const fallbackHeader = xhr.getResponseHeader('X-HTJ2K-Fallback');
    if (fallbackHeader !== null) {
      return fallbackHeader === 'true';
    }

    // 2순위: X-HTJ2K-Original-Size vs Content-Length 비교
    const originalSize = xhr.getResponseHeader('X-HTJ2K-Original-Size');
    const contentLength = xhr.getResponseHeader('Content-Length');

    if (originalSize !== null && contentLength !== null) {
      // originalSize == contentLength → 전체 데이터 반환 (Fallback)
      return parseInt(originalSize) === parseInt(contentLength);
    }

    // 3순위: 판단 불가 (표준 DICOMweb 서버)
    return null;
  } catch (e) {
    // CORS 오류 등 - 판단 불가
    return null;
  }
}
```

#### 2-2. customWadorsLoader.ts 수정

```typescript
// installBeforeProcessingHook() 내부
if (xhr.status === 200 || xhr.status === 206) {
  const url = xhr.responseURL || '';
  const levelValue = extractLevelFromUrl(url);

  if (levelValue !== undefined) {
    const originalUrl = extractOriginalUrl(url);
    const originalImageId = `wadors:${originalUrl}`;

    // ✅ 추가: Fallback 감지 (헤더 기반)
    const fallbackResult = detectFallbackFromXHR(xhr);

    if (fallbackResult === true) {
      // 명시적 Fallback: 전체 HTJ2K를 fullData로 캐싱
      htj2kLog('customWadorsLoader', '⚠️ Server API Fallback detected (header)', {
        originalImageId: originalImageId.substring(0, 50),
        level: levelValue,
        size: response.byteLength,
      });
      cacheFullDataAsFallback(originalImageId, response);
    } else if (fallbackResult === false) {
      // 명시적 정상: Level 데이터로 캐싱
      cacheLevelData(originalImageId, response, levelValue);
    } else {
      // fallbackResult === null (표준 DICOMweb 서버)
      // 기존 로직: 일단 Level 데이터로 캐싱
      // Background loader에서 크기 비교로 Fallback 감지
      cacheLevelData(originalImageId, response, levelValue);
    }
  }
}
```

#### 2-3. htj2kBackgroundLoader.ts 수정

```typescript
/**
 * Fallback 시 전체 데이터 캐싱
 *
 * 서버가 PLT 없어서 전체 HTJ2K를 반환한 경우,
 * 이미 전체 데이터이므로 complement 요청 불필요
 */
export function cacheFullDataAsFallback(
  imageId: string,
  data: ArrayBuffer
): void {
  const entry: HTJ2KCacheEntry = {
    partialData: null,
    fullData: data,
    status: 'complete',  // ← 이미 전체 데이터
    totalBytes: data.byteLength,
    lastUpdated: Date.now(),
    levelData: data,     // Level 데이터도 동일
    levelValue: null,
    complementData: null,
    complementStatus: 'complete',  // complement 불필요
  };

  htj2kCache.entries.set(imageId, entry);
  htj2kCache.currentCacheSize += data.byteLength;

  htj2kLog('htj2kBackgroundLoader', '📦 Fallback: Full data cached (no complement needed)', {
    imageId: imageId.substring(0, 50),
    size: data.byteLength,
  });
}
```

#### 2-4. 기존 Fallback 감지 로직 유지 (htj2kBackgroundLoader.ts)

표준 DICOMweb 서버 지원을 위해 기존 크기 기반 감지 로직 유지:

```typescript
// loadComplementDataForImage() 내에서 기존 로직 유지
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
  // 기존 Fallback 처리 로직...
}
```

---

## 체크리스트

### 코드 수정

- [x] `htj2kConfig.ts`
  - [x] `detectFallbackFromXHR()` 함수 추가 (3단계 감지)
  - [x] export 추가

- [x] `customWadorsLoader.ts`
  - [x] `detectFallbackFromXHR` import
  - [x] `cacheFullDataAsFallback` import
  - [x] `installBeforeProcessingHook()`에서 Fallback 감지 분기 추가
  - [x] `true` → Fallback 캐싱, `false` → Level 캐싱, `null` → 기존 로직

- [x] `htj2kBackgroundLoader.ts`
  - [x] `cacheFullDataAsFallback()` 함수 추가
  - [x] export 추가
  - [x] 기존 크기 기반 Fallback 감지 로직 유지 (표준 DICOMweb 호환)

### 테스트 시나리오

| 서버 유형 | 헤더 | 감지 방법 | 예상 동작 |
|----------|------|----------|----------|
| mView 커스텀 (PLT 없음) | `X-HTJ2K-Fallback: true` | 1순위 헤더 | Fallback 캐싱 |
| mView 커스텀 (PLT 있음) | `X-HTJ2K-Fallback: false` | 1순위 헤더 | Level 캐싱 |
| 커스텀 (헤더 일부) | `X-HTJ2K-Original-Size` | 2순위 크기 비교 | 자동 감지 |
| 표준 DICOMweb | 없음 | 3순위 크기 추정 | 기존 로직 |

### 단위 테스트 ✅ (83/83 통과)

- [x] `detectFallbackFromXHR()` 테스트
  - [x] X-HTJ2K-Fallback: true → `true`
  - [x] X-HTJ2K-Fallback: false → `false`
  - [x] Original-Size == Content-Length → `true`
  - [x] Original-Size != Content-Length → `false`
  - [x] 헤더 없음 → `null`
  - [x] CORS 오류 시 → `null`
  - [x] 헤더 우선순위 테스트
- [x] `cacheFullDataAsFallback()` 테스트
  - [x] status가 'complete'인지
  - [x] complementStatus가 'complete'인지
  - [x] getFullResolutionData() 반환 확인

### 통합 테스트

- [ ] mView 커스텀 서버 (PLT 없는 이미지)
  - [ ] `X-HTJ2K-Fallback: true` 헤더 확인
  - [ ] Fallback 로그 출력 확인
  - [ ] complement 요청 없음 확인
  - [ ] Volume 렌더링 성공
- [ ] 표준 DICOMweb 서버 (dcm4chee 등)
  - [ ] 기존 동작 유지 확인
  - [ ] 에러 없이 로딩

---

## 예상 동작 흐름 (수정 후)

```
1. GET /frames/1?level=2
2. 서버 응답:
   - X-HTJ2K-Fallback: true
   - X-HTJ2K-Level: 2
   - Content-Length: 655964 (전체 HTJ2K)
3. 클라이언트:
   - X-HTJ2K-Fallback 헤더 확인 → true
   - cacheFullDataAsFallback() 호출
   - status: 'complete' 설정
4. 디코딩:
   - decodeSubResolution(2) 호출
   - 전체 HTJ2K에서 Level 2 해상도로 디코딩
5. Background:
   - complement 요청 생략 (이미 전체 데이터 있음)
6. Stack 스크롤 시:
   - 캐시된 전체 데이터로 decodeSubResolution(0) 호출
```

---

## 참고

- 서버 수정 내용: `PROMPT-SERVER-PLT-FALLBACK-FIX.md`
- 클라이언트 전체 구현: `TASK-72-CLIENT-API-IMPLEMENTATION.md`
