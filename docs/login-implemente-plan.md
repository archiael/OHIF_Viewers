# OHIF 뷰어 로그인 기능 구현 계획서

## 1. 설계 정리

### 1.1 주요 시나리오 (유스케이스)

| # | 시나리오 | 설명 |
|---|---------|------|
| UC-1 | 비인증 사용자 PACS 접근 차단 | `/worklist` 접근 시 로그인 세션 확인 → 없으면 `/login`으로 리다이렉트 |
| UC-2 | 로그인 성공 후 리다이렉트 | ID/PW 입력 → `/v1/oauth/login` API 호출 → 세션 저장 → 원래 URL로 이동 |
| UC-3 | 로컬 라우트 예외 허용 | `/local`, `dicomlocal` 관련 경로는 인증 없이 접근 가능 |
| UC-4 | 세션 만료 처리 | 60분 비활동 시 세션 만료 → 다음 요청에서 로그인 페이지로 이동 |
| UC-5 | 다중 탭 로그아웃 동기화 | 한 탭에서 로그아웃 → 모든 탭에서 동시 로그아웃 |
| UC-6 | 서버 세션 무효화 | 로그아웃 시 `/v1/oauth/remove-session` 호출하여 서버측 세션 정리 |
| UC-7 | 페이지 새로고침 시 세션 복원 | sessionStorage/localStorage에서 세션 자동 복원 |

### 1.2 시퀀스 다이어그램

#### UC-1 + UC-2: 로그인 플로우
```
사용자 → 브라우저: /worklist 접속
브라우저 → PrivateRoute: 라우트 렌더링 요청
PrivateRoute → UserAuthContext: 인증 상태 확인
UserAuthContext → PrivateRoute: { enabled: true, user: null }
PrivateRoute → LoginRoutes: handleUnauthenticated() 호출
LoginRoutes → 브라우저: sessionStorage에 redirect URL 저장
LoginRoutes → 브라우저: /login으로 리다이렉트

사용자 → Login.tsx: ID/PW 입력 후 로그인 클릭
Login.tsx → Login.tsx: 비밀번호 AES-CBC 암호화
Login.tsx → 백엔드: POST /v1/oauth/login { user_id, password }
백엔드 → Login.tsx: { user_id, name, role, session_id, access_token, ... }
Login.tsx → AuthStateSync: saveAuthState() (sessionStorage + localStorage 암호화)
Login.tsx → UserAuthContext: setUser(user)
Login.tsx → window.config: dataSources에 sessionId 설정
Login.tsx → 브라우저: sessionStorage에서 redirect URL 읽어서 navigate
```

#### UC-3: 로컬 라우트 예외
```
사용자 → 브라우저: /worklist/local 접속
브라우저 → PrivateRoute: 라우트 렌더링 요청
PrivateRoute → isLocalRoute(): pathname='/local' 체크
isLocalRoute() → PrivateRoute: true (로컬 라우트)
PrivateRoute → 브라우저: children 렌더링 (인증 건너뜀)
```

#### UC-5: 다중 탭 로그아웃
```
탭A 사용자 → 탭A: 로그아웃 클릭
탭A → AuthStateSync: clearAuthState(true)
AuthStateSync → localStorage: 'ohif-logout-event' 설정 후 제거
localStorage → 탭B AuthStateListener: storage 이벤트 수신
탭B AuthStateListener → UserAuthContext: reset()
탭B AuthStateListener → 탭B 브라우저: /login으로 리다이렉트
```

### 1.3 컴포넌트/모듈 목록

#### 프런트엔드 (수정/생성 필요)

| 파일 | 역할 | 변경 내용 |
|------|------|----------|
| `platform/app/src/utils/isLocalRoute.ts` | **[신규]** 로컬 라우트 판별 유틸 | 생성 |
| `platform/app/src/routes/PrivateRoute.tsx` | 라우트 가드 | 인증 체크 활성화 + 예외 로직 |
| `platform/app/src/utils/LoginRoutes.tsx` | 인증 라우트 설정 | `enabled: true` + 서버 세션 API |
| `platform/app/src/routes/Login/Login.tsx` | 로그인 UI | API 엔드포인트 변경 |
| `platform/app/src/utils/AuthStateListener.tsx` | 전역 인증 리스너 | 로그아웃 리다이렉트 활성화 |
| `platform/app/.webpack/webpack.pwa.js` | 개발 서버 프록시 | `/v1/oauth` 프록시 추가 |

#### 프런트엔드 (수정 불필요 - 이미 구현됨)

