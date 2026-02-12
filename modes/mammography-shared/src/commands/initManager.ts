/**
 * Init Manager - Handles mammography mode initialization.
 * Decomposed from the initMammoMode God Function (~300 lines).
 * Each function is under 50 lines for maintainability.
 */

import { useMammographyStore } from '../store/mammographyStore';
import { logger } from '../utils/logger';
import { toViewportArray, getViewportId, getValidViewports } from './viewportHelpers';
import { cloneCamera } from './cameraUtils';
import type { ViewportType } from './viewportHelpers';

interface InitServices {
  viewportGridService: any;
  cornerstoneViewportService: any;
  displaySetService: any;
}

/** Detect whether viewports share a single series or use multiple series. */
function detectViewportMode(
  viewportArray: ViewportType[],
  services: InitServices
): { isSingleSeriesMode: boolean; totalImages: number; numViewports: number } {
  const displaySetUIDs = new Set<string>();
  let totalImagesInFirstSeries = 0;

  viewportArray.forEach(vp => {
    const vpId = getViewportId(vp);
    const viewport = services.cornerstoneViewportService.getCornerstoneViewport(vpId);
    if (viewport) {
      const numSlices = viewport.getNumberOfSlices?.() || 1;
      if (totalImagesInFirstSeries === 0) {
        totalImagesInFirstSeries = numSlices;
      }
    }
    if (vp.displaySetInstanceUIDs?.length > 0) {
      displaySetUIDs.add(vp.displaySetInstanceUIDs[0]);
    }
  });

  const isSingleSeriesMode = displaySetUIDs.size === 1 && totalImagesInFirstSeries > 1;
  return { isSingleSeriesMode, totalImages: totalImagesInFirstSeries, numViewports: viewportArray.length };
}

/** Initialize synced scroll state based on viewport mode detection. */
function initScrollState(detection: ReturnType<typeof detectViewportMode>, displaySetUIDs: Set<string>): void {
  const store = useMammographyStore.getState();
  if (detection.isSingleSeriesMode) {
    store.setSyncedScrollState({
      isSingleSeriesMode: true,
      totalPairs: Math.ceil(detection.totalImages / detection.numViewports),
      currentPairIndex: 0,
      sharedDisplaySetUID: Array.from(displaySetUIDs)[0],
    });
    logger.debug(`Single-series mode: ${detection.totalImages} images, ${detection.numViewports} viewports`);
  } else {
    store.setSyncedScrollState({ isSingleSeriesMode: false });
    logger.debug(`Multiple-series mode: ${displaySetUIDs.size} series`);
  }
}

/** Handle wheel event in single-series mode (synchronized scrolling). */
function handleSingleSeriesWheel(
  delta: number,
  viewportId: string,
  numViewports: number,
  services: InitServices
): void {
  const store = useMammographyStore.getState();
  const { viewports: currentViewports } = services.viewportGridService.getState();
  const currentViewportArray = toViewportArray(currentViewports);
  const firstViewportId = getViewportId(currentViewportArray[0]);

  // Only process on first viewport to prevent duplicate handling
  if (viewportId !== firstViewportId) return;

  const direction = delta > 0 ? 1 : -1;
  const newPairIndex = store.syncedScrollState.currentPairIndex + direction;

  if (newPairIndex < 0 || newPairIndex >= store.syncedScrollState.totalPairs) {
    return;
  }

  store.setSyncedScrollState({ currentPairIndex: newPairIndex });
  const baseImageIndex = newPairIndex * numViewports;

  currentViewportArray.forEach((vp, idx) => {
    const vpId = getViewportId(vp);
    const vpViewport = services.cornerstoneViewportService.getCornerstoneViewport(vpId);
    if (vpViewport) {
      const imageIndex = baseImageIndex + idx;
      const totalImages = vpViewport.getNumberOfSlices?.() || 1;
      if (imageIndex < totalImages) {
        vpViewport.setImageIdIndex(imageIndex);
        vpViewport.render();
      }
    }
  });
}

/** Handle wheel event in multi-series mode (independent scrolling with cross-series nav). */
function handleMultiSeriesWheel(
  delta: number,
  viewportId: string,
  viewport: any,
  services: InitServices
): void {
  const numberOfSlices = viewport.getNumberOfSlices?.() || 1;
  const currentImageIdIndex = viewport.getCurrentImageIdIndex?.() || 0;
  let newIndex = currentImageIdIndex;
  let scrollDirection: 'next' | 'previous' | null = null;

  if (delta > 0) {
    if (currentImageIdIndex < numberOfSlices - 1) {
      newIndex = currentImageIdIndex + 1;
    } else {
      scrollDirection = 'next';
    }
  } else if (delta < 0) {
    if (currentImageIdIndex > 0) {
      newIndex = currentImageIdIndex - 1;
    } else {
      scrollDirection = 'previous';
    }
  }

  if (!scrollDirection && newIndex !== currentImageIdIndex) {
    viewport.setImageIdIndex(newIndex);
    viewport.render();
    return;
  }

  if (scrollDirection) {
    switchSeries(viewportId, scrollDirection, services);
  }
}

