# 로그인 프로세스 분석 문서

## 1. 개요

### 목적
mView-Web V2의 로그인 시스템은 OHIF Viewer에 세션 기반 인증을 추가하여 PACS 서버 접근을 보호한다. 로컬 파일 뷰잉은 인증 없이 허용하되, DICOMweb 기반 원격 데이터 접근에는 인증을 요구한다.

### 범위
- 사용자 로그인/로그아웃
- 세션 저장 및 복원 (sessionStorage + localStorage)
- 다중 탭 세션 동기화
- 서버 세션 검증 및 자동 갱신
- 계정 잠금 (brute-force 방어)
- 로컬 라우트 인증 예외

### 구현 상태
모든 컴포넌트 100% 완성. 10개 파일로 구성.

---

## 2. 아키텍처 개요

### 컴포넌트 의존성 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        App.tsx (루트)                            │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ AuthStateListener│  │ LoginRoutes  │  │   appRoutes       │  │
│  │   (전역 리스너)   │  │ (인증 라우트) │  │ ┌───────────────┐│  │
│  └────────┬─────────┘  └──────┬───────┘  │ │ PrivateRoute  ││  │
│           │                   │          │ │  (라우트 가드)  ││  │
│           │                   │          │ └───────┬───────┘│  │
│           │                   │          └─────────┼────────┘  │
│           ▼                   ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  AuthStateSync (Singleton)               │   │
│  │        sessionStorage + localStorage (암호화)            │   │
│  └──────────────────────┬──────────────────────────────────┘   │
└─────────────────────────┼──────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌──────────────┐ ┌───────────────┐ ┌──────────────┐
│  loginAPI.ts │ │sessionValidator│ │loginLockout.ts│
│ (AES + fetch)│ │  (서버 검증)   │ │ (계정 잠금)   │
└──────┬───────┘ └───────┬───────┘ └──────────────┘
       │                 │
       ▼                 ▼
┌──────────────────────────────┐
│     Backend API Server       │
│  /v1/oauth/login             │
│  /v1/oauth/remove-session    │
│  /v1/oauth/search-session    │
└──────────────────────────────┘
```

### 10개 파일의 역할

| # | 파일 | 줄 수 | 역할 | 패턴 |
|---|------|-------|------|------|
| 1 | `Login.tsx` | 283 | 로그인 UI + 폼 처리 | React Component |
| 2 | `loginAPI.ts` | 86 | 비밀번호 암호화 + API 호출 | Pure Function |
| 3 | `authStateSync.ts` | 301 | 세션 저장/복원/동기화 | Singleton + Observer |
| 4 | `AuthStateListener.tsx` | 128 | 전역 인증 리스너 + Fetch Interceptor | Invisible Component |
| 5 | `LoginRoutes.tsx` | 142 | 인증 라우트 + 세션 복원 | React Component |
| 6 | `PrivateRoute.tsx` | 41 | 라우트 가드 (인증 체크) | HOC |
| 7 | `isLocalRoute.ts` | 28 | 로컬 라우트 판별 | Pure Function |
| 8 | `sessionValidator.ts` | 173 | 서버 세션 검증 (중앙화) | Module + Promise Coalescing |
| 9 | `loginLockout.ts` | 112 | 계정 잠금 메커니즘 | Pure Function |
| 10 | `.env` | 24 | 암호화 키, 프록시 설정 | 환경 변수 |

---

## 3. 핵심 프로세스 분석

### 3.1 로그인 프로세스 (UC-2)

**경로**: `Login.tsx` → `loginAPI.ts` → `authStateSync.ts` → 리다이렉트

```
사용자                Login.tsx           loginAPI.ts        loginLockout.ts    Backend
  │                      │                    │                   │               │
  │─ ID/PW 입력 ────────▶│                    │                   │               │
  │                      │─ checkLockout() ──▶│                   │               │
  │                      │◀── {locked:false} ─│                   │               │
  │                      │                    │                   │               │
  │                      │─ callLoginAPI() ──▶│                   │               │
  │                      │                    │─ encryptPassword()│               │
  │                      │                    │  (AES-CBC)        │               │
  │                      │                    │                   │               │
  │                      │                    │─── POST /v1/oauth/login ─────────▶│
  │                      │                    │◀── { id, sessionId, ... } ────────│
  │                      │◀── LoginResponse ──│                   │               │
  │                      │                    │                   │               │
  │                      │─ clearLockout() ──────────────────────▶│               │
  │                      │                    │                   │               │
  │                      │─ saveAuthState() ──▶ AuthStateSync     │               │
  │                      │  (sessionStorage + localStorage)       │               │
  │                      │                    │                   │               │
  │                      │─ setUser(user)     │                   │               │
  │                      │─ resetValidationTimer()                │               │
  │                      │─ navigate(redirectURL)                 │               │
  │◀─────── 리다이렉트 ──│                    │                   │               │
