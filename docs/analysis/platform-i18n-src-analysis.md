# platform/i18n/src 폴더 분석

## 1. 모듈 개요

`platform/i18n/src` 폴더는 OHIF 뷰어의 **국제화(Internationalization, i18n) 기능**을 담당하는 모듈입니다.

### 핵심 책임
- **다국어 지원**: 13개 언어(영어, 한국어, 일본어, 중국어, 스페인어 등) 번역 제공
- **언어 감지**: 브라우저 언어, 쿼리 파라미터, 로컬스토리지 등에서 자동으로 사용자 언어 감지
- **번역 로딩**: 로컬 번역 파일 또는 Locize 클라우드 서비스를 통한 번역 관리
- **React 통합**: `react-i18next`를 통해 React 컴포넌트에서 쉽게 번역 사용 가능

### 연결되는 화면/기능
이 모듈은 **모든 OHIF 화면과 UI 컴포넌트**에 영향을 미칩니다:
- 스터디 리스트 화면의 텍스트 (StudyList, StudyBrowser)
- 측정 도구 버튼과 툴바 (Buttons, Tools)
- 모달과 다이얼로그 (UserPreferencesModal, CineDialog)
- 오류 메시지 및 알림 (ErrorBoundary, Messages)
- 헤더와 사이드 패널 (Header, SidePanel)

---

## 2. 주요 파일/컴포넌트 리스트

### 핵심 파일 (src 루트)

| 파일명 | 역할 | 크기 |
|--------|------|------|
| **index.js** | i18n 초기화 및 설정 메인 로직 (152줄) | 핵심 |
| **config.js** | 언어 감지 옵션 설정 (23줄) | 설정 |
| **debugger.js** | 디버그 로깅 유틸리티 (9줄) | 유틸 |
| **utils.js** | 언어 정보 헬퍼 함수 (79줄) | 유틸 |

### 번역 파일 구조 (locales/)

```
locales/
├── index.js              # 모든 언어 통합
├── en-US/               # 영어(미국) - 기본 언어
│   ├── index.js         # 34개 네임스페이스 통합
│   ├── Common.json      # 공통 단어 (Back, Close, Yes, No 등)
│   ├── Buttons.json     # 툴바 버튼 텍스트 (160개)
│   ├── StudyList.json   # 스터디 목록 화면
│   ├── MeasurementTable.json
│   ├── UserPreferencesModal.json
│   └── ... (총 34개 JSON 파일)
├── ar/                  # 아랍어
├── de/                  # 독일어
├── es/                  # 스페인어
├── fr/                  # 프랑스어
├── ja-JP/               # 일본어
├── nl/                  # 네덜란드어
├── pt-BR/               # 포르투갈어(브라질)
├── ru/                  # 러시아어
├── tr-TR/               # 터키어
├── vi/                  # 베트남어
├── zh/                  # 중국어
└── test-LNG/            # 테스트 언어
```

### 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    App.tsx (platform/app)                    │
│                                                               │
│  import i18n from '@ohif/i18n';                              │
│  <I18nextProvider i18n={i18n}>                               │
│     <App />                                                   │
│  </I18nextProvider>                                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│               i18n/src/index.js                             │
│                                                              │
│  1. initI18n() 호출                                         │
│     - LanguageDetector.use() → 브라우저 언어 감지          │
│     - initReactI18next.use() → React 통합                  │
│     - .init({ resources: locales }) → 번역 로드            │
│                                                              │
│  2. i18n 인스턴스 메서드 추가                               │
│     - i18n.availableLanguages: 사용 가능한 언어 목록        │
│     - i18n.currentLanguage(): 현재 선택된 언어              │
│     - i18n.addLocales(): 런타임에 번역 추가                 │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│         locales/index.js → 모든 언어 번역 통합              │
│                                                               │
│  import en_US from './en-US/';                               │
│  import ja_JP from './ja-JP/';                               │
│  ...                                                          │
│  export default { ...en_US, ...ja_JP, ... };                │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│      locales/en-US/index.js → 네임스페이스별 분리           │
│                                                               │
│  import Buttons from './Buttons.json';                       │
│  import Common from './Common.json';                         │
│  ...                                                          │
│  export default {                                            │
│    'en-US': {                                                │
│      Buttons, Common, StudyList, ...                         │
│    }                                                          │
│  };                                                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│            React 컴포넌트에서 사용                           │
│                                                               │
│  import { useTranslation } from 'react-i18next';             │
│                                                               │
│  function MyComponent() {                                    │
│    const { t } = useTranslation('Buttons');                  │
│    return <button>{t('Save')}</button>; // "Save" 출력      │
│  }                                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1 상태 관리 방식

