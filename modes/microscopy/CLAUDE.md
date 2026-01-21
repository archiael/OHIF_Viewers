# modes/microscopy - DICOM 현미경(Microscopy) 모드

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
   - 1.3. [특징](#1.3-특징)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일 역할](#2.2-주요-파일-역할)
   - 2.3. [데이터 흐름 다이어그램 (텍스트)](#2.3-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [이 폴더에서 사용되는 OHIF 개념](#4.1-이-폴더에서-사용되는-ohif-개념)
   - 4.2. [관련되는 다른 폴더 링크](#4.2-관련되는-다른-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [학습 추천 순서](#5.1-학습-추천-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
6. [추가 참고 자료](#6-추가-참고-자료)
   - 6.1. [관련 라이브러리](#6.1-관련-라이브러리)
   - 6.2. [확장 모듈 구조](#6.2-확장-모듈-구조)
   - 6.3. [측정 도구 목록](#6.3-측정-도구-목록)
7. [개발 팁](#7-개발-팁)
   - 7.1. [새로운 측정 도구 추가하기](#7.1-새로운-측정-도구-추가하기)
   - 7.2. [커스텀 패널 추가하기](#7.2-커스텀-패널-추가하기)
   - 7.3. [다른 모달리티 지원하기](#7.3-다른-모달리티-지원하기)

---


## 1. 모듈 개요

### 1.1. 전체 OHIF 앱에서의 역할
이 폴더는 **DICOM VL Whole Slide Microscopy Image (SM 모달리티)** 전용 뷰어 모드를 정의합니다. 병리학(pathology) 분야에서 사용되는 디지털 슬라이드 이미지를 웹 브라우저에서 보고 측정할 수 있는 완전한 워크플로우를 제공합니다.

### 1.2. 연결되는 화면/기능
- **URL 라우트**: `/microscopy`
- **주요 화면**: 현미경 슬라이드 뷰어 (고해상도 이미지 확대/축소, 패닝)
- **측정 도구**: 선(line), 점(point), 다각형(polygon), 원(circle), 사각형(box), 자유곡선 등
- **패널**: 왼쪽(시리즈 목록), 오른쪽(측정값 표시)

### 1.3. 특징
- **모달리티 제한**: SM (Slide Microscopy) 모달리티만 지원 (`isValidMode`에서 검증)
- **고해상도 이미지**: 피라미드 타일 구조의 WSI (Whole Slide Image) 지원
- **측정 기능**: 병리학 분석을 위한 다양한 annotation 도구 제공


## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
modes/microscopy/src/
├── index.tsx          (143줄) - 모드 정의 및 설정의 핵심 파일
├── toolbarButtons.ts  (142줄) - 측정 도구 버튼 정의
└── id.js              (6줄)   - 모드 ID 정의 (패키지명에서 가져옴)
```

### 2.2. 주요 파일 역할

**`index.tsx`** - 모드 팩토리 및 설정
- `modeFactory`: 모드 객체를 생성하는 팩토리 함수
- `onModeEnter`: 모드 진입 시 toolbar 설정 (측정 도구 등록)
- `onModeExit`: 모드 종료 시 UI 초기화
- `isValidMode`: SM 모달리티만 허용하는 검증 로직
- `routes`: `/microscopy` 경로의 레이아웃 정의
- `sopClassHandlers`: DICOM Microscopy 전용 SOP Class 핸들러 등록

**`toolbarButtons.ts`** - 툴바 버튼 설정
- 7개 측정 도구: line, point, polygon, circle, box, freehandpolygon, freehandline
- dragPan: 이미지 이동 도구
- TagBrowser: DICOM 태그 뷰어
- 각 버튼은 `setToolActive` 명령과 연결

**`id.js`** - 모드 식별자
- 모드 ID를 `@ohif/mode-microscopy`로 설정


### 2.3. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 접속: /microscopy]
          ↓
[modeFactory 실행]
          ↓
[isValidMode 검증] → SM 모달리티가 아니면 거부
          ↓
[onModeEnter 호출]
          ↓
[toolbarService.register(toolbarButtons)]
          ↓
[측정 도구 버튼 표시: line, point, polygon, ...]
          ↓
[사용자가 도구 선택] → [setToolActive 명령 실행]
          ↓
[@ohif/extension-dicom-microscopy에서 도구 활성화]
          ↓
[viewport에 현미경 이미지 + 측정값 렌더링]
          ↓
[측정값 → rightPanel (measure 패널)에 표시]
```


## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

**Service 기반 상태 관리**:
- 이 모드는 React 컴포넌트를 직접 정의하지 않고, **설정 객체**만 제공합니다
- 상태 관리는 OHIF의 서비스들이 담당:
  - `toolbarService`: 툴바 버튼 등록 및 활성화 상태 관리
  - `uiDialogService`, `uiModalService`: 다이얼로그/모달 표시
  - `displaySetService`: 현미경 이미지 데이터 관리
  - `measurementService`: 측정값 저장 및 추적

**라이프사이클 훅**:
```typescript
onModeEnter: ({ servicesManager }) => {
  // 모드 진입 시 실행
  const { toolbarService } = servicesManager.services;
  toolbarService.register(toolbarButtons);
  toolbarService.updateSection('primary', ['MeasurementTools', 'dragPan', 'TagBrowser']);
}

onModeExit: ({ servicesManager }) => {
  // 모드 종료 시 정리
  const { toolbarService, uiDialogService, uiModalService } = servicesManager.services;
  uiDialogService.hideAll();
  uiModalService.hide();
  toolbarService.reset();
}
```

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드는 확장(extension)이 제공하는 컴포넌트를 조립하는 방식:
- **레이아웃**: `@ohif/extension-default.layoutTemplateModule.viewerLayout`
- **좌측 패널**: `@ohif/extension-default.panelModule.seriesList`
- **우측 패널**: `@ohif/extension-dicom-microscopy.panelModule.measure`
- **뷰포트**: `@ohif/extension-dicom-microscopy.viewportModule.microscopy-dicom`

### 3.3. 커스텀 훅
이 모드 자체는 커스텀 훅을 정의하지 않습니다. 대신 `@ohif/extension-dicom-microscopy` 확장이 제공하는 기능을 사용합니다.


## 4. OHIF 특유 개념 정리

### 4.1. 이 폴더에서 사용되는 OHIF 개념

**Mode (모드)**:
- 확장들을 조합하여 특정 워크플로우를 정의하는 "설정 번들"
- Microscopy 모드 = 현미경 이미지 보기 + 측정 도구 + 시리즈 리스트

**Extension Dependencies (확장 의존성)**:
```typescript
const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',              // 기본 레이아웃, 패널
  '@ohif/extension-cornerstone': '^3.0.0',          // 이미지 렌더링 엔진
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0', // Structured Report
  '@ohif/extension-dicom-pdf': '^3.0.1',            // PDF 렌더링
  '@ohif/extension-dicom-video': '^3.0.1',          // 비디오 렌더링
  '@ohif/extension-dicom-microscopy': '^3.0.0',     // [핵심] 현미경 기능
};
```

**SOP Class Handlers (SOP 클래스 핸들러)**:
- DICOM 파일의 SOP Class UID에 따라 어떻게 렌더링할지 결정
- Microscopy 모드는 다음을 처리:
  - `DicomMicroscopySopClassHandler`: 현미경 이미지
  - `DicomMicroscopySRSopClassHandler`: 현미경 Structured Report
  - `DicomMicroscopyANNSopClassHandler`: 현미경 Annotation

**Toolbar Service**:
```typescript
toolbarService.register(toolbarButtons);  // 버튼 정의 등록
toolbarService.updateSection('primary', [...]); // 툴바 영역 업데이트
toolbarService.updateSection('MeasurementTools', [...]); // 드롭다운 메뉴 구성
```

**Routes (라우트)**:
- `path: 'microscopy'` → `/microscopy` URL로 접근
- `layoutTemplate` 함수가 화면 레이아웃을 동적으로 생성

**Hanging Protocol (행잉 프로토콜)**:
- `hangingProtocol: 'default'` → 기본 프로토콜 사용
- 현미경 이미지는 보통 단일 뷰포트로 표시되므로 복잡한 레이아웃 불필요

### 4.2. 관련되는 다른 폴더 링크

- **확장 모듈**: `extensions/dicom-microscopy/` - 현미경 뷰포트 및 측정 기능 구현
- **공통 확장**: `extensions/default/` - 레이아웃, 패널, 기본 UI
- **코어 서비스**: `platform/core/src/services/` - ToolbarService, DisplaySetService 등
- **타입 정의**: `platform/core/types/` - Button, Mode 타입 정의


## 5. 초보 개발자용 학습 가이드

### 5.1. 학습 추천 순서

1. **모드 개념 이해** (30분)
   - `index.tsx`의 `modeFactory` 구조 파악
   - 모드가 하는 일: "확장들을 조합해서 완전한 워크플로우 만들기"

2. **확장 의존성 확인** (20분)
   - `extensionDependencies` 객체 확인
   - 특히 `@ohif/extension-dicom-microscopy` 폴더 탐색
   - 이 확장이 제공하는 모듈들(viewport, panel, sopClassHandler) 확인

3. **라이프사이클 훅** (20분)
   - `onModeEnter`에서 toolbar 설정하는 방법
   - `onModeExit`에서 리소스 정리하는 방법
   - `servicesManager`를 통한 서비스 접근

4. **툴바 버튼 설정** (30분)
   - `toolbarButtons.ts` 파일 분석
   - 각 버튼의 `commands` 속성 (어떤 명령을 실행하는가?)
   - `evaluate` 속성 (언제 버튼이 활성화되는가?)

5. **레이아웃 구성** (30분)
   - `routes[0].layoutTemplate` 함수 분석
   - `leftPanels`, `rightPanels`, `viewports` 설정
   - 각 패널/뷰포트가 어떤 확장 모듈을 사용하는지

6. **실제 실행** (30분)
   - SM 모달리티 DICOM 파일 준비 (또는 샘플 데이터)
   - `yarn dev` 실행 후 `/microscopy` 접속
   - 측정 도구 사용해보기
   - 브라우저 DevTools에서 `servicesManager.services.toolbarService` 탐색

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

**할 수 있게 되는 것**:
- OHIF에서 새로운 워크플로우 모드를 만들 수 있습니다 (예: CT 전용 모드, MR 전용 모드 등)
- 특정 모달리티에만 동작하는 커스텀 모드를 설정할 수 있습니다 (`isValidMode` 활용)
- 툴바 버튼을 추가하거나 재구성할 수 있습니다
- 확장(extension)들을 조합하여 완전한 뷰어 애플리케이션을 구성하는 방법을 이해합니다
- OHIF의 서비스 기반 아키텍처를 활용하여 상태를 관리하는 방법을 배웁니다

**핵심 깨달음**:
Microscopy 모드는 코드가 매우 간결합니다 (143줄). 왜냐하면 **실제 기능 구현은 확장(extension)에 있고, 모드는 단지 "어떤 확장을 어떻게 조합할지" 설정만 하기 때문**입니다. 이것이 OHIF의 모듈화 철학입니다.


## 6. 추가 참고 자료

### 6.1. 관련 라이브러리
- [DICOM Microscopy Viewer](https://github.com/ImagingDataCommons/dicom-microscopy-viewer) - Vanilla JS 기반 현미경 이미지 뷰어 라이브러리
- [SLIM Viewer](https://github.com/imagingdatacommons/slim) - 현미경 이미지 annotation 전용 단일 페이지 앱 (이 라이브러리를 기반으로 함)

### 6.2. 확장 모듈 구조
이 모드가 사용하는 확장 모듈들:
```typescript
// Layout
'@ohif/extension-default.layoutTemplateModule.viewerLayout'

// Panels
'@ohif/extension-default.panelModule.seriesList'        // 좌측
'@ohif/extension-dicom-microscopy.panelModule.measure'  // 우측

// Viewport
'@ohif/extension-dicom-microscopy.viewportModule.microscopy-dicom'

// SOP Class Handlers
'@ohif/extension-cornerstone.sopClassHandlerModule.DicomMicroscopySopClassHandler'
'@ohif/extension-dicom-microscopy.sopClassHandlerModule.DicomMicroscopySRSopClassHandler'
'@ohif/extension-dicom-microscopy.sopClassHandlerModule.DicomMicroscopyANNSopClassHandler'
```

### 6.3. 측정 도구 목록
| 도구 ID | 아이콘 | 설명 |
|---------|--------|------|
| line | tool-length | 직선 측정 |
| point | tool-point | 점 마커 |
| polygon | tool-polygon | 다각형 영역 |
| circle | tool-circle | 원형 영역 |
| box | tool-rectangle | 사각형 영역 |
| freehandpolygon | tool-freehand-polygon | 자유 다각형 |
| freehandline | tool-freehand-line | 자유 곡선 |
| dragPan | tool-move | 이미지 이동 |


## 7. 개발 팁

### 7.1. 새로운 측정 도구 추가하기
1. `toolbarButtons.ts`에 버튼 정의 추가
2. `onModeEnter`의 `toolbarService.updateSection('MeasurementTools', [...])` 배열에 도구 ID 추가
3. 실제 도구 구현은 `@ohif/extension-dicom-microscopy`에서 수행

### 7.2. 커스텀 패널 추가하기
1. `routes[0].layoutTemplate`의 `leftPanels` 또는 `rightPanels`에 패널 모듈 ID 추가
2. 패널 구현은 확장에서 제공해야 함

### 7.3. 다른 모달리티 지원하기
`isValidMode` 함수 수정:
```typescript
isValidMode: ({ modalities }) => {
  const modalities_list = modalities.split('\\');
  return {
    valid: modalities_list.includes('SM') || modalities_list.includes('CT'),
    description: 'Supports SM and CT modalities',
  };
}
```


---

**작성일**: 2026-01-01
**OHIF 버전**: 3.12.0-beta.113
**모드 ID**: `@ohif/mode-microscopy`