```

**핵심 코드** (`Login.tsx:69-165`):

1. **입력 검증** → username, password 비어있으면 에러
2. **잠금 확인** → `checkLockout(username)` (5회 실패 시 잠금 상태)
3. **API 호출** → `callLoginAPI(username, password)` (암호화 + fetch)
4. **실패 처리** → 401 시 `recordFailedAttempt()`, 경고 메시지 표시
5. **성공 처리**:
   - `clearLockout(username)` — 잠금 기록 초기화
   - `AuthStateSync.saveAuthState()` — 세션 저장
   - `setUser(user)` — React 전역 상태 업데이트
   - `window.config.dataSources`에 `sessionId` 설정
   - `resetValidationTimer()` — 검증 쿨다운 초기화
   - `sessionStorage.ohif-redirect-to`에서 원래 URL 읽어 리다이렉트

### 3.2 비인증 사용자 차단 (UC-1)

**경로**: `PrivateRoute.tsx` → `/login` 리다이렉트

```
사용자 → /worklist 접속
  → React Router가 PrivateRoute 렌더링
    → isLocalRoute() 체크 → false
    → enabled=true, user=null → needsAuth=true
    → useEffect에서:
      1. sessionStorage에 { pathname, search } 저장 (키: 'ohif-redirect-to')
      2. navigate('/login', { replace: true })
    → 즉시 null 반환 (children 렌더링 방지)
```

**핵심 코드** (`PrivateRoute.tsx:6-38`):

```typescript
const isLocal = isLocalRoute(location.pathname, location.search);
const needsAuth = enabled && !user && !isLocal;

useEffect(() => {
  if (needsAuth) {
    sessionStorage.setItem('ohif-redirect-to', JSON.stringify({ pathname, search }));
    navigate('/login', { replace: true });
  }
}, [needsAuth, location.pathname, location.search, navigate]);
```

> **설계 결정**: `navigate()`를 `useEffect` 내에서 호출한다. 렌더 중 호출하면 브라우저 뒤로가기(POP) 이벤트와 충돌하여 `replace: true`가 무시되는 버그가 발생한다.

### 3.3 로컬 라우트 예외 (UC-3)

**경로**: `isLocalRoute.ts` → PrivateRoute에서 인증 스킵

```typescript
// isLocalRoute.ts — 3가지 조건 중 하나라도 매칭되면 true
export function isLocalRoute(pathname: string, search: string): boolean {
  // 1. /local, /localbasic → 로컬 파일 업로드 페이지
  // 2. /dicomlocal 포함 → 로컬 데이터소스 뷰어 (예: /usmpr/dicomlocal)
  // 3. ?datasources=dicomlocal → 로컬 데이터소스 WorkList
}
```

**사용처**: `PrivateRoute.tsx`, `AuthStateListener.tsx` (로그아웃 시 리다이렉트 제외)

### 3.4 세션 복원 (UC-7)

**경로**: `LoginRoutes.tsx`의 3-step 복원 과정

```
페이지 새로고침
  │
  ▼
