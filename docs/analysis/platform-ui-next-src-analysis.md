# platform/ui-next/src 분석

## 1. 모듈 개요

`platform/ui-next/src`는 **차세대 UI 컴포넌트 라이브러리**로, OHIF Viewer의 모던한 UI 계층을 담당합니다. shadcn/ui 디자인 시스템과 Radix UI 프리미티브를 기반으로 구축되었으며, Tailwind CSS를 사용하여 스타일링합니다.

### 전체 OHIF 리액트 앱에서의 책임

- **UI 컴포넌트 제공**: 버튼, 입력 필드, 다이얼로그 등 기본 UI부터 StudyBrowser, MeasurementTable 같은 복잡한 의료 영상 특화 컴포넌트까지 제공
- **전역 상태 관리**: Context API를 통해 알림(Notification), 모달(Modal), 뷰포트 그리드(ViewportGrid) 등의 전역 상태 관리
- **OHIF Services 통합**: OHIF의 PubSub 기반 Services를 React Context로 래핑하여 React 컴포넌트에서 쉽게 사용할 수 있도록 중개
- **재사용 가능한 UI 패턴**: 의료 영상 뷰어 개발에 필요한 공통 UI 패턴을 컴포넌트화하여 제공

### 어떤 화면/기능과 연결되는지

- **Viewer 모드 전체**: USMPR, Longitudinal, Basic 등 모든 모드에서 사용
- **헤더(Header)**: 상단 네비게이션 바, 환자 정보, 설정 메뉴
- **사이드 패널(SidePanel)**: 좌/우측 패널에서 StudyBrowser, MeasurementTable 등 표시
- **뷰포트(Viewport)**: 의료 영상을 표시하는 중앙 영역
- **모달/다이얼로그**: 설정, 측정 입력 등 팝업 UI
- **알림(Toast)**: 사용자에게 피드백 제공

### 상위/하위 모듈 관계

**상위 모듈** (이 모듈을 사용하는 곳):
- `platform/app` - 메인 애플리케이션에서 Provider 초기화
- `modes/*` - 각 모드에서 컴포넌트 조합하여 화면 구성
- `extensions/*` - 확장 프로그램에서 UI 컴포넌트 사용

**하위 모듈** (이 모듈이 의존하는 곳):
- `@ohif/core` - Services, Utils 등 핵심 비즈니스 로직
- `@radix-ui/*` - UI 프리미티브 (접근성 지원 컴포넌트)
- `tailwindcss` - 스타일링 프레임워크
- `framer-motion` - 애니메이션 라이브러리

---

## 2. 주요 파일/컴포넌트 리스트

### 디렉토리 구조

```
platform/ui-next/src/
├── components/           # UI 컴포넌트 (72개 디렉토리)
│   ├── Button/          # 기본 버튼 컴포넌트
│   ├── Input/           # 입력 필드
│   ├── Dialog/          # 다이얼로그/모달
│   ├── Header/          # 상단 헤더바
│   ├── SidePanel/       # 좌/우 사이드 패널
│   ├── StudyBrowser/    # 썸네일 브라우저
│   ├── Viewport/        # 뷰포트 관련 컴포넌트
│   ├── MeasurementTable/# 측정값 테이블
│   ├── SegmentationTable/ # 세그멘테이션 테이블
│   └── ...             # 기타 72개 컴포넌트
├── contextProviders/    # Context API 제공자
│   ├── NotificationProvider.tsx  # 알림 관리
│   ├── ModalProvider.tsx        # 모달 관리
│   ├── DialogProvider.tsx       # 다이얼로그 관리
│   ├── ViewportGridProvider.tsx # 뷰포트 그리드 상태
│   ├── ImageViewerProvider.tsx  # 이미지 뷰어 전역 상태
│   ├── UserAuthenticationProvider.tsx # 사용자 인증
│   └── ...
├── hooks/              # 커스텀 훅
│   ├── useSessionStorage.tsx    # 세션 스토리지 상태 관리
│   └── useDynamicMaxHeight.ts   # 동적 높이 계산
├── utils/              # 유틸리티 함수
│   ├── formatDICOMDate.ts       # DICOM 날짜 포맷팅
│   ├── roundNumber.ts           # 숫자 반올림
│   └── cn.ts                    # Tailwind 클래스 병합
├── lib/                # 외부 라이브러리 래퍼
│   └── utils.ts        # clsx + tailwind-merge 통합
├── types/              # TypeScript 타입 정의
│   ├── ActionCorners.ts
│   ├── ViewportActionCornersTypes.ts
│   └── ...
├── assets/             # 폰트, 이미지 등 정적 리소스
├── index.ts            # 메인 진입점 (모든 export)
└── tailwind.css        # Tailwind 기본 스타일
```

### 핵심 컴포넌트 카테고리별 정리

#### A. Context Providers (전역 상태 관리)

| 파일명 | 역할 | 제공하는 훅 |
|--------|------|------------|
| `NotificationProvider.tsx` | 토스트 알림 관리, 중복 알림 방지 | `useNotification()` |
| `ModalProvider.tsx` | 모달 다이얼로그 열기/닫기 | `useModal()` |
| `DialogProvider.tsx` | 경량 다이얼로그 관리 | `useDialog()` |
| `ViewportGridProvider.tsx` | 뷰포트 그리드 레이아웃 상태 (18KB, 복잡) | `useViewportGrid()` |
| `ImageViewerProvider.tsx` | 이미지 뷰어 전역 상태 | `useImageViewer()` |
| `UserAuthenticationProvider.tsx` | 사용자 인증 상태 | `useUserAuthentication()` |
| `CineProvider.tsx` | 시네 루프 재생 상태 | `useCine()` |
| `DragAndDropProvider.tsx` | 드래그앤드롭 상태 관리 | - |

#### B. 복잡한 의료 영상 특화 컴포넌트

