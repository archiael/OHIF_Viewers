# extensions/cornerstone-dicom-rt

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [React Lifecycle 패턴](#react-lifecycle-패턴)
   - 3.3. [React.lazy를 통한 코드 스플리팅](#reactlazy를-통한-코드-스플리팅)
   - 3.4. [재사용 컴포넌트 패턴](#재사용-컴포넌트-패턴)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)

## 1. 모듈 개요

이 확장은 **DICOM RT Structure Set (RTSTRUCT) 파일을 읽고 시각화**하는 기능을 제공합니다. 방사선 치료 계획에서 사용되는 구조물(종양, 장기 등)의 윤곽선(contour)을 의료 영상 위에 겹쳐서 보여줍니다.

### 전체 OHIF 앱에서의 역할
- **RTSTRUCT 시리즈 처리**: DICOM RTSTRUCT SOP Class를 인식하고 DisplaySet으로 변환
- **참조 영상과 연동**: RTSTRUCT가 참조하는 원본 CT/MR 시리즈 위에 윤곽선 렌더링
- **Cornerstone 통합**: Cornerstone.js의 segmentation/contour 기능을 활용해 3D 시각화

### 연결되는 화면/기능
- **RT 전용 Viewport**: `dicom-rt` 타입 뷰포트 제공
- **Segmentation Panel**: OHIF의 segmentation 서비스와 통합하여 각 구조물의 색상, 가시성 제어
- **방사선 치료 워크플로우**: RT 계획 검토, 종양/장기 윤곽 확인

### 의존성
- `@ohif/extension-cornerstone`: Cornerstone viewport 재사용
- `@ohif/extension-default`: 기본 데이터 소스
- `dcmjs`: DICOM 파싱 및 RT Structure Set 처리

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 파일

| 파일명 | 역할 |
|--------|------|
| `src/index.tsx` | 확장 진입점 - ViewportModule, CommandsModule, SopClassHandlerModule 등록 |
| `src/getSopClassHandlerModule.ts` | RTSTRUCT SOP Class 처리 - DisplaySet 생성 및 로딩 로직 (237줄) |
| `src/loadRTStruct.js` | RTSTRUCT DICOM 파일 파싱 - ROI 윤곽선 데이터 추출 및 변환 (395줄) |
| `src/getCommandsModule.ts` | `hydrateRTSDisplaySet` 커맨드 제공 - RT DisplaySet을 viewport에 표시 |
| `src/viewports/OHIFCornerstoneRTViewport.tsx` | RTSTRUCT 전용 React viewport 컴포넌트 (266줄) |
| `src/utils/initRTToolGroup.ts` | RT용 tool group 초기화 - overlay viewport tools 설정 |
| `src/utils/promptHydrateRT.ts` | RT DisplaySet hydration 다이얼로그 표시 |
| `src/id.js` | 확장 ID 및 SOP Class Handler ID 정의 |

### 컴포넌트/데이터 흐름 다이어그램

```
[DICOM RTSTRUCT 파일]
        ↓
[getSopClassHandlerModule]
  - RTStructureSetStorage SOP Class 감지
  - _getDisplaySetsFromSeries() 호출
  - displaySet.load() 함수 정의
        ↓
[DisplaySet 생성]
  {
    Modality: 'RTSTRUCT',
    referencedDisplaySetInstanceUID: '...',
    structureSet: null,  // 아직 로드 안됨
    isLoaded: false,
    load: async () => { ... }
  }
        ↓
[OHIFCornerstoneRTViewport 렌더링]
  - 참조된 원본 DisplaySet 찾기
  - displaySet.load() 호출
        ↓
[loadRTStruct.js]
  - dcmjs로 DICOM 파싱
  - ROIContourSequence 추출
  - ContourData (좌표) 변환
  - 색상, 메타데이터 설정
  - structureSet 객체 반환:
    {
      ROIContours: [
        { ROIName, contourPoints, colorArray, ... }
      ]
    }
        ↓
[SegmentationService]
  - createSegmentationForRTDisplaySet() 호출
  - Cornerstone segmentation representation 생성
        ↓
[Cornerstone Viewport]
  - 참조 영상 렌더링
  - Segmentation contour overlay 렌더링
  - 사용자에게 윤곽선 표시
```

### 모듈 Export 구조

**index.tsx**에서 다음 모듈을 export:

1. **getViewportModule**: `dicom-rt` viewport 컴포넌트 제공
2. **getCommandsModule**: `hydrateRTSDisplaySet` 커맨드 제공
3. **getSopClassHandlerModule**: RTStructureSetStorage (SOP UID: `1.2.840.10008.5.1.4.1.1.481.3`) 처리

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

**OHIFCornerstoneRTViewport.tsx**에서 사용하는 상태:

```typescript
// 1. 로컬 state (useState)
const [rtIsLoading, setRtIsLoading] = useState(!rtDisplaySet.isLoaded);
const [processingProgress, setProcessingProgress] = useState({
  percentComplete: null,
  totalSegments: null,
});

// 2. Ref로 메타데이터 관리
const referencedDisplaySetRef = useRef(null);

// 3. OHIF 서비스 상태 (props를 통해 주입)
const { displaySetService, toolGroupService, segmentationService } = servicesManager.services;

// 4. Custom hook 사용
const [{ viewports, activeViewportId }, viewportGridService] = useViewportGrid();
const { setPositionPresentation } = usePositionPresentationStore();
```

### React Lifecycle 패턴

**useEffect 활용** (총 4개):

1. **RT Hydration 프롬프트** (79-100줄):
   - 의존성: `[rtIsLoading, viewportId, activeViewportId]`
   - 로딩 완료 후 사용자에게 RT 데이터 로드 확인 다이얼로그 표시
   - `promptHydrateRT()` → `hydrateSecondaryDisplaySet` 커맨드 실행

2. **Segmentation 로딩 완료 감지** (102-128줄):
   - `segmentationService.EVENTS.SEGMENTATION_LOADING_COMPLETE` 구독
   - 로딩 완료 시 `rtIsLoading` 상태 업데이트
   - 첫 번째 segment가 있는 slice로 viewport 이동

3. **진행 상황 모니터링** (130-158줄):
   - `SEGMENT_LOADING_COMPLETE` 이벤트로 진행률 업데이트
   - `DISPLAY_SETS_REMOVED` 이벤트로 삭제된 DisplaySet 처리

4. **Tool Group 초기화** (160-175줄):
   - 컴포넌트 마운트 시 RT 전용 tool group 생성
   - cleanup: tool group 삭제 및 segmentation representation 제거

### React.lazy를 통한 코드 스플리팅

```typescript
// index.tsx
const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './viewports/OHIFCornerstoneRTViewport');
});

const OHIFCornerstoneRTViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};
```

- Viewport 컴포넌트를 lazy loading하여 초기 번들 크기 감소
- `webpackPrefetch: true`로 백그라운드에서 미리 로드

### 재사용 컴포넌트 패턴

**OHIFCornerstoneViewport 재사용**:

```typescript
// 참조 영상을 렌더링하기 위해 cornerstone extension의 viewport 재사용
return (
  <OHIFCornerstoneViewport
    {...props}
    displaySets={[referencedDisplaySet, rtDisplaySet]}  // 원본 + RT
    viewportOptions={{
      viewportType: viewportOptions.viewportType,
      toolGroupId: toolGroupId,  // RT 전용 tool group
      ...
    }}
  />
);
```

---

## 4. OHIF 특유 개념 정리

### DisplaySet (디스플레이셋)

RTSTRUCT용 DisplaySet 구조 (`getSopClassHandlerModule.ts` 41-76줄):

```typescript
const displaySet = {
  Modality: 'RTSTRUCT',
  displaySetInstanceUID: utils.guid(),

  // RT 특유 속성
  referencedSeriesInstanceUID: string,      // 참조하는 원본 시리즈 UID
  referencedDisplaySetInstanceUID: string,  // 참조하는 DisplaySet UID
  structureSet: null | StructureSet,        // loadRTStruct() 결과

  // 상태 플래그
  isLoaded: boolean,
  isHydrated: boolean,
  loading: boolean,
  isDerivedDisplaySet: true,
  isOverlayDisplaySet: true,

  // 로딩 함수
  load: async ({ headers, createSegmentation }) => { ... }
};
```

### SOP Class Handler

**RTStructureSetStorage 처리** (`getSopClassHandlerModule.ts`):

- **SOP Class UID**: `1.2.840.10008.5.1.4.1.1.481.3` (RTStructureSetStorage)
- **역할**: DICOM 시리즈를 받아서 DisplaySet으로 변환
- **핵심 로직**:
  - `ReferencedSeriesSequence`에서 참조 시리즈 UID 추출
  - 참조된 DisplaySet이 없으면 `DISPLAY_SETS_ADDED` 이벤트 구독
  - `load()` 함수를 DisplaySet에 바인딩

### SegmentationService 통합

**RT → Segmentation 변환** (139-174줄):

```typescript
// loadRTStruct() 실행 후
await segmentationService.createSegmentationForRTDisplaySet(rtDisplaySet);

// 이벤트 발행
segmentationService.EVENTS.SEGMENTATION_LOADING_COMPLETE
segmentationService.EVENTS.SEGMENT_LOADING_COMPLETE
```

- RTSTRUCT의 ROI contour를 Cornerstone segmentation representation으로 변환
- `SegmentationRepresentations.Contour` 타입 사용

### CommandsManager

**hydrateRTSDisplaySet 커맨드** (`getCommandsModule.ts`):

```typescript
commandsManager.runCommand('hydrateRTSDisplaySet', {
  displaySet: rtDisplaySet,
  viewportId: viewportId
});
```

- **역할**: RT DisplaySet을 viewport에 "hydrate" (활성화)
- **동작**:
  1. 참조 DisplaySet 찾기
  2. `updateStoredSegmentationPresentation` 실행
  3. `updateStoredPositionPresentation` 실행
  4. 참조 DisplaySet을 viewport에 표시

### ExtensionManager 활용

**다른 확장 모듈 가져오기** (`loadRTStruct.js` 168-172줄):

```typescript
const utilityModule = extensionManager.getModuleEntry(
  '@ohif/extension-cornerstone.utilityModule.common'
);
const { dicomLoaderService } = utilityModule.exports;
```

- Cornerstone extension의 `dicomLoaderService` 사용
- DICOM 파일 바이너리 데이터 로드

### 관련 폴더

- `extensions/cornerstone/`: Cornerstone viewport 및 rendering 로직
- `extensions/default/`: 기본 data source (DICOMweb, local)
- `platform/core/src/services/SegmentationService/`: Segmentation 관리
- `platform/core/src/services/DisplaySetService/`: DisplaySet 관리

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

**1단계: 데이터 흐름 이해**
- `src/getSopClassHandlerModule.ts` 읽기
  - RTSTRUCT 파일이 어떻게 DisplaySet으로 변환되는지 파악
  - `_getDisplaySetsFromSeries()` 함수 분석

**2단계: DICOM 파싱 로직**
- `src/loadRTStruct.js` 읽기
  - `checkAndLoadContourData()`: BulkDataURI vs InlineBinary 처리
  - `_setROIContourMetadata()`: ROI 메타데이터 추출
  - ContourData를 3D 좌표 배열로 변환하는 방법 이해

**3단계: React 컴포넌트**
- `src/viewports/OHIFCornerstoneRTViewport.tsx` 읽기
  - `useEffect` 훅들이 어떤 이벤트를 구독하는지 확인
  - 로딩 상태 관리 (`rtIsLoading`, `processingProgress`)
  - 참조 DisplaySet과의 관계 이해

**4단계: 커맨드 시스템**
- `src/getCommandsModule.ts` 읽기
  - `hydrateRTSDisplaySet` 커맨드 동작 방식
  - Segmentation presentation 업데이트 로직

**5단계: 통합 테스트**
- 실제 RTSTRUCT 파일 로드해보기
- 브라우저 DevTools에서 다음 확인:
  - `displaySetService.getActiveDisplaySets()` 로 RT DisplaySet 구조 확인
  - `segmentationService.getSegmentations()` 로 생성된 segmentation 확인

### 이 폴더를 다 이해하면 할 수 있게 되는 것

**DICOM RT 데이터 처리 전문가**:
- DICOM RTSTRUCT 파일의 내부 구조 (ROIContourSequence, StructureSetROISequence, RTROIObservationsSequence) 이해
- Bulk Data URI vs Inline Binary 방식의 차이와 처리 방법
- Cornerstone segmentation과 DICOM RT의 통합 방식

**OHIF 확장 개발 패턴**:
- SOP Class Handler를 통한 커스텀 DICOM 타입 지원
- DisplaySet과 Viewport의 관계, hydration 개념
- 다른 확장 모듈(cornerstone)의 기능을 재사용하는 방법

**실전 응용**:
- DICOM RT Dose, RT Plan 등 다른 RT 타입 확장 개발
- 커스텀 segmentation visualization 구현
- RT 데이터 편집/내보내기 기능 추가

### 초보자 팁

1. **DICOM 표준 문서 참고**: DICOM Part 3 (Information Object Definitions) 중 RT Structure Set 섹션 읽어보기
2. **dcmjs 라이브러리**: DICOM 파싱에 사용되는 `dcmjs` 라이브러리 문서 확인
3. **디버깅**: `loadRTStruct.js`의 `console.log`로 ROIContourSequence 구조 출력해보기
4. **테스트 데이터**: 공개 RT Structure Set 샘플 파일로 테스트 (예: TCIA 데이터셋)
5. **Cornerstone Tools 문서**: Segmentation representation 타입과 rendering 옵션 학습
