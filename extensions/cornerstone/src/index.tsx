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
import {
  initHTJ2KConfig,
  getDecodeLevel,
  isStreamingEnabled,
  switchStackToFullResolution as htj2kSwitchStackToFull,
  getHTJ2KConfig,
} from './utils/htj2kConfig';
import {
  isRangeRequestEnabled,
  getRangeRequestConfig,
  addRangeRequestToRetrieveOptions,
  testRangeRequestSupport,
} from './utils/htj2kRangeRequest';
import { initCustomWadorsLoader } from './utils/customWadorsLoader';
import { clearHTJ2KCache } from './utils/htj2kBackgroundLoader';
import { installWasmErrorListener } from './utils/decodeRetryManager';

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
import update from 'immutability-helper';
export * from './components';

const { imageRetrieveMetadataProvider } = cornerstone.utilities;

// Initialize HTJ2K config from window.config (will be called during extension init)
// @ts-ignore - window.config is set by OHIF
if (typeof window !== 'undefined' && window.config) {
  initHTJ2KConfig(window.config);
}

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

/**
 * Volume retrieve options (MPR viewports)
 * Uses HTJ2K config for decodeLevel and streaming settings
 */
function getVolumeRetrieveOptions() {
  return {
    retrieveOptions: {
      default: {
        streaming: isStreamingEnabled(),
        decodeLevel: getDecodeLevel('volume'),
      },
    },
    // By not using interleavedRetrieveStages, images load sequentially
    // This prevents black lines but may take slightly longer for initial render
  };
}

/**
 * Stack retrieve options (Axial viewport)
 * Uses HTJ2K config for decodeLevel and streaming settings
 */
function getStackRetrieveOptions() {
  return {
    retrieveOptions: {
      single: {
        streaming: isStreamingEnabled(),
        decodeLevel: getDecodeLevel('stack'),
      },
    },
  };
}

/**
 * Stack retrieve options for full resolution (single-view mode)
 */
function getStackFullResolutionOptions() {
  return {
    retrieveOptions: {
      single: {
        streaming: isStreamingEnabled(),
        decodeLevel: 0, // Full resolution
      },
    },
  };
}

const DEFAULT_STACK_RETRIEVE_OPTIONS = {
  retrieveOptions: {
    single: {
      streaming: true,
      decodeLevel: 1,
    },
  },
};

/**
 * Decode center slice and nearby slices at full resolution for smooth scrolling
 * @param viewportId - Viewport ID (default: 'mpr-axial')
 * @param prefetchRange - Number of slices to prefetch (default: 10)
 */
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

      // Switch to FULL resolution (level 0) for stack viewport
      imageRetrieveMetadataProvider.add('stack', getStackFullResolutionOptions());

      // Force reload of the current image at full resolution
      await viewport.setImageIdIndex(currentImageIdIndex);
      viewport.render();

      // Prefetch nearby slices for smooth scrolling
      const startIdx = Math.max(0, currentImageIdIndex - prefetchRange);
      const endIdx = Math.min(imageIds.length - 1, currentImageIdIndex + prefetchRange);

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

/**
 * Switch axial viewport to full resolution after MPR loads
 * Call this after volume creation completes
 */
export function switchAxialToFullResolution() {
  // Update HTJ2K config
  htj2kSwitchStackToFull();

  // Clear the retrieve metadata and re-add with new settings
  imageRetrieveMetadataProvider.add('stack', getStackFullResolutionOptions());
  // Note: Viewport will need to refresh/reload current images to apply new decode level
}

/** Normalize to immutability-helper spec: plain object → $merge, otherwise use as-is. */
const toUpdateSpec = (obj: object) =>
  obj != null && typeof obj === 'object' && Object.keys(obj).some(k => k.startsWith('$'))
    ? obj
    : { $merge: (obj ?? {}) as object };

const unsubscriptions = [];
/**
 *
 */
