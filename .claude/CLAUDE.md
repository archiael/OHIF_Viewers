# mView-WebV2 프로젝트 가이드

## 프로젝트 개요

OHIF Viewer를 기반으로 한 **의료 영상 뷰어** 프로젝트입니다. 초음파(US), CT, MR 등 다중 모달리티 MPR(Multi-Planar Reconstruction) 뷰잉에 최적화되어 있습니다.

- **베이스**: OHIF Viewer v3.12.0-beta
- **주요 커스텀 모드**: USMPR (Ultrasound MPR)
- **핵심 기술**: Cornerstone.js, React 18, TypeScript, HTJ2K 코덱

---

## 디렉토리 구조

```
mview-webv2/
├── modes/                    # 뷰어 모드 (화면 구성 + 워크플로우)
│   ├── usmpr/               # [핵심] USMPR 모드 (커스텀)
│   │   ├── src/
│   │   │   ├── index.tsx           # 메인 모드 로직
│   │   │   ├── toolbarButtons.ts   # 툴바 버튼 정의
│   │   │   ├── components/
│   │   │   │   └── LayoutConfigModal.tsx
│   │   │   └── utils/
│   │   │       ├── SlicePlaneManager.ts   # 3D Slice Plane 관리
│   │   │       ├── SlicePlaneSync.ts      # Slice Plane 동기화
│   │   │       ├── ResizableGridManager.ts
│   │   │       ├── LayoutConfigManager.tsx
│   │   │       ├── usVolumePresets.ts     # US Volume 프리셋
│   │   │       └── usVolumeQuality.ts
│   │   └── package.json
│   ├── basic/               # OHIF 기본 모드
│   └── ...
│
├── extensions/              # 확장 기능
│   ├── default/            # 기본 확장
│   │   └── src/
│   │       ├── hangingprotocols/
│   │       │   └── hpUSMPR.ts    # [커스텀] USMPR Hanging Protocol
│   │       ├── DicomLocalDataSource/   # 로컬 파일 데이터소스
│   │       └── DicomWebDataSource/     # DICOMweb 데이터소스
│   ├── cornerstone/        # Cornerstone 렌더링 확장
│   └── ...
│
├── platform/               # 플랫폼 코어
│   ├── app/               # 메인 애플리케이션
│   │   └── public/config/
│   │       └── default.js  # [중요] 기본 설정 파일
│   ├── core/              # OHIF 코어 라이브러리
│   ├── ui/                # UI 컴포넌트
│   └── ui-next/           # 차세대 UI 컴포넌트
│
├── document/              # 프로젝트 문서
└── testdata/              # 테스트 데이터 (git submodule)
```

---

## 빌드 및 실행

### 의존성 설치
```bash
yarn install
```

### 개발 서버 실행
```bash
yarn dev              # 기본 개발 서버
yarn dev:fast         # 빠른 개발 모드 (캐시 활용)
yarn dev:dcm4chee     # DCM4CHEE PACS 연동
```

### 프로덕션 빌드
```bash
yarn build            # 프로덕션 빌드
yarn build:dev        # 개발 빌드
```

### 테스트
```bash
yarn test             # 유닛 테스트 (Jest)
yarn test:e2e         # E2E 테스트 (Playwright)
yarn test:e2e:ui      # E2E 테스트 UI 모드
```

---

## 핵심 커스터마이징 영역

### 1. USMPR 모드 (`modes/usmpr/`)

**4V+1S 레이아웃**: 4개 Volume viewport + 1개 Stack viewport

```
┌─────────┬─────────┐
│ Axial   │ Sagittal│
│ (mpr-0) │ (mpr-1) │
├─────────┼─────────┤
│ Coronal │   3D    │
│ (mpr-2) │ (mpr-3) │
└─────────┴─────────┘
```

**주요 기능**:
- Crosshair 동기화 (항상 표시)
- 3D Slice Plane 렌더링
- 레이아웃 설정 저장 (sessionStorage/localStorage)
- 더블클릭으로 viewport 확대/축소

**Viewport ID 규칙**:
```
mpr-0          : Axial Volume
mpr-1          : Sagittal Volume
mpr-2          : Coronal Volume
mpr-3          : 3D Volume Rendering
mpr-stack-single : Stack viewport (숨김 가능)
```

### 2. HTJ2K Level 디코딩 (`extensions/default/`)

**하이브리드 디코딩 전략**:
- Volume (MPR): Level 2 (1/4 해상도, 빠른 로딩)
- Stack: Level 0 (원본 해상도)

**관련 파일**:
- `DicomLocalDataSource/index.js` - 로컬 파일 HTJ2K 메타데이터 조정
- `DicomWebDataSource/index.ts` - DICOMweb HTJ2K 메타데이터 조정