**i18next Context를 통한 전역 상태 관리**

```javascript
// App.tsx에서 최상위 Provider 설정
import i18n from '@ohif/i18n';
import { I18nextProvider } from 'react-i18next';

<I18nextProvider i18n={i18n}>
  <App />
</I18nextProvider>
```

- `I18nextProvider`가 모든 하위 컴포넌트에 i18n 인스턴스를 Context로 제공
- 언어 변경 시 자동으로 모든 컴포넌트가 리렌더링됨

### 3.2 React 컴포넌트에서 번역 사용 패턴

**useTranslation 훅 사용**

```javascript
import { useTranslation } from 'react-i18next';

function StudyListComponent() {
  // 'StudyList' 네임스페이스의 번역 사용
  const { t } = useTranslation('StudyList');

  return (
    <div>
      <h1>{t('Study List')}</h1>
      <p>{t('Patient Name')}</p>
    </div>
  );
}
```

**여러 네임스페이스 동시 사용**

```javascript
const { t } = useTranslation(['Buttons', 'Common']);

<button>{t('Buttons:Save')}</button>
<span>{t('Common:Close')}</span>
```

**변수 보간(Interpolation)**

```json
// Common.json
{
  "Back to": "Back to {{location}}"
}
```

```javascript
t('Common:Back to', { location: 'Study List' })
// 결과: "Back to Study List"
```

**번역 키 재사용 (키 참조)**

```json
// Buttons.json
{
  "Layout": "$t(Common:Layout)",
  "More": "$t(Common:More)"
}
```
- `$t(네임스페이스:키)` 형식으로 다른 번역 참조 가능

### 3.3 언어 변경 메커니즘

```javascript
// 언어 변경 (예: UserPreferencesModal에서)
await i18n.changeLanguage('ko-KR');

// 현재 언어 확인
const currentLang = i18n.language; // 'en-US'

// 사용 가능한 언어 목록
const languages = i18n.availableLanguages;
// [
//   { value: 'en-US', label: 'English (USA)' },
//   { value: 'ja-JP', label: 'Japanese (Japan)' },
//   ...
// ]
```

### 3.4 재사용 가능한 패턴

**네임스페이스 분리 전략**
- **Common**: 모든 곳에서 쓰이는 공통 단어 (Yes, No, Close, Save 등)
- **Buttons**: 툴바/버튼 텍스트
- **Modals**: 모달별 텍스트 그룹화 (AboutModal, UserPreferencesModal)
- **도메인별**: StudyList, MeasurementTable, SegmentationPanel 등

이렇게 분리하면:
1. 번역 파일이 작고 관리하기 쉬움
2. 필요한 번역만 로드 가능 (코드 스플리팅)
3. 번역가가 작업하기 편함

---

## 4. OHIF 특유 개념 정리

### 4.1 Locize 통합 (선택적)

**Locize란?**
- 클라우드 기반 번역 관리 서비스 (Translation Management System)
- 개발자가 코드를 수정하지 않고도 번역가가 실시간으로 번역 편집 가능

**로컬 vs Locize 모드**

| 항목 | 로컬 모드 (기본) | Locize 모드 |
|------|------------------|-------------|
| 번역 파일 위치 | `src/locales/*.json` | Locize 클라우드 |
| 번역 수정 | 코드 수정 후 재빌드 필요 | 브라우저에서 실시간 편집 |
| 활성화 조건 | 기본값 | `USE_LOCIZE=true` 환경변수 |
| 사용 사례 | 개발/프로덕션 | 번역 작업 시 |

**Locize 설정**

```javascript
// index.js
const locizeOptions = {
  projectId: process.env.LOCIZE_PROJECTID,
  apiKey: process.env.LOCIZE_API_KEY,  // 저장소에 커밋하면 안됨!
  referenceLng: 'en-US',
  fallbacklng: 'en-US',
};

if (useLocize) {
  i18n
    .use(Backend)       // 클라우드에서 번역 로드
    .use(LastUsed)      // 번역 사용 시간 추적 (사용하지 않는 번역 정리용)
    .use(Editor)        // 인컨텍스트 에디터 (?locize=true 쿼리로 활성화)
    .init({ backend: locizeOptions });
}
```

