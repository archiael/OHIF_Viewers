import { handleSegmentChange } from './segmentUtils';
import { isReferenceViewable } from './isReferenceViewable';
import {
  setupSegmentationDataModifiedHandler,
  setupSegmentationModifiedHandler,
} from './segmentationHandlers';
import promptHydrationDialog, {
  HydrationDialogProps,
  HydrationCallback,
  HydrationSRResult,
} from './promptHydrationDialog';
import { getCenterExtent } from './getCenterExtent';
import { createSegmentationForViewport } from './createSegmentationForViewport';
import {
  getAdjustedImagePixelModule,
  getAdjustedImagePlaneModule,
  isHTJ2K,
} from './htj2kMetadataAdjuster';

const utils = {
  handleSegmentChange,
  isReferenceViewable,
  setupSegmentationDataModifiedHandler,
  setupSegmentationModifiedHandler,
  promptHydrationDialog,
  getCenterExtent,
  createSegmentationForViewport,
  getAdjustedImagePixelModule,
  getAdjustedImagePlaneModule,
  isHTJ2K,
};

export type { HydrationDialogProps, HydrationCallback, HydrationSRResult };

export default utils;
