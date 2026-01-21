# modes/tmtv - TMTV (Total Metabolic Tumor Volume) 모드 분석

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [화면/기능 연결](#1.2-화면기능-연결)
   - 1.3. [특징](#1.3-특징)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [핵심 파일](#2.1-핵심-파일)
   - 2.2. [유틸리티 파일](#2.2-유틸리티-파일)
   - 2.3. [데이터 흐름 다이어그램 (텍스트)](#2.3-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [이 폴더에서 사용되는 OHIF 핵심 개념](#4.1-이-폴더에서-사용되는-ohif-핵심-개념)
   - 4.2. [관련 폴더 링크](#4.2-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.2-이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [다음 단계 추천](#5.3-다음-단계-추천)

---


## 1. 모듈 개요

### 1.1. 전체 OHIF 앱에서의 역할
TMTV 모드는 **PET/CT 융합 영상을 통한 종양의 대사 부피를 정량적으로 측정하는 전문 워크플로우 모드**입니다. 핵의학 영상에서 종양의 SUV(Standardized Uptake Value)를 기반으로 대사 활성 종양 부피를 측정하고 분석하는 임상 워크플로우를 제공합니다.

### 1.2. 화면/기능 연결
- **10-viewport 레이아웃**: CT 3개 (Axial/Sagittal/Coronal) + PT 3개 + Fusion 3개 + MIP(Maximum Intensity Projection) 1개
- **ROI Threshold 패널**: Rectangle ROI로 관심 영역 설정 후 threshold 적용하여 segmentation 생성
- **PET SUV 메타데이터 패널**: SUV 계산을 위한 환자 정보 (체중, 주입량 등) 표시 및 편집
- **측정 도구**: Length, Bidirectional, EllipticalROI 등으로 종양 측정
- **Segmentation 도구**: Brush, Eraser, Threshold Brush로 종양 영역 세밀하게 편집

### 1.3. 특징
- PT와 CT 시리즈가 모두 존재하는 스터디에서만 활성화 (`isValidMode` 검증)
- SUV 보정 여부에 따라 자동으로 window level 조정
- Camera 및 WindowLevel 동기화로 3개 모달리티(CT, PT, Fusion) 간 일관된 뷰 제공

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 핵심 파일

| 파일명 | 역할 |
|--------|------|
| **src/index.ts** (268줄) | TMTV 모드의 메인 진입점. 모드 설정, 라이프사이클 훅, 라우트, 툴바 구성 정의 |
| **src/toolbarButtons.ts** (462줄) | 툴바 버튼 정의. 측정 도구, segmentation 도구, brush/eraser, threshold 도구 설정 |
| **src/initToolGroups.js** (194줄) | 5개 ToolGroup 초기화 (CT, PT, Fusion, MIP, default). 각 그룹별 도구 활성화 상태 정의 |
| **src/id.js** (5줄) | 모드 ID 정의 (`@ohif/mode-tmtv`) |
| **src/constants.ts** (3줄) | Segmentation brush 반경 최소/최대값 상수 (0.5mm ~ 99.5mm) |

### 2.2. 유틸리티 파일

| 파일명 | 역할 |
|--------|------|
| **src/utils/setCrosshairsConfiguration.js** (34줄) | Fusion viewport의 Crosshairs 도구 설정. CT volume만 slab thickness 적용되도록 필터 |
| **src/utils/setFusionActiveVolume.js** (62줄) | Fusion viewport에서 WindowLevel은 CT에, EllipticalROI는 PT에 적용되도록 volume 지정 |

### 2.3. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 스터디 선택]
    ↓
[isValidMode 검증] → PT & CT 시리즈 존재 확인
    ↓
[onModeEnter]
    ↓
    ├─→ [initToolGroups] → CT/PT/Fusion/MIP/default ToolGroup 생성
    ├─→ [toolbarService.register] → 측정/segmentation 도구 등록
    ├─→ [hangingProtocolService.addCustomAttribute] → SUV 보정 여부에 따른 VOI 범위 설정
    └─→ [toolGroupService.subscribe] → viewport 추가 이벤트 감지
            ↓
            ├─→ [setCrosshairsConfiguration] → Crosshairs 설정 (Fusion용)
            └─→ [setFusionActiveVolume] → Fusion viewport volume 지정
    ↓
[layoutTemplate 렌더링]
    ↓
    ├─→ 10개 viewport 표시 (CT 3 + PT 3 + Fusion 3 + MIP 1)
    ├─→ 왼쪽 패널: 썸네일 리스트 (기본 닫힘)
    └─→ 오른쪽 패널: TMTV 패널 + PET SUV 패널
    ↓
[사용자 상호작용]
    ├─→ ROI Threshold 도구 사용 → RectangleROI 그리기 → threshold 적용 → segmentation 생성
    ├─→ Brush/Eraser로 segmentation 편집
    └─→ 측정 도구로 종양 측정
    ↓
[결과 내보내기] → CSV 리포트 또는 DICOM RT Structure Set
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

1. **Service 기반 상태 관리**
   - `toolGroupService`: 도구 그룹 상태 (5개 그룹: CT, PT, Fusion, MIP, default)
   - `hangingProtocolService`: viewport 배치 및 displaySet 매칭 상태
   - `displaySetService`: CT/PT 시리즈 displaySet 관리
   - `segmentationService`: segmentation volume 생성 및 관리
   - `toolbarService`: 동적 툴바 버튼 상태 (section별 업데이트)

2. **PubSub 패턴**
   ```javascript
   // viewport 추가 이벤트 구독
   const { unsubscribe } = toolGroupService.subscribe(
     toolGroupService.EVENTS.VIEWPORT_ADDED,
     () => {
       setCrosshairsConfiguration(...);
       setFusionActiveVolume(...);
     }
   );
   ```
   - 서비스에서 발생하는 이벤트를 구독하여 viewport 추가 시 자동으로 설정 적용

3. **CustomizationService를 통한 런타임 커스터마이징**
   ```javascript
   customizationService.setCustomizations({
     'panelSegmentation.tableMode': { $set: 'expanded' },
     'panelSegmentation.onSegmentationAdd': {
       $set: () => commandsManager.run('createNewLabelmapFromPT')
     }
   });
   ```
   - Segmentation 패널의 기본 동작 변경 (테이블 확장 상태, PT에서 labelmap 생성)

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

이 모드는 **모드 설정 파일**로, UI 컴포넌트를 직접 정의하지 않고 기존 확장에서 제공하는 컴포넌트를 조합합니다:

- `@ohif/extension-default.layoutTemplateModule.viewerLayout` - 전체 레이아웃
- `@ohif/extension-cornerstone.viewportModule.cornerstone` - Cornerstone viewport
- `@ohif/extension-tmtv.panelModule.tmtv` - TMTV 패널 (ROI threshold)
- `@ohif/extension-tmtv.panelModule.petSUV` - PET SUV 메타데이터 패널

**toolbarButtons.ts의 버튼 정의 패턴**:
```typescript
{
  id: 'Brush',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'icon-tool-brush',
    label: i18n.t('Buttons:Brush'),
    evaluate: [...], // 버튼 활성화 조건
    options: [       // 버튼 설정 옵션 (반경, 모양 등)
      {
        name: 'Radius (mm)',
        type: 'range',
        min: 0.5,
        max: 99.5,
        commands: { commandName: 'setBrushSize', ... }
      }
    ]
  }
}
```
- **선언적 버튼 정의**: UI 타입, props, 명령어를 JSON 형태로 정의
- **evaluate 조건**: segmentation 존재 여부에 따라 버튼 활성화/비활성화

### 3.3. 커스텀 훅

이 모드 폴더에는 커스텀 훅이 없습니다. 모든 로직은 **모드 라이프사이클 훅**(`onModeEnter`, `onModeExit`)과 **유틸리티 함수**로 구현됩니다.

---

## 4. OHIF 특유 개념 정리

### 4.1. 이 폴더에서 사용되는 OHIF 핵심 개념

1. **Mode (모드)**
   - **정의**: 특정 임상 워크플로우를 위한 확장 조합 및 레이아웃 설정
   - **구성 요소**:
     - `id`: 모드 식별자
     - `displayName`: 사용자에게 표시되는 이름
     - `routes`: 라우트 경로 및 레이아웃 템플릿
     - `extensions`: 의존하는 확장 목록
     - `hangingProtocol`: 사용할 hanging protocol ID
     - `onModeEnter`/`onModeExit`: 라이프사이클 훅
     - `isValidMode`: 모드 활성화 조건 검증 함수

2. **Tool Group (도구 그룹)**
   - **정의**: viewport에 적용할 도구들의 집합 (active/passive/enabled/disabled 상태 관리)
   - **TMTV의 5개 그룹**:
     - `ctToolGroup`: CT viewport용 (WindowLevel, Pan, Zoom, 측정 도구 등)
     - `ptToolGroup`: PT viewport용 (CT와 동일 + RectangleROIStartEndThreshold 추가)
     - `fusionToolGroup`: Fusion viewport용 (CT와 동일)
     - `mipToolGroup`: MIP viewport용 (VolumeRotate, MipJumpToClick)
     - `default`: 기본 그룹

3. **Hanging Protocol (배치 프로토콜)**
   - **정의**: displaySet을 어떤 viewport에 어떻게 배치할지 정의하는 규칙
   - **TMTV 사용**: `@ohif/extension-tmtv.hangingProtocolModule.ptCT`
   - **매칭 로직**: PT는 attenuated corrected 이미지, CT는 series description 기반 매칭
   - **커스텀 속성**: `getPTVOIRange` - SUV 보정 여부에 따라 window level 동적 설정

4. **DisplaySet (디스플레이 셋)**
   - **정의**: 함께 표시될 이미지들의 논리적 그룹 (보통 하나의 시리즈)
   - **TMTV 사용**: CT displaySet, PT displaySet을 매칭하여 Fusion viewport 생성

5. **Extension Dependencies (확장 의존성)**
   ```typescript
   '@ohif/extension-default': '^3.0.0',
   '@ohif/extension-cornerstone': '^3.0.0',
   '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
   '@ohif/extension-tmtv': '^3.0.0'
   ```
   - 이 모드가 동작하려면 위 4개 확장이 필요

6. **Commands (명령어)**
   - **정의**: 확장이 제공하는 재사용 가능한 액션 함수
   - **예시**: `setToolActiveToolbar`, `setBrushSize`, `createNewLabelmapFromPT`, `arrowTextCallback`
   - **버튼과 연결**: 툴바 버튼 클릭 시 commands 실행

### 4.2. 관련 폴더 링크

- **Extensions**:
  - `extensions/default/` - 기본 데이터소스, 레이아웃, 패널
  - `extensions/cornerstone/` - Cornerstone3D 렌더링 엔진 통합
  - `extensions/tmtv/` - TMTV 전용 패널 및 hanging protocol (모노레포 내 위치 추정)

- **Platform**:
  - `platform/core/src/services/` - ToolGroupService, HangingProtocolService 등 핵심 서비스
  - `platform/ui/` - 툴바 버튼 UI 컴포넌트

- **다른 Modes**:
  - `modes/basic/` - 기본 뷰어 모드 (비교 참고)
  - `modes/usmpr/` - 초음파 MPR 모드 (커스텀 레이아웃 예시)
  - `modes/longitudinal/` - 종단 측정 추적 모드

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: 모드 구조 이해 (src/index.ts)
**목표**: OHIF 모드가 어떻게 정의되는지 큰 그림 파악

- `modeFactory` 함수가 모드 객체를 반환하는 구조 이해
- `routes` 배열: 어떤 경로에서 어떤 레이아웃을 보여줄지 정의
- `extensionDependencies`: 이 모드가 의존하는 확장 목록
- **핵심 포인트**: 모드는 "설정 파일"이지 코드가 아님. 기존 컴포넌트를 조합하는 레시피

#### 2단계: 라이프사이클 훅 (onModeEnter)
**목표**: 모드 진입 시 어떤 초기화가 일어나는지 이해

```javascript
onModeEnter: ({ servicesManager, extensionManager, commandsManager }) => {
  // 1. ToolGroup 초기화
  initToolGroups(toolNames, Enums, toolGroupService, commandsManager);

  // 2. Viewport 추가 이벤트 구독
  toolGroupService.subscribe(EVENTS.VIEWPORT_ADDED, () => { ... });

  // 3. 툴바 버튼 등록 및 섹션 구성
  toolbarService.register(toolbarButtons);
  toolbarService.updateSection('primary', ['MeasurementTools', ...]);

  // 4. Hanging protocol 커스텀 속성 추가
  hangingProtocolService.addCustomAttribute('getPTVOIRange', ...);
}
```

- **학습 포인트**: Service를 통해 앱 전체 상태를 조작하는 패턴
- `servicesManager`에서 필요한 서비스 가져오기
- PubSub 패턴으로 이벤트 기반 로직 구현

#### 3단계: ToolGroup 초기화 (src/initToolGroups.js)
**목표**: Cornerstone 도구를 viewport에 어떻게 적용하는지 이해

- `active`: 마우스/터치 바인딩이 있는 즉시 사용 가능한 도구
- `passive`: 활성화되지 않았지만 등록된 도구 (툴바에서 활성화 가능)
- `enabled`/`disabled`: 항상 켜져있거나/꺼진 도구
- **5개 ToolGroup의 차이점 파악**: CT/PT/Fusion은 거의 동일, MIP는 회전 도구 사용

#### 4단계: 툴바 버튼 정의 (src/toolbarButtons.ts)
**목표**: 선언적 UI 정의 패턴 학습

```typescript
{
  id: 'Brush',
  uiType: 'ohif.toolButton',        // UI 컴포넌트 타입
  props: {
    icon: 'icon-tool-brush',
    label: i18n.t('Buttons:Brush'),
    evaluate: [...],                 // 활성화 조건 (배열 가능)
    options: [...]                   // 버튼 설정 UI (반경, 모양 등)
  }
}
```

- `evaluate`: 버튼의 활성화/비활성화를 동적으로 제어 (segmentation 존재 여부 등)
- `options`: 버튼 클릭 시 나타나는 설정 UI (range, radio 등)
- `commands`: 버튼 클릭 시 실행할 명령어

#### 5단계: 유틸리티 함수 (src/utils/*.js)
**목표**: Fusion viewport의 특수한 설정 이해

- **setCrosshairsConfiguration**: Fusion에서 Crosshairs 도구 사용 시 CT에만 slab thickness 적용
- **setFusionActiveVolume**: WindowLevel은 CT에, EllipticalROI는 PT에 적용되도록 volume 지정
- **핵심**: PET/CT Fusion은 2개 volume이 겹쳐진 것이므로, 도구마다 어느 volume에 작동할지 지정 필요

#### 6단계: Mode Validation (isValidMode)
**목표**: 모드 활성화 조건 검증 로직

```javascript
isValidMode: ({ modalities, study }) => {
  const modalities_list = modalities.split('\\');
  return {
    valid: modalities_list.includes('CT') && modalities_list.includes('PT'),
    description: 'The mode requires both PT and CT series in the study'
  };
}
```

- PT와 CT가 모두 있어야 TMTV 모드 활성화
- Slide Microscopy (SM) 제외
- 특정 StudyInstanceUID 제외 (4D 스터디는 다른 모드 사용)

### 5.2. 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **커스텀 OHIF 모드 개발**: 특정 임상 워크플로우에 맞춘 뷰어 모드를 처음부터 만들 수 있음
   - 예: 유방촬영 모드, 심장 MRI 모드, 방사선 치료 계획 모드 등

2. **Tool Group 설정 마스터**: viewport별로 다른 도구 세트 구성 가능
   - 예: MPR viewport는 회전 불가, 3D viewport는 마우스 휠로 회전

3. **PET/CT Fusion 워크플로우 이해**: 2개 모달리티를 융합하는 고급 영상 처리 개념 습득
   - SUV 계산, threshold segmentation, metabolic tumor volume 측정

4. **선언적 UI 패턴 활용**: 코드 없이 JSON 설정만으로 복잡한 툴바 UI 구성 가능

5. **OHIF 서비스 아키텍처 이해**: Service 기반 상태 관리와 PubSub 패턴의 실전 활용

### 5.3. 다음 단계 추천

- `extensions/tmtv/` 폴더 탐색 (TMTV 패널 구현 코드)
- `extensions/cornerstone/` 의 `RectangleROIStartEndThreshold` 도구 코드 분석
- Hanging Protocol 정의 방법 학습 (`@ohif/extension-tmtv.hangingProtocolModule.ptCT`)
- `modes/longitudinal/` 와 비교하여 모드 간 차이점 파악
