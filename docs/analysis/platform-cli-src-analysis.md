# platform/cli/src 분석

## 1. 모듈 개요

**역할**: OHIF 개발자를 위한 커맨드라인 인터페이스(CLI) 도구를 제공하는 패키지입니다.

**주요 책임**:
- Extension과 Mode의 생성, 추가, 제거, 링크/언링크 관리
- NPM 레지스트리에서 OHIF 플러그인 검색
- 템플릿 기반 프로젝트 스캐폴딩
- pluginConfig.json 파일 자동 업데이트

**연결되는 화면/기능**:
- 이 모듈은 화면이 아닌 **터미널 환경**에서 실행되는 개발 도구입니다
- OHIF 모노레포 루트에서 `yarn run cli <command>` 형태로 사용
- 예: `yarn run cli create-extension`, `yarn run cli add-mode @ohif/mode-basic`

**전체 앱에서의 위치**:
```
OHIF Monorepo
├── platform/cli       ← [현재 분석 중] 개발자 도구
├── platform/app       ← CLI가 조작하는 대상 (pluginConfig.json)
├── extensions/        ← CLI로 추가/제거/링크 가능
└── modes/            ← CLI로 추가/제거/링크 가능
```

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1 진입점 (Entry Point)

**`src/index.js` (204줄)**
- CLI의 메인 진입점 (`#!/usr/bin/env node`)
- Commander.js를 사용한 명령어 파싱
- 11개의 서브커맨드 등록 (create-extension, add-mode, link-extension 등)
- OHIF 모노레포 루트에서만 실행되도록 검증

### 2.2 커맨드 모듈 (Commands)

**`src/commands/index.js`**
모든 커맨드 함수를 export하는 중앙 집중식 진입점

**핵심 커맨드 파일들**:

| 파일명 | 역할 | 주요 기능 |
|--------|------|-----------|
| `createPackage.js` | 새 Extension/Mode 생성 | 템플릿 복사, package.json 생성, 라이선스/README 생성 |
| `addExtension.js` | NPM Extension 설치 | NPM 검색 → 패키지 설치 → pluginConfig.json 업데이트 |
| `addMode.js` | NPM Mode 설치 | Mode 설치 + 의존 Extension 자동 설치 |
| `removeExtension.js` | Extension 제거 | 패키지 제거 + config 업데이트 + 사용 중인지 검증 |
| `removeMode.js` | Mode 제거 | Mode 제거 + 미사용 Extension 자동 제거 |
| `linkPackage.js` | 로컬 패키지 링크 | `yarn link`로 개발 중인 패키지 연결 + webpack 설정 수정 |
| `unlinkPackage.js` | 로컬 패키지 언링크 | `yarn unlink`로 연결 해제 |
| `listPlugins.js` | 설치된 플러그인 목록 | pluginConfig.json 읽어서 출력 |
| `searchPlugins.js` | NPM 플러그인 검색 | NPM API로 `ohif-extension`, `ohif-mode` 키워드 검색 |

### 2.3 유틸리티 모듈 (Utils)

**`src/commands/utils/` 디렉토리**

**파일 조작 유틸**:
- `createDirectoryContents.js`: 템플릿 디렉토리를 재귀적으로 복사
- `editPackageJson.js`: 생성된 package.json에 사용자 정보 주입
- `createLicense.js`: SPDX 라이선스 파일 생성
- `createReadme.js`: README.md 생성

**NPM/Yarn 작업**:
- `installNPMPackage.js`: `pkg-install` 라이브러리로 패키지 설치
- `uninstallNPMPackage.js`: 패키지 제거
- `getYarnInfo.js`: `yarn info` 명령으로 패키지 정보 조회
- `validateYarn.js`: Yarn이 설치되어 있는지 확인

**Config 파일 관리**:
- `addToConfig.js`: pluginConfig.json에 Extension/Mode 추가
- `removeFromConfig.js`: pluginConfig.json에서 제거
- `private/manipulatePluginConfigFile.js`: Config JSON 구조 조작
- `private/readPluginConfigFile.js`: Config 파일 읽기
- `private/writePluginConfigFile.js`: Config 파일 쓰기

**검증 로직**:
- `validate.js`: Extension/Mode가 NPM에 존재하는지 확인
- `throwIfExtensionUsedByInstalledMode.js`: Extension이 Mode에서 사용 중인지 검증
- `findRequiredOhifExtensionsForMode.js`: Mode가 필요로 하는 Extension 목록 추출

### 2.4 사용자 입력 (Inquirer)

