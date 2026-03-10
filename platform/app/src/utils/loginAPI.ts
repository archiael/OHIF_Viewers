import { encryptAesCbc } from './aesCbc';

const LOGIN_ENDPOINT = '/v1/oauth/login';

/** AES-CBC 비밀번호 암호화 */
export async function encryptPassword(password: string): Promise<string> {
  if (!password) {
    return '';
  }

  const key = process.env.APP_ENCRYPTION_KEY;
  const iv = process.env.APP_ENCRYPTION_IV;

  if (!key || !iv) {
    throw new Error('Encryption configuration is missing');
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const ivData = encoder.encode(iv);
    const plainData = encoder.encode(password);

    const encrypted = await encryptAesCbc(plainData, keyData, ivData);

    const encryptedArray = new Uint8Array(encrypted);
    const base64 = btoa(String.fromCharCode(...encryptedArray));
    return base64;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Password encryption failed');
  }
}

/** 클라이언트 정보 수집 (브라우저 환경 제한으로 MAC/Serial은 placeholder) */
function getClientInfo(): string {
  const nav = navigator;
  const screen = window.screen;

  const hostname = window.location.hostname || '';
  const userAgent = nav.userAgent || '';
  const platform = nav.platform || '';
  const language = nav.language || '';
  const languages = (nav.languages || []).join(';');
  const cpuCores = nav.hardwareConcurrency || 0;
  const deviceMemory = (nav as any).deviceMemory || 0;
  const screenRes = `${screen.width}x${screen.height}`;
  const screenAvail = `${screen.availWidth}x${screen.availHeight}`;
  const colorDepth = screen.colorDepth || 0;
  const pixelRatio = window.devicePixelRatio || 1;
  const touchPoints = nav.maxTouchPoints || 0;
  const online = nav.onLine;
  const cookieEnabled = nav.cookieEnabled;

  return [
    `LocalHost:${hostname}`,
    `MacAddress:00-00-00-00-00-00`,
    `MotherboardSerialno:UNKNOWN`,
    `UserAgent:${userAgent}`,
    `Platform:${platform}`,
    `Language:${language}`,
    `Languages:${languages}`,
    `CpuCores:${cpuCores}`,
    `DeviceMemory:${deviceMemory}GB`,
    `Screen:${screenRes}`,
    `ScreenAvail:${screenAvail}`,
  ].join(',');
}

/** 로그인 API 호출 결과 타입 */
export interface LoginResponse {
  id: string;
  name: string;
  role: string;
  group: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

/** 로그인 API 호출 (암호화 + fetch) */
export async function callLoginAPI(username: string, password: string): Promise<LoginResponse> {
  const encryptedPassword = await encryptPassword(password);

  const response = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: username,
      username: username,
      password: encryptedPassword,
      client_info: getClientInfo(),
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
