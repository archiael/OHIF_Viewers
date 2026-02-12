/**
 * Mammography Mode Commands Module
 *
 * FR-2.5.5: Mirror Mode Toggle
 * - 초기: ON (기본값)
 * - ON: Chest wall을 가장자리에 고정
 * - OFF: 중앙 배치
 */
import { useMammographyStore } from './store';
import { SeriesLateralityManager } from '@ohif/core/src/utils/SeriesLateralityManager';

// DisplayArea 상수 (Single Source of Truth)
const DISPLAY_AREAS = {
  RIGHT_BREAST: {
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [1.0, 0.5],  // 우측 가장자리 중앙
      canvasPoint: [1.0, 0.5], // Canvas 우측에 고정
    },
    storeAsInitialCamera: false,
  },
  LEFT_BREAST: {
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [0.0, 0.5],  // 좌측 가장자리 중앙
      canvasPoint: [0.0, 0.5], // Canvas 좌측에 고정
    },
    storeAsInitialCamera: false,
  },
  CENTER: {
    imageArea: [1.0, 1.0],
    imageCanvasPoint: {
      imagePoint: [0.5, 0.5],  // 중앙
      canvasPoint: [0.5, 0.5], // Canvas 중앙
    },
    storeAsInitialCamera: false,
  },
};

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
     * ON → OFF 또는 OFF → ON
     */
    toggleMirrorMode: () => {
      const store = useMammographyStore.getState();
      store.toggleMirrorMode();

      applyMirrorMode(servicesManager);
      refreshToolbar();
    },

    /**
     * Mirror Mode 상태 조회
     */
    isMirrorModeEnabled: () => {
      return useMammographyStore.getState().isMirrorModeEnabled;
    },

    /**
     * Compare 모드로 전환
     */
    openMammoCompare: () => {
      const activeDisplaySets = displaySetService.getActiveDisplaySets();
      if (!activeDisplaySets || activeDisplaySets.length === 0) {
        console.error('No active display sets found');
        return;
      }

      const studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
      const urlParams = new URLSearchParams(window.location.search);
      const dataSourceQuery = urlParams.get('datasources') || '';

      const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}${
        dataSourceQuery ? `&datasources=${encodeURIComponent(dataSourceQuery)}` : ''
      }`;

      window.location.href = compareModeUrl;
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
 * Mirror Mode를 모든 viewport에 적용
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

  const { viewports } = viewportGridService.getState();
  const viewportArray = Array.isArray(viewports)
    ? viewports
    : (viewports instanceof Map ? Array.from(viewports.values()) : Object.values(viewports || {}));

  let successCount = 0;
  let failCount = 0;

  viewportArray.forEach(vp => {
    const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
    if (!viewportId) return;

    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport) return;

    const displaySetUIDs = vp.displaySetInstanceUIDs || [];
    if (displaySetUIDs.length === 0) return;

    const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
    const laterality = SeriesLateralityManager.detectLaterality(displaySet);

    let displayArea;

    if (enabled) {
      // Mirror Mode ON: Chest wall to edge
      if (laterality === 'R') {
        displayArea = DISPLAY_AREAS.RIGHT_BREAST;
      } else if (laterality === 'L') {
        displayArea = DISPLAY_AREAS.LEFT_BREAST;
      } else {
        // Laterality 감지 실패 → Skip
        failCount++;
        return;
      }
    } else {
      // Mirror Mode OFF: Center
      displayArea = DISPLAY_AREAS.CENTER;
    }

    viewport.setDisplayArea(displayArea);
    viewport.render();
    successCount++;
  });

  // 사용자 알림
  const status = enabled ? 'ON' : 'OFF';
  const message = failCount > 0
    ? `Mirror Mode ${status} (${successCount} viewports, ${failCount} skipped)`
    : `Mirror Mode ${status}`;

  uiNotificationService.show({
    title: 'Mirror Mode',
    message: message,
    type: 'info',
    duration: 2000,
  });
}

export default commandsModule;
