import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from '../routes/Login';
import { AuthStateSync } from './authStateSync';

function LoginRoutes({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleUnauthenticated = () => {
    console.log('User not authenticated, redirecting to login...');

    // 현재 경로를 저장 (로그인 후 리다이렉트용)
    const { pathname, search } = location;
    if (pathname !== '/login') {
      sessionStorage.setItem('ohif-redirect-to', JSON.stringify({ pathname, search }));
    }

    // 로그인 페이지로 리다이렉트
    navigate('/login');

    return null;
  };

  useEffect(() => {
    // 인증 활성화
    userAuthenticationService.set({ enabled: true });

    // handleUnauthenticated 구현 주입
    userAuthenticationService.setServiceImplementation({
      handleUnauthenticated,
    });

    // ✅ AuthStateSync로 세션 복원 (sessionStorage 또는 localStorage)
    const authStateSync = AuthStateSync.getInstance();

    authStateSync.loadAuthState().then(authState => {
      if (authState) {
        try {
          const { user } = authState;
          userAuthenticationService.setUser(user);

          // window.config 복원
          if (user.session_id && window.config?.dataSources) {
            window.config.dataSources.forEach(ds => {
              if (ds.configuration?.defaultQueryParams) {
                ds.configuration.defaultQueryParams.sessionId = user.session_id;
              }
            });
            console.log('[LoginRoutes] Restored sessionId:', user.session_id);
          }

          console.log('[LoginRoutes] User restored:', user);
        } catch (e) {
          console.error('[LoginRoutes] Restore error:', e);
        }
      }
    });
  }, [userAuthenticationService, navigate]);

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
    console.log('[Logout] Clearing auth state...');
    const authStateSync = AuthStateSync.getInstance();
    authStateSync.clearAuthState();
    navigate('/login');
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="text-white">Logging out...</div>
    </div>
  );
}

export default LoginRoutes;
