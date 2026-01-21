# extensions/dicom-pdf

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [핵심 책임](#1.1-핵심-책임)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
   - 1.3. [제공하는 기능](#1.3-제공하는-기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일 역할](#2.2-주요-파일-역할)
   - 2.3. [컴포넌트 관계 및 데이터 흐름](#2.3-컴포넌트-관계-및-데이터-흐름)
   - 2.4. [데이터 흐름 상세](#2.4-데이터-흐름-상세)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 패턴](#3.2-재사용-가능한-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
   - 3.4. [React 라이프사이클 통합](#3.4-react-라이프사이클-통합)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension 시스템](#4.1-extension-시스템)
   - 4.2. [SOP Class Handler](#4.2-sop-class-handler)
   - 4.3. [DisplaySet 개념](#4.3-displayset-개념)
   - 4.4. [DataSource의 retrieve API](#4.4-datasource의-retrieve-api)
   - 4.5. [관련 폴더 링크](#4.5-관련-폴더-링크)
   - 4.6. [Extension 등록 과정](#4.6-extension-등록-과정)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 확장을 이해하면 할 수 있게 되는 것](#5.2-이-확장을-이해하면-할-수-있게-되는-것)
   - 5.3. [초보자를 위한 코드 읽기 팁](#5.3-초보자를-위한-코드-읽기-팁)
   - 5.4. [디버깅 가이드](#5.4-디버깅-가이드)
   - 5.5. [추가 학습 자료](#5.5-추가-학습-자료)
6. [정리](#6-정리)

---


## 1. 모듈 개요

`extensions/dicom-pdf`는 DICOM Encapsulated PDF 파일을 OHIF 뷰어에서 표시하기 위한 확장 모듈입니다.

### 1.1. 핵심 책임
- **DICOM PDF 렌더링**: DICOM으로 캡슐화된 PDF 문서를 브라우저의 네이티브 PDF 뷰어로 표시
- **SOP Class 처리**: `1.2.840.10008.5.1.4.1.1.104.1` (Encapsulated PDF Storage) SOP Class 처리
- **DisplaySet 생성**: PDF 인스턴스를 OHIF의 DisplaySet 형태로 변환
- **Viewport 제공**: PDF 전용 커스텀 viewport 컴포넌트 제공

### 1.2. 연결되는 화면/기능
- **Study 목록 화면**: PDF 시리즈가 썸네일로 표시됨
- **Viewport 영역**: PDF 문서가 전체 viewport에 렌더링됨
- **Hanging Protocol**: PDF를 포함한 다중 모달리티 레이아웃 구성 가능

### 1.3. 제공하는 기능
1. DICOM 태그에서 PDF 바이너리 데이터 추출
2. 브라우저 네이티브 `<object>` 태그를 사용한 PDF 렌더링
3. 드래그 이벤트와 PDF 스크롤 간의 충돌 방지 메커니즘

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
extensions/dicom-pdf/src/
├── index.tsx                              # 확장 모듈 메인 진입점
├── id.js                                  # 확장 ID 정의
├── getSopClassHandlerModule.js            # SOP Class 처리 로직
└── viewports/
    ├── OHIFCornerstonePdfViewport.tsx    # PDF Viewport 컴포넌트
    └── OHIFCornerstonePdfViewport.css    # PDF Viewport 스타일
```

### 2.2. 주요 파일 역할

| 파일명 | 역할 | 코드 라인 |
|--------|------|-----------|
| `index.tsx` | 확장 모듈 정의, ViewportModule 및 SopClassHandlerModule 등록 | 48줄 |
| `id.js` | 확장 ID (`@ohif/extension-dicom-pdf`) 및 SOPClassHandlerId 정의 | 6줄 |
| `getSopClassHandlerModule.js` | PDF 인스턴스를 DisplaySet으로 변환하는 로직 | 68줄 |
| `OHIFCornerstonePdfViewport.tsx` | PDF를 브라우저에 렌더링하는 리액트 컴포넌트 | 72줄 |
| `OHIFCornerstonePdfViewport.css` | PDF viewport의 포인터 이벤트 제어 스타일 | 12줄 |

### 2.3. 컴포넌트 관계 및 데이터 흐름

```
[ExtensionManager]
    │
    ├─ registerExtension(dicomPDFExtension)
    │
    └─> [dicomPDFExtension]
         │
         ├─ getViewportModule()
         │   └─> [OHIFCornerstonePdfViewport]
         │        └─ <object data={pdfUrl} type="application/pdf" />
         │
         └─ getSopClassHandlerModule()
             └─> [getDisplaySetsFromSeries]
                  ├─ instances (DICOM 인스턴스 배열)
                  ├─ dataSource.retrieve.directURL() ← PDF 바이너리 URL 생성
                  └─> DisplaySet { renderedUrl, SOPClassHandlerId, ... }
```

### 2.4. 데이터 흐름 상세

```
1. DICOM 파일 로드
   └─> DicomMetadataStore (instance 저장)

2. DisplaySet 생성
   └─> getSopClassHandlerModule.getDisplaySetsFromSeries()
       ├─ SOP Class UID 확인: '1.2.840.10008.5.1.4.1.1.104.1'
       ├─ dataSource.retrieve.directURL({ tag: 'EncapsulatedDocument' })
       │   └─> renderedUrl (Promise<string>)
       └─> DisplaySet 객체 생성

3. Viewport 렌더링
   └─> OHIFCornerstonePdfViewport
       ├─ displaySets[0].renderedUrl 로드 (useEffect)
       ├─ setUrl(await renderedUrl)
       └─> <object data={url} type="application/pdf" />
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

#### 로컬 상태 (useState)
```typescript
// OHIFCornerstonePdfViewport.tsx
const [url, setUrl] = useState(null);           // PDF URL 저장
const [style, setStyle] = useState('pdf-yes-click');  // CSS 클래스 토글
```

- **url**: 비동기로 로드된 PDF 데이터 URL
- **style**: 드래그 이벤트 처리를 위한 pointer-events 제어

#### Props를 통한 데이터 전달
```typescript
// index.tsx - 서비스 주입
<OHIFCornerstonePdfViewport
  servicesManager={servicesManager}
  extensionManager={extensionManager}
  {...props}
/>

// OHIFCornerstonePdfViewport.tsx - displaySets 수신
function OHIFCornerstonePdfViewport({ displaySets, viewportId })
```

### 3.2. 재사용 가능한 패턴

#### 1. React.lazy를 통한 코드 스플리팅
```typescript
// index.tsx
const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './viewports/OHIFCornerstonePdfViewport');
});

const OHIFCornerstonePdfViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};
```
- **장점**: 초기 번들 크기 감소, PDF 기능이 필요할 때만 로드
- **prefetch**: 브라우저가 유휴 시간에 미리 다운로드

#### 2. Viewport 등록 패턴 (useViewportRef)
```typescript
// OHIFCornerstonePdfViewport.tsx
const viewportElementRef = useRef(null);
const viewportRef = useViewportRef(viewportId);

<div
  ref={el => {
    viewportElementRef.current = el;
    if (el) viewportRef.register(el);  // OHIF viewport 시스템에 등록
  }}
>
```
- **@ohif/core의 useViewportRef 훅** 사용
- Viewport가 마운트되면 OHIF의 ViewportGridService에 자동 등록
- 언마운트 시 `viewportRef.unregister()` 호출로 정리

#### 3. 비동기 데이터 로딩 패턴
```typescript
useEffect(() => {
  const load = async () => {
    setUrl(await renderedUrl);  // Promise 해결 후 상태 업데이트
  };
  load();
}, [renderedUrl]);
```

### 3.3. 커스텀 훅

이 확장은 별도의 커스텀 훅을 정의하지 않고, OHIF core의 `useViewportRef` 훅을 사용합니다.

**useViewportRef 사용 목적**:
- Viewport DOM 요소를 OHIF 시스템에 등록
- Viewport의 라이프사이클 관리 (mount/unmount)
- Hanging Protocol이나 레이아웃 변경 시 viewport 참조 제공

### 3.4. React 라이프사이클 통합

```typescript
useEffect(() => {
  // 마운트 시: 드래그 이벤트 리스너 등록
  document.body.addEventListener('drag', makePdfDropTarget);

  return function cleanup() {
    // 언마운트 시: 정리
    document.body.removeEventListener('drag', makePdfDropTarget);
    viewportRef.unregister();  // OHIF viewport 등록 해제
  };
}, []);
```

---

## 4. OHIF 특유 개념 정리

### 4.1. Extension 시스템

#### Extension 구조
```typescript
const dicomPDFExtension = {
  id: '@ohif/extension-dicom-pdf',
  getViewportModule: ({ servicesManager, extensionManager }) => [...],
  getSopClassHandlerModule: ({ servicesManager, extensionManager }) => [...]
};
```

**Extension Module Types**:
- **ViewportModule**: 커스텀 viewport 컴포넌트 제공
- **SopClassHandlerModule**: 특정 SOP Class를 처리하는 로직 제공

### 4.2. SOP Class Handler

DICOM 파일의 SOP Class UID에 따라 어떻게 처리할지 정의하는 모듈입니다.

```javascript
// getSopClassHandlerModule.js
const SOP_CLASS_UIDS = {
  ENCAPSULATED_PDF: '1.2.840.10008.5.1.4.1.1.104.1',  // DICOM PDF
};

return [
  {
    name: 'dicom-pdf',
    sopClassUids: ['1.2.840.10008.5.1.4.1.1.104.1'],
    getDisplaySetsFromSeries: (instances) => { /* ... */ }
  }
];
```

**동작 방식**:
1. DICOM 파일이 로드되면 OHIF는 SOPClassUID를 확인
2. 등록된 SOP Class Handler 중 일치하는 것을 찾음
3. 해당 handler의 `getDisplaySetsFromSeries` 함수 호출
4. DisplaySet 생성

### 4.3. DisplaySet 개념

DisplaySet은 "화면에 표시할 수 있는 이미지 그룹"을 나타내는 OHIF의 핵심 데이터 구조입니다.

```javascript
const displaySet = {
  displaySetInstanceUID: utils.guid(),      // 고유 ID
  SOPClassHandlerId,                        // 이 DisplaySet을 처리할 handler
  SeriesDescription: 'PDF',                 // 시리즈 설명
  SeriesNumber,                             // 시리즈 번호
  renderedUrl: renderedUrl,                 // PDF URL (Promise)
  instances: [instance],                    // DICOM 인스턴스 배열
  isDerivedDisplaySet: true,                // 파생 DisplaySet 여부
  numImageFrames: 0,                        // PDF는 이미지 프레임 없음
  numInstances: 1,                          // 인스턴스 개수
  sopClassUids,                             // SOP Class UID 목록
};
```

### 4.4. DataSource의 retrieve API

```javascript
const renderedUrl = dataSource.retrieve.directURL({
  instance,                              // DICOM 인스턴스
  tag: 'EncapsulatedDocument',          // 추출할 DICOM 태그
  defaultType: 'application/pdf',       // MIME 타입
  singlepart: 'pdf',                    // 단일 파트 요청
});
```

**역할**:
- DICOM 태그에서 바이너리 데이터 추출
- Blob URL 또는 Data URL 생성
- Promise<string> 반환

### 4.5. 관련 폴더 링크

- **Extensions 시스템**: `platform/core/src/extensions/`
  - `ExtensionManager.ts`: 확장 등록 및 관리
  - `MODULE_TYPES.ts`: 모듈 타입 정의

- **Services**: `platform/core/src/services/`
  - `DisplaySetService.ts`: DisplaySet 관리
  - `ViewportGridService.ts`: Viewport 레이아웃 관리

- **DataSource**: `extensions/default/src/DicomWebDataSource/`
  - `retrieve.ts`: DICOM 데이터 추출 로직

- **다른 Viewport 확장**:
  - `extensions/cornerstone/`: 일반 DICOM 이미지 viewport
  - `extensions/dicom-video/`: DICOM 비디오 viewport
  - `extensions/dicom-microscopy/`: 현미경 슬라이드 viewport

### 4.6. Extension 등록 과정

```
1. platform/app/src/App.tsx
   └─> ExtensionManager.registerExtensions([dicomPDFExtension, ...])

2. Mode 설정 (modes/*/src/index.tsx)
   └─> extensions: ['@ohif/extension-dicom-pdf']

3. DICOM 파일 로드
   └─> SOPClassHandlerRegistry.findHandler(sopClassUID)
       └─> '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf'

4. Viewport 렌더링
   └─> ViewportGrid.getViewportComponent('dicom-pdf')
       └─> OHIFCornerstonePdfViewport
```

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: ViewportModule 이해 (30분)
**파일**: `src/index.tsx`

**학습 포인트**:
- Extension의 기본 구조 (id, getViewportModule)
- React.lazy와 Suspense를 통한 코드 스플리팅
- HOC 패턴 (servicesManager, extensionManager 주입)

**실습**:
```typescript
// 1. 확장의 id가 어떻게 정의되는지 확인
// 2. getViewportModule이 어떤 형태의 배열을 반환하는지 확인
// 3. React.lazy의 동작 방식 이해
```

#### 2단계: PDF Viewport 컴포넌트 (1시간)
**파일**: `src/viewports/OHIFCornerstonePdfViewport.tsx`

**학습 포인트**:
- `displaySets` prop의 구조 이해
- `useViewportRef` 훅 사용법
- 비동기 데이터 로딩 패턴
- 드래그 이벤트 처리 메커니즘

**실습**:
```typescript
// 1. displaySets[0].renderedUrl이 어떻게 생성되는지 추적
// 2. pointer-events CSS를 왜 동적으로 변경하는지 이해
// 3. viewportRef.register()가 하는 일 파악
```

#### 3단계: SOP Class Handler (1시간)
**파일**: `src/getSopClassHandlerModule.js`

**학습 포인트**:
- SOP Class UID의 의미
- DisplaySet 데이터 구조
- DataSource의 retrieve API 사용법

**실습**:
```javascript
// 1. ENCAPSULATED_PDF SOP Class UID 확인
// 2. _getDisplaySetsFromSeries 함수의 파라미터 이해
// 3. renderedUrl이 어떻게 생성되는지 추적
```

#### 4단계: 전체 데이터 흐름 (1시간)
**디버깅 포인트**:
1. DICOM 파일 로드 → `DicomMetadataStore`
2. SOP Class 매칭 → `getSopClassHandlerModule`
3. DisplaySet 생성 → `DisplaySetService`
4. Viewport 렌더링 → `OHIFCornerstonePdfViewport`

**실습**:
```bash
# 브라우저 DevTools에서 확인
1. Network 탭: PDF 바이너리 요청 확인
2. React DevTools: OHIFCornerstonePdfViewport props 확인
3. Console: displaySet 객체 구조 출력
```

### 5.2. 이 확장을 이해하면 할 수 있게 되는 것

**단기 목표 (1주)**:
- DICOM Encapsulated PDF를 OHIF 뷰어에서 표시할 수 있음
- 다른 DICOM 파일 타입(Video, Microscopy)을 위한 커스텀 확장 개발 가능
- Extension의 ViewportModule과 SopClassHandlerModule 개념 이해

**중기 목표 (1개월)**:
- 새로운 DICOM Modality를 지원하는 확장 직접 개발 가능
- DisplaySet 생성 로직 커스터마이징 가능
- 기존 Viewport에 기능 추가 (예: PDF 다운로드 버튼)

### 5.3. 초보자를 위한 코드 읽기 팁

#### 시작점
1. **README.md 먼저 읽기**: 확장의 목적 파악
2. **package.json 확인**: 의존성 및 peerDependencies 확인
3. **src/index.tsx**: 확장의 전체 구조 파악

#### 핵심 질문
- **Q1**: 이 확장은 어떤 DICOM 파일을 처리하나요?
  - **A**: SOP Class UID `1.2.840.10008.5.1.4.1.1.104.1` (Encapsulated PDF)

- **Q2**: PDF는 어떻게 화면에 표시되나요?
  - **A**: 브라우저 네이티브 `<object>` 태그 사용

- **Q3**: 다른 확장과의 차이점은?
  - **A**: 이미지 렌더링 없이 문서 표시만 담당 (numImageFrames: 0)

#### 확장 포인트

이 확장을 참고하여 추가 개발 가능한 영역:
1. **PDF 다운로드 버튼**: OHIFCornerstonePdfViewport에 버튼 추가
2. **PDF 페이지 네비게이션**: PDF.js 라이브러리 통합
3. **PDF 텍스트 검색**: PDF 내용 검색 기능 추가
4. **PDF 주석**: DICOM SR과 연동한 주석 기능

### 5.4. 디버깅 가이드

#### 자주 발생하는 문제

**1. "No online PDF viewer installed" 메시지**
- **원인**: 브라우저가 PDF 렌더링을 지원하지 않거나 URL이 잘못됨
- **해결**:
  ```typescript
  // url 상태 확인
  console.log('PDF URL:', url);
  // renderedUrl Promise 확인
  console.log('Rendered URL Promise:', displaySets[0].renderedUrl);
  ```

**2. PDF가 드래그되지 않음**
- **원인**: `pointer-events: none` 상태로 고정됨
- **해결**:
  ```typescript
  // style 상태 확인
  console.log('Current style:', style);
  // 클릭 이벤트가 발생하는지 확인
  ```

**3. DisplaySet이 생성되지 않음**
- **원인**: SOP Class UID 불일치
- **해결**:
  ```javascript
  // getSopClassHandlerModule.js
  console.log('Instance SOP Class UID:', instance.SOPClassUID);
  console.log('Expected:', SOP_CLASS_UIDS.ENCAPSULATED_PDF);
  ```

#### 개발 도구 활용

**React DevTools**:
```
Component Tree:
└─ OHIFCornerstonePdfViewport
   ├─ displaySets: [{ renderedUrl: Promise, ... }]
   ├─ viewportId: "pdf-viewport"
   └─ url: "blob:http://localhost:3000/..."
```

**브라우저 Console**:
```javascript
// DisplaySet 확인
window.ohif.services.DisplaySetService.getActiveDisplaySets();

// Viewport 정보 확인
window.ohif.services.ViewportGridService.getState();
```

### 5.5. 추가 학습 자료

- **DICOM 표준**: [DICOM PS3.3 - Encapsulated PDF](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.45.html)
- **OHIF 문서**: [Custom Viewport 개발 가이드](https://docs.ohif.org/)
- **관련 확장**: `extensions/dicom-video/` (유사한 구조)

---

## 6. 정리

`extensions/dicom-pdf`는 **가장 단순한 OHIF 확장 중 하나**로, Extension 시스템을 학습하기에 이상적입니다.

- **총 파일 수**: 5개 (핵심 파일만)
- **총 코드 라인**: ~200줄
- **학습 난이도**: ⭐⭐☆☆☆ (하)
- **실무 활용도**: 의료 영상과 함께 문서(보고서, 동의서 등)를 함께 보는 워크플로우에서 필수

이 확장을 마스터하면 OHIF의 **Extension 아키텍처, DisplaySet 개념, Viewport 시스템**의 기초를 확실히 이해할 수 있습니다.