**`src/questions.js`**
- `getPathQuestions()`: 패키지 이름, 생성 경로, 확인 프롬프트
- `getRepoQuestions()`: Git 저장소, Prettier, 버전, 설명, 저자, 라이선스 정보 수집

### 2.5 템플릿 (Templates)

**`templates/extension/`**: Extension 템플릿
- `.webpack/webpack.prod.js`
- `babel.config.js`
- `src/index.tsx`: 모든 모듈 타입 정의된 빈 Extension
- `src/id.js`: Extension ID
- `dependencies.json`: 기본 의존성 목록

**`templates/mode/`**: Mode 템플릿
- 기본적으로 `@ohif/mode-longitudinal`을 상속하는 템플릿
- `src/index.tsx`: longitudinalMode를 확장한 구조

### 2.6 데이터 흐름 다이어그램

```
사용자 터미널
    ↓
index.js (Commander CLI)
    ↓
명령어 분기
    ↓
┌────────────────┬──────────────────┬──────────────────┐
│ create-*       │ add-*/remove-*   │ link-*/unlink-*  │
├────────────────┼──────────────────┼──────────────────┤
│ questions.js   │ validate.js      │ linkPackage.js   │
│      ↓         │      ↓           │      ↓           │
│ createPackage  │ installNPMPackage│ yarn link        │
│      ↓         │      ↓           │      ↓           │
│ templates/     │ addToConfig      │ webpack 수정     │
│      ↓         │      ↓           │      ↓           │
│ 새 폴더 생성    │ pluginConfig.json│ pluginConfig.json│
└────────────────┴──────────────────┴──────────────────┘
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1 이 모듈은 리액트와 무관합니다

**중요**: `platform/cli`는 **Node.js CLI 도구**이며, 브라우저에서 실행되지 않고 React 컴포넌트도 포함하지 않습니다.

**사용 기술**:
- **Node.js**: 런타임 환경
- **Commander.js**: CLI 프레임워크
- **Inquirer.js**: 대화형 프롬프트
- **Listr**: 태스크 진행 상황 표시
- **Execa**: 외부 프로세스 실행 (yarn, git)
- **Axios**: NPM 레지스트리 API 호출

### 3.2 리액트 개발자 입장에서의 의미

이 CLI는 React 개발에 직접 관여하지 않지만, **React 컴포넌트를 포함한 Extension/Mode를 생성하는 도구**입니다.

**생성된 템플릿과 React의 관계**:
```javascript
// templates/extension/src/index.tsx - 생성되는 파일 예시
export default {
  id: 'my-extension',

  // React 컴포넌트를 반환하는 함수들
  getPanelModule: ({ servicesManager }) => {
    return [
      {
        name: 'myPanel',
        component: MyReactComponent  // ← React 컴포넌트
      }
    ];
  },

  getViewportModule: ({ servicesManager }) => {
    return [
      {
        name: 'myViewport',
        component: MyViewportComponent  // ← React 컴포넌트
      }
    ];
  }
}
```

### 3.3 상태 관리 방식

CLI 내부에서는 **명령형 프로그래밍**을 사용:
- 파일 시스템 상태 직접 조작
- pluginConfig.json 읽기/쓰기
- NPM 패키지 설치/제거
- Git 초기화

**상태 저장 위치**:
- `platform/app/pluginConfig.json`: 설치된 Extension/Mode 목록
- `platform/app/.webpack/webpack.pwa.js`: 링크된 패키지의 node_modules 경로

---

## 4. OHIF 특유 개념 정리

### 4.1 pluginConfig.json

**위치**: `platform/app/pluginConfig.json`

**구조**:
```json
{
  "extensions": [
    {
      "packageName": "@ohif/extension-cornerstone",
      "version": "3.12.0-beta.113"
    }
  ],
  "modes": [
    {
      "packageName": "@ohif/mode-longitudinal",
      "version": "3.12.0-beta.113"
    }
  ]
}
```

**역할**:
- OHIF 앱이 로드할 Extension/Mode의 목록 정의
- CLI가 이 파일을 자동으로 업데이트
- 빌드 시 webpack이 이 정보를 사용해 동적 import 생성

### 4.2 NPM 키워드 기반 플러그인 시스템

**Extension 인식 방법**:
```json
// package.json에 키워드 필수
{
  "name": "@ohif/extension-my-ext",
  "keywords": ["ohif-extension"]  // ← 필수!
}
```

**Mode 인식 방법**:
```json
{
  "name": "@ohif/mode-my-mode",
  "keywords": ["ohif-mode"]  // ← 필수!
}
```

**검색 메커니즘** (`searchPlugins.js`):
```javascript
// NPM API를 사용한 키워드 검색
const url = `https://registry.npmjs.org/-/v1/search?text=keywords:ohif-extension`;
const response = await axios.get(url);
```

### 4.3 Yarn Link 개발 워크플로우

**일반적인 개발 시나리오**:

1. **새 Extension 생성**:
```bash
yarn run cli create-extension
# → ~/my-extensions/awesome-extension/ 폴더 생성
```

2. **OHIF Viewer에 링크**:
```bash
yarn run cli link-extension ~/my-extensions/awesome-extension
# 1. awesome-extension 폴더에서 yarn link 실행
# 2. OHIF 모노레포에서 yarn link awesome-extension
# 3. webpack.pwa.js에 node_modules 경로 추가
# 4. pluginConfig.json에 Extension 추가
```

3. **개발 서버 실행**:
```bash
yarn dev
# → awesome-extension이 로드됨
```

4. **개발 완료 후 언링크**:
```bash
yarn run cli unlink-extension awesome-extension
yarn install --frozen-lockfile --force
```

### 4.4 Mode의 Extension 의존성 관리

**`addMode.js`의 스마트 기능**:
```javascript
// Mode 추가 시 자동으로 필요한 Extension도 설치
import { findRequiredOhifExtensionsForMode } from './utils/index.js';

