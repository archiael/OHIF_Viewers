import {
  logger,
  LEFT_LATERALITY_HINTS,
  RIGHT_LATERALITY_HINTS,
  DICOM_TAGS,
  DICOM_TAG_FORMATS,
} from '@ohif/mode-mammography-shared';

/**
 * Detected breast laterality: 'L' (left), 'R' (right), or null (unknown)
 */
type MammographyLaterality = 'L' | 'R' | null;

/**
 * 2D canvas coordinate [x, y]
 */
type CanvasPoint = [number, number];

/**
 * 3D world coordinate [x, y, z]
 */
type WorldPoint = [number, number, number];

// Map constants to old variable names for compatibility
const RIGHT_HINTS = RIGHT_LATERALITY_HINTS;
const LEFT_HINTS = LEFT_LATERALITY_HINTS;
const DICOM_LATERALITY_TAGS = DICOM_TAGS.LATERALITY;
const DICOM_VIEW_POSITION_TAGS = DICOM_TAGS.VIEW_POSITION;
const DICOM_PROTOCOL_TAGS = DICOM_TAGS.PROTOCOL_NAME;

/**
 * Builds multiple DICOM tag format variants for flexible metadata lookup
 *
 * Different DICOM libraries use different tag formats (with/without commas, case variations, prefixes).
 * This function generates all common variants to maximize compatibility.
 *
 * @param tag - DICOM tag in format like '0018,5101'
 * @returns Array of tag format variants
 *
 * @example
 * buildTagVariants('0018,5101')
 * // Returns: ['0018,5101', '00185101', '00185101', 'x00185101', 'x00185101', 'X00185101', 'X00185101', '0x00185101']
 */
const buildTagVariants = (tag: string): string[] => {
  const noComma = tag.replace(',', '');
  const lower = noComma.toLowerCase();

  return [
    tag,
    noComma,
    lower,
    `x${noComma}`,
    `x${lower}`,
    `X${noComma}`,
    `X${lower}`,
    `0x${lower}`,
  ];
};

/**
 * Retrieves a DICOM tag value from instance metadata with fallback format handling
 *
 * Attempts to find a tag value by trying multiple format variants for each tag.
 * This handles differences between various DICOM metadata libraries.
 *
 * @param instance - DICOM instance metadata object
 * @param tags - Array of DICOM tag identifiers to search (e.g., ['0018,5101'])
 * @returns The first non-empty string value found, or null if no value exists
 *
 * @example
 * const viewPosition = getTagStringValue(instance, ['0018,5101']);
 * // Returns 'CC' for craniocaudal view or null if not found
 */
