/**
 * HTJ2K Range Request 디버그 로거
 *
 * 로그를 배열에 저장하고, 파일로 다운로드하거나 테이블로 출력할 수 있습니다.
 *
 * 사용법:
 * 1. 콘솔에서 window.__htj2kDebug.show() - 테이블로 출력
 * 2. 콘솔에서 window.__htj2kDebug.download() - JSON 파일로 다운로드
 * 3. 콘솔에서 window.__htj2kDebug.clear() - 로그 초기화
 */

interface LogEntry {
  timestamp: string;
  source: string;
  message: string;
  data?: unknown;
}

/** 로그 저장소 */
const logs: LogEntry[] = [];

/** 최대 로그 개수 */
const MAX_LOGS = 500;

/**
 * 로그 추가
 * @param source - 로그 소스 (예: 'customWadorsLoader', 'getPixelData')
 * @param message - 로그 메시지
 * @param data - 추가 데이터 (선택)
 */
export function htj2kLog(source: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    source,
    message,
    data: data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined,
  };

  logs.push(entry);

  // 최대 개수 초과 시 오래된 로그 삭제
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

/**
 * 로그 테이블 출력
 */
function showLogs(): void {
  if (logs.length === 0) {
    console.log('[HTJ2K Debug] No logs');
    return;
  }

  console.log(`[HTJ2K Debug] ${logs.length} logs:`);
  console.table(
    logs.map(log => ({
      time: log.timestamp.split('T')[1].split('.')[0],
      source: log.source,
      message: log.message,
      data: log.data ? JSON.stringify(log.data).substring(0, 100) : '',
    }))
  );
}

/**
 * 로그 JSON 파일로 다운로드
 */
function downloadLogs(): void {
  if (logs.length === 0) {
    console.log('[HTJ2K Debug] No logs to download');
    return;
  }

  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `htj2k-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[HTJ2K Debug] Downloaded ${logs.length} logs`);
}

/**
 * 로그 초기화
 */
function clearLogs(): void {
  logs.length = 0;
  console.log('[HTJ2K Debug] Logs cleared');
}

/**
 * 전체 로그 반환
 */
function getLogs(): LogEntry[] {
  return [...logs];
}

/**
 * 소스별 로그 필터링
 */
function filterBySource(source: string): LogEntry[] {
  return logs.filter(log => log.source.includes(source));
}

/** 글로벌 디버그 객체 */
const debugApi = {
  show: showLogs,
  download: downloadLogs,
  clear: clearLogs,
  get: getLogs,
  filter: filterBySource,
  logs,
};

// window에 디버그 API 노출
if (typeof window !== 'undefined') {
  (window as any).__htj2kDebug = debugApi;
}

export default debugApi;
