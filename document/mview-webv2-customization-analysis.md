# mView-WebV2 커스터마이징 분석 보고서

## 개요

이 문서는 OHIF Viewer를 기반으로 한 mView-WebV2 프로젝트의 커스텀 변경사항을 Git 로그 기반으로 분석한 내용입니다.

- **분석 기준일**: 2025-12-22
- **분석 대상 브랜치**: `feature/yongminbae`
- **기준 커밋**: `ef98516b4` (OHIF 원본) → `c05cf7833` (최신 커스텀)
- **커스텀 커밋 수**: 약 27개

---

## 커밋 히스토리 요약

```mermaid
gantt
    title mView-WebV2 커스텀 개발 타임라인
    dateFormat  YYYY-MM-DD
    section USMPR 모드
    USMPR 초기 개발           :2025-12-18, 1d
    crosshair 해결            :2025-12-18, 1d
    4V+1S, Sync ALL           :2025-12-21, 1d
    section Volume/MPR
    Level 0/2 디코딩 전략     :2025-12-19, 2d
    Volume 저장 최적화        :2025-12-20, 2d
    3D volume loading 개선    :2025-12-22, 1d
    section 3D Slice Plane
    slice plane in 3D         :2025-12-21, 1d
    수직 평면 문제 해결       :2025-12-22, 1d
    section UI/레이아웃
    Layout config             :2025-12-19, 1d
    resizable handler         :2025-12-22, 1d
```

---

## 주요 변경사항 상세

### 1. USMPR 모드 신규 개발 (핵심 기능)

**관련 커밋:**
- `be8a95b9d` - USMPR 4V+1S, Sync ALL, Semifinal version
- `b1c08ed65` - USMPR cross hair 해결
- `1e97115b4` - USMPR size handle 2->1

**변경 파일:**
- `modes/usmpr/` - 완전히 신규 생성된 모드
- `extensions/default/src/hangingprotocols/hpUSMPR.ts` - 321줄의 신규 Hanging Protocol

**기능 설명:**

USMPR(Ultrasound MPR)은 초음파/CT/MR 영상을 위한 Multi-Planar Reconstruction 뷰어 모드입니다.

```mermaid
graph TB
    subgraph "USMPR 2x2 + 1 레이아웃"
        VP0["mpr-0<br/>Axial"]
        VP1["mpr-1<br/>Sagittal"]
        VP2["mpr-2<br/>Coronal"]
        VP3["mpr-3<br/>3D Volume"]
        VP4["mpr-stack-single<br/>Stack (숨김)"]
    end

    subgraph "구성 파일"
        IDX["index.tsx<br/>(74KB 메인 로직)"]
        HP["hpUSMPR.ts<br/>(Hanging Protocol)"]
        TB["toolbarButtons.ts"]
        LC["LayoutConfigModal.tsx"]
    end

    IDX --> VP0
    IDX --> VP1
    IDX --> VP2
    IDX --> VP3
    HP --> VP4
```

**핵심 기능:**
- **4V+1S 레이아웃**: 4개 Volume viewport + 1개 Stack viewport (토글)
- **Sync ALL**: 모든 viewport 간 동기화
- **사용자 설정 저장**: sessionStorage/localStorage 기반 레이아웃 설정 저장
- **3D 프리셋**: US 3D 전용 Volume Rendering 프리셋

---

### 2. Volume/Stack 디코딩 레벨 전략

**관련 커밋:**
- `500a8e122` - 4 volume(level0) + 1 stack 전략 구현
- `9c04059e0` - axial viewport volume → stack 전환
- `1e788d59b` - Axial은 level 0, MPR은 level 2
- `38f30a9f9` - level2 MPR - axial도 level2

**기술적 배경:**

HTJ2K 코덱의 Progressive Decoding 레벨을 활용한 메모리/성능 최적화:

```mermaid
flowchart LR
    subgraph "디코딩 레벨"
        L0["Level 0<br/>최저 해상도<br/>빠른 로딩"]
        L2["Level 2<br/>고해상도<br/>상세 분석"]
    end

    subgraph "뷰포트 전략"
        MPR["MPR Viewport<br/>Level 2 사용"]
        STACK["Stack Viewport<br/>Level 0 사용"]
    end

    L2 --> MPR
    L0 --> STACK
```

**작동 시퀀스:**

```
1. 사용자가 스터디 로드 → MPR이 Level 2로 초기화
   (volume은 "dicomfile:X" 형태로 캐시)

2. 사용자가 Axial 더블클릭 → STACK viewport 활성화
   - ImageId가 "dicomfile:X?stackView=X"로 변환 (별도 캐시)
   - Decode level이 0으로 설정 (STACK 로드에만 영향)

3. STACK viewport가 변환된 imageId를 Level 0으로 로드
   - 메모리 관리가 ±5 이미지를 Level 0으로 프리페치

4. 사용자가 스크롤 → 먼 STACK 이미지 클리어, 가까운 것 로드

5. 사용자가 STACK 종료 → STACK imageId만 클리어
   - Volume은 그대로 유지!
   - 2×2 MPR이 **즉시** 복원 (volume 재디코딩 없음)
```

---

### 3. 3D Slice Plane 렌더링

**관련 커밋:**
- `c05cf7833` - 3D slice plane 색깔 series 변경 error fix
- `33499f845` - 3D slice 평면이 수직일 때 선이 안보이는 문제 해결
- `774be1d12` - slice plane in 3D
- `078f9d291` - slice plane in 3D debug logging 삭제

**변경 파일:**
- `modes/usmpr/src/utils/SlicePlaneManager.ts`
- `modes/usmpr/src/utils/SlicePlaneSync.ts`

**문제 해결:**

```mermaid
flowchart TB
    subgraph "문제"
        P1["수직 평면일 때 선이 안보임"]
        P2["Series 변경 시 색깔 오류"]
    end

    subgraph "해결책"
        S1["Volume Plane으로 변경"]
        S2["Series 변경 이벤트 핸들링 개선"]
    end

    P1 --> S1
    P2 --> S2
```

---

### 4. 레이아웃 및 UI 개선

**관련 커밋:**
- `b4db703e6` - 초기 50% layout 삭제, resizable handler 보이게
- `badd5c0c0` - sessionStorage, LocalStorage configLayout 설정 가능
- `7dd5dde89` - Layout config 수정, reload 방지
- `a5a42276c` - configure viewport layout -fits on screen 수정

**변경 내용:**

| 항목 | 기존 OHIF | mView 커스텀 |
|------|-----------|--------------|
| 초기 레이아웃 | 50% 분할 | 전체 화면 |
| Resizable Handler | 숨김 | 항상 표시 |
| 레이아웃 설정 저장 | 미지원 | sessionStorage/localStorage 지원 |
| Viewport 전환 | - | 4 viewport ↔ 1 viewport 토글 |

---

### 5. Crosshair 기능 개선

**관련 커밋:**
- `58579e55d` - Cross hair always on 해결
- `b30ed92e9` - cross hair 색깔과 이동성 회복
- `b1c08ed65` - USMPR cross hair 해결

**개선 내용:**
- Crosshair가 항상 표시되도록 수정
- Crosshair 색상 및 이동 기능 복원
- USMPR 모드에서의 Crosshair 동작 안정화

---

### 6. 3D Volume 렌더링 개선

**관련 커밋:**
- `900d83af1` - 3D volume image loading 개선
- `adc4a9310` - 3D volume 보다 잘 보이게 함
- `a70957e95` - MPR 초기 화면 변경 후 volume 저장 안하고 다시 decoding하는 문제 개선

**개선 내용:**
- 3D Volume 이미지 로딩 속도 개선
- Volume 렌더링 품질 향상
- Volume 캐싱 최적화 (불필요한 재디코딩 방지)

---

### 7. 기타 변경사항

