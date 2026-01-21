# platform/docs/src 폴더 분석

## 1. 모듈 개요

### 책임 및 역할
`platform/docs/src` 폴더는 **OHIF Viewer의 공식 문서 사이트의 프론트엔드 소스코드**를 담당합니다. 이 폴더는 Docusaurus 기반의 문서 사이트를 구성하며, 다음과 같은 핵심 역할을 수행합니다:

- **UI 컴포넌트 쇼케이스 페이지**: OHIF의 `platform/ui-next` 패키지에 있는 모든 UI 컴포넌트들을 시각적으로 보여주는 인터랙티브 페이지 제공
- **디자인 시스템 문서화**: 컴포넌트 사용법, 코드 예제, 패턴 가이드를 제공하여 개발자가 OHIF UI를 학습하고 활용할 수 있도록 지원
- **컴포넌트 패턴 예시**: Segmentation 패널, Measurement 패널 등 실제 뷰어에서 사용되는 복잡한 UI 패턴을 데모로 제공

### 연결되는 화면 및 기능
이 폴더는 OHIF Viewer의 런타임과는 **직접 연결되지 않으며**, 독립적인 문서 사이트(`https://docs.ohif.org`)로 배포됩니다. 주요 페이지는:

- `/components` - 모든 UI 컴포넌트 목록 및 데모
- `/patterns` - 실제 패널 레이아웃 패턴 예시
- `/colors-and-type` - 디자인 시스템의 컬러 팔레트와 타이포그래피

개발자가 OHIF의 UI 컴포넌트를 이해하고 커스터마이징할 때 이 문서 사이트를 참조합니다.

---

## 2. 주요 파일/컴포넌트 리스트

### 디렉토리 구조
```
src/
├── css/                          # 스타일 정의
│   └── custom.css                # Docusaurus 커스텀 CSS + OHIF 테마 변수
├── mocks/                        # 테스트 데이터
│   └── studyList.json            # Mock study 데이터
├── pages/                        # 페이지 컴포넌트
│   ├── components.tsx            # 메인 컴포넌트 페이지
│   ├── components-list.tsx       # 모든 컴포넌트 쇼케이스 페이지
│   ├── patterns.tsx              # 패턴 메인 페이지
│   ├── colors-and-type.tsx       # 디자인 시스템 페이지
│   ├── help.md                   # 도움말 페이지
│   ├── components/               # 개별 컴포넌트 쇼케이스
│   │   ├── ShowcaseRow.tsx       # 쇼케이스 레이아웃 공통 컴포넌트
│   │   ├── ButtonShowcase.tsx    # 버튼 컴포넌트 데모
│   │   ├── DataRowShowcase.tsx   # DataRow 컴포넌트 데모
│   │   ├── DialogShowcase.tsx    # Dialog 컴포넌트 데모
│   │   └── ... (20개 이상의 쇼케이스)
│   └── patterns/                 # 복잡한 UI 패턴 예시
│       ├── patterns-measurements.tsx     # Measurement 패널 패턴
│       ├── patterns-segmentation.tsx     # Segmentation 패널 패턴
│       ├── patterns-split-panel.tsx      # Split Panel 패턴
│       └── DataRowExample.tsx            # DataRow 사용 예시
└── utils/                        # 유틸리티 함수
    ├── index.js                  # 유틸리티 진입점
    └── getMockedStudies.js       # Mock 데이터 생성 함수
```

### 핵심 파일 역할

| 파일 경로 | 역할 |
|-----------|------|
| `custom.css` | OHIF 테마 CSS 변수 정의 (색상, 타이포그래피, 다크모드) 및 Tailwind CSS 설정 |
| `components-list.tsx` | 모든 UI 컴포넌트 쇼케이스를 한 페이지에 렌더링 (BrowserOnly로 SSR 회피) |
| `ShowcaseRow.tsx` | 컴포넌트 데모의 공통 레이아웃 (제목, 설명, 예제, 코드 토글) |
| `patterns-measurements.tsx` | Measurement 패널의 실제 구현 패턴을 보여주는 인터랙티브 데모 |
| `getMockedStudies.js` | 문서 사이트에서 사용할 가짜 study 데이터 생성 함수 |

### 컴포넌트 간 관계 및 데이터 흐름

