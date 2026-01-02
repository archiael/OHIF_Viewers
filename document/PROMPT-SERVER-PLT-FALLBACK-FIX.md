# Java 서버 PLT Fallback 수정 요청

## 요약

`DicomWebController.java`에서 **PLT 마커가 없는 HTJ2K 이미지**에 대한 `?level=N` 요청 처리를 수정해야 합니다.

---

## 🎉 구현 완료 (2026-01-02)

### 서버 측 구현 상태

| 요청 사항 | 상태 | 구현 위치 |
|----------|------|----------|
| PLT Fallback 시 원본 HTJ2K 반환 | ✅ 완료 | `DicomWebController.java:1111-1120` |
| JPEG 변환 코드 제거 | ✅ 완료 | decodeHtj2kToLevelJpeg 호출 없음 |
| actualMediaType = "image/jph" 유지 | ✅ 완료 | frameData/mediaType 변경 없음 |
| X-HTJ2K-Fallback 헤더 추가 | ✅ 완료 | `DicomWebController.java:1208` |
| CORS 헤더 노출 | ✅ 완료 | `SecurityConfig.java:171-180` |
| complement → 0 bytes 반환 | ✅ 완료 | `DicomWebController.java:1121-1126` |
| Transfer Syntax 유지 | ✅ 완료 | `DicomWebController.java:1173-1177` |

### 실제 구현 코드

**PLT Fallback 로직 (Line 1108-1126):**
```java
if (!resIndex.hasAccurateLevelBoundaries()) {
    htj2kFallback = true;

    if (level != null) {
        // PLT 없음: 원본 HTJ2K 그대로 반환
        // 클라이언트가 decodeSubResolution(level)로 원하는 해상도로 디코딩
        logger.info("HTJ2K no-PLT fallback: level={} requested, returning full codestream ({} bytes). " +
            "Client decodeSubResolution({}) will handle. decompositionLevels={}",
            level, frameSize, level, htj2kDecompositionLevels);
        // frameData 변경 없음 - 원본 HTJ2K 유지
        // actualMediaType 변경 없음 - image/jph 유지
    } else if (complement != null) {
        // complement는 PLT가 없으면 정확한 경계를 알 수 없음
        logger.warn("HTJ2K no-PLT fallback: complement not supported without PLT, returning 0 bytes");
        frameData = new byte[0];
        frameSize = 0;
    }
}
```

**응답 헤더 (Line 1204-1220):**
```java
if (isHtj2kFrame && (level != null || complement != null)) {
    headers.add("X-HTJ2K-Original-Size", String.valueOf(originalSize));
    headers.add("X-HTJ2K-Decomposition-Levels", String.valueOf(htj2kDecompositionLevels));
    headers.add("X-HTJ2K-Fallback", String.valueOf(htj2kFallback));
    if (level != null) {
        headers.add("X-HTJ2K-Level", String.valueOf(level));
        headers.add("X-HTJ2K-Mode", "level");
    } else if (complement != null) {
        headers.add("X-HTJ2K-Complement-After", String.valueOf(complement));
        headers.add("X-HTJ2K-Mode", "complement");
    }
}
```

**CORS 헤더 노출 (SecurityConfig.java):**
```java
configuration.setExposedHeaders(List.of(
    // ... 기본 헤더들 ...
    // HTJ2K Level API 헤더 (Task #72)
    "X-HTJ2K-Level",                // ✅ 필수: 서버 API 지원 감지 + 반환된 Level
    "X-HTJ2K-Original-Size",        // ✅ 필수: 전체 파일 크기 (병합 검증용)
    "X-HTJ2K-Mode",                 // 권장: 응답 모드 (level/complement)
    "X-HTJ2K-Decomposition-Levels", // 권장: 총 decomposition level 수
    "X-HTJ2K-Fallback",             // 디버깅용: 폴백 발생 여부 (PLT 없을 때)
    "X-HTJ2K-Complement-After"      // complement 요청 시: 데이터 시작 레벨
));
```

### 테스트 결과 (curl)

```bash
$ curl -s -D - -H "Accept: image/jph" \
  "http://192.168.10.237:8080/dicomweb/studies/.../frames/1?level=2"

HTTP/1.1 200
X-HTJ2K-Original-Size: 655964
X-HTJ2K-Decomposition-Levels: 5
X-HTJ2K-Fallback: true              # ✅ Fallback 발생
X-HTJ2K-Level: 2
X-HTJ2K-Mode: level
Content-Type: image/jph; transfer-syntax="1.2.840.10008.1.2.4.202"
Content-Length: 655964              # 전체 HTJ2K 반환

# 데이터 확인: FF 4F (SOC marker) ✅
$ xxd /tmp/response.bin | head -1
00000000: ff4f ff51 0029 4000 0000 0d84 0000 0666  .O.Q.)@........f
```

---

## ⚠️ 남은 문제: 클라이언트 측

**서버는 정상 동작하지만 OHIF Viewer에서 여전히 디코딩 오류 발생:**

```
ojph info 0x00010002 at HTJ2KDecoder.hpp:41: v0.6 HTJ2K Decoder
Couldn't decode 411334808
[OHIF] Image load failed: 411334808
```

### 원인 분석

클라이언트 측에서 `X-HTJ2K-Fallback: true` 헤더를 확인하고 `decodeSubResolution(level)`을 호출하는 로직이 **제대로 동작하지 않는 것으로 보임**.