| 컴포넌트 | 역할 | 주요 Props | 특징 |
|----------|------|-----------|------|
| `Header` | 상단 헤더바 | `menuOptions`, `PatientInfo`, `UndoRedo` | 로고, 환자 정보, 설정 메뉴 표시 |
| `StudyBrowser` | 썸네일 브라우저 | `tabs`, `expandedStudyInstanceUIDs`, `onClickThumbnail` | Study/Series 계층 구조 표시 |
| `StudyItem` | Study 단위 아이템 | `displaySets`, `modalities`, `isExpanded` | 접기/펼치기 가능 |
| `Thumbnail` | 썸네일 이미지 | `displaySetInstanceUID`, `dragData` | 드래그앤드롭 지원 |
| `MeasurementTable` | 측정값 테이블 | `measurements`, `onEdit`, `onDelete` | 측정 데이터 CRUD |
| `SegmentationTable` | 세그멘테이션 테이블 | `segmentations`, `onSegmentClick` | 세그멘테이션 데이터 관리 |
| `ViewportGrid` | 뷰포트 그리드 컨테이너 | `numRows`, `numCols`, `layoutType` | 여러 뷰포트를 그리드로 배치 |
| `ViewportPane` | 개별 뷰포트 영역 | `viewportId`, `displaySetInstanceUIDs` | 의료 영상 표시 영역 |
| `SidePanel` | 좌/우 사이드 패널 | `side`, `children` | 접기/펼치기 가능한 패널 |

#### C. 기본 UI 컴포넌트 (shadcn/ui 스타일)

| 컴포넌트 | 역할 | 주요 Variants | Radix UI 기반 |
|----------|------|---------------|---------------|
| `Button` | 버튼 | `default`, `destructive`, `outline`, `ghost`, `link` | Slot 사용 |
| `Input` | 입력 필드 | - | - |
| `Select` | 드롭다운 선택 | - | @radix-ui/react-select |
| `Checkbox` | 체크박스 | - | @radix-ui/react-checkbox |
| `Switch` | 토글 스위치 | - | @radix-ui/react-switch |
| `Slider` | 슬라이더 | - | @radix-ui/react-slider |
| `Dialog` | 다이얼로그 | - | @radix-ui/react-dialog |
| `DropdownMenu` | 드롭다운 메뉴 | - | @radix-ui/react-dropdown-menu |
| `Tabs` | 탭 | - | @radix-ui/react-tabs |
| `Accordion` | 아코디언 | - | @radix-ui/react-accordion |
| `Tooltip` | 툴팁 | - | @radix-ui/react-tooltip |
| `Popover` | 팝오버 | - | @radix-ui/react-popover |

#### D. 레이아웃/유틸리티 컴포넌트

| 컴포넌트 | 역할 |
|----------|------|
| `Card` | 카드 컨테이너 (Header, Content, Footer) |
| `Separator` | 구분선 |
| `ScrollArea` | 스크롤 가능 영역 |
| `Resizable` | 크기 조절 가능한 패널 (react-resizable-panels 래퍼) |
| `ErrorBoundary` | 에러 경계 (React Error Boundary) |
| `ThemeWrapper` | 테마 래퍼 (다크 모드 지원) |

#### E. OHIF 특화 UI

| 컴포넌트 | 역할 |
|----------|------|
| `CinePlayer` | 시네 루프 재생 컨트롤 |
| `LayoutSelector` | 레이아웃 선택기 (1x1, 2x2, 3x3 등) |
| `ToolboxUI` | 도구 상자 UI |
| `ToolSettings` | 도구 설정 패널 |
| `WindowLevel` | Window/Level 조정 UI |
| `WindowLevelHistogram` | 히스토그램 표시 |
| `Onboarding` | 온보딩 튜토리얼 (Shepherd.js 래퍼) |

### 주요 파일별 역할

| 파일 | 라인 수 | 역할 |
|------|---------|------|
| `index.ts` | 293줄 | 메인 진입점, 모든 컴포넌트/훅/유틸 export |
| `components/index.ts` | 276줄 | 모든 컴포넌트 re-export |
| `contextProviders/index.ts` | 24줄 | 모든 Provider와 훅 export |
| `contextProviders/NotificationProvider.tsx` | 248줄 | 알림 시스템 구현 (중복 방지 로직 포함) |
| `contextProviders/ViewportGridProvider.tsx` | ~500줄 | 뷰포트 그리드 상태 관리 (가장 복잡) |
| `hooks/useSessionStorage.tsx` | 72줄 | 세션 스토리지 훅 (페이지 언로드 시 자동 정리) |
| `lib/utils.ts` | 7줄 | cn() 함수 (clsx + tailwind-merge) |

### 컴포넌트 간 관계 / 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                       App (platform/app)                        │
│                                                                 │
│  ┌───────────────────── Providers 초기화 ──────────────────┐  │
│  │ <NotificationProvider service={uiNotificationService}>   │  │
│  │   <ModalProvider service={uiModalService}>               │  │
│  │     <ViewportGridProvider service={viewportGridService}> │  │
│  │       <ImageViewerProvider>                              │  │
│  │         <UserAuthenticationProvider>                     │  │
│  │           {children} ← Mode Routes                       │  │
│  │         </UserAuthenticationProvider>                    │  │
│  │       </ImageViewerProvider>                             │  │
│  │     </ViewportGridProvider>                              │  │
│  │   </ModalProvider>                                       │  │
│  │ </NotificationProvider>                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Mode Route (예: USMPR)                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ <Header                                                  │  │
│  │   menuOptions={...}                                      │  │
│  │   PatientInfo={<PatientInfo />}                          │  │
│  │   UndoRedo={<UndoRedo />}                                │  │
│  │ />                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────┬──────────────────────────┬────────────────────┐ │
│  │ SidePanel │     ViewportGrid         │    SidePanel       │ │
│  │  (left)   │                          │     (right)        │ │
│  │           │  ┌─────┬─────┐           │                    │ │
│  │  ┌─────┐  │  │ VP1 │ VP2 │           │  ┌──────────────┐ │ │
│  │  │Study│  │  ├─────┼─────┤           │  │ Measurement  │ │ │
│  │  │Brow │  │  │ VP3 │ VP4 │           │  │   Table      │ │ │
│  │  │ser  │  │  └─────┴─────┘           │  └──────────────┘ │ │
│  │  └─────┘  │                          │                    │ │
│  │           │  (ViewportPane × 4)       │                    │ │
│  └───────────┴──────────────────────────┴────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                  컴포넌트에서 훅 사용
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              const { show } = useNotification();                │
│              show({ type: 'success', message: '저장됨' });       │
│                                                                 │
│              const { setActiveViewportId } = useViewportGrid(); │
│              setActiveViewportId('mpr-0');                      │
│                                                                 │
│              const { show: showModal } = useModal();            │
│              showModal(<PresetDialog />);                       │
└─────────────────────────────────────────────────────────────────┘
```

### 데이터 흐름 상세 (예: Thumbnail 클릭 → Viewport 업데이트)

```
User clicks Thumbnail (StudyBrowser)
  ↓
