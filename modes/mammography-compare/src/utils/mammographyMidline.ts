type MammographyLaterality = 'L' | 'R' | null;
type CanvasPoint = [number, number];
type WorldPoint = [number, number, number];

const RIGHT_HINTS = ['RCC', 'RMLO', 'RIGHT', 'R-CC', 'R-MLO', ' BREAST R', ' BREAST - R'];
const LEFT_HINTS = ['LCC', 'LMLO', 'LEFT', 'L-CC', 'L-MLO', ' BREAST L', ' BREAST - L'];
const DICOM_LATERALITY_TAGS = ['0020,0062', '0054,0220'];
const DICOM_VIEW_POSITION_TAGS = ['0018,5101']; // ViewPosition tag for mammography
const DICOM_PROTOCOL_TAGS = ['0018,1030']; // ProtocolName tag

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

const normalizeWorldPoint = (point?: number[] | Float32Array): WorldPoint | null => {
  if (point == null) {
    return null;
  }

  return [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0];
};

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

const extractLateralityFromInstance = (instance: Record<string, any>): MammographyLaterality => {
  if (!instance) {
    return null;
  }

  // Priority 1: Check ViewPosition tag (0018,5101) - PRIMARY mammography laterality tag
  const viewPositionTag = getTagStringValue(instance, DICOM_VIEW_POSITION_TAGS);
  const viewPositionLaterality = normalizeLateralityString(viewPositionTag || instance.ViewPosition);
  if (viewPositionLaterality) {
    console.log(`[Laterality] Detected from ViewPosition tag (0018,5101): ${viewPositionLaterality}`);
    return viewPositionLaterality;
  }

  // Priority 2: Check ProtocolName tag (0018,1030)
  const protocolTag = getTagStringValue(instance, DICOM_PROTOCOL_TAGS);
  const protocolLaterality = parseLateralityFromString(protocolTag || instance.ProtocolName);
  if (protocolLaterality) {
    console.log(`[Laterality] Detected from ProtocolName tag (0018,1030): ${protocolLaterality}`);
    return protocolLaterality;
  }

  // Priority 3: Check standard laterality tags
  const tagLaterality = normalizeLateralityString(getTagStringValue(instance, DICOM_LATERALITY_TAGS));
  if (tagLaterality) {
    console.log(`[Laterality] Detected from standard laterality tags: ${tagLaterality}`);
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
      console.log(`[Laterality] Detected from direct field: ${detected}`);
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
      console.log(`[Laterality] Detected from sequence/description: ${detected}`);
      return detected;
    }
  }

  console.warn('[Laterality] Unable to detect laterality from any DICOM tag');
  return null;
};

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

export const getMidlineCanvasPoint = (
  viewport: any,
  laterality: MammographyLaterality
): CanvasPoint => {
  const canvas = viewport?.canvas;
  if (!canvas) {
    return [0, 0];
  }

  const { width, height } = canvas;

  // Log canvas dimensions for debugging
  console.log(`[getMidlineCanvasPoint] Canvas dimensions - width: ${width}, height: ${height}, laterality: ${laterality}`);

  if (laterality === 'R') {
    // Right breast - anchor at right edge
    console.log(`[getMidlineCanvasPoint] Right breast anchor at [${width}, ${height / 2}]`);
    return [width, height / 2];
  }

  if (laterality === 'L') {
    // Left breast - anchor at left edge (0 was working correctly)
    console.log(`[getMidlineCanvasPoint] Left breast anchor at [0, ${height / 2}]`);
    return [0, height / 2];
  }

  // Fallback to center if laterality unknown
  console.warn(`[getMidlineCanvasPoint] Unknown laterality '${laterality}', defaulting to center [${width / 2}, ${height / 2}]`);
  return [width / 2, height / 2];
};

