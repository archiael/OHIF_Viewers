import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthStateSync } from './authStateSync';

/**
 * AuthStateListener
 *
 * 모든 페이지에서 다중 탭 인증 상태 동기화를 감지하는 컴포넌트
 * - 다른 탭의 로그아웃 감지 → /login 리다이렉트
 * - 다른 탭의 로그인 감지 → sessionId 동기화
 * - 탭 포커스 시 sessionId 동기화
 * - 서버 요청 시 세션 자동 갱신 (Fetch Interceptor)
 */
function AuthStateListener({ userAuthenticationService }) {
  const navigate = useNavigate();

  useEffect(() => {
    const authStateSync = AuthStateSync.getInstance();

    // ⚠️ 로그아웃 시 강제 리다이렉트 비활성화
    const unsubscribe = authStateSync.subscribe(newState => {
      if (!newState) {
        console.log('[AuthStateListener] Logout from another tab (redirect disabled)');
        userAuthenticationService.reset();
        // navigate('/login');  // 비활성화: 로그인 페이지로 강제 이동 안 함
      }
    });

    // ✅ 탭 포커스 시 sessionId 동기화
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        authStateSync.loadAuthState().then(currentState => {
          if (currentState?.user?.session_id && window.config?.dataSources) {
            window.config.dataSources.forEach(ds => {
              if (ds.configuration?.defaultQueryParams) {
                ds.configuration.defaultQueryParams.sessionId = currentState.user.session_id;
              }
            });
            console.log('[AuthStateListener] Synced sessionId on focus');
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ✅ Fetch Interceptor: 서버 요청 시 세션 갱신
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const response = await originalFetch(...args);

        // 성공적인 요청이면 세션 갱신 (로그인 관련 요청 제외)
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const isLoginRequest = url?.includes('/login') || url?.includes('/logout');

        if (response.ok && !isLoginRequest) {
          // 세션 갱신 (비동기이지만 기다리지 않음 - 성능을 위해)
          authStateSync.refreshSession().catch(err => {
            console.warn('[AuthStateListener] Failed to refresh session:', err);
          });
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
    };
  }, [userAuthenticationService, navigate]);

  return null; // 렌더링 없음
}

export default AuthStateListener;
