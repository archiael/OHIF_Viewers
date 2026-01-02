# HTJ2K Progressive Loading - 클라이언트 Fallback 구현 가이드

**작성일**: 2026-01-02
**대상**: OHIF Viewer / Cornerstone3D 클라이언트
**관련 Task**: Task #72 - HTJ2K Level API

---

## 1. 배경

### 서버 API 현황

mView 서버는 HTJ2K Progressive Loading을 위한 Level API를 제공합니다:

```
GET /dicomweb/studies/.../frames/1?level=2    → Level 2까지 추출
GET /dicomweb/studies/.../frames/1?complement=2  → Level 2 이후 데이터
```

### PLT 마커 의존성

| PLT 마커 | 서버 동작 | 클라이언트 처리 |
|---------|----------|----------------|
| ✅ 있음 | 정확한 Level 추출 (~100KB) | 그대로 디코딩 |
| ❌ 없음 | **전체 HTJ2K 반환** + `X-HTJ2K-Fallback: true` | **decodeSubResolution() 필요** |

**현재 테스트 이미지에는 PLT 마커가 없습니다.**

---

## 2. 서버 응답 형식

### PLT 있는 경우 (정상)

```http
HTTP/1.1 200 OK
Content-Type: image/jph; transfer-syntax="1.2.840.10008.1.2.4.202"
Content-Length: 102400
X-HTJ2K-Level: 2
X-HTJ2K-Original-Size: 655964
X-HTJ2K-Decomposition-Levels: 5
X-HTJ2K-Mode: level
X-HTJ2K-Fallback: false

[~100KB HTJ2K - Level 2까지만 포함된 완전한 코드스트림]
```

### PLT 없는 경우 (Fallback)

```http
HTTP/1.1 200 OK
Content-Type: image/jph; transfer-syntax="1.2.840.10008.1.2.4.202"
Content-Length: 655964
X-HTJ2K-Level: 2
X-HTJ2K-Original-Size: 655964
X-HTJ2K-Decomposition-Levels: 5
X-HTJ2K-Mode: level
X-HTJ2K-Fallback: true    ← 이 헤더가 핵심!

[~650KB HTJ2K - 전체 코드스트림]
```

---

## 3. 클라이언트 구현 요구사항

### 3.1 Fallback 감지

`X-HTJ2K-Fallback` 헤더를 확인하여 Fallback 모드인지 판단합니다.

```typescript
// XHR 응답에서 헤더 읽기
function detectFallbackFromXHR(xhr: XMLHttpRequest): boolean {
  const fallbackHeader = xhr.getResponseHeader('X-HTJ2K-Fallback');
  return fallbackHeader === 'true';
}

// Fetch API 사용 시
async function detectFallbackFromResponse(response: Response): boolean {
  return response.headers.get('X-HTJ2K-Fallback') === 'true';
}
```

### 3.2 Fallback 시 처리 로직

```typescript
interface Htj2kLoadResult {
  data: ArrayBuffer;
  isFallback: boolean;
  requestedLevel: number;
  decompositionLevels: number;
}

async function loadHtj2kFrame(
  url: string,
  level: number
): Promise<Htj2kLoadResult> {
  const response = await fetch(`${url}?level=${level}`, {
    headers: { 'Accept': 'image/jph' }
  });

  const isFallback = response.headers.get('X-HTJ2K-Fallback') === 'true';
  const decompositionLevels = parseInt(
    response.headers.get('X-HTJ2K-Decomposition-Levels') || '5'
  );

  return {
    data: await response.arrayBuffer(),
    isFallback,
    requestedLevel: level,
    decompositionLevels
  };
}
```

### 3.3 decodeSubResolution() 호출

Fallback 모드에서는 전체 HTJ2K 데이터를 받았으므로, 클라이언트에서 저해상도로 디코딩해야 합니다.

```typescript
import { OpenJPHDecoder } from '@cornerstonejs/codec-openjph';

async function decodeHtj2kWithFallback(
  result: Htj2kLoadResult
): Promise<ImageData> {
  const decoder = new OpenJPHDecoder();

  if (result.isFallback) {
    // Fallback: 전체 데이터를 저해상도로 디코딩
    // decodeSubResolution(data, level)은 level까지만 디코딩
    const skipResolutions = result.decompositionLevels - result.requestedLevel;
    return decoder.decodeSubResolution(result.data, skipResolutions);
  } else {
    // 정상: 서버가 이미 level 추출함, 전체 디코딩
    return decoder.decode(result.data);
  }
}
```

### 3.4 캐싱 전략

Fallback 시 전체 HTJ2K를 받았으므로, 캐시에 저장하여 재사용합니다.

```typescript
class Htj2kCache {
  private cache = new Map<string, ArrayBuffer>();

  async getOrLoad(
    instanceUID: string,
    url: string,
    level: number
  ): Promise<Htj2kLoadResult> {
    const cacheKey = `${instanceUID}:full`;

    // 이미 전체 데이터가 캐시에 있으면 재사용
    if (this.cache.has(cacheKey)) {
      return {
        data: this.cache.get(cacheKey)!,
        isFallback: true,  // 캐시된 데이터는 전체이므로 Fallback 처리
        requestedLevel: level,
        decompositionLevels: 5  // 메타데이터에서 가져오기
      };
    }

    const result = await loadHtj2kFrame(url, level);

    // Fallback이면 전체 데이터 캐싱
    if (result.isFallback) {
      this.cache.set(cacheKey, result.data);
    }

    return result;
  }

  // complement 요청 생략 (이미 전체 데이터 있음)
  needsComplement(instanceUID: string): boolean {
    return !this.cache.has(`${instanceUID}:full`);
  }
}
```

