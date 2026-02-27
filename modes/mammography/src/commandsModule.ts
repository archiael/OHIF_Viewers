/**
 * Mammography Mode Commands Module
 *
 * @description
 * Provides commands for mammography-specific features:
 * - Mirror Mode Toggle (FR-2.5.5)
 * - Open Compare Mode
 *
 * @requirement FR-2.5.5: Mirror Mode Toggle
 * - Initial state: Mirror Mode **ON** (chest wall to edge)
 * - ON: Right breast chest wall → right edge, Left breast chest wall → left edge
 * - OFF: All images centered in viewport
 * - Toggle button switches between ON ↔ OFF
 *
 * @architecture
 * - State managed by Zustand store (store.ts)
 * - Commands registered in OHIF command registry
 * - DisplayArea applied to Cornerstone viewports
 * - Toolbar button state evaluated by evaluatorsModule
 *
 * @see modes/mammography/src/store.ts - State management
 * @see modes/mammography/src/evaluatorsModule.ts - Button state evaluation
 * @see modes/mammography/src/toolbarButtons.ts - UI button definition
 */
import { useMammographyStore } from './store';
import { SeriesLateralityManager } from '@ohif/core';
import { DicomMetadataStore } from '@ohif/core';
export { computeChestWallAnchorPan } from './chestWallAnchor';

/** Build a full-page-reload URL respecting routerBasename. */
function buildModeUrl(modePath: string, params: URLSearchParams): string {
  const routerBasename = (window as any).config?.routerBasename || '/';
  const base = routerBasename.endsWith('/') ? routerBasename : routerBasename + '/';
  const query = params.toString();
  return `${base}${modePath}${query ? '?' + query : ''}`;
}

/**
 * 흉벽 anchor world 좌표 캐시
 *
 * @description
 * Mirror Mode ON 시 setDisplayArea() 직후 canvasToWorld([targetX, canvasH/2])로
 * 렌더링된 흉벽 가장자리의 world 좌표를 계산하여 캐시합니다.
 *
 * WHY canvasToWorld INSTEAD OF indexToWorld?
 * ==========================================
 * indexToWorld([0, ...])는 DICOM 픽셀 행렬 좌표를 사용하지만,
 * 유방촬영 DICOM 이미지는 ImageOrientationPatient에 의해 수평 반전될 수 있습니다.
 * 반전된 이미지에서 DICOM col=0은 화면 오른쪽에 표시됩니다.
 * setDisplayArea의 imagePoint=[0.0, 0.5]는 렌더링된 왼쪽 가장자리를 의미하므로
 * DICOM 픽셀 좌표와 불일치 → 잘못된 deltaX → 이미지가 급격히 이탈하는 버그.
 *
 * SOLUTION:
 * setDisplayArea() 직후 viewport.canvasToWorld([targetX, canvasH/2])를 호출하면
 * 렌더링된 흉벽 가장자리의 올바른 world 좌표를 얻을 수 있습니다.
 * 이 방법은 이미지 방향/반전에 관계없이 항상 올바른 world 좌표를 반환합니다.
 *
 * LIFECYCLE:
 * - Populated: applyMirrorMode / applyMirrorModeToViewport → setDisplayArea 후
 * - Read: index.tsx CAMERA_MODIFIED 핸들러 → computeChestWallAnchorPan 호출 시
 * - Cleared: Mirror Mode OFF (applyMirrorMode) / onModeExit (index.tsx)
 *
 * Exported for read access in index.tsx CAMERA_MODIFIED handler.
 */
export const chestWallWorldCache = new Map<string, number[]>();

/**
 * Mirror Mode 동기화 공유 상태
 *
 * @description
 * index.tsx(CAMERA_MODIFIED 핸들러)와 commandsModule.ts(applyMirrorMode) 양쪽에서
 * 공유해야 하는 상태를 한 곳에 관리합니다.
 *
 * - isSyncing: 재진입 방지 flag (mirror setPan/setCamera → CAMERA_MODIFIED 루프 차단)
 *
 * WHY in commandsModule.ts?
 * index.tsx가 commandsModule.ts를 import하는 단방향 의존성을 유지하기 위해
 * 이 상태를 commandsModule.ts에 둡니다.
 */
export const mirrorSyncState = {
  /** true 동안 CAMERA_MODIFIED 핸들러에서 mirror sync 재진입 차단 */
  isSyncing: false,
};

