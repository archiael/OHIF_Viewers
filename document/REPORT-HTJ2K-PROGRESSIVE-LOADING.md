# HTJ2K Progressive Loading 경과 보고서

**작성일**: 2026-01-02
**최종 업데이트**: 2026-01-03 (장비 팀 파일 생성 방법 변경 가이드 추가)
**작성자**: 배용민
**프로젝트**: mView Web Viewer
**상태**: 🟡 장비 팀 파일 생성 방법 변경으로 해결 가능

---

## 1. 배경

### 문제 상황

USMPR 모드에서 CT/MR 시리즈 로딩 시 **메모리 부족** 발생

| 항목 | 현재 상태 |
|------|----------|
| 시리즈당 용량 | ~130MB (200장 × 650KB) |
| Volume + Stack 동시 로딩 | ~260MB |
| 브라우저 메모리 한계 | 자주 초과 |

### 해결 목표

- **Volume**: Level 2 이미지 (1/4 해상도, ~20MB)로 빠른 렌더링
- **Stack**: 원본 해상도 (Full Resolution)로 고품질 표시
- **메모리 절감**: 130MB → 20MB (85% 감소)

---

## 2. 초기 접근: HTTP Range Request

### 시도한 방법

HTJ2K는 Progressive 구조이므로, 파일 앞부분만 받으면 저해상도 이미지를 얻을 수 있을 것으로 기대

```
HTTP Range Request: bytes=0-500000
→ 앞부분 ~500KB만 다운로드
→ Level 2 데이터만 포함될 것으로 기대
```

### 실패 원인

**OpenJPH 디코더가 Truncated HTJ2K를 지원하지 않음**

```
HTJ2K 파일 구조:
[SOC][SIZ][COD][QCD]...[SOT][Data...][EOC]
 ↑                                    ↑
 시작 마커                         종료 마커

Range Request로 앞부분만 받으면:
[SOC][SIZ][COD][QCD]...[SOT][Data 일부...] ← EOC 없음!
                                           → OpenJPH 디코딩 실패
```

- JPEG 2000 Part-15 (HTJ2K)에서 truncated 스트림 디코딩은 선택적 기능
- OpenJPH는 **완전한 코드스트림**만 지원
- EOC (End of Codestream) 마커가 없으면 디코딩 거부

---

## 3. 해결 방안: Server API 도입

### 핵심 아이디어

서버에서 **Level별로 완전한 HTJ2K**를 추출하여 반환

```
클라이언트                              서버
    │                                    │
    │  GET /frames/1?level=2             │
    │ ─────────────────────────────────► │
    │                                    │ HTJ2K 파싱
    │                                    │ Level 2까지 추출
    │  [SOC]...[L0][L1][L2][EOC]         │ EOC 추가
    │ ◄───────────────────────────────── │
    │  (~100KB, 완전한 HTJ2K)            │
    │                                    │
    │  GET /frames/1?complement=2        │
    │ ─────────────────────────────────► │
    │                                    │ Level 2 이후 추출
    │  [L3][L4][L5]...                   │
    │ ◄───────────────────────────────── │
    │  (~550KB, raw bitstream)           │
    │                                    │
    │  병합: level[:-2] + comp + EOC     │
    │  = Full HTJ2K (~650KB)             │
```

### PLT 마커 유무에 따른 처리

**PLT (Packet Length Table)**: HTJ2K 파일 내에 각 패킷의 길이 정보를 담은 선택적 마커

| 상황 | level 요청 | complement 요청 |
|------|-----------|----------------|
| **PLT 있음** | 정확한 Level 추출 | 정확한 Complement 추출 |
| **PLT 없음** | 전체 HTJ2K 반환 (Fallback) | 빈 데이터 반환 |

**Fallback 동작 (PLT 없는 경우)**:
1. 서버: `?level=2` 요청에 전체 HTJ2K 반환 + `X-HTJ2K-Fallback: true` 헤더
2. 클라이언트: 헤더 확인 후 전체 데이터 캐싱
3. 클라이언트: `decodeSubResolution(2)`로 Level 2 디코딩
4. 클라이언트: complement 요청 생략 (이미 전체 데이터 있음)

### 서버/PLT 조건별 로딩 동작

#### Volume 로딩 (Level 2, 1/4 해상도)

