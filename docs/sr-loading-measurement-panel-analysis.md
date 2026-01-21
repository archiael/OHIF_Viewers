# SR DICOM 로딩 및 Measurement Panel 표시 로직 분석

## 분석 목표

USMPR mode 실행 시 Studies 목록의 모든 SR DICOM 파일을 읽어서 오른쪽 Measurement panel에 표시하는 전체 로직을 분석하여 문서화합니다.

---

## 1. SR DICOM 파일 발견 및 DisplaySet 생성

### 위치
[extensions/cornerstone-dicom-sr/src/getSopClassHandlerModule.ts](../extensions/cornerstone-dicom-sr/src/getSopClassHandlerModule.ts)

### 프로세스

#### 1.1 SOP Class Handler 등록 (Lines 40-45)
SR 확장은 모든 SR 타입의 SOP Class UID를 등록합니다:
- **BasicTextSR**: `1.2.840.10008.5.1.4.1.1.88.11`
- **EnhancedSR**: `1.2.840.10008.5.1.4.1.1.88.22`
- **ComprehensiveSR**: `1.2.840.10008.5.1.4.1.1.88.33`
- **Comprehensive3DSR**: `1.2.840.10008.5.1.4.1.1.88.34`

#### 1.2 DisplaySet 생성 (Lines 83-147)
함수: `_getDisplaySetsFromSeries(instances, servicesManager, extensionManager)`

생성되는 DisplaySet 객체 구조:
```javascript
{
  Modality: 'SR',
  SOPClassHandlerId: SOPClassHandlerId, // or SOPClassHandlerId3D for 3D SR
  isImagingMeasurementReport: true, // ConceptNameCodeSequence 확인
  load: _load, // 지연 로딩 함수
  isLoaded: false,
  isHydrated: false
}
```

---

## 2. SR DisplaySet 로딩 및 측정값 추출

