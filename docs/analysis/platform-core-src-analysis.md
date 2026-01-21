# platform/core/src 분석

## 1. 모듈 개요

### 전체 OHIF 리액트 앱에서의 책임
`platform/core/src`는 OHIF Medical Imaging Viewer의 **핵심 비즈니스 로직 라이브러리**입니다. 이 패키지는 UI가 없는 순수한 비즈니스 로직 계층으로, 다음과 같은 역할을 담당합니다:

- **서비스 관리**: 의료 영상 뷰어에 필요한 모든 핵심 서비스 제공 (DisplaySetService, MeasurementService, HangingProtocolService 등)
- **확장 시스템**: Extension과 Mode를 등록하고 관리하는 플러그인 아키텍처 제공
- **명령 관리**: 뷰어의 모든 액션을 명령(Command) 패턴으로 추상화하여 관리
- **DICOM 데이터 처리**: DICOM 메타데이터 저장소 및 DICOMweb 유틸리티 제공
- **공통 유틸리티**: 날짜 포맷팅, GUID 생성, 이미지 정렬 등 재사용 가능한 헬퍼 함수

### 화면/기능과의 연결
이 패키지는 **직접적인 UI를 렌더링하지 않습니다**. 대신 다른 패키지들이 사용하는 기반(foundation)을 제공합니다:

- `platform/app` - 이 core 패키지를 사용하여 ServicesManager, ExtensionManager 등을 초기화
- `platform/ui` - core의 서비스들을 소비하여 UI 컴포넌트에 데이터 제공
- `extensions/*` - core의 ExtensionManager를 통해 등록되며, core의 서비스를 사용
- `modes/*` - core의 HangingProtocolService, DisplaySetService 등을 활용하여 워크플로우 구성

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 진입점
- **`index.ts`** (150줄): 패키지의 메인 export 파일. 모든 서비스, 클래스, 유틸리티를 외부에 노출

### 주요 디렉토리 구조

#### A. 서비스 (`services/`)
핵심 비즈니스 로직을 담당하는 서비스들:

- **`ServicesManager.ts`** (85줄): 모든 서비스를 등록하고 관리하는 중앙 레지스트리
- **`DisplaySetService/`**: DICOM 이미지 그룹(DisplaySet) 생성 및 관리
  - `DisplaySetService.ts`: DisplaySet 라이프사이클 관리, 캐싱
  - `EVENTS.js`: 서비스가 발행하는 이벤트 정의
- **`HangingProtocolService/`**: 뷰포트 레이아웃 및 시리즈 매칭 규칙 관리
  - `HangingProtocolService.ts` (1500+ 줄): 프로토콜 엔진, 매칭 로직
  - `ProtocolEngine.js`: 프로토콜 평가 및 스코어링 엔진
- **`MeasurementService/`**: 측정값(주석, ROI 등) 저장 및 추적
- **`DicomMetadataStore/`**: DICOM 메타데이터 중앙 저장소
- **`ViewportGridService/`**: 뷰포트 그리드 레이아웃 상태 관리
- **`ToolbarService/`**: 툴바 버튼 동적 등록 및 상태 관리
- **`CineService/`**: 시네 루프(자동 재생) 관리
- **`UIModalService/`, `UIDialogService/`, `UINotificationService/`**: UI 인터랙션 서비스
- **`PanelService/`**: 사이드 패널(좌/우) 관리
- **`CustomizationService/`**: 런타임 커스터마이징 훅
- **`UserAuthenticationService/`**: 사용자 인증 관리
- **`StudyPrefetcherService/`**: 이미지 선행 로딩(Prefetching)
- **`WorkflowStepsService/`**: 다단계 워크플로우 진행 상태 관리
- **`MultiMonitorService.ts`**: 멀티 모니터 지원

#### B. 확장 시스템 (`extensions/`)
- **`ExtensionManager.ts`** (670줄): 확장 프로그램 등록, 모듈 라이프사이클 관리
- **`MODULE_TYPES.js`**: 확장이 제공할 수 있는 모듈 타입 정의
  ```javascript
  {
    COMMANDS: 'commandsModule',
    DATA_SOURCE: 'dataSourcesModule',
    PANEL: 'panelModule',
    VIEWPORT: 'viewportModule',
    TOOLBAR: 'toolbarModule',
    HANGING_PROTOCOL: 'hangingProtocolModule',
    // ...
  }
  ```