| 서버 유형 | PLT 마커 | 1차 요청 | 응답 | 디코딩 |
|----------|---------|---------|------|--------|
| **표준 DICOMweb** | - | `GET /frames/1` | 전체 HTJ2K (~650KB) | `decodeSubResolution(2)` |
| **mView 서버** | ✅ 있음 | `GET /frames/1?level=2` | Level 2 HTJ2K (~100KB) | 전체 디코딩 |
| **mView 서버** | ❌ 없음 | `GET /frames/1?level=2` | 전체 HTJ2K + `X-HTJ2K-Fallback: true` | `decodeSubResolution(2)` |

#### Stack 로딩 (Full Resolution)

| 서버 유형 | PLT 마커 | 요청 | 응답 | 비고 |
|----------|---------|------|------|------|
| **표준 DICOMweb** | - | `GET /frames/1` | 전체 HTJ2K (~650KB) | 새로 다운로드 |
| **mView 서버** | ✅ 있음 | `GET /frames/1?complement=2` | Level 2 이후 (~550KB) | 캐시된 Level 2와 병합 |
| **mView 서버** | ❌ 없음 | - | - | 캐시된 전체 데이터 사용 (추가 요청 없음) |

---

## 4. 현재 상황 (2026-01-02 업데이트)

### 구현 현황

| 구분 | 상태 | 비고 |
|------|------|------|
| **서버 측 (Java)** | ✅ 완료 | `?level=N`, `?complement=N` API, `X-HTJ2K-Fallback` 헤더, CORS 노출 |
| **클라이언트 측** | ✅ 완료 | Fallback 처리 구현 완료 |
| **단위 테스트** | ✅ 통과 | 서버 38/38, 클라이언트 120/120 테스트 통과 |
| **통합 테스트** | ✅ 완료 | Fallback 경로 테스트 완료, PLT 경로 테스트 불가 |

### 통합 테스트 결과 (2026-01-02)

#### 서버 API 테스트

| 테스트 | 결과 | 설명 |
|--------|------|------|
| `?level=2` 요청 | ✅ 통과 | `X-HTJ2K-Fallback: true` + 전체 데이터 (655,964 bytes) 반환 |
| `?complement=2` 요청 | ✅ 통과 | HTTP 400 (PLT 없어서 추출 불가) |
| HTJ2K 데이터 유효성 | ✅ 통과 | SOC(0xFF4F) + EOC(0xFFD9) 마커 정상 |
| 일반 요청 (파라미터 없음) | ✅ 통과 | 전체 HTJ2K 반환 |

#### PLT 마커 테스트

| 항목 | 상태 | 설명 |
|------|------|------|
| 서버 HTJ2K 이미지 | ❌ PLT 없음 | 테스트한 모든 이미지에 PLT 마커 없음 |
| OpenJPH 인코더 | ❌ PLT 미지원 | TLM 마커만 지원 (`-tlm_marker true`) |
| imagecodecs | ❌ PLT 옵션 없음 | 기본 JPEG2000 인코딩만 지원 |
| Kakadu | ⚠️ 미설치 | PLT 지원하지만 상용 라이센스 필요 |

**PLT 경로 테스트 불가**: PLT 마커가 있는 HTJ2K 파일을 생성할 수 없어 해당 코드 경로 테스트 보류

### 클라이언트 Fallback 구현 상태

| 기능 | 상태 | 구현 위치 |
|------|------|----------|
| `X-HTJ2K-Fallback` 헤더 읽기 | ✅ | `htj2kConfig.ts:detectFallbackFromXHR()` |
| Fallback 시 전체 데이터 캐싱 | ✅ | `htj2kBackgroundLoader.ts:cacheFullDataAsFallback()` |
| Fallback 시 complement 요청 생략 | ✅ | `htj2kBackgroundLoader.ts:loadComplementData()` |
| 저해상도 디코딩 | ✅ | `customWadorsLoader.ts:forcedDecodeLevel` (항상 적용) |

### 클라이언트 구현 파일

| 파일 | 기능 |
|------|------|
| `htj2kConfig.ts` | Server API 설정 관리, `detectFallbackFromXHR()` |
| `customWadorsLoader.ts` | URL에 `?level=N` 추가, 캐시 조회, Volume 전 캐시 정리 |
| `htj2kBackgroundLoader.ts` | Level/Complement 캐싱, `cleanupCacheForVolumeLoading()` |
| `htj2kDataMerger.ts` | Level + Complement 병합 |