StudyBrowser.tsx:
  onClickThumbnail(displaySetInstanceUID) 호출
  ↓
Mode (예: usmpr/index.tsx):
  handleThumbnailClick 핸들러 실행
  ↓
ViewportGridProvider의 setDisplaySetsForViewport() 호출
  (useViewportGrid 훅 통해 접근)
  ↓
ViewportGridProvider 내부:
  - Reducer에서 상태 업데이트
  - viewports Map에 displaySetInstanceUIDs 설정
  - OHIF Core의 ViewportGridService에 이벤트 발행 (PubSub)
  ↓
Cornerstone Extension:
  - ViewportGridService 이벤트 구독
  - Cornerstone3D API로 실제 영상 렌더링
  ↓
ViewportPane 리렌더링
  - 새 displaySetInstanceUIDs로 영상 표시
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### A. Context API 패턴 (전역 상태)

**기본 구조**:
```tsx
// 1. Context 생성
const NotificationContext = createContext(null);

// 2. Provider 컴포넌트 정의
const NotificationProvider = ({ children, service }) => {
  const [options, setOptions] = useState([]);

  const show = useCallback(options => {
    // 알림 표시 로직
    toast[type](title, { description: message });
  }, []);

  const hide = useCallback(id => {
    toast.dismiss(id);
  }, []);

  // OHIF Service와 연동
  useEffect(() => {
    if (service) {
      service.setServiceImplementation({ hide, show });
    }
  }, [service, hide, show]);

  return (
    <NotificationContext.Provider value={{ show, hide }}>
      <Toaster position="bottom-right" />
      {children}
    </NotificationContext.Provider>
  );
};

// 3. 커스텀 훅으로 Context 소비
export const useNotification = () => useContext(NotificationContext);

// 4. 컴포넌트에서 사용
const MyComponent = () => {
  const { show } = useNotification();

  const handleSave = () => {
    show({ type: 'success', message: '저장되었습니다.' });
  };

  return <Button onClick={handleSave}>저장</Button>;
};
```

**주요 Provider별 상태 관리 방식**:

| Provider | 상태 관리 방법 | 복잡도 |
|----------|---------------|--------|
| NotificationProvider | `useState` (알림 옵션 배열) | 낮음 |
| ModalProvider | `useState` (현재 모달 컴포넌트) | 낮음 |
| ViewportGridProvider | `useReducer` (복잡한 상태 + 액션) | 높음 |
| CineProvider | `useState` + `useRef` (재생 상태) | 중간 |

**ViewportGridProvider의 useReducer 패턴** (복잡한 상태 관리 예시):
```tsx
const DEFAULT_STATE = {
  activeViewportId: null,
  layout: { numRows: 0, numCols: 0, layoutType: 'grid' },
  viewports: new Map([...]),
  isHangingProtocolLayout: false,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_ACTIVE_VIEWPORT_ID':
      return { ...state, activeViewportId: action.payload };
    case 'SET_LAYOUT':
      return { ...state, layout: action.payload };
    case 'SET_DISPLAYSETS_FOR_VIEWPORT':
      // 복잡한 로직...
      return newState;
    default:
      return state;
  }
};

const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
```

#### B. OHIF Services와의 통합 패턴

OHIF는 자체 Services 아키텍처(PubSub 패턴)를 가지고 있습니다. ui-next의 Provider들은 이를 React Context로 래핑하여 React 컴포넌트에서 쉽게 사용할 수 있게 합니다.

**통합 흐름**:
```
OHIF Service (platform/core)
    ↓ (service.setServiceImplementation)
Context Provider (platform/ui-next)
    ↓ (useContext)
React Component
```

**예시 (NotificationProvider)**:
```tsx
// OHIF Service 초기화 시
const uiNotificationService = new UINotificationService();

// Provider에 service prop으로 전달
<NotificationProvider service={uiNotificationService}>
  {children}
</NotificationProvider>

// Provider 내부에서 구현 등록
useEffect(() => {
  if (service) {
    service.setServiceImplementation({ hide, show });
  }
}, [service, hide, show]);

// 이제 두 가지 방법으로 사용 가능:
// 1. React 컴포넌트에서: const { show } = useNotification();
// 2. 일반 JS 코드에서: uiNotificationService.show({ ... });
```

#### C. 컨테이너 vs 프레젠테이션 패턴

**프레젠테이션 컴포넌트** (Presentational):
- 순수 UI, props만 사용
- 비즈니스 로직 없음
- 재사용 가능
- 예: `Button`, `Input`, `Card`, `Slider`

```tsx
// Button.tsx
const Button = ({ variant, size, onClick, children }) => (
  <button
    className={cn(buttonVariants({ variant, size }))}
    onClick={onClick}
  >
    {children}
  </button>
);
```

**컨테이너 컴포넌트** (Container):
- 비즈니스 로직 포함
- OHIF Services 사용
- 상태 관리
- 예: `StudyBrowser`, `MeasurementTable`

```tsx
// StudyBrowser.tsx
const StudyBrowser = ({ servicesManager, onClickThumbnail }) => {
  const { displaySetService } = servicesManager.services;
  const [studies, setStudies] = useState([]);

  useEffect(() => {
    // Service에서 데이터 가져오기
    const displaySets = displaySetService.getActiveDisplaySets();
    setStudies(groupByStudy(displaySets));
  }, [displaySetService]);

  return (
    <div>
      {studies.map(study => (
        <StudyItem {...study} onClick={onClickThumbnail} />
      ))}
    </div>
  );
};
```

**복합 컴포넌트** (Compound):
- 프레젠테이션 + 컨테이너 특성 모두
- 자식 컴포넌트 조합
- 예: `Header`, `SidePanel`