Step 1: 동기 복원 (race condition 방지)
  │ sessionStorage.getItem('user') → JSON.parse
  │ userAuthenticationService.setUser(user)
  │ window.config.dataSources에 sessionId 설정
  │
  ▼
Step 2: 인증 활성화
  │ userAuthenticationService.set({ enabled: true })
  │ (Step 1에서 user가 이미 설정되어 있으므로 PrivateRoute가 /login으로 리다이렉트하지 않음)
  │
  ▼
Step 3: 비동기 서버 세션 검증 (백그라운드)
  │ authStateSync.loadAuthState()
  │ → validateServerSession({ force: true })
  │ → 유효: setUser(user) 갱신
  │ → 무효: invalidateSessionAndRedirect() → /login
```

> **설계 결정**: Step 1의 동기 복원이 핵심이다. `loadAuthState()`는 async이므로 `.then()`이 microtask queue로 지연된다. `set({ enabled: true })` 후 PrivateRoute가 re-render될 때 user가 아직 null이면 불필요한 `/login` 리다이렉트가 발생한다. 동기 복원으로 이를 방지한다.

**cancelled 플래그** (`LoginRoutes.tsx:12,44,51`):
```typescript
let cancelled = false;
// ... async chain ...
if (cancelled) return;  // location 변경 후 stale async chain 방지
return () => { cancelled = true; };
```

### 3.5 세션 자동 갱신

**경로**: `AuthStateListener.tsx`의 Fetch Interceptor

```
DICOM 이미지 요청 (예: WADO-RS)
  │
  ▼
window.fetch (Interceptor)
  │─ originalFetch(...args)
  │─ response.ok && !isLoginRequest?
  │   → YES: authStateSync.refreshSession() (비동기, fire-and-forget)
  │   → 401/403 && !isLoginRequest && !isSessionCheck?
  │       → validateServerSession({ force: true })
  │       → 무효: invalidateSessionAndRedirect()
  │
  ▼
return response (원래 응답 반환)
```

**refreshSession() 동작** (`authStateSync.ts:237-267`):
1. localStorage에서 암호화된 인증 상태 읽기
2. 복호화 → `expiresAt` 확인 (이미 만료면 갱신 안 함)
3. 새 `expiresAt` = `Date.now() + 60분`
4. 다시 암호화하여 localStorage에 저장

> **효과**: 사용자가 뷰어를 사용하는 동안 서버 요청이 발생할 때마다 세션이 60분씩 연장된다. 모든 탭을 닫고 60분 후에야 세션이 만료된다.

### 3.6 서버 세션 검증

**경로**: `sessionValidator.ts`

```
validateServerSession(options)
  │
  ├─ 쿨다운 체크: 10초 이내 검증했으면 → RESULT_VALID 즉시 반환 (force=true 제외)
  │
  ├─ Promise Coalescing: 이미 검증 중이면 → 기존 Promise 재사용
  │
  └─ _doValidation():
      │─ authStateSync.loadAuthState() → username, session_id 가져오기
      │─ window.__originalFetch('/v1/oauth/search-session', ...)
      │   (Fetch Interceptor 재귀 방지를 위해 원본 fetch 사용)
      │
      ├─ 200 + result 배열 존재:
      │   └─ 서버 세션 정보 vs 로컬 정보 비교
      │       → 일치: { valid: true, changed: false }
      │       → 불일치: { valid: true, changed: true }
      │
      ├─ 200 + result 비어있음/null:
      │   └─ { valid: false, changed: false }
      │
      ├─ 401/404:
      │   └─ { valid: false, changed: false }
      │
      ├─ 500 등 기타:
      │   └─ { valid: true, changed: false } (오프라인 퍼스트)
      │
      └─ 네트워크 오류:
          └─ { valid: true, changed: false } (오프라인 퍼스트)
