/**
 * User preferences for jump-to-measurement behavior
 * These preferences control how viewports respond when clicking measurements in the panel
 */

export interface MeasurementJumpPreferences {
  // MPR viewport centering
  mprCenteringEnabled: boolean; // Center MPR viewports on measurement

  // Magnification synchronization mode
  magnificationSyncMode: 'none' | 'onMeasurementClick' | 'always';

  // Magnification ratio when jumping to measurement (0-9)
  // 0 = no zoom change, 1 = 1.5x zoom, 2 = 2x zoom, ..., 9 = 10x zoom
  magnificationRatio: number;
}

const DEFAULT_PREFERENCES: MeasurementJumpPreferences = {
  mprCenteringEnabled: true,
  magnificationSyncMode: 'always',
  magnificationRatio: 6, // Default 4.0x zoom (1 + 6 * 0.5 = 4.0)
};

const STORAGE_KEY = 'measurementJumpPreferences';

/**
 * Get user preferences for jump-to-measurement behavior
 */
export function getMeasurementJumpPreferences(): MeasurementJumpPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    console.warn('[MeasurementJumpPreferences] Error reading preferences:', error);
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Save user preferences for jump-to-measurement behavior
 */
export function saveMeasurementJumpPreferences(
  preferences: Partial<MeasurementJumpPreferences>
): void {
  try {
    const current = getMeasurementJumpPreferences();
    const updated = { ...current, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('[MeasurementJumpPreferences] Preferences saved:', updated);
  } catch (error) {
    console.error('[MeasurementJumpPreferences] Error saving preferences:', error);
  }
}

/**
 * Calculate zoom factor based on magnification ratio setting
 * @param ratio - Magnification ratio (0-9)
 * @returns Zoom multiplier
 */
export function getZoomMultiplier(ratio: number): number {
  if (ratio === 0) return 1; // No zoom change
  return 1 + ratio * 0.5; // 1 → 1.5x, 2 → 2x, 3 → 2.5x, ..., 9 → 5.5x
}
