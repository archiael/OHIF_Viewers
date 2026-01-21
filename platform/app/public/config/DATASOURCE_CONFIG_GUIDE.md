# OHIF 데이터소스 설정 가이드 - Claude Code 에이전트용

## 개요

이 문서는 Claude Code 에이전트가 `platform/app/public/config/` 디렉토리의 설정 파일에서 데이터소스를 추가, 수정, 삭제할 때 따라야 할 지침을 제공합니다.

## 파일 위치

```
platform/app/public/config/
├── local_dcm4chee.js      # DCM4CHEE 로컬 서버 설정
├── local_orthanc.js       # Orthanc 로컬 서버 설정
├── default.js             # 기본 설정 (다중 데이터소스)
├── aws.js                 # AWS S3 정적 서버 설정
├── multiple.js            # 다중 데이터소스 예시
└── [기타 설정 파일들]
```

## 설정 파일 기본 구조

```javascript
/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],

  // 기본 데이터소스 지정 (필수)
  defaultDataSourceName: 'dicomweb',

  // 데이터소스 배열 (필수)
  dataSources: [
    // 데이터소스 객체들...
  ],

  // 기타 설정...
};
```

## 데이터소스 타입

### 1. DICOMweb 데이터소스

**Namespace:** `@ohif/extension-default.dataSourcesModule.dicomweb`

**용도:** PACS 서버, DICOMweb 표준 지원 서버 (DCM4CHEE, Orthanc, Google Cloud Healthcare API 등)

**기본 구조:**

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'dicomweb',  // 고유 식별자
  configuration: {
    // 표시 정보
    friendlyName: 'DCM4CHEE Server',
    name: 'DCM4CHEE',

    // 엔드포인트 (필수)
    wadoUriRoot: 'http://192.168.10.237:8080/dicomweb',
    qidoRoot: 'http://192.168.10.237:8080/dicomweb',
    wadoRoot: 'http://192.168.10.237:8080/dicomweb',

    // 서버 기능 플래그
    qidoSupportsIncludeField: true,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',

    // 기능 활성화
    enableStudyLazyLoad: true,
    dicomUploadEnabled: true,

    // 서버 특성
    supportsFuzzyMatching: false,
    supportsWildcard: true,
    staticWado: false,

    // 인증 (선택)
    requestOptions: {
      auth: 'username:password',
    },

    // 고급 설정
    singlepart: 'pdf,video',
    bulkDataURI: {
      enabled: true,
      relativeResolution: 'studies',  // 'studies' 또는 'series'
    },
    omitQuotationForMultipartRequest: true,
  },
}
```

### 2. DICOM JSON 데이터소스

**Namespace:** `@ohif/extension-default.dataSourcesModule.dicomjson`

**용도:** JSON 형식의 DICOM 메타데이터

**기본 구조:**

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
  sourceName: 'dicomjson',
  configuration: {
    friendlyName: 'dicom json',
    name: 'json',
  },
}
```

### 3. DICOM Local 데이터소스

**Namespace:** `@ohif/extension-default.dataSourcesModule.dicomlocal`

**용도:** 브라우저에서 로컬 파일 업로드 및 보기

**기본 구조:**

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
  sourceName: 'dicomlocal',
  configuration: {
    friendlyName: 'dicom local',
  },
}
```

## 주요 설정 항목 상세 설명

### 엔드포인트 설정

| 속성 | 필수 | 설명 | 예시 |
|------|------|------|------|
| `wadoUriRoot` | 선택 | WADO-URI 엔드포인트 | `http://server:8080/wado` |
| `qidoRoot` | 필수 | QIDO-RS 엔드포인트 (검색) | `http://server:8080/dicomweb` |
| `wadoRoot` | 필수 | WADO-RS 엔드포인트 (이미지) | `http://server:8080/dicomweb` |

**주의:** 대부분의 현대 서버는 WADO-RS를 사용하므로 `qidoRoot`와 `wadoRoot`만 설정하면 됩니다.