```

**쿨다운 메커니즘** (`sessionValidator.ts:24-38`):
- `lastValidationTime` 모듈 변수로 마지막 검증 시각 저장
- `VALIDATION_COOLDOWN_MS = 10_000` (10초)
- 빠른 탭 전환 시 과도한 API 호출 방지

**Promise Coalescing** (`sessionValidator.ts:42-51`):
```typescript
if (validationInFlight) {
  return validationInFlight;  // 기존 Promise 재사용
}
validationInFlight = _doValidation();
try {
  return await validationInFlight;
} finally {
  validationInFlight = null;
}
```

### 3.7 다중 탭 로그아웃 동기화 (UC-5)

**경로**: localStorage storage event → `AuthStateSync.subscribe()` → `AuthStateListener`

```
탭 A: 로그아웃 클릭
  │
  ▼
탭 A: authStateSync.clearAuthState(true)
  │─ sessionStorage 클리어 (user, access_token, ...)
  │─ localStorage 클리어 (ohif-auth-state)
  │─ localStorage.setItem('ohif-logout-event', timestamp)
  │─ localStorage.removeItem('ohif-logout-event')
  │   (set+remove로 storage 이벤트 트리거)
  │
  ▼
탭 B: window 'storage' 이벤트 수신
  │ (같은 origin의 다른 탭에서만 발생)
  │
  ▼
탭 B: authStateSync.handleStorageEvent()
  │─ key === 'ohif-logout-event'?
  │   → clearAuthState(false)  // triggerEvent=false로 무한 루프 방지
  │   → notifyListeners(null)
  │
  ▼
탭 B: AuthStateListener의 subscribe 콜백
  │─ newState === null?
  │   → userAuthenticationService.reset()
  │   → isLocalRoute() 체크 → false이면 navigate('/login')
```

> **설계 결정**: `localStorage.setItem()` + `localStorage.removeItem()`을 연속 호출하여 storage 이벤트를 트리거한다. 값을 저장하고 즉시 제거하면 데이터가 남지 않으면서 이벤트는 발생한다. `clearAuthState(triggerEvent=false)`로 수신 측에서 재전파를 방지하여 무한 루프를 차단한다.

### 3.8 로그아웃 프로세스 (UC-6)

**경로**: `LoginRoutes.tsx`의 `LogoutComponent`

```
사용자 → /logout 접근
  │
  ▼
LogoutComponent useEffect
  │
  ├─ 1. 서버 세션 무효화 (실패해도 계속 진행)
  │   │ authStateSync.loadAuthState() → session_id 가져오기
  │   │ POST /v1/oauth/remove-session { session: session_id }
  │   └─ (try-catch로 감싸서 서버 오류 시에도 클라이언트 로그아웃 진행)
  │
  ├─ 2. 클라이언트 세션 클리어
  │   │ authStateSync.clearAuthState() → 모든 탭에 로그아웃 전파
  │   └─ userAuthenticationService.reset() → React 상태 초기화
  │
  └─ 3. 리다이렉트
      └─ navigate('/login', { replace: true }) → 히스토리 스택에서 /logout 제거
```

### 3.9 계정 잠금 (보안)

**경로**: `loginLockout.ts`

```
로그인 시도
  │
  ├─ checkLockout(username):
  │   ├─ localStorage에서 LockoutRecord 로드
  │   ├─ lockedUntil이 현재 시간 이후? → { locked: true, remainingMs }
  │   └─ 잠금 만료됨? → failCount=0 초기화 → { locked: false }
  │
  ├─ 로그인 실패 (401):
  │   └─ recordFailedAttempt(username):
  │       ├─ failCount += 1
  │       ├─ failCount >= 5? → lockedUntil = now + 30분 → { locked: true }
  │       └─ failCount >= 3? → { showWarning: true, remainingAttempts }
  │
  └─ 로그인 성공:
      └─ clearLockout(username) → records에서 해당 사용자 삭제
