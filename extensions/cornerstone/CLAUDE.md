# extensions/cornerstone/src

## 목차

1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 앱에서의 역할](#전체-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#연결되는-화면기능)
   - 1.3. [HTJ2K 최적화 (mView 커스텀)](#htj2k-최적화-mview-커스텀)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [메인 진입점](#메인-진입점)
   - 2.2. [핵심 모듈 Export 파일들](#핵심-모듈-export-파일들)
   - 2.3. [Viewport 컴포넌트](#viewport-컴포넌트)
   - 2.4. [Services (핵심 비즈니스 로직)](#services-핵심-비즈니스-로직)
   - 2.5. [Custom Hooks](#custom-hooks)
   - 2.6. [Zustand Stores (전역 상태 관리)](#zustand-stores-전역-상태-관리)
   - 2.7. [UI Components](#ui-components)
   - 2.8. [Panels](#panels)
   - 2.9. [Utils (유틸리티)](#utils-유틸리티)
   - 2.10. [컴포넌트/데이터 흐름 다이어그램](#컴포넌트데이터-흐름-다이어그램)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅 역할과 사용처](#커스텀-훅-역할과-사용처)
   - 3.4. [React 라이프사이클 활용](#react-라이프사이클-활용)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension 시스템](#extension-시스템)
   - 4.2. [Services](#services)
   - 4.3. [Hanging Protocols](#hanging-protocols)
   - 4.4. [Cornerstone3D 주요 개념](#cornerstone3d-주요-개념)
   - 4.5. [HTJ2K Progressive Decoding (mView 커스텀)](#htj2k-progressive-decoding-mview-커스텀)
   - 4.6. [관련 폴더 링크](#관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [학습 추천 순서](#학습-추천-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [초보자를 위한 팁](#초보자를-위한-팁)
6. [추가 참고 자료](#추가-참고-자료)

## 1. 모듈 개요

`extensions/cornerstone`는 **OHIF 뷰어의 핵심 이미지 렌더링 엔진**입니다. Cornerstone3D 라이브러리를 OHIF에 통합하여 의료 영상의 실제 화면 표시를 담당합니다.

### 1.1. 전체 앱에서의 역할
- **2D Stack Viewport**: 일반적인 Axial/Sagittal/Coronal 단면 이미지 렌더링
- **3D Volume Viewport**: MPR(Multi-Planar Reconstruction), Volume Rendering, MIP 등 고급 렌더링
- **측정 도구(Measurement Tools)**: Length, Angle, ROI 등 의료 영상 측정 기능
- **세그멘테이션(Segmentation)**: DICOM SEG, RT STRUCT 등 분할 이미지 렌더링 및 편집
- **도구 관리(Tool Management)**: 의료 영상 분석 도구들의 활성화/비활성화 제어

### 1.2. 연결되는 화면/기능
- **모든 Viewport**: USMPR, Basic, Longitudinal 등 모든 모드에서 이미지를 표시하는 기본 컴포넌트
- **측정 패널**: 사이드바의 측정값 목록 및 관리
- **세그멘테이션 패널**: 세그멘테이션 편집 및 시각화
- **툴바**: 도구 버튼(Zoom, Pan, WindowLevel 등)과 연동

### 1.3. HTJ2K 최적화 (mView 커스텀)
이 프로젝트에서는 HTJ2K Progressive Decoding을 지원하도록 커스터마이징되어 있습니다:
- `utils/htj2kConfig.ts`: HTJ2K 설정 중앙 관리
- `index.tsx` (95~207줄): Volume/Stack별 decodeLevel 설정
- Volume(MPR): Level 2 (1/4 해상도) → 빠른 로딩
- Stack(Axial): Level 2 → Level 0 (Full) 자동 전환

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 메인 진입점
- **`index.tsx`**: Extension 메인 진입점 - 모든 모듈(commands, panels, viewports 등) export
- **`init.tsx`**: Cornerstone3D 초기화 - 라이브러리 설정, 서비스 연결, 이벤트 핸들러 등록

### 2.2. 핵심 모듈 Export 파일들
- **`commandsModule.ts`**: 명령어 모듈 - 이미지 조작, 측정, 세그멘테이션 관련 100+ 커맨드 정의
- **`getToolbarModule.tsx`**: 툴바 컴포넌트 및 평가 로직 제공
- **`getPanelModule.tsx`**: 사이드 패널 (측정, 세그멘테이션) 제공
- **`getCustomizationModule.tsx`**: 커스터마이징 훅 제공
- **`getHangingProtocolModule.ts`**: Hanging Protocol 정의
- **`getSopClassHandlerModule.js`**: DICOM SOP Class별 처리 로직

### 2.3. Viewport 컴포넌트
- **`Viewport/OHIFCornerstoneViewport.tsx`**: 메인 뷰포트 컴포넌트 - 이미지를 실제로 렌더링하는 React 컴포넌트
- **`Viewport/Overlays/CornerstoneOverlays.tsx`**: 이미지 위 오버레이 (환자 정보, 화살표 등)
- **`Viewport/Overlays/CustomizableViewportOverlay.tsx`**: 커스터마이징 가능한 오버레이
- **`Viewport/Overlays/ViewportImageScrollbar.tsx`**: 이미지 스크롤바
- **`Viewport/Overlays/ViewportOrientationMarkers.tsx`**: 방향 마커 (L/R/A/P 등)

### 2.4. Services (핵심 비즈니스 로직)
- **`services/ViewportService/CornerstoneViewportService.ts`**: Viewport 생성/관리/동기화
- **`services/ToolGroupService/ToolGroupService.ts`**: 도구 그룹 관리 (도구 활성화/비활성화)
- **`services/SegmentationService/SegmentationService.ts`**: 세그멘테이션 데이터 관리
- **`services/SyncGroupService/SyncGroupService.ts`**: 뷰포트 간 동기화 (crosshair, VOI 등)
- **`services/ColorbarService/ColorbarService.ts`**: Colorbar 관리
- **`services/CornerstoneCacheService/CornerstoneCacheService.ts`**: 이미지 캐시 관리

### 2.5. Custom Hooks
- **`hooks/useMeasurements.ts`**: 측정값 데이터 구독 및 변환
- **`hooks/useSegmentations.ts`**: 세그멘테이션 데이터 구독
- **`hooks/useViewportRendering.tsx`**: 뷰포트 렌더링 상태 관리
- **`hooks/useViewportHover.ts`**: 뷰포트 hover 상태 추적
- **`hooks/useMeasurementTracking.ts`**: 측정값 추적 상태 관리

### 2.6. Zustand Stores (전역 상태 관리)
- **`stores/useLutPresentationStore.ts`**: LUT(Lookup Table) 프레젠테이션 저장소
- **`stores/usePositionPresentationStore.ts`**: 위치/슬라이스 프레젠테이션 저장소
- **`stores/useSegmentationPresentationStore.ts`**: 세그멘테이션 프레젠테이션 저장소
- **`stores/useSynchronizersStore.ts`**: Synchronizer 저장소
- **`stores/useSelectedSegmentationsForViewportStore.ts`**: 선택된 세그멘테이션 저장소

### 2.7. UI Components
- **`components/WindowLevelActionMenu/`**: Window/Level 조정 메뉴
- **`components/ViewportWindowLevel/ViewportWindowLevel.tsx`**: Window/Level UI 컴포넌트
- **`components/CinePlayer/CinePlayer.tsx`**: 시네 재생 컨트롤
- **`components/MeasurementsMenu.tsx`**: 측정값 메뉴
- **`components/DicomUpload/`**: DICOM 파일 업로드 UI

### 2.8. Panels
- **`panels/PanelMeasurement.tsx`**: 측정 패널 (사이드바)
- **`panels/PanelSegmentation.tsx`**: 세그멘테이션 패널 (사이드바)

### 2.9. Utils (유틸리티)
- **`utils/htj2kConfig.ts`**: HTJ2K 설정 중앙 관리 (mView 커스텀)
- **`utils/htj2kMetadataAdjuster.ts`**: HTJ2K 메타데이터 조정
- **`utils/dicomLoaderService.js`**: DICOM 로더 서비스
- **`utils/getActiveViewportEnabledElement.ts`**: 활성 뷰포트 가져오기
- **`utils/measurementServiceMappings/`**: 측정값 매핑 (Cornerstone ↔ OHIF)
- **`utils/interleaveCenterLoader.ts`**: 중앙 우선 이미지 로딩 전략
- **`utils/interleaveTopToBottom.ts`**: 상단→하단 이미지 로딩 전략
- **`utils/nthLoader.ts`**: N번째 프레임 로딩 전략

### 2.10. 컴포넌트/데이터 흐름 다이어그램

```
[index.tsx] - Extension 진입점
    │
    ├─> [init.tsx] - Cornerstone3D 초기화
    │       │
    │       ├─> initCornerstoneTools() - 도구 등록
    │       ├─> initWADOImageLoader() - DICOM 로더 설정
    │       ├─> connectToolsToMeasurementService() - 측정 서비스 연결
    │       └─> Services 등록 (ToolGroup, Segmentation, Viewport 등)
    │
    ├─> [getViewportModule] - Viewport 컴포넌트 제공
    │       │
    │       └─> OHIFCornerstoneViewport
    │               │
    │               ├─> CornerstoneOverlays (환자 정보, 방향 표시)
    │               ├─> CinePlayer (시네 재생)
    │               └─> ViewportActionCorners (액션 버튼)
    │
    ├─> [getCommandsModule] - 100+ 커맨드 제공
    │       │
    │       ├─> setToolActive
    │       ├─> createSegmentation
    │       ├─> jumpToMeasurement
    │       └─> ... (측정, 세그멘테이션, 뷰포트 제어 등)
    │
    ├─> [getPanelModule] - 사이드 패널 제공
    │       │
    │       ├─> PanelMeasurement (측정값 목록)
    │       └─> PanelSegmentation (세그멘테이션 편집)
    │
    └─> [getToolbarModule] - 툴바 컴포넌트 제공
            │
            ├─> WindowLevelActionMenu
            ├─> AdvancedRenderingControls
            └─> TrackingStatus

[Services 레이어]
    CornerstoneViewportService - Viewport 생성/관리
            │
            ├─> ToolGroupService - 도구 활성화/비활성화
            ├─> SegmentationService - 세그멘테이션 관리
            ├─> SyncGroupService - 뷰포트 동기화
            └─> ColorbarService - Colorbar 관리

[Stores 레이어 - Zustand]
    useLutPresentationStore - LUT 설정
    usePositionPresentationStore - 위치/슬라이스
    useSegmentationPresentationStore - 세그멘테이션 설정
    useSynchronizersStore - Synchronizer 목록

[Data Flow]
DICOM Image → ImageLoader → Cornerstone3D Cache → Viewport → React Component → User
                                                           ↓
                                                    ToolGroup → Tools (Zoom, Pan, etc)
                                                           ↓
                                                    MeasurementService → UI Panel
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

1. **Zustand Stores (전역 상태)**
   - `useLutPresentationStore`: LUT 프레젠테이션 설정 (Window/Level, VOI)
   - `usePositionPresentationStore`: 슬라이스 위치 정보
   - `useSegmentationPresentationStore`: 세그멘테이션 시각화 설정
   - `useSynchronizersStore`: Synchronizer 인스턴스 관리
   - **특징**: Zustand로 관리되어 컴포넌트 간 쉽게 공유, Redux보다 가벼움

2. **OHIF Services (전역 비즈니스 로직)**
   - `CornerstoneViewportService`: Viewport 생성/삭제/업데이트
   - `ToolGroupService`: 도구 그룹 생성/도구 활성화
   - `SegmentationService`: 세그멘테이션 CRUD
   - `MeasurementService`: 측정값 CRUD
   - **특징**: PubSub 패턴으로 이벤트 발행/구독 가능

3. **Local State (useState)**
   - `OHIFCornerstoneViewport` 내부: `scrollbarHeight`, `enabledVPElement`
   - 뷰포트별 UI 상태는 컴포넌트 로컬 상태로 관리

4. **Props Drilling**
   - `servicesManager`, `commandsManager`를 props로 전달받아 하위 컴포넌트에서 사용
   - Context API보다는 명시적 props 전달 선호

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

1. **Wrapper 패턴**
   ```typescript
   // getPanelModule.tsx
   const wrappedPanelSegmentation = props => {
     return (
       <PanelSegmentation
         commandsManager={commandsManager}
         servicesManager={servicesManager}
         {...props?.configuration}
       />
     );
   };
   ```
   - Extension에서 제공하는 컴포넌트를 감싸서 services 주입

2. **React.lazy + Suspense (코드 스플리팅)**
   ```typescript
   // index.tsx (79~89줄)
   const Component = React.lazy(() => {
     return import('./Viewport/OHIFCornerstoneViewport');
   });

   const OHIFCornerstoneViewport = props => {
     return (
       <React.Suspense fallback={<div>Loading...</div>}>
         <Component {...props} />
       </React.Suspense>
     );
   };
   ```
   - 뷰포트 컴포넌트를 동적으로 로드하여 초기 번들 크기 감소

3. **Menu Wrapper 패턴**
   ```typescript
   // WindowLevelActionMenuWrapper.tsx
   export const WindowLevelActionMenuWrapper = ({
     servicesManager,
     ...props
   }) => {
     return <WindowLevelActionMenu {...props} />;
   };
   ```
   - 메뉴 컴포넌트를 래핑하여 필요한 서비스만 주입

### 3.3. 커스텀 훅 역할과 사용처

1. **`useMeasurements()`** (`hooks/useMeasurements.ts`)
   - **역할**: MeasurementService 구독 및 측정값 데이터 변환
   - **사용처**: PanelMeasurement, MeasurementsMenu
   - **특징**: debounce 적용으로 과도한 리렌더링 방지

2. **`useSegmentations()`** (`hooks/useSegmentations.ts`)
   - **역할**: SegmentationService 구독 및 세그멘테이션 데이터 변환
   - **사용처**: PanelSegmentation
   - **특징**: 세그멘테이션 생성/수정/삭제 이벤트 자동 반영

3. **`useViewportRendering()`** (`hooks/useViewportRendering.tsx`)
   - **역할**: Viewport 렌더링 완료 상태 추적
   - **사용처**: OHIFCornerstoneViewport
   - **특징**: 이미지 로딩 상태를 React state로 관리

4. **`useViewportHover()`** (`hooks/useViewportHover.ts`)
   - **역할**: Viewport hover 상태 추적
   - **사용처**: Viewport Overlay 컴포넌트
   - **특징**: Mouse enter/leave 이벤트를 hook으로 추상화

5. **`useMeasurementTracking()`** (`hooks/useMeasurementTracking.ts`)
   - **역할**: 측정값 추적(tracking) 상태 관리
   - **사용처**: Longitudinal 모드의 측정값 추적 기능
   - **특징**: 측정값의 변경 사항 추적 및 알림

### 3.4. React 라이프사이클 활용

1. **`useEffect` - Viewport 초기화**
   ```typescript
   // OHIFCornerstoneViewport.tsx
   useEffect(() => {
     const element = elementRef.current;
     const resizeObserver = new ResizeObserver(onResize);
     resizeObserver.observe(element);

     return () => {
       resizeObserver.unobserve(element);
       resizeObserver.disconnect();
     };
   }, [onResize]);
   ```
   - ResizeObserver로 뷰포트 크기 변화 감지
   - cleanup에서 observer 해제

2. **Extension Lifecycle Hooks**
   ```typescript
   // index.tsx
   onModeEnter: ({ servicesManager, commandsManager }) => {
     // 모드 진입 시 이벤트 핸들러 등록
     setUpSegmentationEventHandlers({ servicesManager, commandsManager });
   },

   onModeExit: ({ servicesManager }) => {
     // 모드 종료 시 이미지 캐시 정리
     imageLoadPoolManager.clearRequestStack();
   },
   ```
   - Extension의 lifecycle에 맞춰 초기화/정리 수행

---

## 4. OHIF 특유 개념 정리

### 4.1. Extension 시스템

1. **Extension이란?**
   - OHIF의 플러그인 아키텍처
   - 특정 기능을 제공하는 독립적인 모듈
   - `extensions/cornerstone`은 이미지 렌더링 기능을 제공하는 Extension

2. **Module Types** (이 Extension이 제공하는 모듈들)
   - **ViewportModule**: 이미지를 표시하는 컴포넌트 (`OHIFCornerstoneViewport`)
   - **CommandsModule**: 이미지 조작/측정/세그멘테이션 명령어 (100+ commands)
   - **PanelModule**: 사이드 패널 (측정, 세그멘테이션)
   - **ToolbarModule**: 툴바 컴포넌트 (WindowLevel, Colorbar 등)
   - **CustomizationModule**: 커스터마이징 훅
   - **HangingProtocolModule**: Hanging Protocol 정의
   - **SopClassHandlerModule**: DICOM SOP Class별 처리 로직
   - **UtilityModule**: 유틸리티 함수 export (getCornerstoneLibraries 등)

3. **Extension 등록 및 사용**
   ```typescript
   // platform/app/src/App.tsx (또는 config)
   const extensions = [
     cornerstoneExtension, // @ohif/extension-cornerstone
     defaultExtension,
   ];
   ```

### 4.2. Services

1. **CornerstoneViewportService** (`services/ViewportService/`)
   - **역할**: Viewport 생성, 이미지 로딩, 뷰포트 간 동기화
   - **주요 메서드**:
     - `getCornerstoneViewport(viewportId)`: Viewport 인스턴스 가져오기
     - `setVolumesForViewport()`: Volume 데이터 설정
     - `resize()`: 모든 뷰포트 리사이즈
   - **이벤트**: `VIEWPORT_DATA_CHANGED`

2. **ToolGroupService** (`services/ToolGroupService/`)
   - **역할**: 도구 그룹 생성 및 도구 활성화/비활성화
   - **주요 메서드**:
     - `createToolGroupAndAddTools(toolGroupId, tools)`
     - `setToolActive(toolName, options)`
   - **개념**: Tool Group은 여러 뷰포트에서 공유되는 도구 집합

3. **SegmentationService** (`services/SegmentationService/`)
   - **역할**: 세그멘테이션 데이터 관리 (생성, 수정, 삭제, 렌더링)
   - **주요 메서드**:
     - `createSegmentation()`
     - `addSegmentationRepresentation()`
   - **이벤트**: `SEGMENTATION_MODIFIED`, `SEGMENTATION_REMOVED`

4. **SyncGroupService** (`services/SyncGroupService/`)
   - **역할**: 뷰포트 간 동기화 (crosshair, VOI, 슬라이스 등)
   - **주요 메서드**:
     - `addViewportToSyncGroup(viewportId, renderingEngineId, syncGroupId)`
   - **Synchronizer 종류**: `frameview`, `voi`, `imageSlice`

5. **ColorbarService** (`services/ColorbarService/`)
   - **역할**: Colorbar 관리 (PET, CT 등의 색상 범위 표시)
   - **주요 메서드**:
     - `hasColorbar(viewportId)`

### 4.3. Hanging Protocols

- **정의**: 스터디 타입별로 뷰포트 레이아웃 및 이미지 배치를 자동화하는 규칙
- **관련 파일**: `getHangingProtocolModule.ts`, `hps/`
- **예시**: CT 스터디는 Axial/Sagittal/Coronal 3x1 레이아웃, PET-CT는 Fusion 뷰
- **커스텀 HP**: `extensions/default/src/hangingprotocols/hpUSMPR.ts` (USMPR 모드용)

### 4.4. Cornerstone3D 주요 개념

1. **Rendering Engine**
   - GPU 기반 이미지 렌더링 엔진
   - 하나의 Rendering Engine에 여러 Viewport 등록 가능

2. **Viewport Types**
   - **Stack Viewport**: 2D 이미지 스택 (일반적인 Axial 뷰)
   - **Volume Viewport**: 3D Volume 렌더링 (MPR, Volume Rendering)

3. **Tool Groups**
   - 도구들의 집합 (Zoom, Pan, WindowLevel, Length, Angle 등)
   - 여러 뷰포트에서 같은 Tool Group 공유 가능

4. **Synchronizers**
   - 뷰포트 간 상태 동기화 (Crosshair, VOI, Slice 위치 등)

### 4.5. HTJ2K Progressive Decoding (mView 커스텀)

- **위치**: `utils/htj2kConfig.ts`, `index.tsx`
- **개념**: HTJ2K 이미지를 점진적으로 디코딩하여 빠른 로딩
- **decodeLevel**:
  - 0: Full Resolution
  - 1: 1/2 Resolution
  - 2: 1/4 Resolution (mView 기본값)
  - 3: 1/8 Resolution
- **전략**:
  - Volume(MPR): Level 2로 빠르게 로딩
  - Stack(Axial): Level 2 → Volume 로딩 완료 후 자동으로 Level 0 전환
- **설정 파일**: `platform/app/public/config/default.js`의 `htj2k` 섹션

### 4.6. 관련 폴더 링크

1. **`platform/core/src/services/`**: OHIF 기본 서비스들 (DisplaySetService, MeasurementService 등)
2. **`platform/app/src/`**: 메인 애플리케이션
3. **`extensions/default/`**: 기본 Extension (DataSource, Hanging Protocols 등)
4. **`modes/usmpr/`**: USMPR 모드 (이 Extension을 사용하는 커스텀 모드)
5. **`modes/longitudinal/`**: Longitudinal 모드 (측정 추적)

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 학습 추천 순서

#### 1단계: Extension 구조 파악 (1~2일)
1. **`index.tsx`** 읽기
   - Extension이 어떤 모듈들을 export하는지 확인
   - `onModeEnter`, `onModeExit` 라이프사이클 이해
   - HTJ2K 설정 부분 (95~207줄) 확인

2. **`init.tsx`** 읽기
   - Cornerstone3D 초기화 과정 이해
   - Services 등록 방식 파악
   - 이벤트 핸들러 등록 방식 확인

#### 2단계: Viewport 컴포넌트 이해 (2~3일)
3. **`Viewport/OHIFCornerstoneViewport.tsx`** 분석
   - Viewport가 어떻게 생성되는지 이해
   - ResizeObserver 사용법 확인
   - props로 어떤 데이터를 받는지 파악

4. **`Viewport/Overlays/CornerstoneOverlays.tsx`** 읽기
   - 오버레이가 어떻게 구성되는지 확인
   - 환자 정보, 방향 표시 등이 어떻게 렌더링되는지 이해

#### 3단계: Services 레이어 이해 (3~4일)
5. **`services/ViewportService/CornerstoneViewportService.ts`** 분석 (핵심!)
   - Viewport 생성/관리 로직 이해
   - `setVolumesForViewport()` 메서드 분석
   - PubSub 패턴 이해 (publish/subscribe)

6. **`services/ToolGroupService/ToolGroupService.ts`** 읽기
   - 도구 그룹 생성 방식 이해
   - 도구 활성화/비활성화 로직 파악

7. **`services/SegmentationService/SegmentationService.ts`** 읽기 (선택)
   - 세그멘테이션 관련 기능 사용 시 필수

#### 4단계: Commands 모듈 이해 (2~3일)
8. **`commandsModule.ts`** 훑어보기 (102KB, 매우 큼!)
   - 어떤 커맨드들이 있는지 목록만 확인
   - 자주 사용되는 커맨드 위주로 분석:
     - `setToolActive`
     - `createSegmentation`
     - `jumpToMeasurement`
     - `setViewportActive`

#### 5단계: Hooks와 Stores 이해 (2~3일)
9. **`hooks/useMeasurements.ts`** 분석
   - 측정값 데이터 구독 방식 이해
   - debounce 사용법 확인

10. **`stores/useLutPresentationStore.ts`** 읽기
    - Zustand Store 구조 이해
    - LUT 프레젠테이션 개념 파악

#### 6단계: HTJ2K 커스터마이징 이해 (mView 특화, 1~2일)
11. **`utils/htj2kConfig.ts`** 분석
    - HTJ2K 설정 중앙 관리 방식 이해
    - `getDecodeLevel()`, `switchStackToFullResolution()` 함수 파악

12. **`index.tsx`의 HTJ2K 부분 (95~207줄)** 분석
    - Volume/Stack별 decodeLevel 설정 로직 이해
    - `decodeAxialCenterSlice()` 함수 분석

#### 7단계: 실습 (3~5일)
13. **간단한 커스터마이징 해보기**
    - 툴바 버튼 추가: `getToolbarModule.tsx` 수정
    - 커맨드 추가: `commandsModule.ts`에 새 커맨드 정의
    - HTJ2K 설정 변경: `htj2kConfig.ts`에서 decodeLevel 조정

14. **디버깅 연습**
    - Chrome DevTools에서 Cornerstone3D 객체 확인 (`window.cornerstone`)
    - Services 인스턴스 확인 (`window.services`)
    - Viewport 상태 확인 (`cornerstoneViewportService.getCornerstoneViewport()`)

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF 뷰어의 이미지 렌더링 메커니즘 완전 이해**
   - Stack/Volume Viewport의 차이와 생성 방식
   - 이미지 로딩 전략 (interleave, sequential 등)
   - GPU 기반 렌더링 원리

2. **의료 영상 도구 개발 능력**
   - 새로운 측정 도구 추가 (예: 새로운 ROI 도구)
   - 기존 도구 커스터마이징 (예: Length 도구 색상 변경)
   - 세그멘테이션 기능 확장

3. **성능 최적화 능력**
   - HTJ2K Progressive Decoding 최적화
   - 이미지 캐싱 전략 수립
   - Viewport 렌더링 최적화

4. **OHIF Extension 개발 능력**
   - 새로운 Extension 개발 (예: 3D Slicer 통합)
   - 기존 Extension 확장
   - 다른 의료 영상 라이브러리 통합 (예: VTK.js, ITK.js)

### 5.3. 초보자를 위한 팁

1. **너무 한번에 다 이해하려 하지 마세요**
   - Cornerstone Extension은 매우 방대합니다 (102KB commandsModule.ts!)
   - 필요한 부분부터 찾아서 이해하세요

2. **브라우저 DevTools를 적극 활용하세요**
   ```javascript
   // Console에서 직접 테스트
   window.cornerstone.getRenderingEngines()
   window.services.cornerstoneViewportService.getCornerstoneViewport('mpr-0')
   ```

3. **공식 Cornerstone3D 문서를 함께 보세요**
   - [Cornerstone3D Docs](https://www.cornerstonejs.org/)
   - OHIF의 Cornerstone Extension은 Cornerstone3D 라이브러리의 래퍼입니다

4. **HTJ2K 관련 코드는 mView 프로젝트 특화입니다**
   - 원본 OHIF에는 없는 커스터마이징
   - `utils/htj2kConfig.ts`, `index.tsx` 95~207줄 집중

5. **이벤트 흐름을 추적하세요**
   - 사용자 클릭 → 커맨드 실행 → Service 호출 → Cornerstone3D API → Viewport 업데이트
   - 이 흐름을 이해하면 전체 구조가 보입니다

---

## 6. 추가 참고 자료

- **OHIF 공식 문서**: https://docs.ohif.org/
- **Cornerstone3D 공식 문서**: https://www.cornerstonejs.org/
- **프로젝트 루트 CLAUDE.md**: HTJ2K 관련 설명
- **modes/usmpr/CLAUDE.md**: USMPR 모드에서 이 Extension을 어떻게 사용하는지 확인
