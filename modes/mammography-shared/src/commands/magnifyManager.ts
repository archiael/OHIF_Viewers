/**
 * Magnify Manager - Handles chest-wall-anchored magnification.
 * Decomposed from the mammoMagnify God Function (~210 lines).
 * Each function is under 50 lines for maintainability.
 */

import { getFixedMidlineAnchor } from '../utils/mammographyMidline';
import { useMammographyStore } from '../store/mammographyStore';
import { MAMMO_ZOOM_FACTOR } from '../constants';
import { logger } from '../utils/logger';
import { toViewportArray, getViewportId, refreshToolbarForViewport } from './viewportHelpers';
import { calculateAnchorShift, buildZoomedCamera, cloneCamera } from './cameraUtils';

interface MagnifyServices {
  viewportGridService: any;
  cornerstoneViewportService: any;
  toolbarService: any;
}

/** Reset a single viewport to its hanging-protocol initial camera state. */
function resetViewportCamera(viewport: any, viewportId: string): void {
  const store = useMammographyStore.getState();
  viewport.resetCamera();
  viewport.render();
  const resetCamera = viewport.getCamera();
  store.setPreviousCamera(viewportId, cloneCamera(resetCamera));
}

/**
 * Magnify a single viewport from its chest wall anchor.
 * Returns true if magnification was applied, false if anchor not found.
 */
function magnifyFromChestWall(viewport: any, viewportId: string): boolean {
  const store = useMammographyStore.getState();
  const currentCamera = viewport.getCamera();
  const worldPoint = getFixedMidlineAnchor(viewport);
  if (!worldPoint) return false;

  const newParallelScale = currentCamera.parallelScale / MAMMO_ZOOM_FACTOR;
  const zoomRatio = newParallelScale / currentCamera.parallelScale;
  const shift = calculateAnchorShift(worldPoint, currentCamera.focalPoint, zoomRatio);
  const newCamera = buildZoomedCamera(currentCamera, newParallelScale, shift);

  viewport.setCamera(newCamera);
  viewport.render();
  store.setPreviousCamera(viewportId, cloneCamera(newCamera));
  return true;
}

/** Handle magnify toggle when sync is ON: apply to ALL viewports. */
export function magnifyAllViewportsSynced(services: MagnifyServices): void {
  const store = useMammographyStore.getState();
  const { activeViewportId } = services.viewportGridService.getState();
  const isMagnified = store.magnificationState.size > 0;

  store.setIsSyncingCameras(true);
  try {
    const { viewports } = services.viewportGridService.getState();
    toViewportArray(viewports).forEach(vp => {
      const vpId = getViewportId(vp);
      const viewport = services.cornerstoneViewportService.getCornerstoneViewport(vpId);
      if (!viewport) return;

      if (isMagnified) {
        resetViewportCamera(viewport, vpId);
      } else {
        magnifyFromChestWall(viewport, vpId);
      }
    });

    if (isMagnified) {
      store.clearAllMagnifications();
      logger.debug('Unmagnified ALL viewports with sync ON');
    } else {
      store.setMagnification(activeViewportId, true);
      logger.debug('Magnified ALL viewports with sync ON');
    }
    refreshToolbarForViewport(services.toolbarService, activeViewportId);
  } finally {
    store.setIsSyncingCameras(false);
  }
}

/** Handle magnify toggle when sync is OFF: apply to active viewport only. */
export function magnifySingleViewport(services: MagnifyServices): void {
  const store = useMammographyStore.getState();
  const { activeViewportId } = services.viewportGridService.getState();
  const viewport = services.cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
  if (!viewport) {
    logger.warn('No active viewport found');
    return;
  }

  store.setIsMagnifyingFromButton(true);
  try {
    if (store.hasMagnification(activeViewportId)) {
      resetViewportCamera(viewport, activeViewportId);
      store.clearMagnification(activeViewportId);
      logger.debug('Magnification OFF - reset camera (chest wall pinned to edge)');
      refreshToolbarForViewport(services.toolbarService, activeViewportId);
      return;
    }

    const applied = magnifyFromChestWall(viewport, activeViewportId);
    if (!applied) {
      logger.warn('Unable to determine mammography midline anchor');
      return;
    }

    store.setMagnification(activeViewportId, true);
    logger.debug(`Magnified viewport ${activeViewportId} to ${MAMMO_ZOOM_FACTOR}x from chest wall`);
    refreshToolbarForViewport(services.toolbarService, activeViewportId);
  } finally {
    store.setIsMagnifyingFromButton(false);
  }
}

/**
 * Main entry point: toggle mammography magnification.
 * Dispatches to synced or single-viewport logic based on sync state.
 */
export function mammoMagnify(services: MagnifyServices): void {
  const store = useMammographyStore.getState();
  logger.debug('Mammo Magnify clicked, sync enabled:', store.isSyncEnabled);
  try {
    const { activeViewportId } = services.viewportGridService.getState();
    const viewport = services.cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
    if (!viewport) {
      logger.warn('No active viewport found');
      return;
    }

    if (store.isSyncEnabled) {
      magnifyAllViewportsSynced(services);
    } else {
      magnifySingleViewport(services);
    }
  } catch (error) {
    logger.error('Error in mammoMagnify:', error);
  }
}
