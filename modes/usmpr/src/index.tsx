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
import * as cornerstoneCore from '@cornerstonejs/core';
import { eventTarget as coreEventTarget } from '@cornerstonejs/core';
import ResizableGridManager from './utils/ResizableGridManager';
import LayoutConfigManager from './utils/LayoutConfigManager';
import SlicePlaneManager from './utils/SlicePlaneManager';
import SlicePlaneSync from './utils/SlicePlaneSync';
import usmprToolbarButtons from './toolbarButtons';
import { refreshViewportsFromConfig } from '../../../extensions/default/src/hangingprotocols/hpUSMPR';
import { stackSingleViewOptions } from '../../../extensions/cornerstone/src/index';

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

// Validation function - accepts CT, MR, and US studies (volumetric data for MPR)
export function isValidMode({ modalities }) {
  if (!modalities) {
    return { valid: false, description: 'No modalities found' };
  }

  const modalitiesArray = modalities.split('\\');
  const hasCT = modalitiesArray.includes('CT');
  const hasMR = modalitiesArray.includes('MR');
  const hasUS = modalitiesArray.includes('US');
  const isValid = hasCT || hasMR || hasUS;

  let description = 'USMPR not available for this modality';
  if (hasCT) description = 'CT study - MPR available';
  else if (hasMR) description = 'MR study - MPR available';
  else if (hasUS) description = 'US study - MPR available';

  return {
    valid: isValid,
    description: description,
  };
}

