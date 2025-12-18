import { id } from './id';
import { utils, ToolbarService } from '@ohif/core';
import {
  initToolGroups,
  toolbarButtons as basicToolbarButtons,
  toolbarSections as basicToolbarSections,
  ohif,
  cornerstone,
  basicLayout,
  basicRoute,
  extensionDependencies as basicDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
} from '@ohif/mode-basic';
import { eventTarget as coreEventTarget } from '@cornerstonejs/core';
import ResizableGridManager from './utils/ResizableGridManager';
import LayoutConfigManager from './utils/LayoutConfigManager';
import SlicePlaneManager from './utils/SlicePlaneManager';
import SlicePlaneSync from './utils/SlicePlaneSync';
import usmprToolbarButtons from './toolbarButtons';

const { TOOLBAR_SECTIONS } = ToolbarService;

const { structuredCloneWithFunctions } = utils;

// Global instance of the resizable grid manager
let resizableGridManager: ResizableGridManager | null = null;

// Global instance of the layout config manager
let layoutConfigManager: LayoutConfigManager | null = null;

// Global instances of the 3D slice plane managers
let slicePlaneManager: SlicePlaneManager | null = null;
let slicePlaneSync: SlicePlaneSync | null = null;

// Extension dependencies - same as basic mode
export const extensionDependencies = {
  ...basicDependencies,
};

// Helper function to get layout configuration from localStorage
function getLayoutConfig() {
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'CT-Bone',
  };

  try {
    const stored = localStorage.getItem('usmpr-layout-config');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load layout config from localStorage:', error);
  }

  return defaultConfig;
}

// Validation function - accepts only CT and MR studies (volumetric data for MPR)
export function isValidMode({ modalities }) {
  if (!modalities) {
    return { valid: false, description: 'No modalities found' };
  }

  const modalitiesArray = modalities.split('\\');
  const hasCT = modalitiesArray.includes('CT');
  const hasMR = modalitiesArray.includes('MR');
  const isValid = hasCT || hasMR;

  let description = 'USMPR not available for this modality';
  if (hasCT) description = 'CT study - MPR available';
  else if (hasMR) description = 'MR study - MPR available';

  return {
    valid: isValid,
    description: description,
  };
}

