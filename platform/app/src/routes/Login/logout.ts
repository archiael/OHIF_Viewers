import { AuthStateSync } from '../../utils/authStateSync';

/**
 * Centralized logout utility
 * Clears authentication state from both sessionStorage and localStorage
 * and triggers logout event for all open tabs
 */
export function logout(navigate: (path: string) => void) {
  console.log('[Logout] User initiated logout');
  const authStateSync = AuthStateSync.getInstance();
  authStateSync.clearAuthState();
  navigate('/login');
}