// Mode의 package.json의 dependencies를 분석
const requiredExtensions = findRequiredOhifExtensionsForMode(packageName);

// 아직 설치되지 않은 Extension 자동 설치
for (const ext of requiredExtensions) {
  await addExtension(ext);
}
```

**`removeMode.js`의 스마트 기능**:
```javascript
// Mode 제거 시 더 이상 사용하지 않는 Extension도 제거
const unusedExtensions = findOhifExtensionsToRemoveAfterRemovingMode(modeName);

for (const ext of unusedExtensions) {
  await removeExtension(ext);
}
```

### 4.5 관련 폴더 링크

| 관련 폴더 | 관계 |
|-----------|------|
| `platform/app` | CLI가 조작하는 주요 대상 (pluginConfig.json, webpack 설정) |
| `extensions/*` | CLI로 생성/추가/제거/링크 가능한 Extension 패키지들 |
| `modes/*` | CLI로 생성/추가/제거/링크 가능한 Mode 패키지들 |
| `platform/core` | Extension 템플릿이 참조하는 타입 정의 |

---

## 5. 초보 개발자용 학습 가이드

### 5.1 학습 순서

이 폴더는 "사용법"을 익히는 것이 우선이며, 내부 구조는 나중에 학습해도 됩니다.

**1단계: CLI 사용법 익히기 (필수)**
- `index.js`를 읽고 어떤 명령어들이 있는지 파악
- 실제로 명령어 실행해보기:
  ```bash
  yarn run cli search
  yarn run cli list
  yarn run cli create-extension  # 테스트용 Extension 생성
  ```

**2단계: 템플릿 구조 이해 (중요)**
- `templates/extension/src/index.tsx` 읽기
- 각 모듈 타입 (getPanelModule, getViewportModule 등)의 역할 이해
- 실제 Extension 예시와 비교 (`extensions/default/src/index.tsx`)

**3단계: 플러그인 관리 메커니즘 이해**
- `pluginConfig.json` 파일 구조 확인
- `addToConfig.js`, `removeFromConfig.js` 읽기
- CLI 명령 실행 후 pluginConfig.json이 어떻게 변하는지 관찰

**4단계: (선택) 내부 구현 분석**
- 궁금한 커맨드 파일 읽기 (예: `createPackage.js`)
- Listr, Inquirer 같은 라이브러리 사용법 학습
- NPM API 호출 방식 (`searchPlugins.js`) 이해

### 5.2 초보자를 위한 핵심 개념 설명

**Q1: CLI는 왜 필요한가요?**

OHIF는 Extension/Mode를 **NPM 패키지로 배포**하는 구조입니다. 새 Extension을 만들 때마다:
- 폴더 구조 생성
- package.json 작성
- webpack, babel 설정 복사
- pluginConfig.json 수정
- yarn link 설정

이 모든 과정을 자동화하는 것이 CLI의 역할입니다.

**Q2: React 개발과 어떤 관계인가요?**

CLI는 React 코드를 직접 다루지 않지만, **React 컴포넌트를 포함한 패키지의 스캐폴딩**을 담당합니다.

```
yarn run cli create-extension
    ↓
templates/extension 복사
    ↓
src/index.tsx 생성 (React 컴포넌트를 export하는 구조)
    ↓
개발자가 React 컴포넌트 작성
    ↓
yarn run cli link-extension
    ↓
OHIF Viewer에서 React 컴포넌트 렌더링
```

**Q3: Yarn Link가 뭔가요?**

일반적으로 NPM 패키지는 `npm install`로 설치하지만, **개발 중인 로컬 패키지**를 테스트하려면:

```bash
# 일반적인 방법 (NPM에 배포해야 함)
npm install @ohif/extension-my-ext

# 개발 중인 로컬 패키지 (NPM 배포 불필요)
yarn link ~/my-extensions/my-ext
```

`yarn link`는 로컬 폴더를 마치 설치된 패키지처럼 사용하게 해주는 symlink 메커니즘입니다.

**Q4: pluginConfig.json은 어떻게 사용되나요?**

OHIF 앱이 시작할 때:
```javascript
// platform/app/src/App.tsx (가상 코드)
const pluginConfig = require('./pluginConfig.json');

pluginConfig.extensions.forEach(ext => {
  const module = await import(ext.packageName);
  extensionManager.registerExtension(module.default);
});
```

즉, **빌드 시점에 어떤 Extension/Mode를 포함할지 결정**하는 설정 파일입니다.

### 5.3 자주 하는 실수

**실수 1: OHIF 루트가 아닌 곳에서 CLI 실행**
```bash
# ❌ 잘못된 예
cd platform/app
yarn run cli create-extension

# ✅ 올바른 예
cd /path/to/OHIF  # 모노레포 루트
yarn run cli create-extension
```

**실수 2: package.json에 키워드 누락**
```json
// ❌ 잘못된 예 - CLI가 인식 못함
{
  "name": "my-extension",
  "keywords": []
}

// ✅ 올바른 예
{
  "name": "my-extension",
  "keywords": ["ohif-extension"]
}
```

**실수 3: link 후 yarn install 강제 실행 안 함**
```bash
yarn run cli unlink-extension my-ext
# ⚠️ 이 상태로 yarn dev 하면 오류 발생

# ✅ 반드시 실행
yarn install --frozen-lockfile --force
```

### 5.4 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF Extension/Mode를 처음부터 생성**할 수 있습니다
   - 템플릿 구조를 이해하고 커스텀 Extension 작성 가능

2. **로컬 개발 워크플로우 구축**이 가능합니다
   - Yarn Link를 활용한 빠른 개발/테스트 사이클

3. **OHIF 플러그인 생태계 탐색**이 가능합니다
   - NPM에서 커뮤니티 Extension/Mode 검색 및 설치

4. **OHIF 모노레포의 패키지 관리 메커니즘**을 이해합니다
   - pluginConfig.json, webpack 설정, Extension 등록 과정

5. **CLI 도구 자체를 확장**할 수 있습니다
   - 새로운 명령어 추가 (예: `create-custom-template`)
   - 회사 내부 템플릿 관리 자동화

---

## 부록: 주요 CLI 명령어 치트시트

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `create-extension` | 새 Extension 템플릿 생성 | `yarn run cli create-extension` |
| `create-mode` | 새 Mode 템플릿 생성 | `yarn run cli create-mode` |
| `add-extension <name>` | NPM에서 Extension 설치 | `yarn run cli add-extension @ohif/ext-tmtv` |
| `remove-extension <name>` | Extension 제거 | `yarn run cli remove-extension @ohif/ext-tmtv` |
| `add-mode <name>` | NPM에서 Mode 설치 (의존 Extension 자동 설치) | `yarn run cli add-mode @ohif/mode-tmtv` |
| `remove-mode <name>` | Mode 제거 (미사용 Extension 자동 제거) | `yarn run cli remove-mode @ohif/mode-tmtv` |
| `link-extension <path>` | 로컬 Extension 연결 | `yarn run cli link-extension ~/my-ext` |
| `unlink-extension <name>` | 로컬 Extension 연결 해제 | `yarn run cli unlink-extension my-ext` |
| `link-mode <path>` | 로컬 Mode 연결 | `yarn run cli link-mode ~/my-mode` |
| `unlink-mode <name>` | 로컬 Mode 연결 해제 | `yarn run cli unlink-mode my-mode` |
| `list` | 설치된 Extension/Mode 목록 | `yarn run cli list` |
| `search` | NPM에서 OHIF 플러그인 검색 | `yarn run cli search` |
| `search -v` | 상세 정보 포함 검색 | `yarn run cli search --verbose` |

**중요한 후속 작업**:
- `link-*` 명령 후: 개발 서버 재시작 (`yarn dev`)
- `unlink-*` 명령 후: `yarn install --frozen-lockfile --force` 실행
