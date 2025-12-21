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

// Track viewport positions separately for STACK and VOLUME viewports
// Each viewport (axial STACK, sagittal VOLUME, coronal VOLUME) has its own saved position
const savedViewportPositions: {
  [viewportId: string]: {
    index?: number;              // For STACK viewports (mpr-stack-single)
    imageIds?: string[];         // Original imageIds for STACK
    worldPosition?: number[];    // For VOLUME viewports (mpr-1, mpr-2)
    viewportType?: string;       // 'stack' or 'orthographic'
  };
} = {};

// Legacy variables for backward compatibility (mainly used for STACK viewport)
let lastStackViewportIndex: number | null = null;
let lastStackOriginalImageIds: string[] | null = null;

// Extension dependencies - same as basic mode
export const extensionDependencies = {
  ...basicDependencies,
};

// Helper function to get layout configuration from localStorage
function getLayoutConfig() {
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'US 3D 1',
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

/**
 * Apply custom US volume rendering preset to the 3D viewport
 * This function can be called after layout changes or preset changes
 */
async function applyCustomUSPreset(cornerstoneViewportService, presetName = 'US 3D 1') {
  try {
    console.log(`🎨 [US VR] applyCustomUSPreset called with preset: ${presetName}`);

    // Import US preset utilities dynamically
    const { createUsSkinPresetA, createUsSkinPresetB, createUsSkinPresetC, createUsSkinPresetD, applyVolumeRenderingPreset } = await import('./utils/usVolumePresets');
    const { applyGpuRayCastQuality } = await import('./utils/usVolumeQuality');

    // Get current layout to find 3D viewport position
    const layoutConfig = getLayoutConfig();
    const position3D = layoutConfig?.positions?.indexOf('3D');

    if (position3D === -1 || position3D === undefined) {
      console.log('ℹ️ [US VR] No 3D viewport in current layout, skipping preset application');
      return;
    }

    // Get the 3D viewport
    const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
    if (!viewport3D) {
      console.warn(`⚠️ [US VR] 3D viewport not found at position ${position3D}`);
      return;
    }

    // Map preset name to factory function
    const presetMap = {
      'US 3D 1': createUsSkinPresetA,
      'US 3D 2': createUsSkinPresetB,
      'US 3D 3': createUsSkinPresetC,
      'US 3D 4': createUsSkinPresetD,
    };

    const presetFactory = presetMap[presetName] || createUsSkinPresetA;
    const preset = presetFactory();
    console.log(`🎨 [US VR] Applying preset: ${preset.name}`);

    // Get volume actor and image data
    const actors = viewport3D.getActors();
    if (!actors || actors.length === 0) {
      console.warn('⚠️ [US VR] No actors found in 3D viewport');
      return;
    }

    const volumeActor = actors[0].actor;
    const imageData = viewport3D.getImageData();

    // Apply custom transfer functions
    applyVolumeRenderingPreset({ volumeActor, preset });
    console.log('✅ [US VR] Custom transfer functions applied');

    // Get mapper and apply quality settings
    const mapper = volumeActor.getMapper();
    if (mapper && imageData) {
      applyGpuRayCastQuality({ volumeMapper: mapper, imageData });
      console.log('✅ [US VR] Quality settings applied');
    }

    // Trigger re-render
    viewport3D.render();
    console.log('✅ [US VR] Viewport re-rendered with custom US preset');
  } catch (error) {
    console.error('❌ [US VR] Failed to apply custom US preset:', error);
    console.error('❌ [US VR] Error stack:', error?.stack);
  }
}

// Make the function globally accessible for layout config manager
(window as any).applyCustomUSPreset = applyCustomUSPreset;

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

  // Crosshairs monitor state - declared here so layoutChangeHandler can access it
  let lastCrosshairsState = false;
  console.log('🎬 [USMPR] Initialized lastCrosshairsState =', lastCrosshairsState);

  // NOTE: lastStackViewportIndex and lastStackOriginalImageIds are defined as module-level
  // variables at the top of this file (lines 40-42). Do NOT redeclare them here!

  const layoutChangeHandler = evt => {
    console.log('🚨 [LAYOUT] ===== LAYOUT CHANGE EVENT RECEIVED =====');
    console.log('🚨 [LAYOUT] Event data:', evt);

    // LAYOUT_CHANGED events have numCols/numRows at top level
    const { numCols, numRows } = evt;
    console.log('🚨 [LAYOUT] numRows:', numRows, 'numCols:', numCols);

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

    console.log('🚨 [LAYOUT] isSingleViewport:', isSingleViewport);
    console.log('🚨 [LAYOUT] isMPRGrid:', isMPRGrid);
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
    // Fallback: Initialize ResizableGridManager if not already initialized (should be initialized on mode enter)
    if (isMPRGrid && !resizableGridManager) {
      console.log('🔧 [USMPR] Fallback: Initializing ResizableGridManager for MPR mode');
      const container = document.querySelector('[data-cy="viewport-grid"]');
      if (container) {
        resizableGridManager = new ResizableGridManager(viewportGridService);
        resizableGridManager.initialize('[data-cy="viewport-grid"]');
        resizableGridManager.show();
        console.log('✅ [USMPR] ResizableGridManager initialized (fallback)');
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
      console.log('🎯 [LAYOUT] ===== ENTERING 1-PORT MODE =====');
      console.log('🎯 [LAYOUT] lastCrosshairsState BEFORE reset:', lastCrosshairsState);

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

      // Don't hide planes here - let the monitor handle it based on crosshair state
      // The monitor will detect if crosshairs are deactivated and hide planes automatically

      // Reset crosshairs state so monitor will detect change when returning to 4-port
      lastCrosshairsState = false;
      console.log('🔄 [USMPR] Reset lastCrosshairsState to false (single viewport)');
      console.log('🔄 [USMPR] Monitor will handle plane visibility based on crosshair state');
      console.log('🎯 [LAYOUT] lastCrosshairsState AFTER reset:', lastCrosshairsState);
      console.log('🎯 [LAYOUT] ===== 1-PORT MODE SETUP COMPLETE =====');
    } else if (isMPRGrid && toolGroup) {
      // ✨ KEY INSIGHT: When toggling layouts, viewports are NOT destroyed/recreated!
      // The viewportGridService just resizes/repositions existing viewport instances.
      console.log('🔄 Restoring to MPR grid - volume viewports maintain their position');

      // CRITICAL: Read viewport position from toggleOneUp command
      // Works for axial (STACK), sagittal, and coronal (VOLUME) viewports
      console.log('💾 [LAYOUT] Reading saved viewport position from toggleOneUp...');

      // Track whether we're returning from a VOLUME viewport
      // This will prevent STACK sync code from overriding VOLUME position
      let returningFromVolumeViewport = false;

      try {
        const savedPosition = (window as any)._ohifViewportExitPosition;

        if (savedPosition) {
          const viewportId = savedPosition.viewportId;

          // Save position into our tracking object
          if (savedPosition.worldPosition) {
            // VOLUME viewport: Store world coordinates and jump to position
            console.log(`🔍 [LAYOUT] ===== VOLUME VIEWPORT RESTORE =====`);
            console.log(`🔍 [LAYOUT] ViewportId: ${viewportId}`);
            console.log(`🔍 [LAYOUT] ViewportType: ${savedPosition.viewportType}`);
            console.log(`🔍 [LAYOUT] WorldPosition:`, savedPosition.worldPosition);

            savedViewportPositions[viewportId] = {
              worldPosition: savedPosition.worldPosition,
              viewportType: savedPosition.viewportType
            };
            console.log(`✅ [LAYOUT] Saved ${viewportId} (VOLUME) world position:`, savedPosition.worldPosition);

            // Set flag to skip STACK sync logic below
            returningFromVolumeViewport = true;

            // CRITICAL: Clear legacy STACK variables so STACK sync doesn't run
            lastStackViewportIndex = null;
            lastStackOriginalImageIds = null;
            console.log(`🚫 [LAYOUT] Cleared STACK variables - we're returning from VOLUME viewport`);

            // Jump to the saved world position immediately
            // CRITICAL: Jump ALL THREE viewports, not just axial!
            // Each viewport only respects its own slice direction, so we need to jump all of them
            setTimeout(() => {
              try {
                console.log(`🔍 [LAYOUT] Attempting to jump ALL viewports to world position...`);
                const worldPos = savedPosition.worldPosition;

                // Get all three MPR viewports
                const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2'];  // axial, sagittal, coronal
                const viewportNames = ['Axial', 'Sagittal', 'Coronal'];

                for (let i = 0; i < viewportIds.length; i++) {
                  const vpId = viewportIds[i];
                  const vpName = viewportNames[i];
                  const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);

                  if (viewport && viewport.jumpToWorld) {
                    console.log(`🔍 [LAYOUT] Jumping ${vpName} (${vpId}) to:`, worldPos);
                    viewport.jumpToWorld(worldPos);
                    console.log(`[LAYOUT] ✅ ${vpName} jumped successfully`);
                  } else {
                    console.warn(`[LAYOUT] ⚠️ ${vpName} (${vpId}) not available or no jumpToWorld`);
                  }
                }

                console.log(`[LAYOUT] ✅ All MPR viewports jumped to VOLUME world position:`, worldPos);
                console.log(`[LAYOUT] ✅ CrosshairsTool should keep them synchronized`);

                // Verify positions after 500ms
                setTimeout(() => {
                  console.log(`🔍 [LAYOUT] Verifying positions 500ms later...`);
                  for (let i = 0; i < viewportIds.length; i++) {
                    const vpId = viewportIds[i];
                    const vpName = viewportNames[i];
                    const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
                    if (viewport && viewport.getCamera) {
                      const camera = viewport.getCamera();
                      console.log(`🔍 [LAYOUT] ${vpName} camera focal point:`, camera?.focalPoint);
                    }
                  }
                }, 500);
              } catch (error) {
                console.error('[LAYOUT] ❌ Error jumping to world position:', error);
                console.error('[LAYOUT] ❌ Error stack:', error.stack);
              }
            }, 200);

          } else if (savedPosition.index !== undefined) {
            // STACK viewport: Store index and imageIds
            savedViewportPositions[viewportId] = {
              index: savedPosition.index,
              imageIds: savedPosition.imageIds,
              viewportType: savedPosition.viewportType
            };

            // Also update legacy variables for STACK sync to use
            lastStackViewportIndex = savedPosition.index;
            lastStackOriginalImageIds = savedPosition.imageIds;

            console.log(`✅ [LAYOUT] Saved ${viewportId} (STACK) position: slice ${savedPosition.index} of ${savedPosition.imageIds?.length}`);

          } else {
            console.warn('⚠️ [LAYOUT] Saved position has neither worldPosition nor index');
          }

          // Clear the window global
          delete (window as any)._ohifViewportExitPosition;
        } else {
          console.warn('⚠️ [LAYOUT] No saved viewport position found');
        }
      } catch (error) {
        console.error('❌ [LAYOUT] Error reading saved position:', error);
      }

      // STEP 1: Teardown STACK viewport synchronization when returning to MPR grid
      console.log('🔓 [USMPR] Tearing down STACK viewport synchronization');
      teardownSingleStackViewport(servicesManager, viewportGridService).catch(err => {
        console.error('[USMPR] Failed to teardown STACK viewport:', err);
      });

      // STEP 2: When switching to MPR grid, activate crosshairs with mouse bindings
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

      // ============== WORLD COORDINATE SYNC START ==============
      console.log('🚀 [DEBUG] ===== RETURNING TO 4-PORT: SYNC CHECK =====');
      console.log('🚀 [DEBUG] savedViewportPositions:', JSON.stringify(savedViewportPositions, null, 2));
      console.log('🚀 [DEBUG] lastStackViewportIndex:', lastStackViewportIndex);
      console.log('🚀 [DEBUG] lastStackOriginalImageIds:', lastStackOriginalImageIds?.length);
      console.log('🚀 [DEBUG] returningFromVolumeViewport:', returningFromVolumeViewport);

      // Sync ALL MPR viewports to saved viewport position via world coordinates
      // User wants: 1-port slice 200 → 4-port all viewports at slice 200
      // Architecture: Saved position → ImagePositionPatient → jumpToWorld() → CrosshairsTool → all MPR viewports sync
      if (lastStackViewportIndex !== null && lastStackOriginalImageIds !== null) {
        console.log(`[USMPR] 🌍 EXECUTING STACK sync to world position: slice ${lastStackViewportIndex}`);
        console.log(`[USMPR] Total original imageIds:`, lastStackOriginalImageIds?.length);

        setTimeout(() => {
          try {
            // Validate the index is within bounds
            if (lastStackViewportIndex < 0 || lastStackViewportIndex >= lastStackOriginalImageIds.length) {
              console.warn(`[USMPR] ⚠️ Index out of bounds: ${lastStackViewportIndex} (array length: ${lastStackOriginalImageIds.length})`);
              return;
            }

            // Get the original imageId (without ?stackView suffix) at the STACK position
            const originalImageId = lastStackOriginalImageIds[lastStackViewportIndex];
            console.log(`[USMPR] Looking up imageId at index ${lastStackViewportIndex}:`, originalImageId);

            if (!originalImageId) {
              console.warn(`[USMPR] ⚠️ No imageId found at index ${lastStackViewportIndex}`);
              console.warn(`[USMPR] lastStackOriginalImageIds:`, lastStackOriginalImageIds);
              return;
            }

            // Get ImagePositionPatient (world coordinates) from DICOM metadata
            const imagePlaneModule = cornerstoneCore.metaData.get('imagePlaneModule', originalImageId);
            console.log('[USMPR] imagePlaneModule:', imagePlaneModule);

            if (!imagePlaneModule || !imagePlaneModule.imagePositionPatient) {
              console.warn('[USMPR] ⚠️ No imagePlaneModule or imagePositionPatient found');
              console.warn('[USMPR] Available metadata keys:', Object.keys(imagePlaneModule || {}));
              return;
            }

            const worldPosition = imagePlaneModule.imagePositionPatient;
            console.log(`[USMPR] 📍 World position from IPP [x, y, z]:`, worldPosition);

            // Jump to world position using axial viewport
            // CrosshairsTool automatically propagates to sagittal/coronal
            const axialViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-0');
            console.log('[USMPR] Axial viewport:', axialViewport?.id, 'type:', axialViewport?.type);
            console.log('[USMPR] jumpToWorld method available:', typeof axialViewport?.jumpToWorld);

            if (axialViewport && axialViewport.jumpToWorld) {
              axialViewport.jumpToWorld(worldPosition);
              console.log(`[USMPR] ✅ jumpToWorld called with:`, worldPosition);
              console.log(`[USMPR] ✅ All MPR viewports should sync via CrosshairsTool`);
            } else {
              console.warn('[USMPR] ⚠️ Axial viewport or jumpToWorld not available');
              console.warn('[USMPR] Viewport object:', axialViewport);
            }
          } catch (error) {
            console.error('[USMPR] ❌ Error syncing to world position:', error);
            console.error('[USMPR] Error stack:', error.stack);
          }
        }, 200);
      } else {
        console.log('[USMPR] ✅ SKIPPING STACK sync - not returning from STACK viewport');
        console.log('[USMPR]   lastStackViewportIndex:', lastStackViewportIndex);
        console.log('[USMPR]   lastStackOriginalImageIds:', lastStackOriginalImageIds?.length, 'imageIds');
      }

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

      // CRITICAL DEBUG: Check current crosshairs state and manager status
      console.log('🔍 [USMPR] ===== RETURNING TO 4-PORT DEBUG =====');
      console.log('🔍 [USMPR] slicePlaneManager exists:', !!slicePlaneManager);
      console.log('🔍 [USMPR] slicePlaneSync exists:', !!slicePlaneSync);
      console.log('🔍 [USMPR] lastCrosshairsState:', lastCrosshairsState);

      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        const isCrosshairsActive = activeTool === 'Crosshairs';
        console.log('🔍 [USMPR] Current active tool:', activeTool);
        console.log('🔍 [USMPR] Crosshairs currently active:', isCrosshairsActive);

        // Force state reset to ensure monitor detects change
        lastCrosshairsState = false;
        console.log('🔍 [USMPR] Reset lastCrosshairsState to false');
        console.log('🔍 [USMPR] Monitor should detect change on next tick (100ms)');
      } else {
        console.warn('⚠️ [USMPR] MPR tool group not found!');
      }

      // CRITICAL: Re-initialize slice planes when returning to 4-port
      console.log('🔄 [SLICE PLANES] ===== Re-initializing slice planes for 4-port =====');
      const layoutConfig = getLayoutConfig();
      const position3D = layoutConfig?.positions?.indexOf('3D');
      console.log('🔄 [SLICE PLANES] 3D viewport position:', position3D);

      if (position3D !== -1 && position3D !== undefined) {
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
        console.log('🔄 [SLICE PLANES] 3D viewport exists:', !!viewport3D);

        if (viewport3D) {
          // Destroy old slice plane manager if it exists
          if (slicePlaneManager) {
            console.log('🔄 [SLICE PLANES] Destroying old slicePlaneManager...');
            try {
              slicePlaneManager.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old manager:', e);
            }
          }

          // Destroy old slice plane sync if it exists
          if (slicePlaneSync) {
            console.log('🔄 [SLICE PLANES] Destroying old slicePlaneSync...');
            try {
              slicePlaneSync.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old sync:', e);
            }
          }

          // Re-initialize slice plane manager
          console.log('🔄 [SLICE PLANES] Creating new SlicePlaneManager...');
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          slicePlaneManager.setVisible(true); // Always visible
          console.log('✅ [SLICE PLANES] SlicePlaneManager re-initialized');

          // Map viewport positions to orientations
          const viewportInfos = [];
          layoutConfig.positions.forEach((viewType, index) => {
            if (viewType !== '3D') {
              viewportInfos.push({
                viewportId: `mpr-${index}`,
                orientation: viewType.toLowerCase(),
              });
            }
          });

          // Re-initialize slice plane sync
          console.log('🔄 [SLICE PLANES] Creating new SlicePlaneSync...');
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(true); // Always enabled
          console.log('✅ [SLICE PLANES] SlicePlaneSync re-initialized');

          console.log('✅ [SLICE PLANES] Slice planes restored successfully!');

          // Re-apply custom US preset after returning to 4-port
          setTimeout(() => {
            const currentLayoutConfig = getLayoutConfig();
            const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
            console.log(`🎨 [US VR] Re-applying custom US preset after 4-port restore: ${currentPresetName}`);
            applyCustomUSPreset(cornerstoneViewportService, currentPresetName);
          }, 100); // Apply quickly to minimize flash of old preset
        } else {
          console.error('❌ [SLICE PLANES] 3D viewport not found!');
        }
      } else {
        console.warn('⚠️ [SLICE PLANES] No 3D position in layout');
      }
      console.log('🔄 [SLICE PLANES] ===== End slice plane re-initialization =====');

      console.log('🔍 [USMPR] ===== END DEBUG =====');
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

  // Monitor Crosshairs activation state - DISABLED because slice planes are now always visible
  // Slice planes are always visible when 3D viewport exists, regardless of crosshair state
  let monitorCount = 0;
  let verboseLoggingUntil = 0; // Timestamp for verbose logging
  console.log('🎬 [USMPR] Crosshairs monitor DISABLED - slice planes are always visible');

  const crosshairsMonitor = setInterval(() => {
    // DISABLED - planes are always visible now, no need to monitor crosshairs
    return;
    const toolGroup = toolGroupService.getToolGroup('mpr');
    if (!toolGroup) {
      if (monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil) {
        console.log('⚠️ [USMPR] Crosshairs monitor: tool group not found');
      }
      monitorCount++;
      return;
    }

    const activeTool = toolGroup.getActivePrimaryMouseButtonTool();
    const isCrosshairsActive = activeTool === 'Crosshairs';

    // Log periodically OR during verbose period
    const shouldLog = monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil;
    if (shouldLog) {
      console.log(`🔍 [MONITOR] Check #${monitorCount}: activeTool="${activeTool}", isCrosshairsActive=${isCrosshairsActive}, lastState=${lastCrosshairsState}, slicePlaneManager=${!!slicePlaneManager}, slicePlaneSync=${!!slicePlaneSync}`);
    }
    monitorCount++;

    // Only update if state changed
    if (isCrosshairsActive !== lastCrosshairsState) {
      console.log(`🔄 [MONITOR] ===== STATE CHANGE DETECTED =====`);
      console.log(`🔄 [MONITOR] lastCrosshairsState: ${lastCrosshairsState} -> isCrosshairsActive: ${isCrosshairsActive}`);

      // Enable verbose logging for next 3 seconds
      verboseLoggingUntil = Date.now() + 3000;

      lastCrosshairsState = isCrosshairsActive;

      if (isCrosshairsActive) {
        console.log('👁️ [MONITOR] Crosshairs ACTIVATED - attempting to show 3D planes');
        console.log('👁️ [MONITOR] slicePlaneManager exists:', !!slicePlaneManager);
        console.log('👁️ [MONITOR] slicePlaneSync exists:', !!slicePlaneSync);

        if (slicePlaneManager) {
          console.log('👁️ [MONITOR] Calling slicePlaneManager.setVisible(true)...');
          slicePlaneManager.setVisible(true);
          console.log('👁️ [MONITOR] ✅ setVisible(true) called');
        } else {
          console.error('❌ [MONITOR] slicePlaneManager is NULL - cannot show planes!');
        }

        if (slicePlaneSync) {
          console.log('👁️ [MONITOR] Calling slicePlaneSync.setEnabled(true) and updateAllPlanes()...');
          slicePlaneSync.setEnabled(true);
          slicePlaneSync.updateAllPlanes();
          console.log('👁️ [MONITOR] ✅ Sync enabled and planes updated');
        } else {
          console.error('❌ [MONITOR] slicePlaneSync is NULL - cannot enable sync!');
        }
      } else {
        console.log('🙈 [MONITOR] Crosshairs DEACTIVATED - hiding 3D planes');
        if (slicePlaneManager) {
          slicePlaneManager.setVisible(false);
        }
        if (slicePlaneSync) {
          slicePlaneSync.setEnabled(false);
        }
      }
      console.log(`🔄 [MONITOR] ===== END STATE CHANGE =====`);
    }
  }, 100); // Check every 100ms (DISABLED)

  console.log('ℹ️ [USMPR] Crosshairs monitor running but DISABLED - slice planes always visible');

  // Store interval for cleanup
  (window as any).usmprCrosshairsMonitor = crosshairsMonitor;

  // Initialize ResizableGridManager immediately on mode enter (not lazy)
  console.log('🔧 [USMPR] Initializing ResizableGridManager immediately...');
  setTimeout(() => {
    const container = document.querySelector('[data-cy="viewport-grid"]');
    if (container && !resizableGridManager) {
      resizableGridManager = new ResizableGridManager(viewportGridService);
      resizableGridManager.initialize('[data-cy="viewport-grid"]');
      resizableGridManager.show(); // Show immediately for 4-port view
      console.log('✅ [USMPR] ResizableGridManager initialized and shown');
    } else if (!container) {
      console.warn('⚠️ [USMPR] Viewport grid container not found yet');
    }
  }, 100); // Short delay to ensure DOM is ready

  // Initialize 3D reference planes and related components
  console.log('🎬 [USMPR] Scheduling 3D slice plane initialization...');
  setTimeout(() => {
    // Initialize 3D reference planes
    console.log('🔧 [USMPR] ===== STARTING 3D SLICE PLANE INITIALIZATION =====');
    try {
      console.log('🔧 [USMPR] Getting layout config...');
      const layoutConfig = getLayoutConfig();
      console.log('🔧 [USMPR] Layout config:', layoutConfig);
      console.log('🔧 [USMPR] Layout positions:', layoutConfig?.positions);

      const position3D = layoutConfig?.positions?.indexOf('3D');
      console.log('🔧 [USMPR] 3D viewport position index:', position3D);

      if (position3D !== -1 && position3D !== undefined) {
        console.log(`📍 [USMPR] Found 3D viewport at position ${position3D}`);
        console.log(`📍 [USMPR] Looking for viewport with ID: mpr-${position3D}`);

        // Get the 3D viewport
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
        console.log('📍 [USMPR] Viewport3D retrieved:', !!viewport3D);

        if (viewport3D) {
          console.log('📍 [USMPR] Viewport3D type:', viewport3D.type);
          console.log('✅ [USMPR] 3D viewport retrieved successfully');

          // Initialize slice plane manager
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          slicePlaneManager.setVisible(true); // ✅ ALWAYS VISIBLE - showing slice planes by default
          console.log('✅ [USMPR] Slice planes set to ALWAYS VISIBLE');

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
          slicePlaneSync.setEnabled(true); // ✅ ALWAYS ENABLED - syncing slice planes automatically
          console.log('✅ [USMPR] Slice plane sync set to ALWAYS ENABLED');

          console.log('✅ [USMPR] 3D reference planes initialized successfully');

          // Apply custom US volume rendering preset
          setTimeout(() => {
            const currentLayoutConfig = getLayoutConfig();
            const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
            applyCustomUSPreset(cornerstoneViewportService, currentPresetName);
          }, 100); // Apply quickly to minimize flash of old preset
        } else {
          console.warn('⚠️ [USMPR] 3D viewport not found at position', position3D);
          console.warn('⚠️ [USMPR] Viewport ID attempted: mpr-' + position3D);
        }
      } else {
        console.warn('ℹ️ [USMPR] No 3D viewport in current layout configuration');
        console.warn('ℹ️ [USMPR] position3D value:', position3D);
        console.warn('ℹ️ [USMPR] layoutConfig.positions:', layoutConfig?.positions);
      }
    } catch (error) {
      console.error('❌ [USMPR] Failed to initialize 3D reference planes:', error);
      console.error('❌ [USMPR] Error stack:', error?.stack);
    }
    console.log('🏁 [USMPR] 3D slice plane initialization completed (check messages above for result)');
  }, 200); // Reduced delay to minimize flash of old CT preset

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

      // Initialize tracking of STACK position for syncing when returning to 4-port
      // CRITICAL: Check if we have a saved position for THIS specific viewport
      const viewportId = 'mpr-stack-single';
      const savedPos = savedViewportPositions[viewportId];
      const hasSavedPosition = savedPos && savedPos.index !== null && savedPos.index !== undefined;

      if (!hasSavedPosition) {
        // First time entering 1-port: Use current position (which will be "middle" from preset)
        savedViewportPositions[viewportId] = {
          index: currentIndex,
          imageIds: originalImageIds,
          viewportType: 'stack'
        };

        // Update legacy variables for backward compatibility
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = originalImageIds;

        console.log(`[StackSync] 📍 Initial STACK position (first time): slice ${currentIndex}`);
      } else {
        // We have a saved position for this viewport - jump to it!
        const targetIndex = savedPos.index!;
        console.log(`[StackSync] 📍 Found saved STACK position: slice ${targetIndex} (current viewport is at: ${currentIndex})`);

        // Update imageIds if we don't have them
        if (!savedPos.imageIds || savedPos.imageIds.length === 0) {
          savedViewportPositions[viewportId].imageIds = originalImageIds;
          console.log(`[StackSync] 📍 Updated imageIds (${originalImageIds?.length} items)`);
        }

        // Update legacy variables
        lastStackViewportIndex = targetIndex;
        lastStackOriginalImageIds = savedPos.imageIds || originalImageIds;

        // Jump the STACK viewport to the saved position
        try {
          if (targetIndex !== currentIndex) {
            stackViewport.setImageIdIndex(targetIndex);
            console.log(`[StackSync] ✅ Jumped STACK viewport from slice ${currentIndex} to saved slice ${targetIndex}`);
          } else {
            console.log(`[StackSync] ℹ️ Already at saved position (${targetIndex})`);
          }
        } catch (error) {
          console.error(`[StackSync] ❌ Failed to jump to saved position ${targetIndex}:`, error);
        }
      }

      if (originalImageIds && originalImageIds.length > 0) {
        // STEP 2: Set decode level 0 FIRST (before transforming imageIds)
        console.log('[StackSync] 🔧 Setting decode level 0 for STACK viewport');
        console.log('[StackSync] stackSingleViewOptions:', stackSingleViewOptions);

        // Define level 0 options inline to ensure correct structure
        const level0Options = {
          retrieveOptions: {
            single: {
              streaming: true,
              decodeLevel: 0,  // Full resolution for STACK viewport
            },
          },
        };

        console.log('[StackSync] level0Options:', level0Options);
        cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', level0Options);

        // Verify metadata provider was set
        const verifyMetadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get('stack');
        console.log('[StackSync] 📋 Full metadata provider response:', verifyMetadata);
        console.log('[StackSync] 📋 Decode level:', verifyMetadata?.retrieveOptions?.single?.decodeLevel);

        console.log(`[StackSync] 🔄 Transforming ${originalImageIds.length} imageIds for separate cache...`);

        // STEP 3: Transform imageIds to create SEPARATE cache entries
        // This is the KEY to preserving MPR volumes!
        const stackOnlyImageIds = originalImageIds.map((imageId, idx) => {
          // Add query parameter to create different cache entry
          const separator = imageId.includes('?') ? '&' : '?';
          return `${imageId}${separator}stackView=${idx}`;
        });

        console.log('[StackSync] ✅ ImageIds transformed (volumes preserved)');
        console.log('[StackSync] Sample transformed imageId:', stackOnlyImageIds[currentIndex]);

        // STEP 4: Load viewport with TRANSFORMED imageIds
        // These will load at level 0 in SEPARATE cache entries
        // Original imageIds (used by volumes) remain untouched!
        try {
          await stackViewport.setStack(stackOnlyImageIds, currentIndex);
          stackViewport.render();
          console.log('[StackSync] ✅ Viewport setStack completed');

          // Verify what was actually loaded
          const loadedImageIds = stackViewport.getImageIds();
          const loadedIndex = stackViewport.getCurrentImageIdIndex();
          console.log('[StackSync] Viewport now has:', loadedImageIds?.length, 'imageIds');
          console.log('[StackSync] Current index:', loadedIndex);
          console.log('[StackSync] Current imageId:', loadedImageIds?.[loadedIndex]);
        } catch (err) {
          console.error('[StackSync] ❌ Failed to reload viewport:', err);
          throw err;
        }
      }
    }

    // Make STACK viewport visible and fullscreen
    viewportGridService.setActiveViewportId('mpr-stack-single');

    // Activate StackScrollMouseWheel tool on the 'default' tool group for the STACK viewport
    const { toolGroupService } = servicesManager.services;
    const defaultToolGroup = toolGroupService.getToolGroup('default');

    if (defaultToolGroup) {
      try {
        defaultToolGroup.setToolActive('StackScrollMouseWheel');
        console.log('[StackSync] ✅ StackScrollMouseWheel activated on STACK viewport');
      } catch (e) {
        console.warn('[StackSync] ⚠️ Failed to activate StackScrollMouseWheel:', e);
      }
    } else {
      console.warn('[StackSync] ⚠️ default tool group not found');
    }

    // Setup ImageSliceSynchronizer for STACK ↔ VOLUME sync
    // This allows scrolling in STACK to update crosshairs in background MPR
    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      console.warn('[StackSync] No rendering engine found');
      return;
    }

    // NOTE: We do NOT add MPR volume viewports to the imageslice sync group
    // because imageslice synchronizers work with STACK viewports (image indices),
    // while VOLUME viewports use world coordinates. Mixing them causes volume viewports
    // to jump around or reload incorrectly.
    //
    // MPR viewports already use CrosshairsTool for synchronization in the background.

    console.log('[StackSync] ℹ️ MPR volume viewports will NOT be synced to STACK viewport');
    console.log('[StackSync] ℹ️ They maintain their position via CrosshairsTool');

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

  // Listen for IMAGE_RENDERED events (fires for all viewport types)
  // This is more reliable than STACK_VIEWPORT_SCROLL which doesn't seem to fire
  let renderCount = 0;
  scrollListener = (evt) => {
    // Wrap entire handler in try-catch to prevent uncaught errors
    try {
      renderCount++;

      // Debug: Log first 5 events to see what data we're getting
      if (renderCount <= 5) {
        console.log(`🔍 [IMAGE-RENDERED #${renderCount}] viewportId:`, evt.detail?.viewportId);
        console.log(`🔍 [IMAGE-RENDERED #${renderCount}] viewport?.id:`, evt.detail?.viewport?.id);
      }

      const viewportId = evt.detail?.viewportId || evt.detail?.viewport?.id;

      // Handle events for all three single viewports (STACK and VOLUME)
      // mpr-stack-single (axial STACK), mpr-1 (sagittal VOLUME), mpr-2 (coronal VOLUME)
      // CRITICAL: VOLUME viewports keep their original IDs in 1-port mode!
      const validViewportIds = ['mpr-stack-single', 'mpr-1', 'mpr-2'];
      if (!validViewportIds.includes(viewportId)) {
        return;
      }

      console.log(`🎯 [IMAGE-RENDERED] Event received for ${viewportId}`);

      // Get the viewport and current index
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        console.warn(`[StackSync] ⚠️ Viewport ${viewportId} not found in scroll listener`);
        return;
      }

      const viewportType = viewport.type;
      console.log(`[StackSync] 📋 Viewport type: ${viewportType}`);

      let imageIdIndex = null;
      let imageIds = null;

      // Handle STACK vs VOLUME viewports differently
      if (viewportType === 'stack') {
        // STACK viewport: Use standard methods
        imageIds = viewport.getImageIds();
        if (!imageIds || imageIds.length === 0) {
          console.warn(`[StackSync] ⚠️ No imageIds found in STACK viewport ${viewportId}`);
          return;
        }
        imageIdIndex = viewport.getCurrentImageIdIndex();
      } else if (viewportType === 'orthographic' || viewportType === 'volume') {
        // VOLUME viewport: Check if it has the same methods
        if (typeof viewport.getCurrentImageIdIndex === 'function') {
          imageIdIndex = viewport.getCurrentImageIdIndex();
          imageIds = viewport.getImageIds();
        } else {
          console.warn(`[StackSync] ⚠️ VOLUME viewport ${viewportId} doesn't support getCurrentImageIdIndex`);
          return;
        }
      } else {
        console.warn(`[StackSync] ⚠️ Unknown viewport type: ${viewportType}`);
        return;
      }

      // Validate the index is within bounds
      if (imageIdIndex === null || imageIdIndex === undefined || imageIdIndex < 0) {
        console.warn(`[StackSync] ⚠️ Invalid imageIdIndex: ${imageIdIndex}`);
        return;
      }

      if (imageIds && imageIdIndex >= imageIds.length) {
        console.warn(`[StackSync] ⚠️ imageIdIndex out of bounds: ${imageIdIndex} (length: ${imageIds.length})`);
        return;
      }

      // Track current viewport position for syncing when returning to 4-port
      // Update both legacy variable and new tracking object
      if (viewportType === 'stack') {
        // For STACK viewports, save index and imageIds
        const originalImageIds = imageIds.map(id => id.split('?stackView=')[0]);
        savedViewportPositions[viewportId] = {
          index: imageIdIndex,
          imageIds: originalImageIds,
          viewportType: 'stack'
        };
        lastStackViewportIndex = imageIdIndex;
        lastStackOriginalImageIds = originalImageIds;
        console.log(`🔄 [SCROLL] Updated STACK position for ${viewportId}: slice ${imageIdIndex}`);
      } else {
        // For VOLUME viewports, save world position
        try {
          const camera = viewport.getCamera();
          if (camera && camera.focalPoint) {
            savedViewportPositions[viewportId] = {
              worldPosition: camera.focalPoint,
              viewportType: viewportType
            };
            console.log(`🔄 [SCROLL] Updated VOLUME position for ${viewportId}:`, camera.focalPoint);
          }
        } catch (e) {
          console.warn(`[SCROLL] Could not get camera for ${viewportId}:`, e);
        }
      }

      // Memory management: Only needed for STACK viewports with level 0 loading
      // VOLUME viewports use volume cache and don't need this
      if (viewportType === 'stack' && imageIds && imageIds.length > 0) {
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
          if (!imageId) {
            console.warn('[StackSync] ⚠️ Null/undefined imageId in loadedLevel0Images');
            return;
          }

          if (!shouldBeLoaded.has(imageId)) {
            toRemove.push(imageId);
            // Remove from cornerstone cache
            try {
              cornerstoneCore.cache.removeImageLoadObject(imageId);
            } catch (e) {
              // Image might not be in cache, that's okay
              console.debug('[StackSync] Cache removal failed (may not exist):', e.message);
            }
          }
        });

        // Remove from our tracking set
        toRemove.forEach(imageId => {
          if (imageId) {
            loadedLevel0Images.delete(imageId);
          }
        });

        // Add newly visible images to tracking
        shouldBeLoaded.forEach(imageId => {
          if (imageId && !loadedLevel0Images.has(imageId)) {
            loadedLevel0Images.add(imageId);
          }
        });

        if (toRemove.length > 0) {
          console.log(`[StackSync] 🗑️  Cleared ${toRemove.length} distant images from cache (keeping ${loadedLevel0Images.size} near current position)`);
        }
      }
    } catch (error) {
      // Catch all errors to prevent uncaught runtime errors
      console.error('[StackSync] ❌ Error in scroll listener:', error);
      console.error('[StackSync] ❌ Error stack:', error.stack);
    }
  };

  // Register IMAGE_RENDERED event listener (more reliable than STACK events)
  console.log('[StackSync] 🎧 Registering IMAGE_RENDERED event listener...');
  console.log('[StackSync] 🔍 STACK viewport type:', stackViewport.type);

  // Use IMAGE_RENDERED event which fires every time an image is rendered
  // This is more reliable than STACK_VIEWPORT_SCROLL which doesn't seem to fire
  cornerstoneCore.eventTarget.addEventListener(
    cornerstoneCore.Enums.Events.IMAGE_RENDERED,
    scrollListener
  );

  console.log('[StackSync] ✅ Scroll-based memory management active');
  console.log('[StackSync] 👂 Listening for IMAGE_RENDERED events on mpr-stack-single');
}

