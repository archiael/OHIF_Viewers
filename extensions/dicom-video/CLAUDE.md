# extensions/dicom-video

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [주요 책임](#1.1-주요-책임)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일 역할](#2.2-주요-파일-역할)
   - 2.3. [데이터 흐름 다이어그램](#2.3-데이터-흐름-다이어그램)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
   - 3.4. [비동기 데이터 로딩 패턴 (15-21줄)](#3.4-비동기-데이터-로딩-패턴-15-21줄)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension (확장)](#4.1-extension-확장)
   - 4.2. [Viewport Module](#4.2-viewport-module)
   - 4.3. [SOP Class Handler Module](#4.3-sop-class-handler-module)
   - 4.4. [DisplaySet](#4.4-displayset)
   - 4.5. [Data Source](#4.5-data-source)
   - 4.6. [Generic Metadata Provider](#4.6-generic-metadata-provider)
   - 4.7. [관련 폴더 링크](#4.7-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 확장을 다 이해하면 할 수 있게 되는 것](#5.2-이-확장을-다-이해하면-할-수-있게-되는-것)
   - 5.3. [추가 학습 자료](#5.3-추가-학습-자료)
6. [부록: 지원되는 SOP Class 및 Transfer Syntax](#6-부록-지원되는-sop-class-및-transfer-syntax)
   - 6.1. [지원되는 SOP Class UID](#6.1-지원되는-sop-class-uid)
   - 6.2. [지원되는 Transfer Syntax UID](#6.2-지원되는-transfer-syntax-uid)

---


## 1. 모듈 개요

이 확장은 **DICOM 비디오 객체를 HTML5 `<video>` 태그로 렌더링**하는 역할을 담당합니다. 전체 OHIF 뷰어 앱에서 내시경(Endoscopic), 현미경(Microscopic), 사진(Photographic) 등의 의료 비디오 이미지를 표시할 때 사용됩니다.

### 1.1. 주요 책임
- DICOM 비디오 SOP Class를 인식하고 처리
- 비디오 URL을 추출하여 HTML5 video player로 렌더링
- MPEG4 AVC(H.264), HEVC(H.265) 등 다양한 비디오 코덱 지원

### 1.2. 연결되는 화면/기능
- **비디오 뷰포트**: 사용자가 비디오 시리즈를 선택하면 전용 비디오 플레이어가 표시됩니다
- **썸네일 패널**: 비디오 시리즈가 썸네일로 표시되며, 클릭 시 재생됩니다
- **모드 연동**: `basic`, `longitudinal` 등 다양한 모드에서 비디오 DisplaySet을 자동으로 인식하고 렌더링합니다

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
extensions/dicom-video/src/
├── index.tsx                              # 확장 메인 진입점 (60줄)
├── id.js                                  # 확장 ID 정의 (6줄)
├── getSopClassHandlerModule.js            # SOP Class 핸들러 모듈 (114줄)
└── viewports/
    └── OHIFCornerstoneVideoViewport.tsx   # 비디오 렌더링 컴포넌트 (56줄)
```

### 2.2. 주요 파일 역할

| 파일명 | 역할 |
|--------|------|
| `index.tsx` | 확장 등록 및 Viewport Module 내보내기, React.lazy로 비디오 컴포넌트 동적 로딩 |
| `id.js` | 확장 ID (`@ohif/extension-dicom-video`) 및 SOPClassHandlerId 정의 |
| `getSopClassHandlerModule.js` | 비디오 SOP Class UID 필터링, DisplaySet 생성, 비디오 URL 추출 로직 |
| `viewports/OHIFCornerstoneVideoViewport.tsx` | HTML5 `<video>` 태그를 사용한 실제 비디오 렌더링 UI 컴포넌트 |

### 2.3. 데이터 흐름 다이어그램

```
[DICOM 데이터소스]
        ↓
[getSopClassHandlerModule]
  - SOP Class UID 필터링 (비디오 객체만 선택)
  - Transfer Syntax 검증 (MPEG4/HEVC 지원 확인)
  - DisplaySet 생성 (viewportType: VIDEO)
        ↓
[DisplaySetService]
  - DisplaySet 등록
  - Thumbnail 생성
        ↓
[Mode의 Hanging Protocol]
  - 비디오 DisplaySet을 viewport에 배치
        ↓
[OHIFCornerstoneVideoViewport 컴포넌트]
  - videoUrl을 비동기로 로드
  - HTML5 <video> 태그로 렌더링
  - 사용자 재생/일시정지 제어
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

**로컬 상태 (useState)**:
- `OHIFCornerstoneVideoViewport` 컴포넌트는 `url` 상태를 관리합니다 (13-14줄)
- 비디오 URL이 비동기로 로드되므로 `useState(null)`로 초기화 후 `useEffect`에서 업데이트

**Props를 통한 데이터 전달**:
- `displaySets` prop으로 비디오 DisplaySet 정보를 받습니다 (4줄)
- `servicesManager`, `extensionManager`는 상위에서 주입되어 확장 간 통신에 사용됩니다 (32-40줄)

**전역 서비스 의존성**:
- `extensionManager.getActiveDataSource()`를 통해 데이터 소스에 접근 (34줄)
- `csUtils.genericMetadataProvider`에 비디오 URL 메타데이터를 등록 (92-95줄)

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

**React.lazy + Suspense 패턴** (5-15줄):
```typescript
const Component = React.lazy(() => {
  return import('./viewports/OHIFCornerstoneVideoViewport');
});

const OHIFCornerstoneVideoViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};
```
- **목적**: 비디오 컴포넌트를 필요할 때만 로드하여 초기 번들 크기 최적화
- **장점**: 비디오 기능을 사용하지 않는 사용자는 이 코드를 다운로드하지 않음

**Higher-Order Component 패턴** (33-41줄):
```typescript
const ExtendedOHIFCornerstoneVideoViewport = props => {
  return (
    <OHIFCornerstoneVideoViewport
      servicesManager={servicesManager}
      extensionManager={extensionManager}
      {...props}
    />
  );
};
```
- **목적**: 서비스를 주입하여 컴포넌트를 확장 가능하게 만듦
- **장점**: 테스트 시 mock 서비스 주입 가능

### 3.3. 커스텀 훅
이 확장에는 커스텀 훅이 없습니다. `useEffect`, `useState`와 같은 기본 React 훅만 사용합니다.

### 3.4. 비동기 데이터 로딩 패턴 (15-21줄)
```typescript
useEffect(() => {
  const load = async () => {
    setUrl(await videoUrl);
  };
  load();
}, [videoUrl]);
```
- **목적**: 비디오 URL이 Promise일 수 있으므로 비동기 처리
- **의존성**: `videoUrl`이 변경될 때마다 재실행

---

## 4. OHIF 특유 개념 정리

### 4.1. Extension (확장)
이 모듈은 OHIF의 **Extension** 중 하나입니다. Extension은 뷰어에 새로운 기능을 추가하는 플러그인 방식의 모듈입니다.

**등록 방식** (20-46줄):
```typescript
const dicomVideoExtension = {
  id: '@ohif/extension-dicom-video',
  getViewportModule({ servicesManager, extensionManager }) { ... },
  getSopClassHandlerModule,
};
```

### 4.2. Viewport Module
`getViewportModule` 함수가 반환하는 객체입니다 (32-44줄):
- **name**: `'dicom-video'` - 이 viewport의 고유 이름
- **component**: React 컴포넌트 - 실제 렌더링할 컴포넌트

**관련 파일**: `platform/core/src/extensions/ExtensionManager.ts`

### 4.3. SOP Class Handler Module
DICOM SOP Class를 처리하는 모듈입니다 (`getSopClassHandlerModule.js`).

**역할**:
1. **SOP Class UID 필터링** (6-19줄): 비디오 SOP Class만 선택
   - Video Endoscopic Image Storage (`1.2.840.10008.5.1.4.1.1.77.1.1.1`)
   - Video Microscopic Image Storage (`1.2.840.10008.5.1.4.1.1.77.1.2.1`)
   - Video Photographic Image Storage (`1.2.840.10008.5.1.4.1.1.77.1.4.1`)
   - Secondary Capture (비디오로 간주하려면 90프레임 이상) (52-54줄)

2. **Transfer Syntax 검증** (21-31줄): 지원되는 비디오 코덱 확인
   - MPEG4 AVC (H.264)
   - HEVC (H.265)

3. **DisplaySet 생성** (66-96줄): 비디오 메타데이터를 DisplaySet 객체로 변환

**관련 파일**: `platform/core/src/services/DisplaySetService/DisplaySetService.ts`

### 4.4. DisplaySet
OHIF에서 관련 이미지/비디오를 그룹화한 단위입니다.

**비디오 DisplaySet 구조** (66-91줄):
```typescript
{
  displaySetInstanceUID: utils.guid(),  // 고유 ID
  viewportType: csEnums.ViewportType.VIDEO,  // 'video'
  instances: [instance],  // DICOM 인스턴스 배열
  imageIds: [imageId],  // Cornerstone imageId
  numImageFrames: NumberOfFrames,  // 프레임 수
  isDerivedDisplaySet: true,  // 파생된 DisplaySet
  videoUrl: '...',  // 추출된 비디오 URL
}
```

### 4.5. Data Source
비디오 URL을 가져오는 방법 (60-65줄):
```typescript
const videoUrl = dataSource.retrieve.directURL({
  instance,
  singlepart: 'video',
  tag: 'PixelData',
  url,
});
```
- **관련 확장**: `@ohif/extension-default` - `DicomWebDataSource`, `DicomLocalDataSource`
- **관련 파일**: `extensions/default/src/DicomWebDataSource/index.ts`

### 4.6. Generic Metadata Provider
Cornerstone에 비디오 URL 메타데이터를 등록합니다 (92-95줄):
```typescript
csUtils.genericMetadataProvider.add(imageId, {
  type: 'imageUrlModule',
  metadata: { rendered: videoUrl },
});
```
- **목적**: Cornerstone이 imageId로 비디오 URL을 조회할 수 있도록 함

### 4.7. 관련 폴더 링크
- `platform/core/src/extensions/` - Extension Manager 구현
- `platform/core/src/services/DisplaySetService/` - DisplaySet 관리
- `extensions/default/src/DicomWebDataSource/` - DICOMweb 데이터 소스
- `extensions/cornerstone/src/` - Cornerstone 렌더링 확장
- `modes/basic/src/` - 비디오를 사용하는 기본 모드

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: 비디오 렌더링 컴포넌트 이해 (30분)
**파일**: `viewports/OHIFCornerstoneVideoViewport.tsx`

- HTML5 `<video>` 태그의 기본 사용법 확인
- `useEffect`를 사용한 비동기 데이터 로딩 패턴 학습
- `crossOrigin="anonymous"` 설정의 의미 이해 (CORS)

**체크포인트**:
- Q: 왜 `<source>` 태그가 2개인가요?
- A: Firefox 브라우저 버그 해결을 위한 workaround입니다 (23줄 주석)

#### 2단계: SOP Class Handler 이해 (1시간)
**파일**: `getSopClassHandlerModule.js`

- DICOM SOP Class UID가 무엇인지 학습
- Transfer Syntax UID의 역할 이해
- DisplaySet이 어떻게 생성되는지 추적

**실습**:
```javascript
// 1. 지원되는 SOP Class UID 확인
console.log(SOP_CLASS_UIDS);

// 2. Transfer Syntax 필터링 로직 이해
console.log(supportedTransferSyntaxUIDs);

// 3. Secondary Capture가 비디오로 간주되는 조건 확인
// 조건: NumberOfFrames >= 90
```

#### 3단계: Extension 등록 메커니즘 이해 (30분)
**파일**: `index.tsx`

- Extension 객체 구조 학습 (`id`, `getViewportModule`, `getSopClassHandlerModule`)
- React.lazy와 Suspense의 코드 스플리팅 패턴 이해
- HOC 패턴으로 서비스를 주입하는 방법 학습

**참고 자료**:
- React 공식 문서: [Code-Splitting](https://react.dev/reference/react/lazy)
- OHIF 문서: [Extensions](https://docs.ohif.org/platform/extensions/)

#### 4단계: 전체 데이터 흐름 추적 (1시간)
**디버깅 실습**:

1. 브라우저 DevTools를 열고 비디오 시리즈를 로드
2. `getSopClassHandlerModule.js` 33줄에 breakpoint 설정
3. 어떤 인스턴스가 필터링되는지 확인
4. `OHIFCornerstoneVideoViewport.tsx` 16줄에 breakpoint 설정
5. 비디오 URL이 어떻게 로드되는지 확인

**Console 명령어**:
```javascript
// DisplaySetService에서 비디오 DisplaySet 찾기
const videoDisplaySets = window.displaySetService
  .getActiveDisplaySets()
  .filter(ds => ds.viewportType === 'video');

console.log(videoDisplaySets);
```

### 5.2. 이 확장을 다 이해하면 할 수 있게 되는 것

**1. 새로운 DICOM 객체 타입 지원 추가**
- 예: DICOM PDF, DICOM SR(Structured Report), DICOM Waveform 등을 렌더링하는 새로운 확장을 만들 수 있습니다.
- 패턴: SOP Class Handler → DisplaySet 생성 → 전용 Viewport 컴포넌트

**2. 커스텀 비디오 플레이어 구현**
- 기본 HTML5 video 대신 Video.js, Plyr.js 같은 고급 플레이어 통합
- 프레임 단위 탐색, 측정 도구 오버레이 등 의료 영상 전용 기능 추가

**3. OHIF Extension 아키텍처 이해**
- 다른 확장(`cornerstone`, `default`, `measurement-tracking` 등)의 구조를 빠르게 파악할 수 있습니다.
- 확장 간 의존성 관리 및 서비스 통신 방법을 이해하게 됩니다.

### 5.3. 추가 학습 자료

- **DICOM 표준**: [Part 4: Service-Object Pair (SOP) Classes](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/PS3.4.html)
- **Video Transfer Syntax**: [Part 5: Annex A.5 (Video Compression)](https://dicom.nema.org/medical/dicom/current/output/chtml/part05/chapter_A.html)
- **OHIF Extension 가이드**: [공식 문서](https://docs.ohif.org/platform/extensions/modules/)

---

## 6. 부록: 지원되는 SOP Class 및 Transfer Syntax

### 6.1. 지원되는 SOP Class UID

| SOP Class | UID | 설명 |
|-----------|-----|------|
| Video Endoscopic Image Storage | `1.2.840.10008.5.1.4.1.1.77.1.1.1` | 내시경 비디오 |
| Video Microscopic Image Storage | `1.2.840.10008.5.1.4.1.1.77.1.2.1` | 현미경 비디오 |
| Video Photographic Image Storage | `1.2.840.10008.5.1.4.1.1.77.1.4.1` | 사진 비디오 |
| Secondary Capture Image Storage | `1.2.840.10008.5.1.4.1.1.7` | 보조 캡처 (90프레임 이상) |
| Multiframe True Color Secondary Capture | `1.2.840.10008.5.1.4.1.1.7.4` | 다중프레임 보조 캡처 (90프레임 이상) |

### 6.2. 지원되는 Transfer Syntax UID

| Transfer Syntax | UID | 설명 |
|----------------|-----|------|
| MPEG4 AVC/H.264 High Profile | `1.2.840.10008.1.2.4.102` | 일반 H.264 |
| MPEG4 AVC/H.264 BD-compatible High Profile | `1.2.840.10008.1.2.4.103` | Blu-ray 호환 |
| MPEG4 AVC/H.264 High Profile for 2D Video | `1.2.840.10008.1.2.4.104` | 2D 비디오용 |
| MPEG4 AVC/H.264 High Profile for 3D Video | `1.2.840.10008.1.2.4.105` | 3D 비디오용 |
| MPEG4 AVC/H.264 Stereo High Profile | `1.2.840.10008.1.2.4.106` | 스테레오 비디오 |
| HEVC/H.265 Main Profile | `1.2.840.10008.1.2.4.107` | H.265 메인 |
| HEVC/H.265 Main 10 Profile | `1.2.840.10008.1.2.4.108` | H.265 10비트 |
