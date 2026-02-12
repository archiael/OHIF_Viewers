/**
 * Camera manipulation utilities for mammography mode.
 * Provides zoom-from-anchor and camera shift calculations.
 * Each function is under 50 lines for maintainability.
 */

type Point3 = [number, number, number];

/**
 * Calculate the camera shift needed to keep an anchor point fixed during zoom.
 * For parallel projection: shift = (anchor - focalPoint) * (1 - zoomRatio)
 */
export function calculateAnchorShift(
  anchorWorld: Point3,
  focalPoint: Point3,
  zoomRatio: number
): Point3 {
  return [
    (anchorWorld[0] - focalPoint[0]) * (1 - zoomRatio),
    (anchorWorld[1] - focalPoint[1]) * (1 - zoomRatio),
    (anchorWorld[2] - focalPoint[2]) * (1 - zoomRatio),
  ];
}

/**
 * Build a new camera object with zoom and shift applied atomically.
 * Keeps the anchor point visually fixed while zooming.
 */
export function buildZoomedCamera(
  currentCamera: any,
  newParallelScale: number,
  shift: Point3
): any {
  return {
    ...currentCamera,
    parallelScale: newParallelScale,
    focalPoint: [
      currentCamera.focalPoint[0] + shift[0],
      currentCamera.focalPoint[1] + shift[1],
      currentCamera.focalPoint[2] + shift[2],
    ],
    position: [
      currentCamera.position[0] + shift[0],
      currentCamera.position[1] + shift[1],
      currentCamera.position[2] + shift[2],
    ],
  };
}

/** Deep-clone a camera object for storage in previousCameras map. */
export function cloneCamera(camera: any): any {
  return JSON.parse(JSON.stringify(camera));
}
