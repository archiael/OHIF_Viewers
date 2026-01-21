# extensions/tmtv

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#1.1-전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [진입점 및 모듈 등록](#2.1-진입점-및-모듈-등록)
   - 2.2. [모듈 파일](#2.2-모듈-파일)
   - 2.3. [React 컴포넌트 (Panels/)](#2.3-react-컴포넌트-panels)
   - 2.4. [유틸리티 함수](#2.4-유틸리티-함수)
   - 2.5. [데이터 흐름 다이어그램 (텍스트)](#2.5-데이터-흐름-다이어그램-텍스트)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
   - 3.4. [중요 리액트 패턴](#3.4-중요-리액트-패턴)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extensions (확장 프로그램)](#4.1-extensions-확장-프로그램)
   - 4.2. [Modules (모듈 타입)](#4.2-modules-모듈-타입)
   - 4.3. [Services (서비스)](#4.3-services-서비스)
   - 4.4. [Hanging Protocol](#4.4-hanging-protocol)
   - 4.5. [Cornerstone Tools 통합](#4.5-cornerstone-tools-통합)
   - 4.6. [DisplaySet](#4.6-displayset)
   - 4.7. [PubSub 패턴](#4.7-pubsub-패턴)
   - 4.8. [관련 폴더](#4.8-관련-폴더)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [학습 팁](#5.2-학습-팁)
   - 5.3. [이 폴더를 다 이해하면 할 수 있게 되는 것](#5.3-이-폴더를-다-이해하면-할-수-있게-되는-것)

---


## 1. 모듈 개요

이 확장은 **TMTV (Total Metabolic Tumor Volume)** 계산 및 분석을 위한 전문 의료 영상 확장 프로그램입니다. PET/CT 융합 영상에서 종양의 대사 활성 영역을 자동으로 측정하고 정량화하는 데 사용됩니다.

### 1.1. 전체 OHIF 앱에서의 역할

- **PET/CT 전문 워크플로우**: PET(양전자 방출 단층촬영)과 CT 영상을 동시에 분석하여 종양의 총 대사 부피를 계산
- **ROI 기반 임계값 분할(Segmentation)**: 사용자가 그린 ROI(Region of Interest) 영역에서 SUV(Standardized Uptake Value) 임계값을 기반으로 자동 분할
- **정량적 리포트 생성**: TMTV 값, TLG(Total Lesion Glycolysis) 등의 정량 지표를 CSV 리포트로 내보내기
- **DICOM RT 구조 세트 내보내기**: 분석 결과를 DICOM RT Structure Set 형식으로 저장

### 1.2. 연결되는 화면/기능

- **TMTV 모드** (`modes/tmtv`): 이 확장을 기반으로 하는 전용 뷰어 모드
- **Hanging Protocol**: 3x4 그리드 레이아웃(CT, PT, Fusion 영상을 동시에 표시)
- **사이드 패널**: 환자 정보, SUV 메타데이터 편집, 세그멘테이션 도구, 내보내기 패널
- **툴바**: ROI 임계값 도구(Rectangle/Circle ROI StartEndThreshold)

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 진입점 및 모듈 등록
- **`src/index.tsx`**: 확장 프로그램 진입점, 모든 모듈을 내보냄
- **`src/id.js`**: 확장 ID 정의 (`@ohif/extension-tmtv`)
- **`src/init.js`**: 확장 초기화 - Cornerstone Tools 등록 및 MeasurementService 매핑

### 2.2. 모듈 파일
- **`src/commandsModule.ts`** (487줄): 12개의 TMTV 관련 커맨드 정의
  - `createNewLabelmapFromPT`: PT 영상에서 레이블맵 생성
  - `thresholdSegmentationByRectangleROITool`: ROI 도구로 임계값 분할 실행
  - `calculateTMTV`: TMTV 통계 계산
  - `exportTMTVReportCSV`: CSV 리포트 내보내기
  - `getMatchingPTDisplaySet`, `getPTMetadata`: PT 영상 및 메타데이터 검색
  - `setStartSliceForROIThresholdTool`, `setEndSliceForROIThresholdTool`: 3D ROI 시작/끝 슬라이스 설정

- **`src/getPanelModule.tsx`**: 4개의 사이드 패널 정의
  - `petSUV`: 환자 정보 및 PET SUV 메타데이터 편집
  - `tmtv`: TMTV 계산 및 세그멘테이션 패널
  - `tmtvBox`: ROI 임계값 도구 툴박스
  - `tmtvExport`: 세그멘테이션 내보내기 패널

- **`src/getToolbarModule.tsx`**: 툴바 컴포넌트 등록
  - `tmtv.RectangleROIThresholdOptions`: ROI 임계값 설정 UI

- **`src/getHangingProtocolModule.ts`** (351줄): PET/CT 전용 Hanging Protocol
  - 4개 Stage: 3x4, 2x2, 2x3, 2x4 레이아웃
  - CT, PT, Fusion, MIP 뷰포트 조합

### 2.3. React 컴포넌트 (Panels/)
- **`Panels/PanelPetSUV.tsx`** (282줄): PET SUV 메타데이터 편집 패널
  - 환자 성별, 체중, 방사성 약물 정보 수정
  - DICOM 메타데이터 업데이트 및 재로드

- **`Panels/PanelTMTV.tsx`**: TMTV 메인 패널 (PanelSegmentation + PanelROIThresholdExport 조합)

- **`Panels/PanelROIThresholdSegmentation/`**
  - **`PanelROIThresholdExport.tsx`**: TMTV 값 표시 및 CSV 내보내기 버튼
  - **`ROIThresholdConfiguration.tsx`**: 임계값 전략 선택 UI (Max vs Range)

- **`Panels/RectangleROIOptions.tsx`**: ROI 임계값 도구 설정 UI
  - 전략 선택: ROI_STAT (Max SUV의 %), RANGE (CT/PT 범위)
  - "Run" 버튼으로 임계값 분할 실행

### 2.4. 유틸리티 함수
- **`utils/getThresholdValue.ts`**: ROI 영역의 SUV 값 계산 및 임계값 결정
- **`utils/handleROIThresholding.ts`**: 세그멘테이션 데이터 변경 시 TMTV 재계산
- **`utils/createAndDownloadTMTVReport.js`**: CSV 리포트 생성 및 다운로드
- **`utils/hpViewports.ts`**: Hanging Protocol 뷰포트 정의 (ctAXIAL, ptSAGITTAL, fusionCORONAL 등)
- **`utils/dicomRTAnnotationExport/`**: DICOM RT Structure Set 내보내기
- **`utils/measurementServiceMappings/`**: Cornerstone Tools와 MeasurementService 연결
  - `RectangleROIStartEndThreshold.js`, `CircleROIStartEndThreshold.js`

### 2.5. 데이터 흐름 다이어그램 (텍스트)

```
[사용자 액션: ROI 그리기]
         ↓
[RectangleROIStartEndThreshold Tool] → [MeasurementService 매핑]
         ↓
[PanelROIThresholdExport] ← [segmentationService.subscribe(SEGMENTATION_DATA_MODIFIED)]
         ↓
[handleROIThresholding] → commandsManager.run('calculateTMTV')
         ↓
[csTools.utilities.segmentation.computeMetabolicStats()] → TMTV 값 계산
         ↓
[segmentationService.setSegmentationGroupStats()] → 상태 업데이트
         ↓
[PanelROIThresholdExport] → UI에 TMTV 표시
         ↓
[exportTMTVReportCSV] → CSV 다운로드
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

1. **OHIF Services (전역 상태)**
   - `segmentationService`: 세그멘테이션 데이터 관리 및 이벤트 발행
   - `displaySetService`: PT/CT DisplaySet 관리
   - `hangingProtocolService`: 레이아웃 및 뷰포트 매칭
   - `measurementService`: ROI 측정 데이터 관리
   - PubSub 패턴: `subscribe()` / `publish()` 사용

2. **로컬 상태 (useState)**
   - `PanelPetSUV`: `metadata` (환자 정보), `ptDisplaySet` (현재 PT DisplaySet)
   - `PanelROIThresholdExport`: 없음 (커스텀 훅 `useActiveViewportSegmentationRepresentations` 사용)

3. **useReducer 패턴**
   - `RectangleROIOptions`: 임계값 설정 상태 관리
   ```javascript
   const [config, dispatch] = useReducer(reducer, {
     strategy: 'roi_stat',
     ctLower: -1024, ctUpper: 1024,
     ptLower: 2.5, ptUpper: 100,
     weight: 0.41
   });
   ```

### 3.2. 재사용 가능한 UI 컴포넌트 패턴

1. **Compound Component 패턴** (`PanelPetSUV.tsx`)
   ```jsx
   <InputRow>
     <InputRow.Label unit="kg">Weight</InputRow.Label>
     <InputRow.Input value={metadata.PatientWeight} onChange={...} />
   </InputRow>
   ```
   - 관련 UI 요소를 논리적으로 그룹화
   - 일관된 레이아웃 유지

2. **@ohif/ui-next 컴포넌트 활용**
   - `Button`, `Input`, `Label`, `Select`, `PanelSection`
   - Tailwind CSS 스타일링

3. **Wrapper 컴포넌트 패턴** (`getPanelModule.tsx`)
   ```jsx
   const wrappedPanelTMTV = () => (
     <>
       <Toolbox buttonSectionId={toolbarService.sections.roiThresholdToolbox} />
       <PanelTMTV commandsManager={commandsManager} />
     </>
   );
   ```

### 3.3. 커스텀 훅

1. **`useSystem()`** (`@ohif/core`)
   - `commandsManager`, `servicesManager` 접근
   - 모든 TMTV 컴포넌트에서 사용

2. **`useActiveViewportSegmentationRepresentations()`** (`@ohif/extension-cornerstone`)
   - 현재 활성 뷰포트의 세그멘테이션 정보 가져오기
   - 자동으로 변경 감지 및 리렌더링

3. **`useSegmentations()`** (`@ohif/extension-cornerstone`)
   - 모든 세그멘테이션 목록 가져오기

4. **`useTranslation()`** (react-i18next)
   - 다국어 지원 (`PanelSUV`, `ROIThresholdConfiguration` 네임스페이스)

### 3.4. 중요 리액트 패턴

1. **useEffect로 서비스 구독**
   ```jsx
   useEffect(() => {
     const { unsubscribe } = hangingProtocolService.subscribe(
       hangingProtocolService.EVENTS.PROTOCOL_CHANGED,
       ({ viewportMatchDetails }) => { /* ... */ }
     );
     return () => unsubscribe();
   }, []);
   ```

2. **Debounced Callback** (`PanelROIThresholdExport`)
   - 세그멘테이션 데이터 변경 시 과도한 재계산 방지
   ```jsx
   const debouncedHandleROIThresholding = debounce(async eventDetail => {
     await handleROIThresholding({ segmentationId, ... });
   }, 100);
   ```

3. **useCallback으로 성능 최적화**
   ```jsx
   const runCommand = useCallback((commandName, options) => {
     return commandsManager.runCommand(commandName, options);
   }, [commandsManager]);
   ```

---

## 4. OHIF 특유 개념 정리

### 4.1. Extensions (확장 프로그램)

이 폴더 자체가 하나의 **Extension**입니다. Extension은 OHIF 뷰어에 새로운 기능을 추가하는 플러그인 방식의 모듈입니다.

**등록 구조**:
```typescript
const tmtvExtension = {
  id: '@ohif/extension-tmtv',
  preRegistration({ servicesManager, commandsManager, extensionManager, configuration }) {
    init({ ... }); // Cornerstone Tools 등록
  },
  getCommandsModule,      // 커맨드 정의
  getPanelModule,         // 사이드 패널 정의
  getToolbarModule,       // 툴바 컴포넌트 정의
  getHangingProtocolModule // Hanging Protocol 정의
};
```

### 4.2. Modules (모듈 타입)

OHIF Extension이 제공할 수 있는 표준 모듈 타입:
- **CommandsModule**: 재사용 가능한 액션/커맨드 정의 (`commandsModule.ts`)
- **PanelModule**: 사이드 패널 UI 컴포넌트 (`getPanelModule.tsx`)
- **ToolbarModule**: 툴바 컴포넌트 (`getToolbarModule.tsx`)
- **HangingProtocolModule**: 레이아웃 및 뷰포트 구성 (`getHangingProtocolModule.ts`)

### 4.3. Services (서비스)

플랫폼 레벨의 전역 상태 및 비즈니스 로직 관리자:
- **SegmentationService**: 세그멘테이션(마스크) 생성, 수정, 렌더링
- **DisplaySetService**: DICOM 시리즈를 논리적 단위(DisplaySet)로 그룹화
- **HangingProtocolService**: 레이아웃 매칭 및 뷰포트 배치
- **MeasurementService**: 측정/주석 데이터 저장 및 동기화
- **ToolbarService**: 동적 툴바 버튼 관리
- **CornerstoneViewportService**: Cornerstone 뷰포트 관리

모든 서비스는 `ServicesManager`를 통해 접근:
```javascript
const { segmentationService } = servicesManager.services;
```

### 4.4. Hanging Protocol

**뷰포트 레이아웃 및 이미지 매칭 규칙**을 정의하는 JSON 설정:

**TMTV Extension의 ptCT 프로토콜**:
- **매칭 조건**: `ModalitiesInStudy`에 CT와 PT가 모두 있고, `StudyDescription`에 "PETCT" 또는 "PET/CT" 포함
- **DisplaySet Selector**:
  - `ctDisplaySet`: CT 모달리티, `isReconstructable: true`, "CT WB" 시리즈
  - `ptDisplaySet`: PT 모달리티, "Corrected" 포함, "Uncorrected" 제외
- **Stage**:
  - Stage 1: 3x4 그리드 (CT, PT, Fusion 각 3방향 + MIP)
  - Stage 2: 2x2 (CT, Fusion, PT, MIP)
  - Stage 3: 2x3 (CT, PT 각 3방향)
  - Stage 4: 2x4 (PT, Fusion 각 3방향 + MIP)

### 4.5. Cornerstone Tools 통합

**TMTV 전용 도구**:
- **RectangleROIStartEndThresholdTool**: 3D 볼륨에서 시작/끝 슬라이스를 지정하여 직사각형 ROI 그리기
- **CircleROIStartEndThresholdTool**: 3D 볼륨에서 원형 ROI 그리기

**Measurement Service Mapping** (`init.js`):
```javascript
addTool(RectangleROIStartEndThresholdTool);
measurementService.addMapping(
  csTools3DVer1MeasurementSource,
  'RectangleROIStartEndThreshold',
  matchingCriteria,
  toAnnotation,   // OHIF Measurement → Cornerstone Annotation
  toMeasurement   // Cornerstone Annotation → OHIF Measurement
);
```

### 4.6. DisplaySet

**관련 이미지 그룹의 논리적 단위**:
- DICOM Series를 기반으로 생성
- `displaySetInstanceUID`로 고유 식별
- TMTV에서는 `ptDisplaySet`, `ctDisplaySet`으로 PT/CT 영상 그룹 관리

**CommandsModule에서의 사용**:
```javascript
const ptDisplaySet = actions.getMatchingPTDisplaySet({ viewportMatchDetails });
const metadata = actions.getPTMetadata({ ptDisplaySet });
const segmentationId = await segmentationService.createLabelmapForDisplaySet(ptDisplaySet);
```

### 4.7. PubSub 패턴

**서비스 간 이벤트 기반 통신**:
```javascript
// 구독
const { unsubscribe } = segmentationService.subscribe(
  segmentationService.EVENTS.SEGMENTATION_DATA_MODIFIED,
  (eventDetail) => {
    const { segmentationId } = eventDetail;
    handleROIThresholding({ segmentationId });
  }
);

// 구독 해제
return () => unsubscribe();
```

**TMTV에서 사용하는 이벤트**:
- `SEGMENTATION_DATA_MODIFIED`: 세그멘테이션 수정 시
- `PROTOCOL_CHANGED`: Hanging Protocol 변경 시

### 4.8. 관련 폴더

- **`platform/core/src/services/`**: 모든 OHIF 서비스 정의
- **`extensions/cornerstone/`**: Cornerstone3D 렌더링 확장 (TMTV가 의존)
- **`modes/tmtv/`**: TMTV Extension을 사용하는 전용 모드
- **`extensions/measurement-tracking/`**: 측정 추적 확장 (유사한 패턴)
- **`platform/ui-next/src/`**: UI 컴포넌트 라이브러리

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: Extension 구조 이해 (진입점)
- **파일**: `src/index.tsx`, `src/id.js`
- **목표**: Extension이 어떻게 등록되고 모듈을 내보내는지 이해
- **핵심**: `preRegistration`, 4개의 `getXXXModule` 메서드

#### 2단계: Hanging Protocol 분석
- **파일**: `src/getHangingProtocolModule.ts`, `src/utils/hpViewports.ts`
- **목표**: PET/CT 레이아웃이 어떻게 정의되는지 이해
- **핵심**: `protocolMatchingRules`, `displaySetSelectors`, `stages`

#### 3단계: React 컴포넌트 (UI)
- **순서**:
  1. `Panels/PanelPetSUV.tsx` - 가장 단순한 폼 기반 UI
  2. `Panels/RectangleROIOptions.tsx` - useReducer 패턴
  3. `Panels/PanelROIThresholdExport.tsx` - 서비스 구독 패턴
- **목표**: OHIF UI 컴포넌트 및 커스텀 훅 사용법 익히기

#### 4단계: Commands Module (비즈니스 로직)
- **파일**: `src/commandsModule.ts`
- **순서**:
  1. `getMatchingPTDisplaySet`, `getPTMetadata` - DisplaySet 이해
  2. `createNewLabelmapFromPT` - Segmentation 생성
  3. `thresholdSegmentationByRectangleROITool` - ROI 기반 분할
  4. `calculateTMTV` - 통계 계산
- **목표**: OHIF 서비스와 Cornerstone API 통합 이해

#### 5단계: 유틸리티 함수 (핵심 알고리즘)
- **파일**:
  - `utils/getThresholdValue.ts` - SUV 값 계산
  - `utils/handleROIThresholding.ts` - TMTV 재계산 로직
  - `utils/createAndDownloadTMTVReport.js` - CSV 생성
- **목표**: 실제 의료 영상 처리 알고리즘 이해

#### 6단계: Cornerstone Tools 통합
- **파일**: `src/init.js`, `utils/measurementServiceMappings/`
- **목표**: 커스텀 Cornerstone Tool을 MeasurementService에 연결하는 방법 이해

### 5.2. 학습 팁

1. **먼저 실행해보기**: `modes/tmtv` 모드를 실행하고 UI를 직접 조작하면서 각 패널과 기능이 어떻게 연결되는지 파악
2. **서비스 콘솔 로깅**: 브라우저 콘솔에서 `window.servicesManager.services.segmentationService`로 서비스 상태 확인
3. **이벤트 추적**: `subscribe()` 부분에 `console.log`를 추가하여 이벤트 흐름 파악
4. **작은 변경으로 실험**: 버튼 텍스트, 기본값 변경 후 Hot Reload로 즉시 확인

### 5.3. 이 폴더를 다 이해하면 할 수 있게 되는 것

**PET/CT 융합 영상 분석 워크플로우를 처음부터 끝까지 구축할 수 있습니다**:
- ✅ Hanging Protocol을 정의하여 복잡한 멀티 모달리티 레이아웃 구성
- ✅ ROI 기반 자동 세그멘테이션 알고리즘 구현
- ✅ DICOM 메타데이터를 활용한 정량적 의료 영상 분석 (SUV, TMTV, TLG)
- ✅ OHIF 서비스 패턴(PubSub, DisplaySet, Segmentation)을 활용한 확장 개발
- ✅ Cornerstone3D Tools와 OHIF Measurement 시스템 통합
- ✅ 의료 영상 분석 결과를 DICOM RT 표준 형식으로 내보내기

**응용 가능한 분야**:
- 다른 모달리티 조합 분석 확장 개발 (MR/CT, PET/MR 등)
- 커스텀 자동 분할 알고리즘 통합
- 정량 분석 리포트 생성 시스템 구축
