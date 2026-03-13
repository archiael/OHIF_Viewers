import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from '../routes/Login';
import { AuthStateSync } from './authStateSync';
import { validateServerSession, invalidateSessionAndRedirect } from './sessionValidator';

function LoginRoutes({ userAuthenticationService }) {
  const navigate = useNavigate();
  const location = useLocation();

  // location을 ref로 관리하여 useEffect가 location 변경 시 재실행되지 않도록 함
  // invalidateSessionAndRedirect에서 최신 location 값을 참조할 수 있음
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    let cancelled = false;

    // ✅ Step 1: sessionStorage에서 동기적으로 user 복원 (race condition 방지)
    // loadAuthState()는 async이므로 .then()이 microtask queue로 지연됨.
    // set({ enabled: true }) 후 PrivateRoute가 re-render될 때 user가 아직 null이면
    // /login으로 리다이렉트되는 문제를 방지하기 위해 동기적으로 먼저 복원.
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        const user = JSON.parse(sessionUser);
        userAuthenticationService.setUser(user);

        // window.config sessionId 동기 복원
        if (user.session_id && window.config?.dataSources) {
          window.config.dataSources.forEach(ds => {
            if (ds.configuration?.defaultQueryParams) {
              ds.configuration.defaultQueryParams.sessionId = user.session_id;
            }
          });
        }
      } catch (e) {
        console.error('[LoginRoutes] sessionStorage parse error:', e);
      }
    }

    // ✅ Step 2: 인증 활성화 (user가 이미 설정된 후)
    userAuthenticationService.set({ enabled: true });

    // ✅ Step 3: 비동기 서버 세션 검증 (백그라운드)
    // cancelled 플래그로 컴포넌트 언마운트 후 stale async chain이 setUser를 호출하는 것을 방지
    const authStateSync = AuthStateSync.getInstance();
    authStateSync.loadAuthState().then(async authState => {
      if (cancelled) return;
      if (authState) {
        try {
          const { user } = authState;

          // 서버 세션 유효성 검증 (중앙화된 validator 사용)
          const result = await validateServerSession({ force: true });
          if (cancelled) return;
          if (!result.valid || result.changed) {
            console.warn('[LoginRoutes] Server session invalid, redirecting to /login');
            invalidateSessionAndRedirect(userAuthenticationService, navigate, locationRef.current);
            return;
          }

          userAuthenticationService.setUser(user);

          // window.config 복원 (서버 검증 후 최신 데이터로 갱신)
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

    return () => { cancelled = true; };
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
        element={
          <LogoutComponent
            navigate={navigate}
            userAuthenticationService={userAuthenticationService}
          />
        }
      />
    </Routes>
  );
}

// "로그아웃되었습니다" 확인 다이얼로그
function LogoutConfirmDialog({ onConfirm }: { onConfirm: () => void }) {
  // 3초 후 자동 이동
  useEffect(() => {
    const timer = setTimeout(onConfirm, 3000);
    return () => clearTimeout(timer);
  }, [onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="border-secondary-light w-full max-w-sm rounded-lg border bg-black p-6 text-center">
        <p className="mb-6 text-lg text-white">로그아웃되었습니다.</p>
        <button
          className="rounded bg-blue-600 px-6 py-2 text-sm text-white transition-colors hover:bg-blue-500"
          onClick={onConfirm}
        >
          확인
        </button>
      </div>
    </div>
  );
}

// Logout Component
function LogoutComponent({ navigate, userAuthenticationService }) {
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    const performLogout = async () => {
      const authStateSync = AuthStateSync.getInstance();

      // 서버 세션 무효화 (실패해도 클라이언트 로그아웃은 진행)
      // __originalFetch로 Fetch Interceptor 우회 (401/403 시 search-session 재호출 방지)
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
        console.warn('[LogoutComponent] Failed to invalidate server session:', err);
      }

      // Storage + React 인메모리 상태 모두 초기화
      authStateSync.clearAuthState();
      userAuthenticationService.reset();

      // "로그아웃되었습니다" dialog 표시
      setShowLogoutDialog(true);
    };

    performLogout();
  }, [navigate, userAuthenticationService]);

  const handleConfirm = () => {
    // replace: true로 히스토리 스택에서 /logout을 제거하여 뒤로가기 방지
    navigate('/login', { replace: true });
  };

  if (showLogoutDialog) {
    return <LogoutConfirmDialog onConfirm={handleConfirm} />;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="text-white">Logging out...</div>
    </div>
  );
}

export default LoginRoutes;
