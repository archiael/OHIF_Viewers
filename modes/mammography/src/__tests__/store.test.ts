/**
 * Unit tests for Mammography Mode Store (Zustand)
 *
 * @description
 * Tests state management for Mirror Mode toggle feature (FR-2.5.5)
 *
 * @requirement FR-2.5.5: Mirror Mode Toggle
 * - Initial state: Mirror Mode ON (chest wall to edge)
 * - Toggle function: switches between ON ↔ OFF
 * - Set function: sets to specific value
 */

import { useMammographyStore } from '../store';

describe('Mammography Mode Store', () => {
  describe('initial state', () => {
    it('should have Mirror Mode enabled by default (FR-2.5.5 requirement)', () => {
      const state = useMammographyStore.getState();

      // FR-2.5.5: Initial state is ON
      expect(state.isMirrorModeEnabled).toBe(true);
    });
  });

  describe('toggleMirrorMode', () => {
    it('should toggle from ON to OFF', () => {
      // Initial state is ON
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);

      // Toggle to OFF
      useMammographyStore.getState().toggleMirrorMode();

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should toggle from OFF to ON', () => {
      // Set to OFF
      useMammographyStore.getState().setMirrorMode(false);
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);

      // Toggle to ON
      useMammographyStore.getState().toggleMirrorMode();

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should toggle multiple times correctly', () => {
      // Start: ON (default)
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);

      // Toggle 1: OFF
      useMammographyStore.getState().toggleMirrorMode();
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);

      // Toggle 2: ON
      useMammographyStore.getState().toggleMirrorMode();
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);

      // Toggle 3: OFF
      useMammographyStore.getState().toggleMirrorMode();
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);
    });
  });

  describe('setMirrorMode', () => {
    it('should set Mirror Mode to ON', () => {
      useMammographyStore.getState().setMirrorMode(true);

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should set Mirror Mode to OFF', () => {
      useMammographyStore.getState().setMirrorMode(false);

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should set to ON even if already ON (idempotent)', () => {
      useMammographyStore.getState().setMirrorMode(true);
      useMammographyStore.getState().setMirrorMode(true);

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should set to OFF even if already OFF (idempotent)', () => {
      useMammographyStore.getState().setMirrorMode(false);
      useMammographyStore.getState().setMirrorMode(false);

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);
    });
  });

  describe('resetToDefaults', () => {
    /**
     * [C-2 FIX] Zustand store는 module-level singleton.
     * onModeExit 후에도 상태가 유지되므로 onModeEnter에서 반드시 리셋해야 함.
     *
     * SCENARIO WITHOUT RESET:
     * 1. 진입 → isMirrorModeEnabled = true
     * 2. 사용자 토글 → isMirrorModeEnabled = false
     * 3. 워크리스트 이동 (onModeExit 호출)
     * 4. 재진입 (onModeEnter) → store = false (stale!), HP = Mirror ON
     * 5. 버튼 "OFF" + 화면 "Mirror ON" → 불일치!
     *
     * WITH resetToDefaults():
     * 4. 재진입 → resetToDefaults() → isMirrorModeEnabled = true ✓
     * 5. 버튼 "ON" + 화면 "Mirror ON" → 일치!
     */

    it('should reset isMirrorModeEnabled to true (FR-2.5.5 default)', () => {
      // Simulate: user toggled Mirror Mode OFF
      useMammographyStore.getState().setMirrorMode(false);
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);

      // Simulate: mode re-entry triggers resetToDefaults
      useMammographyStore.getState().resetToDefaults();

      // Should be reset to default ON state
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should be idempotent when called multiple times', () => {
      useMammographyStore.getState().setMirrorMode(false);

      useMammographyStore.getState().resetToDefaults();
      useMammographyStore.getState().resetToDefaults();

      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should not change state when already at defaults', () => {
      // State is already at default (true)
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);

      // Calling reset should not cause errors
      expect(() => useMammographyStore.getState().resetToDefaults()).not.toThrow();
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should notify subscribers when resetting from non-default state', () => {
      useMammographyStore.getState().setMirrorMode(false);

      const listener = jest.fn();
      const unsubscribe = useMammographyStore.subscribe(listener);

      useMammographyStore.getState().resetToDefaults();

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('store reactivity', () => {
    it('should notify subscribers on state change', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyStore.subscribe(listener);

      useMammographyStore.getState().toggleMirrorMode();

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('should handle multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = useMammographyStore.subscribe(listener1);
      const unsubscribe2 = useMammographyStore.subscribe(listener2);

      useMammographyStore.getState().setMirrorMode(false);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });

    it('should not notify after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyStore.subscribe(listener);

      unsubscribe();
      listener.mockClear();

      useMammographyStore.getState().toggleMirrorMode();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