/** Switch to the next or previous display set for a viewport. */
function switchSeries(
  viewportId: string,
  direction: 'next' | 'previous',
  services: InitServices
): void {
  try {
    const { viewports: currentViewports } = services.viewportGridService.getState();
    const vpArray = toViewportArray(currentViewports);
    const currentViewportInfo = vpArray.find(
      (v: ViewportType) => getViewportId(v) === viewportId
    );

    if (!currentViewportInfo?.displaySetInstanceUIDs) return;

    const currentDisplaySetUID = currentViewportInfo.displaySetInstanceUIDs[0];
    const allDisplaySets = services.displaySetService.getActiveDisplaySets();
    const currentIndex = allDisplaySets.findIndex(
      (ds: any) => ds.displaySetInstanceUID === currentDisplaySetUID
    );
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (direction === 'next' && currentIndex < allDisplaySets.length - 1) {
      targetIndex = currentIndex + 1;
    } else if (direction === 'previous' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    }

    if (targetIndex !== -1) {
      const targetDisplaySet = allDisplaySets[targetIndex];
      services.viewportGridService.setDisplaySetsForViewport({
        viewportId,
        displaySetInstanceUIDs: [targetDisplaySet.displaySetInstanceUID],
      });
    }
  } catch (error) {
    logger.error('Error switching series:', error);
  }
}

/** Install custom wheel event handlers on all valid viewports. */
function setupWheelHandlers(
  validViewports: ViewportType[],
  numViewports: number,
  services: InitServices
): void {
  const store = useMammographyStore.getState();

  validViewports.forEach(vp => {
    const viewportId = getViewportId(vp);
    const viewport = services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport?.element) return;

    // ISSUE 3 fix: Capture element reference to handle null check in cleanup
    const element = viewport.element;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY;
      const currentStore = useMammographyStore.getState();

      if (currentStore.syncedScrollState.isSingleSeriesMode) {
        handleSingleSeriesWheel(delta, viewportId, numViewports, services);
      } else {
        handleMultiSeriesWheel(delta, viewportId, viewport, services);
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    store.addWheelUnsubscribe(() => {
      // ISSUE 3 fix: Check if element still exists before removing listener
      if (element) {
        element.removeEventListener('wheel', handleWheel);
      }
    });
    logger.debug(`Custom wheel handler installed for ${viewportId}`);
  });
}

// ISSUE 5 fix: Prevent duplicate resize handler installation
let isResizeHandlerInstalled = false;

/** Install a debounced window resize handler. */
function setupResizeHandler(services: InitServices): void {
  // ISSUE 5 fix: Skip if already installed
  if (isResizeHandlerInstalled) {
    logger.debug('Resize handler already installed, skipping');
    return;
  }

  const store = useMammographyStore.getState();
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleWindowResize = () => {
    useMammographyStore.getState().setIsResizingViewport(true);
    if (resizeTimeout) clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
      try {
        const { viewports } = services.viewportGridService.getState();
        toViewportArray(viewports).forEach(vp => {
          const viewportId = getViewportId(vp);
          const viewport = services.cornerstoneViewportService.getCornerstoneViewport(viewportId);
          if (viewport?.element) {
            try {
              viewport.resize();
              viewport.render();
              useMammographyStore.getState().setPreviousCamera(viewportId, cloneCamera(viewport.getCamera()));
            } catch (error) {
              logger.warn(`Failed to resize viewport ${viewportId}:`, error);
            }
          }
        });
      } finally {
        // ISSUE 2 fix: Store flag reset timeout for cleanup
        const flagResetTimeoutId = setTimeout(() => {
          useMammographyStore.getState().setIsResizingViewport(false);
        }, 100);
        useMammographyStore.getState().addInitTimeout(flagResetTimeoutId);
      }
    }, 300);
  };

  window.addEventListener('resize', handleWindowResize);
  isResizeHandlerInstalled = true;

  store.addWheelUnsubscribe(() => {
    window.removeEventListener('resize', handleWindowResize);
    isResizeHandlerInstalled = false;
  });
  logger.debug('Window resize handler installed');
}

/** Cleanup all mammography mode listeners. */
export function cleanupMammoMode(): void {
  const store = useMammographyStore.getState();

  // ISSUE 2 fix: Clear all pending timeouts first
  store.clearInitTimeouts();

  // Then clear event listeners
  store.clearWheelUnsubscribes();
  store.clearCameraUnsubscribes();

  logger.debug('Cleaned up mammography mode listeners');
}

/** Main entry point: initialize mammography mode with retry logic. */
export function initMammoMode(services: InitServices): void {
  logger.debug('Initializing mammography mode');

  const trySetup = (retryCount = 0) => {
    try {
      const { viewports } = services.viewportGridService.getState();
      const viewportArray = toViewportArray(viewports);
      const validViewports = getValidViewports(viewportArray, services.cornerstoneViewportService);

      if (validViewports.length > 0) {
        // ISSUE 2 fix: Store timeout ID for cleanup
        const setupTimeoutId = setTimeout(() => {
          const { viewports: freshViewports } = services.viewportGridService.getState();
          const freshArray = toViewportArray(freshViewports);

          const displaySetUIDs = new Set<string>();
          freshArray.forEach(vp => {
            if (vp.displaySetInstanceUIDs?.length > 0) {
              displaySetUIDs.add(vp.displaySetInstanceUIDs[0]);
            }
          });

          const detection = detectViewportMode(freshArray, services);
          initScrollState(detection, displaySetUIDs);
          setupWheelHandlers(validViewports, detection.numViewports, services);
          setupResizeHandler(services);

          logger.debug('Mammography mode initialized with custom wheel scroll handlers');
        }, 2000);

        useMammographyStore.getState().addInitTimeout(setupTimeoutId);
        logger.debug('Mammography mode viewports ready, waiting 2s before enabling wheel scroll');
      } else if (retryCount < 20) {
        logger.debug(`Waiting for viewports (attempt ${retryCount + 1}/20)...`);

        // ISSUE 2 fix: Store retry timeout ID for cleanup
        const retryTimeoutId = setTimeout(() => trySetup(retryCount + 1), 100);
        useMammographyStore.getState().addInitTimeout(retryTimeoutId);
      } else {
        logger.warn('Viewports not ready after 20 attempts');
      }
    } catch (error) {
      logger.error('Error initializing mammography mode:', error);
    }
  };

  trySetup();
}
