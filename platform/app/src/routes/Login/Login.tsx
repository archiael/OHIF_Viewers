import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, ButtonEnums } from '@ohif/ui';
import Input from '@ohif/ui/src/components/Input';
import { useUserAuthentication } from '@ohif/ui-next';
import { AuthStateSync } from '../../utils/authStateSync';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [, { setUser }] = useUserAuthentication();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

    setIsLoading(true);
    setError('');

    try {
      console.log('Login attempt:', { username });

      // 비밀번호 AES-CBC 암호화
      const encryptedPassword = await encryptPassword(password);
      console.log('Encrypted password:', encryptedPassword);

      // Login API 호출 (프록시를 통해 요청)
      const response = await fetch('/v2/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: username,
          password: encryptedPassword,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid username or password');
        }
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Login successful:', { user_id: data.user_id, role: data.role });

      // 사용자 정보 설정
      const user = {
        username: data.user_id,
        name: data.name,
        role: data.role,
        group: data.group,
        session_id: data.session_id,
        authenticated: true,
        loginTime: new Date().toISOString(),
      };

      // ✅ AuthStateSync를 사용하여 sessionStorage + localStorage에 저장
      const authStateSync = AuthStateSync.getInstance();
      await authStateSync.saveAuthState({
        user,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
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
        console.log('[Login] Set sessionId in window.config:', user.session_id);
      }

      // 리다이렉트 처리
      const redirectTo = sessionStorage.getItem('ohif-redirect-to');
      if (redirectTo) {
        try {
          const { pathname, search } = JSON.parse(redirectTo);
          navigate(pathname + (search || ''));
        } catch (e) {
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
            value={'manager'}
            onChange={e => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter username"
            autoFocus
          />

          {/* 비밀번호 입력 */}
          <Input
            id="password"
            label="Password"
            type="password"
            value={'1234'}
            onChange={e => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter password"
          />

          {/* 에러 메시지 */}
          {error && <div className="text-sm text-red-500">{error}</div>}

          {/* 로그인 버튼 */}
          <Button
            type={ButtonEnums.type.primary}
            className="w-full"
            onClick={handleLogin}
            disabled={isLoading}
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