#### C. 클래스 (`classes/`)
- **`CommandsManager.ts`** (271줄): 명령 패턴 구현, 컨텍스트 기반 명령 실행
- **`HotkeysManager.ts`**: 키보드 단축키 관리
- **`ImageSet.ts`**: 이미지 세트 추상화
- **`MetadataProvider.ts`**: 메타데이터 제공자 인터페이스

#### D. React 통합 (`contextProviders/`, `hooks/`)
- **`SystemProvider.tsx`**: React Context로 ServicesManager, CommandsManager 등 제공
- **`useToolbar.tsx`** (230줄): 툴바 상태 및 인터랙션 훅
- **`useRunCommand.tsx`**: 명령 실행 훅
- **`useViewportRef.ts`**: 뷰포트 DOM 참조 관리
- **`useViewportSize.ts`**: 뷰포트 크기 추적
- **`useActiveViewportDisplaySets.ts`**: 활성 뷰포트의 DisplaySet 추적

#### E. 유틸리티 (`utils/`)
50개 이상의 헬퍼 함수:
- **날짜/시간**: `formatDate.js`, `formatTime.ts`, `formatPN.js` (Patient Name)
- **DICOM**: `isDicomUid.js`, `sopClassDictionary.ts`, `sortStudy.ts`
- **이미지 처리**: `getClosestOrientationFromIOP.ts`, `calculateScanAxisNormal.ts`, `sortInstancesByPosition.ts`
- **일반**: `guid.js`, `debounce.js`, `makeDeferred.js`, `Queue.js`
- **다운로드**: `downloadBlob.ts`, `downloadCSVReport.js`
- **핫키**: `hotkeys/` 디렉토리

#### F. DICOM 관련 (`DICOMWeb/`, `DataSources/`)
- **`DICOMWeb/`**: DICOMweb 속성 추출 유틸리티
  - `getAttribute.js`, `getString.js`, `getNumber.js`, `getName.js`
  - `getAuthorizationHeader.ts`: 인증 헤더 생성
- **`DataSources/IWebApiDataSource.js`**: 데이터 소스 인터페이스 정의

#### G. 타입 정의 (`types/`)
TypeScript 타입 정의:
- `AppTypes.ts`, `Services.ts`, `DisplaySet.ts`, `HangingProtocol.ts`, `Command.ts`, `StudyMetadata.ts`

#### H. 기타
- **`log.js`**: 로깅 유틸리티
- **`errorHandler.js`**: 에러 핸들링
- **`defaults/`**: 기본 설정 (hotkey 바인딩, window level presets)
- **`enums/`**: 열거형 타입 (TimingEnum 등)

### 컴포넌트 간 관계 (텍스트 다이어그램)

```
┌─────────────────────────────────────────────────────────┐
│                    platform/app                         │
│                  (애플리케이션 초기화)                    │
└───────────────────┬─────────────────────────────────────┘
                    │ 생성 및 주입
                    ↓
┌───────────────────────────────────────────────────────────┐
│                 SystemContextProvider                     │
│  ┌──────────────┬──────────────┬────────────────────┐    │
│  │ServicesManager│CommandsManager│ExtensionManager   │    │
│  │HotkeysManager │              │                    │    │
│  └──────────────┴──────────────┴────────────────────┘    │
└───────────────────┬───────────────────────────────────────┘
                    │ useSystem() 훅으로 접근
                    ↓
┌───────────────────────────────────────────────────────────┐
│              React 컴포넌트 (platform/ui, modes)           │
│  - useToolbar()로 툴바 버튼 가져오기                        │
│  - useRunCommand()로 명령 실행                             │
│  - services.displaySetService.subscribe()로 이벤트 구독     │
└───────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              서비스 간 통신 (PubSub 패턴)                 │
└─────────────────────────────────────────────────────────┘
DisplaySetService ──DISPLAY_SETS_ADDED──> 리스너들
                                           (HangingProtocolService 등)

HangingProtocolService ──PROTOCOL_CHANGED──> 리스너들
                                              (ViewportGrid 등)

ViewportGridService ──ACTIVE_VIEWPORT_CHANGED──> 리스너들
                                                  (ToolbarService 등)
```

### 데이터 흐름 예시 (시리즈 로딩 시나리오)

