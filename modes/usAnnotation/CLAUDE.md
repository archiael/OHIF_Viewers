# modes/usAnnotation - 초음파 Pleura B-line 주석 모드

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
   - 1.3. [주요 특징](#1.3-주요-특징)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일 역할](#2.2-주요-파일-역할)
   - 2.3. [데이터 흐름 다이어그램 (텍스트)](#2.3-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅 (해당 없음)](#3.3-커스텀-훅-해당-없음)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [이 폴더에서 사용되는 OHIF 핵심 개념](#4.1-이-폴더에서-사용되는-ohif-핵심-개념)
   - 4.2. [관련되는 다른 폴더](#4.2-관련되는-다른-폴더)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
6. [추가 참고 자료](#6-추가-참고-자료)
   - 6.1. [관련 문서](#6.1-관련-문서)
   - 6.2. [디버깅 팁](#6.2-디버깅-팁)

---


## 1. 모듈 개요

### 1.1. 전체 OHIF 앱에서의 역할
이 모드는 **초음파 영상에서 Pleura B-line을 주석(annotation)하는 전문 워크플로우**를 제공합니다. Pleura B-line은 폐 초음파 검사에서 중요한 임상 지표로, 이 모드는 의료진이 B-line과 Pleura(흉막) 라인을 정확하게 표시하고 측정할 수 있도록 특화된 도구를 제공합니다.

### 1.2. 연결되는 화면/기능
- **초음파 영상 뷰어**: US(Ultrasound) 모달리티 시리즈를 자동으로 감지하고 활성화됩니다
- **B-line/Pleura 비율 오버레이**: 화면 왼쪽 상단에 B-line과 Pleura의 백분율을 실시간으로 표시합니다
- **전용 주석 패널**: 오른쪽 사이드 패널에 B-line 주석 전용 컨트롤을 제공합니다
- **측정 추적**: 측정값 추적 모드를 간소화된 방식으로 자동 설정합니다

### 1.3. 주요 특징
- **모달리티 검증**: `isValidMode`를 통해 US 모달리티가 포함된 스터디에서만 활성화됩니다
- **핫키 지원**: W, S, E, D, O 키로 빠른 주석 작업이 가능합니다 (Pleura line 추가, B-line 추가, 삭제, 오버레이 토글 등)
- **자동 설정**: 모드 진입 시 측정 추적 설정을 자동으로 간소화 모드로 전환합니다

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
modes/usAnnotation/src/
├── index.ts              # 모드 정의 및 라이프사이클 (385줄) - 메인 엔트리
├── id.js                 # 모드 ID 정의 (package.json의 name 사용)
├── toolbarButtons.ts     # 툴바 버튼 설정 (708줄) - UI 버튼 정의
└── initToolGroups.js     # 도구 그룹 초기화 (314줄) - 도구 설정
```

### 2.2. 주요 파일 역할

**`index.ts` (메인 모드 로직)**
- **modeFactory**: 모드 생성 함수, 서비스 및 확장 프로그램 통합
- **onModeEnter**: 모드 진입 시 툴바, 핫키, 커스터마이제이션 설정
- **onModeExit**: 모드 종료 시 정리 작업 (서비스 destroy)
- **isValidMode**: US 모달리티 검증 로직
- **routes**: `longitudinal` 라우트 정의 및 레이아웃 구성
- **sopClassHandlers**: DICOM SOP Class 처리 우선순위 정의

**`toolbarButtons.ts` (툴바 버튼 정의)**
- 측정 도구: Length, Bidirectional, EllipticalROI, RectangleROI, CircleROI 등
- 초음파 전용 도구: UltrasoundDirectionalTool, UltrasoundPleuraBLineTool
- 뷰포트 제어: Zoom, Pan, WindowLevel, Crosshairs
- 고급 기능: Cine, Capture, Layout Selector

**`initToolGroups.js` (도구 그룹 초기화)**
- **initDefaultToolGroup**: 기본 도구 그룹, UltrasoundAnnotation이 primary 바인딩
- **initSRToolGroup**: DICOM SR(Structured Report) 도구 그룹
- **initMPRToolGroup**: MPR(Multi-Planar Reconstruction) 도구 그룹 (Crosshairs 포함)
- **initVolume3DToolGroup**: 3D 볼륨 렌더링 도구 그룹 (TrackballRotate)

### 2.3. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 액션]
     ↓
[툴바 버튼 클릭 / 핫키 입력]
     ↓
[CommandsManager] → 명령 실행 (예: switchUSAnnotationToBLine)
     ↓
[ToolGroupService] → 활성 도구 변경
     ↓
[CornerstoneViewportService] → 뷰포트에 도구 적용
     ↓
[UltrasoundPleuraBLineTool] → 주석 생성
     ↓
[MeasurementService] → 측정값 저장
     ↓
[UI 업데이트] → B-line/Pleura 백분율 표시
```

**핵심 서비스 간 관계:**
- `ToolbarService`: 툴바 UI 관리 및 섹션 업데이트
- `ToolGroupService`: 도구 그룹 생성 및 활성화 관리
- `MeasurementService`: 주석/측정값 추적
- `CustomizationService`: 핫키, 컨텍스트 메뉴, 오버레이 커스터마이징

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

**1. OHIF 서비스 기반 상태 관리 (전역 store 패턴)**
이 모드는 React 컴포넌트 레벨의 상태 관리보다는 **OHIF 서비스 아키텍처**를 주로 사용합니다:

```typescript
// onModeEnter에서 서비스 인스턴스 획득
const {
  measurementService,      // 측정값 상태 관리
  toolbarService,          // 툴바 버튼 상태
  toolGroupService,        // 도구 그룹 상태
  customizationService     // 커스터마이징 설정
} = servicesManager.services;

// 서비스는 PubSub 패턴으로 상태 변경 이벤트를 발행
measurementService.clearMeasurements(); // 측정값 초기화
```

**2. 설정 저장 (클로저 패턴)**
```typescript
let settingsSaved = {}; // modeFactory 외부에 선언 (클로저로 캡슐화)

// onModeEnter: 기존 설정 백업
settingsSaved = {
  disableConfirmationPrompts: appConfig?.disableConfirmationPrompts,
  measurementTrackingMode: appConfig?.measurementTrackingMode,
};

// onModeExit: 설정 복원
appConfig.disableConfirmationPrompts = settingsSaved.disableConfirmationPrompts;
```

**3. 이벤트 기반 상태 동기화 (구독 패턴)**
```typescript
// 뷰포트 변경 시 자동 업데이트
listeners: {
  [EVENTS.VIEWPORT_NEW_IMAGE_SET]: {
    commandName: 'toggleImageSliceSync',
    commandOptions: { toggledState: true },
  },
}
```

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드는 주로 **선언적 UI 구성(Declarative UI Configuration)** 패턴을 사용합니다:

```typescript
// toolbarButtons.ts - UI 컴포넌트를 데이터로 정의
{
  id: 'UltrasoundPleuraBLineTool',
  uiType: 'ohif.toolButton',        // 재사용 가능한 컴포넌트 타입
  props: {
    icon: 'icon-tool-ultrasound-bidirectional',
    label: i18n.t('Buttons:US Pleura B-line Annotation'),
    tooltip: i18n.t('Buttons:US Pleura B-line Annotation'),
    commands: setToolActiveToolbar, // 명령 바인딩
    evaluate: [                     // 조건부 렌더링
      'evaluate.cornerstoneTool',
      {
        name: 'evaluate.modality.supported',
        supportedModalities: ['US'], // US 모달리티에서만 표시
      },
    ],
  },
}
```

**주요 재사용 컴포넌트 타입:**
- `ohif.toolButton`: 일반 도구 버튼
- `ohif.toolButtonList`: 버튼 리스트 컨테이너
- `ohif.layoutSelector`: 레이아웃 선택기
- `ohif.advancedRenderingControls`: 고급 렌더링 컨트롤
- `ohif.dataOverlayMenu`: 데이터 오버레이 메뉴

### 3.3. 커스텀 훅 (해당 없음)

이 모드 자체에는 커스텀 훅이 없습니다. 대신 **CustomizationService**를 통해 동적 UI 요소를 정의합니다:

```typescript
customizationService.setCustomizations({
  'viewportOverlay.topLeft': [
    {
      id: 'BLinePleuraPercentage',
      contentF: () => {
        // 함수형 컴포넌트처럼 동작하지만 커스터마이제이션 시스템에서 관리됨
        const { viewportGridService, toolGroupService, cornerstoneViewportService } =
          servicesManager.services;
        const activeViewportId = viewportGridService.getActiveViewportId();
        const toolGroup = toolGroupService.getToolGroupForViewport(activeViewportId);
        // ... B-line 백분율 계산 로직
        return `B-Line/Pleura : ${percentage.toFixed(2)} %`;
      },
    },
  ],
}, 'mode');
```

**이점**: React 컴포넌트 재렌더링 없이 OHIF 서비스 레이어에서 UI를 동적으로 업데이트할 수 있습니다.

---

## 4. OHIF 특유 개념 정리

### 4.1. 이 폴더에서 사용되는 OHIF 핵심 개념

#### 1. **Mode (모드)**
- **정의**: 특정 워크플로우를 위한 확장 프로그램, 레이아웃, 도구의 사전 구성된 조합
- **이 모드의 역할**: 초음파 B-line 주석 워크플로우에 최적화
- **구성 요소**:
  - `id`: `@ohif/mode-ultrasound-pleura-bline`
  - `routeName`: `usAnnotation`
  - `displayName`: "US Pleura B-line Annotations"
  - `routes`: 라우트 및 레이아웃 정의
  - `extensions`: 의존하는 확장 프로그램 목록
  - `hangingProtocol`: 기본 hanging protocol (viewport 배치 규칙)
  - `sopClassHandlers`: DICOM SOP Class 처리 순서

#### 2. **Extension Dependencies (확장 프로그램 의존성)**
```typescript
const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',              // 기본 데이터 소스, 패널
  '@ohif/extension-cornerstone': '^3.0.0',          // Cornerstone 렌더링
  '@ohif/extension-measurement-tracking': '^3.0.0', // 측정 추적
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0', // DICOM SR 지원
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',// DICOM SEG 지원
  '@ohif/extension-ultrasound-pleura-bline': '^3.0.0', // [핵심] B-line 도구
  // ... 기타 확장 프로그램
};
```

#### 3. **Hanging Protocol (걸기 프로토콜)**
- **정의**: 스터디가 로드될 때 뷰포트를 자동으로 배치하는 규칙
- **이 모드**: 기본 hanging protocol 사용 (`hangingProtocol: 'default'`)
- **관련 폴더**: `extensions/default/src/hangingprotocols/`

#### 4. **SOP Class Handler (SOP 클래스 핸들러)**
- **정의**: 특정 DICOM SOP Class를 어떻게 렌더링할지 결정하는 핸들러
- **순서 중요**: 더 구체적인 핸들러가 먼저, 일반적인 핸들러가 나중
```typescript
sopClassHandlers: [
  dicomvideo.sopClassHandler,  // 비디오 (먼저 처리)
  dicomSeg.sopClassHandler,
  // ...
  ohif.sopClassHandler,        // 일반 스택 이미지 (나중 처리)
  dicomRT.sopClassHandler,
]
```

#### 5. **Tool Groups (도구 그룹)**
- **정의**: 특정 뷰포트 타입에 적용되는 도구 모음
- **이 모드의 도구 그룹**:
  - `default`: 일반 스택 이미지 (UltrasoundAnnotation이 primary)
  - `mpr`: MPR 뷰포트 (Crosshairs 포함)
  - `SRToolGroup`: DICOM SR 전용
  - `volume3d`: 3D 볼륨 렌더링 (TrackballRotate)

**도구 상태:**
- `active`: 마우스 바인딩으로 즉시 사용 가능 (예: Primary 클릭)
- `passive`: 툴바에서 선택하면 활성화
- `enabled`: 항상 활성화되어 있음 (예: ReferenceLines)
- `disabled`: 비활성화되어 있지만 명령으로 활성화 가능 (예: Crosshairs)

#### 6. **Services (서비스)**
모드에서 사용하는 주요 서비스:
- `MeasurementService`: 측정값/주석 관리 (`clearMeasurements()`)
- `ToolbarService`: 툴바 버튼 등록 및 섹션 업데이트
- `ToolGroupService`: 도구 그룹 생성 및 관리
- `CustomizationService`: 핫키, 컨텍스트 메뉴, 오버레이 커스터마이징
- `ViewportGridService`: 활성 뷰포트 관리
- `CornerstoneViewportService`: Cornerstone 뷰포트 접근

#### 7. **Customization (커스터마이제이션)**
- **핫키 바인딩**:
  - `W`: Pleura line 추가
  - `S`: B-line 추가
  - `E`: 마지막 Pleura line 삭제
  - `D`: 마지막 B-line 삭제
  - `O`: 오버레이 토글

- **컨텍스트 메뉴**: 측정값 위에서 우클릭 시 "Delete annotation" 메뉴 표시

- **뷰포트 오버레이**: 왼쪽 상단에 B-line/Pleura 백분율 실시간 표시

### 4.2. 관련되는 다른 폴더

| 폴더 경로 | 역할 | 관계 |
|---------|------|------|
| `extensions/usAnnotation/` | B-line 주석 도구 확장 | 이 모드의 핵심 기능 제공 (UltrasoundPleuraBLineTool) |
| `extensions/cornerstone/` | Cornerstone 렌더링 엔진 | 뷰포트 렌더링 및 도구 프레임워크 제공 |
| `extensions/default/` | 기본 확장 | 데이터 소스, 시리즈 목록, 레이아웃 템플릿 제공 |
| `extensions/measurement-tracking/` | 측정 추적 확장 | 측정값 패널 및 추적 뷰포트 제공 |
| `platform/core/src/services/` | OHIF 코어 서비스 | ServicesManager, MeasurementService 등 |
| `platform/ui/` | UI 컴포넌트 라이브러리 | 툴바 버튼, 패널, 모달 등 재사용 컴포넌트 |

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### Step 1: 모드 구조 이해 (30분)
**읽어볼 파일:**
1. `modes/usAnnotation/package.json` - 모드의 정체성 확인
2. `modes/usAnnotation/src/id.js` - 모드 ID 확인
3. `modes/usAnnotation/README.md` - 간단한 설명

**이해해야 할 개념:**
- 모드는 독립적인 NPM 패키지로 배포됩니다
- `@ohif/mode-ultrasound-pleura-bline`이 실제 패키지 이름입니다

#### Step 2: 모드 라이프사이클 따라가기 (1시간)
**읽어볼 파일:**
1. `modes/usAnnotation/src/index.ts` - `modeFactory` 함수부터 시작

**따라갈 흐름:**
```typescript
modeFactory({ modeConfiguration })
  ↓
onModeEnter({ servicesManager, extensionManager, ... })
  ↓ (1) 설정 저장 및 변경
  settingsSaved = { ... }
  appConfig.disableConfirmationPrompts = true
  ↓ (2) 도구 그룹 초기화
  initToolGroups(extensionManager, toolGroupService, commandsManager)
  ↓ (3) 툴바 등록
  toolbarService.register(toolbarButtons)
  ↓ (4) 툴바 섹션 업데이트
  toolbarService.updateSection(...)
  ↓ (5) 커스터마이징 (핫키, 오버레이 등)
  customizationService.setCustomizations(...)
```

**실습 과제:**
- `onModeEnter`에서 `console.log('Mode entered!')`를 추가해보세요
- 브라우저 DevTools에서 `servicesManager.services`를 탐색해보세요

#### Step 3: 툴바 버튼 커스터마이징 (1시간)
**읽어볼 파일:**
1. `modes/usAnnotation/src/toolbarButtons.ts`

**이해해야 할 패턴:**
```typescript
// 버튼 정의 구조
{
  id: '버튼고유ID',
  uiType: 'ohif.toolButton',     // 재사용 컴포넌트 타입
  props: {
    icon: '아이콘이름',
    label: '버튼라벨',
    tooltip: '툴팁',
    commands: '실행할명령',       // 또는 { commandName, commandOptions }
    evaluate: '조건평가함수',     // 버튼 활성화 조건
  },
}
```

**실습 과제:**
- 새로운 버튼을 `toolbarButtons` 배열에 추가해보세요
- `onModeEnter`의 `toolbarService.updateSection`에서 해당 버튼 ID를 추가해보세요
- 브라우저에서 새 버튼이 나타나는지 확인하세요

#### Step 4: 도구 그룹 이해하기 (1.5시간)
**읽어볼 파일:**
1. `modes/usAnnotation/src/initToolGroups.js`

**핵심 개념:**
```javascript
// 도구 그룹 정의
const tools = {
  active: [    // 마우스에 바로 바인딩
    {
      toolName: toolNames.UltrasoundAnnotation,
      bindings: [{ mouseButton: Enums.MouseBindings.Primary }] // 좌클릭
    },
  ],
  passive: [   // 툴바에서 선택 가능
    { toolName: toolNames.Length },
  ],
  enabled: [   // 항상 활성화
    { toolName: toolNames.ReferenceLines },
  ],
  disabled: [  // 명령으로 활성화 가능
    { toolName: toolNames.Crosshairs },
  ],
};
```

**실습 과제:**
- `initDefaultToolGroup`에서 `active` 도구를 다른 것으로 바꿔보세요 (예: Length)
- 마우스 바인딩을 변경해보세요 (Primary → Secondary)
- 브라우저에서 어떻게 동작이 바뀌는지 확인하세요

#### Step 5: 커스터마이징 실험하기 (2시간)
**읽어볼 파일:**
1. `modes/usAnnotation/src/index.ts` - `customizationService.setCustomizations` 부분

**주요 커스터마이징 영역:**
```typescript
// 1. 핫키 바인딩
'ohif.hotkeyBindings': {
  $push: [{
    commandName: '명령이름',
    label: '핫키설명',
    keys: ['W'],  // 원하는 키로 변경 가능
  }],
}

// 2. 컨텍스트 메뉴
measurementsContextMenu: {
  menus: [{
    id: 'forExistingMeasurement',
    selector: ({ nearbyToolData }) => !!nearbyToolData,
    items: [{ label: 'Delete annotation', commands: 'removeMeasurement' }],
  }],
}

// 3. 뷰포트 오버레이
'viewportOverlay.topLeft': [{
  id: 'BLinePleuraPercentage',
  contentF: () => { /* 동적 콘텐츠 생성 */ },
  condition: ({ referenceInstance }) => referenceInstance?.Modality.includes('US'),
}],
```

**실습 과제:**
- 핫키를 다른 키로 변경해보세요 (예: W → Q)
- 새로운 컨텍스트 메뉴 항목을 추가해보세요
- 오버레이에 다른 정보를 표시해보세요 (예: 현재 이미지 번호)

#### Step 6: 확장 프로그램과의 통합 이해하기 (2시간)
**읽어볼 파일:**
1. `extensions/usAnnotation/src/index.ts`
2. `extensions/usAnnotation/src/getCommandsModule.ts`
3. `extensions/usAnnotation/src/getPanelModule.tsx`

**이해해야 할 관계:**
```
modes/usAnnotation/src/index.ts
  ↓ (의존성 선언)
extensionDependencies = {
  '@ohif/extension-ultrasound-pleura-bline': '^3.0.0'
}
  ↓ (확장 사용)
extensions/usAnnotation/
  ├── getCommandsModule() → 명령 제공 (예: switchUSAnnotationToBLine)
  └── getPanelModule() → USAnnotationPanel 컴포넌트 제공
  ↓ (모드에서 참조)
usAnnotation.panel = '@ohif/extension-ultrasound-pleura-bline.panelModule.USAnnotationPanel'
```

**실습 과제:**
- `extensions/usAnnotation/src/getCommandsModule.ts`에서 제공하는 명령들을 확인하세요
- 모드의 `customizationService`에서 해당 명령들이 어떻게 사용되는지 추적해보세요

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

**1. 새로운 모달리티 특화 모드 개발**
- CT 전용 모드, MR 전용 모드 등을 만들 수 있습니다
- `isValidMode`를 사용해 특정 모달리티에서만 활성화되는 모드를 구현할 수 있습니다

**2. 커스텀 워크플로우 구성**
- 툴바 버튼 배치를 자유롭게 조정할 수 있습니다
- 핫키를 워크플로우에 맞게 설정할 수 있습니다
- 컨텍스트 메뉴와 오버레이를 커스터마이징할 수 있습니다

**3. 도구 통합 및 관리**
- 여러 확장 프로그램의 도구를 하나의 모드로 통합할 수 있습니다
- 도구 그룹을 뷰포트 타입별로 다르게 설정할 수 있습니다
- 마우스 바인딩을 자유롭게 구성할 수 있습니다

**4. 모드 라이프사이클 관리**
- 모드 진입/종료 시 필요한 초기화 및 정리 작업을 구현할 수 있습니다
- 모드별 설정을 저장하고 복원할 수 있습니다

**5. OHIF 아키텍처 활용**
- Extension-Mode-Service 아키텍처를 이해하고 활용할 수 있습니다
- 다른 OHIF 프로젝트의 모드를 읽고 이해할 수 있습니다
- OHIF 기반 커스텀 뷰어를 개발할 수 있습니다

---

## 6. 추가 참고 자료

### 6.1. 관련 문서
- [OHIF 공식 모드 문서](https://docs.ohif.org/platform/modes/)
- [Cornerstone Tools 문서](https://www.cornerstonejs.org/docs/concepts/cornerstone-tools/tools)
- `modes/basic/CLAUDE.md` - 기본 모드 분석 (비교 학습에 유용)
- `modes/usmpr/CLAUDE.md` - USMPR 모드 분석 (MPR 워크플로우 참고)

### 6.2. 디버깅 팁
1. **브라우저 DevTools 활용**:
   - `window.ohif.app.servicesManager.services` - 모든 서비스 접근
   - `window.ohif.app.commandsManager.runCommand('명령', 옵션)` - 명령 실행 테스트

2. **로깅 추가**:
   ```typescript
   // onModeEnter에 추가
   console.log('ServicesManager:', servicesManager.services);
   console.log('Toolbar buttons:', toolbarButtons);
   ```

3. **핫키 디버깅**:
   - 브라우저에서 핫키를 눌렀을 때 콘솔에 에러가 나타나는지 확인하세요
   - `customizationService`의 hotkey 설정을 확인하세요

---

**최종 업데이트**: 2026-01-01
**작성자**: OHIF Modes Analyst Agent
**버전**: 1.0.0
