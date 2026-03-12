import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, ButtonEnums } from '@ohif/ui';
import Input from '@ohif/ui/src/components/Input';
import { useUserAuthentication } from '@ohif/ui-next';
import { AuthStateSync } from '../../utils/authStateSync';
import { markValidationDone } from '../../utils/sessionValidator';
import {
  checkLockout,
  recordFailedAttempt,
  clearLockout,
  formatLockoutTime,
  LOCKOUT_DURATION_MS,
} from '../../utils/loginLockout';
import { callLoginAPI } from '../../utils/loginAPI';
import {
  fetchOtherSessions,
  categorizeSessionsByIp,
  formatAccessTime,
  SessionInfo,
} from '../../utils/sessionCleanup';
import SessionCleanupModal from '../../components/SessionCleanupModal';
import LastLoginDialog from './LastLoginDialog';

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

  // 세션 정리 모달 상태
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [otherSessions, setOtherSessions] = useState<SessionInfo[]>([]);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // 같은 IP 마지막 로그인 다이얼로그 상태
  const [showLastLoginDialog, setShowLastLoginDialog] = useState(false);
  const [lastLoginAccessTime, setLastLoginAccessTime] = useState('');

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
      // 공유 로그인 API 호출 (암호화 + fetch)
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

      // 리다이렉트 URL 결정
      let redirectPath = '/';
      const redirectTo = sessionStorage.getItem('ohif-redirect-to');
      if (redirectTo) {
        try {
          const { pathname, search } = JSON.parse(redirectTo);
          sessionStorage.removeItem('ohif-redirect-to');
          redirectPath = pathname + (search || '');
        } catch (e) {
          sessionStorage.removeItem('ohif-redirect-to');
        }
      }

      // 기존 세션 조회 및 IP 기준 분류
      const { otherSessions: others, myAddress } = await fetchOtherSessions(
        user.username,
        user.session_id
      );

      // search-session 호출 완료 → 쿨다운 시작 (후속 중복 호출 방지)
      markValidationDone();

      if (others.length > 0) {
        const { sameIpSessions, differentIpSessions } = categorizeSessionsByIp(
          others,
          myAddress
        );

        if (differentIpSessions.length > 0) {
          // 다른 IP 세션이 있으면 → 정리 모달 (다른 IP 세션만 표시)
          setOtherSessions(differentIpSessions);
          setPendingRedirect(redirectPath);
          setShowSessionModal(true);
          return;
        }

        if (sameIpSessions.length > 0) {
          // 같은 IP 세션만 있으면 → 마지막 로그인 시간 다이얼로그
          const lastAccess = formatAccessTime(sameIpSessions[0].access);
          setLastLoginAccessTime(lastAccess);
          setPendingRedirect(redirectPath);
          setShowLastLoginDialog(true);
          return;
        }
      }

      navigate(redirectPath);
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  };

  // 세션 정리 모달 콜백
  const handleSessionCleanupComplete = () => {
    setShowSessionModal(false);
    setOtherSessions([]);
    navigate(pendingRedirect || '/');
    setPendingRedirect(null);
  };

  const handleSessionCleanupSkip = () => {
    setShowSessionModal(false);
    setOtherSessions([]);
    navigate(pendingRedirect || '/');
    setPendingRedirect(null);
  };

  // 같은 IP 마지막 로그인 다이얼로그 콜백
  const handleLastLoginConfirm = () => {
    setShowLastLoginDialog(false);
    setLastLoginAccessTime('');
    navigate(pendingRedirect || '/');
    setPendingRedirect(null);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-black">
      <div className="border-secondary-light w-full max-w-md rounded-lg border bg-black p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold text-white">MView-Web</h1>

        <form
          className="space-y-4"
          onSubmit={handleSubmit}
          autoComplete="on"
        >
          {/* 아이디 입력 */}
          <Input
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter 'manager'"
            autoComplete="username"
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
              onKeyDown={e => setIsCapsLockOn(e.getModifierState('CapsLock'))}
              onKeyUp={e => setIsCapsLockOn(e.getModifierState('CapsLock'))}
              placeholder="Enter '1234'"
              autoComplete="current-password"
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
            onClick={() => {}}
            disabled={isLoading || lockoutRemaining > 0}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>

          {/* 로컬 파일 열기 링크 */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/local')}
              className="text-primary-light hover:text-primary-active transition-colors"
            >
              Open local files without login
            </button>
          </div>
        </form>
      </div>

      {showSessionModal && otherSessions.length > 0 && (
        <SessionCleanupModal
          sessions={otherSessions}
          onConfirm={handleSessionCleanupComplete}
          onSkip={handleSessionCleanupSkip}
          title="기존 세션 정리"
          description="다음 세션들이 서버에 남아있습니다:"
          showSessionId
        />
      )}

      {showLastLoginDialog && (
        <LastLoginDialog
          lastAccessTime={lastLoginAccessTime}
          onConfirm={handleLastLoginConfirm}
        />
      )}
    </div>
  );
};

export default Login;
