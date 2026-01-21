# extensions/cornerstone-dicom-sr

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#커스텀-훅)
   - 3.4. [React Lifecycle 통합](#react-lifecycle-통합)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)

## 1. 모듈 개요

`@ohif/extension-cornerstone-dicom-sr`는 **DICOM Structured Report (SR)를 읽고 시각화하는 확장 모듈**입니다. DICOM SR은 의료 영상에 대한 측정값, 소견, 진단 정보를 구조화된 형식으로 저장하는 DICOM 표준입니다.

### 핵심 책임
- **SR 파일 파싱**: DICOM SR (SOP Class: BasicTextSR, EnhancedSR, ComprehensiveSR, Comprehensive3DSR)을 읽어 측정 데이터 추출
- **측정값 시각화**: SR에 저장된 측정값(길이, 각도, ROI 등)을 원본 이미지 위에 오버레이로 표시
- **Hydration**: SR 파일의 측정값을 MeasurementService에 로드하여 뷰어에서 조회/편집 가능하게 만듦
- **SR 생성 및 저장**: 사용자가 만든 측정값을 DICOM SR 형식으로 변환하여 PACS에 저장

### 연결되는 화면/기능
- **SR Viewport**: SR 파일을 열면 참조된 이미지들을 표시하고, 그 위에 측정값을 시각화
- **Measurement Panel**: SR의 측정값 목록을 패널에 표시하고 클릭하면 해당 이미지로 이동
- **Export/Import Workflow**: 측정값을 SR로 내보내거나, 기존 SR을 가져와 작업 이력 보존

---

## 2. 주요 파일/컴포넌트 리스트

### 진입점 및 모듈 등록
- **`src/index.tsx`**: Extension 진입점, `getViewportModule`, `getCommandsModule`, `getSopClassHandlerModule` 등을 export
- **`src/init.ts`**: `preRegistration` 단계에서 SR 전용 도구들(SRLength, SRBidirectional 등)을 Cornerstone Tools에 등록
- **`src/id.js`**: Extension ID 정의 (`@ohif/extension-cornerstone-dicom-sr`)

### SOP Class Handler (SR 파일 인식 및 DisplaySet 생성)
- **`src/getSopClassHandlerModule.ts`**: SR SOP Class UID를 처리하는 핸들러
  - `_getDisplaySetsFromSeries()`: SR 인스턴스를 받아 DisplaySet 생성
  - `_load()`: SR의 ContentSequence에서 측정값(`measurements`)과 참조 이미지(`referencedImages`) 추출
  - `_getMeasurements()`: TID 1500 Measurement Report에서 측정 데이터 파싱
  - `_processTID1410Measurement()`: SCOORD/SCOORD3D 좌표를 가진 측정값 처리
  - `_processNonGeometricallyDefinedMeasurement()`: 비기하학적 측정값 처리

### Commands Module (SR 저장, 다운로드, Hydration)
- **`src/commandsModule.ts`**: SR 관련 커맨드 정의
  - `storeMeasurements`: 측정값을 DICOM SR로 변환하여 PACS에 저장
  - `downloadReport`: SR을 `.dcm` 파일로 다운로드
  - `hydrateStructuredReport`: SR DisplaySet의 측정값을 MeasurementService에 로드

### Viewport 컴포넌트
- **`src/components/OHIFCornerstoneSRViewport.tsx`**: SR Viewport의 라우터 역할
  - `isImagingMeasurementReport`에 따라 측정 뷰포트 또는 텍스트 뷰포트 렌더링
- **`src/components/OHIFCornerstoneSRMeasurementViewport.tsx`**: 측정값이 포함된 SR을 표시
  - 참조된 이미지 DisplaySet을 로드하고 측정값 목록을 표시
  - 측정값 선택 시 해당 이미지로 이동
- **`src/components/OHIFCornerstoneSRTextViewport.tsx`**: 텍스트 기반 SR을 표시
- **`src/components/OHIFCornerstoneSRContainer.tsx`**: SR 컨텐츠 컨테이너
- **`src/components/OHIFCornerstoneSRContentItem.tsx`**: SR 컨텐츠 아이템 렌더링

### Utilities (SR 처리 유틸리티)
- **`src/utils/hydrateStructuredReport.ts`**: SR을 MeasurementService에 로드하는 핵심 로직
  - `MeasurementReport.generateToolState()`로 SR → Cornerstone3D toolState 변환
  - 2D SR: imageId 기반으로 매핑
  - 3D SR: FrameOfReferenceUID 기반으로 볼륨 매핑
- **`src/utils/addSRAnnotation.ts`**: SR 측정값을 Cornerstone Annotation으로 추가
- **`src/utils/getRenderableData.ts`**: SCOORD/SCOORD3D 좌표를 렌더링 가능한 포인트 배열로 변환
- **`src/utils/getFilteredCornerstoneToolState.ts`**: MeasurementService에서 SR로 변환할 측정값 필터링
- **`src/utils/isRehydratable.ts`**: SR이 현재 뷰어에서 hydration 가능한지 확인
- **`src/utils/createReferencedImageDisplaySet.ts`**: SR의 참조 이미지로부터 DisplaySet 생성
- **`src/utils/formatContentItem.ts`**: SR ContentSequence 아이템 포맷팅

### Tools (SR 전용 도구)
- **`src/tools/DICOMSRDisplayTool.ts`**: SR 측정값을 읽기 전용으로 표시하는 커스텀 도구
- **`src/tools/toolNames.ts`**: SR 도구 이름 상수 (DICOMSRDisplay, SRLength, SRBidirectional 등)
- **`src/tools/modules/dicomSRModule.js`**: TrackingUniqueIdentifier 관리

### 기타
- **`src/enums.ts`**: SR 관련 상수 (CodeNameCodeSequenceValues, CodingSchemeDesignators 등)
- **`src/getHangingProtocolModule.ts`**: SR 전용 Hanging Protocol
- **`src/onModeEnter.tsx`**: Mode 진입 시 초기화 로직

### 데이터 흐름 다이어그램 (텍스트)

```
[SR DICOM File]
       ↓
[getSopClassHandlerModule]
   - _getDisplaySetsFromSeries()
   - _load() → SR DisplaySet 생성
       ↓
[DisplaySetService에 등록]
       ↓
[SR Viewport 열림]
       ↓
[OHIFCornerstoneSRMeasurementViewport]
   - referencedImages로부터 DisplaySet 찾기
   - 측정값 목록 표시
       ↓
[hydrateStructuredReport 실행]
   - MeasurementReport.generateToolState()
   - addSRAnnotation()으로 각 측정값을 Annotation으로 변환
       ↓
[MeasurementService에 측정값 등록]
       ↓
[Cornerstone Viewport에 측정값 오버레이 렌더링]
```

**역방향 흐름 (측정값 → SR 저장)**
```
[사용자가 측정값 생성]
       ↓
[MeasurementService에 저장]
       ↓
[storeMeasurements 커맨드 실행]
       ↓
[getFilteredCornerstoneToolState]
   - MeasurementService에서 SR로 변환할 측정값 필터링
       ↓
[MeasurementReport.generateReport()]
   - Cornerstone3D 측정값 → DICOM SR 데이터셋 변환
       ↓
[dataSource.store.dicom()]
   - PACS에 SR 저장
       ↓
[DicomMetadataStore.addInstances()]
   - 새 SR을 메타데이터 스토어에 추가
       ↓
[DisplaySetService가 자동으로 새 SR DisplaySet 생성]
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### Props 기반 상태 전달
- **OHIFCornerstoneSRViewport**: `displaySets`, `viewportOptions`, `servicesManager` 등을 props로 받음
- **OHIFCornerstoneSRMeasurementViewport**:
  - `displaySets` props에서 SR DisplaySet 추출
  - 내부적으로 `useState`로 `measurementSelected`, `activeImageDisplaySetData`, `referencedDisplaySetMetadata` 관리

#### Context 사용
- **`useSystem()`**: `@ohif/core`의 SystemProvider에서 `servicesManager` 가져오기
- **`useViewportGrid()`**: `@ohif/ui-next`의 viewport grid 상태 접근
- **`usePositionPresentationStore()`**: `@ohif/extension-cornerstone`의 position presentation 상태 관리

#### Service 기반 전역 상태
- **DisplaySetService**: SR DisplaySet 등록 및 조회
- **MeasurementService**: SR에서 추출한 측정값을 전역적으로 관리
- **DicomMetadataStore**: SR 인스턴스 메타데이터 저장

### 재사용 가능한 UI 컴포넌트 패턴

#### Lazy Loading 패턴
```typescript
// src/index.tsx
const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './components/OHIFCornerstoneSRViewport');
});

const OHIFCornerstoneSRViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};
```
- SR Viewport 컴포넌트를 lazy load하여 초기 번들 크기 감소
- `webpackPrefetch` 힌트로 백그라운드에서 미리 로드

#### Viewport Wrapper 패턴
```typescript
// OHIFCornerstoneSRMeasurementViewport.tsx
const getCornerstoneViewport = useCallback(() => {
  if (!activeImageDisplaySetData) {
    return null;
  }
  return (
    <OHIFCornerstoneViewport
      displaySets={[activeImageDisplaySetData]}
      viewportOptions={...}
      // SR 참조 이미지를 Cornerstone Viewport로 렌더링
    />
  );
}, [activeImageDisplaySetData, ...]);
```
- `OHIFCornerstoneViewport`를 래핑하여 SR 특화 기능 추가
- SR DisplaySet → 참조 이미지 DisplaySet 변환 로직 캡슐화

### 커스텀 훅

이 확장에는 명시적인 커스텀 훅 정의가 없지만, **외부 확장의 훅을 활용**합니다:

#### `usePositionPresentationStore` (`@ohif/extension-cornerstone`)
```typescript
const { setPositionPresentation } = usePositionPresentationStore();

// 측정값 선택 시 해당 이미지 위치로 이동
setPositionPresentation(presentationIds.positionPresentationId, {
  viewReference: measurement.viewReference || {
    referencedImageId: measurement.imageId,
  },
});
```
- **역할**: 뷰포트의 카메라/슬라이스 위치를 제어
- **사용처**: 측정값 선택 시 해당 측정값이 위치한 이미지로 자동 이동

#### `useViewportGrid` (`@ohif/ui-next`)
```typescript
const [viewportGrid, viewportGridService] = useViewportGrid();
const { viewports, activeViewportId } = viewportGrid;
```
- **역할**: 현재 viewport grid 레이아웃 및 활성 viewport 정보 접근
- **사용처**: SR viewport와 다른 viewport들 간의 상호작용

### React Lifecycle 통합

#### `useEffect`로 DisplaySet 로딩
```typescript
useEffect(() => {
  if (!srDisplaySet.isLoaded) {
    srDisplaySet.load();
  }
}, [srDisplaySet]);
```
- SR DisplaySet이 로드되지 않았으면 자동으로 로드
- `load()` 메서드는 async로 ContentSequence 파싱

#### `useCallback`로 성능 최적화
```typescript
const updateViewport = useCallback(
  newMeasurementSelected => {
    _getViewportReferencedDisplaySetData(...)
      .then(({ referencedDisplaySet, referencedDisplaySetMetadata }) => {
        setMeasurementSelected(newMeasurementSelected);
        setActiveImageDisplaySetData(referencedDisplaySet);
        // ...
      });
  },
  [dataSource, srDisplaySet, activeImageDisplaySetData, viewportId]
);
```
- 의존성 배열이 변경될 때만 함수 재생성
- 불필요한 리렌더링 방지

---

## 4. OHIF 특유 개념 정리

### Extension Module Types

이 확장은 다음 모듈들을 export합니다:

#### 1. **ViewportModule** (`getViewportModule`)
- **정의**: 특정 타입의 데이터를 표시할 수 있는 React 컴포넌트 제공
- **이 확장에서**:
  ```typescript
  getViewportModule({ servicesManager, extensionManager }) {
    return [{ name: 'dicom-sr', component: ExtendedOHIFCornerstoneSRViewport }];
  }
  ```
- **사용**: Hanging Protocol에서 `displaySets[0].SOPClassHandlerId`가 `dicom-sr`일 때 이 viewport 사용

#### 2. **CommandsModule** (`getCommandsModule`)
- **정의**: 다른 확장이나 UI에서 호출할 수 있는 명령어 정의
- **이 확장에서**:
  - `storeMeasurements`: SR 저장
  - `downloadReport`: SR 다운로드
  - `hydrateStructuredReport`: SR 측정값 로드
- **사용 예**:
  ```typescript
  commandsManager.runCommand('hydrateStructuredReport', {
    displaySetInstanceUID: srDisplaySet.displaySetInstanceUID,
  });
  ```

#### 3. **SopClassHandlerModule** (`getSopClassHandlerModule`)
- **정의**: 특정 SOP Class UID를 처리하여 DisplaySet 생성
- **이 확장에서**:
  ```typescript
  sopClassUids = [
    '1.2.840.10008.5.1.4.1.1.88.11', // BasicTextSR
    '1.2.840.10008.5.1.4.1.1.88.22', // EnhancedSR
    '1.2.840.10008.5.1.4.1.1.88.33', // ComprehensiveSR
    '1.2.840.10008.5.1.4.1.1.88.34', // Comprehensive3DSR
  ]
  ```
- **동작**: DICOM 파일이 로드되면 SOP Class UID를 확인하고, 일치하면 `getDisplaySetsFromSeries()` 호출

#### 4. **UtilityModule** (`getUtilityModule`)
- **정의**: 다른 확장에서 사용할 수 있는 유틸리티 함수/상수 export
- **이 확장에서**:
  ```typescript
  getUtilityModule({ servicesManager }) {
    return [{ name: 'tools', exports: { toolNames } }];
  }
  ```
- **사용**: 다른 확장에서 `extensionManager.getModuleEntry('@ohif/extension-cornerstone-dicom-sr.utilityModule.tools').exports.toolNames` 접근

### OHIF 핵심 서비스 사용

#### DisplaySetService
```typescript
const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

