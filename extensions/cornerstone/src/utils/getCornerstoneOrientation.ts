import { Enums } from '@cornerstonejs/core';

const AXIAL = 'axial';
const SAGITTAL = 'sagittal';
const CORONAL = 'coronal';

export default function getCornerstoneOrientation(orientation: string): Enums.OrientationAxis {
  if (orientation) {
    switch (orientation.toLowerCase()) {
      case AXIAL:
        return Enums.OrientationAxis.AXIAL;
      case SAGITTAL:
        return Enums.OrientationAxis.SAGITTAL;
      case CORONAL:
        return Enums.OrientationAxis.CORONAL;
      default:
        return Enums.OrientationAxis.ACQUISITION;
    }
  }

  return Enums.OrientationAxis.ACQUISITION;
}

/**
 * Converts Cornerstone OrientationAxis enum back to string format
 * This is the reverse of getCornerstoneOrientation()
 * @param orientationEnum - The OrientationAxis enum value
 * @returns The orientation string ('axial', 'sagittal', 'coronal', or 'acquisition')
 */
export function getOrientationString(
  orientationEnum: Enums.OrientationAxis
): string {
  switch (orientationEnum) {
    case Enums.OrientationAxis.AXIAL:
      return AXIAL;
    case Enums.OrientationAxis.SAGITTAL:
      return SAGITTAL;
    case Enums.OrientationAxis.CORONAL:
      return CORONAL;
    case Enums.OrientationAxis.ACQUISITION:
      return 'acquisition';
    case Enums.OrientationAxis.REFORMAT:
      return 'reformat';
    default:
      return 'acquisition';
  }
}
