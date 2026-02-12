/**
 * Viewport helper utilities for mammography modes.
 * Normalizes viewport array access across Map, Array, and Object formats.
 * Each function is under 50 lines for maintainability.
 */

/** Viewport entry from the viewportGridService state. */
export interface ViewportType {
  viewportId?: string;
  viewportOptions?: { viewportId?: string };
  displaySetInstanceUIDs?: string[];
}

/**
 * Convert viewports from any container format (Map, Array, Object) to a flat array.
 * OHIF's viewportGridService stores viewports in different formats depending on version.
 */
export function toViewportArray(viewports: any): ViewportType[] {
  if (viewports instanceof Map) {
    return Array.from(viewports.values());
  }
  if (Array.isArray(viewports)) {
    return viewports;
  }
  return Object.values(viewports || {});
}

/**
 * Extract the viewport ID from a viewport entry.
 * Handles both direct `viewportId` and nested `viewportOptions.viewportId`.
 */
export function getViewportId(vp: ViewportType): string | undefined {
  return vp.viewportId || vp.viewportOptions?.viewportId;
}

/**
 * Filter viewport array to only include viewports that have valid Cornerstone elements.
 */
export function getValidViewports(
  viewportArray: ViewportType[],
  cornerstoneViewportService: any
): ViewportType[] {
  return viewportArray.filter(vp => {
    const viewportId = getViewportId(vp);
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    return viewport && viewport.element;
  });
}

/**
 * Safely refresh the toolbar state for a specific viewport.
 */
export function refreshToolbarForViewport(
  toolbarService: any,
  viewportId: string | undefined
): void {
  if (!viewportId) return;
  try {
    toolbarService?.refreshToolbarState?.({ viewportId });
  } catch {
    // Silently ignore toolbar refresh failures
  }
}