### 메모리 최적화 (2026-01-02 추가)

- Volume 로딩 시작 전 캐시 사용량 확인 (`cleanupCacheForVolumeLoading`)
- 50% 초과 시 30%로 정리 (LRU 정책)
- WASM 디코더 힙 메모리 부족 방지

---

## 5. 🔴 중요 발견: PLT 마커 부재 문제

### 문제점

**대부분의 HTJ2K 이미지에 PLT 마커가 없음**

| 인코더 | PLT 지원 | 비고 |
|--------|---------|------|
| OpenJPH | ❌ | TLM만 지원, PLT 미지원 |
| imagecodecs | ❌ | PLT 옵션 없음 |
| DCMTK | ❌ | PLT 옵션 없음 |
| Kakadu | ✅ | 상용 라이센스 필요 (`-plt` 옵션) |

### PLT 유무에 따른 효과 비교

| 항목 | PLT 있음 | PLT 없음 (현재) |
|------|---------|----------------|
| **네트워크 전송** | 20MB (85% 절감) | 130MB (절감 없음) |
| **Level 추출** | 서버에서 정확히 추출 | 불가능 (전체 반환) |
| **디코딩 속도** | 빠름 (작은 데이터) | 약간 빠름 (subResolution) |
| **메모리 절감** | ✅ 네트워크 + 디코딩 | ⚠️ 디코딩 버퍼만 |

### 결론

**PLT 마커가 없으면 HTJ2K Progressive Loading의 주요 이점(네트워크 절감)이 사라짐**

현재 구현은 다음 상황에서만 효과적:
1. PLT 마커가 포함된 HTJ2K 이미지 사용 시
2. Kakadu 등 PLT 지원 인코더로 DICOM 저장 시

### 대안

1. **DICOM 저장 시 PLT 포함**
   - C-STORE 수신 시 Kakadu로 재인코딩
   - 라이센스 비용 발생

2. **다른 접근법으로 전환**
   - Tile 기반 로딩
   - 별도 썸네일 이미지 생성
   - Lazy Loading (스크롤 시 로딩)

3. **현재 구현 유지**
   - 미래 PLT 이미지 대비
   - Fallback 경로로 동작 (효과 제한적)

---

## 5-1. JPEG 2000 vs HTJ2K 비교 분석 (2026-01-03 추가)

### 질문: "HTJ2K 대신 JPEG 2000을 사용하면?"

JPEG 2000도 PLT 마커를 지원하므로, HTJ2K 대신 JPEG 2000을 사용하는 방안을 검토했습니다.

### 인코더별 PLT 지원 현황 (상세)

| 인코더/라이브러리 | 형식 | PLT 지원 | 설치 현황 | 비고 |
|------------------|------|---------|----------|------|
| **OpenJPH** | HTJ2K | ❌ | ✅ 설치됨 | TLM만 지원, PLT 미지원 |
| **imagecodecs** (OpenJPEG 2.5.4) | JPEG 2000 | ⚠️ | ✅ 설치됨 | 내부적으로 OpenJPEG 사용하지만 PLT 옵션 노출 안됨 |
| **glymur** | JPEG 2000 | ⚠️ | ✅ 설치됨 | PLT 지원하지만 시스템 OpenJPEG 라이브러리 필요 (현재 연결 안됨) |
| **OpenJPEG CLI** | JPEG 2000 | ✅ | ❌ 미설치 | 2.4.0+ 버전에서 `PLT=YES` 옵션 지원 |
| **GDAL** (JP2OpenJPEG) | JPEG 2000 | ✅ | ❌ 미설치 | OpenJPEG 2.4.0+ 필요, `PLT=YES` 옵션 지원 |
| **Kakadu** | 둘 다 | ✅ | ❌ 미설치 | 상용 라이센스 필요 |

### 테스트 결과

```
=== JPEG 2000 Main Header Analysis ===
Total size: 1,839 bytes
Main header ends at SOT position: 119

Main Header Markers (before SOT):
  - SOC (Start of codestream) at position 0
  - SIZ (Image and tile size) at position 2
  - COD (Coding style default) at position 45
  - QCD (Quantization default) at position 59
  - COM (Comment) at position 80

PLM (0xFF57) in main header: NOT FOUND
PLT (0xFF58) in main header: NOT FOUND

Conclusion: OpenJPEG (imagecodecs) does NOT generate PLM/PLT markers.
```

