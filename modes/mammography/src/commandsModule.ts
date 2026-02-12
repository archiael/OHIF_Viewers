/**
 * Mammography-specific commands module.
 *
 * Uses shared base commands from mammography-shared and adds mammography-only commands:
 * - toggleMirrorMode: Toggle chest wall alignment (mirror image)
 * - isMirrorModeEnabled: Query mirror mode state
 * - openSRReportPage: Open SR measurement report in new tab (decomposed into srReportManager.ts)
 * - openPDFReportPage: Open PDF report in new tab
 *
 * God Functions have been decomposed into focused modules (<50 lines each):
 * - mammography-shared/src/commands/magnifyManager.ts: mammoMagnify (4 functions)
 * - mammography-shared/src/commands/syncManager.ts: toggleMammoSync (4 functions)
 * - mammography-shared/src/commands/initManager.ts: initMammoMode (5 functions)
 * - commands/srReportManager.ts: openSRReportPage (6 functions)
 */
import { createBaseCommands, logger, useMammographyStore } from '@ohif/mode-mammography-shared';
import { openSRReportPage } from './commands/srReportManager';

// Mirror mode state (mammography-only)
let isMirrorModeEnabled = true;

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    viewportGridService,
    cornerstoneViewportService,
    toolbarService,
  } = servicesManager.services;

  // Get shared base commands (mammoMagnify, toggleMammoSync, initMammoMode, etc.)
  const baseCommands = createBaseCommands({ servicesManager, commandsManager });

  const refreshToolbarForViewport = viewportId => {
    if (!viewportId) return;
    try {
      toolbarService?.refreshToolbarState?.({ viewportId });
    } catch (error) {
      logger.warn('Unable to refresh toolbar state', error);
    }
  };

  // Mammography-only actions
  const mammographyActions = {
    /**
     * Toggle Mirror Mode (Chest Wall Alignment).
     * ON (default): displayArea from hanging protocol (chest wall to center).
     * OFF: Override displayArea to center image normally.
     */
    toggleMirrorMode: () => {
      logger.debug('Mirror Mode toggle clicked, current state:', isMirrorModeEnabled);

      try {
        isMirrorModeEnabled = !isMirrorModeEnabled;

        const { viewports } = viewportGridService.getState();
        const viewportArray = viewports instanceof Map
          ? Array.from(viewports.values())
          : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

        viewportArray.forEach((vp) => {
          const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
          if (!viewportId) return;

          const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
          if (!viewport) return;

          if (isMirrorModeEnabled) {
            viewport.resetCamera();
            viewport.render();
          } else {
            const camera = viewport.getCamera();
            const defaultCamera = viewport.getDefaultCamera();
            viewport.setCamera({
              ...camera,
              focalPoint: defaultCamera.focalPoint,
              position: defaultCamera.position,
            });
            viewport.render();
          }
        });

        logger.debug(`Mirror Mode toggled: ${isMirrorModeEnabled ? 'ON' : 'OFF'}`);
        const { activeViewportId } = viewportGridService.getState();
        refreshToolbarForViewport(activeViewportId);
      } catch (error) {
        logger.error('Error in toggleMirrorMode:', error);
      }
    },

    /** Open SR measurement report in a new tab (delegated to srReportManager). */
    openSRReportPage: async () => openSRReportPage(servicesManager),

    /** Open PDF report in a new browser tab. */
    openPDFReportPage: async () => {
      const { displaySetService, uiNotificationService } = servicesManager.services;

      const pdfDisplaySets = displaySetService.activeDisplaySets.filter(
        (ds: any) => ds.SOPClassUID === '1.2.840.10008.5.1.4.1.1.104.1'
      );

      if (pdfDisplaySets.length === 0) {
        uiNotificationService.show({
          title: 'No PDF Found',
          message: 'No PDF report available in this study.',
          type: 'warning',
          duration: 3000,
        });
        return;
      }

      const url = await pdfDisplaySets[0].renderedUrl;
      window.open(url, '_blank');
    },
  };

  // Mammography-only definitions
  const mammographyDefinitions = {
    toggleMirrorMode: {
      commandFn: mammographyActions.toggleMirrorMode,
      storeContexts: [],
      options: {},
    },
    isMirrorModeEnabled: {
      commandFn: () => isMirrorModeEnabled,
      storeContexts: [],
      options: {},
    },
    openSRReportPage: {
      commandFn: mammographyActions.openSRReportPage,
      storeContexts: [],
      options: {},
    },
    openPDFReportPage: {
      commandFn: mammographyActions.openPDFReportPage,
      storeContexts: [],
      options: {},
    },
  };

  return {
    actions: {
      ...baseCommands.actions,
      ...mammographyActions,
    },
    definitions: {
      ...baseCommands.definitions,
      ...mammographyDefinitions,
    },
  };
};

export default commandsModule;
