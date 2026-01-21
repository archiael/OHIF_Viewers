# platform/app/src 폴더 분석 (리액트 초보자용)

## 1. 모듈 개요

### 전체 OHIF 리액트 앱에서의 역할

`platform/app/src`는 **OHIF Viewer의 메인 애플리케이션 진입점**입니다. 이 폴더는 전체 앱의 "지휘자" 역할을 하며, 다음과 같은 핵심 책임을 담당합니다:

- **앱 부트스트랩(초기화)**: Extensions와 Modes를 로드하고 등록
- **전역 상태 관리**: Services, Commands, Hotkeys를 초기화하고 전체 앱에 제공
- **라우팅 설정**: React Router를 사용하여 URL에 따라 적절한 화면 렌더링
- **Provider 구성**: React Context를 통해 전역 기능(인증, 테마, 다이얼로그 등)을 모든 컴포넌트에 제공
- **설정 로딩**: `window.config`에서 동적으로 앱 설정 불러오기

### 어떤 화면/기능과 연결되는지

**실제 화면 예시**:

| URL 경로 | 렌더링되는 화면 | 담당 컴포넌트 |
|---------|---------------|------------|
| `/` | 연구(Study) 목록 화면 | `routes/WorkList/` |
| `/usmpr?StudyInstanceUIDs=1.2.3` | USMPR 모드 뷰어 | `routes/Mode/Mode.tsx` |
| `/local` | 로컬 파일 업로드 | `routes/Local/` |
| `/login` | 로그인 화면 | `routes/Login/` |
| `/debug` | 디버그 정보 | `routes/Debug.tsx` |

**상위-하위 모듈 관계**:

```
루트 (public/index.html)
  ↓
index.js (진입점)
  ↓
App.tsx (메인 컴포넌트)
  ├─ appInit.js (초기화)
  │   ├─ ExtensionManager 생성
  │   ├─ ServicesManager 생성
  │   ├─ CommandsManager 생성
  │   └─ HotkeysManager 생성
  │
  ├─ Providers (전역 Context)
  │   ├─ AppConfigProvider
  │   ├─ UserAuthenticationProvider
  │   ├─ ThemeWrapperNext
  │   ├─ SystemContextProvider
  │   └─ ... (총 13개 Provider)
  │
  └─ Routes (React Router)
      ├─ createRoutes() → routes/index.tsx
      │   ├─ buildModeRoutes() → 각 Mode별 동적 라우트
      │   ├─ WorkListRoute → DataSourceWrapper → WorkList
      │   └─ bakedInRoutes (debug, local, notfound 등)
      │
      └─ AuthRoutes (LoginRoutes 또는 OpenIdConnectRoutes)
```

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 진입점 파일

| 파일명 | 역할 | 크기/복잡도 |
|--------|-----|-----------|
| **index.js** | 최초 진입점. `window.config` 로딩 후 React 앱 마운트 | 간단 (44줄) |
| **App.tsx** | 루트 컴포넌트. Manager 초기화 및 Provider 설정 | 중간 (212줄) |
| **appInit.js** | 핵심 초기화 로직. Services, Extensions, Modes 등록 | 복잡 (151줄) |
| **pluginImports.js** | Extension/Mode 동적 import (빌드 시 자동 생성) | 자동생성 (148줄) |
| **loadDynamicConfig.js** | URL 쿼리로 외부 설정 파일 로딩 (선택적) | 간단 (24줄) |

### Routes 폴더 (라우팅 관련)

