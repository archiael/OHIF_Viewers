# platform/core/src/services 폴더 분석

## 1. 모듈 개요

### 이 폴더가 전체 OHIF 리액트 앱에서 맡는 책임

`platform/core/src/services` 폴더는 **OHIF 뷰어의 핵심 비즈니스 로직과 상태 관리를 담당하는 서비스 계층**입니다. 리액트 컴포넌트들이 직접 데이터를 관리하는 대신, 이 서비스들을 통해 중앙화된 방식으로 상태를 관리하고 기능을 제공합니다.

**주요 책임:**
- DICOM 메타데이터 저장 및 조회
- DisplaySet (이미지 그룹) 생성 및 관리
- 측정(Measurement) 데이터 관리
- 뷰포트 레이아웃 및 상태 관리
- UI 모달, 다이얼로그, 알림 표시
- 툴바 버튼 및 패널 관리
- 이미지 프리페칭 (사전 로딩)
- 커스터마이제이션 설정 관리

### 어떤 화면/기능과 직접적으로 연결되는지

**모든 OHIF 뷰어 화면**과 연결되어 있습니다:

- **스터디 뷰어 화면**: `DisplaySetService`, `ViewportGridService`, `HangingProtocolService`가 이미지 표시 제어
- **측정 도구**: `MeasurementService`가 측정값 저장/조회
- **툴바**: `ToolbarService`가 버튼 상태 및 동작 관리
- **사이드 패널**: `PanelService`가 패널 표시/숨김 제어
- **모달 창**: `UIModalService`, `UIDialogService`가 팝업 관리
- **알림 메시지**: `UINotificationService`가 토스트 메시지 표시
- **시네 재생**: `CineService`가 자동 재생 제어
- **인증**: `UserAuthenticationService`가 로그인 정보 관리

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 관리 서비스

**ServicesManager.ts**
- 역할: 모든 서비스를 등록하고 관리하는 중앙 레지스트리
- 서비스 등록/조회 기능 제공
- 모든 서비스의 진입점 역할

**ServiceProvidersManager.ts**
- 역할: 서비스 제공자(Provider) 패턴 구현
- 외부 확장에서 서비스 구현체 주입 가능

### 데이터 관리 서비스