const cornerstoneExtension: Types.Extensions.Extension = {
  /**
   * Only required property. Should be a unique value across all extensions.
   */
  id,

  onModeEnter: ({ servicesManager, commandsManager, extensionManager }: withAppTypes): void => {
    const { cornerstoneViewportService, toolbarService, segmentationService } =
      servicesManager.services;

    // 🔄 [HTJ2K-WASM-RESET] WASM 오류 이벤트 리스너 설치
    // Stack 스크롤 중 WASM 힙 메모리 오류 발생 시 워커 자동 재시작
    installWasmErrorListener();

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

    // The default volume interleaved options are to interleave the
    // image retrieve, but don't perform progressive loading per image
    // This interleaves images and replicates them for low-resolution depth volume
    // reconstruction, which progressively improves
    // imageRetrieveMetadataProvider.add(
    //  'volume',
    //  cornerstone.ProgressiveRetrieveImages.interleavedRetrieveStages
    //);
    // Re-initialize HTJ2K config from window.config (ensures config is loaded after app is ready)
    // @ts-ignore - window.config is set by OHIF
    if (typeof window !== 'undefined' && window.config) {
      initHTJ2KConfig(window.config);
    }

    // Get current HTJ2K configuration
    const htj2kConfig = getHTJ2KConfig();

    // Initialize custom wadors loader only when HTJ2K is enabled
    // customWadorsLoader는 HTJ2K Progressive Decoding을 위한 래퍼이므로
    // HTJ2K가 비활성화되면 원본 OHIF 로더를 그대로 사용
    if (htj2kConfig.enabled) {
      initCustomWadorsLoader();
      console.log('[HTJ2K] Custom wadors loader registered');
    } else {
      console.log('[HTJ2K] Disabled - using original OHIF wadors loader');
    }

    // Volume loading: Sequential loading to prevent black lines
    // Load slices in order rather than interleaved to avoid gaps in MPR
    imageRetrieveMetadataProvider.add('volume', getVolumeRetrieveOptions());

    // Stack loading: Uses configured decodeLevel (matches volume for fast MPR creation)
    imageRetrieveMetadataProvider.add('stack', getStackRetrieveOptions());

    // Auto-decode center slice at level 1 after MPR volume loads
    const volumeLoadedHandler = async evt => {
      const { volumeId } = evt.detail;

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

    /**
     * Stack retrieve options: read from active data source configuration.
     * Pass an immutability-helper spec (e.g. { $merge: {...} } or { $set: {...} }) in
     * stackRetrieveOptions to customize. Plain object is treated as $merge for backward compat.
     * Set streaming: false for uncompressed DICOM that requires full file before decode.
     */
    // 2026-02-24 / 김현태 : stack뷰포트 이미지 로딩
    // const sourceConfig = extensionManager?.getActiveDataSource?.()?.[0]?.getConfig?.() ?? {};
    // const config = sourceConfig.stackRetrieveOptions ?? {};
    // const stackOptions = update(
    //   DEFAULT_STACK_RETRIEVE_OPTIONS,
    //   toUpdateSpec(config)
    // ) as typeof DEFAULT_STACK_RETRIEVE_OPTIONS;
    // imageRetrieveMetadataProvider.add('stack', stackOptions);
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

    // HTJ2K 캐시 정리 - 메모리 누수 방지
    clearHTJ2KCache();

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

// Export HTJ2K configuration functions for USMPR mode to dynamically switch decode levels
export {
  getHTJ2KConfig,
  isHTJ2KEnabled,
  getDecodeLevel,
  getResolutionFactor,
  isStreamingEnabled,
  updateHTJ2KConfig,
  switchStackToFullResolution,
  resetStackDecodeLevel,
} from './utils/htj2kConfig';

// Export HTJ2K Range Request functions for bandwidth optimization
export {
  isRangeRequestEnabled,
  getRangeRequestConfig,
  addRangeRequestToRetrieveOptions,
  testRangeRequestSupport,
  calculateInitialRangeBytes,
  adaptiveRangeRequest,
  updateRangeRequestConfig,
} from './utils/htj2kRangeRequest';

export default cornerstoneExtension;
