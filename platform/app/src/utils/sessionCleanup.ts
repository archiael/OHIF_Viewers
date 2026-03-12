/**
 * Session Cleanup Utilities
 *
 * 로그인 시 기존 세션을 조회하고 정리하는 유틸리티 함수들.
 * - search-session API로 동일 사용자의 모든 세션 조회
 * - 현재 세션을 제외한 나머지 세션 반환
 * - remove-session API로 세션 제거
 */

export interface SessionInfo {
  /** username */
  id: string;
  /** session UUID */
  session: string;
  /** 접속 시간 */
  access: string;
  /** IP 주소 */
  address: string;
  name?: string;
  role?: string;
  group?: string;
}

/**
 * search-session API로 해당 사용자의 모든 세션을 조회한 후,
 * 현재 세션을 제외한 나머지 세션 정보를 반환합니다.
 */
export async function fetchOtherSessions(
  username: string,
  currentSessionId: string
): Promise<{ otherSessions: SessionInfo[]; myAddress: string | null }> {
  try {
    const fetchFn = (window as any).__originalFetch || window.fetch;
    const res = await fetchFn('/v1/oauth/search-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: username,
        session: currentSessionId,
      }),
    });

    if (!res.ok) {
      console.warn('[SessionCleanup] search-session failed:', res.status);
      return { otherSessions: [], myAddress: null };
    }

    const data = await res.json();
    if (!data?.result || !Array.isArray(data.result) || data.result.length === 0) {
      return { otherSessions: [], myAddress: null };
    }

    // 현재 세션을 찾아서 내 IP 식별
    const currentEntry = data.result.find(
      (s: SessionInfo) => s.session === currentSessionId
    );
    const myAddress = currentEntry?.address || null;

    // 현재 세션을 제외한 나머지
    const otherSessions = data.result.filter(
      (s: SessionInfo) => s.session !== currentSessionId
    );

    return { otherSessions, myAddress };
  } catch (err) {
    console.warn('[SessionCleanup] Failed to fetch sessions:', err);
    return { otherSessions: [], myAddress: null };
  }
}

/**
 * 다른 세션들을 내 IP 기준으로 분류합니다.
 * - sameIpSessions: 내 IP와 같은 세션들 (access 내림차순)
 * - differentIpSessions: 내 IP와 다른 세션들
 */
export function categorizeSessionsByIp(
  otherSessions: SessionInfo[],
  myAddress: string | null
): { sameIpSessions: SessionInfo[]; differentIpSessions: SessionInfo[] } {
  if (!myAddress) {
    // 내 IP를 모르면 전부 다른 IP로 취급
    return { sameIpSessions: [], differentIpSessions: otherSessions };
  }

  const sameIpSessions: SessionInfo[] = [];
  const differentIpSessions: SessionInfo[] = [];

  for (const s of otherSessions) {
    if (s.address === myAddress) {
      sameIpSessions.push(s);
    } else {
      differentIpSessions.push(s);
    }
  }

  // 같은 IP 세션은 access 내림차순 정렬 (가장 최근이 [0])
  sameIpSessions.sort((a, b) => {
    const ta = new Date(a.access).getTime() || 0;
    const tb = new Date(b.access).getTime() || 0;
    return tb - ta;
  });

  return { sameIpSessions, differentIpSessions };
}

/**
 * access 문자열을 YYYY-MM-DD HH:mm:ss 형식으로 포맷합니다.
 */
export function formatAccessTime(access: string): string {
  if (!access) {
    return '-';
  }
  try {
    const date = new Date(access);
    if (isNaN(date.getTime())) {
      return access;
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch {
    return access;
  }
}

/**
 * 지정된 세션들을 서버에서 제거합니다 (best-effort).
 */
export async function removeSessionsFromServer(
  sessions: SessionInfo[]
): Promise<void> {
  const fetchFn = (window as any).__originalFetch || window.fetch;

  const results = await Promise.allSettled(
    sessions.map(s =>
      fetchFn('/v1/oauth/remove-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: s.session }),
      })
    )
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[SessionCleanup] ${failed.length}/${sessions.length} session removals failed`);
  }
}
