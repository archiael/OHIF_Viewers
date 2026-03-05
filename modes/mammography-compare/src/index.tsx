/**
 * Mammography Compare Mode
 *
 * @description
 * Side-by-side comparison of current and prior mammography studies.
 *
 * LAYOUT (1×4 per stage; left 2 = Current, right 2 = Prior):
 * ┌──────────┬──────────┬──────────────────┬──────────────────┐
 * │Current   │Current   │   Prior RCC      │   Prior LCC      │
 * │  RCC     │  LCC     │mammo-compare-rcc │mammo-compare-lcc │
 * │mammo-rcc │mammo-lcc │                  │                  │
 * └──────────┴──────────┴──────────────────┴──────────────────┘
 * (CC stage; MLO stage has same structure with RMLO/LMLO)
 *
 * FEATURES:
 * - FR-3.3.2: Exit Compare button
 * - FR-2.5.5: Mirror Mode (chest wall alignment + L↔R sync within each study)
 * - FR-3.3.9: Compare Sync (cross-study pan/zoom sync)
 *
 * SYNC MATRIX:
 * | Mirror | Compare | Active cell effect                                       |
 * |--------|---------|----------------------------------------------------------|
 * | OFF    | OFF     | Only active cell changes                                 |
 * | ON     | OFF     | Active + same-study mirror pair (X-inverted pan)         |
 * | OFF    | ON      | Active + other-study same-position (direct copy)         |
 * | ON     | ON      | Active + mirror pair + compare pair + compare mirror     |
 *
 * VIEWPORT IDs:
 * Current study: mammo-rcc, mammo-lcc, mammo-rmlo, mammo-lmlo
 * Prior study:   mammo-compare-rcc, mammo-compare-lcc, mammo-compare-rmlo, mammo-compare-lmlo
 */

import { hotkeys, ToolbarService } from '@ohif/core';
import { Enums as csEnums, cache as csCache, metaData as csMetaData } from '@cornerstonejs/core';
import { SeriesLateralityManager } from '@ohif/core';
import { id } from './id';
import toolbarButtons from './toolbarButtons';
import commandsModule from './commandsModule';
import evaluatorsModule from './evaluatorsModule';
import { useMammographyCompareStore } from './store';
import initToolGroups from '../../mammography/src/initToolGroups';
import { clampPanToMidlineBoundary } from '../../mammography-shared/src/utils/midlineBoundaryConstraint';

const { TOOLBAR_SECTIONS } = ToolbarService;

// ── Viewport ID helpers ────────────────────────────────────────────────────

/**
 * Returns the mirror-pair viewport ID within the same study (L↔R).
 *
 * Mapping (bidirectional):
 *   mammo-rcc         ↔ mammo-lcc
 *   mammo-rmlo        ↔ mammo-lmlo
 *   mammo-compare-rcc ↔ mammo-compare-lcc
 *   mammo-compare-rmlo↔ mammo-compare-lmlo
 *
 * The simple string-replace works because the viewport ID convention
 * guarantees exactly one of {rcc, lcc, rmlo, lmlo} appears in each ID.
 *
 * @returns The mirrored viewport ID, or null if the ID doesn't match
 *          any known laterality pattern.
 */
function getMirrorPairId(viewportId: string): string | null {
  if (viewportId.includes('rcc')) return viewportId.replace('rcc', 'lcc');
  if (viewportId.includes('lcc')) return viewportId.replace('lcc', 'rcc');
  if (viewportId.includes('rmlo')) return viewportId.replace('rmlo', 'lmlo');
  if (viewportId.includes('lmlo')) return viewportId.replace('lmlo', 'rmlo');
  return null;
}

/**
 * Returns the compare-pair viewport ID across studies (current ↔ prior).
 *
 * Mapping (bidirectional):
 *   mammo-rcc  ↔ mammo-compare-rcc
 *   mammo-lcc  ↔ mammo-compare-lcc
 *   mammo-rmlo ↔ mammo-compare-rmlo
 *   mammo-lmlo ↔ mammo-compare-lmlo
 *
 * Note: COMPARE_PREFIX check must come before CURRENT_PREFIX check because
 * 'mammo-compare-rcc'.startsWith('mammo-') is also true — order matters.
 *
 * @returns The compare-pair viewport ID, or null for unknown IDs.
 */
function getComparePairId(viewportId: string): string | null {
  const COMPARE_PREFIX = 'mammo-compare-';
  const CURRENT_PREFIX = 'mammo-';
  if (viewportId.startsWith(COMPARE_PREFIX)) {
    return CURRENT_PREFIX + viewportId.slice(COMPARE_PREFIX.length);
  }
  if (viewportId.startsWith(CURRENT_PREFIX)) {
    return COMPARE_PREFIX + viewportId.slice(CURRENT_PREFIX.length);
  }
  return null;
}

// ── Display Area constants (chest wall alignment) ──────────────────────────
//
// Cornerstone setDisplayArea() maps an image point to a canvas point.
// For mammography, we anchor the chest wall edge so that side-by-side
// images are spatially registered:
//
//   imageArea:        [1.0, 1.0] = fit entire image in the viewport
//   imageCanvasPoint: { imagePoint: [x, y], canvasPoint: [cx, cy] }
//     - imagePoint  = normalized image coordinate (0=left/top, 1=right/bottom)
//     - canvasPoint = normalized canvas coordinate (0=left/top, 1=right/bottom)
//
// RIGHT breast: chest wall on the RIGHT → anchor image x=1 to canvas x=1
// LEFT breast:  chest wall on the LEFT  → anchor image x=0 to canvas x=0
// Unknown:      center image normally    → anchor image x=0.5 to canvas x=0.5

