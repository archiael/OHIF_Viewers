/**
 * Mammography Mode
 *
 * @description
 * OHIF Viewer의 유방 촬영술(Mammography) 워크플로우 모드입니다.
 *
 * FEATURES:
 * - FR-2.5.5: Mirror Mode (흉벽 Edge 정렬)
 *   - ON: 우측 유방 흉벽 → viewport 오른쪽 edge, 좌측 유방 흉벽 → 왼쪽 edge
 *   - OFF: 이미지 중앙 정렬
 *   - Pan 시 X축 이탈 방지 (CAMERA_MODIFIED 핸들러)
 *   - Zoom 후에도 흉벽 edge 유지
 * - Auto-windowing: JPEG Lossless 이미지 VOI 자동 조정
 * - Compare Mode 진입 (이전 검사 자동 선택)
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ onModeEnter                                                  │
 * │   1. Store.resetToDefaults() [C-2 FIX]                      │
 * │   2. 이전 리스너 완전 정리 [M-2 FIX]                         │
 * │   3. initToolGroups / commands / evaluators / toolbar 설정   │
 * │   4. VIEWPORT_DATA_CHANGED 구독                              │
 * │      → addListenersToViewport(viewportId)                   │
 * │         - STACK_NEW_IMAGE: auto-windowing                    │
 * │         - IMAGE_RENDERED: auto-windowing (최초 1회)          │
 * │         - CAMERA_MODIFIED: 흉벽 X anchor [C-1 FIX]          │
 * │      → Mirror Mode 재적용 (시리즈 변경 시) [C-3 FIX]         │
 * └─────────────────────────────────────────────────────────────┘
 */

import { hotkeys, ToolbarService } from '@ohif/core';
import { Enums as csEnums, cache as csCache, metaData as csMetaData } from '@cornerstonejs/core';
import { id } from './id';
import mammographyButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import commandsModule, {
  applyMirrorModeToViewport,
  detectViewportLaterality,
  detectViewportViewPosition,
  findPairDisplaySet,
  chestWallWorldCache,
  cacheChestWallWorldAfterSetDisplayArea,
  mirrorSyncState,
} from './commandsModule';
import evaluatorsModule from './evaluatorsModule';
import {
  toolbarButtons as basicToolbarButtons,
  toolbarSections as basicToolbarSections,
} from '@ohif/mode-basic';
import { useMammographyStore } from './store';
import { clampPanToMidlineBoundary } from '../../mammography-shared/src/utils/midlineBoundaryConstraint';

// 모드 정의에 사용될 전체 버튼 목록 (basic + mammography 전용)
const allToolbarButtons = [...basicToolbarButtons, ...mammographyButtons];

/**
 * Viewport element에 추가된 이벤트 리스너 추적 Map
 *
 * @description
 * onModeExit에서 정확히 제거하기 위해 추가한 모든 리스너를 추적합니다.
 * HMR(Hot Module Reload) 시 onModeExit 없이 onModeEnter가 재실행될 수 있으므로
 * onModeEnter 시작 시 이 Map의 리스너를 먼저 제거합니다.
 *
 * WHY element-level events?
 * STACK_NEW_IMAGE, IMAGE_RENDERED, CAMERA_MODIFIED는
 * 전역 Cornerstone eventTarget이 아닌 각 viewport HTML element에 dispatch됩니다.
 */
interface ViewportListenerEntry {
  element: HTMLElement;
  stackHandler: (event: Event) => void;
  renderedHandler: (event: Event) => void;
  /** [C-1 FIX] 흉벽 anchor 유지 핸들러 */
  cameraModifiedHandler: (event: Event) => void;
}

const _viewportListenerMap = new Map<string, ViewportListenerEntry>();

/** VIEWPORT_DATA_CHANGED 구독 해제 객체 */
let _viewportDataChangedSub: { unsubscribe: () => void } | null = null;

/**
 * Auto pair loading 무한 루프 방지 플래그
 *
 * @description
 * VIEWPORT_DATA_CHANGED에서 pair auto-loading 중임을 표시합니다.
 * 반대편 viewport에 pair를 로드하면 해당 viewport에서도 VIEWPORT_DATA_CHANGED가 발생합니다.
 * "이미 올바른 pair가 로드되어 있으면 스킵" 로직으로 무한 루프를 방지하지만,
 * 이 플래그는 추가 안전망 역할을 합니다.
 */
