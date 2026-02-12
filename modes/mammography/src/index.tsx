import update from 'immutability-helper';
import { ToolbarService, utils } from '@ohif/core';
import { annotation } from '@cornerstonejs/tools';

import initToolGroups from './initToolGroups';
import toolbarButtons from './toolbarButtons';
import commandsModule from './commandsModule';
import evaluatorsModule from './evaluatorsModule';
import { id } from './id';

const { TOOLBAR_SECTIONS } = ToolbarService;
const { structuredCloneWithFunctions } = utils;

/**
 * Define non-imaging modalities.
 * This can be used to exclude modes which have only these modalities,
 * or it can be used to not display thumbnails for some of these.
 * This list used to include SM, for whole slide imaging, but this is now supported
 * by cornerstone.  Others of these may get added.
 */
export const NON_IMAGE_MODALITIES = ['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR', 'SR', 'DOC'];

export const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
  wsiSopClassHandler:
    '@ohif/extension-cornerstone.sopClassHandlerModule.DicomMicroscopySopClassHandler',
};

export const cornerstone = {
  measurements: '@ohif/extension-cornerstone.panelModule.panelMeasurement',
  segmentation: '@ohif/extension-cornerstone.panelModule.panelSegmentation',
  viewport: '@ohif/extension-cornerstone.viewportModule.cornerstone',
};

export const dicomsr = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  sopClassHandler3D: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr-3d',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

export const dicomvideo = {
  sopClassHandler: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

export const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

export const dicomSeg = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
};

export const dicomPmap = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-pmap.sopClassHandlerModule.dicom-pmap',
  viewport: '@ohif/extension-cornerstone-dicom-pmap.viewportModule.dicom-pmap',
};

export const dicomRT = {
  viewport: '@ohif/extension-cornerstone-dicom-rt.viewportModule.dicom-rt',
  sopClassHandler: '@ohif/extension-cornerstone-dicom-rt.sopClassHandlerModule.dicom-rt',
};

export const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-pmap': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-rt': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.1',
  '@ohif/extension-dicom-video': '^3.0.1',
};

export const sopClassHandlers = [
  dicomvideo.sopClassHandler,
  dicomSeg.sopClassHandler,
  dicomPmap.sopClassHandler,
  ohif.sopClassHandler,
  ohif.wsiSopClassHandler,
  dicompdf.sopClassHandler,
  dicomsr.sopClassHandler3D,
  dicomsr.sopClassHandler,
  dicomRT.sopClassHandler,
];

/**
 * Indicate this is a valid mode if:
 *   - it contains at least one of the modeModalities
 *   - it contains all of the array value in modeModalities
 * Otherwise, if modeModalities is not defined:
 *   - it contains at least one modality other than the nonModeMOdalities.
 */
export function isValidMode({ modalities }) {
  const modalities_list = modalities.split('\\');

  if (this.modeModalities?.length) {
    for (const modeModality of this.modeModalities) {
      if (Array.isArray(modeModality) && modeModality.every(m => modalities.indexOf(m) !== -1)) {
        return { valid: true, description: `Matches ${modeModality.join(', ')}` };
      } else if (modalities.indexOf(modeModality) !== -1) {
        return { valid: true, description: `Matches ${modeModality}` };
      }
    }
    return {
      valid: false,
      description: `None of the mode modalities match: ${JSON.stringify(this.modeModalities)}`,
    };
  }

  return {
    valid: !!modalities_list.find(modality => this.nonModeModalities.indexOf(modality) === -1),
    description: `The mode does not support studies that ONLY include the following modalities: ${this.nonModeModalities.join(', ')}`,
  };
}