### 서버 기능 플래그

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `qidoSupportsIncludeField` | boolean | false | QIDO includefield 파라미터 지원 여부 |
| `supportsReject` | boolean | false | 스터디 거부(reject) 기능 지원 |
| `supportsStow` | boolean | false | STOW-RS (업로드) 지원 |
| `supportsFuzzyMatching` | boolean | false | 퍼지 매칭 검색 지원 |
| `supportsWildcard` | boolean | false | 와일드카드 검색 지원 |
| `staticWado` | boolean | false | 정적 WADO 서버 여부 (S3 등) |

### 렌더링 설정

| 속성 | 가능한 값 | 설명 |
|------|-----------|------|
| `imageRendering` | `'wadors'`, `'wadouri'` | 이미지 로딩 방식 |
| `thumbnailRendering` | `'wadors'`, `'wadouri'` | 썸네일 로딩 방식 |

**권장:** 최신 서버는 `'wadors'` 사용

### 성능 최적화

| 속성 | 타입 | 설명 |
|------|------|------|
| `enableStudyLazyLoad` | boolean | 스터디 지연 로딩 활성화 (권장: true) |
| `singlepart` | string | 단일 파트로 전송할 타입 (예: 'pdf,video,bulkdata') |

### BulkData URI 설정

```javascript
bulkDataURI: {
  enabled: true,                      // BulkData URI 사용 여부
  relativeResolution: 'studies',      // 'studies' 또는 'series'
  transform: url => url.replace(...), // URL 변환 함수 (선택)
}
```

**relativeResolution:**
- `'studies'`: BulkData URI가 스터디 레벨 기준 상대 경로
- `'series'`: BulkData URI가 시리즈 레벨 기준 상대 경로

### 인증 설정

```javascript
requestOptions: {
  auth: 'username:password',  // Basic 인증
  // 또는
  headers: {
    Authorization: 'Bearer token...',
  },
}
```

## Claude Code 에이전트 작업 시나리오

### 시나리오 1: 새로운 DICOMweb 데이터소스 추가

**작업:**
1. `dataSources` 배열에 새 객체 추가
2. 고유한 `sourceName` 지정
3. 서버 URL 설정
4. 서버 기능에 맞는 플래그 설정

**예시:**

```javascript
// 기존 dataSources 배열에 추가
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'hospital_pacs',
  configuration: {
    friendlyName: 'Hospital PACS',
    name: 'HospitalPACS',
    qidoRoot: 'https://pacs.hospital.com/dicomweb',
    wadoRoot: 'https://pacs.hospital.com/dicomweb',
    qidoSupportsIncludeField: true,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    requestOptions: {
      auth: 'admin:password',
    },
  },
}
```

### 시나리오 2: 기존 데이터소스 URL 변경

**작업:**
1. `sourceName`으로 해당 데이터소스 찾기
2. `qidoRoot`, `wadoRoot`, `wadoUriRoot` 업데이트

**Edit 도구 사용 예시:**

```javascript
// old_string
qidoRoot: 'http://old-server:8080/dicomweb',
wadoRoot: 'http://old-server:8080/dicomweb',

// new_string
qidoRoot: 'http://new-server:9090/dicomweb',
wadoRoot: 'http://new-server:9090/dicomweb',
```

### 시나리오 3: 인증 정보 추가/변경

**작업:**
1. `configuration` 객체 내에 `requestOptions` 추가 또는 수정

**예시:**

```javascript
// 인증 없음 → 인증 추가
configuration: {
  friendlyName: 'DCM4CHEE Server',
  // ... 기존 설정
  requestOptions: {
    auth: 'admin:newpassword',
  },
}
```

### 시나리오 4: 기본 데이터소스 변경

**작업:**
1. `defaultDataSourceName` 값을 원하는 `sourceName`으로 변경

**Edit 도구 사용:**

```javascript
// old_string
defaultDataSourceName: 'dicomweb',

// new_string
defaultDataSourceName: 'hospital_pacs',
```

### 시나리오 5: 데이터소스 삭제

**작업:**
1. `dataSources` 배열에서 해당 객체 전체 제거
2. 삭제하는 데이터소스가 `defaultDataSourceName`인 경우 다른 소스로 변경 필요

