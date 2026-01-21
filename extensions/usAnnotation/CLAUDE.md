# extensions/usAnnotation

## 목차

1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅 사용](#커스텀-훅-사용)
   - 3.4. [이벤트 리스너 패턴](#이벤트-리스너-패턴)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)

## 1. 모듈 개요

`extensions/usAnnotation`은 **초음파 영상에서 Pleura Line과 B-Line을 주석(annotation)하는 기능을 제공하는 OHIF 확장 모듈**입니다.

### 전체 OHIF 앱에서의 역할
- 초음파(Ultrasound) 영상에서 흉막선(Pleura Line)과 B-Line을 시각적으로 표시하고 관리
- 사이드 패널 UI를 통해 주석 워크플로우 제공 (주석 추가, 삭제, 내보내기)
- Cornerstone3D의 `UltrasoundPleuraBLineTool`과 통합하여 실제 렌더링 처리
- 의료 AI 분석을 위한 주석 데이터를 JSON 형식으로 내보내기

### 연결되는 화면/기능
- **사이드 패널**: `USAnnotationPanel` - 주석 관리 UI (Workflow, Annotations, Annotated Frames 섹션)
- **뷰포트 오버레이**: Fan 영역 표시, Depth Guide, Pleura 비율(%) 표시
- **툴바 버튼**: 주석 타입 전환 (Pleura Line ↔ B-Line), JSON 다운로드

### 패키지 정보
- **패키지명**: `@ohif/extension-ultrasound-pleura-bline`
- **주요 의존성**:
  - `@cornerstonejs/core`, `@cornerstonejs/tools` (렌더링 엔진)
  - `@ohif/core`, `@ohif/ui-next` (OHIF 플랫폼)
  - `@ohif/extension-cornerstone`, `@ohif/extension-default` (다른 확장 모듈)

---

## 2. 주요 파일/컴포넌트 리스트

### 진입점 및 모듈 정의
```
index.ts                    # 확장 모듈 진입점 (getPanelModule, getCommandsModule 내보내기)
id.js                       # 확장 ID 정의 (@ohif/extension-ultrasound-pleura-bline)
```

### 모듈 파일
```
getCommandsModule.ts        # 주석 관련 명령어 정의 (약 350줄)
  ├─ 주석 타입 전환 명령어
  ├─ 주석 삭제 명령어
  ├─ 툴 속성 토글/설정 명령어
  └─ JSON 생성/다운로드 명령어

getPanelModule.tsx          # 사이드 패널 모듈 정의 (USAnnotationPanel 래핑)
```

### UI 컴포넌트
```
panels/
├─ USAnnotationPanel.tsx    # 주석 관리 메인 패널 컴포넌트 (약 428줄)
│   ├─ Workflow 섹션 (Depth Guide, Pleura 비율 토글)
│   ├─ Annotations 섹션 (Pleura/B-line 주석 추가/삭제)
│   └─ Annotated Frames 섹션 (주석된 프레임 목록 + JSON 다운로드)
│
└─ MultiLabelInput.tsx      # 라벨 입력 컴포넌트 (미사용, 향후 확장용)
```

### 유틸리티
```
PleuraBlinePercentage.ts    # Pleura 비율 표시 상태 관리 (전역 변수)
getInstanceByImageId.ts     # 이미지 ID로 DICOM 인스턴스 조회 헬퍼
```

### 초기화 및 프로바이더
```
init/
└─ init.ts                  # 확장 초기화 함수 (FanShapeGeometryProvider 등록)

providers/
└─ FanShapeGeometryProvider.ts  # Fan 영역 지오메트리 메타데이터 제공자 (현재 null 반환, 확장 예정)
```

### 데이터 흐름 다이어그램 (텍스트)
```
[사용자 상호작용]
      ↓
[USAnnotationPanel] ← (useSystem hook으로 servicesManager, commandsManager 접근)
      ↓
[commandsManager.runCommand()]
      ↓
[getCommandsModule의 actions]
      ↓
┌─────────────────────────────────┬─────────────────────────────┐
│                                 │                             │
[ViewportGridService]    [ToolGroupService]    [CornerstoneViewportService]
      ↓                           ↓                             ↓
[Active Viewport]        [UltrasoundPleuraBLineTool]    [Viewport Render]
      ↓
[ANNOTATION_MODIFIED 이벤트]
      ↓
[USAnnotationPanel.annotationModified 콜백]
      ↓
[annotatedFrames 상태 업데이트]
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

1. **OHIF Services 의존** (전역 상태)
   - `useSystem()` 훅으로 `servicesManager`, `commandsManager` 접근
   - `viewportGridService`, `toolGroupService`, `cornerstoneViewportService`, `measurementService` 사용
   - 서비스는 OHIF의 전역 상태 저장소 역할 (PubSub 패턴)

2. **로컬 상태** (`USAnnotationPanel.tsx`)
   ```typescript
   const [depthGuide, setDepthGuide] = useState(true);          // UI 토글 상태
   const [autoAdd, setAutoAdd] = useState(true);                // 자동 추가 모드
   const [showPleuraPct, setShowPleuraPct] = useState(true);    // Pleura 비율 표시
   const [showOverlay, setShowOverlay] = useState(true);        // Fan 오버레이 표시
   const [annotatedFrames, setAnnotatedFrames] = useState([]);  // 주석된 프레임 목록
   const [imageIdsToObserve, setImageIdsToObserve] = useState([]); // 모니터링할 이미지 ID
   const [labels, setLabels] = useState([]);                    // 주석 라벨
   ```

3. **전역 모듈 변수** (`PleuraBlinePercentage.ts`)
   ```typescript
   export let showPercentage = true;  // 간단한 전역 플래그
   ```

### 재사용 가능한 UI 컴포넌트 패턴

- **`@ohif/ui-next` 컴포넌트 활용**:
  - `PanelSection`, `ScrollArea` (레이아웃)
  - `Label`, `Button`, `Switch`, `Icons` (기본 컨트롤)
  - `DropdownMenu`, `Tabs` (복합 컨트롤)

- **렌더 헬퍼 함수 패턴**:
  ```typescript
  const renderWorkflowToggles = () => (/* JSX */);
  const renderSectorAnnotations = () => (/* JSX */);
  const renderAnnotatedFrames = () => (/* JSX */);
  ```
  - JSX 가독성 향상, 로직 분리

- **MultiLabelInput 컴포넌트** (재사용 가능한 폼 컨트롤):
  - Props: `placeholder`, `className`, `labels`, `onLabelsChange`
  - 내부 상태와 외부 props 동기화 (`useEffect` 사용)
  - Enter 키로 라벨 추가, × 버튼으로 삭제

### 커스텀 훅 사용

**직접 정의한 커스텀 훅은 없음**. 대신 OHIF 제공 훅 활용:
- `useSystem()`: `servicesManager`, `commandsManager`, `extensionManager` 접근
- `useTranslation()`: 다국어 지원 (react-i18next)

### 이벤트 리스너 패턴
```typescript
useEffect(() => {
  // Cornerstone Events 리스닝
  eventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, annotationModified);

  // OHIF MeasurementService 구독
  const { unsubscribe } = measurementService.subscribe(
    measurementService.EVENTS.MEASUREMENT_REMOVED,
    () => { updateAnnotatedFrames(); }
  );

  return () => {
    eventTarget.removeEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, annotationModified);
    unsubscribe();
  };
}, [annotationModified, measurementService]);
```
- 컴포넌트 마운트 시 이벤트 구독, 언마운트 시 정리

---

## 4. OHIF 특유 개념 정리

### Extension 모듈 시스템

**이 확장이 내보내는 모듈**:
1. **PanelModule** (`getPanelModule`):
   - 사이드 패널 정의 (`USAnnotationPanel`)
   - Mode가 이 패널을 화면에 배치할 수 있도록 등록

2. **CommandsModule** (`getCommandsModule`):
   - 14개의 명령어 정의 (definitions):
     - `switchUSAnnotation`, `deleteLastAnnotation`, `toggleDepthGuide`, `setDepthGuide`
     - `setShowPleuraPercentage`, `toggleUSToolAttribute`, `setUSToolAttribute`
     - `toggleDisplayFanAnnotation`, `setDisplayFanAnnotation`
     - `generateJSON`, `downloadJSON`
     - `switchUSAnnotationToPleuraLine`, `switchUSAnnotationToBLine`
     - `deleteLastPleuraAnnotation`, `deleteLastBLineAnnotation`
   - `defaultContext: 'CORNERSTONE'` - Cornerstone 뷰포트에서 실행

### OHIF Services 사용

**이 확장이 의존하는 서비스**:
- `ViewportGridService`: 활성 뷰포트 ID 조회 (`getActiveViewportId`)
- `ToolGroupService`: 뷰포트의 툴 그룹 및 툴 인스턴스 관리
- `CornerstoneViewportService`: Cornerstone 뷰포트 객체 접근 (`getCornerstoneViewport`)
- `MeasurementService`: 측정/주석 이벤트 구독
- `DisplaySetService`: DICOM 인스턴스 조회 (`getActiveDisplaySets`)

### Cornerstone3D 통합

**UltrasoundPleuraBLineTool**:
- Cornerstone Tools에서 제공하는 초음파 전용 주석 도구
- 설정 가능한 속성:
  - `showFanAnnotations`: Fan 영역 표시 여부
  - `drawDepthGuide`: Depth Guide 표시 여부
  - `startAngle`, `endAngle`, `center`, `innerRadius`, `outerRadius`: Fan 지오메트리
- 주석 타입:
  - `USPleuraBLineAnnotationType.PLEURA`: 흉막선
  - `USPleuraBLineAnnotationType.BLINE`: B-Line

### Metadata Provider 패턴

**FanShapeGeometryProvider**:
- Cornerstone의 `metaData.addProvider()` API 사용
- 쿼리 타입: `'ultrasoundFanShapeGeometry'`
- 현재는 `null` 반환 (향후 DICOM 메타데이터에서 Fan 영역 자동 추출 예정)

### 관련 폴더
- `extensions/cornerstone/` - Cornerstone3D 렌더링 엔진 통합
- `extensions/default/` - 기본 확장 (데이터 소스, Hanging Protocols)
- `platform/core/src/services/` - OHIF 서비스 정의
- `platform/ui-next/` - UI 컴포넌트 라이브러리

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

1. **패널 UI 이해** (30분)
   - `panels/USAnnotationPanel.tsx` 읽기
   - `renderWorkflowToggles()`, `renderSectorAnnotations()`, `renderAnnotatedFrames()` 함수 분석
   - OHIF UI 컴포넌트 사용법 파악 (`@ohif/ui-next`)

2. **명령어 모듈 이해** (1시간)
   - `getCommandsModule.ts` 읽기
   - 각 액션 함수가 어떻게 서비스와 상호작용하는지 추적
   - `switchUSPleuraBLineAnnotation`, `deleteLastUSPleuraBLineAnnotation` 로직 이해

3. **OHIF 서비스 통합** (1시간)
   - `useSystem()` 훅으로 서비스 접근 방법 학습
   - `ViewportGridService`, `ToolGroupService`, `CornerstoneViewportService` API 문서 참고
   - 이벤트 구독 패턴 (`ANNOTATION_MODIFIED`, `MEASUREMENT_REMOVED`) 이해

4. **Cornerstone Tool 통합** (1시간)
   - `UltrasoundPleuraBLineTool` API 문서 읽기
   - `toolGroup.getToolInstance()`, `toolGroup.setToolConfiguration()` 사용법
   - 주석 데이터 구조 이해 (`annotation.data.handles.points`, `annotation.metadata`)

5. **JSON 내보내기 로직** (30분)
   - `generateUSPleuraBLineAnnotationsJSON()` 함수 분석
   - `transformWorldToIndex()`로 좌표 변환 방법
   - JSON 스키마 구조 (`frame_annotations`, `pleura_lines`, `b_lines`)

6. **확장 가능한 부분 탐색** (선택)
   - `FanShapeGeometryProvider` - DICOM 메타데이터에서 Fan 영역 자동 추출
   - `MultiLabelInput` - 주석에 라벨 추가 기능

### 이 폴더를 이해하면 할 수 있게 되는 것

**"초음파 영상 주석 워크플로우를 OHIF 뷰어에 통합할 수 있으며, Cornerstone3D 툴과 OHIF 서비스를 활용한 커스텀 확장 모듈을 개발할 수 있습니다. 또한 의료 AI를 위한 주석 데이터를 구조화된 JSON 형식으로 내보낼 수 있습니다."**

### 실습 아이디어

1. **새로운 주석 타입 추가**:
   - B-Line 외에 "A-Line", "Consolidation" 등 추가
   - `getCommandsModule.ts`에 새 명령어 정의
   - `USAnnotationPanel.tsx`에 UI 버튼 추가

2. **Fan 지오메트리 자동 감지**:
   - `FanShapeGeometryProvider.ts`에서 DICOM 태그 읽기
   - Ultrasound Region Calibration Module (0x0018, 0x6011) 파싱

3. **라벨 기능 활성화**:
   - `MultiLabelInput` 컴포넌트를 `USAnnotationPanel`에 통합
   - JSON 내보내기 시 라벨 포함

4. **주석 통계 대시보드**:
   - 전체 프레임 중 주석된 비율 표시
   - Pleura/B-line 개수 차트 시각화

### 주의사항

- **Tool Configuration 변경** 시 반드시 `viewport.render()` 호출
- **ImageId 필터링** 로직 (`imageIdsToObserve`) 이해 필요 (AutoAdd vs Manual 모드)
- **World 좌표계 ↔ Index 좌표계** 변환 주의 (`transformWorldToIndex`)
- **PubSub 이벤트** 정리 누락 시 메모리 누수 발생 가능 (`useEffect` cleanup 함수 활용)