### 클라이언트 확인 필요 사항

1. `X-HTJ2K-Fallback` 헤더를 읽고 있는지?
2. Fallback 시 `decodeSubResolution(level)` 호출하는지?
3. Progressive loader가 전체 HTJ2K를 받았을 때 올바르게 처리하는지?

---

## 현재 문제 (수정됨)

### 위치
`DicomWebController.java:1106-1132` (대략적인 위치)

### ~~현재 동작 (잘못됨)~~ → 수정 완료
```java
// PLT 없을 때 (hasAccurateLevelBoundaries() == false)
htj2kFallback = true;

if (level != null) {
    // ❌ 과거: JPEG로 변환 (이제 제거됨)
    // frameData = wadoRsService.decodeHtj2kToLevelJpeg(frameData, level, decompositionLevels);
    // actualMediaType = "image/jpeg";

    // ✅ 현재: 원본 HTJ2K 그대로 반환
    // frameData 변경 없음
    // actualMediaType = "image/jph" 유지
}
```

---

## 수정 요청 → 완료

### 수정해야 할 동작 ✅
```java
// PLT 없을 때 (hasAccurateLevelBoundaries() == false)
htj2kFallback = true;

if (level != null) {
    // ✅ 수정: 원본 HTJ2K 그대로 반환
    // frameData 변경하지 않음!
    // actualMediaType = "image/jph" 유지
    logger.info("HTJ2K no-PLT fallback: returning full codestream for level={}", level);
    // 클라이언트가 decodeSubResolution(level)로 저해상도 디코딩 처리
} else if (complement != null) {
    // complement는 PLT 없이 지원 불가 (현재 로직 유지)
    frameData = new byte[0];
    frameSize = 0;
}
```

### 추가 필요 사항

#### 1. `X-HTJ2K-Fallback` 응답 헤더 추가 ✅
PLT Fallback 발생 시 클라이언트에게 알려주는 헤더:
```java
if (htj2kFallback) {
    responseHeaders.add("X-HTJ2K-Fallback", "true");
}
```

#### 2. CORS 헤더 노출 설정 ✅
클라이언트가 커스텀 헤더를 읽을 수 있도록:
```
Access-Control-Expose-Headers: X-HTJ2K-Level, X-HTJ2K-Original-Size, X-HTJ2K-Fallback, X-HTJ2K-Decomposition-Levels
```

---

## 동작 흐름 비교

### PLT 있는 경우 (변경 없음)
```
GET /frames/1?level=2
→ Level 2까지 정확히 추출
→ ~100KB HTJ2K 반환 (완전한 코드스트림)
→ Media-Type: image/jph
```

### PLT 없는 경우 ✅ 수정 완료

**~~과거 (잘못됨):~~**
```
GET /frames/1?level=2
→ JPEG로 변환 (decodeHtj2kToLevelJpeg 호출)
→ ~100KB JPEG 반환
→ Media-Type: image/jpeg
→ 클라이언트 디코딩 실패 ❌
```

**현재 (수정됨):**
```
GET /frames/1?level=2
→ 원본 HTJ2K 그대로 반환 (변환 없음)
→ ~650KB HTJ2K 반환 (전체 코드스트림)
→ Media-Type: image/jph
→ X-HTJ2K-Fallback: true
→ 클라이언트가 decodeSubResolution(2)로 저해상도 디코딩 (예정)
```

---

## 클라이언트 측 Fallback 처리 (확인 필요)

클라이언트는 `X-HTJ2K-Fallback: true` 헤더를 확인하면:
1. 전체 HTJ2K 데이터를 캐싱
2. `decodeSubResolution(level)`로 저해상도 디코딩하여 Volume 표시
3. complement 요청 생략 (이미 전체 데이터 있음)
4. Stack 표시 시 캐시된 전체 데이터 사용

**⚠️ 위 로직이 실제로 동작하는지 OHIF 클라이언트 코드 확인 필요**

---

## 체크리스트

- [x] `DicomWebController.java`에서 PLT Fallback 로직 수정
  - [x] JPEG 변환 코드 제거 (또는 조건 변경)
  - [x] 원본 HTJ2K 그대로 반환하도록 수정
  - [x] `actualMediaType = "image/jph"` 유지
- [x] `X-HTJ2K-Fallback: true` 응답 헤더 추가
- [x] CORS 설정에 `X-HTJ2K-Fallback` 헤더 노출 추가
- [ ] 테스트
  - [x] PLT 없는 이미지로 `?level=2` 요청
  - [x] 응답이 HTJ2K인지 확인 (SOC 마커: `FF 4F`)
  - [ ] **OHIF Viewer에서 정상 로딩 확인** ← 클라이언트 수정 필요

---

## 다음 단계

1. **OHIF 클라이언트 코드 확인**
   - `X-HTJ2K-Fallback` 헤더 처리 로직 확인
   - `decodeSubResolution()` 호출 여부 확인

2. **클라이언트 수정 (필요 시)**
   - Progressive loader에서 Fallback 처리 로직 추가/수정

---

## 참고 자료

- 클라이언트 구현: `TASK-72-CLIENT-API-IMPLEMENTATION.md`
- 서버 API 스펙: `TASK-72-HTJ2K-LEVEL-API.md`
- 경과 보고서: `REPORT-HTJ2K-PROGRESSIVE-LOADING.md`