const RIGHT_BREAST_DISPLAY_AREA = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],
  imageCanvasPoint: { imagePoint: [1, 0.5], canvasPoint: [1.0, 0.5] },
};

const LEFT_BREAST_DISPLAY_AREA = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],
  imageCanvasPoint: { imagePoint: [0, 0.5], canvasPoint: [0.0, 0.5] },
};

const CENTER_DISPLAY_AREA = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],
  imageCanvasPoint: { imagePoint: [0.5, 0.5], canvasPoint: [0.5, 0.5] },
};

// ── Module-level state (reset on mode exit) ────────────────────────────────
//
// Module-level (not React state) because these need to survive React re-renders
// and be accessible inside Cornerstone event callbacks without stale closures.
// All are explicitly cleared in onModeExit and re-initialised in onModeEnter.

interface ViewportListenerEntry {
  element: HTMLElement;
  cameraHandler: (e: Event) => void;
  stackHandler: (e: Event) => void;
  renderedHandler: (e: Event) => void;
}

/** Map of viewportId → registered DOM event listeners (for cleanup) */
const _listenerMap = new Map<string, ViewportListenerEntry>();

/** Subscription handle for VIEWPORT_DATA_CHANGED service event */
let _viewportDataChangedSub: { unsubscribe: () => void } | null = null;

/**
 * Laterality cache: maps viewportId → 'R' | 'L'
 * Populated on VIEWPORT_DATA_CHANGED, cleared on mode exit.
 * Used by applyChestWallAlignment without re-querying the service layer.
 */
const _lateralityCache = new Map<string, 'R' | 'L'>();

/**
 * Camera sync mutex.
 * Set to true while applyToViewport() is executing, so that the secondary
 * CAMERA_MODIFIED events fired by tVp.setPan / tVp.setCamera are ignored.
 * Object (not primitive) so the closure always references the same mutable object.
 */
const _compareSyncState = { isSyncing: false };

/**
 * Tracks viewports that have already received auto-windowing this frame.
 * Cleared on STACK_NEW_IMAGE (new image → re-window) to ensure the correct
 * W/L is applied whenever the displayed image changes.
 */
const _autoWindowedSet = new Set<string>();

/**
 * Tracks viewports that have already received chest wall alignment for the
 * currently loaded displaySet (FR-2.5.5, oracle #14).
 *
 * WHY THIS EXISTS:
 *   applyChestWallAlignment() calls viewport.setDisplayArea() which fires
 *   CAMERA_MODIFIED. If called on every IMAGE_RENDERED, it resets the camera
 *   back to the fit-to-screen state after every zoom/pan sync, because:
 *     1. User zooms A → sync copies zoom to B (isSyncing=true during sync)
 *     2. B renders asynchronously (RAF) → IMAGE_RENDERED → applyChestWallAlignment
 *     3. setDisplayArea resets B to fit-to-screen → CAMERA_MODIFIED fires
 *     4. isSyncing is now false → B's handler syncs fit-to-screen back to A
 *     5. A's zoom is lost!
 *
 * FIX: Apply chest wall alignment only ONCE per displaySet load.
 *   - Added to set after successful alignment in IMAGE_RENDERED or VIEWPORT_DATA_CHANGED
 *   - Cleared for viewport on VIEWPORT_DATA_CHANGED (new series = needs fresh alignment)
 *   - Fully cleared on mode enter/exit
 */
const _chestWallAlignedSet = new Set<string>();

/**
 * Auto-pairing state
 *
 * When the user drags a series to any compare viewport, all 4 viewports
 * are updated to show the matched series from both studies (auto-pairing).
 *
 * Loop prevention strategy:
 *   1. _isApplyingPairedLayout: synchronous guard; set true during the
 *      setDisplaySetsForViewport calls, reset in finally block.
 *   2. _expectedPairDisplaySets: maps viewportId → dsUID for the changes WE
 *      initiated. When VIEWPORT_DATA_CHANGED fires for a known (vpId, uid)
 *      pair, the event is ignored. This handles the asynchronous case where
 *      _isApplyingPairedLayout has already been reset when the event fires.
 *
 * Startup delay:
 *   _autoPairingEnabled is false for 2 seconds after onModeEnter. This
 *   prevents the initial Hanging Protocol display-set assignments from
 *   being mis-interpreted as user drag-and-drop actions.
 *   _autoPairingTimer stores the handle so it can be cleared on early exit.
 */
let _isApplyingPairedLayout = false;
let _autoPairingEnabled = false;
const _expectedPairDisplaySets = new Map<string, string>(); // viewportId → dsUID
let _autoPairingTimer: ReturnType<typeof setTimeout> | null = null;

// ── Auto-pairing helpers ──────────────────────────────────────────────────

/**
 * Detects the mammographic view type (CC or MLO) from a displaySet.
 *
 * Detection priority:
 * 1. ViewCode DICOM attribute (SNOMED CT coded values — most reliable):
 *    - SCT:399162004 = Cranio-caudal (CC)
 *    - SCT:399368009 = Medio-lateral oblique (MLO)
 * 2. SeriesDescription keyword match (fallback for non-coded DICOM):
 *    - 'CC' in description → CC
 *    - 'MLO' in description → MLO
 *
 * Priority rule: if both CC and MLO match (ambiguous description like "CC/MLO"),
 * MLO takes precedence. If CC only, return CC.
 *
 * Description-based CC detection uses a word-boundary regex to avoid false
 * positives from series whose description happens to contain "CC" as part of
 * another word (e.g., "RACCOON", "ACCRUAL", "MACCEL").
 * Pattern `/\b(?:[RL]\s*)?CC\b/` matches: RCC, LCC, CC, R CC, L CC.
 *
 * ViewCode is coerced to String defensively because some DICOM parsers may
 * return a Code Sequence object instead of a string.
 *
 * @param ds - OHIF displaySet object
 * @returns 'CC', 'MLO', or null if view type cannot be determined
 */
