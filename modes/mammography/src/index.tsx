/**
 * Mammography Mode
 *
 * FR-2.5.5: Mirror Mode for breast imaging
 * - Initial state: ON (chest wall to edge)
 * - Toggle button to switch ON ↔ OFF
 */

import { hotkeys } from '@ohif/core';
import { id } from './id';
import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import commandsModule from './commandsModule';
import evaluatorsModule from './evaluatorsModule';

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: '@ohif/extension-default.hangingProtocolModule.hpMammo',
  leftPanel: '@ohif/extension-default.panelModule.seriesList',
  rightPanel: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
};

const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const dicomsr = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

const dicomvideo = {
  sopClassHandler: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

const dicomseg = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
  panel: '@ohif/extension-cornerstone-dicom-seg.panelModule.panelSegmentation',
};

const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.0',
  '@ohif/extension-dicom-video': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
};

function modeFactory({ modeConfiguration }) {
  return {
    id,
    routeName: 'mammography',
    displayName: 'Mammography',

    /**
     * Lifecycle: onModeEnter
     * FR-2.5.5: Auto-enable Mirror Mode on mode entry
     */
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }) => {
      const { toolbarService, toolGroupService, customizationService } = servicesManager.services;

      // Init tool groups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      // Toolbar configuration
      toolbarService.init(extensionManager);
      toolbarService.addButtons(toolbarButtons);
      toolbarService.createButtonSection('primary', [
        'MeasurementTools',
        'Zoom',
        'WindowLevel',
        'Pan',
        'Capture',
        'Layout',
        'MPR',
        'Crosshairs',
        'MoreTools',
        'MirrorMode', // FR-2.5.5: Mirror Mode toggle button
        'OpenMammoCompare',
      ]);

      // Customization service setup
      const defaultContexts = ['CORNERSTONE', 'DEFAULT'];
      customizationService.addModeCustomizations(defaultContexts);

      // FR-2.5.5: Auto-enable Mirror Mode after viewports are ready
      // Wait for DISPLAY_SETS_ADDED event to ensure viewports exist
      const { displaySetService } = servicesManager.services;

      const unsubscribe = displaySetService.subscribe(
        displaySetService.EVENTS.DISPLAY_SETS_ADDED,
        () => {
          // Run only once
          unsubscribe();

          // Small delay to ensure viewports are fully initialized
          setTimeout(() => {
            try {
              // Check current state first
              const isEnabled = commandsManager.runCommand('isMirrorModeEnabled');

              // If already enabled (default state), just apply it
              // If not enabled, toggle it on
              if (!isEnabled) {
                commandsManager.runCommand('toggleMirrorMode');
              } else {
                // State is already ON, but viewports need displayArea applied
                // Trigger a re-application by toggling twice
                commandsManager.runCommand('toggleMirrorMode'); // OFF
                commandsManager.runCommand('toggleMirrorMode'); // ON
              }
            } catch (error) {
              console.error('Failed to auto-enable Mirror Mode:', error);
            }
          }, 100);
        }
      );
    },

    onModeExit: ({ servicesManager }) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
      } = servicesManager.services;

      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },

    validationTags: {
      study: [],
      series: [],
    },

    isValidMode: ({ modalities }) => {
      const modalities_list = modalities.split('\\');
      const validModalities = ['MG', 'DX'];
      return modalities_list.some(mod => validModalities.includes(mod));
    },

    routes: [
      {
        path: 'mammography',
        layoutTemplate: () => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [ohif.leftPanel],
              rightPanels: [ohif.rightPanel],
              viewports: [
                {
                  namespace: tracked.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: dicomsr.viewport,
                  displaySetsToDisplay: [dicomsr.sopClassHandler],
                },
                {
                  namespace: dicomvideo.viewport,
                  displaySetsToDisplay: [dicomvideo.sopClassHandler],
                },
                {
                  namespace: dicompdf.viewport,
                  displaySetsToDisplay: [dicompdf.sopClassHandler],
                },
                {
                  namespace: dicomseg.viewport,
                  displaySetsToDisplay: [dicomseg.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],

    extensions: extensionDependencies,

    hangingProtocol: ohif.hangingProtocol,

    sopClassHandlers: [
      ohif.sopClassHandler,
      dicomvideo.sopClassHandler,
      dicompdf.sopClassHandler,
      dicomseg.sopClassHandler,
      dicomsr.sopClassHandler,
    ],

    hotkeys: [...hotkeys.defaults.hotkeyBindings],

    // Mode-specific modules
    getCommandsModule: commandsModule,
    getEvaluatorsModule: evaluatorsModule,
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
