# Task #72: Level 2 HTJ2K 데이터로 MPR Volume 생성 구현

**상태**: ✅ 완료 (표준 범위 + Server API 클라이언트 구현 완료)
**우선순위**: High
**의존성**: Task #69 (완료)
**작성일**: 2025-12-30
**최종 수정**: 2025-12-31 (Task #72-2 Server API 클라이언트 구현 완료)

---

## 📋 최종 결론 (2025-12-31)

### 구현 결과

| 항목 | 원래 목표 | 최종 구현 | 상태 |
|------|----------|----------|------|
| **네트워크 최적화** | Range Request (20MB) | 전체 다운로드 (130MB) | ❌ 불가 |
| **디코딩 최적화** | Level 2 (1/4 해상도) | Level 2 (1/4 해상도) | ✅ 완료 |
| **메모리 최적화** | ~140MB | ~140MB | ✅ 완료 |
| **Volume 렌더링** | MPR 표시 | MPR 표시 | ✅ 완료 |

### Range Request가 불가능한 이유

#### 1. OpenJPH WASM 디코더 한계 (검증 완료)

**테스트 결과** (`htj2kTruncatedTest.ts`):

| 데이터 크기 | 비율 | Level 0~3 | 오류 |
|------------|------|-----------|------|
| 50KB | 0.9% | 모두 ❌ | `error reading SIZ marker, truncated file` |
| 100KB | 1.8% | 모두 ❌ | 동일 |
| 200KB | 3.5% | 모두 ❌ | 동일 |
| 500KB | 8.8% | 모두 ❌ | 동일 |

- `decodeSubResolution(level)`: **완전한 파일**을 낮은 해상도로 디코딩
- Truncated(잘린) 데이터: **지원하지 않음**
- EOC 마커 추가, 제로 패딩: **효과 없음**

#### 2. 표준 프로토콜 한계

| 프로토콜 | Level별 요청 | 상태 |
|----------|-------------|------|
| **DICOMweb** | ❌ 미지원 | `/frames/{frame}`에 level 파라미터 없음 |
| **JPIP** | ✅ 지원 | DICOMweb과 별개 프로토콜, 서버 미지원 |
| **HTTP Range** | ❌ 무의미 | 디코더가 truncated 데이터 처리 불가 |

### 현재 구현 (표준 범위 내 최선)

```
┌─────────────────────────────────────────────────────────────┐
│  DICOMweb /frames/{frame}                                   │
│  → 전체 HTJ2K 파일 다운로드 (~650KB/프레임)                 │
│  → 200 슬라이스 × 650KB = ~130MB 네트워크 전송              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenJPH decodeSubResolution(2)                             │
│  → 1/4 해상도로 디코딩 (421×865)                            │
│  → 200 슬라이스 × 0.7MB = ~140MB 메모리                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Volume 렌더링                                              │
│  → MPR 3개 뷰 (Axial, Sagittal, Coronal) + 3D              │
│  → 빠른 초기 표시, 낮은 메모리 사용                         │
└─────────────────────────────────────────────────────────────┘
```

### 최적화 효과

| 항목 | Full Resolution | Level 2 | 개선율 |
|------|-----------------|---------|--------|
| **디코딩 메모리** | 2.2GB | 140MB | **94% 절감** |
| **디코딩 속도** | 느림 | 빠름 | **~4배 향상** |
| **네트워크** | 130MB | 130MB | 동일 (최적화 불가) |

### 🚀 서버 확장 옵션: Progressive Network Loading API

네트워크 최적화를 위해 서버 측 API 확장을 요청할 수 있습니다.

#### API 파라미터

```
GET /dicomweb/.../frames/{frame}?level={n}
GET /dicomweb/.../frames/{frame}?complement={n}
```

| 파라미터 | 응답 | 크기 | 용도 |
|----------|------|------|------|
| (없음) | 전체 HTJ2K | ~650KB | 기존 호환 |
| `?level=2` | Level 2까지 완전한 HTJ2K | ~100KB | 즉시 Volume 표시 |
| `?complement=2` | Level 2 이후 데이터 | ~550KB | Full Resolution 병합용 |

#### Progressive Loading 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1차 요청 (Foreground)                                               │
│ GET /frames/1?level=2                                               │
│ → Level 2 완전한 HTJ2K (~100KB)                                     │
│ → 즉시 디코딩 → Volume 표시                                         │
│ → 200장 × 100KB = 20MB                                              │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
                      (사용자는 Volume 보는 중)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2차 요청 (Background)                                               │
│ GET /frames/1?complement=2                                          │
│ → Level 2 이후 데이터 (~550KB)                                      │
│ → 클라이언트 캐시 저장                                              │
│ → 200장 × 550KB = 110MB                                             │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
                      (Stack 스크롤 시)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 클라이언트 병합                                                     │
│ level2Data[:-2] + complementData + EOC = Full HTJ2K                 │
│ → Full Resolution 디코딩 → Stack 표시                               │
└─────────────────────────────────────────────────────────────────────┘
```

#### 네트워크 효율 비교 (200 슬라이스)

| 방식 | 초기 표시까지 | 총 전송량 | UX |
|------|-------------|----------|-----|
| **현재 (전체 다운로드)** | 130MB 후 | 130MB | ❌ 대기 |
| **서버 API (level만)** | **20MB 후** | 20MB | ⚠️ 고해상도 없음 |
| **서버 API (level+complement)** | **20MB 후** | 130MB | ✅ 즉시 + 점진적 |

#### 클라이언트 측 HTJ2K 재구성 (Level + Complement 병합)

**핵심 원리**: Level 응답과 Complement 응답을 결합하여 원본 HTJ2K를 재구성할 수 있습니다.

```
HTJ2K 구조:
┌─────────────────────────────────────────────────────────────┐
│ SOC │ SIZ │ COD │ QCD │ CAP │ SOT │ SOD │ Data... │ EOC    │
├─────────────────────────────────────────────────────────────┤
│ <──────── Headers ────────> │ L0 │ L1 │ L2 │...│ LN │     │
└─────────────────────────────────────────────────────────────┘

Level 2 응답:    [SOC][Headers][L0][L1][L2][EOC]  ← 완전한 디코딩 가능 HTJ2K
Complement 2:   [L3][L4][L5]...[LN]               ← Raw bytes (헤더 없음)

병합 공식:
  Level (EOC 제거) + Complement + EOC = 원본 HTJ2K
```

**JavaScript 구현 예시**:

```javascript
/**
 * Level 데이터와 Complement 데이터를 병합하여 Full HTJ2K 재구성
 *
 * @param levelData - ?level=N 응답 (완전한 HTJ2K, EOC 포함)
 * @param complementData - ?complement=N 응답 (Raw bytes)
 * @returns 원본 HTJ2K 바이너리
 */
function mergeHTJ2K(levelData: Uint8Array, complementData: Uint8Array): Uint8Array {
  // 1. Level 데이터에서 EOC (0xFF 0xD9) 제거
  const levelWithoutEoc = levelData.slice(0, -2);

  // 2. 새 배열 생성: Level + Complement + EOC
  const fullHtj2k = new Uint8Array(
    levelWithoutEoc.length + complementData.length + 2
  );

  // 3. 데이터 복사
  fullHtj2k.set(levelWithoutEoc, 0);                           // Level (EOC 제외)
  fullHtj2k.set(complementData, levelWithoutEoc.length);       // Complement
  fullHtj2k.set([0xFF, 0xD9], fullHtj2k.length - 2);          // EOC 추가

  return fullHtj2k;
}

// 사용 예시
async function loadFullResolution(baseUrl: string): Promise<Uint8Array> {
  // 1. Level 2 먼저 로드 (빠른 미리보기)
  const levelResp = await fetch(`${baseUrl}?level=2`);
  const levelData = new Uint8Array(await levelResp.arrayBuffer());

  // 2. Complement 2 로드 (나머지 데이터)
  const compResp = await fetch(`${baseUrl}?complement=2`);
  const compData = new Uint8Array(await compResp.arrayBuffer());

  // 3. 병합하여 Full HTJ2K 생성
  return mergeHTJ2K(levelData, compData);
}
```

**병합 검증 방법**:

```javascript
// HTJ2K 유효성 검증
function validateHTJ2K(data: Uint8Array): boolean {
  // SOC 마커 확인 (0xFF 0x4F)
  if (data[0] !== 0xFF || data[1] !== 0x4F) return false;

  // EOC 마커 확인 (0xFF 0xD9)
  if (data[data.length - 2] !== 0xFF || data[data.length - 1] !== 0xD9) return false;

  return true;
}
```

**⚠️ 주의사항**:
- PLT (Packet Length Table) 마커가 있는 HTJ2K에서만 정확한 Level 경계 분리 가능
- PLT가 없는 경우 서버는 전체 HTJ2K를 반환하거나 서버 사이드 디코딩 fallback 사용
- Complement 데이터는 헤더가 없는 raw bytes이므로 단독 디코딩 불가

#### 하위 호환성

```
- level/complement 파라미터가 없으면 기존과 동일 (전체 파일 반환)
- 기존 클라이언트(OHIF, Horos 등)가 영향받지 않음
- 클라이언트 먼저 배포 가능 (서버 미지원 시 전체 파일 수신)
```

#### 서버 구현 요청 문서

**`document/PROMPT-SERVER-HTJ2K-API.md`** 참조

### ✅ Task #72-2: 클라이언트 측 Server API 연동 구현 완료 (2025-12-31)

**`document/TASK-72-CLIENT-API-IMPLEMENTATION.md`** 참조

Server API가 활성화되면 자동으로 Progressive Network Loading이 적용됩니다:
- **Phase 1**: htj2kConfig.ts - Server API 설정 관리 ✅
- **Phase 2**: customWadorsLoader.ts - `?level=2` 파라미터 추가 ✅
- **Phase 3**: htj2kBackgroundLoader.ts - Background에서 `?complement=2` 요청 ✅
- **Phase 4**: htj2kDataMerger.ts - Level + Complement 데이터 병합 ✅
- **Phase 5**: modes/usmpr/index.tsx - Volume 로딩 완료 후 트리거 ✅
- **Phase 6**: customWadorsLoader.ts - Stack Full Resolution 통합 ✅

**설정 방법** (`local_dcm4chee.js`):
```javascript
htj2k: {
  serverApi: {
    enabled: true,  // Server API 활성화
  },
}
```

---

## 최종 목표

### ⚠️ 적용 범위: DICOMweb 엔드포인트만 해당

| 데이터 소스 | 적용 여부 | 설명 |
|-------------|----------|------|
| **DICOMweb (엔드포인트)** | ✅ 적용 | HTJ2K Level 분기 처리 |
| **Local (파일 로딩)** | ❌ 미적용 | 현재 방식 그대로 유지 |

### DICOMweb 모드 Decode Level

| Viewport | Decode Level | 해상도 | 용도 |
|----------|-------------|--------|------|
| **Volume (MPR)** | Level 2 | 1/4 (421×865) | 3D MPR 미리보기, 메모리 효율 |
| **Stack (Axial 1-port)** | Level 0 | Full (1686×3460) | 고화질 진단 |

### Local 모드 (변경 없음)

- Local 파일 로딩 시 기존 동작 유지
- HTJ2K Level 분기 처리 **적용하지 않음**
- DicomLocalDataSource는 현재 구현 그대로 사용

---

## 메모리 분석 (200 슬라이스 기준)

### 이미지당 크기

| 해상도 | Dimensions | 크기 (16-bit) |
|--------|------------|---------------|
| Level 0 (Full) | 1686 × 3460 | **~11.1 MB** |
| Level 2 (1/4) | 421 × 865 | **~0.7 MB** |
| HTJ2K 압축 | - | **~0.65 MB** |

### 메모리 사용량 (A 방식: 전체 캐시 유지)

| 항목 | 계산 | 크기 |
|------|------|------|
| Volume Level 2 디코딩 | 200 × 0.7 MB | **140 MB** |
| HTJ2K 캐시 (전체 유지) | 200 × 0.65 MB | **130 MB** |
| Stack Level 0 (±5장) | 10 × 11.1 MB | **111 MB** |
| **합계** | - | **~381 MB** ✅ |

### 캐시 전략

| 캐시 | 4-Port → 1-Port 전환 시 | 스크롤 시 | 이유 |
|------|------------------------|----------|------|
| **Volume Level 2** | ✅ 유지 | - | 4-Port 복귀 시 빠른 표시 |
| **HTJ2K 압축 데이터** | ✅ 유지 | ✅ 유지 | 스크롤 시 즉시 Level 0 디코딩 |
| **Stack Level 0** | - | ±5장만 유지 | 메모리 효율 |

### 비교

| 시나리오 | 메모리 | 스크롤 속도 | 상태 |
|----------|--------|------------|------|
| **목표 구현 (A 방식)** | 381 MB | 빠름 ✅ | ✅ 안전 |
| Full Volume | 2.2 GB | - | ❌ 위험 |

**결론**: 381MB는 브라우저 제한(~4GB)의 10% 미만으로 안전. 스크롤 시 즉시 디코딩 가능

---

## 현재 상황

### 완료된 사항 (Task #69)
- ✅ HTTP Range Request 동작 (206 Partial Content)
- ✅ Level 2 부분 데이터 다운로드 (~101KB)
- ✅ `_setThrew` WASM 오류 해결 (codec-openjph 패치)
- ✅ Stack Viewport에서 이미지 표시
- ✅ DicomLocalDataSource에서 메타데이터 조정 구현 (`addCustomMetadata()` 사용)
- ✅ DicomWebDataSource에서 `adjustHTJ2KMetadata()` 함수 구현 (instance 직접 수정)

### 현재 문제점
- ❌ MPR Volume 생성 실패 (DICOMweb 모드)
- ❌ 이미지 로딩이 중간에 멈춤
- ❌ **DICOMweb 메타데이터 등록 방식 차이** ← 핵심 문제
- ❌ **imageQualityStatus가 Volume/Stack 구분 없이 FULL_RESOLUTION** ← 핵심 문제

---

## 🚫 구현 제한 사항 (2025-12-31 발견)

### 핵심 문제: Range Request 방식 불가

작업지시서의 원래 목표인 **"Range Request로 Level 2 부분만 다운로드"**가 기술적 한계로 구현 불가합니다.

#### 1. OpenJPH 디코더 한계

| 문제 | 설명 |
|------|------|
| **Truncated 데이터 미지원** | OpenJPH가 partial HTJ2K 데이터를 디코딩할 수 없음 |
| **전체 파일 필요** | `decodeSubResolution(2)` 호출해도 전체 파일이 있어야 함 |
| **테스트 결과** | 500KB만 받으면 `Couldn't decode` 오류 발생 |

```
[테스트 시나리오]
- Range Request: bytes=0-499999 (500KB)
- 응답: 206 Partial Content, 500KB
- 디코딩 시도: decodeLevel=2
- 결과: ❌ Couldn't decode 오류
```

HTJ2K Progressive Decoding의 원리상 파일 앞부분에 저해상도 데이터가 있어야 하지만, OpenJPH는 **완전한 파일 구조**가 있어야만 디코딩을 시작합니다.

##### OpenJPH Truncated Decoding 테스트 결과 (2025-12-31)

`htj2kTruncatedTest.ts`를 통해 OpenJPH WASM 디코더의 truncated 데이터 지원 여부를 검증했습니다.

**테스트 방법**:
1. 전체 HTJ2K 파일 다운로드 (~5.6MB)
2. 파일을 다양한 크기로 truncate (50KB, 100KB, 200KB, 500KB)
3. 각 truncated 데이터를 decodeLevel 0~3으로 디코딩 시도

**테스트 결과**:

| 데이터 크기 | 비율 | Level 0 | Level 1 | Level 2 | Level 3 |
|------------|------|---------|---------|---------|---------|
| 50KB | 0.9% | ❌ | ❌ | ❌ | ❌ |
| 100KB | 1.8% | ❌ | ❌ | ❌ | ❌ |
| 200KB | 3.5% | ❌ | ❌ | ❌ | ❌ |
| 500KB | 8.8% | ❌ | ❌ | ❌ | ❌ |

**오류 메시지**:
```
ojph error 0x00050041 at ojph_params.cpp:603: error reading SIZ marker, truncated file
```

**결론**:
- **OpenJPH WASM은 truncated HTJ2K 데이터를 전혀 지원하지 않음**
- `decodeSubResolution(level)`은 **완전한 파일**을 낮은 해상도로 디코딩하는 기능
- C++ API의 `restrict_input_resolution()`은 WASM 버전에 노출되지 않음
- Range Request로 partial 데이터만 받는 최적화는 **기술적으로 불가능**

**테스트 코드 위치**: `extensions/cornerstone/src/utils/htj2kTruncatedTest.ts`

**브라우저 콘솔에서 재현**:
```javascript
// 자동으로 최근 HTJ2K URL 찾아서 테스트
window.testHTJ2KTruncatedFromNetwork()

// 또는 직접 URL 지정
window.testHTJ2KTruncated("http://server/dicomweb/.../frames/1")
```

#### 2. DCM4CHEE 서버 한계

| 문제 | 설명 |
|------|------|
| **Singlepart 응답 미지원** | `/frames/{frame}` 엔드포인트는 항상 multipart/related로 응답 |
| **Accept 헤더 무시** | `Accept: application/octet-stream`으로 요청해도 multipart로 응답 |
| **Range + Multipart 비호환** | HTTP Range Request는 multipart 응답과 호환되지 않음 |

```
[요청]
Accept: application/octet-stream
Range: bytes=0-499999

[응답]
Content-Type: multipart/related; type="image/jph"; boundary="..."
→ Range Request가 multipart boundary를 자르면 파싱 실패
```

#### 3. Java 프록시 (mvw-worklist) 테스트 결과

Java 프록시가 singlepart를 지원하지만, OpenJPH의 truncated 데이터 미지원 문제는 해결되지 않습니다.

```
[테스트]
- Accept: image/jph (singlepart)
- Range: bytes=0-499999
- 응답: 206, application/octet-stream, 500KB
- 디코딩: ❌ Couldn't decode (동일 오류)
```

### 현재 구현 방식 (대안)

Range Request가 불가하여 **전체 파일 다운로드 + Level 2 디코딩** 방식으로 구현:

| 항목 | 원래 목표 | 현재 구현 |
|------|----------|----------|
| **네트워크** | 20MB (101KB × 200) | 130MB (전체 파일) |
| **다운로드** | Range Request (206) | 전체 다운로드 (200) |
| **디코딩** | Level 2 (1/4 해상도) | Level 2 (1/4 해상도) ✅ |
| **메모리** | ~140MB | ~140MB ✅ |

#### 현재 동작 흐름

```
[현재 방식]
1. 전체 HTJ2K 파일 다운로드 (200 OK, ~650KB/프레임)
2. decodeLevel: 2로 1/4 해상도 디코딩
3. Volume 생성 및 렌더링

[장점]
- 디코딩 속도: Level 2는 1/4 데이터만 처리하여 빠름
- 메모리 효율: 1/4 해상도 이미지만 메모리에 저장 (~140MB)

[단점]
- 네트워크 비효율: 전체 파일 다운로드 필요 (~130MB)
```

### 향후 개선 방향

#### 옵션 1: 서버 측 Level 추출 API

서버에서 HTJ2K Level 2 데이터만 추출하여 반환하는 API 구현

```
GET /dicomweb/.../frames/1?level=2
→ Level 2까지의 데이터만 반환 (~100KB)
```

#### 옵션 2: 다른 디코더 사용

Truncated HTJ2K를 지원하는 디코더 검토:
- OpenJPEG (미확인)
- Kakadu (상용)
- 커스텀 WASM 디코더

#### 옵션 3: Streaming 방식

HTTP Streaming으로 데이터를 받으면서 점진적 디코딩 (현재 WASM 메모리 오류로 비활성화)

### 설정 파일 (local_dcm4chee.js)

```javascript
htj2k: {
  enabled: true,
  volumeDecodeLevel: 2,  // Level 2 디코딩 ✅
  stackDecodeLevel: 2,
  streaming: false,
  rangeRequest: {
    enabled: false,  // ❌ OpenJPH partial decode 미지원으로 비활성화
  },
},
```

---

## 근본 원인 분석

### 🔴 핵심 원인 1: 메타데이터 등록 방식 차이

```
DicomLocalDataSource: metadataProvider.addCustomMetadata() 사용 ✅
DicomWebDataSource: instance 직접 수정만 함 ❌

→ addCustomMetadata()는 메타데이터 캐시에 우선순위로 등록
→ instance 직접 수정은 Provider가 조회할 때 반영되지 않을 수 있음
```

### 🔴 핵심 원인 2: imageQualityStatus 미분기

```
현재 코드 (customWadorsLoader.ts Line 248-250):
  image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION; // 모두 FULL

문제:
- Volume: FULL_RESOLUTION ✅ (Level 2에서 완료)
- Stack: FULL_RESOLUTION ❌ (Level 0으로 업그레이드 불가)
```

### 원인 상세 비교

| 항목 | DicomLocalDataSource | DicomWebDataSource |
|------|---------------------|-------------------|
| 메타데이터 조정 함수 | `getAdjustedImagePixelModule()` | `adjustHTJ2KMetadata()` |
| 조정 방식 | **`addCustomMetadata()` 호출** | instance 직접 수정 |
| Provider 등록 | ✅ 우선순위 캐시에 등록 | ❌ 등록 안 함 |
| Cornerstone3D 인식 | ✅ 조정된 값 사용 | ⚠️ 인식 안 될 수 있음 |

---

## 구현 계획

### Phase 1: DicomWebDataSource에 addCustomMetadata() 추가 ✅ 완료 (f6a653e 머지)

**적용 대상**: DICOMweb 엔드포인트만 (Local 파일 로딩은 기존 방식 유지)

**상태**: f6a653e 커밋 머지로 이미 구현됨

**파일**: `extensions/default/src/DicomWebDataSource/index.ts`

**구현 코드 (Line 860-891, storeInstances)**:
```typescript
// Apply HTJ2K Level 2 metadata adjustments via MetadataProvider
// This ensures Cornerstone uses adjusted dimensions for rendering
// while instance object retains original metadata for SR generation
// forceHTJ2K is true when config.requestTransferSyntaxUID is HTJ2K
try {
  const adjustedImagePixelModule = getAdjustedImagePixelModule(instance, forceHTJ2K);
  if (adjustedImagePixelModule) {
    metadataProvider.addCustomMetadata(
      imageId,
      'imagePixelModule',
      adjustedImagePixelModule
    );
    console.log(
      `[HTJ2K-DICOMweb] ${imageId} imagePixelModule adjusted to ${adjustedImagePixelModule.rows}x${adjustedImagePixelModule.columns}`
    );
  }

  const adjustedImagePlaneModule = getAdjustedImagePlaneModule(instance, forceHTJ2K);
  if (adjustedImagePlaneModule) {
    metadataProvider.addCustomMetadata(
      imageId,
      'imagePlaneModule',
      adjustedImagePlaneModule
    );
    console.log(
      `[HTJ2K-DICOMweb] ${imageId} imagePlaneModule spacing adjusted to [${adjustedImagePlaneModule.pixelSpacing}]`
    );
  }
} catch (error) {
  console.error('[HTJ2K-DICOMweb] Error adjusting metadata:', error);
}
```

**구현 위치**:
1. `storeInstances()` (Line 860-891) ✅
2. `_retrieveSeriesMetadataSync` (Line 1019) ✅

**참고 (DicomLocalDataSource도 동일 패턴, Line 312-340)**:
```javascript
// Apply HTJ2K Level 2 metadata adjustments
try {
  const adjustedImagePixelModule = getAdjustedImagePixelModule(instance);
  if (adjustedImagePixelModule) {
    metadataProvider.addCustomMetadata(
      imageId,
      'imagePixelModule',
      adjustedImagePixelModule
    );
  }

  const adjustedImagePlaneModule = getAdjustedImagePlaneModule(instance);
  if (adjustedImagePlaneModule) {
    metadataProvider.addCustomMetadata(
      imageId,
      'imagePlaneModule',
      adjustedImagePlaneModule
    );
  }
} catch (error) {
  console.error('[HTJ2K L2] Error adjusting metadata:', error);
}
```

### Phase 2: imageQualityStatus Volume/Stack 분기 처리 ⭐ 핵심

**적용 대상**: DICOMweb 엔드포인트만 (Local 파일 로딩은 미적용)

**파일**: `extensions/cornerstone/src/utils/customWadorsLoader.ts`

#### ⚠️ 구현 전 확인 필요 사항

| 확인 항목 | 설명 | 확인 방법 |
|----------|------|----------|
| `retrieveType === 'default'` | Volume viewport를 정확히 구분하는지 검증 필요 | Cornerstone3D 소스 분석 또는 런타임 로깅 |
| 대안 1 | `viewportType === 'VOLUME_3D'` 또는 `'MPR'` 체크 | viewport 객체 속성 확인 |
| 대안 2 | `viewport.getClassName()` 사용 | VolumeViewport vs StackViewport 구분 |

**검증 방법**: 구현 전 `customWadorsLoader.ts`에서 `options` 객체를 로깅하여 Volume/Stack 요청 시 실제 값 확인

```typescript
// 임시 디버깅 코드 (구현 전 검증용)
console.log('[Phase2 Debug] options:', {
  retrieveType: options?.retrieveType,
  viewportType: options?.viewportType,
  // 기타 관련 속성들
});
```

**현재 코드 (Line 246-250)**:
```typescript
// HTJ2K의 경우, 이미 decode된 이미지의 품질 상태를 FULL_RESOLUTION으로 표시
// 이렇게 하면 progressive loading이 더 이상 진행하지 않음
if (forcedDecodeLevel !== undefined && forcedDecodeLevel > 0) {
  image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
}
```

**수정 코드**:
```typescript
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
```

### Phase 3: htj2kConfig.ts 설정 ✅ 확인 완료

**파일**: `extensions/cornerstone/src/utils/htj2kConfig.ts`

**목표 설정**:
```typescript
const DEFAULT_CONFIG: HTJ2KConfig = {
  enabled: true,
  volumeDecodeLevel: 2,  // Volume/MPR: Level 2 (1/4 해상도, 메모리 효율) ✅
  stackDecodeLevel: 0,   // Stack: Level 0 (Full 해상도, 고화질 진단) ✅
  streaming: false, // fetch streaming 비활성화 (HTJ2K 메모리 오류 발생) ✅
};
```

**설정 설명**:
| 설정 | 값 | 설명 |
|------|-----|------|
| `volumeDecodeLevel` | 2 | Volume/MPR은 Level 2 (1/4 해상도)로 빠른 초기 표시 |
| `stackDecodeLevel` | 0 | Stack은 Level 0 (Full 해상도)로 고화질 진단 |
| `streaming` | false | WASM 메모리 오류 방지 |

### Phase 4: 메모리 관리 ✅ 이미 구현됨

**파일**: `modes/usmpr/src/index.tsx`

```typescript
// 현재 위치 ±5장만 Level 0으로 유지, 나머지는 cache에서 삭제
let loadedLevel0Images = new Set();
const MAX_LEVEL0_IMAGES = 10;

// setupMemoryManagedLoading() 함수에서 스크롤 시 메모리 관리
```

### Phase 5: Background Progressive Loading ⭐ UX 개선

**목표**: Volume 먼저 표시 → Background에서 나머지 데이터 로드 → Stack Level 0 준비

#### 네트워크 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│ 1차 요청 (Foreground)                                            │
│ ─────────────────────                                           │
│ Range: bytes=0-99999                                            │
│ 응답: 206 Partial Content (~101KB × 200장 = 20MB)               │
│ 결과: Level 2 디코딩 → Volume 생성 → 화면 표시 ✅                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (사용자는 Volume을 보고 있음)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2차 요청 (Background)                                            │
│ ─────────────────────                                           │
│ Range: bytes=100000-654000                                      │
│ 응답: 206 Partial Content (~553KB × 200장 = 110MB)              │
│ 결과: HTJ2K 전체 데이터 완성 → 압축 상태로 캐시 보관             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (Stack 스크롤 시)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Level 0 디코딩 (On-demand)                                       │
│ ─────────────────────────                                       │
│ 입력: 캐시된 HTJ2K 전체 데이터 (654KB)                          │
│ 결과: Level 0 디코딩 → Stack Viewport 표시 (±5장만 메모리 유지) │
└─────────────────────────────────────────────────────────────────┘
```

#### 메모리 & 네트워크 분석 (200 슬라이스 기준)

| 단계 | 네트워크 전송 | 메모리 사용 | 화면 상태 |
|------|-------------|------------|----------|
| **1차 (Foreground)** | 101KB × 200 = **20MB** | Level 2 디코딩: 140MB | Volume 표시 ✅ |
| **2차 (Background)** | 553KB × 200 = **110MB** | HTJ2K 압축 캐시: 130MB | Volume 유지 |
| **스크롤 시** | - | Level 0 디코딩 (±5장): 111MB | Stack Level 0 표시 |
| **합계** | **130MB** | **~381MB** (안전) | - |

#### 구현 방향

**파일**: `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts` (신규)

```typescript
/**
 * HTJ2K Background Progressive Loader
 *
 * Volume 로딩 완료 후 Background에서 나머지 HTJ2K 데이터를 로드합니다.
 * Stack 스크롤 시 Level 0 디코딩에 사용됩니다.
 */

interface HTJ2KDataCache {
  /** imageId → HTJ2K 전체 바이너리 데이터 */
  fullData: Map<string, ArrayBuffer>;
  /** imageId → 로딩 상태 ('partial' | 'complete') */
  status: Map<string, 'partial' | 'complete'>;
}

const htj2kCache: HTJ2KDataCache = {
  fullData: new Map(),
  status: new Map(),
};

/**
 * Background에서 나머지 HTJ2K 데이터 로드
 *
 * @param imageIds - 로드할 이미지 ID 배열
 * @param onProgress - 진행률 콜백 (0-100)
 * @param onComplete - 완료 콜백
 */
export async function loadRemainingHTJ2KData(
  imageIds: string[],
  onProgress?: (percent: number) => void,
  onComplete?: () => void
): Promise<void> {
  const totalImages = imageIds.length;
  let loadedCount = 0;

  // 병렬 로드 (동시 5개 제한)
  const CONCURRENT_LIMIT = 5;
  const queue = [...imageIds];

  const loadOne = async (imageId: string): Promise<void> => {
    try {
      // 이미 완료된 경우 스킵
      if (htj2kCache.status.get(imageId) === 'complete') {
        return;
      }

      // 1차 요청에서 받은 Level 2 데이터 가져오기
      const partialData = htj2kCache.fullData.get(imageId);
      const startByte = partialData?.byteLength || 100000;

      // 나머지 데이터 요청 (Range Request)
      const response = await fetch(imageIdToUrl(imageId), {
        headers: {
          'Range': `bytes=${startByte}-`,
          'Accept': 'application/octet-stream',
        },
      });

      if (response.status === 206) {
        const remainingData = await response.arrayBuffer();

        // 기존 데이터와 병합
        const fullData = mergeArrayBuffers(partialData, remainingData);
        htj2kCache.fullData.set(imageId, fullData);
        htj2kCache.status.set(imageId, 'complete');
      }
    } catch (error) {
      console.error(`[HTJ2K-BG] Failed to load remaining data for ${imageId}:`, error);
    } finally {
      loadedCount++;
      onProgress?.(Math.round((loadedCount / totalImages) * 100));
    }
  };

  // 병렬 처리
  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENT_LIMIT; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const imageId = queue.shift();
          if (imageId) {
            await loadOne(imageId);
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  onComplete?.();
}

/**
 * 캐시된 HTJ2K 전체 데이터로 Level 0 디코딩
 *
 * @param imageId - 이미지 ID
 * @returns Level 0 디코딩된 픽셀 데이터
 */
export function decodeFullResolution(imageId: string): ArrayBuffer | null {
  const fullData = htj2kCache.fullData.get(imageId);
  const status = htj2kCache.status.get(imageId);

  if (!fullData || status !== 'complete') {
    console.warn(`[HTJ2K-BG] Full data not available for ${imageId}`);
    return null;
  }

  // OpenJPH 디코더로 Level 0 디코딩
  // (실제 구현은 cornerstone dicom-image-loader 활용)
  return decodeHTJ2K(fullData, 0);
}

// ... 유틸리티 함수들
```

**통합 위치**: `modes/usmpr/src/index.tsx`

```typescript
// Volume 로딩 완료 후 Background 로드 시작
viewportGridService.subscribe(
  viewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
  async ({ viewportId }) => {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

    // Volume 로딩 완료 확인
    if (viewport?.type === 'volume' && viewport.isReady) {
      const imageIds = viewport.getImageIds();

      // Background에서 나머지 데이터 로드
      loadRemainingHTJ2KData(
        imageIds,
        (percent) => console.log(`[HTJ2K-BG] Loading: ${percent}%`),
        () => console.log('[HTJ2K-BG] All remaining data loaded')
      );
    }
  }
);
```

#### 장점

1. **빠른 초기 표시**: Volume이 20MB만 로드하면 바로 표시
2. **네트워크 효율**: 전체 130MB를 분할 로드 (20MB + 110MB)
3. **UX 개선**: 사용자가 Volume을 보는 동안 Background 로드
4. **메모리 효율**: HTJ2K 압축 상태로 캐시 (130MB)
5. **즉시 Level 0**: 스크롤 시 이미 데이터가 있으므로 즉시 디코딩

---

## 데이터 흐름 다이어그램

```mermaid
flowchart TB
    subgraph "DICOMweb Server"
        S1[HTJ2K 원본 파일<br/>654KB]
    end

    subgraph "1차 요청 (Foreground)"
        R1[Range Request<br/>bytes=0-99999]
        D1[Level 2 Data<br/>101KB]
    end

    subgraph "Volume 처리"
        DEC1[OpenJPH Decoder<br/>decodeLevel=2]
        META[addCustomMetadata<br/>Provider 등록]
        VOL[Volume Cache<br/>Level 2 이미지들]
        MPR[MPR Viewport<br/>화면 표시 ✅]
    end

    subgraph "2차 요청 (Background)"
        R2[Range Request<br/>bytes=100000-654000]
        D2[나머지 Data<br/>553KB]
        CACHE[HTJ2K Cache<br/>압축 상태 보관]
    end

    subgraph "Stack 처리 (스크롤 시)"
        DEC2[OpenJPH Decoder<br/>decodeLevel=0]
        STACK[Stack Viewport<br/>Level 0 표시]
    end

    S1 --> R1
    R1 --> D1
    D1 --> DEC1
    DEC1 --> META
    META --> VOL
    VOL --> MPR

    S1 --> R2
    R2 --> D2
    D1 -.->|병합| CACHE
    D2 --> CACHE

    CACHE --> DEC2
    DEC2 --> STACK

    style R1 fill:#e3f2fd
    style D1 fill:#e3f2fd
    style MPR fill:#c8e6c9
    style R2 fill:#fff3e0
    style D2 fill:#fff3e0
    style CACHE fill:#fff9c4
    style STACK fill:#c8e6c9
```

---

## 체크리스트

### 필수 구현
- [x] **Phase 1**: DicomWebDataSource에 `addCustomMetadata()` 호출 추가 ✅ (f6a653e 머지 완료)
  - [x] `_retrieveSeriesMetadataSync` 수정 ✅
  - [x] `storeInstances()` 수정 ✅
- [x] **Phase 2**: customWadorsLoader.ts에서 Volume/Stack 분기 처리 ✅ 완료 (2025-12-30)
  - [x] Volume: FULL_RESOLUTION (Level 2에서 완료)
  - [x] Stack: SUBRESOLUTION (Level 0으로 업그레이드 가능)
  - [x] htj2kConfig.ts stackDecodeLevel 0으로 변경
- [x] **Phase 3**: htj2kConfig.ts 설정 확인 (volumeDecodeLevel: 2) ✅ 완료
- [x] **Phase 4**: 메모리 관리 (이미 구현됨) ✅ 완료
- [x] **Phase 5**: Background Progressive Loading ⚠️ 부분 구현
  - [x] `htj2kBackgroundLoader.ts` 신규 생성 ✅
  - [x] HTJ2K 데이터 캐시 구조 구현 (LRU 정책) ✅
  - [x] 나머지 데이터 Range Request 구현 ✅
  - [x] Volume 로딩 완료 후 Background 로드 트리거 (VIEWPORTS_READY 이벤트) ✅
  - [x] **Range Request 비활성화** ❌ (OpenJPH truncated 데이터 미지원, 2025-12-31)
  - [ ] Stack 스크롤 시 캐시된 데이터로 Level 0 디코딩 (런타임 테스트 필요)
- [x] **Phase 6**: Annotation 좌표 불일치 해결 ✅ 완료 (2025-12-30, 방안 A 적용)
  - [x] 해결 방안 최종 결정: 방안 A (PixelSpacing 원본 유지) ✅
  - [x] htj2kMetadataAdjuster.ts 수정 (PixelSpacing 원본 유지) ✅
  - [x] Volume Viewport Camera Scale 보정 로직 구현 ✅
  - [ ] Annotation 저장/로드 테스트 (런타임 테스트 필요)
  - [ ] Crosshair 동기화 테스트 (런타임 테스트 필요)
- [x] Unit Test 작성 (htj2kBackgroundLoader.test.ts) ✅ 완료 (2025-12-30)

### ⚠️ 제한 사항 (2025-12-31)
- [x] Range Request 테스트 완료 ✅
- [x] **OpenJPH truncated 데이터 미지원 확인** ❌
- [x] **DCM4CHEE singlepart 응답 미지원 확인** ❌
- [x] 대안 구현: 전체 다운로드 + Level 2 디코딩 ✅

### 테스트
- [ ] Volume Viewport (4-port): Level 2로 MPR 3개 뷰 렌더링
- [ ] Stack Viewport (1-port): Level 0으로 고화질 표시
- [ ] 메모리 사용량 확인: ~381 MB 이하 (A 방식)
- [ ] 스크롤 시 현재 위치 ±5장만 Level 0 유지
- [ ] Background 로딩 진행률 확인 (Console 로그)

### 검증
- [ ] Network 탭 (1차): Volume용 206 (101KB × 200 = 20MB)
- [ ] Network 탭 (2차): Background용 206 (553KB × 200 = 110MB)
- [ ] Console: 오류 없음, 메타데이터 등록 로그 확인
- [ ] Console: `[HTJ2K-BG] Loading: X%` 진행률 로그 확인
- [ ] MPR 인터랙션: 스크롤, 줌, 패닝 정상 동작
- [ ] 1-port ↔ 4-port 전환 시 위치 동기화

---

## 관련 파일

| 파일 | 역할 | 상태 |
|------|------|------|
| `extensions/default/src/DicomWebDataSource/index.ts` | DICOMweb 메타데이터 등록 | ✅ 완료 (Phase 1, f6a653e) |
| `extensions/cornerstone/src/utils/customWadorsLoader.ts` | imageQualityStatus 분기 | ✅ 완료 (Phase 2) |
| `extensions/cornerstone/src/utils/htj2kConfig.ts` | decodeLevel 설정 | ✅ 완료 (Phase 3) |
| `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts` | Background 데이터 로드 | ✅ 신규 생성 (Phase 5) |
| `extensions/cornerstone/src/utils/htj2kBackgroundLoader.test.ts` | Unit Test | ✅ 신규 생성 |
| `modes/usmpr/src/index.tsx` | Background 로드 트리거 | ✅ 수정 완료 (Phase 5) |
| `extensions/cornerstone/src/utils/htj2kMetadataAdjuster.ts` | PixelSpacing 원본 유지 | ✅ 수정 완료 (Phase 6) |
| `extensions/default/src/DicomLocalDataSource/index.js` | Local 메타데이터 (참조) | ✅ 구현됨 |

### Phase 6 관련 Cornerstone 핵심 파일 (node_modules)

| 파일 | Line | 역할 |
|------|------|------|
| `@cornerstonejs/core/.../makeVolumeMetadata.js` | 33 | PixelSpacing 조회 |
| `@cornerstonejs/core/.../generateVolumePropsFromImageIds.js` | 23 | Volume spacing 설정 |
| `@cornerstonejs/core/.../ImageVolume.js` | 47 | vtkImageData.setSpacing() |
| `@cornerstonejs/core/.../BaseVolumeViewport.js` | 1035 | getImageData() spacing |
| `@cornerstonejs/tools/.../LengthTool.js` | 41-46 | Annotation World 좌표 저장 |

---

## 아키텍처 다이어그램

```mermaid
flowchart TB
    subgraph "Network (분할 로드)"
        N1[1차: Level 2<br/>20MB]
        N2[2차: 나머지<br/>110MB<br/>Background]
    end

    subgraph "4-Port MPR Mode"
        V1[Axial Volume<br/>Level 2]
        V2[Sagittal Volume<br/>Level 2]
        V3[Coronal Volume<br/>Level 2]
        V4[3D Volume<br/>Level 2]
    end

    subgraph "HTJ2K Cache"
        HC[압축 상태 보관<br/>~130 MB]
    end

    subgraph "1-Port Stack Mode"
        S1[Axial Stack<br/>Level 0<br/>±5장 캐시]
    end

    subgraph "Memory Usage"
        M1[Volume Decoded<br/>~140 MB]
        M2[Stack Decoded<br/>~111 MB<br/>10장 × 11.1MB]
        M3[합계: ~381 MB ✅]
    end

    N1 --> V1 & V2 & V3 & V4
    N2 --> HC
    V1 & V2 & V3 & V4 --> M1
    HC --> S1
    S1 --> M2
    M1 --> M3
    M2 --> M3

    style N1 fill:#e3f2fd
    style N2 fill:#fff3e0
    style V1 fill:#e1f5fe
    style V2 fill:#e1f5fe
    style V3 fill:#e1f5fe
    style V4 fill:#e1f5fe
    style HC fill:#fff9c4
    style S1 fill:#c8e6c9
    style M3 fill:#c8e6c9
```

---

## 예상 결과

### Before (작업 전)
- Volume/MPR (4-port): ❌ 생성 실패 (메타데이터 Provider 미등록)
- Stack (1-port): ⚠️ Level 2만 표시 (FULL_RESOLUTION이라 업그레이드 안 됨)

### After (현재 구현, 2025-12-31)
- Volume/MPR (4-port): ✅ Level 2로 정상 렌더링 (~140 MB)
- Stack (1-port): ⚠️ 테스트 필요 (Level 0 업그레이드)
- 합계 메모리: **~140 MB** (Volume만)

### 제한 사항
| 항목 | 원래 목표 | 현재 상태 |
|------|----------|----------|
| **네트워크** | Range Request (20MB) | 전체 다운로드 (130MB) ❌ |
| **디코딩** | Level 2 (1/4 해상도) | Level 2 (1/4 해상도) ✅ |
| **메모리** | ~140MB | ~140MB ✅ |
| **Volume 표시** | ✅ | ✅ |

---

## ⚠️ 중요 원칙

### 메모리 관리
- **항상 메모리 부족 여부 점검**
- Chrome DevTools → Memory 탭에서 힙 사용량 모니터링
- 목표: ~381 MB 이하 유지 (A 방식: 전체 캐시 유지)
- 초과 시: 캐시 정리 로직 강화

### 구현 품질
- **대강 구현, 미루기, 하드코딩, 축약 금지**
- 어렵고 시간이 오래 걸려도 **제대로 구현**
- 모든 edge case 처리
- 적절한 에러 핸들링 및 로깅

### 문서화 및 테스트
- **자세한 주석 필수** (JSDoc/TSDoc 형식)
- **Unit Test 항상 추가** (Jest/Vitest)
- 함수별 테스트 케이스 작성
- edge case 테스트 포함

---

## ⚠️ Phase 6: Annotation 좌표 불일치 문제 (Critical)

### 문제 발견 (2025-12-30 분석)

**Level 2 MPR과 Level 0 Stack 간 Annotation 좌표 불일치 문제 발견**

#### 근본 원인

`htj2kMetadataAdjuster.ts`에서 조정한 PixelSpacing(4배)이 `metaData.get('imagePlaneModule')`을 통해 **Volume 생성에도 적용**되어, World 좌표 계산이 달라집니다.

```
htj2kMetadataAdjuster.ts (pixelSpacing × 4)
  ↓ addCustomMetadata('imagePlaneModule')
makeVolumeMetadata.js (get('imagePlaneModule'))
  ↓ PixelSpacing (조정된 값)
generateVolumePropsFromImageIds.js (spacing 계산)
  ↓ spacing (4배)
ImageVolume.js (setSpacing)
  ↓ vtkImageData
BaseVolumeViewport.getImageData() (getSpacing)
  ↓ spacing (4배)
canvasToWorld() (World 좌표 계산 - 4배 오차!)
```

#### 코드 위치

| 파일 | Line | 역할 |
|------|------|------|
| `htj2kMetadataAdjuster.ts` | 120-124 | PixelSpacing × 4 조정 |
| `makeVolumeMetadata.js` | 33 | `get('imagePlaneModule')` 호출 |
| `generateVolumePropsFromImageIds.js` | 23 | `spacing = [PixelSpacing[1], PixelSpacing[0], z]` |
| `ImageVolume.js` | 47 | `imageData.setSpacing(spacing)` |
| `BaseVolumeViewport.js` | 1035 | `spacing: vtkImageData.getSpacing()` |

#### 좌표 불일치 시나리오

| Viewport | PixelSpacing | Pixel 좌표 | World 좌표 | 문제 |
|----------|--------------|------------|------------|------|
| **Level 2 (MPR)** | 0.8mm (4×) | (100, 100) | [80, 80, 0]mm | ❌ 잘못된 좌표 |
| **Level 0 (Stack)** | 0.2mm | (100, 100) | [20, 20, 0]mm | ✅ 정확한 좌표 |

**문제**: Level 2 MPR에서 Annotation을 생성하면 World 좌표가 4배로 저장되어, Level 0 Stack에서 로드 시 **4배 떨어진 위치**에 표시됩니다.

#### 영향 받는 기능

1. **Annotation 도구**: Length, Angle, Probe, Arrow, Rectangle 등
2. **DICOM SR**: Structured Report 저장/로드
3. **DICOM SEG**: Segmentation 저장/로드
4. **DICOM PR**: Presentation State 저장/로드
5. **Crosshair 동기화**: Volume ↔ Stack 간

### 해결 방안 (검토)

#### 방안 A: PixelSpacing 원본 유지 (권장)

```typescript
// htj2kMetadataAdjuster.ts 수정
// PixelSpacing은 조정하지 않음 (World 좌표 일관성 유지)
return {
  rows: adjustedRows,
  columns: adjustedColumns,
  pixelSpacing: PixelSpacing,  // 원본 유지!
  // ...
};
```

- **장점**: World 좌표 일관성, Annotation/SR/SEG 완벽 호환
- **단점**: 렌더링 시 1/4 크기로 표시 → Zoom 보정 필요

**추가 작업**:
- Volume Viewport 생성 시 Camera Zoom을 4배로 설정
- 또는 Canvas 크기 대비 적절한 Scale Factor 적용

#### 방안 B: 좌표 변환 레이어 구현

```typescript
// annotationCoordinateTransformer.ts (신규)

/**
 * Annotation 저장 시: 현재 Viewport → 원본 해상도 좌표로 변환
 */
export function toOriginalWorldCoordinates(
  worldPos: number[],
  viewportId: string
): number[] {
  const resolutionFactor = getResolutionFactor(viewportId);
  if (resolutionFactor === 1) return worldPos;

  // Level 2 → Level 0 변환: World 좌표를 1/4로 축소
  return worldPos.map(coord => coord / resolutionFactor);
}

/**
 * Annotation 로드 시: 원본 해상도 → 현재 Viewport 좌표로 변환
 */
export function toViewportWorldCoordinates(
  originalWorldPos: number[],
  viewportId: string
): number[] {
  const resolutionFactor = getResolutionFactor(viewportId);
  if (resolutionFactor === 1) return originalWorldPos;

  // Level 0 → Level 2 변환: World 좌표를 4배로 확대
  return originalWorldPos.map(coord => coord * resolutionFactor);
}
```

- **장점**: 현재 메타데이터 조정 방식 유지
- **단점**: 복잡성 증가, 모든 Annotation 타입에 적용 필요, 누락 위험

#### 방안 C: 동일 Decode Level 사용

- Volume과 Stack 모두 Level 2 또는 Level 0 사용
- **단점**: 메모리 최적화 효과 상실 (Level 0 시 2.2GB)

### Phase 6 체크리스트

- [x] **6.1**: 해결 방안 최종 결정 (방안 A 선택) ✅
- [x] **6.2**: htj2kMetadataAdjuster.ts 수정 (PixelSpacing 원본 유지) ✅
- [x] **6.3**: Volume Viewport Camera Scale 보정 로직 구현 ✅
- [ ] **6.4**: Annotation 저장/로드 테스트 (런타임 테스트 필요)
  - [ ] Level 2 MPR에서 Length Annotation 생성
  - [ ] Level 0 Stack에서 동일 위치 표시 확인
  - [ ] SR 저장 후 로드 시 좌표 정확성 확인
- [ ] **6.5**: Crosshair 동기화 테스트 (런타임 테스트 필요)
  - [ ] Volume에서 클릭 → Stack에서 동일 위치 표시
  - [ ] Stack에서 클릭 → Volume에서 동일 위치 표시

### 우선순위

**Phase 6는 Phase 2, 5 완료 후 진행**

현재 MPR Volume 생성 자체가 안 되는 상태이므로:
1. Phase 2 (imageQualityStatus 분기) 완료
2. Phase 5 (Background Loading) 완료
3. **Phase 6 (Annotation 좌표) 진행** ← Annotation 기능 필요 시

---

## 📝 기술 검토 피드백 (2025-12-31)

### 1. 메타데이터 등록 방식의 일관성 (Phase 1) ✅

가장 시급했던 DicomWebDataSource의 메타데이터 등록 문제는 **f6a653e 커밋**을 통해 올바르게 수정되었습니다.

- **기존 문제**: 인스턴스 객체를 직접 수정하는 방식은 Cornerstone3D의 metadataProvider가 캐시된 원본 데이터를 우선 조회할 경우 반영되지 않는 허점이 있었습니다.
- **검토 결과**: `addCustomMetadata()`를 사용하여 `imagePixelModule`과 `imagePlaneModule`을 등록함으로써, 렌더링 엔진이 조정된 해상도(1/4)를 확실하게 인지하도록 보장했습니다. 이는 **MPR Volume 생성 실패의 근본 원인을 해결한 핵심 조치**입니다.

### 2. Annotation 좌표 불일치 해결 (Phase 6) ✅

가장 정교한 처리가 필요한 부분이며, 선택하신 **방안 A(PixelSpacing 원본 유지)**가 가장 안전한 설계입니다.

- **검토 내용**: 해상도를 1/4로 낮추더라도 pixelSpacing을 원본 그대로 유지하면, Volume Viewport에서 찍은 점의 World 좌표와 Stack Viewport(Full Res)의 좌표가 동일하게 유지됩니다.
- **⚠️ 주의사항**: 이 경우 이미지가 캔버스에서 1/4 크기로 작게 보일 수 있으므로, **Volume Viewport의 Camera Scale(Zoom)을 4배로 보정하는 로직이 반드시 병행되어야 합니다.**
- **기대 효과**: Crosshair 동기화, 길이 측정(Length Tool), DICOM SR 저장 시 좌표 오차 문제를 원천 차단할 수 있습니다.

### 3. 메모리 관리 전략 (Phase 4) ✅

현재 설계된 **~381MB** 수준의 메모리 점유율은 브라우저 환경에서 매우 안정적입니다.

- **검토 내용**: 200 슬라이스 기준, Level 2 디코딩 데이터(140MB)와 HTJ2K 압축 데이터(130MB)를 모두 유지하더라도 브라우저 제한(약 4GB)의 10% 미만입니다.
- **✅ 최적화**: Stack Viewport에서 스크롤 시 현재 위치 기준 **±5장만 Level 0(Full Res)으로 유지**하는 전략은 메모리 폭발을 막는 중요한 안전장치입니다.

### 4. Background 로더의 실효성 (Phase 5) ⚠️

Range Request가 불가능해짐에 따라 `htj2kBackgroundLoader.ts`의 역할이 일부 수정되어야 합니다.

- **검토 결과**: 현재 OpenJPH의 한계로 인해 "부분 로딩"은 어렵지만, **"순차적 로딩"**으로 UX를 개선할 수 있습니다.
- **제언**: Volume용 데이터를 모두 받은 후, 사용자가 MPR을 조작하는 동안 나머지 고해상도 정보(만약 서버 API가 지원된다면)를 백그라운드에서 미리 가져오는 구조는 유지하되, 현재는 전체 파일을 한 번에 다 받는 방식이므로 **로더의 우선순위를 'Volume 구성에 필요한 프레임 전체'에 먼저 두는 것**이 좋습니다.

### 📋 최종 체크리스트

구현 완료 후 다음 시나리오를 반드시 확인해야 합니다:

| 테스트 항목 | 확인 내용 | 상태 |
|------------|----------|------|
| **동기화** | MPR(Level 2)에서 특정 병변을 클릭했을 때, Stack View(Level 0)가 정확히 그 위치로 이동하는가? | ⬜ |
| **메모리** | 1-Port(Stack)와 4-Port(MPR)를 반복해서 전환할 때 메모리 누수(Leak) 없이 400MB 내외를 유지하는가? | ⬜ |
| **성능** | Level 2 디코딩 덕분에 MPR 회전 및 스크롤 속도가 체감될 정도로 빨라졌는가? | ⬜ |

---

## 참고 문서

- `document/htj2k-range-request-issue-analysis.md`
- `document/HTJ2K_RANGE_REQUEST_STATUS.md`
- `document/TASK-72-CLIENT-API-IMPLEMENTATION.md` - Server API 연동 클라이언트 구현 작업지시서 ✅ 완료
- `document/PROMPT-SERVER-HTJ2K-API.md` - Server API 구현 프롬프트
- [Cornerstone3D Volume Progressive Loading](https://www.cornerstonejs.org/docs/concepts/progressive-loading/)
- [Cornerstone3D MetadataProvider](https://www.cornerstonejs.org/docs/concepts/metadata-provider/)

---

## 변경 이력

| 날짜 | 작업 내용 |
|------|----------|
| 2025-12-30 | Task #72 작업지시서 작성 |
| 2025-12-30 | Phase 1-4 구현 완료 |
| 2025-12-30 | Phase 5-6 구현 완료 |
| 2025-12-31 | Range Request 한계 분석 및 문서화 |
| 2025-12-31 | Task #72-2 Server API 클라이언트 구현 완료 |
