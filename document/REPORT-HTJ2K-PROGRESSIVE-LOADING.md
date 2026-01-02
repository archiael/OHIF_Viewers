# HTJ2K Progressive Loading 경과 보고서

**작성일**: 2026-01-02
**최종 업데이트**: 2026-01-02
**작성자**: 배용민
**프로젝트**: mView Web Viewer

---

## 1. 배경 및 목표

### 문제 상황

USMPR 모드에서 CT/MR 시리즈 로딩 시 **메모리 부족** 문제 발생

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

HTJ2K의 Progressive 특성을 활용하여 **파일의 앞부분만** 요청

```
HTTP Range Request: bytes=0-500000
→ 앞부분 ~500KB만 다운로드
→ Level 2 데이터만 포함될 것으로 기대
```

### 실패 원인

**OpenJPH 디코더가 Truncated HTJ2K를 지원하지 않음**

```
┌─────────────────────────────────────────────────────┐
│ HTJ2K 파일 구조                                      │
├─────────────────────────────────────────────────────┤
│ [SOC][SIZ][COD][QCD]...[SOT][Data...][EOC]          │
│  ↑                                          ↑       │
│  시작 마커                                   종료 마커 │
└─────────────────────────────────────────────────────┘

Range Request로 앞부분만 받으면:
[SOC][SIZ][COD][QCD]...[SOT][Data 일부...] ← EOC 없음!
                                           ↑
                                    OpenJPH 디코딩 실패
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

### API 파라미터

| 파라미터 | 용도 | 응답 |
|----------|------|------|
| `?level=N` | Level N까지 데이터 요청 | 완전한 HTJ2K (SOC~EOC 포함) |
| `?complement=N` | Level N 이후 데이터 요청 | Raw bitstream (헤더 없음) |

### Level과 해상도 관계

```
Level 0: 원본 해상도     (2048 × 2048)  ~650KB
Level 1: 1/2 해상도      (1024 × 1024)  ~200KB
Level 2: 1/4 해상도      (512 × 512)    ~100KB  ← Volume용
Level 3: 1/8 해상도      (256 × 256)    ~30KB
Level 4: 1/16 해상도     (128 × 128)    ~10KB
Level 5: 1/32 해상도     (64 × 64)      ~5KB
```

---

## 4. 기술적 고려사항: PLT 마커

### PLT (Packet Length Table) 란?

HTJ2K 파일 내에 **각 패킷의 길이 정보**를 담은 선택적 마커

```
PLT 있음:
[SOC][SIZ][COD][PLT: L0=1000, L1=3000, L2=8000, ...][Data][EOC]
                ↑
        정확한 Level 경계 계산 가능

PLT 없음:
[SOC][SIZ][COD][Data...][EOC]
                ↑
        Wavelet 비율로 추정해야 함