| 파일/폴더 | 역할 |
|----------|-----|
| **routes/index.tsx** | 메인 라우트 생성 함수 (`createRoutes`) |
| **routes/buildModeRoutes.tsx** | Mode별 동적 라우트 자동 생성 |
| **routes/PrivateRoute.tsx** | 인증 필요한 라우트 래퍼 (HOC 패턴) |
| **routes/DataSourceWrapper.tsx** | WorkList용 데이터 로딩 컨테이너 |
| **routes/Mode/Mode.tsx** | Viewer Mode 초기화 및 렌더링 (가장 복잡) |
| **routes/WorkList/** | 연구 목록 화면 |
| **routes/Local/** | 로컬 파일 업로드 화면 |
| **routes/Login/** | 로그인 화면 (커스텀 추가) |
| **routes/NotFound/** | 404 페이지 |
| **routes/Debug.tsx** | 디버그 정보 출력 |

### State 관리

| 파일 | 역할 |
|-----|-----|
| **state/appConfig.tsx** | 앱 설정 Context (`useAppConfig` 훅 제공) |

### Components

| 파일 | 역할 |
|-----|-----|
| **components/ViewportGrid.tsx** | 뷰어의 메인 그리드 레이아웃 (Viewport 배치) |
| **components/EmptyViewport.tsx** | 빈 Viewport 플레이스홀더 |

### Hooks (커스텀 훅)

| 파일 | 역할 |
|-----|-----|
| **hooks/useSearchParams.ts** | URL 쿼리 파라미터 읽기 (hash 포함, 대소문자 옵션) |
| **hooks/useDebounce.js** | 입력 디바운싱 (검색 필터 등에 사용) |

### Utils (유틸리티)

| 파일 | 역할 |
|-----|-----|
| **utils/OpenIdConnectRoutes.tsx** | OIDC 인증 라우트 (OAuth 콜백 등) |
| **utils/LoginRoutes.tsx** | 기본 로그인 라우트 (커스텀) |
| **utils/history.ts** | 프로그래매틱 네비게이션용 history 객체 |
| **utils/publicUrl.ts** | 베이스 URL 경로 |

---

## 3. 데이터 흐름 다이어그램 (텍스트)

### 앱 초기화 흐름

```
1. 브라우저가 index.html 로드
   ↓
2. index.js 실행
   ↓
3. loadDynamicConfig(window.config)
   - 선택적으로 외부 URL에서 설정 파일 fetch
   ↓
4. App 컴포넌트 렌더링
   ↓
5. useEffect → appInit() 실행
   ├─ CommandsManager 생성
   ├─ ServicesManager 생성
   │   └─ 13개 Service 등록:
   │       - DisplaySetService
   │       - HangingProtocolService
   │       - UIModalService, UIDialogService
   │       - MeasurementService
   │       - ViewportGridService
   │       - ... 등
   ├─ ExtensionManager 생성
   │   └─ pluginImports에서 Extensions 로드 및 등록
   │       (예: @ohif/extension-default, @ohif/extension-cornerstone)
   ├─ HotkeysManager 생성
   └─ Modes 로드 및 등록
       (예: @ohif/mode-usmpr, @ohif/mode-longitudinal)
   ↓
6. setInit(결과) → Manager들 state에 저장
   ↓
7. Providers 적용 (13개 Context Provider 중첩)
   ↓
8. createRoutes() 실행
   ├─ buildModeRoutes() → Mode별 동적 라우트 생성
   ├─ WorkListRoute 추가 (showStudyList가 true일 때)
   └─ bakedInRoutes 추가 (debug, local 등)
   ↓
9. React Router <Routes> 렌더링
   - URL에 맞는 컴포넌트 선택
```

### 라우팅 흐름 (사용자가 URL 입력)

#### 케이스 1: WorkList 화면 (`/`)

```
사용자가 / 접속
  ↓
routes/index.tsx
  → WorkListRoute 매칭
  ↓
PrivateRoute (인증 체크)
  ↓
DataSourceWrapper
  ├─ useEffect: dataSource.initialize()
  ├─ useEffect: dataSource.query.studies.search(filters)
  │   → DICOM 서버에서 연구 목록 가져오기
  ├─ setData({ studies })
  └─ <WorkList data={studies} /> 렌더링
```

#### 케이스 2: USMPR Viewer 모드 (`/usmpr?StudyInstanceUIDs=1.2.3`)

```
사용자가 /usmpr?StudyInstanceUIDs=1.2.3 접속
  ↓
buildModeRoutes → `/usmpr` 경로 매칭
  ↓
routes/Mode/Mode.tsx
  ↓
useEffect 1: Extension 로딩
  - loadModules(mode.extensions)
  - extensionManager.registerExtension()
  - setExtensionDependenciesLoaded(true)
  ↓
useEffect 2: 데이터 소스 초기화
  - dataSource.initialize({ params, query })
  - StudyInstanceUIDs 추출
  - setStudyInstanceUIDs([...])
  ↓
useEffect 3: 레이아웃 준비
  - route.layoutTemplate() 실행 → 레이아웃 구조 반환
  - panelService.addPanels(leftPanels)
  - panelService.addPanels(rightPanels)
  - layoutTemplateData.current = layoutData
  ↓
useEffect 4: Mode 초기화 (가장 복잡!)
  - displaySetService.init()
  - extensionManager.onModeEnter()
  - hangingProtocolService.setActiveProtocolIds()
  - mode.onModeEnter()
  - route.init()
    → DICOM 이미지 로딩 시작
    → Hanging Protocol 적용 (뷰포트 배치)
    → DisplaySet 생성 및 Viewport에 할당
  ↓
최종 렌더링:
  <ImageViewerProvider>
    <LayoutComponent>
      <ViewportGrid>
        <ViewportPane> (각 뷰포트)
          <CornerstoneViewport> (실제 이미지 렌더링)
```

**Cleanup 흐름 (사용자가 다른 페이지로 이동):**

```
useEffect cleanup 함수 실행 (역순)
  ↓
1. mode.onModeExit()
2. hotkeysManager.destroy()
3. unsubscriptions.forEach(unsub => unsub())
   - 이벤트 리스너 정리
4. extensionManager.onModeExit()
   - Viewport 정리
   - 메모리 해제
```

---

## 4. 리액트 관점에서 볼 포인트

### 상태 관리 방식

이 폴더는 **다층 상태 관리 전략**을 사용합니다:

#### 1) React Context (전역 상태)

**App.tsx에서 13개 Provider 중첩**:

```tsx
const providers = [
  [AppConfigProvider, { value: appConfigState }],
  [UserAuthenticationProvider, { service: userAuthenticationService }],
  [I18nextProvider, { i18n }],
  [ThemeWrapperNext],
  [SystemContextProvider, { commandsManager, extensionManager, ... }],
  [ViewportGridProvider, { service: viewportGridService }],
  [ViewportDialogProvider, { service: uiViewportDialogService }],
  [CineProvider, { service: cineService }],
  [NotificationProvider, { service: uiNotificationService }],
  [TooltipProvider],
  [DialogProvider, { service: uiDialogService, dialog: ManagedDialog }],
  [ModalProvider, { service: uiModalService, modal: ModalNext }],
  [ShepherdJourneyProvider],
];

const CombinedProviders = ({ children }) =>
  Compose({ components: providers, children });
```

**Context 사용 예시**:

```tsx
// state/appConfig.tsx
const appConfigContext = createContext(null);

export const useAppConfig = () => useContext(appConfigContext);

// 다른 컴포넌트에서 사용:
const [appConfig, setAppConfig] = useAppConfig();
const { showStudyList, routerBasename } = appConfig;
```

**초보자용 설명**:
- **Context란?** React에서 props를 일일이 전달하지 않고 전역적으로 데이터를 공유하는 방법
- **Provider**: 데이터를 제공하는 컴포넌트 (최상위에 배치)
- **useContext 훅**: 자식 컴포넌트에서 Context 데이터를 읽는 훅

#### 2) OHIF Services (전역 객체 기반 상태)

**ServicesManager를 통한 중앙 집중식 관리**:

```tsx
// appInit.js
const servicesManager = new ServicesManager(commandsManager);

servicesManager.registerServices([
  UINotificationService.REGISTRATION,
  DisplaySetService.REGISTRATION,
  HangingProtocolService.REGISTRATION,
  ViewportGridService.REGISTRATION,
  // ... 등
]);

// 사용 예시:
const { displaySetService, hangingProtocolService } = servicesManager.services;
displaySetService.subscribe('DISPLAY_SETS_ADDED', callback);
```

**Services vs React State 비교**:

| 방식 | 장점 | 사용 사례 |
|-----|-----|---------|
| **Services** | React 외부에서도 접근 가능, 복잡한 비즈니스 로직 | DICOM 데이터, 측정 도구, Hanging Protocol |
| **React State** | React 렌더링과 자동 동기화, 타입 안전 | UI 상태 (모달 열림/닫힘, 로딩 상태 등) |

#### 3) Local Component State (컴포넌트 내부 상태)

**예시: DataSourceWrapper.tsx**:

```tsx
const [isLoading, setIsLoading] = useState(false);
const [data, setData] = useState(DEFAULT_DATA);
const [dataSource, setDataSource] = useState(() => {...});

useEffect(() => {
  async function getData() {
    setIsLoading(true);
    const studies = await dataSource.query.studies.search(filters);
    setData({ studies });
    setIsLoading(false);
  }
  getData();
}, [location, filters]);
```

**useState 사용 패턴**:
- `isLoading`: 비동기 작업 진행 상태
- `data`: API 응답 결과
- 초기값으로 함수 사용 (`useState(() => {...})`) → 컴포넌트 최초 렌더링 시에만 실행

### 재사용 가능한 UI 컴포넌트 패턴

#### 1) Higher-Order Component (HOC) 패턴

**PrivateRoute.tsx**:

```tsx
const PrivateRoute = ({ children, handleUnauthenticated }) => {
  const { userAuthenticationService } = useServices();

  if (!userAuthenticationService.getUser()) {
    handleUnauthenticated();
    return null;
  }

  return children;
};

// 사용:
<PrivateRoute handleUnauthenticated={...}>
  <ModeRoute />
</PrivateRoute>
```

**HOC란?**
- 컴포넌트를 감싸서 추가 기능을 제공하는 패턴
- 인증, 로깅, 에러 처리 등에 유용

#### 2) Render Props / Children Function 패턴

**routes/index.tsx**:

```tsx
const WorkListRoute = {
  path: '/',
  children: DataSourceWrapper,  // 컴포넌트를 children으로 전달
  props: {
    children: WorkList,  // DataSourceWrapper의 children은 WorkList
    servicesManager,
    extensionManager
  },
};
```

#### 3) Compose Pattern (Provider 중첩)

**App.tsx의 Compose 함수**:

```tsx
// routes/Mode/Compose.tsx
const Compose = ({ components, children }) => {
  return components.reduceRight((acc, [Component, props]) => {
    return <Component {...props}>{acc}</Component>;
  }, children);
};

// 사용:
const CombinedProviders = ({ children }) =>
  Compose({ components: providers, children });
```

**왜 이 패턴을 사용할까?**
- 13개 Provider를 수동으로 중첩하면 코드가 읽기 어려움:
  ```tsx
  <Provider1>
    <Provider2>
      <Provider3>
        ...
          <App />
        ...
      </Provider3>
    </Provider2>
  </Provider1>
  ```
- `Compose`를 쓰면 배열로 간결하게 관리 가능

### 커스텀 훅 역할과 사용처

#### 1) useSearchParams

**역할**: URL 쿼리 파라미터 읽기 (React Router의 기본 훅 확장)

**특징**:
- hash 파라미터도 포함 (`#token=abc` 같은 것)
- 대소문자 옵션 제공 (`lowerCaseKeys: true`)

**사용 예시**:

```tsx
// routes/Mode/Mode.tsx
const query = useSearchParams(); // 원본 대소문자 유지
const lowerCaseSearchParams = useSearchParams({ lowerCaseKeys: true });

const studyUIDs = query.get('StudyInstanceUIDs');
const hangingProtocolId = lowerCaseSearchParams.get('hangingprotocolid');
```

#### 2) useDebounce

**역할**: 사용자 입력을 지연시켜 성능 최적화

**사용 사례**: WorkList에서 검색 필터 입력 시

```tsx
// WorkList에서 사용 예시
const [patientName, setPatientName] = useState('');
const debouncedName = useDebounce(patientName, 500); // 500ms 지연

useEffect(() => {
  // debouncedName이 변경될 때만 API 호출
  searchStudies({ patientName: debouncedName });
}, [debouncedName]);
```

**왜 필요한가?**
- 사용자가 "John"을 입력할 때마다 API 호출하면:
  - "J" → API 호출
  - "Jo" → API 호출
  - "Joh" → API 호출
  - "John" → API 호출 (총 4번)
- Debounce를 쓰면:
  - 사용자가 타이핑을 멈춘 후 500ms 후 1번만 호출

#### 3) useAppConfig

**역할**: 앱 전역 설정 읽기/쓰기

```tsx
// state/appConfig.tsx
export const useAppConfig = () => useContext(appConfigContext);

// 사용 예시:
const [appConfig, setAppConfig] = useAppConfig();
const {
  routerBasename,
  showStudyList,
  modes,
  dataSources
} = appConfig;
```

---

## 5. OHIF 특유 개념 정리

### Extension과 Mode의 관계

**Extension**:
- OHIF의 "플러그인" 개념
- 특정 기능을 제공하는 모듈 (예: Cornerstone 렌더링, DICOM SR 지원)
- `pluginImports.js`에서 자동으로 import됨

**Mode**:
- Extension들을 조합한 "워크플로우 설정"
- 예: USMPR Mode = Cornerstone Extension + Default Extension + 특정 레이아웃

**관계도**:

```
Mode (예: USMPR)
  ├─ 필요한 Extensions 선언
  │   ├─ @ohif/extension-cornerstone (이미지 렌더링)
  │   └─ @ohif/extension-default (데이터 소스, 기본 UI)
  ├─ 레이아웃 정의 (4개 Viewport)
  ├─ Hanging Protocol 정의
  └─ Toolbar 버튼 정의
```

**appInit.js에서의 처리**:

```js
// 1. Extension 로드
const loadedExtensions = await loadModules([...defaultExtensions, ...appConfig.extensions]);
await extensionManager.registerExtensions(loadedExtensions, appConfig.dataSources);

// 2. Mode 로드
const loadedModes = await loadModules([...(appConfig.modes || []), ...defaultModes]);
appConfig.loadedModes = loadedModes;
```

### Data Source 개념

**정의**: DICOM 데이터를 어디서 가져올지 결정하는 모듈

**종류**:
- **DICOMweb**: 표준 DICOMweb 서버에서 가져오기
- **Local**: 로컬 파일에서 가져오기
- **Custom**: 사용자 정의 데이터 소스

**DataSourceWrapper의 역할**:

```tsx
// routes/DataSourceWrapper.tsx
useEffect(() => {
  const initializeDataSource = async () => {
    await dataSource.initialize({ params, query });
    setIsDataSourceInitialized(true);
  };
  initializeDataSource();
}, [dataSource]);

useEffect(() => {
  const studies = await dataSource.query.studies.search(queryFilterValues);
  setData({ studies });
}, [location, filters, isDataSourceInitialized]);
```

### Services의 PubSub 패턴

**PubSub란?**
- **Pub**lish/**Sub**scribe 패턴
- 이벤트 발행자와 구독자를 분리하여 느슨한 결합 유지

**예시**:

```tsx
// 이벤트 구독 (Subscriber)
displaySetService.subscribe('DISPLAY_SETS_ADDED', (addedDisplaySets) => {
  console.log('새로운 DisplaySet 추가:', addedDisplaySets);
});

// 이벤트 발행 (Publisher)
displaySetService.publish('DISPLAY_SETS_ADDED', newDisplaySets);
```

**왜 이 패턴을 쓸까?**
- React 컴포넌트가 아닌 곳에서도 상태 변화에 반응 가능
- 여러 컴포넌트가 같은 이벤트를 구독하여 동기화

### Hanging Protocol

**의료 영상 뷰어 특유의 개념**:
- "어떤 이미지를 어느 Viewport에 어떻게 배치할지" 정의하는 규칙
- 예: CT 연구 → Axial, Sagittal, Coronal 3개 뷰포트에 자동 배치

**적용 흐름**:

```
Mode/Mode.tsx
  ↓
hangingProtocolService.setActiveProtocolIds(hangingProtocolId)
  ↓
hangingProtocolService.EVENTS.PROTOCOL_CHANGED 발행
  ↓
ViewportGrid.tsx에서 구독
  ↓
updateDisplaySetsFromProtocol() 실행
  ↓
viewportGridService.setLayout({ numRows, numCols, ... })
```

### 관련 폴더 링크

| 개념 | 관련 폴더 |
|-----|---------|
| **Extension 구현** | `extensions/` (특히 `extensions/cornerstone/`, `extensions/default/`) |
| **Mode 정의** | `modes/` (특히 `modes/usmpr/`, `modes/longitudinal/`) |
| **Services 구현** | `platform/core/src/services/` |
| **Data Source 구현** | `extensions/default/src/DicomWebDataSource/`, `extensions/default/src/DicomLocalDataSource/` |
| **UI 컴포넌트** | `platform/ui/src/`, `platform/ui-next/src/` |
| **Hanging Protocol 예시** | `extensions/default/src/hangingprotocols/` |

---

## 6. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 1단계: React 기초 복습 (필수 선행 학습, 2-3시간)

**학습 내용**:
- React Hooks (`useState`, `useEffect`, `useContext`, `useRef`)
- React Router (v6): `useParams`, `useLocation`, `useNavigate`, `<Routes>`, `<Route>`
- Context API: `createContext`, `Provider`, `useContext`

**추천 자료**:
- React 공식 문서: https://react.dev/
- React Router 공식 문서: https://reactrouter.com/

#### 2단계: 앱 진입점 파악 (30분)

**읽을 파일 순서**:
1. `index.js` (44줄) - 가장 간단, 전체 흐름 시작점
2. `App.tsx` (212줄) - Provider 중첩 패턴 이해
3. `pluginImports.js` (자동 생성) - Extension/Mode 목록 확인

**핵심 질문**:
- `window.config`는 어디서 오는가? → `public/config/default.js`
- Provider가 13개나 중첩되는 이유는? → 전역 Context 제공
- Extension과 Mode는 언제 로드되는가? → `appInit.js`에서

#### 3단계: 초기화 로직 이해 (1시간)

**읽을 파일**:
- `appInit.js` (151줄)

**핵심 개념**:
- **Manager 패턴**: ServicesManager, ExtensionManager, CommandsManager, HotkeysManager
- **Service 등록**: `registerServices` 배열
- **Extension 등록**: `extensionManager.registerExtensions`
- **Mode 로드**: `loadModules`로 동적 import

**실습**:
- 개발자 도구 Console에서 확인:
  ```js
  window.servicesManager // Services 목록
  window.extensionManager // Extension 목록
  ```

#### 4단계: 라우팅 흐름 따라가기 (1-2시간)

**읽을 파일 순서**:
1. `routes/index.tsx` - 전체 라우트 구조
2. `routes/buildModeRoutes.tsx` - Mode 라우트 동적 생성
3. `routes/PrivateRoute.tsx` - 인증 HOC 패턴
4. `routes/DataSourceWrapper.tsx` - 데이터 로딩 컨테이너

**핵심 패턴**:
- **동적 라우트 생성**: Mode × DataSource 조합
- **HOC 패턴**: PrivateRoute로 인증 체크
- **Container/Presentational 분리**: DataSourceWrapper vs WorkList

**실습**:
- 브라우저에서 `/` 접속 → Network 탭에서 API 요청 확인
- 브라우저에서 `/debug` 접속 → 라우트 목록 확인

#### 5단계: Mode 초기화 로직 (2-3시간, 고급)

**읽을 파일**:
- `routes/Mode/Mode.tsx` (405줄, 가장 복잡!)

**핵심 useEffect 순서**:
1. Extension 로딩 (`loadModules`)
2. 데이터 소스 초기화 (`dataSource.initialize`)
3. 레이아웃 준비 (`route.layoutTemplate`)
4. Mode 초기화 (`setupRouteInit`)
   - DisplaySet 초기화
   - Hanging Protocol 적용
   - Mode 진입 훅 실행
   - Route 초기화

**cleanup 이해**:
- `return () => {}` 함수가 언제 실행되는가?
- Mode 종료 시 정리해야 할 것들

**실습**:
- Mode.tsx에 `console.log` 추가하여 실행 순서 확인
- `/usmpr?StudyInstanceUIDs=...` 접속하여 각 단계 관찰

#### 6단계: ViewportGrid 렌더링 (1-2시간)

**읽을 파일**:
- `components/ViewportGrid.tsx` (351줄)

**핵심 개념**:
- **Hanging Protocol → Layout 변환**: `updateDisplaySetsFromProtocol`
- **Viewport 동적 생성**: `getViewportPanes`
- **Drag & Drop 처리**: `onDropHandler`

**실습**:
- React DevTools에서 ViewportGrid 컴포넌트 state 확인
- Viewport를 드래그하여 레이아웃 변경 시 state 변화 관찰

#### 7단계: 커스텀 훅 활용 (30분)

**읽을 파일**:
- `hooks/useSearchParams.ts`
- `hooks/useDebounce.js`
- `state/appConfig.tsx`

**실습**:
- 자신만의 커스텀 훅 만들어보기 (예: `useLocalStorage`)

### 학습 완료 후 할 수 있는 것

**이 폴더를 완전히 이해하면**:

1. **OHIF 앱 전체 흐름 파악**
   - Extension/Mode가 어떻게 로드되고 초기화되는지
   - Services와 React State가 어떻게 상호작용하는지

2. **새로운 페이지/라우트 추가**
   - 예: 설정 페이지, 리포트 페이지, 관리자 대시보드
   - `routes/index.tsx`에 라우트 추가
   - 새로운 컴포넌트 작성

3. **커스텀 Mode 개발**
   - Mode의 초기화 로직 이해
   - 레이아웃, Hanging Protocol, Extension 조합 방법

4. **인증 시스템 커스터마이징**
   - PrivateRoute 수정
   - UserAuthenticationService 확장

5. **전역 상태 관리 패턴 습득**
   - React Context + Services 하이브리드 패턴
   - PubSub 패턴 활용

6. **고급 React 패턴 실무 적용**
   - HOC, Render Props, Compose 패턴
   - 복잡한 useEffect 의존성 관리
   - 컴포넌트 생명주기와 cleanup

**실무 활용 예시**:
- "로그인 후 환자 정보 대시보드로 이동" 구현
- "URL 쿼리로 뷰어 설정 제어" (예: `?layout=2x2&protocol=hpCT`)
- "외부 EMR 시스템과 통합" (데이터 소스 커스터마이징)

---

## 7. 핵심 코드 스니펫 (초보자용 주석 포함)

### 7.1 Provider 중첩 패턴

```tsx
// App.tsx
const providers = [
  [AppConfigProvider, { value: appConfigState }],
  [ThemeWrapperNext],
  // ... 총 13개
];

// Compose 함수로 Provider 중첩
const CombinedProviders = ({ children }) =>
  Compose({ components: providers, children });

// 사용:
<CombinedProviders>
  <BrowserRouter>
    {/* 모든 자식 컴포넌트가 13개 Context에 접근 가능 */}
  </BrowserRouter>
