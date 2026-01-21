# extensions/measurement-tracking

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#31-상태-관리-방식)
   - 3.2. [커스텀 훅](#32-커스텀-훅)
   - 3.3. [재사용 가능한 패턴](#33-재사용-가능한-패턴)
   - 3.4. [React Lifecycle 통합](#34-react-lifecycle-통합)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)

## 1. 모듈 개요

`measurement-tracking` 확장은 **의료 영상에서 측정(measurement)을 추적하고 관리하는 워크플로우**를 제공하는 OHIF의 핵심 확장 모듈입니다.

### 전체 OHIF 앱에서의 역할
- **측정 추적 워크플로우**: 사용자가 영상에서 만든 측정값(길이, 면적 등)을 시리즈 단위로 추적
- **DICOM SR(Structured Report) 연동**: 측정값을 DICOM SR 형식으로 저장/불러오기
- **상태 관리**: XState 상태 머신을 통해 복잡한 추적 워크플로우 관리
- **UI 패널 제공**: 측정 테이블과 추적 기능이 포함된 스터디 브라우저 제공

### 연결되는 화면/기능
- **Longitudinal 모드**: 장기 추적(longitudinal) 워크플로우에서 핵심적으로 사용됨
- **측정 패널**: 우측 사이드바에 추적 중인 측정값 목록 표시
- **스터디 브라우저**: 좌측 사이드바에 추적 상태가 표시된 시리즈 썸네일
- **Viewport**: 추적 중인 시리즈는 실선, 비추적 시리즈는 점선으로 측정값 표시

### 핵심 기능
1. **시리즈 추적 (Series Tracking)**: 특정 시리즈를 "추적 대상"으로 지정하여 측정값 관리
2. **측정 생명주기 관리**: 측정 추가/삭제 시 자동으로 추적 상태 업데이트
3. **SR Hydration**: DICOM SR을 불러와서 측정값으로 복원 (rehydrate)
4. **더티 상태 관리**: 저장되지 않은 변경사항 추적 및 경고

---

## 2. 주요 파일/컴포넌트 리스트

### 모듈 진입점
- **`src/index.tsx`**: 확장 정의 및 모듈 export
  - `getContextModule`: TrackedMeasurementsContext 제공
  - `getPanelModule`: 측정 테이블 및 스터디 브라우저 패널
  - `getViewportModule`: 추적 기능이 포함된 Cornerstone Viewport
  - `getCustomizationModule`: 프롬프트 커스터마이제이션
  - `preRegistration`: TrackedMeasurementsService 등록

### 핵심 Context (상태 관리)
- **`contexts/TrackedMeasurementsContext/TrackedMeasurementsContext.tsx`** (393줄)
  - React Context로 상태 머신과 추적 상태를 전역으로 제공
  - XState 머신 초기화 및 이벤트 핸들러 바인딩
  - SR Hydration 트리거 로직

- **`contexts/TrackedMeasurementsContext/measurementTrackingMachine.js`** (539줄)
  - XState 상태 머신 정의 (핵심 비즈니스 로직)
  - 상태: `idle`, `tracking`, `promptBeginTracking`, `promptSaveReport`, `hydrateStructuredReport` 등
  - 이벤트: `TRACK_SERIES`, `UNTRACK_SERIES`, `SAVE_REPORT`, `HYDRATE_SR` 등

### 프롬프트 (사용자 대화)
- **`contexts/TrackedMeasurementsContext/promptBeginTracking.js`**: 추적 시작 확인
- **`contexts/TrackedMeasurementsContext/promptTrackNewSeries.js`**: 새 시리즈 추적 여부 확인
- **`contexts/TrackedMeasurementsContext/promptTrackNewStudy.ts`**: 새 스터디 추적 여부 확인
- **`contexts/TrackedMeasurementsContext/promptHydrateStructuredReport.ts`**: SR 불러오기 확인
- **`contexts/TrackedMeasurementsContext/promptHasDirtyAnnotations.ts`**: 저장되지 않은 변경사항 경고

### 서비스
- **`services/TrackedMeasurementsService/TrackedMeasurementsService.ts`** (169줄)
  - PubSubService 상속
  - 추적 중인 시리즈 목록 관리 (`_trackedSeries`)
  - 이벤트: `TRACKED_SERIES_CHANGED`, `SERIES_ADDED`, `SERIES_REMOVED`, `TRACKING_ENABLED`, `TRACKING_DISABLED`
  - 메서드: `addTrackedSeries()`, `removeTrackedSeries()`, `isSeriesTracked()`, `getTrackedSeries()`

### UI 패널
- **`panels/PanelMeasurementTableTracking.tsx`** (117줄)
  - 추적 중인 측정값 테이블 표시
  - "Untrack Study" 기능
  - "Create SR" (Structured Report 저장) 버튼

- **`panels/PanelStudyBrowserTracking/PanelStudyBrowserTracking.tsx`** (150줄)
  - 기본 스터디 브라우저에 추적 기능 추가
  - 썸네일에 `isTracked` 상태 표시
  - "Untrack Series" 액션 제공

### Viewport
- **`viewports/TrackedCornerstoneViewport.tsx`** (271줄)
  - OHIFCornerstoneViewport를 래핑
  - 추적 중인 시리즈: 실선 측정값 표시
  - 비추적 시리즈: 점선(dashed) 측정값 표시
  - 측정 추가 시 자동으로 `TRACK_SERIES` 이벤트 발생

### 컴포넌트 관계 다이어그램 (텍스트)

```
[Mode Entry]
    └─> index.tsx (onModeEnter)
        └─> CustomizationService: studyBrowser 커스터마이징

[React Component Tree]
App
 └─> TrackedMeasurementsContextProvider (Context)
     ├─> [State Machine (XState)]
     │   ├─> measurementTrackingMachine
     │   └─> trackedMeasurements state
     │
     ├─> PanelMeasurementTableTracking (우측 패널)
     │   ├─> useTrackedMeasurements() hook
     │   └─> measurementFilter (trackedSeries 기준 필터)
     │
     ├─> PanelStudyBrowserTracking (좌측 패널)
     │   ├─> useTrackedMeasurements() hook
     │   ├─> mapDisplaySetsWithTracking (썸네일 상태 추가)
     │   └─> onClickUntrack (시리즈 추적 해제)
     │
     └─> TrackedCornerstoneViewport (뷰포트)
         ├─> useTrackedMeasurements() hook
         ├─> 측정 스타일 변경 (실선/점선)
         └─> MEASUREMENT_ADDED 이벤트 구독
             └─> sendTrackedMeasurementsEvent('TRACK_SERIES')

[Service Layer]
TrackedMeasurementsService
 ├─> PubSubService 상속
 └─> 이벤트 발행: TRACKED_SERIES_CHANGED, TRACKING_ENABLED 등
```

### 데이터 흐름

```
[측정 추가 시]
사용자가 측정 도구 사용
 └─> MeasurementService.MEASUREMENT_ADDED 이벤트
     └─> TrackedCornerstoneViewport 이벤트 구독
         └─> sendTrackedMeasurementsEvent('TRACK_SERIES')
             └─> State Machine 상태 전환
                 ├─> idle → promptBeginTracking (첫 측정)
                 ├─> tracking → promptTrackNewSeries (새 시리즈)
                 └─> tracking → tracking (같은 시리즈)

[SR 불러오기 시]
SR DisplaySet 활성화
 └─> TrackedMeasurementsContext useEffect (viewport 변경 감지)
     └─> sendTrackedMeasurementsEvent('PROMPT_HYDRATE_SR')
         └─> State Machine: promptHydrateStructuredReport
             └─> hydrateStructuredReport 서비스 호출
                 └─> MeasurementService에 측정값 추가
                     └─> trackedSeries 업데이트
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

이 확장은 **3계층 상태 관리**를 사용합니다:

#### (1) XState 상태 머신 (비즈니스 로직)
- **위치**: `measurementTrackingMachine.js`
- **역할**: 복잡한 추적 워크플로우를 상태 머신으로 모델링
- **상태 예시**:
  - `idle`: 추적 없음
  - `tracking`: 시리즈 추적 중
  - `promptBeginTracking`: 추적 시작 확인 대화상자
  - `promptSaveReport`: SR 저장 확인
  - `hydrateStructuredReport`: SR 불러오는 중

```javascript
// 상태 머신 사용 예
const [trackedMeasurements, sendTrackedMeasurementsEvent] = useMachine(measurementTrackingMachine);

// 이벤트 전송으로 상태 전환
sendTrackedMeasurementsEvent('TRACK_SERIES', {
  StudyInstanceUID,
  SeriesInstanceUID
});
```

#### (2) React Context (전역 상태 공유)
- **위치**: `TrackedMeasurementsContext.tsx`
- **역할**: 상태 머신과 이벤트 핸들러를 모든 하위 컴포넌트에 제공
- **사용법**:

```javascript
// Context 제공
<TrackedMeasurementsContextProvider>
  {children}
</TrackedMeasurementsContextProvider>

// Context 소비
const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements();
const { trackedStudy, trackedSeries } = trackedMeasurements.context;
```

#### (3) Service (OHIF 서비스)
- **위치**: `TrackedMeasurementsService.ts`
- **역할**: React 외부(예: commands)에서도 추적 상태 접근 가능
- **PubSub 패턴**으로 이벤트 발행/구독

```typescript
// 서비스 사용
const { trackedMeasurementsService } = servicesManager.services;
const trackedSeries = trackedMeasurementsService.getTrackedSeries();
const isTracked = trackedMeasurementsService.isSeriesTracked(seriesUID);

// 이벤트 구독
trackedMeasurementsService.subscribe(
  trackedMeasurementsService.EVENTS.TRACKED_SERIES_CHANGED,
  ({ trackedSeries }) => { /* ... */ }
);
```

### 커스텀 훅

#### `useTrackedMeasurements()`
- **위치**: `getContextModule.tsx`에서 export
- **역할**: TrackedMeasurementsContext를 쉽게 사용할 수 있는 훅
- **반환값**: `[trackedMeasurements, sendTrackedMeasurementsEvent]`

```javascript
const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements();

// 현재 추적 중인 시리즈 접근
const { trackedSeries, trackedStudy } = trackedMeasurements.context;

// 이벤트 전송
sendTrackedMeasurementsEvent('UNTRACK_ALL', {});
```

### 재사용 가능한 패턴

#### (1) Measurement Filter 패턴
측정값을 필터링할 때 추적 중인 시리즈만 표시:

```javascript
const measurementFilter = trackedStudy
  ? filterMeasurementsBySeriesUID(trackedSeries)
  : filterAny;

// MeasurementTable에 전달
<PanelMeasurement measurementFilter={measurementFilter} />
```

#### (2) Viewport 스타일링 패턴
추적 상태에 따라 측정값 스타일 변경:

```javascript
useEffect(() => {
  if (isTracked) {
    // 추적 중: 실선
    annotation.config.style.setViewportToolStyles(viewportId, {
      global: { lineDash: '' }
    });
  } else {
    // 비추적: 점선
    annotation.config.style.setViewportToolStyles(viewportId, {
      global: { lineDash: '4,4' }
    });
  }
}, [isTracked]);
```

#### (3) Prompt Wrapper 패턴
사용자 프롬프트를 커스터마이징할 수 있도록 래퍼 함수 사용:

```typescript
// promptWrapperFunctions.ts
export const promptBeginTrackingWrapper = (dependencies, ctx, evt) => {
  const customPrompt = customizationService.getCustomization('measurement.promptBeginTracking');
  return customPrompt ? customPrompt(dependencies, ctx, evt) : defaultPrompt(dependencies, ctx, evt);
};
```

### React Lifecycle 통합

#### onModeEnter (모드 진입 시)
```javascript
onModeEnter({ servicesManager }) {
  const { customizationService, toolbarService, trackedMeasurementsService } = servicesManager.services;

  // 툴바가 추적 상태 변경 시 업데이트되도록 등록
  toolbarService.registerEventForToolbarUpdate(trackedMeasurementsService, [
    trackedMeasurementsService.EVENTS.TRACKED_SERIES_CHANGED,
    trackedMeasurementsService.EVENTS.TRACKING_ENABLED,
  ]);

  // 스터디 브라우저 커스터마이징
  customizationService.setCustomizations({
    'studyBrowser.thumbnailDoubleClickCallback': { $set: onDoubleClickHandler }
  });
}
```

---

## 4. OHIF 특유 개념 정리

### OHIF Extensions 시스템

#### Extension Module Types
이 확장이 제공하는 모듈:

1. **Context Module** (`getContextModule`)
   - React Context Provider를 OHIF에 등록
   - 모드에서 자동으로 Context가 App에 주입됨
   - 관련: `platform/core/src/extensions/MODULE_TYPES.ts`

2. **Panel Module** (`getPanelModule`)
   - 사이드 패널 UI 컴포넌트 제공
   - `seriesList`: 스터디 브라우저 패널 (좌측)
   - `trackedMeasurements`: 측정 테이블 패널 (우측)

3. **Viewport Module** (`getViewportModule`)
   - Viewport 렌더러 제공
   - `cornerstone-tracked`: 추적 기능이 포함된 Cornerstone viewport

4. **Customization Module** (`getCustomizationModule`)
   - 프롬프트(대화상자)를 커스터마이징할 수 있는 지점 제공
   - 예: `measurement.promptBeginTracking`

### OHIF Services 통합

#### MeasurementService
- **위치**: `@ohif/core` - `platform/core/src/services/MeasurementService`
- **역할**: 모든 측정값의 중앙 저장소
- **이벤트**: `MEASUREMENT_ADDED`, `MEASUREMENT_UPDATED`, `MEASUREMENT_REMOVED`
- **measurement-tracking과의 관계**:
  - MeasurementService가 측정값 데이터 관리
  - TrackedMeasurementsService가 "어떤 시리즈를 추적 중인지" 상태 관리

```javascript
// 측정값 추가 시 자동으로 추적 이벤트 발생
measurementService.subscribe(EVENTS.MEASUREMENT_ADDED, ({ measurement }) => {
  sendTrackedMeasurementsEvent('TRACK_SERIES', {
    SeriesInstanceUID: measurement.referenceSeriesUID
  });
});
```

#### DisplaySetService
- **역할**: DICOM 시리즈를 DisplaySet으로 그룹화
- **SR DisplaySet**:
  - `isRehydratable`: SR이 측정값으로 복원 가능한지 여부
  - `isHydrated`: 이미 복원되었는지 여부
  - `load()`: SR 메타데이터 로드

#### CustomizationService
- **역할**: 확장의 동작을 런타임에 커스터마이징
- **사용 예**: 프롬프트 메시지 변경, 추적 워크플로우 수정

### DICOM SR (Structured Report) 개념

#### SR이란?
- DICOM 표준의 일부로, 측정값과 소견을 구조화된 형식으로 저장
- OHIF에서는 `@ohif/extension-cornerstone-dicom-sr`이 SR 생성/파싱 담당

#### Hydration (재수화)
- **개념**: 저장된 DICOM SR을 읽어서 측정값으로 복원하는 과정
- **워크플로우**:
  1. SR DisplaySet이 viewport에 표시됨
  2. `isRehydratable` 확인 (복원 가능한 SR인지)
  3. 사용자에게 "측정값을 불러오시겠습니까?" 프롬프트
  4. 승인 시 `hydrateStructuredReport()` 호출
  5. SR의 측정값을 MeasurementService에 추가
  6. 해당 시리즈들을 추적 상태로 전환

```javascript
// Hydration 트리거
sendTrackedMeasurementsEvent('PROMPT_HYDRATE_SR', {
  displaySetInstanceUID,
  SeriesInstanceUID,
  viewportId
});
```

### XState (State Machine Library)

#### 왜 State Machine을 사용하는가?
측정 추적 워크플로우는 매우 복잡합니다:
- 사용자가 새 시리즈에 측정 추가 시 → 추적할지 물어봐야 함
- 새 스터디에 측정 추가 시 → 기존 측정 저장할지 물어봐야 함
- SR 불러올 때 → 기존 측정 덮어쓸지 물어봐야 함
- 저장 안 된 변경사항 있을 때 → 저장 경고

이런 복잡한 분기를 **명확하게 정의된 상태와 전환**으로 관리하기 위해 XState 사용.

#### 주요 상태 예시
```javascript
states: {
  idle: {
    // 추적 없음
    on: {
      TRACK_SERIES: 'promptBeginTracking'
    }
  },
  promptBeginTracking: {
    // "추적을 시작하시겠습니까?" 프롬프트
    invoke: {
      src: 'promptBeginTracking',
      onDone: [
        { target: 'tracking', cond: 'shouldSetStudyAndSeries' },
        { target: 'idle' }
      ]
    }
  },
  tracking: {
    // 추적 중
    on: {
      TRACK_SERIES: [
        { target: 'promptTrackNewStudy', cond: 'isNewStudy' },
        { target: 'promptTrackNewSeries', cond: 'isNewSeries' }
      ],
      SAVE_REPORT: 'promptSaveReport'
    }
  }
}
```

### 관련 폴더 링크

- **Extensions**:
  - `extensions/cornerstone-dicom-sr/`: DICOM SR 생성/파싱
  - `extensions/cornerstone/`: Cornerstone viewport 및 도구
  - `extensions/default/`: 기본 데이터소스 및 패널

- **Platform Core**:
  - `platform/core/src/services/MeasurementService/`: 측정값 관리
  - `platform/core/src/services/DisplaySetService/`: DisplaySet 관리
  - `platform/core/src/extensions/`: Extension 시스템

- **Modes**:
  - `modes/longitudinal/`: 이 확장을 핵심적으로 사용하는 모드

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 1단계: 서비스 이해하기 (가장 쉬움)
먼저 **TrackedMeasurementsService**부터 시작하세요.
- 파일: `services/TrackedMeasurementsService/TrackedMeasurementsService.ts`
- 이유: 단순한 클래스 구조, PubSub 패턴만 이해하면 됨
- 핵심 메서드: `addTrackedSeries()`, `isSeriesTracked()`, `getTrackedSeries()`

#### 2단계: Context와 Hook 이해하기
- 파일: `getContextModule.tsx`, `contexts/TrackedMeasurementsContext/TrackedMeasurementsContext.tsx`
- 이유: React Context 패턴 학습에 좋은 예제
- 포인트: `useMachine` 훅과 Context Provider의 조합 이해

#### 3단계: UI 컴포넌트 이해하기
- 파일: `panels/PanelMeasurementTableTracking.tsx`
- 이유: Context를 실제로 사용하는 간단한 예제
- 포인트: `useTrackedMeasurements()` 훅 사용법, measurementFilter 패턴

#### 4단계: Viewport 통합 이해하기
- 파일: `viewports/TrackedCornerstoneViewport.tsx`
- 이유: 이벤트 구독과 스타일 변경 로직 학습
- 포인트: MeasurementService 이벤트 구독, Cornerstone 스타일 설정

#### 5단계: 상태 머신 이해하기 (가장 어려움)
- 파일: `contexts/TrackedMeasurementsContext/measurementTrackingMachine.js`
- 이유: 복잡한 비즈니스 로직, XState 지식 필요
- 포인트:
  - 각 상태가 어떤 UI 상황에 대응하는지 매핑하기
  - 이벤트가 어디서 발생하는지 추적하기
  - guards(조건)와 actions(실행) 이해하기

### 선수 지식

- **필수**:
  - React Hooks (useState, useEffect, useContext)
  - React Context API
  - TypeScript 기본 문법

- **권장**:
  - XState (상태 머신 라이브러리)
  - PubSub 패턴
  - DICOM 기본 개념 (Study, Series, Instance)

### 이 확장을 다 이해하면 할 수 있게 되는 것

1. **복잡한 워크플로우를 상태 머신으로 모델링**할 수 있습니다.
   - 여러 단계의 사용자 프롬프트
   - 조건부 분기 로직
   - 비동기 작업 처리

2. **OHIF Extension 시스템의 핵심**을 이해하게 됩니다.
   - Context Module로 전역 상태 제공
   - Service로 React 외부와 통신
   - Panel/Viewport Module로 UI 확장

3. **의료 영상 워크플로우에서의 데이터 추적**을 구현할 수 있습니다.
   - 측정값 생명주기 관리
   - DICOM SR 저장/불러오기 통합
   - 다중 시리즈/스터디 간 데이터 일관성 유지

### 디버깅 팁

#### 상태 머신 상태 확인
브라우저 콘솔에서:
```javascript
// React DevTools에서 TrackedMeasurementsContextProvider 찾기
// 또는 컴포넌트에서 로그 추가
console.log(trackedMeasurements.value); // 현재 상태
console.log(trackedMeasurements.context); // 컨텍스트 데이터
```

#### 추적 중인 시리즈 확인
```javascript
const { trackedMeasurementsService } = servicesManager.services;
console.log('Tracked series:', trackedMeasurementsService.getTrackedSeries());
```

#### 이벤트 흐름 추적
각 prompt 함수에 `console.log` 추가하여 어떤 순서로 호출되는지 확인:
```javascript
// promptBeginTracking.js
export default function promptBeginTracking(...) {
  console.log('[DEBUG] promptBeginTracking called', ctx, evt);
  // ...
}
```

### 실습 아이디어

1. **간단**: 추적 중인 시리즈 개수를 툴바에 표시하는 버튼 추가
2. **중간**: 특정 시리즈를 자동으로 추적 시작하는 커스텀 커맨드 구현
3. **고급**: 상태 머신에 새로운 상태 추가 (예: "승인 대기" 상태)

---

## 추가 참고사항

### 확장 의존성
이 확장은 다음 확장에 의존합니다:
- `@ohif/extension-cornerstone-dicom-sr`: SR 생성/파싱
- `@ohif/extension-cornerstone`: Viewport 및 측정 도구
- `@ohif/extension-default`: 기본 패널 및 프롬프트

### 설정 옵션
Modes에서 이 확장을 사용할 때 설정 가능:
```javascript
// appConfig
{
  measurementTrackingMode: 'SIMPLIFIED', // 또는 'DEFAULT'
  disableConfirmationPrompts: false, // true 시 프롬프트 생략
}
```

### 주의사항
- 상태 머신은 한 번만 생성되므로 (`useMemo` 사용) 동적 변경 불가
- SR Hydration 시 기존 측정값이 덮어쓰여질 수 있음
- 추적 해제 시 측정값도 함께 삭제됨 (되돌릴 수 없음)