export function onModeEnter({
  servicesManager,
  extensionManager,
  commandsManager,
  panelService,
  segmentationService,
}: withAppTypes) {
  console.log('🩻 MAMMOGRAPHY MODE ACTIVATED! 🩻');
  console.log('Custom buttons should appear: Mammo Magnify, Sync All, Compare');

  const { measurementService, toolbarService, toolGroupService, customizationService } =
    servicesManager.services;

  measurementService.clearMeasurements();

  // Create and register mammography commands context
  commandsManager.createContext('MAMMOGRAPHY');
  console.log('📦 Created MAMMOGRAPHY command context');

  const mammoCommands = commandsModule({ servicesManager, commandsManager });
  Object.entries(mammoCommands.definitions).forEach(([commandName, commandDefinition]) => {
    commandsManager.registerCommand('MAMMOGRAPHY', commandName, commandDefinition);
    console.log(`✅ Registered command: ${commandName} in MAMMOGRAPHY context`);
  });

  // Register mammography evaluators for toolbar button states
  const mammoEvaluators = evaluatorsModule({ commandsManager });
  mammoEvaluators.forEach(evaluator => {
    toolbarService.registerEvaluateFunction(evaluator.name, evaluator.evaluate);
    console.log(`✅ Registered evaluator: ${evaluator.name}`);
  });

  // Init Default and SR ToolGroups
  initToolGroups(extensionManager, toolGroupService, commandsManager);

  // Hide textBox statistics for EllipticalROI and CircleROI tools
  // This removes the green "Area: NaN, Mean: NaN..." text and dotted link line from viewport
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    annotation.config.style.setToolGroupToolStyles(toolGroupId, {
      EllipticalROI: {
        textBoxVisibility: false,
      },
      CircleROI: {
        textBoxVisibility: false,
      },
      global: {}
    });
  });

  // Initialize mammography mode (sets up custom wheel zoom handlers)
  commandsManager.runCommand('initMammoMode');

  toolbarService.register(this.toolbarButtons);

  for (const [key, section] of Object.entries(this.toolbarSections)) {
    toolbarService.updateSection(key, section);
  }

  if (!this.enableSegmentationEdit) {
    customizationService.setCustomizations({
      'panelSegmentation.disableEditing': {
        $set: true,
      },
    });
  }

  // TODO: Temporarily commented out chest wall anchoring to isolate React hooks error
  /*
  // Left breast images (LCC, LMLO) - chest wall on LEFT edge, aligned to midline
  const rightDisplayArea = {
    storeAsInitialCamera: true,
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [0, 0.5],
      canvasPoint: [0.0, 0.5],
    },
  };

  // Right breast images (RCC, RMLO) - chest wall on RIGHT edge, aligned to midline
  const leftDisplayArea = {
    storeAsInitialCamera: true,
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [1, 0.5],
      canvasPoint: [1.0, 0.5],
    },
  };

  // Listen to VIEWPORTS_READY event to apply chest wall anchoring
  const applyChestWallAnchoring = () => {
    console.log('🔧 Applying chest wall anchoring to all viewports');

    const { viewports } = viewportGridService.getState();
    const viewportArray = viewports instanceof Map
      ? Array.from(viewports.values())
      : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

    viewportArray.forEach((vp) => {
      const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
      const displaySetUIDs = vp.displaySetInstanceUIDs || [];

      if (!displaySetUIDs || displaySetUIDs.length === 0) {
        return;
      }

      // Get the display set to check laterality
      const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
      if (!displaySet) {
        return;
      }

      // Check image laterality from metadata
      const instance = displaySet.instances?.[0];
      const laterality = instance?.ImageLaterality || displaySet.ImageLaterality;
      const viewPosition = instance?.ViewPosition || displaySet.ViewPosition;

      // Determine if this is a right or left breast
      let isRightBreast = false;
      if (laterality === 'R') {
        isRightBreast = true;
      } else if (laterality === 'L') {
        isRightBreast = false;
      } else if (viewPosition) {
        // Fallback to ViewPosition if laterality is not available
        isRightBreast = viewPosition.includes('R');
      }

      // Apply appropriate displayArea based on laterality
      const displayArea = isRightBreast ? leftDisplayArea : rightDisplayArea;

      console.log(`📍 Viewport ${viewportId}: laterality=${laterality}, viewPosition=${viewPosition}, isRightBreast=${isRightBreast}`);

      // Get the viewport and apply displayArea
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport) {
        try {
          // Apply the display area configuration
          viewport.setDisplayArea(displayArea);
          viewport.resetCamera();
          viewport.render();
          console.log(`✅ Applied chest wall anchoring to viewport ${viewportId}`);
        } catch (error) {
          console.warn(`Failed to apply display area to viewport ${viewportId}:`, error);
        }
      }
    });
  };

  // Subscribe to VIEWPORTS_READY event
  const viewportsReadySubscription = viewportGridService.subscribe(
    viewportGridService.EVENTS.VIEWPORTS_READY,
    () => {
      // Use a timeout to ensure viewports are fully initialized
      setTimeout(applyChestWallAnchoring, 500);
    }
  );

  // Store subscription for cleanup
  this._viewportsReadySubscription = viewportsReadySubscription;
  */

  // // ActivatePanel event trigger for when a segmentation or measurement is added.
  // // Do not force activation so as to respect the state the user may have left the UI in.
  if (this.activatePanelTrigger) {
    this._activatePanelTriggersSubscriptions = [
      ...panelService.addActivatePanelTriggers(
        cornerstone.segmentation,
        [
          {
            sourcePubSubService: segmentationService,
            sourceEvents: [segmentationService.EVENTS.SEGMENTATION_ADDED],
          },
        ],
        true
      ),
      ...panelService.addActivatePanelTriggers(
        cornerstone.measurements,
        [
          {
            sourcePubSubService: measurementService,
            sourceEvents: [
              measurementService.EVENTS.MEASUREMENT_ADDED,
              measurementService.EVENTS.RAW_MEASUREMENT_ADDED,
            ],
          },
        ],
        true
      ),
      true,
    ];
  }
}

