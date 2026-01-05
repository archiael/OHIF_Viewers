import { ScaleOverlayTool, annotation } from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import { getRenderingEngines } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * ScaleOverlayToolWrapper extends ScaleOverlayTool to fix multi-viewport issues.
 *
 * The original ScaleOverlayTool has several problems:
 * 1. Global state (`viewportsWithAnnotations`) never gets cleared
 * 2. `editData` only stores a single viewport reference
 * 3. `renderAnnotation()` crashes with "Cannot read properties of undefined (reading 'data')"
 *    when switching to viewports that don't have annotations initialized
 * 4. `onSetToolEnabled()` only initializes the active viewport, not all viewports
 *
 * This wrapper adds:
 * - Viewport-specific state management
 * - Null safety checks in renderAnnotation
 * - Cleanup methods for proper state management
 * - Prevention of crashes when switching between viewports
 * - Automatic annotation creation for all viewports when enabled
 */
class ScaleOverlayToolWrapper extends ScaleOverlayTool {
  static toolName = 'ScaleOverlay';

  /**
   * Store viewport-specific rendering context to avoid global state issues
   */
  private _renderingViewport: Types.IViewport | null = null;

  /**
   * Track viewports that have been initialized to prevent re-initialization
   * This is separate from the parent class's global state
   */
  private _initializedViewports: Map<string, boolean> = new Map();


  constructor(toolProps = {}, defaultToolProps = {}) {
    // Ensure default configuration includes scaleLocation
    const defaultProps = {
      configuration: {
        viewportId: '',
        scaleLocation: 'bottom',
      },
      ...defaultToolProps,
    };
    super(toolProps, defaultProps);
  }


  /**
   * Helper method to check if the viewport's image has PixelSpacing.
   * ScaleOverlay should only be displayed for images with PixelSpacing.
   */
  private _hasPixelSpacing(viewport: Types.IViewport): boolean {
    try {
      // Get the viewport's default image
      const defaultImageId = viewport.getImageIds?.()?.[0] || (viewport as any).defaultImageId;
      if (!defaultImageId) {
        return false;
      }

      // Get metadata for the image
      const imagePlaneModule = cornerstone.metaData.get('imagePlaneModule', defaultImageId);
      const generalSeriesModule = cornerstone.metaData.get('generalSeriesModule', defaultImageId);

      // Check for PixelSpacing in various metadata locations
      const pixelSpacing =
        imagePlaneModule?.rowPixelSpacing && imagePlaneModule?.columnPixelSpacing
          ? [imagePlaneModule.rowPixelSpacing, imagePlaneModule.columnPixelSpacing]
          : imagePlaneModule?.pixelSpacing || generalSeriesModule?.pixelSpacing;

      return Boolean(pixelSpacing);
    } catch (error) {
      console.warn('ScaleOverlayTool: Error checking PixelSpacing:', error);
      return false;
    }
  }

  /**
   * Override renderAnnotation to add null safety and error handling.
   *
   * The parent class's renderAnnotation can crash when:
   * - Annotations don't exist for a viewport
   * - The viewport element is invalid
   * - The annotation data is not fully computed yet
   *
   * This override adds defensive checks and graceful degradation.
   * Additionally, it checks for PixelSpacing and skips rendering if not available.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: any
  ): boolean => {
    // Null safety check - ensure we have valid enabled element and viewport
    if (!enabledElement || !enabledElement.viewport || !enabledElement.viewport.element) {
      return false;
    }

    const { viewport } = enabledElement;

    // Check if the viewport's image has PixelSpacing
    // ScaleOverlay should only be displayed for images with PixelSpacing
    if (!this._hasPixelSpacing(viewport)) {
      // No PixelSpacing available - skip rendering
      return false;
    }

    // Check if annotations exist for this viewport
    const annotations = annotation.state.getAnnotations(this.getToolName(), viewport.element);
    if (!annotations || annotations.length === 0) {
      // No annotations yet - tool might not be enabled or not initialized yet
      return false;
    }

    // Find annotation for this specific viewport
    const viewportAnnotation = annotations.find(
      (ann: any) => ann.data?.viewportId === viewport.id
    );

    // Validate annotation has required data structure
    if (
      !viewportAnnotation ||
      !viewportAnnotation.data ||
      !viewportAnnotation.data.handles ||
      !viewportAnnotation.data.handles.points ||
      viewportAnnotation.data.handles.points.length < 4
    ) {
      // Annotation not ready yet
      return false;
    }

    // Check if handle points are properly computed (not all zeros)
    const points = viewportAnnotation.data.handles.points;
    const allZeros = points.every(
      (point: Types.Point3) => point[0] === 0 && point[1] === 0 && point[2] === 0
    );

    if (allZeros) {
      // Handle points not computed yet, skip rendering
      return false;
    }

    // Store the current rendering viewport
    this._renderingViewport = viewport;
    this._initializedViewports.set(viewport.id, true);

    try {
      // Call parent implementation with try-catch to prevent crashes
      return super.renderAnnotation(enabledElement, svgDrawingHelper);
    } catch (error) {
      // If parent crashes, log and gracefully degrade
      console.warn(`ScaleOverlayTool: Error rendering annotation for viewport ${viewport.id}:`, error);
      return false;
    }
  };

  /**
   * Override onSetToolEnabled to ensure proper initialization and mark tool as enabled.
   *
   * This is called when the tool is enabled. We need to call parent's onSetToolEnabled
   * which will call _init() to create properly initialized annotations.
   */
  onSetToolEnabled(): void {
    console.log('ScaleOverlayTool: onSetToolEnabled called');
    // Call _init directly to create annotations
    // The parent class (ScaleOverlayTool from @cornerstonejs/tools) should have this method
    try {
      if (typeof (this as any)._init === 'function') {
        console.log('ScaleOverlayTool: Calling _init()...');
        (this as any)._init();
      } else {
        console.warn('ScaleOverlayTool: _init method not found');
      }
    } catch (error) {
      console.warn('ScaleOverlayTool: Error during _init:', error);
    }

    // Wait for points computation then render
    console.log('ScaleOverlayTool: Waiting for points computation...');
    this._waitForPointsComputation();
  }

