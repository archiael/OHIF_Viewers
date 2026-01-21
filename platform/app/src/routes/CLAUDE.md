# 폴더별 상세 분석 (리액트 초보자용)

## 목차
1. [platform/app/src/routes](#1-platformappsrcroutes)
   - 1.1. [모듈 개요](#1.1-모듈-개요)
   - 1.2. [주요 파일/컴포넌트 리스트](#1.2-주요-파일컴포넌트-리스트)
   - 1.3. [리액트 관점에서 볼 포인트](#1.3-리액트-관점에서-볼-포인트)
   - 1.4. [OHIF 특유 개념 정리](#1.4-ohif-특유-개념-정리)
   - 1.5. [초보 개발자용 학습 가이드](#1.5-초보-개발자용-학습-가이드)

---


## 1. platform/app/src/routes

### 1.1. 모듈 개요

`platform/app/src/routes`는 **라우팅(페이지 이동) 로직**을 담당하는 폴더입니다. React Router를 사용하여 URL에 따라 적절한 화면을 렌더링합니다.

- **전체 앱에서의 역할**:
  - URL 경로에 따라 화면 결정 (WorkList, Viewer Mode, Local 등)
  - Mode별 라우트 동적 생성
  - 인증(Private Route) 처리
  - 데이터 소스 초기화 및 전달

- **화면 연결**:
  - `/` → WorkList (연구 목록)
  - `/:modeId/:dataSourceName?StudyInstanceUIDs=...` → Viewer Mode
  - `/local` → 로컬 파일 업로드
  - `/debug` → 디버그 정보

- **상위 모듈**: `platform/app/src/App.tsx` (루트 컴포넌트)
- **하위 모듈**: 각 Route별 컴포넌트 폴더 (`Mode/`, `WorkList/`, `Local/` 등)

### 1.2. 주요 파일/컴포넌트 리스트

**라우팅 설정 파일**:
- `index.tsx`: 메인 라우트 생성 함수 (`createRoutes`)
- `buildModeRoutes.tsx`: Mode별 동적 라우트 생성
- `PrivateRoute.tsx`: 인증 필요한 라우트 래퍼

**데이터 로딩 컴포넌트**:
- `DataSourceWrapper.tsx`: 데이터 소스 초기화 + 연구 목록 로딩 (WorkList용)
- `Mode/Mode.tsx`: Mode 진입 시 초기화 로직 (Viewer용)

**페이지 컴포넌트** (각 폴더):
- `WorkList/`: 연구 목록 화면
- `Local/`: 로컬 파일 업로드 화면
- `Login/`: 로그인 화면 (커스텀 추가) ⭐
- `Mode/`: 뷰어 모드 화면
- `NotFound/`: 404 페이지
- `Debug.tsx`: 디버그 페이지

**인증 관련 컴포넌트** (커스텀 추가):
- `Login/Login.tsx`: 로그인 페이지 UI
- `Login/logout.ts`: 로그아웃 유틸리티
- 📄 **상세 문서**: `Login/CLAUDE.md` 참조

**헬퍼 컴포넌트**:
- `CallbackPage.tsx`: OAuth 콜백 페이지
- `SignoutCallbackComponent.tsx`: 로그아웃 콜백

**데이터 흐름 다이어그램**:
```
사용자가 URL 입력
    ↓
index.tsx: createRoutes() 실행
    ├─ bakedInRoutes (고정 라우트)
    ├─ buildModeRoutes() (동적 Mode 라우트)
    └─ WorkListRoute (연구 목록)
        ↓
React Router <Routes>
    ↓
RouteWithErrorBoundary
    ├─ PrivateRoute (인증 체크)
    └─ 실제 컴포넌트 렌더링

예시 1: WorkList 라우트
  URL: /
    → DataSourceWrapper
      → WorkList 컴포넌트
        (데이터 소스에서 연구 목록 가져오기)

예시 2: Viewer Mode 라우트
  URL: /usmpr?StudyInstanceUIDs=1.2.3
    → buildModeRoutes에서 생성된 라우트
      → Mode/Mode.tsx
        → USMPR 모드 초기화
          → ViewportGrid + Header + Panels

예시 3: 로그인 라우트 (커스텀 추가)
  URL: /login
    → LoginRoutes.tsx (utils/LoginRoutes.tsx)
      → Login/Login.tsx
        → AES-CBC 비밀번호 암호화
        → POST /api/login
        → AuthStateSync.saveAuthState()
          ├─ sessionStorage 저장 (현재 탭)
          └─ localStorage 저장 (암호화, 다른 탭 공유)
        → navigate('/')
```

### 1.3. 리액트 관점에서 볼 포인트

**상태 관리 방식**:

1. **React Router Hooks 사용**:
   ```tsx
   import { useParams, useLocation, useNavigate } from 'react-router-dom';

   // URL 파라미터 읽기
   const params = useParams(); // { modeId: 'usmpr' }

   // 쿼리 파라미터 읽기 (커스텀 훅)
   const query = useSearchParams(); // StudyInstanceUIDs

   // 프로그래매틱 네비게이션
   const navigate = useNavigate();
   navigate('/usmpr?StudyInstanceUIDs=1.2.3');
   ```

2. **컨테이너 vs 프레젠테이션**:
   - **컨테이너**: `DataSourceWrapper`, `Mode/Mode.tsx`
     - 데이터 로딩, 초기화 로직 포함
     - 비즈니스 로직 실행 (Services 호출)
     - 로딩 상태 관리 (`useState`, `useEffect` 사용)

   - **프레젠테이션**: `WorkList`, `Local` 등 실제 페이지 컴포넌트
     - 컨테이너로부터 데이터를 props로 받음
     - UI 렌더링에만 집중

3. **Higher-Order Component 패턴**:
   ```tsx
   // PrivateRoute.tsx
   const PrivateRoute = ({ children, handleUnauthenticated }) => {
     // 인증 체크 로직
     if (!isAuthenticated) {
       handleUnauthenticated();
       return null;
     }
     return children;
   };

   // 사용:
   <PrivateRoute>
     <ModeRoute />
   </PrivateRoute>
   ```

4. **동적 라우트 생성 패턴**:
   ```tsx
   // buildModeRoutes.tsx
   modes.forEach(mode => {
     dataSourceNames.forEach(dataSourceName => {
       routes.push({
         path: `${mode.routeName}/${dataSourceName}`,
         children: () => <ModeRoute mode={mode} />,
       });
     });
   });
   ```

**Props 흐름**:
```tsx
// index.tsx
createRoutes({ modes, dataSources, servicesManager, ... })
  ↓
buildModeRoutes({ modes, dataSources, servicesManager, ... })
  ↓
<ModeRoute
  mode={mode}
  dataSourceName={dataSourceName}
  servicesManager={servicesManager}
  extensionManager={extensionManager}
  hotkeysManager={hotkeysManager}
/>
```

**주요 useEffect 사용 패턴**:

1. **DataSourceWrapper.tsx**:
   ```tsx
   // 데이터 소스 초기화
   useEffect(() => {
     dataSource.initialize({ params, query });
   }, [dataSource]);

   // 연구 목록 로딩
   useEffect(() => {
     const getData = async () => {
       const studies = await dataSource.query.studies.search(filters);
       setData({ studies });
     };
     getData();
   }, [location, filters]);
   ```

2. **Mode/Mode.tsx**:
   ```tsx
   // 확장 로딩
   useEffect(() => {
     loadExtensions().then(() => {
       setExtensionDependenciesLoaded(true);
     });
   }, []);

   // 연구 데이터 로딩
   useEffect(() => {
     dataSource.initialize({ params, query });
     setStudyInstanceUIDs(dataSource.getStudyInstanceUIDs({ params, query }));
   }, [location]);

   // Mode 초기화 (Services, Hanging Protocol 등)
   useEffect(() => {
     setupRouteInit().then(unsubs => {
       // Mode 진입 로직
     });
     return () => {
       // Mode 종료 로직 (cleanup)
     };
   }, [studyInstanceUIDs]);
   ```

**재사용 가능한 패턴**:
- **ErrorBoundary로 라우트 감싸기**: 에러 발생 시 사용자에게 친화적인 메시지 표시
- **PrivateRoute HOC**: 인증 필요한 라우트에 재사용
- **Dynamic Route Generation**: 설정 기반으로 라우트 자동 생성

### 1.4. OHIF 특유 개념 정리

**Mode 기반 라우팅**:
- OHIF는 "Mode" 개념으로 뷰어 워크플로우를 정의
- 각 Mode는 독립적인 라우트를 가짐
- 예: `/usmpr`, `/longitudinal`, `/basic`
- `buildModeRoutes.tsx`가 Mode 설정을 읽어 동적으로 라우트 생성

**Data Source 개념**:
- 데이터를 어디서 가져올지 결정 (DICOMweb, 로컬 파일 등)
- URL에 명시 가능: `/usmpr/dicomweb?StudyInstanceUIDs=...`
- `DataSourceWrapper`가 초기화 담당

**Hanging Protocol**:
- 의료 영상 뷰어의 레이아웃 자동 설정 규칙
- Mode 진입 시 자동으로 적용
- URL로 override 가능: `?hangingProtocolId=hpUSMPR`

**Services 초기화 흐름**:
```
Mode/Mode.tsx
  → extensionManager.onModeEnter()
  → displaySetService.init()
  → hangingProtocolService.setActiveProtocolIds()
  → mode.onModeEnter()
  → route.init()
```

**관련 폴더 링크**:
- `platform/core/src/DataSource/` - 데이터 소스 인터페이스
- `extensions/default/src/DicomWebDataSource/` - DICOMweb 데이터 소스 구현
- `modes/usmpr/src/index.tsx` - Mode 정의 예시
- `platform/app/src/App.tsx` - 루트 컴포넌트 (라우터 설정)
- `platform/app/src/routes/Login/CLAUDE.md` - 로그인 모듈 상세 문서 ⭐
- `platform/app/src/utils/CLAUDE.md` - 인증 유틸리티 (AuthStateSync) 문서 ⭐
- `platform/app/src/utils/authStateSync.ts` - 세션 동기화 핵심 로직
- `platform/app/src/utils/AuthStateListener.tsx` - Fetch Interceptor, 전역 리스너

### 1.5. 초보 개발자용 학습 가이드

**추천 학습 순서**:

1. **React Router 기초 학습** (필수 선행 학습, 1-2시간)
   - React Router 공식 문서 읽기
   - `useParams`, `useLocation`, `useNavigate` 이해
   - `<Routes>`, `<Route>` 컴포넌트 사용법

2. **간단한 라우트 먼저 이해** (30분)
   - `index.tsx` 읽기 (전체 구조 파악)
   - `bakedInRoutes` 배열 확인
   - `/debug`, `/notfoundserver` 같은 고정 라우트 이해

3. **동적 라우트 생성 로직** (1시간)
   - `buildModeRoutes.tsx` 읽기
   - Mode와 DataSource 조합으로 라우트 생성하는 원리 파악
   - `forEach` 중첩으로 모든 조합 생성하는 패턴 이해

4. **데이터 로딩 컨테이너** (1-2시간)
   - `DataSourceWrapper.tsx` 읽기 (WorkList용)
   - `useEffect`로 데이터 fetching하는 패턴 이해
   - 로딩 상태 관리 (`isLoading`, `setData`) 파악

5. **Mode 초기화 로직** (2-3시간, 고급)
   - `Mode/Mode.tsx` 읽기 (복잡함)
   - 여러 `useEffect`가 순차적으로 실행되는 흐름 추적
   - Extension 로딩 → 데이터 로딩 → 레이아웃 설정 → 초기화
   - cleanup 함수 (`return () => {}`)의 역할 이해

6. **실제 URL과 매칭** (30분)
   - 브라우저에서 `/` 입력 → WorkList 렌더링 확인
   - `/usmpr?StudyInstanceUIDs=1.2.3` 입력 → Mode 화면 확인
   - 개발자 도구 Network 탭에서 데이터 요청 확인

7. **로그인 시스템 이해** (2-3시간, 고급 - 선택) ⭐
   - `Login/CLAUDE.md` 문서 읽기
   - `utils/authStateSync.ts` - 세션 동기화 핵심 로직
   - `utils/AuthStateListener.tsx` - Fetch Interceptor 패턴
   - Web Crypto API, Storage Events, Singleton 패턴 학습

**이 폴더를 이해하면 할 수 있는 것**:
- OHIF에 새로운 페이지/라우트 추가 (예: 설정 페이지, 리포트 페이지)
- Mode별 초기화 로직 커스터마이징
- URL 쿼리 파라미터를 사용한 뷰어 동작 제어
- 데이터 로딩과 라우팅을 결합한 컨테이너 컴포넌트 패턴 습득
- React Router + OHIF Services 통합 방법 이해
- **다중 탭 세션 공유 및 자동 만료 시스템 구현** ⭐