### 4.2 언어 감지 전략 (config.js)

**감지 순서** (우선순위 높은 순서)
1. `?lng=ko` 쿼리스트링
2. `i18next` 쿠키
3. `i18nextLng` 로컬스토리지
4. 브라우저 언어 (`navigator.language`)
5. HTML 태그 lang 속성
6. URL 경로 (예: `/ko/viewer`)
7. 서브도메인 (예: `ko.ohif.org`)

```javascript
const detectionOptions = {
  order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
  lookupQuerystring: 'lng',       // ?lng=ko
  lookupCookie: 'i18next',
  lookupLocalStorage: 'i18nextLng',
  caches: ['localStorage', 'cookie'],  // 감지된 언어를 여기에 저장
};
```

**동작 예시**
1. 사용자가 처음 방문 → 브라우저 언어가 한국어 → `ko` 언어 적용 → 로컬스토리지에 저장
2. 다음 방문 → 로컬스토리지에서 `ko` 읽음 → 한국어 유지
3. 사용자가 설정에서 영어로 변경 → `en-US` 로컬스토리지에 저장

### 4.3 번역 파일 자동 생성

**pullTranslations.sh 스크립트**
```bash
#!/bin/bash
# Locize에서 최신 번역을 다운로드하여 로컬 파일로 저장
```

**writeLocaleIndexFiles.js**
- 각 언어 폴더의 `index.js` 파일을 자동 생성
- JSON 파일을 찾아서 자동으로 import/export 코드 작성

이 도구들 덕분에:
- 번역가는 Locize 웹 인터페이스에서 작업
- 개발자는 스크립트 실행으로 최신 번역 동기화
- index.js 파일은 수동 관리 불필요

### 4.4 관련 폴더 링크

| 폴더 | 관계 |
|------|------|
| `platform/app/src/App.tsx` | i18n Provider 설정, i18n 인스턴스 사용 |
| `platform/ui/src/**/*.tsx` | UI 컴포넌트에서 useTranslation 훅 사용 |
| `platform/ui-next/src/**/*.tsx` | 차세대 UI 컴포넌트에서 번역 사용 |
| `extensions/*/src/**/*.tsx` | 확장 모듈에서 번역 사용 (툴 이름, 패널 제목 등) |
| `modes/*/src/**/*.tsx` | 모드별 커스텀 번역 추가 가능 |

**확장 모듈에서 커스텀 번역 추가**

```javascript
// extensions/my-extension/src/index.tsx
import i18n from '@ohif/i18n';

const myTranslations = {
  'en-US': {
    MyExtension: {
      'Custom Tool': 'Custom Tool',
      'My Panel': 'My Panel'
    }
  },
  'ja-JP': {
    MyExtension: {
      'Custom Tool': 'カスタムツール',
      'My Panel': 'マイパネル'
    }
  }
};

i18n.addLocales(myTranslations);
```

---

## 5. 초보 개발자용 학습 가이드

### 5.1 학습 추천 순서

**1단계: i18next 기본 개념 이해 (30분)**
- i18next 공식 문서 읽기: https://www.i18next.com/
- 핵심 개념: namespace, key, interpolation, fallback

**2단계: 번역 파일 구조 파악 (20분)**
- `src/locales/en-US/` 폴더 탐색
- `Common.json`, `Buttons.json` 파일 열어보기
- 키-값 구조 이해

**3단계: React 통합 실습 (40분)**
```javascript
// 간단한 컴포넌트 만들어보기
import { useTranslation } from 'react-i18next';

function MyFirstI18nComponent() {
  const { t, i18n } = useTranslation('Common');

  return (
    <div>
      <p>{t('Close')}</p>
      <button onClick={() => i18n.changeLanguage('ja-JP')}>
        日本語に変更
      </button>
    </div>
  );
}
```

**4단계: 실제 코드 분석 (60분)**
- `platform/i18n/src/index.js` 읽기 (초기화 로직 이해)
- `platform/app/src/App.tsx`에서 `I18nextProvider` 사용법 확인
- `platform/ui/src` 폴더에서 `useTranslation` 사용 예시 찾기

**5단계: 커스텀 번역 추가 실습 (40분)**
- `src/locales/en-US/Test.json` 파일 생성
- `src/locales/en-US/index.js`에 추가
- 컴포넌트에서 사용해보기

```json
// Test.json
{
  "Hello World": "Hello World",
  "Welcome": "Welcome {{name}}"
}
```

