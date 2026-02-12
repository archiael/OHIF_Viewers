/**
 * Mammography Mode State Store
 *
 * FR-2.5.5: Mirror Mode state management
 * - Initial state: isMirrorModeEnabled = true (ON by default)
 */

import { create } from 'zustand';

interface MammographyState {
  isMirrorModeEnabled: boolean;
  toggleMirrorMode: () => void;
  setMirrorMode: (enabled: boolean) => void;
}

export const useMammographyStore = create<MammographyState>(set => ({
  // FR-2.5.5: Initial state is ON (chest wall to edge)
  isMirrorModeEnabled: true,

  toggleMirrorMode: () =>
    set(state => ({
      isMirrorModeEnabled: !state.isMirrorModeEnabled,
    })),

  setMirrorMode: (enabled: boolean) =>
    set({
      isMirrorModeEnabled: enabled,
    }),
}));