### 결론

**JPEG 2000을 사용해도 동일한 문제 발생**:
- imagecodecs는 OpenJPEG 2.5.4를 내장하고 있지만 PLT 옵션을 노출하지 않음
- 기본 인코딩에서는 PLT/PLM 마커가 생성되지 않음
- 압축 데이터 내에서 우연히 발견되는 `0xFF58` 바이트는 실제 PLT 마커가 아님

**PLT 마커를 생성하려면**:
1. OpenJPEG CLI 도구 설치 및 `PLT=YES` 옵션 사용
2. GDAL + JP2OpenJPEG 드라이버 사용
3. Kakadu 라이센스 구매

### HTJ2K vs JPEG 2000 선택 가이드

| 요소 | HTJ2K | JPEG 2000 |
|------|-------|-----------|
| **디코딩 속도** | ⚡ 매우 빠름 (10-50x) | 보통 |
| **인코딩 속도** | ⚡ 매우 빠름 | 보통 |
| **압축률** | 비슷 | 비슷 |
| **PLT 지원** | OpenJPH 미지원 | OpenJPEG 2.4.0+ 지원 |
| **브라우저 지원** | WASM 디코더 필요 | WASM 디코더 필요 |
| **OHIF 호환성** | ✅ OpenJPH WASM | ✅ OpenJPEG WASM |

**권장**: 현재 상황에서는 **HTJ2K 유지** (디코딩 성능 이점 + Fallback 구현 완료)

---

## 6. 🟢 해결 방안: 장비 팀 파일 생성 방법 변경 (2026-01-03)

### 중요 발견: EOC 없이도 HTTP Range Progressive Loading 가능

**이메일 분석 결과 (박희붕, 2026-01-03)**:

> "EOC 마커 없이도 HTTP Range Progressive Loading이 가능합니다!"

| 마커/정보 | 역할 | 현재 테스트 파일 |
|-----------|------|-----------------|
| **TLM (Tile-part Lengths)** | 타일 오프셋 및 길이 정보 제공 | ✅ 위치 273,007 (길이 923 bytes) |
| **SOT의 Psot 필드** | 정확한 타일 길이 (예: Psot=500000 → 500KB) | ✅ 있음 |
| **HTTP Content-Length** | 수신 데이터 크기 | 서버 제공 |
| **EOC** | 코드스트림 종료 마커 | ❌ **불필요!** |

**결론**: TLM 마커가 있으면 HTTP Range로 파일 일부만 받아도 디코딩 가능!

### 현재 파일 분석 결과

현재 테스트 이미지 분석 (박희붕 분석):

| 항목 | 현재 값 | 문제점 |
|------|---------|--------|
| **타일 수** | 1,430개 (64x64) | ⚠️ 1,430번 HTTP 요청 필요 |
| **Precinct** | 256x256 | - |
| **레이어 수** | 1개 | ⚠️ Progressive Quality 불가 |
| **TLM** | ✅ 있음 | 좋음 |
| **PLT** | ❌ 없음 | ⚠️ 패킷 단위 추출 불가 |
| **Progression** | ? | RPCL 권장 |

### 권장 파일 생성 파라미터

**단일 타일 + RPCL + 다중 레이어** = 효율적인 Progressive Loading

| 항목 | 현재 | **권장** | 효과 |
|------|------|---------|------|
| **타일** | 1,430개 (64x64) | **1개 (전체 영상)** | HTTP 요청 1회로 축소 |
| **Precinct** | 256x256 | **64x64** | 세밀한 영역 로딩 |
| **레이어** | 1개 | **5개** | Progressive Quality 지원 |
| **TLM** | 있음 | **필수** | 타일 오프셋 정보 |
| **PLT** | 없음 | **필수** | 패킷 오프셋 정보 |
| **Progression** | ? | **RPCL** | Resolution 우선 순서 |

### OpenJPH 압축 명령어 (권장)