### 위치
[extensions/cornerstone-dicom-sr/src/getSopClassHandlerModule.ts:156-263](../extensions/cornerstone-dicom-sr/src/getSopClassHandlerModule.ts#L156-L263)

### 함수
`_load(srDisplaySet, servicesManager, extensionManager)`

### 4단계 프로세스

#### Phase 1: Bulk Data 검색 (Lines 169-191)
- SR에서 참조하는 bulk data(좌표와 같은 큰 이진 데이터)를 `BulkDataURI`를 통해 검색
- 측정값 추출 전에 누락된 데이터를 데이터 소스에서 채움

#### Phase 2: 측정값 추출 (Lines 195-203)
```typescript
srDisplaySet.measurements = _getMeasurements(ContentSequence);
```

- DICOM SR ContentSequence를 TID 1500 (Measurement Report 템플릿) 형식으로 파싱
- 추출되는 측정값 정보:
  - `TrackingUniqueIdentifier`: 각 측정값의 고유 ID
  - `TrackingIdentifier`: 도구 타입 매핑
  - `coords`: SCOORD (2D) 또는 SCOORD3D (3D) 좌표 데이터 배열
  - `labels`: 측정값의 표시 레이블
  - 소스 이미지 연결을 위한 참조 SOPInstanceUID

#### Phase 3: 참조 이미지 추출 (Line 196)
```typescript
srDisplaySet.referencedImages = _getReferencedImagesList(ContentSequence);
```

- SR 측정값이 참조하는 이미지 식별
- 나중에 측정값을 올바른 DisplaySet/viewport에 매핑하는 데 사용

#### Phase 4: DisplaySet 등록 (Lines 223-262)
```typescript
displaySetService.activeDisplaySets.forEach(activeDisplaySet => {
  _checkIfCanAddMeasurementsToDisplaySet(srDisplaySet, activeDisplaySet, dataSource, servicesManager);
});

displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, data => {
  // 새로운 displaySet과 SR 측정값 매칭 재시도
});
```

**매칭 로직** (Lines 265-299):
- 3D SR (SCOORD3D): `FrameOfReferenceUID`로 매칭
- 2D SR (SCOORD): 참조 이미지 `SOPInstanceUID`와 프레임 번호로 매칭
- 폴백: `FrameOfReferenceUID`가 없으면 `StudyInstanceUID`로 매칭

**중요**: 이 단계에서 **모든 active image DisplaySet**을 검사하여 SR 측정값을 받을 수 있는지 확인합니다.

---

## 3. USMPR Mode에서 SR 로딩 트리거

### 위치
[modes/usmpr/src/index.tsx:1541-1597](../modes/usmpr/src/index.tsx#L1541-L1597)

### 함수
`loadSRDisplaySets(reason = 'initial load')`

### 트리거 포인트

#### 3.1 Mode 진입 시 자동 로드 (Line 1581)
```typescript
setTimeout(() => loadSRDisplaySets('initial load'), 1000);
```

- USMPR mode 초기화 1초 후 SR DisplaySet 로드
- 뷰포트가 준비될 시간 확보

#### 3.2 Viewport 데이터 변경 구독 (Lines 1587-1597)
```typescript
displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, data => {
  const hasSR = allDisplaySets.some(ds =>
    ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
  );
  if (hasSR) {
    setTimeout(() => loadSRDisplaySets('viewport data changed'), 200);
  }
});
```

- 새로운 이미지 DisplaySet이 추가될 때 자동으로 SR 재로드
- 새로 로드된 시리즈에 대한 측정값이 사용 가능하도록 보장

#### 3.3 SR DisplaySet 로딩 (Lines 1543-1565)
```typescript
const loadSRDisplaySets = async (reason = 'initial load') => {
  // 모든 SR DisplaySet 필터링
  const srDisplaySets = allDisplaySets.filter(ds =>
    ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
  );

  // 각 SR DisplaySet에 대해 load() 호출
  srDisplaySets.forEach(srDS => {
    try {
      srDS.load(); // _load() 함수 트리거
    } catch (error) {
      console.error('❌ [USMPR] Error loading SR displaySet:', error);
    }
  });

  // SR 주석에 대한 뷰포트 재렌더링 트리거
  renderViewportCacheReload();
};
```

**핵심**: 이 함수는 **스터디의 모든 SR DisplaySet**을 로드합니다 (현재 뷰포트와 관계없이).

---

## 4. SR 측정값을 MeasurementService로 Hydration

### 위치
[extensions/cornerstone-dicom-sr/src/utils/hydrateStructuredReport.ts](../extensions/cornerstone-dicom-sr/src/utils/hydrateStructuredReport.ts)

### 함수
`hydrateStructuredReport({ servicesManager, extensionManager, commandsManager }, displaySetInstanceUID)`

### 5단계 Hydration 프로세스

#### Phase 1: 설정 (Lines 46-89)
```typescript
const { measurementService, displaySetService, customizationService } = servicesManager.services;
const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
const instance = DicomMetadataStore.getInstance(studyUID, seriesUID, sopUID);

const mappings = measurementService.getSourceMappings(
  CORNERSTONE_3D_TOOLS_SOURCE_NAME,
  CORNERSTONE_3D_TOOLS_SOURCE_VERSION
);
```

- 서비스와 SR DisplaySet 가져오기
- 측정값 소스 매핑 검색 (Cornerstone3D 도구 → 내부 측정값 스키마)

#### Phase 2: SR을 ToolState로 변환 (Lines 93-116)
```typescript
const sopInstanceUIDToImageId = {};
displaySet.measurements.forEach(measurement => {
  const key = `${ReferencedSOPInstanceUID}:${frameNumber}`;
  sopInstanceUIDToImageId[key] = imageId;
});

let storedMeasurementByAnnotationType = MeasurementReport.generateToolState(
  instance,
  sopInstanceUIDToImageId,
  metaData
);
```

- DICOM SR 인스턴스 UID를 좌표 변환을 위한 imageId에 매핑
- **`@cornerstonejs/adapters` MeasurementReport.generateToolState()** 호출:
  - DICOM SR ContentSequence를 Cornerstone3D ToolState 형식으로 변환
  - SCOORD/SCOORD3D 좌표를 world/pixel 좌표로 변환
  - 주석 타입별로 측정값 그룹화 (Length, EllipticalROI 등)

#### Phase 3: 커스터마이제이션 훅 (Lines 118-125)
```typescript
const onBeforeSRHydration = customizationService.getCustomization('onBeforeSRHydration')?.value;
if (typeof onBeforeSRHydration === 'function') {
  storedMeasurementByAnnotationType = onBeforeSRHydration({
    storedMeasurementByAnnotationType,
    displaySet,
  });
}
```

- MeasurementService에 추가되기 전에 커스텀 처리 허용

#### Phase 4: 측정값 등록 (Lines 128-156)
```typescript
Object.keys(hydratableMeasurementsInSR).forEach(annotationType => {
  const toolDataForAnnotationType = hydratableMeasurementsInSR[annotationType];

  toolDataForAnnotationType.forEach(toolData => {
    const referenceData = getReferenceData(toolData);
    // MeasurementService에 측정값 추가
    measurementService.addRawMeasurement(
      source,
      annotationType,
      { annotation },
      matchingMapping.toMeasurementSchema,
      dataSource
    );
  });
});
```

- SR의 각 측정값 타입을 순회
- `getReferenceData()`를 호출하여 뷰포트 매핑 결정:
  - **2D 측정값 (SCOORD)**: imageId로 이미지 DisplaySet에 매핑
  - **3D 측정값 (SCOORD3D)**: FrameOfReferenceUID로 볼륨 DisplaySet에 매핑
- 각 측정값을 **MeasurementService** (중앙 측정값 저장소)에 등록

#### Phase 5: 참조 데이터 해결 (Lines 183-220)
```typescript
function getReferenceData(toolData): ToolTypes.AnnotationMetadata {
  const frameNumber = toolData.annotation.data?.frameNumber || 1;
  const imageId = sopInstanceUIDToImageId[`${toolData.sopInstanceUid}:${frameNumber}`];

  if (!imageId) {
    return getReferenceData3D(toolData, servicesManager);
  }

  const instance = metaData.get('instance', imageId);
  const { FrameOfReferenceUID, SeriesInstanceUID } = instance;

  return {
    referencedImageId: imageId,
    FrameOfReferenceUID,
    seriesInstanceUID: SeriesInstanceUID,
  };
}
```

- 2D의 경우: 측정값을 특정 이미지에 연결하기 위해 `referencedImageId` 반환
- 3D의 경우: 측정값을 볼륨에 연결하기 위해 `FrameOfReferenceUID` 반환

---

## 5. SR Annotation 렌더링

### 위치
[extensions/cornerstone-dicom-sr/src/utils/addSRAnnotation.ts](../extensions/cornerstone-dicom-sr/src/utils/addSRAnnotation.ts)

### 함수
`addSRAnnotation({ measurement, imageId, frameNumber, displaySet })`

hydration 후 각 SR 측정값은 Cornerstone Annotation으로 변환됩니다:

#### Step 1: 도구 이름 해결 (Lines 49-85)
```typescript
let toolName = toolNames.DICOMSRDisplay; // 2D/스택의 기본값

if (valueType === 'SCOORD3D' && TrackingIdentifier) {
  const toolNameMatch = TrackingIdentifier.match(/:(.+)$/);
  if (toolNameMatch) {
    const extractedToolName = toolNameMatch[1];
    if (extractedToolName === 'Length' || 'EllipticalROI' || etc.) {
      toolName = extractedToolName; // 3D는 원래 도구 이름 사용
    }
  }
}
```

- 3D 측정값: 적절한 렌더링을 위해 원래 도구 이름 사용 (Length, EllipticalROI 등)
- 2D 측정값: 읽기 전용 표시를 위해 DICOMSRDisplay 도구 사용

#### Step 2: 렌더링 가능한 데이터 추출 (Lines 91-95)
```typescript
const renderableData = measurement.coords.reduce((acc, coordProps) => {
  acc[coordProps.GraphicType] = acc[coordProps.GraphicType] || [];
  acc[coordProps.GraphicType].push(getRenderableData({ ...coordProps, imageId }));
  return acc;
}, {});
```

- `getRenderableData()`를 호출하여 SCOORD/SCOORD3D 좌표를 pixel/world 포인트로 변환

#### Step 3: Annotation 생성 (Lines 150-200+)
```typescript
const annotation: Types.Annotation = {
  annotationUID: TrackingUniqueIdentifier,
  metadata: {
    clinical: measurement.metadata?.clinical, // AI 분석 데이터 (echo_pattern, shape 등)
    referencedImageId: imageId,
    ...
  },
  data: {
    handles: graphicTypePoints,
    label: measurement.labels?.[0]?.value,
    ...
  },
  state: 'completed',
};

annotation.addAnnotation(annotation);
```

Cornerstone Annotation 객체 생성:
- **metadata.clinical**: SR clinical 데이터 포함 (echo_pattern, shape, orientation, margin)
- **data.handles**: Pixel/world 좌표
- referencedImageId를 통해 소스 이미지에 연결

---

## 6. MeasurementService 저장 및 Panel 표시

### 위치
[platform/core/src/services/MeasurementService/MeasurementService.ts](../platform/core/src/services/MeasurementService/MeasurementService.ts)

### 함수
`addRawMeasurement(source, annotationType, data, toMeasurementSchema, dataSource)`

#### 저장 (Lines 395-450)
```typescript
addRawMeasurement(source, annotationType, data, toMeasurementSchema, dataSource = {}) {
  const measurement = toMeasurementSchema(data, displaySet);
  const measurementUID = guid();

  this.measurements.set(measurementUID, {
    uid: measurementUID,
    source,
    annotationType,
    ...measurement,
    metadata: {
      clinical: data.annotation?.metadata?.clinical, // SR clinical 데이터 전달
      ...
    }
  });

  this.publish(this.EVENTS.MEASUREMENT_ADDED, {
    measurement: this.measurements.get(measurementUID),
  });
}
```

- 내부 `measurements` Map에 측정값 저장
- `toMeasurementSchema()` 함수를 통해 Cornerstone annotation을 OHIF 측정값 스키마로 변환
- **중요**: SR annotation의 `metadata.clinical` 필드 보존
- `MEASUREMENT_ADDED` 이벤트 게시

#### Panel 등록
```typescript
rightPanels: [cornerstone.measurements], // modes/usmpr/src/index.tsx에서
```

- USMPR mode는 `cornerstone.measurements`를 오른쪽 패널로 구성
- 이 패널은 MeasurementService의 모든 측정값을 표시

---

## 7. Measurement Panel 표시

### 위치
[extensions/measurement-tracking/src/panels/PanelMeasurementTableTracking.tsx](../extensions/measurement-tracking/src/panels/PanelMeasurementTableTracking.tsx)

### 컴포넌트
`PanelMeasurementTableTracking`

#### 데이터 흐름 (Lines 19-113)
```typescript
function PanelMeasurementTableTracking(props) {
  const { measurementService } = servicesManager.services;

  const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements();
  const { trackedStudy, trackedSeries } = trackedMeasurements.context;

  // 추적된 시리즈를 기반으로 측정값 필터링
  const measurementFilter = trackedStudy
    ? filterMeasurementsBySeriesUID(trackedSeries)
    : filterAny;

  return (
    <PanelMeasurement
      measurementFilter={measurementFilter}
      emptyComponent={EmptyComponent}
    >
      <StudyMeasurements grouping={props.grouping}>
        <MeasurementsOrAdditionalFindings
          measurementFilter={measurementFilter}
          actions={actions}
        />
      </StudyMeasurements>
    </PanelMeasurement>
  );
}
```

**주요 서브 컴포넌트**:
1. **`PanelMeasurement`**: 공통 UI로 측정값 테이블 래핑
2. **`StudyMeasurements`**: 스터디별로 측정값 그룹화
3. **`MeasurementTable`**: 실제 측정값 행 렌더링
   - 표시: 레이블, 값, 도구 이름, 참조 이미지
   - 클릭하여 측정값 위치로 이동 가능
   - MeasurementService.measurements에서 측정값 표시

---

## 8. USMPR Report를 위한 SR 데이터 추출

### 위치
[modes/usmpr/src/index.tsx:1769-1826](../modes/usmpr/src/index.tsx#L1769-L1826)

### 함수
`extractFromMetadata(measurement, fieldName)`

USMPR mode는 report 생성을 위해 SR clinical 데이터를 추출하는 특수 로직을 가지고 있습니다:

```typescript
function extractFromMetadata(measurement, fieldName) {
  // SR clinical 데이터를 찾기 위한 우선순위:

  // 1. metadata.clinical 확인 (SR이 AI 분석을 여기에 저장)
  if (measurement.metadata?.clinical?.[fieldName] !== undefined) {
    const rawValue = measurement.metadata.clinical[fieldName];
    return convertValue(rawValue); // 숫자 → 텍스트 변환
  }

  // 2. metadata 객체 확인
  if (measurement.metadata?.[fieldName] !== undefined) {
    return convertValue(measurement.metadata[fieldName]);
  }

  // 3. finding 객체 확인
  if (measurement.finding?.[fieldName] !== undefined) {
    return convertValue(measurement.finding[fieldName]);
  }

  // 4. data 객체 확인 (SR annotations)
  if (measurement.data?.[fieldName] !== undefined) {
    return convertValue(measurement.data[fieldName]);
  }

  // 5. 최상위 레벨 확인
  if (measurement[fieldName] !== undefined) {
    return convertValue(measurement[fieldName]);
  }

  // 6. findingSites 확인 (DICOM SR 기능)
  if (measurement.findingSites?.length) {
    return extractFromFindingSites(measurement.findingSites);
  }
}
```

**지원되는 Clinical 필드**:
- `echo_pattern`: 1→"hypoechoic", 2→"hyperechoic" 등
- `shape`: 1→"oval", 2→"irregular" 등
- `orientation`: is_parallel 플래그 또는 기하학 기반
- `margin`: 1→"circumscribed", 2→"indistinct" 등
- `malignancy_max`, `malignancy_avg`: AI 신뢰도 점수

---

## 9. 전체 데이터 흐름 다이어그램

```
[SR DICOM 파일 로드됨]
       ↓
[SOP Class Handler 인식]
       ├─> SOP Class UID 88.11/22/33/34
       └─> _getDisplaySetsFromSeries()가 SR DisplaySet 생성
            ├─> Modality: 'SR'
            ├─> load() 메서드 등록
            └─> isLoaded: false

[USMPR Mode 초기화]
       ↓
[loadSRDisplaySets() 호출 (Line 1581)]
       ├─> 모든 SR displaySet 찾기
       ├─> srDisplaySet.load() 호출
       │    └─> _load() 함수
       │         ├─> Bulk data 검색
       │         ├─> _getMeasurements() - ContentSequence 파싱
       │         ├─> _getReferencedImagesList()
       │         └─> Active DisplaySet과 비교
       └─> 뷰포트 재렌더링 트리거

[참조된 각 이미지 DisplaySet에 대해]
       ↓
[_checkIfCanAddMeasurementsToDisplaySet()]
       ├─> _measurementBelongsToDisplaySet()?
       │    ├─> FrameOfReferenceUID로 매칭 (3D)
       │    ├─> SOPInstanceUID로 매칭 (2D)
       │    └─> 폴백: StudyInstanceUID
       └─> YES → HangingProtocolService 이벤트 발생

[SR Hydration 트리거]
       ↓
[hydrateStructuredReport() 호출]
       ├─> Phase 1: MeasurementService에서 매핑 가져오기
       ├─> Phase 2: MeasurementReport.generateToolState()
       │    └─> DICOM SR → Cornerstone ToolState 변환
       ├─> Phase 3: 커스터마이제이션 훅 적용
       ├─> Phase 4: hydration 가능한 측정값 필터링
       └─> Phase 5: 각 측정값에 대해 getReferenceData() 호출
            ├─> 2D: imageId에 매핑
            └─> 3D: volumeId/FrameOfReferenceUID에 매핑

[각 측정값에 대해]
       ↓
[addSRAnnotation()]
       ├─> 도구 이름 해결
       ├─> 렌더링 가능한 데이터 가져오기 (pixel/world 좌표)
       ├─> Annotation 객체 생성
       │    ├─> annotation.metadata.clinical = SR clinical 데이터
       │    ├─> annotation.data.handles = 좌표
       │    └─> annotation.state = 'completed'
       └─> annotation.addAnnotation()

[MeasurementService.addRawMeasurement()]
       ├─> annotation을 measurement 스키마로 변환
       ├─> measurements Map에 저장
       ├─> metadata.clinical 보존
       └─> MEASUREMENT_ADDED 이벤트 게시

[Measurement Panel 표시]
       ├─> useTrackedMeasurements() 훅 (Context)
       ├─> measurementFilter (추적된 시리즈별)
       └─> PanelMeasurementTableTracking 렌더링:
            ├─> MeasurementTable (값이 있는 행)
            ├─> Study/Series 그룹화
            └─> 액션 (SR 생성, 추적 해제)

[USMPR Report 생성]
       ├─> 명령: openSRReportPage
       ├─> 모든 측정값 추출
       ├─> 각 측정값에 대해 extractFromMetadata() 호출
       │    ├─> metadata.clinical 먼저 확인
       │    ├─> convertValue() - 숫자 → 텍스트
       │    └─> report 행 생성
       └─> platform/app/public/report.html에 표시
```

---

## 10. 주요 통합 포인트

| 컴포넌트 | 역할 | 위치 |
|----------|------|------|
| **SR Extension** | SR 파싱, 측정값 추출, hydration | [extensions/cornerstone-dicom-sr/](../extensions/cornerstone-dicom-sr/) |
| **USMPR Mode** | SR displaySet 로드, clinical 데이터 추출 | [modes/usmpr/src/index.tsx](../modes/usmpr/src/index.tsx) |
| **MeasurementService** | PubSub을 사용한 중앙 측정값 저장소 | [platform/core/src/services/MeasurementService/](../platform/core/src/services/MeasurementService/) |
| **Measurement Panel** | MeasurementService의 측정값 표시 | [extensions/measurement-tracking/src/panels/](../extensions/measurement-tracking/src/panels/) |
| **Cornerstone Viewport** | 이미지에 annotation 렌더링 | [extensions/cornerstone/](../extensions/cornerstone/) |
| **Report HTML** | 추출된 SR clinical 데이터 표시 | [platform/app/public/report.html](../platform/app/public/report.html) |

---

## 11. 필터링 및 선택 로직

### 현재 Viewport 기반 필터링 (코드 분석 결과):
- **MeasurementService**는 **모든** 측정값을 포함 (자동 필터링 없음)
- **PanelMeasurementTableTracking**은 `trackedSeries`를 기반으로 `measurementFilter` 적용
- **Viewport 렌더링**은 현재 이미지/볼륨에 대한 annotation만 표시

### USMPR 특정 필터링을 위한 제안:
다음을 추가하여 viewport 기반 필터링 구현 가능:
- `viewportGridService.activeViewportId` 확인
- Active viewport를 표시된 DisplaySet에 매핑
- 일치하는 `referencedImageId` 또는 `SeriesInstanceUID`로 MeasurementService.measurements 필터링

---

## 12. 핵심 발견사항

### 12.1 모든 SR이 로드되는 이유
[modes/usmpr/src/index.tsx:1543-1565](../modes/usmpr/src/index.tsx#L1543-L1565)의 `loadSRDisplaySets()` 함수는:
```typescript
const srDisplaySets = allDisplaySets.filter(ds =>
  ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
);
```
- **스터디의 모든 SR DisplaySet**을 필터링합니다
- 현재 viewport나 series에 대한 필터링 없음
- 각 SR에 대해 `load()`를 호출하면 모든 측정값이 MeasurementService에 추가됨

### 12.2 Measurement Panel 표시 로직
[extensions/measurement-tracking/src/panels/PanelMeasurementTableTracking.tsx](../extensions/measurement-tracking/src/panels/PanelMeasurementTableTracking.tsx):
- `trackedSeries`를 기반으로 필터링하지만
- USMPR mode에서는 모든 series가 추적될 수 있어 모든 측정값이 표시됨

### 12.3 수정이 필요한 영역

현재 viewport의 series에 해당하는 SR만 로드하려면:

1. **`loadSRDisplaySets()` 함수 수정** ([modes/usmpr/src/index.tsx](../modes/usmpr/src/index.tsx))
   - 현재 active viewport의 DisplaySet 가져오기
   - SR을 현재 series와 매칭 (SeriesInstanceUID 또는 FrameOfReferenceUID)
   - 매칭되는 SR만 로드

2. **Viewport 변경 리스너 추가**
   - `ViewportGridService` 구독하여 viewport 변경 감지
   - Viewport 변경 시 해당 series의 SR만 재로드

3. **MeasurementService 필터링 로직**
   - 패널 표시 시 현재 viewport의 series에 속한 측정값만 표시
   - `measurementFilter` 함수 커스터마이징

---

## 13. 다음 단계

이 분석을 기반으로 다음과 같은 수정 작업을 계획할 수 있습니다:

1. **현재 viewport의 DisplaySet 식별 로직 구현**
2. **SR-Series 매칭 로직 개선**
3. **loadSRDisplaySets() 함수에 필터링 추가**
4. **Viewport 변경 시 SR 동적 로드/언로드**

---

**문서 작성일**: 2026-01-20
**기반 코드 버전**: OHIF v3.12.0-beta based {M-VIEW-WEB V2}
