/**
 * Centralized Server Session Validator
 *
 * 서버 세션 검증을 중앙화하여 모든 인증 체크 포인트에서 재사용합니다.
 * - 10초 쿨다운으로 과도한 API 호출 방지
 * - 동시 호출 시 Promise 합치기 (coalescing)
 * - window.__originalFetch 사용으로 Fetch Interceptor 재귀 방지
 * - 오프라인 퍼스트: 네트워크 오류 시 세션 유지
 * - 서버 응답 null 체크 및 필드 변경 감지
 */

import { AuthStateSync } from './authStateSync';
import type { SessionInfo } from './sessionCleanup';

export interface SessionValidationResult {
  /** 세션이 유효한지 (서버에 세션이 존재하는지) */
  valid: boolean;
  /** 서버의 인증 정보가 로컬 저장 정보와 다른지 */
  changed: boolean;
  /** 다른 IP에서 접속 중인 세션 목록 (현재 세션 제외) */
  duplicateIpSessions?: SessionInfo[];
}

const RESULT_VALID: SessionValidationResult = { valid: true, changed: false };
const RESULT_INVALID: SessionValidationResult = { valid: false, changed: false };

const VALIDATION_COOLDOWN_MS = 10_000; // 10초 쿨다운
let lastValidationTime = 0;
let validationInFlight: Promise<SessionValidationResult> | null = null;

/**
 * 서버에 세션 유효성을 검증합니다.
 * @param options.force - 쿨다운 무시
 * @returns { valid, changed }
 */
export async function validateServerSession(
  options: { force?: boolean } = {}
): Promise<SessionValidationResult> {
  // 쿨다운: 최근 검증했으면 스킵 (force가 아닌 경우)
  if (!options.force && Date.now() - lastValidationTime < VALIDATION_COOLDOWN_MS) {
    return RESULT_VALID;
  }

  // 동시 호출 합치기: 이미 검증 중이면 기존 Promise 재사용
  if (validationInFlight) {
    return validationInFlight;
  }

  validationInFlight = _doValidation();
  try {
    return await validationInFlight;
  } finally {
    validationInFlight = null;
  }
}

async function _doValidation(): Promise<SessionValidationResult> {
  const authStateSync = AuthStateSync.getInstance();
  const authState = await authStateSync.loadAuthState();

  if (!authState?.user?.username || !authState?.user?.session_id) {
    return RESULT_INVALID; // 세션 정보 없음
  }

  try {
    // Fetch Interceptor를 우회하기 위해 원본 fetch 사용
    const fetchFn = (window as any).__originalFetch || window.fetch;
    const res = await fetchFn('/v1/oauth/search-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: authState.user.username,
        session: authState.user.session_id,
      }),
    });

    if (res.ok) {
      const data = await res.json();

      // Response가 null이거나 result 배열이 비어있으면 세션 없음
      if (!data || !data.result || !Array.isArray(data.result) || data.result.length === 0) {
        console.warn('[SessionValidator] Server returned null/empty result');
        return RESULT_INVALID;
      }

      // 현재 세션을 session ID로 정확히 찾기
      const currentSession = data.result.find(
        (s: any) => s.session === authState.user.session_id
      );
      if (!currentSession) {
        console.warn('[SessionValidator] Current session not found in server result');
        return RESULT_INVALID;
      }

      // 서버 세션 정보와 로컬 저장 정보 비교 (session 필드 제외 — id, name, role, group만)
      const storedUser = authState.user;
      const hasChanged =
        currentSession.id !== storedUser.username ||
        currentSession.name !== storedUser.name ||
        currentSession.role !== storedUser.role ||
        currentSession.group !== storedUser.group;

      if (hasChanged) {
        console.warn('[SessionValidator] Auth info changed detected:', {
          server: {
            id: currentSession.id,
            name: currentSession.name,
            role: currentSession.role,
            group: currentSession.group,
          },
          local: {
            username: storedUser.username,
            name: storedUser.name,
            role: storedUser.role,
            group: storedUser.group,
          },
        });
        return { valid: true, changed: true };
      }

      // 다른 IP 세션 감지
      const myAddress = currentSession.address;
      const duplicateIpSessions = data.result.filter(
        (s: any) => s.session !== authState.user.session_id && s.address !== myAddress
      );

      lastValidationTime = Date.now();
      return {
        valid: true,
        changed: false,
        duplicateIpSessions: duplicateIpSessions.length > 0 ? duplicateIpSessions : undefined,
      };
    }

    // 401, 404 = 서버에서 세션 무효화됨
    if (res.status === 401 || res.status === 404) {
      console.warn('[SessionValidator] Server session invalid:', res.status);
      return RESULT_INVALID;
    }

    // 기타 서버 오류 (500 등) → 로컬 세션 유지 (오프라인 퍼스트)
    console.warn('[SessionValidator] Unexpected response:', res.status);
    return RESULT_VALID;
  } catch (networkErr) {
    // 네트워크 오류 → 로컬 세션 유지
    console.warn('[SessionValidator] Network error, keeping local session:', networkErr);
    return RESULT_VALID;
  }
}

/**
 * 세션을 무효화하고 로그인 페이지로 리다이렉트합니다.
 * 순서: redirect URL 저장 → auth 클리어 → React 상태 리셋 → /login 이동
 */
export async function invalidateSessionAndRedirect(
  userAuthenticationService: { reset: () => void },
  navigate: (path: string, options?: { replace?: boolean }) => void,
  currentLocation: { pathname: string; search: string }
): Promise<void> {
  // 0. 서버 세션 무효화 (best-effort)
  try {
    const authStateSyncForRemoval = AuthStateSync.getInstance();
    const authState = await authStateSyncForRemoval.loadAuthState();
    if (authState?.user?.session_id) {
      const fetchFn = (window as any).__originalFetch || window.fetch;
      await fetchFn('/v1/oauth/remove-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: authState.user.session_id }),
      });
    }
  } catch (err) {
    console.warn('[SessionValidator] Failed to remove session:', err);
  }

  // 1. 현재 URL 저장 (로그인/로그아웃 페이지가 아닌 경우만)
  if (currentLocation.pathname !== '/login' && currentLocation.pathname !== '/logout') {
    sessionStorage.setItem(
      'ohif-redirect-to',
      JSON.stringify({ pathname: currentLocation.pathname, search: currentLocation.search })
    );
  }

  // 2. Storage 클리어 + 다른 탭에 로그아웃 전파
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.clearAuthState();

  // 3. React 인메모리 인증 상태 초기화
  userAuthenticationService.reset();

  // 4. 로그인 페이지로 리다이렉트 (히스토리 대체)
  navigate('/login', { replace: true });
}

/**
 * 검증 쿨다운 타이머를 초기화합니다.
 * 로그인 성공 후 호출하여 즉시 검증 가능하도록 합니다.
 */
export function resetValidationTimer(): void {
  lastValidationTime = 0;
}

/**
 * 검증이 완료되었음을 표시합니다.
 * lastValidationTime을 현재 시간으로 설정하여 쿨다운을 시작합니다.
 * Login.tsx에서 fetchOtherSessions() 완료 후 호출하여
 * 후속 validateServerSession() 호출이 쿨다운에 의해 스킵되도록 합니다.
 */
export function markValidationDone(): void {
  lastValidationTime = Date.now();
}