**주의:** 최소 1개의 데이터소스는 유지해야 함

### 시나리오 6: 다중 데이터소스 설정

**작업:**
여러 PACS 서버나 데이터 소스를 동시에 설정

**예시:**

```javascript
dataSources: [
  {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'primary_pacs',
    configuration: {
      friendlyName: 'Primary PACS',
      // ... 설정
    },
  },
  {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'backup_pacs',
    configuration: {
      friendlyName: 'Backup PACS',
      // ... 설정
    },
  },
  {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
    sourceName: 'dicomlocal',
    configuration: {
      friendlyName: 'Local Files',
    },
  },
]
```

## 서버별 권장 설정

### DCM4CHEE

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'dcm4chee',
  configuration: {
    friendlyName: 'DCM4CHEE Server',
    name: 'DCM4CHEE',
    qidoRoot: 'http://server:8080/dcm4chee-arc/aets/DCM4CHEE/rs',
    wadoRoot: 'http://server:8080/dcm4chee-arc/aets/DCM4CHEE/rs',
    qidoSupportsIncludeField: true,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    dicomUploadEnabled: true,
    singlepart: 'pdf,video',
    bulkDataURI: {
      enabled: true,
    },
    omitQuotationForMultipartRequest: true,
  },
}
```

### Orthanc

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'orthanc',
  configuration: {
    friendlyName: 'Orthanc Server',
    name: 'Orthanc',
    qidoRoot: 'http://server:8042/dicom-web',
    wadoRoot: 'http://server:8042/dicom-web',
    qidoSupportsIncludeField: false,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    dicomUploadEnabled: true,
    omitQuotationForMultipartRequest: true,
  },
}
```

