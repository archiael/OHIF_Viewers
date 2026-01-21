# platform/ui/src 상세 분석 (리액트 초보자용)

## 1. 모듈 개요

`platform/ui/src`는 OHIF 뷰어의 **레거시 UI 컴포넌트 라이브러리**입니다. 이 패키지는 독립적인 NPM 패키지 `@ohif/ui`로 제공되며, OHIF 애플리케이션 전체에서 재사용 가능한 프레젠테이션 컴포넌트를 제공합니다.

### 전체 OHIF 앱에서의 책임

- **재사용 가능한 UI 컴포넌트 제공**: 버튼, 입력 필드, 테이블, 아이콘 등 기본 UI 빌딩 블록
- **Study List(연구 목록) 화면 전용 컴포넌트**: DICOM 연구 목록을 표시하고 필터링하는 특화된 컴포넌트
- **일관된 디자인 시스템**: Tailwind CSS 기반의 통일된 스타일링
- **타입 안전성**: PropTypes를 통한 런타임 타입 검증

### 연결되는 화면/기능

1. **WorkList (연구 목록) 화면** (`platform/app/src/routes/WorkList`)
   - `StudyListTable`, `StudyListFilter`, `StudyListPagination` 사용
   - PACS에서 가져온 DICOM 연구 목록을 테이블로 표시

2. **뷰어 전역 UI**
   - `Button`, `Icon`, `Tooltip`, `ContextMenu` 등은 툴바, 패널, 다이얼로그에서 사용
   - 모든 화면에서 일관된 UI 경험 제공

3. **새로운 UI로의 마이그레이션**
   - `platform/ui-next`가 차세대 UI로 점진적으로 대체 중
   - 현재는 두 라이브러리가 공존하며 사용됨

### 모듈 관계

```
platform/app (메인 애플리케이션)
    ↓ import '@ohif/ui'
platform/ui/src (이 폴더)
    ↓ export components
components/ (개별 UI 컴포넌트들)
    ├── Button, Icon, Input 등 (기본 컴포넌트)
    └── StudyListTable, StudyListFilter 등 (특화 컴포넌트)
```

---

## 2. 주요 파일/컴포넌트 리스트

### 진입점 파일

**`src/index.js`** (35줄)
- 모든 컴포넌트를 export하는 중앙 진입점
- `@ohif/ui`에서 import할 때 사용되는 파일
- Types도 함께 export

**`src/components/index.js`** (52줄)
- 개별 컴포넌트들을 import하여 re-export
- 컴포넌트 카탈로그 역할

### 기본 UI 컴포넌트 (Presentational Components)

#### 버튼 관련
- **`Button/Button.tsx`** (152줄): 현대적인 버튼 컴포넌트
  - primary/secondary 타입 지원
  - 아이콘 포함 가능 (startIcon, endIcon)
  - Tailwind CSS 기반 스타일링
- **`Button/ButtonEnums.ts`** (17줄): 버튼 타입과 크기를 정의하는 enum
- **`LegacyButton/LegacyButton.tsx`**: 이전 버전 호환성을 위한 버튼
- **`ButtonGroup/ButtonGroup.tsx`**: 여러 버튼을 그룹화하는 컨테이너

#### 입력 컴포넌트
- **`Input/Input.tsx`**: 기본 텍스트 입력 필드
- **`InputText/InputText.tsx`**: 라벨과 검증 기능이 있는 텍스트 입력
- **`InputDateRange/InputDateRange.tsx`**: 날짜 범위 선택 (react-dates 사용)
- **`InputMultiSelect/InputMultiSelect.tsx`**: 다중 선택 드롭다운 (react-select 사용)
- **`InputFilterText/InputFilterText.tsx`**: 필터링을 위한 검색 입력
- **`InputLabelWrapper/InputLabelWrapper.tsx`**: 입력 필드 라벨을 감싸는 래퍼
- **`InputGroup/InputGroup.tsx`** (164줄): 여러 입력 필드를 그리드로 배치하는 컨테이너
  - 동적으로 입력 타입 선택 (Text, MultiSelect, DateRange)
  - 정렬 기능 통합 (sortBy, sortDirection)

#### 기타 기본 컴포넌트
- **`Icon/Icon.tsx`**: 아이콘 렌더링 컴포넌트
- **`Icon/getIcon.js`** (32줄): 아이콘 레지스트리 시스템
  - `ICONS` 객체에 아이콘 저장
  - `addIcon()` 함수로 동적 등록