```tsx
// Header.tsx
const Header = ({ menuOptions, PatientInfo, UndoRedo }) => (
  <NavBar>
    <div className="left">
      <Icons.OHIFLogo />
    </div>
    <div className="center">{children}</div>
    <div className="right">
      {UndoRedo}
      {PatientInfo}
      <DropdownMenu>
        {menuOptions.map(option => (
          <DropdownMenuItem onClick={option.onClick}>
            {option.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </div>
  </NavBar>
);
```

### 재사용 가능한 UI 컴포넌트 패턴

#### A. Compound Components (합성 컴포넌트)

관련된 여러 컴포넌트를 함께 사용하여 하나의 기능을 구성하는 패턴입니다.

```tsx
// Tabs 사용 예시
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    Account settings here
  </TabsContent>
  <TabsContent value="password">
    Password settings here
  </TabsContent>
</Tabs>

// Dialog 사용 예시
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>This action cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button>Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**장점**:
- 유연한 구성: 필요한 부분만 조합 가능
- 명확한 의미: 각 부분이 명확한 역할을 가짐
- 타입 안전성: TypeScript로 관계 검증

#### B. Variant Props 패턴 (CVA - Class Variance Authority)

스타일 변형을 props로 제어하는 패턴입니다.

```tsx
// Button.tsx
const buttonVariants = cva(
  // 기본 클래스
  'inline-flex items-center justify-center rounded transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border border-primary bg-background hover:bg-primary/25',
        ghost: 'hover:bg-primary/25',
      },
      size: {
        default: 'h-7 px-2',
        sm: 'h-6 px-2',
        lg: 'h-9 px-2',
        icon: 'h-6 w-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

// 사용
<Button variant="destructive" size="lg">Delete</Button>
<Button variant="ghost" size="icon"><Icons.Close /></Button>
```

#### C. Render Props 패턴

자식 컴포넌트에 함수를 전달하여 렌더링 로직을 제어하는 패턴입니다.

```tsx
// Modal 예시 (실제 구현은 더 복잡할 수 있음)
<Modal>
  {({ close }) => (
    <div>
      <h2>Title</h2>
      <p>Content</p>
      <Button onClick={close}>Close</Button>
    </div>
  )}
</Modal>
```

#### D. Slot 패턴 (Radix UI)

컴포넌트의 루트 요소를 대체할 수 있게 하는 패턴입니다.

```tsx
// Button.tsx
const Button = ({ asChild, children, ...props }) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp {...props}>{children}</Comp>;
};

// 사용: Button을 <a> 태그로 렌더링
<Button asChild>
  <a href="/home">Go Home</a>
</Button>
// 결과: <a href="/home" class="button-classes">Go Home</a>
```

#### E. Forwarding Refs 패턴

부모 컴포넌트에서 자식의 DOM 노드에 직접 접근할 수 있게 하는 패턴입니다.

```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, forwardRef) => {
    return (
      <button
        ref={forwardRef}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

// 사용
const buttonRef = useRef<HTMLButtonElement>(null);
<Button ref={buttonRef}>Click</Button>
// buttonRef.current.focus() 가능
```

### 커스텀 훅

#### A. useSessionStorage

세션 스토리지를 React 상태처럼 사용할 수 있게 하는 훅입니다.

**기능**:
- 세션 스토리지와 자동 동기화
- 페이지 언로드 시 자동 정리 옵션
- JSON 직렬화/역직렬화 자동 처리

**사용법**:
```tsx
const [layoutConfig, setLayoutConfig] = useSessionStorage({
  key: 'usmpr-layout-config',
  defaultValue: { numRows: 2, numCols: 2 },
  clearOnUnload: true, // 페이지 종료 시 자동 삭제
});

// 일반 useState처럼 사용
setLayoutConfig({ numRows: 3, numCols: 3 });
```

**내부 구조**:
```tsx
const useSessionStorage = ({ key, defaultValue, clearOnUnload }) => {
  // 1. 초기값 로드
  const valueFromStorage = window.sessionStorage.getItem(key);
  const storageValue = valueFromStorage ? JSON.parse(valueFromStorage) : defaultValue;

  // 2. React 상태로 관리
  const [sessionItem, setSessionItem] = useState({ ...storageValue });

  // 3. 업데이트 함수
  const updateSessionItem = useCallback(value => {
    setSessionItem({ ...value });
    window.sessionStorage.setItem(key, JSON.stringify(value));

    // clearOnUnload 옵션 처리
    if (clearOnUnload) {
      sessionItemsToClearOnUnload.set(key, JSON.stringify(value));
    }
  }, []);

  return [sessionItem, updateSessionItem];
};
```

**clearOnUnload 동작 원리**:
```tsx
// 페이지 숨김 시 (탭 전환, 페이지 종료 등)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // clearOnUnload=true인 항목들 제거
    sessionItemsToClearOnUnload.forEach((value, key) => {
      window.sessionStorage.removeItem(key);
    });
  } else {
    // 다시 보이면 복원 (탭 복귀 시)
    sessionItemsToClearOnUnload.forEach((value, key) => {
      window.sessionStorage.setItem(key, value);
    });
  }
});
```

#### B. useDynamicMaxHeight

컨테이너의 최대 높이를 동적으로 계산하는 훅입니다.

**사용 사례**:
- 화면 크기에 따라 스크롤 영역 높이 조정
- 헤더/푸터를 제외한 남은 높이 계산

```tsx
const { maxHeight } = useDynamicMaxHeight(
  containerRef,
  { offset: 100 } // 헤더/푸터 등 제외할 높이
);

