import React from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  Enums as cs3DEnums,
  imageLoadPoolManager,
  imageRetrievalPoolManager,
} from '@cornerstonejs/core';
import { Enums as cs3DToolsEnums } from '@cornerstonejs/tools';
import { Types } from '@ohif/core';
import Enums from './enums';

import init from './init';
import getCustomizationModule from './getCustomizationModule';
import getCommandsModule from './commandsModule';
import getHangingProtocolModule from './getHangingProtocolModule';
import getToolbarModule from './getToolbarModule';
import ToolGroupService from './services/ToolGroupService';
import SyncGroupService from './services/SyncGroupService';
import SegmentationService from './services/SegmentationService';
import CornerstoneCacheService from './services/CornerstoneCacheService';
import CornerstoneViewportService from './services/ViewportService/CornerstoneViewportService';
import ColorbarService from './services/ColorbarService';
import * as CornerstoneExtensionTypes from './types';

import { toolNames } from './initCornerstoneTools';
import { getEnabledElement, reset as enabledElementReset, setEnabledElement } from './state';
import dicomLoaderService from './utils/dicomLoaderService';
import getActiveViewportEnabledElement from './utils/getActiveViewportEnabledElement';

import { id } from './id';
import { measurementMappingUtils } from './utils/measurementServiceMappings';
import PlanarFreehandROI from './utils/measurementServiceMappings/PlanarFreehandROI';
import RectangleROI from './utils/measurementServiceMappings/RectangleROI';
import type { PublicViewportOptions } from './services/ViewportService/Viewport';
import ImageOverlayViewerTool from './tools/ImageOverlayViewerTool';
import getSOPInstanceAttributes from './utils/measurementServiceMappings/utils/getSOPInstanceAttributes';
import { findNearbyToolData } from './utils/findNearbyToolData';
import { createFrameViewSynchronizer } from './synchronizers/frameViewSynchronizer';
import { getSopClassHandlerModule } from './getSopClassHandlerModule';
import { getDynamicVolumeInfo } from '@cornerstonejs/core/utilities';
import {
  useLutPresentationStore,
  usePositionPresentationStore,
  useSegmentationPresentationStore,
  useSynchronizersStore,
  useSelectedSegmentationsForViewportStore,
} from './stores';
import { useToggleOneUpViewportGridStore } from '@ohif/extension-default';
import { useActiveViewportSegmentationRepresentations } from './hooks/useActiveViewportSegmentationRepresentations';
import { useMeasurements } from './hooks/useMeasurements';
import getPanelModule from './getPanelModule';
import PanelSegmentation from './panels/PanelSegmentation';
import PanelMeasurement from './panels/PanelMeasurement';
import { useSegmentations } from './hooks/useSegmentations';
import { StudySummaryFromMetadata } from './components/StudySummaryFromMetadata';
import CornerstoneViewportDownloadForm from './utils/CornerstoneViewportDownloadForm';
import utils from './utils';
import { useMeasurementTracking } from './hooks/useMeasurementTracking';
import { setUpSegmentationEventHandlers } from './utils/setUpSegmentationEventHandlers';
import { setUpAnnotationEventHandlers } from './utils/setUpAnnotationEventHandlers';
export * from './components';

const { imageRetrieveMetadataProvider } = cornerstone.utilities;

const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './Viewport/OHIFCornerstoneViewport');
});

const OHIFCornerstoneViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};

// Volume (MPR viewports): Quarter resolution for memory efficiency
// Simple sequential loading to avoid black lines from missing frames
const volumeRetrieveOptions = {
  retrieveOptions: {
    default: {
      streaming: true,
      decodeLevel: 2, // Quarter resolution for MPR
    },
  },
  // By not using interleavedRetrieveStages, images load sequentially
  // This prevents black lines but may take slightly longer for initial render
};

// Stack (Axial viewport): Dynamically switches from VOLUME to STACK after MPR ready
// Phase 1: Starts as VOLUME with level 2 (for MPR creation)
// Phase 2: Switches to STACK with level 0 (full resolution 2048×2048)
const stackRetrieveOptions = {
  retrieveOptions: {
    single: {
      streaming: true,
      decodeLevel: 0, // Full resolution for stack viewports (axial)
    },
  },
};

