/**
 * Authentication State Synchronization Service
 * Manages auth state across browser tabs using hybrid localStorage + sessionStorage
 * - sessionStorage: Primary storage (auto-cleanup on tab close)
 * - localStorage: Backup for tab sharing (encrypted)
 * - Includes auto-expiration (8 hours default)
 */

interface AuthState {
  user: {
    username: string;
    name: string;
    role: string;
    group: string;
    session_id: string;
    authenticated: boolean;
    loginTime: string;
  };
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiresAt?: number;
}

const STORAGE_KEYS = {
  AUTH_STATE: 'ohif-auth-state',
  LOGOUT_EVENT: 'ohif-logout-event',
  LOGIN_EVENT: 'ohif-login-event',
} as const;

const SESSION_DURATION = 60 * 60 * 1000; // 60분 후 자동 만료

export class AuthStateSync {
  private static instance: AuthStateSync;
  private listeners: Set<(state: AuthState | null) => void> = new Set();
  private encryptionKey: string;
  private encryptionIV: string;

  private constructor() {
    // Use same encryption key/IV as password encryption
    this.encryptionKey = process.env.APP_ENCRYPTION_KEY || '>}I>o#S?hYWfcB7B';
    this.encryptionIV = process.env.APP_ENCRYPTION_IV || '>}I>o#S?hYWfcB7B';

    window.addEventListener('storage', this.handleStorageEvent.bind(this));
  }

  static getInstance(): AuthStateSync {
    if (!AuthStateSync.instance) {
      AuthStateSync.instance = new AuthStateSync();
    }
    return AuthStateSync.instance;
  }