| 커밋 | 변경 내용 |
|------|-----------|
| `e57829dfa` | Mview-web 로고 변경 |
| `ccc46f4e0` | 왼쪽 패널 썸네일의 경고 아이콘 삭제 (US ImagePositionPatient) |
| `bd85567a4` | 왼쪽 패널에서 더블클릭으로 Series 로딩 가능 |
| `f843ca616` | 4 viewport ↔ 1 viewport 전환 문제 해결 |
| `a72dd02ea` | testdata 폴더 git 무시 설정 |

---

## 커스텀 파일 구조

```
mview-webv2/
├── modes/
│   └── usmpr/                          # [신규] USMPR 모드
│       ├── src/
│       │   ├── index.tsx               # 메인 모드 로직 (74KB)
│       │   ├── toolbarButtons.ts       # 툴바 버튼 정의
│       │   ├── components/
│       │   │   └── LayoutConfigModal.tsx  # 레이아웃 설정 모달
│       │   └── utils/
│       │       ├── SlicePlaneManager.ts   # 3D Slice Plane 관리
│       │       ├── SlicePlaneSync.ts      # Slice Plane 동기화
│       │       ├── ResizableGridManager.ts # 그리드 크기 조절
│       │       ├── LayoutConfigManager.tsx # 레이아웃 설정 관리
│       │       ├── usVolumePresets.ts     # US Volume 프리셋
│       │       └── usVolumeQuality.ts     # Volume 품질 설정
│       └── package.json
│
├── extensions/
│   ├── default/
│   │   └── src/
│   │       ├── hangingprotocols/
│   │       │   └── hpUSMPR.ts          # [신규] USMPR Hanging Protocol
│   │       ├── commandsModule.ts       # [수정] 명령어 모듈
│   │       └── customizations/
│   │           └── studyBrowserCustomization.ts  # [수정] 썸네일 경고 제거
│   │
│   └── cornerstone/
│       └── src/
│           ├── index.tsx               # [수정] 확장 초기화
│           ├── initDoubleClick.ts      # [수정] 더블클릭 핸들링
│           └── utils/
│               ├── getCornerstoneOrientation.ts  # [신규]
│               └── htj2kMetadataAdjuster.ts      # [신규] HTJ2K 메타데이터
│
└── platform/
    └── app/                            # 로고 변경 등 UI 수정
```

---

## 아키텍처 다이어그램

```mermaid
graph TB
    subgraph "OHIF Core (원본)"
        CORE["@ohif/core"]
        UI["@ohif/ui"]
        EXT_CS["extension-cornerstone"]
        EXT_DEF["extension-default"]
    end

    subgraph "mView 커스텀 레이어"
        USMPR["modes/usmpr"]
        HP_US["hpUSMPR.ts"]
        SLICE["SlicePlaneManager"]
        LAYOUT["LayoutConfigManager"]
    end

    subgraph "핵심 기능"
        F1["4V+1S 레이아웃"]
        F2["Level 0/2 디코딩"]
        F3["3D Slice Plane"]
        F4["Crosshair 동기화"]
    end

    CORE --> USMPR
    EXT_CS --> USMPR
    EXT_DEF --> HP_US
    USMPR --> SLICE
    USMPR --> LAYOUT
    HP_US --> F1
    SLICE --> F3
    USMPR --> F2
    USMPR --> F4
```

---

## 원본 OHIF 대비 주요 차이점

| 카테고리 | OHIF 원본 | mView 커스텀 |
|----------|-----------|--------------|
| **MPR 모드** | Basic MPR | USMPR (4V+1S) |
| **디코딩 전략** | 단일 레벨 | Level 0/2 하이브리드 |
| **레이아웃 저장** | 미지원 | sessionStorage/localStorage |
| **3D Slice Plane** | 기본 렌더링 | 수직 평면 지원, 색상 동기화 |
| **Crosshair** | 기본 동작 | Always-on, 색상/이동 개선 |
| **Volume 캐싱** | 레이아웃 변경 시 재로딩 | 지능형 캐싱 (즉시 복원) |
| **US 지원** | 제한적 | 전용 프리셋 및 최적화 |

---