// Utility to decode center slice and nearby slices at full resolution for smooth scrolling
export async function decodeAxialCenterSlice(viewportId = 'mpr-axial', prefetchRange = 10) {
  try {
    const renderingEngine = cornerstone.getRenderingEngine('mpr');
    if (!renderingEngine) {
      console.warn('[HTJ2K] No rendering engine found');
      return;
    }

    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) {
      console.warn('[HTJ2K] Axial viewport not found');
      return;
    }

    // For stack viewport, get current image index
    if (viewport.type === 'STACK') {
      const currentImageIdIndex = viewport.getCurrentImageIdIndex();
      const imageIds = viewport.getImageIds();

      console.log(`[HTJ2K] Switching to FULL resolution (level 0) for axial viewport`);

      // Switch to FULL resolution (level 0) for stack viewport
      const fullResStackOptions = {
        retrieveOptions: {
          single: {
            streaming: true,
            decodeLevel: 0, // FULL RESOLUTION for axial
          },
        },
      };

      imageRetrieveMetadataProvider.add('stack', fullResStackOptions);

      // Force reload of the current image at full resolution
      await viewport.setImageIdIndex(currentImageIdIndex);
      viewport.render();

      console.log(`[HTJ2K] Center slice ${currentImageIdIndex} decoded at FULL resolution`);

      // Prefetch nearby slices for smooth scrolling
      const startIdx = Math.max(0, currentImageIdIndex - prefetchRange);
      const endIdx = Math.min(imageIds.length - 1, currentImageIdIndex + prefetchRange);

      console.log(`[HTJ2K] Prefetching ${endIdx - startIdx + 1} nearby slices (${startIdx} to ${endIdx}) for smooth scrolling`);

      // Load nearby images in the background
      for (let i = startIdx; i <= endIdx; i++) {
        if (i !== currentImageIdIndex) {
          const imageId = imageIds[i];
          // Trigger async loading (will be cached)
          cornerstone.imageLoader.loadAndCacheImage(imageId).catch(err => {
            console.warn(`[HTJ2K] Failed to prefetch slice ${i}:`, err);
          });
        }
      }
    }
  } catch (error) {
    console.error('[HTJ2K] Error decoding center slice:', error);
  }
}

// Utility to switch axial viewport to full resolution after MPR loads
// Call this after volume creation completes
export function switchAxialToFullResolution() {
  // Update stack retrieve options to use full resolution
  stackRetrieveOptions.retrieveOptions.single.decodeLevel = 0;

  // Clear the retrieve metadata and re-add with new settings
  imageRetrieveMetadataProvider.add('stack', stackRetrieveOptions);

  console.log('[HTJ2K] Switched axial viewport to full resolution (decodeLevel 0)');
  // Note: Viewport will need to refresh/reload current images to apply new decode level
}

const unsubscriptions = [];
/**
 *
 */