```

**카운트다운 UI** (`Login.tsx:32-67`):
- `lockoutRemaining` state: 밀리초 단위 잔여 시간
- `setInterval(1000ms)`로 매초 감소
- `formatLockoutTime()`: `MM:SS` 형식 표시
- 0 도달 시 잠금 해제 + 메시지 초기화

**저장 구조**:
```typescript
// localStorage 키: 'ohif-login-lockout'
{
  "manager": { "failCount": 3, "lockedUntil": null },
  "admin":   { "failCount": 5, "lockedUntil": 1741593600000 }
}
```

> **설계 결정**: 사용자별(`normalizeUsername()`으로 소문자 변환) 독립적인 잠금 기록을 유지한다. 로그인 성공 시 해당 사용자의 기록만 삭제한다.

---

## 4. 데이터 흐름

### 세션 데이터 저장 구조

```typescript
interface AuthState {
  user: {
    username: string;       // 로그인 ID (API 응답의 data.id)
    name: string;           // 사용자 이름
    role: string;           // 역할 (doctor, admin 등)
    group: string;          // 소속 그룹
    session_id: string;     // 서버 세션 ID (API 응답의 data.sessionId)
    authenticated: boolean; // true (로그인 성공)
    loginTime: string;      // ISO 8601 타임스탬프
  };
  access_token: string;     // JWT 액세스 토큰
  refresh_token: string;    // JWT 리프레시 토큰
  token_type: string;       // "Bearer"
  expiresAt?: number;       // Unix timestamp (ms) — localStorage에만 포함
}
```

### sessionStorage vs localStorage 비교

| 항목 | sessionStorage | localStorage |
|------|---------------|--------------|
| **역할** | Primary (현재 탭) | Backup (탭 공유) |
| **암호화** | Plain Text | AES-CBC 암호화 |
| **수명** | 탭 닫으면 삭제 | 명시적 삭제까지 유지 |
| **만료 체크** | 없음 | `expiresAt` 필드로 60분 후 만료 |
| **키** | `user`, `access_token`, `refresh_token`, `token_type` | `ohif-auth-state` |
| **용도** | 빠른 동기 복원 | 새 탭에서 세션 공유 |

### AES-CBC 암호화/복호화 흐름

```
┌─ 암호화 (saveAuthState) ─────────────────────────────────────────┐
│                                                                   │
│  AuthState JSON                                                   │
│       │                                                           │
│       ▼                                                           │
│  TextEncoder.encode(json)  → Uint8Array (plaintext)               │
│       │                                                           │
│       ▼                                                           │
│  crypto.subtle.importKey('raw', keyData, 'AES-CBC')               │
│  crypto.subtle.encrypt({ name: 'AES-CBC', iv: ivData }, ...)      │
│       │                                                           │
│       ▼                                                           │
│  ArrayBuffer → Uint8Array → btoa() → Base64 string               │
│       │                                                           │
│       ▼                                                           │
│  localStorage.setItem('ohif-auth-state', base64String)            │
└───────────────────────────────────────────────────────────────────┘

┌─ 복호화 (loadAuthState) ─────────────────────────────────────────┐
│                                                                   │
│  localStorage.getItem('ohif-auth-state') → Base64 string          │
│       │                                                           │
│       ▼                                                           │
│  atob(base64) → charCodeAt() → Uint8Array (ciphertext)           │
│       │                                                           │
│       ▼                                                           │
│  crypto.subtle.importKey('raw', keyData, 'AES-CBC')               │
│  crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivData }, ...)      │
│       │                                                           │
│       ▼                                                           │
│  ArrayBuffer → TextDecoder.decode() → JSON string                 │
│       │                                                           │
│       ▼                                                           │
│  JSON.parse() → AuthState 객체                                    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. API 명세 (실제 사용 중)

### POST /v1/oauth/login

**요청**:
```json
{
  "username": "hbpark",
  "password": "fUx7d3+niqrW9vuNhmHNqA==",
  "client_info": ""
}
```
- `password`: AES-CBC로 암호화된 Base64 문자열
- `client_info`: 웹 클라이언트는 빈 문자열

