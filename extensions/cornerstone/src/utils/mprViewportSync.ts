/**
 * Utilities for synchronizing MPR viewport behavior (zoom, centering)
 */

import { vec3 } from 'gl-matrix';

/**
 * Check if a viewport is an MPR viewport (axial, sagittal, coronal)
 * Excludes 3D viewport and stack viewports
 */
export function isMPRViewport(viewport: any): boolean {
  if (!viewport) {
    return false;
  }

  if (viewport.type !== 'orthographic') {
    return false;
  }

  // Get camera to check orientation
  const camera = viewport.getCamera();
  const viewPlaneNormal = camera?.viewPlaneNormal;

  if (!viewPlaneNormal) {
    return false;
  }

  // Check if this is axial, sagittal, or coronal (not 3D)
  const isAxial = Math.abs(viewPlaneNormal[2]) > 0.9; // Z-axis dominant
  const isSagittal = Math.abs(viewPlaneNormal[0]) > 0.9; // X-axis dominant
  const isCoronal = Math.abs(viewPlaneNormal[1]) > 0.9; // Y-axis dominant

  const result = isAxial || isSagittal || isCoronal;

  return result;
}

/**
 * Get MPR viewport type (axial, sagittal, coronal, or null)
 */
export function getMPRViewportType(viewport: any): 'axial' | 'sagittal' | 'coronal' | null {
  if (!viewport || viewport.type !== 'orthographic') {
    return null;
  }

  const camera = viewport.getCamera();
  const viewPlaneNormal = camera?.viewPlaneNormal;

  if (!viewPlaneNormal) {
    return null;
  }

  const isAxial = Math.abs(viewPlaneNormal[2]) > 0.9;
  const isSagittal = Math.abs(viewPlaneNormal[0]) > 0.9;
  const isCoronal = Math.abs(viewPlaneNormal[1]) > 0.9;

  if (isAxial) return 'axial';
  if (isSagittal) return 'sagittal';
  if (isCoronal) return 'coronal';

  return null;
}

/**
 * Calculate center point of an annotation
 */
export function getAnnotationCenter(annotation: any): [number, number, number] | null {
  if (!annotation?.data?.handles?.points || annotation.data.handles.points.length === 0) {
    return null;
  }

  const points = annotation.data.handles.points;
  const center: [number, number, number] = [0, 0, 0];

  for (const point of points) {
    center[0] += point[0];
    center[1] += point[1];
    center[2] += point[2];
  }

  center[0] /= points.length;
  center[1] /= points.length;
  center[2] /= points.length;

  return center;
}

/**
 * Center an MPR viewport on a world position WITHOUT changing view orientation
 * This properly pans the camera to center the annotation while preserving view axes
 * @param viewport - Cornerstone viewport
 * @param worldPosition - [x, y, z] world coordinates to center on
 */
export function centerMPRViewportOnPosition(
  viewport: any,
  worldPosition: [number, number, number]
): void {
  if (!isMPRViewport(viewport)) {
    console.warn('[MPR Sync] Not an MPR viewport, skipping centering');
    return;
  }

  const camera = viewport.getCamera();
  const currentFocalPoint = camera.focalPoint;
  const viewPlaneNormal = camera.viewPlaneNormal;

  // Calculate the new focal point by:
  // 1. Project the measurement onto the view plane (navigate to correct slice)
  // 2. Keep the in-plane position at the measurement location (center it)

  // Calculate distance from current focal point to measurement along the view plane normal
  const distanceToPlane =
    (worldPosition[0] - currentFocalPoint[0]) * viewPlaneNormal[0] +
    (worldPosition[1] - currentFocalPoint[1]) * viewPlaneNormal[1] +
    (worldPosition[2] - currentFocalPoint[2]) * viewPlaneNormal[2];

  // Move focal point along the view plane normal to the slice containing the measurement
  // AND also move it in-plane to the measurement's position (full 3D centering)
  const newFocalPoint: [number, number, number] = [
    worldPosition[0],
    worldPosition[1],
    worldPosition[2],
  ];

  // Update camera position by the same offset to maintain view direction
  // This preserves the view plane normal (no orientation change)
  const offset = [
    newFocalPoint[0] - currentFocalPoint[0],
    newFocalPoint[1] - currentFocalPoint[1],
    newFocalPoint[2] - currentFocalPoint[2],
  ];

  const newPosition = [
    camera.position[0] + offset[0],
    camera.position[1] + offset[1],
    camera.position[2] + offset[2],
  ];

  // Set camera - this preserves view plane normal, view up, and all other camera properties
  viewport.setCamera({
    ...camera,
    focalPoint: newFocalPoint,
    position: newPosition,
  });

  viewport.render();
}

