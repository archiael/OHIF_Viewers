# platform/app/src/routes/Login

## 1. 모듈 개요

`platform/app/src/routes/Login`은 **사용자 인증 및 로그인 페이지**를 담당하는 폴더입니다.

- **전체 앱에서의 역할**: 사용자 로그인 UI 제공 및 인증 처리
- **화면 연결**: `/login` 경로에서 로그인 페이지 표시
- **상위 모듈**: `platform/app/src/utils/LoginRoutes.tsx`에서 라우트로 등록
- **하위 모듈**:
  - `Login.tsx` - 로그인 UI 컴포넌트
  - `logout.ts` - 로그아웃 유틸리티 함수

## 2. 주요 파일/컴포넌트 리스트

### `Login.tsx` (메인 로그인 컴포넌트)
**역할**: 로그인 폼 UI 및 인증 로직

**주요 기능**:
- AES-CBC 암호화를 사용한 비밀번호 암호화
- `/api/login` POST 요청으로 서버 인증
- AuthStateSync를 통한 세션 저장 (sessionStorage + localStorage)
- 로그인 성공 시 리다이렉트 처리

**코드 예시**:
```tsx
// 비밀번호 AES-CBC 암호화
const encryptPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode('>}I>o#S?hYWfcB7B'); // 16자
  const ivData = encoder.encode('>}I>o#S?hYWfcB7B');

  const key = await crypto.subtle.importKey('raw', keyData,
    { name: 'AES-CBC', length: 128 }, false, ['encrypt']);

  const plainData = encoder.encode(password);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivData }, key, plainData
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
};

// AuthStateSync를 사용한 세션 저장
const authStateSync = AuthStateSync.getInstance();
await authStateSync.saveAuthState({
  user,
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  token_type: data.token_type,
});
```

### `logout.ts` (로그아웃 유틸리티)
**역할**: 재사용 가능한 로그아웃 함수

**사용처**:
- 명시적 로그아웃 버튼 클릭 시
- 세션 만료 시 자동 로그아웃

**코드**:
```typescript
import { AuthStateSync } from '../../utils/authStateSync';

export function logout(navigate: (path: string) => void) {
  console.log('[Logout] User initiated logout');
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.clearAuthState(); // sessionStorage + localStorage 클리어
  navigate('/login');
}
```

## 3. 리액트 관점에서 볼 포인트

### 상태 관리 방식

**로컬 상태** (useState):
```tsx
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');
const [isLoading, setIsLoading] = useState(false);
```

**전역 상태**:
- `useUserAuthentication()` 훅으로 UserAuthenticationService 사용
- `setUser(user)` - 전역 인증 상태 업데이트

**세션 저장**:
- AuthStateSync 사용 (Singleton 패턴)
- sessionStorage (현재 탭) + localStorage (다른 탭 공유, 암호화)

### 비동기 처리 패턴

```tsx
const handleLogin = async () => {
  setIsLoading(true);
  try {
    // 1. 비밀번호 암호화
    const encryptedPassword = await encryptPassword(password);

    // 2. 서버 인증
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: username, password: encryptedPassword }),
    });

    // 3. 세션 저장
    const authStateSync = AuthStateSync.getInstance();
    await authStateSync.saveAuthState({ user, access_token, ... });

    // 4. 리다이렉트
    navigate('/');
  } catch (error) {
    setError(error.message);
  } finally {
    setIsLoading(false);
  }
};
```

### 이벤트 처리

**Enter 키 로그인**:
```tsx
const handleKeyPress = (e) => {
  if (e.key === 'Enter') {
    handleLogin();
  }
};

<Input onKeyPress={handleKeyPress} />
```

## 4. OHIF 특유 개념 정리

### AuthStateSync (핵심!)

**역할**: 다중 탭 세션 공유 + 자동 만료 관리

**주요 기능**:
1. **Hybrid Storage**:
   - sessionStorage (현재 탭, plain text)
   - localStorage (다른 탭 공유, AES-CBC 암호화)

2. **자동 만료** (10분):
   - `expiresAt` 타임스탬프 저장
   - `loadAuthState()` 시 만료 체크

3. **세션 자동 갱신**:
   - 서버 요청 시 Fetch Interceptor가 `refreshSession()` 호출
   - 만료 시간을 현재 시간 + 10분으로 연장

4. **다중 탭 동기화**:
   - localStorage의 storage 이벤트 사용
   - LOGIN_EVENT / LOGOUT_EVENT 전파

**코드 위치**: `platform/app/src/utils/authStateSync.ts`

### UserAuthenticationService

