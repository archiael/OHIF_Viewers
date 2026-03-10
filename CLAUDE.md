# CLAUDE.md
이 파일은 이 저장소에서 작업할 때 Claude Code에게 가이드를 제공합니다.

## 목차
1. [프로젝트 개요](#1-프로젝트-개요)
2. [mView-WebV2 특징](#2-mview-webv2-특징)
3. [개발 명령어](#3-개발-명령어)
4. [아키텍처 개요](#4-아키텍처-개요)
5. [개발 워크플로우](#5-개발-워크플로우)
6. [기술 세부사항](#6-기술-세부사항)
7. [mView-WebV2 커스터마이징](#7-mview-webv2-커스터마이징)
8. [알려진 이슈](#8-알려진-이슈)
9. [코드베이스 분석 문서](#9-코드베이스-분석-문서)
10. [참고 자료](#10-참고-자료)

---

## 1. 프로젝트 개요

**OHIF Medical Imaging Viewer** - DICOM 이미지를 위한 제로 풋프린트 의료 영상 뷰어입니다.
- Lerna + Yarn Workspaces 모노레포
- 모듈식 확장 기반 아키텍처
- React 18, TypeScript, Cornerstone3D

---

## 2. mView-WebV2 특징

**OHIF Viewer v3.12.0-beta** 기반 커스터마이징:
- **베이스**: OHIF Viewer v3.12.0-beta
- **주요 모드**: `modes/usmpr` - 초음파/CT/MR MPR 최적화
- **핵심 기술**: Cornerstone.js, HTJ2K 코덱
- **레이아웃**: 4V+1S (4 Volume + 1 Stack viewport)
- **특화 기능**: HTJ2K 하이브리드 디코딩, 3D Slice Plane, Crosshair 동기화

📖 **상세 가이드**: [.claude/CLAUDE.md](.claude/CLAUDE.md)

---

## 3. 개발 명령어

### 설정
```bash
yarn install --frozen-lockfile
```

### 개발
```bash
yarn dev              # 기본 개발 서버
yarn dev:fast         # 빠른 모드 (캐시)
yarn dev:dcm4chee     # DCM4CHEE PACS 연동
```

### 테스트
```bash
yarn test:unit        # 단위 테스트
yarn test:e2e         # E2E 테스트
yarn test:e2e:ui      # Playwright UI
```

### 빌드
```bash
yarn build            # 프로덕션
yarn build:dev        # 개발
```

---

## 4. 아키텍처 개요

### Monorepo 구조

```
mview-webv2/
├── platform/         # 플랫폼 코어 (app, core, ui, ui-next, i18n, cli, docs)
├── extensions/       # 확장 모듈 (cornerstone, default, measurement-tracking 등)
└── modes/            # 워크플로우 모드 (usmpr, basic, longitudinal 등)
```

**주요 패키지**:
- `platform/core` - 핵심 서비스, 비즈니스 로직
- `platform/app` - 메인 뷰어 애플리케이션
- `extensions/cornerstone` - Cornerstone3D 렌더링
- `extensions/default` - 데이터 소스, Hanging Protocol
- `modes/usmpr` - **[커스텀]** USMPR 모드

### 주요 개념

**Extensions**: 플러그인 모듈 (commandsModule, panelModule, viewportModule 등)
**Modes**: Extensions를 조합한 워크플로우
**Services**: PubSub 패턴 기반 상태 관리 (`platform/core/src/services/`)
**Hanging Protocols**: 뷰포트 레이아웃 정의

### TypeScript Paths
```typescript
@ohif/core      → platform/core/src
@ohif/ui        → platform/ui/src
@ohif/app       → platform/app/src
@state          → platform/app/src/state
```

---

## 5. 개발 워크플로우

### Extensions 작업
- 위치: `extensions/<name>/`
- 진입점: `src/index.tsx`
- 모듈: `getCommandsModule`, `getPanelModule`, `getViewportModule`, `getToolbarModule`

### Modes 작업
- 위치: `modes/<name>/`
- 구성: Extensions + 라우트 + 툴바 + Hanging Protocol
- 참조: `modes/longitudinal/src/index.ts`

### 설정 변경
- **주요 설정**: `platform/app/public/config/default.js`
- **PACS 설정**: `local_dcm4chee.js` 등
- **환경 변수**: `APP_CONFIG` 설정

---

## 6. 기술 세부사항

### 브랜치 전략
- `develop` - 개발 메인 (PR base)
- `feature/heeboong` - 현재 작업 브랜치

### 빌드 시스템
- Webpack (`platform/app/.webpack/`)
- 출력: `dist/`

### Services PubSub
```typescript
// 이벤트 구독
servicesManager.services.displaySetService.subscribe(EVENTS.DISPLAY_SETS_ADDED, callback);

// 이벤트 발행
servicesManager.services.displaySetService.publish(EVENTS.DISPLAY_SETS_ADDED, data);
```

### 디버깅 팁
- 로깅: 브라우저 콘솔에서 `log.level` 설정
- CORS: `showWarningMessageForCrossOrigin` 플래그
- 메타데이터: DevTools에서 `DicomMetadataStore` 검사

---

## 7. mView-WebV2 커스터마이징

### 핵심 커스터마이징 영역

| 영역 | 위치 | 설명 |
|------|------|------|
| **USMPR 모드** | `modes/usmpr/` | 4V+1S 레이아웃, Crosshair 동기화, 3D Slice Plane |
| **HTJ2K 디코딩** | `extensions/default/src/DicomWebDataSource/` | Level 2 디코딩 (1/4 해상도) |
| **Hanging Protocol** | `extensions/default/src/hangingprotocols/hpUSMPR.ts` | USMPR 레이아웃 정의 |
| **설정** | `platform/app/public/config/default.js` | HTJ2K, 성능 최적화 |
| **로그인 시스템** | `platform/app/src/routes/Login/`, `platform/app/src/utils/` | 세션 인증, 다중 탭 동기화 |

**Viewport ID 규칙**:
- `mpr-0`: Axial, `mpr-1`: Sagittal, `mpr-2`: Coronal
- `mpr-3`: 3D Volume, `mpr-stack-single`: Stack viewport

📖 **상세 가이드**: [.claude/CLAUDE.md](.claude/CLAUDE.md)

### 로그인 시스템 파일 맵

세션 기반 인증 시스템 (`/v1/oauth` API 연동). 수정 시 아래 파일 관계를 확인할 것.

📖 **프로세스 분석**: [docs/login-process-analysis.md](docs/login-process-analysis.md)
📖 **구현 계획서**: [docs/login-implemente-plan.md](docs/login-implemente-plan.md)

| 파일 | 경로 | 역할 |
|------|------|------|
| **Login.tsx** | `platform/app/src/routes/Login/Login.tsx` | 로그인 UI + 폼 처리 |
| **loginAPI.ts** | `platform/app/src/utils/loginAPI.ts` | AES-CBC 비밀번호 암호화 + API 호출 |
| **authStateSync.ts** | `platform/app/src/utils/authStateSync.ts` | 세션 저장/복원/동기화 (Singleton) |
| **AuthStateListener.tsx** | `platform/app/src/utils/AuthStateListener.tsx` | Fetch Interceptor + 전역 인증 리스너 |
| **LoginRoutes.tsx** | `platform/app/src/utils/LoginRoutes.tsx` | 인증 라우트 + 3-step 세션 복원 |
| **PrivateRoute.tsx** | `platform/app/src/routes/PrivateRoute.tsx` | 라우트 가드 (비인증 → /login 리다이렉트) |
| **isLocalRoute.ts** | `platform/app/src/utils/isLocalRoute.ts` | 로컬 라우트 인증 예외 판별 |
| **sessionValidator.ts** | `platform/app/src/utils/sessionValidator.ts` | 서버 세션 검증 (쿨다운 + coalescing) |
| **loginLockout.ts** | `platform/app/src/utils/loginLockout.ts` | 계정 잠금 (5회 실패 → 30분) |

**의존 흐름**: `Login.tsx` → `loginAPI.ts` → Backend → `authStateSync.ts` → `PrivateRoute.tsx`

**환경 변수** (`.env`): `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_IV` (AES-CBC 16바이트 키)

### 개발 규칙

⚠️ **핵심 원칙: 임시 해결 절대 금지**

**❌ 절대 하지 말 것**:
1. 메타데이터 우회, 기본값 하드코딩
2. 설정 땜질 (에러 무시, validation 비활성화)
3. 특정 케이스만 동작하도록 if문 추가
4. TODO 방치
5. node_modules 직접 수정

**✅ 반드시 할 것**:
1. **완벽한 분석**: 에러 스택 추적, Transfer Syntax 확인, 라이브러리 소스 확인
2. **근본 해결**: 누락된 초기화 추가, 올바른 API 사용, 표준 패턴 준수
3. **문서화**: CLAUDE.md에 문제/원인/해결책 기록

**예시**:
- ❌ "이미지 안 보임 → 메타데이터에 기본값 추가"
- ✅ "이미지 안 보임 → Transfer Syntax 확인 → 코덱 미등록 발견 → 코덱 등록"

### node_modules/ 처리 정책

**읽기 전용**: node_modules는 절대 수정 금지

**올바른 방법**:
- Wrapper 함수/Adapter 패턴
- `patch-package` 사용
- 라이브러리를 프로젝트에 복사

---

## 8. 알려진 이슈

### 8.1. Volume undefined 오류
- **현상**: 시리즈 로딩 시 `volume undefined`
- **해결**: `ResizableGridManager` 재시도 로직 (`06971e3f9`)

### 8.2. DICOMweb HTJ2K 로딩 오류
- **현상**: streaming 사용 시 실패
- **해결**: streaming 비활성화 (`77ec9f108`)

### 8.3. 3D Slice Plane 수직 평면 문제
- **현상**: 수직일 때 선 안보임
- **해결**: Volume Plane으로 변경 (`33499f845`)

### 8.4. JPEG Lossless 로딩 실패 (Mammography)
- **현상**: Mammography 이미지 표시 안 됨
- **원인**: 코덱 미등록
- **해결**: `initWADOImageLoader.js`에 코덱 등록 추가 (2026-02-12)

📖 **상세 분석**: [.claude/CLAUDE.md - 알려진 이슈](.claude/CLAUDE.md#알려진-이슈-및-해결책)

---

## 9. 코드베이스 분석 문서

### 문서 구조

**총 33개** src 폴더를 3가지 카테고리로 분류:
- **Platform** (7개): `platform/app/src`, `platform/core/src`, `platform/ui/src` 등
- **Extensions** (14개): `extensions/cornerstone/src`, `extensions/default/src` 등
- **Modes** (12개): `modes/basic/src`, `modes/usmpr/src` 등

### 주요 분석 문서

**Platform 분석** (`docs/analysis/`):
- [platform/app/src](docs/analysis/platform-app-src-analysis.md) - 앱 구조, 라우팅
- [platform/core/src/services](docs/analysis/platform-core-services-analysis.md) - 서비스 아키텍처

**Extensions/Modes** (각 모듈의 `CLAUDE.md`):
- [extensions/cornerstone/CLAUDE.md](extensions/cornerstone/CLAUDE.md) - 렌더링 엔진
- [extensions/default/CLAUDE.md](extensions/default/CLAUDE.md) - 데이터 소스
- [modes/basic/CLAUDE.md](modes/basic/CLAUDE.md) - 기본 모드
- [modes/usmpr/CLAUDE.md](modes/usmpr/CLAUDE.md) - USMPR 모드

### 학습 순서

1. **OHIF 기초** (1주): `platform/app/src`, `platform/core/src/services`
2. **Extension** (2주): `extensions/default/src`, `extensions/cornerstone/src`
3. **Mode** (1주): `modes/basic/src`, `modes/usmpr/src`

### 분석 규칙

**문서 저장 위치**:
- Platform → `docs/analysis/`
- Extensions/Modes → 각 모듈의 `CLAUDE.md`

**분석 양식**:
1. 모듈 개요
2. 주요 파일/컴포넌트 리스트
3. 리액트 관점 포인트 (상태 관리, 훅, 컴포넌트)
4. OHIF 특유 개념 정리
5. 초보 개발자용 학습 가이드

---

## 10. 참고 자료

### 공식 문서
- [OHIF Viewer](https://docs.ohif.org/)
- [Cornerstone3D](https://www.cornerstonejs.org/)

### 커뮤니티
- [OHIF GitHub](https://github.com/OHIF/Viewers)
- [OHIF Discussions](https://github.com/OHIF/Viewers/discussions)

### mView-WebV2 문서
- **[.claude/CLAUDE.md](.claude/CLAUDE.md)** - mView-WebV2 상세 가이드
- `document/mview-webv2-customization-analysis.md` - 커스터마이징 분석
- `document/htj2k-dicomweb-issue-analysis.md` - HTJ2K 이슈 분석
- [docs/login-process-analysis.md](docs/login-process-analysis.md) - 로그인 프로세스 분석
- [docs/login-implemente-plan.md](docs/login-implemente-plan.md) - 로그인 구현 계획서

### 브랜치 전략
- `develop`: 개발 메인 (PR base)
- `feature/heeboong`: 현재 작업 브랜치

---

**문서 버전**: OHIF v3.12.0-beta based
**최종 업데이트**: 2026-02-13