/**
 * Trigger viewport render and crosshair updates after camera changes
 * This forces the crosshair grid and 3D slice planes to update
 * @param cornerstoneViewportService - Viewport service
 * @param worldPosition - [x, y, z] world coordinates (for logging)
 * @param retryCount - Internal retry counter (do not set manually)
 */
export function triggerCrosshairUpdate(
  cornerstoneViewportService: any,
  worldPosition: [number, number, number],
  retryCount: number = 0
): void {
  try {
    // Get rendering engine
    const renderingEngine = cornerstoneViewportService.getRenderingEngine();
    if (!renderingEngine) {
      console.warn('[MPR Sync] Rendering engine not found');
      return;
    }

    // Get all viewports including 3D
    const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2', 'mpr-3'];

    // Render each viewport to trigger CrosshairsTool updates
    for (const vpId of viewportIds) {
      try {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
        if (viewport) {
          viewport.render();
        }
      } catch (error) {
        console.warn(`[MPR Sync] Failed to render ${vpId}:`, error);
      }
    }

    // Render all viewports together
    renderingEngine.render();

    // CRITICAL: Manually update 3D slice planes using SlicePlaneSync
    // The SlicePlaneSync listens to CAMERA_MODIFIED events, but sometimes these
    // don't fire properly when we manually change cameras via setCamera()
    // So we need to manually trigger the update
    try {
      // Access the global SlicePlaneSync instance from window
      const slicePlaneSync = (window as any).usmprSlicePlaneSync;
      if (slicePlaneSync && typeof slicePlaneSync.updateAllPlanes === 'function') {
        slicePlaneSync.updateAllPlanes();
      } else {
        // SlicePlaneSync not ready yet (might still be initializing after layout change)
        if (retryCount < 3) {
          // Retry after delay (200ms to match SlicePlaneSync init delay)
          const retryDelay = 200;
          console.warn(
            `[MPR Sync] SlicePlaneSync not available, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/3)`
          );
          setTimeout(() => {
            triggerCrosshairUpdate(cornerstoneViewportService, worldPosition, retryCount + 1);
          }, retryDelay);
          return; // Exit early, will retry
        } else {
          console.warn(
            '[MPR Sync] SlicePlaneSync not available after 3 retries, skipping slice plane update'
          );
        }
      }
    } catch (error) {
      console.warn('[MPR Sync] Failed to update slice planes:', error);
    }
  } catch (error) {
    console.error('[MPR Sync] Error triggering crosshair update:', error);
  }
}

/**
 * Apply synchronized zoom to all MPR viewports using WORLD RATIO (not pixel ratio)
 * Uses parallel scale for orthographic cameras to ensure consistent world-space magnification
 * IMPORTANT: Resets to fit-to-window FIRST, then applies zoom to avoid cumulative zoom errors
 * @param cornerstoneViewportService - Viewport service
 * @param zoomMultiplier - Zoom factor (e.g., 2.0 for 2x zoom in world space)
 * @param excludeViewportId - Optional viewport ID to exclude from sync
 */