const cornerstoneExtension: Types.Extensions.Extension = {
  /**
   * Only required property. Should be a unique value across all extensions.
   */
  id,

  onModeEnter: ({ servicesManager, commandsManager }: withAppTypes): void => {
    const { cornerstoneViewportService, toolbarService, segmentationService } =
      servicesManager.services;

    const { unsubscriptions: segmentationUnsubscriptions } = setUpSegmentationEventHandlers({
      servicesManager,
      commandsManager,
    });
    unsubscriptions.push(...segmentationUnsubscriptions);

    const annotationUnsubscriptions = setUpAnnotationEventHandlers();
    unsubscriptions.push(...annotationUnsubscriptions);

    toolbarService.registerEventForToolbarUpdate(cornerstoneViewportService, [
      cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
    ]);

    toolbarService.registerEventForToolbarUpdate(segmentationService, [
      segmentationService.EVENTS.SEGMENTATION_REMOVED,
      segmentationService.EVENTS.SEGMENTATION_MODIFIED,
      segmentationService.EVENTS.SEGMENTATION_ANNOTATION_CUT_MERGE_PROCESS_COMPLETED,
    ]);

    toolbarService.registerEventForToolbarUpdate(cornerstone.eventTarget, [
      cornerstoneTools.Enums.Events.TOOL_ACTIVATED,
    ]);

    // Configure the interleaved/HTJ2K loader
    imageRetrieveMetadataProvider.clear();

    // Volume loading: Sequential loading to prevent black lines
    // Load slices in order rather than interleaved to avoid gaps in MPR
    imageRetrieveMetadataProvider.add('volume', volumeRetrieveOptions);

    // Stack loading: Quarter resolution initially (matches volume)
    imageRetrieveMetadataProvider.add('stack', stackRetrieveOptions);

    // Dynamic viewport switching: After MPR volume loads, switch axial from VOLUME to STACK
    console.log('[HTJ2K] Initializing dynamic viewport switching system...');

    // Track if switch has already been performed
    let axialSwitched = false;

    const performAxialSwitch = async () => {
      if (axialSwitched) {
        console.log('[HTJ2K] Axial already switched, skipping');
        return;
      }

      try {
        const { viewportGridService } = servicesManager.services;
        const renderingEngine = cornerstone.getRenderingEngine('mpr');

        if (!renderingEngine) {
          console.warn('[HTJ2K] Rendering engine "mpr" not found');
          return false;
        }

        const axialViewport = renderingEngine.getViewport('mpr-0');

        if (!axialViewport) {
          console.warn('[HTJ2K] Axial viewport "mpr-0" not found');
          return false;
        }

        // Check if already switched to STACK
        if (axialViewport.type === cornerstone.Enums.ViewportType.STACK) {
          console.log('[HTJ2K] Axial already STACK type, marking as switched');
          axialSwitched = true;
          return true;
        }

        // Check if viewport has imageIds (indicates it's ready)
        const imageIds = axialViewport.getImageIds?.();
        if (!imageIds || imageIds.length === 0) {
          console.warn('[HTJ2K] Axial viewport has no imageIds yet');
          return false;
        }

        // Get current displaySetInstanceUIDs for the axial viewport
        const displaySetInstanceUIDs = viewportGridService.getDisplaySetsUIDsForViewport('mpr-0');
        if (!displaySetInstanceUIDs || displaySetInstanceUIDs.length === 0) {
          console.warn('[HTJ2K] No displaySets found for axial viewport');
          return false;
        }

        const totalImages = imageIds.length;
        console.log(`[HTJ2K] 🔄 Switching axial to STACK type with ${totalImages} images at level 0`);

        // Switch viewport to STACK type - this will trigger reload with decodeLevel 0
        viewportGridService.setDisplaySetsForViewport({
          viewportId: 'mpr-0',
          displaySetInstanceUIDs: displaySetInstanceUIDs,
          viewportOptions: {
            viewportType: 'stack',
            toolGroupId: 'mpr',  // CRITICAL: Keep in mpr tool group for crosshairs
            orientation: cornerstone.Enums.OrientationAxis.AXIAL,
            initialImageOptions: {
              index: Math.floor(totalImages / 2),  // Start at center
            },
          },
        });

        console.log('[HTJ2K] ✅ Axial switched to STACK at level 0');
        axialSwitched = true;
        return true;

      } catch (error) {
        console.error('[HTJ2K] ❌ Failed to switch axial to STACK:', error);
        return false;
      }
    };

    // Event-based trigger: Use IMAGE_RENDERED events to detect when viewports are ready
    let renderCount = 0;
    const imageRenderedHandler = evt => {
      if (axialSwitched) return;

      renderCount++;

      // Wait for at least 3 render events before attempting switch
      // This ensures the MPR volume is loaded and viewports are rendering
      if (renderCount >= 3) {
        console.log(`[HTJ2K] 📢 ${renderCount} IMAGE_RENDERED events detected, attempting switch...`);

        // Remove listener to prevent multiple attempts
        cornerstone.eventTarget.removeEventListener(
          cornerstone.Enums.Events.IMAGE_RENDERED,
          imageRenderedHandler
        );

        // Give a short delay for stability, then perform switch
        setTimeout(() => performAxialSwitch(), 500);
      }
    };

    // Register IMAGE_RENDERED listener (this event IS firing in local file setup)
    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.IMAGE_RENDERED,
      imageRenderedHandler
    );
    console.log('[HTJ2K] 👂 Listening for IMAGE_RENDERED events to trigger axial switch');

    unsubscriptions.push(() => {
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.IMAGE_RENDERED,
        imageRenderedHandler
      );
    });

    // Memory management for stack viewport scrolling
    const stackImageCache = new Map();
    const MAX_CACHED_IMAGES = 20;

    const handleStackScroll = async evt => {
      const { viewport, imageIdIndex } = evt.detail;

      // Only apply to axial viewport (mpr-0)
      if (viewport.id !== 'mpr-0') {
        return;
      }

      const imageIds = viewport.getImageIds();

      // Prefetch next 3 images for smooth scrolling
      for (let i = 1; i <= 3; i++) {
        const nextIndex = imageIdIndex + i;
        if (nextIndex < imageIds.length) {
          const imageId = imageIds[nextIndex];
          if (!stackImageCache.has(imageId)) {
            cornerstone.imageLoader.loadAndCacheImage(imageId).then(img => {
              stackImageCache.set(imageId, img);
            }).catch(err => {
              console.warn(`[HTJ2K] Failed to prefetch image ${nextIndex}:`, err);
            });
          }
        }
      }

      // Clear distant images (>10 positions away) to manage memory
      if (stackImageCache.size > MAX_CACHED_IMAGES) {
        stackImageCache.forEach((_, cachedImageId) => {
          const cachedIndex = imageIds.indexOf(cachedImageId);
          if (cachedIndex !== -1 && Math.abs(cachedIndex - imageIdIndex) > 10) {
            cornerstone.cache.removeImageLoadObject(cachedImageId);
            stackImageCache.delete(cachedImageId);
          }
        });
      }
    };

    // Register stack scroll handler
    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.STACK_VIEWPORT_SCROLL,
      handleStackScroll
    );

    unsubscriptions.push(() => {
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.STACK_VIEWPORT_SCROLL,
        handleStackScroll
      );
      // Clear cache on mode exit
      stackImageCache.clear();
    });
  },
  getPanelModule,
  onModeExit: ({ servicesManager }: withAppTypes): void => {
    unsubscriptions.forEach(unsubscribe => unsubscribe());
    // Clear the unsubscriptions
    unsubscriptions.length = 0;

    const { cineService, segmentationService } = servicesManager.services;
    // Empty out the image load and retrieval pools to prevent memory leaks
    // on the mode exits
    Object.values(cs3DEnums.RequestType).forEach(type => {
      imageLoadPoolManager.clearRequestStack(type);
      imageRetrievalPoolManager.clearRequestStack(type);
    });

    cineService.setIsCineEnabled(false);

    enabledElementReset();

    useLutPresentationStore.getState().clearLutPresentationStore();
    usePositionPresentationStore.getState().clearPositionPresentationStore();
    useSynchronizersStore.getState().clearSynchronizersStore();
    useToggleOneUpViewportGridStore.getState().clearToggleOneUpViewportGridStore();
    useSegmentationPresentationStore.getState().clearSegmentationPresentationStore();
    useSelectedSegmentationsForViewportStore
      .getState()
      .clearSelectedSegmentationsForViewportStore();
    segmentationService.removeAllSegmentations();
  },

  /**
   * Register the Cornerstone 3D services and set them up for use.
   *
   * @param configuration.csToolsConfig - Passed directly to `initCornerstoneTools`
   */
  preRegistration: async function (props: Types.Extensions.ExtensionParams): Promise<void> {
    const { servicesManager } = props;
    servicesManager.registerService(CornerstoneViewportService.REGISTRATION);
    servicesManager.registerService(ToolGroupService.REGISTRATION);
    servicesManager.registerService(SyncGroupService.REGISTRATION);
    servicesManager.registerService(SegmentationService.REGISTRATION);
    servicesManager.registerService(CornerstoneCacheService.REGISTRATION);
    servicesManager.registerService(ColorbarService.REGISTRATION);

    const { syncGroupService } = servicesManager.services;
    syncGroupService.registerCustomSynchronizer('frameview', createFrameViewSynchronizer);

    await init.call(this, props);
  },
  getToolbarModule,
  getHangingProtocolModule,
  getViewportModule({ servicesManager, commandsManager }) {
    const ExtendedOHIFCornerstoneViewport = props => {
      const { toolbarService } = servicesManager.services;

      return (
        <OHIFCornerstoneViewport
          {...props}
          toolbarService={toolbarService}
          servicesManager={servicesManager}
          commandsManager={commandsManager}
        />
      );
    };

    return [
      {
        name: 'cornerstone',
        component: ExtendedOHIFCornerstoneViewport,
        isReferenceViewable: utils.isReferenceViewable.bind(null, servicesManager),
      },
    ];
  },
  getCommandsModule,
  getCustomizationModule,
  getUtilityModule({ servicesManager }) {
    return [
      {
        name: 'common',
        exports: {
          getCornerstoneLibraries: () => {
            return { cornerstone, cornerstoneTools };
          },
          getEnabledElement,
          dicomLoaderService,
        },
      },
      {
        name: 'core',
        exports: {
          Enums: cs3DEnums,
        },
      },
      {
        name: 'tools',
        exports: {
          toolNames,
          Enums: cs3DToolsEnums,
        },
      },
      {
        name: 'volumeLoader',
        exports: {
          getDynamicVolumeInfo,
        },
      },
    ];
  },
  getSopClassHandlerModule,
};

export type { PublicViewportOptions };
export {
  measurementMappingUtils,
  PlanarFreehandROI,
  RectangleROI,
  CornerstoneExtensionTypes as Types,
  toolNames,
  getActiveViewportEnabledElement,
  setEnabledElement,
  findNearbyToolData,
  getEnabledElement,
  ImageOverlayViewerTool,
  getSOPInstanceAttributes,
  dicomLoaderService,
  // Export all stores
  useLutPresentationStore,
  usePositionPresentationStore,
  useSegmentationPresentationStore,
  useSynchronizersStore,
  useSelectedSegmentationsForViewportStore,
  Enums,
  useMeasurements,
  useActiveViewportSegmentationRepresentations,
  useSegmentations,
  PanelSegmentation,
  PanelMeasurement,
  StudySummaryFromMetadata,
  CornerstoneViewportDownloadForm,
  utils,
  OHIFCornerstoneViewport,
  useMeasurementTracking,
};

// Export constants
export { VOLUME_LOADER_SCHEME, DYNAMIC_VOLUME_LOADER_SCHEME } from './constants';
export default cornerstoneExtension;