**주의사항**:
- DICOMweb 서버가 HTJ2K를 지원해야 함
- `HTJ2K_ADJUSTMENT_ENABLED` 플래그로 활성화/비활성화

### 3. Hanging Protocol (`extensions/default/src/hangingprotocols/hpUSMPR.ts`)

USMPR 모드의 레이아웃 및 뷰포트 배치 정의 (321줄)

---

## 설정 파일

### `platform/app/public/config/default.js`

주요 설정 항목:
```javascript
{
  modes: ['@ohif/mode-usmpr'],  // 활성화된 모드
  defaultDataSourceName: 'ohif',

  // HTJ2K 성능 최적화
  maxNumberOfWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
  maxNumRequests: {
    interaction: 150,
    thumbnail: 100,
    prefetch: 50,
    compute: 50,
  },

  dataSources: [
    {
      sourceName: 'ohif',
      configuration: {
        // HTJ2K Transfer Syntax 요청
        requestTransferSyntaxUID: '1.2.840.10008.1.2.4.201',
        // ...
      },
    },
  ],
}
```

---

## 개발 규칙

### 코드 수정 시 주의사항

1. **OHIF 원본과 분리**: 커스텀 코드는 가능한 별도 파일/모듈로 분리
2. **modes/usmpr/**: USMPR 관련 로직은 이 디렉토리 내에서 관리
3. **HTJ2K 관련 수정**:
   - 로컬 파일: `DicomLocalDataSource/index.js`
   - DICOMweb: `DicomWebDataSource/index.ts`

### 주요 파일별 역할

| 파일 | 역할 | 수정 빈도 |
|------|------|----------|
| `modes/usmpr/src/index.tsx` | USMPR 메인 로직 | 높음 |
| `modes/usmpr/src/utils/SlicePlaneManager.ts` | 3D Slice Plane | 중간 |
| `extensions/default/src/hangingprotocols/hpUSMPR.ts` | 레이아웃 정의 | 낮음 |
| `platform/app/public/config/default.js` | 앱 설정 | 낮음 |

---

## 알려진 이슈 및 해결책

### 1. Volume undefined 오류
- **현상**: 시리즈 로딩/변경 시 `volume undefined` 오류
- **해결**: `ResizableGridManager` 초기화 재시도 로직 추가 (`06971e3f9`)

### 2. DICOMweb HTJ2K 로딩 오류
- **현상**: streaming 사용 시 로딩 실패
- **해결**: streaming 비활성화 (`77ec9f108`)

### 3. 3D Slice Plane 수직 평면 문제
- **현상**: 수직일 때 선이 안보임
- **해결**: Volume Plane으로 변경 (`33499f845`)

### 4. JPEG Lossless 이미지 로딩 실패 (Mammography)
- **현상**: Mammography 모드에서 특정 Study 이미지가 표시되지 않음
- **원인**: `@cornerstonejs/codec-libjpeg-turbo-8bit` 코덱 미등록
- **해결**: `extensions/cornerstone/src/initWADOImageLoader.js`에 코덱 등록 추가 (2026-02-12)

```javascript
import decodeJPEGBaseline from '@cornerstonejs/codec-libjpeg-turbo-8bit';

const { external } = dicomImageLoader;
external.setDecoder('1.2.840.10008.1.2.4.50', decodeJPEGBaseline); // JPEG Baseline
external.setDecoder('1.2.840.10008.1.2.4.51', decodeJPEGBaseline); // JPEG Extended
external.setDecoder('1.2.840.10008.1.2.4.57', decodeJPEGBaseline); // JPEG Lossless
external.setDecoder('1.2.840.10008.1.2.4.70', decodeJPEGBaseline); // JPEG Lossless (Mammography)
```

**교훈**:
- ❌ 임시 해결 금지 (메타데이터 수정, 서버 설정 변경)
- ✅ 완벽한 분석 (Transfer Syntax → 코덱 설치 → 등록 확인)
- ✅ 근본 해결 (누락된 코덱 등록 코드 추가)

---

## Git 브랜치 전략

- `develop`: 개발 메인 브랜치
- `feature/yongminbae`: 현재 기능 개발 브랜치
- PR 생성 시 `develop`을 base로 지정

---

## 참고 자료

- [OHIF Viewer 공식 문서](https://docs.ohif.org/)
- [Cornerstone.js](https://www.cornerstonejs.org/)
- `document/mview-webv2-customization-analysis.md`: 커스터마이징 상세 분석
- `document/htj2k-dicomweb-issue-analysis.md`: HTJ2K 이슈 분석

---

**Last Updated**: 2026-02-13