**응답 (200)**:
```json
{
  "id": "hbpark",
  "name": "박희붕",
  "role": "doctor",
  "group": "Park breast clinic",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "tokenType": "Bearer"
}
```

**에러**: 401 (인증 실패), 400 (Bad Request)

**호출 위치**: `loginAPI.ts:62-85`

---

### POST /v1/oauth/remove-session

**요청**:
```json
{
  "session": "550e8400-e29b-41d4-a716-446655440000"
}
```

**응답**: 200 (성공), 401 (인증 실패), 404 (세션 없음)

**호출 위치**: `LoginRoutes.tsx:113-117` (LogoutComponent)

---

### POST /v1/oauth/search-session

**요청**:
```json
{
  "id": "hbpark",
  "session": "550e8400-e29b-41d4-a716-446655440000"
}
```

**응답 (200)**:
```json
{
  "result": [
    {
      "id": "hbpark",
      "name": "박희붕",
      "role": "doctor",
      "group": "Park breast clinic",
      "session": "550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}
```

**에러**: 404 (세션 없음), 422 (id 필드 누락)

**호출 위치**: `sessionValidator.ts:65-72`

---

## 6. 파일별 상세 분석

### 6.1 Login.tsx

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/routes/Login/Login.tsx` |
| **줄 수** | 283 |
| **패턴** | React Functional Component |
| **의존** | `loginAPI.ts`, `authStateSync.ts`, `sessionValidator.ts`, `loginLockout.ts` |

**핵심 함수**:
- `handleLogin()` (L69-165): 로그인 전체 흐름 처리
- `activateLockout(remainingMs)` (L52-58): 잠금 UI 활성화
- `handleKeyPress(e)` (L167-171): Enter 키 로그인

**상태 (useState)**:
- `username`, `password`: 입력 필드
- `error`: 에러 메시지
- `isLoading`: 로딩 스피너
- `showPassword`: 비밀번호 표시 토글
- `isCapsLockOn`: Caps Lock 감지
- `lockoutMessage`, `lockoutRemaining`: 잠금 UI

---

### 6.2 loginAPI.ts

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/loginAPI.ts` |
| **줄 수** | 86 |
| **패턴** | Pure Function (상태 없음) |
| **의존** | Web Crypto API, 환경 변수 |

**핵심 함수**:
- `encryptPassword(password)` (L4-47): AES-CBC 암호화 → Base64 반환
- `callLoginAPI(username, password)` (L62-85): 암호화 + fetch 호출

**타입 정의**:
- `LoginResponse` (L50-59): API 응답 인터페이스

---

### 6.3 authStateSync.ts

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/authStateSync.ts` |
| **줄 수** | 301 |
| **패턴** | Singleton + Observer (PubSub) |
| **의존** | Web Crypto API, 환경 변수 |

**클래스**: `AuthStateSync`

**핵심 메서드**:
- `getInstance()` (L55-59): 싱글턴 인스턴스 반환
- `saveAuthState(authState)` (L129-155): sessionStorage + localStorage(암호화)에 저장
- `loadAuthState()` (L160-204): sessionStorage → localStorage 순서로 복원
- `clearAuthState(triggerEvent)` (L210-231): 양쪽 스토리지 클리어 + 로그아웃 이벤트 전파
- `refreshSession()` (L237-267): localStorage의 `expiresAt` 갱신
- `subscribe(listener)` (L272-275): 상태 변경 구독 (언구독 함수 반환)
- `handleStorageEvent(event)` (L280-293): 다른 탭의 storage 이벤트 처리

**상수**:
- `DEFAULT_SESSION_DURATION`: 60분 (3,600,000ms)
- `STORAGE_KEYS.AUTH_STATE`: `'ohif-auth-state'`
- `STORAGE_KEYS.LOGOUT_EVENT`: `'ohif-logout-event'`
- `STORAGE_KEYS.LOGIN_EVENT`: `'ohif-login-event'`

---

### 6.4 AuthStateListener.tsx

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/AuthStateListener.tsx` |
| **줄 수** | 128 |
| **패턴** | Invisible Component (렌더링 없음) + Interceptor |
| **의존** | `authStateSync.ts`, `isLocalRoute.ts`, `sessionValidator.ts` |

