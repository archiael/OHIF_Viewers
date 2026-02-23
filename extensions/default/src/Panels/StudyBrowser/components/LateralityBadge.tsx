import React from 'react';
import { SeriesLateralityManager } from '@ohif/core';

interface LateralityBadgeProps {
  displaySet: any;
}

/**
 * Laterality Badge Component
 *
 * Displays a colored badge indicating series laterality (RIGHT/LEFT)
 * Used in worklist when thumbnail generation is disabled (lazy loading mode)
 */
export function LateralityBadge({ displaySet }: LateralityBadgeProps) {
  if (!displaySet) {
    return null;
  }

  const laterality = SeriesLateralityManager.detectLaterality(displaySet);

  if (!laterality) {
    return null;
  }

  const isRight = laterality === 'R';
  const badgeColor = isRight ? 'bg-blue-500' : 'bg-red-500';
  const badgeText = isRight ? 'RIGHT' : 'LEFT';
  const badgeIcon = isRight ? '🔵' : '🔴';

  return (
    <div className="flex items-center gap-2 rounded px-3 py-2">
      <div className={`${badgeColor} rounded px-2 py-1 text-xs font-bold text-white`}>
        {badgeIcon} {badgeText}
      </div>
    </div>
  );
}
