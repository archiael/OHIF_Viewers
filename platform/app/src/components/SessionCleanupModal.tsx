import React, { useState } from 'react';
import {
  SessionInfo,
  removeSessionsFromServer,
  formatAccessTime,
} from '../utils/sessionCleanup';

interface SessionCleanupModalProps {
  sessions: SessionInfo[];
  onConfirm: () => void;
  onSkip: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmColor?: 'red' | 'blue';
  showSessionId?: boolean;
}

/**
 * 세션 목록을 테이블로 표시하고 정리/건너뛰기를 선택하는 범용 모달.
 *
 * 사용처:
 * - AuthStateListener: 다른 IP 중복 로그인 감지 시 (confirmColor="red")
 * - Login.tsx: 로그인 후 기존 세션 정리 시 (showSessionId=true)
 */
const SessionCleanupModal: React.FC<SessionCleanupModalProps> = ({
  sessions,
  onConfirm,
  onSkip,
  title,
  description,
  confirmLabel = '정리하고 계속',
  confirmColor = 'blue',
  showSessionId = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await removeSessionsFromServer(sessions);
    } catch (err) {
      console.warn('[SessionCleanupModal] Remove error:', err);
    }
    setIsProcessing(false);
    onConfirm();
  };

  const truncateSession = (session: string): string => {
    if (!session) {
      return '-';
    }
    return session.length > 8 ? session.slice(0, 8) + '...' : session;
  };

  const confirmButtonClass =
    confirmColor === 'red'
      ? 'rounded bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-500 disabled:opacity-50'
      : 'rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="border-secondary-light w-full max-w-lg rounded-lg border bg-black p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
        <p className="mb-4 text-sm text-gray-300">{description}</p>

        <div className="mb-4 max-h-60 overflow-auto">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-600 text-left">
                {showSessionId && <th className="px-3 py-2">Session ID</th>}
                <th className="px-3 py-2">IP 주소</th>
                <th className="px-3 py-2">접속 시간</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, idx) => (
                <tr
                  key={s.session || idx}
                  className="border-b border-gray-700"
                >
                  {showSessionId && (
                    <td className="px-3 py-2 font-mono text-xs">
                      {truncateSession(s.session)}
                    </td>
                  )}
                  <td className="px-3 py-2">{s.address || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatAccessTime(s.access)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3">
          <button
            className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-50"
            onClick={onSkip}
            disabled={isProcessing}
          >
            건너뛰기
          </button>
          <button
            className={confirmButtonClass}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionCleanupModal;
