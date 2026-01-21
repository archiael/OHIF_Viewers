# modes/basic-test-mode - OHIF 기본 테스트 모드 분석

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일별 역할](#2.2-주요-파일별-역할)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 패턴](#3.2-재사용-가능한-ui-패턴)
   - 3.3. [커스텀 훅 (없음)](#3.3-커스텀-훅-없음)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Mode (모드)](#4.1-mode-모드)
   - 4.2. [Extensions (확장)](#4.2-extensions-확장)
   - 4.3. [Services (서비스)](#4.3-services-서비스)
   - 4.4. [Hanging Protocol (행잉 프로토콜)](#4.4-hanging-protocol-행잉-프로토콜)
   - 4.5. [Tool Groups (툴 그룹)](#4.5-tool-groups-툴-그룹)
   - 4.6. [SOP Class Handler](#4.6-sop-class-handler)
   - 4.7. [관련 폴더 링크](#4.7-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
6. [추가 참고 자료](#6-추가-참고-자료)
   - 6.1. [코드 예시: 커스텀 모드 만들기](#6.1-코드-예시-커스텀-모드-만들기)
   - 6.2. [디버깅 팁](#6.2-디버깅-팁)

---


## 1. 모듈 개요

`modes/basic-test-mode`는 **OHIF 뷰어의 기본 기능을 테스트하기 위한 제어된 환경을 제공하는 모드**입니다. 프로덕션이나 일반 개발용이 아닌, **테스트 전용 모드**로 설계되었습니다.

### 1.1. 전체 OHIF 앱에서의 역할
- **테스트 환경 제공**: OHIF의 다양한 확장 기능들을 통합하여 테스트할 수 있는 샌드박스 환경
- **확장 통합 검증**: 8개의 확장 프로그램을 통합하여 상호 작용을 검증
- **UI 컴포넌트 테스트**: 모든 주요 도구바 버튼, 측정 도구, 뷰포트 기능을 포함
- **커스터마이제이션 테스트**: `@ohif/extension-test`의 커스텀 컨텍스트 메뉴를 테스트

### 1.2. 연결되는 화면/기능
- **라우트**: `/basic-test` 경로로 접근
- **레이아웃**: 좌측 썸네일 패널 + 중앙 뷰포트 영역 + 우측 측정/분할 패널
- **멀티 모달리티 지원**: CT, MR, PET, US, PDF, Video, DICOM SR/SEG 등
- **MPR 및 3D 뷰잉**: Multi-Planar Reconstruction 및 Volume Rendering 지원

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
modes/basic-test-mode/src/
├── index.ts              # 메인 모드 정의 (303줄) - 모드 설정 및 라이프사이클
├── toolbarButtons.ts     # 툴바 버튼 정의 (625줄) - 50+ 툴바 버튼 구성
├── initToolGroups.ts     # 툴 그룹 초기화 (278줄) - 4개 툴 그룹 설정
├── id.js                 # 모드 ID 정의 - package.json에서 가져옴
└── package.json          # 패키지 메타데이터 및 의존성
```

### 2.2. 주요 파일별 역할

#### `index.ts` (메인 모드 로직)
- **모드 ID**: `@ohif/mode-test`
- **라우트명**: `basic-test`
- **라이프사이클 훅**:
  - `onModeEnter`: 툴바 등록, 툴 그룹 초기화, 커스터마이제이션 설정
  - `onModeExit`: 서비스 정리 (툴 그룹, 동기화 그룹, 분할, 뷰포트)
- **확장 의존성**: 8개 확장 통합 (default, cornerstone, measurement-tracking, SR, SEG, PMAP, PDF, video, test)
- **검증 로직**: `isValidMode` - 비이미징 모달리티(ECG, SR, SEG, RTSTRUCT) 제외

#### `toolbarButtons.ts` (툴바 구성)
- **50+ 개의 툴바 버튼** 정의
- **버튼 카테고리**:
  - `MeasurementTools`: 측정 도구 (Length, Bidirectional, EllipticalROI, etc.)
  - `MoreTools`: 추가 도구 (Reset, Rotate, Flip, Cine, etc.)
  - `WindowLevelGroup`: Window/Level 프리셋 (Soft tissue, Lung, Liver, Bone, Brain)
- **동적 메뉴**: orientationMenu, dataOverlayMenu, windowLevelMenu, voiManualControlMenu
- **평가 함수**: `evaluate.cornerstoneTool`, `evaluate.action` 등으로 버튼 활성화 조건 제어

#### `initToolGroups.ts` (툴 그룹 초기화)
- **4개의 툴 그룹 생성**:
  1. `default`: 기본 Stack 뷰포트용 (WindowLevel, Pan, Zoom, StackScroll)
  2. `SRToolGroup`: DICOM SR(Structured Report) 전용
  3. `mpr`: MPR 뷰포트용 (Crosshairs 포함)
  4. `volume3d`: 3D Volume Rendering용 (TrackballRotate)
- **마우스 바인딩 설정**: Primary(좌클릭), Auxiliary(중간), Secondary(우클릭), Wheel

#### `id.js`
- package.json에서 모드 ID(`@ohif/mode-test`)를 가져와 export

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

#### **Services 기반 상태 관리** (OHIF 고유 패턴)
```typescript
const {
  measurementService,        // 측정 데이터 관리
  toolbarService,           // 툴바 상태 관리
  toolGroupService,         // 툴 그룹 관리
  customizationService,     // 커스터마이제이션 설정
  cornerstoneViewportService // 뷰포트 상태 관리
} = servicesManager.services;
```

- **중앙집중식 서비스**: React 컴포넌트 외부에서 상태 관리
- **PubSub 패턴**: 서비스 간 이벤트 기반 통신
- **전역 접근**: `servicesManager`를 통해 어디서든 접근 가능

#### **Props 전달 패턴**
```typescript
// 레이아웃 템플릿에서 패널 구성
{
  leftPanels: [tracked.thumbnailList],
  leftPanelResizable: true,
  rightPanels: [cornerstone.panel, tracked.measurements, testExtension.measurements],
  rightPanelResizable: true,
  viewports: [/* viewport 설정 배열 */]
}
```

### 3.2. 재사용 가능한 UI 패턴

#### **모듈 참조 패턴** (확장 모듈 재사용)
```typescript
const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
};
```
- **문자열 기반 의존성**: 확장 모듈을 문자열 ID로 참조
- **느슨한 결합**: 확장 간 직접 import 없이 ExtensionManager를 통해 동적 로딩

#### **툴바 섹션 관리 패턴**
```typescript
toolbarService.updateSection('MeasurementTools', [
  'Length',
  'Bidirectional',
  'ArrowAnnotate',
  // ...
]);
```
- **동적 툴바 구성**: 런타임에 섹션별로 버튼 추가/제거 가능
- **계층적 구조**: 섹션 → 버튼 그룹 → 개별 버튼

### 3.3. 커스텀 훅 (없음)

이 모드는 커스텀 훅을 직접 정의하지 않습니다. 대신:
- **서비스 기반 로직**: 훅 대신 서비스로 상태와 로직 관리
- **확장 모듈의 훅 활용**: `@ohif/extension-cornerstone`의 유틸리티 훅 사용

---

## 4. OHIF 특유 개념 정리

### 4.1. Mode (모드)
**정의**: 확장 프로그램들을 조합하여 특정 워크플로우를 구성한 사전 설정 패키지

**basic-test-mode의 구성 요소**:
- **ID**: `@ohif/mode-test` - 모드를 식별하는 고유 ID
- **Routes**: 모드가 사용할 URL 경로 (`/basic-test`)
- **Extensions**: 이 모드가 의존하는 확장 목록 (8개)
- **Hanging Protocol**: 초기 뷰포트 레이아웃 규칙 (`default` 사용)
- **SOP Class Handlers**: DICOM 데이터 타입별 처리기 (video, seg, pdf, sr 등)

### 4.2. Extensions (확장)
**basic-test-mode가 사용하는 확장들**:
```typescript
extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',              // 기본 기능
  '@ohif/extension-cornerstone': '^3.0.0',          // 이미지 렌더링
  '@ohif/extension-measurement-tracking': '^3.0.0', // 측정 추적
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0', // SR 지원
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',// 분할 지원
  '@ohif/extension-cornerstone-dicom-pmap': '^3.0.0', // Parametric Map
  '@ohif/extension-dicom-pdf': '^3.0.1',            // PDF 뷰어
  '@ohif/extension-dicom-video': '^3.0.1',          // 비디오 뷰어
  '@ohif/extension-test': '^0.0.1',                 // 테스트 확장
};
```

### 4.3. Services (서비스)
**이 모드에서 사용하는 주요 서비스**:
- **measurementService**: 측정 데이터 CRUD, `clearMeasurements()` 호출
- **toolbarService**: 툴바 구성, `register()`, `updateSection()` 사용
- **toolGroupService**: 툴 그룹 생성/제거, `createToolGroupAndAddTools()` 사용
- **customizationService**: 커스터마이제이션 설정, 핫키 바인딩 등
- **cornerstoneViewportService**: 뷰포트 상태 관리 (Crosshairs 색상 설정 등)
- **syncGroupService**, **segmentationService**: 모드 종료 시 정리

### 4.4. Hanging Protocol (행잉 프로토콜)
**정의**: 스터디가 로드될 때 뷰포트를 어떻게 배치할지 정의하는 규칙

이 모드는 `'default'` hanging protocol을 사용하며, `extensions/default/src/hangingprotocols/`에 정의되어 있습니다.

### 4.5. Tool Groups (툴 그룹)
**정의**: 특정 뷰포트 타입에서 사용할 도구들의 세트

**4개의 툴 그룹**:
1. **default**: Stack viewport용 기본 도구
   - Active: WindowLevel, Pan, Zoom, StackScroll
   - Passive: Length, Angle, ROI 측정 도구들
   - Enabled: ImageOverlayViewer

2. **SRToolGroup**: DICOM SR viewport용
   - SR 전용 도구들 (SRLength, SRBidirectional, etc.)
   - DICOMSRDisplay 활성화

3. **mpr**: MPR viewport용
   - Crosshairs (disabled 상태로 등록, 버튼으로 활성화)
   - ReferenceLines 지원

4. **volume3d**: 3D Volume Rendering용
   - TrackballRotateTool (3D 회전)

### 4.6. SOP Class Handler
**정의**: DICOM SOP(Service-Object Pair) 클래스별 데이터 처리 로직

**등록된 핸들러**:
- `ohif.sopClassHandler`: 일반 Stack 이미지 (CT, MR, etc.)
- `dicomvideo.sopClassHandler`: DICOM 비디오
- `dicomSeg.sopClassHandler`: DICOM Segmentation
- `dicompdf.sopClassHandler`: DICOM PDF
- `dicomsr.sopClassHandler`: DICOM SR 2D
- `dicomsr.sopClassHandler3D`: DICOM SR 3D
- `ohif.wsiSopClassHandler`: Whole Slide Imaging (현미경)

### 4.7. 관련 폴더 링크
- **Extensions**: `C:\OHIF_MP\mView-Web_V2\extensions\`
  - `default/`: 기본 확장 (데이터소스, 패널, 레이아웃)
  - `cornerstone/`: 이미지 렌더링 엔진
  - `measurement-tracking/`: 측정 추적 기능
  - `test/`: 테스트용 커스텀 확장
- **Services**: `C:\OHIF_MP\mView-Web_V2\platform\core\src\services\`
- **Other Modes**: `C:\OHIF_MP\mView-Web_V2\modes\`
  - `basic/`: 일반 사용자용 기본 모드
  - `usmpr/`: 초음파 MPR 전용 모드

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### **1단계: 모드의 전체 구조 파악** (30분)
```
index.ts 읽기
  ↓
모드의 구성 요소 이해:
- id, routeName, displayName
- extensions (의존 확장 목록)
- routes (URL 경로 설정)
- onModeEnter/onModeExit (라이프사이클)
```

**핵심 질문**:
- 이 모드는 어떤 확장들을 조합하는가?
- `onModeEnter`에서 어떤 초기화 작업을 하는가?
- `layoutTemplate`에서 어떤 패널과 뷰포트를 구성하는가?

#### **2단계: 툴바 버튼 시스템 이해** (45분)
```
toolbarButtons.ts 읽기
  ↓
버튼 타입별 분류:
- ohif.toolButton: 일반 도구 버튼
- ohif.toolButtonList: 섹션(드롭다운) 버튼
- ohif.layoutSelector: 레이아웃 선택기
- 동적 메뉴: orientationMenu, windowLevelMenu, etc.
  ↓
commands와 evaluate 이해:
- commands: 버튼 클릭 시 실행할 명령
- evaluate: 버튼 활성화 조건
```

**실습 과제**:
- 새로운 측정 도구 버튼 추가해보기
- Window/Level 프리셋 추가해보기
- 특정 모달리티에서만 보이는 버튼 만들기

#### **3단계: 툴 그룹 초기화 로직** (30분)
```
initToolGroups.ts 읽기
  ↓
4개 툴 그룹의 차이점 이해:
- default vs mpr vs SRToolGroup vs volume3d
  ↓
마우스 바인딩 이해:
- MouseBindings.Primary/Auxiliary/Secondary
- Wheel, Touch 이벤트
```

**핵심 개념**:
- **Active 도구**: 마우스 바인딩이 있어 즉시 사용 가능
- **Passive 도구**: 툴바 버튼으로 활성화해야 사용 가능
- **Enabled 도구**: 항상 켜져있는 도구 (ImageOverlay 등)
- **Disabled 도구**: 기본적으로 꺼져있지만 활성화 가능 (Crosshairs, ReferenceLines)

#### **4단계: 확장 통합 방식 이해** (1시간)
```
모듈 참조 패턴 분석:
  '@ohif/extension-name.moduleType.moduleName'
  ↓
실제 확장 코드 확인:
- extensions/default/src/index.tsx
- extensions/cornerstone/src/index.tsx
  ↓
ExtensionManager의 역할 이해:
- getModuleEntry() 메서드
- 동적 모듈 로딩
```

**고급 학습**:
- `extensions/test/` 폴더에서 커스텀 확장 만드는 법 배우기
- CustomizationService로 커스텀 컨텍스트 메뉴 추가하기

#### **5단계: 다른 모드와 비교** (30분)
```
modes/basic/ vs modes/basic-test-mode/ 비교
  ↓
차이점 분석:
- basic: 프로덕션용, 간소화된 툴바
- basic-test: 테스트용, 모든 기능 포함
  ↓
modes/usmpr/ 확인:
- 커스텀 레이아웃 (4V+1S)
- 특화된 초기화 로직
```

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

**1. OHIF 모드 커스터마이징**
- 자신만의 워크플로우 모드를 처음부터 만들 수 있음
- 필요한 확장만 선택하여 경량화된 뷰어 구성
- 특정 임상 워크플로우에 최적화된 UI 설계

**2. 툴바 및 툴 시스템 제어**
- 동적으로 툴바 버튼 추가/제거/재배치
- 새로운 측정 도구나 기능 추가
- 조건부 UI 표시 (모달리티별, 컨텍스트별)

**3. 확장 시스템 이해**
- 확장 간 의존성 관리
- 모듈 시스템을 통한 기능 확장
- Services를 활용한 상태 관리

**4. 테스트 환경 구축**
- 새로운 기능을 안전하게 테스트할 수 있는 샌드박스 구성
- 여러 확장의 통합 테스트 환경 구축
- 회귀 테스트용 참조 모드로 활용

**5. 프로덕션 모드로의 전환**
- 테스트 모드의 구조를 기반으로 실제 배포용 모드 개발
- 불필요한 기능 제거, 필수 기능만 포함
- 성능 최적화된 커스텀 모드 구축

---

## 6. 추가 참고 자료

### 6.1. 코드 예시: 커스텀 모드 만들기

```typescript
// 예시: basic-test-mode를 기반으로 간소화된 커스텀 모드
const customMode = {
  id: '@mycompany/mode-simple-viewer',
  routeName: 'simple',
  displayName: 'Simple Viewer',

  onModeEnter: ({ servicesManager }) => {
    const { toolbarService, toolGroupService } = servicesManager.services;

    // 간소화된 툴바 (Zoom, Pan, WindowLevel만)
    toolbarService.register([
      { id: 'Zoom', /* ... */ },
      { id: 'Pan', /* ... */ },
      { id: 'WindowLevel', /* ... */ },
    ]);

    // 단일 툴 그룹
    initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, 'default');
  },

  // 최소 확장만 사용
  extensions: {
    '@ohif/extension-default': '^3.0.0',
    '@ohif/extension-cornerstone': '^3.0.0',
  },

  // 간단한 레이아웃
  routes: [{
    path: 'simple',
    layoutTemplate: () => ({
      id: ohif.layout,
      props: {
        leftPanels: [ohif.thumbnailList],
        rightPanels: [],  // 우측 패널 없음
        viewports: [{ namespace: ohif.sopClassHandler }]
      }
    })
  }]
};
```

### 6.2. 디버깅 팁

**툴바 버튼이 안 보일 때**:
```typescript
// onModeEnter에서 디버깅
console.debug('toolbarButtons', toolbarButtons);
console.debug('registered sections', toolbarService.sections);
```

**툴 그룹 문제 디버깅**:
```typescript
// Cornerstone의 툴 이름 확인
const utilityModule = extensionManager.getModuleEntry(
  '@ohif/extension-cornerstone.utilityModule.tools'
);
console.log('Available tools:', utilityModule.exports.toolNames);
```

**모드가 로드되지 않을 때**:
- `isValidMode` 함수의 반환값 확인
- 확장 의존성이 모두 설치되었는지 확인
- 브라우저 콘솔에서 에러 메시지 확인

---

**작성일**: 2026-01-01
**OHIF 버전**: v3.12.0-beta.113
**분석 대상**: `C:\OHIF_MP\mView-Web_V2\modes\basic-test-mode\src`