```
1. DataSource가 DICOM 데이터를 가져옴
   ↓
2. DicomMetadataStore에 메타데이터 저장
   ↓
3. DisplaySetService가 DisplaySet 생성
   → DISPLAY_SETS_ADDED 이벤트 발행
   ↓
4. HangingProtocolService가 이벤트 수신
   → 프로토콜 매칭 실행
   → PROTOCOL_CHANGED 이벤트 발행
   ↓
5. ViewportGridService가 레이아웃 적용
   → 각 뷰포트에 DisplaySet 할당
   ↓
6. React 컴포넌트가 업데이트되어 화면에 렌더링
```

---

## 3. 리액트 관점에서 볼 포인트

### A. 상태 관리 방식

#### 1) Context API를 통한 중앙 의존성 주입
**SystemProvider.tsx**가 핵심:
```typescript
<SystemContextProvider
  servicesManager={servicesManager}
  commandsManager={commandsManager}
  extensionManager={extensionManager}
  hotkeysManager={hotkeysManager}
>
  <App />
</SystemContextProvider>
```

- React Context를 사용하여 최상위에서 모든 관리자 객체를 주입
- 하위 컴포넌트는 `useSystem()` 훅으로 접근
- **Props Drilling 없이** 어디서든 서비스에 접근 가능

#### 2) 서비스 기반 전역 상태 관리
각 서비스는 **클래스 인스턴스**로 관리되며, 내부 상태를 가짐:

```typescript
// DisplaySetService 예시
class DisplaySetService extends PubSubService {
  public activeDisplaySets = [];  // 전역 상태
  protected activeDisplaySetsMap = new Map();

  public getActiveDisplaySets() {
    return this.activeDisplaySets;  // 직접 참조
  }
}
```

- Redux나 Zustand 같은 전역 상태 라이브러리 **사용 안 함**
- 대신 **서비스 클래스의 인스턴스 변수**가 전역 상태 역할
- React의 `useState` 대신 **PubSub 패턴으로 변경 알림**

#### 3) PubSub 패턴으로 React 업데이트 트리거
```typescript
// 서비스에서 이벤트 발행
displaySetService._broadcastEvent(EVENTS.DISPLAY_SETS_ADDED, { displaySetsAdded });

// React 컴포넌트에서 구독
useEffect(() => {
  const subscription = displaySetService.subscribe(
    EVENTS.DISPLAY_SETS_ADDED,
    (data) => {
      setLocalState(data);  // React state 업데이트로 리렌더링
    }
  );
  return () => subscription.unsubscribe();
}, []);
```

**리액트 초보자를 위한 해설:**
- 서비스는 React 외부에 존재 (클래스 인스턴스)
- 서비스 상태가 변경되면 **이벤트 발행**
- React 컴포넌트는 **이벤트 구독**하여 로컬 state 업데이트
- 로컬 state 변경 → React가 컴포넌트 리렌더링

### B. 재사용 가능한 패턴

#### 1) Custom Hook 패턴
**`useToolbar.tsx`** - 툴바 로직 재사용:
```typescript
export function useToolbar({ buttonSection = 'primary' }) {
  const { commandsManager, servicesManager } = useSystem();
  const { toolbarService } = servicesManager.services;

  const [toolbarButtons, setToolbarButtons] = useState([]);

  const onInteraction = useCallback((args) => {
    // 버튼 클릭 처리
  }, []);

  useEffect(() => {
    // 툴바 변경 이벤트 구독
    const sub = toolbarService.subscribe(EVENTS.TOOL_BAR_MODIFIED, () => {
      setToolbarButtons(toolbarService.getButtonSection(buttonSection));
    });
    return () => sub.unsubscribe();
  }, []);

  return { toolbarButtons, onInteraction };
}
```

**장점:**
- 툴바 관련 모든 로직을 훅 안에 캡슐화
- 여러 컴포넌트에서 동일한 패턴으로 재사용 가능
- 서비스 구독/해제를 자동으로 처리 (메모리 누수 방지)

#### 2) 명령 패턴 (Command Pattern)
**`CommandsManager.ts`**:
```typescript
// 확장에서 명령 등록
commandsManager.registerCommand('VIEWER', 'toggleCine', {
  commandFn: ({ viewportId }) => {
    cineService.playClip(viewportId);
  }
});

// UI에서 명령 실행
const runCommand = useRunCommand();
runCommand('toggleCine', { viewportId: 'mpr-0' });
```

