# modes/mammography-compare - Mammography Compare Mode 분석

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 리액트 앱에서 맡는 책임](#1.1-전체-ohif-리액트-앱에서-맡는-책임)
   - 1.2. [연결되는 화면 / 기능](#1.2-연결되는-화면-기능)
   - 1.3. [모드 특징](#1.3-모드-특징)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [메인 모드 설정](#2.1-메인-모드-설정)
   - 2.2. [명령어 및 로직](#2.2-명령어-및-로직)
   - 2.3. [툴바 및 도구 설정](#2.3-툴바-및-도구-설정)
   - 2.4. [유틸리티 및 헬퍼](#2.4-유틸리티-및-헬퍼)
   - 2.5. [UI 컴포넌트](#2.5-ui-컴포넌트)
   - 2.6. [기타](#2.6-기타)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Modes (모드)](#4.1-modes-모드)
   - 4.2. [Extensions (확장)](#4.2-extensions-확장)
   - 4.3. [Services (서비스)](#4.3-services-서비스)
   - 4.4. [Commands (명령어)](#4.4-commands-명령어)
   - 4.5. [Hanging Protocols](#4.5-hanging-protocols)
   - 4.6. [Tool Groups](#4.6-tool-groups)
   - 4.7. [SOP Class Handlers](#4.7-sop-class-handlers)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [관련 폴더 링크](#5.3-관련-폴더-링크)
6. [디버깅 팁](#6-디버깅-팁)
   - 6.1. [자주 발생하는 이슈](#6.1-자주-발생하는-이슈)
   - 6.2. [유용한 로그](#6.2-유용한-로그)
7. [주요 알고리즘](#7-주요-알고리즘)
   - 7.1. [Chest Wall Anchoring (Zoom from Edge)](#7.1-chest-wall-anchoring-zoom-from-edge)
   - 7.2. [동기화 메커니즘](#7.2-동기화-메커니즘)

---


## 1. 모듈 개요

### 1.1. 전체 OHIF 리액트 앱에서 맡는 책임
이 폴더는 **유방촬영(Mammography) 전용 비교 모드**를 구현합니다. 현재 검사와 과거 검사를 나란히 비교할 수 있는 전문화된 워크플로우를 제공하며, 유방촬영 특유의 요구사항(chest wall anchoring, 좌우 유방 판별, magnification from chest wall)을 처리합니다.

### 1.2. 연결되는 화면 / 기능
- **URL 경로**: `/mammography-compare?StudyInstanceUIDs=...`
- **좌측 패널**: 환자의 모든 검사 목록을 보여주는 커스텀 StudyListPanel (과거 검사 선택 가능)
- **메인 뷰포트**: 현재 검사와 과거 검사를 나란히 비교하는 2-column 레이아웃
- **툴바**: 유방촬영 전용 버튼 (Mammo Magnify, Sync All, Compare)
- **우측 패널**: 측정 도구 및 분할(segmentation) 패널

### 1.3. 모드 특징
- **숨겨진 모드**: `hide: true` 설정으로 자동 선택 목록에서 제외됨 (Compare 버튼으로만 접근)
- **지원 모달리티**: MG (Mammography), CT, MR, US, PT, NM
- **Hanging Protocols**: `@ohif/hpCompareMG` (유방촬영), `@ohif/hpCompareVolume` (볼륨 영상)

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 메인 모드 설정
- **`src/index.tsx`** (498줄): 모드 정의 및 라이프사이클 관리
  - `modeInstance`: 모드 설정 객체 (extensions, routes, toolbarSections 등)
  - `onModeEnter`: 모드 진입 시 초기화 (commands/evaluators 등록, custom wheel handlers 설정)
  - `onModeExit`: 모드 종료 시 정리 (toolgroups/services 파괴)
  - `toolbarSections`: 툴바 버튼 배치 정의 (MammoMagnify, SyncAllImages, MammoCompare)
  - `basicLayout`: 좌측 StudyListPanel + 우측 측정/분할 패널 레이아웃

### 2.2. 명령어 및 로직
- **`src/commandsModule.ts`** (876줄): 유방촬영 전용 명령어 정의
  - `mammoMagnify`: chest wall에서 1.5배 확대/축소 토글
  - `toggleMammoSync`: 모든 뷰포트의 zoom/pan/window-level 동기화 토글
  - `openMammoCompare`: 현재 검사로 mammography mode로 전환
  - `initMammoMode`: 커스텀 wheel 이벤트 핸들러 설정 (이미지 스크롤, 시리즈 전환)
  - 동기화 상태 관리 (zoom from chest wall, pan sync, contrast sync)

- **`src/evaluatorsModule.ts`** (69줄): 툴바 버튼 상태 평가 함수
  - `evaluate.mammography.magnify`: Magnify 버튼 활성화 상태 확인
  - `evaluate.mammography.sync`: Sync 버튼 활성화 상태 확인
  - `evaluate.mammography.compare`: Compare 버튼 활성화 상태 확인

### 2.3. 툴바 및 도구 설정
- **`src/toolbarButtons.ts`** (743줄): 툴바 버튼 정의
  - 유방촬영 전용 버튼: MammoMagnify, SyncAllImages, MammoCompare
  - 일반 도구: 측정 도구, 주석, 레이아웃, 캡처 등
  - 버튼마다 icon, label, tooltip, commands, evaluate 함수 설정

- **`src/initToolGroups.ts`** (496줄): Cornerstone Tool Groups 초기화
  - `initDefaultToolGroup`: 기본 도구 그룹 (WindowLevel, Pan, Zoom, StackScroll)
  - `initSRToolGroup`: Structured Report 도구 그룹
  - `initMPRToolGroup`: MPR (Multi-Planar Reconstruction) 도구 그룹
  - `initVolume3DToolGroup`: 3D Volume 렌더링 도구 그룹
  - `initMammographyToolGroup`: **유방촬영 전용 도구 그룹** (MammographyZoomTool 사용)

### 2.4. 유틸리티 및 헬퍼
- **`src/utils/mammographyMidline.ts`** (337줄): 유방촬영 좌우 판별 및 chest wall 앵커 계산
  - `inferLateralityFromViewport`: DICOM 태그에서 좌우 유방 판별 (ViewPosition, ProtocolName 등)
  - `getMidlineAnchor`: 현재 카메라 상태 기준 chest wall 앵커 좌표 계산
  - `getFixedMidlineAnchor`: imageBounds 기준 고정 chest wall 앵커 (magnify 버튼용, 드리프트 방지)
  - `recenterToCanvasPoint`: chest wall을 특정 캔버스 포인트로 재정렬

- **`src/MammographyZoomTool.ts`**: 커스텀 Zoom 도구 (chest wall anchoring 지원)
  - 기본 ZoomTool을 확장하여 유방촬영 특화 zoom 동작 구현
  - (파일 내용 미확인, backup 파일 존재 → 리팩토링 중으로 추정)

### 2.5. UI 컴포넌트
- **`src/panels/StudyListPanel.tsx`** (399줄): 커스텀 Study 목록 패널
  - 환자의 모든 검사 목록 표시
  - 2-column/1-column 레이아웃 토글
  - thumbnails/text 표시 모드 토글
  - 더블클릭으로 과거 검사 선택 및 자동 로딩
  - 자동 선택: 현재 검사와 modality/body part가 일치하는 가장 최근 과거 검사

- **`src/getPanelModule.tsx`**: StudyListPanel을 OHIF 패널 시스템에 등록

- **`src/getToolbarModule.tsx`**: 툴바 버튼을 OHIF 툴바 시스템에 등록

### 2.6. 기타
- **`src/id.js`** (5줄): 모드 ID (`@ohif/mode-mammography-compare`)
- **`package.json`**: 모드 메타데이터 및 의존성 정의

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식
이 모드는 **서비스 중심 아키텍처**를 사용하며, React 컴포넌트는 최소화되어 있습니다.

1. **OHIF Services (전역 상태)**:
   - `viewportGridService`: 뷰포트 그리드 레이아웃 관리
   - `cornerstoneViewportService`: Cornerstone 뷰포트 접근
   - `displaySetService`: Display Set (이미지 그룹) 관리
   - `toolbarService`: 툴바 버튼 상태 관리
   - `syncGroupService`: 뷰포트 동기화 그룹 관리
   - `hangingProtocolService`: Hanging Protocol (레이아웃 규칙) 적용

2. **로컬 상태 (클로저 변수)**:
   - `commandsModule.ts` 내부에서 모듈 레벨 변수로 상태 관리:
     ```javascript
     let isSyncEnabled = false;
     let cameraSyncUnsubscribes = [];
     let customWheelUnsubscribes = [];
     let previousCameras = new Map();
     const magnificationState = new Map();
     ```
   - React 상태를 사용하지 않고 명령어 내부에서 직접 관리 (성능 최적화)

3. **React Hooks (StudyListPanel만 사용)**:
   - `useState`: UI 상태 (layoutMode, displayMode, studyList 등)
   - `useEffect`: 검사 목록 fetch 및 자동 선택
   - `useCallback`: getDataSource 메모이제이션
   - `useRef`: fetchedRef (중복 fetch 방지)
   - `useSystem`, `useImageViewer`: OHIF 커스텀 훅 (services 접근)

### 3.2. 재사용 가능한 UI 컴포넌트 패턴
- **StudyListPanel**: 독립적인 패널 컴포넌트로 다른 모드에서 재사용 가능
  - Props: `servicesManager`, `commandsManager`, `extensionManager`
  - 기능: 검사 목록, 레이아웃/표시 모드 토글, 더블클릭 선택
  - 스타일: Inline styles (Tailwind 클래스명 사용하지만 실제로는 문자열로 처리)

### 3.3. 커스텀 훅
이 모드는 커스텀 훅을 직접 정의하지 않고, OHIF가 제공하는 훅을 사용합니다:
- `useSystem()`: ServicesManager, ExtensionManager 등 시스템 레벨 객체 접근
- `useImageViewer()`: 현재 뷰어 상태 (StudyInstanceUIDs 등) 접근

---

## 4. OHIF 특유 개념 정리

### 4.1. Modes (모드)
OHIF의 **워크플로우 단위**입니다. 각 모드는:
- **Extensions 조합**: 어떤 확장 기능을 사용할지 정의
- **Routes**: URL 경로 및 레이아웃 매핑
- **Toolbar Configuration**: 툴바 버튼 배치
- **Hanging Protocols**: 이미지 표시 규칙
- **Lifecycle Hooks**: `onModeEnter`, `onModeExit`에서 초기화/정리

이 모드는 `longitudinal` 모드와 유사하지만 유방촬영 전용 기능 추가:
- Chest wall anchoring (좌우 판별 및 고정점 기준 확대)
- Custom wheel scroll (이미지 탐색, 시리즈 전환)
- Study comparison (현재 검사 vs 과거 검사)

### 4.2. Extensions (확장)
모드가 의존하는 기능 모듈들:
- `@ohif/extension-default`: 기본 데이터소스, 패널, Hanging Protocols
- `@ohif/extension-cornerstone`: Cornerstone3D 렌더링 엔진
- `@ohif/extension-cornerstone-dicom-sr/seg/rt`: DICOM SR/SEG/RT 지원
- `@ohif/extension-dicom-pdf/video`: PDF/비디오 렌더링

### 4.3. Services (서비스)
OHIF의 **전역 상태 관리 시스템**. PubSub 패턴 사용:
```typescript
// 이벤트 구독
servicesManager.services.viewportGridService.subscribe(
  EVENTS.VIEWPORTS_READY,
  callback
);

// 명령어 실행
commandsManager.runCommand('setHangingProtocol', { protocolId });
```

### 4.4. Commands (명령어)
재사용 가능한 액션 함수. Context별로 등록:
```typescript
// MAMMOGRAPHY 컨텍스트에 명령어 등록
commandsManager.createContext('MAMMOGRAPHY');
commandsManager.registerCommand('MAMMOGRAPHY', 'mammoMagnify', {
  commandFn: actions.mammoMagnify,
  storeContexts: [],
  options: {},
});

// 실행
commandsManager.runCommand('mammoMagnify', {}, 'MAMMOGRAPHY');
```

### 4.5. Hanging Protocols
이미지를 어떻게 배치할지 정의하는 규칙:
- `@ohif/hpCompareMG`: 유방촬영 비교 레이아웃 (2x2 grid, current vs prior)
- `@ohif/hpCompareVolume`: 볼륨 영상 비교 레이아웃

### 4.6. Tool Groups
Cornerstone3D의 도구 묶음:
- `default`: 기본 도구 (WindowLevel, Pan, Zoom, StackScroll)
- `mammography`: **유방촬영 전용** (MammographyZoomTool 사용)
- `mpr`: MPR 도구 (Crosshairs)
- `volume3d`: 3D 렌더링 도구 (TrackballRotate)

### 4.7. SOP Class Handlers
DICOM SOP Class별 렌더링 방법 정의:
- `ohif.sopClassHandler`: 기본 Stack 이미지
- `dicomvideo.sopClassHandler`: DICOM Video
- `dicomsr.sopClassHandler`: Structured Report
- `dicomSeg.sopClassHandler`: Segmentation

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서
1. **모드 구조 이해** (`src/index.tsx`)
   - `modeInstance` 객체의 구조 파악
   - `onModeEnter`/`onModeExit` 라이프사이클 흐름 이해
   - `toolbarSections` 배치 규칙 학습

2. **명령어 시스템** (`src/commandsModule.ts`)
   - `mammoMagnify` 명령어의 zoom 로직 분석
   - `toggleMammoSync` 동기화 메커니즘 이해
   - `initMammoMode`의 wheel 이벤트 핸들러 설정 과정 추적

3. **유방촬영 로직** (`src/utils/mammographyMidline.ts`)
   - DICOM 태그에서 좌우 유방 판별하는 방법
   - imageBounds 기반 고정 앵커 계산 원리
   - chest wall anchoring이 왜 필요한지 이해

4. **React 컴포넌트** (`src/panels/StudyListPanel.tsx`)
   - OHIF 서비스와 React 컴포넌트의 연동 방식
   - 검사 목록 fetch 및 자동 선택 로직
   - 레이아웃/표시 모드 토글 구현

5. **툴바 시스템** (`src/toolbarButtons.ts`, `src/evaluatorsModule.ts`)
   - 버튼 정의 구조 (icon, label, commands, evaluate)
   - Evaluator 함수가 버튼 상태를 결정하는 방식
   - 동적 툴바 업데이트 메커니즘

6. **도구 그룹** (`src/initToolGroups.ts`)
   - Cornerstone Tool Groups의 역할
   - active/passive/enabled/disabled 도구 상태
   - MammographyZoomTool 커스터마이징

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것
- ✅ **커스텀 OHIF 모드 개발**: 특정 워크플로우에 최적화된 뷰어 모드 제작
- ✅ **DICOM 메타데이터 활용**: 태그 기반 로직 구현 (laterality, view position 등)
- ✅ **Cornerstone3D 카메라 제어**: parallelScale, focalPoint 조작으로 정밀한 zoom/pan 구현
- ✅ **뷰포트 동기화**: 여러 뷰포트의 상태를 실시간으로 동기화하는 시스템 구축
- ✅ **커스텀 이벤트 핸들러**: wheel, camera modified 등 low-level 이벤트 처리
- ✅ **OHIF 서비스 확장**: 새로운 명령어, 패널, 툴바 버튼 추가
- ✅ **비교 워크플로우 구현**: 현재 검사와 과거 검사를 나란히 비교하는 UI

### 5.3. 관련 폴더 링크
- **Extensions**: `extensions/default/`, `extensions/cornerstone/`
- **Platform Core**: `platform/core/src/services/`
- **Hanging Protocols**: `extensions/default/src/hangingprotocols/`
- **다른 모드 예시**: `modes/longitudinal/`, `modes/basic/`

---

## 6. 디버깅 팁

### 6.1. 자주 발생하는 이슈
1. **Laterality 판별 실패**:
   - 콘솔에서 `[Laterality]` 로그 확인
   - DICOM 태그 우선순위: ViewPosition (0018,5101) → ProtocolName (0018,1030) → ImageLaterality

2. **Zoom 드리프트 (chest wall이 고정되지 않음)**:
   - `getFixedMidlineAnchor` 사용 여부 확인
   - `getMidlineAnchor`는 현재 카메라 상태 기반 (동적), `getFixedMidlineAnchor`는 imageBounds 기반 (고정)

3. **동기화 무한 루프**:
   - `isSyncingCameras` 플래그 확인
   - `CAMERA_MODIFIED` 이벤트 핸들러에서 플래그 설정 누락 시 발생

4. **Wheel 이벤트 충돌**:
   - `customWheelUnsubscribes` 배열 확인
   - 기존 이벤트 리스너 제거 여부 확인

### 6.2. 유용한 로그
```javascript
// commandsModule.ts에서 상태 확인
console.log('Sync enabled:', isSyncEnabled);
console.log('Magnification state:', magnificationState);
console.log('Previous cameras:', previousCameras);

// mammographyMidline.ts에서 앵커 확인
console.log('[getFixedMidlineAnchor] imageBounds:', imageBounds);
console.log('[getMidlineAnchor] worldPoint:', worldPoint);
```

---

## 7. 주요 알고리즘

### 7.1. Chest Wall Anchoring (Zoom from Edge)
유방촬영 영상의 특성상 유방 가장자리(chest wall)를 고정점으로 확대/축소해야 합니다:

```typescript
// 1. Laterality 판별 (R = 오른쪽, L = 왼쪽)
const laterality = inferLateralityFromViewport(viewport);

// 2. imageBounds에서 고정 앵커 계산
const imageBounds = viewport.getImageData().getBounds(); // [minX, maxX, minY, maxY, minZ, maxZ]
const anchorWorld = laterality === 'R'
  ? [imageBounds[1], imageCenterY, imageCenterZ] // 오른쪽 가장자리
  : [imageBounds[0], imageCenterY, imageCenterZ]; // 왼쪽 가장자리

// 3. Zoom 비율 계산
const zoomRatio = newParallelScale / currentParallelScale;

// 4. 카메라 shift 계산 (앵커를 고정하면서 zoom)
const shift = [
  (anchorWorld[0] - currentFocalPoint[0]) * (1 - zoomRatio),
  (anchorWorld[1] - currentFocalPoint[1]) * (1 - zoomRatio),
  (anchorWorld[2] - currentFocalPoint[2]) * (1 - zoomRatio),
];

// 5. 카메라 업데이트
viewport.setCamera({
  parallelScale: newParallelScale,
  focalPoint: [currentFocalPoint[0] + shift[0], ...],
  position: [currentPosition[0] + shift[0], ...],
});
```

### 7.2. 동기화 메커니즘
여러 뷰포트의 zoom/pan/contrast를 동기화:

```typescript
// CAMERA_MODIFIED 이벤트 리스너
element.addEventListener(Enums.Events.CAMERA_MODIFIED, () => {
  if (isSyncingCameras) return; // 무한 루프 방지

  isSyncingCameras = true;

  // Zoom 감지
  if (currentCamera.parallelScale !== previousCamera.parallelScale) {
    const zoomRatio = currentCamera.parallelScale / previousCamera.parallelScale;

    // 모든 다른 뷰포트에 동일한 zoom ratio 적용 (각자의 chest wall 기준)
    otherViewports.forEach(vp => {
      const anchor = getFixedMidlineAnchor(vp);
      // anchor 기준으로 zoom 적용...
    });
  }

  // Pan 감지
  if (focalPointChanged && !zoomChanged) {
    const delta = currentFocalPoint - previousFocalPoint;

    // 모든 다른 뷰포트에 동일한 delta 적용
    otherViewports.forEach(vp => {
      vp.setCamera({
        focalPoint: vp.getCamera().focalPoint + delta,
      });
    });
  }

  isSyncingCameras = false;
});
```

---

**마지막 업데이트**: 2026-01-01