---

## 4. Volume Loading 시나리오

### 4.1 초기 로딩 (Level 2)

```typescript
async function loadVolumeInitial(
  instances: string[],
  level: number = 2
): Promise<void> {
  for (const instanceUID of instances) {
    const result = await htj2kCache.getOrLoad(instanceUID, getUrl(instanceUID), level);
    const imageData = await decodeHtj2kWithFallback(result);

    // Volume에 저해상도 이미지 추가
    volume.addSlice(instanceUID, imageData);
  }
}
```

### 4.2 고해상도 로딩 (Full Resolution)

```typescript
async function loadVolumeFullResolution(
  instances: string[]
): Promise<void> {
  for (const instanceUID of instances) {
    // Fallback이었으면 이미 전체 데이터가 캐시에 있음
    if (!htj2kCache.needsComplement(instanceUID)) {
      // 캐시된 전체 데이터로 전체 해상도 디코딩
      const result = await htj2kCache.getOrLoad(instanceUID, '', 999);
      const imageData = await decoder.decode(result.data);  // 전체 디코딩
      volume.updateSlice(instanceUID, imageData);
    } else {
      // PLT 있었던 경우: complement 요청
      const complement = await loadComplement(instanceUID, 2);
      const merged = mergeHtj2k(cached.levelData, complement);
      const imageData = await decoder.decode(merged);
      volume.updateSlice(instanceUID, imageData);
    }
  }
}
```

---

## 5. 체크리스트

### 필수 구현

- [x] `X-HTJ2K-Fallback` 헤더 읽기 - `htj2kConfig.ts:detectFallbackFromXHR()`
- [x] Fallback 시 전체 데이터 캐싱 - `htj2kBackgroundLoader.ts:cacheFullDataAsFallback()`
- [x] Fallback 시 complement 요청 생략 - `htj2kBackgroundLoader.ts:loadComplementData()` (status=complete면 skip)
- [x] 저해상도 디코딩 - `customWadorsLoader.ts`에서 `forcedDecodeLevel` 적용 (Fallback과 무관하게 항상 적용)

### 테스트 항목

- [ ] PLT 없는 이미지로 `?level=2` 요청
- [ ] 응답 헤더에서 `X-HTJ2K-Fallback: true` 확인
- [ ] 저해상도 이미지 정상 표시
- [ ] Stack 전환 시 고해상도 정상 표시

---

## 6. 관련 문서

- [REPORT-HTJ2K-PROGRESSIVE-LOADING.md](./REPORT-HTJ2K-PROGRESSIVE-LOADING.md) - 전체 경과 보고서
- [TASK-72-LEVEL2-MPR-VOLUME.md](./TASK-72-LEVEL2-MPR-VOLUME.md) - 메인 작업지시서
- [TASK-72-CLIENT-API-IMPLEMENTATION.md](./TASK-72-CLIENT-API-IMPLEMENTATION.md) - 클라이언트 API 구현

---

## 7. OpenJPH decodeSubResolution() 참고

### Cornerstone3D codec-openjph API

```typescript
// @cornerstonejs/codec-openjph 패키지
interface OpenJPHDecoder {
  // 전체 해상도 디코딩
  decode(data: ArrayBuffer): Promise<ImageData>;

  // 저해상도 디코딩 (skip N resolution levels)
  decodeSubResolution(data: ArrayBuffer, skipLevels: number): Promise<ImageData>;
}
```

### 해상도 계산

```
Decomposition Levels = 5 인 경우:

Level (서버) | decodeLevel (OpenJPH) | 해상도 비율 | 예: 512x512 원본
------------|----------------------|------------|------------------
5           | 0                    | 1/1        | 512x512 (Full)
4           | 1                    | 1/2        | 256x256
3           | 2                    | 1/4        | 128x128
2           | 3                    | 1/8        | 64x64
1           | 4                    | 1/16       | 32x32
0           | 5                    | 1/32       | 16x16 (최저)
```

**주의**: 서버 level과 OpenJPH decodeLevel은 반대 방향입니다!
- 서버 `level=2`: Level 0~2까지 포함 (저해상도 데이터)
- OpenJPH `decodeLevel=2`: 상위 2개 레벨 건너뛰기 (1/4 해상도 출력)

### Level ↔ decodeLevel 변환

```typescript
// 서버 level → OpenJPH decodeLevel
// 서버는 "몇 레벨까지 포함할지", OpenJPH는 "몇 레벨을 건너뛸지"
function serverLevelToDecodeLevel(serverLevel: number, decompositionLevels: number): number {
  // level=2, decompositionLevels=5 → decodeLevel = 5 - 2 - 1 = 2 → 1/4 해상도
  return decompositionLevels - serverLevel - 1;
}

// 예: serverLevel=2, decompositionLevels=5
// → decodeLevel = 5 - 2 - 1 = 2
// → 1/4 해상도로 디코딩 (상위 2개 레벨 건너뜀)
```

### 실제 사용 (htj2kConfig.ts 설정 기준)

```typescript
// config: volumeDecodeLevel: 2 (1/4 해상도 목표)
// 이 값은 OpenJPH의 decodeLevel과 동일하게 사용됨
//
// Volume 로딩 시:
// - 서버 요청: ?level=2 (Level 0~2 데이터 요청)
// - Fallback 시: decodeSubResolution(data, 2) → 1/4 해상도 디코딩
```

---

**Last Updated**: 2026-01-02