/**
 * DisplayArea Configuration for Mammography (Single Source of Truth)
 *
 * @description
 * Defines how breast images are positioned in the viewport.
 * Used by both Hanging Protocol and Mirror Mode command.
 *
 * COORDINATE SYSTEM EXPLANATION:
 * ==============================
 * Both imagePoint and canvasPoint use normalized coordinates (0.0 - 1.0):
 *
 * imagePoint: Position on the DICOM image
 * - [0.0, 0.5] = Left edge, vertical center
 * - [1.0, 0.5] = Right edge, vertical center
 * - [0.5, 0.5] = Image center
 *
 * canvasPoint: Position on the viewport canvas
 * - [0.0, 0.5] = Pin to left edge of viewport
 * - [1.0, 0.5] = Pin to right edge of viewport
 * - [0.5, 0.5] = Pin to center of viewport
 *
 * WHY storeAsInitialCamera = true? [H-2 FIX]
 * ============================================
 * PROBLEM WITH false (기존 코드):
 *   - HP(hpMammo.ts)는 storeAsInitialCamera: true로 초기 카메라 저장
 *   - Mirror Mode toggle 시 false로 호출하면 initialCamera가 갱신되지 않음
 *   - Reset View 클릭 시 HP가 저장한 옛날 initialCamera(Mirror ON 상태)로 복원
 *   - → Toggle 결과가 무시됨 (Reset View가 Mirror Mode 상태를 덮어씀)
 *
 * WHY true WORKS:
 *   - setDisplayArea(true) → Cornerstone이 현재 camera를 initialCamera로 저장
 *   - Reset View 시 → 마지막으로 설정된 Mirror Mode 상태에 맞는 camera로 복원
 *   - Mirror ON → toggle OFF → Reset View → CENTER 상태로 복원 ✓
 *
 * INTERNAL CALCULATION (Viewport.js:setDisplayAreaFit):
 * =======================================================
 * targetPanX = zoom * imgWidth * (0.5 - imageX) + canvasWidth * (canvasX - 0.5)
 *
 * RIGHT_BREAST (imageX=1.0, canvasX=1.0):
 *   targetPanX = -zoom*imgWidth/2 + canvasWidth/2
 *
 * LEFT_BREAST (imageX=0.0, canvasX=0.0):
 *   targetPanX = +zoom*imgWidth/2 - canvasWidth/2
 *
 * CENTER (imageX=0.5, canvasX=0.5):
 *   targetPanX = 0 (이미지 중앙 = 캔버스 중앙)
 *
 * @constant
 */
const DISPLAY_AREAS = {
  /**
   * Right breast positioning (RCC, RMLO)
   * Chest wall (right edge of image) anchored to right edge of viewport
   */
  RIGHT_BREAST: {
    imageArea: [1.0, 1.0], // Show 100% of image (no cropping)
    imageCanvasPoint: {
      imagePoint: [1.0, 0.5], // 이미지 오른쪽 가장자리 중간 (흉벽)
      canvasPoint: [1.0, 0.5], // viewport 오른쪽 edge에 고정
    },
    storeAsInitialCamera: true, // [H-2 FIX] Reset View가 Mirror 상태 반영하도록
  },

  /**
   * Left breast positioning (LCC, LMLO)
   * Chest wall (left edge of image) anchored to left edge of viewport
   */
  LEFT_BREAST: {
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [0.0, 0.5], // 이미지 왼쪽 가장자리 중간 (흉벽)
      canvasPoint: [0.0, 0.5], // viewport 왼쪽 edge에 고정
    },
    storeAsInitialCamera: true, // [H-2 FIX]
  },

  /**
   * Center positioning (Mirror Mode OFF)
   * Image centered in viewport (standard OHIF behavior)
   */
  CENTER: {
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [0.5, 0.5], // 이미지 중앙
      canvasPoint: [0.5, 0.5], // viewport 중앙에 고정
    },
    storeAsInitialCamera: true, // [H-2 FIX] Mirror OFF 후 Reset View도 CENTER 유지
  },
};

/**
 * setDisplayArea() 직후 흉벽 world 좌표를 캐시
 *
 * @description
 * setDisplayArea() 호출 후 즉시 viewport.canvasToWorld([targetX, canvasH/2])를 호출하여
 * 렌더링된 흉벽 가장자리의 world 좌표를 chestWallWorldCache에 저장합니다.
 *
 * WHY IMMEDIATELY AFTER setDisplayArea?
 *   setDisplayArea() 완료 직후에는 흉벽이 정확히 targetX 위치에 있습니다.
 *   canvasToWorld([targetX, canvasH/2]) = 흉벽 world 좌표 (이미지 방향/반전 무관).
 *   이후 사용자 Pan/Zoom 시 이 world 좌표를 worldToCanvas()로 추적하여 anchor 적용.
 *
 * WHY NOT indexToWorld?
 *   imageData.indexToWorld([0, ...])는 DICOM 픽셀 col=0을 반환하는데,
 *   수평 반전 이미지에서 col=0은 화면 오른쪽 → 잘못된 anchor 계산.
 *   canvasToWorld는 렌더링된 실제 위치 기반 → 항상 올바른 결과.
 *
 * @param viewport - Cornerstone viewport 인스턴스
 * @param viewportId - viewport ID (chestWallWorldCache key)
 * @param laterality - 'R' | 'L' | null (null이면 캐시하지 않음)
 */