// SR 인스턴스 추가 시 자동으로 DisplaySet 생성
DicomMetadataStore.addInstances([naturalizedReport], true);
// → DisplaySetService.EVENTS.DISPLAY_SETS_ADDED 이벤트 발생
```
- **역할**: DisplaySet (이미지 시리즈의 논리적 그룹) 관리
- **SR에서의 사용**: SR 파일 자체도 하나의 DisplaySet으로 등록

#### MeasurementService
```typescript
const mappings = measurementService.getSourceMappings(
  CORNERSTONE_3D_TOOLS_SOURCE_NAME,
  CORNERSTONE_3D_TOOLS_SOURCE_VERSION
);

measurementService.addRawMeasurement(
  source,
  annotationType,
  { annotation },
  matchingMapping.toMeasurementSchema,
  dataSource
);
```
- **역할**: 측정값 (길이, 면적, 각도 등)을 전역적으로 관리
- **Source Mapping**: Cornerstone3D 도구 → 내부 측정값 스키마 변환
- **SR에서의 사용**: SR 파일의 측정값을 MeasurementService에 등록하여 UI에서 표시

#### DicomMetadataStore
```typescript
const instance = DicomMetadataStore.getInstance(studyUID, seriesUID, sopUID);
```
- **역할**: DICOM 메타데이터를 메모리에 캐싱
- **SR에서의 사용**: SR ContentSequence에 접근하여 측정값 파싱

#### CustomizationService
```typescript
const onBeforeSRHydration = customizationService.getCustomization('onBeforeSRHydration')?.value;
if (typeof onBeforeSRHydration === 'function') {
  storedMeasurementByAnnotationType = onBeforeSRHydration({
    storedMeasurementByAnnotationType,
    displaySet,
  });
}
```
- **역할**: 런타임에 동작을 커스터마이징할 수 있는 훅 제공
- **SR에서의 사용**:
  - `onBeforeSRHydration`: SR 측정값 로드 전에 데이터 변환/필터링
  - `onBeforeSRAddMeasurement`: 개별 측정값 추가 전 전처리
  - `onBeforeDicomStore`: SR 저장 전 DICOM 데이터 수정

### DICOM SR 특화 개념

#### TID 1500 (Measurement Report)
- **정의**: DICOM SR에서 측정 리포트를 구조화하는 표준 템플릿
- **구조**:
  ```
  ImagingMeasurementReport (126000)
    ├── ImageLibrary (111028)
    │     └── 참조된 이미지 목록
    └── ImagingMeasurements (126010)
          └── MeasurementGroup (125007)
                ├── TrackingUniqueIdentifier (112040)
                ├── TrackingIdentifier (112039)
                ├── Finding (121071)
                └── NUM (측정값) or SCOORD/SCOORD3D (좌표)
  ```

#### SCOORD vs SCOORD3D
- **SCOORD**: 2D 이미지 좌표 (픽셀 단위, imageId 참조)
  - 예: `[x1, y1, x2, y2, ...]`
- **SCOORD3D**: 3D 월드 좌표 (mm 단위, FrameOfReferenceUID 참조)
  - 예: `[x1, y1, z1, x2, y2, z2, ...]`
- **GraphicType**: POINT, POLYLINE, CIRCLE, ELLIPSE 등

#### Comprehensive3DSR
- **정의**: 3D 측정값을 저장할 수 있는 SR SOP Class
- **처리**: `_measurementBelongsToDisplaySet()`에서 FrameOfReferenceUID 확인 후 볼륨 DisplaySet에 매핑

### 관련 폴더 링크

- **`platform/core/src/services/MeasurementService`**: 측정값 전역 관리
- **`platform/core/src/services/DisplaySetService`**: DisplaySet 관리
- **`platform/core/src/classes/MetadataProvider.ts`**: DICOM 메타데이터 접근
- **`extensions/cornerstone/`**: Cornerstone3D 렌더링 엔진 통합
- **`extensions/measurement-tracking/`**: 측정값 추적 및 UI 패널
- **`node_modules/@cornerstonejs/adapters`**: Cornerstone3D ↔ DICOM SR 변환 라이브러리 (외부 의존성)

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 1단계: DICOM SR 기본 개념 이해 (외부 학습)
- DICOM SR이 무엇인지, TID 1500 템플릿 구조
- SCOORD vs SCOORD3D 차이
- 추천 자료: [DICOM Part 3 (IODs)](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.35.html), [dcmjs-org SR 예제](https://github.com/dcmjs-org/dcmjs)

#### 2단계: SOP Class Handler 흐름 따라가기
**목표**: "SR 파일이 로드되면 어떻게 DisplaySet이 만들어지는가?"
1. `src/getSopClassHandlerModule.ts` 읽기
   - `_getDisplaySetsFromSeries()`: SR 인스턴스 → DisplaySet 생성
   - `_load()`: ContentSequence 파싱
   - `_getMeasurements()`: TID 1500 파싱
2. 디버깅 팁:
   ```javascript
   // 브라우저 콘솔에서
   window.__logSR = true; // SR 로딩 로그 활성화
   ```
3. 실습: Orthanc에 SR 샘플 업로드 후 뷰어에서 열어보기

#### 3단계: Viewport 컴포넌트 이해
**목표**: "SR Viewport는 어떻게 참조 이미지를 표시하는가?"
1. `src/components/OHIFCornerstoneSRViewport.tsx` (라우터)
2. `src/components/OHIFCornerstoneSRMeasurementViewport.tsx`
   - `updateViewport()`: 측정값 선택 시 참조 이미지 로드
   - `_getViewportReferencedDisplaySetData()`: SR → 참조 DisplaySet 찾기
3. React DevTools로 컴포넌트 state 관찰

#### 4단계: Hydration 로직 마스터
**목표**: "SR 측정값이 어떻게 Cornerstone Annotation으로 변환되는가?"
1. `src/utils/hydrateStructuredReport.ts` 정독
   - `MeasurementReport.generateToolState()`: SR → toolState 변환 (외부 라이브러리)
   - `getReferenceData()`: 2D/3D 참조 데이터 생성
   - `measurementService.addRawMeasurement()`: MeasurementService에 등록
2. `src/utils/addSRAnnotation.ts`
   - `getRenderableData()`: SCOORD → 렌더링 포인트 변환
   - `annotation.state.addAnnotation()`: Cornerstone Annotation 추가
3. 디버깅 팁:
   ```typescript
   // hydrateStructuredReport.ts에 breakpoint 설정
   console.log('SR measurements:', srDisplaySet.measurements);
   console.log('Tool state:', storedMeasurementByAnnotationType);
   ```

#### 5단계: Commands Module (SR 저장)
**목표**: "측정값을 SR로 변환하여 PACS에 저장하는 과정 이해"
1. `src/commandsModule.ts`
   - `storeMeasurements`: 측정값 → SR 데이터셋
   - `_generateReport()`: `MeasurementReport.generateReport()` 호출
2. `src/utils/getFilteredCornerstoneToolState.ts`
   - MeasurementService에서 저장할 측정값 필터링
3. 실습: 측정값 생성 후 "Export SR" 버튼 클릭 → 네트워크 탭에서 DICOM SR POST 요청 확인

#### 6단계: 확장 개발 (선택)
**목표**: "SR 확장을 커스터마이징하거나 새 도구 추가"
1. `src/init.ts`: 새 SR 도구 추가 방법
2. `src/tools/DICOMSRDisplayTool.ts`: 커스텀 도구 예제
3. CustomizationService 훅 활용:
   ```javascript
   // Mode 파일에서
   customizationService.addCustomization('onBeforeSRHydration', {
     value: ({ storedMeasurementByAnnotationType }) => {
       // SR 로드 전 데이터 변환
       return modifiedData;
     }
   });
   ```

### 학습 후 할 수 있게 되는 것

이 확장을 완전히 이해하면:

1. **DICOM SR 워크플로우 구축**: SR 기반 리포팅 시스템 구축 (예: 방사선과 판독 리포트)
2. **측정값 영구 저장**: 사용자가 만든 측정값을 DICOM 표준 형식으로 PACS에 저장하여 다른 뷰어와 호환
3. **3D SR 처리**: Comprehensive3DSR을 활용한 볼륨 측정값 저장/로드
4. **커스텀 SR 템플릿**: TID 1500 외 다른 SR 템플릿 지원 (예: TID 1419 - ROI Measurements)
5. **AI 결과 시각화**: AI 모델 출력을 DICOM SR로 변환하여 뷰어에 표시

### 디버깅 팁

```javascript
// 브라우저 콘솔에서 실행
window.__logSR = true; // SR 관련 상세 로그 출력