function detectViewType(ds: any): 'CC' | 'MLO' | null {
  const desc = (ds?.SeriesDescription || '').toUpperCase();
  // Coerce to string: ViewCode may be an object (DICOM Code Sequence) in some implementations
  const viewCode = String(ds?.ViewCode || '');
  // Use word-boundary regex to avoid false positives (e.g., "RACCOON" ≠ CC, "MLO" substring is unique enough)
  const isCC = viewCode.includes('SCT:399162004') || /\b(?:[RL]\s*)?CC\b/.test(desc);
  const isMLO = viewCode.includes('SCT:399368009') || desc.includes('MLO');
  if (isCC && !isMLO) return 'CC';
  if (isMLO) return 'MLO';
  if (isCC) return 'CC';
  return null;
}

/**
 * Returns the 4 viewport IDs for the active CC or MLO pair group.
 *
 * Based on the viewport the user interacted with, this determines which
 * group of 4 viewports to update during auto-pairing:
 *
 *   CC group : { rLeft: 'mammo-rcc',  lLeft: 'mammo-lcc',
 *                rRight: 'mammo-compare-rcc', lRight: 'mammo-compare-lcc' }
 *   MLO group: { rLeft: 'mammo-rmlo', lLeft: 'mammo-lmlo',
 *                rRight: 'mammo-compare-rmlo', lRight: 'mammo-compare-lmlo' }
 *
 * The naming convention:
 *   rLeft/lLeft   = Right/Left breast on the LEFT (current study) side
 *   rRight/lRight = Right/Left breast on the RIGHT (prior study) side
 *
 * @param viewportId - The viewport that triggered the data change
 * @returns 4-viewport group definition, or null if not a compare viewport
 */
function getComparePairViewports(
  viewportId: string
): { rLeft: string; lLeft: string; rRight: string; lRight: string } | null {
  if (viewportId.includes('rcc') || viewportId.includes('lcc')) {
    return {
      rLeft: 'mammo-rcc',
      lLeft: 'mammo-lcc',
      rRight: 'mammo-compare-rcc',
      lRight: 'mammo-compare-lcc',
    };
  }
  if (viewportId.includes('rmlo') || viewportId.includes('lmlo')) {
    return {
      rLeft: 'mammo-rmlo',
      lLeft: 'mammo-lmlo',
      rRight: 'mammo-compare-rmlo',
      lRight: 'mammo-compare-lmlo',
    };
  }
  return null;
}

/**
 * FR-3.3.x: Auto-pairing on drag-and-drop
 *
 * When the user drops a series onto any compare-mode viewport:
 * 1. Detect the view type (CC/MLO) and laterality (R/L) of the dropped series.
 * 2. Find the matching pair series from the same study (partner laterality).
 * 3. Find matching series from the other study (same view type, both lateralities).
 * 4. Load all 4 displaySets into the 4 compare viewports.
 *    Viewports with no matching series are left blank (empty UIDs array).
 *
 * Unchanged viewport (the one the user directly dropped onto) is also
 * re-assigned so that the type/laterality consistency is always enforced.
 *
 * Loop prevention: we record the UIDs we are about to set in
 * _expectedPairDisplaySets; subsequent VIEWPORT_DATA_CHANGED events for
 * those UIDs are ignored.
 */