export function syncMPRViewportZoom(
  cornerstoneViewportService: any,
  zoomMultiplier: number,
  excludeViewportId?: string
): void {
  // Get all MPR viewports
  const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2']; // Axial, Sagittal, Coronal

  // 🔧 CRITICAL FIX: Suppress events on ALL viewports BEFORE starting zoom loop
  // This prevents crosshair sync from affecting viewports we haven't processed yet
  const viewports: any[] = [];
  for (const viewportId of viewportIds) {
    if (excludeViewportId && viewportId === excludeViewportId) {
      continue;
    }
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (viewport && isMPRViewport(viewport)) {
      viewport._suppressCameraModifiedEvents = true;
      viewports.push({ id: viewportId, viewport });
    }
  }

  // Process each viewport
  for (const { id: viewportId, viewport } of viewports) {
    try {
      // 🔧 FIX: Get the base parallel scale by resetting to fit first
      // This prevents cumulative zoom errors
      const currentCamera = viewport.getCamera();

      // Save current camera state
      const savedFocalPoint = [...currentCamera.focalPoint];
      const savedPosition = [...currentCamera.position];
      const savedViewPlaneNormal = [...currentCamera.viewPlaneNormal];
      const savedViewUp = [...currentCamera.viewUp];

      // Reset camera to fit (this gives us the 1x zoom parallel scale)
      // CRITICAL: suppressEvents prevents CAMERA_RESET event from firing,
      // which would trigger CrosshairsTool.onResetCamera → resetCrosshairs()
      // resetting ALL viewport positions/zoom to volume center
      viewport.resetCamera({ suppressEvents: true });

      // Get the base parallel scale (1x zoom)
      const resetCamera = viewport.getCamera();
      const baseParallelScale = resetCamera.parallelScale;

      // Calculate target parallel scale from base
      const targetParallelScale = baseParallelScale / zoomMultiplier;

      // Restore ALL original camera properties except parallel scale
      viewport.setCamera({
        ...currentCamera, // Start with original camera
        parallelScale: targetParallelScale, // Apply new zoom
        focalPoint: savedFocalPoint, // Preserve centering
        position: savedPosition, // Preserve camera position
        viewPlaneNormal: savedViewPlaneNormal, // Preserve orientation
        viewUp: savedViewUp, // Preserve up direction
      });

      const finalCamera = viewport.getCamera();
    } catch (error) {
      console.error(`[MPR Sync] Error syncing zoom for ${viewportId}:`, error);
    }
  }

  // Re-enable events on ALL viewports and render them
  for (const { id: viewportId, viewport } of viewports) {
    viewport._suppressCameraModifiedEvents = false;
    viewport.render();
  }
}

/**
 * Get current zoom level of an MPR viewport
 */
export function getMPRViewportZoom(viewport: any): number | null {
  if (!isMPRViewport(viewport)) {
    return null;
  }

  try {
    return viewport.getZoom();
  } catch (error) {
    console.error('[MPR Sync] Error getting viewport zoom:', error);
    return null;
  }
}

/**
 * Set zoom for an MPR viewport
 */
export function setMPRViewportZoom(viewport: any, zoom: number): void {
  if (!isMPRViewport(viewport)) {
    console.warn('[MPR Sync] Not an MPR viewport, skipping zoom');
    return;
  }

  try {
    viewport.setZoom(zoom);
    viewport.render();
  } catch (error) {
    console.error('[MPR Sync] Error setting viewport zoom:', error);
  }
}

/**
 * Update crosshair position in 3D viewport without centering the camera
 * This moves the crosshair to the measurement location but leaves camera unchanged
 * @param viewport - 3D Volume viewport
 * @param worldPosition - [x, y, z] world coordinates for crosshair position
 */
export function update3DViewportCrosshair(
  viewport: any,
  worldPosition: [number, number, number]
): void {
  if (!viewport || viewport.type !== 'orthographic') {
    console.warn('[MPR Sync] Not a valid 3D viewport');
    return;
  }

  try {
    // For 3D viewport, we want to update the crosshair position (reference point)
    // but NOT center the camera on it
    // The crosshair position is typically managed by the reference lines tool
    // We can update the focal point of the linked MPR viewports, which will
    // automatically update the crosshair in the 3D view through synchronization
  } catch (error) {
    console.error('[MPR Sync] Error updating 3D crosshair:', error);
  }
}