```
components-list.tsx (메인 페이지)
    │
    ├─> ButtonShowcase
    ├─> DataRowShowcase
    ├─> DialogShowcase
    └─> ... (각 컴포넌트별 쇼케이스)
         │
         └─> ShowcaseRow (공통 레이아웃)
              │
              ├─> ui-next 컴포넌트 import (실제 동작 데모)
              └─> 코드 문자열 (Show Code 기능)

patterns-measurements.tsx (패턴 페이지)
    │
    ├─> ui-next의 DataRow, Accordion, Button 등 조합
    ├─> getMockedStudies() → mock 데이터 생성
    └─> 실제 패널 UI를 재현하여 사용 방법 시연
```

**데이터 흐름**:
1. 페이지 컴포넌트가 `platform/ui-next/src/components`에서 실제 UI 컴포넌트를 import
2. `ShowcaseRow`가 컴포넌트 예제와 코드 스니펫을 함께 렌더링
3. 사용자가 "Show Code" 버튼을 클릭하면 useState로 코드 표시/숨김 토글
4. 패턴 페이지는 여러 컴포넌트를 조합하여 실제 사용 사례를 시연

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### 1. 로컬 상태 (useState)
대부분의 쇼케이스 컴포넌트는 **로컬 상태**만 사용합니다:

```typescript
// ShowcaseRow.tsx - 코드 표시/숨김 상태 관리
const [showCode, setShowCode] = useState(false);

// patterns-measurements.tsx - 선택된 행 관리
const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
```

이 폴더는 **전역 상태 관리 없이** 각 컴포넌트가 독립적으로 동작합니다. Context API나 Redux 같은 글로벌 상태는 사용하지 않습니다.

#### 2. Props를 통한 데이터 전달
컴포넌트 간 데이터는 **props drilling** 방식으로 전달:

```typescript
// ShowcaseRow의 props 인터페이스
interface ShowcaseRowProps {
  title: string;                // 컴포넌트 제목
  description?: string;         // 설명 (선택적)
  children: React.ReactNode;    // 실제 컴포넌트 데모
  code: string;                 // 표시할 코드 문자열
}
```

부모 컴포넌트(예: `ButtonShowcase`)가 `ShowcaseRow`에 필요한 모든 정보를 props로 전달합니다.

### 재사용 가능한 UI 컴포넌트 패턴

#### 패턴 1: ShowcaseRow - 공통 레이아웃 컴포넌트
모든 쇼케이스가 **일관된 레이아웃**을 가지도록 `ShowcaseRow`를 공통으로 사용:

```typescript
<ShowcaseRow
  title="Buttons"
  description="Button components and size variants..."
  code={`<Button variant="default">Primary Button</Button>`}
>
  {/* 실제 동작하는 컴포넌트 예제 */}
  <Button variant="default">Primary Button</Button>
</ShowcaseRow>
```

**장점**:
- 제목, 설명, 코드 표시 UI를 반복해서 작성할 필요 없음
- 일관된 디자인 유지
- 코드 토글 기능을 모든 쇼케이스에서 재사용

#### 패턴 2: BrowserOnly - SSR 회피
Docusaurus는 서버사이드 렌더링(SSR)을 사용하는데, `platform/ui-next` 컴포넌트들은 브라우저 API에 의존하므로 SSR 시 에러가 발생할 수 있습니다. 이를 방지하기 위해:

```typescript
import BrowserOnly from '@docusaurus/BrowserOnly';

<BrowserOnly fallback={<></>}>
  {() => {
    const { Button } = require('../../../ui-next/src/components/Button');
    return <Button>Click me</Button>;
  }}
</BrowserOnly>
```

**포인트**:
- `BrowserOnly` 내부에서 동적으로 컴포넌트를 require하여 클라이언트에서만 로딩
- SSR 에러 방지

#### 패턴 3: Composition Pattern (컴포넌트 조합)
패턴 페이지는 여러 컴포넌트를 조합하여 **실제 사용 사례**를 보여줍니다:

```typescript
// patterns-measurements.tsx
<Accordion>
  <AccordionItem>
    <AccordionTrigger>Measurements</AccordionTrigger>
    <AccordionContent>
      {dataList.map(item => (
        <DataRow
          title={item.title}
          description={item.description}
          onAction={handleAction}
        />
      ))}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

이 방식으로 개발자는 "실제로 이 컴포넌트들을 어떻게 조합하는지" 학습할 수 있습니다.

### 커스텀 훅 사용

이 폴더에는 커스텀 훅이 **없습니다**. 모든 상태 관리는 기본 `useState`를 사용합니다.

**이유**:
- 문서 사이트는 단순한 쇼케이스 역할만 하므로 복잡한 로직이 필요 없음
- 각 쇼케이스가 독립적이므로 재사용 가능한 훅을 만들 필요가 없음

---

## 4. OHIF 특유 개념 정리

### 이 폴더에서 사용되는 OHIF 개념

#### 1. UI Component Library (platform/ui-next)
이 문서 사이트의 핵심은 **`platform/ui-next` 패키지의 컴포넌트들을 문서화**하는 것입니다.

**주요 컴포넌트**:
- `Button`, `Input`, `Select`, `Dialog` - 기본 폼 컴포넌트
- `DataRow` - 패널에서 측정값/세그멘테이션 목록을 표시하는 특화 컴포넌트
- `Accordion`, `Tabs` - 패널 레이아웃용 컴포넌트
- `Tooltip`, `HoverCard`, `Popover` - 오버레이 컴포넌트
- `Icons` - OHIF 전용 아이콘 세트

**연결**:
```typescript
// 문서 사이트에서 실제 컴포넌트 import
import { Button } from '../../../ui-next/src/components/Button';
```

#### 2. Design System (custom.css)
`src/css/custom.css`는 OHIF의 **디자인 시스템**을 정의합니다:

```css
:root {
  --highlight: 191 74% 63%;        /* 강조 색상 (청록색) */
  --primary: 214 98% 60%;          /* 주요 색상 (파란색) */
  --background: 236 62% 5%;        /* 배경 (거의 검은색) */
  --foreground: 0 0% 98%;          /* 텍스트 (거의 흰색) */
  /* ... */
}
```

**OHIF 특징**:
- 의료 영상 뷰어답게 **다크 테마**가 기본
- 높은 대비율로 가독성 강조
- Tailwind CSS와 통합되어 `bg-background`, `text-foreground` 같은 클래스로 사용

#### 3. Docusaurus Integration
OHIF는 문서화를 위해 **Docusaurus 2**를 사용합니다:

- `docusaurus.config.js`에서 전체 사이트 설정 (네비게이션, 버전관리, 플러그인)
- 마크다운 문서는 `docs/` 폴더에, React 페이지는 `src/pages/`에 위치
- 버전 드롭다운으로 과거 버전 문서 접근 가능 (v3.9, v3.8, v2.0, v1.0)

#### 4. Component Showcase 패턴
OHIF 문서는 **인터랙티브 데모**를 제공합니다:

- 실제 동작하는 컴포넌트 표시
- "Show Code" 버튼으로 코드 스니펫 확인
- 다양한 variant/size 옵션을 시각적으로 비교

이는 일반적인 마크다운 문서보다 **학습 효율이 높습니다**.

### 관련되는 다른 폴더 링크

| 폴더 | 관계 |
|------|------|
| `platform/ui-next/src/components/` | 문서화 대상인 실제 UI 컴포넌트들이 위치 |
| `platform/ui-next/assets/data/` | 쇼케이스에서 사용하는 mock 데이터 (`dataList`, `actionOptionsMap`) |
| `platform/docs/docs/` | 마크다운 기반 문서 (개발 가이드, API 레퍼런스) |
| `platform/docs/static/` | 정적 이미지/파일 (패턴 스크린샷 등) |

---

## 5. 초보 개발자용 학습 가이드

### 이 폴더를 공부할 때의 추천 순서

#### Step 1: 페이지 구조 이해 (30분)
1. `src/pages/components-list.tsx` 읽기
   - BrowserOnly 패턴 이해
   - 동적 import 방식 확인
2. `src/pages/components.tsx` 확인
   - 메인 네비게이션 카드 구조 파악

**학습 포인트**:
- Docusaurus에서 React 페이지를 만드는 방법
- SSR 문제를 BrowserOnly로 해결하는 패턴

#### Step 2: ShowcaseRow 컴포넌트 분석 (20분)
1. `src/pages/components/ShowcaseRow.tsx` 읽기
2. `useState`로 코드 표시/숨김 토글 구현 확인
3. props 인터페이스 이해 (`ShowcaseRowProps`)

**학습 포인트**:
- 재사용 가능한 레이아웃 컴포넌트 패턴
- children props 활용법

#### Step 3: 간단한 쇼케이스 예제 (30분)
1. `src/pages/components/ButtonShowcase.tsx` 분석
   - ShowcaseRow를 어떻게 사용하는지 확인
   - code 문자열 작성 방식 이해
2. `src/pages/components/InputShowcase.tsx` 비교
   - 다른 컴포넌트도 같은 패턴 사용 확인

**학습 포인트**:
- 일관된 쇼케이스 작성 패턴
- 새로운 컴포넌트 추가 시 따라할 템플릿 습득

#### Step 4: 복잡한 패턴 예제 (1시간)
1. `src/pages/patterns/patterns-measurements.tsx` 읽기
   - Accordion + DataRow 조합 방식 이해
   - 선택된 행 상태 관리 (`selectedRowId`) 확인
   - handleAction, handleRowSelect 이벤트 핸들러 분석
2. 실제 뷰어의 Measurement 패널과 비교

**학습 포인트**:
- 여러 컴포넌트를 조합하여 복잡한 UI 만드는 방법
- 실제 사용 사례를 코드로 학습

#### Step 5: 커스텀 CSS 및 테마 (30분)
1. `src/css/custom.css` 읽기
   - CSS 변수 구조 이해 (`--primary`, `--background` 등)
   - Tailwind 설정 확인 (`@tailwind base/components/utilities`)
2. 다크모드 테마 변수 비교 (`:root` vs `.dark`)

**학습 포인트**:
- OHIF 디자인 시스템 컬러 팔레트
- Tailwind + CSS 변수 조합 패턴

### 이 폴더를 다 이해하면 할 수 있게 되는 것

**핵심 역량**:
1. **OHIF UI 컴포넌트 활용**: `platform/ui-next`의 모든 컴포넌트를 자유롭게 사용하여 커스텀 패널 제작 가능
2. **컴포넌트 조합 패턴 습득**: DataRow + Accordion, Button + Dialog 등 실전 패턴을 익혀 복잡한 UI 구현 가능
3. **문서화 기술**: 새로운 컴포넌트를 만들면 ShowcaseRow 패턴으로 문서 페이지를 추가할 수 있음
4. **OHIF 디자인 시스템 이해**: 커스텀 테마 적용 시 CSS 변수를 조정하여 전체 뷰어의 색상/스타일 변경 가능

**실무 적용 예시**:
- 새로운 측정 도구를 만들고 Measurement 패널에 표시하는 UI 구현
- 커스텀 패널을 만들어 OHIF 확장 프로그램에 추가
- 회사 브랜딩에 맞게 OHIF 테마 커스터마이징

---

## 부록: 주요 쇼케이스 컴포넌트 목록

문서 사이트에서 제공하는 모든 쇼케이스:

| 쇼케이스 파일 | 설명 |
|---------------|------|
| `AllinOneMenuShowcase.tsx` | All-in-one 메뉴 컴포넌트 데모 |
| `ButtonShowcase.tsx` | 버튼 variant 및 크기 옵션 |
| `CheckboxShowcase.tsx` | 체크박스 상태 및 스타일 |
| `CinePlayerShowcase.tsx` | Cine 플레이어 컨트롤 |
| `ComboboxShowcase.tsx` | 자동완성 콤보박스 |
| `DataRowShowcase.tsx` | 패널 데이터 행 (측정값/세그멘테이션 목록용) |
| `DialogShowcase.tsx` | 모달 다이얼로그 |
| `DropdownMenuShowcase.tsx` | 드롭다운 메뉴 |
| `HoverCardShowcase.tsx` | Hover 시 나타나는 카드 |
| `InputShowcase.tsx` | 텍스트 입력 필드 |
| `LabelShowcase.tsx` | 폼 레이블 |
| `NumericMetaShowcase.tsx` | 숫자 메타데이터 표시 |
| `PanelSectionShowcase.tsx` | 패널 섹션 레이아웃 |
| `PopoverShowcase.tsx` | 팝오버 컴포넌트 |
| `ScrollAreaShowcase.tsx` | 스크롤 영역 |
| `SelectShowcase.tsx` | 셀렉트 드롭다운 |
| `SliderShowcase.tsx` | 슬라이더 (범위 조정용) |
| `SwitchShowcase.tsx` | 토글 스위치 |
| `TabsShowcase.tsx` | 탭 네비게이션 |
| `ToastShowcase.tsx` | 토스트 알림 |
| `ToolButtonShowcase.tsx` | 도구 버튼 |
| `ToolButtonListShowcase.tsx` | 도구 버튼 목록 |
| `TooltipShowcase.tsx` | 툴팁 |

각 쇼케이스는 **동일한 패턴**을 따르므로, 하나를 이해하면 나머지도 쉽게 파악할 수 있습니다.

---

**문서 작성일**: 2026-01-01
**분석 대상 버전**: OHIF v3.12.0-beta
**참고**: 이 문서는 `platform/docs/src` 폴더의 구조와 역할을 리액트 초보자 관점에서 설명합니다. 실제 코드 변경 시 최신 내용을 확인하세요.