// Custom onModeEnter for USMPR - uses basic tool initialization
export function onModeEnter({ servicesManager, extensionManager, commandsManager }) {
  const {
    measurementService,
    toolbarService,
    toolGroupService,
    viewportGridService,
    cornerstoneViewportService,
  } = servicesManager.services;

  // Clear measurements
  measurementService.clearMeasurements();

  // Destroy any existing tool groups before creating new ones
  // This prevents "ToolGroup already exists" errors when re-entering the mode
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      console.log(`🧹 [USMPR] Cleaning up existing tool group '${toolGroupId}'`);
      toolGroupService.destroyToolGroup(toolGroupId);
    }
  });

  // Initialize tool groups using basic mode's initToolGroups
  // This properly registers tools with the extensionManager
  initToolGroups(extensionManager, toolGroupService, commandsManager);

  // Patch CrosshairsTool to add error handling during initialization
  // This prevents crashes when mouse moves before all viewports are ready
  setTimeout(() => {
    try {
      const toolGroup = toolGroupService.getToolGroup('mpr');
      if (toolGroup) {
        const crosshairsTool = toolGroup.getToolInstance('Crosshairs');
        if (crosshairsTool && crosshairsTool.mouseMoveCallback) {
          const originalMouseMove = crosshairsTool.mouseMoveCallback.bind(crosshairsTool);
          crosshairsTool.mouseMoveCallback = function (evt) {
            try {
              return originalMouseMove(evt);
            } catch (error) {
              // Silently catch errors during viewport initialization
              if (error.message?.includes('length') || error.message?.includes('undefined')) {
                // Viewports not ready yet, ignore
                return;
              }
              throw error; // Re-throw other errors
            }
          };
          console.log('✅ CrosshairsTool patched with error handling');
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not patch CrosshairsTool:', error);
    }
  }, 100);

  // Track previous layout to detect actual dimension changes
  let previousLayout = { numRows: 2, numCols: 2 };

  // Auto-disable Crosshairs when viewport is maximized (single viewport)
  // Track previous crosshairs state to restore when returning to MPR grid
  let crosshairsWasActive = false;
  const layoutChangeHandler = evt => {
    // LAYOUT_CHANGED events have numCols/numRows at top level
    const { numCols, numRows } = evt;

    // Validate we have the data we need
    if (typeof numCols !== 'number' || typeof numRows !== 'number') {
      return;
    }

    // Only process when layout dimensions actually change
    const hasLayoutChanged =
      previousLayout.numRows !== numRows ||
      previousLayout.numCols !== numCols;

    if (!hasLayoutChanged) {
      // Skip redundant events (e.g., drag with same 2x2 layout)
      return;
    }

    // Update tracking
    previousLayout = { numRows, numCols };

    const isSingleViewport = numRows === 1 && numCols === 1;
    const isMPRGrid = numRows === 2 && numCols === 2;

    console.log('📐 Layout change detected:', {
      numRows,
      numCols,
      isSingleViewport,
      isMPRGrid,
      hasResizableGridManager: !!resizableGridManager,
    });

    const toolGroup = toolGroupService.getToolGroup('mpr');
    if (!toolGroup) {
      return;
    }

    // Hide/show viewport grid dividing lines
    if (resizableGridManager) {
      if (isSingleViewport) {
        console.log('📐 Calling hide() because isSingleViewport=true');
        resizableGridManager.hide();
      } else if (isMPRGrid) {
        console.log('📐 Calling show() because isMPRGrid=true');
        resizableGridManager.show();
      }
    }

    if (isSingleViewport) {
      // Save current crosshairs state and disable it
      const activeTool = toolGroup.getActivePrimaryMouseButtonTool();
      crosshairsWasActive = activeTool === 'Crosshairs';
      if (crosshairsWasActive) {
        toolGroup.setToolPassive('Crosshairs');
        console.log('🔄 Crosshairs disabled (single viewport)');

        // Hide 3D reference planes when crosshairs disabled
        if (slicePlaneManager) {
          slicePlaneManager.setVisible(false);
          console.log('🙈 [USMPR] 3D planes hidden (single viewport)');
        }
        if (slicePlaneSync) {
          slicePlaneSync.setEnabled(false);
        }
      }
    } else if (isMPRGrid && crosshairsWasActive) {
      // Restore crosshairs if it was active before
      toolGroup.setToolActive('Crosshairs', { bindings: [{ mouseButton: 1 }] });
      crosshairsWasActive = false; // Reset flag
      console.log('🔄 Crosshairs restored (MPR grid)');

      // Show 3D reference planes when crosshairs restored
      if (slicePlaneManager) {
        slicePlaneManager.setVisible(true);
        console.log('👁️ [USMPR] 3D planes shown (MPR grid)');
      }
      if (slicePlaneSync) {
        slicePlaneSync.setEnabled(true);
        slicePlaneSync.updateAllPlanes(); // Force update all planes
      }
    }
  };

  // Subscribe to layout changes
  console.log('🔌 Available viewportGridService.EVENTS:', viewportGridService.EVENTS);
  console.log('🔌 Subscribing to LAYOUT_CHANGED event:', viewportGridService.EVENTS.LAYOUT_CHANGED);

  // Subscribe to ALL events to see what fires
  const allEventsSubs = [];
  for (const eventName in viewportGridService.EVENTS) {
    const eventKey = viewportGridService.EVENTS[eventName];
    const unsub = viewportGridService.subscribe(eventKey, evt => {
      console.log(`🎯 Event fired: ${eventName} (${eventKey})`, evt);
      if (eventName === 'LAYOUT_CHANGED' || eventName === 'GRID_STATE_CHANGED') {
        layoutChangeHandler(evt);
      }
    });
    allEventsSubs.push(unsub);
  }
  console.log('✅ Subscribed to all events');

  // Store unsubscribe function for cleanup
  (window as any).usmprLayoutUnsubscribe = () => {
    allEventsSubs.forEach(unsub => unsub());
  };

  // Register basic mode toolbar buttons first
  toolbarService.register(basicToolbarButtons);

  // Then register USMPR custom buttons (LayoutConfig, etc.)
  toolbarService.register(usmprToolbarButtons);

  // Update toolbar sections from USMPR mode
  for (const [key, section] of Object.entries(this.toolbarSections)) {
    toolbarService.updateSection(key, section);
  }

  // Monitor Crosshairs activation state and sync with 3D planes
  let lastCrosshairsState = false;
  let monitorCount = 0;
  console.log('🎬 [USMPR] Initializing Crosshairs monitor, initial lastCrosshairsState =', lastCrosshairsState);

  const crosshairsMonitor = setInterval(() => {
    const toolGroup = toolGroupService.getToolGroup('mpr');
    if (!toolGroup) {
      if (monitorCount % 50 === 0) {
        console.log('⚠️ [USMPR] Crosshairs monitor: tool group not found');
      }
      monitorCount++;
      return;
    }

    const activeTool = toolGroup.getActivePrimaryMouseButtonTool();
    const isCrosshairsActive = activeTool === 'Crosshairs';

    // Log periodically to debug
    if (monitorCount % 50 === 0) {
      console.log(`🔍 [USMPR] Crosshairs monitor check: activeTool="${activeTool}", isCrosshairsActive=${isCrosshairsActive}, lastCrosshairsState=${lastCrosshairsState}`);
    }
    monitorCount++;

    // Only update if state changed
    if (isCrosshairsActive !== lastCrosshairsState) {
      console.log(`🔄 [USMPR] State change detected! lastCrosshairsState=${lastCrosshairsState} -> isCrosshairsActive=${isCrosshairsActive}`);
      lastCrosshairsState = isCrosshairsActive;

      if (isCrosshairsActive) {
        console.log('👁️ [USMPR] Crosshairs activated - showing 3D planes');
        console.log('   slicePlaneManager exists:', !!slicePlaneManager);
        console.log('   slicePlaneSync exists:', !!slicePlaneSync);
        if (slicePlaneManager) {
          slicePlaneManager.setVisible(true);
        }
        if (slicePlaneSync) {
          slicePlaneSync.setEnabled(true);
          slicePlaneSync.updateAllPlanes();
        }
      } else {
        console.log('🙈 [USMPR] Crosshairs deactivated - hiding 3D planes');
        if (slicePlaneManager) {
          slicePlaneManager.setVisible(false);
        }
        if (slicePlaneSync) {
          slicePlaneSync.setEnabled(false);
        }
      }
    }
  }, 100); // Check every 100ms

  console.log('✅ [USMPR] Crosshairs monitor started');

  // Store interval for cleanup
  (window as any).usmprCrosshairsMonitor = crosshairsMonitor;

  // Initialize resizable grid manager
  // Use setTimeout to ensure DOM is ready
  setTimeout(() => {
    resizableGridManager = new ResizableGridManager(viewportGridService);
    resizableGridManager.initialize('[data-cy="viewport-grid"]');
    // Ensure lines are visible initially (they should be visible in MPR mode by default)
    resizableGridManager.show();

    // Initialize 3D reference planes
    console.log('🔧 [USMPR] Initializing 3D reference planes...');
    try {
      const layoutConfig = getLayoutConfig();
      const position3D = layoutConfig.positions.indexOf('3D');

      if (position3D !== -1) {
        console.log(`📍 [USMPR] Found 3D viewport at position ${position3D}`);

        // Get the 3D viewport
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);

        if (viewport3D) {
          console.log('✅ [USMPR] 3D viewport retrieved successfully');

          // Initialize slice plane manager
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          slicePlaneManager.setVisible(false); // Hidden by default until crosshairs activated

          // Map viewport positions to orientations (skip 3D position)
          const viewportInfos = [];
          layoutConfig.positions.forEach((viewType, index) => {
            if (viewType !== '3D') {
              viewportInfos.push({
                viewportId: `mpr-${index}`,
                orientation: viewType.toLowerCase(), // 'axial', 'sagittal', 'coronal'
              });
              console.log(`📍 [USMPR] Mapped mpr-${index} to ${viewType.toLowerCase()}`);
            }
          });

          // Initialize slice plane sync with Cornerstone event target
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(false); // Disabled by default until crosshairs activated

          console.log('✅ [USMPR] 3D reference planes initialized successfully');
        } else {
          console.warn('⚠️ [USMPR] 3D viewport not found at position', position3D);
        }
      } else {
        console.log('ℹ️ [USMPR] No 3D viewport in current layout configuration');
      }
    } catch (error) {
      console.error('❌ [USMPR] Failed to initialize 3D reference planes:', error);
    }
  }, 500);

  // Initialize layout config manager
  layoutConfigManager = new LayoutConfigManager();
  layoutConfigManager.setServicesManager(servicesManager);
  console.log('🔧 LayoutConfigManager initialized:', layoutConfigManager);

  // Make it globally accessible for toolbar button
  (window as any).usmprLayoutConfigManager = layoutConfigManager;

  // Create and register USMPR commands context
  commandsManager.createContext('USMPR');
  console.log('📦 Created USMPR command context');

  // Register custom command for opening layout config modal
  commandsManager.registerCommand('USMPR', 'openLayoutConfigModal', {
    commandFn: () => {
      console.log('🎯 openLayoutConfigModal command called!');
      console.log('🔍 layoutConfigManager exists?', !!layoutConfigManager);
      if (layoutConfigManager) {
        console.log('📂 Calling layoutConfigManager.show()...');
        layoutConfigManager.show();
      } else {
        console.error('❌ layoutConfigManager is null!');
      }
    },
  });
  console.log('✅ openLayoutConfigModal command registered in USMPR context');
}

