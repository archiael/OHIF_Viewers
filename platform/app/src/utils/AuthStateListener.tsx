import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthStateSync } from './authStateSync';
import { isLocalRoute } from './isLocalRoute';
import { validateServerSession, invalidateSessionAndRedirect } from './sessionValidator';

/**
 * AuthStateListener
 *
 * 모든 페이지에서 다중 탭 인증 상태 동기화를 감지하는 컴포넌트
 * - 다른 탭의 로그아웃 감지 → /login 리다이렉트
 * - 다른 탭의 로그인 감지 → sessionId 동기화
 * - 탭 포커스 시 sessionId 동기화 + 서버 세션 검증
 * - 서버 요청 시 세션 자동 갱신 (Fetch Interceptor)
 * - API 응답 401/403 감지 → 서버 세션 검증 → 실패 시 /login 리다이렉트
 */
function AuthStateListener({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  // location을 ref로 관리하여 Fetch Interceptor 클로저에서 항상 최신 값 참조
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

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
          if (!result.valid || result.changed) {
            invalidateSessionAndRedirect(
              userAuthenticationService,
              navigate,
              locationRef.current
            );
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

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

        // 성공적인 요청이면 세션 갱신 (로그인 관련 요청 제외)
        if (response.ok && !isLoginRequest) {
          authStateSync.refreshSession().catch(err => {
            console.warn('[AuthStateListener] Failed to refresh session:', err);
          });
        }

        // 401/403 감지: 서버 세션 검증 후 무효화 (로그인/세션체크 요청 제외)
        if (
          (response.status === 401 || response.status === 403) &&
          !isLoginRequest &&
          !isSessionCheck
        ) {
          console.warn('[AuthStateListener] Received', response.status, 'from', url);
          // 즉시 무효화하지 않고 서버에 재확인 (false positive 방지)
          const result = await validateServerSession({ force: true });
          if (!result.valid || result.changed) {
            invalidateSessionAndRedirect(
              userAuthenticationService,
              navigate,
              locationRef.current
            );
          }
        }

        return response;
      } catch (error) {
        throw error;
      }
    };

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Fetch Interceptor 복원
      window.fetch = originalFetch;
      delete (window as any).__originalFetch;
    };
  }, [userAuthenticationService, navigate]);

  return null; // 렌더링 없음
}

export default AuthStateListener;
