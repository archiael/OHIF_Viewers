/**
 * Midline Boundary Constraint for Mammography Mode
 *
 * @description
 * Keeps the chest wall edge pinned to the center boundary between side-by-side
 * mammography viewports during zoom and pan operations. This prevents both:
 *   - GAP (zoom-out): chest wall retracts away from center → visible gap
 *   - OVERLAP (zoom-in): chest wall drifts past center → images overlap
 *
 * In mammography mode, R CC and L CC are displayed side-by-side:
 *   ┌──────────┬──────────┐
 *   │  R CC    │  L CC    │
 *   │  tip  →CW│CW←  tip  │
 *   └──────────┴──────────┘
 *   CW = chest wall (pinned to center boundary)
 *
 * CONSTRAINT 1 (Zoom): computeMaxParallelScale() returns the maximum zoom-out limit
 *   so the image always fills the viewport width.
 *
 * CONSTRAINT 2 (Pan): clampPanToMidlineBoundary() pins the chest wall edge to
 *   the center boundary (bidirectional — corrects both gap and overlap).
 *   R breast: chest wall (Math.max of edge X coords) → target: canvasWidth
 *   L breast: chest wall (Math.min of edge X coords) → target: 0
 *
 * REFLECTION HANDLING:
 *   Some mammography DICOM images have ImageOrientationPatient that causes horizontal
 *   reflection. Using Math.min/Math.max on canvas coordinates (same as
 *   computeChestWallAnchorPanDynamic) handles this automatically.
 */

type MammographyLaterality = 'L' | 'R';

/**
 * Compute the canvas X position of the non-chest-wall edge of the image.
 *
 * For R breast: non-chest-wall = leftmost edge (facing center boundary)
 * For L breast: non-chest-wall = rightmost edge (facing center boundary)
 *
 * Uses indexToWorld + worldToCanvas to handle DICOM reflection automatically.
 *
 * @param viewport - Cornerstone viewport instance
 * @param laterality - 'R' or 'L'
 * @returns The canvas X coordinate of the non-chest-wall edge, or null if unavailable
 */
export function computeNonChestWallEdgeCanvasX(
  viewport: any,
  laterality: MammographyLaterality
): number | null {
  let imageData: any;
  try {
    imageData = viewport.getDefaultImageData?.();
  } catch {
    return null;
  }
  if (!imageData) return null;

  let dims: number[];
  try {
    dims = imageData.getDimensions();
  } catch {
    return null;
  }
  if (!dims || dims.length < 2) return null;

  let leftCanvas: number[];
  let rightCanvas: number[];
  try {
    const leftWorld = imageData.indexToWorld([0, dims[1] / 2, 0]);
    const rightWorld = imageData.indexToWorld([dims[0] - 1, dims[1] / 2, 0]);
    leftCanvas = viewport.worldToCanvas(leftWorld);
    rightCanvas = viewport.worldToCanvas(rightWorld);
  } catch {
    return null;
  }

  // Non-chest-wall edge: the edge facing the center boundary
  // R breast: leftmost canvas X (inner edge facing center)
  // L breast: rightmost canvas X (inner edge facing center)
  if (laterality === 'R') {
    return Math.min(leftCanvas[0], rightCanvas[0]);
  }
  return Math.max(leftCanvas[0], rightCanvas[0]);
}

/**
 * Compute the maximum parallelScale that keeps the image filling the viewport width.
 *
 * When zooming out (increasing parallelScale), the image shrinks. This function
 * calculates the threshold where the non-chest-wall edge exactly touches the
 * center boundary (viewport inner edge).
 *
 * @param viewport - Cornerstone viewport instance
 * @param laterality - 'R' or 'L'
 * @returns Maximum allowed parallelScale, or null if unable to compute
 */
