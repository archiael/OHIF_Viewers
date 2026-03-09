import { AuthStateSync } from '../../utils/authStateSync';

/**
 * Centralized logout utility
 * Clears authentication state from both sessionStorage and localStorage
 * and triggers logout event for all open tabs.
 * Uses replace navigation to prevent back-button access to authenticated pages.
 */
export function logout(
  navigate: (path: string, options?: { replace?: boolean }) => void,
  userAuthenticationService?: { reset: () => void }
) {
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.clearAuthState();

  // React 인메모리 인증 상태 초기화 (PrivateRoute 우회 방지)
  if (userAuthenticationService) {
    userAuthenticationService.reset();
  }

  // replace: true로 현재 히스토리 항목을 대체하여 뒤로가기 방지
  navigate('/login', { replace: true });
}
