# 폴더별 상세 분석 (리액트 초보자용)

## 목차
1. [platform/ui/src](#1-platformuisrc)
   - 1.1. [모듈 개요](#1.1-모듈-개요)
   - 1.2. [주요 파일/컴포넌트 리스트](#1.2-주요-파일컴포넌트-리스트)
   - 1.3. [리액트 관점에서 볼 포인트](#1.3-리액트-관점에서-볼-포인트)
   - 1.4. [OHIF 특유 개념 정리](#1.4-ohif-특유-개념-정리)
   - 1.5. [초보 개발자용 학습 가이드](#1.5-초보-개발자용-학습-가이드)

---


## 1. platform/ui/src

### 1.1. 모듈 개요

`platform/ui/src`는 OHIF 뷰어의 **레거시 UI 컴포넌트 라이브러리**입니다. 주로 Study List(연구 목록) 화면과 기본적인 UI 요소들을 제공합니다.

- **전체 앱에서의 역할**: 재사용 가능한 프레젠테이션 컴포넌트 제공 (버튼, 인풋, 테이블 등)
- **화면 연결**: 주로 WorkList(연구 목록) 화면에서 사용되며, 일부 컴포넌트는 뷰어 전역에서 사용됩니다
- **상위 모듈**: `platform/app` (메인 앱)에서 `@ohif/ui`로 import하여 사용
- **하위 모듈**: `components/` (개별 UI 컴포넌트들)

### 1.2. 주요 파일/컴포넌트 리스트

**기본 UI 컴포넌트 (Presentational Components)**:
- `Button/Button.tsx`: 범용 버튼 컴포넌트 (props로 스타일 제어)
- `Icon/Icon.tsx`: 아이콘 렌더링 컴포넌트
- `Input/Input.tsx`, `InputText/InputText.tsx`: 텍스트 입력 필드
- `Select/Select.tsx`: 드롭다운 선택 컴포넌트
- `Table/Table.tsx`, `TableRow.tsx`, `TableCell.tsx`: 테이블 기본 구조 컴포넌트

**Study List 전용 컴포넌트 (Container Components)**:
- `StudyListTable/StudyListTable.tsx`: 연구 목록 테이블 (데이터를 받아서 표시)
- `StudyListTableRow/StudyListTableRow.tsx`: 테이블의 각 행 (확장/축소 기능 포함)
- `StudyListFilter/StudyListFilter.tsx`: 검색 필터 UI
- `StudyListPagination/StudyListPagination.tsx`: 페이지네이션 UI

**유틸리티**:
- `index.js`: 모든 컴포넌트를 export하는 진입점
- `utils/`: 헬퍼 함수들 (예: `getGridWidthClass.js`)

**데이터 흐름 다이어그램**:
```
WorkList (platform/app/src/routes/WorkList)
    ↓ props: tableDataSource, filtersMeta
StudyListTable
    ↓ props: tableData (각 행 데이터)
StudyListTableRow
    ↓ onClick → 상위로 이벤트 전달
WorkList → 라우팅 (뷰어 화면으로 이동)
```

### 1.3. 리액트 관점에서 볼 포인트

**상태 관리 방식**:
- **Stateless (무상태) 컴포넌트**: 대부분의 UI 컴포넌트는 props만 받아서 렌더링하는 순수 프레젠테이션 컴포넌트입니다.
- **컨테이너 vs 프레젠테이션**:
  - **프레젠테이션**: `Button`, `Icon`, `Input`, `Table`, `TableRow` 등 → 상태 없이 props만 사용
  - **컨테이너**: `StudyListTable`, `StudyListFilter` → 자식 컴포넌트를 조합하지만, 상태는 상위에서 받음
- **Props 흐름**: 단방향 데이터 흐름 (부모 → 자식)
  ```tsx
  // 예시: StudyListTable
  <StudyListTable
    tableDataSource={data}  // 부모에서 전달받은 데이터
    querying={isLoading}    // 로딩 상태
    filtersMeta={columns}   // 컬럼 정보
  />
  ```
- **이벤트 콜백**: 자식에서 부모로 이벤트를 전달할 때 props로 받은 함수 사용
  ```tsx
  // tableData.onClickRow(StudyInstanceUID)
  // → 부모 컴포넌트에서 처리
  ```

**재사용 가능한 UI 패턴**:
- **합성 패턴 (Composition)**: `Table`, `TableHead`, `TableBody`, `TableRow`를 조합
- **조건부 렌더링**: `{querying && <Spinner />}` 형태로 로딩 상태 표시
- **PropTypes 검증**: 모든 컴포넌트가 `PropTypes`로 props 타입 검증 (TypeScript 대신 사용)

**커스텀 훅**:
- 이 폴더에는 커스텀 훅이 거의 없습니다 (UI 컴포넌트 라이브러리이므로)

### 1.4. OHIF 특유 개념 정리

**OHIF UI 라이브러리의 특징**:
- **모노레포 패키지**: `@ohif/ui`로 독립된 npm 패키지처럼 사용
- **Tailwind CSS 사용**: 대부분의 스타일이 Tailwind 클래스로 작성되어 있음
  ```tsx
  <div className="bg-black text-white px-4 py-3">
  ```
- **DICOM 용어 사용**: `StudyInstanceUID`, `SeriesInstanceUID` 등 의료 영상 표준 용어

**관련 폴더 링크**:
- `platform/ui-next/src` - 차세대 UI 컴포넌트 (shadcn/ui 기반)
- `platform/app/src/routes/WorkList` - StudyList 컴포넌트를 실제로 사용하는 곳
- `platform/core/src` - 비즈니스 로직과 서비스

### 1.5. 초보 개발자용 학습 가이드

**추천 학습 순서**:
1. **기본 컴포넌트 먼저 이해** (30분)
   - `Button.tsx`, `Icon.tsx`, `Input.tsx` 읽기
   - "props를 받아서 JSX를 반환"하는 패턴 파악

2. **테이블 컴포넌트 구조 파악** (1시간)
   - `Table.tsx`, `TableRow.tsx` 읽기
   - 합성 패턴 (부모-자식 조합) 이해

3. **StudyList 전용 컴포넌트** (1시간)
   - `StudyListTable.tsx` 읽기
   - props로 데이터와 콜백을 받는 패턴 이해
   - `tableDataSource` 배열을 map으로 렌더링하는 방식 확인

4. **실제 사용처 확인** (30분)
   - `platform/app/src/routes/WorkList/WorkList.tsx` 읽기
   - 어떻게 데이터를 가져와서 StudyListTable에 전달하는지 확인

**이 폴더를 이해하면 할 수 있는 것**:
- OHIF의 Study List 화면 커스터마이징 (컬럼 추가, 필터 수정 등)
- 재사용 가능한 프레젠테이션 컴포넌트 작성 패턴 습득
- Tailwind CSS를 사용한 UI 컴포넌트 개발 방법 이해
