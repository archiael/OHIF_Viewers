import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthStateSync } from './authStateSync';
import { isLocalRoute } from './isLocalRoute';
import {
  validateServerSession,
  invalidateSessionAndRedirect,
  SessionValidationResult,
} from './sessionValidator';
import type { SessionInfo } from './sessionCleanup';
import SessionCleanupModal from '../components/SessionCleanupModal';

const SKIP_DUPLICATION_KEY = 'ohif-skip-duplication-check';

/**
 * 현재 duplicate sessions 중 허용되지 않은 새 세션이 있는지 확인.
 * - 저장된 값이 없으면 → 모달 표시 (true)
 * - 저장된 값이 JSON 배열이면 → 현재 duplicates의 session ID가 모두 포함되어 있는지 확인
 * - 하나라도 새 세션이 있으면 → 모달 표시 (true)
 */
function hasNewDuplicateSessions(currentDuplicates: SessionInfo[]): boolean {
  const stored = sessionStorage.getItem(SKIP_DUPLICATION_KEY);
  if (!stored) return true;

  try {
    const allowedSessionIds: string[] = JSON.parse(stored);
    if (!Array.isArray(allowedSessionIds)) return true;

    return currentDuplicates.some(s => !allowedSessionIds.includes(s.session));
  } catch {
    return true;
  }
}

/**
 * AuthStateListener
 *
 * 모든 페이지에서 다중 탭 인증 상태 동기화를 감지하는 컴포넌트
 * - 다른 탭의 로그아웃 감지 → /login 리다이렉트
 * - 다른 탭의 로그인 감지 → sessionId 동기화
 * - 탭 포커스 시 sessionId 동기화 + 서버 세션 검증
 * - 라우트 변경 시 서버 세션 검증(search-session) + 타이머 갱신
 * - API 응답 401/403 감지 → 서버 세션 검증 → 실패 시 /login 리다이렉트
 * - 중복 로그인 감지 → SessionCleanupModal 표시
 */
