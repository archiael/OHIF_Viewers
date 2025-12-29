import { DicomMetadataStore } from '@ohif/core';
import { metaData as cornerstoneMetaData, utilities } from '@cornerstonejs/core';

/**
 * Creates a metadata provider wrapper that returns ORIGINAL metadata
 * (not HTJ2K-adjusted metadata) for imagePlaneModule and imagePixelModule queries.
 *
 * This is required for SR generation where SCOORD coordinates must be calculated
 * using original pixel spacing, not the adjusted spacing used for rendering.
 *
 * For all other metadata queries, it delegates to the global metaData provider.
 *
 * @param baseMetadataProvider - The base metadata provider to use for non-intercepted queries
 *                                If not provided, uses cornerstoneMetaData.get
 * @returns A metadata provider object with signature: { get: (type: string, ...queries: any[]) => any }
 */
export function createOriginalMetadataProvider(
  baseMetadataProvider?: (type: string, ...queries: any[]) => any
) {
  const metaDataProvider =
    baseMetadataProvider || cornerstoneMetaData.get.bind(cornerstoneMetaData);

  return {
    get: (type: string, ...queries: any[]): any => {
      const imageId = queries[0];

      // Intercept imagePlaneModule and imagePixelModule queries
      if (type === 'imagePlaneModule' || type === 'imagePixelModule') {
        // Get instance from DicomMetadataStore (has original metadata)
        const instance = metaDataProvider('instance', imageId);

        if (!instance) {
          // Fallback to base provider if instance not found
          return metaDataProvider(type, ...queries);
        }

        // Return original metadata computed from instance
        if (type === 'imagePlaneModule') {
          return getOriginalImagePlaneModule(instance);
        } else if (type === 'imagePixelModule') {
          return getOriginalImagePixelModule(instance);
        }
      }

      // For all other queries, delegate to base provider
      return metaDataProvider(type, ...queries);
    },
  };
}

/**
 * Constructs imagePlaneModule from original instance metadata
 * This mirrors the logic in MetadataProvider.ts but uses instance data directly
 *
 * @param instance - DICOM instance object with original metadata
 * @returns imagePlaneModule with original dimensions and pixel spacing
 */
function getOriginalImagePlaneModule(instance: any): any {
  const { getPixelSpacingInformation } = utilities;
  const { PixelSpacing } = getPixelSpacingInformation(instance) || {};

  if (!PixelSpacing || PixelSpacing.length < 2) {
    return null;
  }

  const rowPixelSpacing = parseFloat(PixelSpacing[0]);
  const columnPixelSpacing = parseFloat(PixelSpacing[1]);

  return {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: instance.Rows,
    columns: instance.Columns,
    imageOrientationPatient: instance.ImageOrientationPatient,
    imagePositionPatient: instance.ImagePositionPatient || [0, 0, 0],
    pixelSpacing: PixelSpacing,
    rowPixelSpacing,
    columnPixelSpacing,
    sliceThickness: instance.SliceThickness,
    sliceLocation: instance.SliceLocation,
    spacingBetweenSlices: instance.SpacingBetweenSlices,
  };
}

/**
 * Constructs imagePixelModule from original instance metadata
 *
 * @param instance - DICOM instance object with original metadata
 * @returns imagePixelModule with original dimensions
 */
function getOriginalImagePixelModule(instance: any): any {
  return {
    rows: instance.Rows,
    columns: instance.Columns,
    samplesPerPixel: instance.SamplesPerPixel || 1,
    photometricInterpretation: instance.PhotometricInterpretation,
    bitsAllocated: instance.BitsAllocated,
    bitsStored: instance.BitsStored,
    highBit: instance.HighBit,
    pixelRepresentation: instance.PixelRepresentation,
  };
}