function applyAutoPairing(viewportId: string, servicesManager: any) {
  if (_isApplyingPairedLayout) return;

  const pairViewports = getComparePairViewports(viewportId);
  if (!pairViewports) return;

  const { viewportGridService, displaySetService } = servicesManager.services;

  // ── Get the displaySet the user just dropped ────────────────────────────
  const vpState = viewportGridService.getState();
  const vpArray: any[] =
    vpState.viewports instanceof Map
      ? Array.from(vpState.viewports.values())
      : Object.values(vpState.viewports || {});

  const changedVP = vpArray.find(
    (vp: any) => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
  );
  const changedDSUID: string | undefined = (changedVP?.displaySetInstanceUIDs || [])[0];
  if (!changedDSUID) return;

  const changedDS = displaySetService.getDisplaySetByUID(changedDSUID);
  if (!changedDS) return;

  const changedStudyUID: string = changedDS.StudyInstanceUID;
  const changedViewType = detectViewType(changedDS);
  const changedLaterality = SeriesLateralityManager.detectLaterality(changedDS);

  if (!changedViewType || (changedLaterality !== 'R' && changedLaterality !== 'L')) return;

  // isLeftSide: determine whether the dropped series belongs to the "current" study
  // (left column) or the "prior" study (right column).
  //
  // Viewport-ID-based heuristic (!startsWith('mammo-compare-')) is WRONG when a user
  // drags a prior-study series onto a current-study viewport or vice-versa.
  //
  // Correct approach: compare changedStudyUID against the current study UID from the URL.
  // URL format: StudyInstanceUIDs=<current>,<prior>  (index 0 = current, per HP convention)
  const urlStudyUIDs = new URLSearchParams(window.location.search)
    .get('StudyInstanceUIDs')
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean) || [];
  const currentStudyUID = urlStudyUIDs[0] ?? null;
  // If URL parsing fails (e.g., direct navigation), fall back to viewport-ID heuristic
  const isLeftSide = currentStudyUID
    ? changedStudyUID === currentStudyUID
    : !viewportId.startsWith('mammo-compare-');

  // ── Find all 4 needed displaySets ──────────────────────────────────────
  // getActiveDisplaySets() is the correct OHIF API (getDisplaySets does not exist)
  const allDS: any[] = displaySetService.getActiveDisplaySets?.() || [];
  if (allDS.length === 0) return; // No displaySets loaded yet, bail out safely

  const otherStudyUID =
    [...new Set(allDS.map((ds: any) => ds.StudyInstanceUID as string))].find(
      uid => uid !== changedStudyUID
    ) || null;

  const findDS = (studyUID: string | null, viewType: string, laterality: string): any | null => {
    if (!studyUID) return null;
    return (
      allDS.find(
        (ds: any) =>
          ds.StudyInstanceUID === studyUID &&
          detectViewType(ds) === viewType &&
          SeriesLateralityManager.detectLaterality(ds) === laterality
      ) || null
    );
  };

  const sameR = findDS(changedStudyUID, changedViewType, 'R');
  const sameL = findDS(changedStudyUID, changedViewType, 'L');
  const otherR = findDS(otherStudyUID, changedViewType, 'R');
  const otherL = findDS(otherStudyUID, changedViewType, 'L');

  // Left column = current study, Right column = prior study
  const leftRDS = isLeftSide ? sameR : otherR;
  const leftLDS = isLeftSide ? sameL : otherL;
  const rightRDS = isLeftSide ? otherR : sameR;
  const rightLDS = isLeftSide ? otherL : sameL;

  // ── Apply to all 4 viewports ───────────────────────────────────────────
  //
  // Loop prevention design note:
  //   _isApplyingPairedLayout is a synchronous re-entrancy guard. It prevents
  //   a second applyAutoPairing() call if VIEWPORT_DATA_CHANGED fires before
  //   this function returns (which can happen synchronously in some OHIF builds).
  //
  //   HOWEVER, ViewportGridService.setDisplaySetsForViewports() is async, so
  //   _isApplyingPairedLayout is reset to false BEFORE the viewport updates
  //   complete and their VIEWPORT_DATA_CHANGED events fire. Therefore:
  //   → The REAL loop prevention relies on _expectedPairDisplaySets (below).
  //   → _isApplyingPairedLayout guards only against synchronous re-entrancy.
  //
  //   _expectedPairDisplaySets: maps viewportId → dsUID for every change WE
  //   initiate. When VIEWPORT_DATA_CHANGED fires for a known (vpId, uid) pair,
  //   the handler skips applyAutoPairing for that event (see subscriber above).
  _isApplyingPairedLayout = true;
  try {
    const assignments: [string, any | null][] = [
      [pairViewports.rLeft, leftRDS],
      [pairViewports.lLeft, leftLDS],
      [pairViewports.rRight, rightRDS],
      [pairViewports.lRight, rightLDS],
    ];

    // Batch all 4 viewport updates in a single service call to reduce
    // the number of state updates and VIEWPORT_DATA_CHANGED events.
    const viewportsToUpdate = assignments.map(([vpId, ds]) => {
      const uid = ds?.displaySetInstanceUID;
      if (uid) _expectedPairDisplaySets.set(vpId, uid);
      return {
        viewportId: vpId,
        displaySetInstanceUIDs: uid ? [uid] : [],
      };
    });
    viewportGridService.setDisplaySetsForViewports(viewportsToUpdate);
  } finally {
    _isApplyingPairedLayout = false;
  }
}

// ── Chest wall alignment ───────────────────────────────────────────────────

/**
 * Applies chest wall alignment display area to a viewport (FR-2.5.5).
 *
 * For side-by-side mammography comparison, chest walls must be aligned at
 * the inner edge so radiologists can compare tissue patterns symmetrically:
 *
 *   RIGHT breast → chest wall is on the RIGHT edge of the image
 *                  (imagePoint x=1.0 anchored to canvas x=1.0)
 *   LEFT breast  → chest wall is on the LEFT edge of the image
 *                  (imagePoint x=0.0 anchored to canvas x=0.0)
 *   Unknown      → center the image (imagePoint x=0.5, canvas x=0.5)
 *
 * Reads laterality from `_lateralityCache` (populated on VIEWPORT_DATA_CHANGED).
 * If the cache is empty (e.g., series not yet loaded), the call is a no-op;
 * IMAGE_RENDERED will retry once the canvas is ready.
 *
 * @param viewportId - Target viewport ID
 * @param cornerstoneViewportService - Cornerstone viewport service
 */
/**
 * @returns true if alignment was successfully applied, false if canvas was not
 *   ready (0-sized). Callers use the return value to decide whether to add the
 *   viewport to _chestWallAlignedSet (only add on success so IMAGE_RENDERED retries).
 */
function applyChestWallAlignment(viewportId: string, cornerstoneViewportService: any): boolean {
  try {
    const laterality = _lateralityCache.get(viewportId);
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
    if (!viewport) return false;

    // Skip if the canvas has no dimensions yet (viewport not yet visible).
    // IMAGE_RENDERED will fire again once the canvas is properly sized.
    const element = viewport.element as HTMLElement | null;
    if (!element || element.clientWidth === 0 || element.clientHeight === 0) {
      return false;
    }

    const displayArea =
      laterality === 'R'
        ? RIGHT_BREAST_DISPLAY_AREA
        : laterality === 'L'
        ? LEFT_BREAST_DISPLAY_AREA
        : CENTER_DISPLAY_AREA;

    viewport.setDisplayArea(displayArea);
    viewport.render();
    return true;
  } catch (e) {
    // canvas may not be ready; IMAGE_RENDERED will retry
    return false;
  }
}