</CombinedProviders>
```

### 7.2 동적 라우트 생성

```tsx
// routes/buildModeRoutes.tsx
export default function buildModeRoutes({ modes, dataSources, ... }) {
  const routes = [];

  // Mode × DataSource 조합으로 모든 라우트 생성
  modes.forEach(mode => {
    dataSources.forEach(dataSource => {
      routes.push({
        path: `${mode.routeName}/${dataSource.sourceName}`,
        children: () => <ModeRoute mode={mode} dataSourceName={dataSource.sourceName} />,
        private: true, // 인증 필요
      });
    });
  });

  return routes;
}
```

### 7.3 비동기 데이터 로딩 패턴

```tsx
// routes/DataSourceWrapper.tsx
const [isLoading, setIsLoading] = useState(false);
const [data, setData] = useState(DEFAULT_DATA);

useEffect(() => {
  // 비동기 함수 정의
  async function getData() {
    setIsLoading(true); // 로딩 시작

    try {
      // API 호출
      const studies = await dataSource.query.studies.search(filters);

      // 성공 시 데이터 저장
      setData({ studies });
    } catch (error) {
      // 에러 처리
      console.error(error);
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  }

  // 즉시 실행
  getData();
}, [location, filters]); // location이나 filters 변경 시 재실행
```

### 7.4 useEffect cleanup 패턴

```tsx
// routes/Mode/Mode.tsx
useEffect(() => {
  // 초기화 로직
  const setupRouteInit = async () => {
    // Services 초기화
    displaySetService.init();
    extensionManager.onModeEnter();
    // ...

    // 이벤트 구독
    const unsubs = await route.init();
    return unsubs;
  };

  let unsubscriptions;
  setupRouteInit().then(unsubs => {
    unsubscriptions = unsubs;
  });

  // Cleanup 함수 (컴포넌트 언마운트 시 실행)
  return () => {
    // Mode 종료
    mode?.onModeExit?.();

    // 이벤트 구독 해제
    if (unsubscriptions) {
      unsubscriptions.forEach(unsub => unsub());
    }

    // Extension 정리
    extensionManager.onModeExit();
  };
}, [studyInstanceUIDs]); // 의존성 배열
```

---

## 8. 자주 묻는 질문 (FAQ)

### Q1: Extension과 Mode의 차이가 뭔가요?

**A**:
- **Extension**: 개별 기능 모듈 (예: Cornerstone 렌더링 엔진)
- **Mode**: 여러 Extension을 조합한 워크플로우 (예: USMPR Mode = Cornerstone + Default + 레이아웃)

**비유**:
- Extension = 레고 블록
- Mode = 레고 블록으로 만든 완성품 (집, 자동차 등)

### Q2: Services와 React State 중 언제 무엇을 써야 하나요?

**A**:

| 상황 | 사용할 것 |
|-----|----------|
| UI 상태 (버튼 클릭, 입력 값 등) | React State (`useState`) |
| 비즈니스 로직 (DICOM 데이터, 측정 도구) | Services |
| 여러 컴포넌트가 공유하는 상태 | React Context 또는 Services |
| React 외부에서 접근해야 하는 상태 | Services |

### Q3: useEffect 의존성 배열이 너무 길면 어떻게 하나요?

**A**:
- **원칙**: 실제로 사용하는 것만 포함
- **나쁜 예**: `useEffect(() => {...}, [])` ← 경고 무시
- **좋은 예**: `useCallback`, `useMemo`로 의존성 안정화

```tsx
// 나쁜 예
useEffect(() => {
  doSomething(props.a, props.b, props.c, ...);
}, []); // 의존성 누락

// 좋은 예
const stableCallback = useCallback(() => {
  doSomething(props.a, props.b, props.c, ...);
}, [props.a, props.b, props.c]);

useEffect(() => {
  stableCallback();
}, [stableCallback]);
```

### Q4: Mode.tsx가 너무 복잡한데 어떻게 이해하나요?

**A**:
- **단계별 접근**: 각 useEffect를 독립적으로 이해
- **순서 파악**:
  1. Extension 로딩
  2. 데이터 초기화
  3. 레이아웃 준비
  4. Mode 초기화
- **디버깅**: `console.log`로 각 단계 확인

### Q5: 새로운 라우트를 추가하려면 어떻게 하나요?

**A**:

```tsx
// routes/index.tsx
const myCustomRoute = {
  path: '/my-page',
  children: MyPageComponent,
  private: true, // 인증 필요하면 true
};

const allRoutes = [
  ...routes,
  myCustomRoute, // 여기에 추가
  ...bakedInRoutes,
  notFoundRoute,
];
```

---

## 9. 다음 학습 추천

**이 폴더를 마스터했다면**:

1. **platform/core 분석** → Services 구현 상세 이해
2. **extensions/cornerstone 분석** → 의료 영상 렌더링 원리
3. **modes/usmpr 분석** → 실제 Mode 구현 사례
4. **platform/ui-next 분석** → UI 컴포넌트 라이브러리

**실전 프로젝트 아이디어**:
- [ ] 로그인 페이지 커스터마이징
- [ ] 새로운 Mode 만들기 (예: "Reading Mode" - 판독 전용)
- [ ] 커스텀 데이터 소스 구현 (예: Firebase, REST API)
- [ ] 다국어 지원 강화 (i18n)

---

**작성일**: 2026-01-01
**분석 대상**: `C:\OHIF_MP\mView-Web_V2\platform\app\src`
**OHIF 버전**: v3.12.0-beta
