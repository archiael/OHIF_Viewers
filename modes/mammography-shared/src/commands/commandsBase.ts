/**
 * Shared mammography commands base module.
 * Contains all commands common to both mammography and mammography-compare modes.
 *
 * God Functions have been decomposed into focused modules:
 * - magnifyManager.ts: mammoMagnify (~210 lines -> 4 functions)
 * - syncManager.ts: toggleMammoSync (~213 lines -> 4 functions)
 * - initManager.ts: initMammoMode (~300 lines -> 5 functions)
 *
 * Each function in the decomposed modules is under 50 lines.
 */

import { useMammographyStore } from '../store/mammographyStore';
import { logger } from '../utils/logger';
import { mammoMagnify } from './magnifyManager';
import { toggleMammoSync } from './syncManager';
import { initMammoMode, cleanupMammoMode } from './initManager';

/**
 * Create the base set of mammography commands shared between modes.
 * These commands are registered in the MAMMOGRAPHY command context.
 */
export function createBaseCommands({ servicesManager, commandsManager }) {
  const {
    viewportGridService,
    syncGroupService,
    cornerstoneViewportService,
    toolbarService,
    displaySetService,
  } = servicesManager.services;

  const magnifyServices = { viewportGridService, cornerstoneViewportService, toolbarService };
  const syncServices = { viewportGridService, syncGroupService, cornerstoneViewportService, toolbarService };
  const initServices = { viewportGridService, cornerstoneViewportService, displaySetService };

  let isCompareActive = false;

  const actions = {
    /** Toggle chest-wall-anchored magnification. */
    mammoMagnify: () => mammoMagnify(magnifyServices),

    /** Toggle zoom/pan/contrast synchronization across all viewports. */
    toggleMammoSync: () => toggleMammoSync(syncServices),

    /** Initialize mammography mode (wheel handlers, resize handler). */
    initMammoMode: () => initMammoMode(initServices),

    /** Navigate to mammography-compare mode with current study. */
    openMammoCompare: () => {
      logger.debug('Compare button clicked - switching to compare mode');
      try {
        const activeDisplaySets = displaySetService.getActiveDisplaySets();
        if (!activeDisplaySets || activeDisplaySets.length === 0) {
          logger.error('No active display sets found');
          return;
        }
        const studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
        const urlParams = new URLSearchParams(window.location.search);
        const dataSourceQuery = urlParams.get('datasources') || '';
        const url = `/mammography-compare?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}${dataSourceQuery ? `&datasources=${encodeURIComponent(dataSourceQuery)}` : ''}`;
        window.location.href = url;
      } catch (error) {
        logger.error('Error navigating to compare mode:', error);
      }
    },

    /** Cleanup all mammography mode listeners. */
    cleanupMammoMode: () => cleanupMammoMode(),
  };

  const definitions = {
    mammoMagnify: {
      commandFn: actions.mammoMagnify,
      storeContexts: [],
      options: {},
    },
    isMammoMagnified: {
      commandFn: () => {
        const store = useMammographyStore.getState();
        const { activeViewportId } = viewportGridService.getState();
        return store.hasMagnification(activeViewportId);
      },
      storeContexts: [],
      options: {},
    },
    toggleMammoSync: {
      commandFn: actions.toggleMammoSync,
      storeContexts: [],
      options: {},
    },
    isMammoSyncEnabled: {
      commandFn: () => useMammographyStore.getState().isSyncEnabled,
      storeContexts: [],
      options: {},
    },
    openMammoCompare: {
      commandFn: actions.openMammoCompare,
      storeContexts: [],
      options: {},
    },
    isMammoCompareActive: {
      commandFn: () => isCompareActive,
      storeContexts: [],
      options: {},
    },
    initMammoMode: {
      commandFn: actions.initMammoMode,
      storeContexts: [],
      options: {},
    },
    cleanupMammoMode: {
      commandFn: actions.cleanupMammoMode,
      storeContexts: [],
      options: {},
    },
  };

  return { actions, definitions };
}