export function cacheChestWallWorldAfterSetDisplayArea(
  viewport: any,
  viewportId: string,
  laterality: 'R' | 'L' | null
): void {
  if (!laterality) return; // CENTER fallback 또는 감지 실패 시 캐시 없음

  try {
    const canvasEl = (viewport as any).canvas as HTMLCanvasElement;
    if (!canvasEl) return;
    const canvasW = canvasEl.clientWidth;
    const canvasH = canvasEl.clientHeight;
    if (canvasW === 0 || canvasH === 0) return;

    // setDisplayArea 직후: 흉벽이 targetX 위치에 있으므로 canvasToWorld가 정확한 world 좌표 반환
    const targetX = laterality === 'R' ? canvasW : 0;
    const world = viewport.canvasToWorld([targetX, canvasH / 2]);
    if (world) {
      chestWallWorldCache.set(viewportId, world);
      console.debug(
        `[chestWallWorldCache] Cached: viewport=${viewportId}, laterality=${laterality}, ` +
          `targetX=${targetX}, world=[${Array.from(world)
            .map((v: number) => v.toFixed(1))
            .join(',')}]`
      );
    }
  } catch (e) {
    console.warn(`[cacheChestWallWorldAfterSetDisplayArea] Failed for viewport ${viewportId}:`, e);
  }
}

