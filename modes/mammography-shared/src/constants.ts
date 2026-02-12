/**
 * Mammography mode constants
 *
 * All magic numbers are defined here for easy maintenance and consistency.
 * These constants are used throughout the mammography and mammography-compare modes.
 */

/**
 * Zoom factor for chest wall-anchored magnification
 * Standard zoom ratio for mammography imaging per ACR guidelines
 *
 * @remarks
 * This value is applied when the user clicks the Magnify button.
 * The zoom is applied from the chest wall (right edge for R breast, left edge for L breast)
 * to keep the tissue of interest centered and prevent drift.
 *
 * @default 1.5
 */
export const MAMMO_ZOOM_FACTOR = 1.5;

/**
 * Debounce delay for resize handler (milliseconds)
 *
 * @remarks
 * When the window resizes, the handler is debounced to avoid excessive
 * recalculations of viewport layout and chest wall anchoring.
 *
 * @default 150
 */
export const RESIZE_DEBOUNCE_DELAY = 150;

/**
 * Wheel zoom multiplier for fine control
 *
 * @remarks
 * Applied per wheel event when performing scroll-based zoom in single-series mode.
 * Smaller values = finer control, larger values = faster zoom changes.
 *
 * @default 0.1
 */
export const WHEEL_ZOOM_MULTIPLIER = 0.1;

/**
 * VOI (Value of Interest) synchronization group ID
 *
 * @remarks
 * Used to group viewports for synchronized window/level (brightness/contrast) adjustments.
 * When one viewport's W/L is changed, all viewports in this group are updated.
 *
 * @default 'mammo-voi-sync-group'
 */
export const VOI_SYNC_GROUP_ID = 'mammo-voi-sync-group';

/**
 * DICOM tag formats used for metadata extraction
 *
 * @remarks
 * Different DICOM libraries use different tag formats. These formats are tried
 * in order when looking up DICOM attributes.
 */
export const DICOM_TAG_FORMATS = {
  /** Cornerstone format: 'x00185101' */
  CORNERSTONE: (tag: string): string => `x${tag.replace(',', '')}`,

  /** DCMJS format: '00185101' (no comma) */
  DCMJS: (tag: string): string => tag.replace(',', ''),
};

/**
 * DICOM laterality hints for detecting left breast
 *
 * @remarks
 * String patterns that indicate a left breast image.
 * Used in SeriesDescription, ProtocolName, and other text fields.
 */
export const LEFT_LATERALITY_HINTS = [
  'LCC',      // Left Craniocaudal
  'LMLO',     // Left Mediolateral Oblique
  'LEFT',
  'L-CC',
  'L-MLO',
  ' BREAST L',
  ' BREAST - L',
];

/**
 * DICOM laterality hints for detecting right breast
 *
 * @remarks
 * String patterns that indicate a right breast image.
 * Used in SeriesDescription, ProtocolName, and other text fields.
 */
export const RIGHT_LATERALITY_HINTS = [
  'RCC',      // Right Craniocaudal
  'RMLO',     // Right Mediolateral Oblique
  'RIGHT',
  'R-CC',
  'R-MLO',
  ' BREAST R',
  ' BREAST - R',
];

/**
 * DICOM tag identifiers for laterality and view position
 *
 * @remarks
 * These are the standard DICOM tags used to determine breast laterality
 * and view position in mammography.
 */
export const DICOM_TAGS = {
  /** ImageLaterality and FrameLaterality tags */
  LATERALITY: ['0020,0062', '0054,0220'],

  /** ViewPosition tag - primary for mammography */
  VIEW_POSITION: ['0018,5101'],

  /** ProtocolName tag - secondary for mammography */
  PROTOCOL_NAME: ['0018,1030'],
};