// Custom onModeExit for USMPR - cleanup
export function onModeExit({ servicesManager }) {
  const { toolGroupService } = servicesManager.services;

  // Destroy tool groups to prevent "already exists" errors on re-entry
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroupService.destroyToolGroup(toolGroupId);
      console.log(`✅ [USMPR] Tool group '${toolGroupId}' destroyed`);
    }
  });

  // Destroy 3D slice plane managers
  if (slicePlaneSync) {
    slicePlaneSync.destroy();
    slicePlaneSync = null;
    console.log('✅ [USMPR] SlicePlaneSync destroyed');
  }

  if (slicePlaneManager) {
    slicePlaneManager.destroy();
    slicePlaneManager = null;
    console.log('✅ [USMPR] SlicePlaneManager destroyed');
  }

  // Destroy resizable grid manager
  if (resizableGridManager) {
    resizableGridManager.destroy();
    resizableGridManager = null;
  }

  // Destroy layout config manager
  if (layoutConfigManager) {
    layoutConfigManager.destroy();
    layoutConfigManager = null;
  }

  // Unsubscribe from layout changes
  const layoutUnsubscribe = (window as any).usmprLayoutUnsubscribe;
  if (layoutUnsubscribe) {
    layoutUnsubscribe();
    delete (window as any).usmprLayoutUnsubscribe;
  }

  // Clear crosshairs monitor interval
  const crosshairsMonitor = (window as any).usmprCrosshairsMonitor;
  if (crosshairsMonitor) {
    clearInterval(crosshairsMonitor);
    delete (window as any).usmprCrosshairsMonitor;
    console.log('✅ [USMPR] Crosshairs monitor stopped');
  }

  // Clean up global reference
  delete (window as any).usmprLayoutConfigManager;
}