const commandsModule = ({ servicesManager, commandsManager }) => {
  const {
    viewportGridService,
    cornerstoneViewportService,
    displaySetService,
    toolbarService,
    uiNotificationService,
  } = servicesManager.services;

  const refreshToolbar = () => {
    const { activeViewportId } = viewportGridService.getState();
    if (activeViewportId) {
      toolbarService?.refreshToolbarState?.({ viewportId: activeViewportId });
    }
  };

  // Mammography 전용 commands
  const mammographyCommands = {
    /**
     * FR-2.5.5: Toggle Mirror Mode
     *
     * @description
     * Toggles Mirror Mode between ON ↔ OFF and applies to all viewports.
     *
     * FLOW:
     * 1. User clicks "Mirror Mode" button in toolbar
     * 2. Toolbar calls this command via commandsManager.runCommand('toggleMirrorMode')
     * 3. Toggle state in Zustand store (true ↔ false)
     * 4. Call applyMirrorMode() to update ALL viewports with new displayArea
     * 5. Refresh toolbar to update button appearance (active/inactive)
     *
     * NOTE: After setDisplayArea(), CAMERA_MODIFIED 핸들러 (index.tsx)가
     *       즉시 흉벽 anchor를 재설정하므로 사용자 Pan/Zoom에도 유지됨.
     */
    toggleMirrorMode: () => {
      const store = useMammographyStore.getState();
      store.toggleMirrorMode();

      applyMirrorMode(servicesManager);
      refreshToolbar();
    },

    /**
     * Query Mirror Mode enabled state
     *
     * @description
     * Returns current Mirror Mode state from Zustand store.
     * Used by evaluatorsModule to determine toolbar button active state.
     *
     * @returns {boolean} true if Mirror Mode is ON, false if OFF
     *
     * @see evaluatorsModule.ts - Uses this to evaluate button state
     */
    isMirrorModeEnabled: () => {
      return useMammographyStore.getState().isMirrorModeEnabled;
    },

    /**
     * Open Mammography Compare Mode with Prior Study Auto-Selection
     *
     * @description
     * Navigates to mammography-compare mode, automatically searching for
     * and loading the most recent prior MG study for the same patient.
     *
     * @requirement FR-3.3.8: Prior Study Auto-Selection
     */
    openMammoCompare: () => {
      const activeDisplaySets = displaySetService.getActiveDisplaySets();
      if (!activeDisplaySets || activeDisplaySets.length === 0) {
        console.error('[openMammoCompare] No active display sets found');
        return;
      }

      const currentStudyUID = activeDisplaySets[0].StudyInstanceUID;
      const urlParams = new URLSearchParams(window.location.search);
      const dataSourceQuery = urlParams.get('datasources') || '';

      // FR-3.3.8: Prior Study Auto-Selection
      try {
        // Step 1: Get current study metadata
        const currentStudyMetadata = DicomMetadataStore.getStudy(currentStudyUID);

        if (!currentStudyMetadata) {
          throw new Error('Current study metadata not found in DicomMetadataStore');
        }

        const currentPatientID = currentStudyMetadata.PatientID;
        const currentStudyDate = currentStudyMetadata.StudyDate;

        if (!currentPatientID || !currentStudyDate) {
          throw new Error(
            `Missing metadata - PatientID: ${currentPatientID}, StudyDate: ${currentStudyDate}`
          );
        }

        // Step 2: Search for all studies in DicomMetadataStore
        const allStudies = DicomMetadataStore.getStudies();

        // Step 3: Filter for prior MG studies
        const priorStudies = allStudies.filter(study => {
          if (study.PatientID !== currentPatientID) return false;
          if (study.StudyInstanceUID === currentStudyUID) return false;
          if (!study.StudyDate || study.StudyDate >= currentStudyDate) return false;
          const modalities = study.ModalitiesInStudy || [];
          return modalities.some(mod => mod === 'MG');
        });

        // Step 4: Sort by StudyDate descending (most recent first)
        priorStudies.sort((a, b) => {
          return (b.StudyDate || '').localeCompare(a.StudyDate || '');
        });

        // Step 5: Select most recent prior study
        const priorStudy = priorStudies[0];

        if (priorStudy) {
          const studyUIDs = `${currentStudyUID},${priorStudy.StudyInstanceUID}`;
          const params = new URLSearchParams({ StudyInstanceUIDs: studyUIDs });
          if (dataSourceQuery) params.set('datasources', dataSourceQuery);
          const compareModeUrl = buildModeUrl('mammography-compare', params);

          uiNotificationService.show({
            title: 'Compare Mode',
            message: `Loading current study + prior study (${priorStudy.StudyDate})`,
            type: 'info',
            duration: 3000,
          });

          console.log(
            `[openMammoCompare] Found prior study: ${priorStudy.StudyInstanceUID} (${priorStudy.StudyDate})`
          );
          // INTENTIONAL: Full page reload. SPA navigation 시 onModeExit에서
          // toolGroupService/cornerstoneViewportService 파괴와 onModeEnter 초기화가
          // 같은 렌더 사이클에 겹쳐 race condition 발생 가능.
          // TODO: OHIF mode lifecycle 안정화 후 navigate() 전환 검토
          window.location.href = compareModeUrl;
        } else {
          const noPriorParams = new URLSearchParams({ StudyInstanceUIDs: currentStudyUID });
          if (dataSourceQuery) noPriorParams.set('datasources', dataSourceQuery);
          const compareModeUrl = buildModeUrl('mammography-compare', noPriorParams);

          uiNotificationService.show({
            title: 'Compare Mode',
            message: 'No prior MG study found - loading current study only',
            type: 'warning',
            duration: 3000,
          });

          console.log('[openMammoCompare] No prior study found for current patient');
          // INTENTIONAL: Full page reload (위 주석 동일)
          window.location.href = compareModeUrl;
        }
      } catch (error) {
        console.error('[openMammoCompare] Failed to search for prior study:', error);

        const errorParams = new URLSearchParams({ StudyInstanceUIDs: currentStudyUID });
        if (dataSourceQuery) errorParams.set('datasources', dataSourceQuery);
        const compareModeUrl = buildModeUrl('mammography-compare', errorParams);

        uiNotificationService.show({
          title: 'Compare Mode',
          message: 'Could not search for prior study - loading current study only',
          type: 'warning',
          duration: 3000,
        });

        // INTENTIONAL: Full page reload (위 주석 동일)
        window.location.href = compareModeUrl;
      }
    },
  };

  return {
    actions: {
      ...mammographyCommands,
    },
    definitions: {
      toggleMirrorMode: {
        commandFn: mammographyCommands.toggleMirrorMode,
        storeContexts: [],
        options: {},
      },
      isMirrorModeEnabled: {
        commandFn: mammographyCommands.isMirrorModeEnabled,
        storeContexts: [],
        options: {},
      },
      openMammoCompare: {
        commandFn: mammographyCommands.openMammoCompare,
        storeContexts: [],
        options: {},
      },
    },
  };
};

/**
 * viewportId 패턴 기반 laterality 감지 (fallback)
 *
 * @description
 * hpMammo.ts의 viewport ID 명명 규칙을 이용한 빠른 laterality 감지.
 * SeriesLateralityManager.detectLaterality() 실패 시 fallback으로 사용.
 *
 * hpMammo viewport IDs:
 * - mammo-rcc, mammo-rmlo, mammo-compare-rcc, mammo-compare-rmlo → 'R'
 * - mammo-lcc, mammo-lmlo, mammo-compare-lcc, mammo-compare-lmlo → 'L'
 */
