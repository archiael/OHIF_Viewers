/**
 * Slice Plane Synchronization Service
 *
 * Synchronizes slice plane positions in the 3D viewport with the current
 * slice positions from the 2D MPR viewports. Subscribes to viewport events
 * and updates slice planes when the user navigates through MPR slices.
 */

import { SlicePlaneManager, SliceOrientation } from './SlicePlaneManager';
import { Enums as CornerstoneEnums } from '@cornerstonejs/core';

export interface ViewportInfo {
  viewportId: string;
  orientation: SliceOrientation;
}

export class SlicePlaneSync {
  private slicePlaneManager: SlicePlaneManager;
  private cornerstoneViewportService: any;
  private eventTarget: any; // Cornerstone event target
  private subscriptions: Map<string, () => void>; // Event unsubscribe functions
  private viewportInfoMap: Map<string, ViewportInfo>; // Maps viewport IDs to orientations
  private updateDebounceTimer: number | null = null;
  private enabled: boolean = true;

  constructor(slicePlaneManager: SlicePlaneManager, cornerstoneViewportService: any) {
    this.slicePlaneManager = slicePlaneManager;
    this.cornerstoneViewportService = cornerstoneViewportService;
    this.subscriptions = new Map();
    this.viewportInfoMap = new Map();
  }

  /**
   * Initialize synchronization for specific viewports
   */
  public initialize(viewportInfos: ViewportInfo[], eventTarget: any) {
    this.eventTarget = eventTarget;

    // Store viewport info mapping
    viewportInfos.forEach(info => {
      this.viewportInfoMap.set(info.viewportId, info);
    });

    // Subscribe to camera modified events on GLOBAL event target
    this.subscribeToCameraEvents();

    // ALSO subscribe to events on EACH viewport's element
    this.subscribeToViewportElements(viewportInfos);

    // Perform initial update
    this.updateAllPlanes();
  }

  /**
   * Subscribe to events on individual viewport elements
   * Delegates to retry method to handle race conditions during layout changes
   */
  private subscribeToViewportElements(viewportInfos: ViewportInfo[]) {
    viewportInfos.forEach(viewportInfo => {
      this.subscribeToViewportElementWithRetry(viewportInfo, 0);
    });
  }

