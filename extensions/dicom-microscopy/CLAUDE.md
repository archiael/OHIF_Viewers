# extensions/dicom-microscopy

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [주요 책임](#1.1-주요-책임)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [진입점 및 모듈 설정](#2.1-진입점-및-모듈-설정)
   - 2.2. [핵심 컴포넌트](#2.2-핵심-컴포넌트)
   - 2.3. [서비스 및 관리자](#2.3-서비스-및-관리자)
   - 2.4. [DICOM 처리](#2.4-dicom-처리)
   - 2.5. [모듈 정의](#2.5-모듈-정의)
   - 2.6. [유틸리티](#2.6-유틸리티)
   - 2.7. [컴포넌트 관계 다이어그램](#2.7-컴포넌트-관계-다이어그램)
   - 2.8. [데이터 흐름](#2.8-데이터-흐름)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
   - 3.4. [이벤트 기반 아키텍처 (PubSub)](#3.4-이벤트-기반-아키텍처-pubsub)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension 시스템](#4.1-extension-시스템)
   - 4.2. [DisplaySet 개념](#4.2-displayset-개념)
   - 4.3. [Hanging Protocol 연동](#4.3-hanging-protocol-연동)
   - 4.4. [Data Source 연동](#4.4-data-source-연동)
   - 4.5. [관련 폴더 링크](#4.5-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [추가 팁](#5.3-추가-팁)

---


## 1. 모듈 개요

이 확장은 **DICOM 전체 슬라이드 현미경 이미지(Whole Slide Microscopy Images)** 를 뷰잉하고 주석(annotation)을 관리하는 기능을 제공합니다. 병리학(pathology) 이미지 검토 및 측정을 위한 전문화된 뷰포트입니다.

### 1.1. 주요 책임
- **현미경 이미지 렌더링**: 외부 라이브러리 `dicom-microscopy-viewer` (OpenLayers 기반)를 사용하여 고해상도 현미경 슬라이드를 표시
- **ROI 주석 관리**: 폴리곤, 원, 선, 점 등 다양한 도형으로 관심 영역(ROI) 그리기 및 관리
- **측정 기능**: 주석의 면적, 길이 등을 계산하여 측정 패널에 표시
- **DICOM SR 저장/로드**: 주석을 DICOM Structured Report(SR)로 저장하고 불러오기

### 1.2. 연결되는 화면/기능
- **Microscopy Mode** (`modes/microscopy/`): 현미경 전용 워크플로우에서 사용
- **Measurement Panel**: 사이드 패널에 주석 목록과 측정값 표시
- **Toolbar**: 주석 도구(그리기, 팬, 줌) 활성화 버튼 제공

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 진입점 및 모듈 설정
- **`src/index.tsx`**: 확장 진입점, 모든 모듈 내보내기 및 MicroscopyService 등록
- **`src/id.js`**: 확장 ID 정의 (`@ohif/extension-dicom-microscopy`)

### 2.2. 핵심 컴포넌트
- **`src/DicomMicroscopyViewport.tsx`**: 메인 뷰포트 컴포넌트, OpenLayers 뷰어 초기화 및 주석 로드 담당
- **`src/components/MicroscopyPanel/MicroscopyPanel.tsx`**: 측정 패널 컴포넌트, 주석 목록 표시 및 편집/삭제/저장 기능
- **`src/components/ViewportOverlay/`**: 뷰포트 오버레이 정보 표시 (환자 정보, 시리즈 정보 등)

### 2.3. 서비스 및 관리자
- **`src/services/MicroscopyService.ts`**: 확장의 핵심 서비스, 여러 뷰어와 주석을 중앙 관리
- **`src/tools/viewerManager.js`**: `ViewerManager` 클래스, 개별 third-party 뷰어 인스턴스를 래핑하여 이벤트 처리
- **`src/utils/RoiAnnotation.js`**: `RoiAnnotation` 클래스, 개별 주석 데이터 모델 (측정값, 레이블, 뷰 상태)

### 2.4. DICOM 처리
- **`src/DicomMicroscopySRSopClassHandler.js`**: DICOM SR (Structured Report) SOP Class 핸들러
- **`src/DicomMicroscopyANNSopClassHandler.js`**: DICOM ANN (Annotation) SOP Class 핸들러
- **`src/utils/constructSR.ts`**: 주석을 DICOM SR 데이터셋으로 변환
- **`src/utils/loadSR.ts`**: DICOM SR에서 주석 불러오기

### 2.5. 모듈 정의
- **`src/getCommandsModule.ts`**: 명령 모듈 (주석 삭제, 레이블 설정, 도구 활성화 등)
- **`src/getPanelModule.tsx`**: 패널 모듈 (측정 패널 등록)
- **`src/getCustomizationModule.ts`**: 커스터마이제이션 모듈

### 2.6. 유틸리티
- **`src/utils/dicomWebClient.ts`**: DICOMweb 클라이언트 생성
- **`src/utils/areaOfPolygon.js`**: 폴리곤 면적 계산
- **`src/utils/coordinateFormatScoord3d2Geometry.js`**: DICOM SCOORD3D 좌표를 OpenLayers 좌표로 변환
- **`src/helpers/`**: DICOM 데이터 포맷팅 유틸리티 (날짜, 시간, 환자명 등)

### 2.7. 컴포넌트 관계 다이어그램

```
ExtensionManager
    └─> index.tsx (Extension Entry)
            ├─> preRegistration
            │       └─> MicroscopyService 등록
            │
            ├─> getViewportModule
            │       └─> DicomMicroscopyViewport
            │               ├─> dicom-microscopy-viewer 초기화 (OpenLayers)
            │               ├─> ViewportOverlay
            │               └─> MicroscopyService와 상호작용
            │
            ├─> getPanelModule
            │       └─> MicroscopyPanel
            │               ├─> 주석 목록 표시 (DataRow 컴포넌트)
            │               ├─> 저장/삭제 핸들러
            │               └─> MicroscopyService 이벤트 구독
            │
            ├─> getCommandsModule
            │       └─> Commands (deleteMeasurement, setLabel, setToolActive 등)
            │
            └─> getSopClassHandlerModule
                    ├─> DicomMicroscopySRSopClassHandler (SR 로드)
                    └─> DicomMicroscopyANNSopClassHandler (ANN 로드)

MicroscopyService (핵심 서비스)
    ├─> ViewerManager[] (관리되는 뷰어 목록)
    │       └─> third-party viewer (dicom-microscopy-viewer)
    │               └─> OpenLayers Map
    │
    └─> RoiAnnotation[] (주석 목록)
            └─> ROI 데이터 (좌표, 레이블, 측정값, 뷰 상태)
```

### 2.8. 데이터 흐름

```
1. 이미지 로딩:
   DisplaySet (SM Modality)
        → DicomMicroscopyViewport
        → MicroscopyService.importDicomMicroscopyViewer()
        → OpenLayers 뷰어 생성 및 렌더링
        → MicroscopyService.addViewer()

2. 주석 생성:
   사용자가 도형 그리기 (Toolbar 버튼)
        → CommandsModule.setToolActive
        → MicroscopyService.activateInteractions
        → ViewerManager.activateInteractions
        → OpenLayers Draw Interaction
        → ROI_ADDED 이벤트
        → ViewerManager._onRoiAdded
        → MicroscopyService._onRoiAdded
        → RoiAnnotation 생성
        → MicroscopyPanel 업데이트 (ANNOTATION_UPDATED 이벤트)

3. 주석 저장:
   MicroscopyPanel "Save" 버튼
        → promptSave()
        → constructSR() (DICOM SR 생성)
        → dataSource.store.dicom()
        → DICOM SR 서버 저장 또는 파일 다운로드

4. 주석 로드:
   DisplaySet (SR SOP Class)
        → DicomMicroscopySRSopClassHandler
        → loadSR()
        → 주석 복원
        → ViewerManager.addRoiGraphicWithLabel()
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

#### 1. OHIF Services (전역 상태)
- **MicroscopyService**: 확장 전역에서 공유되는 상태 관리
  - 모든 뷰어 인스턴스 관리 (`managedViewers`)
  - 모든 주석 관리 (`annotations`)
  - 선택된 주석 (`selectedAnnotation`)
  - **PubSub 패턴**: 이벤트 기반으로 컴포넌트 간 통신
    ```typescript
    // 구독
    microscopyService.subscribe(EVENTS.ANNOTATION_UPDATED, callback);

    // 발행
    microscopyService.publish(EVENTS.ANNOTATION_UPDATED, data);
    ```

#### 2. 로컬 컴포넌트 상태 (useState)
- **DicomMicroscopyViewport**:
  ```typescript
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [managedViewer, setManagedViewer] = useState(null);
  ```
- **MicroscopyPanel**:
  ```typescript
  const [studyInstanceUID, setStudyInstanceUID] = useState(null);
  const [roiAnnotations, setRoiAnnotations] = useState([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  ```

#### 3. OHIF 훅 사용
- **`useSystem()`**: ServicesManager, ExtensionManager 접근
- **`useViewportGrid()`**: 활성 뷰포트 정보 가져오기
- **`useResizeDetector()`**: 뷰포트 리사이즈 감지 및 뷰어 업데이트

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

#### 1. Lazy Loading 패턴
```typescript
// index.tsx
const Component = React.lazy(() => import('./DicomMicroscopyViewport'));

const MicroscopyViewport = props => (
  <Suspense fallback={<div>Loading...</div>}>
    <Component {...props} />
  </Suspense>
);
```
**목적**: 큰 third-party 라이브러리를 필요할 때만 로드하여 초기 로딩 시간 단축

#### 2. HOC (Higher-Order Component) 패턴
```typescript
// MicroscopyPanel.tsx
const connectedMicroscopyPanel = withTranslation(['MicroscopyTable', 'Common'])(
  MicroscopyPanel
);
```
**목적**: i18n 다국어 지원 기능 주입

#### 3. Wrapper Component 패턴
```typescript
// index.tsx - ExtendedMicroscopyViewport
const ExtendedMicroscopyViewport = props => {
  const [viewportGrid, viewportGridService] = useViewportGrid();
  const { activeViewportId } = viewportGrid;

  // 리사이즈 핸들러 등 추가 기능 래핑
  return <MicroscopyViewport {...props} activeViewportId={activeViewportId} />;
};
```
**목적**: 뷰포트 그리드 상태와 리사이즈 감지 등 OHIF 특화 기능 추가

### 3.3. 커스텀 훅

이 확장은 자체 커스텀 훅을 정의하지 않고, OHIF 제공 훅을 활용합니다:
- `useSystem()`: ServicesManager, ExtensionManager 접근
- `useViewportGrid()`: 뷰포트 상태 관리
- `useResizeDetector()`: 뷰포트 크기 변화 감지

### 3.4. 이벤트 기반 아키텍처 (PubSub)

모든 상태 변화는 이벤트로 전파됩니다:

```typescript
// MicroscopyService 이벤트
EVENTS = {
  ANNOTATION_UPDATED,
  ANNOTATION_SELECTED,
  ANNOTATION_REMOVED,
  RELABEL,
  DELETE
}

// MicroscopyPanel에서 구독
useEffect(() => {
  const { unsubscribe } = microscopyService.subscribe(
    EVENTS.ANNOTATION_UPDATED,
    onAnnotationUpdated
  );
  return () => unsubscribe(); // cleanup
}, [studyInstanceUID]);
```

---

## 4. OHIF 특유 개념 정리

### 4.1. Extension 시스템

#### 1. Extension 모듈 구조
이 확장은 다음 모듈을 내보냅니다:

```typescript
// index.tsx
export default {
  id: '@ohif/extension-dicom-microscopy',

  preRegistration({ servicesManager }) {
    // 확장 전용 서비스 등록
    servicesManager.registerService(MicroscopyService.REGISTRATION(servicesManager));
  },

  getViewportModule,      // 뷰포트 컴포넌트 제공
  getPanelModule,         // 사이드 패널 제공
  getCommandsModule,      // 명령어 제공
  getToolbarModule,       // 툴바 평가 로직 제공
  getSopClassHandlerModule, // DICOM SOP Class 처리
  getCustomizationModule  // 커스터마이제이션 제공
}
```

#### 2. Module Types 설명

**ViewportModule**:
- 뷰포트 유형 등록: `microscopy-dicom`
- Hanging Protocol에서 참조하여 사용
- 예: `viewportType: 'microscopy-dicom'`

**PanelModule**:
- 사이드 패널 등록: `measure` (측정 패널)
- Mode 설정에서 활성화:
  ```javascript
  {
    name: 'measure',
    iconName: 'tab-linear',
    label: 'Measurements',
    component: MicroscopyPanel
  }
  ```

**CommandsModule**:
- 실행 가능한 명령어 정의:
  - `deleteMeasurement`: 주석 삭제
  - `setLabel`: 레이블 설정
  - `setToolActive`: 도구 활성화
  - `toggleOverlays`: 오버레이 토글
  - `toggleAnnotations`: 주석 표시/숨김
- 툴바 버튼과 연결:
  ```javascript
  // Toolbar 설정
  {
    id: 'Pan',
    type: 'ohif.radioGroup',
    props: {
      commands: [
        { commandName: 'setToolActive', commandOptions: { toolName: 'dragPan' } }
      ]
    }
  }
  ```

**SopClassHandlerModule**:
- DICOM SOP Class UID에 따라 DisplaySet 생성 로직 정의
- `DicomMicroscopySRSopClassHandler`: Comprehensive 3D SR (1.2.840.10008.5.1.4.1.1.88.34)
- `DicomMicroscopyANNSopClassHandler`: Microscopy Bulk Simple Annotations

#### 3. 서비스 등록 및 사용

**등록**:
```typescript
// preRegistration에서
servicesManager.registerService(MicroscopyService.REGISTRATION(servicesManager));
```

**사용**:
```typescript
// 컴포넌트에서
const { microscopyService } = servicesManager.services;

// 또는 useSystem 훅 사용
const { servicesManager } = useSystem();
const { microscopyService } = servicesManager.services;
```

### 4.2. DisplaySet 개념

**DisplaySet**: DICOM 시리즈의 논리적 표현
- `Modality: 'SM'`: Whole Slide Microscopy 이미지
- `Modality: 'SR'`: Structured Report (주석 데이터)
- `isOverlayDisplaySet: true`: SR DisplaySet은 오버레이로 표시됨
- `load()` 메서드: SR을 로드하여 주석 복원

### 4.3. Hanging Protocol 연동

Microscopy Mode는 Hanging Protocol에서 뷰포트 타입을 지정:
```javascript
// modes/microscopy/src/index.ts
{
  displaySetSelectors: {
    microscopyDisplaySet: { /* ... */ }
  },
  viewports: [
    {
      viewportType: 'microscopy-dicom', // 이 확장의 뷰포트 사용
      displaySets: [{ id: 'microscopyDisplaySet' }]
    }
  ]
}
```

### 4.4. Data Source 연동

**DICOM 메타데이터 로드**:
```typescript
// DicomMicroscopyViewport.tsx
const metadata = displaySet.others; // 시리즈의 모든 인스턴스 메타데이터
```

**주석 저장**:
```typescript
// MicroscopyPanel.tsx
const dataSource = extensionManager.getActiveDataSource()[0];

// DICOMweb 서버에 저장
await dataSource.store.dicom(dataset);

// 또는 로컬 파일 다운로드
downloadDicom(part10Buffer, { filename: 'sr-microscopy.dcm' });
```

### 4.5. 관련 폴더 링크

- **Services**: `platform/core/src/services/`
  - `ServicesManager`: 서비스 레지스트리
  - `DisplaySetService`: DisplaySet 관리
  - `ViewportGridService`: 뷰포트 그리드 상태
  - `UIDialogService`: 다이얼로그 표시
- **Extensions**: `extensions/`
  - `@ohif/extension-default`: 기본 데이터 소스, 공통 유틸리티
  - `@ohif/extension-cornerstone`: 3D 렌더링 확장 (비교 참고)
- **Modes**: `modes/microscopy/`
  - Microscopy 전용 워크플로우 설정
- **Platform Core**: `platform/core/src/`
  - `extensions/MODULE_TYPES`: 모듈 타입 정의
  - `DicomMetadataStore`: DICOM 메타데이터 저장소
  - `PubSubService`: 이벤트 기반 통신 기본 클래스

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: 확장 구조 이해 (진입점)
**파일**: `src/index.tsx`

**학습 내용**:
- 확장의 전체 구조와 내보내는 모듈들 파악
- `preRegistration`에서 MicroscopyService 등록 확인
- 각 모듈이 무엇을 제공하는지 개념 파악

**실습**:
- 각 모듈의 반환값이 어떤 형태인지 콘솔로 출력해보기
- 다른 확장(`@ohif/extension-cornerstone`)과 구조 비교

---

#### 2단계: 핵심 서비스 이해 (MicroscopyService)
**파일**: `src/services/MicroscopyService.ts`

**학습 내용**:
- PubSubService 상속 및 이벤트 구독/발행 패턴
- 뷰어 관리 (`managedViewers`) 및 주석 관리 (`annotations`)
- ROI 추가/수정/삭제 시 이벤트 흐름

**핵심 메서드**:
- `addViewer()`: 뷰어 등록 및 주석 복원
- `_onRoiAdded()`: ROI 추가 이벤트 핸들러
- `synchronizeViewers()`: 여러 뷰어 동기화
- `activateInteractions()`: 도구 활성화

**실습**:
- 이벤트 구독/발행 코드를 작성하여 로그 출력
- 주석이 추가될 때 어떤 메서드들이 호출되는지 추적

---

#### 3단계: 뷰포트 컴포넌트 (DicomMicroscopyViewport)
**파일**: `src/DicomMicroscopyViewport.tsx`

**학습 내용**:
- `dicom-microscopy-viewer` 라이브러리 초기화 과정
- DICOM 메타데이터를 OpenLayers 형식으로 변환
- 뷰포트 렌더링 및 리사이즈 처리

**핵심 로직**:
- `installOpenLayersRenderer()`: 뷰어 생성 및 초기화
- `useEffect()`: DisplaySet 변경 시 뷰어 재생성
- `useResizeDetector()`: 뷰포트 크기 변화 감지

**실습**:
- 뷰어 초기화 시점에 콘솔 로그 추가하여 흐름 확인
- 메타데이터 변환 과정 이해 (naturalized → denaturalized)

---

#### 4단계: 주석 데이터 모델 (RoiAnnotation, ViewerManager)
**파일**:
- `src/utils/RoiAnnotation.js`
- `src/tools/viewerManager.js`

**학습 내용**:
- RoiAnnotation: 개별 주석의 데이터 모델 (좌표, 레이블, 측정값)
- ViewerManager: third-party 뷰어 래퍼, 이벤트를 OHIF 형식으로 변환

**핵심 개념**:
- RoiAnnotation은 PubSubService를 상속하여 자체 이벤트 발행
- ViewerManager는 OpenLayers 이벤트를 중간에서 변환
- 측정값 자동 계산 (`setMeasurements()`)

**실습**:
- 폴리곤 면적 계산 로직 (`areaOfPolygon.js`) 이해
- ROI 그리기 시 어떤 이벤트가 발생하는지 추적

---

#### 5단계: UI 컴포넌트 (MicroscopyPanel)
**파일**: `src/components/MicroscopyPanel/MicroscopyPanel.tsx`

**학습 내용**:
- MicroscopyService 이벤트 구독 및 상태 업데이트
- 주석 목록 표시 및 인터랙션 (선택, 편집, 삭제)
- DICOM SR 저장 로직

**핵심 기능**:
- `useEffect()`를 통한 이벤트 구독 및 cleanup
- `promptSave()`: 주석을 DICOM SR로 저장
- `onMeasurementItemClickHandler()`: 주석 선택 및 포커스

**실습**:
- 주석 선택 시 뷰어에서 해당 ROI로 이동하는 흐름 추적
- 저장 버튼 클릭 시 DICOM SR 생성 과정 확인

---

#### 6단계: DICOM 처리 (SopClassHandler, SR)
**파일**:
- `src/DicomMicroscopySRSopClassHandler.js`
- `src/utils/constructSR.ts`
- `src/utils/loadSR.ts`

**학습 내용**:
- DICOM SR SOP Class 처리 방식
- 주석을 DICOM SR 형식으로 변환
- SR에서 주석 복원

**핵심 개념**:
- SopClassHandler는 특정 SOP Class UID에 대한 DisplaySet 생성 로직
- `constructSR()`: RoiAnnotation[] → DICOM SR dataset
- `loadSR()`: DICOM SR → RoiAnnotation[] 복원

**실습**:
- DICOM SR 데이터 구조 이해 (ContentSequence, SCOORD3D 등)
- 주석 저장 후 다시 로드하여 복원 확인

---

#### 7단계: 명령 모듈 및 툴바 연동
**파일**:
- `src/getCommandsModule.ts`
- `src/index.tsx` (getToolbarModule)

**학습 내용**:
- CommandsModule 정의 및 툴바 버튼과 연결
- 도구 활성화 (`setToolActive`) 로직
- 툴바 버튼 평가 로직 (`evaluate.microscopyTool`)

**핵심 개념**:
- 명령은 `commandsManager.runCommand()`로 실행
- 툴바 버튼은 `evaluate` 함수로 활성 상태 표시
- 각 도구는 OpenLayers interaction으로 변환

**실습**:
- 툴바 버튼 클릭 시 어떤 명령이 실행되는지 추적
- 새로운 도구 버튼 추가해보기

---

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

**핵심 역량**:
1. **Third-party 라이브러리 통합**: OpenLayers 기반 뷰어를 OHIF 생태계에 통합하는 방법을 이해할 수 있습니다.
2. **이벤트 기반 아키텍처**: PubSubService를 활용한 느슨하게 결합된 컴포넌트 설계 패턴을 습득할 수 있습니다.
3. **DICOM 데이터 처리**: DICOM Structured Report(SR)의 구조를 이해하고, 주석 데이터를 DICOM 표준 형식으로 저장/로드할 수 있습니다.
4. **커스텀 확장 개발**: OHIF의 모듈 시스템(Viewport, Panel, Commands, SopClassHandler)을 활용하여 새로운 모달리티 지원 확장을 만들 수 있습니다.

**응용 가능한 기능**:
- 다른 전문 의료 이미징 라이브러리를 OHIF에 통합
- 주석/측정 데이터를 DICOM SR 외 다른 형식(JSON, FHIR 등)으로 저장
- 협업 기능 추가 (다중 사용자 주석 동기화)
- AI 모델 결과를 ROI로 시각화

---

### 5.3. 추가 팁

**디버깅 포인트**:
- `MicroscopyService` 이벤트를 콘솔에 로깅하여 흐름 파악
- `ViewerManager`의 `publish()` 메서드에 breakpoint 설정
- DICOM 메타데이터 변환 과정에서 `denaturalizeDataset()` 결과 확인

**참고 자료**:
- [dicom-microscopy-viewer 문서](https://github.com/ImagingDataCommons/dicom-microscopy-viewer)
- [DICOM SR 표준](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_A.35.html)
- [OpenLayers 문서](https://openlayers.org/)

**확장할 만한 기능**:
- 주석에 색상 추가
- 주석 필터링 (레이블별, 타입별)
- 주석 통계 (총 면적, 평균 등)
- 주석 히스토리 (되돌리기/다시하기)
