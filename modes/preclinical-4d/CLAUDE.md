# modes/preclinical-4d

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [이 모드가 전체 OHIF 리액트 앱에서 맡는 책임](#1.1-이-모드가-전체-ohif-리액트-앱에서-맡는-책임)
   - 1.2. [어떤 화면/기능과 직접적으로 연결되는지](#1.2-어떤-화면기능과-직접적으로-연결되는지)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일별 역할](#2.2-주요-파일별-역할)
   - 2.3. [컴포넌트 간 관계 / 데이터 흐름](#2.3-컴포넌트-간-관계-데이터-흐름)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅이 있다면 역할과 사용처](#3.3-커스텀-훅이-있다면-역할과-사용처)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [이 폴더에서 사용되는 OHIF-specific 개념](#4.1-이-폴더에서-사용되는-ohif-specific-개념)
   - 4.2. [관련되는 다른 폴더 링크](#4.2-관련되는-다른-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [이 폴더를 공부할 때의 추천 순서](#5.1-이-폴더를-공부할-때의-추천-순서)
   - 5.2. ["이 폴더를 다 이해하면 할 수 있게 되는 것"](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)

---


## 1. 모듈 개요

### 1.1. 이 모드가 전체 OHIF 리액트 앱에서 맡는 책임

`preclinical-4d` 모드는 **4D PET/CT 전임상 연구(Preclinical Study)** 워크플로우를 위한 전문화된 뷰어 모드입니다. 동적 PET(Positron Emission Tomography) 볼륨 데이터를 시간 축을 따라 분석하고, CT와의 융합(fusion) 영상을 통해 ROI 정량화 및 동역학 분석(Kinetic Analysis)을 수행하는 것이 주요 목적입니다.

이 모드는 다음과 같은 특징을 가집니다:
- **4D 데이터 시각화**: 시간에 따라 변화하는 PET 볼륨을 자동 재생(cine playback)
- **다단계 워크플로우**: 데이터 준비 → 정합(Registration) → ROI 정량화 → 동역학 분석의 4단계 워크플로우
- **CT-PT 융합**: CT와 PT(PET) 볼륨을 오버레이하여 정합 상태 확인
- **세그멘테이션 기반 ROI 분석**: Labelmap 도구로 관심 영역을 정의하고 시간에 따른 uptake 변화를 차트로 시각화

### 1.2. 어떤 화면/기능과 직접적으로 연결되는지

**URL 경로**: `/viewer?StudyInstanceUIDs=...&mode=preclinical-4d`

**화면 구성**:
- **왼쪽 패널**: Dynamic Volume 컨트롤 패널 + 활성 뷰포트 Window Level 조정
- **중앙 뷰포트**: 워크플로우 단계에 따라 다르게 구성
  - **Data Preparation**: Axial, Sagittal, Coronal PT 볼륨 3분할
  - **Registration**: CT, PT, Fusion 볼륨 다중 뷰
  - **ROI Quantification**: Fusion 볼륨 + 세그멘테이션 도구
  - **Kinetic Analysis**: Fusion 볼륨 + 시계열 차트 뷰포트
- **오른쪽 패널**: ROI Quantification 단계에서만 세그멘테이션 패널 표시

**주요 사용 시나리오**:
1. 동물 실험 PET/CT 데이터 로딩 시 MRN이 'M1'인 경우 자동으로 이 모드 선택 가능
2. 시간에 따른 방사성 추적자(tracer) 흡수 패턴 분석
3. ROI 내부 SUV(Standardized Uptake Value) 측정
4. 시계열 데이터 그래프로 uptake curve 분석

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조

```
modes/preclinical-4d/src/
├── index.tsx                    # 모드 정의 및 진입점 (215줄)
├── id.js                        # 모드 ID 정의 ('@ohif/mode-preclinical-4d')
├── toolbarButtons.tsx           # 툴바 버튼 설정 (484줄)
├── initToolGroups.tsx           # Tool Group 초기화 (166줄)
├── initWorkflowSteps.ts         # 워크플로우 단계 초기화 (10줄)
└── getWorkflowSettings.ts       # 워크플로우 설정 정의 (127줄)
```

### 2.2. 주요 파일별 역할

| 파일명 | 역할 |
|--------|------|
| **index.tsx** | 모드의 메인 진입점. `modeFactory` 함수로 모드 객체 생성. `onModeEnter`에서 도구 초기화, 툴바 설정, 자동 cine 재생 시작. `isValidMode`로 MRN이 'M1'인 스터디만 허용. |
| **id.js** | `package.json`에서 모드 ID(`@ohif/mode-preclinical-4d`)를 가져와 내보냄. |
| **toolbarButtons.tsx** | 측정 도구, 브러시 도구, 세그멘테이션 도구, Window Level 메뉴 등 40여 개 버튼 정의. 각 버튼은 `commands`와 `evaluate` 속성으로 동작 정의. |
| **initToolGroups.tsx** | PT, CT, Fusion, default 4개의 Tool Group 생성. 각 그룹에 WindowLevel, Pan, Zoom, Brush 등의 도구 등록. Crosshairs 도구의 색상 설정(Axial=빨강, Sagittal=노랑, Coronal=초록). |
| **initWorkflowSteps.ts** | `getWorkflowSettings`에서 워크플로우 설정을 가져와 `workflowStepsService`에 등록하고 첫 번째 단계 활성화. |
| **getWorkflowSettings.ts** | 4단계 워크플로우 정의: (1) Data Preparation, (2) Registration, (3) ROI Quantification, (4) Kinetic Analysis. 각 단계마다 레이아웃, 툴바 버튼, hanging protocol, 안내 메시지 설정. |

### 2.3. 컴포넌트 간 관계 / 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                      index.tsx (모드 팩토리)                   │
│  - modeFactory 함수로 모드 설정 객체 반환                       │
│  - onModeEnter: 진입 시 초기화 로직 실행                        │
│  - onSetupRouteComplete: 라우트 설정 후 워크플로우 초기화        │
│  - routes: '/preclinical-4d' 경로와 레이아웃 템플릿 정의         │
└─────────────────────────────────────────────────────────────┘
               │                          │
               ▼                          ▼
  ┌────────────────────────┐    ┌────────────────────────┐
  │  initToolGroups.tsx    │    │ initWorkflowSteps.ts   │
  │  - 4개 Tool Group 생성  │    │ - 워크플로우 서비스에   │
  │  - 도구 등록 및 바인딩   │    │   단계 등록            │
  │  - Crosshairs 색상 설정 │    └────────────────────────┘
  └────────────────────────┘              │
               │                          ▼
               │              ┌────────────────────────────┐
               │              │  getWorkflowSettings.ts    │
               │              │  - 4단계 워크플로우 정의    │
               │              │  - 각 단계별 레이아웃,      │
               │              │    툴바, HP 설정           │
               │              └────────────────────────────┘
               │
               ▼
  ┌────────────────────────────────────────────────┐
  │          toolbarButtons.tsx                    │
  │  - 40+ 버튼 정의                                │
  │  - MeasurementTools, BrushTools,               │
  │    SegmentationTools, AdvancedRenderingControls│
  └────────────────────────────────────────────────┘

[사용자 인터랙션]
     │
     ▼
┌──────────────────────────────────────────────────┐
│   OHIF Services (ServicesManager)                │
│  - toolbarService: 툴바 버튼 상태 관리            │
│  - toolGroupService: 도구 그룹 관리               │
│  - workflowStepsService: 워크플로우 단계 전환     │
│  - cornerstoneViewportService: 뷰포트 렌더링     │
│  - cineService: 자동 재생 제어                    │
│  - customizationService: 세그멘테이션 커스터마이징 │
└──────────────────────────────────────────────────┘
```

**데이터 흐름 예시**:

1. **모드 진입 시**:
   - `index.tsx` `onModeEnter` 호출
   - `initToolGroups`로 PT/CT/Fusion/default Tool Group 생성
   - `toolbarService.register(toolbarButtons)` - 툴바 버튼 등록
   - `customizationService.setCustomizations` - 세그멘테이션 설정
   - `cornerstoneViewportService.subscribe(VIEWPORT_VOLUMES_CHANGED)` - 볼륨 로딩 완료 시 자동 cine 재생

2. **라우트 설정 완료 시**:
   - `onSetupRouteComplete` 호출
   - `initWorkflowSteps` → `getWorkflowSettings` → 4단계 워크플로우 등록
   - 첫 번째 단계(Data Preparation) 활성화

3. **워크플로우 단계 전환 시** (예: ROI Quantification 단계로 이동):
   - `workflowStepsService.setActiveWorkflowStep('roiQuantification')` 호출
   - 레이아웃 변경: 오른쪽 패널에 세그멘테이션 패널 표시
   - 툴바 버튼 업데이트: BrushTools, RectangleROIStartEndThreshold 추가
   - Hanging Protocol 변경: `default4D` 프로토콜의 `roiQuantification` 스테이지 적용

4. **사용자가 Brush 도구 선택 시**:
   - `toolbarService` → `setToolActiveToolbar` 커맨드 실행
   - `toolGroupService` → 현재 Tool Group에서 CircularBrush/SphereBrush 활성화
   - 사용자가 뷰포트에 그리면 세그멘테이션 레이블맵 생성

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

이 모드는 **OHIF Services 기반 상태 관리**를 사용합니다. 리액트 컴포넌트가 아닌 **설정 객체(Configuration Object)** 방식으로 구현되어 있습니다.

**주요 상태 관리 패턴**:

1. **ServicesManager를 통한 전역 상태**:
   ```typescript
   const {
     measurementService,
     toolbarService,
     cineService,
     cornerstoneViewportService,
     toolGroupService,
     customizationService,
     viewportGridService,
   } = servicesManager.services;
   ```
   - 각 서비스는 내부적으로 PubSub 패턴 사용
   - 상태 변경 시 구독자에게 이벤트 발행

2. **이벤트 기반 반응형 업데이트**:
   ```typescript
   const { unsubscribe } = cornerstoneViewportService.subscribe(
     cornerstoneViewportService.EVENTS.VIEWPORT_VOLUMES_CHANGED,
     () => {
       const viewportId = viewportGridService.getActiveViewportId();
       cineService.setIsCineEnabled(true);
       cineService.setCine({ id: viewportId, isPlaying: true, frameRate: 24 });
       unsubscribe(); // 1회만 실행 후 구독 해제
     }
   );
   ```

3. **워크플로우 상태**:
   - `workflowStepsService`가 현재 활성 단계 추적
   - 각 단계는 독립적인 레이아웃, 툴바, hanging protocol 설정 보유
   - 단계 전환 시 `onEnter` 콜백 실행 (예: Kinetic Analysis 단계에서 차트 업데이트)

4. **커스터마이제이션 상태**:
   ```typescript
   customizationService.setCustomizations({
     'panelSegmentation.tableMode': { $set: 'expanded' },
     'panelSegmentation.onSegmentationAdd': {
       $set: () => {
         commandsManager.run('createNewLabelMapForDynamicVolume');
       },
     },
   });
   ```
   - 런타임에 UI 동작 수정 가능

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드 자체는 UI 컴포넌트를 직접 정의하지 않고, **Extension에서 제공하는 컴포넌트를 조합**합니다:

**사용되는 Extension 컴포넌트**:

1. **Extension Default**:
   - `viewerLayout` - 기본 레이아웃 템플릿
   - `chartViewport` - 시계열 차트 뷰포트 (Kinetic Analysis 단계)
   - `seriesList` - 시리즈 목록 패널

2. **Extension Cornerstone**:
   - `cornerstone` viewport - 메인 이미지 뷰포트
   - `activeViewportWindowLevel` - Window/Level 조정 패널
   - `panelSegmentationNoHeader` - 세그멘테이션 패널

3. **Extension Cornerstone Dynamic Volume**:
   - `dynamic-volume` 패널 - 동적 볼륨 컨트롤 (재생 속도, 프레임 네비게이션)
   - `dynamic-segmentation` 패널 - 동적 볼륨용 세그멘테이션 패널

**패턴의 장점**:
- 모드는 "어떤 컴포넌트를 어디에 배치할지"만 정의
- 실제 UI 렌더링은 각 Extension이 담당
- 모드 간 Extension 재사용 가능 → 일관된 UX

### 3.3. 커스텀 훅이 있다면 역할과 사용처

이 모드는 커스텀 훅을 직접 정의하지 않지만, **Extension에서 제공하는 훅**을 활용합니다:

**간접적으로 사용되는 훅** (Extension 내부):
- `useViewportGrid()` - 뷰포트 그리드 상태 관리
- `useToolbar()` - 툴바 버튼 상태 관리
- `useCine()` - Cine 재생 상태 관리
- `useSegmentationTable()` - 세그멘테이션 테이블 상태

**리액트 초보자를 위한 팁**:
- 이 모드는 **선언적 설정(Declarative Configuration)** 방식
- `routes` 배열에서 `layoutTemplate` 함수가 실행되어 레이아웃 props 반환
- 이 props가 `@ohif/extension-default.layoutTemplateModule.viewerLayout` 컴포넌트로 전달됨
- 실제 렌더링은 Extension 내부에서 React hooks 사용

---

## 4. OHIF 특유 개념 정리

### 4.1. 이 폴더에서 사용되는 OHIF-specific 개념

#### 1. **Mode (모드)**

**정의**: 특정 워크플로우를 위해 Extensions를 조합한 사전 구성된 뷰어 경험

**이 모드의 구성**:
```typescript
{
  id: '@ohif/mode-preclinical-4d',
  routeName: 'dynamic-volume',
  displayName: 'Preclinical 4D',
  extensions: {
    '@ohif/extension-default': '3.7.0-beta.76',
    '@ohif/extension-cornerstone': '3.7.0-beta.76',
    '@ohif/extension-cornerstone-dynamic-volume': '3.7.0-beta.76',
    '@ohif/extension-cornerstone-dicom-seg': '3.7.0-beta.76',
    '@ohif/extension-tmtv': '3.7.0-beta.76',
  },
  hangingProtocol: 'default4D',
  sopClassHandlers: [...],
  routes: [...],
}
```

#### 2. **Workflow Steps (워크플로우 단계)**

**정의**: 복잡한 분석 작업을 단계별로 나눈 구조화된 프로세스

**이 모드의 4단계**:
1. **Data Preparation** - PT 볼륨 품질 확인, 프레임 네비게이션
2. **Registration** - CT-PT 정합 상태 확인
3. **ROI Quantification** - 세그멘테이션으로 관심 영역 정의
4. **Kinetic Analysis** - 시간에 따른 uptake 변화 차트 분석

**단계별 설정 항목**:
- `layout`: 패널 구성 (left/right 패널 열림/닫힘 상태)
- `toolbarButtons`: 해당 단계에서 사용 가능한 도구
- `hangingProtocol`: 뷰포트 배치 및 표시할 영상 정의
- `onEnter`: 단계 진입 시 실행할 커맨드 (예: 차트 업데이트)
- `info`: 사용자에게 표시할 안내 메시지

#### 3. **Hanging Protocol**

**정의**: 뷰포트의 개수, 배치, 표시할 영상 타입을 자동으로 결정하는 규칙

**이 모드의 Hanging Protocol**:
- 프로토콜 ID: `default4D`
- 스테이지: `dataPreparation`, `registration`, `roiQuantification`, `kineticAnalysis`
- 정의 위치: `@ohif/extension-cornerstone-dynamic-volume` Extension
- 역할:
  - Data Preparation 단계: 3개 뷰포트 (Axial, Sagittal, Coronal PT)
  - Registration 단계: 6개 이상 뷰포트 (CT, PT, Fusion 각각 다중 방향)
  - ROI Quantification: Fusion 뷰포트 중심
  - Kinetic Analysis: Fusion 뷰포트 + 차트 뷰포트

#### 4. **Tool Groups**

**정의**: 관련된 도구들의 집합. 각 Tool Group은 독립적인 마우스 바인딩과 설정 보유

**이 모드의 Tool Groups**:
```typescript
const toolGroupIds = {
  default: 'dynamic4D-default',
  PT: 'dynamic4D-pt',
  Fusion: 'dynamic4D-fusion',
  CT: 'dynamic4D-ct',
};
```

**각 그룹의 도구 구성**:
- **Active Tools**: WindowLevel(좌클릭), Pan(휠클릭), Zoom(우클릭), StackScroll(휠)
- **Passive Tools**: Length, Bidirectional, ArrowAnnotate, EllipticalROI 등 측정 도구
- **Brush Tools**: CircularBrush, SphereBrush, CircularEraser, SphereEraser, ThresholdBrush
- **Scissor Tools**: CircleScissor, SphereScissor, RectangleScissor
- **Disabled Tools**: Crosshairs (필요 시 활성화)

#### 5. **SOP Class Handlers**

**정의**: DICOM SOP Class에 따라 데이터를 어떻게 표시할지 결정하는 핸들러

**이 모드의 설정**:
```typescript
sopClassHandlers: [
  ohif.chartSopClassHandler,        // 차트 데이터 처리 (우선순위 높음)
  ohif.defaultSopClassHandler,      // 일반 영상 데이터 처리
]
```

#### 6. **Dynamic Volume**

**정의**: 시간 축을 포함하는 4D 볼륨 데이터 (3D 공간 + 시간)

**특징**:
- 동적 PET 이미징에서 여러 프레임을 하나의 볼륨으로 처리
- `cornerstoneViewportService.EVENTS.VIEWPORT_VOLUMES_CHANGED` 이벤트로 로딩 감지
- `cineService`로 자동 재생 (프레임레이트 24fps)
- 각 시간 프레임마다 세그멘테이션 적용 가능

#### 7. **Services**

**정의**: OHIF의 전역 상태 관리 및 비즈니스 로직을 담당하는 객체

**이 모드에서 사용하는 Services**:
- `measurementService` - 측정/주석 데이터 관리
- `toolbarService` - 툴바 버튼 등록 및 섹션 관리
- `cineService` - 자동 재생 제어
- `cornerstoneViewportService` - 뷰포트 렌더링 및 이벤트
- `toolGroupService` - Tool Group 생성/삭제
- `customizationService` - 런타임 UI 커스터마이징
- `viewportGridService` - 뷰포트 그리드 레이아웃
- `workflowStepsService` - 워크플로우 단계 관리
- `segmentationService` - 세그멘테이션 데이터 관리
- `syncGroupService` - 뷰포트 간 동기화

### 4.2. 관련되는 다른 폴더 링크

**Extensions** (확장 프로그램):
- `extensions/cornerstone-dynamic-volume/` - 동적 볼륨 렌더링 및 Hanging Protocol 정의
- `extensions/cornerstone/` - Cornerstone3D 기반 이미지 렌더링
- `extensions/cornerstone-dicom-seg/` - DICOM Segmentation 지원
- `extensions/default/` - 기본 데이터 소스, 패널, 뷰포트
- `extensions/tmtv/` - RectangleROIStartEndThreshold 도구 제공

**Platform Core**:
- `platform/core/src/services/` - 모든 Services 구현
  - `WorkflowStepsService.ts` - 워크플로우 관리
  - `CineService.ts` - 자동 재생 관리
  - `ToolbarService.ts` - 툴바 관리
  - `CustomizationService.ts` - 커스터마이징 관리
- `platform/core/src/extensions/` - Extension 시스템 구현
  - `ExtensionManager.js` - Extension 로딩 및 모듈 관리
  - `MODULE_TYPES.js` - 모듈 타입 정의

**다른 Modes**:
- `modes/longitudinal/` - 측정 추적 워크플로우 (비교 대상)
- `modes/tmtv/` - Total Metabolic Tumor Volume 워크플로우 (유사한 세그멘테이션 기능)

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 이 폴더를 공부할 때의 추천 순서

#### Step 1: 모드의 전체 구조 파악 (30분)

1. **`package.json` 읽기**:
   - 모드 이름과 버전 확인
   - `peerDependencies`에서 의존하는 Extensions 목록 확인
   - "4D Workflow"라는 설명으로 목적 이해

2. **`id.js` 읽기**:
   - 모드 ID가 어떻게 정의되는지 확인
   - 간단하지만 모든 모드에서 필수적인 파일

3. **`index.tsx` 읽기** (가장 중요):
   - `modeFactory` 함수의 반환 객체 구조 파악
   - `extensionDependencies`, `routes`, `hangingProtocol`, `sopClassHandlers` 확인
   - `onModeEnter`, `onSetupRouteComplete`, `onModeExit` 생명주기 이해

#### Step 2: 워크플로우 시스템 이해 (45분)

1. **`getWorkflowSettings.ts` 읽기**:
   - 4단계 워크플로우 정의 확인
   - 각 단계의 `layout`, `toolbarButtons`, `hangingProtocol`, `info` 속성 분석
   - `getDefaultButtons()`와 `getROIThresholdToolbox()` 함수로 버튼 그룹핑 방식 학습

2. **`initWorkflowSteps.ts` 읽기**:
   - 워크플로우 설정을 `workflowStepsService`에 등록하는 과정 확인
   - 첫 번째 단계를 활성화하는 로직 이해

3. **워크플로우 흐름 시뮬레이션**:
   - 브라우저 DevTools에서 실제 모드 실행 후 단계 전환 관찰
   - `workflowStepsService.setActiveWorkflowStep()` 호출 시 레이아웃 변화 확인

#### Step 3: 도구 시스템 이해 (1시간)

1. **`initToolGroups.tsx` 읽기**:
   - PT, CT, Fusion, default 4개 Tool Group 생성 로직 확인
   - `tools` 객체의 `active`, `passive`, `enabled`, `disabled` 분류 이해
   - Crosshairs 도구의 `getReferenceLineColor` 콜백으로 동적 색상 설정 방법 학습

2. **`toolbarButtons.tsx` 읽기**:
   - 각 버튼의 `uiType` 속성 확인 (예: `ohif.toolButton`, `ohif.toolBoxButton`)
   - `commands` 속성으로 버튼 클릭 시 실행할 커맨드 연결 방식 학습
   - `evaluate` 속성으로 버튼 활성화 조건 정의 방법 이해
   - `options` 속성으로 도구 설정 UI 구성 방법 학습 (예: Brush 크기 슬라이더)

3. **도구 바인딩 실습**:
   - 마우스 버튼 바인딩 이해: `mouseButton: Enums.MouseBindings.Primary` (좌클릭)
   - 터치 바인딩: `numTouchPoints: 2` (2손가락 터치)

#### Step 4: Extension 연결 및 확장성 이해 (45분)

1. **Extension 의존성 추적**:
   - `index.tsx`의 `extensionDependencies` 객체 확인
   - 각 Extension ID를 `extensions/` 폴더에서 찾아 역할 파악
   - 예: `@ohif/extension-cornerstone-dynamic-volume`의 `panelModule.dynamic-volume` 찾기

2. **모듈 참조 방식 이해**:
   - `ohif.layout`, `cornerstone.viewport`, `dynamicVolume.leftPanel` 등의 문자열 ID 패턴 학습
   - `${extensionId}.{moduleType}.${componentId}` 형식 이해

3. **Hanging Protocol 확장**:
   - `extensions/cornerstone-dynamic-volume/src/getHangingProtocolModule.ts` 파일 열어보기
   - `default4D` 프로토콜이 어떻게 정의되어 있는지 확인
   - 각 스테이지(`dataPreparation`, `registration` 등)의 뷰포트 배치 규칙 분석

#### Step 5: 실전 커스터마이징 연습 (1시간 30분)

1. **새로운 워크플로우 단계 추가하기**:
   - `getWorkflowSettings.ts`에 5번째 단계 추가 (예: "Report Generation")
   - 레이아웃과 툴바 버튼 설정
   - 브라우저에서 결과 확인

2. **툴바 버튼 추가하기**:
   - `toolbarButtons.tsx`에 새로운 버튼 추가
   - 간단한 커맨드 연결 (예: `console.log` 실행)
   - `toolbarService.updateSection()`으로 특정 섹션에 배치

3. **Tool Group 커스터마이징**:
   - `initToolGroups.tsx`에서 Crosshairs 색상 변경
   - 새로운 도구를 passive 목록에 추가

4. **모드 유효성 검사 수정**:
   - `isValidMode` 함수 수정하여 다른 조건으로 모드 활성화 (예: 특정 Modality)

### 5.2. "이 폴더를 다 이해하면 할 수 있게 되는 것"

**이 모드를 완전히 이해하면 다음을 할 수 있습니다**:

1. **워크플로우 기반 뷰어 설계**: 복잡한 의료 영상 분석 작업을 단계별로 나눠 사용자 경험 개선
2. **4D 데이터 처리**: 시간 축을 포함하는 동적 볼륨 데이터 시각화 및 분석 구현
3. **Extension 조합 능력**: 기존 Extension을 재사용하여 새로운 워크플로우 빠르게 구성
4. **도구 시스템 마스터**: Tool Group, 마우스 바인딩, 도구 옵션 UI 설정 완벽 이해
5. **Hanging Protocol 활용**: 워크플로우 단계에 따라 최적화된 뷰포트 레이아웃 자동 적용
6. **세그멘테이션 워크플로우**: ROI 정의, 정량화, 시계열 분석까지의 전체 파이프라인 구축
7. **모드 유효성 검사**: 특정 조건에서만 활성화되는 전문화된 모드 개발
8. **서비스 기반 상태 관리**: React 컴포넌트 없이도 복잡한 상태 관리 구현

**실무 응용 예시**:
- 심장 MRI 동적 스캔 분석 모드 개발
- 종양 추적 측정 워크플로우 구축
- 다중 모달리티 융합 영상 분석 도구 제작
- 방사선 치료 계획 워크플로우 구현

**다음 학습 단계**:
- `modes/tmtv/` - 더 복잡한 세그멘테이션 워크플로우 학습
- `extensions/cornerstone-dynamic-volume/` - 동적 볼륨 렌더링 구현 세부 사항
- `platform/core/src/services/WorkflowStepsService.ts` - 워크플로우 서비스 내부 구현
- Cornerstone3D 공식 문서 - 4D 렌더링 및 도구 커스터마이징 고급 기법