let _isAutoLoadingPair = false;

/** 이미 auto-windowing이 적용된 viewport ID 추적 (pan/zoom 중 중복 적용 방지) */
const _autoWindowedViewportSet = new Set<string>();

/**
 * DICOM 메타데이터 기반 laterality 캐시
 *
 * @description
 * CAMERA_MODIFIED 핸들러는 매 pan/zoom 프레임마다 호출되어 laterality를 조회합니다.
 * 매번 displaySet 메타데이터를 조회하면 성능 문제가 발생합니다.
 *
 * SOLUTION:
 * - VIEWPORT_DATA_CHANGED 시 (시리즈 로드 / 변경 시) detectViewportLaterality()로 DICOM 메타데이터 조회
 * - 결과를 이 Map에 캐시 (viewportId → 'R' | 'L')
 * - CAMERA_MODIFIED 핸들러에서 캐시를 O(1) 조회 → 성능 문제 없음
 *
 * [C-8 FIX] viewportId 패턴 매칭(fragile) 대신 DICOM 메타데이터 기반 laterality 사용.
 *   viewport ID 명명 규칙이 변경되어도 정상 동작합니다.
 */
const _viewportLateralityCache = new Map<string, 'R' | 'L'>();

/**
 * viewport별 view position 캐시 (viewportId → 'CC' | 'MLO' | ...)
 *
 * Mirror Mode는 같은 view position 쌍(LCC↔RCC, LMLO↔RMLO)에서만 동작해야 합니다.
 * VIEWPORT_DATA_CHANGED 시 detectViewportViewPosition()으로 감지하여 캐시합니다.
 */
const _viewportViewPositionCache = new Map<string, string>();

const { TOOLBAR_SECTIONS } = ToolbarService;

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: '@ohif/extension-default.hangingProtocolModule.hpMammo',
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

// Basic 모드 섹션을 기반으로 mammography 전용 툴바 구성
// - TrackballRotate, Layout, Crosshairs 제거 (mammography에서 불필요)
// - MoreTools 섹션은 Reset만 표시
export const toolbarSections = {
  ...basicToolbarSections,
  [TOOLBAR_SECTIONS.primary]: [
    'MeasurementTools',
    'Zoom',
    'Pan',
    'WindowLevel',
    'Capture',
    'MoreTools',
    'MirrorMode',
    'OpenMammoCompare',
  ],
  MoreTools: [
    'Reset',
  ],
};

/**
 * 모든 viewport element 리스너를 안전하게 제거하고 Map을 초기화합니다.
 *
 * @description
 * HMR(Hot Module Reload) 안전을 위해 onModeEnter 시작 시에도 호출합니다.
 * onModeExit 없이 onModeEnter가 재실행될 때 이전 리스너가 element에 남는 것을 방지합니다.
 *
 * [M-2 FIX]: 기존 코드는 _viewportListenerMap.clear()만 했으나
 * element에서 실제 removeEventListener를 하지 않아 리스너가 누수됐습니다.
 */
function cleanupAllViewportListeners() {
  _viewportListenerMap.forEach(
    ({ element, stackHandler, renderedHandler, cameraModifiedHandler }) => {
      element.removeEventListener(csEnums.Events.STACK_NEW_IMAGE, stackHandler);
      element.removeEventListener(csEnums.Events.IMAGE_RENDERED, renderedHandler);
      element.removeEventListener(csEnums.Events.CAMERA_MODIFIED, cameraModifiedHandler);
    }
  );
  _viewportListenerMap.clear();
  // [C-8 FIX] laterality / view position 캐시도 함께 초기화
  _viewportLateralityCache.clear();
  _viewportViewPositionCache.clear();
}