**리액트 관점에서의 이점:**
- UI 컴포넌트가 **비즈니스 로직을 몰라도 됨**
- 버튼은 단지 `commandName`만 알면 됨
- 로직 변경 시 UI 컴포넌트 수정 불필요

#### 3) Service Factory 패턴
각 서비스는 정적 `REGISTRATION` 객체를 가짐:
```typescript
export default class DisplaySetService {
  public static REGISTRATION = {
    name: 'displaySetService',
    altName: 'DisplaySetService',
    create: ({ configuration }) => {
      return new DisplaySetService();
    },
  };
}
```

**사용 시:**
```typescript
servicesManager.registerService(DisplaySetService);
// 이후 services.displaySetService로 접근
```

### C. 커스텀 훅 상세

#### 주요 훅 정리표

| 훅 이름 | 역할 | 반환값 |
|--------|------|--------|
| `useSystem()` | 중앙 관리자 접근 | `{ servicesManager, commandsManager, extensionManager, hotkeysManager }` |
| `useToolbar()` | 툴바 버튼 및 인터랙션 | `{ toolbarButtons, onInteraction, lockItem, showItem, ... }` |
| `useRunCommand()` | 명령 실행 함수 | `runCommand(commandName, options)` |
| `useViewportRef()` | 뷰포트 DOM 참조 | `{ viewportRef, setViewportRef }` |
| `useViewportSize()` | 뷰포트 크기 추적 | `{ width, height }` |
| `useActiveViewportDisplaySets()` | 활성 뷰포트의 DisplaySet | `displaySets[]` |

#### `useToolbar` 상세 동작 방식
```typescript
// 1. 서비스에서 버튼 목록 가져오기
const [toolbarButtons, setToolbarButtons] = useState(
  toolbarService.getButtonSection('primary')
);

// 2. 버튼 수정 이벤트 구독
useEffect(() => {
  const sub = toolbarService.subscribe(EVENTS.TOOL_BAR_MODIFIED, () => {
    setToolbarButtons(toolbarService.getButtonSection('primary'));
  });
  return () => sub.unsubscribe();
}, []);

// 3. 뷰포트 변경 시 버튼 상태 갱신
useEffect(() => {
  const sub = viewportGridService.subscribe(
    EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
    ({ viewportId }) => {
      toolbarService.refreshToolbarState({ viewportId });
    }
  );
  return () => sub.unsubscribe();
}, []);
```

**리액트 초보자를 위한 설명:**
1. `useState`로 로컬 state 생성 (React가 이 값이 바뀌면 리렌더링)
2. `useEffect`로 서비스 이벤트 구독 (컴포넌트 마운트 시 실행)
3. 이벤트 발생 시 `setToolbarButtons` 호출 → React가 리렌더링
4. cleanup 함수 (`return () => ...`)로 언마운트 시 구독 해제

---

## 4. OHIF 특유 개념 정리

### A. Extension (확장) 시스템

#### 확장이란?
- OHIF 뷰어에 **플러그인처럼 추가할 수 있는 기능 모듈**
- 예: `@ohif/extension-cornerstone` (렌더링), `@ohif/extension-default` (기본 기능)

#### 확장 구조
```typescript
export default {
  id: '@ohif/extension-my-extension',

  // 1. 사전 등록 훅 (비동기 초기화)
  preRegistration: async ({ servicesManager, configuration }) => {
    // 초기화 로직
  },

  // 2. 모듈 제공 함수들
  getCommandsModule: ({ servicesManager, commandsManager }) => ({
    definitions: {
      myCommand: { commandFn: () => { /* ... */ } }
    }
  }),

  getViewportModule: ({ servicesManager }) => ([
    {
      name: 'my-viewport',
      component: MyViewportComponent
    }
  ]),

  getPanelModule: () => ([
    {
      name: 'my-panel',
      component: MyPanelComponent
    }
  ]),

  // ... 기타 모듈
};
```