// Custom onModeEnter for USMPR - uses basic tool initialization
export function onModeEnter({ servicesManager, extensionManager, commandsManager }) {
  console.log('🚀 [USMPR INIT] onModeEnter started');
  console.log('📦 [USMPR INIT] Checking localStorage for saved config...');
  try {
    const savedConfig = localStorage.getItem('usmpr-layout-config');
    console.log('💾 [USMPR INIT] Saved config:', savedConfig ? JSON.parse(savedConfig) : 'none');
  } catch (e) {
    console.error('❌ [USMPR INIT] Error checking saved config:', e);
  }

  const {
    measurementService,
    toolbarService,
    toolGroupService,
    viewportGridService,
    cornerstoneViewportService,
    hangingProtocolService,
  } = servicesManager.services;

  console.log('🧹 [USMPR INIT] Clearing measurements');
  // Clear measurements
  measurementService.clearMeasurements();

  console.log('🔧 [USMPR INIT] Starting tool group initialization');
  // Destroy any existing tool groups before creating new ones
  // This prevents "ToolGroup already exists" errors when re-entering the mode
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      console.log(`🧹 [USMPR INIT] Cleaning up existing tool group '${toolGroupId}'`);
      toolGroupService.destroyToolGroup(toolGroupId);
    }
  });

  console.log('⚙️ [USMPR INIT] Calling initToolGroups...');
  // Initialize tool groups using basic mode's initToolGroups
  // This properly registers tools with the extensionManager
  try {
    initToolGroups(extensionManager, toolGroupService, commandsManager);
    console.log('✅ [USMPR INIT] initToolGroups completed successfully');
  } catch (e) {
    console.error('❌ [USMPR INIT] initToolGroups failed:', e);
    throw e;
  }

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

  // No need to track frame positions - viewports are NOT recreated when toggling layouts!
  // The viewport instances are reused, so frame positions are preserved automatically

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

    // Get the appropriate tool group based on layout
    // Single viewport uses 'default', MPR uses 'mpr'
    const toolGroupId = isSingleViewport ? 'default' : 'mpr';
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);

    if (!toolGroup && isMPRGrid) {
      // MPR tool group should exist for MPR grid
      console.warn('MPR tool group not found');
      return;
    }

    // Hide/show viewport grid dividing lines
    // Lazy initialize ResizableGridManager when first entering MPR mode
    if (isMPRGrid && !resizableGridManager) {
      console.log('🔧 [USMPR] Lazy initializing ResizableGridManager for MPR mode');
      const container = document.querySelector('[data-cy="viewport-grid"]');
      if (container) {
        resizableGridManager = new ResizableGridManager(viewportGridService);
        resizableGridManager.initialize('[data-cy="viewport-grid"]');
        console.log('✅ [USMPR] ResizableGridManager initialized');
      }
    }

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
      // When switching to single viewport, save crosshairs state from MPR tool group
      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        crosshairsWasActive = activeTool === 'Crosshairs';
        console.log('💾 Saved crosshairs state from MPR:', crosshairsWasActive);
      }

      // Setup STACK viewport synchronization if active viewport is mpr-stack-single
      const activeViewportId = viewportGridService.getState().activeViewportId;
      if (activeViewportId === 'mpr-stack-single') {
        console.log('🔗 [USMPR] Setting up STACK viewport synchronization');
        // Call async function with promise handling
        setupSingleStackViewport(servicesManager, viewportGridService).catch(err => {
          console.error('[USMPR] Failed to setup STACK viewport:', err);
        });
      }

      // Hide 3D reference planes when in single viewport
      if (slicePlaneManager) {
        slicePlaneManager.setVisible(false);
        console.log('🙈 [USMPR] 3D planes hidden (single viewport)');
      }
      if (slicePlaneSync) {
        slicePlaneSync.setEnabled(false);
      }
    } else if (isMPRGrid && toolGroup) {
      // ✨ KEY INSIGHT: When toggling layouts, viewports are NOT destroyed/recreated!
      // The viewportGridService just resizes/repositions existing viewport instances.
      // This means frame positions are AUTOMATICALLY preserved - no sync needed!
      console.log('🔄 Restoring to MPR grid - viewports will keep their frame positions');

      // Teardown STACK viewport synchronization when returning to MPR grid
      console.log('🔓 [USMPR] Tearing down STACK viewport synchronization');
      teardownSingleStackViewport(servicesManager, viewportGridService).catch(err => {
        console.error('[USMPR] Failed to teardown STACK viewport:', err);
      });

      // When switching to MPR grid, activate crosshairs with mouse bindings
      // First, make WindowLevel passive so Crosshairs can use the left mouse button
      const utilityModule = extensionManager.getModuleEntry(
        '@ohif/extension-cornerstone.utilityModule.tools'
      );
      const { Enums } = utilityModule.exports;

      // Deactivate WindowLevel and make it passive to free up the left mouse button
      toolGroup.setToolPassive('WindowLevel');
      console.log('🔧 WindowLevel set to passive (MPR grid)');

      // Now activate Crosshairs with left mouse button binding
      toolGroup.setToolActive('Crosshairs', {
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Primary, // Left mouse button for crosshairs
          },
        ],
      });
      console.log('✅ Crosshairs activated with mouse bindings (MPR grid)');

      // Also ensure StackScrollMouseWheel is active for mouse wheel scrolling
      try {
        toolGroup.setToolActive('StackScrollMouseWheel');
        console.log('✅ StackScrollMouseWheel activated for mouse wheel scrolling');
      } catch (e) {
        console.warn('⚠️ StackScrollMouseWheel not available:', e);
      }

      // Log viewport information for debugging crosshairs colors
      const state = viewportGridService.getState();
      const viewportsArray = Array.isArray(state.viewports)
        ? state.viewports
        : state.viewports instanceof Map
        ? Array.from(state.viewports.values())
        : Object.values(state.viewports || {});

      viewportsArray.forEach((vp, idx) => {
        console.log(`🎨 Viewport ${idx} (${vp.viewportOptions?.viewportId}):`, {
          orientation: vp.viewportOptions?.orientation,
          viewportType: vp.viewportOptions?.viewportType,
          toolGroupId: vp.viewportOptions?.toolGroupId,
        });
      });

      crosshairsWasActive = false; // Reset flag

      // No need to restore position - viewports keep their frame positions automatically!
      console.log('✅ Frame positions preserved automatically (viewports not recreated)');

      // Show 3D reference planes when crosshairs activated
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

  // Initialize 3D reference planes and related components
  // ResizableGridManager is now lazily initialized when first entering MPR mode
  setTimeout(() => {
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

// Memory management: Track which images are loaded at level 0
let loadedLevel0Images = new Set();
const MAX_LEVEL0_IMAGES = 10; // Only keep 10 images at full resolution in memory
let scrollListener = null;

// Helper function to setup single STACK viewport with MPR synchronization
async function setupSingleStackViewport(servicesManager, viewportGridService) {
  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    // STEP 1: Get STACK viewport and save current state
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (stackViewport) {
      const originalImageIds = stackViewport.getImageIds();
      const currentIndex = stackViewport.getCurrentImageIdIndex();

      if (originalImageIds && originalImageIds.length > 0) {
        console.log(`[StackSync] 🔄 Transforming ${originalImageIds.length} imageIds for separate cache...`);

        // STEP 2: Transform imageIds to create SEPARATE cache entries
        // This is the KEY to preserving MPR volumes!
        const stackOnlyImageIds = originalImageIds.map((imageId, idx) => {
          // Add query parameter to create different cache entry
          const separator = imageId.includes('?') ? '&' : '?';
          return `${imageId}${separator}stackView=${idx}`;
        });

        console.log('[StackSync] ✅ ImageIds transformed (volumes preserved)');

        // STEP 3: Set decode level 0 for STACK viewport
        console.log('[StackSync] 🔧 Setting decode level 0 for STACK viewport');
        cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', stackSingleViewOptions);

        // STEP 4: Load viewport with TRANSFORMED imageIds
        // These will load at level 0 in SEPARATE cache entries
        // Original imageIds (used by volumes) remain untouched!
        try {
          await stackViewport.setStack(stackOnlyImageIds, currentIndex);
          stackViewport.render();
          console.log('[StackSync] ✅ Viewport loaded at decode level 0 (separate cache)');
        } catch (err) {
          console.error('[StackSync] ❌ Failed to reload viewport:', err);
          throw err;
        }
      }
    }

    // Make STACK viewport visible and fullscreen
    viewportGridService.setActiveViewportId('mpr-stack-single');

    // Setup ImageSliceSynchronizer for STACK ↔ VOLUME sync
    // This allows scrolling in STACK to update crosshairs in background MPR
    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      console.warn('[StackSync] No rendering engine found');
      return;
    }

    // Add STACK viewport to sync group
    syncGroupService.addViewportToSyncGroup(
      'mpr-stack-single',
      renderingEngine.id,
      {
        type: 'imageslice',
        id: 'stackMprSync',
        source: true,
        target: true,
      }
    );

    // Add all 4 MPR viewports to same sync group
    for (let i = 0; i < 4; i++) {
      syncGroupService.addViewportToSyncGroup(
        `mpr-${i}`,
        renderingEngine.id,
        {
          type: 'imageslice',
          id: 'stackMprSync',
          source: true,
          target: true,
        }
      );
    }

    // Setup on-demand loading with memory management
    setupMemoryManagedLoading(cornerstoneViewportService);

    console.log('[StackSync] ✅ Single STACK viewport synced with MPR viewports');
    console.log('[StackSync] ✅ Decode level 0 active - loading ~10 images at full resolution');
    console.log('[StackSync] 📦 Memory-managed loading enabled (max 10 images at level 0)');
  } catch (error) {
    console.error('[StackSync] ❌ Failed to setup STACK viewport sync:', error);
  }
}