OHIF 코어의 인증 서비스:
- `setUser(user)` - 사용자 정보 설정
- `reset()` - 로그아웃
- `handleUnauthenticated()` - 미인증 시 처리

**연동**:
```tsx
const [, { setUser }] = useUserAuthentication();
setUser(user); // 로그인 성공 시
```

### 세션 데이터 구조

```typescript
interface AuthState {
  user: {
    username: string;
    name: string;
    role: string;
    group: string;
    session_id: string;  // 중요! PACS 세션 ID
    authenticated: boolean;
    loginTime: string;
  };
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiresAt?: number;  // Unix timestamp (ms)
}
```

### 관련 폴더 링크

- `platform/app/src/utils/authStateSync.ts` - 세션 동기화 핵심 로직
- `platform/app/src/utils/AuthStateListener.tsx` - Fetch Interceptor, 전역 리스너
- `platform/app/src/utils/LoginRoutes.tsx` - 로그인 라우트 설정
- `platform/ui/src/components/Input/Input.tsx` - Input 컴포넌트

## 5. 초보 개발자용 학습 가이드

### 추천 학습 순서

1. **Login.tsx 읽기** (1시간)
   - 기본적인 로그인 폼 구조 이해
   - useState, useNavigate 사용법
   - async/await 비동기 처리 패턴

2. **비밀번호 암호화 이해** (30분)
   - Web Crypto API 사용법
   - AES-CBC 암호화 개념
   - Base64 인코딩

3. **AuthStateSync 이해** (1-2시간, 중요!)
   - `platform/app/src/utils/authStateSync.ts` 읽기
   - sessionStorage vs localStorage 차이
   - storage 이벤트를 통한 탭 간 통신

4. **Fetch Interceptor 이해** (30분)
   - `platform/app/src/utils/AuthStateListener.tsx` 읽기
   - window.fetch를 intercept하는 패턴
   - 세션 자동 갱신 로직

5. **실제 테스트** (30분)
   - 브라우저에서 로그인 시도
   - F12 → Application → Storage 확인
   - localStorage에 암호화된 데이터 확인
   - 새 탭 열어서 자동 로그인 확인

### 이 폴더를 이해하면 할 수 있는 것

- ✅ 사용자 인증 시스템 구현 (암호화 포함)
- ✅ 다중 탭 세션 공유 구현
- ✅ 자동 만료 + 활동 기반 갱신 시스템
- ✅ Web Crypto API 활용
- ✅ Fetch Interceptor 패턴 활용
- ✅ sessionStorage / localStorage 고급 활용

## 6. 주의사항

### 보안

1. **암호화 키 관리**:
   - 현재: 하드코딩 (`'>}I>o#S?hYWfcB7B'`)
   - 프로덕션: 환경 변수 사용 권장
   ```typescript
   const key = process.env.APP_ENCRYPTION_KEY || '>}I>o#S?hYWfcB7B';
   ```

2. **HTTPS 필수**:
   - HTTP에서는 Web Crypto API 제한됨
   - 프로덕션 환경에서는 HTTPS 필수

3. **토큰 저장**:
   - sessionStorage: XSS 공격에 취약
   - localStorage: XSS + CSRF 공격에 취약
   - HttpOnly 쿠키 사용 고려 (서버 수정 필요)

### 테스트

**Playwright 테스트 파일**:
- `tests/Login.spec.ts` - 기본 로그인 테스트
- `tests/LoginMultiTab.spec.ts` - 다중 탭 세션 공유 테스트

**실행**:
```bash
yarn test:login:ui
```

## 7. 트러블슈팅

### 문제: localStorage에 데이터가 저장되지 않음
**원인**: Login.tsx에서 `AuthStateSync.saveAuthState()` 미호출
**해결**: 로그인 성공 후 반드시 `authStateSync.saveAuthState()` 호출

### 문제: 새 탭에서 자동 로그인 안 됨
**원인**: LoginRoutes.tsx에서 `loadAuthState()` 미호출
**해결**: LoginRoutes useEffect에서 `authStateSync.loadAuthState()` 호출

### 문제: 세션이 갱신되지 않음
**원인**: AuthStateListener의 Fetch Interceptor 미등록
**해결**: App.tsx에 `<AuthStateListener />` 컴포넌트 추가 확인

### 문제: 10분 후 로그아웃되지 않음
**원인**: 서버 요청이 계속 발생하여 세션이 자동 갱신됨
**확인**: 콘솔에서 `[AuthStateSync] Session refreshed` 로그 확인
**정상 동작**: 사용자가 활동 중이면 세션이 계속 연장됨
