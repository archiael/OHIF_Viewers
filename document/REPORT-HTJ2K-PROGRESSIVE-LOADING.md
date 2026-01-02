# HTJ2K Progressive Loading 경과 보고서

**작성일**: 2026-01-02
**최종 업데이트**: 2026-01-02
**작성자**: 배용민
**프로젝트**: mView Web Viewer

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
| **통합 테스트** | ⏳ 미확인 | 테스트 이미지에 PLT 마커 없음 → Fallback 동작 확인 필요 |

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

## 5. 남은 작업

### 🟢 완료

1. **Fallback 처리 구현** ✅
   - `X-HTJ2K-Fallback: true` 헤더 감지
   - 전체 데이터 캐싱 (complement 요청 생략)
   - 저해상도 디코딩 (`forcedDecodeLevel` 적용)
   - 상세 가이드: [TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md](./TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md)

### 🟡 권장

2. **PLT 포함 HTJ2K 인코딩**
   - 향후 DICOM 저장 시 PLT 마커 포함하도록 설정
   - PLT 있으면 서버에서 정확한 level 추출 가능 → 네트워크 최적화

3. **통합 테스트**
   - PLT 있는 이미지: level 추출 확인
   - PLT 없는 이미지: Fallback + decodeSubResolution 확인

4. **성능 측정**
   - 로딩 시간 비교
   - 메모리 사용량 비교

---

## 6. 기대 효과

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| 초기 다운로드 | 130MB | 20MB |
| Volume 로딩 시간 | ~15초 | ~2초 |
| 메모리 사용량 | 260MB+ | ~50MB |

---

## 관련 문서

- [TASK-72-LEVEL2-MPR-VOLUME.md](./TASK-72-LEVEL2-MPR-VOLUME.md) - **메인 작업지시서**
- [TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md](./TASK-72-CLIENT-FALLBACK-IMPLEMENTATION.md) - 클라이언트 Fallback 구현 가이드
- [TASK-72-CLIENT-API-IMPLEMENTATION.md](./TASK-72-CLIENT-API-IMPLEMENTATION.md) - 클라이언트 API 연동 상세