#### MODULE_TYPES (모듈 종류)
```javascript
{
  COMMANDS: 'commandsModule',          // 명령 정의
  DATA_SOURCE: 'dataSourcesModule',    // 데이터 소스 (DICOMweb, 로컬 등)
  PANEL: 'panelModule',                // 사이드 패널 컴포넌트
  VIEWPORT: 'viewportModule',          // 뷰포트 렌더러
  TOOLBAR: 'toolbarModule',            // 툴바 버튼
  HANGING_PROTOCOL: 'hangingProtocolModule', // 레이아웃 프로토콜
  SOP_CLASS_HANDLER: 'sopClassHandlerModule', // DICOM SOP Class 핸들러
  CUSTOMIZATION: 'customizationModule', // 커스터마이징 훅
  UTILITY: 'utilityModule'             // 유틸리티 함수
}
```

#### ExtensionManager의 역할
1. **등록**: `registerExtension(extension, configuration)`
2. **모듈 추출**: 각 모듈 타입별로 `getXXXModule()` 호출
3. **초기화**: 적절한 서비스에 모듈 등록
   - `commandsModule` → CommandsManager에 등록
   - `panelModule` → PanelService에 등록
   - `hangingProtocolModule` → HangingProtocolService에 등록
4. **라이프사이클 관리**: `onModeEnter()`, `onModeExit()` 호출

### B. Mode (모드)

#### 모드란?
- **여러 확장을 조합하여 특정 워크플로우를 만든 프리셋**
- 예: `basic` 모드 (기본 뷰어), `usmpr` 모드 (초음파 MPR)

#### 모드의 구성 요소
```typescript
{
  id: '@ohif/mode-basic',

  // 1. 사용할 확장 목록
  extensions: [
    '@ohif/extension-cornerstone',
    '@ohif/extension-default'
  ],

  // 2. 라우트 정의
  routes: [
    {
      path: 'basic',
      layoutTemplate: () => { /* ... */ }
    }
  ],

  // 3. 레이아웃 및 프로토콜
  onModeEnter: ({ servicesManager }) => {
    // Hanging Protocol 적용 등
  }
}
```

**Mode vs Extension 차이:**
- Extension: **기능 제공** (도구, 뷰포트, 패널 등)
- Mode: **확장들을 조합하여 특정 사용 사례 구현** (워크플로우)

### C. Services (서비스)

#### 서비스의 특징
1. **싱글톤**: 앱당 하나의 인스턴스만 존재
2. **PubSub 기반**: 이벤트 발행/구독으로 통신
3. **컨텍스트 독립**: React 밖에서도 동작 가능

#### 주요 서비스 목록

| 서비스 | 역할 | 주요 이벤트 |
|--------|------|------------|
| `DisplaySetService` | DICOM 이미지 그룹 관리 | `DISPLAY_SETS_ADDED`, `DISPLAY_SETS_CHANGED` |
| `HangingProtocolService` | 뷰포트 레이아웃 및 매칭 | `PROTOCOL_CHANGED`, `STAGE_ACTIVATION` |
| `MeasurementService` | 측정값 저장/추적 | `MEASUREMENT_ADDED`, `MEASUREMENT_UPDATED` |
| `ViewportGridService` | 뷰포트 그리드 관리 | `ACTIVE_VIEWPORT_ID_CHANGED`, `LAYOUT_CHANGED` |
| `ToolbarService` | 툴바 버튼 관리 | `TOOL_BAR_MODIFIED`, `TOOL_BAR_STATE_MODIFIED` |
| `DicomMetadataStore` | DICOM 메타데이터 저장소 | `SERIES_ADDED`, `INSTANCES_ADDED` |

#### PubSubService 기반 클래스
```typescript
export class PubSubService {
  EVENTS: Record<string, string>;
  listeners: Record<string, Array<{ id: string; callback: Function }>>;

  subscribe(eventName, callback) {
    // 구독 등록
    return { unsubscribe: () => { /* ... */ } };
  }

  _broadcastEvent(eventName, callbackProps) {
    // 모든 리스너에게 이벤트 전파
    // + CustomEvent로 DOM에도 dispatch
  }
}
```

### D. Hanging Protocol (행잉 프로토콜)

#### 정의
- **어떤 시리즈를 어느 뷰포트에 표시할지 정의한 규칙 세트**
- 예: "CT Chest Study가 열리면 Axial은 좌상단, Sagittal은 우상단에 배치"

