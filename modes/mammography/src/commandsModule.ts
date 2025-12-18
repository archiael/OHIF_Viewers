/**
 * Mammography-specific commands module
 */
import { getMidlineAnchor, recenterToCanvasPoint, getFixedMidlineAnchor } from './utils/mammographyMidline';
import { Enums } from '@cornerstonejs/core';

const VOI_SYNC_GROUP_ID = 'mammo-voi-sync-group';

// Track sync state for button appearance
let isSyncEnabled = false;

// Store event listeners for camera sync (zoom and pan)
let cameraSyncUnsubscribes = [];

// Store custom wheel event listeners for single-viewport zoom when sync is OFF
let customWheelUnsubscribes = [];

// Track previous camera state for each viewport to detect pan vs zoom
let previousCameras = new Map();

// Flag to prevent infinite loop when applying single-viewport zoom
let isApplyingSingleViewportZoom = false;

// Flag to prevent infinite loops during sync
let isSyncingCameras = false;

// Flag to indicate when magnification button is applying zoom from chest wall
let isMagnifyingFromButton = false;

// Flag to indicate when viewport is being resized (window resize)
let isResizingViewport = false;

// Flag to indicate when drag-zooming is happening (to prevent pan sync interference)
let isDragZooming = false;

// State for synchronized viewport scrolling in single-series mode
let syncedScrollState = {
  isSingleSeriesMode: false,
  currentPairIndex: 0,
  totalPairs: 0,
  sharedDisplaySetUID: null,
};

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    viewportGridService,
    syncGroupService,
    cornerstoneViewportService,
    toolbarService,
    displaySetService,
  } = servicesManager.services;

  const refreshToolbarForViewport = viewportId => {
    if (!viewportId) {
      return;
    }

    try {
      toolbarService?.refreshToolbarState?.({ viewportId });
    } catch (error) {
      console.warn('Unable to refresh toolbar state', error);
    }
  };

  /**
   * Note: We no longer manually store initial camera states.
   * Instead, we rely on viewport.resetCamera() which uses the displayArea
   * configuration from the hanging protocol (storeAsInitialCamera: true)
   */

  // Store original zoom states for each viewport
  const magnificationState = new Map();
  let isCompareActive = false;

  const actions = {

    /**
     * Mammography-specific magnification toggle
     * Magnifies from the chest wall (right side for RCC/RMLO, left side for LCC/LMLO)
     */
    mammoMagnify: () => {
      console.log('Mammo Magnify clicked, sync enabled:', isSyncEnabled);

      try {
        const { activeViewportId } = viewportGridService.getState();
        const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);

        if (!viewport) {
          console.warn('No active viewport found');
          return;
        }

        // When sync is ON: Apply zoom from chest wall to ALL viewports manually
        if (isSyncEnabled) {
          // Check if any viewport is magnified
          const isMagnified = magnificationState.size > 0;
          const zoomFactor = 1.5;

          // Block sync handler from interfering
          isSyncingCameras = true;

          try {
            // Get all viewports
            const { viewports } = viewportGridService.getState();
            const viewportArray = viewports instanceof Map
              ? Array.from(viewports.values())
              : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

            // Apply zoom to ALL viewports from their own chest walls
            console.log(`[MagnifyButton SYNC ON] Processing ${viewportArray.length} viewports, isMagnified=${isMagnified}`);

            viewportArray.forEach((vp, index) => {
              const vpId = vp.viewportId || vp.viewportOptions?.viewportId;
              const vport = cornerstoneViewportService.getCornerstoneViewport(vpId);
              if (!vport) {
                console.warn(`[MagnifyButton SYNC ON] Viewport ${vpId} not found`);
                return;
              }

              if (isMagnified) {
                // Restore to hanging protocol's initial camera state (chest wall pinned to edge)
                vport.resetCamera();
                vport.render();

                // Update previousCameras with the reset camera state
                const resetCamera = vport.getCamera();
                previousCameras.set(vpId, JSON.parse(JSON.stringify(resetCamera)));
                console.log(`✅ [${index}] Reset camera for viewport ${vpId} (chest wall pinned to edge)`);
              } else {
                // Magnify to 1.5x from chest wall anchor, starting from CURRENT camera state
                const currentCamera = vport.getCamera();

                // Use FIXED world coordinate from imageBounds (not affected by camera state)
                const worldPoint = getFixedMidlineAnchor(vport);
                if (!worldPoint) {
                  console.warn(`[MagnifyButton SYNC ON] No anchor for viewport ${vpId}`);
                  return;
                }

                const newParallelScale = currentCamera.parallelScale / zoomFactor; // Zoom in from CURRENT state
                const zoomRatio = newParallelScale / currentCamera.parallelScale;

                console.log(`[${index}] SYNC ON Magnify viewport ${vpId}:`);
                console.log(`  - Anchor (fixed): [${worldPoint[0].toFixed(2)}, ${worldPoint[1].toFixed(2)}, ${worldPoint[2].toFixed(2)}]`);
                console.log(`  - Current parallelScale: ${currentCamera.parallelScale.toFixed(2)}`);
                console.log(`  - New parallelScale: ${newParallelScale.toFixed(2)}`);
                console.log(`  - Current focalPoint: [${currentCamera.focalPoint[0].toFixed(2)}, ${currentCamera.focalPoint[1].toFixed(2)}]`);

                // Calculate camera shift to keep chest wall fixed during zoom FROM CURRENT STATE
                // For parallel projection: newFocalPoint = oldFocalPoint + (anchorWorld - oldFocalPoint) * (1 - ratio)
                const shift = [
                  (worldPoint[0] - currentCamera.focalPoint[0]) * (1 - zoomRatio),
                  (worldPoint[1] - currentCamera.focalPoint[1]) * (1 - zoomRatio),
                  (worldPoint[2] - currentCamera.focalPoint[2]) * (1 - zoomRatio),
                ];

                console.log(`  - Calculated shift: [${shift[0].toFixed(2)}, ${shift[1].toFixed(2)}]`);

                // Apply zoom + shift atomically (zoom FROM chest wall)
                const newCamera = {
                  ...currentCamera,
                  parallelScale: newParallelScale,
                  focalPoint: [
                    currentCamera.focalPoint[0] + shift[0],
                    currentCamera.focalPoint[1] + shift[1],
                    currentCamera.focalPoint[2] + shift[2],
                  ],
                  position: [
                    currentCamera.position[0] + shift[0],
                    currentCamera.position[1] + shift[1],
                    currentCamera.position[2] + shift[2],
                  ],
                };

                console.log(`  - New focalPoint: [${newCamera.focalPoint[0].toFixed(2)}, ${newCamera.focalPoint[1].toFixed(2)}]`);

                vport.setCamera(newCamera);
                vport.render();

                // Update previousCameras for this viewport
                previousCameras.set(vpId, JSON.parse(JSON.stringify(newCamera)));
                console.log(`✅ [${index}] Magnified viewport ${vpId} from chest wall`);
              }
            });

            if (isMagnified) {
              magnificationState.clear();
              console.log('✅ Unmagnified ALL viewports with sync ON');
            } else {
              magnificationState.set(activeViewportId, true);
              console.log('✅ Magnified ALL viewports with sync ON');
            }

            refreshToolbarForViewport(activeViewportId);
          } finally {
            // Clear flag
            isSyncingCameras = false;
          }
          return;
        }

        // When sync is OFF: Toggle between 1.5x zoom and initial loaded state
        // Block custom wheel zoom handler from interfering
        isMagnifyingFromButton = true;

        try {
          if (magnificationState.has(activeViewportId)) {
            // Restore to hanging protocol's initial camera state (chest wall pinned to edge)
            viewport.resetCamera();
            viewport.render();
            magnificationState.delete(activeViewportId);

            // Update previousCameras with the reset camera state
            const resetCamera = viewport.getCamera();
            previousCameras.set(activeViewportId, JSON.parse(JSON.stringify(resetCamera)));

            console.log('Magnification OFF - reset camera (chest wall pinned to edge)');
            refreshToolbarForViewport(activeViewportId);
            return;
          }

          const currentCamera = viewport.getCamera();

          // Use FIXED world coordinate from imageBounds (not affected by camera state)
          const anchorWorld = getFixedMidlineAnchor(viewport);
          if (!anchorWorld) {
            console.warn('Unable to determine mammography midline anchor');
            return;
          }

          const zoomFactor = 1.5;

          // Calculate new parallelScale (smaller = more zoomed in)
          const newParallelScale = currentCamera.parallelScale / zoomFactor;
          const zoomRatio = newParallelScale / currentCamera.parallelScale;

          // Use FIXED world coordinate from image bounds (not recalculated from viewport)
          // This ensures the anchor stays at the actual image edge
          console.log('[MammoMagnify] === Button Zoom Calculation (Sync OFF) ===');
          console.log('Using FIXED anchorWorld from imageBounds:', anchorWorld);
          console.log('Current parallelScale:', currentCamera.parallelScale);
          console.log('New parallelScale:', newParallelScale);
          console.log('Zoom ratio:', zoomRatio);
          console.log('Current focalPoint:', currentCamera.focalPoint);

          // Calculate camera shift to keep chest wall fixed during zoom
          // For parallel projection: newFocalPoint = oldFocalPoint + (anchorWorld - oldFocalPoint) * (1 - ratio)
          const shift = [
            (anchorWorld[0] - currentCamera.focalPoint[0]) * (1 - zoomRatio),
            (anchorWorld[1] - currentCamera.focalPoint[1]) * (1 - zoomRatio),
            (anchorWorld[2] - currentCamera.focalPoint[2]) * (1 - zoomRatio),
          ];

          console.log('Calculated shift:', shift);

          // Apply zoom + shift atomically (zoom FROM chest wall)
          const newCamera = {
            ...currentCamera,
            parallelScale: newParallelScale,
            focalPoint: [
              currentCamera.focalPoint[0] + shift[0],
              currentCamera.focalPoint[1] + shift[1],
              currentCamera.focalPoint[2] + shift[2],
            ],
            position: [
              currentCamera.position[0] + shift[0],
              currentCamera.position[1] + shift[1],
              currentCamera.position[2] + shift[2],
            ],
          };

          viewport.setCamera(newCamera);
          viewport.render();

          // Mark this viewport as magnified (will restore to initial state when toggled off)
          magnificationState.set(activeViewportId, true);

          // Update previousCameras so wheel zoom works correctly after magnify
          previousCameras.set(activeViewportId, JSON.parse(JSON.stringify(newCamera)));

          console.log(`Magnified viewport ${activeViewportId} to 1.5x from chest wall`);
          refreshToolbarForViewport(activeViewportId);
        } finally {
          // Always clear flag
          isMagnifyingFromButton = false;
        }
      } catch (error) {
        console.error('Error in mammoMagnify:', error);
      }
    },
    /**
     * Toggle synchronization across all mammography viewports
     * Syncs: zoom (from chest wall), pan, and window/level (contrast)
     */
    toggleMammoSync: () => {
      console.log('🔗 Sync All Images button clicked, current state:', isSyncEnabled);
      try {
        if (isSyncEnabled) {
          // Disable sync - unsubscribe from zoom/pan events and remove VOI sync
          cameraSyncUnsubscribes.forEach(unsub => unsub());
          cameraSyncUnsubscribes = [];
          previousCameras.clear();

          const { viewports } = viewportGridService.getState();
          const viewportArray = viewports instanceof Map
            ? Array.from(viewports.values())
            : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

          viewportArray.forEach((vp) => {
            const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
            if (viewportId) {
              const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
              if (!viewport) {
                return;
              }

              const renderingEngineId = viewport.getRenderingEngine().id;
              syncGroupService.removeViewportFromSyncGroup(viewportId, renderingEngineId, VOI_SYNC_GROUP_ID);
            }
          });

          isSyncEnabled = false;
          console.log('✅ Mammography sync disabled (zoom, pan, and contrast)');
        } else {
          // Enable sync for all viewports
          // Note: Keep wheel scroll handlers active (wheel always scrolls images, never zooms)

          const { viewports } = viewportGridService.getState();
          const viewportArray = viewports instanceof Map
            ? Array.from(viewports.values())
            : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

          const syncedViewportIds = [];
          const viewportList = [];

          // Get all viewports
          viewportArray.forEach((vp) => {
            const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
            const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
            if (viewport) {
              viewportList.push({ viewportId, viewport });
              syncedViewportIds.push(viewportId);
            }
          });

          // Initialize previous camera states for pan sync
          viewportList.forEach(({ viewportId, viewport }) => {
            const camera = viewport.getCamera();
            previousCameras.set(viewportId, JSON.parse(JSON.stringify(camera)));
          });

          // Set up manual PAN sync via event listeners (zoom is now independent per viewport!)
          viewportList.forEach(({ viewportId, viewport }) => {
            const element = viewport.element;
            const renderingEngineId = viewport.getRenderingEngine().id;

            // Listen for camera changes on this viewport
            const handleCameraModified = () => {
              if (!isSyncEnabled || isSyncingCameras) return;

              const sourceCamera = viewport.getCamera();
              const previousCamera = previousCameras.get(viewportId);

              if (!previousCamera) {
                return;
              }

              // Detect ZOOM changes (parallelScale changed)
              const zoomChanged = sourceCamera.parallelScale !== previousCamera.parallelScale;

              // Only detect PAN changes (focalPoint changed but NOT from zoom)
              const focalPointChanged =
                sourceCamera.focalPoint[0] !== previousCamera.focalPoint[0] ||
                sourceCamera.focalPoint[1] !== previousCamera.focalPoint[1] ||
                sourceCamera.focalPoint[2] !== previousCamera.focalPoint[2];

              // If zoom happened, sync the zoom ratio to all viewports from their own chest walls
              if (zoomChanged) {
                isSyncingCameras = true;

                // Calculate zoom ratio from source viewport
                const zoomRatio = sourceCamera.parallelScale / previousCamera.parallelScale;
                console.log(`[SYNC ZOOM] Viewport ${viewportId} zoom ratio: ${zoomRatio.toFixed(3)}`);

                // Apply same zoom ratio to all OTHER viewports from their own chest walls
                viewportList.forEach(({ viewportId: targetViewportId, viewport: targetViewport }) => {
                  if (targetViewportId === viewportId) {
                    // Update source viewport previousCamera
                    previousCameras.set(viewportId, JSON.parse(JSON.stringify(sourceCamera)));
                    return;
                  }

                  const targetCamera = targetViewport.getCamera();

                  // Get this viewport's chest wall anchor
                  const anchorWorld = getFixedMidlineAnchor(targetViewport);
                  if (!anchorWorld) {
                    console.warn(`[SYNC ZOOM] No anchor for viewport ${targetViewportId}`);
                    return;
                  }

                  // Apply same zoom ratio from this viewport's chest wall
                  const newParallelScale = targetCamera.parallelScale * zoomRatio;

                  // Calculate camera shift to keep chest wall fixed during zoom
                  const shift = [
                    (anchorWorld[0] - targetCamera.focalPoint[0]) * (1 - zoomRatio),
                    (anchorWorld[1] - targetCamera.focalPoint[1]) * (1 - zoomRatio),
                    (anchorWorld[2] - targetCamera.focalPoint[2]) * (1 - zoomRatio),
                  ];

                  const newCamera = {
                    ...targetCamera,
                    parallelScale: newParallelScale,
                    focalPoint: [
                      targetCamera.focalPoint[0] + shift[0],
                      targetCamera.focalPoint[1] + shift[1],
                      targetCamera.focalPoint[2] + shift[2],
                    ],
                    position: [
                      targetCamera.position[0] + shift[0],
                      targetCamera.position[1] + shift[1],
                      targetCamera.position[2] + shift[2],
                    ],
                  };

                  targetViewport.setCamera(newCamera);
                  targetViewport.render();

                  // Update previous camera for target viewport
                  previousCameras.set(targetViewportId, JSON.parse(JSON.stringify(newCamera)));
                  console.log(`[SYNC ZOOM] Applied ratio ${zoomRatio.toFixed(3)} to viewport ${targetViewportId} from its chest wall`);
                });

                isSyncingCameras = false;
                return;
              }

              // Only sync PAN (when focalPoint changed without zoom)
              if (focalPointChanged && !zoomChanged) {
                // Set flag to prevent infinite loop
                isSyncingCameras = true;

                // Pan sync - calculate delta and apply to each viewport
                const deltaX = sourceCamera.focalPoint[0] - previousCamera.focalPoint[0];
                const deltaY = sourceCamera.focalPoint[1] - previousCamera.focalPoint[1];
                const deltaZ = sourceCamera.focalPoint[2] - previousCamera.focalPoint[2];

                viewportList.forEach(({ viewportId: targetViewportId, viewport: targetViewport }) => {
                  if (targetViewportId === viewportId) return; // Skip source viewport

                  const targetCamera = targetViewport.getCamera();

                  // Apply pan delta to target viewport
                  targetViewport.setCamera({
                    ...targetCamera,
                    focalPoint: [
                      targetCamera.focalPoint[0] + deltaX,
                      targetCamera.focalPoint[1] + deltaY,
                      targetCamera.focalPoint[2] + deltaZ,
                    ],
                    position: [
                      targetCamera.position[0] + deltaX,
                      targetCamera.position[1] + deltaY,
                      targetCamera.position[2] + deltaZ,
                    ],
                  });
                  targetViewport.render();

                  // Update previous camera for target viewport
                  const updatedCamera = targetViewport.getCamera();
                  previousCameras.set(targetViewportId, JSON.parse(JSON.stringify(updatedCamera)));
                });

                // Update previous camera for source viewport after handling pan
                previousCameras.set(viewportId, JSON.parse(JSON.stringify(sourceCamera)));

                // Clear flag
                isSyncingCameras = false;
              }
            };

            element.addEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
            cameraSyncUnsubscribes.push(() => {
              element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
            });

            // Add viewport to VOI sync group (window/level contrast)
            syncGroupService.addViewportToSyncGroup(viewportId, renderingEngineId, {
              type: 'voi',
              id: VOI_SYNC_GROUP_ID,
              source: true,
              target: true,
            });
          });

          isSyncEnabled = true;
          console.log('✅ Mammography sync enabled for viewports:', syncedViewportIds);
          console.log('📊 Syncing: zoom, pan, and window/level (contrast)');
        }

        const { activeViewportId } = viewportGridService.getState();
        refreshToolbarForViewport(activeViewportId);
      } catch (error) {
        console.error('❌ Error in toggleMammoSync:', error);
      }
    },

    /**
     * Initialize mammography mode - set up custom wheel zoom handlers
     */
    initMammoMode: () => {
      console.log('🚀 Initializing mammography mode');

      // Retry function to wait for viewports to be ready
      const trySetup = (retryCount = 0) => {
        try {
          const { viewports } = viewportGridService.getState();
          const viewportArray = viewports instanceof Map
            ? Array.from(viewports.values())
            : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

          // Check if viewports are actually created with elements
          const validViewports = viewportArray.filter(vp => {
            const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
            const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
            return viewport && viewport.element;
          });

          if (validViewports.length > 0) {
            // Wait 2 seconds after viewports are ready to let images load and position normally
            setTimeout(() => {
              // Detect if we're in single-series mode (one series with multiple images)
              // or multiple-series mode (each image in separate series)
              const { viewports } = viewportGridService.getState();
              const viewportArray = viewports instanceof Map
                ? Array.from(viewports.values())
                : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

              // Check all viewports to see if they share the same series
              const displaySetUIDs = new Set();
              let totalImagesInFirstSeries = 0;

              viewportArray.forEach(vp => {
                const vpId = vp.viewportId || vp.viewportOptions?.viewportId;
                const vp_viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
                if (vp_viewport) {
                  const numSlices = vp_viewport.getNumberOfSlices?.() || 1;
                  if (totalImagesInFirstSeries === 0) {
                    totalImagesInFirstSeries = numSlices;
                  }
                }
                if (vp.displaySetInstanceUIDs && vp.displaySetInstanceUIDs.length > 0) {
                  displaySetUIDs.add(vp.displaySetInstanceUIDs[0]);
                }
              });

              // Single series mode if all viewports share same display set AND that series has multiple images
              const isSingleSeriesMode = displaySetUIDs.size === 1 && totalImagesInFirstSeries > 1;
              const numViewports = validViewports.length;

              if (isSingleSeriesMode) {
                // Initialize synced scroll state
                syncedScrollState.isSingleSeriesMode = true;
                syncedScrollState.totalPairs = Math.ceil(totalImagesInFirstSeries / numViewports);
                syncedScrollState.currentPairIndex = 0;
                syncedScrollState.sharedDisplaySetUID = Array.from(displaySetUIDs)[0];

                console.log(`🔗 Single-series mode detected: ${totalImagesInFirstSeries} images, ${numViewports} viewports, ${syncedScrollState.totalPairs} pairs`);
              } else {
                // Multiple series mode
                syncedScrollState.isSingleSeriesMode = false;
                console.log(`📚 Multiple-series mode: ${displaySetUIDs.size} series`);
              }

              // Set up custom wheel handlers for image navigation
              validViewports.forEach((vp) => {
                const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
                const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

                if (viewport && viewport.element) {
                  const handleWheel = (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    // Get the delta (positive = scroll down, negative = scroll up)
                    const delta = event.deltaY;

                    if (syncedScrollState.isSingleSeriesMode) {
                      // SINGLE SERIES MODE: Synchronized scrolling across all viewports
                      // Only the first viewport processes wheel events to prevent duplicate scrolling
                      const { viewports: currentViewports } = viewportGridService.getState();
                      const currentViewportArray = currentViewports instanceof Map
                        ? Array.from(currentViewports.values())
                        : (Array.isArray(currentViewports) ? currentViewports : Object.values(currentViewports || {}));

                      const firstViewportId = currentViewportArray[0]?.viewportId || currentViewportArray[0]?.viewportOptions?.viewportId;

                      // Only process on first viewport to prevent duplicate handling
                      if (viewportId !== firstViewportId) {
                        return;
                      }

                      // Determine scroll direction
                      const direction = delta > 0 ? 1 : -1; // 1 = next pair, -1 = previous pair

                      // Calculate new pair index
                      let newPairIndex = syncedScrollState.currentPairIndex + direction;

                      // Check boundaries
                      if (newPairIndex < 0 || newPairIndex >= syncedScrollState.totalPairs) {
                        console.log(`📍 At ${direction > 0 ? 'last' : 'first'} pair, cannot scroll further`);
                        return;
                      }

                      // Update current pair index
                      syncedScrollState.currentPairIndex = newPairIndex;

                      // Calculate image indices for each viewport
                      // For 2 viewports: pair 0 = [0, 1], pair 1 = [2, 3], etc.
                      const baseImageIndex = newPairIndex * numViewports;

                      console.log(`🔄 Synchronized scroll to pair ${newPairIndex} (images starting at ${baseImageIndex})`);

                      // Update all viewports
                      currentViewportArray.forEach((vp, idx) => {
                        const vpId = vp.viewportId || vp.viewportOptions?.viewportId;
                        const vp_viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);

                        if (vp_viewport) {
                          const imageIndex = baseImageIndex + idx;
                          const totalImages = vp_viewport.getNumberOfSlices?.() || 1;

                          // Only set if image index is valid
                          if (imageIndex < totalImages) {
                            vp_viewport.setImageIdIndex(imageIndex);
                            vp_viewport.render();
                            console.log(`  📺 Viewport ${idx}: image ${imageIndex}`);
                          } else {
                            console.log(`  ⚠️ Viewport ${idx}: image ${imageIndex} out of range (max: ${totalImages - 1})`);
                          }
                        }
                      });

                    } else {
                      // MULTIPLE SERIES MODE: Independent scrolling with cross-series navigation
                      const numberOfSlices = viewport.getNumberOfSlices?.() || 1;
                      const currentImageIdIndex = viewport.getCurrentImageIdIndex?.() || 0;

                      // Try to scroll within current series first
                      let newIndex = currentImageIdIndex;
                      let needToSwitchSeries = false;
                      let scrollDirection = null;

                      if (delta > 0) {
                        // Scroll down - next image
                        if (currentImageIdIndex < numberOfSlices - 1) {
                          newIndex = currentImageIdIndex + 1;
                        } else {
                          needToSwitchSeries = true;
                          scrollDirection = 'next';
                        }
                      } else if (delta < 0) {
                        // Scroll up - previous image
                        if (currentImageIdIndex > 0) {
                          newIndex = currentImageIdIndex - 1;
                        } else {
                          needToSwitchSeries = true;
                          scrollDirection = 'previous';
                        }
                      }

                      // If we can scroll within current series, do it
                      if (!needToSwitchSeries && newIndex !== currentImageIdIndex) {
                        console.log(`🖱️ Wheel scroll on ${viewportId}: ${currentImageIdIndex} -> ${newIndex} (total: ${numberOfSlices})`);
                        viewport.setImageIdIndex(newIndex);
                        viewport.render();
                        return;
                      }

                      // If we need to switch series, get all display sets for this viewport
                      if (needToSwitchSeries) {
                        try {
                          const { viewports: currentViewports } = viewportGridService.getState();
                          const currentViewportInfo = Array.isArray(currentViewports)
                            ? currentViewports.find(v => (v.viewportId || v.viewportOptions?.viewportId) === viewportId)
                            : currentViewports instanceof Map
                              ? Array.from(currentViewports.values()).find(v => (v.viewportId || v.viewportOptions?.viewportId) === viewportId)
                              : Object.values(currentViewports || {}).find((v: any) => (v.viewportId || v.viewportOptions?.viewportId) === viewportId);

                          if (!currentViewportInfo || !currentViewportInfo.displaySetInstanceUIDs) {
                            console.log(`Cannot switch series - no display set info for viewport ${viewportId}`);
                            return;
                          }

                          const currentDisplaySetUID = currentViewportInfo.displaySetInstanceUIDs[0];
                          const allDisplaySets = displaySetService.getActiveDisplaySets();
                          const currentIndex = allDisplaySets.findIndex((ds: any) => ds.displaySetInstanceUID === currentDisplaySetUID);

                          if (currentIndex === -1) {
                            console.log(`Cannot find current display set in active display sets`);
                            return;
                          }

                          // Find next or previous display set
                          let targetIndex = -1;
                          if (scrollDirection === 'next' && currentIndex < allDisplaySets.length - 1) {
                            targetIndex = currentIndex + 1;
                          } else if (scrollDirection === 'previous' && currentIndex > 0) {
                            targetIndex = currentIndex - 1;
                          }

                          if (targetIndex !== -1) {
                            const targetDisplaySet = allDisplaySets[targetIndex];
                            console.log(`🔄 Switching from series ${currentIndex} to ${targetIndex} (${scrollDirection})`);

                            viewportGridService.setDisplaySetsForViewport({
                              viewportId,
                              displaySetInstanceUIDs: [targetDisplaySet.displaySetInstanceUID],
                            });
                          } else {
                            console.log(`📍 At ${scrollDirection === 'next' ? 'last' : 'first'} series, cannot scroll further`);
                          }
                        } catch (error) {
                          console.error('Error switching series:', error);
                        }
                      }
                    }
                  };

                  viewport.element.addEventListener('wheel', handleWheel, { passive: false });
                  customWheelUnsubscribes.push(() => {
                    viewport.element.removeEventListener('wheel', handleWheel);
                  });

                  console.log(`✅ Custom wheel handler installed for ${viewportId}`);
                }
              });

              // Set up debounced window resize handler to fix viewports when dev tools open/close
              let resizeTimeout = null;
              const handleWindowResize = () => {
                // Set flag immediately to block any zoom amplification during resize
                isResizingViewport = true;

                // Clear any pending resize
                if (resizeTimeout) {
                  clearTimeout(resizeTimeout);
                }

                // Debounce: wait 300ms after last resize event before processing
                resizeTimeout = setTimeout(() => {
                  console.log('🔄 Window resized - updating viewports');

                  try {
                    const { viewports } = viewportGridService.getState();
                    const viewportArray = viewports instanceof Map
                      ? Array.from(viewports.values())
                      : (Array.isArray(viewports) ? viewports : Object.values(viewports || {}));

                    viewportArray.forEach((vp) => {
                      const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
                      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
                      if (viewport && viewport.element) {
                        try {
                          // Resize viewport to match new container dimensions
                          viewport.resize();
                          viewport.render();

                          // Update previousCameras with new camera state
                          const camera = viewport.getCamera();
                          previousCameras.set(viewportId, JSON.parse(JSON.stringify(camera)));

                          console.log(`✅ Resized viewport ${viewportId}`);
                        } catch (error) {
                          console.warn(`Failed to resize viewport ${viewportId}:`, error);
                        }
                      }
                    });
                  } finally {
                    // Clear flag after a delay to ensure all resize-related events are done
                    setTimeout(() => {
                      isResizingViewport = false;
                      console.log('✅ Resize complete, zoom amplification re-enabled');
                    }, 100);
                  }
                }, 300);
              };

              // Add resize listener
              window.addEventListener('resize', handleWindowResize);
              console.log('✅ Window resize handler installed');

              console.log('✅ Mammography mode initialized with custom wheel scroll handlers');
            }, 2000);
            console.log('✅ Mammography mode viewports ready, waiting 2s before enabling wheel scroll');
          } else if (retryCount < 20) {
            console.log(`⏳ Waiting for viewports (attempt ${retryCount + 1}/20)...`);
            setTimeout(() => trySetup(retryCount + 1), 100);
          } else {
            console.warn('⚠️ Viewports not ready after 20 attempts');
          }
        } catch (error) {
          console.error('❌ Error initializing mammography mode:', error);
        }
      };

      trySetup();
    },

    /**
     * Open compare mode - navigates to mammography-compare mode with current study
     */
    openMammoCompare: () => {
      console.log('Compare button clicked - switching to compare mode');

      try {
        // Get current study UIDs
        const { displaySetService } = servicesManager.services;
        const activeDisplaySets = displaySetService.getActiveDisplaySets();

        if (!activeDisplaySets || activeDisplaySets.length === 0) {
          console.error('No active display sets found');
          return;
        }

        // Get the study UID from the first active display set
        const studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
        console.log('Navigating to compare mode with study:', studyInstanceUID);

        // Get the datasource query parameter from current URL if it exists
        const urlParams = new URLSearchParams(window.location.search);
        const dataSourceQuery = urlParams.get('datasources') || '';

        // Navigate to the mammography-compare mode with the current study
        // Route path is just the mode's routeName (no /viewer/ prefix)
        const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${studyInstanceUID}${dataSourceQuery ? `&datasources=${dataSourceQuery}` : ''}`;
        console.log('Navigating to:', compareModeUrl);
        window.location.href = compareModeUrl;
      } catch (error) {
        console.error('Error navigating to compare mode:', error);
      }
    },
  };

  const definitions = {
    mammoMagnify: {
      commandFn: actions.mammoMagnify,
      storeContexts: [],
      options: {},
    },
    isMammoMagnified: {
      commandFn: () => {
        const { activeViewportId } = viewportGridService.getState();
        return magnificationState.has(activeViewportId);
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
      commandFn: () => {
        return isSyncEnabled;
      },
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
  };

  return {
    actions,
    definitions,
  };
};

export default commandsModule;
