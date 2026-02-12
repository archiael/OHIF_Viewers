/**
 * Mammography Compare mode commands module
 */
import { createBaseCommands, logger } from '@ohif/mode-mammography-shared';

const DEBUG = process.env.NODE_ENV === 'development';

// Type definitions for viewport handling
interface ViewportType {
  viewportId?: string;
  viewportOptions?: { viewportId?: string };
  displaySetInstanceUIDs?: string[];
}

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    viewportGridService,
    cornerstoneViewportService,
    toolbarService,
  } = servicesManager.services;

  // Get shared base commands (mammoMagnify, toggleMammoSync, initMammoMode, cleanupMammoMode, etc.)
  const baseCommands = createBaseCommands({ servicesManager, commandsManager });

  const refreshToolbarForViewport = viewportId => {
    if (!viewportId) return;
    try {
      toolbarService?.refreshToolbarState?.({ viewportId });
    } catch (error) {
      logger.warn('Unable to refresh toolbar state', error);
    }
  };

  let isCompareActive = false;

  // Compare-mode specific actions
  const compareActions = {
    /**
     * Exit compare mode - returns to single study view
     */
    exitMammoCompare: () => {
      if (DEBUG) logger.debug('Exit Compare button clicked');

      try {
        const { displaySetService } = servicesManager.services;
        const activeDisplaySets = displaySetService.getActiveDisplaySets();

        if (!activeDisplaySets || activeDisplaySets.length === 0) {
          logger.error('No active display sets found');
          return;
        }

        // Get the study UID from the first active display set
        const studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
        logger.debug('Exiting compare mode, returning to study:', studyInstanceUID);

        // Get the datasource query parameter from current URL if it exists
        const urlParams = new URLSearchParams(window.location.search);
        const dataSourceQuery = urlParams.get('datasources') || '';

        // Navigate back to the mammography mode with the current study
        const mammographyUrl = `/mammography?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}${dataSourceQuery ? `&datasources=${encodeURIComponent(dataSourceQuery)}` : ''}`;
        logger.debug('Navigating to:', mammographyUrl);
        window.location.href = mammographyUrl;
      } catch (error) {
        logger.error('Error exiting compare mode:', error);
      }
    },
  };

  // Compare-mode specific definitions
  const compareDefinitions = {
    exitMammoCompare: {
      commandFn: compareActions.exitMammoCompare,
      storeContexts: [],
      options: {},
    },
    isMammoCompareActive: {
      commandFn: () => isCompareActive,
      storeContexts: [],
      options: {},
    },
  };

  return {
    actions: {
      ...baseCommands.actions,
      ...compareActions,
    },
    definitions: {
      ...baseCommands.definitions,
      ...compareDefinitions,
    },
  };
};

export default commandsModule;