## ⚠️ 알려진 이슈: DICOMweb HTJ2K Level 디코딩 미지원

### 문제 요약

HTJ2K Level 0/2 하이브리드 디코딩 기능은 **로컬 파일(DicomLocalDataSource)에서만 완전히 구현**되어 있으며, **DICOMweb 서버에서는 부분적으로만 동작**합니다.

### 구현 현황 비교

| 구분 | 로컬 파일 | DICOMweb |
|------|-----------|----------|
| **decodeLevel 설정** | ✅ 적용됨 | ✅ 적용됨 |
| **메타데이터 조정** | ✅ 구현됨 | ❌ **미구현** |
| **정상 동작** | ✅ | ⚠️ **불일치 발생** |

### 기술적 배경

```mermaid
flowchart TB
    subgraph "로컬 파일 (DicomLocalDataSource)"
        L1["1. HTJ2K 감지"]
        L2["2. 메타데이터 조정<br/>Rows: 3460 → 865<br/>Columns: 1686 → 421<br/>PixelSpacing: x4"]
        L3["3. DicomMetadataStore 저장"]
        L4["4. decodeLevel=2로 디코딩"]
        L5["5. 픽셀(865×421) = 메타데이터(865×421)<br/>✅ 일치"]

        L1 --> L2 --> L3 --> L4 --> L5
    end

    subgraph "DICOMweb (DicomWebDataSource)"
        W1["1. 서버에서 메타데이터 수신"]
        W2["2. 원본 메타데이터 그대로 저장<br/>Rows: 3460<br/>Columns: 1686<br/>PixelSpacing: 원본"]
        W3["3. DicomMetadataStore 저장"]
        W4["4. decodeLevel=2로 디코딩"]
        W5["5. 픽셀(865×421) ≠ 메타데이터(3460×1686)<br/>❌ 불일치"]

        W1 --> W2 --> W3 --> W4 --> W5
    end
```

### 코드 위치

**로컬 파일 (구현됨):**
```
extensions/default/src/DicomLocalDataSource/index.js
├── isHTJ2K() - HTJ2K 감지
├── getAdjustedImagePixelModule() - Rows, Columns 조정
└── getAdjustedImagePlaneModule() - PixelSpacing 조정
```

**DICOMweb (미구현):**
```
extensions/default/src/DicomWebDataSource/index.ts
└── (htj2kMetadataAdjuster 로직 없음)
```

### 발생 가능한 문제

#### 1. Volume 생성 오류

```
예상 크기: 3460 × 1686 × 200 슬라이스
실제 픽셀: 865 × 421 × 200 슬라이스
→ Volume dimensions 불일치로 렌더링 오류 가능
```

#### 2. 측정 도구 오차 (4배 차이)

```javascript
// MetadataProvider가 원본 PixelSpacing 반환
pixelSpacing: [0.5, 0.5]  // 원본 (mm/pixel)

// 실제 Level 2 디코딩 후
실제 pixelSpacing: [2.0, 2.0]  // 4배 (mm/pixel)

// 측정 결과
표시된 거리: 10mm
실제 거리: 40mm  // 4배 오차!
```

#### 3. 좌표 계산 오류

- **Crosshair 위치**: 클릭 좌표 ↔ 이미지 좌표 변환 오류
- **Slice 위치**: ImagePositionPatient 기반 계산 불일치
- **Annotation 위치**: 측정/주석 위치가 잘못 표시

#### 4. MPR 평면 계산 오류

```mermaid
flowchart LR
    subgraph "정상 (로컬)"
        A1["Sagittal Slice 요청"]
        A2["조정된 Volume 크기 사용"]
        A3["올바른 평면 추출"]
        A1 --> A2 --> A3
    end

    subgraph "오류 (DICOMweb)"
        B1["Sagittal Slice 요청"]
        B2["원본 크기로 계산"]
        B3["잘못된 인덱스 참조"]
        B4["검은 화면 또는 왜곡"]
        B1 --> B2 --> B3 --> B4
    end
```

### 영향 범위

