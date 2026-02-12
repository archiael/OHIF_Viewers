/**
 * @ohif/mode-mammography-shared
 *
 * Shared utilities, commands, toolbar buttons, evaluators, and tool groups
 * for mammography and mammography-compare modes.
 */

// Store
export { useMammographyStore } from './store/mammographyStore';

// Commands (base + decomposed modules)
export { createBaseCommands } from './commands/commandsBase';
export { mammoMagnify, magnifyAllViewportsSynced, magnifySingleViewport } from './commands/magnifyManager';
export { toggleMammoSync, enableCameraSync, disableCameraSync } from './commands/syncManager';
export { initMammoMode, cleanupMammoMode } from './commands/initManager';
export { toViewportArray, getViewportId, getValidViewports, refreshToolbarForViewport } from './commands/viewportHelpers';
export { calculateAnchorShift, buildZoomedCamera, cloneCamera } from './commands/cameraUtils';

// Toolbar
export {
  createBaseToolbarButtons,
  sectionButtons,
  mammoMagnifyButton,
  syncAllImagesButton,
  mammoCompareButton,
  genericToolButtons,
  setToolActiveToolbar,
} from './toolbar/toolbarBase';

// Evaluators
export { createBaseEvaluators } from './evaluatorsBase';

// Tool Groups
export { default as initToolGroups } from './initToolGroups';

// Utilities
export {
  inferLateralityFromViewport,
  getMidlineCanvasPoint,
  getMidlineAnchor,
  getFixedMidlineAnchor,
  recenterToCanvasPoint,
} from './utils/mammographyMidline';

export { default as MammographyZoomTool } from './MammographyZoomTool';

// Logger
export { logger } from './utils/logger';

// Constants
export {
  MAMMO_ZOOM_FACTOR,
  RESIZE_DEBOUNCE_DELAY,
  WHEEL_ZOOM_MULTIPLIER,
  VOI_SYNC_GROUP_ID,
  DICOM_TAG_FORMATS,
  LEFT_LATERALITY_HINTS,
  RIGHT_LATERALITY_HINTS,
  DICOM_TAGS,
} from './constants';