function detectLateralityFromViewportId(viewportId: string): 'R' | 'L' | null {
  if (viewportId.includes('rcc') || viewportId.includes('rmlo')) return 'R';
  if (viewportId.includes('lcc') || viewportId.includes('lmlo')) return 'L';
  return null;
}

/**
 * Mirror Mode 상대 viewport ID 반환
 * mammo-rcc ↔ mammo-lcc, mammo-rmlo ↔ mammo-lmlo (compare 포함)
 */
function getOppositeViewportId(viewportId: string): string | null {
  if (viewportId.includes('rcc')) return viewportId.replace('rcc', 'lcc');
  if (viewportId.includes('lcc')) return viewportId.replace('lcc', 'rcc');
  if (viewportId.includes('rmlo')) return viewportId.replace('rmlo', 'lmlo');
  if (viewportId.includes('lmlo')) return viewportId.replace('lmlo', 'rmlo');
  return null;
}

/**
 * Apply Mirror Mode to all viewports
 *
 * @description
 * Iterates through all active viewports and applies displayArea based on:
 * - Mirror Mode state (ON/OFF)
 * - Breast laterality (R/L) detected from DICOM metadata
 *
 * NOTE: This function uses setDisplayArea() which is a 1-shot operation.
 *       It resets zoom and sets the initial pan position.
 *       After this call, CAMERA_MODIFIED handler (index.tsx) will maintain
 *       the chest wall anchor on subsequent Pan/Zoom operations.
 *
 * @param {Object} servicesManager - OHIF services manager
 */
function applyMirrorMode(servicesManager) {
  const {
    viewportGridService,
    cornerstoneViewportService,
    displaySetService,
    uiNotificationService,
  } = servicesManager.services;

  const store = useMammographyStore.getState();
  const enabled = store.isMirrorModeEnabled;

  // Get all viewports (handle different data structures: Array, Map, Object)
  const { viewports } = viewportGridService.getState();
  const viewportArray = Array.isArray(viewports)
    ? viewports
    : viewports instanceof Map
    ? Array.from(viewports.values())
    : Object.values(viewports || {});

  let successCount = 0;
  let failCount = 0;

  if (enabled) {
    // ── Mirror Mode ON: active viewport 기준으로 상대 viewport에 mirror pan/zoom 즉시 적용 ──
    //
    // WHY no setDisplayArea here?
    //   Mirror Mode ON 전환 시 사용자의 현재 pan/zoom 상태를 유지합니다.
    //   active viewport(선택된 breast)의 현재 pan/zoom을 상대 viewport에 mirror합니다.
    //   setDisplayArea 호출 시 pan/zoom이 초기화되므로 사용하지 않습니다.
    //
    //   초기 로드 시 흉벽 정렬: hpMammo hanging protocol의 setDisplayArea가 처리합니다.
    //   시리즈 변경 시: VIEWPORT_DATA_CHANGED → applyMirrorModeToViewport에서 처리합니다.
    const { activeViewportId } = viewportGridService.getState();
    if (!activeViewportId) {
      console.warn('[applyMirrorMode] No active viewport for mirror sync');
    } else {
      const activeVp = cornerstoneViewportService.getCornerstoneViewport(activeViewportId) as any;
      const otherViewportId = getOppositeViewportId(activeViewportId);
      const otherVp = otherViewportId
        ? (cornerstoneViewportService.getCornerstoneViewport(otherViewportId) as any)
        : null;

      if (activeVp && otherVp) {
        mirrorSyncState.isSyncing = true;
        try {
          // 1. zoom 동기화: 두 viewport의 parallelScale을 동일하게
          const activeCamera = activeVp.getCamera();
          const otherCamera = otherVp.getCamera();
          if (activeCamera?.parallelScale != null && otherCamera) {
            otherVp.setCamera({ ...otherCamera, parallelScale: activeCamera.parallelScale }, false);
          }

          // 2. pan 동기화: X 반전, Y 동일
          //    active viewport pan = initialCamera 기준 현재 pan (canvas pixel 단위)
          const activePan = activeVp.getPan() as [number, number];
          const mirrorPan: [number, number] = [-activePan[0], activePan[1]];
          otherVp.setPan(mirrorPan, false);
          otherVp.render();

          successCount += 2;
          console.log(
            `[applyMirrorMode] Mirror ON: ${activeViewportId} pan=[${activePan}] → ` +
            `${otherViewportId} mirrorPan=[${mirrorPan}]`
          );
        } catch (e) {
          console.warn('[applyMirrorMode] Mirror sync failed:', e);
          failCount++;
        } finally {
          mirrorSyncState.isSyncing = false;
        }
      } else {
        console.warn(
          `[applyMirrorMode] Mirror ON: could not find viewport pair for activeViewportId=${activeViewportId}`
        );
        failCount++;
      }
    }
  } else {
    // ── Mirror Mode OFF: 캐시 정리만 수행, pan/zoom 위치는 유지 ──
    //
    // 올바른 동작: Mirror OFF는 단순히 동기화를 해제하는 것.
    //   CAMERA_MODIFIED 핸들러의 isMirrorModeEnabled 체크로 자동 비활성화.
    //   사용자의 현재 pan/zoom 위치는 그대로 유지.
    viewportArray.forEach(vp => {
      const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
      if (viewportId) {
        chestWallWorldCache.delete(viewportId);
        successCount++;
      }
    });
  }

  // Show user notification
  const status = enabled ? 'ON' : 'OFF';
  const message =
    failCount > 0
      ? `Mirror Mode ${status} (${successCount} viewports, ${failCount} failed)`
      : `Mirror Mode ${status}`;

  uiNotificationService.show({
    title: 'Mirror Mode',
    message: message,
    type: failCount > 0 ? 'warning' : 'info',
    duration: 2000,
  });
}

