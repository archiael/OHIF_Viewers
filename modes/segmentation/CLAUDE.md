# modes/segmentation - Segmentation Mode 분석

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면 및 기능](#1.2-연결되는-화면-및-기능)
   - 1.3. [Basic Mode와의 차이점](#1.3-basic-mode와의-차이점)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일별 역할](#2.2-주요-파일별-역할)
   - 2.3. [데이터 흐름 다이어그램 (텍스트)](#2.3-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extensions (확장 프로그램)](#4.1-extensions-확장-프로그램)
   - 4.2. [Modes (워크플로우)](#4.2-modes-워크플로우)
   - 4.3. [Services (서비스)](#4.3-services-서비스)
   - 4.4. [Hanging Protocol](#4.4-hanging-protocol)
   - 4.5. [SOP Class Handlers](#4.5-sop-class-handlers)
   - 4.6. [관련 폴더 링크](#4.6-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [추가 학습 자료](#5.3-추가-학습-자료)

---


## 1. 모듈 개요

### 1.1. 전체 OHIF 앱에서의 역할
**Segmentation Mode**는 의료 영상에서 **분할(Segmentation)** 작업을 수행하는 전문 워크플로우 모드입니다. 이 모드는 Labelmap(픽셀 기반)과 Contour(윤곽선 기반) 두 가지 타입의 세그멘테이션을 지원하며, AI 기반 도구(SAM, 자동 보간 등)를 포함한 다양한 세그멘테이션 도구를 제공합니다.

### 1.2. 연결되는 화면 및 기능
- **Segmentation Editor**: Labelmap/Contour 두 종류의 세그멘테이션 패널이 우측에 표시
- **MPR 뷰포트**: Axial, Sagittal, Coronal 뷰 지원 (Crosshair 동기화)
- **3D Volume Rendering**: 3D 뷰포트에서 세그멘테이션 결과 확인
- **AI 도구**: Marker-based SAM, Slice Propagation, Region Segment Plus 등

### 1.3. Basic Mode와의 차이점
- Basic Mode를 **확장**하여 세그멘테이션 전용 도구 추가
- 세그멘테이션 패널이 우측에 자동으로 표시
- 첫 번째 세그멘테이션 생성 시 자동으로 해당 타입의 패널로 탭 전환
- Labelmap/Contour 각각에 특화된 툴바와 유틸리티 제공

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
modes/segmentation/src/
├── index.tsx                         # 메인 모드 정의 (250줄)
├── id.js                             # 모드 ID 정의
├── constants.ts                      # Brush/Eraser 반경 상수
├── toolbarButtons.ts                 # 툴바 버튼 정의 (1199줄)
├── initToolGroups.ts                 # 도구 그룹 초기화 (268줄)
└── utils/
    └── setUpAutoTabSwitchHandler.ts  # 자동 패널 전환 로직 (57줄)
```

### 2.2. 주요 파일별 역할

#### `index.tsx` (메인 모드 정의)
- **역할**: Segmentation Mode의 진입점, 모드 라이프사이클 관리
- **핵심 기능**:
  - `onModeEnter`: 툴바 설정, 도구 초기화, 패널 구성
  - `onModeExit`: 리소스 정리 (서비스 destroy, 구독 해제)
  - `routes`: 레이아웃 템플릿 정의 (좌측 썸네일, 우측 세그멘테이션 패널)
  - `isValidMode`: SM, ECG, OT, DOC 모달리티만 있는 경우 모드 비활성화

#### `toolbarButtons.ts` (툴바 버튼 정의)
- **역할**: Segmentation Mode에서 사용 가능한 모든 버튼과 도구 정의
- **주요 도구 섹션**:
  - **기본 도구**: WindowLevel, Pan, Zoom, Crosshairs
  - **Labelmap 도구**: Brush, Eraser, Threshold, Shapes, RegionSegmentPlus
  - **Contour 도구**: Freehand, Livewire, Spline, Sculptor
  - **Labelmap 유틸리티**: InterpolateLabelmap, SegmentBidirectional
  - **Contour 유틸리티**: SimplifyContours, SmoothContours, LogicalContourOperations

#### `initToolGroups.ts` (도구 그룹 초기화)
- **역할**: 3가지 Tool Group을 초기화
  - `default`: 기본 스택 뷰포트용 (WindowLevel, Pan, Zoom, StackScroll 활성화)
  - `mpr`: MPR 뷰포트용 (Crosshairs 추가)
  - `volume3d`: 3D 렌더링용 (TrackballRotate, Zoom, Pan)
- **세그멘테이션 도구 등록**:
  - Brush 계열: CircularBrush, SphereBrush, Eraser
  - Threshold 계열: ThresholdCircularBrush, ThresholdSphereBrush (정적/동적)
  - Scissors 계열: CircleScissor, SphereScissor, RectangleScissor
  - Contour 계열: PlanarFreehand, Livewire, Spline (Catmull-Rom, Linear, B-Spline)
  - AI 도구: MarkerLabelmap, LabelmapSlicePropagation, RegionSegmentPlus

#### `constants.ts`
- **역할**: Brush/Eraser 도구의 최소/최대 반경 정의
- `MIN_SEGMENTATION_DRAWING_RADIUS = 0.5`
- `MAX_SEGMENTATION_DRAWING_RADIUS = 99.5`

#### `utils/setUpAutoTabSwitchHandler.ts`
- **역할**: 첫 번째 세그멘테이션 생성 시 자동으로 해당 타입의 패널로 전환
- **동작 방식**:
  1. `SEGMENTATION_MODIFIED` 이벤트 구독
  2. 첫 번째 세그멘테이션이 생성되면 활성 Representation 타입 확인
  3. Labelmap이면 `panelSegmentationWithToolsLabelMap` 활성화
  4. Contour이면 `panelSegmentationWithToolsContour` 활성화
  5. 모든 세그멘테이션이 삭제되면 다시 자동 전환 플래그 리셋

### 2.3. 데이터 흐름 다이어그램 (텍스트)

```
사용자 액션
    ↓
Toolbar Button 클릭 (toolbarButtons.ts)
    ↓
CommandsManager.run() → 커맨드 실행
    ↓
┌─────────────────────────────────────┐
│ Tool 활성화 (initToolGroups.ts)    │
│ - setToolActiveToolbar              │
│ - Tool Group에 바인딩               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ SegmentationService                 │
│ - 세그멘테이션 생성/수정             │
│ - EVENTS 발행                        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ setUpAutoTabSwitchHandler           │
│ - 이벤트 구독                        │
│ - 자동 패널 전환                     │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ PanelService                        │
│ - Labelmap/Contour 패널 활성화      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Cornerstone Viewport                │
│ - 세그멘테이션 렌더링                │
│ - Labelmap (픽셀 기반)               │
│ - Contour (벡터 기반)                │
└─────────────────────────────────────┘
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

#### 1. OHIF Services (전역 상태)
Segmentation Mode는 **React Context나 Redux를 사용하지 않고** OHIF의 **Service 아키텍처**를 사용합니다:

```typescript
// index.tsx - onModeEnter에서 서비스 가져오기
const {
  measurementService,
  toolbarService,
  toolGroupService,
  segmentationService,
  viewportGridService,
  panelService,
} = servicesManager.services;
```

**주요 서비스**:
- `segmentationService`: 세그멘테이션 데이터 관리 (생성, 수정, 삭제)
- `toolGroupService`: 도구 그룹 관리 (도구 활성화/비활성화)
- `toolbarService`: 툴바 버튼 등록 및 섹션 업데이트
- `panelService`: 패널 활성화/비활성화
- `viewportGridService`: 뷰포트 그리드 상태 관리

#### 2. PubSub 패턴 (이벤트 기반 통신)
서비스 간 통신은 **PubSub 패턴**을 사용:

```typescript
// setUpAutoTabSwitchHandler.ts
segmentationService.subscribe(eventName, callback);

// 이벤트 종류
- SEGMENTATION_MODIFIED
- SEGMENTATION_REPRESENTATION_MODIFIED
```

#### 3. 커맨드 패턴 (액션 실행)
버튼 클릭은 **CommandsManager**를 통해 실행:

```typescript
// toolbarButtons.ts - Brush 버튼 예시
commands: {
  commandName: 'activateSelectedSegmentationOfType',
  commandOptions: {
    segmentationRepresentationType: 'Labelmap',
  },
}
```

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

#### 1. 툴바 버튼 타입 (`uiType`)
OHIF는 다양한 **재사용 가능한 버튼 타입**을 제공:

- `ohif.toolButton`: 단순 도구 버튼 (WindowLevel, Pan, Zoom)
- `ohif.toolBoxButton`: 옵션이 있는 도구 버튼 (Brush, Eraser, Threshold)
- `ohif.toolBoxButtonGroup`: 도구 그룹 (BrushTools, ContourTools)
- `ohif.layoutSelector`: 레이아웃 선택기 (그리드 레이아웃)
- `ohif.advancedRenderingControls`: 고급 렌더링 컨트롤

#### 2. 옵션 타입 (`options`)
툴바 버튼은 다양한 옵션 타입을 지원:

```typescript
// Range 옵션 (슬라이더)
{
  name: 'Radius (mm)',
  type: 'range',
  min: 0.5,
  max: 99.5,
  step: 0.5,
  value: 25,
}

// Radio 옵션 (라디오 버튼)
{
  name: 'Shape',
  type: 'radio',
  values: [
    { value: 'CircularBrush', label: 'Circle' },
    { value: 'SphereBrush', label: 'Sphere' },
  ],
}

// Switch 옵션 (토글)
{
  name: 'Dynamic Cursor Size',
  type: 'switch',
  value: true,
}

// Button 옵션 (버튼)
{
  name: 'Clear Markers',
  type: 'button',
  commands: 'clearMarkersForMarkerLabelmap',
}
```

#### 3. Evaluate 패턴 (조건부 활성화)
버튼의 활성화 여부를 **동적으로 평가**:

```typescript
evaluate: [
  {
    name: 'evaluate.cornerstone.segmentation',
    toolNames: ['CircularBrush', 'SphereBrush'],
    disabledText: 'Create new segmentation to enable this tool.',
  },
  {
    name: 'evaluate.cornerstone.hasSegmentationOfType',
    segmentationRepresentationType: 'Labelmap',
  },
]
```

### 3.3. 커스텀 훅

이 모드는 **커스텀 훅을 직접 사용하지 않습니다**. 대신:
- `@ohif/ui` 패키지의 컴포넌트들이 내부적으로 훅 사용
- 서비스 기반 아키텍처로 상태 관리
- Cornerstone3D의 이벤트 시스템 활용

---

## 4. OHIF 특유 개념 정리

### 4.1. Extensions (확장 프로그램)
Segmentation Mode는 **Basic Mode를 확장**하며, 다음 확장 프로그램에 의존합니다:

```typescript
// index.tsx에서 가져오기
import {
  ohif,           // @ohif/extension-default
  cornerstone,    // @ohif/extension-cornerstone
  extensionDependencies,
  dicomRT,        // @ohif/extension-cornerstone-dicom-rt
  segmentation,   // @ohif/extension-cornerstone-dicom-seg
} from '@ohif/mode-basic';
```

**의존 확장 프로그램** (package.json):
- `@ohif/extension-cornerstone`: Cornerstone3D 렌더링 엔진
- `@ohif/extension-cornerstone-dicom-seg`: DICOM SEG 읽기/쓰기
- `@ohif/extension-cornerstone-dicom-rt`: DICOM RT STRUCT 지원
- `@ohif/extension-default`: 기본 데이터소스, 패널, 레이아웃

### 4.2. Modes (워크플로우)
**Mode**는 Extensions를 조합하여 특정 워크플로우를 정의:

```typescript
const mode = {
  id: '@ohif/mode-segmentation',
  routeName: 'segmentation',
  displayName: 'Segmentation',
  onModeEnter: () => { /* 초기화 */ },
  onModeExit: () => { /* 정리 */ },
  routes: [ /* 레이아웃 정의 */ ],
  extensions: extensionDependencies,
  hangingProtocol: ['@ohif/mnGrid'],
  sopClassHandlers: [
    ohif.sopClassHandler,
    segmentation.sopClassHandler,
    dicomRT.sopClassHandler
  ],
};
```

### 4.3. Services (서비스)
OHIF의 핵심 아키텍처인 **Service**는 싱글톤 패턴으로 전역 상태를 관리:

#### SegmentationService
- **역할**: 세그멘테이션 데이터 생성/수정/삭제
- **주요 메서드**:
  - `createSegmentation()`: 새 세그멘테이션 생성
  - `getSegmentations()`: 모든 세그멘테이션 조회
  - `getSegmentationRepresentations(viewportId)`: 뷰포트의 세그멘테이션 표현 조회
  - `subscribe(event, callback)`: 이벤트 구독

#### ToolGroupService
- **역할**: Cornerstone Tool Group 관리
- **주요 메서드**:
  - `createToolGroupAndAddTools(id, tools)`: 도구 그룹 생성
  - `destroy()`: 모든 도구 그룹 제거

#### PanelService
- **역할**: 우측/좌측 패널 관리
- **주요 메서드**:
  - `activatePanel(panelId, forceActive)`: 패널 활성화

### 4.4. Hanging Protocol
Segmentation Mode는 **mnGrid** hanging protocol 사용:
- `@ohif/mnGrid`: M x N 그리드 레이아웃 (사용자가 레이아웃 선택 가능)

### 4.5. SOP Class Handlers
DICOM 데이터 타입별 처리 로직:
- `ohif.sopClassHandler`: 일반 DICOM 이미지
- `segmentation.sopClassHandler`: DICOM SEG (Segmentation Object)
- `dicomRT.sopClassHandler`: DICOM RT STRUCT

### 4.6. 관련 폴더 링크
- `extensions/cornerstone/`: Cornerstone3D 렌더링 및 도구
- `extensions/cornerstone-dicom-seg/`: DICOM SEG 읽기/쓰기
- `extensions/cornerstone-dicom-rt/`: DICOM RT STRUCT
- `extensions/default/`: 기본 레이아웃, 패널, 데이터소스
- `modes/basic/`: Segmentation Mode의 베이스 모드
- `platform/core/src/services/`: OHIF 서비스 구현

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: 모드 구조 이해 (index.tsx)
**목표**: Segmentation Mode의 전체 구조와 라이프사이클 파악

```typescript
// 읽어야 할 부분
1. modeFactory 함수 구조
2. onModeEnter: 툴바 섹션 설정 (line 43-131)
3. onModeExit: 리소스 정리 (line 143-162)
4. routes: 레이아웃 정의 (line 198-230)
5. isValidMode: 모달리티 검증 (line 173-185)
```

**핵심 개념**:
- Mode는 Extensions를 조합한 워크플로우
- `onModeEnter`에서 서비스 초기화 및 툴바 구성
- `routes`에서 좌측(썸네일)/우측(세그멘테이션 패널) 레이아웃 정의

#### 2단계: 도구 초기화 (initToolGroups.ts)
**목표**: Tool Group 개념과 도구 등록 방식 이해

```typescript
// 읽어야 할 부분
1. createTools 함수: active/passive/disabled 도구 정의
2. initDefaultToolGroup: 기본 스택 뷰포트용
3. initMPRToolGroup: MPR 뷰포트용 (Crosshairs 추가)
4. initVolume3DToolGroup: 3D 렌더링용
```

**핵심 개념**:
- Tool Group: 뷰포트에 바인딩되는 도구 세트
- active: 기본 활성화 도구 (마우스 바인딩 포함)
- passive: 명령으로 활성화 가능한 도구
- disabled: 초기화만 하고 비활성화된 도구

#### 3단계: 툴바 버튼 (toolbarButtons.ts)
**목표**: 툴바 버튼 정의 방식과 커맨드 패턴 이해

```typescript
// 읽어야 할 부분
1. 기본 도구 버튼 (Zoom, Pan, WindowLevel): line 210-237
2. Brush 버튼 (옵션 포함): line 645-701
3. Threshold 버튼 (복잡한 옵션): line 949-1081
4. Contour 도구 (Freehand, Livewire): line 419-523
```

**핵심 개념**:
- `uiType`: 버튼 컴포넌트 타입
- `commands`: 실행할 커맨드 (CommandsManager 사용)
- `evaluate`: 버튼 활성화 조건
- `options`: 도구 설정 (range, radio, switch, button)

#### 4단계: 자동 패널 전환 (utils/setUpAutoTabSwitchHandler.ts)
**목표**: 이벤트 기반 통신 이해

```typescript
// 읽어야 할 부분
1. PubSub 패턴: segmentationService.subscribe()
2. 조건부 로직: shouldSwitchTab 플래그
3. 패널 활성화: panelService.activatePanel()
4. Unsubscribe 패턴: 메모리 누수 방지
```

**핵심 개념**:
- 서비스 간 통신은 PubSub 패턴 사용
- 구독 해제(unsubscribe)로 메모리 누수 방지
- 상태 플래그로 조건부 동작 제어

#### 5단계: 실습 프로젝트
**추천 실습 과제**:

1. **새로운 도구 버튼 추가**
   - `toolbarButtons.ts`에 새 버튼 추가
   - `initToolGroups.ts`에 도구 등록
   - `onModeEnter`에서 툴바 섹션에 추가

2. **커스텀 패널 자동 전환 로직**
   - 특정 조건에서 다른 패널로 전환하는 핸들러 작성
   - 이벤트 구독 및 해제 구현

3. **새로운 Tool Group 생성**
   - 커스텀 도구 세트로 새 Tool Group 정의
   - 특정 뷰포트에만 적용되도록 설정

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF Mode 개발**: 새로운 워크플로우 모드를 처음부터 만들 수 있습니다.
2. **세그멘테이션 도구 커스터마이징**: Brush, Eraser, Threshold 등 도구를 프로젝트에 맞게 수정할 수 있습니다.
3. **AI 세그멘테이션 통합**: SAM, Auto Propagation 같은 AI 모델을 OHIF에 통합할 수 있습니다.
4. **툴바/패널 커스터마이징**: 프로젝트 요구사항에 맞게 UI를 재구성할 수 있습니다.
5. **서비스 기반 아키텍처 이해**: OHIF의 핵심 디자인 패턴을 다른 프로젝트에 적용할 수 있습니다.
6. **DICOM SEG 워크플로우**: DICOM Segmentation Object 생성/편집/저장 전체 플로우를 이해합니다.

### 5.3. 추가 학습 자료

- **OHIF 공식 문서**: https://docs.ohif.org/
- **Cornerstone3D 문서**: https://www.cornerstonejs.org/
- **관련 코드**:
  - `extensions/cornerstone/src/Toolbar/`: 툴바 컴포넌트 구현
  - `platform/core/src/services/SegmentationService/`: 세그멘테이션 서비스 구현
  - `modes/basic/src/index.ts`: Basic Mode 구현 (Segmentation Mode의 베이스)