**핵심 로직** (단일 `useEffect` 내):
1. **로그아웃 구독** (L31-39): `authStateSync.subscribe()` — 다른 탭 로그아웃 감지
2. **탭 포커스 핸들러** (L42-66): `visibilitychange` — sessionId 동기화 + 서버 세션 검증
3. **Fetch Interceptor** (L71-112): `window.fetch` 오버라이드 — 세션 갱신 + 401/403 감지

**설계 특징**:
- `locationRef` (L22-25): Fetch Interceptor 클로저에서 최신 location 참조
- `window.__originalFetch` (L73): sessionValidator가 Interceptor를 우회할 수 있도록 원본 fetch 저장
- Cleanup (L114-121): 구독 해제 + 이벤트 리스너 제거 + fetch 복원

---

### 6.5 LoginRoutes.tsx

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/LoginRoutes.tsx` |
| **줄 수** | 142 |
| **패턴** | React Component (라우트 + 초기화) |
| **의존** | `authStateSync.ts`, `sessionValidator.ts`, `Login.tsx` |

**라우트**:
- `/login` → `<Login />`
- `/logout` → `<LogoutComponent />`

**내부 컴포넌트**:
- `LogoutComponent` (L104-139): 서버 세션 무효화 + 클라이언트 클리어 + 리다이렉트

**조건부 렌더링** (L78-83): 현재 경로가 `/login` 또는 `/logout`일 때만 Routes 렌더링

---

### 6.6 PrivateRoute.tsx

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/routes/PrivateRoute.tsx` |
| **줄 수** | 41 |
| **패턴** | HOC (Higher-Order Component) |
| **의존** | `isLocalRoute.ts`, `@ohif/ui-next` |

**판별 로직**: `needsAuth = enabled && !user && !isLocal`
- `enabled`: `LoginRoutes.tsx`에서 `true`로 설정
- `user`: `UserAuthenticationService`에서 가져옴
- `isLocal`: `isLocalRoute(pathname, search)` 결과

---

### 6.7 isLocalRoute.ts

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/isLocalRoute.ts` |
| **줄 수** | 28 |
| **패턴** | Pure Function |
| **의존** | 없음 |

**3가지 매칭 조건**:
1. `pathname === '/local'` 또는 `'/localbasic'`
2. `pathname.includes('/dicomlocal')`
3. `search.includes('datasources=dicomlocal')`

---

### 6.8 sessionValidator.ts

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/sessionValidator.ts` |
| **줄 수** | 173 |
| **패턴** | Module (모듈 레벨 상태) + Promise Coalescing |
| **의존** | `authStateSync.ts` |

**핵심 함수**:
- `validateServerSession(options)` (L33-52): 쿨다운 + coalescing + 검증
- `_doValidation()` (L54-136): 실제 서버 검증 로직
- `invalidateSessionAndRedirect(...)` (L142-164): 세션 무효화 + 리다이렉트 (4단계)
- `resetValidationTimer()` (L170-172): 쿨다운 초기화

**모듈 레벨 상태**:
- `lastValidationTime`: 마지막 검증 시각
- `validationInFlight`: 진행 중인 검증 Promise

---

### 6.9 loginLockout.ts

| 항목 | 값 |
|------|---|
| **경로** | `platform/app/src/utils/loginLockout.ts` |
| **줄 수** | 112 |
| **패턴** | Pure Function (localStorage 기반) |
| **의존** | 없음 |

**상수**:
- `MAX_ATTEMPTS`: 5회
- `LOCKOUT_DURATION_MS`: 30분 (1,800,000ms)
- `WARNING_THRESHOLD`: 3회 (경고 시작)
- `STORAGE_KEY`: `'ohif-login-lockout'`