  /**
   * Wait for annotation handle points to be computed, then trigger rendering.
   * This ensures ScaleOverlay appears immediately when the tool is enabled.
   *
   * Uses polling to check if handle points are ready (not all zeros).
   * Polls every 50ms for up to 2000ms (40 attempts) to accommodate slower systems.
   */
  private async _waitForPointsComputation(): Promise<void> {
    const renderingEngines = getRenderingEngines();
    if (!renderingEngines || renderingEngines.length === 0) {
      console.warn('ScaleOverlayTool: No rendering engines found');
      return;
    }

    const maxAttempts = 40; // 50ms * 40 = 2000ms max (increased for slower systems)
    const pollInterval = 50; // 50ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let allPointsReady = true;
      let hasAnyAnnotations = false;

      // Check all viewports
      for (const renderingEngine of renderingEngines) {
        const viewports = renderingEngine.getViewports();

        for (const viewport of viewports) {
          if (!viewport.element) continue;

          const annotations = annotation.state.getAnnotations(
            this.getToolName(),
            viewport.element
          );

          if (!annotations || annotations.length === 0) {
            // No annotations yet for this viewport - keep waiting
            allPointsReady = false;
            continue;
          }

          hasAnyAnnotations = true;

          // Check if any annotation has uncomputed points
          for (const ann of annotations) {
            if (!ann.data?.handles?.points || ann.data.handles.points.length < 4) {
              allPointsReady = false;
              break;
            }

            const points = ann.data.handles.points;
            const allZeros = points.every(
              (point: Types.Point3) => point[0] === 0 && point[1] === 0 && point[2] === 0
            );

            if (allZeros) {
              allPointsReady = false;
              break;
            }
          }

          if (!allPointsReady) break;
        }

        if (!allPointsReady) break;
      }

      if (hasAnyAnnotations && allPointsReady) {
        // All points are ready, trigger render
        renderingEngines.forEach(engine => engine.render());
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached - log warning and force render anyway
    console.warn('ScaleOverlayTool: Points computation timeout after', maxAttempts * pollInterval, 'ms, forcing render');
    renderingEngines.forEach(engine => engine.render());
  }

  /**
   * Override onSetToolDisabled to clean up viewport-specific state.
   *
   * This is called when the tool is disabled. We use it to clear our
   * internal tracking state.
   */
  onSetToolDisabled(): void {
    this.cleanupAllViewports();

    // No need to call parent - just cleanup our state
  }

  /**
   * Clean up state for a specific viewport.
   *
   * @param viewportId - The ID of the viewport to clean up
   */
  public cleanupViewport(viewportId: string): void {
    if (this._initializedViewports.has(viewportId)) {
      this._initializedViewports.delete(viewportId);
    }

    // If this was the rendering viewport, clear it
    if (this._renderingViewport?.id === viewportId) {
      this._renderingViewport = null;
    }
  }

  /**
   * Clean up state for all viewports.
   *
   * This is called when:
   * - The tool is disabled
   * - VIEWPORT_NEW_IMAGE_SET event fires (handled by commandsModule)
   * - Need to reset all state
   */
  public cleanupAllViewports(): void {
    this._initializedViewports.clear();
    this._renderingViewport = null;
  }
}

export default ScaleOverlayToolWrapper;