// Toolbar sections for USMPR mode - extend basic sections with LayoutConfig
export const toolbarSections = {
  ...basicToolbarSections,
  // Override primary section to include LayoutConfig (remove StackScroll and Layout)
  [TOOLBAR_SECTIONS.primary]: [
    'MeasurementTools',
    'Zoom',
    'WindowLevel',
    'Pan',
    'Crosshairs',
    'LayoutConfig',
    'Capture',
    'MoreTools',
  ],
  // Define which buttons appear in the MeasurementTools section
  MeasurementTools: ['Length', 'Bidirectional', 'EllipticalROI', 'CircleROI'],
};

// Layout instance extending basic layout
export const usmprLayout = {
  ...basicLayout,
  id: ohif.layout,
  props: {
    ...basicLayout.props,
    leftPanels: [ohif.thumbnailList],
    rightPanels: [cornerstone.measurements],
    rightPanelClosed: true,
  },
};

export function layoutTemplate() {
  return structuredCloneWithFunctions(usmprLayout);
}

// Route extending basic route
export const usmprRoute = {
  ...basicRoute,
  path: 'usmpr',
  layoutTemplate,
  layoutInstance: usmprLayout,
};

// Combine basic toolbar buttons with USMPR custom buttons
export const toolbarButtons = [...basicToolbarButtons, ...usmprToolbarButtons];

// Mode instance extending basic mode instance
export const modeInstance = {
  ...basicModeInstance,
  id,
  routeName: 'usmpr',
  displayName: 'USMPR - MPR Viewer',
  routes: [usmprRoute],
  extensions: extensionDependencies,
  // Specify the USMPR hanging protocol
  hangingProtocol: '@ohif/hpUSMPR',
  // Use our custom validation to check for CT, MR, US modalities
  isValidMode,
  // Use MPR-specific onModeEnter
  onModeEnter,
  // Use MPR-specific onModeExit for cleanup
  onModeExit,
  // USMPR toolbar configuration
  toolbarButtons,
  toolbarSections,
};

// Mode object extending basic mode
const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

// USMPR Mode - Resizable 2x2 MPR Grid for CT Studies
export default mode;
