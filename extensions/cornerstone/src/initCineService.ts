import { cache, Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/tools';

function _getVolumeFromViewport(viewport: Types.IBaseVolumeViewport) {
  // Safety check: getAllVolumeIds might not exist on all viewport types
  if (!viewport?.getAllVolumeIds) {
    return null;
  }

  const volumeIds = viewport.getAllVolumeIds();
  const volumes = volumeIds.map(id => cache.getVolume(id)).filter(Boolean);

  if (volumes.length === 0) {
    return null;
  }

  const dynamicVolume = volumes.find(volume => volume.isDynamicVolume?.());

  return dynamicVolume ?? volumes[0];
}

/**
 * Return all viewports that needs to be synchronized with the source
 * viewport passed as parameter when cine is updated.
 * @param servicesManager ServiceManager
 * @param srcViewportIndex Source viewport index
 * @returns array with viewport information.
 */
function _getSyncedViewports(servicesManager: AppTypes.ServicesManager, srcViewportId) {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;

  const { viewports: viewportsStates } = viewportGridService.getState();
  const srcViewportState = viewportsStates.get(srcViewportId);

  if (srcViewportState?.viewportOptions?.viewportType !== 'volume') {
    return [];
  }

  const srcViewport = cornerstoneViewportService.getCornerstoneViewport(srcViewportId);

  const srcVolume = srcViewport ? _getVolumeFromViewport(srcViewport) : null;

  if (!srcVolume?.isDynamicVolume()) {
    return [];
  }

  const { volumeId: srcVolumeId } = srcVolume;

  return Array.from(viewportsStates.values())
    .filter(({ viewportId }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

      return viewportId !== srcViewportId && viewport?.hasVolumeId?.(srcVolumeId);
    })
    .map(({ viewportId }) => ({ viewportId }));
}

function initCineService(servicesManager: AppTypes.ServicesManager) {
  const { cineService } = servicesManager.services;

  const getSyncedViewports = viewportId => {
    return _getSyncedViewports(servicesManager, viewportId);
  };

  const playClip = (element, playClipOptions) => {
    try {
      return utilities.cine.playClip(element, playClipOptions);
    } catch (error) {
      // Gracefully handle unsupported viewport types (e.g., SR viewports)
      if (error.message?.includes('Unknown viewport type')) {
        console.warn('[CineService] Cine playback not supported for this viewport type:', error.message);
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  };

  const stopClip = (element, stopClipOptions) => {
    try {
      return utilities.cine.stopClip(element, stopClipOptions);
    } catch (error) {
      console.warn('[CineService] Error stopping cine:', error.message);
      return null;
    }
  };

  cineService.setServiceImplementation({
    getSyncedViewports,
    playClip,
    stopClip,
  });
}

export default initCineService;
