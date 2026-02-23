# JPEG Lossless 이미지 로딩 문제 조사 보고서

> **프로젝트**: mView-WebV2 (OHIF Viewer v3.12.0-beta)
> **작성일**: 2026-02-13
> **상태**: 🔍 조사 진행 중

---

## 📋 목차

1. [문제 현상](#1-문제-현상)
2. [발견한 사실들](#2-발견한-사실들)
3. [잘못된 해결 시도들](#3-잘못된-해결-시도들)
4. [현재 이해한 구조](#4-현재-이해한-구조)
5. [가설 및 다음 단계](#5-가설-및-다음-단계)

---

## 1. 문제 현상

### 1.1 증상

- **에러 수**: 1,949개
- **에러 메시지**: `Illegal ERMF value: 1`
- **화면**: Mammography 이미지가 표시되지 않음 (검은 화면)
- **영향받는 Study**: `1.2.410.200030.10.201508011207.4246096944` (JPEG Lossless)
- **정상 작동 Study**: `1.2.410.200030.10.202311271633.4260586036` (Explicit VR Little Endian)

### 1.2 재현 방법

1. DCM4CHEE 서버 접속: `http://192.168.0.202:8083/dicomweb/`
2. `yarn dev:dcm4chee` 실행
3. Mammography study 열기 (JPEG Lossless Transfer Syntax)
4. Console에 1,949개 에러 발생

---

## 2. 발견한 사실들

### 2.1 Image Loader 프로토콜 분석 ✅

**발견**: mammography 모드는 **wadouri** 프로토콜을 사용 (wadors 아님!)

```javascript
// extensions/default/src/DicomWebDataSource/utils/getImageId.js:42-50
if (!config[renderingAttr] || config[renderingAttr] === 'wadouri') {
  const wadouri = buildInstanceWadoUrl(config, instance);
  let imageId = 'dicomweb:' + wadouri;  // ← 'dicomweb:' prefix
  if (frame !== undefined) {
    imageId += '&frame=' + frame;
  }
  return imageId;
}
```

**결과**:
- imageId: `dicomweb:http://192.168.0.202:8083/wado?requestType=WADO&studyUID=...&transferSyntax=*`
- loader: `wadouri/loadImage.js` (node_modules/@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadouri/loadImage.js)
- **customWadorsLoader는 호출되지 않음**

**증거**:
```bash
# Network 탭 필터 "wadors" → 0건
# 실제로는 WADO-URI 프로토콜 사용 중
```

### 2.2 JPEG Lossless 디코더 구조 분석 ✅

**발견**: JPEG Lossless는 **자체 디코더**가 있으며 자동 로드됨

```javascript
// node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGLossless.js
export function initialize(decodeConfig) {
  return new Promise((resolve, reject) => {
    import('jpeg-lossless-decoder-js').then(({ Decoder }) => {  // ← 동적 import
      local.DecoderClass = Decoder;
      resolve();
    }, reject);
  });
}
```

**구조**:
```
@cornerstonejs/dicom-image-loader/
├── shared/decoders/
│   ├── decodeJPEGLossless.js      ← jpeg-lossless-decoder-js 사용
│   ├── decodeJPEGBaseline8Bit.js  ← @cornerstonejs/codec-libjpeg-turbo-8bit 사용
│   ├── decodeHTJ2K.js             ← @cornerstonejs/codec-openjph 사용
│   └── index.js                   ← initializers, decoders export
```

**결론**:
- ❌ `@cornerstonejs/codec-libjpeg-turbo-8bit`는 **JPEG Baseline 8bit만** 지원
- ✅ JPEG Lossless는 **별도 라이브러리** 사용 (`jpeg-lossless-decoder-js`)
- ✅ **코덱 등록 불필요** - 자동으로 dynamic import됨

### 2.3 Transfer Syntax 읽기 방식 분석 ✅

**발견**: wadouri는 DICOM 메타데이터에서 직접 읽음

```javascript
// node_modules/@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadouri/loadImage.js:24, 62
const transferSyntax = dataSet.string('x00020010');  // ← DICOM tag 0002,0010
const imagePromise = createImage(imageId, pixelData, transferSyntax, options);
```

**MEMORY.md 분석과 일치**:
```markdown
**근본 원인 분석**:
1. **로컬 파일 (wadouri)**: DICOM 태그 0002,0010에서 Transfer Syntax 직접 읽음 ✅
2. **DICOMweb (wadors)**: HTTP Content-Type 헤더에서 Transfer Syntax 추론 ❌
```

**결론**: Transfer Syntax 읽기는 정상 동작 중

---

## 3. 잘못된 해결 시도들

### 3.1 시도 1: WADORS logging 추가 ❌

**의도**: `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadors/loadImage.js`에 localStorage logging 추가

**실패 원인**: mammography는 **wadouri**를 사용하므로 wadors/loadImage.js는 실행되지 않음

### 3.2 시도 2: JPEG Lossless 코덱 등록 ❌

**의도**: `extensions/cornerstone/src/initWADOImageLoader.js`에서 디코더 등록

```javascript
// ❌ 잘못된 시도
const { external } = dicomImageLoader;
external.setDecoder('1.2.840.10008.1.2.4.70', decodeJPEGBaseline);
```

**실패 원인**:
1. `dicomImageLoader.external`은 **존재하지 않는 API**
2. `@cornerstonejs/codec-libjpeg-turbo-8bit`는 JPEG Baseline 8bit만 지원
3. JPEG Lossless는 별도 라이브러리 사용 (`jpeg-lossless-decoder-js`)
4. **코덱 등록 자체가 불필요** - 자동으로 dynamic import됨

**에러 발생**:
```
Uncaught runtime errors:
ERROR
Cannot read properties of undefined (reading 'setDecoder')
TypeError: Cannot read properties of undefined (reading 'setDecoder')
```

### 3.3 CLAUDE.md의 "해결책"이 완전히 틀렸음 ❌

**CLAUDE.md 내용**:
```markdown
### 4. JPEG Lossless 이미지 로딩 실패 (Mammography)
**해결**: (2026-02-12)
`extensions/cornerstone/src/initWADOImageLoader.js`에 JPEG Lossless 코덱 등록 추가
```

**문제점**:
1. API가 존재하지 않음 (`external.setDecoder`)
2. 잘못된 라이브러리 사용 (`codec-libjpeg-turbo-8bit` vs `jpeg-lossless-decoder-js`)
3. 근본 원인 오진 (코덱 미등록이 아님)

---

## 4. 현재 이해한 구조

### 4.1 Image Loading Flow

```
사용자가 Mammography Study 열기
  ↓
getImageId() - extensions/default/src/DicomWebDataSource/utils/getImageId.js
  → imageId = 'dicomweb:http://...'
  ↓
wadouri/loadImage.js - node_modules/@cornerstonejs/dicom-image-loader/.../wadouri/loadImage.js
  → dataSet.string('x00020010') - Transfer Syntax 읽기
  → transferSyntax = '1.2.840.10008.1.2.4.70' (JPEG Lossless)
  ↓
createImage() - imageLoader/createImage.js
  → getDecoder(transferSyntax) 호출
  ↓
decodeJPEGLossless.js
  → initialize() - dynamic import('jpeg-lossless-decoder-js')
  → decoder.decode() 호출
  ↓
❌ 에러 발생: "Illegal ERMF value: 1"
```

### 4.2 Transfer Syntax UID 매핑

| Transfer Syntax UID | 이름 | 디코더 라이브러리 |
|---------------------|------|------------------|
| 1.2.840.10008.1.2.4.50 | JPEG Baseline (Process 1) | `@cornerstonejs/codec-libjpeg-turbo-8bit` |
| 1.2.840.10008.1.2.4.51 | JPEG Extended (Process 2 & 4) | `@cornerstonejs/codec-libjpeg-turbo-8bit` |
| 1.2.840.10008.1.2.4.57 | JPEG Lossless, Non-Hierarchical (Process 14) | `jpeg-lossless-decoder-js` |
| **1.2.840.10008.1.2.4.70** | **JPEG Lossless, First-Order Prediction** | **`jpeg-lossless-decoder-js`** |
| 1.2.840.10008.1.2.4.201 | HTJ2K | `@cornerstonejs/codec-openjph` |

### 4.3 디코더 초기화 프로세스

```javascript
// decodeJPEGLossless.js
async function decodeJPEGLossless(imageFrame, pixelData) {
  await initialize();  // ← jpeg-lossless-decoder-js dynamic import

  if (typeof local.DecoderClass === 'undefined') {
    throw new Error('No JPEG Lossless decoder loaded');
  }

  const decoder = new local.DecoderClass();
  const decompressedData = decoder.decode(buffer, offset, length, byteOutput);  // ← 여기서 에러?

  return imageFrame;
}
```

---

## 5. 가설 및 다음 단계

### 5.1 가능한 원인 가설

#### 가설 1: `jpeg-lossless-decoder-js` 라이브러리 문제 🔍
- **가능성**: 높음
- **이유**: "Illegal ERMF value: 1"은 JPEG 메타데이터 파싱 에러
- **검증 방법**:
  ```bash
  # 라이브러리 설치 확인
  npm list jpeg-lossless-decoder-js

  # 버전 확인
  cat node_modules/jpeg-lossless-decoder-js/package.json | grep version
  ```

#### 가설 2: DICOM 파일 메타데이터 손상 🔍
- **가능성**: 중간
- **이유**: Transfer Syntax는 읽혔지만 실제 데이터가 다를 수 있음
- **검증 방법**: dcmdump로 파일 구조 확인

#### 가설 3: 디코더 초기화 실패 🔍
- **가능성**: 중간
- **이유**: dynamic import가 실패했을 수 있음
- **검증 방법**: Console에서 초기화 로그 확인

#### 가설 4: Transfer Syntax Negotiation 문제 🔍
- **가능성**: 낮음
- **이유**: DCM4CHEE 서버가 `transferSyntax=*` 요청에 잘못된 형식 반환
- **검증 방법**: Network 탭에서 실제 응답 Content-Type 확인

### 5.2 다음 단계 (우선순위순)

#### ✅ Step 1: 정확한 에러 메시지 수집
- [ ] 브라우저 하드 리프레시 (`Ctrl + Shift + R`)
- [ ] Console 첫 번째 에러의 **전체 스택 트레이스** 복사
- [ ] 에러가 발생하는 정확한 파일과 라인 확인

#### ✅ Step 2: 라이브러리 설치 확인
```bash
npm list jpeg-lossless-decoder-js
npm list @cornerstonejs/codec-libjpeg-turbo-8bit
npm list @cornerstonejs/codec-openjph
```

#### ✅ Step 3: Console에서 디버깅
```javascript
// Console에서 실행
// 1. JPEG Lossless 디코더 확인
import('jpeg-lossless-decoder-js').then(m => console.log('JPEG Lossless:', m));

// 2. Transfer Syntax 확인
// (이미지 로드 후 실행)
```

#### ✅ Step 4: wadouri/loadImage.js에 임시 로깅 추가
- Transfer Syntax 값 확인
- 디코더 선택 과정 확인
- 에러 발생 지점 정확히 파악

---

## 6. 작업 로그

### 2026-02-13

**09:00-11:00**: 초기 조사
- ❌ wadors/loadImage.js에 logging 추가 시도 → 실행 안됨 (wadouri 사용 중)
- ❌ JPEG Lossless 코덱 등록 시도 → API 존재하지 않음
- ✅ mammography가 wadouri 프로토콜 사용 확인
- ✅ JPEG Lossless 자체 디코더 구조 분석 완료
- ✅ CLAUDE.md의 "해결책"이 틀렸음 확인

**11:00-현재**: 문서 정리 및 다음 단계 계획
- ✅ 본 문서 작성
- 🔄 사용자에게 정확한 에러 메시지 요청 예정

---

## 7. 참고 자료

### 7.1 관련 파일

**Image Loader**:
- `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadouri/loadImage.js`
- `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGLossless.js`
- `node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/index.js`

**Data Source**:
- `extensions/default/src/DicomWebDataSource/utils/getImageId.js`
- `extensions/default/src/DicomWebDataSource/utils/getWADORSImageId.js`

**설정**:
- `platform/app/public/config/default.js`
- `platform/app/public/config/local_dcm4chee.js`

### 7.2 DICOM Transfer Syntax 참고

- [DICOM PS3.5 - Transfer Syntax](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/chapter_A.html)
- [JPEG Lossless (1.2.840.10008.1.2.4.70)](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_A.4.html#sect_A.4.4)

### 7.3 라이브러리

- [jpeg-lossless-decoder-js](https://www.npmjs.com/package/jpeg-lossless-decoder-js)
- [@cornerstonejs/dicom-image-loader](https://www.npmjs.com/package/@cornerstonejs/dicom-image-loader)

---

**Last Updated**: 2026-02-13 11:30
**Status**: 🔍 조사 진행 중
**Next Action**: Console 에러 메시지 전체 확인 필요
