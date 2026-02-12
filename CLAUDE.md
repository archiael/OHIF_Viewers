# CLAUDE.md
이 파일은 이 저장소에서 작업할 때 Claude Code (claude.ai/code)에게 가이드를 제공합니다.

## 목차
1. [프로젝트 개요](#1-프로젝트-개요)
2. [mView-WebV2 프로젝트 특징](#2-mview-webv2-프로젝트-특징)
3. [개발 명령어](#3-개발-명령어)
    - 3.1. [설정](#31-설정)
    - 3.2. [개발](#32-개발)
    - 3.3. [테스트](#33-테스트)
    - 3.4. [빌드](#34-빌드)
    - 3.5. [Lerna/Monorepo 관리](#35-lernamonorepo-관리)
4. [아키텍처](#4-아키텍처)
    - 4.1. [Monorepo 구조](#41-monorepo-구조)
    - 4.2. [주요 아키텍처 패턴](#42-주요-아키텍처-패턴)
    - 4.3. [TypeScript Paths](#43-typescript-paths)
    - 4.4. [Cornerstone3D 통합](#44-cornerstone3d-통합)
5. [개발 워크플로우](#5-개발-워크플로우)
    - 5.1. [Extensions 작업](#51-extensions-작업)
    - 5.2. [Modes 작업](#52-modes-작업)
    - 5.3. [설정 변경](#53-설정-변경)
    - 5.4. [의존성 추가](#54-의존성-추가)
    - 5.5. [테스트 실행](#55-테스트-실행)
6. [중요한 기술 세부사항](#6-중요한-기술-세부사항)
    - 6.1. [브랜치 전략](#61-브랜치-전략)
    - 6.2. [빌드 시스템](#62-빌드-시스템)
    - 6.3. [Services PubSub 패턴](#63-services-pubsub-패턴)
    - 6.4. [Customization Hooks](#64-customization-hooks)
    - 6.5. [성능 고려사항](#65-성능-고려사항)
7. [일반적인 디버깅](#7-일반적인-디버깅)
8. [mView-WebV2 커스터마이징 영역](#8-mview-webv2-커스터마이징-영역)
    - 8.1. [USMPR 모드](#81-usmpr-모드-modesusmpr)
    - 8.2. [HTJ2K 하이브리드 디코딩](#82-htj2k-하이브리드-디코딩-extensionsdefault)
    - 8.3. [Hanging Protocol](#83-hanging-protocol-extensionsdefaultsrchangingprotocolshpusmprrts)
    - 8.4. [개발 규칙](#84-개발-규칙)
    - 8.5. [node_modules/ 폴더 처리 정책](#85-node_modules-폴더-처리-정책)
9. [mView-WebV2 알려진 이슈 및 해결책](#9-mview-webv2-알려진-이슈-및-해결책)
    - 9.1. [Volume undefined 오류](#91-volume-undefined-오류)
    - 9.2. [DICOMweb HTJ2K 로딩 오류](#92-dicomweb-htj2k-로딩-오류)
    - 9.3. [3D Slice Plane 수직 평면 문제](#93-3d-slice-plane-수직-평면-문제)
10. [코드베이스 분석 문서 인덱스](#10-코드베이스-분석-문서-인덱스)
    - 10.1. [분석 문서 개요](#101-분석-문서-개요)
    - 10.2. [주요 분석 문서](#102-주요-분석-문서)
    - 10.3. [학습 가이드](#103-학습-가이드)
11. [분석 스타일 가이드](#11-분석-스타일-가이드)
    - 11.1. [분석 문서 저장 규칙 (하이브리드 방식)](#111-분석-문서-저장-규칙-하이브리드-방식)
12. [폴더(모듈)별 분석 규칙](#12-폴더모듈별-분석-규칙)
    - 12.1. [[폴더 경로]](#121-폴더-경로)
13. [프로젝트 참고 자료](#13-프로젝트-참고-자료)
    - 13.1. [OHIF 공식 문서](#131-ohif-공식-문서)
    - 13.2. [OHIF 커뮤니티](#132-ohif-커뮤니티)
    - 13.3. [mView-WebV2 프로젝트 문서](#133-mview-webv2-프로젝트-문서)
    - 13.4. [코드베이스 분석 문서](#134-코드베이스-분석-문서)
    - 13.5. [브랜치 전략](#135-브랜치-전략)

## 1. 프로젝트 개요

이것은 **OHIF Medical Imaging Viewer**입니다 - DICOM 이미지를 위한 제로 풋프린트 의료 영상 뷰어입니다. Lerna와 Yarn Workspaces를 사용하는 모노레포로 구축되었으며 모듈식 확장 기반 아키텍처를 가지고 있습니다.

## 2. mView-WebV2 프로젝트 특징

이 프로젝트는 **OHIF Viewer v3.12.0-beta**를 기반으로 한 **의료 영상 뷰어 커스터마이징**입니다:

- **베이스**: OHIF Viewer v3.12.0-beta
- **주요 커스텀 모드**: `modes/usmpr` - 초음파(US), CT, MR 등 다중 모달리티 MPR 뷰잉 최적화
- **핵심 기술**: Cornerstone.js, React 18, TypeScript, HTJ2K 코덱
- **레이아웃**: 4V+1S (4개 Volume viewport + 1개 Stack viewport)
- **특화 기능**: HTJ2K 하이브리드 디코딩, 3D Slice Plane 렌더링, Crosshair 동기화

상세 가이드: [.claude/CLAUDE.md](.claude/CLAUDE.md)

## 3. 개발 명령어

### 3.1. 설정
```bash
# Yarn workspaces 활성화
yarn config set workspaces-experimental true

# 의존성 설치 (보안을 위해 frozen lockfile 사용)
yarn install --frozen-lockfile
```

### 3.2. 개발
```bash
# 기본 개발 서버 시작 (webpack)
yarn dev

# mView-WebV2 프로젝트별 개발 명령어
yarn dev:fast         # 빠른 개발 모드 (캐시 활용)
yarn dev:orthanc      # Orthanc 서버 연동

# 특정 PACS 구성으로 개발
yarn dev:dcm4chee     # DCM4CHEE PACS와 함께 사용 (config: platform/app/public/config/local_dcm4chee.js)
```

### 3.3. 테스트
```bash
# 커버리지와 함께 모든 단위 테스트 실행
yarn test:unit

# CI 모드에서 단위 테스트 실행
yarn test:unit:ci

# E2E 테스트 실행
yarn test:e2e              # 대화형 모드
yarn test:e2e:ci           # CI 모드
yarn test:e2e:ui           # Playwright UI 모드
```

### 3.4. 빌드
```bash
# 프로덕션 뷰어 빌드
yarn build

# 개발 버전 빌드
yarn build:dev

# CI용 빌드
yarn build:ci
```

### 3.5. Lerna/Monorepo 관리
```bash
# 변경된 패키지 확인
yarn see-changed

# 모든 패키지 정리
lerna clean

# 모든 패키지에서 명령 실행
lerna run <command>
```

## 4. 아키텍처

### 4.1. Monorepo 구조

저장소는 세 가지 주요 패키지 카테고리로 구성됩니다:

**Platform Packages** (`platform/`):
- `core` - 모든 확장 프로그램이 사용하는 핵심 비즈니스 로직, 서비스 및 유틸리티
- `ui` - React 컴포넌트 라이브러리 (현재)
- `ui-next` - 차세대 UI 컴포넌트
- `i18n` - 국제화 지원
- `app` - 모든 것을 조율하는 메인 뷰어 애플리케이션
- `cli` - 커맨드라인 도구
- `docs` - 문서

**Extensions** (`extensions/`):
확장 프로그램은 특정 기능을 제공하는 플러그인 가능한 모듈입니다:
- `cornerstone` - Cornerstone3D 라이브러리를 사용한 핵심 이미지 렌더링 (MPR, 볼륨 렌더링, 도구)
- `cornerstone-dicom-seg` - DICOM Segmentation 지원
- `cornerstone-dicom-sr` - DICOM Structured Reports
- `cornerstone-dicom-rt` - DICOM RT STRUCT 렌더링
- `dicom-microscopy` - 전체 슬라이드 현미경
- `dicom-pdf` - PDF 렌더링
- `dicom-video` - 비디오 렌더링
- `default` - **[커스텀 포함]** 기본 데이터 소스 (HTJ2K 지원), Hanging Protocol (hpUSMPR), 패널 및 기본 기능 - [상세보기](#82-htj2k-하이브리드-디코딩-extensionsdefault)
- `measurement-tracking` - 종단 측정 추적
- `tmtv` - Total Metabolic Tumor Volume 계산
- `usAnnotation` - 초음파 주석

**Modes** (`modes/`):
모드는 확장 프로그램을 결합한 사전 구성된 워크플로우입니다:
- `longitudinal` - 측정 추적 워크플로우
- `basic` - 기본 보기 모드
- `basic-dev-mode` - 개발 모드
- `tmtv` - TMTV 워크플로우
- `microscopy` - 현미경 워크플로우
- `segmentation` - 분할 워크플로우
- `usmpr` - **[커스텀]** 초음파 MPR 모드 (4V+1S 레이아웃, HTJ2K 최적화) - [상세보기](#81-usmpr-모드-modesusmpr)

### 4.2. 주요 아키텍처 패턴

**Extension System**:
- 확장 프로그램은 모듈을 내보냅니다 (예: `commandsModule`, `panelModule`, `viewportModule`, `toolbarModule`)
- 확장 프로그램은 `ExtensionManager`에 등록됩니다
- 확장 프로그램은 다른 확장 프로그램에 대한 의존성을 선언합니다
- 모듈 타입은 `platform/core/src/extensions/MODULE_TYPES`에 정의되어 있습니다

**Services Architecture**:
모든 핵심 서비스는 `platform/core/src/services/`에 있습니다:
- `ServicesManager` - 중앙 서비스 레지스트리
- `DisplaySetService` - 관련 이미지 그룹(디스플레이 셋) 관리
- `DicomMetadataStore` - DICOM 메타데이터 저장
- `MeasurementService` - 측정/주석 관리
- `HangingProtocolService` - 뷰포트 레이아웃 관리
- `ViewportGridService` - 뷰포트 그리드 상태 관리
- `ToolbarService` - 동적 툴바 관리
- `UINotificationService`, `UIModalService`, `UIDialogService` - UI 상호작용
- `CineService` - 시네 루프 재생
- `CustomizationService` - 런타임 커스터마이제이션
- `PanelService` - 사이드 패널 관리
- `WorkflowStepsService` - 다단계 워크플로우 관리
- `StudyPrefetcherService` - 이미지 프리페칭
- 서비스는 이벤트 통신을 위해 PubSub 패턴을 사용합니다

**Modes**:
- 모드는 완전한 뷰어 구성과 워크플로우를 정의합니다
- 모드는 로드할 확장 프로그램, 라우트, 툴바 구성 및 hanging protocols를 지정합니다
- 모드는 다음으로 구성됩니다: `id`, `routes`, `extensions`, `layoutInstance`, 초기화 로직

**Data Sources**:
- `platform/app/public/config/*.js` 파일에서 구성됩니다
- DICOMweb, 로컬 파일, JSON 및 사용자 정의 소스를 지원합니다
- 기본 데이터 소스: `@ohif/extension-default.dataSourcesModule.dicomweb`

**Configuration Files**:
- 주요 설정: `platform/app/public/config/` 디렉토리
- **mView-WebV2 설정**: `platform/app/public/config/default.js`
  - USMPR 모드 활성화
  - HTJ2K Transfer Syntax UID: `1.2.840.10008.1.2.4.201`
  - 성능 최적화: `maxNumberOfWebWorkers`, `maxNumRequests` 설정
- 각 설정은 데이터 소스, 확장 프로그램, 모드 및 뷰어 설정을 지정합니다
- 개발 시 일반적으로 `local_dcm4chee.js` 또는 유사한 파일을 사용합니다

### 4.3. TypeScript Paths

프로젝트는 TypeScript 경로 별칭을 사용합니다 (`tsconfig.json` 참조):
- `@ohif/core` → `platform/core/src`
- `@ohif/ui` → `platform/ui/src`
- `@ohif/ui-next` → `platform/ui-next/src`
- `@ohif/i18n` → `platform/i18n/src`
- `@ohif/app` → `platform/app/src`
- `@ohif/extension-*` → `extensions/*/src`
- `@state` → `platform/app/src/state`

### 4.4. Cornerstone3D 통합

뷰어는 렌더링을 위해 Cornerstone3D를 많이 사용합니다:
- 볼륨 렌더링, MPR (Multiplanar Reconstruction), MIP (Maximum Intensity Projection)
- `@cornerstonejs/dicom-image-loader`를 통한 스트리밍 이미지 로더
- `@cornerstonejs/tools`를 통한 도구 프레임워크
- 확장 프로그램 진입점: `extensions/cornerstone/src/index.tsx`
- 초기화: `extensions/cornerstone/src/init.tsx`

## 5. 개발 워크플로우

### 5.1. Extensions 작업
1. Extensions는 `extensions/<extension-name>/`에 있습니다
2. 각각 자체 `package.json`을 가지고 있으며 독립적으로 개발할 수 있습니다
3. 주요 진입점은 모듈을 내보냅니다: `extensions/cornerstone/src/index.tsx`를 참조하세요
4. 모듈은 일반적으로 다음을 포함합니다: `getCommandsModule`, `getPanelModule`, `getViewportModule`, `getToolbarModule`

### 5.2. Modes 작업
1. Modes는 `modes/<mode-name>/`에 있습니다
2. 확장 프로그램을 구성하여 뷰어 워크플로우를 정의합니다
3. 참조 구현은 `modes/longitudinal/src/index.ts`를 확인하세요

### 5.3. 설정 변경
- **mView-WebV2 주요 설정**: `platform/app/public/config/default.js`
  - HTJ2K Transfer Syntax UID: `1.2.840.10008.1.2.4.201`
  - 성능 최적화를 위한 `maxNumRequests` 설정 포함
  - 상세: [.claude/CLAUDE.md - 설정 파일](.claude/CLAUDE.md#설정-파일)
- PACS/데이터 소스 설정: `platform/app/public/config/local_dcm4chee.js` 또는 유사한 파일을 편집합니다
- 다른 환경을 위한 새로운 설정 파일을 생성합니다
- 다른 설정을 사용하려면 `APP_CONFIG` 환경 변수를 설정합니다

### 5.4. 의존성 추가
- 특정 패키지 디렉토리에서 `yarn install <package>`를 사용합니다
- 모노레포는 Yarn Workspaces를 사용하므로 공유 의존성이 호이스팅됩니다
- 의존성 추가 후 루트에서 `yarn install --frozen-lockfile`을 실행합니다

### 5.5. 테스트 실행
- 단위 테스트는 `jest.config.js`에 정의된 프로젝트와 함께 Jest를 사용합니다
- 각 패키지는 `jest.config.base.js`를 확장하는 자체 `jest.config.js`를 가지고 있습니다
- E2E 테스트는 Playwright를 사용합니다 (`playwright.config.ts`에 설정)

## 6. 중요한 기술 세부사항

### 6.1. 브랜치 전략

**OHIF 원본**:
- `develop` - 주요 개발 브랜치 (현재 기본값)
- `master` - 최신 베타 릴리스
- `release/*` - 안정적인 릴리스 브랜치

**mView-WebV2 프로젝트**:
- `develop` - 개발 메인 브랜치 (PR base 브랜치)
- `feature/heeboong` - 현재 작업 브랜치
- PR 생성 시 `develop`을 base로 지정

### 6.2. 빌드 시스템
- 주요: Webpack (`platform/app/.webpack/`에 설정)
- 실험적: Rsbuild (`rsbuild.config.ts`에 설정)
- 출력: 각 패키지의 `dist/` 디렉토리

### 6.3. Services PubSub 패턴
서비스는 publish/subscribe를 통해 통신합니다:
```typescript
// 이벤트 구독
servicesManager.services.displaySetService.subscribe(
  EVENTS.DISPLAY_SETS_ADDED,
  callback
);

// 이벤트 발행
servicesManager.services.displaySetService.publish(
  EVENTS.DISPLAY_SETS_ADDED,
  data
);
```

### 6.4. Customization Hooks
확장 프로그램은 포크 없이 CustomizationService를 통해 커스터마이징할 수 있습니다.

### 6.5. 성능 고려사항
- 뷰어는 `StudyPrefetcherService`를 통해 이미지를 프리페치합니다
- 요청 제한은 설정의 `maxNumRequests`를 통해 구성됩니다
- 볼륨 뷰포트는 GPU 가속을 사용합니다
- 더 빠른 개발 빌드를 위해 `QUICK_BUILD` 환경 변수를 사용합니다

## 7. 일반적인 디버깅

- 자세한 로깅 활성화: 브라우저 콘솔에서 `log.level` 설정
- PACS의 CORS 문제 확인: `showWarningMessageForCrossOrigin` 설정 플래그
- GPU 폴백 문제: `showCPUFallbackMessage` 설정 플래그
- 네트워크 요청 디버깅: `maxNumRequests` 설정 확인
- DICOM 메타데이터: 브라우저 DevTools에서 `DicomMetadataStore` 서비스 검사

## 8. mView-WebV2 커스터마이징 영역

### 8.1. USMPR 모드 (`modes/usmpr/`)

**4V+1S 레이아웃**: 4개 Volume viewport + 1개 Stack viewport

주요 기능:
- Crosshair 동기화 (항상 표시)
- 3D Slice Plane 렌더링
- 레이아웃 설정 저장 (sessionStorage/localStorage)
- 더블클릭으로 viewport 확대/축소

**Viewport ID 규칙**:
- `mpr-0`: Axial Volume
- `mpr-1`: Sagittal Volume
- `mpr-2`: Coronal Volume
- `mpr-3`: 3D Volume Rendering
- `mpr-stack-single`: Stack viewport (숨김 가능)

**주요 파일**:
- `modes/usmpr/src/index.tsx` - 메인 모드 로직
- `modes/usmpr/src/utils/SlicePlaneManager.ts` - 3D Slice Plane 관리
- `modes/usmpr/src/utils/ResizableGridManager.ts` - 레이아웃 관리

상세 가이드: [.claude/CLAUDE.md - USMPR 모드](.claude/CLAUDE.md#1-usmpr-모드-modesusmpr)

### 8.2. HTJ2K 하이브리드 디코딩 (`extensions/default/`)

**디코딩 전략**:
- Volume (MPR): Level 2 (1/4 해상도, 빠른 로딩)
- Stack: Level 0 (원본 해상도)

**관련 파일**:
- `extensions/default/src/DicomLocalDataSource/index.js` - 로컬 파일 HTJ2K 메타데이터 조정
- `extensions/default/src/DicomWebDataSource/index.ts` - DICOMweb HTJ2K 메타데이터 조정

**주의사항**: DICOMweb 서버가 HTJ2K를 지원해야 하며, `HTJ2K_ADJUSTMENT_ENABLED` 플래그로 활성화/비활성화

상세 가이드: [.claude/CLAUDE.md - HTJ2K 디코딩](.claude/CLAUDE.md#2-htj2k-level-디코딩-extensionsdefault)

### 8.3. Hanging Protocol (`extensions/default/src/hangingprotocols/hpUSMPR.ts`)

USMPR 모드의 레이아웃 및 뷰포트 배치 정의

### 8.4. SR DICOM 로딩 및 Measurement Panel

**SR (Structured Report) DICOM 처리 흐름**:

USMPR 모드는 스터디의 모든 SR DICOM 파일을 로드하여 Measurement Panel에 표시합니다.

**주요 컴포넌트**:
- `extensions/cornerstone-dicom-sr/` - SR 파싱 및 측정값 추출
- `modes/usmpr/src/index.tsx` - SR DisplaySet 로딩 (`loadSRDisplaySets()` 함수)
- `platform/core/src/services/MeasurementService/` - 중앙 측정값 저장소
- `extensions/measurement-tracking/src/panels/` - Measurement Panel UI

**데이터 흐름**:
```
SR DICOM 파일 → DisplaySet 생성 → loadSRDisplaySets() (모든 SR 로드)
→ hydrateStructuredReport() (ToolState 변환)
→ MeasurementService (중앙 저장소)
→ PanelMeasurementTableTracking (Panel 표시)
```

**현재 동작**:
- `loadSRDisplaySets()` 함수는 스터디의 **모든 SR DisplaySet**을 로드
- 현재 viewport나 series에 대한 필터링 없음
- 모든 측정값이 MeasurementService에 추가되어 Panel에 표시됨

**상세 분석 문서**: [docs/sr-loading-measurement-panel-analysis.md](docs/sr-loading-measurement-panel-analysis.md)
- SR 파일 발견 및 DisplaySet 생성 과정
- SR 측정값 추출 및 Hydration 프로세스
- MeasurementService 저장 및 Panel 표시 로직
- Viewport별 SR 필터링 구현 가이드

### 8.5. 개발 규칙

## ⚠️ 핵심 원칙: 임시 해결 절대 금지

**문제 발생 시 반드시 근본 원인을 찾아 완벽하게 해결하세요.**

### ❌ 절대 하지 말 것:
1. **메타데이터 우회**: DICOM 필드 임의 수정, 기본값 하드코딩
2. **설정 땜질**: 에러 무시, validation 비활성화
3. **조건 추가**: 특정 케이스만 동작하도록 if문 추가
4. **TODO 방치**: "나중에 고치자" 주석과 함께 임시 코드 커밋
5. **라이브러리 우회**: node_modules 직접 수정, monkey patching

### ✅ 반드시 할 것:
1. **완벽한 분석**:
   - 에러 스택 트레이스 끝까지 추적
   - Transfer Syntax, 코덱, 메타데이터 완전 이해
   - 성공/실패 케이스 비교 분석
   - 라이브러리 소스 코드 직접 확인

2. **근본 해결**:
   - 누락된 초기화 코드 추가
   - 올바른 API 사용법 적용
   - 표준 패턴 준수
   - 문서화된 해결책 구현

3. **문서화**:
   - CLAUDE.md에 문제, 원인, 해결책 기록
   - 재발 방지를 위한 교훈 명시
   - 코드 주석으로 의도 설명

**예시**:
- ❌ "이미지 안 보임 → 메타데이터에 기본값 추가"
- ✅ "이미지 안 보임 → Transfer Syntax 확인 → 코덱 미등록 발견 → 코덱 등록 코드 추가"

---

**코드 수정 시 주의사항**:
1. **OHIF 원본과 분리**: 커스텀 코드는 가능한 별도 파일/모듈로 분리
2. **modes/usmpr/**: USMPR 관련 로직은 이 디렉토리 내에서 관리
3. **HTJ2K 관련 수정**:
   - 로컬 파일: `DicomLocalDataSource/index.js`
   - DICOMweb: `DicomWebDataSource/index.ts`

**주요 파일별 역할**:

| 파일 | 역할 | 수정 빈도 |
|------|------|----------|
| `modes/usmpr/src/index.tsx` | USMPR 메인 로직 | 높음 |
| `modes/usmpr/src/utils/SlicePlaneManager.ts` | 3D Slice Plane | 중간 |
| `extensions/default/src/hangingprotocols/hpUSMPR.ts` | 레이아웃 정의 | 낮음 |
| `platform/app/public/config/default.js` | 앱 설정 | 낮음 |

상세 가이드: [.claude/CLAUDE.md - 개발 규칙](.claude/CLAUDE.md#개발-규칙)

### 8.6. node_modules/ 폴더 처리 정책

**중요 제약사항**:

1. **읽기 전용 정책**:
   - `node_modules/` 폴더 내의 파일은 **읽기만 가능**합니다
   - `node_modules/` 폴더 내의 파일을 **절대 수정하거나 추가하지 마세요**
   - 써드파티 라이브러리의 버그나 문제가 있다면:
     - 프로젝트 코드에서 **wrapper 함수**나 **adapter 패턴**으로 해결하세요
     - 또는 **패치 패키지** (예: `patch-package`)를 사용하세요
     - 또는 라이브러리를 **프로젝트에 복사**하여 커스터마이징하세요

2. **node_modules/ 의존성 명시 규칙**:
   - 만약 불가피하게 `node_modules/` 폴더 내 파일을 수정/추가한 경우:
     - 해당 파일을 호출하는 **모든 코드 파일 상단**에 **WARNING 주석**을 추가하세요
     - 주석 형식:
       ```javascript
       // WARNING: This code depends on modified node_modules file(s):
       // - node_modules/@cornerstonejs/tools/dist/someFile.js (modified)
       // - node_modules/some-package/lib/anotherFile.js (added)
       // These modifications will be lost on `yarn install`. Consider using patch-package.
       ```

3. **올바른 접근 방법**:
   ```javascript
   // ❌ 잘못된 방법: node_modules 파일 직접 수정
   // node_modules/@cornerstonejs/tools/dist/someFile.js 파일을 직접 편집

   // ✅ 올바른 방법 1: Wrapper 함수 사용
   // platform/core/src/utils/cornerstoneToolsWrapper.js
   import { originalFunction } from '@cornerstonejs/tools';

   export function customFunction(...args) {
     // 커스텀 로직 추가
     const result = originalFunction(...args);
     // 추가 처리
     return result;
   }

   // ✅ 올바른 방법 2: patch-package 사용
   // 1. 패키지 수정
   // 2. yarn patch-package @cornerstonejs/tools
   // 3. patches/ 폴더에 패치 파일 생성됨
   // 4. package.json에 postinstall 스크립트 추가
   ```

4. **예외 상황 처리**:
   - 개발 중 임시로 `node_modules/` 파일을 수정해야 하는 경우:
     - 수정 내용을 문서화하세요 (`document/node_modules_modifications.md`)
     - PR 제출 전에 **반드시 patch-package로 변환**하세요
     - 또는 **프로젝트 내로 코드를 이전**하세요

**이 정책의 목적**:
- `yarn install` 실행 시 의존성 불일치 방지
- 코드 유지보수성 향상
- 팀원 간 환경 일관성 보장

## 9. mView-WebV2 알려진 이슈 및 해결책

### 9.1. Volume undefined 오류
- **현상**: 시리즈 로딩/변경 시 `volume undefined` 오류
- **해결**: `ResizableGridManager` 초기화 재시도 로직 추가 (commit: `06971e3f9`)

### 9.2. DICOMweb HTJ2K 로딩 오류
- **현상**: streaming 사용 시 로딩 실패
- **해결**: streaming 비활성화 (commit: `77ec9f108`)

### 9.3. 3D Slice Plane 수직 평면 문제
- **현상**: 수직일 때 선이 안보임
- **해결**: Volume Plane으로 변경 (commit: `33499f845`)

상세 분석: [.claude/CLAUDE.md - 알려진 이슈](.claude/CLAUDE.md#알려진-이슈-및-해결책)

## 10. 코드베이스 분석 문서 인덱스

### 10.1. 분석 문서 개요

본 프로젝트는 **총 33개**의 분석 대상 `src` 폴더를 세 가지 패키지 카테고리로 분류하여 관리합니다:

**Platform 폴더** (7개):
- `platform/app/src`
- `platform/cli/src`
- `platform/core/src`
- `platform/docs/src`
- `platform/i18n/src`
- `platform/ui/src`
- `platform/ui-next/src`

**Extensions 폴더** (14개):
- `extensions/cornerstone/src`
- `extensions/cornerstone-dicom-pmap/src`
- `extensions/cornerstone-dicom-rt/src`
- `extensions/cornerstone-dicom-seg/src`
- `extensions/cornerstone-dicom-sr/src`
- `extensions/cornerstone-dynamic-volume/src`
- `extensions/default/src` (HTJ2K 커스터마이징 포함)
- `extensions/dicom-microscopy/src`
- `extensions/dicom-pdf/src`
- `extensions/dicom-video/src`
- `extensions/measurement-tracking/src`
- `extensions/test-extension/src`
- `extensions/tmtv/src`
- `extensions/usAnnotation/src`

**Modes 폴더** (12개):
- `modes/basic/src`
- `modes/basic-dev-mode/src`
- `modes/basic-test-mode/src`
- `modes/longitudinal/src`
- `modes/mammography/src`
- `modes/mammography-compare/src`
- `modes/microscopy/src`
- `modes/preclinical-4d/src`
- `modes/segmentation/src`
- `modes/tmtv/src`
- `modes/usAnnotation/src`
- `modes/usmpr/src` (mView-WebV2 커스텀)

### 10.2. 주요 분석 문서

**Platform 패키지 분석** (`docs/analysis/`):
1. **[platform/app/src](docs/analysis/platform-app-src-analysis.md)**
   - OHIF 앱 메인 진입점 및 라우팅 시스템
   - 13개 Provider 중첩 구조, 4단계 useEffect 체인으로 Mode 초기화

2. **[platform/core/src/services](docs/analysis/platform-core-services-analysis.md)**
   - OHIF 핵심 비즈니스 로직 및 상태 관리
   - 20개 이상 서비스, PubSub 패턴 기반 이벤트 통신

3. **[platform/cli/src](docs/analysis/platform-cli-src-analysis.md)**
   - OHIF CLI 도구 (Extension/Mode 생성, 추가, 링크 관리)

**Extensions 분석** (각 모듈의 `CLAUDE.md`):
1. **[extensions/cornerstone/CLAUDE.md](extensions/cornerstone/CLAUDE.md)**
   - Cornerstone3D 렌더링 엔진 통합
   - HTJ2K Progressive Decoding 최적화 (mView 커스텀)

2. **[extensions/default/CLAUDE.md](extensions/default/CLAUDE.md)**
   - 데이터 소스, Hanging Protocol, UI 레이아웃
   - HTJ2K Level 2 디코딩 (1/4 해상도)

**Modes 분석** (각 모듈의 `CLAUDE.md`):
1. **[modes/basic/CLAUDE.md](modes/basic/CLAUDE.md)**
   - OHIF 범용 의료 영상 뷰어 (기본 템플릿)
   - 8개 확장 프로그램 통합, 709개 툴바 버튼

2. **[modes/usmpr/CLAUDE.md](modes/usmpr/CLAUDE.md)**
   - 초음파 MPR 전용 모드 (mView-WebV2 커스텀)
   - 4V+1S 레이아웃, 크로스헤어 동기화, 3D 슬라이스 평면

### 10.3. 학습 가이드

**추천 학습 순서**:

1. **OHIF 기초 이해** (1주)
   - `platform/app/src`: 앱 구조와 라우팅
   - `platform/core/src/services`: 서비스 아키텍처

2. **Extension 개발** (2주)
   - `extensions/default/src`: 기본 확장 모듈
   - `extensions/cornerstone/src`: 렌더링 엔진

3. **Mode 개발** (1주)
   - `modes/basic/src`: 기본 모드 템플릿
   - `modes/usmpr/src`: 커스텀 모드 예제

**학습 목표별 문서 추천**:
- **라우팅 이해**: [platform/app/src](docs/analysis/platform-app-src-analysis.md)
- **상태 관리**: [platform/core/src/services](docs/analysis/platform-core-services-analysis.md)
- **이미지 렌더링**: [extensions/cornerstone/CLAUDE.md](extensions/cornerstone/CLAUDE.md)
- **데이터 소스**: [extensions/default/CLAUDE.md](extensions/default/CLAUDE.md)
- **레이아웃 커스터마이징**: [modes/usmpr/CLAUDE.md](modes/usmpr/CLAUDE.md)

## 11. 분석 스타일 가이드

- 항상 "리액트 초보 개발자"가 읽는다고 생각하고 설명합니다.
- 분석해야하는 주요 폴더 3개에 대해 1 depth까지 sub 폴더별로 분석 시 subagent를 사용하여 분석:
  1. Use the ohif-platform-analyst subagent to analyze "platform/*" folder
  2. Use the ohif-extensions-analyst subagent to analyze "extensions/*" folder
  3. Use the ohif-modes-analyst subagent to analyze "modes/*" folder
- 이 폴더의 역할과 상위/하위 모듈 관계
  - 주요 리액트 컴포넌트와 훅, context 사용 방식
  - 상태 관리 패턴 (예: hooks, context, services)
  - OHIF 특유의 구조(extensions, modes, services 등)의 위치
  - 초보자가 이해해야 할 핵심 포인트와 학습 순서

### 11.1. 분석 문서 저장 규칙 (하이브리드 방식)

분석 문서는 패키지 카테고리에 따라 다른 위치에 저장합니다:

**Platform 패키지** (`platform/*`):
- **저장 위치**: `docs/analysis/` 디렉토리
- **이유**: 공통 인프라 성격의 패키지로, 프로젝트 전체 문서와 함께 관리
- **예시**:
  - `platform/app/src` → `docs/analysis/platform-app-src-analysis.md`
  - `platform/core/src/services` → `docs/analysis/platform-core-services-analysis.md`

**Extensions** (`extensions/*`):
- **저장 위치**: 각 확장 모듈의 `CLAUDE.md` 파일
- **이유**: 독립적인 NPM 패키지 구조, 코드와 문서를 함께 배포
- **예시**:
  - `extensions/cornerstone/src` → `extensions/cornerstone/CLAUDE.md`
  - `extensions/default/src` → `extensions/default/CLAUDE.md`

**Modes** (`modes/*`):
- **저장 위치**: 각 모드 모듈의 `CLAUDE.md` 파일
- **이유**: 독립적인 워크플로우 패키지, 모드별 문서화 필요
- **예시**:
  - `modes/basic/src` → `modes/basic/CLAUDE.md`
  - `modes/usmpr/src` → `modes/usmpr/CLAUDE.md`

분석 문서 전체 목록은 [코드베이스 분석 문서 인덱스](#10-코드베이스-분석-문서-인덱스) 섹션을 참조하세요.

## 12. 폴더(모듈)별 분석 규칙

각 폴더를 분석할 때는 아래 양식으로 정리합니다.

### 12.1. [폴더 경로]

1. 모듈 개요
   - 이 폴더가 전체 OHIF 리액트 앱에서 맡는 책임 요약
   - 어떤 화면 / 기능과 직접적으로 연결되는지

2. 주요 파일/컴포넌트 리스트
   - 파일명: 역할 (한 줄 설명)
   - 컴포넌트 간 관계 / 데이터 흐름 간단 다이어그램(텍스트)

3. 리액트 관점에서 볼 포인트
   - 상태 관리 방식 (props, context, 전역 store, service 등)
   - 재사용 가능한 UI 컴포넌트 패턴
   - 커스텀 훅이 있다면 역할과 사용처

4. OHIF 특유 개념 정리
   - 이 폴더에서 사용되는 OHIF-specific 개념(extensions, modes, services, hanging protocols 등)을 간단히 정의
   - 관련되는 다른 폴더 링크(예: src/extensions, src/modes, src/services)

5. 초보 개발자용 학습 가이드
   - 이 폴더를 공부할 때의 추천 순서 (e.g. 컴포넌트 → hooks → services)
   - "이 폴더를 다 이해하면 할 수 있게 되는 것" 한두 줄로 정리

---

## 13. 프로젝트 참고 자료

### 13.1. OHIF 공식 문서
- [OHIF Viewer 공식 문서](https://docs.ohif.org/)
- [Cornerstone3D 문서](https://www.cornerstonejs.org/)

### 13.2. OHIF 커뮤니티
- [OHIF GitHub](https://github.com/OHIF/Viewers)
- [OHIF Discussions](https://github.com/OHIF/Viewers/discussions)

### 13.3. mView-WebV2 프로젝트 문서
- **[.claude/CLAUDE.md](.claude/CLAUDE.md)** - mView-WebV2 상세 프로젝트 가이드
  - 디렉토리 구조
  - 빌드 및 실행 방법
  - 핵심 커스터마이징 영역 상세 설명
  - 설정 파일 상세
  - 개발 규칙
  - 알려진 이슈 및 해결책
- **`document/mview-webv2-customization-analysis.md`** - 커스터마이징 상세 분석
- **`document/htj2k-dicomweb-issue-analysis.md`** - HTJ2K 이슈 분석

### 13.4. 코드베이스 분석 문서
전체 분석 문서 목록은 [코드베이스 분석 문서 인덱스](#10-코드베이스-분석-문서-인덱스) 섹션 참조

**주요 분석 문서**:
- [platform/app/src](docs/analysis/platform-app-src-analysis.md) - 앱 구조와 라우팅
- [platform/core/src/services](docs/analysis/platform-core-services-analysis.md) - 서비스 아키텍처
- [extensions/cornerstone/CLAUDE.md](extensions/cornerstone/CLAUDE.md) - 렌더링 엔진
- [extensions/default/CLAUDE.md](extensions/default/CLAUDE.md) - 데이터 소스
- [modes/basic/CLAUDE.md](modes/basic/CLAUDE.md) - 기본 모드
- [modes/usmpr/CLAUDE.md](modes/usmpr/CLAUDE.md) - USMPR 모드 (mView 커스텀)

### 13.5. 브랜치 전략
- `develop`: 개발 메인 브랜치 (PR base 브랜치)
- `feature/heeboong`: 현재 작업 브랜치
- PR 생성 시 `develop`을 base로 지정

---

**문서 버전**: OHIF v3.12.0-beta based
**최종 업데이트**: 2026-01-08
