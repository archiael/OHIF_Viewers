import React, { useState } from 'react';
import { SessionInfo, removeSessionsFromServer, formatAccessTime } from '../../utils/sessionCleanup';

interface SessionCleanupModalProps {
  sessions: SessionInfo[];
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * 기존 세션 리스트를 보여주고 정리 여부를 선택하는 모달.
 */
const SessionCleanupModal: React.FC<SessionCleanupModalProps> = ({
  sessions,
  onComplete,
  onSkip,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCleanup = async () => {
    setIsProcessing(true);
    try {
      await removeSessionsFromServer(sessions);
    } catch (err) {
      console.warn('[SessionCleanupModal] Cleanup error:', err);
    }
    setIsProcessing(false);
    onComplete();
  };

  const truncateSession = (session: string): string => {
    if (!session) {
      return '-';
    }
    return session.length > 8 ? session.slice(0, 8) + '...' : session;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="border-secondary-light w-full max-w-lg rounded-lg border bg-black p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          기존 세션 정리
        </h2>
        <p className="mb-4 text-sm text-gray-300">
          다음 세션들이 서버에 남아있습니다:
        </p>

        <div className="mb-4 max-h-60 overflow-auto">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-600 text-left">
                <th className="px-3 py-2">Session ID</th>
                <th className="px-3 py-2">접속 시간</th>
                <th className="px-3 py-2">IP 주소</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, idx) => (
                <tr
                  key={s.session || idx}
                  className="border-b border-gray-700"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {truncateSession(s.session)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatAccessTime(s.access)}
                  </td>
                  <td className="px-3 py-2">{s.address || '-'}</td>
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
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            onClick={handleCleanup}
            disabled={isProcessing}
          >
            {isProcessing ? '정리 중...' : '정리하고 계속'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionCleanupModal;
