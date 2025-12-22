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
      streaming: false, // [TEST] Disable streaming to use xhr instead of fetch
      decodeLevel: 2, // Quarter resolution for MPR
    },
  },
  // By not using interleavedRetrieveStages, images load sequentially
  // This prevents black lines but may take slightly longer for initial render
};

// Stack (Axial viewport): Starts at quarter resolution (same as volume)
// After MPR loads, can be upgraded to full resolution via switchAxialToFullResolution()
const stackRetrieveOptions = {
  retrieveOptions: {
    single: {
      streaming: false, // [TEST] Disable streaming to use xhr instead of fetch
      decodeLevel: 2, // Quarter resolution initially (matches volume for fast MPR creation)
    },
  },
};

// STACK viewport for single-view mode: Full resolution (level 0)
// Used when axial viewport is toggled to single viewport mode
const stackSingleViewOptions = {
  retrieveOptions: {
    single: {
      streaming: true,
      decodeLevel: 0,  // Full resolution 2048×2048 for single STACK viewport
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

    // Auto-decode center slice at level 1 after MPR volume loads
    const volumeLoadedHandler = async evt => {
      const { volumeId } = evt.detail;
      console.log(`[HTJ2K] Volume loaded: ${volumeId}`);

      // Wait a short moment for viewport to initialize
      setTimeout(async () => {
        await decodeAxialCenterSlice('mpr-axial');
      }, 500);
    };

    cornerstone.eventTarget.addEventListener(
      cornerstone.Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      volumeLoadedHandler
    );

    unsubscriptions.push(() => {
      cornerstone.eventTarget.removeEventListener(
        cornerstone.Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        volumeLoadedHandler
      );
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

// Export decode options for USMPR mode to dynamically switch decode levels
export { stackSingleViewOptions };

export default cornerstoneExtension;
