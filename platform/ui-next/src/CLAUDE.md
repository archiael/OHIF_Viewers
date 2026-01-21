# 폴더별 상세 분석 (리액트 초보자용)

## 목차
1. [platform/ui-next/src](#1-platformui-nextsrc)
   - 1.1. [모듈 개요](#1.1-모듈-개요)
   - 1.2. [주요 파일/컴포넌트 리스트](#1.2-주요-파일컴포넌트-리스트)
   - 1.3. [리액트 관점에서 볼 포인트](#1.3-리액트-관점에서-볼-포인트)
   - 1.4. [OHIF 특유 개념 정리](#1.4-ohif-특유-개념-정리)
   - 1.5. [초보 개발자용 학습 가이드](#1.5-초보-개발자용-학습-가이드)

---


## 1. platform/ui-next/src

### 1.1. 모듈 개요

`platform/ui-next/src`는 **차세대 UI 컴포넌트 라이브러리**로, shadcn/ui와 Radix UI를 기반으로 구축되었습니다. OHIF 뷰어의 메인 화면(뷰어 모드)에서 사용되는 대부분의 UI를 제공합니다.

- **전체 앱에서의 역할**:
  - 뷰어 화면의 모든 UI 컴포넌트 제공 (헤더, 사이드패널, 툴바, 다이얼로그 등)
  - Context Provider를 통한 전역 상태 관리
  - 커스텀 훅으로 UI 상태 접근 제공

- **화면 연결**:
  - 주로 Viewer 모드 (예: USMPR, Longitudinal 모드)에서 사용
  - Modal, Dialog, Notification 등 전역 UI 요소

- **상위 모듈**: `platform/app` 및 `modes/` (각 모드)에서 사용
- **하위 모듈**: `components/`, `contextProviders/`, `hooks/`, `utils/`

### 1.2. 주요 파일/컴포넌트 리스트

**Context Providers (전역 상태 관리)**:
- `NotificationProvider.tsx`: 알림(토스트) 메시지 관리
- `ModalProvider.tsx`: 모달 다이얼로그 관리
- `DialogProvider.tsx`: 경량 다이얼로그 관리
- `ViewportGridProvider.tsx`: 뷰포트 그리드 상태 관리
- `ImageViewerProvider.tsx`: 이미지 뷰어 전역 상태
- `UserAuthenticationProvider.tsx`: 사용자 인증 상태

**고급 UI 컴포넌트**:
- `Header/Header.tsx`: 상단 헤더바
- `SidePanel/SidePanel.tsx`: 좌/우 사이드 패널
- `StudyBrowser/StudyBrowser.tsx`: 썸네일 브라우저
- `Viewport/Viewport.tsx`: 의료 영상 표시 영역
- `Modal/Modal.tsx`, `Dialog/Dialog.tsx`: 팝업 UI
- `LayoutSelector/LayoutSelector.tsx`: 레이아웃 선택기
- `MeasurementTable/MeasurementTable.tsx`: 측정값 테이블

**기본 UI 컴포넌트 (shadcn/ui 스타일)**:
- `Button/Button.tsx`: 버튼 (variant 지원)
- `Input/Input.tsx`: 입력 필드
- `Select/Select.tsx`, `Combobox/Combobox.tsx`: 선택 UI
- `Checkbox/Checkbox.tsx`, `Switch/Switch.tsx`: 토글 UI
- `Tabs/Tabs.tsx`, `Accordion/Accordion.tsx`: 레이아웃 UI

**커스텀 훅**:
- `useSessionStorage.tsx`: 세션 스토리지 상태 관리 훅
- `useDynamicMaxHeight.ts`: 동적 높이 계산 훅
- (Context Providers에서 제공하는 훅들: `useNotification`, `useModal`, `useDialog` 등)

**데이터 흐름 다이어그램**:
```
App (platform/app/src/App.tsx)
  └─ Providers 초기화
      ├─ NotificationProvider
      ├─ ModalProvider
      ├─ ImageViewerProvider
      └─ ... (기타 Provider)
          ↓
Mode Route (예: USMPR)
  ├─ Header (헤더바)
  ├─ SidePanel (좌측 패널)
  │   └─ StudyBrowser (썸네일)
  ├─ ViewportGrid (중앙 뷰어)
  │   └─ Viewport × N
  └─ SidePanel (우측 패널)
      └─ MeasurementTable

컴포넌트에서 훅 사용:
  useNotification() → NotificationProvider 상태 접근
  useModal() → ModalProvider 상태 접근
```

### 1.3. 리액트 관점에서 볼 포인트

**상태 관리 방식**:

1. **Context API 패턴 (전역 상태)**:
   - Provider 컴포넌트가 Context를 제공
   - 커스텀 훅으로 Context 소비
   ```tsx
   // NotificationProvider.tsx
   const NotificationContext = createContext();

   export const NotificationProvider = ({ children }) => {
     const [notifications, setNotifications] = useState([]);
     return (
       <NotificationContext.Provider value={{ notifications, setNotifications }}>
         {children}
       </NotificationContext.Provider>
     );
   };

   export const useNotification = () => {
     return useContext(NotificationContext);
   };

   // 사용하는 컴포넌트에서:
   const { notifications } = useNotification();
   ```

2. **컨테이너 vs 프레젠테이션**:
   - **프레젠테이션**: `Button`, `Input`, `Card` 등 → 순수 UI, props만 사용
   - **컨테이너**: `StudyBrowser`, `MeasurementTable` → 비즈니스 로직 + UI, OHIF Services 사용
   - **복합형**: `Header`, `SidePanel` → 자식 컴포넌트 조합 + 일부 로직

3. **Props 드릴링 vs Context**:
   - 깊은 컴포넌트 트리에서 Context 사용 (예: 알림, 모달)
   - 직접적인 부모-자식 관계는 props 사용

4. **OHIF Services 통합**:
   - OHIF의 ServicesManager를 통해 비즈니스 로직 접근
   - 예: `servicesManager.services.uiNotificationService.show()`
   - UI 컴포넌트는 Services를 직접 호출하지 않고, Provider가 중개 역할

**재사용 가능한 UI 패턴**:

1. **Compound Components (합성 컴포넌트)**:
   ```tsx
   <Tabs>
     <TabsList>
       <TabsTrigger>Tab 1</TabsTrigger>
     </TabsList>
     <TabsContent>Content 1</TabsContent>
   </Tabs>
   ```

2. **Render Props 패턴**:
   ```tsx
   <Modal>
     {({ close }) => <Button onClick={close}>닫기</Button>}
   </Modal>
   ```

3. **HOC (Higher-Order Component) 패턴**:
   ```tsx
   // ErrorBoundary로 컴포넌트 감싸기
   export { ErrorBoundary } from './Errorboundary';
   ```

**커스텀 훅**:
- `useNotification()`: 알림 표시 함수 반환
- `useModal()`: 모달 열기/닫기 함수 반환
- `useDialog()`: 다이얼로그 제어 함수 반환
- `useViewportGrid()`: 뷰포트 그리드 상태/제어
- `useSessionStorage(key, defaultValue)`: 세션 스토리지를 React 상태처럼 사용

### 1.4. OHIF 특유 개념 정리

**Context Providers와 OHIF Services 연동**:
- OHIF는 자체 Services 아키텍처를 가지고 있음 (PubSub 패턴)
- ui-next의 Provider들은 이 Services를 React Context로 감싸는 역할
- 예시:
  ```tsx
  // OHIF Service 호출
  servicesManager.services.uiNotificationService.show({ message: '알림' });

  // React 컴포넌트에서는 Context 사용
  const { show } = useNotification();
  show({ message: '알림' });
  ```

**Viewport 개념**:
- Viewport = 의료 영상을 표시하는 캔버스 영역
- `ViewportGridProvider`가 여러 Viewport의 레이아웃 관리
- Cornerstone3D 라이브러리가 실제 렌더링 담당

**Study Browser**:
- DICOM 연구(Study)의 썸네일 목록
- 시리즈(Series) 단위로 그룹화
- 드래그앤드롭으로 Viewport에 표시

**관련 폴더 링크**:
- `platform/core/src/services/` - OHIF Services 구현
- `extensions/cornerstone/` - Viewport 렌더링 확장
- `modes/usmpr/` - ui-next 컴포넌트를 조합하여 사용하는 모드 예시
- `platform/ui/src` - 레거시 UI 컴포넌트

### 1.5. 초보 개발자용 학습 가이드

**추천 학습 순서**:

1. **Context API 기본 이해** (1시간)
   - React 공식 문서에서 Context API 학습
   - `NotificationProvider.tsx` 읽기 (가장 단순한 예시)
   - `useNotification` 훅이 어떻게 Context를 소비하는지 확인

2. **기본 UI 컴포넌트 탐색** (30분)
   - `Button.tsx`, `Input.tsx` 읽기
   - variant, size 등 props로 스타일 변경하는 패턴 이해

3. **Provider 패턴 이해** (1시간)
   - `ModalProvider.tsx`, `DialogProvider.tsx` 읽기
   - Provider가 상태를 관리하고, 훅으로 노출하는 패턴 파악
   - `index.ts`에서 어떻게 export되는지 확인

4. **복합 컴포넌트 분석** (1-2시간)
   - `StudyBrowser/StudyBrowser.tsx` 읽기
   - OHIF Services를 어떻게 사용하는지 확인
   - 썸네일 클릭 → Viewport 변경 흐름 추적

5. **실제 사용처 확인** (1시간)
   - `modes/usmpr/src/index.tsx` 읽기
   - 어떤 ui-next 컴포넌트들이 조합되는지 확인
   - layoutTemplate에서 Panel 구성하는 방식 이해

**이 폴더를 이해하면 할 수 있는 것**:
- OHIF 뷰어의 UI를 커스터마이징 (헤더, 사이드패널, 툴바 등)
- Context API를 사용한 전역 상태 관리 패턴 습득
- shadcn/ui 스타일의 재사용 가능한 컴포넌트 라이브러리 구축 방법 이해
- OHIF Services와 React UI를 연동하는 방법 습득
