import { utilities } from '@cornerstonejs/core';
import { isHTJ2KEnabled, getResolutionFactor } from './htj2kConfig';

// HTJ2K Transfer Syntax UIDs
const HTJ2K_TRANSFER_SYNTAX_UIDS = [
  '1.2.840.10008.1.2.4.201', // HTJ2K Lossless
  '1.2.840.10008.1.2.4.202', // HTJ2K Lossless RPCLoss
  '1.2.840.10008.1.2.4.203', // HTJ2K
];

/**
 * Detects if an instance uses HTJ2K compression
 * @param instance - DICOM instance object
 * @returns true if instance uses HTJ2K compression
 */
export function isHTJ2K(instance: any): boolean {
  const transferSyntaxUID =
    instance.AvailableTransferSyntaxUID ||
    instance._meta?.TransferSyntaxUID?.Value?.[0];

  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

/**
 * Calculates adjusted metadata for HTJ2K Level 2 decoding
 * Returns null if not HTJ2K or if metadata is invalid
 * @param instance - DICOM instance object
 * @returns Adjusted imagePixelModule or null
 */
export function getAdjustedImagePixelModule(instance: any): any | null {
  if (!isHTJ2KEnabled()) {
    return null; // HTJ2K disabled in config
  }

  if (!isHTJ2K(instance)) {
    return null;
  }

  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;

  if (!originalRows || !originalColumns) {
    console.warn('[HTJ2K] Instance missing Rows/Columns, skipping adjustment');
    return null;
  }

  // Get resolution factor from config
  const resolutionFactor = getResolutionFactor('volume');

  // Calculate adjusted dimensions
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);

  // Validate adjusted dimensions are reasonable
  if (adjustedRows < 8 || adjustedColumns < 8) {
    console.error(
      `[HTJ2K] Adjusted dimensions too small (${adjustedRows}x${adjustedColumns}), skipping adjustment`
    );
    return null;
  }

  // Log warning if dimensions aren't cleanly divisible
  if (
    originalRows % resolutionFactor !== 0 ||
    originalColumns % resolutionFactor !== 0
  ) {
    console.warn(
      `[HTJ2K] Original dimensions (${originalRows}x${originalColumns}) not cleanly divisible by ${resolutionFactor}, using floor`
    );
  }

  return {
    rows: adjustedRows,
    columns: adjustedColumns,
    samplesPerPixel: instance.SamplesPerPixel || 1,
    photometricInterpretation: instance.PhotometricInterpretation,
    bitsAllocated: instance.BitsAllocated,
    bitsStored: instance.BitsStored,
    highBit: instance.HighBit,
    pixelRepresentation: instance.PixelRepresentation,
    planarConfiguration: instance.PlanarConfiguration,
    pixelAspectRatio: instance.PixelAspectRatio,
    smallestPixelValue: instance.SmallestPixelValue,
    largestPixelValue: instance.LargestPixelValue,
  };
}

/**
 * Calculates adjusted imagePlaneModule for HTJ2K Level 2 decoding
 * Adjusts PixelSpacing but keeps ImagePositionPatient unchanged
 * @param instance - DICOM instance object
 * @returns Adjusted imagePlaneModule or null
 */
export function getAdjustedImagePlaneModule(instance: any): any | null {
  if (!isHTJ2KEnabled()) {
    return null; // HTJ2K disabled in config
  }

  if (!isHTJ2K(instance)) {
    return null;
  }

  const pixelSpacingInfo = utilities.getPixelSpacingInformation(instance);
  const { PixelSpacing } = pixelSpacingInfo || {};

  if (!PixelSpacing || PixelSpacing.length < 2) {
    console.warn('[HTJ2K] Instance missing PixelSpacing, skipping adjustment');
    return null;
  }

  // Get resolution factor from config
  const resolutionFactor = getResolutionFactor('volume');

  // Calculate adjusted dimensions and spacing
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);

  // Multiply PixelSpacing by resolution factor
  const adjustedPixelSpacing = [
    PixelSpacing[0] * resolutionFactor,
    PixelSpacing[1] * resolutionFactor,
  ];

  // Keep ImagePositionPatient, ImageOrientationPatient unchanged
  // Only adjust dimensions and spacing
  return {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: adjustedRows,
    columns: adjustedColumns,
    spacingBetweenSlices: instance.SpacingBetweenSlices, // unchanged
    imageOrientationPatient: instance.ImageOrientationPatient,
    imagePositionPatient: instance.ImagePositionPatient, // unchanged - critical!
    sliceThickness: instance.SliceThickness, // unchanged
    sliceLocation: instance.SliceLocation, // unchanged
    pixelSpacing: adjustedPixelSpacing,
    rowPixelSpacing: adjustedPixelSpacing[0],
    columnPixelSpacing: adjustedPixelSpacing[1],
  };
}