// Helper function to setup memory-managed loading for STACK viewport
function setupMemoryManagedLoading(cornerstoneViewportService) {
  // Clear previous listener if exists
  if (scrollListener) {
    cornerstoneCore.eventTarget.removeEventListener(
      cornerstoneCore.Enums.Events.STACK_VIEWPORT_SCROLL,
      scrollListener
    );
  }

  // Get the STACK viewport
  const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
  if (!stackViewport) {
    console.warn('[StackSync] STACK viewport not found for memory management');
    return;
  }

  const imageIds = stackViewport.getImageIds();
  if (!imageIds || imageIds.length === 0) {
    console.warn('[StackSync] No imageIds found in STACK viewport');
    return;
  }

  const totalImages = imageIds.length;
  const currentIndex = stackViewport.getCurrentImageIdIndex() || Math.floor(totalImages / 2);

  console.log(`[StackSync] 📦 Pre-loading center 10 images (current index: ${currentIndex}, total: ${totalImages})`);

  // Pre-load 10 images around current position (5 before, current, 4 after)
  const loadRange = 5;
  loadedLevel0Images.clear(); // Clear previous set
  for (let offset = -loadRange; offset <= loadRange - 1; offset++) {
    const index = currentIndex + offset;
    if (index >= 0 && index < totalImages) {
      const imageId = imageIds[index];
      loadedLevel0Images.add(imageId);
    }
  }

  console.log(`[StackSync] ✅ Tracking ${loadedLevel0Images.size} images for level 0 loading`);

  // Display actual image dimensions and decode level for verification
  setTimeout(async () => {
    try {
      const currentImageId = imageIds[currentIndex];
      const image = await cornerstoneCore.imageLoader.loadImage(currentImageId);

      if (image) {
        console.log(`[StackSync] 📊 Image Data Verification:`);
        console.log(`  └─ Image ID: ${currentImageId}`);
        console.log(`  └─ Dimensions: ${image.width} × ${image.height} pixels`);
        console.log(`  └─ Columns: ${image.columns}, Rows: ${image.rows}`);

        // Check decode level from metadata
        const metadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get('stack');
        if (metadata?.retrieveOptions?.single) {
          console.log(`  └─ Decode Level Setting: ${metadata.retrieveOptions.single.decodeLevel}`);
        }

        // Determine resolution level based on dimensions
        // Level 0 (full): Original size (e.g., 3460 × 1686)
        // Level 2 (quarter): 1/4 size (e.g., 865 × 421)
        const level2Width = Math.floor(image.width / 4);
        const level2Height = Math.floor(image.height / 4);

        console.log(`  └─ If this is Level 0: ${image.width} × ${image.height} pixels (current)`);
        console.log(`  └─ If this is Level 2: Level 0 would be ${image.width * 4} × ${image.height * 4} pixels`);
        console.log(`  └─ Level 2 equivalent: ${level2Width} × ${level2Height} pixels`);

        // Detect actual resolution level
        // If dimensions are large (>2000px), it's level 0
        // If dimensions are small (<1000px), it's level 2
        if (image.width >= 2000 || image.height >= 1500) {
          console.log(`  └─ ✅ FULL RESOLUTION (Level 0) confirmed! Image is ${image.width}×${image.height}`);
        } else if (image.width < 1000 && image.height < 600) {
          console.log(`  └─ ⚠️ QUARTER RESOLUTION (Level 2) - Image is only ${image.width}×${image.height}`);
        } else {
          console.log(`  └─ ℹ️ Intermediate resolution: ${image.width}×${image.height}`);
        }
      }
    } catch (error) {
      console.warn('[StackSync] Could not verify image dimensions:', error);
    }
  }, 500);

  // Listen for scroll events to load nearby images and clear distant ones
  scrollListener = (evt) => {
    const { viewport, imageIdIndex } = evt.detail;

    // Only handle scroll events for our STACK viewport
    if (viewport.id !== 'mpr-stack-single') {
      return;
    }

    const imageIds = viewport.getImageIds();
    if (!imageIds || imageIds.length === 0) return;

    // Determine which images should be loaded at level 0 (current ± 5)
    const shouldBeLoaded = new Set();
    for (let offset = -5; offset <= 4; offset++) {
      const index = imageIdIndex + offset;
      if (index >= 0 && index < imageIds.length) {
        shouldBeLoaded.add(imageIds[index]);
      }
    }

    // Clear images that are no longer needed (more than 5 slices away)
    const toRemove = [];
    loadedLevel0Images.forEach(imageId => {
      if (!shouldBeLoaded.has(imageId)) {
        toRemove.push(imageId);
        // Remove from cornerstone cache
        try {
          cornerstoneCore.cache.removeImageLoadObject(imageId);
        } catch (e) {
          // Image might not be in cache, that's okay
        }
      }
    });

    // Remove from our tracking set
    toRemove.forEach(imageId => loadedLevel0Images.delete(imageId));

    // Add newly visible images to tracking
    shouldBeLoaded.forEach(imageId => {
      if (!loadedLevel0Images.has(imageId)) {
        loadedLevel0Images.add(imageId);
      }
    });

    if (toRemove.length > 0) {
      console.log(`[StackSync] 🗑️  Cleared ${toRemove.length} distant images from cache (keeping ${loadedLevel0Images.size} near current position)`);
    }
  };

  // Register scroll event listener
  cornerstoneCore.eventTarget.addEventListener(
    cornerstoneCore.Enums.Events.STACK_VIEWPORT_SCROLL,
    scrollListener
  );

  console.log('[StackSync] ✅ Scroll-based memory management active');
}

