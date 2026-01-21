# modes/basic/src 분석

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 목록](#21-파일-목록)
   - 2.2. [컴포넌트 간 관계 및 데이터 흐름](#22-컴포넌트-간-관계-및-데이터-흐름)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#31-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#32-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#33-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Mode (모드)](#41-mode-모드)
   - 4.2. [Extension (확장)](#42-extension-확장)
   - 4.3. [SOP Class Handler](#43-sop-class-handler)
   - 4.4. [Hanging Protocol](#44-hanging-protocol)
   - 4.5. [Tool Group](#45-tool-group)
   - 4.6. [관련 폴더 링크](#46-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#51-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#52-이-폴더를-다-이해하면-할-수-있게-되는-것)

## 1. 모듈 개요

`modes/basic`는 **OHIF Viewer의 기본 뷰어 모드**로, 다른 모든 커스텀 모드의 **기반(foundation)**이 되는 범용 의료 영상 뷰어 모드입니다.

### 전체 OHIF 앱에서의 역할
- **기본 워크플로우 제공**: CT, MR, US, X-ray 등 다양한 모달리티를 범용적으로 볼 수 있는 기본 뷰어 설정
- **모드 팩토리 패턴**: `modeFactory` 함수를 통해 설정을 커스터마이징하여 새로운 모드를 쉽게 만들 수 있는 템플릿 역할
- **확장 프로그램 통합**: DICOM SR, SEG, RT, PDF, Video 등 모든 확장 프로그램을 한 곳에서 사용할 수 있도록 통합

### 연결되는 화면/기능
- **Study Viewer**: 환자 스터디를 열었을 때 보이는 메인 뷰어 화면
- **Toolbar**: 측정 도구, Window/Level, Zoom, Pan 등 모든 기본 도구 제공
- **Side Panels**:
  - 왼쪽: 시리즈 썸네일 목록
  - 오른쪽: Measurement 패널, Segmentation 패널 (기본적으로 닫힌 상태)

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1 파일 목록

| 파일명 | 역할 | 코드 라인 수 |
|--------|------|--------------|
| `index.tsx` | 모드 정의 및 라이프사이클 관리 (메인 진입점) | 388줄 |
| `toolbarButtons.ts` | 툴바 버튼 설정 (709개 버튼 정의) | 709줄 |
| `initToolGroups.ts` | Cornerstone3D 툴 그룹 초기화 (5개 툴 그룹) | 578줄 |
| `id.js` | 모드 ID 정의 (`@ohif/mode-basic`) | 6줄 |

### 2.2 컴포넌트 간 관계 및 데이터 흐름

```
┌────────────────────────────────────────────────────────────┐
│                      index.tsx                             │
│  (모드 정의 및 설정)                                        │
│  - modeInstance: 모드 객체                                 │
│  - onModeEnter: 모드 진입 시 초기화                        │
│  - onModeExit: 모드 종료 시 정리                           │
└─────────────────┬────────────────┬─────────────────────────┘
                  │                │
                  ▼                ▼
    ┌─────────────────┐  ┌──────────────────────┐
    │ toolbarButtons.ts│  │ initToolGroups.ts   │
    │  (툴바 UI 정의)  │  │ (Cornerstone 도구   │
    │  - 709개 버튼    │  │  초기화)             │
    │  - 섹션 구성     │  │  - default ToolGroup │
    └────────┬─────────┘  │  - mpr ToolGroup     │
             │            │  - SRToolGroup       │
             │            │  - volume3d ToolGroup│
             │            │  - mammography TG    │
             │            └──────────┬───────────┘
             │                       │
             ▼                       ▼
    ┌────────────────────────────────────────┐
    │        ServicesManager                 │
    │  - toolbarService                      │
    │  - toolGroupService                    │
    │  - measurementService                  │
    │  - segmentationService                 │
    │  - cornerstoneViewportService          │
    └────────────────────────────────────────┘
```

**데이터 흐름 (모드 진입 시)**:
1. User가 Study를 열면 → `onModeEnter()` 호출
2. `initToolGroups()` 실행 → Cornerstone3D 툴 그룹 5개 생성
3. `toolbarService.register(toolbarButtons)` → 툴바 버튼 등록
4. `toolbarService.updateSection()` → 툴바 섹션 업데이트
5. 뷰포트 렌더링 시작 → Hanging Protocol에 따라 레이아웃 배치

**데이터 흐름 (사용자 상호작용)**:
```
User 클릭 (예: "Length" 도구)
  ↓
Toolbar Button onClick
  ↓
commandsManager.runCommand('setToolActiveToolbar')
  ↓
toolGroupService.setToolActive('Length')
  ↓
Cornerstone3D ToolGroup 상태 변경
  ↓
Viewport에 Length 도구 활성화
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1 상태 관리 방식

이 모드는 **Service 중심 아키텍처**를 사용하며, 리액트 상태보다 **OHIF Services**가 주요 상태 저장소 역할을 합니다.

#### (1) Services를 통한 전역 상태 관리
```typescript
// index.tsx - onModeEnter에서 서비스 추출
const {
  measurementService,      // 측정 데이터 저장소
  toolbarService,          // 툴바 상태 관리
  toolGroupService,        // Cornerstone 툴 그룹 관리
  segmentationService,     // 세그멘테이션 데이터
  customizationService     // UI 커스터마이징
} = servicesManager.services;
```

**서비스 사용 예시**:
- `measurementService.clearMeasurements()`: 이전 모드의 측정값 모두 삭제
- `toolbarService.register(toolbarButtons)`: 툴바 버튼 정의 등록
- `segmentationService.EVENTS.SEGMENTATION_ADDED`: PubSub 패턴으로 이벤트 구독

#### (2) PubSub 패턴 (이벤트 기반 상태 동기화)
```typescript
// 측정값 추가 시 자동으로 측정 패널 활성화
panelService.addActivatePanelTriggers(
  cornerstone.measurements,  // 활성화할 패널 ID
  [{
    sourcePubSubService: measurementService,
    sourceEvents: [
      measurementService.EVENTS.MEASUREMENT_ADDED,
      measurementService.EVENTS.RAW_MEASUREMENT_ADDED
    ]
  }]
);
```

이 패턴의 장점:
- 컴포넌트 간 직접 의존성 없이 느슨한 결합(loose coupling)
- 서비스에서 이벤트 발행 → 여러 컴포넌트가 구독하여 반응
- 리액트 `useState`, `useContext` 대신 서비스 레이어가 상태 관리

### 3.2 재사용 가능한 UI 컴포넌트 패턴

**툴바 버튼 uiType 패턴**:
```typescript
// toolbarButtons.ts
{
  id: 'Length',
  uiType: 'ohif.toolButton',  // UI 컴포넌트 타입 (확장에서 제공)
  props: {
    icon: 'tool-length',       // 아이콘
    label: 'Length',           // 버튼 라벨
    commands: setToolActiveToolbar,  // 클릭 시 실행할 명령
    evaluate: 'evaluate.cornerstoneTool'  // 버튼 활성화 조건
  }
}
```

**uiType 종류**:
- `ohif.toolButton`: 일반 도구 버튼
- `ohif.toolButtonList`: 여러 버튼을 그룹화
- `ohif.layoutSelector`: 레이아웃 선택 UI
- `ohif.windowLevelMenu`: Window/Level 메뉴
- `ohif.orientationMenu`: Orientation 변경 메뉴

**evaluate 함수로 동적 UI 상태 제어**:
```typescript
{
  id: 'Crosshairs',
  evaluate: {
    name: 'evaluate.cornerstoneTool',
    disabledText: 'Select an MPR viewport to enable this tool'
  }
}
// → MPR 뷰포트가 없으면 버튼 비활성화 + 툴팁 표시
```

### 3.3 커스텀 훅

이 폴더에는 **커스텀 훅이 직접 정의되어 있지 않습니다**.

대신 **Extension에서 제공하는 훅**을 사용:
- `@ohif/extension-cornerstone`의 `useViewportGrid`
- `@ohif/ui`의 `useModal`, `useDialog`

**왜 훅이 없을까?**
- 이 폴더는 **순수 설정(configuration)** 중심
- 실제 UI 렌더링은 `@ohif/extension-default`의 레이아웃 템플릿이 담당
- 리액트 컴포넌트는 `platform/ui`와 확장 프로그램에서 제공

---

## 4. OHIF 특유 개념 정리

### 4.1 Mode (모드)
- **정의**: 확장 프로그램들을 조합하여 특정 워크플로우를 제공하는 "뷰어 설정 패키지"
- **구성 요소**:
  - `routes`: URL 라우팅 (`/viewer?StudyInstanceUIDs=...&mode=basic`)
  - `extensions`: 사용할 확장 프로그램 목록
  - `sopClassHandlers`: DICOM SOP Class 처리 우선순위
  - `hangingProtocol`: 기본 레이아웃 프로토콜
  - `toolbarButtons`: 툴바 버튼 정의
  - `onModeEnter/onModeExit`: 라이프사이클 훅

### 4.2 Extension (확장)
이 모드가 사용하는 확장 프로그램:

```typescript
// index.tsx - extensionDependencies
{
  '@ohif/extension-default': '^3.0.0',           // 기본 UI + 데이터소스
  '@ohif/extension-cornerstone': '^3.0.0',       // Cornerstone3D 렌더링
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',   // Structured Report
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',  // Segmentation
  '@ohif/extension-cornerstone-dicom-pmap': '^3.0.0', // Parametric Map
  '@ohif/extension-cornerstone-dicom-rt': '^3.0.0',   // RT STRUCT
  '@ohif/extension-dicom-pdf': '^3.0.1',         // PDF 뷰어
  '@ohif/extension-dicom-video': '^3.0.1'        // 비디오 뷰어
}
```

### 4.3 SOP Class Handler
- **역할**: DICOM 파일의 SOP Class UID에 따라 어떤 뷰포트로 렌더링할지 결정
- **우선순위**: 배열 순서대로 체크 (위에서 아래로)

```typescript
// index.tsx - sopClassHandlers
export const sopClassHandlers = [
  dicomvideo.sopClassHandler,    // 1. 비디오 먼저 확인
  dicomSeg.sopClassHandler,      // 2. Segmentation
  dicomPmap.sopClassHandler,     // 3. Parametric Map
  ohif.sopClassHandler,          // 4. 기본 Stack 이미지
  ohif.wsiSopClassHandler,       // 5. Whole Slide Imaging
  dicompdf.sopClassHandler,      // 6. PDF
  dicomsr.sopClassHandler3D,     // 7. SR 3D
  dicomsr.sopClassHandler,       // 8. SR 2D
  dicomRT.sopClassHandler        // 9. RT STRUCT
];
```

### 4.4 Hanging Protocol
- **정의**: 뷰포트 레이아웃 및 시리즈 자동 배치 규칙
- 이 모드는 `@ohif/extension-default.hangingProtocolModule.default` 사용
- **예시**: "CT Chest가 있으면 2x2 그리드에 Axial/Sagittal/Coronal/3D 배치"

### 4.5 Tool Group
Cornerstone3D의 도구 모음:

| Tool Group ID | 용도 | 활성 도구 |
|---------------|------|-----------|
| `default` | 기본 Stack viewport | WindowLevel, Pan, Zoom, StackScroll |
| `mpr` | MPR (Multi-Planar Reconstruction) | Crosshairs 지원 |
| `SRToolGroup` | Structured Report 전용 | SR 측정 도구들 |
| `volume3d` | 3D Volume Rendering | TrackballRotate |
| `mammography` | 유방촬영 전용 | 기본 도구 + Calibration |

### 4.6 관련 폴더 링크

```
modes/basic/src/
├── index.tsx              → 모드 정의
├── toolbarButtons.ts      → 툴바 버튼 설정
└── initToolGroups.ts      → 툴 그룹 초기화
    ↓ (사용하는 확장)
extensions/
├── default/               → 기본 UI, 데이터소스, Hanging Protocol
├── cornerstone/           → Cornerstone3D 렌더링 엔진
├── cornerstone-dicom-sr/  → DICOM SR 지원
├── cornerstone-dicom-seg/ → DICOM Segmentation
├── cornerstone-dicom-rt/  → DICOM RT STRUCT
├── dicom-pdf/             → PDF 렌더링
└── dicom-video/           → 비디오 재생
    ↓ (사용하는 서비스)
platform/core/src/services/
├── MeasurementService     → 측정값 저장
├── ToolbarService         → 툴바 상태 관리
├── ToolGroupService       → Cornerstone 툴 그룹
├── HangingProtocolService → 레이아웃 결정
└── PanelService           → 사이드 패널 제어
```

---

## 5. 초보 개발자용 학습 가이드

### 5.1 추천 학습 순서

#### Step 1: 모드 구조 이해 (index.tsx)
**목표**: 모드가 무엇인지, 어떻게 구성되는지 파악

1. `modeInstance` 객체 살펴보기
   - `id`, `displayName`: 모드 식별자
   - `routes`: URL 라우팅
   - `extensions`: 의존하는 확장 프로그램
   - `sopClassHandlers`: DICOM 파일 처리 순서

2. `onModeEnter()` 함수 분석
   ```typescript
   // 모드 진입 시 실행되는 초기화 로직
   - measurementService.clearMeasurements()  // 이전 데이터 정리
   - initToolGroups()                        // Cornerstone 도구 초기화
   - toolbarService.register()               // 툴바 등록
   ```

3. `modeFactory()` 패턴 이해
   ```typescript
   // 다른 모드를 만들 때 이 모드를 베이스로 사용
   const myMode = modeFactory({
     modeConfiguration: {
       toolbarButtons: { $set: myCustomButtons }
     }
   });
   ```

#### Step 2: 툴바 시스템 (toolbarButtons.ts)
**목표**: OHIF의 동적 툴바 구성 방식 이해

1. 버튼 정의 구조 파악
   ```typescript
   {
     id: 'Length',
     uiType: 'ohif.toolButton',  // UI 컴포넌트 타입
     props: {
       icon: 'tool-length',
       commands: setToolActiveToolbar,  // 명령 실행
       evaluate: 'evaluate.cornerstoneTool'  // 활성화 조건
     }
   }
   ```

2. 섹션 기반 구성 이해
   ```typescript
   toolbarSections = {
     primary: ['MeasurementTools', 'Zoom', 'Pan', ...],
     MeasurementTools: ['Length', 'Bidirectional', ...]
   }
   ```

3. `evaluate` 함수로 동적 UI 제어 학습
   - `evaluate.action`: 항상 활성화
   - `evaluate.cornerstoneTool`: Cornerstone 도구 상태에 따라
   - `evaluate.viewport.supported`: 특정 뷰포트 타입에서만

#### Step 3: 툴 그룹 시스템 (initToolGroups.ts)
**목표**: Cornerstone3D 도구가 어떻게 초기화되는지 이해

1. 기본 툴 그룹 구조
   ```typescript
   const tools = {
     active: [{ toolName: 'WindowLevel', bindings: [...] }],  // 마우스 바인딩
     passive: [{ toolName: 'Length' }],                       // 활성화 가능
     enabled: [{ toolName: 'ImageOverlayViewer' }],           // 항상 켜짐
     disabled: [{ toolName: 'Crosshairs' }]                   // 비활성화
   };
   ```

2. MPR 툴 그룹의 Crosshairs 설정
   - `getReferenceLineColor`: 뷰포트별 색상 지정
   - USMPR 레이아웃 설정 읽어오기 (localStorage)

3. 툴 그룹 생성 및 에러 처리
   ```typescript
   // 기존 툴 그룹이 있으면 삭제 후 재생성
   const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
   if (existingToolGroup) {
     toolGroupService.destroyToolGroup(toolGroupId);
   }
   ```

#### Step 4: Services와 Commands 연계 이해
**목표**: 서비스가 어떻게 상태를 관리하고 커맨드로 제어되는지 학습

1. `ServicesManager` 사용 패턴
2. `CommandsManager`로 명령 실행
3. PubSub 패턴으로 이벤트 구독

#### Step 5: 커스텀 모드 만들어보기
**실습**: `modes/basic`을 복사하여 자신만의 모드 제작
- 툴바 버튼 추가/제거
- 기본 툴 변경
- Hanging Protocol 커스터마이징

### 5.2 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF의 모든 기본 기능 이해**: CT, MR, US, X-ray 등 범용 의료 영상을 볼 수 있는 뷰어의 핵심 구조 파악
2. **커스텀 모드 개발**: 특정 워크플로우에 맞춘 모드를 직접 만들 수 있음 (예: Longitudinal, TMTV, USMPR처럼)
3. **툴바 커스터마이징**: 필요한 도구만 선택하거나 새로운 도구 추가
4. **OHIF 아키텍처 마스터**: Extension - Mode - Service - Command 구조를 완전히 이해

---

## 부록: 주요 상수 및 설정

### NON_IMAGE_MODALITIES
이미징이 아닌 DICOM 모달리티 목록:
```typescript
['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR', 'SR']
```
- 썸네일 표시 제외 또는 별도 처리 필요

### basicLayout
기본 레이아웃 구성:
```typescript
{
  leftPanels: [ohif.thumbnailList],        // 시리즈 목록
  leftPanelResizable: true,                // 크기 조절 가능
  rightPanels: [                           // 측정/세그멘테이션 패널
    cornerstone.segmentation,
    cornerstone.measurements
  ],
  rightPanelClosed: true,                  // 기본적으로 닫혀 있음
  viewports: [...]                         // 다중 뷰포트 타입 지원
}
```

### isValidMode()
모드 활성화 조건 검사:
- `modeModalities`가 정의되어 있으면 해당 모달리티만 허용
- 정의 안 되어 있으면 `NON_IMAGE_MODALITIES` 외의 모든 모달리티 허용

---

## 관련 문서
- `modes/usmpr/CLAUDE.md`: USMPR 모드 분석 (커스텀 모드 예시)
- `extensions/default/`: 기본 확장 프로그램 분석
- `extensions/cornerstone/`: Cornerstone3D 렌더링 확장
- `platform/core/src/services/`: OHIF Services 구조