// DisplaySet 확인
const displaySetService = window.ohif.services.displaySetService;
const srDisplaySets = displaySetService.getDisplaySetsBy(ds => ds.Modality === 'SR');
console.log('SR DisplaySets:', srDisplaySets);

// 측정값 확인
const srDisplaySet = srDisplaySets[0];
console.log('SR measurements:', srDisplaySet.measurements);
console.log('Referenced images:', srDisplaySet.referencedImages);

// MeasurementService 확인
const measurementService = window.ohif.services.measurementService;
const measurements = measurementService.getMeasurements();
console.log('All measurements:', measurements);
```

### 추가 리소스

- **OHIF 공식 문서**: [DICOM SR Extension](https://docs.ohif.org/platform/extensions/modules/sop-class-handler)
- **dcmjs 라이브러리**: [SR Adapters](https://github.com/dcmjs-org/dcmjs/tree/master/src/adapters)
- **Cornerstone3D Adapters**: [SR Measurement Report](https://github.com/cornerstonejs/cornerstone3D/tree/main/packages/adapters/src/adapters/Cornerstone3D/MeasurementReport)
- **DICOM Standard**: [Part 3, Annex A (SR IODs)](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.35.html)

---

**마지막 업데이트**: 2026-01-01
**작성자**: Claude (OHIF Extensions Analyst)
