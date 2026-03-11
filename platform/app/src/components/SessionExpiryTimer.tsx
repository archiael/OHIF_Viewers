import React, { useState, useEffect } from 'react';
import { AuthStateSync } from '../utils/authStateSync';

/**
 * [DEBUG] 세션 만료 카운트다운 컴포넌트
 * AuthStateSync.getExpiresAt()으로 캐시된 만료 시간을 읽어 HH:MM:SS로 표시
 */
function SessionExpiryTimer() {
  const [remaining, setRemaining] = useState('--:--:--');
  const [isExpired, setIsExpired] = useState(false);
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    const authStateSync = AuthStateSync.getInstance();

    const updateTimer = () => {
      const expiresAt = authStateSync.getExpiresAt();
      if (expiresAt === null) {
        setRemaining('세션 없음');
        setIsExpired(false);
        setIsWarning(false);
        return;
      }
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        setRemaining('만료됨');
        setIsExpired(true);
        setIsWarning(false);
        return;
      }
      // 30초 이하이면 경고 표시
      setIsWarning(diff <= 30000);
      setIsExpired(false);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const colorClass = isExpired
    ? 'text-red-500 animate-pulse'
    : isWarning
      ? 'text-orange-400'
      : 'text-yellow-400';

  return (
    <span
      className={`ml-3 rounded bg-black/40 px-2 py-0.5 font-mono text-xs ${colorClass}`}
      title="세션 만료까지 남은 시간"
    >
      {remaining}
    </span>
  );
}

export default SessionExpiryTimer;