// Helper function to teardown single STACK viewport synchronization
async function teardownSingleStackViewport(servicesManager, viewportGridService) {
  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      return;
    }

    console.log('[StackSync] 🔧 Tearing down STACK viewport synchronization');

    // STEP 1: Sync MPR viewport positions BEFORE clearing sync groups
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (stackViewport) {
      try {
        const currentIndex = stackViewport.getCurrentImageIdIndex();
        console.log(`[StackSync] 📍 Syncing MPR viewports to slice ${currentIndex} before teardown`);

        // Update axial VOLUME viewport to match STACK viewport position
        const axialViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-0');
        if (axialViewport && currentIndex !== undefined) {
          const axialImageIds = axialViewport.getImageIds();
          if (axialImageIds && currentIndex < axialImageIds.length) {
            // Jump to the same slice index in the VOLUME viewport
            await axialViewport.setImageIdIndex(currentIndex);
            axialViewport.render();
            console.log(`[StackSync] ✅ Axial viewport synced to slice ${currentIndex}`);
          }
        }
      } catch (error) {
        console.warn('[StackSync] ⚠️ Could not sync viewport positions:', error);
      }
    }

    // STEP 2: Restore decode level 2 for stack viewports
    console.log('[StackSync] 🔧 Restoring decode level 2 (quarter resolution)');
    const stackRetrieveOptions = {
      retrieveOptions: {
        single: {
          streaming: true,
          decodeLevel: 2, // Quarter resolution
        },
      },
    };
    cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', stackRetrieveOptions);

    // STEP 3: Clear STACK-specific imageIds from cache (memory cleanup)
    if (stackViewport) {
      const stackImageIds = stackViewport.getImageIds();

      console.log('[StackSync] 🗑️ Clearing STACK-specific imageIds from cache...');

      // Clear all STACK imageIds (these have ?stackView=xxx suffix)
      if (stackImageIds && stackImageIds.length > 0) {
        stackImageIds.forEach(imageId => {
          try {
            cornerstoneCore.cache.removeImageLoadObject(imageId);
          } catch (e) {
            // Ignore if not in cache
          }
        });
      }

      console.log(`[StackSync] ✅ Cleared ${stackImageIds?.length || 0} STACK images (volumes preserved)`);
    }

    // Remove scroll listener for memory management
    if (scrollListener) {
      cornerstoneCore.eventTarget.removeEventListener(
        cornerstoneCore.Enums.Events.STACK_VIEWPORT_SCROLL,
        scrollListener
      );
      scrollListener = null;
      console.log('[StackSync] ✅ Scroll listener removed');
    }

    // Clear loaded images tracking
    loadedLevel0Images.clear();
    console.log('[StackSync] ✅ Cleared level 0 image tracking');

    // Remove STACK viewport from sync group
    syncGroupService.removeViewportFromSyncGroup(
      'mpr-stack-single',
      renderingEngine.id,
      'stackMprSync'
    );

    // Remove MPR viewports from ImageSlice sync
    // (they'll use CrosshairsTool instead)
    for (let i = 0; i < 4; i++) {
      syncGroupService.removeViewportFromSyncGroup(
        `mpr-${i}`,
        renderingEngine.id,
        'stackMprSync'
      );
    }

    console.log('[StackSync] ✅ STACK viewport sync removed');
    console.log('[StackSync] ✅ Decode level 2 restored for future stack viewports');
  } catch (error) {
    console.error('[StackSync] ❌ Failed to teardown STACK viewport sync:', error);
  }
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

  // Cleanup STACK viewport synchronization
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;
  teardownSingleStackViewport(servicesManager, viewportGridService).catch(err => {
    console.error('[USMPR] Failed to teardown STACK viewport on mode exit:', err);
  });

  // Disable the STACK viewport
  const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
  if (stackViewport) {
    stackViewport.disable();
    console.log('✅ [USMPR] STACK viewport disabled');
  }

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

  // Protocol changed subscription removed (no longer needed)

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
  // Add customizations for double-click to toggle between single viewport and MPR
  customizationService: {
    cornerstoneViewportClickCommands: {
      doubleClick: ['toggleOneUp'],
    },
  },
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