#### 프로토콜 구조
```typescript
{
  id: 'my-protocol',
  name: 'My Layout',

  // 1. 프로토콜 적용 조건 (매칭 규칙)
  protocolMatchingRules: [
    {
      attribute: 'Modality',
      constraint: { equals: 'CT' }
    }
  ],

  // 2. 레이아웃 스테이지
  stages: [
    {
      name: 'default',
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 2, columns: 2 }
      },

      // 3. 각 뷰포트에 표시할 DisplaySet 선택
      viewports: [
        {
          viewportOptions: { viewportId: 'mpr-0' },
          displaySets: [
            {
              seriesMatchingRules: [
                { attribute: 'SeriesDescription', constraint: { contains: 'Axial' } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**HangingProtocolService의 역할:**
1. 프로토콜들을 등록받음
2. Study/DisplaySet이 로드되면 매칭 스코어 계산
3. 가장 적합한 프로토콜 선택
4. ViewportGridService에 레이아웃 적용 지시

### E. DisplaySet (디스플레이 셋)

#### 정의
- **뷰포트에 표시할 수 있는 이미지 그룹**
- 보통 하나의 DICOM Series에 해당하지만, 파생된 데이터(SR, SEG 등)도 포함

#### DisplaySet 구조
```typescript
interface DisplaySet {
  displaySetInstanceUID: string;
  SeriesInstanceUID: string;
  StudyInstanceUID: string;
  Modality: string;
  SeriesDescription: string;

  // 이미지 인스턴스 배열
  instances: InstanceMetadata[];

  // 메타 정보
  numImageFrames: number;
  isReconstructable: boolean;

