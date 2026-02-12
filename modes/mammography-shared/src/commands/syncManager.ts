/**
 * Sync Manager - Handles viewport synchronization for mammography mode.
 * Decomposed from the toggleMammoSync God Function (~213 lines).
 * Each function is under 50 lines for maintainability.
 */

import { Enums } from '@cornerstonejs/core';
import { getFixedMidlineAnchor } from '../utils/mammographyMidline';
import { useMammographyStore } from '../store/mammographyStore';
import { VOI_SYNC_GROUP_ID } from '../constants';
import { logger } from '../utils/logger';
import { toViewportArray, getViewportId, refreshToolbarForViewport } from './viewportHelpers';
import { calculateAnchorShift, buildZoomedCamera, cloneCamera } from './cameraUtils';

interface SyncServices {
  viewportGridService: any;
  syncGroupService: any;
  cornerstoneViewportService: any;
  toolbarService: any;
}

interface ViewportEntry {
  viewportId: string;
  viewport: any;
}

/** Collect all valid viewports as {viewportId, viewport} pairs. */
function collectViewportList(services: SyncServices): ViewportEntry[] {
  const { viewports } = services.viewportGridService.getState();
  const result: ViewportEntry[] = [];

  toViewportArray(viewports).forEach(vp => {
    const viewportId = getViewportId(vp);
    const viewport = services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (viewport) {
      result.push({ viewportId, viewport });
    }
  });

  return result;
}

/** Apply zoom ratio from a source viewport to all other viewports. */
function syncZoomToOthers(
  sourceViewportId: string,
  sourceCamera: any,
  previousCamera: any,
  viewportList: ViewportEntry[]
): void {
  const store = useMammographyStore.getState();
  const zoomRatio = sourceCamera.parallelScale / previousCamera.parallelScale;
  logger.debug(`[SYNC ZOOM] Viewport ${sourceViewportId} zoom ratio: ${zoomRatio.toFixed(3)}`);

  viewportList.forEach(({ viewportId: targetId, viewport: targetVp }) => {
    if (targetId === sourceViewportId) {
      store.setPreviousCamera(sourceViewportId, cloneCamera(sourceCamera));
      return;
    }

    const targetCamera = targetVp.getCamera();
    const anchorWorld = getFixedMidlineAnchor(targetVp);
    if (!anchorWorld) {
      logger.warn(`[SYNC ZOOM] No anchor for viewport ${targetId}`);
      return;
    }

    const newParallelScale = targetCamera.parallelScale * zoomRatio;
    const shift = calculateAnchorShift(anchorWorld, targetCamera.focalPoint, zoomRatio);
    const newCamera = buildZoomedCamera(targetCamera, newParallelScale, shift);

    targetVp.setCamera(newCamera);
    targetVp.render();
    store.setPreviousCamera(targetId, cloneCamera(newCamera));
  });
}

/** Apply pan delta from a source viewport to all other viewports. */
function syncPanToOthers(
  sourceViewportId: string,
  sourceCamera: any,
  previousCamera: any,
  viewportList: ViewportEntry[]
): void {
  const store = useMammographyStore.getState();
  const deltaX = sourceCamera.focalPoint[0] - previousCamera.focalPoint[0];
  const deltaY = sourceCamera.focalPoint[1] - previousCamera.focalPoint[1];
  const deltaZ = sourceCamera.focalPoint[2] - previousCamera.focalPoint[2];

  viewportList.forEach(({ viewportId: targetId, viewport: targetVp }) => {
    if (targetId === sourceViewportId) return;

    const targetCamera = targetVp.getCamera();
    targetVp.setCamera({
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
    targetVp.render();
    store.setPreviousCamera(targetId, cloneCamera(targetVp.getCamera()));
  });

  store.setPreviousCamera(sourceViewportId, cloneCamera(sourceCamera));
}

/** Disable camera and VOI sync for all viewports. */
export function disableCameraSync(services: SyncServices): void {
  const store = useMammographyStore.getState();
  store.clearCameraUnsubscribes();
  store.previousCameras.clear();

  const { viewports } = services.viewportGridService.getState();
  toViewportArray(viewports).forEach(vp => {
    const viewportId = getViewportId(vp);
    if (!viewportId) return;
    const viewport = services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport) return;

    const renderingEngineId = viewport.getRenderingEngine().id;
    services.syncGroupService.removeViewportFromSyncGroup(
      viewportId, renderingEngineId, VOI_SYNC_GROUP_ID
    );
  });

  store.setSyncEnabled(false);
  logger.debug('Mammography sync disabled (zoom, pan, and contrast)');
}

/** Enable camera sync (zoom/pan) and VOI sync for all viewports. */
export function enableCameraSync(services: SyncServices): void {
  const store = useMammographyStore.getState();
  const viewportList = collectViewportList(services);

  // Initialize previous camera states
  viewportList.forEach(({ viewportId, viewport }) => {
    store.setPreviousCamera(viewportId, cloneCamera(viewport.getCamera()));
  });

  // Set up camera modified listeners for zoom/pan sync
  viewportList.forEach(({ viewportId, viewport }) => {
    const element = viewport.element;
    const renderingEngineId = viewport.getRenderingEngine().id;

    const handleCameraModified = () => {
      const currentStore = useMammographyStore.getState();
      if (!currentStore.isSyncEnabled || currentStore.isSyncingCameras) return;

      const sourceCamera = viewport.getCamera();
      const previousCamera = currentStore.previousCameras.get(viewportId);
      if (!previousCamera) return;

      const zoomChanged = sourceCamera.parallelScale !== previousCamera.parallelScale;
      const focalPointChanged =
        sourceCamera.focalPoint[0] !== previousCamera.focalPoint[0] ||
        sourceCamera.focalPoint[1] !== previousCamera.focalPoint[1] ||
        sourceCamera.focalPoint[2] !== previousCamera.focalPoint[2];

      if (zoomChanged) {
        currentStore.setIsSyncingCameras(true);
        syncZoomToOthers(viewportId, sourceCamera, previousCamera, viewportList);
        currentStore.setIsSyncingCameras(false);
        return;
      }

      if (focalPointChanged && !zoomChanged) {
        currentStore.setIsSyncingCameras(true);
        syncPanToOthers(viewportId, sourceCamera, previousCamera, viewportList);
        currentStore.setIsSyncingCameras(false);
      }
    };

    element.addEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
    store.addCameraUnsubscribe(() => {
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
    });

    // Add viewport to VOI sync group (window/level contrast)
    services.syncGroupService.addViewportToSyncGroup(viewportId, renderingEngineId, {
      type: 'voi',
      id: VOI_SYNC_GROUP_ID,
      source: true,
      target: true,
    });
  });

  store.setSyncEnabled(true);
  logger.debug('Mammography sync enabled for viewports:', viewportList.map(v => v.viewportId));
}

/** Main entry point: toggle mammography sync on/off. */
export function toggleMammoSync(services: SyncServices): void {
  const store = useMammographyStore.getState();
  logger.debug('Sync All Images button clicked, current state:', store.isSyncEnabled);
  try {
    if (store.isSyncEnabled) {
      disableCameraSync(services);
    } else {
      enableCameraSync(services);
    }
    const { activeViewportId } = services.viewportGridService.getState();
    refreshToolbarForViewport(services.toolbarService, activeViewportId);
  } catch (error) {
    logger.error('Error in toggleMammoSync:', error);
  }
}
