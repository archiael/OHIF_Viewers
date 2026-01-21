# extensions/cornerstone-dynamic-volume

## 목차

1. [모듈 개요](#1-모듈-개요)
   - 1.1. [주요 책임](#11-주요-책임)
   - 1.2. [연결되는 화면/기능](#12-연결되는-화면기능)
   - 1.3. [핵심 개념](#13-핵심-개념)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [진입점 및 모듈 등록](#21-진입점-및-모듈-등록)
   - 2.2. [모듈 정의](#22-모듈-정의)
   - 2.3. [React 컴포넌트 (panels/)](#23-react-컴포넌트-panels)
   - 2.4. [Actions](#24-actions)
   - 2.5. [컴포넌트 관계도 (텍스트 다이어그램)](#25-컴포넌트-관계도-텍스트-다이어그램)
   - 2.6. [데이터 흐름](#26-데이터-흐름)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#31-상태-관리-방식)
   - 3.2. [커스텀 훅 사용](#32-커스텀-훅-사용)
   - 3.3. [재사용 가능한 UI 컴포넌트 패턴](#33-재사용-가능한-ui-컴포넌트-패턴)
   - 3.4. [Props vs Context](#34-props-vs-context)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Dynamic Volume (4D 볼륨)](#41-dynamic-volume-4d-볼륨)
   - 4.2. [Hanging Protocol (default4D)](#42-hanging-protocol-default4d)
   - 4.3. [DisplaySet vs Volume](#43-displayset-vs-volume)
   - 4.4. [Computed DisplaySet (계산된 볼륨)](#44-computed-displayset-계산된-볼륨)
   - 4.5. [Chart DisplaySet (CHT Modality)](#45-chart-displayset-cht-modality)
   - 4.6. [Commands와 Viewport 스왑](#46-commands와-viewport-스왑)
   - 4.7. [Cornerstone3D 유틸리티 활용](#47-cornerstone3d-유틸리티-활용)
   - 4.8. [관련 폴더 링크](#48-관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#51-추천-학습-순서)
   - 5.2. [이 확장을 다 이해하면 할 수 있게 되는 것](#52-이-확장을-다-이해하면-할-수-있게-되는-것)
   - 5.3. [초보자 팁](#53-초보자-팁)

---

## 1. 모듈 개요

`cornerstone-dynamic-volume` 확장은 **4D 의료 영상 데이터**(시간 축을 포함한 3D 볼륨)를 처리하고 시각화하는 전문 확장입니다. 주로 PET-CT 같은 다이나믹 볼륨 데이터를 다루며, 시간에 따른 변화를 애니메이션으로 재생하거나 특정 시간 프레임 구간에 대한 계산(합계, 평균, 차이)을 수행할 수 있습니다.

### 1.1. 주요 책임
- **4D 볼륨 재생**: 시간 축(dimension group)을 따라 볼륨 데이터를 애니메이션으로 재생
- **계산된 볼륨 생성**: 시간 프레임 범위에서 SUM, AVERAGE, SUBTRACT 연산을 수행하여 새로운 볼륨 생성
- **ROI 분석**: 세그멘테이션 마스크를 사용하여 시간에 따른 복셀 값 변화 추적
- **데이터 내보내기**: 시간-데이터 관계를 CSV 파일로 내보내기
- **차트 표시**: 세그멘테이션 영역의 시간별 데이터를 차트(CHT Modality)로 시각화

### 1.2. 연결되는 화면/기능
- **4D Workflow 패널**: 왼쪽 사이드 패널에 표시되는 4D 볼륨 제어 UI
- **Segmentation 패널**: 세그멘테이션과 함께 동적 볼륨 데이터 내보내기 기능 제공
- **Viewport**: PET, CT, Fusion(PET+CT) 뷰포트에 동적 볼륨 렌더링
- **Chart Viewport**: 세그멘테이션 ROI의 시간-강도 그래프 표시

### 1.3. 핵심 개념
이 확장은 **Dynamic Volume** 개념을 중심으로 동작합니다:
- DICOM 태그 `FrameReferenceTime`, `NumberOfTimeSlices`, `TemporalPositionIdentifier` 등을 사용하여 4D 데이터 감지
- Cornerstone3D의 Dynamic Volume 유틸리티를 활용하여 시간 축 데이터 처리
- 시간 프레임을 "dimension group"이라는 단위로 관리


## 2. 주요 파일/컴포넌트 리스트

### 2.1. 진입점 및 모듈 등록
- **src/index.ts** (58줄): 확장의 메인 진입점. PanelModule, HangingProtocolModule, CommandsModule을 내보냄. preRegistration에서 캐시 크기를 5GB로 확장
- **src/id.js** (7줄): 확장 ID 정의 (`@ohif/extension-cornerstone-dynamic-volume`)

### 2.2. 모듈 정의
- **src/getPanelModule.tsx** (61줄): 두 개의 패널 등록
  - `dynamic-volume`: 4D 워크플로우 제어 패널
  - `dynamic-segmentation`: 세그멘테이션 + 내보내기 기능 통합 패널
- **src/commandsModule.ts** (407줄): 5개의 주요 커맨드 정의 및 동적 볼륨 관련 로직
- **src/getHangingProtocolModule.ts** (682줄): `default4D` Hanging Protocol 정의 (4단계 워크플로우)

### 2.3. React 컴포넌트 (panels/)
- **panels/DynamicDataPanel.tsx** (21줄): 4D 패널 래퍼, PanelGenerateImage를 렌더링
- **panels/PanelGenerateImage.tsx** (227줄): 핵심 컨트롤러 컴포넌트. 동적 볼륨 감지, 재생, 계산 로직 관리
- **panels/DynamicVolumeControls.tsx** (287줄): UI 컴포넌트. 재생/일시정지, FPS, 프레임 선택, 계산 작업 버튼 제공
- **panels/DynamicExport.tsx** (56줄): CSV 내보내기 버튼 (Time Data, ROI Stats)
- **panels/WorkflowPanel.tsx** (24줄): 워크플로우 단계 드롭다운 패널

### 2.4. Actions
- **actions/updateSegmentationsChartDisplaySet.ts** (278줄): 세그멘테이션 데이터를 기반으로 차트 DisplaySet 생성
- **actions/index.ts**: actions export

### 2.5. 컴포넌트 관계도 (텍스트 다이어그램)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extension Manager                           │
│  (dynamicVolumeExtension 등록)                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┬─────────────────┐
    │              │              │                 │
    v              v              v                 v
┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐
│ Panel   │  │Commands  │  │ Hanging   │  │ preRegistration  │
│ Module  │  │ Module   │  │ Protocol  │  │ (캐시 설정)       │
└────┬────┘  └────┬─────┘  └───────────┘  └──────────────────┘
     │            │
     v            v
┌──────────────────────────────────────────────────────────────────┐
│  Panels (React Components)                                       │
│  ┌────────────────────┐  ┌──────────────────────┐               │
│  │ DynamicDataPanel   │  │ DynamicSegmentation  │               │
│  │   (4D 워크플로우)   │  │   (세그멘테이션)      │               │
│  └─────────┬──────────┘  └──────────┬───────────┘               │
│            │                        │                            │
│            v                        v                            │
│  ┌──────────────────────┐  ┌─────────────────┐                  │
│  │ PanelGenerateImage   │  │ DynamicExport   │                  │
│  │  (메인 컨트롤러)      │  │  (CSV 내보내기) │                  │
│  └─────────┬────────────┘  └─────────────────┘                  │
│            │                                                     │
│            v                                                     │
│  ┌──────────────────────┐                                       │
│  │DynamicVolumeControls │                                       │
│  │  (UI: 재생/FPS/계산) │                                       │
│  └──────────────────────┘                                       │
└──────────────────────────────────────────────────────────────────┘
                   │
                   │ (commands 호출)
                   v
┌──────────────────────────────────────────────────────────────────┐
│  Commands                                                        │
│  • getDynamic4DDisplaySet                                       │
│  • swapDynamicWithComputedDisplaySet                            │
│  • swapComputedWithDynamicDisplaySet                            │
│  • exportTimeReportCSV                                          │
│  • createNewLabelMapForDynamicVolume                            │
│  • updateSegmentationsChartDisplaySet                           │
└──────────────────────────────────────────────────────────────────┘
                   │
                   v
┌──────────────────────────────────────────────────────────────────┐
│  OHIF Services                                                   │
│  • displaySetService: DisplaySet 관리                            │
│  • viewportGridService: Viewport 레이아웃 제어                   │
│  • segmentationService: 세그멘테이션 생성/관리                    │
│  • cornerstoneViewportService: 렌더링 엔진 접근                  │
│  • cineService: 애니메이션 재생 제어                              │
└──────────────────────────────────────────────────────────────────┘
                   │
                   v
┌──────────────────────────────────────────────────────────────────┐
│  Cornerstone3D                                                   │
│  • cache: 볼륨 캐시 관리                                          │
│  • volumeLoader: 파생 볼륨 생성                                   │
│  • utilities.dynamicVolume: 시간 데이터 추출/연산                 │
│  • eventTarget: DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED 이벤트    │
└──────────────────────────────────────────────────────────────────┘
```

### 2.6. 데이터 흐름

```
[DICOM 이미지]
    → [DisplaySetService에서 4D 감지]
    → [Dynamic Volume 생성 (Cornerstone Cache)]
    → [PanelGenerateImage가 감지 및 상태 설정]
    → [사용자가 UI 조작]
    → [Commands 실행]
    → [Cornerstone utilities로 계산/업데이트]
    → [Viewport 렌더링 업데이트]
```


## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식

#### 컴포넌트 로컬 상태 (useState)
`PanelGenerateImage.tsx`에서 모든 4D 제어 상태를 관리:
```typescript
const [dimensionGroupRange, setDimensionGroupRange] = useState([1, 1]);
const [computedDisplaySet, setComputedDisplaySet] = useState(null);
const [dynamicVolume, setDynamicVolume] = useState(null);
const [frameRate, setFrameRate] = useState(20);
const [isPlaying, setIsPlaying] = useState(isCineEnabled);
const [dimensionGroupNumberRendered, setDimensionGroupNumberRendered] = useState(null);
const [displayingComputed, setDisplayingComputed] = useState(false);
```

이 상태들은 **단방향 데이터 흐름**으로 `DynamicVolumeControls` 컴포넌트에 props로 전달됩니다.

#### 전역 서비스 기반 상태 (ServicesManager)
- **cineService**: 재생/정지 상태는 OHIF의 CineService를 통해 전역 관리
- **displaySetService**: DisplaySet 목록은 서비스에서 중앙 관리
- **viewportGridService**: Viewport 상태 및 레이아웃 관리
- **cornerstoneViewportService**: Cornerstone 렌더링 엔진과의 인터페이스

#### 외부 이벤트 구독 (useEffect)
```typescript
// 1. Viewport 데이터 변경 감지
cornerstoneViewportService.subscribe(VIEWPORT_DATA_CHANGED, callback);

// 2. Cine 재생 상태 변경 감지
cineService.subscribe(CINE_STATE_CHANGED, callback);

// 3. Cornerstone 이벤트 직접 구독
eventTarget.addEventListener(DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED, callback);
```

이 패턴은 **리액트 외부 상태(Cornerstone, OHIF Services)와 리액트 컴포넌트를 동기화**하는 방식입니다.

### 3.2. 커스텀 훅 사용

#### useCine (from @ohif/ui-next)
```typescript
const [{ isCineEnabled }, cineService] = useCine();
```
- OHIF의 Cine(애니메이션) 서비스를 리액트 훅으로 래핑
- 재생 상태와 서비스 인스턴스를 동시에 반환

#### useViewportGrid (from @ohif/ui-next)
```typescript
const [{ activeViewportId }] = useViewportGrid();
```
- 현재 활성화된 viewport ID를 추적
- Grid 레이아웃 상태를 리액트 컴포넌트에서 접근 가능하게 함

#### useSegmentations (from @ohif/extension-cornerstone)
```typescript
const segmentations = useSegmentations({ servicesManager });
```
- 현재 활성화된 세그멘테이션 목록을 반환
- `DynamicExport` 컴포넌트에서 세그멘테이션이 있을 때만 내보내기 버튼 표시

### 3.3. 재사용 가능한 UI 컴포넌트 패턴

`DynamicVolumeControls.tsx`는 **프레젠테이션 컴포넌트**로 설계되었습니다:
- Props로 모든 상태와 핸들러를 받음
- 비즈니스 로직 없이 순수하게 UI만 담당
- `@ohif/ui-next`의 재사용 가능한 컴포넌트 활용:
  - `Button`, `Tabs`, `TabsList`, `TabsTrigger`
  - `PanelSection`
  - `Numeric.Container`, `Numeric.DoubleRange`, `Numeric.NumberStepper`
  - `Tooltip`, `Icons`

반면 `PanelGenerateImage.tsx`는 **컨테이너 컴포넌트**:
- 비즈니스 로직과 상태 관리 담당
- 서비스와 통신
- Commands 실행

### 3.4. Props vs Context
이 확장은 **Context를 사용하지 않고** 모든 의존성을 **명시적인 Props**로 전달합니다:
```typescript
function DynamicDataPanel({ servicesManager, commandsManager, extensionManager })
```
이는 OHIF 확장의 일반적인 패턴으로, 각 확장이 독립적이고 테스트 가능하도록 설계되었습니다.


## 4. OHIF 특유 개념 정리

### 4.1. Dynamic Volume (4D 볼륨)
**정의**: 시간 축을 포함한 3차원 의료 영상 볼륨. 각 시간 포인트를 "dimension group"이라고 부릅니다.

**감지 방법**:
```typescript
// DICOM 인스턴스에서 다음 태그 중 하나라도 있으면 4D로 인식
instance.FrameReferenceTime !== undefined ||
instance.NumberOfTimeSlices !== undefined ||
instance.TemporalPositionIdentifier !== undefined
```

**관련 파일**:
- `commandsModule.ts` - `getDynamic4DDisplaySet()` 함수
- `actions/updateSegmentationsChartDisplaySet.ts` - 시간 포인트 데이터 추출

### 4.2. Hanging Protocol (default4D)
`getHangingProtocolModule.ts`에서 정의된 4단계 워크플로우:

1. **dataPreparation (데이터 준비)**: 1x3 그리드, PET 3뷰 (Axial, Sagittal, Coronal)
2. **registration (정합)**: 3x3 그리드, Fusion(PET+CT) + CT + PET 9뷰
3. **roiQuantification (ROI 정량화)**: 1x3 그리드, Fusion 3뷰
4. **kineticAnalysis (동역학 분석)**: 2x3 그리드, Fusion 3뷰 + 차트 1개

각 단계는 서로 다른 `toolGroupId`와 `syncGroups`를 가집니다.

### 4.3. DisplaySet vs Volume
- **DisplaySet**: OHIF의 논리적 이미지 그룹 (서비스에서 관리)
- **Volume**: Cornerstone3D의 실제 3D/4D 데이터 (캐시에 저장)

이 확장에서는 두 개념을 매핑:
```typescript
// DisplaySet UID로 Volume 찾기
const dynamic4DDisplaySet = displaySetService.getDisplaySetByUID(uid);
const volumeId = dynamic4DDisplaySet.displaySetInstanceUID;
const volume = cache.getVolume(volumeId);
```

### 4.4. Computed DisplaySet (계산된 볼륨)
사용자가 시간 프레임 범위에서 SUM/AVERAGE/SUBTRACT 연산을 수행하면:
1. 새로운 파생 볼륨 생성 (`volumeLoader.createAndCacheDerivedVolume`)
2. 계산 결과를 스칼라 데이터로 설정
3. DisplaySet 객체 생성 (실제 DICOM 아님, 클라이언트에서 생성)
4. `isDerived: true` 플래그로 표시

```typescript
const displaySet = {
  volumeLoaderSchema: computedVolume.volumeId.split(':')[0],
  displaySetInstanceUID: uuidComputedVolume.current,
  madeInClient: true,  // 클라이언트에서 생성됨
  isDerived: true,     // 파생 데이터
  referenceDisplaySetUID: dynamicVolume.volumeId.split(':')[1],
  // ...
};
```

### 4.5. Chart DisplaySet (CHT Modality)
`updateSegmentationsChartDisplaySet.ts`에서 생성하는 특수 DisplaySet:
- **Modality**: `CHT` (Chart, 비표준 DICOM)
- **SOPClassUID**: `1.9.451.13215.7.3.2.7.6.1` (커스텀)
- **용도**: 세그멘테이션 ROI의 시간-강도 그래프를 "가짜 DICOM 인스턴스"처럼 취급하여 Viewport에 표시
- **chartData 구조**:
  ```typescript
  chartData: {
    series: [{ label, points: [[time, value], ...], color }],
    axis: { x: { label }, y: { label } }
  }
  ```

### 4.6. Commands와 Viewport 스왑
이 확장의 핵심 커맨드:
- `swapDynamicWithComputedDisplaySet`: 원본 4D 볼륨 → 계산된 볼륨으로 교체
- `swapComputedWithDynamicDisplaySet`: 계산된 볼륨 → 원본 4D 볼륨으로 복원

스왑 로직:
```typescript
// 모든 viewport를 순회하며 특정 DisplaySet을 다른 것으로 교체
viewports.forEach(viewport => {
  if (viewport.displaySetInstanceUIDs.includes(oldDisplaySetUID)) {
    // 새 DisplaySet UID로 교체
    commandsManager.run('setDisplaySetsForViewports', { viewportsToUpdate });
  }
});
```

### 4.7. Cornerstone3D 유틸리티 활용

#### dynamicVolume.getDataInTime
```typescript
const [timeData, ijkCoords] = utilities.dynamicVolume.getDataInTime(
  dynamicVolume,
  { maskVolumeId }
);
```
- 세그멘테이션 마스크 내부의 복셀들에 대해 시간별 값 배열 반환
- `timeData[voxelIndex][timeIndex]` = 특정 복셀의 특정 시간 값

#### dynamicVolume.updateVolumeFromTimeData
```typescript
utilities.dynamicVolume.updateVolumeFromTimeData(
  dynamicVolume,
  'SUM',  // or 'AVERAGE', 'SUBTRACT'
  { dimensionGroupNumbers: [1, 2, 3, 4], targetVolume }
);
```
- 지정된 시간 프레임들에 대해 연산 수행
- 결과를 `targetVolume`에 저장

### 4.8. 관련 폴더 링크
- **extensions/cornerstone**: Cornerstone 렌더링 기본 확장 (의존성)
- **extensions/default**: 기본 확장 (DataSource, Toolbar 등)
- **platform/core/src/services**: ServicesManager, DisplaySetService 등
- **platform/ui-next**: UI 컴포넌트 라이브러리


## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

#### 1단계: UI 컴포넌트 이해하기 (1-2시간)
먼저 사용자가 보는 화면부터 시작하세요:
1. `panels/DynamicVolumeControls.tsx` 읽기
   - 어떤 버튼과 컨트롤이 있는지 파악
   - Props 인터페이스 확인 (어떤 데이터를 받는지)
2. `panels/DynamicExport.tsx` 읽기
   - 간단한 내보내기 버튼 컴포넌트
   - `useSegmentations` 훅 사용법 확인

**학습 포인트**:
- OHIF의 `@ohif/ui-next` 컴포넌트 재사용 패턴
- 프레젠테이션 컴포넌트와 컨테이너 컴포넌트 분리

#### 2단계: 컨트롤러 로직 이해하기 (2-3시간)
3. `panels/PanelGenerateImage.tsx` 읽기
   - `useEffect`로 어떤 이벤트를 구독하는지 확인
   - `onGenerateImage()` 함수의 볼륨 계산 로직 추적
   - Cine 재생 로직 (`handlePlay`, `handleStop`)
4. `getPanelModule.tsx` 읽기
   - 패널이 어떻게 등록되는지 확인

**학습 포인트**:
- 리액트 외부 상태(Services, Cornerstone)와 동기화하는 방법
- OHIF 서비스 사용 패턴 (`cineService`, `displaySetService`)

#### 3단계: Commands와 비즈니스 로직 (3-4시간)
5. `commandsModule.ts` 읽기
   - 각 커맨드가 무엇을 하는지 이해
   - `getDynamic4DDisplaySet()` - 4D 데이터 감지 방법
   - `exportTimeReportCSV()` - CSV 생성 로직
   - `swapDynamicWithComputedDisplaySet()` - DisplaySet 교체 메커니즘
6. `actions/updateSegmentationsChartDisplaySet.ts` 읽기
   - 차트 데이터 생성 과정
   - 세그멘테이션 ROI에서 시간별 데이터 추출

**학습 포인트**:
- OHIF Command 패턴 (definitions, actions, defaultContext)
- Cornerstone3D의 Dynamic Volume 유틸리티 사용법
- DicomMetadataStore에 가짜 인스턴스 추가하는 기법

#### 4단계: Hanging Protocol 이해하기 (1시간)
7. `getHangingProtocolModule.ts` 읽기
   - 4단계 워크플로우 구조 파악
   - displaySetSelectors의 매칭 규칙 이해
   - syncGroups의 동작 방식

**학습 포인트**:
- OHIF Hanging Protocol 문법
- Stage 기반 워크플로우 설계

#### 5단계: 전체 흐름 통합 이해 (1-2시간)
8. `src/index.ts` 읽기
   - preRegistration에서 캐시 크기 설정 이유
   - 각 모듈이 어떻게 조합되는지 확인
9. 실제 4D 데이터로 테스트 (PET-CT 시리즈)
   - 브라우저 개발자 도구로 이벤트 로그 확인
   - Cornerstone cache 상태 검사

### 5.2. 이 확장을 다 이해하면 할 수 있게 되는 것

**기능적으로**:
- DICOM 4D 볼륨 데이터(PET Dynamic, 4D CT 등)를 시간 축으로 애니메이션 재생하는 뷰어 구현
- 시간 구간별 통계 계산 (합계, 평균, 차이) 기능 추가
- 세그멘테이션 ROI의 시간-강도 곡선(TAC, Time-Activity Curve) 분석 도구 개발
- 분석 결과를 CSV로 내보내는 워크플로우 구축

**기술적으로**:
- Cornerstone3D의 Dynamic Volume API 활용법
- OHIF 확장 시스템에서 복잡한 워크플로우 패널 추가 방법
- 클라이언트에서 파생 볼륨 생성 및 DisplaySet 동적 교체 기법
- 비표준 Modality(CHT)를 사용하여 커스텀 데이터 시각화 구현
- 리액트 컴포넌트와 Cornerstone 이벤트 시스템 통합 패턴

### 5.3. 초보자 팁

1. **먼저 Cornerstone3D 문서 읽기**: 이 확장은 Cornerstone3D의 Dynamic Volume 기능에 크게 의존합니다. [Cornerstone3D 공식 문서](https://www.cornerstonejs.org/)의 Dynamic Volume 섹션을 먼저 읽으세요.

2. **브라우저 콘솔 활용**:
   ```javascript
   // 콘솔에서 현재 볼륨 확인
   cs.cache.getVolumes()

   // 동적 볼륨 확인
   cs.cache.getVolumes().filter(v => v.isDynamicVolume())
   ```

3. **작은 수정부터 시작**:
   - FPS 기본값 변경 (`frameRate` 초기값)
   - 버튼 텍스트 수정
   - 차트 축 레이블 커스터마이징

4. **데이터 흐름 추적**:
   - 사용자가 "Generate" 버튼 클릭 → `onGenerateImage()` → `updateVolumeFromTimeData()` → `swapDynamicWithComputedDisplaySet()` → viewport 업데이트 순서로 코드를 따라가 보세요.

5. **실제 데이터 준비**:
   - PET Dynamic 시리즈가 있는 DICOM 데이터 필요
   - 없다면 테스트 데이터셋 검색: "dynamic PET DICOM sample"
