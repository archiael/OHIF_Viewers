/**
 * Mammography Compare Mode Commands Module
 *
 * @description
 * Commands for compare mode:
 * - Exit Compare Mode (FR-3.3.2)
 * - Mirror Mode Toggle (FR-2.5.5): chest wall alignment + L↔R sync within each study
 * - Compare Sync Toggle (FR-3.3.9): synchronized pan/zoom between current and prior studies
 *
 * NOTE: Actual camera synchronization is event-driven and handled in index.tsx
 * via CAMERA_MODIFIED listeners. This module manages state and provides commands.
 *
 * @sync-matrix
 * | Mirror | Compare | Active cell pan/zoom effect                              |
 * |--------|---------|----------------------------------------------------------|
 * | OFF    | OFF     | Only active cell changes                                 |
 * | ON     | OFF     | Active + same-study mirror pair (X-inverted)             |
 * | OFF    | ON      | Active + other-study corresponding cell (same direction) |
 * | ON     | ON      | Active + mirror pair + compare pair + compare mirror     |
 *
 * STAGE COMMANDS:
 * - setCompareStageCC (FR-3.3.8): Switch to CC compare stage (stage 0)
 * - setCompareStageMlo (FR-3.3.8): Switch to MLO compare stage (stage 1)
 */

import { useMammographyCompareStore } from './store';

const COMPARE_HP_ID = '@ohif/extension-default.hangingProtocolModule.hpMammoCompare';

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    displaySetService,
    uiNotificationService,
    hangingProtocolService,
  } = servicesManager.services;

  const compareCommands = {
    /**
     * Exit Compare Mode and return to single-study mammography mode (FR-3.3.2)
     *
     * Current study identification priority:
     * 1. First UID from URL param `StudyInstanceUIDs=current,prior`
     *    (index 0 = current, per hpMammoCompare studyInstanceUIDsIndex convention)
     * 2. Fallback: first active displaySet's StudyInstanceUID (if URL parsing fails)
     */
    exitMammoCompare: () => {
      const urlParams = new URLSearchParams(window.location.search);

      // Primary: parse from URL (most reliable — set by the caller when opening compare mode)
      const studyUIDsParam = urlParams.get('StudyInstanceUIDs') || '';
      const studyUIDsFromUrl = studyUIDsParam.split(',').map(s => s.trim()).filter(Boolean);
      let studyInstanceUID = studyUIDsFromUrl[0]; // index 0 = current study

      // Fallback: first active displaySet
      if (!studyInstanceUID) {
        const activeDisplaySets = displaySetService.getActiveDisplaySets?.() || [];
        if (activeDisplaySets.length === 0) {
          console.error('[exitMammoCompare] No active display sets found');
          uiNotificationService.show({
            title: 'Error',
            message: 'No active study found',
            type: 'error',
            duration: 3000,
          });
          return;
        }
        studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
      }

      const dataSourceQuery = urlParams.get('datasources') || '';
      const mammographyUrl = `/mammography?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}${
        dataSourceQuery ? `&datasources=${encodeURIComponent(dataSourceQuery)}` : ''
      }`;

      window.location.href = mammographyUrl;
    },

    /**
     * Toggle Mirror Mode ON ↔ OFF (FR-2.5.5)
     *
     * Mirror Mode controls:
     * 1. Chest wall alignment (setDisplayArea applied to all viewports via index.tsx)
     * 2. L↔R pan/zoom sync within each study (CAMERA_MODIFIED handler in index.tsx)
     * 3. Auto pair loading within each study (disabled when Mirror Mode OFF)
     */
    toggleMirrorModeCompare: () => {
      useMammographyCompareStore.getState().toggleMirrorMode();
      refreshToolbar(servicesManager);
    },

    /** Query Mirror Mode enabled state (used by evaluator) */
    isMirrorModeEnabledCompare: () => {
      return useMammographyCompareStore.getState().isMirrorModeEnabled;
    },

    /**
     * Toggle Compare Sync ON ↔ OFF (FR-3.3.9)
     *
     * Sync is implemented event-based (CAMERA_MODIFIED) in index.tsx.
     * Toggling this changes the store state; the handler reads it on each event.
     */
    toggleCompareSync: () => {
      useMammographyCompareStore.getState().toggleCompareSync();
      refreshToolbar(servicesManager);
    },

    /** Query Compare Sync enabled state (used by evaluator) */
    isCompareSyncEnabled: () => {
      return useMammographyCompareStore.getState().isCompareSyncEnabled;
    },

    /**
     * Switch to CC compare stage (Stage 0): [Current RCC, Current LCC, Prior RCC, Prior LCC]
     * Left half = Current study, Right half = Prior study — both showing CC views.
     */
    setCompareStageCC: () => {
      hangingProtocolService.setProtocol(COMPARE_HP_ID, { stageIndex: 0 });
    },

    /**
     * Switch to MLO compare stage (Stage 1): [Current RMLO, Current LMLO, Prior RMLO, Prior LMLO]
     * Left half = Current study, Right half = Prior study — both showing MLO views.
     */
    setCompareStageMlo: () => {
      hangingProtocolService.setProtocol(COMPARE_HP_ID, { stageIndex: 1 });
    },
  };

  return {
    actions: {
      ...compareCommands,
    },
    definitions: {
      exitMammoCompare: {
        commandFn: compareCommands.exitMammoCompare,
        storeContexts: [],
        options: {},
      },
      toggleMirrorModeCompare: {
        commandFn: compareCommands.toggleMirrorModeCompare,
        storeContexts: [],
        options: {},
      },
      isMirrorModeEnabledCompare: {
        commandFn: compareCommands.isMirrorModeEnabledCompare,
        storeContexts: [],
        options: {},
      },
      toggleCompareSync: {
        commandFn: compareCommands.toggleCompareSync,
        storeContexts: [],
        options: {},
      },
      isCompareSyncEnabled: {
        commandFn: compareCommands.isCompareSyncEnabled,
        storeContexts: [],
        options: {},
      },
      setCompareStageCC: {
        commandFn: compareCommands.setCompareStageCC,
        storeContexts: [],
        options: {},
      },
      setCompareStageMlo: {
        commandFn: compareCommands.setCompareStageMlo,
        storeContexts: [],
        options: {},
      },
    },
  };
};

function refreshToolbar(servicesManager) {
  const { viewportGridService, toolbarService } = servicesManager.services;
  const { activeViewportId } = viewportGridService.getState();
  if (activeViewportId) {
    toolbarService?.refreshToolbarState?.({ viewportId: activeViewportId });
  }
}

export default commandsModule;
