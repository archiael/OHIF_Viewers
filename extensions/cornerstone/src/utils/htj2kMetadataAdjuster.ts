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
 *
 * ⚠️ IMPORTANT: PixelSpacing은 원본 유지!
 * - PixelSpacing을 조정하면 World 좌표 계산이 달라져 Annotation 좌표 불일치 발생
 * - Volume Viewport에서 이미지가 작게 보이지만, Zoom 보정으로 해결
 * - Annotation, DICOM SR/SEG/PR, Crosshair 동기화 모두 정확하게 동작
 *
 * @see document/TASK-72-LEVEL2-MPR-VOLUME.md - Phase 6: Annotation 좌표 불일치
 *
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

  // Calculate adjusted dimensions (픽셀 수는 조정)
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);

  // ⚠️ PixelSpacing은 원본 유지 (World 좌표 일관성을 위해)
  // 이렇게 하면:
  // - Volume은 1/4 크기 픽셀로 구성되지만 World 좌표는 원본과 동일
  // - Annotation 좌표가 Level 0 Stack과 정확히 일치
  // - 단, 렌더링 시 1/4 크기로 보임 → Volume Viewport Zoom 보정 필요
  const originalPixelSpacing = [PixelSpacing[0], PixelSpacing[1]];

  // Keep ImagePositionPatient, ImageOrientationPatient unchanged
  // PixelSpacing도 원본 유지 - World 좌표 일관성을 위해!
  return {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: adjustedRows,
    columns: adjustedColumns,
    spacingBetweenSlices: instance.SpacingBetweenSlices, // unchanged
    imageOrientationPatient: instance.ImageOrientationPatient,
    imagePositionPatient: instance.ImagePositionPatient, // unchanged - critical!
    sliceThickness: instance.SliceThickness, // unchanged
    sliceLocation: instance.SliceLocation, // unchanged
    pixelSpacing: originalPixelSpacing, // ⚠️ 원본 유지! (Phase 6)
    rowPixelSpacing: originalPixelSpacing[0],
    columnPixelSpacing: originalPixelSpacing[1],
  };
}