// ── Laterality detection ───────────────────────────────────────────────────

/**
 * Detects and caches the laterality ('R' or 'L') for a viewport.
 *
 * The laterality is read from the displaySet currently shown in the viewport
 * and stored in `_lateralityCache` so that `applyChestWallAlignment` can
 * access it without re-querying the service layer on every render.
 *
 * Cache is invalidated on VIEWPORT_DATA_CHANGED (new series loaded) and
 * fully cleared on mode exit.
 *
 * ViewportGridService.getState().viewports can be a Map, Array, or plain
 * object depending on the OHIF version; all three cases are handled.
 *
 * @param viewportId - Target viewport ID
 * @param servicesManager - OHIF services manager
 * @returns Detected laterality, or null if not determinable
 */
function detectAndCacheLaterality(
  viewportId: string,
  servicesManager: any
): 'R' | 'L' | null {
  try {
    const { viewportGridService, displaySetService } = servicesManager.services;
    const { viewports: vpMap } = viewportGridService.getState();
    const vpArray = Array.isArray(vpMap)
      ? vpMap
      : vpMap instanceof Map
      ? Array.from(vpMap.values())
      : Object.values(vpMap || {});

    const vpInfo = vpArray.find(
      (vp: any) => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
    );
    const displaySetUID = (vpInfo?.displaySetInstanceUIDs || [])[0];
    if (!displaySetUID) return null;

    const ds = displaySetService.getDisplaySetByUID(displaySetUID);
    if (!ds) return null;

    const laterality = SeriesLateralityManager.detectLaterality(ds);
    if (laterality === 'R' || laterality === 'L') {
      _lateralityCache.set(viewportId, laterality);
      return laterality;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── Auto-windowing ────────────────────────────────────────────────────────

/**
 * Applies auto-windowing to a viewport based on DICOM VOI LUT or pixel range.
 *
 * Strategy (mammography 모드와 동일 — JPEG Lossless 12-bit/8-bit 불일치 대응):
 *   1. DICOM voiLutModule의 WindowCenter/Width 가져옴
 *   2. DICOM W/L이 실제 픽셀 범위보다 4배 이상 크면 → 픽셀 범위에 맞게 스케일링
 *   3. DICOM W/L이 합리적이면 → 그대로 사용
 *   4. DICOM W/L 없으면 → 픽셀 min/max fallback
 *
 * 단순 min/max 방식 대비 장점:
 *   - 금속 마커/임플란트가 있어도 극단적 밝기 왜곡 방지
 *   - Presentation State에 정의된 대비 의도를 최대한 보존
 *
 * `_autoWindowedSet` tracks which viewports have already received windowing
 * to avoid redundant calls on subsequent IMAGE_RENDERED events.
 * It is cleared on STACK_NEW_IMAGE so re-windowing happens on image change.
 *
 * @param viewportId - Target viewport ID
 * @param cornerstoneViewportService - Cornerstone viewport service
 * @param imageId - Optional explicit image ID; if omitted, uses current image
 */
function applyAutoWindowing(
  viewportId: string,
  cornerstoneViewportService: any,
  imageId?: string
) {
  try {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
    if (!viewport) return;

    const targetImageId = imageId || viewport.getCurrentImageId?.();
    if (!targetImageId) return;

    const image = csCache.getImage(targetImageId) as any;
    if (!image) return;

    const { minPixelValue, maxPixelValue } = image;
    if (minPixelValue === undefined || maxPixelValue === undefined) return;
    if (minPixelValue === maxPixelValue) return;

    const pixelSpan = maxPixelValue - minPixelValue;

    // DICOM VOI LUT를 실제 픽셀 범위에 맞게 적용
    // mammography 모드와 동일한 로직 (JPEG Lossless 12-bit/8-bit 불일치 대응)
    const voiLutModule = csMetaData.get('voiLutModule', targetImageId);
    const wcRaw = voiLutModule?.windowCenter;
    const wwRaw = voiLutModule?.windowWidth;

    let lower: number | undefined;
    let upper: number | undefined;

    if (wcRaw !== undefined && wwRaw !== undefined) {
      const windowCenter = Number(Array.isArray(wcRaw) ? wcRaw[0] : wcRaw);
      const windowWidth = Number(Array.isArray(wwRaw) ? wwRaw[0] : wwRaw);

      // NaN guard: empty array or non-numeric → fall through to pixel range fallback
      if (Number.isFinite(windowCenter) && Number.isFinite(windowWidth) && windowWidth > 0) {
        const dicomLower = windowCenter - windowWidth / 2;

        // DICOM VOI 범위가 픽셀 범위보다 4배 이상 크면 스케일링 필요
        // (JPEG Lossless: DICOM 헤더가 12-bit 선언, 실제 8-bit로 디코딩)
        if (windowWidth > pixelSpan * 4) {
          const scale = pixelSpan / windowWidth;
          const scaledWw = windowWidth * scale;
          const scaledWc = minPixelValue + (windowCenter - dicomLower) * scale;
          lower = scaledWc - scaledWw / 2;
          upper = scaledWc + scaledWw / 2;
        } else {
          lower = dicomLower;
          upper = windowCenter + windowWidth / 2;
        }
      }
    }

    // DICOM VOI LUT가 없으면 픽셀 범위를 그대로 사용
    if (lower === undefined || upper === undefined) {
      lower = minPixelValue;
      upper = maxPixelValue;
    }

    // Set guard BEFORE render() to prevent re-entrant applyAutoWindowing calls.
    // Cornerstone3D dispatches IMAGE_RENDERED synchronously inside render(), so
    // adding to the set after render() is too late — the renderedHandler could
    // call applyAutoWindowing again before this line executes. (mammography mode
    // uses the same pattern: _autoWindowedViewportSet.add() precedes render())
    _autoWindowedSet.add(viewportId);
    viewport.setProperties({ voiRange: { lower, upper } });
    viewport.render();
  } catch (e) {
    // ignore
  }
}

// ── Mode factory ──────────────────────────────────────────────────────────

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: '@ohif/extension-default.hangingProtocolModule.hpMammoCompare',
  leftPanel: '@ohif/extension-default.panelModule.seriesList',
  rightPanel: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
};

const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const dicomsr = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

const dicomvideo = {
  sopClassHandler: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

const dicomseg = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
  panel: '@ohif/extension-cornerstone-dicom-seg.panelModule.panelSegmentation',
};

const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.0',
  '@ohif/extension-dicom-video': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
};

export const toolbarSections = {
  [TOOLBAR_SECTIONS.primary]: [
    'Zoom',
    'WindowLevel',
    'Pan',
    'Capture',
    'Layout',
    'Crosshairs',
    'ViewCC',
    'ViewMLO',
    'MirrorModeCompare',
    'CompareSync',
    'ExitCompare',
  ],
};

function modeFactory({ modeConfiguration }) {
  return {
    id,
    routeName: 'mammography-compare',
    displayName: 'Mammography Compare',
    hide: true,

    onModeEnter: ({ servicesManager, extensionManager, commandsManager }) => {
      const {
        toolbarService,
        toolGroupService,
        cornerstoneViewportService,
        viewportGridService,
      } = servicesManager.services;

      // Reset store state on mode re-entry to avoid stale state
      useMammographyCompareStore.getState().resetToDefaults();

      // ── Clean up leftover listeners from previous session ─────────────
      _listenerMap.forEach(({ element, cameraHandler, stackHandler, renderedHandler }) => {
        element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, cameraHandler);
        element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, stackHandler);
        element.removeEventListener(csEnums.Events.IMAGE_RENDERED, renderedHandler);
      });
      _listenerMap.clear();
      _lateralityCache.clear();
      _autoWindowedSet.clear();
      _chestWallAlignedSet.clear();
      // Reset auto-pairing state on every mode entry to prevent stale state
      // from a previous session (e.g., if onModeExit was skipped on hot-reload).
      _autoPairingEnabled = false;
      _isApplyingPairedLayout = false;
      _expectedPairDisplaySets.clear();

      // ── Tool Groups ────────────────────────────────────────────────────
      // The 'mammography' tool group is required for Pan/Zoom/WL toolbar buttons
      // (setToolActiveToolbar uses toolGroupIds: ['mammography'])
      try {
        initToolGroups(extensionManager, toolGroupService, commandsManager);
      } catch (e) {
        console.error('[MammoCompare] initToolGroups FAILED:', e);
      }

      // ── Register commands ──────────────────────────────────────────────
      const { definitions } = commandsModule({ servicesManager, commandsManager });
      const COMPARE_CONTEXT = 'MAMMOGRAPHY_COMPARE';
      if (!commandsManager.getContext(COMPARE_CONTEXT)) {
        commandsManager.createContext(COMPARE_CONTEXT);
      }
      Object.entries(definitions).forEach(([name, def]) => {
        commandsManager.registerCommand(COMPARE_CONTEXT, name, def);
      });

      // ── Register evaluators ────────────────────────────────────────────
      const evaluators = evaluatorsModule({ servicesManager, commandsManager });
      for (const [name, fn] of Object.entries(evaluators)) {
        toolbarService.registerEvaluateFunction(name, fn as any);
      }

      // ── Toolbar ────────────────────────────────────────────────────────
      toolbarService.register(toolbarButtons);
      for (const [key, section] of Object.entries(toolbarSections)) {
        toolbarService.updateSection(key, section);
      }

      // ── resetViewport 오버라이드 (Space 키 / Reset 버튼) ──────────────
      // Cornerstone 기본 resetViewport는 resetProperties()로 VOI를 12-bit 기본값(4096/2047)으로
      // 리셋하여 Mammography 이미지가 어두워지는 문제 발생.
      // MAMMOGRAPHY_COMPARE 컨텍스트에서 오버라이드하여 camera만 리셋하고 VOI는 auto-windowing으로 복원.
      commandsManager.registerCommand(COMPARE_CONTEXT, 'resetViewport', {
        commandFn: () => {
          const { viewports: vpMap } = viewportGridService.getState();
          const vpArray = Array.isArray(vpMap)
            ? vpMap
            : vpMap instanceof Map
              ? Array.from(vpMap.values())
              : Object.values(vpMap || {});

          for (const vpInfo of vpArray) {
            const vpId = vpInfo.viewportId || vpInfo.viewportOptions?.viewportId;
            if (!vpId) {
              continue;
            }

            const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId) as any;
            if (!viewport) {
              continue;
            }

            // Camera 리셋 (pan, zoom 복원)
            viewport.resetCamera();

            // Auto-windowing guard 해제 후 DICOM VOI 재적용
            _autoWindowedSet.delete(vpId);
            applyAutoWindowing(vpId, cornerstoneViewportService);
          }
        },
        storeContexts: [],
        options: {},
      });

      // ── Per-viewport listener setup ────────────────────────────────────
      const addListenersToViewport = (viewportId: string) => {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
        if (!viewport) return;

        // Remove existing listeners for this viewport
        const prev = _listenerMap.get(viewportId);
        if (prev) {
          prev.element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, prev.cameraHandler);
          prev.element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, prev.stackHandler);
          prev.element.removeEventListener(csEnums.Events.IMAGE_RENDERED, prev.renderedHandler);
        }

        const element = viewport.element;

        // ── CAMERA_MODIFIED: Mirror + Compare sync ─────────────────────
        //
        // SYNC MATRIX:
        // | Mirror | Compare | Effect                                          |
        // |--------|---------|------------------------------------------------|
        // | ON     | -       | sync to same-study mirror pair (X-inverted)    |
        // | -      | ON      | sync to other-study corresponding (direct copy) |
        // | ON     | ON      | also sync to other-study's mirror pair         |
        //
        // LOOP PREVENTION:
        //   _compareSyncState.isSyncing = true while applying changes.
        //   Secondary CAMERA_MODIFIED events from setPan/setCamera return early.
        const cameraModifiedHandler = (_event: Event) => {
          if (_compareSyncState.isSyncing) return;

          const srcVp = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
          if (!srcVp) return;

          const store = useMammographyCompareStore.getState();

          // ── Mirror + Compare sync ───────────────────────────────────────
          if (store.isMirrorModeEnabled || store.isCompareSyncEnabled) {
            let currentPan: [number, number];
            let currentCamera: any;
            try {
              currentPan = srcVp.getPan() as [number, number];
              currentCamera = srcVp.getCamera();
            } catch (e) {
              return;
            }

            const currentZoom = currentCamera?.parallelScale;

            const applyToViewport = (targetId: string, invertX: boolean) => {
              const tVp = cornerstoneViewportService.getCornerstoneViewport(targetId) as any;
              if (!tVp) return;
              try {
                const panX = invertX ? -currentPan[0] : currentPan[0];
                tVp.setPan([panX, currentPan[1]], false);
                if (currentZoom != null) {
                  const cam = tVp.getCamera();
                  if (cam) tVp.setCamera({ ...cam, parallelScale: currentZoom }, false);
                }
                tVp.render();
              } catch (e) {
                // viewport may not be ready
              }
            };

            _compareSyncState.isSyncing = true;
            try {
              // 1. Mirror Mode: sync to same-study L↔R pair (X-inverted)
              if (store.isMirrorModeEnabled) {
                const mirrorId = getMirrorPairId(viewportId);
                if (mirrorId) applyToViewport(mirrorId, true);
              }

              // 2. Compare Sync: sync to corresponding viewport in other study
              if (store.isCompareSyncEnabled) {
                const compareId = getComparePairId(viewportId);
                if (compareId) {
                  applyToViewport(compareId, false); // direct copy

                  // If Mirror Mode also ON: sync to other-study's mirror pair (X-inverted)
                  if (store.isMirrorModeEnabled) {
                    const compareMirrorId = getMirrorPairId(compareId);
                    if (compareMirrorId) applyToViewport(compareMirrorId, true);
                  }
                }
              }
            } finally {
              _compareSyncState.isSyncing = false;
            }
          }

          // ── Midline boundary constraint ─────────────────────────────────
          // Prevent non-chest-wall edge from retracting past center boundary.
          // Runs regardless of mirror/compare sync state.
          const lat = _lateralityCache.get(viewportId);
          if (lat) {
            const correction = clampPanToMidlineBoundary(srcVp, lat);
            if (correction) {
              _compareSyncState.isSyncing = true;
              try {
                srcVp.setPan(correction.newPan, false);
                srcVp.render();
              } finally {
                _compareSyncState.isSyncing = false;
              }
            }
          }
        };

        // ── STACK_NEW_IMAGE: auto-windowing on image change ────────────
        const stackHandler = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (!detail) return;
          _autoWindowedSet.delete(viewportId);
          applyAutoWindowing(viewportId, cornerstoneViewportService, detail.imageId);
        };

        // ── IMAGE_RENDERED: initial auto-windowing + chest wall retry ──
        const renderedHandler = (_event: Event) => {
          if (!_autoWindowedSet.has(viewportId)) {
            applyAutoWindowing(viewportId, cornerstoneViewportService);
          }
          // Apply chest wall alignment ONCE per displaySet (oracle #14).
          // _chestWallAlignedSet prevents repeated calls that would reset zoom/pan:
          //   each IMAGE_RENDERED after a zoom/pan sync would call setDisplayArea →
          //   CAMERA_MODIFIED (after mutex released) → sync back → zoom reset.
          if (useMammographyCompareStore.getState().isMirrorModeEnabled) {
            if (!_lateralityCache.has(viewportId)) {
              detectAndCacheLaterality(viewportId, servicesManager);
            }
            if (!_chestWallAlignedSet.has(viewportId)) {
              const aligned = applyChestWallAlignment(viewportId, cornerstoneViewportService);
              if (aligned) {
                // Mark as aligned so subsequent IMAGE_RENDERED events skip this block.
                // Not added if canvas was 0-sized (alignment failed) — next event retries.
                _chestWallAlignedSet.add(viewportId);
              }
            }
          }
        };

        element.addEventListener(csEnums.Events.CAMERA_MODIFIED, cameraModifiedHandler);
        element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, stackHandler);
        element.addEventListener(csEnums.Events.IMAGE_RENDERED, renderedHandler);

        _listenerMap.set(viewportId, {
          element,
          cameraHandler: cameraModifiedHandler,
          stackHandler,
          renderedHandler,
        });
      };

      // ── VIEWPORT_DATA_CHANGED ──────────────────────────────────────────
      _viewportDataChangedSub = cornerstoneViewportService.subscribe(
        cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
        ({ viewportId }: { viewportId: string }) => {
          // Register element-level listeners
          addListenersToViewport(viewportId);

          // New series loaded: reset chest wall alignment state so IMAGE_RENDERED retries
          _chestWallAlignedSet.delete(viewportId);

          // Refresh laterality cache
          detectAndCacheLaterality(viewportId, servicesManager);

          // Apply chest wall alignment if Mirror Mode is ON.
          // May be a no-op if canvas is 0-sized (IMAGE_RENDERED will retry).
          if (useMammographyCompareStore.getState().isMirrorModeEnabled) {
            const aligned = applyChestWallAlignment(viewportId, cornerstoneViewportService);
            if (aligned) {
              _chestWallAlignedSet.add(viewportId);
            }
          }

          // ── Auto-pairing: triggered by user drag-and-drop ─────────────
          // Skip if: auto-pairing not yet enabled (initial HP load),
          //          or this event was triggered by our own setDisplaySetsForViewport call.
          if (!_autoPairingEnabled) return;

          const vpState = viewportGridService.getState();
          const vpArr: any[] =
            vpState.viewports instanceof Map
              ? Array.from(vpState.viewports.values())
              : Object.values(vpState.viewports || {});
          const vp = vpArr.find(
            (v: any) => (v.viewportId || v.viewportOptions?.viewportId) === viewportId
          );
          const dsUID: string | undefined = (vp?.displaySetInstanceUIDs || [])[0];

          // If this UID matches what we set programmatically → skip (loop prevention)
          if (dsUID && _expectedPairDisplaySets.get(viewportId) === dsUID) {
            _expectedPairDisplaySets.delete(viewportId);
            return;
          }
          _expectedPairDisplaySets.delete(viewportId);

          applyAutoPairing(viewportId, servicesManager);
        }
      );

      // Enable auto-pairing after initial hanging protocol load settles.
      // Timer handle is stored so it can be cleared in onModeExit if mode
      // is exited before the 2-second delay fires.
      if (_autoPairingTimer) clearTimeout(_autoPairingTimer);
      _autoPairingTimer = setTimeout(() => {
        _autoPairingEnabled = true;
        _autoPairingTimer = null;
      }, 2000);

    },

    onModeExit: ({ servicesManager }) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
      } = servicesManager.services;

      // Unsubscribe from VIEWPORT_DATA_CHANGED
      if (_viewportDataChangedSub) {
        _viewportDataChangedSub.unsubscribe();
        _viewportDataChangedSub = null;
      }

      // Remove all element-level listeners
      _listenerMap.forEach(({ element, cameraHandler, stackHandler, renderedHandler }) => {
        try {
          element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, cameraHandler);
          element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, stackHandler);
          element.removeEventListener(csEnums.Events.IMAGE_RENDERED, renderedHandler);
        } catch (e) {
          // element may already be destroyed
        }
      });
      _listenerMap.clear();

      // Reset module state
      _lateralityCache.clear();
      _autoWindowedSet.clear();
      _chestWallAlignedSet.clear();
      _compareSyncState.isSyncing = false;
      _isApplyingPairedLayout = false;
      _autoPairingEnabled = false;
      _expectedPairDisplaySets.clear();
      if (_autoPairingTimer) {
        clearTimeout(_autoPairingTimer);
        _autoPairingTimer = null;
      }

      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },

    validationTags: {
      study: [],
      series: [],
    },

    isValidMode: ({ modalities }) => {
      const modalities_list = modalities.split('\\');
      const validModalities = ['MG', 'DX'];
      const valid = modalities_list.some(mod => validModalities.includes(mod));

      return {
        valid,
        description: valid
          ? 'Mammography Compare mode for MG and DX studies'
          : 'This mode is only valid for MG and DX modalities',
      };
    },

    routes: [
      {
        path: 'mammography-compare',
        layoutTemplate: () => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [ohif.leftPanel],
              rightPanels: [ohif.rightPanel],
              viewports: [
                {
                  namespace: tracked.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: dicomsr.viewport,
                  displaySetsToDisplay: [dicomsr.sopClassHandler],
                },
                {
                  namespace: dicomvideo.viewport,
                  displaySetsToDisplay: [dicomvideo.sopClassHandler],
                },
                {
                  namespace: dicompdf.viewport,
                  displaySetsToDisplay: [dicompdf.sopClassHandler],
                },
                {
                  namespace: dicomseg.viewport,
                  displaySetsToDisplay: [dicomseg.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],

    extensions: extensionDependencies,

    hangingProtocol: ohif.hangingProtocol,

    sopClassHandlers: [
      ohif.sopClassHandler,
      dicomvideo.sopClassHandler,
      dicompdf.sopClassHandler,
      dicomseg.sopClassHandler,
      dicomsr.sopClassHandler,
    ],

    hotkeys: [...hotkeys.defaults.hotkeyBindings],

    toolbarButtons,
    toolbarSections,

    // NOTE: getCommandsModule과 getEvaluatorsModule은 Mode에서 사용되지 않음.
    // [DEAD] ExtensionManager는 Extension에 등록된 것만 처리함.
    // Commands/Evaluators는 onModeEnter에서 직접 등록함. (위 코드 참조)
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
