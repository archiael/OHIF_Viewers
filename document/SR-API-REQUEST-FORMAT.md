# SR DICOM 생성 가이드 (Python SR Server)

> **이 문서는 소스 코드를 직접 검증하여 작성되었습니다.**
> - 클라이언트 전송 코드: `extensions/cornerstone-dicom-sr/src/commandsModule.ts` (exportToPythonSRServer)
> - SR 파싱 코드: `node_modules/@cornerstonejs/adapters/dist/esm/adapters/Cornerstone3D/MeasurementReport.js`
> - 각 도구 adapter: `Length.js`, `EllipticalROI.js`, `CircleROI.js`, `ArrowAnnotate.js`
> - 좌표 변환: `scoordToWorld.js`, `BaseAdapter3D.js`

---

## 목차

1. [전체 흐름 요약](#1-전체-흐름-요약)
2. [클라이언트 → Python 서버 JSON 형식](#2-클라이언트--python-서버-json-형식)
3. [Python 서버가 생성해야 하는 SR DICOM 구조](#3-python-서버가-생성해야-하는-sr-dicom-구조)
4. [도구별 상세 스펙](#4-도구별-상세-스펙)
5. [SR 파싱 흐름 상세 (클라이언트가 SR을 읽는 방법)](#5-sr-파싱-흐름-상세)
6. [주의사항 및 트러블슈팅](#6-주의사항-및-트러블슈팅)

---

## 1. 전체 흐름 요약

```
[사용자가 OHIF에서 측정 도구 사용]
        │
        ▼
[CreateSR 버튼 클릭]
        │
        ▼
[클라이언트: exportToPythonSRServer()]
  - 측정값을 JSON으로 변환
  - POST /api/v1/dicom/sr 로 전송
        │
        ▼
[Python 서버: SR DICOM 생성]
  - JSON → DICOM SR (TID 1500) 변환
  - PACS에 저장 (C-STORE 또는 STOW-RS)
        │
        ▼
[OHIF에서 스터디 재로드]
        │
        ▼
[클라이언트: SR DisplaySet 발견 → hydrateStructuredReport()]
  - MeasurementReport.generateToolState() 호출
  - SR DICOM → annotation toolState 변환
  - MeasurementService에 등록 → Measurement Panel에 표시
```

---

## 2. 클라이언트 → Python 서버 JSON 형식

> 소스: `commandsModule.ts` 라인 450-456

### 2.1. 요청 전체 구조

```
POST /api/v1/dicom/sr
Content-Type: application/json
```

```json
{
  "studyInstanceUID": "1.2.840.113619.2.55.3...",
  "seriesInstanceUID": "1.2.840.113619.2.55.3...",
  "patientID": "PATIENT001",
  "patientName": "Hong^GilDong",
  "measurements": [
    { ... },
    { ... }
  ]
}
```

### 2.2. measurements 배열 항목 구조

> 소스: `commandsModule.ts` 라인 429-437

```json
{
  "uid": "annot-uuid-1234-5678",
  "toolName": "Length",
  "label": null,
  "type": "Length",
  "points": [
    [102.5, -45.3, 12.7],
    [115.8, -42.1, 12.7]
  ],
  "data": {
    "length": 14.52,
    "unit": "mm"
  },
  "metadata": {
    "referencedImageId": "wadors:https://...",
    "FrameOfReferenceUID": "1.2.840.113619...",
    "SOPInstanceUID": "1.2.840.113619...",
    "SOPClassUID": "1.2.840.10008.5.1.4.1.1.2",
    "ImageOrientationPatient": [1, 0, 0, 0, 1, 0],
    "ImagePositionPatient": [-125.0, -125.0, 50.0],
    "PixelSpacing": [0.5, 0.5],
    "SliceThickness": 2.5,
    "Rows": 512,
    "Columns": 512
  }
}
```

### 2.3. 도구별 points / data 차이

| toolName | points 개수 | points 의미 | data |
|---|---|---|---|
| `Length` | 2개 | 시작점, 끝점 | `{length: number, unit: "mm"}` |
| `EllipticalROI` | 4개 | 아래 상세 참조 | `null` (클라이언트가 전송 안함) |
| `CircleROI` | 2개 | 중심점, 가장자리점 | `null` (클라이언트가 전송 안함) |
| `ArrowAnnotate` | 2개 | 화살표 끝점, 꼬리점 | `null` (클라이언트가 전송 안함) |

> 소스: `commandsModule.ts` 라인 396-397 — `annotationOnlyTools = ['ArrowAnnotate', 'CircleROI', 'EllipticalROI']`

### 2.4. points 좌표계

모든 points는 **3D world 좌표** (LPS 좌표계, 단위: mm)입니다.
각 point는 `[x, y, z]` 형식의 배열입니다.

---

## 3. Python 서버가 생성해야 하는 SR DICOM 구조

### 3.1. 필수 최상위 태그

```
SOPClassUID: "1.2.840.10008.5.1.4.1.1.88.34"  (Comprehensive 3D SR)
  ※ SCOORD3D를 사용하는 경우 반드시 Comprehensive 3D SR이어야 함
  ※ SCOORD만 사용하면 "1.2.840.10008.5.1.4.1.1.88.33" (Comprehensive SR) 가능

Modality: "SR"
```

### 3.2. ContentTemplateSequence (필수!)

> 소스: `MeasurementReport.js` 라인 413
> ```javascript
> if (dataset.ContentTemplateSequence.TemplateIdentifier !== '1500') {
>   throw new Error('This package can currently only interpret DICOM SR TID 1500');
> }
> ```

**이 태그가 없거나 TemplateIdentifier가 '1500'이 아니면 파싱이 즉시 실패합니다.**

```
ContentTemplateSequence:
  TemplateIdentifier: "1500"
  MappingResource: "DCMR"
```

### 3.3. 전체 SR 트리 구조

```
dataset (SR 인스턴스)
│
├── ContentTemplateSequence
│   ├── TemplateIdentifier: "1500"          ← 필수 (라인 413)
│   └── MappingResource: "DCMR"
│
├── ValueType: "CONTAINER"
├── ConceptNameCodeSequence:
│   ├── CodeValue: "126000"
│   ├── CodingSchemeDesignator: "DCM"
│   └── CodeMeaning: "Imaging Measurement Report"
│
└── ContentSequence: [                      ← 배열
      {
        ValueType: "CONTAINER"
        ConceptNameCodeSequence:
          CodeMeaning: "Imaging Measurements"   ← 필수 (라인 423)
          CodeValue: "126010"
          CodingSchemeDesignator: "DCM"
        ContentSequence: [                  ← Measurement Group 배열
          {
            ValueType: "CONTAINER"
            ConceptNameCodeSequence:
              CodeMeaning: "Measurement Group"  ← 필수 (라인 424)
              CodeValue: "125007"
              CodingSchemeDesignator: "DCM"
            ContentSequence: [              ← 개별 측정 항목들
              ... (아래 3.4 상세)
            ]
          },
          { ... 다음 Measurement Group ... }
        ]
      }
    ]
```

### 3.4. Measurement Group 내부 ContentSequence 구조

각 Measurement Group 안의 ContentSequence에는 다음 항목들이 필요합니다:

```
ContentSequence: [

  ── (1) Tracking Identifier (필수) ──
  {
    ValueType: "TEXT"
    ConceptNameCodeSequence:
      CodeValue: "112039"
      CodingSchemeDesignator: "DCM"
      CodeMeaning: "Tracking Identifier"    ← 필수 (라인 429)
    TextValue: "Cornerstone3DTools@^0.1.0:Length"  ← 도구별 값 (라인 431)
  },

  ── (2) Tracking Unique Identifier (필수) ──
  {
    ValueType: "UIDREF"
    ConceptNameCodeSequence:
      CodeValue: "112040"
      CodingSchemeDesignator: "DCM"
      CodeMeaning: "Tracking Unique Identifier"  ← 필수 (라인 433)
    UID: "2.25.xxxx..."                       ← 고유 UID (라인 434)
  },

  ── (3) Finding (선택, 권장) ──
  {
    ValueType: "CODE"
    ConceptNameCodeSequence:
      CodeValue: "121071"                     ← FINDING 매칭 (라인 35-38)
      CodingSchemeDesignator: "DCM"
      CodeMeaning: "Finding"
    ConceptCodeSequence:
      CodeValue: "xxxxx"
      CodingSchemeDesignator: "SCT"
      CodeMeaning: "측정 라벨 텍스트"
  },

  ── (4) Finding Site (선택) ──
  {
    ValueType: "CODE"
    ConceptNameCodeSequence:
      CodeValue: "363698007"                  ← FINDING_SITE 매칭 (라인 47-50)
      CodingSchemeDesignator: "SCT"
      CodeMeaning: "Finding Site"
    ConceptCodeSequence:
      CodeValue: "xxxxx"
      CodingSchemeDesignator: "SCT"
      CodeMeaning: "부위명"
  },

  ── (5) SCOORD3D 좌표 (필수 - 방법 A: NUM 없이 직접 배치) ──
  {
    ValueType: "SCOORD3D"
    GraphicType: "POLYLINE"                   ← 도구별 값 (아래 섹션 4 참조)
    GraphicData: [x1,y1,z1, x2,y2,z2, ...]   ← flat 배열 (world 좌표)
    ReferencedFrameOfReferenceUID: "1.2.840..."  ← 필수 (라인 153)
  }

  ── 또는 (5-alt) NUM + SCOORD3D (선택 - 측정값이 있는 경우) ──
  {
    ValueType: "NUM"
    ConceptNameCodeSequence:
      CodeMeaning: "Length"                   (또는 "Area" 등)
    MeasuredValueSequence:
      NumericValue: 14.52                     ← 측정값
      MeasurementUnitsCodeSequence:
        CodeValue: "mm"
        CodingSchemeDesignator: "UCUM"
        CodeMeaning: "mm"
    ContentSequence: [
      {
        ValueType: "SCOORD3D"
        GraphicType: "POLYLINE"
        GraphicData: [x1,y1,z1, x2,y2,z2, ...]
        ReferencedFrameOfReferenceUID: "1.2.840..."
      }
    ]
  }

]
```

### 3.5. SCOORD3D 배치 위치: NUM 안 vs 밖

어댑터는 두 가지 경우 모두 처리합니다:

> 소스: `MeasurementReport.js` 라인 276-278
> ```javascript
> const NUMGroup = contentSequenceArr.find(group => group.ValueType === 'NUM') || {
>   ContentSequence: contentSequenceArr.filter(
>     group => group.ValueType === 'SCOORD' || group.ValueType === 'SCOORD3D'
>   )
> };
> ```

**방법 A (간단, 권장)**: SCOORD3D를 Measurement Group의 ContentSequence에 직접 배치
- NUM 그룹이 없으면 어댑터가 자동으로 SCOORD3D 항목을 찾아서 처리
- 측정값(length, area)은 0으로 설정됨

**방법 B (완전)**: NUM 그룹 안에 SCOORD3D를 중첩 배치
- NUM 그룹의 `MeasuredValueSequence.NumericValue`에 측정값 포함
- `NUM.ContentSequence` 안에 SCOORD3D 배치

### 3.6. GraphicData 형식 (SCOORD3D)

> 소스: `scoordToWorld.js` 라인 12-19
> ```javascript
> if (is3DMeasurement) {
>   const { GraphicData } = scoord;
>   for (let i = 0; i < GraphicData.length; i += 3) {
>     const point = [GraphicData[i], GraphicData[i + 1], GraphicData[i + 2]];
>     worldCoords.push(point);
>   }
> }
> ```

- **SCOORD3D**: flat 배열, 3개씩 묶음 → `[x1, y1, z1, x2, y2, z2, ...]`
- 값은 **world 좌표 (LPS, mm 단위)** 그대로 사용
- 클라이언트가 보내는 `points` 배열의 `[x,y,z]`를 펼쳐서 넣으면 됨

예시 (Length, 2개 점):
```
클라이언트 points: [[102.5, -45.3, 12.7], [115.8, -42.1, 12.7]]
GraphicData:        [102.5, -45.3, 12.7,   115.8, -42.1, 12.7]
```

---

## 4. 도구별 상세 스펙

### 4.1. Length (길이 측정)

> 소스: `Length.js` 라인 13-36 (getMeasurementData), 라인 38-71 (getTID300RepresentationArguments)

| 항목 | 값 |
|---|---|
| **Tracking Identifier** | `Cornerstone3DTools@^0.1.0:Length` |
| **GraphicType** | `POLYLINE` |
| **포인트 수** | 2개 (시작점, 끝점) |
| **GraphicData 길이** | 6 (= 2점 x 3좌표) |
| **측정값** | 길이 (mm) — `MeasuredValueSequence.NumericValue` |

**GraphicData 순서**:
```
[startX, startY, startZ, endX, endY, endZ]
```

**어댑터 읽기 동작** (getMeasurementData):
```javascript
// worldCoords[0] → handles.points[0] (시작점)
// worldCoords[1] → handles.points[1] (끝점)
handles.points = [worldCoords[0], worldCoords[1]];
cachedStats = { length: NUMGroup.MeasuredValueSequence.NumericValue || 0 };
```

**클라이언트 JSON → SR 변환 예시**:
```
클라이언트 JSON:
  toolName: "Length"
  points: [[102.5, -45.3, 12.7], [115.8, -42.1, 12.7]]
  data: { length: 14.52, unit: "mm" }

SR DICOM:
  Tracking Identifier TextValue: "Cornerstone3DTools@^0.1.0:Length"
  SCOORD3D:
    GraphicType: "POLYLINE"
    GraphicData: [102.5, -45.3, 12.7, 115.8, -42.1, 12.7]
    ReferencedFrameOfReferenceUID: (metadata.FrameOfReferenceUID)
  NUM (선택):
    NumericValue: 14.52
    Unit: "mm"
```

---

### 4.2. EllipticalROI (타원)

> 소스: `EllipticalROI.js` 라인 12-33 (getMeasurementData), 라인 35-88 (getTID300RepresentationArguments)
> 도구 소스: `node_modules/@cornerstonejs/tools/.../EllipticalROITool.js` 라인 274-287

| 항목 | 값 |
|---|---|
| **Tracking Identifier** | `Cornerstone3DTools@^0.1.0:EllipticalROI` |
| **GraphicType** | `ELLIPSE` |
| **포인트 수** | 4개 (장축 끝점 2개 + 단축 끝점 2개) |
| **GraphicData 길이** | 12 (= 4점 x 3좌표) |
| **측정값** | 면적 — `MeasuredValueSequence.NumericValue` (선택, 없으면 0) |

**GraphicData 순서 (중요!)**:

> 소스: `EllipticalROI.js` 라인 70-74 (getTID300RepresentationArguments)
> ```javascript
> if (topBottomLength > leftRightLength) {
>   points.push(top, bottom, left, right);  // 세로 장축
> } else {
>   points.push(left, right, top, bottom);  // 가로 장축
> }
> ```

SR에 저장되는 순서: **장축 끝점1, 장축 끝점2, 단축 끝점1, 단축 끝점2**

```
GraphicData: [majorEnd1_x, majorEnd1_y, majorEnd1_z,
              majorEnd2_x, majorEnd2_y, majorEnd2_z,
              minorEnd1_x, minorEnd1_y, minorEnd1_z,
              minorEnd2_x, minorEnd2_y, minorEnd2_z]
```

**어댑터 읽기 동작** (getMeasurementData):
```javascript
// GraphicData → worldCoords (4개 점)
// 직접 handles.points에 할당
handles.points = worldCoords;  // [point0, point1, point2, point3]
cachedStats = { area: NUMGroup.MeasuredValueSequence.NumericValue || 0 };
```

읽을 때는 worldCoords가 그대로 handles.points가 됩니다.
도구는 points[0]과 points[1]을 한 축으로, points[2]와 points[3]을 다른 축으로 사용합니다.

**클라이언트가 보내는 points 순서**:

> 도구 소스: `EllipticalROITool.js` 라인 274-287
> ```javascript
> points[0] = canvasToWorld(canvasBottom);  // 아래
> points[1] = canvasToWorld(canvasTop);     // 위
> points[2] = canvasToWorld(canvasLeft);    // 왼쪽
> points[3] = canvasToWorld(canvasRight);   // 오른쪽
> ```

클라이언트 points: `[bottom, top, left, right]`

**Python 서버 변환 규칙**:

클라이언트에서 받은 4개 점을 SR에 넣을 때, 장축/단축 판별이 필요합니다:

```python
# 클라이언트 points: [bottom, top, left, right]
bottom, top, left, right = points[0], points[1], points[2], points[3]

vertical_length = distance(top, bottom)
horizontal_length = distance(left, right)

if vertical_length > horizontal_length:
    # 세로가 장축
    graphic_data = flatten([top, bottom, left, right])
else:
    # 가로가 장축
    graphic_data = flatten([left, right, top, bottom])
```

또는 **간단한 방법**: 클라이언트가 보내는 순서 그대로 넣어도 동작합니다.
어댑터가 읽을 때 `handles.points = worldCoords` 로 그대로 복원하기 때문입니다.

```python
# 간단 방법: 클라이언트 순서 그대로
graphic_data = flatten(points)  # [bottom_x,y,z, top_x,y,z, left_x,y,z, right_x,y,z]
```

단, GraphicType은 `ELLIPSE`로 설정해야 합니다.

---

### 4.3. CircleROI (원)

> 소스: `CircleROI.js` 라인 12-37 (getMeasurementData), 라인 39-76 (getTID300RepresentationArguments)

| 항목 | 값 |
|---|---|
| **Tracking Identifier** | `Cornerstone3DTools@^0.1.0:CircleROI` |
| **GraphicType** | `CIRCLE` |
| **포인트 수** | 2개 (중심점, 가장자리점) |
| **GraphicData 길이** | 6 (= 2점 x 3좌표) |
| **측정값** | 면적 — `MeasuredValueSequence.NumericValue` (선택, 없으면 0) |

**GraphicData 순서**:

> 소스: `CircleROI.js` 라인 58-59
> ```javascript
> const center = toScoord(scoordProps, handles.points[0]);
> const end = toScoord(scoordProps, handles.points[1]);
> return { points: [center, end], ... };
> ```

```
GraphicData: [centerX, centerY, centerZ, edgeX, edgeY, edgeZ]
```

**어댑터 읽기 동작** (getMeasurementData):
```javascript
handles.points = worldCoords;  // [center, edgePoint]
cachedStats = { area: NumericValue || 0, radius: 0, perimeter: 0 };
```

---

### 4.4. ArrowAnnotate (화살표 주석)

> 소스: `ArrowAnnotate.js` 라인 15-52 (getMeasurementData), 라인 54-88 (getTID300RepresentationArguments)

| 항목 | 값 |
|---|---|
| **Tracking Identifier** | `Cornerstone3DTools@^0.1.0:ArrowAnnotate` |
| **GraphicType** | `POINT` |
| **포인트 수** | 1개 또는 2개 |
| **GraphicData 길이** | 3 또는 6 |
| **측정값** | 없음 |

**GraphicData 순서**:

> 소스: `ArrowAnnotate.js` 라인 75-80
> ```javascript
> const point = arrowFirst ? points[0] : points[1];   // 화살표 끝 (arrowFirst=true)
> const point2 = arrowFirst ? points[1] : points[0];  // 화살표 꼬리
> return { points: [pointImage, pointImage2], ... };
> ```

```
GraphicData: [arrowTipX, arrowTipY, arrowTipZ, arrowTailX, arrowTailY, arrowTailZ]
```

**텍스트 라벨**:
ArrowAnnotate의 텍스트는 Finding의 `ConceptCodeSequence.CodeMeaning`에서 복원됩니다.

> 소스: `MeasurementReport.js` 라인 248-251
> ```javascript
> if (finding) {
>   state.description = finding.CodeMeaning;
> }
> state.annotation.data.label = this.getCornerstoneLabelFromDefaultState(state);
> ```

따라서 ArrowAnnotate의 라벨 텍스트를 보존하려면, Finding 항목의 `ConceptCodeSequence.CodeMeaning`에 텍스트를 넣어야 합니다.

---

## 5. SR 파싱 흐름 상세

> 소스: `MeasurementReport.js` generateToolState (라인 412-450)

### 5.1. 파싱 단계

```
Step 1: ContentTemplateSequence.TemplateIdentifier === "1500" 확인 (라인 413)
   └── 실패 시 throw Error

Step 2: ContentSequence에서 CodeMeaning === "Imaging Measurements" 찾기 (라인 423)
   └── codeMeaningEquals 헬퍼 사용
   └── ConceptNameCodeSequence.CodeMeaning으로 매칭

Step 3: 그 안의 ContentSequence에서 CodeMeaning === "Measurement Group" 필터 (라인 424)

Step 4: 각 Measurement Group에서: (라인 426-448)
   ├── 4a. CodeMeaning === "Tracking Identifier" 찾기 → TextValue 읽기 (라인 429-431)
   ├── 4b. CodeMeaning === "Tracking Unique Identifier" 찾기 → UID 읽기 (라인 433-434)
   ├── 4c. Tracking Identifier 값으로 도구 adapter 매칭 (라인 435)
   │   └── "Cornerstone3DTools@^0.1.0:Length" → Length adapter
   │   └── "Cornerstone3DTools@^0.1.0:EllipticalROI" → EllipticalROI adapter
   │   └── etc.
   └── 4d. adapter.getMeasurementData() 호출 (라인 437)
```

### 5.2. Tracking Identifier 매칭 규칙

> 소스: `BaseAdapter3D.js` 라인 52-68 (init), 라인 81-89 (isValidCornerstoneTrackingIdentifier)
> 소스: `cornerstone3DTag.js` — `CORNERSTONE_3D_TAG = 'Cornerstone3DTools@^0.1.0'`

```javascript
// init에서 설정
trackingIdentifierTextValue = CORNERSTONE_3D_TAG + ':' + toolType;
// 예: "Cornerstone3DTools@^0.1.0:Length"

// 매칭 로직
isValidCornerstoneTrackingIdentifier(trackingIdentifier) {
  if (this.trackingIdentifiers.has(trackingIdentifier)) return true;
  if (!trackingIdentifier.includes(':')) return false;
  return trackingIdentifier.startsWith(this.trackingIdentifierTextValue);
}
```

**지원하는 Tracking Identifier 값들**:

| 도구 | Tracking Identifier |
|---|---|
| Length | `Cornerstone3DTools@^0.1.0:Length` |
| EllipticalROI | `Cornerstone3DTools@^0.1.0:EllipticalROI` |
| CircleROI | `Cornerstone3DTools@^0.1.0:CircleROI` |
| ArrowAnnotate | `Cornerstone3DTools@^0.1.0:ArrowAnnotate` |

레거시 호환 (registerLegacy): `cornerstoneTools@^4.0.0:<toolType>` 도 매칭됩니다.

### 5.3. codeMeaningEquals 매칭 규칙

> 소스: `codeMeaningEquals.js`
> ```javascript
> contentItem => contentItem.ConceptNameCodeSequence.CodeMeaning === codeMeaningName
> ```

**중요**: `ConceptNameCodeSequence`가 **객체** (배열이 아님)로 접근됩니다.
dcmjs가 DICOM JSON을 "naturalize"할 때 단일 항목 시퀀스를 객체로 변환하기 때문입니다.
Python 서버가 생성하는 DICOM에서 `ConceptNameCodeSequence`는 단일 항목 시퀀스여야 합니다.

---

## 6. 주의사항 및 트러블슈팅

### 6.1. ContentTemplateSequence 필수

가장 흔한 실패 원인입니다. 이 태그가 없으면:
```
TypeError: Cannot read properties of undefined (reading 'TemplateIdentifier')
```

DICOMweb 서버가 메타데이터 응답에 이 태그를 포함하는지도 확인해야 합니다.

### 6.2. ConceptNameCodeSequence 구조

DICOM JSON (WADO-RS) 형식에서 시퀀스는 배열입니다:
```json
"ConceptNameCodeSequence": {
  "vr": "SQ",
  "Value": [
    {
      "CodeValue": { "vr": "SH", "Value": ["112039"] },
      "CodingSchemeDesignator": { "vr": "SH", "Value": ["DCM"] },
      "CodeMeaning": { "vr": "LO", "Value": ["Tracking Identifier"] }
    }
  ]
}
```

dcmjs가 이를 naturalize하면:
```json
{
  "ConceptNameCodeSequence": {
    "CodeValue": "112039",
    "CodingSchemeDesignator": "DCM",
    "CodeMeaning": "Tracking Identifier"
  }
}
```

### 6.3. SCOORD3D vs SCOORD 선택

| | SCOORD3D | SCOORD |
|---|---|---|
| 좌표계 | 3D world (LPS, mm) | 2D pixel (col, row) |
| GraphicData 단위 | 3개씩 [x,y,z] | 2개씩 [col,row] |
| SOPClassUID | Comprehensive 3D SR | Comprehensive SR 또는 Enhanced SR |
| 필수 태그 | ReferencedFrameOfReferenceUID | ReferencedSOPSequence |
| 변환 필요 | 없음 (world 좌표 그대로) | world→pixel 변환 필요 |

**권장**: 클라이언트가 world 좌표를 보내므로 **SCOORD3D 사용을 권장**합니다.
SCOORD 사용 시 world→pixel 좌표 변환이 필요하며, ImageOrientationPatient, ImagePositionPatient, PixelSpacing 정보가 필요합니다.

### 6.4. Viewport 제한사항

| 도구 | Stack viewport | Volume (MPR) viewport |
|---|---|---|
| Length | O | O |
| ArrowAnnotate | O | O |
| EllipticalROI | O | X (Stack에서만 그리기 가능) |
| CircleROI | O | X (Stack에서만 그리기 가능) |

### 6.5. 전체 SR DICOM 예시 (Length 1개)

```
# Patient/Study 레벨 태그 (원본 이미지에서 복사)
PatientID: "PATIENT001"
PatientName: "Hong^GilDong"
StudyInstanceUID: "1.2.840..."
StudyDate: "20250101"

# SR 시리즈 태그
SeriesInstanceUID: "2.25.xxxx..."  (새로 생성)
Modality: "SR"
SeriesDescription: "Measurement Report"
SeriesNumber: 9999

# SR 인스턴스 태그
SOPClassUID: "1.2.840.10008.5.1.4.1.1.88.34"  (Comprehensive 3D SR)
SOPInstanceUID: "2.25.yyyy..."  (새로 생성)

# TID 1500 필수 태그
ContentTemplateSequence:
  TemplateIdentifier: "1500"
  MappingResource: "DCMR"

ValueType: "CONTAINER"
ContinuityOfContent: "SEPARATE"
ConceptNameCodeSequence:
  CodeValue: "126000"
  CodingSchemeDesignator: "DCM"
  CodeMeaning: "Imaging Measurement Report"

ContentSequence:
  [0]:  # Imaging Measurements 컨테이너
    ValueType: "CONTAINER"
    ContinuityOfContent: "SEPARATE"
    ConceptNameCodeSequence:
      CodeValue: "126010"
      CodingSchemeDesignator: "DCM"
      CodeMeaning: "Imaging Measurements"
    ContentSequence:
      [0]:  # Measurement Group (Length)
        ValueType: "CONTAINER"
        ContinuityOfContent: "SEPARATE"
        ConceptNameCodeSequence:
          CodeValue: "125007"
          CodingSchemeDesignator: "DCM"
          CodeMeaning: "Measurement Group"
        ContentSequence:
          [0]:  # Tracking Identifier
            ValueType: "TEXT"
            ConceptNameCodeSequence:
              CodeValue: "112039"
              CodingSchemeDesignator: "DCM"
              CodeMeaning: "Tracking Identifier"
            TextValue: "Cornerstone3DTools@^0.1.0:Length"

          [1]:  # Tracking Unique Identifier
            ValueType: "UIDREF"
            ConceptNameCodeSequence:
              CodeValue: "112040"
              CodingSchemeDesignator: "DCM"
              CodeMeaning: "Tracking Unique Identifier"
            UID: "2.25.zzzz..."

          [2]:  # SCOORD3D 좌표 (NUM 없이 직접 배치)
            ValueType: "SCOORD3D"
            GraphicType: "POLYLINE"
            GraphicData: [102.5, -45.3, 12.7, 115.8, -42.1, 12.7]
            ReferencedFrameOfReferenceUID: "1.2.840.113619..."

# Referenced Series/SOP (원본 이미지 참조)
CurrentRequestedProcedureEvidenceSequence:
  StudyInstanceUID: "1.2.840..."
  ReferencedSeriesSequence:
    SeriesInstanceUID: "1.2.840..."
    ReferencedSOPSequence:
      ReferencedSOPClassUID: "1.2.840.10008.5.1.4.1.1.2"
      ReferencedSOPInstanceUID: "1.2.840..."
```

---

## 부록: 소스 코드 참조 위치

| 항목 | 파일 | 라인 |
|---|---|---|
| 클라이언트 전송 코드 | `extensions/cornerstone-dicom-sr/src/commandsModule.ts` | 188-538 |
| SR 파싱 진입점 | `node_modules/@cornerstonejs/adapters/.../MeasurementReport.js` | 412-450 |
| SCOORD3D 처리 | `node_modules/@cornerstonejs/adapters/.../MeasurementReport.js` | 145-177 |
| 좌표 추출 | `node_modules/@cornerstonejs/adapters/.../MeasurementReport.js` | 267-306 |
| 좌표 변환 | `node_modules/@cornerstonejs/adapters/.../helpers/scoordToWorld.js` | 6-30 |
| Tracking ID 태그 | `node_modules/@cornerstonejs/adapters/.../cornerstone3DTag.js` | 1 |
| Tracking ID 매칭 | `node_modules/@cornerstonejs/adapters/.../BaseAdapter3D.js` | 81-89 |
| FINDING 상수 | `node_modules/@cornerstonejs/adapters/.../MeasurementReport.js` | 35-38 |
| FINDING_SITE 상수 | `node_modules/@cornerstonejs/adapters/.../MeasurementReport.js` | 47-50 |
| Length adapter | `node_modules/@cornerstonejs/adapters/.../Cornerstone3D/Length.js` | 13-37 |
| EllipticalROI adapter | `node_modules/@cornerstonejs/adapters/.../Cornerstone3D/EllipticalROI.js` | 12-34 |
| CircleROI adapter | `node_modules/@cornerstonejs/adapters/.../Cornerstone3D/CircleROI.js` | 12-37 |
| ArrowAnnotate adapter | `node_modules/@cornerstonejs/adapters/.../Cornerstone3D/ArrowAnnotate.js` | 15-52 |
| EllipticalROI 포인트 순서 | `node_modules/@cornerstonejs/tools/.../EllipticalROITool.js` | 274-287 |
| SR hydration | `extensions/cornerstone-dicom-sr/src/utils/hydrateStructuredReport.ts` | 46-325 |
