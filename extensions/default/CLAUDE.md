# extensions/default/src 폴더 분석

## 목차

1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 앱에서의 책임](#전체-앱에서의-책임)
   - 1.2. [직접 연결되는 화면/기능](#직접-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [모듈 진입점 및 모듈 Export](#21-모듈-진입점-및-모듈-export)
   - 2.2. [모듈 Export 함수들 (OHIF Extension API)](#22-모듈-export-함수들-ohif-extension-api)
   - 2.3. [데이터 소스 (DataSources)](#23-데이터-소스-datasources)
   - 2.4. [패널 (Panels)](#24-패널-panels)
   - 2.5. [툴바 (Toolbar)](#25-툴바-toolbar)
   - 2.6. [뷰어 레이아웃 (ViewerLayout)](#26-뷰어-레이아웃-viewerlayout)
   - 2.7. [Hanging Protocols](#27-hanging-protocols)
   - 2.8. [커맨드 (Commands)](#28-커맨드-commands)
   - 2.9. [상태 관리 (Zustand Stores)](#29-상태-관리-zustand-stores)
   - 2.10. [커스터마이제이션 (Customizations)](#210-커스터마이제이션-customizations)
   - 2.11. [컨텍스트 메뉴 (CustomizableContextMenu)](#211-컨텍스트-메뉴-customizablecontextmenu)
   - 2.12. [기타 컴포넌트 및 유틸리티](#212-기타-컴포넌트-및-유틸리티)
3. [컴포넌트 간 관계 / 데이터 흐름 다이어그램](#3-컴포넌트-간-관계--데이터-흐름-다이어그램)
4. [리액트 관점에서 볼 포인트](#4-리액트-관점에서-볼-포인트)
   - 4.1. [상태 관리 방식](#41-상태-관리-방식)
   - 4.2. [재사용 가능한 UI 컴포넌트 패턴](#42-재사용-가능한-ui-컴포넌트-패턴)
   - 4.3. [커스텀 훅](#43-커스텀-훅)
5. [OHIF 특유 개념 정리](#5-ohif-특유-개념-정리)
   - 5.1. [Extension (확장)](#51-extension-확장)
   - 5.2. [Mode (모드)](#52-mode-모드)
   - 5.3. [Hanging Protocol (HP)](#53-hanging-protocol-hp)
   - 5.4. [DisplaySet](#54-displayset)
   - 5.5. [Viewport](#55-viewport)
   - 5.6. [Command (커맨드)](#56-command-커맨드)
   - 5.7. [Service (서비스)](#57-service-서비스)
   - 5.8. [Customization (커스터마이제이션)](#58-customization-커스터마이제이션)
   - 5.9. [HTJ2K Level 2 Decoding (커스텀 개념)](#59-htj2k-level-2-decoding-커스텀-개념)
6. [관련 폴더 링크](#6-관련-폴더-링크)
7. [초보 개발자용 학습 가이드](#7-초보-개발자용-학습-가이드)
   - 7.1. [추천 학습 순서](#71-추천-학습-순서)
   - 7.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#72-이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 7.3. [학습 팁](#73-학습-팁)

## 1. 모듈 개요

`extensions/default/src`는 OHIF Viewer의 **핵심 기본 확장(Extension)**으로, 의료 영상 뷰어의 필수 기능을 제공하는 중추 역할을 합니다.

### 1.1. 전체 앱에서의 책임
- **데이터 소스 관리**: DICOMweb, 로컬 파일, JSON 등 다양한 데이터 소스 제공
- **UI 레이아웃**: 뷰어 헤더, 사이드 패널, 툴바 등 기본 UI 구조 제공
- **Hanging Protocol**: 의료 영상 레이아웃 규칙(어떤 영상을 어디에 배치할지) 정의
- **커맨드 시스템**: 뷰어 전체에서 사용하는 명령어(예: 레이아웃 변경, 시리즈 전환) 제공
- **전역 상태 관리**: Zustand 기반 스토어로 뷰포트, UI 상태 관리
- **커스터마이징**: 커스터마이제이션 포인트 제공 (포크 없이 수정 가능)

### 1.2. 직접 연결되는 화면/기능
- **뷰어 메인 화면**: 좌측 스터디 브라우저, 상단 툴바, 중앙 뷰포트 그리드
- **USMPR 모드**: HTJ2K Level 2 디코딩, Hanging Protocol (hpUSMPR.ts)
- **모든 모드**: 기본 데이터 소스, 패널, 툴바, 커맨드는 모든 모드에서 공통 사용

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1 모듈 진입점 및 모듈 Export

| 파일 | 역할 |
|------|------|
| **index.ts** | 확장의 메인 진입점 - 모든 모듈을 export하고 onModeExit 훅 정의 |
| **id.ts** | 확장 고유 ID (`@ohif/extension-default`) 정의 |
| **init.tsx** (preRegistration) | 확장 초기화 로직 (ExtensionManager 등록 전 실행) |

### 2.2 모듈 Export 함수들 (OHIF Extension API)

| 파일 | 모듈 타입 | 역할 |
|------|----------|------|
| **getDataSourcesModule.js** | DataSourcesModule | DICOMweb, 로컬, JSON, Proxy 데이터 소스 제공 |
| **getPanelModule.tsx** | PanelModule | 좌측/우측 사이드 패널 제공 (예: 스터디 브라우저) |
| **getToolbarModule.tsx** | ToolbarModule | 툴바 버튼, 레이아웃 셀렉터 등 제공 |
| **getHangingProtocolModule.js** | HangingProtocolModule | Hanging Protocol 정의 (default, hpUSMPR 등) |
| **commandsModule.ts** | CommandsModule | 뷰어 커맨드 정의 (toggleOneUp, setHangingProtocol 등) |
| **getViewportModule.tsx** | ViewportModule | 커스텀 뷰포트 타입 제공 (chartViewport) |
| **getLayoutTemplateModule.js** | LayoutTemplateModule | 뷰어 레이아웃 템플릿 제공 (ViewerLayout) |
| **getSopClassHandlerModule.js** | SopClassHandlerModule | SOP Class별 처리 로직 (예: Chart 데이터) |
| **getCustomizationModule.tsx** | CustomizationModule | 커스터마이제이션 포인트 정의 |

### 2.3 데이터 소스 (DataSources)

```
DicomWebDataSource/          - DICOMweb API 연동
├── index.ts                  - createDicomWebApi (HTJ2K 메타데이터 조정 포함)
├── qido.js                   - QIDO-RS (검색) 구현
├── retrieveStudyMetadata.js  - WADO-RS (메타데이터 조회)
├── wado/                     - WADO 로더 (Async/Sync)
└── utils/
    ├── getImageId.js         - Cornerstone imageId 생성
    ├── StaticWadoClient.ts   - 정적 WADO 클라이언트
    └── ...                   - 유틸리티 함수들

DicomLocalDataSource/         - 로컬 파일 데이터 소스
├── index.js                  - createDicomLocalApi (HTJ2K Level 2 메타데이터 조정)
└── ...

DicomJSONDataSource/          - JSON 데이터 소스
DicomWebProxyDataSource/      - Proxy 데이터 소스
MergeDataSource/              - 여러 데이터 소스 병합
```

**HTJ2K 관련 커스터마이징**:
- `DicomLocalDataSource/index.js`: 로컬 파일 로딩 시 HTJ2K Level 2 해상도 조정
- `DicomWebDataSource/index.ts`: DICOMweb 요청 시 HTJ2K 메타데이터 조정

### 2.4 패널 (Panels)

| 파일 | 역할 |
|------|------|
| **Panels/WrappedPanelStudyBrowser.tsx** | 좌측 스터디 브라우저 패널 (시리즈 썸네일 리스트) |
| **Panels/StudyBrowser/PanelStudyBrowserHeader.tsx** | 스터디 브라우저 헤더 (환자 정보 등) |
| **Panels/DataSourceSelector.tsx** | 데이터 소스 선택 UI |
| **Panels/getStudiesForPatientByMRN.js** | 환자 MRN으로 스터디 검색 |
| **Panels/requestDisplaySetCreationForStudy.js** | 스터디에 대한 DisplaySet 생성 요청 |

### 2.5 툴바 (Toolbar)

| 파일 | 역할 |
|------|------|
| **Toolbar/Toolbar.tsx** | 툴바 컴포넌트 (모드에서 정의한 버튼 렌더링) |
| **Toolbar/ToolButtonWrapper.tsx** | 툴 버튼 래퍼 (아이콘, 라벨, 액션) |
| **Toolbar/ToolbarLayoutSelector.tsx** | 레이아웃 선택 드롭다운 (1x1, 2x2 등) |
| **Toolbar/ToolBoxWrapper.tsx** | 툴박스 래퍼 (툴 그룹) |
| **Toolbar/ProgressDropdownWithService.tsx** | 진행률 드롭다운 (이미지 로딩) |

### 2.6 뷰어 레이아웃 (ViewerLayout)

| 파일 | 역할 |
|------|------|
| **ViewerLayout/index.tsx** | 메인 레이아웃 컴포넌트 (헤더 + 패널 + 뷰포트 그리드) |
| **ViewerLayout/ViewerHeader.tsx** | 뷰어 상단 헤더 (환자 정보, 툴바) |
| **ViewerLayout/HeaderPatientInfo/HeaderPatientInfo.tsx** | 환자 정보 표시 컴포넌트 |
| **ViewerLayout/ResizablePanelsHook.tsx** | 패널 리사이즈 훅 (좌우 패널 크기 조정) |

### 2.7 Hanging Protocols

| 파일 | 역할 |
|------|------|
| **hangingprotocols/hpUSMPR.ts** | [커스텀] USMPR 모드 Hanging Protocol (4V+1S 레이아웃) |
| **hangingprotocols/hpMNGrid.ts** | MxN 그리드 레이아웃 |
| **hangingprotocols/hpCompare.ts** | 비교 레이아웃 (이전/현재 비교) |
| **hangingprotocols/hpMammo.ts** | 유방 촬영 레이아웃 |
| **hangingprotocols/hpScale.ts** | 스케일 레이아웃 |
| **hangingprotocols/utils/** | Hanging Protocol 유틸리티 (selector, attributes 등) |

### 2.8 커맨드 (Commands)

| 파일 | 주요 커맨드 | 역할 |
|------|-----------|------|
| **commandsModule.ts** | | 뷰어 전체 커맨드 정의 |
| | `setHangingProtocol` | Hanging Protocol 적용 (protocolId, stageIndex) |
| | `toggleHangingProtocol` | Hanging Protocol 토글 (이전 상태 복원) |
| | `toggleOneUp` | 1-port ↔ 4-port 전환 (USMPR 핵심) |
| | `setViewportGridLayout` | 뷰포트 그리드 레이아웃 변경 (MxN) |
| | `updateViewportDisplaySet` | 활성 뷰포트의 DisplaySet 변경 (시리즈 전환) |
| | `addDisplaySetAsLayer` | DisplaySet을 레이어로 추가 (Segmentation 등) |
| | `removeDisplaySetLayer` | 레이어 제거 |
| | `showContextMenu` | 컨텍스트 메뉴 표시 |
| | `openDICOMTagViewer` | DICOM Tag 브라우저 열기 |
| | `multimonitor` | 멀티 모니터 모드 실행 |

**USMPR 관련 핵심 커맨드**:
- `toggleOneUp` (558~866줄): Axial ↔ Sagittal/Coronal 1-port 전환, 슬라이스 위치 저장/복원

### 2.9 상태 관리 (Zustand Stores)

| 파일 | 역할 |
|------|------|
| **stores/useViewportGridStore.ts** | 뷰포트 그리드 상태 저장 (HP별 레이아웃 캐싱) |
| **stores/useDisplaySetSelectorStore.ts** | DisplaySet Selector 매핑 저장 (HP에서 사용) |
| **stores/useHangingProtocolStageIndexStore.ts** | HP Stage Index 저장 (스터디별 마지막 Stage) |
| **stores/useToggleHangingProtocolStore.ts** | HP 토글 상태 저장 (이전 HP 복원용) |
| **stores/useToggleOneUpViewportGridStore.ts** | 1-port 토글 상태 저장 (4-port 복원용) |
| **stores/useViewportsByPositionStore.ts** | 위치별 뷰포트 매핑 저장 |
| **stores/useUIStateStore.ts** | UI 상태 저장 (패널 열림/닫힘 등) |

### 2.10 커스터마이제이션 (Customizations)

```
customizations/
├── contextMenuCustomization.ts        - 컨텍스트 메뉴 커스터마이제이션
├── hotkeyBindingsCustomization.ts     - 단축키 바인딩
├── overlayItemCustomization.tsx       - 뷰포트 오버레이 아이템
├── aboutModalCustomization.tsx        - About 모달
├── userPreferencesCustomization.tsx   - 사용자 설정
├── loadingIndicatorProgressCustomization.tsx - 로딩 인디케이터
└── ...                                - 기타 커스터마이제이션
```

### 2.11 컨텍스트 메뉴 (CustomizableContextMenu)

| 파일 | 역할 |
|------|------|
| **CustomizableContextMenu/ContextMenuController.tsx** | 컨텍스트 메뉴 컨트롤러 |
| **CustomizableContextMenu/ContextMenuItemsBuilder.ts** | 메뉴 아이템 빌더 (커스터마이제이션 적용) |
| **CustomizableContextMenu/types.ts** | 타입 정의 |

### 2.12 기타 컴포넌트 및 유틸리티

| 파일/폴더 | 역할 |
|----------|------|
| **DicomTagBrowser/** | DICOM Tag 브라우저 UI |
| **Components/MoreDropdownMenu.tsx** | 더보기 드롭다운 메뉴 |
| **Components/SidePanelWithServices.tsx** | 사이드 패널 래퍼 (서비스 주입) |
| **Components/LineChartViewport/** | 라인 차트 뷰포트 (Chart SOP Class용) |
| **utils/** | 유틸리티 함수들 (callInputDialog, colorPickerDialog, promptSaveReport 등) |
| **hooks/usePatientInfo.ts** | 환자 정보 커스텀 훅 |
| **findViewportsByPosition.ts** | 위치별 뷰포트 찾기 유틸리티 |

---

## 3. 컴포넌트 간 관계 / 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OHIF Viewer App                              │
│                    (platform/app/src/App.tsx)                        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ↓
                    ┌───────────────────────┐
                    │ ExtensionManager      │ ← 확장 등록
                    │ (preRegistration)     │
                    └───────────┬───────────┘
                                │
                ┌───────────────┼───────────────┐
                ↓               ↓               ↓
        ┌───────────┐   ┌──────────────┐   ┌─────────────┐
        │ Mode      │   │ Services     │   │ Commands    │
        │ (usmpr)   │   │ Manager      │   │ Manager     │
        └─────┬─────┘   └──────┬───────┘   └──────┬──────┘
              │                │                   │
              └────────────────┼───────────────────┘
                               ↓
    ┌──────────────────────────────────────────────────────────────┐
    │         extensions/default/src (Default Extension)           │
    ├──────────────────────────────────────────────────────────────┤
    │                                                                │
    │  ┌─────────────────┐    ┌──────────────────┐                │
    │  │ DataSources     │    │ ViewerLayout     │                │
    │  │ Module          │    │ Module           │                │
    │  ├─────────────────┤    ├──────────────────┤                │
    │  │ • DICOMweb      │    │ • ViewerLayout   │                │
    │  │ • DICOMlocal    │    │ • ViewerHeader   │                │
    │  │ • DICOMJSON     │    │ • SidePanels     │                │
    │  │ • DICOMProxy    │    │                  │                │
    │  └────────┬────────┘    └─────────┬────────┘                │
    │           │                       │                          │
    │           ↓                       ↓                          │
    │  ┌─────────────────┐    ┌──────────────────┐                │
    │  │ Panel Module    │    │ Toolbar Module   │                │
    │  ├─────────────────┤    ├──────────────────┤                │
    │  │ • StudyBrowser  │    │ • ToolButtons    │                │
    │  │                 │    │ • LayoutSelector │                │
    │  └────────┬────────┘    └─────────┬────────┘                │
    │           │                       │                          │
    │           ↓                       ↓                          │
    │  ┌─────────────────────────────────────────┐                │
    │  │ Hanging Protocol Module                 │                │
    │  ├─────────────────────────────────────────┤                │
    │  │ • default, hpUSMPR, hpMNGrid, hpMammo   │                │
    │  └─────────────────┬───────────────────────┘                │
    │                    │                                         │
    │                    ↓                                         │
    │  ┌─────────────────────────────────────────┐                │
    │  │ Commands Module                         │                │
    │  ├─────────────────────────────────────────┤                │
    │  │ • toggleOneUp                           │                │
    │  │ • setHangingProtocol                    │                │
    │  │ • setViewportGridLayout                 │                │
    │  │ • updateViewportDisplaySet              │                │
    │  │ • addDisplaySetAsLayer                  │                │
    │  └─────────────────┬───────────────────────┘                │
    │                    │                                         │
    │                    ↓                                         │
    │  ┌─────────────────────────────────────────┐                │
    │  │ Zustand Stores (Global State)           │                │
    │  ├─────────────────────────────────────────┤                │
    │  │ • useViewportGridStore                  │                │
    │  │ • useDisplaySetSelectorStore            │                │
    │  │ • useToggleOneUpViewportGridStore       │                │
    │  │ • useHangingProtocolStageIndexStore     │                │
    │  │ • useUIStateStore                       │                │
    │  └─────────────────────────────────────────┘                │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘
```

### 데이터 흐름 상세

#### 1. 스터디 로딩 흐름
```
User Action (Load Study)
  ↓
DataSource (DICOMweb/Local)
  ├─→ QIDO-RS (Study/Series 검색)
  ├─→ WADO-RS (Metadata 조회)
  │   └─→ HTJ2K 메타데이터 조정 (DicomWebDataSource/index.ts)
  └─→ DicomMetadataStore (메타데이터 저장)
  ↓
DisplaySetService (DisplaySet 생성)
  ↓
HangingProtocolService (HP 적용)
  └─→ hpUSMPR (USMPR 모드의 경우)
  ↓
ViewportGridService (뷰포트 그리드 설정)
  ↓
CornerstoneViewportService (뷰포트 렌더링)
```

#### 2. Hanging Protocol 적용 흐름
```
commandsManager.run('setHangingProtocol', { protocolId: 'hpUSMPR' })
  ↓
commandsModule.ts → actions.setHangingProtocol
  ├─→ reuseCachedLayouts (캐시된 레이아웃 재사용)
  ├─→ useViewportGridStore (이전 상태 저장)
  └─→ hangingProtocolService.setProtocol()
      ├─→ hpUSMPR.ts (4V+1S 레이아웃 정의)
      ├─→ displaySetSelectors (어떤 시리즈를 어디에 배치할지)
      └─→ viewportOptions (뷰포트 타입, toolGroupId 등)
  ↓
viewportGridService.set() (뷰포트 그리드 업데이트)
  ↓
ViewerLayout 리렌더링 (ViewportGridComp)
```

#### 3. 1-port ↔ 4-port 토글 흐름 (toggleOneUp)
```
User Action (Double Click on Viewport or ToolButton)
  ↓
commandsManager.run('toggleOneUp', { viewportId: 'mpr-1' })
  ↓
commandsModule.ts → actions.toggleOneUp
  ├─→ 현재 레이아웃 확인 (1x1 or 2x2)
  │
  ├─ [If 2x2 → 1x1]
  │   ├─→ useToggleOneUpViewportGridStore.set (이전 상태 저장)
  │   ├─→ Axial 클릭 시: STACK viewport (mpr-stack-single) 사용
  │   └─→ Sagittal/Coronal 클릭 시: VOLUME viewport 사용
  │
  └─ [If 1x1 → 2x2]
      ├─→ 뷰포트 위치 저장 (window._ohifViewportExitPosition)
      │   ├─→ STACK viewport: getCurrentImageIdIndex()
      │   └─→ VOLUME viewport: camera.focalPoint (world coordinates)
      ├─→ useToggleOneUpViewportGridStore.get (이전 상태 복원)
      └─→ viewportGridService.setLayout (2x2 복원)
          └─→ commandsManager.run('resetCrosshairs') (크로스헤어 재설정)
```

#### 4. HTJ2K Level 2 디코딩 흐름
```
[DICOMweb 데이터 소스]
DICOMweb Config (requestTransferSyntaxUID: '1.2.840.10008.1.2.4.201')
  ↓
DicomWebDataSource/index.ts → retrieveStudyMetadata
  ├─→ WADO-RS 요청 (Accept: multipart/related; type=application/dicom)
  └─→ 메타데이터 수신
  ↓
adjustHTJ2KMetadata() (instance 단위)
  ├─→ isHTJ2K(instance) 체크
  ├─→ getHTJ2KResolutionFactor() (window.config.htj2k.volumeDecodeLevel → 2 → 4배)
  ├─→ Rows, Columns 조정 (원본 / 4)
  ├─→ PixelSpacing 조정 (원본 × 4)
  └─→ instance._htj2kAdjusted = true
  ↓
DicomMetadataStore에 저장
  ↓
Cornerstone Volume Rendering (조정된 메타데이터 사용)
  └─→ 1/4 해상도 Volume 생성 (빠른 MPR)

[로컬 파일 데이터 소스]
DicomLocalDataSource/index.js → naturalizeImagePixelModule
  ├─→ isHTJ2K(instance) 체크
  ├─→ getAdjustedImagePixelModule()
  │   ├─→ Rows, Columns 조정 (원본 / 4)
  │   └─→ PixelSpacing 조정 (원본 × 4)
  └─→ ImagePixelModule 반환 (조정된 값)
```

---

## 4. 리액트 관점에서 볼 포인트

### 4.1 상태 관리 방식

#### A. Zustand 전역 상태 (Extension 레벨)
- **목적**: 모드 종료 시 초기화되는 세션 상태 저장
- **위치**: `extensions/default/src/stores/`
- **특징**:
  - `create()` 함수로 스토어 생성
  - `devtools` 미들웨어로 디버깅 가능 (DEBUG_STORE 플래그)
  - 모드 종료 시 `onModeExit()` 훅에서 `clearXXXState()` 호출

**주요 스토어**:
```typescript
// 뷰포트 그리드 상태 캐싱 (HP별 레이아웃 저장)
useViewportGridStore.getState().setViewportGridState(key, value)

// 1-port 토글 상태 저장 (4-port 복원용)
useToggleOneUpViewportGridStore.getState().setToggleOneUpViewportGridStore(state)

// DisplaySet Selector 매핑 (HP에서 사용)
useDisplaySetSelectorStore.getState().setDisplaySetSelector(key, value)
```

**사용 예시**:
```typescript
// commandsModule.ts - toggleOneUp 커맨드
const { toggleOneUpViewportGridStore } = useToggleOneUpViewportGridStore.getState();
if (!toggleOneUpViewportGridStore) {
  return; // 복원할 상태가 없으면 종료
}
```

#### B. OHIF 서비스 (전역, 모드 간 공유)
- **목적**: 앱 전체에서 공유되는 비즈니스 로직 및 데이터
- **위치**: `platform/core/src/services/`
- **접근 방식**: `servicesManager.services.XXXService`

**주요 서비스**:
```typescript
const {
  displaySetService,       // DisplaySet (시리즈 그룹) 관리
  hangingProtocolService,  // Hanging Protocol 적용
  viewportGridService,     // 뷰포트 그리드 상태 관리
  cornerstoneViewportService, // Cornerstone 뷰포트 제어
  uiNotificationService,   // 알림 표시
  customizationService,    // 커스터마이제이션 적용
} = servicesManager.services;
```

#### C. Props (컴포넌트 간 데이터 전달)
- **ViewerLayout**: 모드에서 `leftPanelClosed`, `ViewportGridComp` 등 props 전달
- **WrappedPanelStudyBrowser**: `servicesManager`, `commandsManager`, `extensionManager` 주입

#### D. React Hooks (로컬 상태)
- `useState`: 컴포넌트 로컬 상태 (예: `showLoadingIndicator`)
- `useEffect`: 사이드 이펙트 (예: 패널 변경 감지)
- `useCallback`: 메모이제이션 (예: `hasPanels`)

### 4.2 재사용 가능한 UI 컴포넌트 패턴

#### A. Wrapper 패턴 (서비스 주입)
```typescript
// getLayoutTemplateModule.js
function ViewerLayoutWithServices(props) {
  return ViewerLayout({
    servicesManager,
    extensionManager,
    commandsManager,
    hotkeysManager,
    ...props,
  });
}
```
- **목적**: Extension Module에서 서비스를 주입받아 컴포넌트에 전달
- **사용처**: `ViewerLayout`, `ToolbarLayoutSelector`, `PanelStudyBrowser`

#### B. Higher-Order Component 패턴
```typescript
// SidePanelWithServices.tsx
export const SidePanelWithServices = ({ servicesManager, ...props }) => {
  const { panelService } = servicesManager.services;
  // ... 서비스 로직
  return <SidePanel {...props} />;
};
```
- **목적**: 서비스 로직을 UI 컴포넌트와 분리
- **장점**: 테스트 용이성, 재사용성 증가

#### C. Render Props 패턴
```typescript
// getToolbarModule.tsx
{
  name: 'ohif.layoutSelector',
  defaultComponent: props =>
    ToolbarLayoutSelectorWithServices({ ...props, commandsManager, servicesManager }),
}
```
- **목적**: 모듈에서 컴포넌트 정의 시 런타임 props 주입
- **사용처**: 툴바 버튼, 패널 컴포넌트

#### D. Compound Component 패턴
```typescript
// ViewerLayout/index.tsx
<ResizablePanelGroup {...resizablePanelGroupProps}>
  <ResizablePanel {...resizableLeftPanelProps}>
    <SidePanelWithServices side="left" />
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel {...resizableViewportGridPanelProps}>
    <ViewportGridComp />
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel {...resizableRightPanelProps}>
    <SidePanelWithServices side="right" />
  </ResizablePanel>
</ResizablePanelGroup>
```
- **목적**: 복잡한 레이아웃을 선언적으로 정의
- **장점**: 가독성, 재사용성

### 4.3 커스텀 훅

#### usePatientInfo (hooks/usePatientInfo.ts)
```typescript
const { patientName, patientId, ... } = usePatientInfo({ servicesManager });
```
- **목적**: 활성 뷰포트의 환자 정보 추출
- **사용처**: `HeaderPatientInfo`, `PanelStudyBrowserHeader`

#### useResizablePanels (ViewerLayout/ResizablePanelsHook.tsx)
```typescript
const [
  leftPanelProps,
  rightPanelProps,
  resizablePanelGroupProps,
  ...
] = useResizablePanels(leftPanelClosed, setLeftPanelClosed, ...);
```
- **목적**: 좌우 패널 리사이즈 로직 캡슐화
- **반환값**: 패널 props, 이벤트 핸들러

#### 사용 권장사항
- **비즈니스 로직 재사용**: 여러 컴포넌트에서 사용하는 로직은 커스텀 훅으로 분리
- **서비스 접근 캡슐화**: `usePatientInfo`처럼 서비스 접근 로직을 훅으로 감싸기
- **상태 로직 분리**: `useResizablePanels`처럼 복잡한 상태 로직을 훅으로 추출

---

## 5. OHIF 특유 개념 정리

### 5.1 Extension (확장)
**정의**: OHIF Viewer의 플러그인 시스템으로, 특정 기능을 모듈화한 패키지
- **구조**: `getXXXModule()` 함수를 통해 모듈 export
- **등록**: `ExtensionManager`에 등록 (`preRegistration` 훅 실행 → 모듈 등록)
- **예시**: `@ohif/extension-default`, `@ohif/extension-cornerstone`

**extensions/default가 제공하는 모듈**:
1. **DataSourcesModule**: 데이터 소스 (DICOMweb, 로컬, JSON, Proxy, Merge)
2. **PanelModule**: 사이드 패널 (스터디 브라우저)
3. **ToolbarModule**: 툴바 컴포넌트 (버튼, 레이아웃 셀렉터)
4. **HangingProtocolModule**: Hanging Protocol 정의
5. **CommandsModule**: 커맨드 (toggleOneUp, setHangingProtocol 등)
6. **ViewportModule**: 커스텀 뷰포트 (chartViewport)
7. **LayoutTemplateModule**: 레이아웃 템플릿 (ViewerLayout)
8. **SopClassHandlerModule**: SOP Class 핸들러
9. **CustomizationModule**: 커스터마이제이션 포인트

### 5.2 Mode (모드)
**정의**: Extension들을 조합하여 특정 워크플로우를 정의한 것
- **위치**: `modes/usmpr/`, `modes/longitudinal/` 등
- **구성 요소**:
  - `id`: 모드 고유 ID
  - `routes`: 라우트 정의
  - `extensions`: 사용할 확장 목록
  - `hangingProtocol`: 기본 Hanging Protocol ID
  - `onModeEnter()`, `onModeExit()`: 모드 진입/종료 훅

**USMPR 모드와 default extension 관계**:
```typescript
// modes/usmpr/src/index.tsx
{
  id: 'usmpr',
  extensions: [
    '@ohif/extension-default',    // ← default extension 사용
    '@ohif/extension-cornerstone',
    // ...
  ],
  hangingProtocol: ['hpUSMPR'],  // ← default extension의 hpUSMPR 사용
  // ...
}
```

### 5.3 Hanging Protocol (HP)
**정의**: 의료 영상을 어떻게 배치할지 정의하는 규칙
- **위치**: `extensions/default/src/hangingprotocols/`
- **핵심 개념**:
  - **protocolMatchingRules**: 어떤 스터디/시리즈에 적용할지 (예: Modality === 'US')
  - **stages**: HP의 여러 단계 (예: Stage 0: 2x2, Stage 1: 1x1)
  - **viewportStructure**: 뷰포트 레이아웃 (grid, rows, columns)
  - **displaySetSelectors**: 어떤 시리즈를 선택할지 (예: isReconstructable === true)
  - **viewportOptions**: 뷰포트 옵션 (viewportType, toolGroupId, orientation 등)

**hpUSMPR 예시** (extensions/default/src/hangingprotocols/hpUSMPR.ts):
```typescript
{
  id: 'hpUSMPR',
  protocolMatchingRules: [
    { attribute: 'Modality', constraint: { equals: 'US' } },
    { attribute: 'isReconstructable', constraint: { equals: true } },
  ],
  stages: [
    {
      viewportStructure: {
        layoutType: 'grid',
        properties: { rows: 2, columns: 2 },
      },
      viewports: [
        { viewportOptions: { viewportType: 'volume', orientation: 'axial', ... } },
        { viewportOptions: { viewportType: 'volume', orientation: 'sagittal', ... } },
        { viewportOptions: { viewportType: 'volume', orientation: 'coronal', ... } },
        { viewportOptions: { viewportType: 'volume', viewportId: 'mpr-3', ... } },
      ],
    },
  ],
}
```

### 5.4 DisplaySet
**정의**: 관련된 DICOM 인스턴스(이미지)의 그룹
- **생성**: `DisplaySetService.makeDisplaySets()`
- **예시**:
  - 하나의 Series → 하나의 DisplaySet
  - Volume (Reconstructable) → Stack DisplaySet + Volume DisplaySet
  - Segmentation → SEG DisplaySet (Derived)

**관련 서비스**:
- `DisplaySetService`: DisplaySet 생성/관리
- `DisplaySetSelector`: HP에서 DisplaySet 선택 로직

### 5.5 Viewport
**정의**: 영상을 렌더링하는 화면 영역
- **타입**:
  - `stack`: 2D 스택 뷰 (Axial 원본)
  - `volume`: 3D 볼륨 뷰 (MPR, MIP)
  - `chart`: 차트 뷰 (이 확장에서 제공)
- **옵션**:
  - `viewportId`: 고유 ID (예: 'mpr-0', 'mpr-1')
  - `orientation`: 방향 (axial, sagittal, coronal)
  - `toolGroupId`: 툴 그룹 (공유 툴 설정)
  - `syncGroups`: 동기화 그룹 (crosshairs, cine 등)

### 5.6 Command (커맨드)
**정의**: 뷰어 전체에서 사용하는 액션 (함수)
- **등록**: `commandsModule.ts`의 `definitions` 객체
- **실행**: `commandsManager.run('commandName', options)`
- **특징**:
  - 모드, 확장, 훅 어디서든 호출 가능
  - 서비스 접근 가능 (servicesManager)
  - 체이닝 가능 (한 커맨드가 다른 커맨드 호출)

**주요 커맨드**:
- `setHangingProtocol`: HP 적용
- `toggleOneUp`: 1-port 토글
- `setViewportGridLayout`: 레이아웃 변경 (MxN)
- `updateViewportDisplaySet`: 시리즈 전환
- `showContextMenu`: 컨텍스트 메뉴 표시

### 5.7 Service (서비스)
**정의**: OHIF의 비즈니스 로직 및 상태 관리 클래스
- **위치**: `platform/core/src/services/`
- **관리**: `ServicesManager` (중앙 레지스트리)
- **특징**:
  - PubSub 패턴 (이벤트 발행/구독)
  - 싱글톤 (앱 전체에서 하나의 인스턴스)
  - Extension/Mode 간 공유

**default extension이 사용하는 주요 서비스**:
- `DisplaySetService`: DisplaySet 관리
- `HangingProtocolService`: HP 적용
- `ViewportGridService`: 뷰포트 그리드 상태 관리
- `CornerstoneViewportService`: Cornerstone 뷰포트 제어
- `PanelService`: 사이드 패널 관리
- `UINotificationService`: 알림 표시
- `CustomizationService`: 커스터마이제이션 적용

### 5.8 Customization (커스터마이제이션)
**정의**: 포크 없이 OHIF를 수정할 수 있는 포인트
- **위치**: `extensions/default/src/customizations/`
- **등록**: `getCustomizationModule.tsx`
- **사용**: `customizationService.getCustomization('id')`

**주요 커스터마이제이션**:
- `contextMenuCustomization`: 컨텍스트 메뉴 아이템 커스터마이징
- `hotkeyBindingsCustomization`: 단축키 바인딩
- `overlayItemCustomization`: 뷰포트 오버레이 아이템
- `loadingIndicatorProgressCustomization`: 로딩 인디케이터

### 5.9 HTJ2K Level 2 Decoding (커스텀 개념)
**정의**: HTJ2K 압축 이미지를 Level 2 (1/4 해상도)로 디코딩하여 빠른 MPR 구현
- **위치**:
  - `DicomLocalDataSource/index.js`
  - `DicomWebDataSource/index.ts`
- **동작 방식**:
  1. HTJ2K Transfer Syntax UID 감지
  2. `window.config.htj2k.volumeDecodeLevel` 읽기 (기본값 2)
  3. 메타데이터 조정:
     - `Rows`, `Columns` ÷ 4
     - `PixelSpacing` × 4
  4. Cornerstone Volume 생성 시 조정된 메타데이터 사용
  5. 1/4 해상도 Volume으로 빠른 MPR 렌더링

**설정**:
```javascript
// platform/app/public/config/default.js
window.config = {
  htj2k: {
    enabled: true,
    volumeDecodeLevel: 2, // 0: 원본, 1: 1/2, 2: 1/4, 3: 1/8
  },
};
```

---

## 6. 관련 폴더 링크

- **`platform/core/src/services/`**: OHIF 서비스 정의 (DisplaySetService, HangingProtocolService 등)
- **`platform/core/src/extensions/`**: Extension 인터페이스 정의 (MODULE_TYPES)
- **`modes/usmpr/`**: USMPR 모드 (default extension의 hpUSMPR 사용)
- **`extensions/cornerstone/`**: Cornerstone 확장 (렌더링 엔진)
- **`platform/ui/`**, **`platform/ui-next/`**: UI 컴포넌트 라이브러리

---

## 7. 초보 개발자용 학습 가이드

### 7.1 추천 학습 순서

#### Step 1: 구조 이해 (1-2일)
1. **index.ts** 읽기: 확장의 진입점, 어떤 모듈을 export하는지 확인
2. **getDataSourcesModule.js**: 데이터 소스의 종류 파악
3. **getHangingProtocolModule.js**: Hanging Protocol의 개념 이해
4. **getPanelModule.tsx**, **getToolbarModule.tsx**: UI 컴포넌트 모듈 구조 파악

#### Step 2: 컴포넌트 탐색 (2-3일)
1. **ViewerLayout/index.tsx**: 메인 레이아웃 구조 분석
   - ResizablePanel, SidePanelWithServices, ViewportGridComp의 관계
2. **Panels/WrappedPanelStudyBrowser.tsx**: 스터디 브라우저 패널
3. **Toolbar/Toolbar.tsx**: 툴바 렌더링 로직

#### Step 3: 상태 관리 (2-3일)
1. **stores/**: Zustand 스토어 구조 이해
   - `useViewportGridStore`: 뷰포트 그리드 상태
   - `useToggleOneUpViewportGridStore`: 1-port 토글 상태
2. **commandsModule.ts**: 주요 커맨드 분석
   - `toggleOneUp` (558~866줄): 1-port 토글 로직
   - `setHangingProtocol` (365~467줄): HP 적용 로직

#### Step 4: Hanging Protocol 심화 (2-3일)
1. **hangingprotocols/hpUSMPR.ts**: USMPR HP 분석
   - `protocolMatchingRules`: 적용 조건
   - `displaySetSelectors`: 시리즈 선택 로직
   - `viewportOptions`: 뷰포트 옵션
2. **hangingprotocols/utils/**: HP 유틸리티
   - `seriesSelectors.ts`: 시리즈 선택 함수
   - `registerHangingProtocolAttributes.ts`: 커스텀 속성 등록

#### Step 5: 데이터 소스 (3-5일)
1. **DicomWebDataSource/index.ts**: DICOMweb 데이터 소스
   - `retrieveStudyMetadata`: 메타데이터 조회
   - `adjustHTJ2KMetadata`: HTJ2K 메타데이터 조정
2. **DicomLocalDataSource/index.js**: 로컬 파일 데이터 소스
   - HTJ2K Level 2 디코딩 로직
3. **DicomWebDataSource/qido.js**: QIDO-RS (검색)
4. **DicomWebDataSource/wado/**: WADO-RS (메타데이터 조회)

#### Step 6: 커스터마이제이션 (2-3일)
1. **getCustomizationModule.tsx**: 커스터마이제이션 포인트 정의
2. **customizations/contextMenuCustomization.ts**: 컨텍스트 메뉴
3. **customizations/hotkeyBindingsCustomization.ts**: 단축키
4. **CustomizableContextMenu/**: 컨텍스트 메뉴 빌더

#### Step 7: 실습 프로젝트 (1주)
1. **새로운 Hanging Protocol 만들기**:
   - `hangingprotocols/hpCustom.ts` 생성
   - `getHangingProtocolModule.js`에 등록
   - 모드에서 사용
2. **커스텀 툴바 버튼 추가**:
   - `toolbarButtons.ts` (모드)에 버튼 정의
   - `commandsModule.ts`에 커맨드 추가
3. **커스텀 패널 만들기**:
   - `Panels/MyCustomPanel.tsx` 생성
   - `getPanelModule.tsx`에 등록

### 7.2 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF 확장(Extension) 개발**: 새로운 데이터 소스, 패널, 툴바, HP를 추가할 수 있습니다.
2. **Hanging Protocol 설계**: 의료 워크플로우에 맞는 레이아웃을 정의할 수 있습니다.
3. **뷰어 커스터마이징**: 포크 없이 CustomizationService를 통해 UI/UX를 수정할 수 있습니다.
4. **HTJ2K 최적화**: Progressive 디코딩을 활용한 성능 최적화를 구현할 수 있습니다.
5. **USMPR 모드 이해**: USMPR 모드의 핵심 로직(toggleOneUp, HTJ2K Level 2)을 파악하고 유지보수할 수 있습니다.

### 7.3 학습 팁

- **디버깅**: Chrome DevTools에서 Zustand 스토어 상태를 확인하세요 (`DEBUG_STORE = true` 설정)
- **로그 추적**: `console.log`를 추가하여 데이터 흐름을 추적하세요
- **예제 참조**: `hpUSMPR.ts`, `commandsModule.ts`의 `toggleOneUp`은 훌륭한 학습 자료입니다
- **문서 활용**: [OHIF 공식 문서](https://docs.ohif.org/)의 Extension, Mode, Hanging Protocol 섹션 참고
- **커뮤니티**: [OHIF GitHub Discussions](https://github.com/OHIF/Viewers/discussions)에서 질문하세요

---

**Last Updated**: 2026-01-01