function AuthStateListener({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [duplicateSessions, setDuplicateSessions] = useState<SessionInfo[]>([]);
  const [showDuplicationDialog, setShowDuplicationDialog] = useState(false);

  // location을 ref로 관리하여 Fetch Interceptor 클로저에서 항상 최신 값 참조
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  /**
   * 검증 결과를 처리하는 공통 헬퍼.
   * - invalid 또는 changed → 세션 무효화 + /login 리다이렉트
   * - duplicateSessions 존재 && 세션유지 미선택 → 다이얼로그 표시
   */
  const handleValidationResult = (result: SessionValidationResult) => {
    if (!result.valid || result.changed) {
      invalidateSessionAndRedirect(userAuthenticationService, navigate, locationRef.current);
      return;
    }
    // 다른 세션 감지 && 새 세션이 허용 목록에 없으면 모달 표시
    if (result.duplicateSessions && result.duplicateSessions.length > 0) {
      if (hasNewDuplicateSessions(result.duplicateSessions)) {
        setDuplicateSessions(result.duplicateSessions);
        setShowDuplicationDialog(true);
      }
    }
  };

  const handleRemoveAllDuplicates = () => {
    setShowDuplicationDialog(false);
    setDuplicateSessions([]);
  };

  const handleSkipDuplication = () => {
    // 현재 탭 세션 동안 이 세션 목록은 허용 — 새 세션 추가 시 다시 표시
    const allowedIds = duplicateSessions.map(s => s.session);
    sessionStorage.setItem(SKIP_DUPLICATION_KEY, JSON.stringify(allowedIds));
    setShowDuplicationDialog(false);
    setDuplicateSessions([]);
  };

  useEffect(() => {
    const authStateSync = AuthStateSync.getInstance();

    // ✅ 로그아웃 시 강제 리다이렉트 (로컬 라우트 제외)
    const unsubscribe = authStateSync.subscribe(newState => {
      if (!newState) {
        userAuthenticationService.reset();
        const loc = locationRef.current;
        if (!isLocalRoute(loc.pathname, loc.search)) {
          navigate('/login');
        }
      }
    });

    // ✅ 탭 포커스 시 sessionId 동기화 + 서버 세션 검증
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        const currentState = await authStateSync.loadAuthState();

        if (currentState?.user?.session_id && window.config?.dataSources) {
          window.config.dataSources.forEach(ds => {
            if (ds.configuration?.defaultQueryParams) {
              ds.configuration.defaultQueryParams.sessionId = currentState.user.session_id;
            }
          });
        }

        // 서버 세션 검증 (쿨다운 적용됨 - 빠른 탭 전환 시 과도한 호출 방지)
        if (currentState) {
          const result = await validateServerSession();
          handleValidationResult(result);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ✅ 세션 만료 주기적 체크 (30초마다)
    const expiryCheckInterval = setInterval(async () => {
      const expiresAt = authStateSync.getExpiresAt();
      if (expiresAt && Date.now() > expiresAt) {
        // 서버 세션 무효화 (best-effort)
        try {
          const authState = await authStateSync.loadAuthState();
          if (authState?.user?.session_id) {
            const fetchFn = (window as any).__originalFetch || window.fetch;
            await fetchFn('/v1/oauth/remove-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session: authState.user.session_id }),
            });
          }
        } catch (err) {
          // best-effort: 실패 무시
        }
        authStateSync.clearAuthState();
        userAuthenticationService.reset();
        const loc = locationRef.current;
        if (!isLocalRoute(loc.pathname, loc.search)) {
          navigate('/login');
        }
      }
    }, 30000);

    // ✅ Fetch Interceptor: 서버 요청 시 세션 갱신 + 401/403 감지
    const originalFetch = window.fetch;
    // sessionValidator가 Interceptor를 우회할 수 있도록 원본 fetch 저장
    (window as any).__originalFetch = originalFetch;

    window.fetch = async function (...args) {
      try {
        const response = await originalFetch(...args);

        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url;
        const isLoginRequest = url?.includes('/login') || url?.includes('/logout');
        const isSessionCheck = url?.includes('/v1/oauth/search-session');

        // 401/403 감지: 서버 세션 검증 후 무효화 (로그인/세션체크 요청 제외)
        if (
          (response.status === 401 || response.status === 403) &&
          !isLoginRequest &&
          !isSessionCheck
        ) {
          // 즉시 무효화하지 않고 서버에 재확인 (false positive 방지)
          const result = await validateServerSession({ force: true });
          handleValidationResult(result);
        }

        return response;
      } catch (error) {
        throw error;
      }
    };

    return () => {
      unsubscribe();
      clearInterval(expiryCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Fetch Interceptor 복원
      window.fetch = originalFetch;
      delete (window as any).__originalFetch;
    };
  }, [userAuthenticationService, navigate]);

  // ✅ 라우트 변경 시 서버 세션 검증 + 세션 갱신
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;

    // /login, /logout 라우트에서는 세션 검증 스킵
    // - /login: 미인증 상태이므로 검증 불필요
    // - /logout: remove-session과 search-session 간 race condition 방지
    if (location.pathname === '/login' || location.pathname === '/logout') {
      return;
    }

    // 로그인 직후 전환 시 스킵 (Login.tsx에서 fetchOtherSessions로 이미 세션 검증 완료)
    if (prevPathname === '/login') {
      return;
    }

    const authStateSync = AuthStateSync.getInstance();
    authStateSync.loadAuthState().then(async currentState => {
      if (!currentState) return; // 미인증 상태면 스킵

      const result = await validateServerSession({ force: true });
      if (result.valid && !result.changed) {
        // 서버 세션 유효 → 타이머 리셋
        await authStateSync.refreshSession();
        // 중복 세션 체크
        if (result.duplicateSessions && result.duplicateSessions.length > 0) {
          if (hasNewDuplicateSessions(result.duplicateSessions)) {
            setDuplicateSessions(result.duplicateSessions);
            setShowDuplicationDialog(true);
          }
        }
      } else {
        // 서버 세션 무효 또는 변경됨 → 로그아웃
        invalidateSessionAndRedirect(userAuthenticationService, navigate, locationRef.current);
      }
    });
  }, [location.pathname, userAuthenticationService, navigate]);

  // 조건부 렌더링: SessionCleanupModal (중복 로그인)
  if (showDuplicationDialog && duplicateSessions.length > 0) {
    return (
      <SessionCleanupModal
        sessions={duplicateSessions}
        onConfirm={handleRemoveAllDuplicates}
        onSkip={handleSkipDuplication}
        title="중복 로그인 감지"
        description="동일 ID 중복 로그인이 감지되었습니다."
        confirmLabel="모두 로그아웃"
        confirmColor="red"
      />
    );
  }

  return null;
}

export default AuthStateListener;
