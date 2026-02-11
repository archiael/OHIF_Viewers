import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from '../routes/Login';
import { AuthStateSync } from './authStateSync';

function LoginRoutes({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleUnauthenticated = () => {
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
    // ⚠️ 인증 비활성화: 로그인 없이 모든 페이지 접근 가능
    userAuthenticationService.set({ enabled: false });

    // handleUnauthenticated 구현 주입 (인증 비활성화되어 호출되지 않음)
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