| 파일 | 역할 | 상태 |
|------|------|------|
| `platform/app/src/utils/authStateSync.ts` | 세션 관리 (암호화/만료/동기화) | 완성됨 |
| `platform/app/src/App.tsx` | AuthStateListener + LoginRoutes 마운트 | 완성됨 |
| `platform/ui-next/.../UserAuthenticationProvider.tsx` | 인증 Context Provider | 완성됨 |

#### 백엔드 (기존 API - 수정 불필요)

| 엔드포인트 | 역할 |
|-----------|------|
| `POST /v1/oauth/login` | 로그인 (세션 생성) |
| `POST /v1/oauth/remove-session` | 로그아웃 (세션 삭제) |
| `POST /v1/oauth/search-session` | 세션 유효성 검증 |

#### 인프라 (Nginx - 프로덕션 배포 시)

| 설정 | 변경 내용 |
|------|----------|
| Nginx reverse proxy | `/v1/oauth/` → `http://192.168.0.202:8083` 프록시 추가 |

---

## 2. 인터페이스/계약 정의

### 2.1 API 명세

#### POST /v1/oauth/login

```
URL: /v1/oauth/login
Method: POST
Content-Type: application/json
```

**요청 (Request)**:
```json
{
  "username": "hbpark",
  "password": "fUx7d3+niqrW9vuNhmHNqA==",
  "client_info": "LocalHost:192.168.1.100,MacAddress:D8-BB-C1-76-2E-B5"
}
```

> **기존 v2 대비 변경점**: `user_id` → `username`, `client_info` 필드 추가

**응답 (Response) - 성공 200**:
```json
{
  "id": "hbpark",
  "role": "doctor",
  "name": "박희붕",
  "expiration": 0,
  "address": "192.168.1.100",
  "created": "string",
  "modified": "string",
  "certificate": {},
  "accessToken": "string",
  "refreshToken": "string",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "group": "Park breast clinic",
  "client_info": "LocalHost:192.168.1.100,MacAddress:D8-BB-C1-76-2E-B5"
}
```

> **기존 v2 대비 변경점 (snake_case → camelCase)**:
> - `user_id` → `id`
> - `session_id` → `sessionId`
> - `access_token` → `accessToken`
> - `refresh_token` → `refreshToken`
> - `token_type` → `tokenType`
> - 신규 필드: `expiration`, `address`, `created`, `modified`, `certificate`, `expiresIn`, `client_info`

**응답 - 실패**: 401 (인증 실패), 400 (Bad Request), 422 (Unprocessable Entity)

#### POST /v1/oauth/remove-session

```
URL: /v1/oauth/remove-session
Method: POST
Content-Type: application/json
```

**요청**:
```json
{
  "session": "550e8400-e29b-41d4-a716-446655440000",
  "search_session": "search-session-id"
}
```

> **주의**: 필드명은 `session` (sessionId 값 전달), `search_session`은 선택적

**응답 - 성공 200**: 로그아웃 성공
**응답 - 실패**: 401, 404, 422 (보호된 테스트 세션)

#### POST /v1/oauth/search-session

```
URL: /v1/oauth/search-session
Method: POST
Content-Type: application/json
```

**요청**:
```json
{
  "id": "hbpark",
  "session": "550e8400-e29b-41d4-a716-446655440000"
}
```

> **주의**: `id`는 사용자 ID, `session`은 sessionId 값

**응답 - 유효 200**: 세션 조회 성공
**응답 - 실패**: 404 (세션 미존재), 422 (id 필드 누락)

### 2.2 헤더/쿠키/상태코드

| 항목 | 값 | 설명 |
|------|---|------|
| Content-Type | `application/json` | 모든 API 요청/응답 |
| 200 | 성공 | 로그인/로그아웃/세션검증 성공 |
| 401 | Unauthorized | 잘못된 자격 증명 |
| 403 | Forbidden | 권한 없음 |
| 404 | Not Found | 세션 미존재 |
| 500 | Server Error | 서버 오류 |

### 2.3 클라이언트 세션 저장 구조

```typescript
// sessionStorage (현재 탭, Plain Text)
sessionStorage.getItem('user')         // JSON: { username, name, role, group, session_id, authenticated, loginTime }
sessionStorage.getItem('access_token') // string
sessionStorage.getItem('refresh_token') // string
sessionStorage.getItem('token_type')   // string
sessionStorage.getItem('ohif-redirect-to') // JSON: { pathname, search }

// localStorage (다중 탭 공유, AES-CBC 암호화)
localStorage.getItem('ohif-auth-state') // AES-CBC encrypted AuthState with expiresAt
```

---

## 3. 코드 예시