  /**
   * AES-CBC encryption (same method as Login.tsx password encryption)
   */
  private async encrypt(text: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.encryptionKey);
      const ivData = encoder.encode(this.encryptionIV);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-CBC', length: 128 },
        false,
        ['encrypt']
      );

      const plainData = encoder.encode(text);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: ivData },
        cryptoKey,
        plainData
      );

      const encryptedArray = new Uint8Array(encrypted);
      return btoa(String.fromCharCode(...encryptedArray));
    } catch (error) {
      console.error('[AuthStateSync] Encryption error:', error);
      throw error;
    }
  }

  /**
   * AES-CBC decryption
   */
  private async decrypt(encryptedText: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.encryptionKey);
      const ivData = encoder.encode(this.encryptionIV);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-CBC', length: 128 },
        false,
        ['decrypt']
      );

      const encryptedBytes = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: ivData },
        cryptoKey,
        encryptedBytes
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('[AuthStateSync] Decryption error:', error);
      throw error;
    }
  }

  /**
   * Save authentication state to both storages
   */
  async saveAuthState(authState: AuthState): Promise<void> {
    const stateWithExpiry = {
      ...authState,
      expiresAt: Date.now() + SESSION_DURATION,
    };

    const stateJson = JSON.stringify(stateWithExpiry);

    // Primary: sessionStorage (plain, auto-cleanup on tab close)
    sessionStorage.setItem('user', JSON.stringify(authState.user));
    sessionStorage.setItem('access_token', authState.access_token);
    sessionStorage.setItem('refresh_token', authState.refresh_token);
    sessionStorage.setItem('token_type', authState.token_type);

    // Backup: localStorage (encrypted, for tab sharing)
    try {
      const encrypted = await this.encrypt(stateJson);
      localStorage.setItem(STORAGE_KEYS.AUTH_STATE, encrypted);

      // Trigger login event for other tabs
      localStorage.setItem(STORAGE_KEYS.LOGIN_EVENT, Date.now().toString());
      localStorage.removeItem(STORAGE_KEYS.LOGIN_EVENT);

      console.log('[AuthStateSync] Saved to both storages (localStorage encrypted)');
    } catch (error) {
      console.warn('[AuthStateSync] localStorage unavailable (private mode?):', error);
      // Continue with sessionStorage only
    }
  }

  /**
   * Load authentication state from sessionStorage or localStorage
   */
  async loadAuthState(): Promise<AuthState | null> {
    // Try sessionStorage first (current tab, plain)
    const sessionUser = sessionStorage.getItem('user');
    if (sessionUser) {
      try {
        return {
          user: JSON.parse(sessionUser),
          access_token: sessionStorage.getItem('access_token') || '',
          refresh_token: sessionStorage.getItem('refresh_token') || '',
          token_type: sessionStorage.getItem('token_type') || '',
        };
      } catch (e) {
        console.error('[AuthStateSync] sessionStorage parse error:', e);
      }
    }

    // Fallback to localStorage (from another tab, encrypted)
    const localEncryptedState = localStorage.getItem(STORAGE_KEYS.AUTH_STATE);
    if (localEncryptedState) {
      try {
        const decryptedJson = await this.decrypt(localEncryptedState);
        const authState = JSON.parse(decryptedJson);

        // Check expiration
        if (authState.expiresAt && Date.now() > authState.expiresAt) {
          console.log('[AuthStateSync] Session expired, clearing');
          this.clearAuthState();
          return null;
        }

        // Copy to sessionStorage (plain)
        sessionStorage.setItem('user', JSON.stringify(authState.user));
        sessionStorage.setItem('access_token', authState.access_token);
        sessionStorage.setItem('refresh_token', authState.refresh_token);
        sessionStorage.setItem('token_type', authState.token_type);

        console.log('[AuthStateSync] Restored from localStorage (decrypted)');
        return authState;
      } catch (e) {
        console.error('[AuthStateSync] localStorage decrypt/parse error:', e);
        // Clear corrupted data
        localStorage.removeItem(STORAGE_KEYS.AUTH_STATE);
      }
    }

    return null;
  }

  /**
   * Clear authentication state from both storages
   * @param triggerEvent - Whether to trigger logout event for other tabs (default: true)
   */
  clearAuthState(triggerEvent: boolean = true): void {
    // Clear sessionStorage
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('token_type');
    sessionStorage.removeItem('ohif-redirect-to'); // Also clear redirect

    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.AUTH_STATE);

    // Trigger logout event for other tabs (only if requested)
    if (triggerEvent) {
      try {
        localStorage.setItem(STORAGE_KEYS.LOGOUT_EVENT, Date.now().toString());
        localStorage.removeItem(STORAGE_KEYS.LOGOUT_EVENT);
      } catch (e) {
        console.warn('[AuthStateSync] localStorage unavailable:', e);
      }
    }

    console.log('[AuthStateSync] Cleared both storages');
  }

  /**
   * Refresh session expiration time (extend session on user activity)
   * 서버 요청이나 사용자 활동 시 세션 만료 시간을 갱신합니다
   */
  async refreshSession(): Promise<void> {
    // localStorage에서 현재 인증 상태 확인
    const localEncryptedState = localStorage.getItem(STORAGE_KEYS.AUTH_STATE);
    if (!localEncryptedState) {
      return; // 세션이 없으면 갱신 안 함
    }

    try {
      // 복호화
      const decryptedJson = await this.decrypt(localEncryptedState);
      const authState = JSON.parse(decryptedJson);

      // 만료 시간이 없거나 이미 만료되었으면 갱신 안 함
      if (!authState.expiresAt || Date.now() > authState.expiresAt) {
        return;
      }

      // 새로운 만료 시간 설정
      const newExpiresAt = Date.now() + SESSION_DURATION;
      const updatedAuthState = {
        ...authState,
        expiresAt: newExpiresAt,
      };

      // localStorage에 다시 암호화하여 저장
      const encrypted = await this.encrypt(JSON.stringify(updatedAuthState));
      localStorage.setItem(STORAGE_KEYS.AUTH_STATE, encrypted);

      console.log('[AuthStateSync] Session refreshed, new expiry:', new Date(newExpiresAt).toISOString());
    } catch (e) {
      console.error('[AuthStateSync] Failed to refresh session:', e);
    }
  }

  /**
   * Subscribe to auth state changes from other tabs
   */
  subscribe(listener: (state: AuthState | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Handle storage events from other tabs
   */
  private handleStorageEvent(event: StorageEvent): void {
    if (event.key === STORAGE_KEYS.LOGOUT_EVENT) {
      console.log('[AuthStateSync] Logout from another tab');
      // Clear storage without triggering another event (prevent infinite loop)
      this.clearAuthState(false);
      this.notifyListeners(null);
    } else if (event.key === STORAGE_KEYS.LOGIN_EVENT) {
      console.log('[AuthStateSync] Login from another tab');
      // Reload auth state
      this.loadAuthState().then(authState => {
        if (authState) {
          this.notifyListeners(authState);
        }
      });
    }
  }

  private notifyListeners(state: AuthState | null): void {
    this.listeners.forEach(listener => listener(state));
  }
}

export default AuthStateSync;