| 기능 | 영향 | 심각도 |
|------|------|--------|
| MPR 뷰잉 | Volume dimensions 오류 | 🔴 높음 |
| 거리 측정 | 4배 오차 | 🔴 높음 |
| 면적 측정 | 16배 오차 | 🔴 높음 |
| Crosshair | 위치 불일치 | 🟡 중간 |
| 3D Slice Plane | 평면 위치 오류 | 🟡 중간 |
| 썸네일/프리뷰 | 정상 동작 | 🟢 없음 |

### 해결 방안

DICOMweb에서도 동일한 기능을 구현하려면:

```javascript
// extensions/default/src/DicomWebDataSource/index.ts에 추가 필요

// 1. HTJ2K 감지 함수
function isHTJ2K(instance) {
  const transferSyntaxUID = instance.AvailableTransferSyntaxUID;
  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

// 2. 메타데이터 조정 (저장 전)
if (isHTJ2K(instance)) {
  instance.Rows = Math.floor(instance.Rows / 4);
  instance.Columns = Math.floor(instance.Columns / 4);
  instance.PixelSpacing = [
    instance.PixelSpacing[0] * 4,
    instance.PixelSpacing[1] * 4
  ];
}
```

### ✅ 해결됨 (2025-12-22)

DICOMweb에 HTJ2K 메타데이터 조정 로직이 추가되고, **HTJ2K Transfer Syntax 요청이 설정**되었습니다.

**수정된 파일:**
```
extensions/default/src/DicomWebDataSource/index.ts  - HTJ2K 메타데이터 조정
platform/app/public/config/default.js              - HTJ2K Transfer Syntax 요청
```

#### 1. DICOMweb 설정 변경

```javascript
// platform/app/public/config/default.js
dataSources: [{
  configuration: {
    // HTJ2K Transfer Syntax 명시적 요청
    requestTransferSyntaxUID: '1.2.840.10008.1.2.4.201', // HTJ2K Lossless
    // ...
  }
}]
```

**적용된 데이터 소스:** `ohif`, `ohif2`, `ohif3`

#### 2. HTJ2K 메타데이터 조정 (`HTJ2K_ADJUSTMENT_ENABLED = true`)

```javascript
// extensions/default/src/DicomWebDataSource/index.ts
adjustHTJ2KMetadata(instance):
  - Rows: 3460 → 865 (1/4)
  - Columns: 1686 → 421 (1/4)
  - PixelSpacing: x4 배율
```

#### 동작 흐름

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant D as HTJ2K Decoder

    C->>S: GET /frames/1
    Note right of C: Accept: transfer-syntax=1.2.840.10008.1.2.4.201
    S->>C: 응답 (HTJ2K Lossless)

    Note over C: 메타데이터 조정 (adjustHTJ2KMetadata)
    Note over C: Rows/Columns 1/4, PixelSpacing x4

    C->>D: HTJ2K 디코딩 (decodeLevel: 2)
    D->>C: 1/4 해상도 이미지

    Note over C: 메타데이터와 픽셀 데이터 일치 ✅
```

#### 주의사항

**서버가 HTJ2K를 지원하지 않는 경우:**
```javascript
// extensions/default/src/DicomWebDataSource/index.ts
const HTJ2K_ADJUSTMENT_ENABLED = false;  // 비활성화

// platform/app/public/config/default.js
// requestTransferSyntaxUID 제거 또는 주석 처리
```

---

## 결론

mView-WebV2는 OHIF Viewer를 기반으로 **초음파(US) 및 다중 모달리티 MPR 뷰잉**에 최적화된 커스텀 의료 영상 뷰어입니다.

주요 기술적 성과:
1. **USMPR 모드**: US/CT/MR을 위한 전용 MPR 뷰어 모드 개발
2. **성능 최적화**: HTJ2K Level 0/2 하이브리드 디코딩으로 메모리/속도 균형
3. **사용자 경험 개선**: 레이아웃 저장, Crosshair 개선, 3D Slice Plane 안정화

---

**작성일**: 2025-12-22
**분석 도구**: Claude Code
