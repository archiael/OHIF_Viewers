/**
 * Unit tests for Mammography Compare Mode Store (Zustand)
 *
 * @description
 * Tests state management for:
 * - FR-3.3.9: Compare Sync Toggle (isCompareSyncEnabled)
 * - FR-2.5.5: Mirror Mode Toggle (isMirrorModeEnabled)
 */

import { useMammographyCompareStore } from '../store';

describe('Mammography Compare Mode Store', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useMammographyCompareStore.getState().resetToDefaults();
  });

  describe('initial state', () => {
    it('should have Compare Sync enabled by default (FR-3.3.9)', () => {
      const state = useMammographyCompareStore.getState();

      expect(state.isCompareSyncEnabled).toBe(true);
    });

    it('should have Mirror Mode enabled by default (FR-2.5.5)', () => {
      const state = useMammographyCompareStore.getState();

      expect(state.isMirrorModeEnabled).toBe(true);
    });
  });

  describe('toggleCompareSync - FR-3.3.9', () => {
    it('should toggle from ON to OFF', () => {
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleCompareSync();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });

    it('should toggle from OFF to ON', () => {
      useMammographyCompareStore.getState().setCompareSync(false);
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);

      useMammographyCompareStore.getState().toggleCompareSync();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });

    it('should toggle multiple times correctly', () => {
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);

      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });

    it('should not affect Mirror Mode state', () => {
      useMammographyCompareStore.getState().toggleCompareSync();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });
  });

  describe('setCompareSync - FR-3.3.9', () => {
    it('should set Compare Sync to ON', () => {
      useMammographyCompareStore.getState().setCompareSync(true);

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });

    it('should set Compare Sync to OFF', () => {
      useMammographyCompareStore.getState().setCompareSync(false);

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });

    it('should set to ON even if already ON (idempotent)', () => {
      useMammographyCompareStore.getState().setCompareSync(true);
      useMammographyCompareStore.getState().setCompareSync(true);

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });

    it('should set to OFF even if already OFF (idempotent)', () => {
      useMammographyCompareStore.getState().setCompareSync(false);
      useMammographyCompareStore.getState().setCompareSync(false);

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });
  });

  describe('toggleMirrorMode - FR-2.5.5', () => {
    it('should toggle from ON to OFF', () => {
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleMirrorMode();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should toggle from OFF to ON', () => {
      useMammographyCompareStore.getState().setMirrorMode(false);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);

      useMammographyCompareStore.getState().toggleMirrorMode();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should toggle multiple times correctly', () => {
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleMirrorMode();
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);

      useMammographyCompareStore.getState().toggleMirrorMode();
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      useMammographyCompareStore.getState().toggleMirrorMode();
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should not affect Compare Sync state', () => {
      useMammographyCompareStore.getState().toggleMirrorMode();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });
  });

  describe('setMirrorMode - FR-2.5.5', () => {
    it('should set Mirror Mode to ON', () => {
      useMammographyCompareStore.getState().setMirrorMode(true);

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should set Mirror Mode to OFF', () => {
      useMammographyCompareStore.getState().setMirrorMode(false);

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should set to ON even if already ON (idempotent)', () => {
      useMammographyCompareStore.getState().setMirrorMode(true);
      useMammographyCompareStore.getState().setMirrorMode(true);

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should set to OFF even if already OFF (idempotent)', () => {
      useMammographyCompareStore.getState().setMirrorMode(false);
      useMammographyCompareStore.getState().setMirrorMode(false);

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset both states to ON', () => {
      useMammographyCompareStore.setState({
        isCompareSyncEnabled: false,
        isMirrorModeEnabled: false,
      });

      useMammographyCompareStore.getState().resetToDefaults();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should be idempotent when already at defaults', () => {
      useMammographyCompareStore.getState().resetToDefaults();
      useMammographyCompareStore.getState().resetToDefaults();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });
  });

  describe('store reactivity', () => {
    it('should notify subscribers on Compare Sync state change', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyCompareStore.subscribe(listener);

      useMammographyCompareStore.getState().toggleCompareSync();

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('should notify subscribers on Mirror Mode state change', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyCompareStore.subscribe(listener);

      useMammographyCompareStore.getState().toggleMirrorMode();

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('should handle multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = useMammographyCompareStore.subscribe(listener1);
      const unsubscribe2 = useMammographyCompareStore.subscribe(listener2);

      useMammographyCompareStore.getState().setCompareSync(false);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });

    it('should not notify after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyCompareStore.subscribe(listener);

      unsubscribe();
      listener.mockClear();

      useMammographyCompareStore.getState().toggleCompareSync();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should support workflow: toggle both features independently', () => {
      // Start: both ON
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      // Turn Mirror Mode OFF (Compare Sync stays ON)
      useMammographyCompareStore.getState().toggleMirrorMode();
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      // Turn Compare Sync OFF (Mirror Mode stays OFF)
      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);

      // Reset to defaults: both ON
      useMammographyCompareStore.getState().resetToDefaults();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should support workflow: toggle OFF → set ON → toggle OFF', () => {
      // User clicks button: toggle OFF
      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);

      // Programmatic: set ON
      useMammographyCompareStore.getState().setCompareSync(true);
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      // User clicks button again: toggle OFF
      useMammographyCompareStore.getState().toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });
  });
});