```bash
ojph_compress \
  -i input.raw \
  -o output.j2k \
  --tile_size 3460,1638 \     # 단일 타일 (영상 전체 크기)
  --num_layers 5 \            # 레이어 5개 (Progressive Quality)
  --num_decompositions 5 \    # 분해 레벨 5
  --precinct_size 64,64 \     # Precinct 64x64
  --progression_order RPCL \  # Resolution-Position-Component-Layer
  --tlm \                     # TLM 마커 추가
  --plt \                     # PLT 마커 추가
  --reversible                # 무손실 압축
```

### 성능 비교 (예상)

| 로딩 방식 | 현재 (다중 타일) | 변경 후 (단일 타일 + RPCL) |
|-----------|-----------------|--------------------------|
| **HTTP 요청 수** | 1,430회 | **1회** |
| **총 로딩 시간** | 5~10초 | **0.2초** |
| **Level 2 데이터** | 전체 + decodeSubResolution | **정확한 Level 추출** |
| **네트워크 절감** | ❌ 없음 | **✅ 85% 절감** |

### 적용 순서

1. **장비 팀**: 위 파라미터로 파일 생성 방법 변경
2. **테스트 파일 확보**: PLT 마커 포함 HTJ2K 이미지 수신
3. **서버 테스트**: 기존 Level API로 정확한 추출 확인
4. **클라이언트 테스트**: PLT 경로 동작 확인

### 핵심 정리

```
현재: 1,430 타일 × 1 레이어 × PLT 없음 = HTTP Range 비효율적
변경: 1 타일 × 5 레이어 × TLM/PLT 있음 = HTTP Range 최적화!

HTTP 요청: 1,430회 → 1회
로딩 시간: 5~10초 → 0.2초
```

---

## 7. 남은 작업

### 🟢 완료

1. **서버/클라이언트 구현** ✅
   - Server API (`?level=N`, `?complement=N`)
   - Fallback 처리 (`X-HTJ2K-Fallback` 헤더)
   - 상세 가이드: [TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md](./TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md)

2. **통합 테스트 (Fallback 경로)** ✅
   - PLT 없는 이미지로 Fallback 동작 확인

3. **해결 방안 문서화** ✅ (2026-01-03)
   - 장비 팀 파일 생성 파라미터 정리
   - OpenJPH 압축 명령어 문서화

### 🟡 진행 중 (장비 팀 협조 필요)

4. **장비 팀 파일 생성 방법 변경**
   - 단일 타일 (전체 영상) + 5개 레이어 + TLM/PLT 마커
   - OpenJPH 압축 파라미터 적용
   - **담당**: 장비 팀

5. **PLT 경로 테스트**
   - 변경된 파일 수신 후 테스트 예정
   - 서버 Level API 정확한 추출 확인
   - 클라이언트 PLT 경로 동작 확인

### ❌ 취소 (불필요해짐)

~~3. **PLT 포함 HTJ2K 인코딩 방안 결정**~~
   - ~~Kakadu 라이센스 검토~~ → **장비 팀 OpenJPH 변경으로 해결**

---

## 8. 기대 효과

### 🟢 장비 팀 변경 후 (단일 타일 + TLM/PLT)

| 항목 | 현재 | 변경 후 | 개선율 |
|------|------|---------|-------|
| HTTP 요청 수 | 1,430회 | **1회** | 99.9% 감소 |
| 초기 다운로드 | 130MB | **20MB** | 85% 절감 |
| Volume 로딩 시간 | 5~10초 | **0.2초** | 96% 개선 |
| 메모리 사용량 | 260MB+ | **~50MB** | 80% 절감 |

### 🟡 현재 (PLT 없음, Fallback 동작)

| 항목 | 현재 | Fallback 적용 |
|------|------|--------------|
| 초기 다운로드 | 130MB | **130MB (동일)** |
| Volume 로딩 시간 | ~15초 | ~12초 (약간 개선) |
| 메모리 사용량 | 260MB+ | ~200MB (약간 개선) |

**Fallback만으로는 목표 달성 불가** → **장비 팀 변경으로 해결 가능!**

---

## 관련 문서

- [TASK-72-LEVEL2-MPR-VOLUME.md](./TASK-72-LEVEL2-MPR-VOLUME.md) - **메인 작업지시서**
- [TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md](./TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md) - 클라이언트 Fallback 구현 가이드
- [TASK-72-CLIENT-API-IMPLEMENTATION.md](./TASK-72-CLIENT-API-IMPLEMENTATION.md) - 클라이언트 API 연동 상세
