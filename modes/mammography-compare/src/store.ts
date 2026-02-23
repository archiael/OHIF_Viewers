/**
 * Mammography Compare Mode State Store
 *
 * @description
 * Zustand store for managing mammography compare mode state.
 *
 * @state
 * - isCompareSyncEnabled (FR-3.3.9): Compare Sync toggle
 *   - true: Camera synchronized across current and prior study viewports
 *   - false: Each viewport operates independently
 *
 * - isMirrorModeEnabled (FR-2.5.5): Mirror Mode toggle
 *   - true: Chest wall alignment + L↔R pan/zoom sync within each study
 *   - false: Standard view without chest wall anchoring
 *
 * @sync-matrix
 * | Mirror | Compare | Active cell pan/zoom effect                              |
 * |--------|---------|----------------------------------------------------------|
 * | OFF    | OFF     | Only active cell changes                                 |
 * | ON     | OFF     | Active + same-study mirror pair (X-inverted)             |
 * | OFF    | ON      | Active + other-study corresponding cell (same direction) |
 * | ON     | ON      | Active + mirror pair + compare pair + compare mirror     |
 */

import { create } from 'zustand';

interface MammographyCompareState {
  /** Compare Sync: pan/zoom synchronized across current and prior studies (default: ON) */
  isCompareSyncEnabled: boolean;

  /** Mirror Mode: chest wall alignment + L↔R sync within each study (default: ON) */
  isMirrorModeEnabled: boolean;

  toggleCompareSync: () => void;
  setCompareSync: (enabled: boolean) => void;

  toggleMirrorMode: () => void;
  setMirrorMode: (enabled: boolean) => void;

  /** Reset all state to defaults (call on mode re-entry to avoid stale state) */
  resetToDefaults: () => void;
}

export const useMammographyCompareStore = create<MammographyCompareState>(set => ({
  isCompareSyncEnabled: true,
  isMirrorModeEnabled: true,

  toggleCompareSync: () =>
    set(state => ({ isCompareSyncEnabled: !state.isCompareSyncEnabled })),
  setCompareSync: (enabled: boolean) => set({ isCompareSyncEnabled: enabled }),

  toggleMirrorMode: () =>
    set(state => ({ isMirrorModeEnabled: !state.isMirrorModeEnabled })),
  setMirrorMode: (enabled: boolean) => set({ isMirrorModeEnabled: enabled }),

  resetToDefaults: () => set({ isCompareSyncEnabled: true, isMirrorModeEnabled: true }),
}));
