# extensions/cornerstone-dicom-pmap

## 목차

1. [모듈 개요](#1-모듈-개요)
   - 1.1. [전체 OHIF 앱에서의 역할](#전체-ohif-앱에서의-역할)
   - 1.2. [연결되는 화면/기능](#연결되는-화면기능)
   - 1.3. [의존성](#의존성)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [파일 구조](#파일-구조)
   - 2.2. [주요 파일 설명](#주요-파일-설명)
   - 2.3. [컴포넌트 간 관계 / 데이터 흐름](#컴포넌트-간-관계--데이터-흐름)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#커스텀-훅)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension (확장)](#extension-확장)
   - 4.2. [SOP Class Handler](#sop-class-handler)
   - 4.3. [DisplaySet](#displayset)
   - 4.4. [Referenced Volume (참조 볼륨)](#referenced-volume-참조-볼륨)
   - 4.5. [Colormap (색상 맵)](#colormap-색상-맵)
   - 4.6. [Services (서비스)](#services-서비스)
   - 4.7. [관련 폴더 링크](#관련-폴더-링크)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#추천-학습-순서)
   - 5.2. [이 폴더를 다 이해하면 할 수 있게 되는 것](#이-폴더를-다-이해하면-할-수-있게-되는-것)
   - 5.3. [추가 학습 팁](#추가-학습-팁)

---

## 1. 모듈 개요

이 확장은 **DICOM Parametric Map (PMAP) 영상을 읽고 표시하는 기능**을 제공합니다.

### 전체 OHIF 앱에서의 역할
- DICOM Parametric Map (SOP Class UID: 1.2.840.10008.5.1.4.1.1.30) 형식의 의료 영상을 처리
- PMAP은 기본 참조 볼륨(referenced volume) 위에 색상 맵(colormap)으로 표시되는 파라미터 데이터
- 예: PET/CT 영상에서 대사 활동 수치를 색상으로 시각화

### 연결되는 화면/기능
- **Viewport**: PMAP 데이터를 Cornerstone3D 볼륨 뷰포트로 렌더링
- **Display Set**: PMAP DICOM 파일을 DisplaySet으로 변환하여 뷰어에 로드
- **Overlay 렌더링**: 참조 볼륨 위에 PMAP을 반투명 색상 맵으로 오버레이 표시

### 의존성
- `@ohif/extension-cornerstone`: Cornerstone3D 뷰포트 컴포넌트 재사용
- `@cornerstonejs/adapters`: PMAP DICOM 데이터를 Cornerstone3D 형식으로 변환
- `@kitware/vtk.js`: 3D 볼륨 처리 (의존성 포함)

---

## 2. 주요 파일/컴포넌트 리스트

### 파일 구조
```
src/
├── index.tsx                           # 확장 진입점 - ViewportModule 등록
├── id.js                               # 확장 ID 및 SOP Class Handler ID 정의
├── getSopClassHandlerModule.ts         # PMAP DisplaySet 생성 및 로딩 로직
└── viewports/
    └── OHIFCornerstonePMAPViewport.tsx # PMAP 전용 Viewport React 컴포넌트
```

### 주요 파일 설명

#### `src/index.tsx` (40줄)
- **역할**: 확장 메인 진입점, ViewportModule 등록
- **내보내는 모듈**:
  - `getViewportModule()`: `dicom-pmap` 뷰포트 컴포넌트 제공
  - `getSopClassHandlerModule`: PMAP SOP Class 처리
- **React.lazy()**: 코드 스플리팅으로 PMAP 뷰포트를 필요할 때만 로드

#### `src/id.js` (8줄)
- **역할**: 확장 식별자 상수 정의
- `id`: `@ohif/extension-cornerstone-dicom-pmap`
- `SOPClassHandlerId`: DisplaySet 등록에 사용되는 핸들러 ID

#### `src/getSopClassHandlerModule.ts` (246줄)
- **역할**: PMAP DICOM 파일을 DisplaySet으로 변환하고 볼륨 데이터로 로드
- **핵심 함수**:
  - `_getDisplaySetsFromSeries()`: PMAP DisplaySet 객체 생성
  - `displaySet.load()`: PMAP 볼륨 데이터 로딩
  - `_loadParametricMap()`: Cornerstone3D 어댑터로 DICOM → 볼륨 변환
  - `getRangeFromPixelData()`: 픽셀 데이터 최소/최대값 계산 (윈도우 레벨용)

#### `src/viewports/OHIFCornerstonePMAPViewport.tsx` (203줄)
- **역할**: PMAP을 렌더링하는 React 뷰포트 컴포넌트
- **주요 기능**:
  - 참조 DisplaySet + PMAP DisplaySet 동시 렌더링
  - `rainbow_2` 컬러맵 적용 (투명도 포함)
  - 로딩 상태 UI 표시
  - PMAP 값을 100배 증폭하여 가시성 향상

### 컴포넌트 간 관계 / 데이터 흐름

```
[DICOM PMAP 파일]
       ↓
[getSopClassHandlerModule]
       ├─→ _getDisplaySetsFromSeries()
       │    └─→ DisplaySet 객체 생성 (referencedSeriesInstanceUID 포함)
       │
       └─→ displaySet.load()
            ├─→ _loadParametricMap()
            │    ├─→ dicomLoaderService (DICOM 파일 ArrayBuffer 로드)
            │    ├─→ adaptersPMAP.Cornerstone3D.ParametricMap (DICOM → 픽셀 데이터)
            │    └─→ volumeLoader.createAndCacheDerivedVolume() (참조 볼륨 기반 파생 볼륨 생성)
            │
            └─→ [Cache에 PMAP Volume 저장]
                     ↓
[OHIFCornerstonePMAPViewport]
       ├─→ getReferenceDisplaySet() (참조 볼륨 가져오기)
       ├─→ OHIFCornerstoneViewport (Cornerstone 확장의 기본 뷰포트 재사용)
       │    └─→ displaySets: [referencedDisplaySet, pmapDisplaySet]
       │    └─→ colormap: 'rainbow_2' 적용
       └─→ [화면에 오버레이 렌더링]
```

---

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

#### 1. **Props 기반 상태**
- `displaySets`, `viewportOptions`, `displaySetOptions` 등 상위에서 전달
- 뷰포트는 무상태(stateless) 컴포넌트 패턴 지향

#### 2. **Local State (useState)**
```typescript
const [pmapIsLoading, setPmapIsLoading] = useState(!pmapDisplaySet.isLoaded);
```
- PMAP 로딩 상태를 로컬 상태로 관리
- `segmentationService` 이벤트로 로딩 완료 감지

#### 3. **Ref 사용 (useRef)**
```typescript
const referencedDisplaySetRef = useRef(null);
```
- 참조 DisplaySet 정보를 리렌더링 없이 저장
- 콜백 함수에서 최신 참조 데이터 접근

#### 4. **OHIF Services (전역 상태)**
- `displaySetService`: DisplaySet CRUD 및 시리즈 조회
- `segmentationService`: PMAP 로딩 이벤트 발행/구독 (PubSub 패턴)
- `viewportGridService`: 뷰포트 그리드 상태 관리
- `uiNotificationService`: 사용자 알림 표시
- `customizationService`: UI 커스터마이징 (로딩 인디케이터 등)

### 재사용 가능한 UI 컴포넌트 패턴

#### 1. **컴포넌트 합성 (Composition)**
```typescript
<OHIFCornerstoneViewport
  {...props}
  displaySets={[referencedDisplaySet, pmapDisplaySet]}
  viewportOptions={{ viewportType: 'volume', ... }}
/>
```
- `OHIFCornerstoneViewport`를 래핑하여 PMAP 전용 로직 추가
- 기존 Cornerstone 뷰포트의 모든 기능 재사용

#### 2. **React.lazy + Suspense**
```typescript
const Component = React.lazy(() => import('./viewports/OHIFCornerstonePMAPViewport'));

<React.Suspense fallback={<div>Loading...</div>}>
  <Component {...props} />
</React.Suspense>
```
- 코드 스플리팅으로 번들 크기 최적화
- PMAP 뷰포트가 실제 사용될 때만 로드

#### 3. **Children Props 전달**
```typescript
childrenWithProps = children.map((child, index) =>
  React.cloneElement(child, { viewportId, key: index })
);
```
- 자식 컴포넌트에 `viewportId` 자동 주입

### 커스텀 훅

이 확장에는 별도의 커스텀 훅이 없지만, OHIF UI 라이브러리의 훅을 사용합니다:

#### `useViewportGrid()` (from @ohif/ui-next)
```typescript
const [viewportGrid, viewportGridService] = useViewportGrid();
const { viewports, activeViewportId } = viewportGrid;
```
- 뷰포트 그리드 상태와 서비스를 동시에 반환
- 뷰포트 추가/제거 시 자동 리렌더링

---

## 4. OHIF 특유 개념 정리

### Extension (확장)
**정의**: OHIF 뷰어에 새로운 기능을 추가하는 플러그인 모듈

**이 확장이 제공하는 모듈**:
- `ViewportModule`: `dicom-pmap` 뷰포트 컴포넌트 등록
- `SopClassHandlerModule`: PMAP SOP Class UID 처리 로직

**등록 방식**:
```typescript
// platform/app/public/config/default.js
extensions: [
  '@ohif/extension-cornerstone-dicom-pmap',
  // ...
]
```

### SOP Class Handler
**정의**: 특정 DICOM SOP Class를 처리하는 핸들러

**PMAP SOP Class**:
```typescript
const sopClassUids = ['1.2.840.10008.5.1.4.1.1.30']; // Parametric Map Storage
```

**역할**:
- DICOM 파일의 SOP Class UID가 PMAP인지 식별
- PMAP 파일을 DisplaySet으로 변환
- 참조 시리즈(Referenced Series) 정보 추출

### DisplaySet
**정의**: 뷰어에 표시할 수 있는 영상 세트의 단위

**PMAP DisplaySet 특징**:
```typescript
{
  Modality: 'PMAP',
  isDerivedDisplaySet: true,  // 파생 데이터
  referencedSeriesInstanceUID: '...',  // 기반이 되는 시리즈
  getReferenceDisplaySet: () => { ... },  // 참조 DisplaySet 가져오기
  getReferencedVolumeId: () => { ... },  // 참조 볼륨 ID 가져오기
  load: async ({ headers }) => { ... },  // 볼륨 데이터 로딩
}
```

### Referenced Volume (참조 볼륨)
**정의**: PMAP이 오버레이될 기반 볼륨 (예: CT, MR)

**중요 사항**:
- PMAP은 **반드시 참조 볼륨이 먼저 로드**되어야 함
- 참조 볼륨의 공간 정보(spacing, orientation)를 그대로 사용
- `volumeLoader.createAndCacheDerivedVolume()`로 파생 볼륨 생성

### Colormap (색상 맵)
**정의**: 픽셀 값을 색상으로 매핑하는 테이블

**PMAP 기본 설정**:
```typescript
colormap: {
  name: 'rainbow_2',
  opacity: [
    { value: 0, opacity: 0 },      // 0% → 완전 투명
    { value: 0.25, opacity: 0.25 },
    { value: 0.5, opacity: 0.5 },
    { value: 0.75, opacity: 0.75 },
    { value: 0.9, opacity: 0.99 }, // 90% → 거의 불투명
  ],
}
```
- 낮은 값은 투명하게 → 의미 없는 영역 숨김
- 높은 값은 진하게 → 중요한 영역 강조

### Services (서비스)
**관련 서비스**:
- `displaySetService`: DisplaySet 관리 (`platform/core/src/services/DisplaySetService`)
- `segmentationService`: PMAP 로딩 이벤트 발행 (실제로는 segmentation용이지만 PMAP도 사용)
- `viewportGridService`: 뷰포트 배치 관리
- `uiNotificationService`: 알림 표시

**PubSub 패턴**:
```typescript
// 이벤트 구독
segmentationService.subscribe(
  segmentationService.EVENTS.SEGMENTATION_LOADING_COMPLETE,
  callback
);

// 이벤트 발행
segmentationService._broadcastEvent(
  segmentationService.EVENTS.SEGMENTATION_LOADING_COMPLETE,
  { pmapDisplaySet: displaySet }
);
```

### 관련 폴더 링크
- `extensions/cornerstone/`: Cornerstone3D 기본 뷰포트 컴포넌트
- `platform/core/src/services/`: DisplaySetService, SegmentationService 등
- `platform/core/src/extensions/`: ExtensionManager, MODULE_TYPES
- `extensions/default/`: DICOM 데이터 소스 (PMAP 파일 로드)

---

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

#### 1단계: 확장 구조 이해 (30분)
**파일**: `src/index.tsx`, `src/id.js`
- 확장이 어떻게 등록되는지 확인
- ViewportModule과 SopClassHandlerModule의 역할 파악
- React.lazy로 코드 스플리팅하는 방법 학습

#### 2단계: DisplaySet 생성 로직 (1시간)
**파일**: `src/getSopClassHandlerModule.ts` (1-120줄)
- `_getDisplaySetsFromSeries()` 함수 분석
- DICOM 메타데이터에서 참조 시리즈 정보 추출하는 방법
- `getReferenceDisplaySet()`, `getReferencedVolumeId()` 지연 평가 패턴

#### 3단계: 볼륨 로딩 로직 (1.5시간)
**파일**: `src/getSopClassHandlerModule.ts` (122-228줄)
- `_loadParametricMap()` 함수 상세 분석
- Cornerstone3D 어댑터 사용법 (`adaptersPMAP.Cornerstone3D.ParametricMap`)
- `volumeLoader.createAndCacheDerivedVolume()` - 파생 볼륨 생성
- 픽셀 데이터 100배 증폭 로직 (218줄) 이해

#### 4단계: React 뷰포트 컴포넌트 (2시간)
**파일**: `src/viewports/OHIFCornerstonePMAPViewport.tsx`
- `useViewportGrid()` 훅 사용법
- 참조 DisplaySet과 PMAP DisplaySet 동시 렌더링
- 로딩 상태 관리 (`pmapIsLoading`, `useEffect`)
- Colormap 설정 방법 (64-78줄)
- 자식 컴포넌트에 props 주입 패턴 (132-142줄)

#### 5단계: 실습 (2-3시간)
1. **PMAP 샘플 데이터 로드**: 테스트 DICOM PMAP 파일 준비
2. **Colormap 커스터마이징**: `rainbow_2` → 다른 색상 맵으로 변경
3. **투명도 조정**: opacity 배열 수정하여 시각화 실험
4. **디버깅**: 브라우저 개발자 도구로 볼륨 캐시 확인

### 이 폴더를 다 이해하면 할 수 있게 되는 것

**"DICOM Parametric Map 같은 파생 영상 데이터를 OHIF에서 로드하고, 참조 볼륨 위에 색상 맵으로 오버레이 렌더링하는 확장을 개발할 수 있다."**

### 추가 학습 팁

1. **Cornerstone3D 문서**: [https://www.cornerstonejs.org/](https://www.cornerstonejs.org/)
   - Volume Viewport API
   - Colormap 개념
   - Derived Volume 생성

2. **DICOM 표준**: Parametric Map IOD (PS3.3 A.75)
   - Referenced Series Sequence 구조
   - Shared Functional Groups Sequence

3. **관련 확장 비교**:
   - `extensions/cornerstone-dicom-seg/`: Segmentation 오버레이 (비슷한 패턴)
   - `extensions/cornerstone/`: 기본 Cornerstone 뷰포트 (재사용 방법)

4. **디버깅 포인트**:
   - `cache.getVolume()`: 볼륨이 캐시에 제대로 저장되었는지 확인
   - `metaData.get()`: DICOM 메타데이터 접근
   - `displaySetService.getDisplaySetsForSeries()`: 참조 DisplaySet 조회
