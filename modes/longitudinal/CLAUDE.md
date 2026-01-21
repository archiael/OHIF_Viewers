# modes/longitudinal/src 분석

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
   - 4.1. [Mode Composition (모드 조합)](#41-mode-composition-모드-조합)
   - 4.2. [Tracked vs Untracked Measurements](#42-tracked-vs-untracked-measurements)
   - 4.3. [DICOM SR (Structured Report)](#43-dicom-sr-structured-report)
   - 4.4. [Viewport Module Namespace](#44-viewport-module-namespace)
   - 4.5. [Panel Service와 Auto-Activation](#45-panel-service와-auto-activation)
   - 4.6. [관련 폴더 링크](#46-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#51-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#52-이-폴더를-다-이해하면-할-수-있게-되는-것)

## 1. 모듈 개요

`modes/longitudinal`는 **측정값 추적(Measurement Tracking) 워크플로우 모드**로, OHIF의 `basic` 모드를 확장하여 임상 측정값을 추적하고 DICOM SR(Structured Report)로 저장/불러오기 기능을 제공하는 전문화된 모드입니다.

### 전체 OHIF 앱에서의 역할
- **임상 측정 워크플로우**: 종단 연구(longitudinal study)에서 환자의 병변을 시간에 따라 추적
- **모드 상속 패턴**: `basic` 모드를 확장하여 측정 추적 기능만 추가하는 **경량 래퍼(wrapper) 모드**
- **DICOM SR 통합**: 측정값을 DICOM Structured Report로 내보내고 다시 불러올 수 있음

### 연결되는 화면/기능
- **Study Viewer with Measurement Tracking**:
  - 왼쪽 패널: 시리즈 썸네일 (측정 추적 상태 아이콘 표시)
  - 오른쪽 패널: **Tracked Measurements 패널** (측정값 목록 + 내보내기)
  - 중앙: Tracked viewport (측정값이 강조 표시됨)

- **측정 상태 표시**:
  - Tracked (추적됨): 실선, 측정 패널에 표시, SR 내보내기 가능
  - Untracked (미추적): 점선, 임시 측정, 내보내기 불가
  - SR Loaded: DICOM SR에서 불러온 측정값
  - Locked SR: 이미 추적 중인 시리즈에 SR 로드 시 읽기 전용

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1 파일 목록

| 파일명 | 역할 | 코드 라인 수 |
|--------|------|--------------|
| `index.ts` | 모드 정의 (basic 모드 확장) | 77줄 |
| `id.js` | 모드 ID 정의 (`@ohif/mode-longitudinal`) | 6줄 |

**주의**: 이 모드는 **설정만** 담당하며, 실제 UI와 로직은 다음에서 가져옴:
- `@ohif/mode-basic`: 기본 뷰어 구조, 툴바, 툴 그룹
- `@ohif/extension-measurement-tracking`: 측정 추적 패널, 뷰포트, 서비스

### 2.2 컴포넌트 간 관계 및 데이터 흐름

```
┌────────────────────────────────────────────────────────────┐
│              modes/longitudinal/src/index.ts               │
│  (Wrapper Mode - basic 모드 + measurement tracking)       │
└─────────────┬────────────────┬─────────────────────────────┘
              │                │
              ▼                ▼
    ┌─────────────────────────────────────────────┐
    │   @ohif/mode-basic (기본 모드)              │
    │   - toolbarButtons (709개 버튼)             │
    │   - initToolGroups (5개 툴 그룹)            │
    │   - basicLayout (기본 레이아웃)             │
    │   - basicRoute (라우팅)                     │
    └──────────────────┬──────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────────────┐
    │  longitudinalInstance (확장된 레이아웃)              │
    │  - leftPanels: [tracked.thumbnailList]               │
    │    → @ohif/extension-measurement-tracking.           │
    │      panelModule.seriesList                          │
    │                                                      │
    │  - rightPanels: [                                    │
    │      cornerstone.segmentation,                       │
    │      tracked.measurements ← 핵심!                    │
    │    ]                                                 │
    │    → @ohif/extension-measurement-tracking.           │
    │      panelModule.trackedMeasurements                 │
    │                                                      │
    │  - viewports: [                                      │
    │      tracked.viewport,  ← 측정 추적 뷰포트          │
    │      ...basicLayout.props.viewports                  │
    │    ]                                                 │
    │    → @ohif/extension-measurement-tracking.           │
    │      viewportModule.cornerstone-tracked              │
    └──────────────────────────────────────────────────────┘
```

**데이터 흐름 (측정 추적 워크플로우)**:
```
1. User가 Length 도구로 측정
   ↓
2. measurementService.EVENTS.MEASUREMENT_ADDED 발생
   ↓
3. Tracking Prompt 표시: "Track measurements for this series?"
   ↓
4. User가 "Track" 클릭
   ↓
5. measurementService에 tracked=true로 저장
   ↓
6. trackedMeasurements 패널 자동 활성화 (panelService)
   ↓
7. Viewport에 측정값 실선으로 표시 (tracked viewport)
   ↓
8. 우측 패널에 측정값 목록 업데이트
```

**DICOM SR 내보내기 흐름**:
```
User가 "Create Report" 버튼 클릭
  ↓
commandsManager.runCommand('exportTrackedMeasurements')
  ↓
measurementService.getMeasurements({ tracked: true })
  ↓
DICOM SR 생성 (TID 1500 템플릿)
  ↓
PACS로 전송 또는 다운로드
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1 상태 관리 방식

이 모드는 **설정 레이어**이므로 직접적인 상태 관리 코드가 없습니다. 대신 다음을 조율합니다:

#### (1) 모드 구성 객체 (Configuration Object)
```typescript
// index.ts
export const longitudinalInstance = {
  ...basicLayout,  // 기본 레이아웃 상속
  id: ohif.layout,
  props: {
    ...basicLayout.props,  // 기본 props 상속
    leftPanels: [tracked.thumbnailList],  // 측정 상태를 보여주는 썸네일
    rightPanels: [
      cornerstone.segmentation,
      tracked.measurements  // 추적된 측정값 패널
    ],
    viewports: [
      {
        namespace: tracked.viewport,  // 측정 추적 전용 뷰포트
        displaySetsToDisplay: basicLayout.props.viewports[0].displaySetsToDisplay
      },
      ...basicLayout.props.viewports  // 기본 뷰포트들도 사용 가능
    ]
  }
};
```

**이 구성의 의미**:
- `tracked.thumbnailList`: 썸네일에 측정 상태 아이콘 표시 (tracked/untracked/SR/locked)
- `tracked.measurements`: 우측에 측정값 목록 패널
- `tracked.viewport`: 측정값이 강조 표시되는 뷰포트

#### (2) Extension 의존성 추가
```typescript
export const extensionDependencies = {
  ...basicDependencies,  // basic 모드의 모든 확장
  '@ohif/extension-measurement-tracking': '^3.0.0'  // 측정 추적 확장 추가
};
```

#### (3) 실제 상태 관리는 Extension에서
```typescript
// @ohif/extension-measurement-tracking/src/services/
// - TrackedMeasurementService
//   - _trackedMeasurements: Map<seriesUID, measurements>
//   - _promptBeginTracking(): 추적 시작 프롬프트
//   - _isValidTrackedMeasurement(): 측정값 유효성 검사
```

### 3.2 재사용 가능한 UI 컴포넌트 패턴

**모드 확장 패턴 (Mode Extension Pattern)**:

```typescript
// 기존 모드를 확장하여 새로운 모드 만들기
export const modeInstance = {
  ...basicModeInstance,  // basic 모드의 모든 설정 상속
  id,                    // 새로운 ID로 덮어쓰기
  routes: [
    longitudinalRoute  // 새로운 라우트
  ],
  extensions: extensionDependencies  // 확장된 의존성
};
```

**이 패턴의 장점**:
- 코드 중복 제거 (DRY 원칙)
- Basic 모드의 모든 기능 상속 (툴바, 툴 그룹, 렌더링)
- 필요한 부분만 오버라이드 (패널, 뷰포트)

**Panel Module 재사용**:
```typescript
export const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked'
};

// 이 문자열들은 ExtensionManager가 런타임에 실제 컴포넌트로 해석
```

### 3.3 커스텀 훅

이 모드 자체에는 **커스텀 훅이 없습니다**.

실제 훅은 `@ohif/extension-measurement-tracking`에 있습니다:

```typescript
// extensions/measurement-tracking/src/contexts/TrackedMeasurementsContext.tsx
export function useTrackedMeasurements() {
  const context = useContext(TrackedMeasurementsContext);
  return {
    trackedMeasurements: context.trackedMeasurements,
    trackedSeries: context.trackedSeries,
    isTrackedSeries: (seriesUID) => context.trackedSeries.has(seriesUID)
  };
}
```

**사용 예시** (measurement-tracking extension 내부):
```typescript
// panels/TrackedMeasurementsPanel.tsx
function TrackedMeasurementsPanel() {
  const { trackedMeasurements, isTrackedSeries } = useTrackedMeasurements();

  return (
    <div>
      {trackedMeasurements.map(m => (
        <MeasurementItem key={m.uid} measurement={m} />
      ))}
    </div>
  );
}
```

---

## 4. OHIF 특유 개념 정리

### 4.1 Mode Composition (모드 조합)
- **정의**: 기존 모드를 확장하여 새로운 모드를 만드는 패턴
- **Longitudinal 예시**:
  ```typescript
  import { basicMode, basicLayout, basicRoute } from '@ohif/mode-basic';

  // Basic 모드 + Measurement Tracking 확장 = Longitudinal 모드
  const longitudinalMode = {
    ...basicMode,
    id: '@ohif/mode-longitudinal',
    extensions: {
      ...basicMode.extensions,
      '@ohif/extension-measurement-tracking': '^3.0.0'
    }
  };
  ```

### 4.2 Tracked vs Untracked Measurements
| 상태 | 스타일 | 패널 표시 | SR 내보내기 | 사용 사례 |
|------|--------|----------|-------------|-----------|
| **Tracked** | 실선 (solid) | ✅ 표시됨 | ✅ 가능 | 임상 보고서용 측정 |
| **Untracked** | 점선 (dashed) | ❌ 숨김 | ❌ 불가 | 임시 측정, 참고용 |

**Tracking Prompt Workflow**:
```
User가 측정 도구로 annotation 생성
  ↓
측정값이 measurementService에 추가됨
  ↓
Prompt: "Track measurements for this series?"
  ├─ Yes → tracked: true, 패널에 표시, SR 내보내기 가능
  └─ No → tracked: false, 임시 측정, 나중에 삭제됨
```

### 4.3 DICOM SR (Structured Report)
- **TID 1500**: Measurement Report 템플릿 (DICOM 표준)
- **내보내기**: 추적된 측정값 → DICOM SR 파일 생성 → PACS 전송
- **불러오기**: DICOM SR 파일 → 측정값 복원 → Viewport에 렌더링

**SR 상태 아이콘**:
- 🟢 Green: Tracked series (측정 추적 중)
- 🔵 Blue: Untracked series (임시 측정)
- 📄 SR Icon: DICOM SR 로드됨
- 🔒 Lock Icon: Locked SR (읽기 전용)

### 4.4 Viewport Module Namespace
```typescript
{
  namespace: tracked.viewport,
  // = '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked'
}
```

**Tracked Viewport의 특징**:
- 측정값이 강조 표시 (highlight)
- Tracked 측정값만 상호작용 가능
- Untracked는 점선으로만 표시

### 4.5 Panel Service와 Auto-Activation
```typescript
// basic mode에서 설정 (modes/basic/src/index.tsx)
panelService.addActivatePanelTriggers(
  cornerstone.measurements,  // 활성화할 패널
  [{
    sourcePubSubService: measurementService,
    sourceEvents: [
      measurementService.EVENTS.MEASUREMENT_ADDED,
      measurementService.EVENTS.RAW_MEASUREMENT_ADDED
    ]
  }]
);
```

**의미**: 측정값이 추가되면 자동으로 측정 패널이 열림

### 4.6 관련 폴더 링크

```
modes/longitudinal/src/
├── index.ts              → 모드 정의 (basic 확장)
└── id.js                 → 모드 ID
    ↓ (상속)
modes/basic/src/
├── index.tsx             → 기본 뷰어 모드
├── toolbarButtons.ts     → 툴바 버튼 (모두 재사용)
└── initToolGroups.ts     → 툴 그룹 (모두 재사용)
    ↓ (추가 확장)
extensions/measurement-tracking/src/
├── panels/
│   ├── TrackedMeasurementsPanel.tsx   → 측정값 목록 패널
│   └── SeriesListWithTracking.tsx     → 측정 상태 아이콘 썸네일
├── viewports/
│   └── TrackedCornerstoneViewport.tsx → 측정 추적 뷰포트
├── services/
│   └── TrackedMeasurementService.ts   → 추적 상태 관리
└── contexts/
    └── TrackedMeasurementsContext.tsx → React Context
    ↓ (사용하는 서비스)
platform/core/src/services/
├── MeasurementService     → 측정값 저장
├── PanelService           → 패널 자동 활성화
└── CommandsManager        → exportTrackedMeasurements 명령
```

---

## 5. 초보 개발자용 학습 가이드

### 5.1 추천 학습 순서

#### Step 1: Basic 모드 먼저 이해하기
**전제 조건**: `modes/basic/CLAUDE.md`를 먼저 읽어야 합니다.

이 모드는 basic 모드의 **99%를 재사용**하므로, basic 모드를 이해하지 않으면 longitudinal을 이해할 수 없습니다.

#### Step 2: Longitudinal 모드의 차이점 파악
**목표**: Basic과 비교하여 무엇이 추가되었는지 이해

1. `index.ts` 파일 열기
2. `import` 구문 분석:
   ```typescript
   // Basic 모드에서 가져온 것들
   import {
     toolbarButtons,        // 그대로 재사용
     initToolGroups,        // 그대로 재사용
     basicLayout,           // 이걸 확장할 것
     basicRoute,            // 이걸 수정할 것
     // ...
   } from '@ohif/mode-basic';
   ```

3. 추가된 부분 확인:
   ```typescript
   export const tracked = {
     measurements: '...',  // 새로 추가된 패널
     thumbnailList: '...', // 측정 상태 아이콘 추가된 썸네일
     viewport: '...'       // 측정 추적 뷰포트
   };
   ```

4. 레이아웃 차이 비교:
   ```typescript
   // BEFORE (basic)
   leftPanels: [ohif.thumbnailList]

   // AFTER (longitudinal)
   leftPanels: [tracked.thumbnailList]
   //             ↑ 측정 상태 아이콘이 추가된 버전

   // BEFORE (basic)
   rightPanels: [cornerstone.segmentation, cornerstone.measurements]

   // AFTER (longitudinal)
   rightPanels: [cornerstone.segmentation, tracked.measurements]
   //                                       ↑ 추적된 측정값만 표시
   ```

#### Step 3: Measurement Tracking Extension 탐색
**목표**: 실제 측정 추적 로직이 어디 있는지 파악

1. `extensions/measurement-tracking/src/index.tsx` 읽기
2. `getPanelModule()` 확인:
   ```typescript
   getPanelModule() {
     return {
       trackedMeasurements: TrackedMeasurementsPanel,
       seriesList: SeriesListWithTracking
     };
   }
   ```

3. `getViewportModule()` 확인:
   ```typescript
   getViewportModule() {
     return {
       'cornerstone-tracked': TrackedCornerstoneViewport
     };
   }
   ```

4. 주요 컴포넌트 탐색:
   - `panels/TrackedMeasurementsPanel.tsx`: 측정값 목록 UI
   - `viewports/TrackedCornerstoneViewport.tsx`: 측정 강조 뷰포트
   - `contexts/TrackedMeasurementsContext.tsx`: 측정 상태 Context

#### Step 4: 측정 추적 워크플로우 따라가기
**실습**: 실제 뷰어에서 측정 추적 과정 체험

1. OHIF 뷰어를 Longitudinal 모드로 실행
   ```
   URL: http://localhost:3000/viewer?StudyInstanceUIDs=...&mode=@ohif/mode-longitudinal
   ```

2. Length 도구로 측정 생성 → Tracking Prompt 확인
3. "Track" 클릭 → 우측 패널 자동 열림 확인
4. 다른 시리즈에서 측정 → 썸네일 아이콘 변화 관찰
5. "Create Report" 버튼 → DICOM SR 생성 확인

#### Step 5: 커스터마이징 실습
**실습**: 이 모드를 복사하여 자신만의 tracking 모드 만들기

1. `modes/my-tracking/` 폴더 생성
2. `index.ts` 복사 및 수정:
   ```typescript
   export const myTrackingInstance = {
     ...longitudinalInstance,
     props: {
       ...longitudinalInstance.props,
       // 커스터마이징: 왼쪽 패널 숨기기
       leftPanelResizable: false,
       // 우측 패널 기본 열림
       rightPanelClosed: false
     }
   };
   ```

3. `package.json` 수정:
   ```json
   {
     "name": "@ohif/mode-my-tracking",
     "peerDependencies": {
       "@ohif/mode-longitudinal": "^3.12.0"
     }
   }
   ```

### 5.2 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **모드 조합 패턴 마스터**: 기존 모드를 확장하여 새로운 모드를 만드는 방법 습득
2. **측정 추적 워크플로우 이해**: OHIF의 측정 추적 시스템 완전 파악
3. **DICOM SR 통합 이해**: 측정값을 표준 DICOM 형식으로 저장/불러오기
4. **Extension 조합 전략**: 여러 확장을 조합하여 특화된 워크플로우 구성
5. **경량 모드 개발**: 무거운 코드 작성 없이 설정만으로 새로운 모드 제작

**실무 활용**:
- 임상 워크플로우 모드 개발 (예: 종양 추적, 심장 측정)
- 기존 모드에 새로운 패널 추가
- 측정 추적 UI 커스터마이징

---

## 부록: 주요 설정 및 패턴

### Mode Extension vs Mode Forking

**❌ 나쁜 방식 (Forking)**:
```typescript
// basic 모드 전체 복사 → 유지보수 어려움
const myMode = {
  // ... 709줄의 toolbarButtons 복사
  // ... 578줄의 initToolGroups 복사
  // ... 388줄의 mode 로직 복사
};
```

**✅ 좋은 방식 (Extension)**:
```typescript
// basic 모드 재사용 → 77줄로 완성
import { basicMode, basicLayout } from '@ohif/mode-basic';

const myMode = {
  ...basicMode,
  props: {
    ...basicLayout.props,
    // 필요한 부분만 오버라이드
  }
};
```

### Layout Props 오버라이드 패턴

```typescript
export const longitudinalInstance = {
  ...basicLayout,        // 모든 기본 설정 상속
  id: ohif.layout,
  props: {
    ...basicLayout.props,  // 기본 props 상속

    // 특정 props만 오버라이드
    leftPanels: [tracked.thumbnailList],  // 변경
    rightPanels: [
      cornerstone.segmentation,  // 유지
      tracked.measurements       // 변경
    ],

    // viewports는 배열 맨 앞에 삽입
    viewports: [
      { namespace: tracked.viewport },  // 추가
      ...basicLayout.props.viewports    // 기존 것들 유지
    ]
  }
};
```

### Route Configuration

```typescript
export const longitudinalRoute = {
  ...basicRoute,             // basic 라우트 상속
  path: 'longitudinal',      // URL 경로 변경
  layoutInstance: longitudinalInstance  // 레이아웃만 교체
};
```

**결과 URL**:
```
http://localhost:3000/viewer/longitudinal?StudyInstanceUIDs=...
```

---

## 관련 문서
- `modes/basic/CLAUDE.md`: Basic 모드 분석 (필수 선행 학습)
- `extensions/measurement-tracking/`: 측정 추적 확장 프로그램
- `modes/usmpr/CLAUDE.md`: USMPR 모드 (다른 커스텀 모드 예시)
- README.md: Measurement Tracking 워크플로우 상세 설명