- **`Select/Select.tsx`**: 드롭다운 선택 (react-select 래핑)
- **`Typography/Typography.tsx`**: 텍스트 스타일링 컴포넌트
- **`Label/Label.tsx`**: 라벨 컴포넌트
- **`Tooltip/Tooltip.tsx`** (207줄): 툴팁 컴포넌트
  - Portal을 사용해 DOM 최상위에 렌더링
  - 6가지 위치 지원 (top, bottom, left, right, bottom-left, bottom-right)
  - debounce로 성능 최적화
  - isSticky 옵션으로 고정 표시 가능
- **`ContextMenu/ContextMenu.tsx`** (52줄): 우클릭 컨텍스트 메뉴

### Study List 전용 컴포넌트 (Container Components)

#### 테이블 기본 구조
- **`Table/Table.tsx`**: 기본 테이블 컨테이너
- **`TableHead/TableHead.tsx`**: 테이블 헤더
- **`TableBody/TableBody.tsx`**: 테이블 바디
- **`TableRow/TableRow.tsx`**: 테이블 행
- **`TableCell/TableCell.tsx`**: 테이블 셀

#### Study List 특화 컴포넌트
- **`StudyListTable/StudyListTable.tsx`** (94줄): 연구 목록 테이블
  - `tableDataSource` prop으로 데이터 배열 받음
  - `filtersMeta`로 컬럼 정의
  - `querying` 상태로 로딩 표시
  - 헤더와 데이터 행을 별도 테이블로 렌더링

- **`StudyListTable/StudyListTableRow.tsx`** (125줄): 테이블 각 행
  - 확장/축소 기능 (`isExpanded`)
  - 선택 상태 표시 (`isSelected`)
  - 클릭, 더블클릭, 우클릭 이벤트 지원
  - `expandedContent`로 확장 시 추가 정보 표시

- **`StudyListFilter/StudyListFilter.tsx`**: 연구 검색 필터 UI
- **`StudyListPagination/StudyListPagination.tsx`**: 페이지네이션 UI
- **`StudyListExpandedRow/StudyListExpandedRow.tsx`**: 행 확장 시 표시되는 내용
- **`EmptyStudies/EmptyStudies.tsx`**: 검색 결과가 없을 때 표시

### 유틸리티 및 타입

**유틸리티**
- **`utils/getGridWidthClass.js`** (36줄): Tailwind 그리드 너비 클래스 생성
  - 1~24까지의 gridCol 값을 `w-1/24` ~ `w-24/24` 클래스로 변환
  - Tailwind purge 우회를 위한 명시적 매핑

**타입 정의**
- **`types/index.ts`**: PropTypes 유틸리티 타입
  - `StringNumber`: string | number (DICOM 메타데이터 대응)
  - `StringArray`: string | array
- **`types/ContextMenuItem.ts`**: 컨텍스트 메뉴 아이템 타입
- **`types/ThumbnailType.ts`**: 썸네일 타입
- **`types/PatientInfoVisibility.ts`**: 환자 정보 가시성 타입
- **`types/ViewportActionCornersTypes.ts`**: 뷰포트 액션 코너 타입

### 스타일 파일

- **`tailwind.css`**: Tailwind CSS 설정
- **`assets/styles/fonts.css`**: 폰트 정의
- **`components/Tooltip/tooltip.css`**: 툴팁 전용 스타일

---

## 데이터 흐름 다이어그램

### WorkList 화면에서의 데이터 흐름

