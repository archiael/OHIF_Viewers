import React, { useState } from 'react';
import {
  SessionInfo,
  removeSessionsFromServer,
  formatAccessTime,
} from '../utils/sessionCleanup';

interface DuplicationSessionCheckDialogProps {
  sessions: SessionInfo[];
  onRemoveAll: () => void;
  onSkip: () => void;
}

/**
 * 다른 IP에서 동일 계정으로 로그인된 세션을 감지했을 때 표시하는 다이얼로그.
 * - "모든 session 삭제": 다른 IP 세션을 서버에서 제거
 * - "건너뛰기": 현재 탭 세션 동안 다이얼로그 억제
 */
const DuplicationSessionCheckDialog: React.FC<DuplicationSessionCheckDialogProps> = ({
  sessions,
  onRemoveAll,
  onSkip,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRemoveAll = async () => {
    setIsProcessing(true);
    try {
      await removeSessionsFromServer(sessions);
    } catch (err) {
      console.warn('[DuplicationSessionCheckDialog] Remove error:', err);
    }
    setIsProcessing(false);
    onRemoveAll();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="border-secondary-light w-full max-w-lg rounded-lg border bg-black p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          중복 로그인 감지
        </h2>
        <p className="mb-4 text-sm text-gray-300">
          다음 주소(IP)에서 동일 ID로 로그인하였습니다.
        </p>

        <div className="mb-4 max-h-60 overflow-auto">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-gray-600 text-left">
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
            className="rounded bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            onClick={handleRemoveAll}
            disabled={isProcessing}
          >
            {isProcessing ? '삭제 중...' : '모든 session 삭제'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicationSessionCheckDialog;