  // 파생 여부
  isDerived?: boolean;
  isLoaded?: boolean;
}
```

**DisplaySetService의 역할:**
1. DataSource에서 받은 인스턴스를 DisplaySet으로 그룹화
2. DisplaySet 캐싱 (Map 자료구조 사용)
3. DisplaySet 추가/제거 시 이벤트 발행
4. Series별/Study별 DisplaySet 조회 API 제공

### F. 관련 폴더 링크

#### Core 내부
- **`services/`**: 모든 서비스 구현체
- **`extensions/`**: ExtensionManager 및 모듈 타입
- **`classes/`**: CommandsManager, HotkeysManager
- **`types/`**: TypeScript 타입 정의

#### 다른 Platform 패키지
- **`platform/app/`**: 애플리케이션 진입점, core 초기화
- **`platform/ui/`**: React UI 컴포넌트 (core 서비스 소비)

#### Extensions (확장 구현)
- **`extensions/cornerstone/`**: 이미지 렌더링 확장
- **`extensions/default/`**: 기본 기능 (데이터 소스, 패널 등)

#### Modes (모드 구성)
- **`modes/basic/`**: 기본 뷰어 모드
- **`modes/usmpr/`**: 초음파 MPR 모드

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### STEP 1: 기본 개념 이해 (2-3일)
1. **PubSub 패턴 이해하기**
   - 읽기: `services/_shared/pubSubServiceInterface.ts`
   - 실습: 간단한 PubSub 예제 만들어보기

2. **Context API 복습**
   - 읽기: `contextProviders/SystemProvider.tsx`
   - 이해: `useSystem()` 훅이 어떻게 서비스에 접근하는지

3. **명령 패턴 익히기**
   - 읽기: `classes/CommandsManager.ts`
   - 실습: `runCommand('commandName', options)` 호출 흐름 따라가기

#### STEP 2: 핵심 서비스 파악 (3-4일)
1. **DisplaySetService**
   - `services/DisplaySetService/DisplaySetService.ts` 읽기
   - DisplaySet이 어떻게 생성되고 캐싱되는지 이해
   - EVENTS.js에서 어떤 이벤트를 발행하는지 확인

2. **HangingProtocolService**
   - `services/HangingProtocolService/HangingProtocolService.ts` 읽기
   - 프로토콜 매칭 로직 이해 (ProtocolEngine.js)
   - 실제 프로토콜 예시 보기 (`extensions/default/src/hangingprotocols/`)

3. **ViewportGridService**
   - 뷰포트 그리드 레이아웃이 어떻게 관리되는지
   - DisplaySet과 Viewport의 매핑 이해

#### STEP 3: 확장 시스템 마스터 (3-4일)
1. **ExtensionManager**
   - `extensions/ExtensionManager.ts` 상세히 읽기
   - `registerExtension()` 메서드 흐름 따라가기

2. **MODULE_TYPES**
   - 각 모듈 타입이 어떻게 사용되는지 확인
   - 실제 확장 예시 보기 (`extensions/cornerstone/src/index.tsx`)

3. **Mode 이해**
   - Mode가 Extension을 어떻게 조합하는지
   - `modes/basic/src/index.ts` 분석

#### STEP 4: 커스텀 훅 활용 (2-3일)
1. **useToolbar 분석**
   - `hooks/useToolbar.tsx` 라인 바이 라인 읽기
   - useState, useEffect, useCallback 사용법 학습

2. **useRunCommand 활용**
   - 실제 컴포넌트에서 명령 실행 패턴 익히기

3. **직접 훅 만들어보기**
   - 예: `useActiveDisplaySets()` 같은 간단한 훅 구현

#### STEP 5: 실전 프로젝트 (1주일)
1. **간단한 확장 만들기**
   - 새로운 툴바 버튼 추가
   - 커스텀 명령 등록
   - 패널 컴포넌트 추가

2. **서비스 커스터마이징**
   - 기존 서비스 이벤트에 구독
   - 커스텀 로직 추가

3. **디버깅 연습**
   - 브라우저 DevTools에서 서비스 인스턴스 탐색
   - 이벤트 흐름 추적

### 학습 완료 시 할 수 있는 것

#### 이해할 수 있게 되는 것:
1. **OHIF 아키텍처의 핵심 구조**
   - 확장 시스템이 어떻게 모듈식으로 동작하는지
   - 서비스 기반 상태 관리의 장단점
   - PubSub 패턴을 통한 느슨한 결합(loose coupling)

2. **React와 외부 상태의 통합 방식**
   - Context API로 의존성 주입
   - 클래스 인스턴스 상태 + React 이벤트 리스너 패턴
   - Custom Hook으로 재사용성 극대화

3. **대규모 의료 영상 뷰어의 설계 원칙**
   - 플러그인 아키텍처의 필요성
   - 모드를 통한 워크플로우 분리
   - 서비스를 통한 비즈니스 로직 중앙화

#### 할 수 있게 되는 것:
1. **OHIF 뷰어 커스터마이징**
   - 새로운 확장 프로그램 개발
   - 커스텀 모드 생성
   - 툴바, 패널, 뷰포트 추가

2. **서비스 확장**
   - 기존 서비스에 새 기능 추가
   - 커스텀 서비스 만들기
   - 이벤트 기반 워크플로우 구현

3. **통합 개발**
   - 외부 PACS 시스템 연동
   - 커스텀 데이터 소스 구현
   - AI 분석 결과 통합

### 추가 학습 자료

#### 공식 문서
- [OHIF Viewer 공식 문서](https://docs.ohif.org/)
- [Cornerstone3D 문서](https://www.cornerstonejs.org/)

#### 프로젝트 내 참고 코드
- `extensions/cornerstone/src/index.tsx` - 복잡한 확장 예시
- `modes/usmpr/src/index.tsx` - 커스텀 모드 구현
- `platform/app/src/App.tsx` - 전체 초기화 흐름

#### 디버깅 팁
```javascript
// 브라우저 콘솔에서 서비스 접근 (개발 모드)
window.ohif = {
  servicesManager,
  commandsManager,
  extensionManager
};

// DisplaySet 확인
window.ohif.servicesManager.services.displaySetService.getActiveDisplaySets();

// 명령 실행
window.ohif.commandsManager.runCommand('toggleCine');
```

---

## 정리

`platform/core/src`는 OHIF 뷰어의 **두뇌** 역할을 합니다. UI는 없지만, 모든 비즈니스 로직, 상태 관리, 확장 시스템, 서비스 인프라를 제공합니다.

**핵심 요약:**
- **서비스**: PubSub 기반 상태 관리 (Redux 대신 클래스 인스턴스)
- **확장**: 플러그인 아키텍처로 기능 추가 가능
- **명령**: 모든 액션을 명령 패턴으로 추상화
- **훅**: React와 서비스를 연결하는 다리
- **컨텍스트**: 의존성 주입 (Props Drilling 방지)

이 폴더를 이해하면 OHIF 뷰어의 **전체 동작 원리**를 파악할 수 있으며, 커스터마이징과 확장 개발이 가능해집니다.
