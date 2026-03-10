# platform/app/src/routes/Login

로그인 UI 및 인증 처리 모듈. `/login` 경로에서 렌더링.

상세 프로세스 분석: [docs/login-process-analysis.md](../../../../../docs/login-process-analysis.md)

## 파일 구성

| 파일 | 역할 |
|------|------|
| `Login.tsx` (283줄) | 로그인 폼 UI, 잠금 카운트다운, 리다이렉트 처리 |

## Login.tsx 핵심 흐름

```
handleLogin()
  → checkLockout() → callLoginAPI() → clearLockout()
  → saveAuthState() → setUser() → resetValidationTimer()
  → navigate(redirectURL)
```

- **API**: `callLoginAPI()` (`loginAPI.ts`) — AES-CBC 암호화 + `/v1/oauth/login` 호출
- **잠금**: `loginLockout.ts` — 5회 실패 → 30분 잠금, 3회부터 경고
- **저장**: `AuthStateSync.saveAuthState()` — sessionStorage + localStorage(암호화)
- **리다이렉트**: `sessionStorage.ohif-redirect-to` → 로그인 전 URL로 복귀

## 수정 시 주의사항

1. **API 엔드포인트**: `/v1/oauth/login` (v1). 필드명은 camelCase (`sessionId`, `accessToken`)
2. **암호화 키**: `.env`의 `APP_ENCRYPTION_KEY` / `APP_ENCRYPTION_IV` (16바이트)
3. **HTTPS 필수**: Web Crypto API는 HTTP에서 제한됨
4. **로그인 성공 후 필수 호출 순서**:
   - `saveAuthState()` → `setUser()` → `resetValidationTimer()` → `navigate()`
   - 순서 변경 시 race condition 발생 가능

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| localStorage에 데이터 미저장 | `saveAuthState()` 미호출 | 로그인 성공 후 반드시 호출 |
| 새 탭 자동 로그인 안됨 | `LoginRoutes.tsx`의 `loadAuthState()` 미호출 | useEffect 내 복원 로직 확인 |
| 세션이 갱신되지 않음 | `AuthStateListener` Fetch Interceptor 미등록 | `App.tsx`에 컴포넌트 마운트 확인 |
| 활동 중인데 로그아웃됨 | `refreshSession()` 실패 | 콘솔에서 `[AuthStateSync]` 로그 확인 |

## 관련 파일

- `../../../utils/loginAPI.ts` — 암호화 + API 호출
- `../../../utils/authStateSync.ts` — 세션 저장/복원/동기화
- `../../../utils/loginLockout.ts` — 계정 잠금
- `../../../utils/sessionValidator.ts` — 서버 세션 검증
- `../../../utils/LoginRoutes.tsx` — 라우트 등록 + 세션 복원