**핵심 함수**:
- `checkLockout(username)` (L30-50): 잠금 상태 확인 (만료 시 자동 해제)
- `recordFailedAttempt(username)` (L52-97): 실패 기록 + 잠금 활성화
- `clearLockout(username)` (L99-104): 잠금 기록 삭제
- `formatLockoutTime(remainingMs)` (L106-111): `MM:SS` 형식

---

## 7. 보안 설계

### 7.1 비밀번호 암호화

| 항목 | 값 |
|------|---|
| **알고리즘** | AES-CBC |
| **키 길이** | 128비트 (16바이트) |
| **API** | Web Crypto API (`crypto.subtle`) |
| **출력** | Base64 인코딩 |

**흐름**: 평문 비밀번호 → `TextEncoder` → `crypto.subtle.encrypt()` → `Uint8Array` → `btoa()` → Base64 문자열

> **제한**: Web Crypto API는 HTTPS 또는 localhost에서만 사용 가능

### 7.2 세션 저장소 암호화

- localStorage에 저장되는 `ohif-auth-state`는 AES-CBC로 암호화
- sessionStorage에는 Plain Text로 저장 (탭 닫으면 자동 삭제되므로)
- 같은 키/IV 사용 (환경 변수 `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_IV`)

### 7.3 계정 잠금 보호

- 5회 연속 실패 → 30분 잠금
- 3회 실패부터 경고 메시지 (남은 시도 횟수 표시)
- localStorage에 사용자별 기록 저장
- 잠금 만료 시 자동 해제 (failCount=0 초기화)

### 7.4 Fetch Interceptor 401/403 감지

- 모든 fetch 요청의 응답을 가로챔
- 401 또는 403 응답 시 즉시 로그아웃하지 않고 서버에 재확인 (false positive 방지)
- `validateServerSession({ force: true })` → 무효 확인 시에만 세션 무효화

### 7.5 오프라인 퍼스트 접근

- 서버 검증 실패 (500, 네트워크 오류) 시 로컬 세션 유지
- 사용자 경험 우선: 서버 일시 장애로 인한 불필요한 로그아웃 방지
- 서버가 명확히 세션 무효를 응답한 경우(401, 404)에만 세션 클리어

---

## 8. 설정 및 환경 변수

### 환경 변수 (`.env`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `APP_ENCRYPTION_KEY` | `보안상삭제` | AES-CBC 암호화 키 (16바이트) |
| `APP_ENCRYPTION_IV` | `보안상삭제` | AES-CBC 초기화 벡터 (16바이트) |

### 하드코딩된 설정값

| 값 | 위치 | 설명 |
|----|------|------|
| 60분 | `authStateSync.ts:31` | 세션 자동 만료 시간 (`DEFAULT_SESSION_DURATION`) |
| 10초 | `sessionValidator.ts:24` | 서버 검증 쿨다운 (`VALIDATION_COOLDOWN_MS`) |
| 5회 | `loginLockout.ts:2` | 최대 로그인 시도 횟수 (`MAX_ATTEMPTS`) |
| 30분 | `loginLockout.ts:3` | 계정 잠금 시간 (`LOCKOUT_DURATION_MS`) |
| 3회 | `loginLockout.ts:4` | 경고 시작 횟수 (`WARNING_THRESHOLD`) |

### Webpack 프록시 설정

```javascript
// webpack.pwa.js
{
  context: ['/v1/oauth'],
  target: 'http://192.168.0.202:7393',  // DCM4CHEE_API_TARGET
  changeOrigin: true,
  secure: false,
}
```

### Nginx 프록시 설정 (프로덕션)

```nginx
location /v1/oauth/ {
    proxy_pass http://192.168.0.202:8083/v1/oauth/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

**문서 버전**: 1.0
**작성일**: 2026-03-10
**기반 코드**: feature/addLoginAPI 브랜치
**프로젝트**: mView-Web V2 (OHIF v3.12.0-beta)