const getTagStringValue = (instance: Record<string, any>, tags: string[]): string | null => {
  if (!instance) {
    return null;
  }

  for (const tag of tags) {
    const variants = buildTagVariants(tag);
    for (const variant of variants) {
      const value = instance[variant];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return null;
};

/**
 * Normalizes a 3D point array to a typed WorldPoint tuple
 *
 * Handles undefined/null values and ensures consistent [x, y, z] format.
 * Defaults to 0 for missing coordinates.
 *
 * @param point - 3D point as array or Float32Array, or undefined
 * @returns Normalized [x, y, z] tuple or null if point is null/undefined
 *
 * @example
 * normalizeWorldPoint([1.5, 2.3]) // Returns [1.5, 2.3, 0]
 * normalizeWorldPoint(null) // Returns null
 */
const normalizeWorldPoint = (point?: number[] | Float32Array): WorldPoint | null => {
  if (point == null) {
    return null;
  }

  return [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
};

/**
 * Parses laterality from a string by matching mammography-specific patterns
 *
 * Detects breast laterality by checking for common view codes and descriptions
 * used in mammography (RCC, LMLO, LEFT BREAST, etc.)
 *
 * @param value - String value to parse (e.g., 'RCC', 'LEFT BREAST', 'LMLO')
 * @returns 'R' for right breast, 'L' for left breast, or null if not detected
 *
 * @example
 * parseLateralityFromString('RCC') // Returns 'R'
 * parseLateralityFromString('LEFT BREAST') // Returns 'L'
 * parseLateralityFromString('UNKNOWN') // Returns null
 */
const parseLateralityFromString = (value?: string): MammographyLaterality => {
  if (!value) {
    return null;
  }

  const upper = value.toUpperCase();
  const condensed = upper.replace(/\s+/g, '');

  if (RIGHT_HINTS.some(hint => upper.includes(hint) || condensed.includes(hint.replace(/\s+/g, '')))) {
    return 'R';
  }

  if (LEFT_HINTS.some(hint => upper.includes(hint) || condensed.includes(hint.replace(/\s+/g, '')))) {
    return 'L';
  }

  return null;
};

/**
 * Normalizes a laterality string to standard 'R' or 'L' values
 *
 * Handles direct 'R'/'L' prefixes and falls back to pattern matching
 * for complex values like 'RCC', 'LEFT BREAST', etc.
 *
 * @param value - String value to normalize
 * @returns 'R' or 'L' if detected, null otherwise
 *
 * @example
 * normalizeLateralityString('R') // Returns 'R'
 * normalizeLateralityString('LEFT') // Returns 'L'
 * normalizeLateralityString('RCC') // Returns 'R'
 */
const normalizeLateralityString = (value?: string): MammographyLaterality => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('R')) {
    return 'R';
  }

  if (normalized.startsWith('L')) {
    return 'L';
  }

  return parseLateralityFromString(normalized);
};

/**
 * Extracts breast laterality from DICOM instance metadata
 *
 * Uses a priority-based approach to detect laterality from multiple DICOM tags and fields:
 * 1. ViewPosition tag (0018,5101) - Primary mammography laterality indicator
 * 2. ProtocolName tag (0018,1030) - Secondary indicator
 * 3. Standard laterality tags (ImageLaterality, FrameLaterality)
 * 4. Direct DICOM fields (Side, Laterality)
 * 5. Coded sequences and descriptions (ViewCodeSequence, SeriesDescription)
 *
 * @param instance - DICOM instance metadata object
 * @returns 'R' for right breast, 'L' for left breast, or null if cannot be detected
 *
 * @example
 * const laterality = extractLateralityFromInstance(instance);
 * if (laterality === 'R') {
 *   // Apply right breast display settings
 * }
 */
const extractLateralityFromInstance = (instance: Record<string, any>): MammographyLaterality => {
  if (!instance) {
    return null;
  }

  // Priority 1: Check ViewPosition tag (0018,5101) - PRIMARY mammography laterality tag
  const viewPositionTag = getTagStringValue(instance, DICOM_VIEW_POSITION_TAGS);
  const viewPositionLaterality = normalizeLateralityString(viewPositionTag || instance.ViewPosition);
  if (viewPositionLaterality) {
    logger.debug(`[Laterality] Detected from ViewPosition tag (0018,5101): ${viewPositionLaterality}`);
    return viewPositionLaterality;
  }

  // Priority 2: Check ProtocolName tag (0018,1030)
  const protocolTag = getTagStringValue(instance, DICOM_PROTOCOL_TAGS);
  const protocolLaterality = parseLateralityFromString(protocolTag || instance.ProtocolName);
  if (protocolLaterality) {
    logger.debug(`[Laterality] Detected from ProtocolName tag (0018,1030): ${protocolLaterality}`);
    return protocolLaterality;
  }

  // Priority 3: Check standard laterality tags
  const tagLaterality = normalizeLateralityString(getTagStringValue(instance, DICOM_LATERALITY_TAGS));
  if (tagLaterality) {
    logger.debug(`[Laterality] Detected from standard laterality tags: ${tagLaterality}`);
    return tagLaterality;
  }

  // Priority 4: Check direct DICOM fields
  const directCandidates = [
    instance.ImageLaterality,
    instance.FrameLaterality,
    instance.Laterality,
    instance.Side,
  ];

  for (const candidate of directCandidates) {
    const detected = normalizeLateralityString(candidate);
    if (detected) {
      logger.debug(`[Laterality] Detected from direct field: ${detected}`);
      return detected;
    }
  }

  // Priority 5: Check sequences and descriptions
  const sequences = [
    instance?.ViewCodeSequence?.[0]?.CodeMeaning,
    instance?.ViewCodeSequence?.[0]?.CodeValue,
    instance?.ViewCodeSequence?.[0]?.CodingSchemeDesignator,
    instance?.PerformedProtocolCodeSequence?.[0]?.CodeMeaning,
    instance?.PerformedProtocolCodeSequence?.[0]?.CodeValue,
    instance?.SeriesDescription,
    instance?.StudyDescription,
  ];

  for (const field of sequences) {
    const detected = parseLateralityFromString(field);
    if (detected) {
      logger.debug(`[Laterality] Detected from sequence/description: ${detected}`);
      return detected;
    }
  }

  logger.warn('[Laterality] Unable to detect laterality from any DICOM tag');
  return null;
};

/**
 * Infers breast laterality from a Cornerstone viewport
 *
 * First checks the viewport's HTML element dataset for cached laterality,
 * then queries Cornerstone metadata for the current image's DICOM instance.
 *
 * @param viewport - Cornerstone viewport instance
 * @returns 'R' for right breast, 'L' for left breast, or null if cannot be determined
 *
 * @remarks
 * The viewport element's dataset.mammoLaterality is used as a cache to avoid
 * repeated DICOM tag lookups for the same viewport.
 *
 * @example
 * const laterality = inferLateralityFromViewport(viewport);
 * if (laterality === 'R') {
 *   const anchor = getFixedMidlineAnchor(viewport);
 * }
 */
export const inferLateralityFromViewport = (viewport: any): MammographyLaterality => {
  if (!viewport) {
    return null;
  }

  const datasetLaterality = viewport.element?.dataset?.mammoLaterality;
  if (datasetLaterality === 'R' || datasetLaterality === 'L') {
    return datasetLaterality;
  }

  const imageId = viewport.getCurrentImageId?.();
  const cornerstone = typeof window !== 'undefined' ? (window as any)?.cornerstone : null;
  if (!imageId || !cornerstone?.metaData?.get) {
    return null;
  }

  const instance = cornerstone.metaData.get('instance', imageId);
  return extractLateralityFromInstance(instance);
};

/**
 * Calculates the canvas coordinate for the midline (chest wall edge) based on laterality
 *
 * For right breast (R): Returns right edge of canvas
 * For left breast (L): Returns left edge of canvas
 * For unknown: Returns canvas center
 *
 * @param viewport - Cornerstone viewport instance
 * @param laterality - Detected breast laterality ('R', 'L', or null)
 * @returns [x, y] canvas coordinate representing the chest wall edge
 *
 * @remarks
 * These are canvas pixel coordinates, not world coordinates.
 * The canvas coordinates are later converted to world coordinates using viewport.canvasToWorld().
 *
 * @example
 * const canvasPoint = getMidlineCanvasPoint(viewport, 'R');
 * // Returns [canvasWidth, canvasHeight/2] for right breast
 */
export const getMidlineCanvasPoint = (
  viewport: any,
  laterality: MammographyLaterality
): CanvasPoint => {
  const canvas = viewport?.canvas;
  if (!canvas) {
    return [0, 0];
  }

  const { width, height } = canvas;

  if (laterality === 'R') {
    // Right breast - anchor at right edge
    logger.debug(`[getMidlineCanvasPoint] Right breast anchor at [${width}, ${height / 2}]`);
    return [width, height / 2];
  }

  if (laterality === 'L') {
    // Left breast - anchor at left edge (0 was working correctly)
    logger.debug(`[getMidlineCanvasPoint] Left breast anchor at [0, ${height / 2}]`);
    return [0, height / 2];
  }

  // Fallback to center if laterality unknown
  logger.warn(`[getMidlineCanvasPoint] Unknown laterality '${laterality}', defaulting to center [${width / 2}, ${height / 2}]`);
  return [width / 2, height / 2];
};

/**
 * Gets the current midline anchor point considering viewport panning
 *
 * Uses canvasToWorld() to get the world coordinate at the chest wall edge.
 * This accounts for any current panning or positioning of the image.
 * Used for dynamic zoom operations where the viewport may have been panned.
 *
 * @param viewport - Cornerstone viewport instance
 * @returns Object containing laterality, canvas point, and world point
 *
 * @remarks
 * Unlike getFixedMidlineAnchor, this uses the current viewport state,
 * which means zoom operations may drift if the viewport is panned.
 * For button-driven magnification, use getFixedMidlineAnchor instead.
 *
 * @example
 * const anchor = getMidlineAnchor(viewport);
 * if (anchor.worldPoint) {
 *   // Use anchor.worldPoint as zoom reference point
 * }
 */
export const getMidlineAnchor = (viewport: any) => {
  const laterality = inferLateralityFromViewport(viewport);
  logger.debug(`[getMidlineAnchor] Detected laterality for viewport:`, laterality);
  const canvasPoint = getMidlineCanvasPoint(viewport, laterality);

  // Use canvasToWorld to get the CURRENT world coordinate at the canvas edge
  // This accounts for any panning/positioning and gives us the exact world point
  // that is currently visible at the canvas edge
  const worldPointRaw = viewport?.canvasToWorld?.(canvasPoint);
  const worldPoint = normalizeWorldPoint(worldPointRaw);

  if (worldPoint) {
    logger.debug(`[getMidlineAnchor] Using canvasToWorld for ${laterality} breast at canvas [${canvasPoint[0]}, ${canvasPoint[1].toFixed(0)}] → world [${worldPoint[0].toFixed(2)}, ${worldPoint[1].toFixed(2)}, ${worldPoint[2].toFixed(2)}]`);
  } else {
    logger.warn('[getMidlineAnchor] Failed to get worldPoint from canvasToWorld');
  }

  if (laterality && viewport?.element) {
    viewport.element.dataset.mammoLaterality = laterality;
  }

  return {
    laterality,
    canvasPoint,
    worldPoint,
  };
};

/**
 * Gets a FIXED chest wall anchor point from image bounds
 *
 * Unlike getMidlineAnchor(), this uses the image's fixed bounds rather than
 * current viewport state. This prevents zoom drift when the user clicks the
 * Magnify button, as the anchor point remains consistent regardless of panning.
 *
 * For right breast: Returns the right edge (maxX) of the image
 * For left breast: Returns the left edge (minX) of the image
 *
 * @param viewport - Cornerstone viewport instance
 * @returns [x, y, z] world coordinate at the chest wall edge, or null if cannot be determined
 *
 * @remarks
 * This should be used for magnification button operations where consistent,
 * drift-free zoom is important. The anchor point is calculated from imageBounds
 * which are independent of current camera state.
 *
 * @example
 * const anchorPoint = getFixedMidlineAnchor(viewport);
 * if (anchorPoint) {
 *   applyZoomFromAnchor(viewport, anchorPoint, 1.5);  // Zoom 1.5x from chest wall
 * }
 */
export const getFixedMidlineAnchor = (viewport: any): WorldPoint | null => {
  const laterality = inferLateralityFromViewport(viewport);
  if (!laterality) {
    logger.warn('[getFixedMidlineAnchor] No laterality detected');
    return null;
  }

  // Try multiple methods to get image bounds (same as getMidlineAnchor)
  let imageBounds = viewport?.getImageData?.()?.getBounds?.();

  // Method 2: If that fails, try viewport.getDefaultImageData()
  if (!imageBounds) {
    imageBounds = viewport?.getDefaultImageData?.()?.getBounds?.();
  }

  // Method 3: Try viewport.getBounds()
  if (!imageBounds) {
    imageBounds = viewport?.getBounds?.();
  }

  if (!imageBounds || imageBounds.length !== 6) {
    logger.warn('[getFixedMidlineAnchor] Unable to get imageBounds after trying all methods');
    return null;
  }

  // imageBounds = [minX, maxX, minY, maxY, minZ, maxZ]
  const imageCenterY = (imageBounds[2] + imageBounds[3]) / 2;
  const imageCenterZ = (imageBounds[4] + imageBounds[5]) / 2;

  let fixedWorldPoint: WorldPoint;
  if (laterality === 'R') {
    // Right breast - anchor at right edge (maxX)
    fixedWorldPoint = [imageBounds[1], imageCenterY, imageCenterZ];
    logger.debug(`[getFixedMidlineAnchor] Right breast FIXED anchor at imageBounds maxX: [${fixedWorldPoint[0].toFixed(2)}, ${fixedWorldPoint[1].toFixed(2)}, ${fixedWorldPoint[2].toFixed(2)}]`);
  } else {
    // Left breast - anchor at left edge (minX)
    fixedWorldPoint = [imageBounds[0], imageCenterY, imageCenterZ];
    logger.debug(`[getFixedMidlineAnchor] Left breast FIXED anchor at imageBounds minX: [${fixedWorldPoint[0].toFixed(2)}, ${fixedWorldPoint[1].toFixed(2)}, ${fixedWorldPoint[2].toFixed(2)}]`);
  }

  return fixedWorldPoint;
};

/**
 * Recenters the viewport so that a world point moves to a target canvas position
 *
 * Calculates the delta between the current world point at the target canvas location
 * and the desired anchor world point, then adjusts the camera to maintain the anchor
 * at the target canvas location.
 *
 * @param viewport - Cornerstone viewport instance
 * @param anchorWorld - The world point that should be fixed in place
 * @param targetCanvasPoint - The canvas coordinate where the anchor should appear
 *
 * @remarks
 * Used after zoom operations to keep the chest wall anchor point fixed at the
 * canvas edge, preventing the image from drifting.
 *
 * @example
 * const anchorWorld = getFixedMidlineAnchor(viewport);
 * const targetCanvas = laterality === 'R' ? [canvasWidth, canvasHeight/2] : [0, canvasHeight/2];
 * recenterToCanvasPoint(viewport, anchorWorld, targetCanvas);
 */
export const recenterToCanvasPoint = (
  viewport: any,
  anchorWorld: WorldPoint | null,
  targetCanvasPoint: CanvasPoint
): void => {
  if (!viewport || !anchorWorld || !viewport.canvasToWorld || !viewport.getCamera) {
    return;
  }

  const targetWorldRaw = viewport.canvasToWorld(targetCanvasPoint);
  const targetWorld = normalizeWorldPoint(targetWorldRaw);
  if (!targetWorld) {
    return;
  }

  const delta: WorldPoint = [
    targetWorld[0] - anchorWorld[0],
    targetWorld[1] - anchorWorld[1],
    targetWorld[2] - anchorWorld[2],
  ];

  logger.debug(`[Recenter] anchorWorld: [${anchorWorld[0].toFixed(2)}, ${anchorWorld[1].toFixed(2)}], targetCanvas: [${targetCanvasPoint[0].toFixed(1)}, ${targetCanvasPoint[1].toFixed(1)}]`);
  logger.debug(`[Recenter] targetWorld: [${targetWorld[0].toFixed(2)}, ${targetWorld[1].toFixed(2)}], delta: [${delta[0].toFixed(2)}, ${delta[1].toFixed(2)}]`);

  const needsUpdate = delta.some(component => Math.abs(component) > 1e-6);
  if (!needsUpdate) {
    logger.debug(`[Recenter] No update needed - delta too small`);
    return;
  }

  const camera = viewport.getCamera();
  if (!camera) {
    return;
  }

  const translate = (value: number, index: number) => value - delta[index];

  const updatedCamera = {
    ...camera,
    focalPoint: camera.focalPoint.map(translate) as WorldPoint,
    position: camera.position.map(translate) as WorldPoint,
  };

  logger.debug(`[Recenter] Camera focalPoint - before: [${camera.focalPoint[0].toFixed(2)}, ${camera.focalPoint[1].toFixed(2)}], after: [${updatedCamera.focalPoint[0].toFixed(2)}, ${updatedCamera.focalPoint[1].toFixed(2)}]`);

  viewport.setCamera(updatedCamera);
  viewport.render?.();
};
