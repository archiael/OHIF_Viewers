# extensions/cornerstone-dicom-seg

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#커스텀-훅)
   - 3.4. [React 생명주기 활용](#react-생명주기-활용)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)

## 1. 모듈 개요

이 확장은 **DICOM SEG (Segmentation) 이미지를 OHIF 뷰어에서 읽고 표시하는 기능**을 담당합니다. 의료 영상에서 특정 영역(예: 종양, 장기)을 구분하여 마킹한 세그멘테이션 데이터를 불러오고, 3D 볼륨 라벨맵으로 렌더링하여 원본 이미지 위에 오버레이로 표시합니다.

### 전체 OHIF 앱에서의 역할
- **DICOM SEG 파일 로딩**: SEG SOP Class UID를 가진 DICOM 파일을 인식하고 Display Set으로 변환
- **세그멘테이션 뷰포트 제공**: SEG 데이터를 렌더링하는 전용 뷰포트 컴포넌트 제공
- **세그멘테이션 작업 명령**: 다운로드, 저장, RTSS 변환 등의 명령 제공
- **툴바 통합**: 세그멘테이션 관련 툴바 버튼 및 옵션 패널 제공

### 연결되는 화면/기능
- **뷰어 화면**: SEG 시리즈가 로드되면 전용 뷰포트에서 세그멘테이션 오버레이 표시
- **세그멘테이션 패널**: 세그먼트 목록, 색상 설정, 가시성 토글 기능
- **툴바 액션**: Contour 단순화, 논리 연산(Merge/Intersect/Subtract), 스무딩 등

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 진입점
- **`src/index.tsx`** (57줄): 확장의 메인 진입점, 모든 모듈(Commands, Toolbar, Viewport, SopClassHandler, HangingProtocol)을 export

### 모듈 파일
- **`src/commandsModule.ts`** (350줄): 세그멘테이션 로딩, 생성, 다운로드, 저장, RTSS 변환 등의 명령 정의
- **`src/getToolbarModule.ts`** (144줄): 세그멘테이션 툴바 버튼 평가 로직(활성화/비활성화 조건)
- **`src/getSopClassHandlerModule.ts`** (267줄): DICOM SEG 파일을 Display Set으로 변환하는 핸들러
- **`src/getHangingProtocolModule.ts`** (102줄): SEG 전용 Hanging Protocol 정의(1x1 레이아웃, hydrateseg 동기화)

### 뷰포트 컴포넌트
- **`src/viewports/OHIFCornerstoneSEGViewport.tsx`** (320줄): SEG 전용 뷰포트 React 컴포넌트, 로딩 상태 관리 및 hydration 처리

### 유틸리티
- **`src/utils/initSEGToolGroup.ts`** (15줄): SEG 뷰포트 전용 툴 그룹 생성
- **`src/utils/promptHydrateSEG.ts`** (27줄): SEG hydration 다이얼로그 프롬프트 유틸
- **`src/utils/dicomlabToRGB.ts`**: DICOM Lab 색상 값을 RGB로 변환

### UI 컴포넌트
- **`src/components/LogicalContourOperationsOptions.tsx`** (247줄): Merge/Intersect/Subtract 논리 연산 옵션 패널
- **`src/components/SimplifyContourOptions.tsx`** (74줄): Contour 단순화 옵션(구멍 채우기, 작은 영역 제거)
- **`src/components/SmoothContoursOptions.tsx`**: Contour 스무딩 옵션

### 타입 정의
- **`src/types/segmentation.tsx`**: 세그멘테이션 관련 타입 정의

### 컴포넌트 간 관계 및 데이터 흐름

```
[DICOM SEG 파일]
      ↓
[getSopClassHandlerModule] → Display Set 생성
      ↓
[OHIFCornerstoneSEGViewport]
      ↓
      ├─→ [initSEGToolGroup] → 전용 툴 그룹 생성
      ├─→ [promptHydrateSEG] → Hydration 다이얼로그 표시
      └─→ [OHIFCornerstoneViewport] → 실제 렌더링

[사용자 액션]
      ↓
[commandsModule]
      ├─→ loadSegmentationsForViewport
      ├─→ generateSegmentation
      ├─→ downloadSegmentation
      ├─→ storeSegmentation
      └─→ downloadRTSS

[툴바 버튼]
      ↓
[getToolbarModule]
      ├─→ SimplifyContourOptions
      ├─→ LogicalContourOperationsOptions
      └─→ SmoothContoursOptions
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

1. **로컬 상태 (useState)**
   - `OHIFCornerstoneSEGViewport`: `segIsLoading`, `processingProgress` 등 뷰포트 로딩 상태
   - `LogicalContourOperationsOptions`: `operation`, `segmentA`, `segmentB`, `createNewSegment` 등 UI 상태
   - `SimplifyContourOptions`: `areaThreshold` 등 입력 값 상태

2. **OHIF Services (전역 상태)**
   - `segmentationService`: 세그멘테이션 데이터 및 representation 관리
   - `displaySetService`: Display Set(SEG 시리즈) 관리
   - `viewportGridService`: 뷰포트 그리드 상태
   - `toolGroupService`: 툴 그룹 관리

3. **커스텀 스토어**
   - `useUIStateStore`: 툴바 활성 상태 관리 (`activeSegmentationUtility`)
   - `usePositionPresentationStore`: 첫 세그멘트 슬라이스 위치 설정

### 재사용 가능한 UI 컴포넌트 패턴

1. **SegmentSelector** (`LogicalContourOperationsOptions.tsx`)
   - 세그먼트 선택 드롭다운 컴포넌트
   - 재사용 가능한 Select wrapper 패턴

2. **지연 로딩 패턴** (`index.tsx`)
   ```tsx
   const Component = React.lazy(() => import('./viewports/OHIFCornerstoneSEGViewport'));
   const OHIFCornerstoneSEGViewport = props => (
     <React.Suspense fallback={<div>Loading...</div>}>
       <Component {...props} />
     </React.Suspense>
   );
   ```
   - React.lazy를 사용한 코드 스플리팅

3. **HOC 패턴** (`index.tsx`)
   ```tsx
   const ExtendedOHIFCornerstoneSEGViewport = props => (
     <OHIFCornerstoneSEGViewport
       servicesManager={servicesManager}
       extensionManager={extensionManager}
       commandsManager={commandsManager}
       {...props}
     />
   );
   ```
   - 확장 컨텍스트를 주입하는 Higher-Order Component

### 커스텀 훅

1. **`useViewportGrid`** (from @ohif/ui-next)
   - 뷰포트 그리드 상태 및 서비스 접근
   - `viewportGrid`, `viewportGridService` 반환

2. **`useRunCommand`** (from @ohif/core)
   - 명령 실행을 위한 훅
   - 툴바 버튼 클릭 시 사용

3. **`useActiveViewportSegmentationRepresentations`** (from @ohif/extension-cornerstone)
   - 현재 활성 뷰포트의 세그멘테이션 representations 가져오기

4. **`useSystem`** (from @ohif/core)
   - `servicesManager`, `commandsManager` 접근

### React 생명주기 활용

1. **useEffect로 이벤트 구독/해제**
   ```tsx
   useEffect(() => {
     const { unsubscribe } = segmentationService.subscribe(
       segmentationService.EVENTS.SEGMENTATION_LOADING_COMPLETE,
       evt => { /* ... */ }
     );
     return () => unsubscribe(); // cleanup
   }, [segDisplaySet]);
   ```
   - 서비스 이벤트를 구독하고 컴포넌트 언마운트 시 정리

2. **useEffect로 툴 그룹 생명주기 관리**
   - 뷰포트 마운트 시 전용 툴 그룹 생성
   - 언마운트 시 툴 그룹 제거

---

## 4. OHIF 특유 개념 정리

### Extension Module 시스템
이 확장은 다음 5가지 모듈을 export합니다:

1. **commandsModule** (`getCommandsModule`)
   - 정의: 뷰어에서 실행 가능한 명령(actions)을 등록
   - 예시: `loadSegmentationsForViewport`, `downloadSegmentation`, `storeSegmentation`
   - 사용처: 툴바 버튼, 단축키, 다른 확장에서 호출

2. **toolbarModule** (`getToolbarModule`)
   - 정의: 툴바 버튼의 활성화/비활성화 조건(evaluation) 제공
   - 예시: `evaluate.cornerstone.hasSegmentation`, `isActiveSegmentationUtility`
   - 사용처: Mode에서 툴바 버튼 구성 시 평가 로직 지정

3. **viewportModule** (`getViewportModule`)
   - 정의: 특정 타입의 뷰포트 컴포넌트 제공
   - 이 확장: `dicom-seg` viewport (OHIFCornerstoneSEGViewport)
   - 사용처: Hanging Protocol에서 `viewportType: 'dicom-seg'` 지정 시 렌더링

4. **sopClassHandlerModule** (`getSopClassHandlerModule`)
   - 정의: 특정 SOP Class UID를 가진 DICOM을 Display Set으로 변환
   - 이 확장: `1.2.840.10008.5.1.4.1.1.66.4` (SEG), `1.2.840.10008.5.1.4.1.1.66.7`
   - 사용처: DICOM 파일 로드 시 자동으로 호출되어 Display Set 생성

5. **hangingProtocolModule** (`getHangingProtocolModule`)
   - 정의: 특정 시나리오에 대한 뷰포트 레이아웃 및 동기화 규칙
   - 이 확장: `@ohif/seg` 프로토콜 (1x1 레이아웃, hydrateseg 동기화)
   - 사용처: Mode에서 활성화되어 SEG 시리즈 표시 시 적용

### Display Set
- **정의**: DICOM 시리즈를 논리적으로 그룹화한 단위 (하나의 뷰포트에 표시할 이미지 그룹)
- **SEG Display Set 특징**:
  - `Modality: 'SEG'`
  - `isDerivedDisplaySet: true` (원본 이미지로부터 파생됨)
  - `isOverlayDisplaySet: true` (오버레이로 표시됨)
  - `referencedDisplaySetInstanceUID`: 원본 이미지 시리즈 참조
  - `segments`: 각 세그먼트 메타데이터 (label, color 등)
  - `load()`: SEG 데이터를 비동기로 로드하는 함수

### Segmentation Service
- **위치**: `platform/core/src/services/SegmentationService`
- **역할**: 세그멘테이션 데이터 및 representation 관리
- **주요 메서드**:
  - `createSegmentationForSEGDisplaySet(segDisplaySet)`: SEG Display Set으로부터 세그멘테이션 생성
  - `addSegmentationRepresentation(viewportId, options)`: 뷰포트에 세그멘테이션 표시
  - `getSegmentation(segmentationId)`: 세그멘테이션 데이터 가져오기
  - `getActiveSegmentation(viewportId)`: 활성 세그멘테이션 가져오기
  - `clearSegmentationRepresentations(viewportId)`: 뷰포트의 세그멘테이션 제거
- **이벤트**:
  - `SEGMENTATION_LOADING_COMPLETE`: 세그멘테이션 로딩 완료
  - `SEGMENT_LOADING_COMPLETE`: 세그먼트 로딩 진행 상황

### Hydration
- **정의**: SEG 파일을 로드하고, 세그먼트를 패널에 표시하며, 동일한 Frame of Reference를 가진 뷰포트에 렌더링하는 프로세스
- **Loading vs Hydration**:
  - **Loading**: 네트워크를 통해 SEG 데이터를 다운로드하고 비트 언패킹
  - **Hydration**: 로드된 데이터를 뷰포트에 실제로 렌더링하고 세그멘테이션 패널에 표시
- **프롬프트**: 사용자에게 hydration 여부를 묻는 다이얼로그 표시 (`promptHydrateSEG`)

### Tool Group
- **정의**: 특정 뷰포트 그룹에서 사용할 도구(tools) 모음
- **SEG Tool Group 특징**:
  - `SEGToolGroup-{viewportId}`: 각 SEG 뷰포트마다 전용 툴 그룹 생성
  - Overlay viewport tools 사용 (커스터마이제이션 가능)
  - Segment label tool 초기화
  - 뷰포트 제거 시 자동으로 툴 그룹도 제거

### Cornerstone Adapters
- **@cornerstonejs/adapters**: DICOM 데이터와 Cornerstone3D 렌더링 사이의 변환 라이브러리
- **adaptersSEG**:
  - `createFromDICOMSegBuffer`: DICOM SEG 버퍼에서 Cornerstone 세그멘테이션 생성
  - `generateSegmentation`: Cornerstone 세그멘테이션을 DICOM SEG 데이터셋으로 변환
- **adaptersRT**:
  - `generateRTSSFromRepresentation`: 세그멘테이션을 DICOM RTSTRUCT로 변환

### 관련 폴더 링크
- **확장 의존성**:
  - `extensions/cornerstone`: 기본 Cornerstone 렌더링 및 뷰포트
  - `extensions/default`: 공통 유틸리티 및 데이터 소스
- **서비스**:
  - `platform/core/src/services/SegmentationService`
  - `platform/core/src/services/DisplaySetService`
  - `platform/core/src/services/ToolGroupService`
- **UI 컴포넌트**:
  - `platform/ui-next/src`: 버튼, Input, Select 등 UI 컴포넌트

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

1. **Extension 구조 이해** (30분)
   - `src/index.tsx` 읽기: 어떤 모듈을 export하는지 확인
   - `package.json` 읽기: 의존성 확인 (@cornerstonejs/adapters, vtk.js)

2. **SopClassHandler 흐름** (1시간)
   - `src/getSopClassHandlerModule.ts` 읽기
   - DICOM SEG 파일이 어떻게 Display Set으로 변환되는지 이해
   - `_load()` 함수: SEG 로딩 프로세스
   - `_loadSegments()`: 실제 SEG 데이터 파싱 및 색상 매핑

3. **뷰포트 컴포넌트** (2시간)
   - `src/viewports/OHIFCornerstoneSEGViewport.tsx` 읽기
   - React 컴포넌트 라이프사이클 이해
   - Hydration 프로세스 (`promptHydrateSEG`)
   - 로딩 상태 관리 및 progress 표시

4. **명령 시스템** (1.5시간)
   - `src/commandsModule.ts` 읽기
   - 각 명령의 역할 이해:
     - `loadSegmentationsForViewport`: SEG를 뷰포트에 로드
     - `generateSegmentation`: DICOM SEG 생성
     - `downloadSegmentation`: DICOM SEG 다운로드
     - `storeSegmentation`: PACS에 저장
     - `downloadRTSS`: RTSTRUCT 변환 및 다운로드

5. **UI 컴포넌트** (1시간)
   - `src/components/` 폴더의 컴포넌트들 읽기
   - `LogicalContourOperationsOptions`: 논리 연산 UI
   - `SimplifyContourOptions`: Contour 단순화 UI
   - `useRunCommand` 훅 사용법 이해

6. **툴바 모듈** (1시간)
   - `src/getToolbarModule.ts` 읽기
   - 버튼 활성화/비활성화 조건 평가 로직
   - `evaluate.cornerstone.hasSegmentation`
   - `evaluate.cornerstone.segmentation`

7. **실습** (2-3시간)
   - SEG 파일 로드해보기
   - 툴바 버튼 클릭해서 명령 실행해보기
   - 새로운 명령 추가해보기 (예: 특정 세그먼트만 다운로드)
   - 새로운 툴바 옵션 컴포넌트 만들어보기

### 이 폴더를 다 이해하면 할 수 있게 되는 것

"DICOM SEG 파일을 OHIF 뷰어에서 불러와 3D 볼륨 라벨맵으로 렌더링하고, 사용자가 세그먼트를 편집(논리 연산, 단순화, 스무딩)한 후 다시 DICOM SEG 또는 RTSTRUCT로 저장할 수 있는 전체 워크플로우를 이해하고 커스터마이징할 수 있습니다."

### 핵심 개념 체크리스트

- [ ] Extension Module 5가지 타입 이해 (Commands, Toolbar, Viewport, SopClassHandler, HangingProtocol)
- [ ] Display Set의 개념과 SEG Display Set의 특성 이해
- [ ] Segmentation Service의 역할과 주요 메서드 이해
- [ ] Hydration vs Loading의 차이 이해
- [ ] Cornerstone Adapters의 역할 (DICOM ↔ Cornerstone3D 변환)
- [ ] React 컴포넌트에서 OHIF Services 사용 패턴 이해
- [ ] 툴바 버튼의 평가(evaluation) 로직 이해
- [ ] SEG 전용 툴 그룹의 생명주기 이해

### 디버깅 팁

1. **SEG 로딩 실패 시**:
   - 브라우저 콘솔에서 `ReferencedSeriesSequence` 오류 확인
   - Referenced Display Set이 먼저 로드되었는지 확인

2. **세그멘테이션이 안 보일 때**:
   - `segmentationService.getSegmentationRepresentations(viewportId)` 호출하여 representation 존재 확인
   - Frame of Reference UID가 일치하는지 확인

3. **Hydration 프롬프트가 안 뜰 때**:
   - `viewportId === activeViewportId` 조건 확인
   - `segIsLoading` 상태 확인

4. **명령 실행 오류 시**:
   - `commandsManager.runCommand()` 호출 시 전달하는 파라미터 확인
   - Service가 제대로 초기화되었는지 확인
