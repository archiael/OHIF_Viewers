import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, ButtonEnums } from '@ohif/ui';
import Input from '@ohif/ui/src/components/Input';
import { useUserAuthentication } from '@ohif/ui-next';
import { AuthStateSync } from '../../utils/authStateSync';
import { resetValidationTimer } from '../../utils/sessionValidator';
import {
  checkLockout,
  recordFailedAttempt,
  clearLockout,
  formatLockoutTime,
  LOCKOUT_DURATION_MS,
} from '../../utils/loginLockout';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, { setUser }] = useUserAuthentication();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [lockoutMessage, setLockoutMessage] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

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

  // AES-CBC 암호화 함수
  const encryptPassword = async (password: string): Promise<string> => {
    if (!password) {
      return '';
    }

    const key = process.env.APP_ENCRYPTION_KEY;
    const iv = process.env.APP_ENCRYPTION_IV;

    if (!key || !iv) {
      throw new Error('Encryption configuration is missing');
    }

    try {
      // 키와 IV를 바이트 배열로 변환
      const encoder = new TextEncoder();
      const keyData = encoder.encode(key);
      const ivData = encoder.encode(iv);

      // CryptoKey 생성 (AES-128)
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-CBC', length: 128 },
        false,
        ['encrypt']
      );

      // 평문을 바이트 배열로 변환
      const plainData = encoder.encode(password);

      // AES-CBC 암호화
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-CBC',
          iv: ivData,
        },
        cryptoKey,
        plainData
      );

      // Base64 인코딩
      const encryptedArray = new Uint8Array(encrypted);
      const base64 = btoa(String.fromCharCode(...encryptedArray));
      return base64;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Password encryption failed');
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
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
      // 비밀번호 AES-CBC 암호화
      const encryptedPassword = await encryptPassword(password);

      // Login API 호출 (프록시를 통해 요청)
      const response = await fetch('/v1/oauth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: encryptedPassword,
          client_info: '',
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
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
          throw new Error('Invalid username or password');
        }
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // 로그인 성공 → 잠금 기록 초기화
      clearLockout(username);

      // 사용자 정보 설정
      const user = {
        username: data.id,
        name: data.name,
        role: data.role,
        group: data.group,
        session_id: data.sessionId,
        authenticated: true,
        loginTime: new Date().toISOString(),
      };

      // ✅ AuthStateSync를 사용하여 sessionStorage + localStorage에 저장
      const authStateSync = AuthStateSync.getInstance();
      await authStateSync.saveAuthState({
        user,
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        token_type: data.tokenType,
      });

      // UserAuthenticationService에 사용자 설정
      setUser(user);

      // window.config.dataSources에 sessionId 설정
      if (user.session_id && window.config?.dataSources) {
        window.config.dataSources.forEach(ds => {
          if (ds.configuration?.defaultQueryParams) {
            ds.configuration.defaultQueryParams.sessionId = user.session_id;
          }
        });
      }

      // 검증 타이머 리셋 (로그인 직후 즉시 검증 가능하도록)
      resetValidationTimer();

      // 리다이렉트 처리 (저장된 URL로 복귀)
      const redirectTo = sessionStorage.getItem('ohif-redirect-to');
      if (redirectTo) {
        try {
          const { pathname, search } = JSON.parse(redirectTo);
          sessionStorage.removeItem('ohif-redirect-to'); // 사용 후 정리
          navigate(pathname + (search || ''));
        } catch (e) {
          sessionStorage.removeItem('ohif-redirect-to');
          navigate('/');
        }
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-black">
      <div className="border-secondary-light w-full max-w-md rounded-lg border bg-black p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold text-white">MView-Web</h1>

        <div className="space-y-4">
          {/* 아이디 입력 */}
          <Input
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter 'manager'"
            autoFocus
          />

          {/* 비밀번호 입력 */}
          <div className="relative">
            <Input
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              onKeyDown={e => setIsCapsLockOn(e.getModifierState('CapsLock'))}
              onKeyUp={e => setIsCapsLockOn(e.getModifierState('CapsLock'))}
              placeholder="Enter '1234'"
            />
            <button
              type="button"
              className="absolute right-2 top-[38px] text-gray-400 hover:text-white transition-colors"
              onClick={() => setShowPassword(prev => !prev)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {isCapsLockOn && (
            <div className="text-sm text-yellow-400">Caps Lock is on</div>
          )}

          {/* 잠금 배너 */}
          {lockoutMessage && (
            <div className="rounded border border-yellow-600 bg-yellow-900/30 p-3 text-sm text-yellow-400">
              {lockoutMessage}
            </div>
          )}

          {/* 에러 메시지 */}
          {error && !lockoutMessage && <div className="text-sm text-red-500">{error}</div>}

          {/* 로그인 버튼 */}
          <Button
            type={ButtonEnums.type.primary}
            className="w-full"
            onClick={handleLogin}
            disabled={isLoading || lockoutRemaining > 0}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>

          {/* 로컬 파일 열기 링크 */}
          <div className="mt-4 text-center">
            <a
              href="/local"
              className="text-primary-light hover:text-primary-active transition-colors"
            >
              Open local files without login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
