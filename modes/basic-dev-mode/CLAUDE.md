# modes/basic-dev-mode/src 분석 문서

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#2.1-파일-구조)
   - 2.2. [주요 파일별 역할](#2.2-주요-파일별-역할)
   - 2.3. [데이터 흐름 다이어그램 (텍스트)](#2.3-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [이 모드에서 사용되는 핵심 개념](#4.1-이-모드에서-사용되는-핵심-개념)
   - 4.2. [관련 폴더 링크](#4.2-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [학습 완료 후 할 수 있게 되는 것](#5.2-학습-완료-후-할-수-있게-되는-것)
   - 5.3. [추가 학습 자료](#5.3-추가-학습-자료)

---


## 1. 모듈 개요

`basic-dev-mode`는 OHIF Viewer의 **개발자용 기본 뷰어 모드**입니다. 일반 사용자용 `basic` 모드와 유사하지만, 개발 및 테스트 목적에 최적화된 설정을 제공합니다.

### 1.1. 전체 OHIF 앱에서의 역할
- **개발 환경에서의 테스트 모드**: 새로운 기능이나 확장(extension)을 개발할 때 빠르게 테스트할 수 있는 환경 제공
- **Cornerstone3D 기반 이미지 뷰어**: CT, MR, X-ray 등 다양한 의료 영상을 2D 스택(Stack) 방식으로 렌더링
- **측정 도구 제공**: Length, Bidirectional, ROI 등 기본 측정 도구를 포함한 개발용 툴바 구성
- **멀티 모달리티 지원**: DICOM 이미지, 비디오, PDF 등 다양한 포맷 지원

### 1.2. 연결되는 화면/기능
- **URL 경로**: `/dev/viewer-cs3d`로 접근
- **화면 구성**:
  - 왼쪽 패널: 시리즈 썸네일 리스트
  - 중앙: Cornerstone3D 뷰포트 (이미지 표시 영역)
  - 오른쪽 패널: 측정(Measurement) 패널
- **지원하지 않는 모달리티**: Slide Microscopy (SM)는 제외

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 파일 구조
```
modes/basic-dev-mode/src/
├── index.ts              # 메인 모드 정의 및 설정 (178줄)
├── toolbarButtons.ts     # 툴바 버튼 구성 정의 (241줄)
└── id.js                 # 모드 ID 정의 (6줄)
```

### 2.2. 주요 파일별 역할

| 파일명 | 역할 | 핵심 내용 |
|--------|------|-----------|
| **index.ts** | 모드의 핵심 로직 및 라이프사이클 정의 | - 확장 의존성 선언<br>- 라우트 및 레이아웃 구성<br>- Tool 초기화 (`onModeEnter`)<br>- 모달리티 검증 로직 |
| **toolbarButtons.ts** | 툴바 UI 버튼 정의 | - 측정 도구 버튼 (Length, Bidirectional, ROI 등)<br>- 뷰 조작 버튼 (Zoom, Pan, Rotate 등)<br>- 레이아웃 선택기 |
| **id.js** | 모드 고유 ID | `@ohif/mode-basic-dev-mode` 문자열 export |

### 2.3. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 모드 진입]
       ↓
[index.ts - modeFactory()]
       ↓
[onModeEnter 실행]
       ├─→ [toolGroupService] → Cornerstone Tools 등록 (WindowLevel, Pan, Zoom 등)
       ├─→ [toolbarService] → toolbarButtons 등록 → UI 툴바 생성
       └─→ [extensionManager] → Cornerstone Utility 모듈 가져오기
       ↓
[layoutTemplate 실행]
       ├─→ 왼쪽 패널: seriesList (썸네일)
       ├─→ 중앙: Cornerstone Viewport (이미지 표시)
       └─→ 오른쪽 패널: panelMeasurement (측정값)
       ↓
[사용자 상호작용]
       ├─→ 툴바 버튼 클릭 → Command 실행 (예: setToolActive)
       └─→ Viewport에서 도구 사용 → MeasurementService에 데이터 저장
       ↓
[모드 종료]
       ↓
[onModeExit 실행]
       ├─→ uiDialogService.hideAll()
       ├─→ uiModalService.hide()
       └─→ toolGroupService.destroy()
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

이 모드는 **React 컴포넌트를 직접 포함하지 않고**, OHIF의 **Services 기반 상태 관리**를 사용합니다.

#### Services를 통한 전역 상태 관리
```typescript
// index.ts의 onModeEnter에서 접근
const { toolbarService, toolGroupService } = servicesManager.services;

// Service는 OHIF의 중앙 상태 관리 객체
// - toolbarService: 툴바 UI 상태 관리
// - toolGroupService: Cornerstone3D 도구 그룹 관리
// - uiDialogService, uiModalService: UI 다이얼로그/모달 관리
```

**React 초보자를 위한 설명**:
- React의 `useState`, `useContext`를 직접 사용하지 않습니다
- 대신 OHIF의 `ServicesManager`가 전역 상태를 관리하는 "중앙 집중식 스토어" 역할
- 각 Service는 내부적으로 PubSub 패턴을 사용하여 이벤트 기반으로 동작

#### 설정 기반 UI 생성
```typescript
// toolbarButtons.ts - 선언적 UI 정의
{
  id: 'Length',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'tool-length',
    label: i18n.t('Buttons:Length'),
    commands: { commandName: 'setToolActive', commandOptions: { toolName: 'Length' } }
  }
}
```

- **선언적(Declarative) 방식**: 버튼의 "모양"과 "동작"을 객체로 정의
- `toolbarService.register(toolbarButtons)`를 호출하면 OHIF가 자동으로 React 컴포넌트를 생성
- 실제 UI 렌더링은 `@ohif/extension-default`의 `toolbarModule`이 담당

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드 자체는 UI 컴포넌트를 직접 포함하지 않지만, **다른 확장의 컴포넌트를 조합**하여 사용합니다:

```typescript
// index.ts - layoutTemplate에서 컴포넌트 조합
leftPanels: [ohif.thumbnailList],           // 썸네일 리스트 컴포넌트
rightPanels: [ohif.measurements],           // 측정 패널 컴포넌트
viewports: [
  { namespace: cs3d.viewport },             // Cornerstone 뷰포트 컴포넌트
  { namespace: dicomvideo.viewport },       // 비디오 뷰포트 컴포넌트
  { namespace: dicompdf.viewport },         // PDF 뷰포트 컴포넌트
]
```

**패턴 설명**:
- **컴포지션(Composition) 패턴**: 여러 확장의 컴포넌트를 조합하여 완전한 UI 구성
- **네임스페이스 기반 참조**: 문자열로 컴포넌트를 참조 (예: `@ohif/extension-default.panelModule.seriesList`)
- **동적 로딩**: ExtensionManager가 런타임에 네임스페이스를 해석하여 실제 컴포넌트를 로드

### 3.3. 커스텀 훅

이 모드에는 직접적인 커스텀 훅이 없지만, **라이프사이클 훅**을 제공합니다:

```typescript
// 모드 진입 시 실행
onModeEnter: ({ servicesManager, extensionManager }) => {
  // Tools 등록, 툴바 설정 등 초기화 로직
}

// 모드 종료 시 실행
onModeExit: ({ servicesManager }) => {
  // Dialog/Modal 닫기, ToolGroup 정리 등 정리 로직
}
```

**React의 useEffect와 유사**:
- `onModeEnter` ≈ `useEffect(() => { /* setup */ }, [])`
- `onModeExit` ≈ `useEffect(() => { return () => { /* cleanup */ } }, [])`

---

## 4. OHIF 특유 개념 정리

### 4.1. 이 모드에서 사용되는 핵심 개념

#### 1. **Mode (모드)**
- **정의**: 확장(Extension)들을 조합하여 특정 워크플로우를 구성하는 "뷰어 프리셋"
- **역할**: 어떤 확장을 로드할지, 어떤 툴바를 보여줄지, 레이아웃은 어떻게 할지 정의
- **예시**: `basic-dev-mode`는 개발자용 기본 워크플로우 제공

#### 2. **Extension (확장)**
- **정의**: 특정 기능을 제공하는 플러그인 모듈
- **이 모드의 의존성**:
  ```typescript
  extensionDependencies = {
    '@ohif/extension-default': '^3.0.0',              // 기본 데이터소스, 패널, SOP 핸들러
    '@ohif/extension-cornerstone': '^3.0.0',          // Cornerstone3D 렌더링 엔진
    '@ohif/extension-cornerstone-dicom-sr': '^3.0.0', // DICOM SR 지원
    '@ohif/extension-dicom-pdf': '^3.0.1',            // PDF 뷰어
    '@ohif/extension-dicom-video': '^3.0.1',          // 비디오 뷰어
  }
  ```

#### 3. **Services (서비스)**
- **정의**: 애플리케이션 전역에서 사용되는 비즈니스 로직 및 상태 관리 객체
- **이 모드에서 사용하는 서비스**:
  - `toolbarService`: 툴바 UI 관리
  - `toolGroupService`: Cornerstone Tools 그룹 관리
  - `uiDialogService`, `uiModalService`: UI 다이얼로그/모달 관리
- **위치**: `platform/core/src/services/`

#### 4. **Tool Group (도구 그룹)**
- **정의**: Cornerstone3D의 도구들을 그룹화하여 뷰포트에 적용하는 단위
- **이 모드의 설정**:
  ```typescript
  tools = {
    active: [WindowLevel, Pan, Zoom, StackScroll],  // 자동 활성화 도구
    passive: [Length, Bidirectional, Probe, ...],   // 사용자가 선택 시 활성화
    enabled: [ImageOverlayViewer],                  // 항상 활성화 (백그라운드)
  }
  toolGroupService.createToolGroupAndAddTools('default', tools);
  ```
- **연결 문서**: `extensions/cornerstone/CLAUDE.md`

#### 5. **SOP Class Handler (SOP 클래스 핸들러)**
- **정의**: DICOM의 SOP Class(Service-Object Pair Class)에 따라 적절한 뷰어를 선택하는 로직
- **이 모드의 핸들러**:
  ```typescript
  sopClassHandlers: [
    dicomvideo.sopClassHandler,  // 비디오 DICOM (1.2.840.10008.5.1.4.1.1.77.1.4.1 등)
    ohif.sopClassHandler,        // 일반 이미지 DICOM (Stack 방식)
    dicompdf.sopClassHandler,    // PDF DICOM
    dicomsr.sopClassHandler,     // Structured Report
  ]
  ```

#### 6. **Layout Template (레이아웃 템플릿)**
- **정의**: 뷰어 화면의 패널 배치를 정의하는 함수
- **이 모드의 레이아웃**:
  ```typescript
  layoutTemplate: () => ({
    id: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
    props: {
      leftPanels: [thumbnailList],     // 왼쪽: 썸네일
      rightPanels: [measurements],     // 오른쪽: 측정값
      viewports: [cs3d, video, pdf],   // 중앙: 뷰포트들
    }
  })
  ```

#### 7. **Hanging Protocol (행잉 프로토콜)**
- **정의**: 스터디/시리즈를 어떻게 배치할지 정의하는 규칙
- **이 모드의 설정**: `hangingProtocol: 'default'` (기본 프로토콜 사용)
- **연결 문서**: `extensions/default/src/hangingprotocols/`

### 4.2. 관련 폴더 링크

- **Extensions**:
  - `extensions/default/` - 기본 확장 (데이터소스, 패널, 레이아웃)
  - `extensions/cornerstone/` - Cornerstone3D 렌더링 엔진
- **Services**: `platform/core/src/services/` - 서비스 구현체
- **Other Modes**:
  - `modes/basic/` - 일반 사용자용 기본 모드 (비교용)
  - `modes/usmpr/` - USMPR 커스텀 모드 (고급 예제)
- **Platform**:
  - `platform/app/src/routes/` - 라우팅 로직
  - `platform/ui/src/` - UI 컴포넌트 라이브러리

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### Step 1: Mode의 기본 구조 이해 (30분)
1. **`package.json`** 읽기
   - 모드의 이름과 버전 확인
   - peer dependencies 확인 (어떤 확장에 의존하는지)

2. **`id.js`** 읽기
   - 모드 ID가 어떻게 정의되는지 확인
   - package.json의 name과 연결되는 방식 이해

3. **`index.ts` - 전체 구조 파악** (라인별로 읽지 말고 큰 그림 이해)
   - `modeFactory` 함수의 반환값 구조 확인
   - `id`, `routeName`, `displayName`, `extensions`, `routes` 등 주요 속성 이해

#### Step 2: 라이프사이클 훅 분석 (1시간)
1. **`onModeEnter` 함수 분석** (index.ts 53-106줄)
   ```typescript
   // 이 함수가 하는 일:
   // 1. extensionManager에서 Cornerstone tools 가져오기
   // 2. toolGroupService로 도구 그룹 생성 ('default')
   // 3. toolbarService에 버튼 등록
   // 4. 툴바 섹션 순서 설정
   ```
   - **실습**: `tools` 객체의 `active`, `passive`, `enabled` 차이 이해
   - **실습**: `toolbarService.updateSection`의 배열 순서를 바꿔보기

2. **`onModeExit` 함수 분석** (index.ts 107-112줄)
   - 메모리 누수 방지를 위한 정리(cleanup) 로직 이해
   - React의 `useEffect` cleanup과 비교

#### Step 3: 툴바 버튼 커스터마이징 (1시간)
1. **`toolbarButtons.ts` 읽기**
   - 버튼 정의 구조 이해:
     ```typescript
     {
       id: 'Length',              // 고유 ID
       uiType: 'ohif.toolButton', // UI 타입 (버튼, 리스트, 선택기 등)
       props: {
         icon: 'tool-length',     // 아이콘 이름
         label: '길이',            // 버튼 텍스트
         commands: { ... },       // 클릭 시 실행할 명령
         evaluate: '...'          // 버튼 활성화 조건
       }
     }
     ```

2. **실습 과제**:
   - 새로운 측정 도구 버튼 추가해보기 (예: `RectangleROI`)
   - `toolbarService.updateSection`에서 버튼 순서 변경해보기
   - 버튼 섹션 추가해보기 (예: 'ImageTools')

#### Step 4: 레이아웃 설정 이해 (1시간)
1. **`layoutTemplate` 함수 분석** (index.ts 132-157줄)
   - `leftPanels`, `rightPanels`, `viewports` 구조 이해
   - 각 패널/뷰포트가 어떤 확장의 어떤 모듈을 참조하는지 확인

2. **네임스페이스 해석 연습**:
   ```typescript
   '@ohif/extension-default.panelModule.seriesList'
   // ↓ 해석
   // 확장: @ohif/extension-default
   // 모듈 타입: panelModule
   // 모듈 ID: seriesList
   ```

3. **실습**:
   - 왼쪽/오른쪽 패널을 숨겨보기 (빈 배열로 설정)
   - 패널 크기 조절 가능 여부 변경 (`leftPanelResizable: false`)

#### Step 5: 모달리티 검증 로직 이해 (30분)
1. **`isValidMode` 함수 분석** (index.ts 117-125줄)
   ```typescript
   isValidMode: ({ modalities }) => {
     const modalities_list = modalities.split('\\');
     return {
       valid: !modalities_list.includes('SM'),
       description: 'The mode does not support the following modalities: SM',
     };
   }
   ```
   - DICOM의 Modality 필드 이해 (CT, MR, US, SM 등)
   - 왜 SM(Slide Microscopy)을 제외하는지 이해

2. **실습**:
   - CR (Computed Radiography)도 제외하도록 수정해보기
   - 에러 메시지 한국어로 변경해보기

#### Step 6: 다른 모드와 비교 학습 (1시간)
1. **`modes/basic/src/index.ts`와 비교**
   - 차이점 찾기 (툴바 버튼, 레이아웃 등)
   - 언제 `basic`을 쓰고 언제 `basic-dev-mode`를 쓰는지 이해

2. **`modes/usmpr/src/index.tsx`와 비교** (고급)
   - 커스텀 레이아웃 구현 방식 확인
   - 추가적인 라이프사이클 로직 확인

### 5.2. 학습 완료 후 할 수 있게 되는 것

이 폴더를 완전히 이해하면 다음을 할 수 있습니다:

1. **새로운 OHIF 모드를 처음부터 만들 수 있습니다**
   - 확장 의존성 선언
   - 라우트 및 레이아웃 정의
   - 툴바 커스터마이징
   - 모달리티별 검증 로직 추가

2. **기존 모드를 특정 워크플로우에 맞게 커스터마이징할 수 있습니다**
   - 특정 도구만 활성화하기
   - 병원/클리닉 요구사항에 맞는 UI 배치
   - 특정 모달리티에 최적화된 모드 생성

3. **OHIF의 확장 시스템을 활용할 수 있습니다**
   - 어떤 확장을 사용할지 선택
   - 확장의 모듈을 조합하여 완전한 뷰어 구성
   - Services와 ExtensionManager의 역할 이해

4. **의료 영상 뷰어의 기본 아키텍처를 이해합니다**
   - DICOM SOP Class 기반 뷰어 선택
   - Tool Group 기반 도구 관리
   - Hanging Protocol을 통한 레이아웃 제어

### 5.3. 추가 학습 자료

- **OHIF 공식 문서**: [https://docs.ohif.org/](https://docs.ohif.org/)
  - [Mode 생성 가이드](https://docs.ohif.org/development/modes)
  - [Extension 개발 가이드](https://docs.ohif.org/development/extensions)

- **프로젝트 내 관련 문서**:
  - `C:\OHIF_MP\mView-Web_V2\CLAUDE.md` - 프로젝트 전체 구조
  - `modes/basic/CLAUDE.md` - 일반 사용자용 모드 (비교용)
  - `modes/usmpr/CLAUDE.md` - 고급 커스텀 모드 (심화 학습)
  - `extensions/default/CLAUDE.md` - 기본 확장 분석
  - `extensions/cornerstone/CLAUDE.md` - Cornerstone 렌더링 엔진

---

**마지막 업데이트**: 2026-01-01
**분석 대상 버전**: v3.12.0-beta.113
**분석자**: Claude (OHIF Modes Analyst)