```javascript
// en-US/index.js에 추가
import Test from './Test.json';

export default {
  'en-US': {
    // ... 기존 네임스페이스
    Test,  // 추가
  }
}
```

```javascript
// 컴포넌트에서 사용
const { t } = useTranslation('Test');
<h1>{t('Welcome', { name: 'OHIF' })}</h1>
```

### 5.2 주의사항 (실수하기 쉬운 부분)

**1. 네임스페이스를 지정하지 않으면 에러**
```javascript
// ❌ 잘못된 사용
const { t } = useTranslation();
t('Save');  // 어떤 네임스페이스의 Save인지 모름

// ✅ 올바른 사용
const { t } = useTranslation('Buttons');
t('Save');
```

**2. JSON 파일 추가 후 index.js 업데이트 필수**
- JSON 파일만 만들고 `index.js`에 import/export 안하면 번역이 로드되지 않음

**3. 키 구분자(keySeparator) 비활성화 주의**
```javascript
// config에서 keySeparator: false 설정됨
// 따라서 키에 점(.)을 사용 가능
{
  "My.Special.Key": "Value"
}

// 만약 keySeparator: '.' 였다면
// "My.Special.Key"가 중첩 객체로 해석됨
```

**4. 번역 키 없을 때 폴백 동작**
```javascript
t('NonExistentKey')  // 결과: "NonExistentKey" (키 자체를 반환)
```

### 5.3 디버깅 팁

**디버그 모드 활성화**
```bash
# .env 파일
REACT_APP_I18N_DEBUG=true
NODE_ENV=development
```

그러면 콘솔에 다음과 같은 로그가 출력됨:
```
@ohif/i18n: version 3.12.0-beta.113 loaded.
@ohif/i18n: Using local translation files
@ohif/i18n: T function available.
```

**번역 누락 확인**
- 브라우저 콘솔에서 `i18n.store.data` 확인
- 특정 언어의 모든 번역 확인: `i18n.store.data['ja-JP']`

**현재 언어 확인**
```javascript
console.log(i18n.language);  // 'en-US'
console.log(i18n.currentLanguage());  // { value: 'en-US', label: 'English (USA)' }
```

### 5.4 이 폴더를 다 이해하면 할 수 있게 되는 것

1. **OHIF 뷰어를 자국어로 완전 번역**
   - 모든 UI 텍스트를 한국어, 일본어 등으로 변경 가능
   - 번역 파일만 추가하면 코드 수정 없이 다국어 지원

2. **커스텀 확장 모듈에 다국어 지원 추가**
   - 자신만의 툴이나 패널을 만들 때 i18n 적용 가능
   - `i18n.addLocales()`로 런타임에 번역 추가

3. **언어 감지 로직 커스터마이징**
   - 회사 정책에 맞춰 언어 감지 순서 변경
   - 예: 특정 도메인에서는 항상 영어 사용

4. **번역 관리 워크플로우 구축**
   - Locize 또는 다른 TMS 도구와 통합
   - CI/CD 파이프라인에 번역 동기화 자동화

### 5.5 추가 학습 자료

- **i18next 공식 문서**: https://www.i18next.com/
- **react-i18next 문서**: https://react.i18next.com/
- **OHIF i18n 문서**: https://docs.ohif.org/platform/internationalization/
- **Locize**: https://locize.com/

---

## 요약

`platform/i18n/src`는 OHIF 뷰어의 국제화를 담당하는 핵심 모듈입니다:

- **13개 언어** 지원 (아랍어, 독일어, 영어, 스페인어, 프랑스어, 일본어, 네덜란드어, 포르투갈어, 러시아어, 터키어, 베트남어, 중국어, 테스트 언어)
- **네임스페이스 기반 번역 관리**: Common, Buttons, StudyList 등 34개 네임스페이스로 분리
- **자동 언어 감지**: 쿼리스트링, 쿠키, 로컬스토리지, 브라우저 언어 순으로 감지
- **React 통합**: `useTranslation` 훅으로 모든 컴포넌트에서 쉽게 사용
- **Locize 통합 가능**: 클라우드 기반 번역 관리 (선택적)

초보 개발자는 먼저 **번역 파일 구조**를 파악하고, **useTranslation 훅 사용법**을 익힌 뒤, **커스텀 번역 추가 실습**을 해보면 국제화 개념을 완전히 이해할 수 있습니다.