export function onModeExit({ servicesManager }: withAppTypes) {
  const {
    toolGroupService,
    syncGroupService,
    segmentationService,
    cornerstoneViewportService,
    uiDialogService,
    uiModalService,
  } = servicesManager.services;

  this._activatePanelTriggersSubscriptions.forEach(sub => sub.unsubscribe());
  this._activatePanelTriggersSubscriptions.length = 0;

  // TODO: Uncomment when chest wall anchoring is re-enabled
  // // Unsubscribe from viewports ready event
  // if (this._viewportsReadySubscription) {
  //   this._viewportsReadySubscription.unsubscribe();
  // }

  uiDialogService.hideAll();
  uiModalService.hide();
  toolGroupService.destroy();
  syncGroupService.destroy();
  segmentationService.destroy();
  cornerstoneViewportService.destroy();
}

export const toolbarSections = {
  [TOOLBAR_SECTIONS.primary]: [
    'MammoMagnify',
    'SyncAllImages',
    'MirrorModeToggle',
    'MammoCompare',
    'MeasurementTools',
    'Zoom',
    'Pan',
    'WindowLevel',
    'Capture',
    'Layout',
    'OpenReport',
    'ViewPDFReport',
    'MoreTools',
  ],

  [TOOLBAR_SECTIONS.viewportActionMenu.topLeft]: ['orientationMenu', 'dataOverlayMenu'],

  [TOOLBAR_SECTIONS.viewportActionMenu.bottomMiddle]: ['AdvancedRenderingControls'],

  AdvancedRenderingControls: [
    'windowLevelMenuEmbedded',
    'voiManualControlMenu',
    'Colorbar',
    'opacityMenu',
    'thresholdMenu',
  ],

  [TOOLBAR_SECTIONS.viewportActionMenu.topRight]: [
    'modalityLoadBadge',
    'trackingStatus',
    'navigationComponent',
  ],

  [TOOLBAR_SECTIONS.viewportActionMenu.bottomLeft]: ['windowLevelMenu'],

  MeasurementTools: ['Length', 'ArrowAnnotate', 'EllipticalROI', 'CircleROI'],

  MoreTools: [
    'Reset',
    'rotate-right',
    'flipHorizontal',
    'ImageSliceSync',
    'ReferenceLines',
    'ImageOverlayViewer',
    'StackScroll',
    'invert',
    'Probe',
    'Cine',
    'Angle',
    'CobbAngle',
    'Magnify',
    'CalibrationLine',
    'TagBrowser',
    'UltrasoundDirectionalTool',
    'WindowLevelRegion',
    'SegmentLabelTool',
  ],
};

export const basicLayout = {
  id: ohif.layout,
  props: {
    leftPanels: [ohif.thumbnailList],
    leftPanelResizable: true,
    rightPanels: [cornerstone.measurements],
    rightPanelClosed: true,
    rightPanelResizable: true,
    viewports: [
      {
        namespace: cornerstone.viewport,
        displaySetsToDisplay: [
          ohif.sopClassHandler,
          dicomvideo.sopClassHandler,
          ohif.wsiSopClassHandler,
        ],
      },
      {
        namespace: dicomsr.viewport,
        displaySetsToDisplay: [dicomsr.sopClassHandler, dicomsr.sopClassHandler3D],
      },
      {
        namespace: dicompdf.viewport,
        displaySetsToDisplay: [dicompdf.sopClassHandler],
      },
      {
        namespace: dicomSeg.viewport,
        displaySetsToDisplay: [dicomSeg.sopClassHandler],
      },
      {
        namespace: dicomPmap.viewport,
        displaySetsToDisplay: [dicomPmap.sopClassHandler],
      },
      {
        namespace: dicomRT.viewport,
        displaySetsToDisplay: [dicomRT.sopClassHandler],
      },
    ],
  },
};

export function layoutTemplate() {
  return structuredCloneWithFunctions(this.layoutInstance);
}

export const mammographyRoute = {
  path: 'mammography',
  layoutTemplate,
  layoutInstance: basicLayout,
};

export const modeInstance = {
  id,
  routeName: 'mammography',
  hide: false,
  displayName: 'Mammography',
  _activatePanelTriggersSubscriptions: [],
  toolbarSections,

  /**
   * Lifecycle hooks
   */
  onModeEnter,
  onModeExit,
  validationTags: {
    study: [],
    series: [],
  },

  // Specific to mammography modality
  modeModalities: ['MG'],
  isValidMode,
  routes: [mammographyRoute],
  extensions: extensionDependencies,
  // Use only normal mammography protocol by default
  hangingProtocol: '@ohif/hpMammo',
  sopClassHandlers,
  toolbarButtons,
  enableSegmentationEdit: false,
  nonModeModalities: NON_IMAGE_MODALITIES,
};

/**
 * Creates a mode on this object, using immutability-helper to apply changes
 * from modeConfiguration into the modeInstance.
 */
export function modeFactory({ modeConfiguration }) {
  let modeInstance = this.modeInstance;
  if (modeConfiguration) {
    modeInstance = update(modeInstance, modeConfiguration);
  }
  return modeInstance;
}

export const mode = {
  id,
  modeFactory,
  modeInstance: { ...modeInstance, hide: false },
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons, commandsModule, evaluatorsModule };