### AWS S3 정적 서버

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'aws',
  configuration: {
    friendlyName: 'AWS S3 Static Server',
    name: 'aws',
    qidoRoot: 'https://cloudfront-url.cloudfront.net/dicomweb',
    wadoRoot: 'https://cloudfront-url.cloudfront.net/dicomweb',
    qidoSupportsIncludeField: false,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    supportsFuzzyMatching: true,
    supportsWildcard: false,
    staticWado: true,
    singlepart: 'bulkdata,video',
    bulkDataURI: {
      enabled: true,
      relativeResolution: 'studies',
    },
  },
}
```

### Google Cloud Healthcare API

```javascript
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
  sourceName: 'google',
  configuration: {
    friendlyName: 'Google Cloud Healthcare',
    name: 'google',
    qidoRoot: 'https://healthcare.googleapis.com/v1/projects/PROJECT/locations/LOCATION/datasets/DATASET/dicomStores/STORE/dicomWeb',
    wadoRoot: 'https://healthcare.googleapis.com/v1/projects/PROJECT/locations/LOCATION/datasets/DATASET/dicomStores/STORE/dicomWeb',
    qidoSupportsIncludeField: false,
    supportsReject: true,
    imageRendering: 'wadors',
    thumbnailRendering: 'wadors',
    enableStudyLazyLoad: true,
    supportsFuzzyMatching: true,
    supportsWildcard: true,
    bulkDataURI: {
      enabled: true,
      relativeResolution: 'studies',
    },
  },
}
```

## 필수 체크리스트 - 에이전트가 확인해야 할 사항

### 데이터소스 추가/수정 시

- [ ] `sourceName`이 고유한가? (다른 데이터소스와 중복 없음)
- [ ] `qidoRoot`와 `wadoRoot`가 올바른 URL 형식인가?
- [ ] `friendlyName`이 사용자 친화적인가?
- [ ] `imageRendering`과 `thumbnailRendering`이 설정되었는가?
- [ ] 인증이 필요한 서버인 경우 `requestOptions.auth` 설정되었는가?
- [ ] 문법 오류가 없는가? (쉼표, 중괄호, 따옴표)

### defaultDataSourceName 변경 시

- [ ] 지정한 `sourceName`이 `dataSources` 배열에 존재하는가?
- [ ] 해당 데이터소스가 올바르게 설정되어 있는가?

### 데이터소스 삭제 시

- [ ] 삭제 후에도 최소 1개의 데이터소스가 남아있는가?
- [ ] 삭제하려는 데이터소스가 `defaultDataSourceName`인 경우 다른 소스로 변경했는가?

## 일반적인 오류 및 해결 방법

### 오류 1: "Cannot find datasource"

**원인:** `defaultDataSourceName`에 지정한 이름이 `dataSources` 배열에 없음

**해결:**
```javascript
// defaultDataSourceName과 sourceName이 일치하는지 확인
defaultDataSourceName: 'dicomweb',
dataSources: [
  {
    sourceName: 'dicomweb',  // 일치해야 함
    // ...
  }
]
```

### 오류 2: CORS 오류

**원인:** 서버가 CORS를 허용하지 않거나 인증 헤더 문제

**해결:**
1. 서버 측 CORS 설정 확인
2. `showWarningMessageForCrossOrigin: false` 설정 (임시)

### 오류 3: 인증 실패

**원인:** 잘못된 인증 정보 또는 형식

**해결:**
```javascript
requestOptions: {
  auth: 'username:password',  // Basic 인증 형식 확인
}
```

### 오류 4: 이미지 로딩 실패

**원인:** 잘못된 `imageRendering` 설정 또는 URL

**해결:**
1. `imageRendering`을 `'wadors'`로 설정 (대부분의 서버)
2. `wadoRoot` URL이 올바른지 확인

## TypeScript 타입 체크

모든 설정 파일은 다음 주석으로 시작해야 합니다:

```javascript
/** @type {AppTypes.Config} */
window.config = {
  // ...
};
```

이 주석은 TypeScript 타입 체크를 활성화하여 설정 오류를 사전에 감지합니다.

## 참고 파일

에이전트가 참고해야 할 주요 파일:

- **타입 정의:** `platform/core/src/types/AppTypes.ts`
- **예시 설정:**
  - `platform/app/public/config/local_dcm4chee.js` - 단일 DCM4CHEE 서버
  - `platform/app/public/config/docker-nginx-orthanc.js` - 다중 데이터소스
  - `platform/app/public/config/multiple.js` - 여러 서버 설정 예시
  - `platform/app/public/config/aws.js` - AWS S3 정적 서버

## 에이전트 워크플로우 권장사항

### 1. 데이터소스 추가/수정 작업

```
1. Read 도구로 현재 설정 파일 읽기
2. 기존 dataSources 구조 파악
3. Edit 도구로 정확한 위치에 추가/수정
4. 문법 검증 (쉼표, 중괄호)
5. Read 도구로 변경 확인
```

### 2. 사용자에게 제공할 정보

변경 완료 후 사용자에게 다음을 안내:

1. 변경된 내용 요약
2. 애플리케이션 재시작 필요 여부
3. 테스트 방법
4. 추가 설정이 필요한 경우 안내

### 3. 에러 처리

설정 변경 중 오류 발생 시:

1. 명확한 오류 메시지 제공
2. 해결 방법 제시
3. 참고 파일 위치 안내

## 보안 고려사항

### 주의사항

1. **인증 정보:** `requestOptions.auth`에 평문 비밀번호 저장
   - 프로덕션 환경에서는 환경변수 또는 Keycloak 같은 SSO 사용 권장

2. **HTTPS 사용:** 프로덕션에서는 항상 HTTPS 사용
   ```javascript
   qidoRoot: 'https://server/dicomweb',  // HTTP 아닌 HTTPS
   ```

3. **공개 설정 파일:** 이 파일들은 브라우저에서 접근 가능하므로 민감한 정보 포함 금지

## 추가 리소스

- OHIF 공식 문서: https://docs.ohif.org/
- DICOMweb 표준: https://www.dicomstandard.org/dicomweb
- QIDO-RS: Query based on ID for DICOM Objects
- WADO-RS: Web Access to DICOM Objects
- STOW-RS: Store Over the Web

---

**작성일:** 2024-12-24
**대상:** Claude Code 에이전트
**유지관리:** 설정 파일 구조 변경 시 이 문서도 업데이트 필요
