# platform/app/src/utils

## 목차
1. [모듈 개요](#1-모듈-개요)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [인증 관련 파일 (로그인 시스템)](#2.1-인증-관련-파일-로그인-시스템)
   - 2.2. [기타 유틸리티 파일](#2.2-기타-유틸리티-파일)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [Singleton 패턴](#3.1-singleton-패턴)
   - 3.2. [Observer 패턴 (PubSub)](#3.2-observer-패턴-pubsub)
   - 3.3. [Interceptor 패턴](#3.3-interceptor-패턴)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [window.config.dataSources](#4.1-windowconfigdatasources)
   - 4.2. [UserAuthenticationService](#4.2-userauthenticationservice)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 폴더를 이해하면 할 수 있는 것](#5.2-이-폴더를-이해하면-할-수-있는-것)
6. [주요 설정](#6-주요-설정)
   - 6.1. [세션 만료 시간 변경](#6.1-세션-만료-시간-변경)
   - 6.2. [암호화 키 변경 (보안 강화)](#6.2-암호화-키-변경-보안-강화)
   - 6.3. [세션 갱신 비활성화](#6.3-세션-갱신-비활성화)
7. [트러블슈팅](#7-트러블슈팅)
   - 7.1. [문제: "crypto.subtle is undefined"](#7.1-문제-cryptosubtle-is-undefined)
   - 7.2. [문제: 세션이 다른 탭에서 공유되지 않음](#7.2-문제-세션이-다른-탭에서-공유되지-않음)
   - 7.3. [문제: 세션이 계속 갱신되어 만료되지 않음](#7.3-문제-세션이-계속-갱신되어-만료되지-않음)
   - 7.4. [문제: AuthStateListener가 동작하지 않음](#7.4-문제-authstatelistener가-동작하지-않음)
8. [관련 파일 링크](#8-관련-파일-링크)

---


## 1. 모듈 개요

`platform/app/src/utils`는 **앱 전역에서 사용되는 유틸리티 함수 및 헬퍼 컴포넌트**를 담당하는 폴더입니다.

- **전체 앱에서의 역할**: 재사용 가능한 헬퍼, 인증 관련 유틸리티, 라우트 설정
- **상위 모듈**: `platform/app/src/App.tsx`에서 직접 사용
- **하위 모듈**: 인증 관련 모듈 (AuthStateSync, AuthStateListener, LoginRoutes)

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 인증 관련 파일 (로그인 시스템)

#### `authStateSync.ts` (핵심!)
**역할**: 다중 탭 세션 공유 + 자동 만료 + 암호화 관리

**클래스**: `AuthStateSync` (Singleton 패턴)

**주요 메서드**:
```typescript
class AuthStateSync {
  // 세션 저장 (sessionStorage + localStorage 암호화)
  async saveAuthState(authState: AuthState): Promise<void>

  // 세션 로드 (sessionStorage 우선, localStorage 폴백)
  async loadAuthState(): Promise<AuthState | null>

  // 세션 클리어 (로그아웃)
  clearAuthState(triggerEvent: boolean = true): void

  // 세션 만료 시간 갱신 (서버 요청 시 자동 호출)
  async refreshSession(): Promise<void>

  // 다른 탭의 인증 상태 변경 감지
  subscribe(listener: (state: AuthState | null) => void): () => void
}
```

**핵심 기능**:

1. **Hybrid Storage 패턴**:
   ```typescript
   // sessionStorage (현재 탭, plain text)
   sessionStorage.setItem('user', JSON.stringify(user));
   sessionStorage.setItem('access_token', token);

   // localStorage (다른 탭 공유, AES-CBC 암호화)
   const encrypted = await this.encrypt(JSON.stringify(stateWithExpiry));
   localStorage.setItem('ohif-auth-state', encrypted);
   ```

2. **AES-CBC 암호화**:
   ```typescript
   private async encrypt(text: string): Promise<string> {
     const encoder = new TextEncoder();
     const keyData = encoder.encode(this.encryptionKey); // 16자
     const ivData = encoder.encode(this.encryptionIV);

     const cryptoKey = await crypto.subtle.importKey(
       'raw', keyData, { name: 'AES-CBC', length: 128 }, false, ['encrypt']
     );

     const encrypted = await crypto.subtle.encrypt(
       { name: 'AES-CBC', iv: ivData }, cryptoKey, encoder.encode(text)
     );

     return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
   }
   ```

3. **자동 만료** (10분):
   ```typescript
   const SESSION_DURATION = 10 * 60 * 1000; // 10분

   // 저장 시
   const stateWithExpiry = {
     ...authState,
     expiresAt: Date.now() + SESSION_DURATION,
   };

   // 로드 시
   if (authState.expiresAt && Date.now() > authState.expiresAt) {
     console.log('Session expired');
     this.clearAuthState();
     return null;
   }
   ```

4. **세션 자동 갱신**:
   ```typescript
   async refreshSession(): Promise<void> {
     const authState = await this.decrypt(localStorageData);

     // 이미 만료되지 않았으면
     if (Date.now() < authState.expiresAt) {
       // 만료 시간을 현재 시간 + 10분으로 갱신
       authState.expiresAt = Date.now() + SESSION_DURATION;

       // 다시 암호화하여 저장
       const encrypted = await this.encrypt(JSON.stringify(authState));
       localStorage.setItem('ohif-auth-state', encrypted);
     }
   }
   ```

5. **다중 탭 동기화** (Storage Events):
   ```typescript
   // 로그아웃 전파
   clearAuthState(triggerEvent: boolean = true) {
     if (triggerEvent) {
       localStorage.setItem('ohif-logout-event', Date.now().toString());
       localStorage.removeItem('ohif-logout-event'); // 이벤트 트리거
     }
   }

   // 이벤트 수신
   private handleStorageEvent(event: StorageEvent): void {
     if (event.key === 'ohif-logout-event') {
       this.clearAuthState(false); // 재귀 방지
       this.notifyListeners(null); // 구독자에게 알림
     }
   }
   ```

**데이터 흐름**:
```
로그인 성공
  → saveAuthState()
    ├─ sessionStorage.setItem('user', ...)     [Plain]
    ├─ sessionStorage.setItem('access_token', ...) [Plain]
    └─ localStorage.setItem('ohif-auth-state', encrypted) [AES-CBC]

새 탭 오픈
  → loadAuthState()
    ├─ sessionStorage 확인 (없음)
    └─ localStorage 확인 (있음)
      → decrypt()
      → expiresAt 체크
      → sessionStorage 복원
      → 사용자 자동 로그인 ✅

서버 요청 (DICOM 이미지 로드)
  → Fetch Interceptor 감지
  → refreshSession()
    → expiresAt를 현재 시간 + 10분으로 갱신 ✅

다른 탭에서 로그아웃
  → clearAuthState(true)
  → localStorage.setItem('ohif-logout-event', ...)
  → storage 이벤트 발생
  → 모든 탭에서 handleStorageEvent() 실행
  → 모든 탭 로그아웃 ✅
```

---

#### `AuthStateListener.tsx`
**역할**: 전역 인증 상태 감지 및 Fetch Interceptor

**컴포넌트 타입**: Invisible Component (렌더링 없음, `return null`)

**주요 기능**:

1. **다른 탭의 로그아웃 감지**:
   ```tsx
   const unsubscribe = authStateSync.subscribe(newState => {
     if (!newState) {
       // 로그아웃됨
       userAuthenticationService.reset();
       navigate('/login');
     }
   });
   ```

2. **탭 포커스 시 sessionId 동기화**:
   ```tsx
   const handleVisibilityChange = () => {
     if (!document.hidden) {
       authStateSync.loadAuthState().then(currentState => {
         if (currentState?.user?.session_id && window.config?.dataSources) {
           // window.config.dataSources에 sessionId 설정
           window.config.dataSources.forEach(ds => {
             ds.configuration.defaultQueryParams.sessionId = currentState.user.session_id;
           });
         }
       });
     }
   };
   ```

3. **Fetch Interceptor (세션 자동 갱신)**:
   ```tsx
   const originalFetch = window.fetch;
   window.fetch = async function (...args) {
     const response = await originalFetch(...args);

     // 성공적인 요청이면 세션 갱신
     const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
     const isLoginRequest = url?.includes('/login') || url?.includes('/logout');

     if (response.ok && !isLoginRequest) {
       authStateSync.refreshSession(); // 만료 시간 연장
     }

     return response;
   };

   // Cleanup: Interceptor 복원
   return () => {
     window.fetch = originalFetch;
   };
   ```

**사용 위치**: `platform/app/src/App.tsx`
```tsx
<BrowserRouter>
  <AuthStateListener userAuthenticationService={userAuthenticationService} />
  {authRoutes}
  {appRoutes}
</BrowserRouter>
```

---

#### `LoginRoutes.tsx`
**역할**: 로그인 관련 라우트 설정 및 세션 복원

**라우트**:
- `/login` → `<Login />` 컴포넌트
- `/logout` → `<LogoutComponent />` 컴포넌트

**초기화 로직**:
```tsx
useEffect(() => {
  // 1. 인증 활성화
  userAuthenticationService.set({ enabled: true });

  // 2. 미인증 시 처리 로직 주입
  userAuthenticationService.setServiceImplementation({
    handleUnauthenticated: () => navigate('/login'),
  });

  // 3. 세션 복원 (페이지 새로고침 시)
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.loadAuthState().then(authState => {
    if (authState) {
      userAuthenticationService.setUser(authState.user);

      // window.config에 sessionId 복원
      if (authState.user.session_id && window.config?.dataSources) {
        window.config.dataSources.forEach(ds => {
          ds.configuration.defaultQueryParams.sessionId = authState.user.session_id;
        });
      }
    }
  });
}, [userAuthenticationService, navigate]);
```

**LogoutComponent**:
```tsx
function LogoutComponent({ navigate }) {
  useEffect(() => {
    const authStateSync = AuthStateSync.getInstance();
    authStateSync.clearAuthState(); // 모든 탭에 로그아웃 전파
    navigate('/login');
  }, [navigate]);

  return <div>Logging out...</div>;
}
```

---

### 2.2. 기타 유틸리티 파일

#### `OpenIdConnectRoutes.tsx`
**역할**: OIDC (OpenID Connect) 인증 라우트 (사용 안 함, LoginRoutes 사용)

#### `logout.ts` (Deprecated)
**역할**: 재사용 가능한 로그아웃 함수
**위치**: `platform/app/src/routes/Login/logout.ts`로 이동됨

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. Singleton 패턴

```typescript
// AuthStateSync.ts
export class AuthStateSync {
  private static instance: AuthStateSync;

  private constructor() {
    // private constructor → new 호출 불가
  }

  static getInstance(): AuthStateSync {
    if (!AuthStateSync.instance) {
      AuthStateSync.instance = new AuthStateSync();
    }
    return AuthStateSync.instance;
  }
}

// 사용
const authStateSync = AuthStateSync.getInstance();
```

**장점**:
- 앱 전역에서 단일 인스턴스 사용
- storage 이벤트 리스너 중복 등록 방지

### 3.2. Observer 패턴 (PubSub)

```typescript
class AuthStateSync {
  private listeners: Set<(state: AuthState | null) => void> = new Set();

  // 구독
  subscribe(listener: (state: AuthState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener); // Unsubscribe 함수 반환
  }

  // 알림
  private notifyListeners(state: AuthState | null): void {
    this.listeners.forEach(listener => listener(state));
  }
}

// 사용 (React)
useEffect(() => {
  const unsubscribe = authStateSync.subscribe(newState => {
    if (!newState) {
      navigate('/login'); // 로그아웃 처리
    }
  });

  return unsubscribe; // Cleanup
}, []);
```

### 3.3. Interceptor 패턴

```typescript
// 원본 함수 저장
const originalFetch = window.fetch;

// 함수 오버라이드
window.fetch = async function (...args) {
  // Before logic
  console.log('Request:', args);

  const response = await originalFetch(...args);

  // After logic
  if (response.ok) {
    authStateSync.refreshSession();
  }

  return response;
};

// Cleanup: 원본 복원
return () => {
  window.fetch = originalFetch;
};
```

---

## 4. OHIF 특유 개념 정리

### 4.1. window.config.dataSources

OHIF의 데이터 소스 설정:
```javascript
window.config = {
  dataSources: [
    {
      sourceName: 'ohif',
      configuration: {
        qidoRoot: 'http://localhost:8080/dicomweb',
        defaultQueryParams: {
          sessionId: 'abc123', // 로그인 시 설정됨
        },
      },
    },
  ],
};
```

**sessionId 역할**:
- PACS 세션 식별자
- QIDO/WADO 요청에 포함되어야 함 (서버가 요구하는 경우)

### 4.2. UserAuthenticationService

OHIF 코어의 인증 서비스:
```typescript
interface UserAuthenticationService {
  set(config: { enabled: boolean }): void;
  setServiceImplementation(impl: { handleUnauthenticated: () => void }): void;
  setUser(user: User): void;
  reset(): void;
}
```

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

1. **Singleton 패턴 학습** (30분)
   - JavaScript 디자인 패턴 이해
   - AuthStateSync의 getInstance() 구조 파악

2. **Web Crypto API 학습** (1시간)
   - `crypto.subtle.importKey()`
   - `crypto.subtle.encrypt()` / `decrypt()`
   - AES-CBC 알고리즘 개념

3. **authStateSync.ts 읽기** (2시간, 핵심!)
   - 각 메서드 하나씩 이해
   - encrypt/decrypt → saveAuthState → loadAuthState 순서
   - Storage Events 이해

4. **AuthStateListener.tsx 읽기** (1시간)
   - Fetch Interceptor 패턴 이해
   - useEffect cleanup 함수 역할

5. **실제 테스트** (1시간)
   - 브라우저 DevTools → Application → Storage
   - localStorage의 'ohif-auth-state' 확인 (암호화됨)
   - 새 탭 열어서 자동 로그인 확인
   - Console에서 `[AuthStateSync]` 로그 확인

### 5.2. 이 폴더를 이해하면 할 수 있는 것

- ✅ Singleton 패턴을 사용한 전역 상태 관리
- ✅ Web Crypto API를 활용한 클라이언트 사이드 암호화
- ✅ Storage Events를 통한 탭 간 통신
- ✅ Fetch Interceptor를 통한 전역 요청 처리
- ✅ Observer 패턴 (PubSub) 구현
- ✅ React useEffect cleanup 고급 활용

---

## 6. 주요 설정

### 6.1. 세션 만료 시간 변경

```typescript
// authStateSync.ts - 30번 라인
const SESSION_DURATION = 10 * 60 * 1000; // 10분

// 예: 30분으로 변경
const SESSION_DURATION = 30 * 60 * 1000;
```

### 6.2. 암호화 키 변경 (보안 강화)

```typescript
// authStateSync.ts
private constructor() {
  // 환경 변수 필수 (.env 파일에 설정)
  if (!process.env.APP_ENCRYPTION_KEY || !process.env.APP_ENCRYPTION_IV) {
    throw new Error('APP_ENCRYPTION_KEY and APP_ENCRYPTION_IV are required');
  }
  this.encryptionKey = process.env.APP_ENCRYPTION_KEY;
  this.encryptionIV = process.env.APP_ENCRYPTION_IV;
}
```

### 6.3. 세션 갱신 비활성화

```typescript
// AuthStateListener.tsx - Fetch Interceptor 주석 처리
// window.fetch = async function (...args) { ... };
```

---

## 7. 트러블슈팅

### 7.1. 문제: "crypto.subtle is undefined"
**원인**: HTTP 환경에서 Web Crypto API 사용 불가
**해결**: HTTPS 사용 또는 localhost에서만 테스트

### 7.2. 문제: 세션이 다른 탭에서 공유되지 않음
**원인**: localStorage 저장 실패 (Private Mode 등)
**확인**: `localStorage.getItem('ohif-auth-state')` 값 확인
**해결**: Private Mode가 아닌지 확인

### 7.3. 문제: 세션이 계속 갱신되어 만료되지 않음
**원인**: 서버 요청이 계속 발생하여 Fetch Interceptor가 `refreshSession()` 호출
**정상 동작**: 사용자가 뷰어를 사용하는 동안에는 세션이 계속 연장됨
**10분 만료 테스트**: 모든 탭을 닫고 10분 후 다시 열기

### 7.4. 문제: AuthStateListener가 동작하지 않음
**원인**: App.tsx에 컴포넌트 미등록
**해결**: App.tsx의 BrowserRouter 내부에 `<AuthStateListener />` 추가 확인

---

## 8. 관련 파일 링크

- `platform/app/src/routes/Login/Login.tsx` - 로그인 UI
- `platform/app/src/routes/Login/CLAUDE.md` - 로그인 모듈 문서
- `platform/app/src/App.tsx` - AuthStateListener 사용처
- `tests/LoginMultiTab.spec.ts` - 다중 탭 테스트
- `tests/Login.spec.ts` - 기본 로그인 테스트