```
┌─────────────────────────────────────────────────┐
│ WorkList Route                                  │
│ (platform/app/src/routes/WorkList)              │
│                                                 │
│ 1. DataSource에서 DICOM 메타데이터 가져오기        │
│ 2. 테이블 데이터 구조로 변환                       │
└─────────────────┬───────────────────────────────┘
                  │ props
                  ▼
┌─────────────────────────────────────────────────┐
│ StudyListFilter                                 │
│ - inputMeta (필터 필드 정의)                      │
│ - values (현재 필터 값)                          │
│ - onValuesChange (필터 변경 콜백)                 │
└─────────────────┬───────────────────────────────┘
                  │ 내부 구성
                  ▼
┌─────────────────────────────────────────────────┐
│ InputGroup                                      │
│ - 동적으로 InputText, InputMultiSelect 등 렌더링   │
│ - 정렬 기능 통합                                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ StudyListTable                                  │
│ - tableDataSource: [                            │
│     { row, expandedContent, onClickRow, ... }   │
│   ]                                             │
│ - filtersMeta (컬럼 정의)                        │
│ - querying (로딩 상태)                           │
└─────────────────┬───────────────────────────────┘
                  │ map으로 반복
                  ▼
┌─────────────────────────────────────────────────┐
│ StudyListTableRow (각 연구마다 1개)               │
│                                                 │
│ - row: [{ content, gridCol, title }, ...]      │
│ - isExpanded (확장 상태)                         │
│ - onClickRow (클릭 콜백)                         │
│ - expandedContent (확장 시 표시 내용)             │
└─────────────────┬───────────────────────────────┘
                  │ 이벤트 버블링
                  ▼
┌─────────────────────────────────────────────────┐
│ WorkList Route                                  │
│ - 행 클릭 → 뷰어 화면으로 라우팅                   │
│ - 더블클릭 → 즉시 이미지 로드                      │
└─────────────────────────────────────────────────┘
```

### 기본 컴포넌트의 단방향 데이터 흐름