/**
 * viewportId로 유방 촬영 방향(laterality) 결정
 *
 * @description
 * 두 단계로 laterality를 결정합니다:
 * 1. viewportId 기반 (빠른 경로): hpMammo.ts의 viewportId 규칙에 따라
 * 2. (향후) displaySet 메타데이터 기반
 *
 * hpMammo.ts viewportId 규칙:
 * - mammo-rcc, mammo-compare-rcc → R
 * - mammo-lcc, mammo-compare-lcc → L
 * - mammo-rmlo, mammo-compare-rmlo → R
 * - mammo-lmlo, mammo-compare-lmlo → L
 *
 * @param viewportId - viewport ID
 * @returns 'R' | 'L' | null (판단 불가 시 null → anchor 미적용)
 */
function getLateralityFromViewportId(viewportId: string): 'R' | 'L' | null {
  if (viewportId.includes('rcc') || viewportId.includes('rmlo')) {
    return 'R';
  }
  if (viewportId.includes('lcc') || viewportId.includes('lmlo')) {
    return 'L';
  }
  return null;
}

/**
 * Mirror Mode 상대 viewport ID 반환
 *
 * hpMammo.ts viewport ID 규칙 (getLateralityFromViewportId와 동일 패턴):
 *   mammo-rcc ↔ mammo-lcc
 *   mammo-rmlo ↔ mammo-lmlo
 *   mammo-compare-rcc ↔ mammo-compare-lcc
 *   mammo-compare-rmlo ↔ mammo-compare-lmlo
 *
 * @returns 상대 viewport ID, 또는 null (패턴 미매칭)
 */
function getOppositeViewportId(viewportId: string): string | null {
  if (viewportId.includes('rcc')) {
    return viewportId.replace('rcc', 'lcc');
  }
  if (viewportId.includes('lcc')) {
    return viewportId.replace('lcc', 'rcc');
  }
  if (viewportId.includes('rmlo')) {
    return viewportId.replace('rmlo', 'lmlo');
  }
  if (viewportId.includes('lmlo')) {
    return viewportId.replace('lmlo', 'rmlo');
  }
  return null;
}

