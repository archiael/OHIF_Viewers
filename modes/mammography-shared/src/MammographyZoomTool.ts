/**
 * Custom Zoom Tool for Mammography
 * Zooms from the chest wall edge (midline) instead of cursor position
 */

import { getEnabledElement } from '@cornerstonejs/core';
import { ZoomTool } from '@cornerstonejs/tools';
import { getFixedMidlineAnchor, inferLateralityFromViewport } from './utils/mammographyMidline';
import { computeMaxParallelScale } from './utils/midlineBoundaryConstraint';

/**
 * MammographyZoomTool - A specialized zoom tool that always zooms from the chest wall edge
 * For right breast (R): zooms from right edge
 * For left breast (L): zooms from left edge
 */
class MammographyZoomTool extends ZoomTool {
  static toolName = 'MammographyZoom';

  constructor(toolProps = {}, defaultToolProps = {}) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Common zoom logic for drag (right-click)
   * Uses parallelScale for proper mammography viewport zooming
   * Uses FIXED anchor from imageBounds (same as magnification button)
   */
  _performChestWallZoom(viewport, zoomDelta) {
    // Get FIXED world coordinate from imageBounds (not affected by camera state)
    const anchorWorld = getFixedMidlineAnchor(viewport);

    if (!anchorWorld) {
      return;
    }

    // Get current camera
    const camera = viewport.getCamera();
    if (!camera) {
      return;
    }

    // For parallelScale (used in mammography), smaller value = more zoomed in
    // zoomDelta is negative when dragging up (zoom in), positive when dragging down (zoom out)
    const currentParallelScale = camera.parallelScale;
    let newParallelScale = currentParallelScale * (1 + zoomDelta);

    if (newParallelScale <= 0) {
      return;
    }

    // Clamp zoom-out to prevent gap at center boundary (midline constraint)
    const laterality = inferLateralityFromViewport(viewport);
    if (laterality) {
      const maxScale = computeMaxParallelScale(viewport, laterality);
      if (maxScale !== null && newParallelScale > maxScale) {
        newParallelScale = maxScale;
      }
    }

    // Calculate zoom ratio for camera shift
    const zoomRatio = newParallelScale / currentParallelScale;

    // Calculate the camera shift needed to keep chest wall fixed during zoom
    // For parallel projection: newFocalPoint = oldFocalPoint + (anchorWorld - oldFocalPoint) * (1 - ratio)
    const shift = [
      (anchorWorld[0] - camera.focalPoint[0]) * (1 - zoomRatio),
      (anchorWorld[1] - camera.focalPoint[1]) * (1 - zoomRatio),
      (anchorWorld[2] - camera.focalPoint[2]) * (1 - zoomRatio),
    ];

    // Apply zoom + shift atomically
    const updatedCamera = {
      ...camera,
      parallelScale: newParallelScale,
      focalPoint: [
        camera.focalPoint[0] + shift[0],
        camera.focalPoint[1] + shift[1],
        camera.focalPoint[2] + shift[2],
      ],
      position: [
        camera.position[0] + shift[0],
        camera.position[1] + shift[1],
        camera.position[2] + shift[2],
      ],
    };

    viewport.setCamera(updatedCamera);
    viewport.render();
  }

  /**
   * Override the drag zoom method to pin chest wall to edge
   * This responds to right-click drag only
   */
  _dragCallback(evt) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    if (!viewport) {
      return;
    }

    const zoomDelta = deltaPoints.canvas[1] / viewport.element.clientHeight;
    this._performChestWallZoom(viewport, zoomDelta);
  }
}

export default MammographyZoomTool;
