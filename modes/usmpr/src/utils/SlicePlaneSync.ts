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
    console.log('🔄 [SlicePlaneSync] Initializing...');
    console.log('🔄 [SlicePlaneSync] Event target type:', typeof eventTarget);
    console.log(
      '🔄 [SlicePlaneSync] Event target has addEventListener?',
      typeof eventTarget?.addEventListener
    );

    this.eventTarget = eventTarget;

    // Store viewport info mapping
    viewportInfos.forEach(info => {
      this.viewportInfoMap.set(info.viewportId, info);
      console.log(
        `📍 [SlicePlaneSync] Mapped viewport ${info.viewportId} to ${info.orientation} orientation`
      );
    });

    // Subscribe to camera modified events on GLOBAL event target
    this.subscribeToCameraEvents();

    // ALSO subscribe to events on EACH viewport's element
    this.subscribeToViewportElements(viewportInfos);

    // Perform initial update
    this.updateAllPlanes();

    console.log('✅ [SlicePlaneSync] Initialized with', viewportInfos.length, 'viewports');
  }

  /**
   * Subscribe to events on individual viewport elements
   */
  private subscribeToViewportElements(viewportInfos: ViewportInfo[]) {
    console.log('🎯 [SlicePlaneSync] Subscribing to events on individual viewport elements...');

    viewportInfos.forEach(viewportInfo => {
      const viewport = this.cornerstoneViewportService.getCornerstoneViewport(viewportInfo.viewportId);

      if (!viewport || !viewport.element) {
        console.warn(`⚠️ [SlicePlaneSync] Cannot get element for viewport ${viewportInfo.viewportId}`);
        return;
      }

      const element = viewport.element;
      console.log(`📡 [SlicePlaneSync] Got element for ${viewportInfo.viewportId}:`, element);

      // Create handler for this specific viewport
      const elementHandler = (evt: any) => {
        console.log(`🎬 [ELEMENT] Event on ${viewportInfo.viewportId}! Type: ${evt.type}`);

        if (!this.enabled) {
          console.log(`⏸️ [ELEMENT] Event ignored (disabled) on ${viewportInfo.viewportId}`);
          return;
        }

        console.log(`✅ [ELEMENT] Processing ${evt.type} for ${viewportInfo.orientation}`);
        this.debouncedUpdate(viewportInfo);
      };

      // Add listeners to the element
      element.addEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, elementHandler);
      element.addEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, elementHandler);
      element.addEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, elementHandler);
      element.addEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, elementHandler);

      console.log(`✅ [SlicePlaneSync] Subscribed to events on element for ${viewportInfo.viewportId}`);

      // Store cleanup function
      const cleanupKey = `element_${viewportInfo.viewportId}`;
      this.subscriptions.set(cleanupKey, () => {
        element.removeEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, elementHandler);
        element.removeEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, elementHandler);
        element.removeEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, elementHandler);
        element.removeEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, elementHandler);
        console.log(`🗑️ [SlicePlaneSync] Unsubscribed from ${viewportInfo.viewportId} element events`);
      });
    });

    console.log('✅ [SlicePlaneSync] Finished subscribing to viewport elements');
  }

  /**
   * Subscribe to Cornerstone camera events
   */
  private subscribeToCameraEvents() {
    if (!this.eventTarget) {
      console.warn('⚠️ [SlicePlaneSync] No event target available for camera event subscription');
      return;
    }

    console.log(
      '📡 [SlicePlaneSync] CAMERA_MODIFIED event name:',
      CornerstoneEnums.Events.CAMERA_MODIFIED
    );

    // Test listener to verify events are firing AT ALL
    const testHandler = (evt: any) => {
      console.log('🧪 [TEST] Event fired! Type:', evt.type, 'Enabled:', this.enabled, 'ViewportId:', evt.detail?.viewportId);
    };
    this.eventTarget.addEventListener(CornerstoneEnums.Events.CAMERA_MODIFIED, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, testHandler);
    this.eventTarget.addEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, testHandler);
    console.log('🧪 [TEST] Added test event listeners for CAMERA_MODIFIED, IMAGE_RENDERED, STACK_NEW_IMAGE, STACK_VIEWPORT_SCROLL');

    // Subscribe to CAMERA_MODIFIED events
    const cameraModifiedHandler = (evt: any) => {
      console.log('📸 [SlicePlaneSync] Event received! Type:', evt.type, 'Enabled:', this.enabled, 'ViewportId:', evt.detail?.viewportId);

      if (!this.enabled) {
        console.log('⏸️ [SlicePlaneSync] Event ignored because enabled=false');
        return;
      }

      if (!evt.detail) {
        console.warn('⚠️ [SlicePlaneSync] Event detail is missing!');
        return;
      }

      const { viewportId } = evt.detail;
      console.log('📸 [SlicePlaneSync] ViewportId from event:', viewportId);
      console.log('📸 [SlicePlaneSync] Tracked viewports:', Array.from(this.viewportInfoMap.keys()));

      // Check if this viewport is one we're tracking
      const viewportInfo = this.viewportInfoMap.get(viewportId);

      if (viewportInfo) {
        console.log('✅ [SlicePlaneSync] Viewport is tracked! Updating plane for', viewportInfo.orientation);
        // Debounce updates to avoid excessive rendering
        this.debouncedUpdate(viewportInfo);
      } else {
        console.log('⚠️ [SlicePlaneSync] Viewport not tracked:', viewportId);
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

    console.log('📡 [SlicePlaneSync] Subscribed to CAMERA_MODIFIED, IMAGE_RENDERED, STACK_NEW_IMAGE, and STACK_VIEWPORT_SCROLL events');

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
      this.eventTarget.removeEventListener(CornerstoneEnums.Events.STACK_VIEWPORT_SCROLL, testHandler);
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
      console.log(`🔄 [SlicePlaneSync] Updating plane for viewport ${viewportId} (${orientation})`);

      // Get the Cornerstone viewport
      const viewport = this.cornerstoneViewportService.getCornerstoneViewport(viewportId);

      if (!viewport) {
        console.warn(`⚠️ [SlicePlaneSync] Viewport ${viewportId} not found`);
        return;
      }

      // Get camera information
      const camera = viewport.getCamera();

      if (!camera) {
        console.warn(`⚠️ [SlicePlaneSync] Camera not available for viewport ${viewportId}`);
        return;
      }

      // Extract position and normal from camera
      const { focalPoint, viewPlaneNormal } = camera;

      if (!focalPoint || !viewPlaneNormal) {
        console.warn(
          `⚠️ [SlicePlaneSync] Camera focal point or view plane normal missing for ${viewportId}`
        );
        return;
      }

      console.log(
        `📐 [SlicePlaneSync] Camera data - focalPoint:`,
        focalPoint,
        'viewPlaneNormal:',
        viewPlaneNormal
      );

      // Update the slice plane
      this.slicePlaneManager.updatePlanePosition(
        orientation,
        [focalPoint[0], focalPoint[1], focalPoint[2]],
        [viewPlaneNormal[0], viewPlaneNormal[1], viewPlaneNormal[2]]
      );

      // Trigger render
      this.slicePlaneManager.render();
      console.log(`✅ [SlicePlaneSync] Plane updated and rendered for ${orientation}`);
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
    console.log('🔄 [SlicePlaneSync] Updating all slice planes...');

    this.viewportInfoMap.forEach(viewportInfo => {
      this.updatePlaneForViewport(viewportInfo);
    });

    console.log('✅ [SlicePlaneSync] All slice planes updated');
  }

  /**
   * Enable/disable synchronization
   */
  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`${enabled ? '✅' : '⏸️'} SlicePlaneSync ${enabled ? 'enabled' : 'disabled'}`);
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

    console.log(`➕ Added viewport ${viewportId} (${orientation}) to synchronization`);

    // Update plane for newly added viewport
    this.updatePlaneForViewport(viewportInfo);
  }

  /**
   * Remove a viewport from synchronization
   */
  public removeViewport(viewportId: string) {
    const removed = this.viewportInfoMap.delete(viewportId);

    if (removed) {
      console.log(`➖ Removed viewport ${viewportId} from synchronization`);
    } else {
      console.warn(`⚠️ Viewport ${viewportId} was not being synchronized`);
    }
  }

  /**
   * Clean up resources
   */
  public destroy() {
    console.log('🗑️ Destroying SlicePlaneSync...');

    // Clear debounce timer
    if (this.updateDebounceTimer !== null) {
      clearTimeout(this.updateDebounceTimer);
      this.updateDebounceTimer = null;
    }

    // Unsubscribe from all events
    this.subscriptions.forEach((unsubscribe, eventName) => {
      try {
        unsubscribe();
        console.log(`✅ Unsubscribed from ${eventName}`);
      } catch (error) {
        console.error(`❌ Failed to unsubscribe from ${eventName}:`, error);
      }
    });

    this.subscriptions.clear();
    this.viewportInfoMap.clear();
    this.eventTarget = null;

    console.log('✅ SlicePlaneSync destroyed');
  }
}

export default SlicePlaneSync;