/**
 * DICOM 메타데이터 기반 viewport laterality 감지
 *
 * @description
 * viewport의 displaySet DICOM 메타데이터에서 laterality를 감지합니다.
 * viewportId 패턴 기반(fragile)이 아닌 SeriesLateralityManager를 사용하여
 * viewport ID 명명 규칙이 변경되어도 정상 동작합니다.
 *
 * WHY THIS FUNCTION?
 * CAMERA_MODIFIED 핸들러는 매 pan/zoom마다 호출됩니다.
 * 매번 displaySet 조회 + SeriesLateralityManager 호출은 비용이 높습니다.
 * 따라서 이 함수는 VIEWPORT_DATA_CHANGED 시 1회 호출하고 결과를 캐시합니다.
 * CAMERA_MODIFIED 핸들러는 캐시만 조회(O(1))합니다.
 *
 * @param viewportId - 대상 viewport ID
 * @param servicesManager - OHIF services manager
 * @returns 'R' | 'L' | null (감지 실패 시 null)
 *
 * EXPORTED for use in index.tsx (laterality cache population)
 */
export function detectViewportLaterality(viewportId: string, servicesManager: any): 'R' | 'L' | null {
  const { viewportGridService, displaySetService } = servicesManager.services;

  try {
    // viewport Grid에서 해당 viewport 정보 조회
    const { viewports } = viewportGridService.getState();
    const viewportArray = Array.isArray(viewports)
      ? viewports
      : viewports instanceof Map
      ? Array.from(viewports.values())
      : Object.values(viewports || {});

    const vpInfo = viewportArray.find(
      vp => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
    );
    if (!vpInfo) return null;

    const displaySetUIDs = vpInfo.displaySetInstanceUIDs || [];
    if (displaySetUIDs.length === 0) return null;

    const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
    if (!displaySet) return null;

    // DICOM 메타데이터 기반 laterality 감지
    const laterality = SeriesLateralityManager.detectLaterality(displaySet);

    // null/undefined/'B'(bilateral) 등은 null 처리
    return laterality === 'R' || laterality === 'L' ? laterality : null;
  } catch (e) {
    console.warn(`[detectViewportLaterality] Failed for viewport ${viewportId}:`, e);
    return null;
  }
}

/**
 * Detect view position (CC / MLO / etc.) for a viewport from DICOM metadata
 *
 * @description
 * Mirror Mode는 같은 view position 쌍(LCC↔RCC, LMLO↔RMLO)에서만 동작해야 합니다.
 * 이 함수는 viewport에 로드된 displaySet에서 view position을 감지합니다.
 *
 * Detection priority:
 *   1. ViewPosition (0018,5101): 'CC', 'MLO', 'ML', 'LM' 등
 *   2. ViewCode SCT: SCT:399162004 → 'CC', SCT:399368009 → 'MLO'
 *   3. SeriesDescription: 'CC', 'MLO' 포함 여부
 *
 * @returns 'CC' | 'MLO' | 기타 ViewPosition 문자열 | null (감지 실패)
 *
 * EXPORTED for use in index.tsx (view position cache population)
 */