export function computeMaxParallelScale(
  viewport: any,
  laterality: MammographyLaterality
): number | null {
  const canvasEl = (viewport as any).canvas as HTMLCanvasElement | undefined;
  const canvasWidth = canvasEl?.clientWidth || viewport.element?.clientWidth;
  if (!canvasWidth || canvasWidth === 0) return null;

  const nonChestWallX = computeNonChestWallEdgeCanvasX(viewport, laterality);
  if (nonChestWallX === null) return null;

  // Compute the chest-wall edge canvas X as well to measure the full image extent
  let imageData: any;
  try {
    imageData = viewport.getDefaultImageData?.();
  } catch {
    return null;
  }
  if (!imageData) return null;

  let dims: number[];
  try {
    dims = imageData.getDimensions();
  } catch {
    return null;
  }
  if (!dims || dims.length < 2) return null;

  let leftCanvas: number[];
  let rightCanvas: number[];
  try {
    const leftWorld = imageData.indexToWorld([0, dims[1] / 2, 0]);
    const rightWorld = imageData.indexToWorld([dims[0] - 1, dims[1] / 2, 0]);
    leftCanvas = viewport.worldToCanvas(leftWorld);
    rightCanvas = viewport.worldToCanvas(rightWorld);
  } catch {
    return null;
  }

  // Chest-wall edge: the opposite side of non-chest-wall
  const chestWallX =
    laterality === 'R'
      ? Math.max(leftCanvas[0], rightCanvas[0])
      : Math.min(leftCanvas[0], rightCanvas[0]);

  // Image extent on canvas (in pixels)
  const imageExtent = Math.abs(nonChestWallX - chestWallX);
  if (imageExtent < 1) return null;

  // Current parallelScale
  const camera = viewport.getCamera?.();
  if (!camera || !camera.parallelScale) return null;

  // Max parallelScale = current * (imageExtent / canvasWidth)
  // When imageExtent == canvasWidth, the image exactly fills the viewport.
  // If imageExtent > canvasWidth (zoomed in), ratio > 1 → can zoom out more.
  // If imageExtent < canvasWidth (zoomed out too far), ratio < 1 → already past limit.
  const maxScale = camera.parallelScale * (imageExtent / canvasWidth);
  return maxScale;
}

/**
 * Pin the chest wall edge to the center boundary, correcting pan in either direction.
 *
 * This is bidirectional — it fixes both:
 *   - Gap (chest wall retracted away from center → e.g. during zoom-out)
 *   - Overlap (chest wall drifted past center → e.g. during zoom-in)
 *
 * R breast: chest wall = Math.max(leftCanvasX, rightCanvasX) → target: canvasWidth
 * L breast: chest wall = Math.min(leftCanvasX, rightCanvasX) → target: 0
 *
 * Algorithm matches computeChestWallAnchorPanDynamic in chestWallAnchor.ts.
 *
 * @param viewport - Cornerstone viewport instance
 * @param laterality - 'R' or 'L'
 * @returns corrected pan + deltaX, or null if already aligned (within 1px)
 */
export function clampPanToMidlineBoundary(
  viewport: any,
  laterality: MammographyLaterality
): { newPan: [number, number]; deltaX: number } | null {
  const canvasEl = (viewport as any).canvas as HTMLCanvasElement | undefined;
  const canvasWidth = canvasEl?.clientWidth || viewport.element?.clientWidth;
  if (!canvasWidth || canvasWidth === 0) return null;

  // Get image data and compute both edge canvas positions
  let imageData: any;
  try {
    imageData = viewport.getDefaultImageData?.();
  } catch {
    return null;
  }
  if (!imageData) return null;

  let dims: number[];
  try {
    dims = imageData.getDimensions();
  } catch {
    return null;
  }
  if (!dims || dims.length < 2) return null;

  let leftCanvas: number[];
  let rightCanvas: number[];
  try {
    const leftWorld = imageData.indexToWorld([0, dims[1] / 2, 0]);
    const rightWorld = imageData.indexToWorld([dims[0] - 1, dims[1] / 2, 0]);
    leftCanvas = viewport.worldToCanvas(leftWorld);
    rightCanvas = viewport.worldToCanvas(rightWorld);
  } catch {
    return null;
  }

  // Chest wall edge (center boundary):
  //   R breast → rightmost canvas X (Math.max) → target: canvasWidth
  //   L breast → leftmost canvas X (Math.min) → target: 0
  const chestWallCanvasX =
    laterality === 'R'
      ? Math.max(leftCanvas[0], rightCanvas[0])
      : Math.min(leftCanvas[0], rightCanvas[0]);
  const targetX = laterality === 'R' ? canvasWidth : 0;
  const deltaX = targetX - chestWallCanvasX;

  if (Math.abs(deltaX) < 1) return null; // already aligned

  let currentPan: number[];
  try {
    currentPan = viewport.getPan();
  } catch {
    return null;
  }

  const newPan: [number, number] = [currentPan[0] + deltaX, currentPan[1]];
  return { newPan, deltaX };
}