### 3.1 로컬 라우트 판별 유틸 (신규 생성)

**파일**: `platform/app/src/utils/isLocalRoute.ts`

```typescript
/**
 * BrowserRouter 내부 경로가 로컬 라우트인지 판별
 * 로컬 라우트는 인증 없이 접근 가능
 */
export function isLocalRoute(pathname: string, search: string): boolean {
  const lowerPath = pathname.toLowerCase();
  const lowerSearch = search.toLowerCase();

  // 로컬 파일 업로드 페이지
  if (lowerPath === '/local' || lowerPath === '/localbasic') {
    return true;
  }

  // dicomlocal 데이터소스 경로 (예: /usmpr/dicomlocal)
  if (lowerPath.includes('/dicomlocal')) {
    return true;
  }

  // dicomlocal 쿼리 파라미터 (예: /?datasources=dicomlocal)
  if (lowerSearch.includes('datasources=dicomlocal')) {
    return true;
  }

  return false;
}
```

### 3.2 PrivateRoute (인증 활성화 + 예외)

**파일**: `platform/app/src/routes/PrivateRoute.tsx`

```typescript
import { useLocation } from 'react-router-dom';
import { useUserAuthentication } from '@ohif/ui-next';
import { isLocalRoute } from '../utils/isLocalRoute';

export const PrivateRoute = ({ children, handleUnauthenticated }) => {
  const [{ user, enabled }] = useUserAuthentication();
  const location = useLocation();

  // 로컬 라우트는 인증 불필요
  if (isLocalRoute(location.pathname, location.search)) {
    return children;
  }

  // 인증 활성화 상태에서 사용자 미인증 시 처리
  if (enabled && !user) {
    return handleUnauthenticated();
  }

  return children;
};

export default PrivateRoute;
```

### 3.3 LoginRoutes (인증 활성화 + 서버 연동)

**파일**: `platform/app/src/utils/LoginRoutes.tsx` (주요 변경 부분)

```typescript
useEffect(() => {
  // ✅ 인증 활성화
  userAuthenticationService.set({ enabled: true });

  userAuthenticationService.setServiceImplementation({
    handleUnauthenticated,
  });

  // 세션 복원
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.loadAuthState().then(authState => {
    if (authState) {
      const { user } = authState;
      userAuthenticationService.setUser(user);

      if (user.session_id && window.config?.dataSources) {
        window.config.dataSources.forEach(ds => {
          if (ds.configuration?.defaultQueryParams) {
            ds.configuration.defaultQueryParams.sessionId = user.session_id;
          }
        });
      }
    }
  });
}, [userAuthenticationService, navigate]);
```

### 3.4 Login.tsx (API 엔드포인트 + 필드 매핑 변경)

**파일**: `platform/app/src/routes/Login/Login.tsx`

```typescript
// ── 요청 변경: user_id → username, client_info 추가 ──
const response = await fetch('/v1/oauth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: username,          // 변경: user_id → username
    password: encryptedPassword,
    client_info: '',             // 웹 클라이언트는 빈 문자열 또는 생략
  }),
});

const data = await response.json();

// ── 응답 매핑 변경: snake_case → camelCase ──
const user = {
  username: data.id,             // 변경: data.user_id → data.id
  name: data.name,
  role: data.role,
  group: data.group,
  session_id: data.sessionId,    // 변경: data.session_id → data.sessionId
  authenticated: true,
  loginTime: new Date().toISOString(),
};

const authStateSync = AuthStateSync.getInstance();
await authStateSync.saveAuthState({
  user,
  access_token: data.accessToken,    // 변경: data.access_token → data.accessToken
  refresh_token: data.refreshToken,  // 변경: data.refresh_token → data.refreshToken
  token_type: data.tokenType,        // 변경: data.token_type → data.tokenType
});
```

**v2 → v1 필드 매핑 요약:**
| 기존 코드 (v2) | 새 API (v1) | 위치 |
|---|---|---|
| `user_id` (요청) | `username` | Request body |
| `data.user_id` | `data.id` | Response → user.username |
| `data.session_id` | `data.sessionId` | Response → user.session_id |
| `data.access_token` | `data.accessToken` | Response → AuthState |
| `data.refresh_token` | `data.refreshToken` | Response → AuthState |
| `data.token_type` | `data.tokenType` | Response → AuthState |

### 3.5 AuthStateListener (로그아웃 리다이렉트)

