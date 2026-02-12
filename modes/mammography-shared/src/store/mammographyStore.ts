import { create } from 'zustand';

interface SyncedScrollState {
  isSingleSeriesMode: boolean;
  currentPairIndex: number;
  totalPairs: number;
  sharedDisplaySetUID: string | null;
}

interface MammographyState {
  // Sync state
  isSyncEnabled: boolean;
  cameraSyncUnsubscribes: Array<() => void>;
  customWheelUnsubscribes: Array<() => void>;
  previousCameras: Map<string, any>;

  // Timeout IDs for cleanup (ISSUE 2 fix)
  initTimeoutIds: Array<ReturnType<typeof setTimeout>>;

  // Magnification state
  magnificationState: Map<string, boolean>;

  // Scroll state
  syncedScrollState: SyncedScrollState;

  // Flag states
  isApplyingSingleViewportZoom: boolean;
  isSyncingCameras: boolean;
  isMagnifyingFromButton: boolean;
  isResizingViewport: boolean;
  isDragZooming: boolean;

  // Mirror mode state
  isMirrorModeEnabled: boolean;

  // Actions
  setSyncEnabled: (enabled: boolean) => void;
  addCameraUnsubscribe: (unsub: () => void) => void;
  addWheelUnsubscribe: (unsub: () => void) => void;
  clearCameraUnsubscribes: () => void;
  clearWheelUnsubscribes: () => void;
  addInitTimeout: (timeoutId: ReturnType<typeof setTimeout>) => void;
  clearInitTimeouts: () => void;
  setPreviousCamera: (viewportId: string, camera: any) => void;
  setMagnification: (viewportId: string, magnified: boolean) => void;
  clearMagnification: (viewportId: string) => void;
  clearAllMagnifications: () => void;
  hasMagnification: (viewportId: string) => boolean;
  setSyncedScrollState: (state: Partial<SyncedScrollState>) => void;
  setIsApplyingSingleViewportZoom: (flag: boolean) => void;
  setIsSyncingCameras: (flag: boolean) => void;
  setIsMagnifyingFromButton: (flag: boolean) => void;
  setIsResizingViewport: (flag: boolean) => void;
  setIsDragZooming: (flag: boolean) => void;
  setMirrorModeEnabled: (enabled: boolean) => void;
  resetState: () => void;
}

const initialState = {
  isSyncEnabled: false,
  cameraSyncUnsubscribes: [],
  customWheelUnsubscribes: [],
  initTimeoutIds: [],
  previousCameras: new Map(),
  magnificationState: new Map(),
  syncedScrollState: {
    isSingleSeriesMode: false,
    currentPairIndex: 0,
    totalPairs: 0,
    sharedDisplaySetUID: null,
  },
  isApplyingSingleViewportZoom: false,
  isSyncingCameras: false,
  isMagnifyingFromButton: false,
  isResizingViewport: false,
  isDragZooming: false,
  isMirrorModeEnabled: true,
};

export const useMammographyStore = create<MammographyState>((set, get) => ({
  ...initialState,

  setSyncEnabled: (enabled: boolean) => set({ isSyncEnabled: enabled }),

  addCameraUnsubscribe: (unsub: () => void) =>
    set(state => ({
      cameraSyncUnsubscribes: [...state.cameraSyncUnsubscribes, unsub],
    })),

  addWheelUnsubscribe: (unsub: () => void) =>
    set(state => ({
      customWheelUnsubscribes: [...state.customWheelUnsubscribes, unsub],
    })),

  clearCameraUnsubscribes: () => {
    const { cameraSyncUnsubscribes } = get();
    // ISSUE 1 fix: Add error handling to prevent incomplete cleanup
    cameraSyncUnsubscribes.forEach(unsub => {
      try {
        unsub();
      } catch (error) {
        console.error('Failed to remove camera sync listener:', error);
      }
    });
    set({ cameraSyncUnsubscribes: [] });
  },

  clearWheelUnsubscribes: () => {
    const { customWheelUnsubscribes } = get();
    // ISSUE 1 fix: Add error handling to prevent incomplete cleanup
    customWheelUnsubscribes.forEach(unsub => {
      try {
        unsub();
      } catch (error) {
        console.error('Failed to remove wheel listener:', error);
      }
    });
    set({ customWheelUnsubscribes: [] });
  },

  addInitTimeout: (timeoutId: ReturnType<typeof setTimeout>) =>
    set(state => ({
      initTimeoutIds: [...state.initTimeoutIds, timeoutId],
    })),

  clearInitTimeouts: () => {
    const { initTimeoutIds } = get();
    // ISSUE 2 fix: Clear all pending timeouts to prevent orphaned callbacks
    initTimeoutIds.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        console.error('Failed to clear timeout:', error);
      }
    });
    set({ initTimeoutIds: [] });
  },

  setPreviousCamera: (viewportId: string, camera: any) =>
    set(state => {
      const newMap = new Map(state.previousCameras);
      newMap.set(viewportId, camera);
      return { previousCameras: newMap };
    }),

  setMagnification: (viewportId: string, magnified: boolean) =>
    set(state => {
      const newMap = new Map(state.magnificationState);
      if (magnified) {
        newMap.set(viewportId, true);
      } else {
        newMap.delete(viewportId);
      }
      return { magnificationState: newMap };
    }),

  clearMagnification: (viewportId: string) =>
    set(state => {
      const newMap = new Map(state.magnificationState);
      newMap.delete(viewportId);
      return { magnificationState: newMap };
    }),

  clearAllMagnifications: () => set({ magnificationState: new Map() }),

  hasMagnification: (viewportId: string) => {
    const { magnificationState } = get();
    return magnificationState.has(viewportId);
  },

  setSyncedScrollState: (newState: Partial<SyncedScrollState>) =>
    set(state => ({
      syncedScrollState: { ...state.syncedScrollState, ...newState },
    })),

  setIsApplyingSingleViewportZoom: (flag: boolean) =>
    set({ isApplyingSingleViewportZoom: flag }),

  setIsSyncingCameras: (flag: boolean) => set({ isSyncingCameras: flag }),

  setIsMagnifyingFromButton: (flag: boolean) => set({ isMagnifyingFromButton: flag }),

  setIsResizingViewport: (flag: boolean) => set({ isResizingViewport: flag }),

  setIsDragZooming: (flag: boolean) => set({ isDragZooming: flag }),

  setMirrorModeEnabled: (enabled: boolean) => set({ isMirrorModeEnabled: enabled }),

  resetState: () => {
    const store = get();

    // Cleanup all listeners before reset
    store.clearCameraUnsubscribes();
    store.clearWheelUnsubscribes();
    store.clearInitTimeouts();

    // ISSUE 4 fix: Deep copy nested objects to avoid reference sharing
    set({
      ...initialState,
      syncedScrollState: { ...initialState.syncedScrollState },
      previousCameras: new Map(),
      magnificationState: new Map(),
      initTimeoutIds: [],
    });
  },
}));