```
부모 컴포넌트
    │
    ├─ props (데이터, 상태, 콜백)
    │
    ▼
Button / Input / Select / Tooltip
    │
    ├─ 사용자 이벤트 (클릭, 변경 등)
    │
    ▼
    └─ 콜백 함수 실행 (props.onClick, props.onChange)
           │
           ▼
       부모 컴포넌트에서 상태 업데이트
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### Stateless (무상태) 프레젠테이션 컴포넌트

대부분의 UI 컴포넌트는 **상태를 내부에 갖지 않고 props만으로 렌더링**하는 순수 함수형 컴포넌트입니다.

**예시: Button 컴포넌트**
```tsx
const Button = ({
  children,
  size = 'medium',
  disabled = false,
  type = 'primary',
  onClick = () => {},
  startIcon,
  endIcon,
  // ...
}) => {
  // props로 받은 값만 사용
  const finalClassName = classnames(
    layoutClasses,
    fontTextClasses[type],
    disabled ? disabledClasses : enabledClasses[type],
    sizeClasses[size],
    className
  );

  return (
    <button
      className={finalClassName}
      disabled={disabled}
      onClick={onClick}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
};
```

**장점**:
- **예측 가능성**: 같은 props → 같은 렌더링 결과
- **테스트 용이**: props만 조작하면 모든 케이스 테스트 가능
- **재사용성**: 어디서든 독립적으로 사용 가능

#### 컨테이너 vs 프레젠테이션 패턴

| 컴포넌트 | 타입 | 책임 |
|---------|------|------|
| Button, Icon, Input | **프레젠테이션** | UI만 렌더링, 상태 없음 |
| StudyListTable | **컨테이너** | 자식 컴포넌트 조합, 상태는 상위에서 받음 |
| InputGroup | **컨테이너** | 동적으로 입력 컴포넌트 생성, 정렬 로직 포함 |

**프레젠테이션 컴포넌트 특징**:
- `useState` 거의 없음
- props로만 동작
- 순수 함수에 가까움

**컨테이너 컴포넌트 특징**:
- 자식 컴포넌트를 조합
- props를 가공하여 자식에 전달
- 비즈니스 로직은 여전히 상위에서 처리

#### Props 흐름 (단방향 데이터 흐름)

React의 핵심 원칙인 **단방향 데이터 흐름**을 따릅니다.

```tsx
// 부모 → 자식으로 데이터 전달
<StudyListTable
  tableDataSource={data}      // 부모가 관리하는 데이터
  querying={isLoading}        // 부모가 관리하는 로딩 상태
  filtersMeta={columns}       // 부모가 정의한 컬럼 정보
/>
```

**자식에서 부모로 이벤트 전달** (콜백 패턴):
```tsx
// 자식 컴포넌트에서
<tr onClick={() => tableData.onClickRow(studyUID)}>
  {/* ... */}
</tr>

// 부모 컴포넌트에서
const handleRowClick = (studyUID) => {
  // 라우팅, 상태 업데이트 등
  navigate(`/viewer?StudyInstanceUIDs=${studyUID}`);
};

<StudyListTable
  tableDataSource={data.map(study => ({
    row: [...],
    onClickRow: () => handleRowClick(study.StudyInstanceUID)
  }))}
/>
```

#### 로컬 상태가 있는 컴포넌트

**Tooltip 컴포넌트** (내부 상태 사용 예시):
```tsx
const Tooltip = ({ content, isSticky, children, showHideDelay = 300 }) => {
  // 툴팁 표시/숨김 상태 (내부 관리)
  const [isActive, setIsActive] = useState(false);

  // 좌표 상태 (내부 관리)
  const [coords, setCoords] = useState({ x: 999999, y: 999999 });

  // debounce로 성능 최적화
  const handleMouseOverDebounced = useMemo(
    () => debounce(() => setIsActive(true), showHideDelay),
    [showHideDelay]
  );

  // isActive 또는 isSticky일 때만 표시
  const isOpen = useMemo(
    () => (isSticky || isActive) && !isDisabled,
    [isSticky, isActive, isDisabled]
  );

  // ...
};
```

**왜 Tooltip은 내부 상태를 가질까?**
- 마우스 오버/아웃 같은 **UI 상호작용은 로컬에서 처리**하는 것이 효율적
- 부모에게 툴팁 표시 상태를 관리하라고 하면 불필요한 복잡도 증가

### 재사용 가능한 UI 컴포넌트 패턴

#### 1. 합성 패턴 (Composition Pattern)

작은 컴포넌트를 조합하여 큰 컴포넌트를 만드는 패턴입니다.

```tsx
// 기본 테이블 구조 (합성 가능)
<Table>
  <TableHead>
    <TableRow>
      <TableCell>Name</TableCell>
      <TableCell>Age</TableCell>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableCell>John</TableCell>
      <TableCell>30</TableCell>
    </TableRow>
  </TableBody>
</Table>

// StudyListTable은 이 패턴을 내부적으로 사용
```

**장점**:
- 유연한 구조
- 각 컴포넌트를 독립적으로 재사용 가능
- 새로운 레이아웃을 쉽게 만들 수 있음

#### 2. 조건부 렌더링 패턴

```tsx
// && 연산자로 조건부 렌더링
{querying && <Spinner />}

// 삼항 연산자
<div className={isExpanded ? 'border-primary-light' : 'border-transparent'}>

// 조건부 클래스명 (classnames 라이브러리)
<div className={classnames(
  'base-class',
  { 'active-class': isActive },
  { 'disabled-class': isDisabled }
)}>
```

#### 3. Render Props 패턴 (간접적 사용)

InputGroup은 `inputType`에 따라 다른 컴포넌트를 렌더링합니다:

```tsx
const renderFieldInputComponent = ({ inputType, name, displayName, ... }) => {
  switch (inputType) {
    case 'Text':
      return <InputText {...props} />;
    case 'MultiSelect':
      return <InputMultiSelect {...props} />;
    case 'DateRange':
      return <InputDateRange {...props} />;
    case 'None':
      return <InputLabelWrapper {...props} />;
  }
};
```

#### 4. Portal 패턴 (Tooltip, ContextMenu)

Portal을 사용해 컴포넌트를 DOM 계층 구조 밖으로 렌더링:

```tsx
const Tooltip = ({ children, content }) => {
  const tooltipContainer = document.getElementById('react-portal');

  return (
    <div>
      {children}
      {tooltipContainer && ReactDOM.createPortal(
        <div className="tooltip">{content}</div>,
        tooltipContainer
      )}
    </div>
  );
};
```

**왜 Portal?**
- z-index 문제 해결 (항상 최상위에 렌더링)
- 부모의 overflow: hidden 영향 받지 않음

#### 5. PropTypes를 통한 타입 검증

TypeScript 대신 PropTypes로 런타임 타입 검증:

```tsx
Button.propTypes = {
  children: PropTypes.node,
  onClick: PropTypes.func.isRequired,
  size: PropTypes.oneOf(['medium', 'small', 'smallTall']),
  disabled: PropTypes.bool,
  type: PropTypes.oneOf(['primary', 'secondary']),
  startIcon: PropTypes.node,
  endIcon: PropTypes.node,
};
```

**초보자 팁**:
- `.isRequired`: 필수 prop
- `PropTypes.node`: React 렌더링 가능한 모든 것 (문자열, 숫자, JSX 등)
- `PropTypes.func`: 함수
- `PropTypes.oneOf([...])`: enum처럼 특정 값만 허용

### 커스텀 훅

이 폴더에는 **커스텀 훅이 거의 없습니다**. 이유는:

1. **UI 컴포넌트 라이브러리이므로**: 비즈니스 로직이 아닌 UI 렌더링에 집중
2. **상태가 적음**: 대부분 props로만 동작하는 무상태 컴포넌트
3. **훅은 platform/core에서**: 비즈니스 로직 관련 훅은 `@ohif/core`에 위치

**사용되는 표준 React 훅**:
- `useState`: Tooltip의 isActive, coords 상태 관리
- `useEffect`: Tooltip의 위치 계산, debounce 정리
- `useRef`: Button의 blur 처리, Tooltip의 DOM 참조
- `useMemo`: Tooltip의 debounced 함수 메모이제이션

---

## 4. OHIF 특유 개념 정리

### OHIF UI 라이브러리의 특징

#### 1. 모노레포 패키지 구조

이 폴더는 **독립적인 NPM 패키지**로 동작합니다:

```json
// package.json
{
  "name": "@ohif/ui",
  "version": "3.12.0-beta.113",
  "main": "dist/ohif-ui.umd.js",
  "module": "src/index.js"
}
```

**다른 패키지에서 import**:
```tsx
// platform/app/src에서
import { Button, Icon, StudyListTable } from '@ohif/ui';
```

#### 2. Tailwind CSS 스타일링

모든 컴포넌트가 **Tailwind CSS 유틸리티 클래스**로 스타일링되어 있습니다.

**예시**:
```tsx
<div className="bg-black text-white px-4 py-3">
  <button className="hover:bg-customblue-80 active:bg-customblue-40
                     transition duration-300 rounded">
    Click me
  </button>
</div>
```

**Tailwind 커스텀 클래스**:
- `bg-primary-main`, `bg-secondary-dark`: OHIF 커스텀 색상
- `w-1/24` ~ `w-24/24`: 24분할 그리드 시스템 (의료 화면 레이아웃에 최적화)

**초보자 팁**:
- `hover:`: 마우스 오버 시
- `active:`: 클릭 시
- `transition duration-300`: 0.3초 애니메이션
- `px-4`: padding-left, padding-right 1rem
- `py-3`: padding-top, padding-bottom 0.75rem

#### 3. DICOM 용어 사용

의료 영상 표준인 DICOM 용어가 props 이름에 사용됩니다:

- `StudyInstanceUID`: 연구 고유 식별자
- `SeriesInstanceUID`: 시리즈 고유 식별자
- `SOPInstanceUID`: 인스턴스 고유 식별자
- `PatientName`, `PatientID`: 환자 정보
- `Modality`: 촬영 장비 유형 (CT, MR, US 등)

**초보자 팁**:
- UID = Unique Identifier
- Study = 한 번의 검사 (여러 Series 포함)
- Series = 한 번의 촬영 (여러 Instance 포함)
- Instance = 개별 이미지

#### 4. 그리드 시스템 (24분할)

OHIF는 **24분할 그리드**를 사용합니다 (일반적인 12분할이 아님):

```javascript
// utils/getGridWidthClass.js
const widthClasses = {
  1: 'w-1/24',   // 약 4.17%
  6: 'w-6/24',   // 25%
  12: 'w-12/24', // 50%
  24: 'w-24/24', // 100%
};
```

**왜 24분할?**
- 의료 화면은 복잡한 레이아웃이 많음
- 2, 3, 4, 6, 8, 12 등 다양한 분할이 필요
- 24 = 2 × 2 × 2 × 3 (여러 약수)

#### 5. Icon 레지스트리 시스템

아이콘은 동적으로 등록하여 사용합니다:

```javascript
// Icon/getIcon.js
const ICONS = {};

function addIcon(iconName, iconSVG) {
  ICONS[iconName] = iconSVG;
}

// 사용
import { addIcon } from '@ohif/ui';
addIcon('my-icon', MyIconSVG);
```

**왜 이렇게?**
- 확장(extension)에서 커스텀 아이콘 추가 가능
- 번들 크기 최적화 (사용하는 아이콘만 포함)
- 런타임에 아이콘 교체 가능

### 관련 폴더 링크

#### 1. platform/ui-next/src
- **차세대 UI 컴포넌트 라이브러리**
- shadcn/ui 기반
- Radix UI primitives 사용
- 점진적으로 `@ohif/ui`를 대체 중
- **초보자 추천**: 새 컴포넌트는 ui-next를 먼저 확인

#### 2. platform/app/src/routes/WorkList
- **StudyList 컴포넌트를 실제로 사용하는 곳**
- 데이터 소스에서 DICOM 메타데이터 가져오기
- 테이블 데이터 구조로 변환
- `@ohif/ui`의 StudyListTable, StudyListFilter에 전달

#### 3. platform/core/src
- **비즈니스 로직과 서비스**
- ServicesManager, DisplaySetService 등
- UI 컴포넌트가 사용하는 데이터 제공
- 커스텀 훅 위치

#### 4. extensions/default/src
- **기본 확장 모듈**
- `@ohif/ui` 컴포넌트를 조합하여 패널, 툴바 생성
- 실제 사용 예시 확인 가능

### OHIF vs 일반 React 앱 차이점

| 항목 | 일반 React 앱 | OHIF |
|------|-------------|------|
| 스타일링 | CSS Modules, Styled Components | **Tailwind CSS** |
| 타입 검증 | TypeScript | **PropTypes** (일부만 TS) |
| 그리드 | 12분할 | **24분할** |
| 상태 관리 | Redux, Context API | **Services + PubSub** (core에서) |
| 컴포넌트 | 프로젝트별 | **재사용 가능한 라이브러리** |

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 1단계: 기본 컴포넌트 먼저 이해 (30분 ~ 1시간)

**학습 목표**: "props를 받아서 JSX를 반환"하는 패턴 파악

**읽을 파일**:
1. `Button/Button.tsx` (152줄)
   - props 구조 확인
   - classnames로 조건부 클래스 적용 방법
   - PropTypes 검증 방식

2. `Icon/Icon.tsx`, `Icon/getIcon.js`
   - 아이콘 레지스트리 패턴
   - React.createElement 사용법

3. `Input/Input.tsx`
   - 입력 필드의 기본 구조
   - onChange 콜백 패턴

**실습 과제**:
```tsx
// 간단한 커스텀 버튼 만들기
<Button
  type="primary"
  size="medium"
  startIcon={<Icon name="play" />}
  onClick={() => alert('Clicked!')}
>
  Start Viewer
</Button>
```

#### 2단계: 테이블 컴포넌트 구조 파악 (1 ~ 2시간)

**학습 목표**: 합성 패턴 (부모-자식 조합) 이해

**읽을 파일**:
1. `Table/Table.tsx`, `TableRow.tsx`, `TableCell.tsx`
   - 각 컴포넌트의 역할
   - children prop 사용법

2. `StudyListTable/StudyListTable.tsx` (94줄)
   - tableDataSource 배열을 map으로 렌더링
   - filtersMeta로 동적 컬럼 생성

3. `StudyListTable/StudyListTableRow.tsx` (125줄)
   - 확장/축소 기능 구현 방식
   - 이벤트 핸들러 전달 (onClickRow, onDoubleClickRow)

**실습 과제**:
- tableDataSource 구조 이해하기
- 새로운 컬럼 추가해보기 (예: Modality, StudyDate)

#### 3단계: InputGroup과 동적 렌더링 (1 ~ 2시간)

**학습 목표**: 동적으로 컴포넌트를 선택하여 렌더링하는 패턴

**읽을 파일**:
1. `InputGroup/InputGroup.tsx` (164줄)
   - `renderFieldInputComponent` 함수
   - switch 문으로 inputType에 따라 다른 컴포넌트 렌더링
   - 정렬 기능 통합 (sortBy, sortDirection)

2. `InputText/InputText.tsx`, `InputMultiSelect/InputMultiSelect.tsx`
   - 각 입력 타입의 구조
   - onChange 콜백으로 상위에 값 전달

**실습 과제**:
- inputMeta 배열 구조 분석
- 새로운 입력 타입 추가 (예: InputNumber)

#### 4단계: 고급 패턴 (Portal, Tooltip) (1시간)

**학습 목표**: Portal, debounce, useRef 활용법

**읽을 파일**:
1. `Tooltip/Tooltip.tsx` (207줄)
   - ReactDOM.createPortal 사용법
   - debounce로 성능 최적화
   - useRef로 DOM 참조
   - useEffect로 위치 계산

2. `ContextMenu/ContextMenu.tsx` (52줄)
   - 우클릭 메뉴 구현 패턴
   - items 배열을 map으로 렌더링

**실습 과제**:
- Tooltip 위치를 다른 곳으로 변경해보기
- ContextMenu에 새로운 액션 추가

#### 5단계: 실제 사용처 확인 (1시간)

**학습 목표**: UI 라이브러리가 실제 앱에서 어떻게 사용되는지 확인

**읽을 파일**:
1. `platform/app/src/routes/WorkList/WorkList.tsx`
   - 데이터 소스에서 연구 목록 가져오기
   - tableDataSource 구조로 변환
   - StudyListTable에 전달

2. `extensions/default/src/getPanelModule.tsx`
   - 패널에서 `@ohif/ui` 컴포넌트 사용 예시

**실습 과제**:
- WorkList에서 새로운 필터 추가
- 테이블 컬럼 순서 변경

### 학습 체크리스트

#### 리액트 기본 개념
- [ ] props는 부모에서 자식으로 전달된다
- [ ] 자식에서 부모로는 콜백 함수로 통신한다
- [ ] useState로 로컬 상태 관리
- [ ] useEffect로 사이드 이펙트 처리
- [ ] useRef로 DOM 직접 참조
- [ ] useMemo로 값 메모이제이션

#### OHIF UI 패턴
- [ ] Tailwind CSS 클래스명 읽을 수 있다
- [ ] classnames 라이브러리로 조건부 클래스 적용
- [ ] PropTypes로 타입 검증
- [ ] 합성 패턴 (Table → TableRow → TableCell)
- [ ] Portal 패턴 (Tooltip, ContextMenu)
- [ ] 24분할 그리드 시스템

#### DICOM 기본 개념
- [ ] StudyInstanceUID, SeriesInstanceUID 차이
- [ ] Modality의 의미 (CT, MR, US 등)
- [ ] Study → Series → Instance 계층 구조

### 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF Study List 화면 커스터마이징**
   - 새로운 컬럼 추가 (예: 주치의, 촬영 시간)
   - 필터 조건 변경 (예: 날짜 범위, Modality)
   - 테이블 스타일 수정

2. **재사용 가능한 프레젠테이션 컴포넌트 작성**
   - props로만 동작하는 순수 컴포넌트
   - 합성 패턴으로 복잡한 UI 구성
   - PropTypes로 타입 안전성 확보

3. **Tailwind CSS를 사용한 UI 개발**
   - 유틸리티 클래스로 빠른 스타일링
   - 반응형 디자인 (lg:, md:, sm:)
   - 조건부 클래스 적용

4. **의료 영상 뷰어 UI 개발 능력**
   - DICOM 용어 이해
   - 복잡한 테이블 레이아웃 구성
   - 24분할 그리드 활용

5. **모노레포 패키지 구조 이해**
   - `@ohif/ui`를 다른 패키지에서 import
   - 독립적인 컴포넌트 라이브러리 개발
   - 버전 관리와 의존성 관리

### 다음 학습 추천

1. **platform/ui-next/src**
   - 차세대 UI 컴포넌트 (shadcn/ui 기반)
   - 더 현대적인 패턴 사용

2. **platform/core/src/services**
   - 비즈니스 로직과 상태 관리
   - PubSub 패턴으로 서비스 간 통신

3. **extensions/default/src**
   - `@ohif/ui` 컴포넌트를 실제로 조합하는 방법
   - 패널, 툴바, 다이얼로그 구성

4. **platform/app/src/routes**
   - 라우팅과 페이지 구성
   - 데이터 소스 연동

---

## 추가 참고 자료

### 관련 기술 문서
- [React 공식 문서 - 컴포넌트와 Props](https://react.dev/learn/passing-props-to-a-component)
- [Tailwind CSS 공식 문서](https://tailwindcss.com/docs)
- [PropTypes 문서](https://reactjs.org/docs/typechecking-with-proptypes.html)
- [DICOM 표준](https://www.dicomstandard.org/)

### OHIF 관련 문서
- OHIF 공식 문서: https://docs.ohif.org/
- OHIF GitHub: https://github.com/OHIF/Viewers
- Cornerstone.js: https://www.cornerstonejs.org/

### 파일 통계
- 총 TypeScript/JavaScript 파일: 38개
- 주요 컴포넌트 수: 28개
- 유틸리티 함수: 1개 (getGridWidthClass)
- 타입 정의: 5개

---

**마지막 업데이트**: 2026-01-01
**분석 대상 버전**: @ohif/ui v3.12.0-beta.113