<ScrollArea style={{ maxHeight }}>{content}</ScrollArea>
```

#### C. Context 기반 커스텀 훅들

각 Provider마다 대응하는 커스텀 훅이 있습니다.

| 훅 | 제공하는 기능 | 반환값 |
|----|--------------|--------|
| `useNotification()` | 알림 표시/숨기기 | `{ show, hide, hideAll }` |
| `useModal()` | 모달 열기/닫기 | `{ show, hide }` |
| `useDialog()` | 다이얼로그 제어 | `{ create, dismiss }` |
| `useViewportGrid()` | 뷰포트 그리드 상태 접근 | `{ getState, setActiveViewportId, setLayout, ... }` |
| `useImageViewer()` | 이미지 뷰어 전역 상태 | `{ activeViewportId, ... }` |
| `useCine()` | 시네 재생 제어 | `{ isPlaying, fps, play, stop }` |
| `useSegmentationTableContext()` | 세그멘테이션 테이블 상태 | `{ segmentations, onSegmentClick }` |

**사용 예시**:
```tsx
const MyComponent = () => {
  const { show } = useNotification();
  const { setActiveViewportId } = useViewportGrid();
  const { show: showModal } = useModal();

  const handleSave = async () => {
    try {
      await saveData();
      show({ type: 'success', message: '저장 완료' });
    } catch (error) {
      show({ type: 'error', message: error.message });
    }
  };

  const handleLayoutChange = () => {
    setActiveViewportId('mpr-0');
  };

  const handleOpenSettings = () => {
    showModal(<UserPreferencesModal />);
  };

  return <div>...</div>;
};
```

### Props vs Context 사용 기준

**Props를 사용하는 경우**:
- 직접적인 부모-자식 관계 (1-2 레벨)
- 컴포넌트 재사용성이 중요할 때
- 명시적인 데이터 흐름을 원할 때

```tsx
<Button variant="destructive" onClick={handleDelete}>
  Delete
</Button>
```

**Context를 사용하는 경우**:
- 깊은 컴포넌트 트리 (3+ 레벨)
- 전역 상태 (알림, 모달, 테마 등)
- 여러 컴포넌트에서 공유해야 하는 데이터

```tsx
// 어느 깊이의 컴포넌트에서나 사용 가능
const { show } = useNotification();
```

---

## 4. OHIF 특유 개념 정리

### Context Providers와 OHIF Services 연동

OHIF는 자체 **Services 아키텍처**를 가지고 있습니다. 이는 PubSub 패턴을 기반으로 합니다.

**OHIF Services 구조** (`platform/core/src/services/`):
```
ServicesManager
  ├─ DisplaySetService      # 디스플레이 셋 관리
  ├─ MeasurementService     # 측정값 관리
  ├─ UINotificationService  # 알림 서비스
  ├─ UIModalService         # 모달 서비스
  ├─ ViewportGridService    # 뷰포트 그리드 서비스
  └─ ...
```

**Services vs Context 차이**:

| 구분 | OHIF Services | React Context |
|------|---------------|---------------|
| 위치 | `@ohif/core` | `@ohif/ui-next` |
| 패턴 | PubSub (이벤트 기반) | Context API |
| 사용처 | Extensions, Modes, 일반 JS | React 컴포넌트 |
| 타입 | Class 기반 | Functional 기반 |

**통합 방식**:
```tsx
// 1. App 초기화 시 Services 생성 (platform/app)
const servicesManager = new ServicesManager();
const uiNotificationService = servicesManager.registerService(UINotificationService);

// 2. Provider에 service prop 전달
<NotificationProvider service={uiNotificationService}>
  {children}
</NotificationProvider>

// 3. Provider 내부에서 구현 등록
const NotificationProvider = ({ service, children }) => {
  const show = useCallback(...);
  const hide = useCallback(...);

  useEffect(() => {
    // Service에 React 구현 등록
    service.setServiceImplementation({ show, hide });
  }, [service]);

  return <NotificationContext.Provider value={{ show, hide }}>...</Provider>;
};

// 4. 사용
// React 컴포넌트에서:
const { show } = useNotification();

// Extension/Mode의 일반 JS 코드에서:
servicesManager.services.uiNotificationService.show({ ... });
```

**양방향 통신**:
```
React Component
    ↓ (useNotification)
Context Provider
    ↓ (service.setServiceImplementation)
OHIF Service
    ↓ (PubSub)
Extension / Mode
    ↓ (service.subscribe)
다른 컴포넌트에 알림
```

### Viewport 개념

**Viewport**란 의료 영상을 표시하는 캔버스 영역입니다.

**주요 컴포넌트**:
- `ViewportGrid`: 여러 Viewport를 그리드로 배치하는 컨테이너
- `ViewportPane`: 개별 Viewport 영역 (실제 영상 표시)
- `ViewportActionBar`: Viewport 위의 액션 버튼들
- `ViewportOverlay`: Viewport 위의 정보 표시 (환자 이름, 시리즈 번호 등)

**ViewportGridProvider의 역할**:
```tsx
const state = {
  activeViewportId: 'mpr-0',           // 현재 활성화된 Viewport
  layout: { numRows: 2, numCols: 2 },  // 그리드 레이아웃
  viewports: new Map([                 // 각 Viewport 상태
    ['mpr-0', {
      viewportId: 'mpr-0',
      displaySetInstanceUIDs: ['ds-1', 'ds-2'],  // 표시할 영상들
      viewportOptions: { orientation: 'axial' }, // 방향 (Axial, Sagittal, Coronal)
      x: 0, y: 0, width: 50, height: 50,         // 위치/크기 (%)
    }],
    ['mpr-1', { ... }],
  ]),
};
```

**Viewport 업데이트 흐름**:
```tsx
// 1. Thumbnail 클릭
<Thumbnail onClick={() => onClickThumbnail(displaySetInstanceUID)} />

// 2. ViewportGrid 상태 업데이트
const { setDisplaySetsForViewport } = useViewportGrid();
setDisplaySetsForViewport({
  viewportId: 'mpr-0',
  displaySetInstanceUIDs: [displaySetInstanceUID],
});

// 3. ViewportGridProvider가 상태 업데이트 및 이벤트 발행
dispatch({ type: 'SET_DISPLAYSETS_FOR_VIEWPORT', payload: { ... } });
viewportGridService.publish('VIEWPORT_DATA_CHANGED', { viewportId: 'mpr-0' });

