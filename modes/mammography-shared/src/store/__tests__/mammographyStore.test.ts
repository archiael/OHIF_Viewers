/**
 * Unit tests for mammographyStore (Zustand store)
 * Tests state management for mammography mode
 */

import { useMammographyStore } from '../mammographyStore';

describe('mammographyStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useMammographyStore.getState().resetState();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useMammographyStore.getState();

      expect(state.isSyncEnabled).toBe(false);
      expect(state.cameraSyncUnsubscribes).toEqual([]);
      expect(state.customWheelUnsubscribes).toEqual([]);
      expect(state.previousCameras).toBeInstanceOf(Map);
      expect(state.previousCameras.size).toBe(0);
      expect(state.magnificationState).toBeInstanceOf(Map);
      expect(state.magnificationState.size).toBe(0);
      expect(state.isApplyingSingleViewportZoom).toBe(false);
      expect(state.isSyncingCameras).toBe(false);
      expect(state.isMagnifyingFromButton).toBe(false);
      expect(state.isResizingViewport).toBe(false);
      expect(state.isDragZooming).toBe(false);
      expect(state.isMirrorModeEnabled).toBe(true); // Default ON
    });

    it('should have correct initial syncedScrollState', () => {
      const state = useMammographyStore.getState();

      expect(state.syncedScrollState).toEqual({
        isSingleSeriesMode: false,
        currentPairIndex: 0,
        totalPairs: 0,
        sharedDisplaySetUID: null,
      });
    });
  });

  describe('setSyncEnabled', () => {
    it('should enable sync', () => {
      useMammographyStore.getState().setSyncEnabled(true);

      expect(useMammographyStore.getState().isSyncEnabled).toBe(true);
    });

    it('should disable sync', () => {
      useMammographyStore.getState().setSyncEnabled(true);
      useMammographyStore.getState().setSyncEnabled(false);

      expect(useMammographyStore.getState().isSyncEnabled).toBe(false);
    });
  });

  describe('unsubscribe management', () => {
    it('should add camera unsubscribe', () => {
      const mockUnsub = jest.fn();

      useMammographyStore.getState().addCameraUnsubscribe(mockUnsub);

      expect(useMammographyStore.getState().cameraSyncUnsubscribes).toContain(mockUnsub);
    });

    it('should add multiple camera unsubscribes', () => {
      const mockUnsub1 = jest.fn();
      const mockUnsub2 = jest.fn();

      useMammographyStore.getState().addCameraUnsubscribe(mockUnsub1);
      useMammographyStore.getState().addCameraUnsubscribe(mockUnsub2);

      expect(useMammographyStore.getState().cameraSyncUnsubscribes).toHaveLength(2);
    });

    it('should add wheel unsubscribe', () => {
      const mockUnsub = jest.fn();

      useMammographyStore.getState().addWheelUnsubscribe(mockUnsub);

      expect(useMammographyStore.getState().customWheelUnsubscribes).toContain(mockUnsub);
    });

    it('should clear camera unsubscribes and call them', () => {
      const mockUnsub1 = jest.fn();
      const mockUnsub2 = jest.fn();

      useMammographyStore.getState().addCameraUnsubscribe(mockUnsub1);
      useMammographyStore.getState().addCameraUnsubscribe(mockUnsub2);
      useMammographyStore.getState().clearCameraUnsubscribes();

      expect(mockUnsub1).toHaveBeenCalled();
      expect(mockUnsub2).toHaveBeenCalled();
      expect(useMammographyStore.getState().cameraSyncUnsubscribes).toEqual([]);
    });

    it('should clear wheel unsubscribes and call them', () => {
      const mockUnsub1 = jest.fn();
      const mockUnsub2 = jest.fn();

      useMammographyStore.getState().addWheelUnsubscribe(mockUnsub1);
      useMammographyStore.getState().addWheelUnsubscribe(mockUnsub2);
      useMammographyStore.getState().clearWheelUnsubscribes();

      expect(mockUnsub1).toHaveBeenCalled();
      expect(mockUnsub2).toHaveBeenCalled();
      expect(useMammographyStore.getState().customWheelUnsubscribes).toEqual([]);
    });
  });

  describe('previousCamera management', () => {
    it('should set previous camera for viewport', () => {
      const mockCamera = { parallelScale: 100, focalPoint: [0, 0, 0] };

      useMammographyStore.getState().setPreviousCamera('viewport1', mockCamera);

      const previousCameras = useMammographyStore.getState().previousCameras;
      expect(previousCameras.get('viewport1')).toEqual(mockCamera);
    });

    it('should update previous camera for same viewport', () => {
      const mockCamera1 = { parallelScale: 100, focalPoint: [0, 0, 0] };
      const mockCamera2 = { parallelScale: 80, focalPoint: [10, 10, 0] };

      useMammographyStore.getState().setPreviousCamera('viewport1', mockCamera1);
      useMammographyStore.getState().setPreviousCamera('viewport1', mockCamera2);

      const previousCameras = useMammographyStore.getState().previousCameras;
      expect(previousCameras.get('viewport1')).toEqual(mockCamera2);
    });

    it('should handle multiple viewports', () => {
      const mockCamera1 = { parallelScale: 100, focalPoint: [0, 0, 0] };
      const mockCamera2 = { parallelScale: 80, focalPoint: [10, 10, 0] };

      useMammographyStore.getState().setPreviousCamera('viewport1', mockCamera1);
      useMammographyStore.getState().setPreviousCamera('viewport2', mockCamera2);

      const previousCameras = useMammographyStore.getState().previousCameras;
      expect(previousCameras.size).toBe(2);
      expect(previousCameras.get('viewport1')).toEqual(mockCamera1);
      expect(previousCameras.get('viewport2')).toEqual(mockCamera2);
    });
  });

  describe('magnification state management', () => {
    it('should set magnification for viewport', () => {
      useMammographyStore.getState().setMagnification('viewport1', true);

      expect(useMammographyStore.getState().hasMagnification('viewport1')).toBe(true);
    });

    it('should clear magnification when set to false', () => {
      useMammographyStore.getState().setMagnification('viewport1', true);
      useMammographyStore.getState().setMagnification('viewport1', false);

      expect(useMammographyStore.getState().hasMagnification('viewport1')).toBe(false);
    });

    it('should clear specific viewport magnification', () => {
      useMammographyStore.getState().setMagnification('viewport1', true);
      useMammographyStore.getState().clearMagnification('viewport1');

      expect(useMammographyStore.getState().hasMagnification('viewport1')).toBe(false);
    });

    it('should handle multiple viewports', () => {
      useMammographyStore.getState().setMagnification('viewport1', true);
      useMammographyStore.getState().setMagnification('viewport2', true);

      expect(useMammographyStore.getState().hasMagnification('viewport1')).toBe(true);
      expect(useMammographyStore.getState().hasMagnification('viewport2')).toBe(true);
    });

    it('should clear all magnifications', () => {
      useMammographyStore.getState().setMagnification('viewport1', true);
      useMammographyStore.getState().setMagnification('viewport2', true);
      useMammographyStore.getState().clearAllMagnifications();

      expect(useMammographyStore.getState().hasMagnification('viewport1')).toBe(false);
      expect(useMammographyStore.getState().hasMagnification('viewport2')).toBe(false);
      expect(useMammographyStore.getState().magnificationState.size).toBe(0);
    });

    it('should return false for non-existent viewport', () => {
      expect(useMammographyStore.getState().hasMagnification('nonexistent')).toBe(false);
    });
  });

  describe('syncedScrollState management', () => {
    it('should update synced scroll state', () => {
      useMammographyStore.getState().setSyncedScrollState({
        isSingleSeriesMode: true,
        totalPairs: 5,
      });

      const scrollState = useMammographyStore.getState().syncedScrollState;
      expect(scrollState.isSingleSeriesMode).toBe(true);
      expect(scrollState.totalPairs).toBe(5);
      expect(scrollState.currentPairIndex).toBe(0); // Should preserve other fields
    });

    it('should partially update synced scroll state', () => {
      useMammographyStore.getState().setSyncedScrollState({
        currentPairIndex: 2,
      });

      const scrollState = useMammographyStore.getState().syncedScrollState;
      expect(scrollState.currentPairIndex).toBe(2);
      expect(scrollState.isSingleSeriesMode).toBe(false); // Unchanged
    });

    it('should update sharedDisplaySetUID', () => {
      useMammographyStore.getState().setSyncedScrollState({
        sharedDisplaySetUID: 'ds-12345',
      });

      const scrollState = useMammographyStore.getState().syncedScrollState;
      expect(scrollState.sharedDisplaySetUID).toBe('ds-12345');
    });
  });

  describe('flag state management', () => {
    it('should set isApplyingSingleViewportZoom', () => {
      useMammographyStore.getState().setIsApplyingSingleViewportZoom(true);
      expect(useMammographyStore.getState().isApplyingSingleViewportZoom).toBe(true);

      useMammographyStore.getState().setIsApplyingSingleViewportZoom(false);
      expect(useMammographyStore.getState().isApplyingSingleViewportZoom).toBe(false);
    });

    it('should set isSyncingCameras', () => {
      useMammographyStore.getState().setIsSyncingCameras(true);
      expect(useMammographyStore.getState().isSyncingCameras).toBe(true);

      useMammographyStore.getState().setIsSyncingCameras(false);
      expect(useMammographyStore.getState().isSyncingCameras).toBe(false);
    });

    it('should set isMagnifyingFromButton', () => {
      useMammographyStore.getState().setIsMagnifyingFromButton(true);
      expect(useMammographyStore.getState().isMagnifyingFromButton).toBe(true);

      useMammographyStore.getState().setIsMagnifyingFromButton(false);
      expect(useMammographyStore.getState().isMagnifyingFromButton).toBe(false);
    });

    it('should set isResizingViewport', () => {
      useMammographyStore.getState().setIsResizingViewport(true);
      expect(useMammographyStore.getState().isResizingViewport).toBe(true);

      useMammographyStore.getState().setIsResizingViewport(false);
      expect(useMammographyStore.getState().isResizingViewport).toBe(false);
    });

    it('should set isDragZooming', () => {
      useMammographyStore.getState().setIsDragZooming(true);
      expect(useMammographyStore.getState().isDragZooming).toBe(true);

      useMammographyStore.getState().setIsDragZooming(false);
      expect(useMammographyStore.getState().isDragZooming).toBe(false);
    });
  });

  describe('mirror mode management', () => {
    it('should have mirror mode enabled by default', () => {
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should toggle mirror mode', () => {
      useMammographyStore.getState().setMirrorModeEnabled(false);
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);

      useMammographyStore.getState().setMirrorModeEnabled(true);
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });
  });

  describe('resetState', () => {
    it('should reset all state to initial values', () => {
      // Modify all state
      useMammographyStore.getState().setSyncEnabled(true);
      useMammographyStore.getState().setMagnification('viewport1', true);
      useMammographyStore.getState().setPreviousCamera('viewport1', { test: 'camera' });
      useMammographyStore.getState().setSyncedScrollState({ currentPairIndex: 5 });
      useMammographyStore.getState().setIsSyncingCameras(true);
      useMammographyStore.getState().setMirrorModeEnabled(false);

      // Reset
      useMammographyStore.getState().resetState();

      // Verify all reset to initial
      const state = useMammographyStore.getState();
      expect(state.isSyncEnabled).toBe(false);
      expect(state.magnificationState.size).toBe(0);
      expect(state.previousCameras.size).toBe(0);
      expect(state.syncedScrollState.currentPairIndex).toBe(0);
      expect(state.isSyncingCameras).toBe(false);
      expect(state.isMirrorModeEnabled).toBe(true);
    });

    it('should call all unsubscribe functions on reset', () => {
      const mockCameraUnsub = jest.fn();
      const mockWheelUnsub = jest.fn();

      useMammographyStore.getState().addCameraUnsubscribe(mockCameraUnsub);
      useMammographyStore.getState().addWheelUnsubscribe(mockWheelUnsub);

      useMammographyStore.getState().resetState();

      expect(mockCameraUnsub).toHaveBeenCalled();
      expect(mockWheelUnsub).toHaveBeenCalled();
    });

    it('should create new Map instances on reset', () => {
      const oldMagnificationState = useMammographyStore.getState().magnificationState;
      const oldPreviousCameras = useMammographyStore.getState().previousCameras;

      useMammographyStore.getState().resetState();

      const newMagnificationState = useMammographyStore.getState().magnificationState;
      const newPreviousCameras = useMammographyStore.getState().previousCameras;

      // Should be different instances (not same reference)
      expect(newMagnificationState).not.toBe(oldMagnificationState);
      expect(newPreviousCameras).not.toBe(oldPreviousCameras);
    });
  });

  describe('store reactivity', () => {
    it('should notify subscribers on state change', () => {
      const listener = jest.fn();
      const unsubscribe = useMammographyStore.subscribe(listener);

      useMammographyStore.getState().setSyncEnabled(true);

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it('should handle multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = useMammographyStore.subscribe(listener1);
      const unsubscribe2 = useMammographyStore.subscribe(listener2);

      useMammographyStore.getState().setSyncEnabled(true);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });
  });
});