```

### PLT 유무에 따른 처리

| 상황 | level 요청 | complement 요청 |
|------|-----------|----------------|
| **PLT 있음** | 정확한 Level 추출 | 정확한 Complement 추출 |
| **PLT 없음** | 전체 HTJ2K 반환 (Fallback) | 빈 데이터 반환 |

### Fallback 동작 (PLT 없는 경우)

```
1. 서버: level 요청에 전체 HTJ2K 반환 + X-HTJ2K-Fallback: true 헤더
2. 클라이언트: 헤더 확인 후 전체 데이터 캐싱 (cacheFullDataAsFallback)
3. 클라이언트: decodeSubResolution(2)로 Level 2 디코딩 (클라이언트 측 처리)
4. 클라이언트: complement 요청 생략 (이미 전체 데이터 있음)
```

---

## 5. 구현 현황

### 서버 측 (Java) ✅ 완료

| 항목 | 상태 | 비고 |
|------|------|------|
| Level 추출 | ✅ 완료 | `DicomWebController.java` |
| Complement 추출 | ✅ 완료 | |
| PLT 파싱 | ✅ 완료 | PLT/SOP 지원 |
| PLT Fallback | ✅ 완료 | 원본 HTJ2K 반환 + `X-HTJ2K-Fallback: true` |
| CORS 헤더 | ✅ 완료 | `SecurityConfig.java` |

**서버 응답 헤더 예시:**
```
HTTP/1.1 200
X-HTJ2K-Original-Size: 655964
X-HTJ2K-Decomposition-Levels: 5
X-HTJ2K-Fallback: true              ← PLT 없음
X-HTJ2K-Level: 2
X-HTJ2K-Mode: level
Content-Type: image/jph
Content-Length: 655964              ← 전체 HTJ2K 반환
```

### 클라이언트 측 (OHIF Viewer) ✅ 완료

| 기능 | 파일 | 상태 |
|------|------|------|
| Server API 설정 관리 | `htj2kConfig.ts` | ✅ 완료 |
| URL에 `?level=N` 추가 | `customWadorsLoader.ts` | ✅ 완료 |
| Level 데이터 캐싱 | `htj2kBackgroundLoader.ts` | ✅ 완료 |
| Background Complement 로딩 | `htj2kBackgroundLoader.ts` | ✅ 완료 |
| Level + Complement 병합 | `htj2kDataMerger.ts` | ✅ 완료 |
| **X-HTJ2K-Fallback 헤더 처리** | `htj2kConfig.ts`, `customWadorsLoader.ts` | ✅ 완료 |
| **Fallback 캐싱** | `htj2kBackgroundLoader.ts` | ✅ 완료 |
| Unit Test | `*.test.ts` | ✅ **83/83 통과** |

#### 새로 추가된 기능 (2026-01-02)

1. **`detectFallbackFromXHR()`** - 3단계 Fallback 감지
   - 1순위: `X-HTJ2K-Fallback` 헤더
   - 2순위: `X-HTJ2K-Original-Size` vs `Content-Length` 비교
   - 3순위: `null` (표준 DICOMweb 호환)

2. **`cacheFullDataAsFallback()`** - Fallback 데이터 캐싱
   - `status: 'complete'` 설정
   - `complementStatus: 'complete'` (complement 불필요)

3. **표준 DICOMweb 호환성**
   - 커스텀 헤더가 없는 서버에서도 정상 동작
   - 기존 크기 기반 Fallback 감지 로직 유지

---

## 6. 남은 작업

### 통합 테스트 (서버 + 클라이언트)

- [ ] PLT 있는 이미지: Level 추출 → 디코딩 → Volume 렌더링
- [ ] PLT 없는 이미지: Fallback → 전체 캐싱 → Volume 렌더링
- [ ] Level + Complement 병합 → Stack Full Resolution
- [ ] OHIF Viewer 전체 플로우 검증

### 테스트 시나리오

| 서버 유형 | 헤더 | 감지 방법 | 예상 동작 |
|----------|------|----------|----------|
| mView 커스텀 (PLT 없음) | `X-HTJ2K-Fallback: true` | 1순위 헤더 | Fallback 캐싱 ✅ |
| mView 커스텀 (PLT 있음) | `X-HTJ2K-Fallback: false` | 1순위 헤더 | Level 캐싱 → Complement 병합 |
| 커스텀 (헤더 일부) | `X-HTJ2K-Original-Size` | 2순위 크기 비교 | 자동 감지 |
| 표준 DICOMweb | 없음 | 3순위 크기 추정 | 기존 로직 |

---

## 7. 기대 효과

### 성능 개선

| 항목 | 현재 | 개선 후 | 개선율 |
|------|------|---------|--------|
| 초기 다운로드 | 130MB | 20MB | **85% 감소** |
| Volume 로딩 시간 | ~15초 | ~2초 | **87% 단축** |
| 메모리 사용량 | 260MB+ | ~50MB | **81% 감소** |

### 사용자 경험

```
[현재]
0s ──────────────────────────────────────── 15s
   └─────── 전체 로딩 대기 ──────────────────┘
                                            ↓
                                       Volume 표시

[개선 후]
0s ─────── 2s ─────────────────────────── 15s
   └─ L2 로딩 ─┘                            │
              ↓                             │
         Volume 표시                        │
              └─── Background Full 로딩 ────┘
                                            ↓
                                    Stack 고해상도 표시
```

---

## 8. 결론

### 완료된 항목

- ✅ HTTP Range Request 방식 시도 → OpenJPH 미지원으로 실패
- ✅ Server API (`?level=N`, `?complement=N`) 방식으로 전환
- ✅ **서버 측 구현 완료** (Java PLT Fallback + CORS 헤더)
- ✅ **클라이언트 측 구현 완료** (Server API + Fallback 처리)
- ✅ **단위 테스트 통과** (83/83)

### 다음 단계

- 🔲 mView 커스텀 서버 통합 테스트
- 🔲 PLT 있는/없는 이미지 실제 로딩 테스트
- 🔲 성능 측정 (로딩 시간, 메모리 사용량)

### 예상 결과

완료 시 **초기 로딩 시간 87% 단축, 메모리 사용량 81% 감소** 예상

---

**관련 문서**:
- [TASK-72-CLIENT-API-IMPLEMENTATION.md](./TASK-72-CLIENT-API-IMPLEMENTATION.md) - 클라이언트 구현 상세
- [TASK-72-CLIENT-FALLBACK-FIX.md](./TASK-72-CLIENT-FALLBACK-FIX.md) - Fallback 처리 구현
- [PROMPT-SERVER-PLT-FALLBACK-FIX.md](./PROMPT-SERVER-PLT-FALLBACK-FIX.md) - 서버 PLT Fallback 수정
