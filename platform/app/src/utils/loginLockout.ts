const STORAGE_KEY = 'ohif-login-lockout';
const MAX_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30분
const WARNING_THRESHOLD = 3; // 3회 실패부터 경고

interface LockoutRecord {
  failCount: number;
  lockedUntil: number | null; // Unix timestamp (ms)
}

type LockoutMap = Record<string, LockoutRecord>;

function loadRecords(): LockoutMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRecords(records: LockoutMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

export function checkLockout(username: string): { locked: boolean; remainingMs: number } {
  const key = normalizeUsername(username);
  const records = loadRecords();
  const record = records[key];

  if (!record || !record.lockedUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const remaining = record.lockedUntil - Date.now();

  if (remaining <= 0) {
    // 잠금 만료 → 자동 해제
    record.failCount = 0;
    record.lockedUntil = null;
    saveRecords(records);
    return { locked: false, remainingMs: 0 };
  }

  return { locked: true, remainingMs: remaining };
}

export function recordFailedAttempt(username: string): {
  locked: boolean;
  failCount: number;
  remainingAttempts: number;
  showWarning: boolean;
} {
  const key = normalizeUsername(username);
  const records = loadRecords();
  const record = records[key] || { failCount: 0, lockedUntil: null };

  // 이미 잠긴 상태면 카운트 증가 없이 반환
  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    return {
      locked: true,
      failCount: record.failCount,
      remainingAttempts: 0,
      showWarning: false,
    };
  }

  record.failCount += 1;

  if (record.failCount >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    records[key] = record;
    saveRecords(records);
    return {
      locked: true,
      failCount: record.failCount,
      remainingAttempts: 0,
      showWarning: false,
    };
  }

  records[key] = record;
  saveRecords(records);

  const remainingAttempts = MAX_ATTEMPTS - record.failCount;

  return {
    locked: false,
    failCount: record.failCount,
    remainingAttempts,
    showWarning: record.failCount >= WARNING_THRESHOLD,
  };
}

export function clearLockout(username: string): void {
  const key = normalizeUsername(username);
  const records = loadRecords();
  delete records[key];
  saveRecords(records);
}

export function formatLockoutTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