**DicomMetadataStore/** (DicomMetadataStore.ts)
- 역할: DICOM 메타데이터를 Study → Series → Instance 계층 구조로 저장
- `_model.studies[]` 배열에 모든 스터디 데이터 보관
- `getStudy()`, `getSeries()`, `getInstance()` 등의 조회 메서드 제공

**DisplaySetService/** (DisplaySetService.ts, 489줄)
- 역할: DICOM 인스턴스들을 의미 있는 그룹(DisplaySet)으로 묶어 관리
- SOP Class Handler를 통해 다양한 타입의 DisplaySet 생성
- `activeDisplaySets` 배열로 현재 활성화된 DisplaySet 관리
- 이벤트: `DISPLAY_SETS_ADDED`, `DISPLAY_SETS_CHANGED`, `DISPLAY_SETS_REMOVED`

**MeasurementService/** (MeasurementService.ts)
- 역할: 측정(길이, 면적, 각도 등) 데이터를 생성/수정/삭제
- Cornerstone Tools에서 생성된 측정값을 저장
- DICOM SR (Structured Report) 변환 지원
- 이벤트: `MEASUREMENT_ADDED`, `MEASUREMENT_UPDATED`, `MEASUREMENT_REMOVED`

### UI 관련 서비스

**ViewportGridService/** (ViewportGridService.ts)
- 역할: 뷰포트 그리드 레이아웃 및 활성 뷰포트 상태 관리
- 그리드 크기 변경, 뷰포트 추가/제거
- 이벤트: `LAYOUT_CHANGED`, `ACTIVE_VIEWPORT_ID_CHANGED`, `VIEWPORTS_READY`

**HangingProtocolService/** (HangingProtocolService.ts)
- 역할: Hanging Protocol (화면 배치 규칙)을 정의하고 적용
- `ProtocolEngine.js`를 사용하여 최적의 프로토콜 선택
- 스터디 타입에 따라 자동으로 레이아웃 결정
- 이벤트: `PROTOCOL_CHANGED`, `STAGE_ACTIVATION`

**ToolbarService/** (ToolbarService.ts)
- 역할: 툴바 버튼 및 드롭다운 메뉴 관리
- 버튼 상태(활성/비활성), 가시성 제어
- `TOOLBAR_SECTIONS` (primary, secondary 등) 단위로 버튼 그룹화
- 이벤트: `TOOL_BAR_MODIFIED`, `TOOL_BAR_STATE_MODIFIED`

**PanelService/** (PanelService.tsx)
- 역할: 좌/우/하단 사이드 패널 표시 및 내용 관리
- Extension에서 제공하는 패널 컴포넌트 로드
- `PanelPosition.Left`, `PanelPosition.Right`, `PanelPosition.Bottom`
- 이벤트: `PANELS_CHANGED`, `ACTIVATE_PANEL`

**CineService/** (CineService.ts)
- 역할: 이미지 시퀀스 자동 재생(Cine Loop) 제어
- 재생 속도(frameRate), 재생/정지 상태 관리
- 여러 뷰포트 동기화 재생 지원
- 이벤트: `CINE_STATE_CHANGED`

### 모달/알림 서비스

**UIModalService/** (index.ts)
- 역할: 모달 다이얼로그 표시/숨김
- `show({ content, title, shouldCloseOnEsc })` 메서드
- 실제 구현은 `platform/app`에서 주입 (Service Implementation 패턴)

**UIDialogService/** (UIDialogService.ts)
- 역할: 경량 다이얼로그 (확인/취소 버튼 등)
- 모달보다 간단한 UI 인터랙션

**UINotificationService/** (index.ts, 208줄)
- 역할: 토스트 알림 메시지 표시
- `show({ title, message, type, duration })` 메서드
- 타입: `success`, `error`, `info`, `warning`, `loading`
- Promise 기반 로딩 상태 표시 지원

**UIViewportDialogService/** (UIViewportDialogService.ts)
- 역할: 뷰포트 내부에 오버레이 다이얼로그 표시
- 예: 뷰포트 설정, 프리셋 선택 등

### 기타 서비스

**CustomizationService/** (CustomizationService.ts)
- 역할: UI 커스터마이제이션 (로고, 컬러 등) 관리
- Scope: `Global`, `Mode`, `Default` 3단계 우선순위
- 화이트라벨링, 테마 변경 등에 사용

**StudyPrefetcherService/** (StudyPrefetcherService.ts)
- 역할: 아직 표시되지 않은 이미지를 백그라운드에서 미리 로딩
- 우선순위: `Interaction` > `Thumbnail` > `Prefetch` > `Compute`
- 네트워크 대역폭 효율적 사용

**UserAuthenticationService/** (UserAuthenticationService.ts)
- 역할: 사용자 인증 상태 관리
- 로그인/로그아웃, 권한 확인

**WorkflowStepsService/** (WorkflowStepsService.ts)
- 역할: 다단계 워크플로우 (마법사 형식) 관리
- 예: 측정 → 보고서 작성 → 전송 워크플로우

**MultiMonitorService.ts**
- 역할: 멀티 모니터 환경에서 창 관리

### 공유 인터페이스

**_shared/pubSubServiceInterface.ts**
- 역할: 모든 서비스가 상속하는 PubSub 패턴 구현
- `subscribe(eventName, callback)`: 이벤트 구독
- `_broadcastEvent(eventName, data)`: 이벤트 발행
- `PubSubService` 클래스 제공

---

## 컴포넌트 간 관계 / 데이터 흐름 다이어그램

```
[Extensions] → [ServicesManager] → [각 서비스 인스턴스]
                      ↓
    ┌─────────────────┴──────────────────┐
    │                                     │
    ↓                                     ↓
[Data Services]                    [UI Services]
  ├─ DicomMetadataStore              ├─ UIModalService
  ├─ DisplaySetService               ├─ UINotificationService
  ├─ MeasurementService              ├─ ToolbarService
  └─ HangingProtocolService          ├─ PanelService
                                     └─ ViewportGridService

[데이터 흐름 예시: 이미지 로딩]

1. DataSource → DicomMetadataStore.addInstances()
2. DisplaySetService.makeDisplaySets(instances)
   → SOP Class Handler로 DisplaySet 생성
   → _broadcastEvent(DISPLAY_SETS_ADDED)
3. HangingProtocolService.subscribe(DISPLAY_SETS_ADDED)
   → Protocol 매칭 → 최적 레이아웃 결정
   → _broadcastEvent(PROTOCOL_CHANGED)
4. ViewportGridService.subscribe(PROTOCOL_CHANGED)
   → 뷰포트 그리드 업데이트
   → _broadcastEvent(LAYOUT_CHANGED)
5. React Component → useEffect로 LAYOUT_CHANGED 감지
   → UI 리렌더링
```

```
[PubSub 이벤트 흐름]

DisplaySetService
  └─ DISPLAY_SETS_ADDED ─→ HangingProtocolService
                        └─→ StudyPrefetcherService
                        └─→ React Components

MeasurementService
  └─ MEASUREMENT_UPDATED ─→ React Measurement Panel
                          └─→ Cornerstone Viewport (화면 갱신)

ViewportGridService
  └─ ACTIVE_VIEWPORT_ID_CHANGED ─→ ToolbarService (도구 상태 변경)
                                 └─→ React Viewport Components
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### 전역 서비스 기반 상태 관리

OHIF는 **Redux나 MobX 같은 전통적인 상태 관리 라이브러리를 사용하지 않습니다**. 대신 **Service 기반 아키텍처**를 사용합니다:

```typescript
// 서비스는 전역 싱글톤으로 동작
const { servicesManager } = this.props;
const displaySetService = servicesManager.services.displaySetService;

// 상태 조회
const displaySets = displaySetService.getActiveDisplaySets();

// 상태 변경
displaySetService.addDisplaySets(newDisplaySet);
```

**왜 이 방식을 사용하나요?**
- 의료 영상 뷰어는 **확장성**이 중요합니다 (Extensions가 서비스 추가 가능)
- **Extension 간 통신**이 필요합니다 (PubSub 패턴으로 해결)
- **복잡한 도메인 로직** (DICOM, Hanging Protocol 등)을 컴포넌트에서 분리

#### PubSub 패턴으로 리액트 연결

서비스의 상태 변경을 리액트 컴포넌트에서 감지하는 방법:

```tsx
import { useEffect, useState } from 'react';

function MyComponent({ servicesManager }) {
  const [displaySets, setDisplaySets] = useState([]);

  useEffect(() => {
    const { displaySetService } = servicesManager.services;

    // 초기 데이터 로드
    setDisplaySets(displaySetService.getActiveDisplaySets());

    // 이벤트 구독 (상태 변경 감지)
    const subscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      (newDisplaySets) => {
        setDisplaySets(newDisplaySets);
      }
    );

    // 컴포넌트 언마운트 시 구독 해제 (메모리 누수 방지)
    return () => {
      subscription.unsubscribe();
    };
  }, [servicesManager]);

  return (
    <div>
      {displaySets.map(ds => <div key={ds.displaySetInstanceUID}>{ds.SeriesDescription}</div>)}
    </div>
  );
}
```

**리액트 초보자를 위한 설명:**
- `useEffect`: 컴포넌트가 화면에 나타날 때 실행 (componentDidMount와 유사)
- `useState`: 컴포넌트 내부 상태 관리 (상태 변경 시 자동 리렌더링)
- `subscription.unsubscribe()`: cleanup 함수로 메모리 누수 방지

#### Service Implementation 패턴

일부 UI 서비스는 **구현체를 나중에 주입**받는 패턴을 사용합니다:

```typescript
// UIModalService/index.ts
class UIModalService {
  show({ content, title }) {
    return serviceImplementation._show({ content, title });
  }

  setServiceImplementation({ show: showImplementation }) {
    serviceImplementation._show = showImplementation;
  }
}

// platform/app에서 실제 리액트 컴포넌트 주입
uiModalService.setServiceImplementation({
  show: ({ content, title }) => {
    // React Portal로 모달 렌더링
    setModalState({ isOpen: true, content, title });
  }
});
```

**왜 이렇게 하나요?**
- `platform/core`는 리액트에 의존하지 않는 순수 비즈니스 로직
- `platform/app`에서 실제 UI 구현을 주입 → 테스트 용이성 증가

### 재사용 가능한 UI 컴포넌트 패턴

서비스 자체는 UI 컴포넌트가 아니지만, 서비스를 사용하는 **커스텀 훅 패턴**이 자주 사용됩니다:

```tsx
// 예시: useDisplaySets 커스텀 훅
function useDisplaySets({ servicesManager }) {
  const [displaySets, setDisplaySets] = useState([]);

  useEffect(() => {
    const { displaySetService } = servicesManager.services;

    const update = () => {
      setDisplaySets(displaySetService.getActiveDisplaySets());
    };

    update();
    const sub = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      update
    );

    return () => sub.unsubscribe();
  }, [servicesManager]);

  return displaySets;
}

// 사용
function MyComponent({ servicesManager }) {
  const displaySets = useDisplaySets({ servicesManager });
  return <div>{displaySets.length} display sets loaded</div>;
}
```

### 커스텀 훅이 있다면 역할과 사용처

`platform/core/src/services` 자체에는 커스텀 훅이 없지만, **`platform/app`이나 `platform/ui`에서 서비스를 감싸는 훅들이 있습니다**:

**예상되는 커스텀 훅들** (실제 구현은 `platform/app/src/hooks/`에 위치):
- `useDisplaySets()`: DisplaySet 목록 구독
- `useActiveViewportId()`: 현재 활성 뷰포트 추적
- `useMeasurements()`: 측정값 목록 구독
- `useToolbarButtons()`: 툴바 버튼 상태 구독

**리액트 초보자를 위한 팁:**
- 커스텀 훅은 `use`로 시작하는 함수입니다
- 여러 컴포넌트에서 같은 로직을 재사용할 때 만듭니다
- 훅 안에서 `useState`, `useEffect` 등을 사용 가능합니다

---

## 4. OHIF 특유 개념 정리

### Service 아키텍처

**Service란?**
- OHIF에서 Service는 **비즈니스 로직을 담당하는 싱글톤 객체**입니다
- 리액트 컴포넌트와 분리되어 데이터 관리, 계산, 이벤트 발행을 담당합니다
- Extension에서도 새로운 Service를 추가할 수 있습니다

**Service 등록 과정:**
```typescript
// 1. Service 정의
class MyService extends PubSubService {
  static REGISTRATION = {
    name: 'myService',
    create: ({ configuration }) => new MyService(configuration)
  };
}

// 2. ServicesManager에 등록
servicesManager.registerService(MyService);

// 3. 어디서든 사용
const myService = servicesManager.services.myService;
```

### PubSub 패턴

**PubSub (Publish-Subscribe)이란?**
- **발행자(Publisher)**가 이벤트를 발생시키면
- **구독자(Subscriber)**들이 자동으로 알림을 받는 패턴입니다

**OHIF에서 사용 예시:**
```typescript
// Publisher (DisplaySetService)
this._broadcastEvent(EVENTS.DISPLAY_SETS_ADDED, { displaySetsAdded });

// Subscriber (React Component)
displaySetService.subscribe(
  EVENTS.DISPLAY_SETS_ADDED,
  ({ displaySetsAdded }) => {
    console.log('New display sets:', displaySetsAdded);
  }
);
```

**왜 PubSub을 사용하나요?**
- 서비스들이 **서로 직접 참조하지 않고** 통신 가능 (낮은 결합도)
- Extension이 기존 서비스의 이벤트를 **감지하고 반응** 가능
- 예: 새로운 Extension이 `MEASUREMENT_ADDED` 이벤트를 구독하여 자동 저장 기능 추가

### DisplaySet

**DisplaySet이란?**
- DICOM 인스턴스(이미지)들을 **의미 있는 그룹으로 묶은 단위**입니다
- 예시:
  - CT 시리즈 100장 → 1개의 Stack DisplaySet
  - CT 시리즈 100장 → MPR용 Volume DisplaySet (재구성된 3D 데이터)
  - DICOM SR 파일 → Structured Report DisplaySet

**왜 Instance를 직접 사용하지 않나요?**
- 같은 시리즈도 **용도에 따라 다르게 표현**해야 함 (Stack vs Volume)
- **SOP Class Handler**가 각 DICOM 타입에 맞는 DisplaySet 생성

### SOP Class Handler

**SOP Class Handler란?**
- 특정 DICOM SOP Class (이미지 타입)를 처리하는 **확장 모듈**입니다
- 예:
  - CT 이미지: `cornerstone-sop-class-handler`
  - DICOM SEG: `dicom-seg-sop-class-handler`
  - DICOM PDF: `pdf-sop-class-handler`

**DisplaySet 생성 과정:**
```
DICOM Instances
  ↓
DisplaySetService.makeDisplaySets(instances)
  ↓
SOPClassHandler.getDisplaySetsFromSeries(instances)
  ↓
DisplaySet { displaySetInstanceUID, instances, Modality, ... }
```

### Hanging Protocol

**Hanging Protocol이란?**
- 의료 영상의 **화면 배치 규칙**입니다
- 예시:
  - "흉부 CT는 Axial/Sagittal/Coronal 3분할"
  - "유방촬영은 좌우 비교를 위해 2x2 그리드"

**구성 요소:**
- **Protocol**: 전체 규칙 세트
- **Stage**: 프로토콜 내의 단계 (1단계: 개요, 2단계: 상세)
- **Viewport**: 각 화면 영역에 표시할 DisplaySet 규칙

**관련 파일:**
- `HangingProtocolService/HangingProtocolService.ts`: 프로토콜 관리
- `HangingProtocolService/ProtocolEngine.js`: 프로토콜 매칭 알고리즘
- `extensions/default/src/hangingprotocols/`: 기본 프로토콜 정의

### Extensions와 Service의 관계

**Extension이란?**
- OHIF 뷰어에 **기능을 추가하는 플러그인**입니다
- Extension은 서비스를 사용하거나, 새로운 서비스를 제공합니다

```typescript
// Extension에서 서비스 사용
export default function MyExtension({ servicesManager }) {
  const { displaySetService, toolbarService } = servicesManager.services;

  return {
    getToolbarModule: () => ({
      definitions: [
        {
          id: 'myButton',
          onClick: () => {
            const ds = displaySetService.getActiveDisplaySets()[0];
            console.log('First display set:', ds);
          }
        }
      ]
    })
  };
}
```

### Modes와 Service의 관계

**Mode란?**
- Extension들을 조합한 **사전 구성된 워크플로우**입니다
- 예: `longitudinal` 모드 = 측정 추적 워크플로우

**Mode와 Service:**
- Mode는 초기화 시 서비스 설정을 커스터마이징합니다
- `CustomizationService`를 통해 Mode별 UI 변경
- `HangingProtocolService`에 Mode 전용 프로토콜 등록

### 관련되는 다른 폴더 링크

**서비스를 사용하는 주요 폴더:**

1. **platform/app/src/**
   - `App.tsx`: ServicesManager 초기화
   - `routes/`: 라우팅과 서비스 연결
   - `hooks/`: 서비스를 감싸는 커스텀 훅

2. **extensions/**
   - `extensions/cornerstone/`: DisplaySetService, MeasurementService 사용
   - `extensions/default/`: HangingProtocolService, ToolbarService 설정
   - `extensions/measurement-tracking/`: MeasurementService 기반 UI

3. **modes/**
   - `modes/usmpr/`: USMPR 모드에서 서비스 초기화
   - `modes/longitudinal/`: Longitudinal 워크플로우 서비스 설정

4. **platform/ui/src/**
   - `components/`: 서비스를 사용하는 리액트 컴포넌트들
   - `contextProviders/`: ServicesManager를 React Context로 제공

---

## 5. 초보 개발자용 학습 가이드

### 이 폴더를 공부할 때의 추천 순서

#### 1단계: 기초 이해 (PubSub 패턴)

먼저 **`_shared/pubSubServiceInterface.ts`**를 읽어보세요.
- `subscribe()`, `_broadcastEvent()` 메서드 이해
- 간단한 예제 코드를 직접 작성해보세요:

```typescript
// 연습 코드
class MyService extends PubSubService {
  EVENTS = { DATA_CHANGED: 'data_changed' };
  data = 0;

  increment() {
    this.data++;
    this._broadcastEvent(this.EVENTS.DATA_CHANGED, { data: this.data });
  }
}

const service = new MyService({ EVENTS: { DATA_CHANGED: 'data_changed' } });
service.subscribe('data_changed', ({ data }) => {
  console.log('Data is now:', data);
});
service.increment(); // 콘솔에 "Data is now: 1" 출력
```

#### 2단계: 핵심 서비스 이해 (3개)

다음 서비스들을 **이 순서대로** 읽어보세요:

1. **DicomMetadataStore/DicomMetadataStore.ts**
   - `_model.studies` 배열 구조 파악
   - `getStudy()`, `getSeries()` 메서드 이해
   - DICOM 계층 구조 (Study → Series → Instance) 학습

2. **DisplaySetService/DisplaySetService.ts**
   - `makeDisplaySets()` 메서드가 DisplaySet을 생성하는 과정 추적
   - `EVENTS.DISPLAY_SETS_ADDED` 이벤트가 언제 발생하는지 확인
   - `getActiveDisplaySets()` 메서드로 현재 DisplaySet 조회

3. **ViewportGridService/ViewportGridService.ts**
   - 뷰포트 상태 관리 방식 이해
   - `setActiveViewportId()`, `setLayout()` 같은 구현체 패턴 학습

#### 3단계: UI 서비스 이해

다음 서비스들로 **UI와 서비스의 연결**을 학습하세요:

1. **UIModalService/index.ts**
   - Service Implementation 패턴 이해
   - `setServiceImplementation()` 메서드 역할

2. **UINotificationService/index.ts**
   - `show()` 메서드의 다양한 옵션 (type, duration, position)
   - Promise 기반 알림 (loading → success/error)

3. **ToolbarService/ToolbarService.ts**
   - 툴바 버튼 정의 구조 (`id`, `label`, `commands`, `evaluate`)
   - Section 기반 버튼 그룹화

#### 4단계: 고급 서비스 이해

의료 영상 뷰어 특화 기능:

1. **HangingProtocolService/HangingProtocolService.ts**
   - Protocol, Stage 개념 학습
   - `ProtocolEngine.js`가 어떻게 프로토콜을 매칭하는지 확인

2. **MeasurementService/MeasurementService.ts**
   - 측정값 데이터 구조 (`MEASUREMENT_SCHEMA_KEYS`)
   - Cornerstone Tools와의 연동 방식

3. **StudyPrefetcherService/StudyPrefetcherService.ts**
   - 이미지 프리페칭 알고리즘
   - 우선순위 큐 (Interaction > Thumbnail > Prefetch)

#### 5단계: 실전 응용

**실습 프로젝트:**
1. **간단한 리액트 컴포넌트 만들기**
   - DisplaySet 목록을 표시하는 컴포넌트
   - `useEffect`로 `DISPLAY_SETS_CHANGED` 이벤트 구독
   - 새로운 DisplaySet 추가 시 자동 갱신

2. **커스텀 서비스 만들기**
   - `PubSubService`를 상속받은 `MyCustomService` 생성
   - `REGISTRATION` 객체 정의
   - Extension에서 서비스 등록 및 사용

3. **기존 서비스 확장하기**
   - `MeasurementService.MEASUREMENT_ADDED` 이벤트 구독
   - 새로운 측정값 추가 시 로컬 스토리지에 자동 저장

### 디버깅 팁

**브라우저 콘솔에서 서비스 접근:**
```javascript
// React DevTools로 컴포넌트 선택 후
$r.props.servicesManager.services.displaySetService.getActiveDisplaySets()

// 또는 window 객체에 임시로 추가
window.services = $r.props.servicesManager.services;
window.services.displaySetService.getActiveDisplaySets();
```

**이벤트 로깅:**
```typescript
// 모든 이벤트를 콘솔에 출력
Object.values(displaySetService.EVENTS).forEach(eventName => {
  displaySetService.subscribe(eventName, (data) => {
    console.log(`[${eventName}]`, data);
  });
});
```

### 이 폴더를 다 이해하면 할 수 있게 되는 것

**1. 서비스 기반 아키텍처 마스터**
- Redux 없이도 복잡한 상태 관리를 할 수 있는 방법 습득
- PubSub 패턴으로 모듈 간 결합도 낮은 설계 능력

**2. OHIF 확장 개발 능력**
- 새로운 Extension 개발 시 기존 서비스 활용
- 커스텀 Service 생성 및 등록
- Mode에서 서비스 초기화 및 커스터마이징

**3. 의료 영상 뷰어 도메인 지식**
- DICOM 데이터 구조 (Study/Series/Instance)
- DisplaySet, Hanging Protocol 같은 뷰어 핵심 개념
- SOP Class Handler, Measurement Service 등 확장 포인트

**4. 실무 적용 가능한 패턴**
- Service Implementation 패턴 (의존성 주입)
- 커스텀 훅으로 서비스 감싸기
- 이벤트 기반 아키텍처 설계

**이 폴더를 이해하면, OHIF 뷰어의 80%를 이해한 것입니다!**
나머지 20%는 Extension, Mode, UI 컴포넌트 학습입니다.

---

## 추가 자료

- **OHIF 공식 문서**: https://docs.ohif.org/
- **Services API Reference**: https://docs.ohif.org/platform/services/
- **Extension 개발 가이드**: https://docs.ohif.org/platform/extensions/
- **Hanging Protocol 가이드**: https://docs.ohif.org/platform/services/data/HangingProtocolService

---

**작성일**: 2026-01-01
**분석 대상**: `platform/core/src/services` (OHIF v3.12.0-beta 기반)