export function detectViewportViewPosition(viewportId: string, servicesManager: any): string | null {
  const { viewportGridService, displaySetService } = servicesManager.services;

  try {
    const { viewports } = viewportGridService.getState();
    const viewportArray = Array.isArray(viewports)
      ? viewports
      : viewports instanceof Map
      ? Array.from(viewports.values())
      : Object.values(viewports || {});

    const vpInfo = viewportArray.find(
      vp => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
    );
    if (!vpInfo) return null;

    const displaySetUIDs = vpInfo.displaySetInstanceUIDs || [];
    if (displaySetUIDs.length === 0) return null;

    const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
    if (!displaySet) return null;

    const instanceMetadata = displaySet.instances?.[0] || displaySet;

    // Priority 1: ViewPosition tag (0018,5101)
    const viewPosition = instanceMetadata.ViewPosition || displaySet.ViewPosition;
    if (viewPosition) {
      const vp = String(viewPosition).toUpperCase().trim();
      if (vp) return vp;  // 'CC', 'MLO', 'ML', 'LM' 등 그대로 반환
    }

    // Priority 2: ViewCode / ViewCodeSequence (SCT)
    const viewCode = instanceMetadata.ViewCodeSequence?.[0]?.CodeValue
      || instanceMetadata.ViewCode
      || displaySet.ViewCode;
    if (viewCode) {
      const code = String(viewCode);
      if (code.includes('399162004')) return 'CC';   // SCT:399162004 = Cranio-Caudal
      if (code.includes('399368009')) return 'MLO';  // SCT:399368009 = Mediolateral Oblique
    }

    // Priority 3: SeriesDescription 키워드
    // NOTE: desc.includes('CC'/'MLO') 대신 단어 경계(word boundary) 정규식 사용.
    // "RACCOON", "ACCESSION" 등에서 false positive 방지.
    // compare 모드와 동일한 패턴 사용: /\b(?:[RL]\s*)?CC\b/ 및 /\b(?:[RL]\s*)?MLO\b/
    const desc = String(displaySet.SeriesDescription || instanceMetadata.SeriesDescription || '').toUpperCase();
    if (/\b(?:[RL]\s*)?CC\b/.test(desc)) return 'CC';
    if (/\b(?:[RL]\s*)?MLO\b/.test(desc)) return 'MLO';
    if (desc.includes(' ML') || desc.endsWith('ML')) return 'ML';

    return null;
  } catch (e) {
    console.warn(`[detectViewportViewPosition] Failed for viewport ${viewportId}:`, e);
    return null;
  }
}

/**
 * Detect view position (CC / MLO / etc.) from a displaySet object directly
 *
 * @description
 * findPairDisplaySet에서 사용하는 내부 헬퍼.
 * detectViewportViewPosition과 동일한 우선순위 로직을 사용하지만
 * viewportId 대신 displaySet 객체를 직접 받습니다.
 */
