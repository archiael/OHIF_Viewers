import React from 'react';

interface LastLoginDialogProps {
  lastAccessTime: string;
  onConfirm: () => void;
}

/**
 * 같은 IP의 마지막 로그인 시간을 알려주는 간단한 다이얼로그.
 * 모든 다른 세션이 같은 IP일 때 표시됩니다.
 */
const LastLoginDialog: React.FC<LastLoginDialogProps> = ({
  lastAccessTime,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="border-secondary-light w-full max-w-sm rounded-lg border bg-black p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          이전 로그인 정보
        </h2>
        <p className="mb-2 text-sm text-gray-300">
          마지막 로그인 시간:
        </p>
        <p className="mb-6 text-base font-mono text-blue-400">
          {lastAccessTime}
        </p>
        <div className="flex justify-end">
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500"
            onClick={onConfirm}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default LastLoginDialog;