// 4. Cornerstone Extension이 이벤트 구독하여 렌더링
viewportGridService.subscribe('VIEWPORT_DATA_CHANGED', ({ viewportId }) => {
  const viewport = cornerstoneViewportService.getViewport(viewportId);
  viewport.setDisplaySets([displaySet]);
  viewport.render();
});
```

**USMPR 모드의 Viewport 구성 예시**:
```
┌─────────┬─────────┐
│  mpr-0  │  mpr-1  │  mpr-0: Axial Volume
│ (Axial) │(Sagittal│  mpr-1: Sagittal Volume
├─────────┼─────────┤  mpr-2: Coronal Volume
│  mpr-2  │  mpr-3  │  mpr-3: 3D Volume Rendering
│(Coronal)│  (3D)   │
└─────────┴─────────┘
```

### Study Browser

**StudyBrowser**는 DICOM 연구(Study)의 썸네일 목록을 표시하는 컴포넌트입니다.

**DICOM 계층 구조**:
```
Patient (환자)
  └─ Study (검사)
      └─ Series (시리즈)
          └─ Instance (개별 이미지)
```

**OHIF의 DisplaySet 개념**:
- **DisplaySet**: 함께 표시할 이미지들의 논리적 그룹
- 일반적으로 1 Series = 1 DisplaySet
- 하지만 MPR, MIP 등은 여러 Series를 조합하여 1 DisplaySet 생성 가능

**StudyBrowser 구조**:
```tsx
<StudyBrowser
  tabs={[
    { name: 'primary', label: 'Primary', studies: [...] },
    { name: 'recent', label: 'Recent', studies: [...] },
  ]}
  activeTabName="primary"
  expandedStudyInstanceUIDs={['study-uid-1']}
  onClickStudy={(studyInstanceUID) => { /* 접기/펼치기 */ }}
  onClickThumbnail={(displaySetInstanceUID) => { /* Viewport에 표시 */ }}
  onDoubleClickThumbnail={(displaySetInstanceUID) => { /* 1x1로 확대 */ }}
>
  {/* 내부 구조 */}
  <StudyItem
    studyInstanceUid="study-uid-1"
    isExpanded={true}
    displaySets={[
      { displaySetInstanceUID: 'ds-1', SeriesNumber: 1, numImages: 100, ... },
      { displaySetInstanceUID: 'ds-2', SeriesNumber: 2, numImages: 50, ... },
    ]}
  >
    <ThumbnailList>
      <Thumbnail
        displaySetInstanceUID="ds-1"
        imageSrc="..."
        dragData={{ displaySetInstanceUID: 'ds-1' }}
        onDoubleClick={() => onDoubleClickThumbnail('ds-1')}
      />
      <Thumbnail displaySetInstanceUID="ds-2" ... />
    </ThumbnailList>
  </StudyItem>
</StudyBrowser>
```

**드래그앤드롭 기능**:
```tsx
// Thumbnail에서 드래그 시작
<Thumbnail
  dragData={{ displaySetInstanceUID: 'ds-1' }}
  draggable={true}
/>

// ViewportPane에서 드롭 처리
<ViewportPane
  onDrop={(data) => {
    const { displaySetInstanceUID } = data;
    setDisplaySetsForViewport({
      viewportId: activeViewportId,
      displaySetInstanceUIDs: [displaySetInstanceUID],
    });
  }}
/>
```

### 관련 폴더 링크

**OHIF Core Services** (`platform/core/src/services/`):
- `ServicesManager.ts` - 서비스 레지스트리
- `UINotificationService/` - 알림 서비스
- `UIModalService/` - 모달 서비스
- `ViewportGridService/` - 뷰포트 그리드 서비스
- `DisplaySetService/` - 디스플레이 셋 관리
- `MeasurementService/` - 측정값 관리

**Cornerstone Extension** (`extensions/cornerstone/`):
- `src/Viewport/` - Cornerstone3D 기반 Viewport 렌더링
- `src/init.tsx` - Cornerstone3D 초기화
- `src/utils/` - 렌더링 유틸리티

**Modes** (ui-next 컴포넌트를 조합하여 사용):
- `modes/usmpr/src/index.tsx` - USMPR 모드에서 Header, SidePanel, ViewportGrid 조합
- `modes/basic/src/index.tsx` - Basic 모드 구성

**레거시 UI** (`platform/ui/src/`):
- 이전 버전 UI 컴포넌트 (점진적으로 ui-next로 마이그레이션 중)

**설정 파일** (`platform/app/public/config/`):
- `default.js` - 기본 설정 (어떤 모드, 확장 사용할지 지정)

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 단계 1: React Context API 기본 이해 (1-2시간)

**목표**: Context API의 개념과 사용법을 이해합니다.

**학습 순서**:
1. **React 공식 문서 읽기**: [Context API](https://react.dev/reference/react/useContext)
   - `createContext`, `Provider`, `useContext`의 역할 이해
   - Props Drilling 문제가 무엇인지 파악

2. **NotificationProvider.tsx 읽기** (가장 단순한 예시):
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\contextProviders\NotificationProvider.tsx
   ```
   - 13줄: `createContext(null)` - Context 생성
   - 29줄: `NotificationProvider` 컴포넌트 정의
   - 52줄: `show` 함수 구현 - 알림 표시 로직
   - 165줄: `hide` 함수 구현 - 알림 숨기기
   - 218줄: `<NotificationContext.Provider>` - Context 제공
   - 15줄: `useNotification` 훅 - Context 소비

3. **실습**: 간단한 ThemeProvider 만들어보기
   ```tsx
   const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

   const ThemeProvider = ({ children }) => {
     const [theme, setTheme] = useState('light');
     const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
     return (
       <ThemeContext.Provider value={{ theme, toggleTheme }}>
         {children}
       </ThemeContext.Provider>
     );
   };

   const useTheme = () => useContext(ThemeContext);
   ```

#### 단계 2: 기본 UI 컴포넌트 탐색 (30분 - 1시간)

**목표**: shadcn/ui 스타일의 컴포넌트 패턴을 이해합니다.

**학습 순서**:
1. **Button.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\Button\Button.tsx
   ```
   - 7줄: `cva` (Class Variance Authority) - variant/size로 스타일 변경
   - 11-19줄: `variant` 옵션들 (default, destructive, outline, ghost, link)
   - 20-25줄: `size` 옵션들 (default, sm, lg, icon)
   - 41줄: `React.forwardRef` - ref 전달 패턴
   - 43줄: `asChild ? Slot : 'button'` - Slot 패턴 (Radix UI)

2. **Input.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\Input\Input.tsx
   ```
   - 간단한 입력 필드 컴포넌트
   - `cn()` 함수로 Tailwind 클래스 병합

3. **Dialog.tsx 읽기** (Compound Component 예시):
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\Dialog\Dialog.tsx
   ```
   - `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader` 등
   - 각 부분을 조합하여 사용하는 패턴 이해

4. **실습**: 버튼 스타일 변경해보기
   ```tsx
   <Button variant="destructive" size="lg">Delete</Button>
   <Button variant="outline" size="sm">Cancel</Button>
   <Button variant="ghost" size="icon"><Icons.Close /></Button>
   ```

#### 단계 3: Provider 패턴 깊이 이해 (1-2시간)

**목표**: Provider가 상태를 관리하고 훅으로 노출하는 패턴을 이해합니다.

**학습 순서**:
1. **ModalProvider.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\contextProviders\ModalProvider.tsx
   ```
   - 모달 상태 관리 방식 파악
   - `show`, `hide` 함수 구현 이해

2. **DialogProvider.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\contextProviders\DialogProvider.tsx
   ```
   - Dialog와 Modal의 차이 이해
   - 여러 다이얼로그 동시 표시 로직

3. **index.ts 읽기** - export 구조 파악:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\contextProviders\index.ts
   ```
   - 어떤 Provider들이 있는지 전체 파악
   - 각 Provider마다 대응하는 훅이 있음을 확인

4. **실습**: ModalProvider 사용해보기
   ```tsx
   const MyComponent = () => {
     const { show, hide } = useModal();

     const handleOpenModal = () => {
       show(<div>
         <h2>My Modal</h2>
         <Button onClick={() => hide()}>Close</Button>
       </div>);
     };

     return <Button onClick={handleOpenModal}>Open Modal</Button>;
   };
   ```

#### 단계 4: 복잡한 컴포넌트 분석 (1-2시간)

**목표**: OHIF Services와 통합된 복잡한 컴포넌트를 이해합니다.

**학습 순서**:
1. **StudyBrowser.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\StudyBrowser\StudyBrowser.tsx
   ```
   - 27줄: `getTabContent()` - Study 목록 렌더링 로직
   - 32줄: `tabs.find()` - 현재 탭 데이터 찾기
   - 36줄: `<StudyItem>` - 각 Study 표시
   - Props 전달 흐름 추적: `onClickThumbnail`, `onDoubleClickThumbnail`

2. **StudyItem.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\StudyItem\StudyItem.tsx
   ```
   - Study 접기/펼치기 로직
   - DisplaySet 목록 표시

3. **Thumbnail.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\Thumbnail\Thumbnail.tsx
   ```
   - 드래그앤드롭 구현 (`dragData` prop)
   - 썸네일 클릭/더블클릭 이벤트

4. **데이터 흐름 추적**:
   ```
   User clicks Thumbnail
     ↓
   Thumbnail.tsx: onClick={onDoubleClick}
     ↓
   StudyBrowser.tsx: onDoubleClickThumbnail(displaySetInstanceUID)
     ↓
   Mode (usmpr/index.tsx): handleThumbnailDoubleClick
     ↓
   ViewportGridProvider: setDisplaySetsForViewport
     ↓
   Viewport에 영상 표시
   ```

#### 단계 5: ViewportGridProvider 심화 (1-2시간)

**목표**: 가장 복잡한 Provider의 상태 관리 방식을 이해합니다.

**학습 순서**:
1. **ViewportGridProvider.tsx 읽기** (500줄, 천천히):
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\contextProviders\ViewportGridProvider.tsx
   ```
   - 14줄: `DEFAULT_STATE` - 기본 상태 구조 파악
   - 34줄: `viewports: new Map()` - Map 자료구조 사용 이유
   - 55줄: `determineActiveViewportId` - 활성 Viewport 결정 로직
   - 113줄: `ViewportGridApi` 인터페이스 - 제공하는 함수들
   - Reducer 패턴 (복잡하면 나중에 다시 읽기)

2. **ViewportGrid.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\components\Viewport\ViewportGrid.tsx
   ```
   - 간단한 컨테이너 컴포넌트 (상태는 Provider에서 관리)

3. **실습**: useViewportGrid 훅 사용해보기
   ```tsx
   const MyComponent = () => {
     const { getState, setActiveViewportId, setLayout } = useViewportGrid();

     const handleChangeLayout = () => {
       setLayout({ numRows: 3, numCols: 3, layoutType: 'grid' });
     };

     const handleActivateViewport = () => {
       setActiveViewportId('mpr-0');
     };

     const state = getState();
     console.log('Active Viewport:', state.activeViewportId);

     return <div>...</div>;
   };
   ```

#### 단계 6: 실제 사용처 확인 (1-2시간)

**목표**: 실제 모드에서 ui-next 컴포넌트들이 어떻게 조합되는지 확인합니다.

**학습 순서**:
1. **modes/usmpr/src/index.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\modes\usmpr\src\index.tsx
   ```
   - layoutTemplate 찾기 - 어떤 컴포넌트들을 조합하는지
   - Header, SidePanel, ViewportGrid 사용 확인
   - Props 전달 방식 파악

2. **Provider 초기화 위치 확인**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\app\src\App.tsx
   ```
   - NotificationProvider, ModalProvider 등이 어디서 초기화되는지
   - service prop 전달 방식 확인

3. **OHIF Services와의 연동 확인**:
   - `platform/core/src/services/UINotificationService/` 읽기
   - `setServiceImplementation()` 호출 흐름 추적

#### 단계 7: 커스텀 훅 활용 (30분 - 1시간)

**목표**: 제공되는 커스텀 훅들을 활용할 수 있게 됩니다.

**학습 순서**:
1. **useSessionStorage.tsx 읽기**:
   ```bash
   C:\OHIF_MP\mView-Web_V2\platform\ui-next\src\hooks\useSessionStorage.tsx
   ```
   - clearOnUnload 옵션 동작 원리 이해
   - visibilitychange 이벤트 활용 방식

2. **실습**: 레이아웃 설정 저장하기
   ```tsx
   const LayoutSettings = () => {
     const [layout, setLayout] = useSessionStorage({
       key: 'my-layout',
       defaultValue: { numRows: 2, numCols: 2 },
       clearOnUnload: false, // 페이지 새로고침 시에도 유지
     });

     return (
       <div>
         <Button onClick={() => setLayout({ numRows: 3, numCols: 3 })}>
           3x3 Layout
         </Button>
       </div>
     );
   };
   ```

3. **모든 Context 훅 사용법 정리**:
   ```tsx
   // 알림 표시
   const { show } = useNotification();
   show({ type: 'success', message: '성공!' });

   // 모달 열기
   const { show: showModal } = useModal();
   showModal(<MyModalContent />);

   // Viewport 제어
   const { setActiveViewportId, setLayout } = useViewportGrid();
   setActiveViewportId('mpr-0');
   ```

### 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF Viewer UI 커스터마이징**:
   - 헤더, 사이드 패널, 툴바 등 원하는 대로 수정 가능
   - 새로운 UI 컴포넌트 추가 가능
   - 레이아웃 변경 가능

2. **Context API 기반 전역 상태 관리 마스터**:
   - React 프로젝트에서 전역 상태를 Context로 관리하는 패턴 습득
   - Provider/Consumer 패턴 완벽 이해
   - 커스텀 훅으로 Context를 노출하는 Best Practice 학습

3. **shadcn/ui 스타일 컴포넌트 라이브러리 구축**:
   - Radix UI + Tailwind CSS 조합 방법 이해
   - CVA (Class Variance Authority)로 variant 관리
   - 재사용 가능한 컴포넌트 디자인 패턴 습득

4. **의료 영상 뷰어 개발 핵심 개념 습득**:
   - Viewport, StudyBrowser, MeasurementTable 등 의료 영상 특화 UI 이해
   - DICOM 메타데이터 표시 방법
   - 드래그앤드롭 기반 영상 조작 구현

5. **OHIF Services와 React 통합 방법 이해**:
   - PubSub 패턴 기반 서비스를 React Context로 래핑하는 방법
   - Extension/Mode에서 UI를 제어하는 방법
   - 비즈니스 로직과 UI를 분리하는 아키텍처 패턴

### 추가 학습 리소스

**공식 문서**:
- [React Context API](https://react.dev/reference/react/useContext)
- [Radix UI](https://www.radix-ui.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Class Variance Authority](https://cva.style/docs)

**OHIF 관련**:
- [OHIF Viewer 공식 문서](https://docs.ohif.org/)
- [OHIF GitHub](https://github.com/OHIF/Viewers)

**실습 프로젝트 아이디어**:
1. 간단한 알림 시스템 만들기 (NotificationProvider 참고)
2. 모달 관리 시스템 구축 (ModalProvider 참고)
3. 테마 전환 기능 추가 (Context API 활용)
4. 레이아웃 선택기 커스터마이징
5. 새로운 사이드 패널 컴포넌트 추가

---

## 추가 정보

### 파일 크기 및 복잡도

| 카테고리 | 파일 수 | 총 라인 수 (추정) | 복잡도 |
|---------|--------|------------------|--------|
| components/ | 72개 디렉토리 | ~15,000줄 | 중간-높음 |
| contextProviders/ | 12개 파일 | ~1,500줄 | 중간 |
| hooks/ | 2개 파일 | ~100줄 | 낮음 |
| utils/ | 4개 파일 | ~50줄 | 낮음 |
| types/ | 7개 파일 | ~200줄 | 낮음 |

**가장 복잡한 파일 TOP 5**:
1. `contextProviders/ViewportGridProvider.tsx` - ~500줄, 높은 복잡도
2. `components/SegmentationTable/SegmentationTable.tsx` - ~400줄 (추정)
3. `components/MeasurementTable/MeasurementTable.tsx` - ~350줄 (추정)
4. `contextProviders/NotificationProvider.tsx` - 248줄
5. `components/StudyBrowser/StudyBrowser.tsx` - ~200줄

### 의존성 패키지

**핵심 의존성** (package.json):
- `react@18.3.1` - React 18
- `@radix-ui/*` - UI 프리미티브 (16개 패키지)
- `tailwindcss@3.2.4` - 스타일링
- `class-variance-authority@0.7.1` - Variant 관리
- `clsx@2.1.1`, `tailwind-merge@2.6.0` - 클래스 병합
- `framer-motion@6.2.4` - 애니메이션
- `react-resizable-panels@2.1.9` - 크기 조절 패널
- `sonner@1.7.4` - 토스트 알림
- `shepherd.js@13.0.3` - 온보딩 튜토리얼

### 성능 최적화 팁

1. **React.memo 활용**: 자주 리렌더링되는 컴포넌트는 memo로 감싸기
2. **useCallback/useMemo**: Context에서 제공하는 함수는 useCallback으로 메모이제이션
3. **코드 스플리팅**: 큰 컴포넌트는 React.lazy로 지연 로딩
4. **Virtualization**: 긴 목록 (StudyBrowser, MeasurementTable)은 react-window 사용 고려

### 마이그레이션 상태

현재 OHIF는 **platform/ui** (레거시)에서 **platform/ui-next**로 점진적 마이그레이션 중입니다.

**ui-next의 장점**:
- 최신 React 패턴 (Hooks, Context API)
- 접근성 향상 (Radix UI)
- 일관된 디자인 시스템 (shadcn/ui)
- 타입 안전성 향상 (TypeScript)
- 성능 개선 (Tailwind JIT)

**학습 시 주의사항**:
- 일부 컴포넌트는 아직 ui-next에 없을 수 있음
- ui와 ui-next가 혼용되는 경우 있음
- 최신 코드는 ui-next 참고 권장

---

## 정리

`platform/ui-next/src`는 OHIF Viewer의 차세대 UI 라이브러리로, 다음을 제공합니다:

1. **72개 이상의 재사용 가능한 UI 컴포넌트** - 기본 UI부터 의료 영상 특화 컴포넌트까지
2. **Context API 기반 전역 상태 관리** - 알림, 모달, 뷰포트 그리드 등
3. **OHIF Services 통합** - PubSub 서비스를 React Context로 래핑
4. **shadcn/ui + Radix UI 디자인 시스템** - 접근성과 커스터마이징 우수
5. **커스텀 훅** - useSessionStorage, 각종 Context 훅

React 초보자가 이 폴더를 마스터하면, 현대적인 React 패턴과 의료 영상 뷰어 개발의 핵심을 모두 습득할 수 있습니다.