function modeFactory({ modeConfiguration }) {
  return {
    id,
    routeName: 'mammography',
    displayName: 'Mammography',

    /**
     * Lifecycle: onModeEnter
     *
     * @description
     * 모드 진입 시 실행되는 초기화 로직입니다.
     *
     * INITIALIZATION ORDER (의존성 순서):
     * 1. Store 리셋 [C-2 FIX]: stale state 제거
     * 2. 리스너 정리 [M-2 FIX]: HMR 시 이전 리스너 누수 방지
     * 3. Tool groups 초기화
     * 4. Commands/Evaluators 등록
     * 5. Toolbar 설정
     * 6. VIEWPORT_DATA_CHANGED 구독
     *    → addListenersToViewport: element-level 이벤트 핸들러 등록
     *    → Mirror Mode 재적용 (시리즈 변경 시) [C-3 FIX]
     *
     * WHY commands/evaluators in onModeEnter?
     * ExtensionManager는 Extension에 등록된 모듈만 처리합니다.
     * Mode의 getCommandsModule/getEvaluatorsModule은 호출되지 않으므로
     * onModeEnter에서 직접 등록해야 합니다. (usmpr 모드와 동일 패턴)
     */
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }) => {
      // ── [C-2 FIX] Store 초기화 ────────────────────────────────────────
      // Zustand store는 module-level singleton → 모드 종료 후에도 상태 유지됨.
      // 재진입 시 stale state가 남아 버튼 상태와 화면이 불일치할 수 있음.
      // 예: Mirror OFF로 종료 → 재진입 시 store=false, HP=Mirror ON → 불일치
      useMammographyStore.getState().resetToDefaults();

      // ── [M-2 FIX] 이전 세션 리스너 완전 정리 ─────────────────────────
      // HMR 시 onModeExit 없이 onModeEnter가 재실행될 수 있음.
      // 기존 코드: _viewportListenerMap.clear()만 호출 → element에 리스너 누수
      // 수정: element.removeEventListener()까지 호출 후 Map 초기화
      cleanupAllViewportListeners();
      _autoWindowedViewportSet.clear();

      const { toolbarService, toolGroupService, cornerstoneViewportService } =
        servicesManager.services;

      // ── Tool Groups 초기화 ────────────────────────────────────────────
      try {
        initToolGroups(extensionManager, toolGroupService, commandsManager);
      } catch (e) {
        console.error('[Mammography] initToolGroups FAILED:', e);
      }

      // ── Commands 등록 ─────────────────────────────────────────────────
      // MODE의 getCommandsModule은 ExtensionManager가 처리하지 않음.
      // onModeEnter에서 직접 commandsManager.registerCommand로 등록.
      const { definitions } = commandsModule({ servicesManager, commandsManager });
      const MAMMOGRAPHY_CONTEXT = 'MAMMOGRAPHY';
      if (!commandsManager.getContext(MAMMOGRAPHY_CONTEXT)) {
        commandsManager.createContext(MAMMOGRAPHY_CONTEXT);
      }
      Object.entries(definitions).forEach(([name, def]) => {
        commandsManager.registerCommand(MAMMOGRAPHY_CONTEXT, name, def);
      });

      // ── Evaluators 등록 ───────────────────────────────────────────────
      // MODE의 getEvaluatorsModule은 MODULE_TYPES에 없어 ExtensionManager가 처리 안 함.
      // onModeEnter에서 직접 toolbarService.registerEvaluateFunction으로 등록.
      const evaluators = evaluatorsModule({ servicesManager, commandsManager });
      for (const [name, fn] of Object.entries(evaluators)) {
        toolbarService.registerEvaluateFunction(name, fn as any);
      }

      // ── Toolbar 설정 ──────────────────────────────────────────────────
      // allToolbarButtons = basicToolbarButtons + mammographyButtons (line 54)
      // - basic 버튼(Reset, rotate-right 등)도 등록해야 MoreTools 섹션에 표시됨
      // - replace=true로 mammography가 재정의한 Zoom/Pan/WindowLevel이 basic 버전을 덮어씀
      toolbarService.register(allToolbarButtons, true);
      for (const [key, section] of Object.entries(toolbarSections)) {
        toolbarService.updateSection(key, section);
      }

      // ── Auto-windowing 공통 함수 ──────────────────────────────────────
      // JPEG Lossless 이미지의 경우 디코더가 픽셀 값 범위를 잘못 출력하거나
      // DICOM VOI(WindowCenter/Width)와 불일치가 발생할 수 있어 이미지가 어두워짐.
      // 이미지의 실제 픽셀 min/max로 VOI를 재설정하여 올바르게 표시합니다.
      const applyAutoWindowing = (viewportId: string, imageId?: string) => {
        try {
          const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
          if (!viewport) {
            console.warn(`[Mammography] Auto-windowing: viewport not found: ${viewportId}`);
            return;
          }

          const targetImageId = imageId || viewport.getCurrentImageId?.();
          if (!targetImageId) {
            console.warn(`[Mammography] Auto-windowing: no imageId for viewport ${viewportId}`);
            return;
          }

          const image = csCache.getImage(targetImageId);
          if (!image) {
            console.warn(`[Mammography] Auto-windowing: image not in cache: ${targetImageId}`);
            return;
          }

          let lower: number;
          let upper: number;

          // 실제 디코딩된 픽셀 범위 파악
          let minPixelValue = (image as any).minPixelValue;
          let maxPixelValue = (image as any).maxPixelValue;

          if (minPixelValue === undefined || maxPixelValue === undefined) {
            const pixelData = (image as any).getPixelData?.();
            if (pixelData && pixelData.length > 0) {
              let min = Infinity,
                max = -Infinity;
              const step = Math.max(1, Math.floor(pixelData.length / 10000));
              for (let i = 0; i < pixelData.length; i += step) {
                const v = pixelData[i];
                if (v < min) {
                  min = v;
                }
                if (v > max) {
                  max = v;
                }
              }
              minPixelValue = min;
              maxPixelValue = max;
            }
          }

          if (
            minPixelValue === undefined ||
            maxPixelValue === undefined ||
            minPixelValue === maxPixelValue
          ) {
            console.warn(
              `[Mammography] Auto-windowing: invalid pixel range (${minPixelValue}~${maxPixelValue}), skipping`
            );
            return;
          }

          const pixelSpan = maxPixelValue - minPixelValue;

          // DICOM 메타데이터의 VOI LUT를 실제 픽셀 범위에 맞게 적용
          // JPEG Lossless 이미지는 DICOM 헤더가 12-bit를 선언해도
          // 실제 JPEG precision이 8-bit인 경우 픽셀값이 0-255로 디코딩됨.
          const voiLutModule = csMetaData.get('voiLutModule', targetImageId);
          const wcRaw = voiLutModule?.windowCenter;
          const wwRaw = voiLutModule?.windowWidth;

          if (wcRaw !== undefined && wwRaw !== undefined) {
            const windowCenter = Number(Array.isArray(wcRaw) ? wcRaw[0] : wcRaw);
            const windowWidth = Number(Array.isArray(wwRaw) ? wwRaw[0] : wwRaw);

            if (windowWidth > 0) {
              const dicomLower = windowCenter - windowWidth / 2;

              // DICOM VOI LUT 범위가 실제 픽셀 범위보다 4배 이상 크면 스케일링 필요
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

          // render() 이전에 guard 설정 (IMAGE_RENDERED 재진입 race condition 방지)
          _autoWindowedViewportSet.add(viewportId);

          viewport.setProperties({
            voiRange: { lower, upper },
          });
          viewport.render();
        } catch (e) {
          console.warn('[Mammography] Auto-windowing failed:', e);
        }
      };

      // ── resetViewport 오버라이드 (Space 키 / Reset 버튼) ──────────────
      // Cornerstone 기본 resetViewport는 resetProperties()로 VOI를 12-bit 기본값(4096/2047)으로
      // 리셋하여 Mammography 이미지가 어두워지는 문제 발생.
      // MAMMOGRAPHY 컨텍스트에서 오버라이드하여 camera만 리셋하고 VOI는 auto-windowing으로 복원.
      commandsManager.registerCommand(MAMMOGRAPHY_CONTEXT, 'resetViewport', {
        commandFn: () => {
          const { viewportGridService } = servicesManager.services;
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
            _autoWindowedViewportSet.delete(vpId);
            applyAutoWindowing(vpId);
          }
        },
        storeContexts: [],
        options: {},
      });

      // ── [C-1 FIX] Viewport element 이벤트 리스너 등록 ────────────────
      // 각 viewport마다 독립적인 CAMERA_MODIFIED 핸들러를 등록합니다.
      //
      // IMPORTANT: isAnchoring은 반드시 viewport별로 독립적이어야 합니다.
      // 전역 isAnchoring을 사용하면 viewport A가 anchoring 중에
      // viewport B의 CAMERA_MODIFIED를 차단하는 버그가 발생합니다.
      // addListenersToViewport 클로저 내에 let isAnchoring = false 선언.
      const addListenersToViewport = (viewportId: string) => {
        // 이미 등록된 viewport는 스킵
        if (_viewportListenerMap.has(viewportId)) {
          return;
        }

        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
        if (!viewport?.element) {
          console.warn(`[Mammography] addListeners: element not found for viewport ${viewportId}`);
          return;
        }

        // ── Auto-windowing 핸들러 ────────────────────────────────────────

        // STACK_NEW_IMAGE: 새 이미지가 viewport에 설정될 때
        const stackHandler = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (!detail) {
            return;
          }
          const { viewportId: vpId, imageId } = detail;
          _autoWindowedViewportSet.delete(vpId);
          applyAutoWindowing(vpId, imageId);
        };

        // IMAGE_RENDERED: 렌더링 완료 시
        const renderedHandler = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (!detail) {
            return;
          }
          const { viewportId: vpId } = detail;

          // [FIX] chestWallWorldCache 미등록 시 (VIEWPORT_DATA_CHANGED 당시 canvas 크기 0이었던 경우)
          // IMAGE_RENDERED 시점에는 canvas가 올바른 크기를 가지므로 여기서 재시도
          if (
            !chestWallWorldCache.has(vpId) &&
            useMammographyStore.getState().isMirrorModeEnabled
          ) {
            const laterality =
              _viewportLateralityCache.get(vpId) ?? getLateralityFromViewportId(vpId);
            if (laterality) {
              const vp = cornerstoneViewportService.getCornerstoneViewport(vpId) as any;
              if (vp) {
                cacheChestWallWorldAfterSetDisplayArea(vp, vpId, laterality);
              }
            }
          }

          // Auto-windowing (pan/zoom 중 중복 적용 방지를 위해 guard 사용)
          if (_autoWindowedViewportSet.has(vpId)) {
            return;
          }
          applyAutoWindowing(vpId);
        };

        // ── Mirror Mode Pan/Zoom 동기화 핸들러 ──────────────────────────────
        //
        // BEHAVIOR (직접 복사 방식):
        //   현재 viewport의 pan/zoom 상태를 그대로 반대편에 적용.
        //   Pan X: 반전 (L breast 오른쪽 pan → R breast 왼쪽 pan)
        //   Pan Y: 동일 (위아래는 같은 방향)
        //   Zoom (parallelScale): 직접 복사
        //     → zoom center 위치까지 자동으로 sync됨 (delta 계산 불필요)
        //
        // INFINITE LOOP PREVENTION:
        //   isSyncing = true 동안 발생한 CAMERA_MODIFIED 핸들러는 즉시 return.
        //   WHY global flag (not viewport-local)?
        //     상대 viewport의 핸들러도 차단해야 하므로 전역 flag 필요.

        const cameraModifiedHandler = (_event: Event) => {
          if (mirrorSyncState.isSyncing) {
            return;
          }

          const vp = cornerstoneViewportService.getCornerstoneViewport(viewportId) as any;
          if (!vp) {
            return;
          }

          const store = useMammographyStore.getState();

          // ── Mirror Mode sync ──────────────────────────────────────────────
          if (store.isMirrorModeEnabled) {
            const otherViewportId = getOppositeViewportId(viewportId);
            if (otherViewportId) {
              const otherVp = cornerstoneViewportService.getCornerstoneViewport(
                otherViewportId
              ) as any;
              if (otherVp) {
                // Mirror pair 유효성 검사:
                //   1. 반대 laterality: L ↔ R
                //   2. 같은 view position: CC ↔ CC, MLO ↔ MLO
                const myLaterality = _viewportLateralityCache.get(viewportId);
                const otherLaterality = _viewportLateralityCache.get(otherViewportId);
                const myViewPos = _viewportViewPositionCache.get(viewportId);
                const otherViewPos = _viewportViewPositionCache.get(otherViewportId);

                if (
                  myLaterality &&
                  otherLaterality &&
                  myLaterality !== otherLaterality &&
                  myViewPos &&
                  otherViewPos &&
                  myViewPos === otherViewPos
                ) {
                  let currentPan: [number, number];
                  let currentCamera: any;
                  try {
                    currentPan = vp.getPan() as [number, number];
                    currentCamera = vp.getCamera();
                  } catch (e) {
                    return;
                  }

                  mirrorSyncState.isSyncing = true;
                  try {
                    // pan: X 반전, Y 동일 (직접 복사)
                    otherVp.setPan([-currentPan[0], currentPan[1]], false);

                    // zoom: parallelScale 직접 복사
                    const currentZoom = currentCamera?.parallelScale;
                    if (currentZoom != null) {
                      try {
                        const otherCamera = otherVp.getCamera();
                        if (otherCamera) {
                          otherVp.setCamera({ ...otherCamera, parallelScale: currentZoom }, false);
                        }
                      } catch (_) {}
                    }

                    otherVp.render();
                  } finally {
                    mirrorSyncState.isSyncing = false;
                  }
                }
              }
            }
          }

          // ── Midline boundary constraint ───────────────────────────────────
          // Prevent non-chest-wall edge from retracting past center boundary.
          // Runs regardless of mirror mode state — any camera change is validated.
          const lat = _viewportLateralityCache.get(viewportId);
          if (lat) {
            const correction = clampPanToMidlineBoundary(vp, lat);
            if (correction) {
              mirrorSyncState.isSyncing = true;
              try {
                vp.setPan(correction.newPan, false);
                vp.render();
              } finally {
                mirrorSyncState.isSyncing = false;
              }
            }
          }
        };

        // element에 리스너 등록
        viewport.element.addEventListener(csEnums.Events.STACK_NEW_IMAGE, stackHandler);
        viewport.element.addEventListener(csEnums.Events.IMAGE_RENDERED, renderedHandler);
        viewport.element.addEventListener(csEnums.Events.CAMERA_MODIFIED, cameraModifiedHandler);

        // 추후 removeEventListener를 위해 Map에 저장
        _viewportListenerMap.set(viewportId, {
          element: viewport.element,
          stackHandler,
          renderedHandler,
          cameraModifiedHandler, // [C-1 FIX] 추가
        });

      };

      // ── [C-3 FIX] VIEWPORT_DATA_CHANGED 구독 ─────────────────────────
      // HP가 viewport에 display set을 할당할 때 (또는 시리즈 변경 시) 발생합니다.
      // 이 시점에 viewport element가 존재하므로 리스너를 안전하게 등록할 수 있습니다.
      _viewportDataChangedSub = cornerstoneViewportService.subscribe(
        cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
        ({ viewportId }: { viewportId: string }) => {
          // element-level 이벤트 리스너 등록
          addListenersToViewport(viewportId);

          // [FIX] 시리즈 변경 시 이전 시리즈의 stale chestWallWorldCache 삭제
          chestWallWorldCache.delete(viewportId);

          // [C-8 FIX] DICOM 메타데이터 기반 laterality / view position 캐시 갱신
          // VIEWPORT_DATA_CHANGED는 시리즈 로드 / 변경 시에만 발생 (빈도 낮음).
          // CAMERA_MODIFIED(매 pan/zoom마다 발생)에서 값비싼 메타데이터 조회를 하지 않도록
          // 이 시점에 감지하여 캐시합니다.
          const detectedLaterality = detectViewportLaterality(viewportId, servicesManager);
          if (detectedLaterality) {
            _viewportLateralityCache.set(viewportId, detectedLaterality);
          } else {
            _viewportLateralityCache.delete(viewportId);
          }

          const detectedViewPosition = detectViewportViewPosition(viewportId, servicesManager);
          if (detectedViewPosition) {
            _viewportViewPositionCache.set(viewportId, detectedViewPosition);
          } else {
            _viewportViewPositionCache.delete(viewportId);
          }

          // [C-3 FIX] 시리즈 변경 후 Mirror Mode 재적용
          // HP가 displayArea를 설정하지만 Mirror Mode 상태에 맞게 재적용이 필요.
          // applyMirrorModeToViewport: setDisplayArea + 캐시 등록 시도
          //   → 캐시 등록 실패(canvas 0) 시 IMAGE_RENDERED 핸들러에서 재시도
          if (useMammographyStore.getState().isMirrorModeEnabled) {
            applyMirrorModeToViewport(viewportId, servicesManager);
          }

          // ── Auto pair loading ──────────────────────────────────────────
          // Drag&drop으로 시리즈 로드 시 반대편 viewport에 pair를 자동 로드합니다.
          //
          // RULES:
          //   pair 있음 → 반대편 viewport에 pair 자동 로드 (Mirror Mode ON/OFF 무관)
          //   pair 없음 + Mirror Mode ON → 반대편 viewport 클리어
          //   pair 없음 + Mirror Mode OFF → 반대편 유지 (변경 없음)
          //
          // INFINITE LOOP PREVENTION:
          //   반대편에 이미 올바른 pair가 로드되어 있으면 스킵
          //   (LMLO 로드 → RMLO 자동 로드 → VIEWPORT_DATA_CHANGED for RMLO
          //    → 반대편 LMLO 이미 있음 → 스킵)
          // Mirror Mode ON일 때만 pair 자동 로드 (Mirror Mode OFF → 반대편 유지)
          if (
            !_isAutoLoadingPair &&
            detectedLaterality &&
            detectedViewPosition &&
            useMammographyStore.getState().isMirrorModeEnabled
          ) {
            const otherViewportId = getOppositeViewportId(viewportId);
            if (otherViewportId) {
              const { viewportGridService } = servicesManager.services;
              const { viewports: vpMap } = viewportGridService.getState();
              const vpArray = Array.isArray(vpMap)
                ? vpMap
                : vpMap instanceof Map
                  ? Array.from(vpMap.values())
                  : Object.values(vpMap || {});

              // 현재 viewport의 displaySet UID
              const myVpInfo = vpArray.find(
                vp => (vp.viewportId || vp.viewportOptions?.viewportId) === viewportId
              );
              const myCurrentUID = (myVpInfo?.displaySetInstanceUIDs || [])[0] || null;

              // 반대편 viewport의 현재 displaySet UIDs
              const otherVpInfo = vpArray.find(
                vp => (vp.viewportId || vp.viewportOptions?.viewportId) === otherViewportId
              );
              const otherCurrentUIDs: string[] = otherVpInfo?.displaySetInstanceUIDs || [];

              // pair 검색 (반대 laterality + 같은 view position)
              const pairDs = findPairDisplaySet(
                detectedLaterality,
                detectedViewPosition,
                myCurrentUID,
                servicesManager
              );

              if (pairDs) {
                const pairUID = pairDs.displaySetInstanceUID;
                // 반대편에 이미 올바른 pair가 로드되어 있으면 스킵
                if (!otherCurrentUIDs.includes(pairUID)) {
                  _isAutoLoadingPair = true;
                  try {
                    viewportGridService.setDisplaySetsForViewport({
                      viewportId: otherViewportId,
                      displaySetInstanceUIDs: [pairUID],
                    });
                  } finally {
                    // setDisplaySetsForViewport는 async이므로 finally는 즉시 실행됨.
                    // 실제 loop 방지는 "already loaded" 체크로 수행됨.
                    _isAutoLoadingPair = false;
                  }
                }
              } else {
                // Mirror Mode ON + pair 없음 → 반대편 viewport 클리어
                if (otherCurrentUIDs.length > 0) {
                  _isAutoLoadingPair = true;
                  try {
                    viewportGridService.setDisplaySetsForViewport({
                      viewportId: otherViewportId,
                      displaySetInstanceUIDs: [],
                    });
                  } finally {
                    _isAutoLoadingPair = false;
                  }
                }
              }
            }
          }
        }
      );

    },

    /**
     * Lifecycle: onModeExit
     *
     * @description
     * 모드 종료 시 실행됩니다.
     * 모든 구독과 리스너를 제거하여 메모리 누수를 방지합니다.
     *
     * [Task 5 FIX]: cameraModifiedHandler 포함 모든 리스너 제거
     */
    onModeExit: ({ servicesManager }) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
      } = servicesManager.services;

      // VIEWPORT_DATA_CHANGED 구독 해제
      if (_viewportDataChangedSub) {
        _viewportDataChangedSub.unsubscribe();
        _viewportDataChangedSub = null;
      }

      // [Task 5 FIX] CAMERA_MODIFIED 핸들러 포함 모든 리스너 제거
      // 기존: stackHandler, renderedHandler만 제거
      // 수정: cameraModifiedHandler도 함께 제거 (cleanupAllViewportListeners 사용)
      cleanupAllViewportListeners();
      _autoWindowedViewportSet.clear();

      // [BUG FIX] 흉벽 world 캐시 정리: 모드 재진입 시 stale 데이터 방지
      // 새 study 로드 시 이전 study의 world 좌표가 남아있으면 잘못된 anchor 적용 가능.
      _viewportLateralityCache.clear();
      _viewportViewPositionCache.clear();
      chestWallWorldCache.clear();
      _isAutoLoadingPair = false;

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
          ? 'Mammography mode for MG and DX studies'
          : 'This mode is only valid for MG and DX modalities',
      };
    },

    routes: [
      {
        path: 'mammography',
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

    // Toolbar configuration
    toolbarButtons: allToolbarButtons,
    toolbarSections,

    // NOTE: getCommandsModule과 getEvaluatorsModule은 Mode에서 사용되지 않음.
    // [H-1 FIX] Dead code 제거: ExtensionManager는 Extension에 등록된 것만 처리함.
    // Commands/Evaluators는 onModeEnter에서 직접 등록함. (위 코드 참조)
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