function detectDisplaySetViewPosition(displaySet: any): string | null {
  if (!displaySet) return null;
  try {
    const instanceMetadata = displaySet.instances?.[0] || displaySet;

    // Priority 1: ViewPosition tag (0018,5101)
    const viewPosition = instanceMetadata.ViewPosition || displaySet.ViewPosition;
    if (viewPosition) {
      const vp = String(viewPosition).toUpperCase().trim();
      if (vp) return vp;
    }

    // Priority 2: ViewCode SCT
    const viewCode =
      instanceMetadata.ViewCodeSequence?.[0]?.CodeValue ||
      instanceMetadata.ViewCode ||
      displaySet.ViewCode;
    if (viewCode) {
      const code = String(viewCode);
      if (code.includes('399162004')) return 'CC';   // SCT:399162004 = Cranio-Caudal
      if (code.includes('399368009')) return 'MLO';  // SCT:399368009 = Mediolateral Oblique
    }

    // Priority 3: SeriesDescription 키워드
    // NOTE: 단어 경계 정규식으로 "RACCOON", "MLOCATH" 등 false positive 방지
    //       (detectViewportViewPosition과 동일한 패턴)
    const desc = String(
      displaySet.SeriesDescription || instanceMetadata.SeriesDescription || ''
    ).toUpperCase();
    if (/\b(?:[RL]\s*)?CC\b/.test(desc)) return 'CC';
    if (/\b(?:[RL]\s*)?MLO\b/.test(desc)) return 'MLO';
    if (desc.includes(' ML') || desc.endsWith('ML')) return 'ML';

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Check if two view positions belong to the same family
 *
 * @description
 * CC / MLO view position 그룹 비교.
 * MLO 패밀리: MLO, ML, LM (모두 mediolateral 방향)
 */
function isSameViewPositionGroup(pos1: string, pos2: string): boolean {
  const p1 = pos1.toUpperCase();
  const p2 = pos2.toUpperCase();
  if (p1 === p2) return true;
  // MLO family
  const mloFamily = ['MLO', 'ML', 'LM'];
  if (mloFamily.includes(p1) && mloFamily.includes(p2)) return true;
  return false;
}

/**
 * Find the pair displaySet for a given laterality + view position
 *
 * @description
 * Drag&drop 시 pair auto-loading에 사용됩니다.
 * 현재 viewport에 로드된 displaySet의 반대 laterality + 같은 view position을 가진
 * displaySet을 activeDisplaySets에서 검색합니다.
 *
 * @param myLaterality - 현재 viewport laterality ('R' | 'L')
 * @param myViewPosition - 현재 viewport view position ('CC' | 'MLO' etc.)
 * @param currentDisplaySetUID - 현재 viewport에 로드된 displaySet UID (검색 제외용)
 * @param servicesManager - OHIF services manager
 * @returns 매칭된 pair displaySet 또는 null
 *
 * EXPORTED for use in index.tsx (auto pair loading)
 */
export function findPairDisplaySet(
  myLaterality: 'R' | 'L',
  myViewPosition: string,
  currentDisplaySetUID: string | null,
  servicesManager: any
): any | null {
  const { displaySetService } = servicesManager.services;
  const targetLaterality = myLaterality === 'R' ? 'L' : 'R';

  try {
    const allDisplaySets: any[] = displaySetService.getActiveDisplaySets();

    for (const ds of allDisplaySets) {
      if (ds.displaySetInstanceUID === currentDisplaySetUID) continue;

      const dsLaterality = SeriesLateralityManager.detectLaterality(ds);
      if (dsLaterality !== targetLaterality) continue;

      const dsViewPos = detectDisplaySetViewPosition(ds);
      if (!dsViewPos) continue;

      if (isSameViewPositionGroup(myViewPosition, dsViewPos)) {
        return ds;
      }
    }

    return null;
  } catch (e) {
    console.warn('[findPairDisplaySet] Error:', e);
    return null;
  }
}

/**
 * Apply Mirror Mode displayArea to a single viewport
 *
 * @description
 * VIEWPORT_DATA_CHANGED 핸들러에서 호출됩니다.
 * 시리즈 변경 시 새 시리즈에도 Mirror Mode를 재적용하기 위해 사용합니다.
 *
 * @param viewportId - 대상 viewport ID
 * @param servicesManager - OHIF services manager
 *
 * IMPORTANT: This function is exported for use in index.tsx
 */
export function applyMirrorModeToViewport(viewportId: string, servicesManager: any): void {
  const {
    cornerstoneViewportService,
    viewportGridService,
    displaySetService,
  } = servicesManager.services;

  const store = useMammographyStore.getState();
  if (!store.isMirrorModeEnabled) return;

  try {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport) return;

    // viewportGridService에서 해당 viewport의 displaySet 찾기
    const { viewports } = viewportGridService.getState();
    const viewportArray = Array.isArray(viewports)
      ? viewports
      : viewports instanceof Map
      ? Array.from(viewports.values())
      : Object.values(viewports || {});

    const vpInfo = viewportArray.find(
      vp => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
    );

    if (!vpInfo) return;

    const displaySetUIDs = vpInfo.displaySetInstanceUIDs || [];
    if (displaySetUIDs.length === 0) return;

    const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
    if (!displaySet) return;

    // Detect laterality: DICOM metadata first, viewport ID as fallback
    const laterality =
      SeriesLateralityManager.detectLaterality(displaySet) ??
      detectLateralityFromViewportId(viewportId);

    let displayArea;
    if (laterality === 'R') {
      displayArea = DISPLAY_AREAS.RIGHT_BREAST;
    } else if (laterality === 'L') {
      displayArea = DISPLAY_AREAS.LEFT_BREAST;
    } else {
      displayArea = DISPLAY_AREAS.CENTER;
    }

    viewport.setDisplayArea(displayArea);

    // setDisplayArea 직후 흉벽 world 좌표 캐시 시도
    // 캔버스 크기가 0이면 실패할 수 있음 → index.tsx IMAGE_RENDERED 핸들러에서 재시도
    cacheChestWallWorldAfterSetDisplayArea(viewport, viewportId, laterality);

    viewport.render();

    console.log(`[applyMirrorModeToViewport] Applied ${laterality ?? 'CENTER'} to viewport ${viewportId}`);
  } catch (error) {
    console.warn(`[applyMirrorModeToViewport] Failed for viewport ${viewportId}:`, error);
  }
}

export default commandsModule;