export const getMidlineAnchor = (viewport: any) => {
  const laterality = inferLateralityFromViewport(viewport);
  console.log(`[getMidlineAnchor] Detected laterality for viewport:`, laterality);
  const canvasPoint = getMidlineCanvasPoint(viewport, laterality);

  // Use canvasToWorld to get the CURRENT world coordinate at the canvas edge
  // This accounts for any panning/positioning and gives us the exact world point
  // that is currently visible at the canvas edge
  const worldPointRaw = viewport?.canvasToWorld?.(canvasPoint);
  const worldPoint = normalizeWorldPoint(worldPointRaw);

  if (worldPoint) {
    console.log(`[getMidlineAnchor] Using canvasToWorld for ${laterality} breast at canvas [${canvasPoint[0]}, ${canvasPoint[1].toFixed(0)}] → world [${worldPoint[0].toFixed(2)}, ${worldPoint[1].toFixed(2)}, ${worldPoint[2].toFixed(2)}]`);
  } else {
    console.warn('[getMidlineAnchor] Failed to get worldPoint from canvasToWorld');
  }

  if (laterality && viewport?.element) {
    viewport.element.dataset.mammoLaterality = laterality;
  }

  // Debug logging
  console.log(`[MammographyZoom] Laterality: ${laterality}, Canvas: [${canvasPoint[0].toFixed(1)}, ${canvasPoint[1].toFixed(1)}], World: [${worldPoint?.[0]?.toFixed(2)}, ${worldPoint?.[1]?.toFixed(2)}]`);

  return {
    laterality,
    canvasPoint,
    worldPoint,
  };
};

/**
 * Get FIXED world coordinate from imageBounds (not affected by camera state)
 * This is used for magnification button to avoid drift
 */
export const getFixedMidlineAnchor = (viewport: any): WorldPoint | null => {
  const laterality = inferLateralityFromViewport(viewport);
  if (!laterality) {
    console.warn('[getFixedMidlineAnchor] No laterality detected');
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
    console.warn('[getFixedMidlineAnchor] Unable to get imageBounds after trying all methods');
    return null;
  }

  // imageBounds = [minX, maxX, minY, maxY, minZ, maxZ]
  const imageCenterY = (imageBounds[2] + imageBounds[3]) / 2;
  const imageCenterZ = (imageBounds[4] + imageBounds[5]) / 2;

  let fixedWorldPoint: WorldPoint;
  if (laterality === 'R') {
    // Right breast - anchor at right edge (maxX)
    fixedWorldPoint = [imageBounds[1], imageCenterY, imageCenterZ];
    console.log(`[getFixedMidlineAnchor] Right breast FIXED anchor at imageBounds maxX: [${fixedWorldPoint[0].toFixed(2)}, ${fixedWorldPoint[1].toFixed(2)}, ${fixedWorldPoint[2].toFixed(2)}]`);
  } else {
    // Left breast - anchor at left edge (minX)
    fixedWorldPoint = [imageBounds[0], imageCenterY, imageCenterZ];
    console.log(`[getFixedMidlineAnchor] Left breast FIXED anchor at imageBounds minX: [${fixedWorldPoint[0].toFixed(2)}, ${fixedWorldPoint[1].toFixed(2)}, ${fixedWorldPoint[2].toFixed(2)}]`);
  }

  return fixedWorldPoint;
};

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

  console.log(`[Recenter] anchorWorld: [${anchorWorld[0].toFixed(2)}, ${anchorWorld[1].toFixed(2)}], targetCanvas: [${targetCanvasPoint[0].toFixed(1)}, ${targetCanvasPoint[1].toFixed(1)}]`);
  console.log(`[Recenter] targetWorld: [${targetWorld[0].toFixed(2)}, ${targetWorld[1].toFixed(2)}], delta: [${delta[0].toFixed(2)}, ${delta[1].toFixed(2)}]`);

  const needsUpdate = delta.some(component => Math.abs(component) > 1e-6);
  if (!needsUpdate) {
    console.log(`[Recenter] No update needed - delta too small`);
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

  console.log(`[Recenter] Camera focalPoint - before: [${camera.focalPoint[0].toFixed(2)}, ${camera.focalPoint[1].toFixed(2)}], after: [${updatedCamera.focalPoint[0].toFixed(2)}, ${updatedCamera.focalPoint[1].toFixed(2)}]`);

  viewport.setCamera(updatedCamera);
  viewport.render?.();
};