```typescript
import { isLocalRoute } from './isLocalRoute';

// 로그아웃 감지
const unsubscribe = authStateSync.subscribe(newState => {
  if (!newState) {
    userAuthenticationService.reset();
    // 로컬 라우트가 아닌 경우에만 리다이렉트
    const basename = window.config?.routerBasename || '/';
    const internalPath = window.location.pathname.replace(basename, '') || '/';
    if (!isLocalRoute(internalPath, window.location.search)) {
      navigate('/login');
    }
  }
});
```

### 3.6 Webpack 프록시 (개발 서버)

```javascript
// webpack.pwa.js - getDefaultProxyConfig() 함수 내
{
  context: ['/v1/oauth'],
  target: dicomwebTarget,  // http://192.168.0.202:8083
  changeOrigin: true,
  secure: false,
  logLevel: 'debug',
},
```

### 3.7 Nginx 설정 (프로덕션)

```nginx
# /v1/oauth API 프록시
location /v1/oauth/ {
    proxy_pass http://192.168.0.202:8083/v1/oauth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 4. 추가 개선 포인트

### 4.1 보안 측면

| 항목 | 현재 상태 | 개선 방안 |
|------|---------|----------|
| 토큰 보관 | sessionStorage (XSS 취약) | HttpOnly 쿠키 전환 (서버 수정 필요) |
| CSRF | 미적용 | CSRF 토큰 또는 SameSite 쿠키 적용 |
| HTTPS | 개발: HTTP, 프로덕션: HTTPS | 프로덕션에서 HTTPS 강제 |
| 암호화 키 | `.env` 파일 하드코딩 | 환경 변수 주입 (Docker Secrets 등) |
| 세션 만료 | 클라이언트 60분 | 서버측 세션 만료와 동기화 |

### 4.2 확장 가능성

| 항목 | 설명 |
|------|------|
| 역할/권한 (RBAC) | `user.role` 기반 UI 제어 (예: admin만 특정 도구 표시) |
| SSO 연동 | OIDC 인프라 이미 존재 (`OpenIdConnectRoutes.tsx`) |
| 자동 로그아웃 | 비활동 감지 타이머 + 경고 모달 |
| 감사 로그 | 로그인/로그아웃 이벤트 서버 기록 |

---

## 5. 구현 순서 및 테스트 체크리스트

### Step 1: 인프라 준비 (isLocalRoute + Webpack 프록시)
- [ ] `isLocalRoute.ts` 파일 생성
- [ ] webpack.pwa.js에 `/v1/oauth` 프록시 추가
- [ ] `yarn dev:dcm4chee` 실행하여 프록시 동작 확인

### Step 2: Login API 변경
- [ ] Login.tsx에서 `/v2/auth/login` → `/v1/oauth/login` 변경
- [ ] `/worklist/login` 접속하여 로그인 성공 확인
- [ ] Network 탭에서 올바른 API 호출 확인

### Step 3: 인증 활성화 (핵심)
- [ ] PrivateRoute.tsx 인증 체크 활성화 + 로컬 예외
- [ ] LoginRoutes.tsx `enabled: true` 변경
- [ ] 비로그인 → `/worklist` 접근 → `/login` 리다이렉트 확인
- [ ] 비로그인 → `/worklist/local` 접근 → 정상 렌더링 확인
- [ ] 비로그인 → `/worklist?datasources=dicomlocal` → 정상 렌더링 확인
- [ ] 로그인 성공 → 원래 URL로 리다이렉트 확인
- [ ] 페이지 새로고침 → 세션 유지 확인

### Step 4: 다중 탭 로그아웃
- [ ] AuthStateListener.tsx 리다이렉트 활성화
- [ ] 탭 A 로그아웃 → 탭 B 리다이렉트 확인
- [ ] 로컬 라우트 탭은 리다이렉트 제외 확인

### Step 5: 서버 세션 정리
- [ ] LogoutComponent에서 `/v1/oauth/remove-session` 호출 추가
  ```typescript
  // 요청 형태
  await fetch('/v1/oauth/remove-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: authState.user.session_id }),
  });
  ```
- [ ] 서버 API 호출 확인 (Network 탭)
- [ ] 서버 실패해도 클라이언트 로그아웃 정상 동작 확인

### Step 6 (선택): 세션 유효성 검증
- [ ] 페이지 로드 시 `/v1/oauth/search-session` 호출
  ```typescript
  // 요청 형태
  const response = await fetch('/v1/oauth/search-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: authState.user.username, session: authState.user.session_id }),
  });
  // 200 = 유효, 404 = 무효
  ```
- [ ] 서버 세션 무효 시 클라이언트 세션 클리어 확인

---

**작성일**: 2026-03-09
**작성자**: Claude Code
**프로젝트**: mView-Web V2 (OHIF v3.12.0-beta)
