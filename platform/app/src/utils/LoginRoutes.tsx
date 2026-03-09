import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from '../routes/Login';
import { AuthStateSync } from './authStateSync';

function LoginRoutes({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // ✅ 인증 활성화: 비로그인 사용자는 PrivateRoute에서 /login으로 리다이렉트
    userAuthenticationService.set({ enabled: true });

    // ✅ AuthStateSync로 세션 복원 + 서버 세션 유효성 검증
    const authStateSync = AuthStateSync.getInstance();

    authStateSync.loadAuthState().then(async authState => {
      if (authState) {
        try {
          const { user } = authState;

          // 서버 세션 유효성 검증
          try {
            const res = await fetch('/v1/oauth/search-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: user.username,
                session: user.session_id,
              }),
            });

            if (res.status === 404 || res.status === 401) {
              // 서버에서 세션이 만료/삭제됨 → 클리어 후 리다이렉트
              console.warn('[LoginRoutes] Server session invalid, clearing local session');
              authStateSync.clearAuthState();
              return;
            }
          } catch (networkErr) {
            // 네트워크 오류 시 로컬 세션 유지 (오프라인 퍼스트)
            console.warn('[LoginRoutes] Session validation network error, keeping local session:', networkErr);
          }

          userAuthenticationService.setUser(user);

          // window.config 복원
          if (user.session_id && window.config?.dataSources) {
            window.config.dataSources.forEach(ds => {
              if (ds.configuration?.defaultQueryParams) {
                ds.configuration.defaultQueryParams.sessionId = user.session_id;
              }
            });
          }
        } catch (e) {
          console.error('[LoginRoutes] Restore error:', e);
        }
      }
    });
  }, [userAuthenticationService, navigate]);

  // 현재 경로가 로그인 관련 경로일 때만 Routes 렌더링
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/logout';

  if (!isAuthRoute) {
    return null;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={<Login />}
      />
      <Route
        path="/logout"
        element={<LogoutComponent navigate={navigate} />}
      />
    </Routes>
  );
}

// Logout Component
function LogoutComponent({ navigate }) {
  useEffect(() => {
    const performLogout = async () => {
      const authStateSync = AuthStateSync.getInstance();

      // 서버 세션 무효화 (실패해도 클라이언트 로그아웃은 진행)
      try {
        const authState = await authStateSync.loadAuthState();
        if (authState?.user?.session_id) {
          await fetch('/v1/oauth/remove-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: authState.user.session_id }),
          });
        }
      } catch (err) {
        console.warn('[LogoutComponent] Failed to invalidate server session:', err);
      }

      authStateSync.clearAuthState();
      navigate('/login');
    };

    performLogout();
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="text-white">Logging out...</div>
    </div>
  );
}

export default LoginRoutes;
