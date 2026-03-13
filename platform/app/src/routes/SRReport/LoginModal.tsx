import React, { useState, useEffect, useCallback, useRef } from 'react';
import { callLoginAPI } from '../../utils/loginAPI';
import {
  checkLockout,
  recordFailedAttempt,
  clearLockout,
  formatLockoutTime,
  LOCKOUT_DURATION_MS,
} from '../../utils/loginLockout';

interface LoginModalProps {
  show: boolean;
  onClose: () => void;
  onLoginSuccess: (sessionId: string, accessToken: string) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ show, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [lockoutMessage, setLockoutMessage] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show && usernameRef.current) {
      usernameRef.current.focus();
    }
  }, [show]);

  // 잠금 카운트다운 타이머
  useEffect(() => {
    if (lockoutRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setLockoutRemaining(prev => {
        const next = prev - 1000;
        if (next <= 0) {
          setLockoutMessage('');
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutRemaining > 0]);

  // 잠금 상태 활성화 헬퍼
  const activateLockout = useCallback((remainingMs: number) => {
    setLockoutRemaining(remainingMs);
    setLockoutMessage(
      `Account temporarily locked. Too many failed attempts. Try again in ${formatLockoutTime(remainingMs)}.`
    );
    setError('');
  }, []);

  // 카운트다운 중 메시지 실시간 업데이트
  useEffect(() => {
    if (lockoutRemaining > 0) {
      setLockoutMessage(
        `Account temporarily locked. Too many failed attempts. Try again in ${formatLockoutTime(lockoutRemaining)}.`
      );
    }
  }, [lockoutRemaining]);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password.');
      return;
    }

    // 잠금 상태 확인
    const lockStatus = checkLockout(username);
    if (lockStatus.locked) {
      activateLockout(lockStatus.remainingMs);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let data;
      try {
        data = await callLoginAPI(username, password);
      } catch (apiError) {
        // 401 에러 시 lockout 로직 적용
        if (apiError instanceof Error && apiError.message === 'Invalid username or password') {
          const result = recordFailedAttempt(username);
          if (result.locked) {
            activateLockout(LOCKOUT_DURATION_MS);
            return;
          }
          if (result.showWarning) {
            throw new Error(
              `Invalid username or password. ${result.remainingAttempts} attempt${result.remainingAttempts !== 1 ? 's' : ''} remaining before account lockout.`
            );
          }
        }
        throw apiError;
      }

      // 로그인 성공 → 잠금 기록 초기화
      clearLockout(username);

      onLoginSuccess(data.sessionId, data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  if (!show) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Login Required</h3>
        <input
          ref={usernameRef}
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={handleKeyPress}
          style={styles.input}
        />
        <div style={styles.passwordWrapper}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              setIsCapsLockOn(e.getModifierState('CapsLock'));
              handleKeyPress(e);
            }}
            onKeyUp={e => setIsCapsLockOn(e.getModifierState('CapsLock'))}
            style={styles.input}
          />
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            style={styles.eyeButton}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {isCapsLockOn && (
          <div style={styles.capsLockWarning}>Caps Lock is on</div>
        )}
        {lockoutMessage && (
          <div style={styles.lockoutBanner}>{lockoutMessage}</div>
        )}
        {error && !lockoutMessage && <div style={styles.error}>{error}</div>}
        <div style={styles.buttons}>
          <button
            onClick={onClose}
            style={{ ...styles.button, ...styles.secondaryButton }}
          >
            Cancel
          </button>
          <button
            onClick={handleLogin}
            disabled={isLoading || lockoutRemaining > 0}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              ...(isLoading || lockoutRemaining > 0 ? styles.disabledButton : {}),
            }}
          >
            {isLoading ? 'Logging in...' : 'Login & Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0, 0, 0, 0.8)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#2a2a2a',
    padding: '30px',
    borderRadius: '8px',
    maxWidth: '400px',
    width: '90%',
  },
  title: {
    color: '#5acce6',
    marginBottom: '20px',
  },
  input: {
    width: '100%',
    padding: '10px',
    marginBottom: '15px',
    background: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    marginBottom: '15px',
    color: '#ff9090',
    fontSize: '14px',
  },
  buttons: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
  },
  primaryButton: {
    background: '#5acce6',
    color: '#000',
  },
  secondaryButton: {
    background: '#444',
    color: '#e0e0e0',
  },
  disabledButton: {
    background: '#333',
    color: '#666',
    cursor: 'not-allowed',
  },
  passwordWrapper: {
    position: 'relative' as const,
  },
  eyeButton: {
    position: 'absolute' as const,
    right: '10px',
    top: '10px',
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
  },
  capsLockWarning: {
    marginBottom: '15px',
    color: '#f0c040',
    fontSize: '13px',
  },
  lockoutBanner: {
    marginBottom: '15px',
    padding: '10px',
    background: 'rgba(180, 130, 0, 0.15)',
    border: '1px solid #b48200',
    borderRadius: '4px',
    color: '#f0c040',
    fontSize: '13px',
  },
};

export default LoginModal;