// Helper function to teardown single STACK viewport synchronization
async function teardownSingleStackViewport(servicesManager, viewportGridService) {
  console.log('🔥 [TEARDOWN] ===== FUNCTION CALLED =====');

  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    // CRITICAL: Read the current STACK viewport position BEFORE teardown!
    // This is simpler than event listeners which don't seem to fire
    console.log('🔥 [TEARDOWN] Getting mpr-stack-single viewport...');
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    console.log('🔥 [TEARDOWN] stackViewport exists?', !!stackViewport);
    if (stackViewport) {
      try {
        const currentIndex = stackViewport.getCurrentImageIdIndex();
        const imageIds = stackViewport.getImageIds();

        // Validate the data before saving
        if (currentIndex < 0 || !imageIds || imageIds.length === 0) {
          console.warn('🔥 [TEARDOWN] ⚠️ Invalid viewport state - skipping position save');
          return;
        }

        if (currentIndex >= imageIds.length) {
          console.warn(`🔥 [TEARDOWN] ⚠️ Index out of bounds: ${currentIndex} >= ${imageIds.length}`);
          return;
        }

        // Save the position for synchronization when returning to 4-port
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = imageIds.map(id => {
          // Remove the ?stackView=XXX suffix to get original imageId
          // Handle cases where id might be null/undefined
          if (!id) return null;
          return id.split('?stackView=')[0];
        }).filter(id => id !== null); // Remove any null entries

        console.log(`🎯 [TEARDOWN] Saved STACK position: slice ${currentIndex} of ${imageIds.length}`);
        console.log(`🎯 [TEARDOWN] Original imageIds saved: ${lastStackOriginalImageIds?.length}`);
      } catch (error) {
        console.error('🔥 [TEARDOWN] ❌ Error saving viewport position:', error);
      }
    }

    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      return;
    }

    console.log('[StackSync] 🔧 Tearing down STACK viewport synchronization');

    // Restore decode level 2 for stack viewports
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

    // Clear STACK-specific imageIds from cache (memory cleanup)
    // Note: stackViewport already declared at top of function
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

    // Remove IMAGE_RENDERED listener for memory management
    if (scrollListener) {
      cornerstoneCore.eventTarget.removeEventListener(
        cornerstoneCore.Enums.Events.IMAGE_RENDERED,
        scrollListener
      );
      scrollListener = null;
      console.log('[StackSync] ✅ IMAGE_RENDERED listener removed');
    }

    // Clear loaded images tracking
    loadedLevel0Images.clear();
    console.log('[StackSync] ✅ Cleared level 0 image tracking');

    // NOTE: We don't need to remove MPR viewports from sync group because
    // they were never added to it (they use CrosshairsTool for synchronization)

    console.log('[StackSync] ✅ STACK viewport teardown complete');
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
