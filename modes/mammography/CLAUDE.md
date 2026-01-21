# modes/mammography - 유방촬영(Mammography) 전문 모드

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [핵심 책임](#1.1-핵심-책임)
   - 1.2. [화면 연결](#1.2-화면-연결)
   - 1.3. [OHIF 아키텍처에서의 위치](#1.3-ohif-아키텍처에서의-위치)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [핵심 파일 (중요도 순)](#2.1-핵심-파일-중요도-순)
   - 2.2. [유틸리티 파일](#2.2-유틸리티-파일)
   - 2.3. [패널/UI 파일](#2.3-패널ui-파일)
   - 2.4. [데이터 흐름 다이어그램 (텍스트)](#2.4-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅 - **이 모드에는 없음**](#3.3-커스텀-훅---이-모드에는-없음)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [(1) Mode (모드)](#4.1-1-mode-모드)
   - 4.2. [(2) Commands Module (커맨드 모듈)](#4.2-2-commands-module-커맨드-모듈)
   - 4.3. [(3) Tool Groups (도구 그룹)](#4.3-3-tool-groups-도구-그룹)
   - 4.4. [(4) Hanging Protocols (행잉 프로토콜)](#4.4-4-hanging-protocols-행잉-프로토콜)
   - 4.5. [(5) Evaluators (평가자)](#4.5-5-evaluators-평가자)
   - 4.6. [(6) Laterality Detection (좌우 유방 감지)](#4.6-6-laterality-detection-좌우-유방-감지)
   - 4.7. [관련 폴더 링크](#4.7-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [학습 후 할 수 있게 되는 것](#5.2-학습-후-할-수-있게-되는-것)
6. [부록: 주요 개념 요약](#6-부록-주요-개념-요약)
   - 6.1. [Mammography Mode의 핵심 차별점](#6.1-mammography-mode의-핵심-차별점)
   - 6.2. [주요 파일 의존성 맵](#6.2-주요-파일-의존성-맵)
   - 6.3. [디버깅 팁](#6.3-디버깅-팁)

---


## 1. 모듈 개요

### 1.1. 핵심 책임
이 모드는 **유방촬영(Mammography) 영상 판독에 특화된 워크플로우**를 제공합니다. 일반 의료 영상 뷰어와 달리, 유방촬영 영상의 고유한 특성을 고려한 다음과 같은 전문 기능들을 제공합니다:

- **가슴벽(Chest Wall) 기준 확대**: 커서 위치가 아닌 가슴벽 가장자리를 기준으로 확대
- **좌우 유방 자동 감지**: DICOM 메타데이터에서 laterality (L/R)를 자동 추출
- **뷰포트 동기화**: 확대/이동/대비 조정을 모든 뷰포트에 동시 적용
- **영상 스크롤 방식**: 마우스 휠로 이미지 전환 (확대/축소 아님)
- **이전 검사 비교 모드**: 과거 유방촬영 영상과 현재 영상 비교

### 1.2. 화면 연결
- **메인 뷰어**: `/mammography` 라우트 - 표준 유방촬영 판독 화면
- **비교 모드**: `/mammography-compare` - 과거 검사와 비교 (Compare 버튼 클릭 시)
- **툴바 버튼**: `MammoMagnify`, `SyncAllImages`, `MammoCompare` 등 유방촬영 전용 버튼

### 1.3. OHIF 아키텍처에서의 위치
이 모드는 OHIF의 **Extension 기반 아키텍처**를 활용하여 다음 확장을 조합합니다:
- `@ohif/extension-cornerstone` (렌더링)
- `@ohif/extension-default` (기본 UI, 데이터소스)
- `@ohif/extension-cornerstone-dicom-sr` (구조화 리포트)
- 기타 DICOM 관련 확장 (SEG, RT, PDF, Video 등)

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 핵심 파일 (중요도 순)

| 파일명 | 역할 | 크기/복잡도 |
|--------|------|------------|
| **index.tsx** | 모드 진입점, 라이프사이클 관리, 레이아웃 정의 | 497줄 (핵심) |
| **commandsModule.ts** | 유방촬영 전용 명령 정의 (확대, 동기화, 비교) | 896줄 (핵심) |
| **toolbarButtons.ts** | 툴바 버튼 설정 (MammoMagnify, SyncAll, Compare 등) | 743줄 |
| **initToolGroups.ts** | Tool Group 초기화 (mammography 전용 도구 세트) | 496줄 |
| **evaluatorsModule.ts** | 툴바 버튼 상태 평가 (활성/비활성 표시) | 69줄 |

### 2.2. 유틸리티 파일

| 파일명 | 역할 |
|--------|------|
| **utils/mammographyMidline.ts** | 좌우 유방 감지, 가슴벽 좌표 계산 (337줄) |
| **MammographyZoomTool.ts** | 커스텀 줌 도구 (가슴벽 고정 확대) (100줄) |

### 2.3. 패널/UI 파일

| 파일명 | 역할 |
|--------|------|
| **getPanelModule.tsx** | 스터디 목록 패널 제공 (비교 기능 포함) |
| **getToolbarModule.tsx** | 툴바 평가자 모듈 (중복, evaluatorsModule과 동일) |
| **panels/StudyListPanel.tsx** | 스터디 목록 UI 컴포넌트 |

### 2.4. 데이터 흐름 다이어그램 (텍스트)

```
┌─────────────────────────────────────────────────────────────┐
│  모드 진입 (onModeEnter)                                      │
│  - MAMMOGRAPHY 커맨드 컨텍스트 생성                            │
│  - 커맨드 등록 (mammoMagnify, toggleMammoSync, etc.)         │
│  - 툴바 평가자 등록 (버튼 상태 관리)                           │
│  - Tool Groups 초기화 (mammography 도구 세트)                 │
│  - initMammoMode 실행 (휠 스크롤 핸들러 설치)                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  사용자 인터랙션                                              │
│                                                              │
│  [마우스 휠]                  [MammoMagnify 버튼]             │
│       ↓                              ↓                       │
│  customWheelHandler          mammoMagnify 커맨드              │
│  - 이미지 전환                - getFixedMidlineAnchor()       │
│  - 시리즈 전환                - 좌우 유방 감지                 │
│                              - 가슴벽 기준 1.5배 확대         │
│                                                              │
│  [SyncAll 버튼]              [Compare 버튼]                   │
│       ↓                              ↓                       │
│  toggleMammoSync             openMammoCompare                │
│  - VOI 동기화                - mammography-compare로 이동     │
│  - 카메라 동기화 (줌/팬)                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  렌더링                                                       │
│  - CornerstoneViewportService (뷰포트 관리)                   │
│  - MammographyZoomTool (우클릭 드래그 줌)                     │
│  - 툴바 상태 갱신 (evaluators)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

이 모드는 **클래스 방식의 모드 인스턴스**와 **서비스 기반 상태 관리**를 혼합 사용합니다:

#### (1) 모드 인스턴스 상태 (modeInstance 객체)
```typescript
export const modeInstance = {
  id,
  routeName: 'mammography',
  hide: false,
  displayName: 'Mammography',
  _activatePanelTriggersSubscriptions: [],  // 패널 활성화 구독 저장
  toolbarSections,                          // 툴바 섹션 정의
  onModeEnter,                              // 진입 시 훅
  onModeExit,                               // 종료 시 훅
  // ...
};
```
- 모드 고유 상태를 `this` 객체에 저장 (예: `this._activatePanelTriggersSubscriptions`)
- React 컴포넌트가 아닌 **플레인 객체**로 관리

#### (2) 모듈 레벨 클로저 상태 (commandsModule.ts)
```typescript
// 모듈 최상단에 선언된 상태 변수들
let isSyncEnabled = false;                  // 동기화 활성화 여부
let cameraSyncUnsubscribes = [];            // 카메라 동기화 구독 해제 함수들
let customWheelUnsubscribes = [];           // 휠 이벤트 구독 해제 함수들
let previousCameras = new Map();            // 이전 카메라 상태 (팬/줌 감지용)
const magnificationState = new Map();       // 뷰포트별 확대 상태
let syncedScrollState = { ... };            // 동기화된 스크롤 상태
```
- **클로저를 활용한 private 상태** - 모듈 외부에서 직접 접근 불가
- 커맨드 함수들이 이 상태를 공유하여 사용

#### (3) OHIF Services (ServicesManager)
```typescript
const {
  viewportGridService,      // 뷰포트 그리드 상태
  syncGroupService,         // 동기화 그룹 관리
  cornerstoneViewportService,  // Cornerstone 뷰포트
  toolbarService,           // 툴바 상태
  displaySetService,        // 디스플레이 셋
} = servicesManager.services;
```
- OHIF 코어의 **PubSub 패턴 기반 서비스** 사용
- 각 서비스는 독립적인 상태를 가지며 이벤트로 통신

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드는 **컴포넌트를 직접 정의하지 않고**, 툴바 버튼을 **데이터 구조로 선언**합니다:

```typescript
// toolbarButtons.ts
const toolbarButtons: Button[] = [
  {
    id: 'MammoMagnify',
    uiType: 'ohif.toolButton',  // OHIF UI 라이브러리의 toolButton 타입
    props: {
      icon: 'tool-magnify',
      label: i18n.t('Buttons:Mammo Magnify'),
      tooltip: i18n.t('Buttons:Toggle magnification from chest wall'),
      commands: { commandName: 'mammoMagnify', context: 'MAMMOGRAPHY' },
      evaluate: 'evaluate.mammography.magnify',  // 상태 평가자
    },
  },
  // ...
];
```

**패턴 분석**:
- **선언적 UI 정의**: React 컴포넌트를 직접 작성하지 않고 **설정 객체**로 버튼 정의
- **OHIF UI 라이브러리 활용**: `uiType`에 따라 `platform/ui`의 컴포넌트 자동 매핑
- **평가자 패턴**: `evaluate` 속성으로 버튼의 활성/비활성 상태를 동적으로 결정
- **커맨드 패턴**: `commands` 속성으로 버튼 클릭 시 실행할 커맨드 지정

### 3.3. 커스텀 훅 - **이 모드에는 없음**

이 모드는 **React 훅을 사용하지 않습니다**. 대신:
- **라이프사이클 함수** (`onModeEnter`, `onModeExit`)로 초기화/정리
- **이벤트 리스너**로 뷰포트 상태 변화 감지
- **모듈 레벨 상태**로 전역 상태 관리

---

## 4. OHIF 특유 개념 정리

### 4.1. (1) Mode (모드)
**정의**: 확장들을 조합하여 특정 워크플로우를 구성한 뷰어 설정
- **구성 요소**:
  - `routes`: URL 라우팅 정의
  - `extensions`: 필요한 확장 목록
  - `hangingProtocol`: 뷰포트 레이아웃 규칙
  - `toolbarButtons`: 툴바 버튼 설정
  - `onModeEnter/onModeExit`: 라이프사이클 훅

**이 모드의 예시**:
```typescript
export const modeInstance = {
  id: '@ohif/mode-mammography',
  routeName: 'mammography',
  displayName: 'Mammography',
  routes: [mammographyRoute],           // '/mammography' 라우트
  extensions: extensionDependencies,    // 필요한 확장 목록
  hangingProtocol: '@ohif/hpMammo',     // 유방촬영 전용 hanging protocol
  toolbarButtons,                       // 툴바 버튼 설정
  modeModalities: ['MG'],               // 이 모드가 지원하는 modality
  isValidMode,                          // 모드 적용 가능 여부 판단 함수
  onModeEnter,                          // 모드 진입 시 실행
  onModeExit,                           // 모드 종료 시 실행
};
```

### 4.2. (2) Commands Module (커맨드 모듈)
**정의**: 사용자 액션을 처리하는 함수들을 등록하는 모듈
- **역할**: 버튼 클릭, 단축키 등의 액션을 실제 로직과 연결
- **구조**:
  ```typescript
  const commandsModule = ({ servicesManager, commandsManager }) => {
    const actions = {
      mammoMagnify: () => { /* 확대 로직 */ },
      toggleMammoSync: () => { /* 동기화 토글 */ },
      // ...
    };

    const definitions = {
      mammoMagnify: {
        commandFn: actions.mammoMagnify,
        storeContexts: [],
        options: {},
      },
      // ...
    };

    return { actions, definitions };
  };
  ```

**이 모드의 주요 커맨드**:
- `mammoMagnify`: 가슴벽 기준 1.5배 확대/축소
- `toggleMammoSync`: 모든 뷰포트 동기화 ON/OFF
- `openMammoCompare`: 비교 모드로 전환
- `initMammoMode`: 휠 스크롤 핸들러 설치
- `isMammoMagnified`, `isMammoSyncEnabled`: 상태 쿼리 커맨드

### 4.3. (3) Tool Groups (도구 그룹)
**정의**: 특정 뷰포트에 적용할 도구들의 묶음
- **도구 상태**: `active` (활성), `passive` (대기), `enabled` (활성화), `disabled` (비활성화)
- **바인딩**: 마우스 버튼, 터치 포인트 등에 도구 매핑

**이 모드의 Tool Groups** (initToolGroups.ts):
```typescript
function initMammographyToolGroup(extensionManager, toolGroupService, commandsManager) {
  addTool(MammographyZoomTool);  // 커스텀 줌 도구 등록

  const tools = {
    active: [
      { toolName: 'WindowLevel', bindings: [{ mouseButton: Primary }] },    // 좌클릭
      { toolName: 'Pan', bindings: [{ mouseButton: Auxiliary }] },          // 휠클릭
      { toolName: 'MammographyZoom', bindings: [{ mouseButton: Secondary }] }, // 우클릭
      { toolName: 'StackScroll', bindings: [{ mouseButton: Wheel }] },      // 휠
    ],
    passive: [/* 측정 도구들 */],
    enabled: [/* 오버레이 도구들 */],
  };

  toolGroupService.createToolGroupAndAddTools('mammography', tools);
}
```

### 4.4. (4) Hanging Protocols (행잉 프로토콜)
**정의**: 스터디/시리즈를 어떻게 배치할지 정의하는 규칙
- **역할**:
  - 뷰포트 레이아웃 결정 (1x1, 2x2 등)
  - 어떤 시리즈를 어느 뷰포트에 표시할지 매칭
  - 초기 카메라 설정 (displayArea, zoom 등)

**이 모드의 Hanging Protocol**:
```typescript
hangingProtocol: '@ohif/hpMammo',  // extensions/default/src/hangingprotocols/hpMammo.ts
```
- 유방촬영 영상의 표준 레이아웃 제공
- 좌우 유방을 자동으로 적절한 뷰포트에 배치

### 4.5. (5) Evaluators (평가자)
**정의**: 툴바 버튼의 상태(활성/비활성, disabled 등)를 동적으로 판단하는 함수
- **역할**: UI 상태 갱신 (버튼 하이라이트, 비활성화 등)

**이 모드의 Evaluators** (evaluatorsModule.ts):
```typescript
{
  name: 'evaluate.mammography.magnify',
  evaluate: ({ viewportId, button }) => {
    const isMagnified = commandsManager.runCommand('isMammoMagnified', {}, 'MAMMOGRAPHY');
    return {
      disabled: false,
      className: isMagnified ? 'active' : '',  // 확대 중이면 버튼 하이라이트
      isActive: isMagnified,
    };
  },
}
```

### 4.6. (6) Laterality Detection (좌우 유방 감지)
**OHIF의 유방촬영 특화 개념**: DICOM 메타데이터에서 좌우 유방을 자동 감지

**감지 우선순위** (mammographyMidline.ts):
1. `ViewPosition` 태그 (0018,5101) - 유방촬영 표준 태그
2. `ProtocolName` 태그 (0018,1030) - "RCC", "LMLO" 등 문자열 파싱
3. `ImageLaterality`, `FrameLaterality` - 표준 laterality 태그
4. `SeriesDescription`, `StudyDescription` - 설명 필드 파싱

**활용**:
- **가슴벽 앵커 결정**: Right → 우측 가장자리, Left → 좌측 가장자리
- **확대 방향 설정**: 가슴벽을 고정한 채 확대
- **뷰포트 정렬**: Hanging Protocol에서 좌우 배치 자동화

### 4.7. 관련 폴더 링크
- **Extensions**:
  - `extensions/default/` - 기본 확장 (데이터소스, hanging protocols)
  - `extensions/cornerstone/` - Cornerstone3D 렌더링 확장
  - `extensions/cornerstone-dicom-sr/` - DICOM SR 확장
- **Modes**:
  - `modes/basic/` - 기본 모드 (이 모드의 베이스)
  - `modes/longitudinal/` - 측정 추적 모드
- **Platform**:
  - `platform/core/src/services/` - ServicesManager, 각종 서비스
  - `platform/ui/src/` - UI 컴포넌트 라이브러리
  - `platform/app/src/` - 메인 앱 진입점

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 단계 1: 모드 기본 구조 이해 (1-2시간)
**읽을 파일**: `index.tsx`
- **학습 목표**:
  - 모드가 무엇인지 이해 (routes, extensions, hanging protocol의 조합)
  - `onModeEnter`, `onModeExit` 라이프사이클 훅의 역할
  - `toolbarSections`로 툴바 레이아웃 정의하는 방법

**핵심 코드**:
```typescript
export const modeInstance = {
  id,
  routeName: 'mammography',
  routes: [mammographyRoute],           // URL 라우팅
  extensions: extensionDependencies,    // 필요한 확장 목록
  hangingProtocol: '@ohif/hpMammo',     // 레이아웃 규칙
  toolbarButtons,                       // 툴바 버튼 설정
  onModeEnter,                          // 모드 진입 시
  onModeExit,                           // 모드 종료 시
};
```

**실습**:
1. `onModeEnter`에서 `console.log('Mode activated!')` 추가
2. `toolbarSections`에서 버튼 순서 바꿔보기
3. `modeModalities`를 `['CT']`로 변경하여 CT 영상에서 모드 활성화 테스트

---

#### 단계 2: 툴바 버튼 시스템 (2-3시간)
**읽을 파일**: `toolbarButtons.ts`, `evaluatorsModule.ts`
- **학습 목표**:
  - 선언적 버튼 정의 방식 이해
  - `commands` → `evaluate` → UI 갱신 흐름 파악
  - i18n을 활용한 다국어 지원

**핵심 패턴**:
```typescript
// 1. 버튼 정의 (toolbarButtons.ts)
{
  id: 'MammoMagnify',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'tool-magnify',
    label: i18n.t('Buttons:Mammo Magnify'),
    commands: { commandName: 'mammoMagnify', context: 'MAMMOGRAPHY' },
    evaluate: 'evaluate.mammography.magnify',  // ← 평가자 연결
  },
}

// 2. 평가자 정의 (evaluatorsModule.ts)
{
  name: 'evaluate.mammography.magnify',
  evaluate: ({ viewportId }) => {
    const isMagnified = commandsManager.runCommand('isMammoMagnified');
    return {
      className: isMagnified ? 'active' : '',  // ← 버튼 하이라이트
      isActive: isMagnified,
    };
  },
}
```

**실습**:
1. 새로운 버튼 추가 (예: `MyCustomButton`)
2. 해당 버튼의 평가자 작성
3. 클릭 시 `console.log` 출력하는 커맨드 연결

---

#### 단계 3: 커맨드 모듈 분석 (3-4시간)
**읽을 파일**: `commandsModule.ts` (896줄이지만 천천히!)
- **학습 목표**:
  - 모듈 레벨 클로저 상태 관리 이해
  - OHIF Services 활용법 (viewportGridService, cornerstoneViewportService 등)
  - 이벤트 리스너 등록/해제 패턴

**핵심 커맨드 분석**:

1. **mammoMagnify** (가장 중요):
   - 동기화 ON/OFF에 따라 다른 로직
   - `getFixedMidlineAnchor()`로 가슴벽 좌표 가져오기
   - 카메라의 `parallelScale`, `focalPoint` 조작

2. **toggleMammoSync**:
   - `cameraSyncUnsubscribes` 배열로 구독 관리
   - CAMERA_MODIFIED 이벤트 리스너 등록
   - 줌/팬 변화 감지 후 다른 뷰포트에 적용

3. **initMammoMode**:
   - 뷰포트 준비 상태 체크 (retry 로직)
   - 휠 이벤트 리스너 설치
   - 단일 시리즈 vs 다중 시리즈 모드 감지

**실습**:
1. `mammoMagnify`에서 `zoomFactor`를 1.5에서 2.0으로 변경
2. `toggleMammoSync`의 `isSyncEnabled` 값을 로그 출력
3. 새로운 커맨드 추가 (예: 모든 뷰포트 리셋)

---

#### 단계 4: 유방촬영 특화 로직 (2-3시간)
**읽을 파일**: `utils/mammographyMidline.ts`, `MammographyZoomTool.ts`
- **학습 목표**:
  - DICOM 메타데이터에서 laterality 추출 방법
  - 가슴벽 앵커 좌표 계산 (imageBounds 활용)
  - 커스텀 Cornerstone Tool 작성법

**핵심 개념**:
```typescript
// 1. Laterality 감지
const laterality = extractLateralityFromInstance(instance);
// → ViewPosition 태그 → ProtocolName → ImageLaterality 순으로 체크

// 2. 가슴벽 앵커 (FIXED world coordinate)
const imageBounds = viewport.getImageData()?.getBounds();  // [minX, maxX, minY, maxY, minZ, maxZ]
const anchorX = laterality === 'R' ? imageBounds[1] : imageBounds[0];  // Right: maxX, Left: minX

// 3. 줌 시 가슴벽 고정
const shift = (anchorWorld - focalPoint) * (1 - zoomRatio);
newFocalPoint = focalPoint + shift;
```

**실습**:
1. 가슴벽 앵커 좌표를 화면에 시각화 (canvas에 점 그리기)
2. `zoomFactor`를 3.0으로 높여서 과도한 확대 테스트
3. laterality 감지 실패 시 경고 메시지 추가

---

#### 단계 5: Tool Groups와 라이프사이클 (2시간)
**읽을 파일**: `initToolGroups.ts`, `index.tsx`의 `onModeEnter/onModeExit`
- **학습 목표**:
  - Tool Group 생성/파괴 방법
  - 마우스 바인딩 설정
  - 모드 전환 시 리소스 정리

**핵심 패턴**:
```typescript
// 1. Tool Group 생성
const tools = {
  active: [
    { toolName: 'WindowLevel', bindings: [{ mouseButton: Primary }] },
    { toolName: 'MammographyZoom', bindings: [{ mouseButton: Secondary }] },
  ],
  passive: [{ toolName: 'Length' }],
};
toolGroupService.createToolGroupAndAddTools('mammography', tools);

// 2. 모드 종료 시 정리
export function onModeExit({ servicesManager }) {
  toolGroupService.destroy();
  syncGroupService.destroy();
  segmentationService.destroy();
  cornerstoneViewportService.destroy();
}
```

**실습**:
1. 새로운 도구를 `passive`에 추가
2. `onModeExit`에서 정리 로그 출력
3. Tool Group을 파괴하지 않고 모드 전환 시 에러 확인

---

### 5.2. 학습 후 할 수 있게 되는 것

이 모드를 다 이해하면 다음을 할 수 있습니다:

1. **OHIF 모드 커스터마이징**:
   - 새로운 전문 모드 생성 (예: 정형외과 모드, 병리학 모드)
   - 기존 모드의 툴바/레이아웃 수정
   - 모달리티별 특화 기능 추가

2. **커스텀 커맨드 작성**:
   - 복잡한 뷰포트 조작 로직 구현
   - 다중 뷰포트 동기화 로직
   - 사용자 정의 측정/주석 도구

3. **Cornerstone3D 고급 활용**:
   - 카메라 조작 (parallelScale, focalPoint, position)
   - 커스텀 Tool 작성 (ZoomTool, PanTool 등 확장)
   - 이벤트 리스너 기반 인터랙션 구현

4. **DICOM 메타데이터 활용**:
   - 태그에서 정보 추출 (laterality, view position 등)
   - 메타데이터 기반 자동화 (레이아웃, 처리 등)
   - 커스텀 DICOM 태그 지원

5. **실전 프로젝트**:
   - 병원 맞춤형 워크플로우 구현
   - 특수 영상 장비 통합 (초음파, 내시경 등)
   - AI 분석 결과 오버레이 표시

---

## 6. 부록: 주요 개념 요약

### 6.1. Mammography Mode의 핵심 차별점

| 일반 모드 | Mammography 모드 |
|----------|------------------|
| 커서 기준 확대 | **가슴벽 기준 확대** |
| 휠로 확대/축소 | **휠로 이미지 전환** |
| 뷰포트 독립 조작 | **동기화 옵션** (줌/팬/대비) |
| 기본 레이아웃 | **유방촬영 전용 레이아웃** |
| - | **좌우 유방 자동 감지** |

### 6.2. 주요 파일 의존성 맵

```
index.tsx (모드 진입점)
  ├─ commandsModule.ts (커맨드 정의)
  │   ├─ utils/mammographyMidline.ts (좌우 유방 감지, 가슴벽 좌표)
  │   └─ Services (viewportGridService, cornerstoneViewportService 등)
  ├─ toolbarButtons.ts (버튼 정의)
  ├─ evaluatorsModule.ts (버튼 상태 평가)
  ├─ initToolGroups.ts (도구 그룹 초기화)
  │   └─ MammographyZoomTool.ts (커스텀 줌 도구)
  └─ getPanelModule.tsx (패널 정의)
      └─ panels/StudyListPanel.tsx (스터디 목록 UI)
```

### 6.3. 디버깅 팁

1. **브라우저 콘솔 활용**:
   - `isSyncEnabled`, `magnificationState` 등 모듈 변수는 직접 접근 불가
   - `console.log`를 커맨드 함수 내에 추가하여 추적

2. **툴바 버튼 상태 확인**:
   - `toolbarService.refreshToolbarState({ viewportId })`로 강제 갱신
   - 평가자의 반환값을 콘솔에 출력

3. **카메라 상태 확인**:
   ```javascript
   const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
   const camera = viewport.getCamera();
   console.log('Camera:', camera);
   ```

4. **Laterality 감지 실패 시**:
   - `mammographyMidline.ts`의 감지 로직에 `console.log` 추가
   - DICOM 태그 뷰어로 메타데이터 확인 (TagBrowser 버튼 사용)

---

**마지막 업데이트**: 2026-01-01
**작성자**: Claude Code (ohif-modes-analyst)
**버전**: OHIF Viewer v3.12.0-beta.86 기준