  /**
   * Subscribe to viewport element with retry logic
   * Handles race condition where viewport elements aren't ready yet during layout changes
   * @param viewportInfo - Viewport information (id and orientation)
   * @param attemptNum - Current retry attempt number (0-indexed)
   */
  private subscribeToViewportElementWithRetry(viewportInfo: ViewportInfo, attemptNum: number) {
    const maxAttempts = 5;
    const retryDelay = 100 * Math.pow(2, attemptNum); // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms

    const viewport = this.cornerstoneViewportService.getCornerstoneViewport(
      viewportInfo.viewportId
    );

    if (!viewport || !viewport.element) {
      if (attemptNum < maxAttempts) {
        console.warn(
          `⚠️ [SlicePlaneSync] Viewport ${viewportInfo.viewportId} not ready, retrying in ${retryDelay}ms (attempt ${attemptNum + 1}/${maxAttempts})`
        );
        setTimeout(() => {
          this.subscribeToViewportElementWithRetry(viewportInfo, attemptNum + 1);
        }, retryDelay);
        return;
      } else {
        console.error(
          `❌ [SlicePlaneSync] Failed to subscribe to viewport ${viewportInfo.viewportId} after ${maxAttempts} attempts`
        );
        return;
      }
    }

    // Viewport is ready, subscribe to events
    const element = viewport.element;

    // Create handler for this specific viewport
    const elementHandler = (evt: any) => {
      if (!this.enabled) {
        return;
      }

      this.debouncedUpdate(viewportInfo);
    };

    // Add listeners to the element
    element.addEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, elementHandler);
    element.addEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, elementHandler);
    element.addEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, elementHandler);
    element.addEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, elementHandler);

    // Store cleanup function
    const cleanupKey = `element_${viewportInfo.viewportId}`;
    this.subscriptions.set(cleanupKey, () => {
      element.removeEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, elementHandler);
      element.removeEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, elementHandler);
      element.removeEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, elementHandler);
      element.removeEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, elementHandler);
    });
  }

  /**
   * Subscribe to Cornerstone camera events
   */
  private subscribeToCameraEvents() {
    // Silent return if eventTarget not ready yet (normal during initialization)
    if (!this.eventTarget) {
      return;
    }

    // Test listener to verify events are firing AT ALL
    const testHandler = (evt: any) => {
      // console.log('🧪 [TEST] Event fired! Type:', evt.type, 'Enabled:', this.enabled, 'ViewportId:', evt.detail?.viewportId);
    };
    this.eventTarget.addEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, testHandler);

    // Subscribe to CAMERA_MODIFIED events
    const cameraModifiedHandler = (evt: any) => {
      if (!this.enabled) {
        return;
      }

      if (!evt.detail) {
        console.warn('⚠️ [SlicePlaneSync] Event detail is missing!');
        return;
      }

      const { viewportId } = evt.detail;

      // Check if this viewport is one we're tracking
      const viewportInfo = this.viewportInfoMap.get(viewportId);

      if (viewportInfo) {
        // Debounce updates to avoid excessive rendering
        this.debouncedUpdate(viewportInfo);
      } else {
        // console.log('⚠️ [SlicePlaneSync] Viewport not tracked:', viewportId);
      }
    };

    this.eventTarget.addEventListener(
      CornerstoneEnums.Events.CAMERA_MODIFIED,
      cameraModifiedHandler
    );

    // Add listener for IMAGE_RENDERED
    this.eventTarget.addEventListener(
      CornerstoneEnums.Events.IMAGE_RENDERED,
      cameraModifiedHandler
    );

    // CRITICAL: Add listener for STACK_NEW_IMAGE - this fires when scrolling through MPR slices!
    this.eventTarget.addEventListener(
      CornerstoneEnums.Events.STACK_NEW_IMAGE,
      cameraModifiedHandler
    );

    // Also listen to STACK_VIEWPORT_SCROLL as backup
    this.eventTarget.addEventListener(
      CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL,
      cameraModifiedHandler
    );

    // Store unsubscribe function
    this.subscriptions.set('ALL_EVENTS', () => {
      // Remove main handlers
      this.eventTarget.removeEventListener(
        CornerstoneEnums.Events.CAMERA_MODIFIED,
        cameraModifiedHandler
      );
      this.eventTarget.removeEventListener(
        CornerstoneEnums.Events.IMAGE_RENDERED,
        cameraModifiedHandler
      );
      this.eventTarget.removeEventListener(
        CornerstoneEnums.Events.STACK_NEW_IMAGE,
        cameraModifiedHandler
      );
      this.eventTarget.removeEventListener(
        CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL,
        cameraModifiedHandler
      );

      // Remove test handlers
      this.eventTarget.removeEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, testHandler);
      this.eventTarget.removeEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, testHandler);
      this.eventTarget.removeEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, testHandler);
      this.eventTarget.removeEventListener(
        CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL,
        testHandler
      );
    });
  }

  /**
   * Debounced update to avoid excessive updates
   */
  private debouncedUpdate(viewportInfo: ViewportInfo) {
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
    }

    this.updateDebounceTimer = window.setTimeout(() => {
      this.updatePlaneForViewport(viewportInfo);
      this.updateDebounceTimer = null;
    }, 10); // Reduced to 10ms for smoother updates
  }

  /**
   * Update slice plane for a specific viewport
   */
  private updatePlaneForViewport(viewportInfo: ViewportInfo) {
    try {
      const { viewportId, orientation } = viewportInfo;
      // Get the Cornerstone viewport
      const viewport = this.cornerstoneViewportService.getCornerstoneViewport(viewportId);

      if (!viewport) {
        console.warn(`⚠️ [SlicePlaneSync] Viewport ${viewportId} not found`);
        return;
      }

      // Get camera information
      // Camera focal point = crosshair center position in world coordinates
      // View plane normal = direction the slice plane is facing
      const camera = viewport.getCamera();

      if (!camera) {
        console.warn(`⚠️ [SlicePlaneSync] Camera not available for viewport ${viewportId}`);
        return;
      }

      const { focalPoint, viewPlaneNormal } = camera;

      if (!focalPoint || !viewPlaneNormal) {
        console.warn(
          `⚠️ [SlicePlaneSync] Camera focal point or view plane normal missing for ${viewportId}`
        );
        return;
      }

      // focalPoint is the crosshair center - this is where the slice plane should be
      const slicePosition: [number, number, number] = [focalPoint[0], focalPoint[1], focalPoint[2]];

      // Update the slice plane to crosshair position
      this.slicePlaneManager.updatePlanePosition(orientation, slicePosition, [
        viewPlaneNormal[0],
        viewPlaneNormal[1],
        viewPlaneNormal[2],
      ]);

      // Trigger render
      this.slicePlaneManager.render();
    } catch (error) {
      console.error(
        `❌ [SlicePlaneSync] Failed to update ${viewportInfo.orientation} plane:`,
        error
      );
    }
  }

  /**
   * Update all slice planes from current viewport states
   */
  public updateAllPlanes() {
    this.viewportInfoMap.forEach(viewportInfo => {
      this.updatePlaneForViewport(viewportInfo);
    });
  }

  /**
   * Enable/disable synchronization
   */
  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Check if synchronization is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Add a new viewport to synchronization
   */
  public addViewport(viewportId: string, orientation: SliceOrientation) {
    if (this.viewportInfoMap.has(viewportId)) {
      console.warn(`⚠️ Viewport ${viewportId} already being synchronized`);
      return;
    }

    const viewportInfo: ViewportInfo = { viewportId, orientation };
    this.viewportInfoMap.set(viewportId, viewportInfo);

    // Update plane for newly added viewport
    this.updatePlaneForViewport(viewportInfo);
  }

  /**
   * Remove a viewport from synchronization
   */
  public removeViewport(viewportId: string) {
    const removed = this.viewportInfoMap.delete(viewportId);

    if (removed) {
    } else {
      console.warn(`⚠️ Viewport ${viewportId} was not being synchronized`);
    }
  }

  /**
   * Clean up resources
   */
  public destroy() {
    // Clear debounce timer
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }

    // Unsubscribe from all events
    this.subscriptions.forEach((unsubscribe, eventName) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`❌ Failed to unsubscribe from ${eventName}:`, error);
      }
    });

    this.subscriptions.clear();
    this.viewportInfoMap.clear();
    this.eventTarget = null;
  }
}

export default SlicePlaneSync;
