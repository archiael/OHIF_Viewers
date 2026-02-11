import { id } from './id';
import { utils, ToolbarService, DicomMetadataStore } from '@ohif/core';
import { SeriesLateralityManager } from '@ohif/core/src/utils/SeriesLateralityManager';
import {
  initToolGroups,
  toolbarButtons as basicToolbarButtons,
  toolbarSections as basicToolbarSections,
  ohif,
  cornerstone,
  basicLayout,
  basicRoute,
  extensionDependencies as basicDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
} from '@ohif/mode-basic';
import * as cornerstoneCore from '@cornerstonejs/core';
import {
  eventTarget as coreEventTarget,
  imageLoader,
  Enums,
  imageLoadPoolManager,
  getWebWorkerManager,
} from '@cornerstonejs/core';
import { annotation, utilities as csToolsUtils } from '@cornerstonejs/tools';
import ResizableGridManager from './utils/ResizableGridManager';
import LayoutConfigManager from './utils/LayoutConfigManager';
import SlicePlaneManager from './utils/SlicePlaneManager';
import SlicePlaneSync from './utils/SlicePlaneSync';
import usmprToolbarButtons from './toolbarButtons';
import { refreshViewportsFromConfig } from '../../../extensions/default/src/hangingprotocols/hpUSMPR';
import { isStreamingEnabled } from '../../../extensions/cornerstone/src/index';
import {
  loadRemainingHTJ2KData,
  loadBackgroundHTJ2KData,
  getCacheStats,
  clearHTJ2KCache,
  clearCacheForSeriesChange,
} from '../../../extensions/cornerstone/src/utils/htj2kBackgroundLoader';
import { isServerApiEnabled } from '../../../extensions/cornerstone/src/utils/htj2kConfig';
import {
  isHTJ2KEnabled,
  getResolutionFactor,
} from '../../../extensions/cornerstone/src/utils/htj2kConfig';
import { isRangeRequestEnabled } from '../../../extensions/cornerstone/src/utils/htj2kRangeRequestCore';
import { resetDecodeCount } from '../../../extensions/cornerstone/src/utils/decodeRetryManager';

const { TOOLBAR_SECTIONS } = ToolbarService;

const { structuredCloneWithFunctions } = utils;

/**
 * imageRetrieveMetadataProvider.get() 반환 타입 정의
 */
interface RetrieveMetadata {
  retrieveOptions?: {
    single?: {
      decodeLevel?: number;
      streaming?: boolean;
    };
    default?: {
      decodeLevel?: number;
    };
  };
}

// Global instance of the resizable grid manager
let resizableGridManager: ResizableGridManager | null = null;

// Global instance of the layout config manager
let layoutConfigManager: LayoutConfigManager | null = null;

// Global instances of the 3D slice plane managers
let slicePlaneManager: SlicePlaneManager | null = null;
let slicePlaneSync: SlicePlaneSync | null = null;

// Track timeouts for showing slice planes (to prevent race conditions)
let slicePlaneShowTimeout1: number | null = null;
let slicePlaneShowTimeout2: number | null = null;

// Track viewport positions separately for STACK and VOLUME viewports
// Each viewport (axial STACK, sagittal VOLUME, coronal VOLUME) has its own saved position
const savedViewportPositions: {
  [viewportId: string]: {
    index?: number; // For STACK viewports (mpr-stack-single)
    imageIds?: string[]; // Original imageIds for STACK
    worldPosition?: number[]; // For VOLUME viewports (mpr-1, mpr-2)
    viewportType?: string; // 'stack' or 'orthographic'
  };
} = {};

// Legacy variables for backward compatibility (mainly used for STACK viewport)
let lastStackViewportIndex: number | null = null;
let lastStackOriginalImageIds: string[] | null = null;

// Track current series for cleanup on series change
let currentSeriesInstanceUID: string | null = null;
let pendingMprTerminateTimeout: number | null = null;

// Extension dependencies - same as basic mode
export const extensionDependencies = {
  ...basicDependencies,
};

// Helper function to get layout configuration respecting storage preference
function getLayoutConfig() {
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'US 3D 1',
  };

  try {
    // Check user's storage preference (always in localStorage)
    const preference = localStorage.getItem('usmpr-storage-preference');
    const storage = preference === 'local' ? localStorage : sessionStorage;

    const stored = storage.getItem('usmpr-layout-config');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load layout config from storage:', error);
  }

  return defaultConfig;
}

// Validation function - accepts CT, MR, and US studies (volumetric data for MPR)
export function isValidMode({ modalities }) {
  if (!modalities) {
    return { valid: false, description: 'No modalities found' };
  }

  const modalitiesArray = modalities.split('\\');
  const hasCT = modalitiesArray.includes('CT');
  const hasMR = modalitiesArray.includes('MR');
  const hasUS = modalitiesArray.includes('US');
  const isValid = hasCT || hasMR || hasUS;

  let description = 'USMPR not available for this modality';
  if (hasCT) {
    description = 'CT study - MPR available';
  } else if (hasMR) {
    description = 'MR study - MPR available';
  } else if (hasUS) {
    description = 'US study - MPR available';
  }

  return {
    valid: isValid,
    description: description,
  };
}

/**
 * Apply custom US volume rendering preset to the 3D viewport
 * This function can be called after layout changes or preset changes
 */
async function applyCustomUSPreset(cornerstoneViewportService, presetName = 'US 3D 1') {
  try {
    // Import US preset utilities dynamically
    const {
      createUsSkinPresetA,
      createUsSkinPresetB,
      createUsSkinPresetC,
      createUsSkinPresetD,
      applyVolumeRenderingPreset,
    } = await import('./utils/usVolumePresets');
    const { applyGpuRayCastQuality } = await import('./utils/usVolumeQuality');

    // Get current layout to find 3D viewport position
    const layoutConfig = getLayoutConfig();
    const position3D = layoutConfig?.positions?.indexOf('3D');

    if (position3D === -1 || position3D === undefined) {
      return;
    }

    // Get the 3D viewport
    const viewportId = `mpr-${position3D}`;
    const viewport3D = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport3D) {
      console.warn(
        `⚠️ [US VR] 3D viewport not found at position ${position3D} (ID: ${viewportId})`
      );
      return;
    }

    // Map preset name to factory function
    const presetMap = {
      'US 3D 1': createUsSkinPresetA,
      'US 3D 2': createUsSkinPresetB,
      'US 3D 3': createUsSkinPresetC,
      'US 3D 4': createUsSkinPresetD,
    };

    const presetFactory = presetMap[presetName] || createUsSkinPresetA;
    const preset = presetFactory();

    // Get volume actor and image data
    const actors = viewport3D.getActors();
    if (!actors || actors.length === 0) {
      console.warn('⚠️ [US VR] No actors found in 3D viewport');
      return;
    }

    const volumeActor = actors[0].actor;
    const imageData = viewport3D.getImageData();

    // Apply custom transfer functions
    applyVolumeRenderingPreset({ volumeActor, preset });

    // Get mapper and apply quality settings
    const mapper = volumeActor.getMapper();
    if (mapper && imageData) {
      applyGpuRayCastQuality({ volumeMapper: mapper, imageData });
    }

    // Trigger re-render
    viewport3D.render();
  } catch (error) {
    console.error('❌ [US VR] Failed to apply custom US preset:', error);
    console.error('❌ [US VR] Error stack:', error?.stack);
  }
}

// Make the function globally accessible for layout config manager
(window as any).applyCustomUSPreset = applyCustomUSPreset;

/**
 * Re-initialize slice planes after series change
 * Called when a new series is loaded via double-click
 */
async function reinitializeSlicePlanes() {
  try {
    // Get services from window global (set during onModeEnter)
    const servicesManager = (window as any).usmprServicesManager;
    if (!servicesManager) {
      console.error('❌ [SLICE PLANES] servicesManager not found');
      return;
    }

    const { cornerstoneViewportService } = servicesManager.services;
    const layoutConfig = getLayoutConfig();
    const position3D = layoutConfig.positions.indexOf('3D');

    if (position3D === -1) {
      console.warn('⚠️ [SLICE PLANES] No 3D viewport in layout');
      return;
    }

    // Get fresh viewport reference
    const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
    if (!viewport3D) {
      // Silent return - 3D viewport may not be ready yet during initialization
      return;
    }

    // Destroy old slice plane manager if it exists
    if (slicePlaneManager) {
      try {
        slicePlaneManager.destroy();
      } catch (e) {
        console.warn('⚠️ [SLICE PLANES] Error destroying old manager:', e);
      }
    }

    // Destroy old slice plane sync if it exists
    if (slicePlaneSync) {
      try {
        slicePlaneSync.destroy();
      } catch (e) {
        console.warn('⚠️ [SLICE PLANES] Error destroying old sync:', e);
      }
    }

    // Clear any existing timeouts to prevent race conditions
    if (slicePlaneShowTimeout1 !== null) {
      clearTimeout(slicePlaneShowTimeout1);
      slicePlaneShowTimeout1 = null;
    }
    if (slicePlaneShowTimeout2 !== null) {
      clearTimeout(slicePlaneShowTimeout2);
      slicePlaneShowTimeout2 = null;
    }

    // Re-initialize slice plane manager (hidden initially, will show after images load)
    slicePlaneManager = new SlicePlaneManager();
    slicePlaneManager.initialize(viewport3D);
    slicePlaneManager.setVisible(false); // Hidden initially - will show after images load

    // Map viewport positions to orientations
    const viewportInfos = [];
    layoutConfig.positions.forEach((viewType, index) => {
      if (viewType !== '3D') {
        viewportInfos.push({
          viewportId: `mpr-${index}`,
          orientation: viewType.toLowerCase(),
        });
      }
    });

    // Re-initialize slice plane sync
    const coreEventTarget = (window as any).cornerstoneEventTarget;
    slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
    slicePlaneSync.initialize(viewportInfos, coreEventTarget);
    slicePlaneSync.setEnabled(true);

    // Update positions after delay, then show planes (hidden initially to avoid showing before images load)
    slicePlaneShowTimeout1 = window.setTimeout(() => {
      if (slicePlaneSync) {
        slicePlaneSync.updateAllPlanes();
      }
    }, 1000);

    // Show planes after images are loaded
    slicePlaneShowTimeout2 = window.setTimeout(() => {
      if (slicePlaneSync) {
        slicePlaneSync.updateAllPlanes();
      }
      if (slicePlaneManager) {
        slicePlaneManager.setVisible(true);
      }
    }, 2000);
  } catch (error) {
    console.error('❌ [SLICE PLANES] Error re-initializing slice planes:', error);
    console.error('❌ [SLICE PLANES] Error stack:', error?.stack);
  }
}

// Make the function globally accessible
(window as any).reinitializeSlicePlanes = reinitializeSlicePlanes;

/**
 * HTJ2K Background Progressive Loading 트리거
 *
 * @description
 * Volume 로딩 완료 후 Background에서 나머지 HTJ2K 데이터를 로드합니다.
 * 이를 통해 Stack 스크롤 시 즉시 Level 0 디코딩이 가능합니다.
 *
 * 네트워크 흐름:
 * 1차 (Foreground): bytes=0-99999 → Level 2 → Volume 표시 (20MB)
 * 2차 (Background): bytes=100000-끝 → HTJ2K 캐시 (110MB)
 * 스크롤 시: 캐시된 전체 데이터 → Level 0 → Stack 표시
 *
 * @param cornerstoneViewportService - Cornerstone Viewport Service
 */
/**
 * Background에서 Level 0 이미지 미리 로드 (Range Request 비활성화 시)
 *
 * @description
 * Volume Level 2 로딩 완료 후, Stack용 Level 0 이미지를 Background에서 미리 다운로드합니다.
 * Cornerstone 이미지 캐시에 저장되어 Stack 전환 시 다운로드 없이 바로 사용 가능합니다.
 *
 * @param imageIds - 로드할 이미지 ID 배열
 */
async function preloadLevel0Images(imageIds: string[]): Promise<void> {
  if (!imageLoader?.loadAndCacheImage) {
    console.warn('[HTJ2K-BG] Cornerstone imageLoader not available');
    return;
  }

  const totalImages = imageIds.length;
  let loadedCount = 0;
  let successCount = 0;
  let failCount = 0;

  // 병렬 처리 (동시 20개)
  const BATCH_SIZE = 20;

  for (let i = 0; i < totalImages; i += BATCH_SIZE) {
    const batch = imageIds.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(imageId => {
      return imageLoader
        .loadAndCacheImage(imageId, {
          decodeLevel: 0,
        })
        .then(() => {
          successCount++;
        })
        .catch(() => {
          failCount++;
        })
        .finally(() => {
          loadedCount++;
        });
    });

    // 배치 완료 대기
    await Promise.all(batchPromises);

    const percent = Math.round((loadedCount / totalImages) * 100);
  }
}

async function triggerHTJ2KBackgroundLoad(cornerstoneViewportService: any): Promise<void> {
  // HTJ2K가 비활성화되어 있으면 Background Load 스킵
  if (!isHTJ2KEnabled()) {
    return;
  }

  if (ENABLE_VOLUME_BACKGROUND_LOAD === false) {
    return;
  }

  try {
    // Get all Volume viewports (mpr-0, mpr-1, mpr-2, mpr-3)
    const volumeViewportIds = ['mpr-0', 'mpr-1', 'mpr-2', 'mpr-3'];
    const allImageIds = new Set<string>();

    for (const viewportId of volumeViewportIds) {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport && viewport.getImageIds) {
        const imageIds = viewport.getImageIds();
        if (imageIds && imageIds.length > 0) {
          imageIds.forEach((id: string) => allImageIds.add(id));
        }
      }
    }

    if (allImageIds.size === 0) {
      return;
    }

    const imageIdsArray = Array.from(allImageIds);

    // Server API, Range Request 활성화 여부에 따라 다른 전략 사용
    // 우선순위: Server API > Range Request > Level 0 Preload
    if (isServerApiEnabled()) {
      // Server API 활성화: ?complement=2 요청으로 나머지 데이터 다운로드

      await loadBackgroundHTJ2KData(
        imageIdsArray,
        'volume', // ⚠️ Volume viewport는 Level 0 로딩 건너뜀 (메모리 최적화)
        progress => {
          if (progress.percent % 20 === 0) {
          }
        },
        result => {
          const cacheStats = getCacheStats();
        }
      );
    } else if (isRangeRequestEnabled()) {
      // Range Request 활성화: 나머지 데이터만 추가 다운로드

      await loadRemainingHTJ2KData(
        imageIdsArray,
        'volume', // ⚠️ Volume viewport는 Level 0 로딩 건너뜀 (메모리 최적화)
        progress => {
          if (progress.percent % 20 === 0) {
          }
        },
        result => {
          const cacheStats = getCacheStats();
        }
      );
    } else {
      // Range Request 비활성화: Level 0 전체 이미지 미리 다운로드
      await preloadLevel0Images(imageIdsArray);
    }
  } catch (error) {
    console.error('[HTJ2K-BG] ❌ Error in background loading:', error);
  }
}

/**
 * HTJ2K Level 2 Volume Viewport Camera Scale 보정
 *
 * @description
 * PixelSpacing을 원본으로 유지하면 Volume의 물리적 크기가 1/resolutionFactor로 줄어듭니다.
 * Camera의 parallelScale을 조정하여 화면에 원본 크기로 표시되도록 합니다.
 *
 * 동작 원리:
 * - Level 2 (resolutionFactor=4): Volume 크기 1/4 → parallelScale 1/4 → 화면에 원본 크기
 * - parallelScale이 작을수록 더 확대되어 보임
 *
 * @see document/TASK-72-LEVEL2-MPR-VOLUME.md - Phase 6
 *
 * @param cornerstoneViewportService - Cornerstone Viewport Service
 */
function applyHTJ2KCameraScaleCorrection(cornerstoneViewportService: any): void {
  if (!isHTJ2KEnabled()) {
    return;
  }

  // IMPORTANT: Camera scale correction is ONLY needed when metadata adjustment is NOT working
  // When metadata adjustment is enabled (for local files), PixelSpacing is already adjusted
  // and the Volume has correct physical size. Applying camera scale correction would be
  // a DOUBLE CORRECTION causing images to appear 4x zoomed in.
  //
  // Camera scale correction should only be used for DICOMweb where metadata can't be
  // adjusted on the server side.
  return;

  // DISABLED CODE - kept for reference in case needed for DICOMweb without metadata adjustment
  /*
  const resolutionFactor = getResolutionFactor('volume');
  if (resolutionFactor <= 1) {
    return;
  }


  // Volume viewports (mpr-0, mpr-1, mpr-2) - 3D viewport (mpr-3) 제외
  const volumeViewportIds = ['mpr-0', 'mpr-1', 'mpr-2'];

  for (const viewportId of volumeViewportIds) {
    try {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        continue;
      }

      // Camera 가져오기
      const camera = viewport.getCamera();
      if (!camera) {
        continue;
      }

      // parallelScale 조정: 1/resolutionFactor로 줄이면 resolutionFactor배 확대
      const originalScale = camera.parallelScale;
      const correctedScale = originalScale / resolutionFactor;

      viewport.setCamera({
        ...camera,
        parallelScale: correctedScale,
      });

    } catch (error) {
      console.error(`[HTJ2K-Scale] Error correcting ${viewportId}:`, error);
    }
  }

  */
}

// Custom onModeEnter for USMPR - uses basic tool initialization
export function onModeEnter({ servicesManager, extensionManager, commandsManager }) {
  try {
    const savedConfig = localStorage.getItem('usmpr-layout-config');
  } catch (e) {
    console.error('❌ [USMPR INIT] Error checking saved config:', e);
  }

  const {
    displaySetService,
    measurementService,
    toolbarService,
    toolGroupService,
    viewportGridService,
    cornerstoneViewportService,
    hangingProtocolService,
    customizationService,
  } = servicesManager.services;

  if (ENABLE_LOW_MEMORY_MODE && csToolsUtils?.stackContextPrefetch?.enable) {
    (window as any).__usmprStackPrefetchEnable = csToolsUtils.stackContextPrefetch.enable;
    csToolsUtils.stackContextPrefetch.enable = () => {
      // disabled in low-memory mode
    };
  }

  if (csToolsUtils?.stackContextPrefetch?.setConfiguration) {
    csToolsUtils.stackContextPrefetch.setConfiguration({
      maxImagesToPrefetch: MAX_LEVEL0_IMAGES,
      minBefore: STACK_PREFETCH_RANGE,
      maxAfter: STACK_PREFETCH_RANGE,
      directionExtraImages: 0,
      preserveExistingPool: false,
    });
  }

  // Disable auto cine for USMPR mode (user can enable it manually if needed)
  customizationService.setCustomizations({
    autoCineModalities: {
      $set: [], // Empty array = no modalities auto-start cine
    },
  });

  // Store servicesManager globally for slice plane re-initialization
  (window as any).usmprServicesManager = servicesManager;

  // 🔒 Prevent SR protocol from changing USMPR layout
  // SR measurements will still be added via addSRAnnotation() as annotation layers

  const currentActiveProtocols =
    hangingProtocolService.activeProtocolIds || Array.from(hangingProtocolService.protocols.keys());

  // Filter out SR protocol
  const filteredProtocols = currentActiveProtocols.filter(id => {
    const lowerCaseId = id?.toLowerCase() || '';
    const shouldInclude =
      lowerCaseId !== '@ohif/sr' && lowerCaseId !== 'sr' && !lowerCaseId.includes('sr key images');
    if (!shouldInclude) {
      console.warn(`🚫 [USMPR] Filtering out protocol: ${id}`);
    }
    return shouldInclude;
  });

  hangingProtocolService.setActiveProtocolIds(filteredProtocols);

  // 🔒 SUPER AGGRESSIVE SR PROTECTION: Override ALL hanging protocol change methods
  // When SR files are loaded, OHIF tries to apply SR hanging protocol (Stack viewports)
  // We want to keep USMPR Volume viewports and just add measurements to them

  const originalProtocolId = '@ohif/hpUSMPR';

  // Store original methods
  const originalSetProtocol = hangingProtocolService.setProtocol?.bind(hangingProtocolService);
  const originalRun = hangingProtocolService.run?.bind(hangingProtocolService);
  const originalSetActiveProtocol =
    hangingProtocolService.setActiveProtocol?.bind(hangingProtocolService);

  (window as any).usmprOriginalMethods = {
    setProtocol: originalSetProtocol,
    run: originalRun,
    setActiveProtocol: originalSetActiveProtocol,
  };

  // Override ALL protocol change methods
  if (hangingProtocolService.setProtocol) {
    hangingProtocolService.setProtocol = function (protocolId, options = {}) {
      if (protocolId === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED setProtocol(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      return originalSetProtocol(protocolId, options);
    };
  }

  if (hangingProtocolService.run) {
    hangingProtocolService.run = function (protocol, options = {}) {
      if (protocol?.id === '@ohif/sr' || protocol === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED run(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      return originalRun(protocol, options);
    };
  }

  if (hangingProtocolService.setActiveProtocol) {
    hangingProtocolService.setActiveProtocol = function (protocolId, options = {}) {
      if (protocolId === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED setActiveProtocol(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      return originalSetActiveProtocol(protocolId, options);
    };
  }

  // Clear measurements
  measurementService.clearMeasurements();

  // Destroy any existing tool groups before creating new ones
  // This prevents "ToolGroup already exists" errors when re-entering the mode
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroupService.destroyToolGroup(toolGroupId);
    }
  });

  // Initialize tool groups using basic mode's initToolGroups
  // This properly registers tools with the extensionManager
  try {
    initToolGroups(extensionManager, toolGroupService, commandsManager);
  } catch (e) {
    console.error('❌ [USMPR INIT] initToolGroups failed:', e);
    console.error('❌ [USMPR INIT] Error stack:', e?.stack);
    throw e;
  }

  // Hide textBox statistics for EllipticalROI and CircleROI tools
  // This removes the green "Area: NaN, Mean: NaN..." text and dotted link line from viewport
  toolGroupIds.forEach(toolGroupId => {
    annotation.config.style.setToolGroupToolStyles(toolGroupId, {
      EllipticalROI: {
        textBoxVisibility: false,
      } as any,
      CircleROI: {
        textBoxVisibility: false,
      } as any,
      global: {},
    });
  });

  // Patch CrosshairsTool to add error handling during initialization
  // This prevents crashes when mouse moves before all viewports are ready
  setTimeout(() => {
    try {
      const toolGroup = toolGroupService.getToolGroup('mpr');
      if (toolGroup) {
        const crosshairsTool = toolGroup.getToolInstance('Crosshairs');
        if (crosshairsTool && crosshairsTool.mouseMoveCallback) {
          const originalMouseMove = crosshairsTool.mouseMoveCallback.bind(crosshairsTool);
          crosshairsTool.mouseMoveCallback = function (evt) {
            try {
              return originalMouseMove(evt);
            } catch (error) {
              // Silently catch errors during viewport initialization
              if (error.message?.includes('length') || error.message?.includes('undefined')) {
                // Viewports not ready yet, ignore
                return;
              }
              throw error; // Re-throw other errors
            }
          };
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not patch CrosshairsTool:', error);
    }
  }, 100);

  // Track previous layout to detect actual dimension changes
  let previousLayout = { numRows: 2, numCols: 2 };

  // Auto-disable Crosshairs when viewport is maximized (single viewport)
  // Track previous crosshairs state to restore when returning to MPR grid
  // Initialize as true so crosshairs are active by default in USMPR mode
  let crosshairsWasActive = true;

  // Crosshairs monitor state - declared here so layoutChangeHandler can access it
  let lastCrosshairsState = false;

  // NOTE: lastStackViewportIndex and lastStackOriginalImageIds are defined as module-level
  // variables at the top of this file (lines 40-42). Do NOT redeclare them here!

  const layoutChangeHandler = evt => {
    const handlerStart = performance.now();

    // LAYOUT_CHANGED events have numCols/numRows at top level
    const { numCols, numRows } = evt;

    // Validate we have the data we need
    if (typeof numCols !== 'number' || typeof numRows !== 'number') {
      return;
    }

    // Only process when layout dimensions actually change
    const hasLayoutChanged =
      previousLayout.numRows !== numRows || previousLayout.numCols !== numCols;

    if (!hasLayoutChanged) {
      // Skip redundant events (e.g., drag with same 2x2 layout)
      return;
    }

    // Update tracking
    previousLayout = { numRows, numCols };

    const isSingleViewport = numRows === 1 && numCols === 1;
    const isMPRGrid = numRows === 2 && numCols === 2;

    //   numRows,
    //   numCols,
    //   isSingleViewport,
    //   isMPRGrid,
    //   hasResizableGridManager: !!resizableGridManager,
    // });

    // Get the appropriate tool group based on layout
    // Single viewport uses 'default', MPR uses 'mpr'
    const toolGroupId = isSingleViewport ? 'default' : 'mpr';
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);

    if (!toolGroup && isMPRGrid) {
      // MPR tool group should exist for MPR grid
      console.warn('MPR tool group not found');
      return;
    }

    // Hide/show viewport grid dividing lines
    // Fallback: Initialize ResizableGridManager if not already initialized (should be initialized on mode enter)
    if (isMPRGrid && !resizableGridManager) {
      const container = document.querySelector('[data-cy="viewport-grid"]');
      if (container) {
        resizableGridManager = new ResizableGridManager(viewportGridService);
        resizableGridManager.initialize('[data-cy="viewport-grid"]');
        resizableGridManager.show();

        // Make it globally accessible for layout config modal
        (window as any).usmprResizableGridManager = resizableGridManager;
      }
    }

    if (resizableGridManager) {
      if (isSingleViewport) {
        resizableGridManager.hide();
      } else if (isMPRGrid) {
        resizableGridManager.show();
      }
    }

    if (isSingleViewport) {
      // When switching to single viewport, save crosshairs state from MPR tool group
      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        crosshairsWasActive = activeTool === 'Crosshairs';
      }

      // Setup STACK viewport synchronization if active viewport is mpr-stack-single
      const activeViewportId = viewportGridService.getState().activeViewportId;
      if (activeViewportId === 'mpr-stack-single') {
        // Defer to next frame to allow UI to update first
        requestAnimationFrame(() => {
          setupSingleStackViewport(servicesManager, viewportGridService).catch(err => {
            console.error('[USMPR] Failed to setup STACK viewport:', err);
          });
        });

        // 🎯 [STACK VIEW] Stack images already prefetched in Phase 2
        // Images cached and ready for instant display - no loading needed!
      }

      // Don't hide planes here - let the monitor handle it based on crosshair state
      // The monitor will detect if crosshairs are deactivated and hide planes automatically

      // Reset crosshairs state so monitor will detect change when returning to 4-port
      lastCrosshairsState = false;
    } else if (isMPRGrid && toolGroup) {
      // ✨ KEY INSIGHT: When toggling layouts, viewports are NOT destroyed/recreated!
      // The viewportGridService just resizes/repositions existing viewport instances.

      // ⚠️ [DECISION] Do NOT terminate workers during layout changes!
      //
      // Why workers should NOT be terminated here:
      // 1. Layout change may happen DURING series loading (drag & drop)
      // 2. Terminating workers blocks ongoing image decoding → blank viewports
      // 3. Workers can be reused for any viewport type (Stack or MPR)
      // 4. Browser GC frees WASM heap when images are dereferenced (cache cleanup)
      //
      // Previous issue: Worker termination here caused blank MPR on drag & drop
      // because workers were killed while series was still loading.

      // CRITICAL: Read viewport position from toggleOneUp command
      // Works for axial (STACK), sagittal, and coronal (VOLUME) viewports

      // Track whether we're returning from a VOLUME viewport
      // This will prevent STACK sync code from overriding VOLUME position
      let returningFromVolumeViewport = false;

      try {
        const savedPosition = (window as any)._ohifViewportExitPosition;

        if (savedPosition) {
          const viewportId = savedPosition.viewportId;

          // Save position into our tracking object
          if (savedPosition.worldPosition) {
            // VOLUME viewport: Store world coordinates and jump to position

            savedViewportPositions[viewportId] = {
              worldPosition: savedPosition.worldPosition,
              viewportType: savedPosition.viewportType,
            };

            // Set flag to skip STACK sync logic below
            returningFromVolumeViewport = true;

            // CRITICAL: Clear legacy STACK variables so STACK sync doesn't run
            lastStackViewportIndex = null;
            lastStackOriginalImageIds = null;

            // Jump to the saved world position immediately
            // CRITICAL: Jump ALL THREE viewports, not just axial!
            // Each viewport only respects its own slice direction, so we need to jump all of them
            setTimeout(() => {
              try {
                const worldPos = savedPosition.worldPosition;

                // Get all three MPR viewports
                const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2']; // axial, sagittal, coronal
                const viewportNames = ['Axial', 'Sagittal', 'Coronal'];

                for (let i = 0; i < viewportIds.length; i++) {
                  const vpId = viewportIds[i];
                  const vpName = viewportNames[i];
                  const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);

                  if (viewport && viewport.jumpToWorld) {
                    viewport.jumpToWorld(worldPos);
                  } else {
                    console.warn(`[LAYOUT] ⚠️ ${vpName} (${vpId}) not available or no jumpToWorld`);
                  }
                }

                // Verify positions after 500ms
                setTimeout(() => {
                  for (let i = 0; i < viewportIds.length; i++) {
                    const vpId = viewportIds[i];
                    const vpName = viewportNames[i];
                    const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
                    if (viewport && viewport.getCamera) {
                      const camera = viewport.getCamera();
                    }
                  }
                }, 500);
              } catch (error) {
                console.error('[LAYOUT] ❌ Error jumping to world position:', error);
                console.error('[LAYOUT] ❌ Error stack:', error.stack);
              }
            }, 200);
          } else if (savedPosition.index !== undefined) {
            // STACK viewport: Store index and imageIds
            savedViewportPositions[viewportId] = {
              index: savedPosition.index,
              imageIds: savedPosition.imageIds,
              viewportType: savedPosition.viewportType,
            };

            // Also update legacy variables for STACK sync to use
            lastStackViewportIndex = savedPosition.index;
            lastStackOriginalImageIds = savedPosition.imageIds;
          } else {
            console.warn('⚠️ [LAYOUT] Saved position has neither worldPosition nor index');
          }

          // Clear the window global
          delete (window as any)._ohifViewportExitPosition;
        } else {
          console.warn('⚠️ [LAYOUT] No saved viewport position found');
        }
      } catch (error) {
        console.error('❌ [LAYOUT] Error reading saved position:', error);
      }

      // STEP 1: Teardown STACK viewport synchronization when returning to MPR grid
      teardownSingleStackViewport(servicesManager, viewportGridService).catch(err => {
        console.error('[USMPR] Failed to teardown STACK viewport:', err);
      });

      // STEP 2: When switching to MPR grid, activate crosshairs with mouse bindings
      // First, make WindowLevel passive so Crosshairs can use the left mouse button
      const utilityModule = extensionManager.getModuleEntry(
        '@ohif/extension-cornerstone.utilityModule.tools'
      );
      const { Enums } = utilityModule.exports;

      // Deactivate WindowLevel and make it passive to free up the left mouse button
      toolGroup.setToolPassive('WindowLevel');

      // Restore crosshairs state based on what it was before switching to 1-port
      // If crosshairsWasActive is true, activate it; otherwise, keep it passive
      if (crosshairsWasActive) {
        toolGroup.setToolActive('Crosshairs', {
          bindings: [
            {
              mouseButton: Enums.MouseBindings.Primary, // Left mouse button for crosshairs
            },
          ],
        });
        // Update monitor state to match
        lastCrosshairsState = true;
      } else {
        toolGroup.setToolPassive('Crosshairs');
        // Update monitor state to match
        lastCrosshairsState = false;
      }

      // ============== WORLD COORDINATE SYNC START ==============

      // Sync ALL MPR viewports to saved viewport position via world coordinates
      // User wants: 1-port slice 200 → 4-port all viewports at slice 200
      // Architecture: Saved position → ImagePositionPatient → jumpToWorld() → CrosshairsTool → all MPR viewports sync
      if (lastStackViewportIndex !== null && lastStackOriginalImageIds !== null) {
        setTimeout(() => {
          try {
            // Validate the index is within bounds
            if (
              lastStackViewportIndex < 0 ||
              lastStackViewportIndex >= lastStackOriginalImageIds.length
            ) {
              console.warn(
                `[USMPR] ⚠️ Index out of bounds: ${lastStackViewportIndex} (array length: ${lastStackOriginalImageIds.length})`
              );
              return;
            }

            // Get the original imageId (without ?stackView suffix) at the STACK position
            const originalImageId = lastStackOriginalImageIds[lastStackViewportIndex];

            if (!originalImageId) {
              console.warn(`[USMPR] ⚠️ No imageId found at index ${lastStackViewportIndex}`);
              console.warn(`[USMPR] lastStackOriginalImageIds:`, lastStackOriginalImageIds);
              return;
            }

            // Get ImagePositionPatient (world coordinates) from DICOM metadata
            const imagePlaneModule = cornerstoneCore.metaData.get(
              'imagePlaneModule',
              originalImageId
            );

            if (!imagePlaneModule || !imagePlaneModule.imagePositionPatient) {
              console.warn('[USMPR] ⚠️ No imagePlaneModule or imagePositionPatient found');
              console.warn('[USMPR] Available metadata keys:', Object.keys(imagePlaneModule || {}));
              return;
            }

            const worldPosition = imagePlaneModule.imagePositionPatient;

            // Jump to world position using axial viewport
            // CrosshairsTool automatically propagates to sagittal/coronal
            const axialViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-0');

            if (axialViewport && axialViewport.jumpToWorld) {
              axialViewport.jumpToWorld(worldPosition);
            } else {
              console.warn('[USMPR] ⚠️ Axial viewport or jumpToWorld not available');
              console.warn('[USMPR] Viewport object:', axialViewport);
            }
          } catch (error) {
            console.error('[USMPR] ❌ Error syncing to world position:', error);
            console.error('[USMPR] Error stack:', error.stack);
          }
        }, 200);
      } else {
      }

      // Also ensure StackScrollMouseWheel is active for mouse wheel scrolling
      try {
        toolGroup.setToolActive('StackScrollMouseWheel');
      } catch (e) {
        console.warn('⚠️ StackScrollMouseWheel not available:', e);
      }

      crosshairsWasActive = false; // Reset flag

      // No need to restore position - viewports keep their frame positions automatically!

      // CRITICAL DEBUG: Check current crosshairs state and manager status

      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        const isCrosshairsActive = activeTool === 'Crosshairs';

        // Force state reset to ensure monitor detects change
        lastCrosshairsState = false;
      } else {
        console.warn('⚠️ [USMPR] MPR tool group not found!');
      }

      // CRITICAL: Re-initialize slice planes when returning to 4-port
      const layoutConfig = getLayoutConfig();
      const position3D = layoutConfig?.positions?.indexOf('3D');

      if (position3D !== -1 && position3D !== undefined) {
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);

        if (viewport3D) {
          // Destroy old slice plane manager if it exists
          if (slicePlaneManager) {
            try {
              slicePlaneManager.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old manager:', e);
            }
          }

          // Destroy old slice plane sync if it exists
          if (slicePlaneSync) {
            try {
              slicePlaneSync.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old sync:', e);
            }
          }

          // Re-initialize slice plane manager
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          slicePlaneManager.setVisible(true); // Always visible

          // Map viewport positions to orientations
          const viewportInfos = [];
          layoutConfig.positions.forEach((viewType, index) => {
            if (viewType !== '3D') {
              viewportInfos.push({
                viewportId: `mpr-${index}`,
                orientation: viewType.toLowerCase(),
              });
            }
          });

          // Re-initialize slice plane sync
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(true); // Always enabled

          // Re-apply custom US preset after returning to 4-port
          setTimeout(() => {
            const currentLayoutConfig = getLayoutConfig();
            const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
            applyCustomUSPreset(cornerstoneViewportService, currentPresetName);
          }, 100); // Apply quickly to minimize flash of old preset
        }
        // Silent if 3D viewport not found - may still be initializing
      } else {
        // Silent if no 3D position - layout might not include 3D viewport
      }
    }
  };

  // Subscribe to layout changes

  // 🧹 시리즈 변경 감지를 위한 이전 시리즈 UID 추적
  let previousSeriesUIDs: string[] = [];

  /**
   * Stack 이미지 캐시 클리어 (시리즈 변경 시)
   * Volume은 유지하고 Stack 이미지만 해제하여 메모리 확보
   */
  const clearStackImageCache = (seriesUIDs: string[]) => {
    try {
      let clearedCount = 0;

      // ✅ FIX: Iterate through ALL cached images, not just current viewport
      // Previous bug: Only cleared images in mpr-stack-single viewport's imageId list
      // This caused accumulation of Stack images from previous series
      const cachedImageIds = cornerstoneCore.cache.getCacheInformation().imageCache;

      Object.keys(cachedImageIds || {}).forEach((imageId: string) => {
        // Stack images have ?stackView=N parameter
        if (imageId && imageId.includes('stackView=')) {
          // If seriesUIDs provided, only clear images from those series
          const shouldClear =
            seriesUIDs.length === 0 || seriesUIDs.some(uid => imageId.includes(uid));

          if (shouldClear) {
            try {
              cornerstoneCore.cache.removeImageLoadObject(imageId);
              clearedCount++;
            } catch (e) {
              // Image might not be removable if in use
              console.debug('[Stack Cache] Could not remove:', imageId.substring(0, 60));
            }
          }
        }
      });

      // Clear the Level 0 tracking set as well
      const prevSize = loadedLevel0Images.size;
      loadedLevel0Images.clear();

      if (clearedCount > 0 || prevSize > 0) {
      }
    } catch (e) {
      console.warn('[Stack Cache] Failed to clear stack cache:', e);
    }
  };

  // Clear old volume caches to prevent memory accumulation
  const clearOldVolumeCaches = (previousSeriesUIDs: string[]) => {
    try {
      const volumes = cornerstoneCore.cache.getVolumes();
      let clearedCount = 0;

      volumes.forEach(volume => {
        // Check if this volume belongs to a previous series
        const volumeId = volume.volumeId;
        const belongsToPreviousSeries = previousSeriesUIDs.some(seriesUID =>
          volumeId.includes(seriesUID)
        );

        if (belongsToPreviousSeries) {
          try {
            cornerstoneCore.cache.removeVolumeLoadObject(volumeId);
            clearedCount++;
            const sizeMB = (volume.sizeInBytes / 1024 / 1024).toFixed(1);
          } catch (e) {
            console.debug('[Volume Cache] Failed to remove volume:', e);
          }
        }
      });

      if (clearedCount > 0) {
      }
    } catch (e) {
      console.warn('[Volume Cache] Failed to clear volume cache:', e);
    }
  };

  // Subscribe to ALL events to see what fires
  const allEventsSubs = [];
  for (const eventName in viewportGridService.EVENTS) {
    const eventKey = viewportGridService.EVENTS[eventName];
    const unsub = viewportGridService.subscribe(eventKey, evt => {
      if (eventName === 'LAYOUT_CHANGED' || eventName === 'GRID_STATE_CHANGED') {
        layoutChangeHandler(evt);
      }
      // Reapply custom US preset when viewports are updated (e.g., new series loaded)
      if (eventName === 'VIEWPORTS_READY') {
        // 🧹 현재 viewport에 로드된 시리즈 UID 수집
        const currentSeriesUIDs: string[] = [];
        const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2', 'mpr-3', 'mpr-stack-single'];
        viewportIds.forEach(vpId => {
          try {
            const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
            if (viewport) {
              const actors = (viewport as any).getActors?.();
              actors?.forEach((actor: any) => {
                const uid = actor.uid || '';
                // volumeId에서 시리즈 UID 추출 (예: cornerstoneStreamingImageVolume:1.2.3.4.5)
                if (uid && uid.includes('.')) {
                  // 숫자와 점으로 구성된 UID 패턴 찾기
                  const match = uid.match(/(\d+\.[\d.]+)/);
                  if (match && !currentSeriesUIDs.includes(match[1])) {
                    currentSeriesUIDs.push(match[1]);
                  }
                }
              });
            }
          } catch (e) {
            // viewport 접근 실패 무시
          }
        });

        // 🧹 시리즈 변경 감지 및 Stack 캐시 클리어
        const seriesChanged =
          currentSeriesUIDs.length > 0 &&
          (previousSeriesUIDs.length === 0 ||
            !currentSeriesUIDs.every(uid => previousSeriesUIDs.includes(uid)));

        if (seriesChanged) {
          // 🔄 [HTJ2K-WASM-RESET] 워커 재시작 비활성화
          // ⚠️ 시리즈 변경 시 워커 재시작하면 새 Volume 로딩이 실패함
          // WASM 힙 메모리 관리는 decodeRetryManager의 자동 복구에 의존:
          // - 연속 5회 WASM 오류 발생 시 워커 자동 재시작
          // - 이 방식이 Volume 로딩 중단 없이 안전하게 동작함
          // 디코딩 카운터만 리셋 (모니터링용)
          resetDecodeCount();

          // ✅ [MEMORY FIX] Clear STACK caches ONLY (keep volume caches for both series)
          // User requirements:
          // 1. "All images should be visible" - both series displayed simultaneously
          // 2. "Volume image is OK" - keep volume caches (Level 2, small memory footprint)
          // 3. "Cached original images better to be removed" - clear stack caches (Level 0, large)
          //
          // Strategy: Keep volume caches for multi-series comparison, clear stack caches to free memory
          // Root cause: HTJ2K decodes sequentially (0→1→2→...), but jumpToSlice requests middle frame immediately
          // This timing mismatch causes blank viewport. Cache cleanup reduces worker contention.

          // ✅ [SERIES-TRACKING] Track series change for monitoring
          // NOTE: Cleanup happens in drag & drop handler BEFORE loading (not here!)
          // This matches commit 309ec16a0 architecture where cleanup is preventive, not reactive

          // 🔵 [LATERALITY] On FIRST load, check if we should switch to RIGHT series
          // TEMPORARILY DISABLED for debugging - will re-enable after fixing import
          const ENABLE_LATERALITY_SELECTION = false;
          if (
            ENABLE_LATERALITY_SELECTION &&
            previousSeriesUIDs.length === 0 &&
            currentSeriesUIDs.length > 0
          ) {
            try {
              // Check if SeriesLateralityManager is available
              if (!SeriesLateralityManager) {
                console.error('[USMPR-Laterality] SeriesLateralityManager not imported!');
                throw new Error('SeriesLateralityManager not available');
              }

              // Get all displaySets for the current study
              const allDisplaySets = displaySetService.getActiveDisplaySets();

              // Filter to only image series (exclude SR)
              const imageSeries = allDisplaySets.filter(
                ds =>
                  ds.Modality !== 'SR' &&
                  !ds.SOPClassHandlerId?.includes('SR') &&
                  ds.numImageFrames > 1
              );

              // 🔍 DEBUG: Log DICOM tags for each series to diagnose laterality detection
              imageSeries.forEach((ds, i) => {
                // Try detection
                const detected = SeriesLateralityManager.detectLaterality(ds);
              });

              if (imageSeries.length > 1) {
                // Group by laterality
                const groups = SeriesLateralityManager.groupByLaterality(imageSeries);

                // Check if we have RIGHT series available
                if (groups.right.length > 0) {
                  const currentLoadedUID = currentSeriesUIDs[0];
                  const rightSeriesUID = groups.right[0].SeriesInstanceUID;

                  // If current series is NOT RIGHT, switch to RIGHT
                  if (currentLoadedUID !== rightSeriesUID) {
                    // Get RIGHT displaySet
                    const rightDisplaySet = groups.right[0];

                    // Switch all volume viewports to RIGHT series
                    commandsManager.run('setDisplaySetsForViewports', {
                      viewportsToUpdate: [
                        {
                          viewportId: 'mpr-0',
                          displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID],
                        },
                        {
                          viewportId: 'mpr-1',
                          displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID],
                        },
                        {
                          viewportId: 'mpr-2',
                          displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID],
                        },
                        {
                          viewportId: 'mpr-3',
                          displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID],
                        },
                      ],
                    });

                    // 🔥 CRITICAL: Update currentSeriesInstanceUID to RIGHT series
                    // Without this, drag & drop won't detect series change!
                    currentSeriesInstanceUID = rightSeriesUID;
                    (window as any).__usmprCurrentSeriesUID = rightSeriesUID;
                  } else {
                  }
                } else {
                }
              } else {
              }
            } catch (error) {
              console.error('❌ [USMPR-Laterality] Error selecting RIGHT series');
              console.error(
                '   Error message:',
                error instanceof Error ? error.message : String(error)
              );
              console.error(
                '   Error stack:',
                error instanceof Error ? error.stack : 'No stack trace'
              );
              console.error('   Error object:', error);
            }
          }

          // Update global currentSeriesInstanceUID for drag & drop handler to use
          currentSeriesInstanceUID = currentSeriesUIDs[0] || null;
          (window as any).__usmprCurrentSeriesUID = currentSeriesInstanceUID;

          // 🔍 DEBUG: Log current series UID for cleanup tracking

          // Reload Stack viewport with new series imageIds
          reloadStackViewportForNewSeries(servicesManager, viewportGridService, viewportData).catch(
            err => {
              console.error('[USMPR-SeriesChange] Stack reload failed:', err);
            }
          );

          previousSeriesUIDs = [...currentSeriesUIDs];
        }

        setTimeout(() => {
          // Step 1: Apply 3D volume rendering preset
          const currentLayoutConfig = getLayoutConfig();
          const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
          applyCustomUSPreset(cornerstoneViewportService, currentPresetName);

          // Step 2: HTJ2K camera scale correction
          applyHTJ2KCameraScaleCorrection(cornerstoneViewportService);

          // Step 3: Load SR displaySets AFTER viewport adjustments
          setTimeout(() => loadSRDisplaySets('viewports ready - after adjustments'), 100);
        }, 50);
      }
    });
    allEventsSubs.push(unsub);
  }

  // Store unsubscribe function for cleanup
  (window as any).usmprLayoutUnsubscribe = () => {
    allEventsSubs.forEach(unsub => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
  };

  // Register basic mode toolbar buttons first
  toolbarService.register(basicToolbarButtons);

  // Then register USMPR custom buttons (LayoutConfig, etc.)
  toolbarService.register(usmprToolbarButtons);

  // Update toolbar sections from USMPR mode
  for (const [key, section] of Object.entries(this.toolbarSections)) {
    toolbarService.updateSection(key, section);
  }

  // Monitor Crosshairs activation state to track button toggles
  // Slice planes are always visible, but we need to track crosshair state for layout switching
  let monitorCount = 0;
  let verboseLoggingUntil = 0; // Timestamp for verbose logging

  const crosshairsMonitor = setInterval(() => {
    // Track crosshairs state to preserve it across layout changes
    const toolGroup = toolGroupService.getToolGroup('mpr');
    if (!toolGroup) {
      if (monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil) {
      }
      monitorCount++;
      return;
    }

    const activeTool = toolGroup.getActivePrimaryMouseButtonTool();
    const isCrosshairsActive = activeTool === 'Crosshairs';

    // Log periodically OR during verbose period
    const shouldLog = monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil;
    if (shouldLog) {
    }
    monitorCount++;

    // Only update if state changed
    if (isCrosshairsActive !== lastCrosshairsState) {
      // Enable verbose logging for next 3 seconds
      verboseLoggingUntil = Date.now() + 3000;

      lastCrosshairsState = isCrosshairsActive;

      // Update crosshairsWasActive to preserve state across layout changes
      crosshairsWasActive = isCrosshairsActive;

      // Slice planes remain always visible regardless of crosshair state
    }
  }, 100); // Check every 100ms

  // Store interval for cleanup
  (window as any).usmprCrosshairsMonitor = crosshairsMonitor;

  // Initialize ResizableGridManager with retry mechanism
  // DICOMweb loading takes longer, so we need to retry if container is not ready
  const initResizableGrid = (retryCount = 0, maxRetries = 10) => {
    const container = document.querySelector('[data-cy="viewport-grid"]');
    if (container && !resizableGridManager) {
      resizableGridManager = new ResizableGridManager(viewportGridService);
      resizableGridManager.initialize('[data-cy="viewport-grid"]', false); // false = don't hide

      // Make it globally accessible for layout config modal
      (window as any).usmprResizableGridManager = resizableGridManager;

      // Apply saved layout immediately
      setTimeout(() => {
        if (resizableGridManager) {
          resizableGridManager.show(); // This restores saved positions and applies layout
        }
      }, 50);
    } else if (!container && retryCount < maxRetries) {
      // Retry with increasing delay (100ms, 200ms, 300ms, ...)
      const delay = (retryCount + 1) * 100;
      setTimeout(() => initResizableGrid(retryCount + 1, maxRetries), delay);
    } else if (!container) {
      console.warn('⚠️ [USMPR] Viewport grid container not found after max retries');
    }
  };
  // Start initialization with initial delay
  setTimeout(() => initResizableGrid(), 50);

  // Initialize 3D reference planes and related components
  setTimeout(() => {
    // Initialize 3D reference planes
    try {
      const layoutConfig = getLayoutConfig();

      const position3D = layoutConfig?.positions?.indexOf('3D');

      if (position3D !== -1 && position3D !== undefined) {
        // Get the 3D viewport
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);

        if (viewport3D) {
          // Clear any existing timeouts to prevent race conditions
          if (slicePlaneShowTimeout1 !== null) {
            clearTimeout(slicePlaneShowTimeout1);
            slicePlaneShowTimeout1 = null;
          }
          if (slicePlaneShowTimeout2 !== null) {
            clearTimeout(slicePlaneShowTimeout2);
            slicePlaneShowTimeout2 = null;
          }

          // Destroy old slice plane manager if it exists (prevent duplicates)
          if (slicePlaneManager) {
            try {
              slicePlaneManager.destroy();
            } catch (e) {
              console.warn('⚠️ [USMPR] Error destroying old manager:', e);
            }
          }

          // Destroy old slice plane sync if it exists
          if (slicePlaneSync) {
            try {
              slicePlaneSync.destroy();
            } catch (e) {
              console.warn('⚠️ [USMPR] Error destroying old sync:', e);
            }
          }

          // Initialize slice plane manager (created hidden by default, will show after images load)
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          // Note: Planes are created hidden by default in SlicePlaneManager

          // Map viewport positions to orientations (skip 3D position)
          const viewportInfos = [];
          layoutConfig.positions.forEach((viewType, index) => {
            if (viewType !== '3D') {
              viewportInfos.push({
                viewportId: `mpr-${index}`,
                orientation: viewType.toLowerCase(), // 'axial', 'sagittal', 'coronal'
              });
            }
          });

          // Initialize slice plane sync with Cornerstone event target
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(true); // ✅ ALWAYS ENABLED - syncing slice planes automatically

          // Update slice plane positions after a delay to ensure viewports are fully loaded
          slicePlaneShowTimeout1 = window.setTimeout(() => {
            if (slicePlaneSync) {
              slicePlaneSync.updateAllPlanes();
            }
          }, 1000); // Wait 1000ms for viewports to fully load and position cameras

          // Force another update after volume rendering to ensure correct position
          // Then show the planes (they were hidden initially to avoid showing before images load)
          slicePlaneShowTimeout2 = window.setTimeout(() => {
            if (slicePlaneSync) {
              slicePlaneSync.updateAllPlanes();
            }
            // Now show the planes after images are loaded and positioned
            if (slicePlaneManager) {
              slicePlaneManager.setVisible(true);
            }
          }, 2000); // Additional update at 2000ms

          // Apply custom US volume rendering preset
          setTimeout(() => {
            const currentLayoutConfig = getLayoutConfig();
            const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
            applyCustomUSPreset(cornerstoneViewportService, currentPresetName);
          }, 100); // Apply quickly to minimize flash of old preset
        } else {
          console.warn('⚠️ [USMPR] 3D viewport not found at position', position3D);
          console.warn('⚠️ [USMPR] Viewport ID attempted: mpr-' + position3D);
        }
      } else {
        console.warn('ℹ️ [USMPR] No 3D viewport in current layout configuration');
        console.warn('ℹ️ [USMPR] position3D value:', position3D);
        console.warn('ℹ️ [USMPR] layoutConfig.positions:', layoutConfig?.positions);
      }
    } catch (error) {
      console.error('❌ [USMPR] Failed to initialize 3D reference planes:', error);
      console.error('❌ [USMPR] Error stack:', error?.stack);
    }
  }, 200); // Reduced delay to minimize flash of old CT preset

  // Initialize layout config manager
  layoutConfigManager = new LayoutConfigManager();
  layoutConfigManager.setServicesManager(servicesManager);

  // Make it globally accessible for toolbar button
  (window as any).usmprLayoutConfigManager = layoutConfigManager;

  // 🔄 Helper function to load SR displaySets
  // This is called on initial load and when viewports/layout changes
  const loadSRDisplaySets = async (reason = 'initial load') => {
    const allDisplaySets = displaySetService.activeDisplaySets;
    const srDisplaySets = allDisplaySets.filter(
      ds => ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
    );

    if (srDisplaySets.length > 0) {
      // On reload (viewport/series change): clean up existing SR annotations
      // so measurements are re-evaluated against the current viewport series only
      if (reason !== 'initial load') {
        // 1. Remove all SR-originated annotations from Cornerstone
        const allAnnotations = annotation.state.getAllAnnotations();
        const srAnnotationUIDs = allAnnotations
          .filter(a => a.metadata?.isSRAnnotation === true)
          .map(a => a.annotationUID);

        srAnnotationUIDs.forEach(uid => {
          annotation.state.removeAnnotation(uid);
        });

        // 2. Reset loaded state on SR measurements so they can be re-processed
        srDisplaySets.forEach(srDS => {
          if (srDS.measurements) {
            srDS.measurements.forEach(m => {
              m.loaded = false;
            });
          }
        });
      }

      // Load each SR displaySet to extract and add measurements
      for (const srDS of srDisplaySets) {
        if (typeof srDS.load === 'function') {
          try {
            await srDS.load();
          } catch (error) {
            console.error('❌ [USMPR] Error loading SR displaySet:', error);
          }
        } else {
          console.error('❌ [USMPR] SR displaySet.load() not available!');
        }
      }

      // Trigger viewport re-render to display SR annotations
      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      if (renderingEngine) {
        renderingEngine.renderViewports(renderingEngine.getViewports().map(vp => vp.id));
      }
    } else {
    }
  };

  // 🔄 Automatically load SR displaySets on initial load
  setTimeout(() => loadSRDisplaySets('initial load'), 1000);

  // 🔄 Subscribe to viewport data changes to reload SR when images change
  const viewportDataChangedUnsub = cornerstoneViewportService.subscribe(
    cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
    evt => {
      // Only reload if we have SR displaySets
      const allDisplaySets = displaySetService.activeDisplaySets;
      const hasSR = allDisplaySets.some(
        ds => ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
      );
      if (hasSR) {
        setTimeout(() => loadSRDisplaySets('viewport data changed'), 200);
      }
    }
  );

  // Store unsubscribe function for cleanup
  (window as any).usmprViewportDataChangedUnsub = viewportDataChangedUnsub;

  // 🔥 [SERIES-CLEANUP] Define cleanup function for series changes
  // This removes old series data but keeps workers alive for reuse
  (window as any).__usmprCleanupOldSeries = async (oldSeriesUID: string) => {
    if (pendingMprTerminateTimeout) {
      clearTimeout(pendingMprTerminateTimeout);
      pendingMprTerminateTimeout = null;
    }

    try {
      const { cache, imageLoadPoolManager } = await import('@cornerstonejs/core');
      // 1) Clear pending image load requests (prevents wasted decoding) (prevents wasted decoding)
      ['interaction', 'thumbnail', 'prefetch'].forEach(requestType => {
        imageLoadPoolManager.clearRequestStack(requestType);
      });

      // 2) Remove ONLY cached images that belong to the old series
      let totalImagesRemoved = 0;
      const cacheInfo = cache.getCacheInformation?.() || {};
      const allCachedImageIds = Object.keys(cacheInfo.imageCache || {});

      allCachedImageIds.forEach(imageId => {
        if (imageId && imageId.includes(oldSeriesUID)) {
          try {
            cache.removeImageLoadObject(imageId);
            totalImagesRemoved++;
          } catch (e) {
            // Ignore missing cache entries
          }
        }
      });

      // 3) Clear HTJ2K cache entries not in the current series (if known)
      try {
        if (currentSeriesInstanceUID) {
          clearCacheForSeriesChange([currentSeriesInstanceUID]);
        } else {
          clearCacheForSeriesChange([]);
        }
      } catch (e) {
        console.warn('[CLEANUP] Failed to clear HTJ2K cache for series change:', e);
      }

      // NOTE: Do NOT call cache.purgeCache() or terminate workers during series switching.
      // It can blank the current MPR when returning to a previous series.
    } catch (err) {
      console.error('[CLEANUP] Cleanup failed:', err);
      console.error('   Error details:', err?.message);
      console.error('   Error stack:', err?.stack);
      throw err;
    }
  };

  // 🔥 [SERIES-TRACKING] Initialize currentSeriesUID from initial series
  // This is critical - without this, second series won't trigger cleanup!
  setTimeout(() => {
    try {
      const displaySets = displaySetService.getActiveDisplaySets();
      if (displaySets && displaySets.length > 0) {
        const firstSeries = displaySets.find(ds => ds.Modality !== 'SR');
        if (firstSeries && firstSeries.SeriesInstanceUID) {
          (window as any).__usmprCurrentSeriesUID = firstSeries.SeriesInstanceUID;
        }
      }
    } catch (err) {
      console.warn('[SERIES-TRACKING] Failed to set initial series UID:', err);
    }
  }, 2000); // 2 seconds - after hanging protocol loads initial series

  // 🔥 [MEMORY-OPT] Three-Phase Worker Termination with Auto-Prefetch
  // Phase 1: MPR complete → Terminate
  // Phase 2: Restart → Prefetch Stack → Terminate
  // Phase 3: User switches to Stack → Instant display (zero wait)

  const getPendingRequestsCount = () => {
    const pools = ['interaction', 'thumbnail', 'prefetch', 'compute'];
    let totalPending = 0;

    pools.forEach(poolType => {
      try {
        const pool = imageLoadPoolManager.getRequestPool(poolType);
        const pending = pool?.numRequests || 0;
        totalPending += pending;
      } catch (e) {
        // Ignore
      }
    });

    return totalPending;
  };
  const findDisplaySetForVolumeId = volumeId => {
    const allDisplaySets = displaySetService.getActiveDisplaySets();
    if (!allDisplaySets || allDisplaySets.length === 0) {
      return null;
    }

    for (const ds of allDisplaySets) {
      if (ds.Modality === 'SR' || ds.SeriesDescription?.includes('Annotations')) {
        continue;
      }

      const dsVolumeId = `cornerstoneStreamingImageVolume:${ds.displaySetInstanceUID}`;
      if (dsVolumeId === volumeId || ds.volumeId === volumeId) {
        return ds;
      }
    }

    return null;
  };

  // Phase 2: Prefetch Stack images and terminate
  const triggerStackPrefetch = async volumeId => {
    if (ENABLE_STACK_PREFETCH_PHASE2 === false) {
      return;
    }

    try {
      // Find the displaySet that matches this volumeId
      const allDisplaySets = displaySetService.getActiveDisplaySets();
      if (!allDisplaySets || allDisplaySets.length === 0) {
        console.warn('⚠️ [STACK PREFETCH] No active displaySets');
        return;
      }

      let displaySet = findDisplaySetForVolumeId(volumeId);

      // Fallback: Use first imaging displaySet if volumeId match fails
      if (!displaySet) {
        console.warn(
          `⚠️ [STACK PREFETCH] Could not match volumeId, using first imaging displaySet as fallback`
        );
        const imagingDisplaySets = allDisplaySets.filter(ds => {
          return ds.Modality !== 'SR' && !ds.SeriesDescription?.includes('Annotations');
        });
        if (imagingDisplaySets.length === 0) {
          console.error('❌ [STACK PREFETCH] No imaging displaySets found');
          return;
        }
        displaySet = imagingDisplaySets[0];
      }

      // Transform MPR imageIds to Stack imageIds
      // MPR uses: dicomfile:X?level=2 (1/4 resolution)
      // Stack uses: dicomfile:X?stackView=Y (full resolution)
      // InstanceNumber is in DICOM tag 0020,0013
      if (!displaySet.images || displaySet.images.length === 0) {
        console.warn('⚠️ [STACK PREFETCH] No images found in displaySet.images');

        // Try using instances if images is not available
        if (!displaySet.instances || displaySet.instances.length === 0) {
          console.error('❌ [STACK PREFETCH] No images or instances found in displaySet');
          return;
        }
      }

      const sourceImages =
        displaySet.images?.length > 0 ? displaySet.images : displaySet.instances || [];

      const imageIds = sourceImages
        .map((img, index) => {
          const baseImageId = img?.imageId?.split('?')[0];
          if (!baseImageId) {
            return null;
          }
          return `${baseImageId}?stackView=${index}`;
        })
        .filter(Boolean) as string[];

      if (imageIds.length === 0) {
        console.error('❌ [STACK PREFETCH] No valid imageIds generated for stack prefetch');
        return;
      }

      const axialViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-0');
      let centerIndex =
        axialViewport && typeof axialViewport.getCurrentImageIdIndex === 'function'
          ? axialViewport.getCurrentImageIdIndex()
          : null;

      if (centerIndex === null || centerIndex === undefined) {
        centerIndex = Math.floor(imageIds.length / 2);
      }

      // Clamp to valid range
      centerIndex = Math.max(0, Math.min(centerIndex, imageIds.length - 1));

      const startIdx = Math.max(0, centerIndex - STACK_PREFETCH_RANGE);
      const endIdx = Math.min(imageIds.length - 1, centerIndex + STACK_PREFETCH_RANGE);
      const windowImageIds = imageIds.slice(startIdx, endIdx + 1);

      // Prefetch windowed Stack images by loading them via Cornerstone imageLoader
      let loadedCount = 0;
      let failedCount = 0;

      const loadPromises = windowImageIds.map(async (imageId, index) => {
        try {
          await imageLoader.loadAndCacheImage(imageId);
          loadedCount++;
          if (loadedCount === 1) {
          }
          return { success: true, index };
        } catch (err) {
          failedCount++;
          console.warn(`⚠️ [STACK PREFETCH] Failed to load image ${index}:`, err?.message);
          return { success: false, index, error: err?.message };
        }
      });

      await Promise.allSettled(loadPromises);

      // Now wait for all prefetch requests to complete
      setTimeout(() => checkPrefetchComplete(0), 2000);
    } catch (err) {
      console.error('❌ [STACK PREFETCH] Failed:', err?.message);
    }
  };

  const checkPrefetchComplete = async (retryCount = 0) => {
    const MAX_RETRIES = 60; // 120 seconds max (280 images can take time)

    try {
      // Check if there are pending prefetch requests
      const pools = ['interaction', 'thumbnail', 'prefetch'];
      let totalPending = 0;

      pools.forEach(poolType => {
        try {
          const pool = imageLoadPoolManager.getRequestPool(poolType);
          const pending = pool?.numRequests || 0;
          if (pending > 0) {
          }
          totalPending += pending;
        } catch (e) {
          // Ignore
        }
      });

      if (totalPending > 0) {
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => checkPrefetchComplete(retryCount + 1), 2000);
          return;
        } else {
          console.warn(`⚠️ [STACK PREFETCH] Max retries (${MAX_RETRIES * 2}s), terminating anyway`);
        }
      } else {
      }

      // Terminate workers - all images now in cache
      const workerManager = getWebWorkerManager();

      if (workerManager && typeof workerManager.terminate === 'function') {
        workerManager.terminate('dicomImageLoader');
      }
    } catch (err) {
      console.error('❌ [STACK PREFETCH] Termination failed:', err?.message);
    }
  };

  // Phase 1: MPR completion handler
  const volumeLoadedHandler = async event => {
    const { volumeId } = event.detail;
    if (pendingMprTerminateTimeout) {
      clearTimeout(pendingMprTerminateTimeout);
      pendingMprTerminateTimeout = null;
    }

    // Terminate after MPR if safe (low memory mode)
    pendingMprTerminateTimeout = setTimeout(async () => {
      pendingMprTerminateTimeout = null;

      if (ENABLE_LOW_MEMORY_MODE === false) {
        return;
      }

      if (ENABLE_MPR_WORKER_TERMINATION === false) {
        return;
      }

      const displaySet = findDisplaySetForVolumeId(volumeId);
      const seriesUID = displaySet?.SeriesInstanceUID;

      if (seriesUID && currentSeriesInstanceUID && seriesUID !== currentSeriesInstanceUID) {
        return;
      }

      const pending = getPendingRequestsCount();
      if (pending > 0) {
        return;
      }

      try {
        const workerManager = getWebWorkerManager();

        if (workerManager && typeof workerManager.terminate === 'function') {
          workerManager.terminate('dicomImageLoader');

          if (ENABLE_STACK_PREFETCH_PHASE2) {
            setTimeout(() => {
              triggerStackPrefetch(volumeId);
            }, 1000);
          }
        }
      } catch (err) {
        console.error('[MPR COMPLETE] Worker termination failed:', err?.message);
      }
    }, 1000); // 1 second for rendering
  };

  // Register event listener
  coreEventTarget.addEventListener(
    Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
    volumeLoadedHandler
  );

  // Create and register USMPR commands context
  commandsManager.createContext('USMPR');

  // Register custom command for opening layout config modal
  commandsManager.registerCommand('USMPR', 'openLayoutConfigModal', {
    commandFn: () => {
      if (layoutConfigManager) {
        layoutConfigManager.show();
      } else {
        console.error('❌ layoutConfigManager is null!');
      }
    },
  });

  // Register command for opening SR Report Page
  commandsManager.registerCommand('USMPR', 'openSRReportPage', {
    commandFn: async () => {
      const { measurementService, displaySetService } = servicesManager.services;

      // Extract ALL measurements (including SR)
      const measurements = Array.from(measurementService.measurements.values());

      // Get study/series context
      const activeDisplaySets = displaySetService.activeDisplaySets;
      const firstDS = activeDisplaySets[0];

      // Log each measurement's details
      measurements.forEach((m, idx) => {
        //   uid: m.uid,
        //   toolName: m.toolName,
        //   label: m.label,
        //   displayText: m.displayText,
        //   finding: m.finding,
        //   metadata: m.metadata,
        //   hasDisplaySetUID: !!m.displaySetInstanceUID,
        //   isSRAnnotation: m.metadata?.isSRAnnotation,
        // });
      });

      // Clinical data is now embedded in SR DICOM measurements via metadata.clinical
      // No need to load external JSON file

      // Use ALL measurements for now (not filtering)
      const srMeasurements = measurements;

      // Prepare data for report page
      const reportData = {
        studyInstanceUID: firstDS?.StudyInstanceUID || '',
        seriesInstanceUID: firstDS?.SeriesInstanceUID || '',
        patientID: firstDS?.PatientID || '-',
        patientName: firstDS?.PatientName || 'Unknown',
        studyDate: firstDS?.StudyDate || '',
        measurements: srMeasurements.map(m => {
          // PRIORITY: Use label field first (contains all the data)
          let displayText = '';
          if (m.label && typeof m.label === 'string') {
            displayText = m.label;
          } else if (m.finding?.text) {
            displayText = m.finding.text;
          } else if (m.displayText) {
            if (typeof m.displayText === 'string') {
              displayText = m.displayText;
            } else if (typeof m.displayText === 'object') {
              // displayText is an object like {primary: [], secondary: []}
              const parts = [];
              if (m.displayText.primary && Array.isArray(m.displayText.primary)) {
                parts.push(...m.displayText.primary);
              }
              if (m.displayText.secondary && Array.isArray(m.displayText.secondary)) {
                parts.push(...m.displayText.secondary);
              }
              displayText = parts.join(', ');
            }
          }

          // Extract malignancy values from clinical metadata
          const maligMax = extractFromMetadata(m, 'malignancy_max');
          const maligAvg = extractFromMetadata(m, 'malignancy_avg');

          // Format malignancy as "max/avg" if both values exist, otherwise use single value
          let maligPercent = '';
          if (maligMax && maligAvg && !isNaN(maligMax) && !isNaN(maligAvg)) {
            // Both values exist - format as "max/avg"
            maligPercent = `${Math.round(maligMax)}/${Math.round(maligAvg)}`;
          } else {
            // Fall back to single value from display text
            maligPercent = extractMaligPercent(displayText);
          }

          const extractedData = {
            uid: m.uid,
            frameRange: extractFrameRange(displayText) || extractFromMetadata(m, 'frame_range'),
            position: extractPositionFromMeasurement(m),
            size: extractSizeFromMeasurement(m),
            maxSurfVol: extractMaxSurfVol(m, displayText),
            nature: extractFromMetadata(m, 'nature') || 'Mass',
            cat: extractFromMetadata(m, 'cat') || '',
            maligPercent: maligPercent,
            echo: extractFromMetadata(m, 'echo_pattern') || '',
            shape: extractFromMetadata(m, 'shape') || '',
            orientation: extractFromMetadata(m, 'orientation') || extractOrientationFromParallel(m),
            margin: extractFromMetadata(m, 'margin') || '',
            includeEcho: true,
            includeShape: true,
            includeOrientation: true,
            includeMargin: true,
            rawDisplayText: displayText,
            rawData: {
              toolName: m.toolName,
              displayText: m.displayText,
              finding: m.finding,
              label: m.label,
              text: m.text,
              metadata: m.metadata,
            },
          };

          return extractedData;
        }),
        timestamp: new Date().toISOString(),
      };

      // Mapping functions to convert numeric AI values to text
      function mapEchoPattern(value) {
        const map = ['anechoic', 'hypoechoic', 'isoechoic', 'hyperechoic', 'complex echoic'];
        return map[value] || '';
      }

      function mapShape(value) {
        const map = ['round', 'oval', 'irregular'];
        return map[value] || '';
      }

      function mapOrientation(value) {
        const map = ['parallel', 'non-parallel'];
        return map[value] || '';
      }

      function mapMargin(value) {
        const map = ['circumscribed', 'indistinct', 'angulated', 'spiculated', 'microlobulated'];
        return map[value] || '';
      }

      // Helper function to extract metadata fields from measurement object
      function extractFromMetadata(measurement, fieldName) {
        // Helper to convert values
        function convertValue(value) {
          if (fieldName === 'echo_pattern' && typeof value === 'number') {
            return mapEchoPattern(value);
          }
          if (fieldName === 'shape' && typeof value === 'number') {
            return mapShape(value);
          }
          if (fieldName === 'orientation' && typeof value === 'number') {
            return mapOrientation(value);
          }
          if (fieldName === 'margin' && typeof value === 'number') {
            return mapMargin(value);
          }
          return value;
        }

        // 1. Check metadata.clinical object (SR might store here)
        if (
          measurement.metadata?.clinical &&
          measurement.metadata.clinical[fieldName] !== undefined
        ) {
          const rawValue = measurement.metadata.clinical[fieldName];
          const convertedValue = convertValue(rawValue);
          return convertedValue;
        }

        // 2. Check metadata directly
        if (measurement.metadata && measurement.metadata[fieldName] !== undefined) {
          return convertValue(measurement.metadata[fieldName]);
        }

        // 3. Check finding object
        if (measurement.finding && measurement.finding[fieldName] !== undefined) {
          return convertValue(measurement.finding[fieldName]);
        }

        // 4. Check data object (SR annotations might store here)
        if (measurement.data && measurement.data[fieldName] !== undefined) {
          return convertValue(measurement.data[fieldName]);
        }

        // 5. Check top level
        if (measurement[fieldName] !== undefined) {
          return convertValue(measurement[fieldName]);
        }

        // 6. Check if it's in findingSites with a specific type
        if (measurement.findingSites && Array.isArray(measurement.findingSites)) {
          for (const site of measurement.findingSites) {
            if (site.type === fieldName && site.text) {
              return site.text;
            }
          }
        }

        return '';
      }

      // Helper function to extract orientation from is_parallel flag
      function extractOrientationFromParallel(measurement) {
        const isParallel = extractFromMetadata(measurement, 'is_parallel');
        if (isParallel === true || isParallel === 'true' || isParallel === 1) {
          return 'parallel';
        } else if (isParallel === false || isParallel === 'false' || isParallel === 0) {
          return 'non-parallel';
        }
        return '';
      }

      // Helper function to extract frame range from text like "(slice 25)" or "slice 20-25"
      function extractFrameRange(text) {
        if (!text || typeof text !== 'string') {
          return '';
        }

        // Match patterns like "(slice 25)" or "slice 20-25" or "frame 10-15"
        const sliceMatch =
          text.match(/\(slice\s+(\d+(?:-\d+)?)\)/i) || text.match(/slice\s+(\d+(?:-\d+)?)/i);
        const frameMatch = text.match(/frame\s+(\d+(?:-\d+)?)/i);

        if (sliceMatch) {
          return sliceMatch[1];
        }
        if (frameMatch) {
          return frameMatch[1];
        }

        return '';
      }

      // Helper function to extract malignancy percentage like "M:83%"
      function extractMaligPercent(text) {
        if (!text || typeof text !== 'string') {
          return '';
        }

        // Match pattern like "M:83%" or "M: 83%"
        const match = text.match(/M[:\s]*(\d+)%/i);
        if (match) {
          return match[1];
        }

        return '';
      }

      // Helper function to extract max/surface/volume metrics
      function extractMaxSurfVol(measurement, text) {
        const parts = [];

        // Try to extract from metadata.clinical first (from SR DICOM codes)
        if (measurement.metadata?.clinical) {
          const clinical = measurement.metadata.clinical;

          // Max diameter from max_diameter_mm (calculated from masks)
          if (clinical.max_diameter_mm !== undefined) {
            parts.push(`${clinical.max_diameter_mm.toFixed(1)}`);
          }

          // Surface area from surface_area_mm2
          if (clinical.surface_area_mm2 !== undefined) {
            parts.push(`${clinical.surface_area_mm2.toFixed(1)}`);
          }

          // Volume from volume_mm3
          if (clinical.volume_mm3 !== undefined) {
            parts.push(`${clinical.volume_mm3.toFixed(1)}`);
          }
        }

        // Fallback to measurement.stats if metadata not available
        if (parts.length === 0 && measurement.stats) {
          if (measurement.stats.max !== undefined) {
            parts.push(`${measurement.stats.max.toFixed(1)}`);
          }
          if (measurement.area !== undefined) {
            parts.push(`${measurement.area.toFixed(1)}`);
          }
          if (measurement.volume !== undefined) {
            parts.push(`${measurement.volume.toFixed(1)}`);
          }
        }

        return parts.join('/');
      }

      // Helper function to extract field from text (echo, margin, shape) - kept for compatibility
      function extractFieldFromText(text, field) {
        if (!text || typeof text !== 'string') {
          return '';
        }

        const lowerText = text.toLowerCase();
        const lowerField = field.toLowerCase();

        // Try to find pattern like "Echo: hypoechoic" or "M: irregular"
        const patterns = [
          new RegExp(`${lowerField}[:\\s]+([^,\\n]+)`, 'i'),
          new RegExp(`${lowerField.charAt(0)}[:\\s]+([^,\\n]+)`, 'i'), // First letter match
        ];

        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return match[1].trim();
          }
        }

        return '';
      }

      // Helper function to extract position (N, D values)
      function extractPositionFromMeasurement(measurement) {
        // PRIORITY: Use label field first
        const text = String(
          measurement.label || measurement.finding?.text || measurement.displayText || ''
        );

        // Look for patterns like "N:(+15,-10)" or "N:+15,-10" and "D:9-22"
        const nMatch = text.match(/N[:\s]*\(?([\+\-]?\d+),\s*([\+\-]?\d+)\)?/i);
        const dMatch = text.match(/D[:\s]*(\d+)-(\d+)/i);

        let position = '';
        if (nMatch) {
          position = `N:(${nMatch[1]},${nMatch[2]})`;
        }
        if (dMatch) {
          position += (position ? ', ' : '') + `D:${dMatch[1]}-${dMatch[2]}`;
        }

        return position;
      }

      // Helper function to extract size
      function extractSizeFromMeasurement(measurement) {
        // PRIORITY 1: Try to extract x/y/z dimensions from metadata.clinical (from SR DICOM codes)
        if (measurement.metadata?.clinical) {
          const clinical = measurement.metadata.clinical;
          const x = clinical.size_x_mm;
          const y = clinical.size_y_mm;
          const z = clinical.size_z_mm;

          // If we have all three dimensions, format as "W×H×L"
          if (x !== undefined && y !== undefined && z !== undefined) {
            return `${x.toFixed(1)}×${y.toFixed(1)}×${z.toFixed(1)}`;
          }
        }

        // PRIORITY 2: Try to parse from label field (e.g., "16.5mm")
        if (measurement.label) {
          const text = String(measurement.label);
          const match = text.match(/(\d+\.?\d*)\s*mm/);
          if (match) {
            return match[1];
          }
        }

        // PRIORITY 3: Length tool direct property
        if (measurement.toolName === 'Length' && measurement.length) {
          return measurement.length.toFixed(1);
        }

        // PRIORITY 4: EllipticalROI or CircleROI - get mean diameter or area
        if (measurement.toolName === 'EllipticalROI' || measurement.toolName === 'CircleROI') {
          if (measurement.meanDiameter) {
            return measurement.meanDiameter.toFixed(1);
          }
          if (measurement.area) {
            // Calculate diameter from area: d = 2 * sqrt(area/π)
            const diameter = 2 * Math.sqrt(measurement.area / Math.PI);
            return diameter.toFixed(1);
          }
          if (measurement.stats?.mean) {
            return `${measurement.stats.mean.toFixed(1)} (mean)`;
          }
        }

        // PRIORITY 4: Try other text fields
        if (measurement.text || measurement.displayText || measurement.finding?.text) {
          const text = String(
            measurement.text || measurement.finding?.text || measurement.displayText || ''
          );
          const match = text.match(/(\d+\.?\d*)\s*mm/);
          if (match) {
            return match[1];
          }
        }

        return '';
      }

      // Store in localStorage
      try {
        localStorage.setItem('ohif_sr_report_data', JSON.stringify(reportData));

        // Open report page in new tab
        window.open('/report.html', '_blank');
      } catch (error) {
        console.error('❌ Failed to store report data:', error);
        alert('Failed to open report page. Please try again.');
      }
    },
  });

  // Register command for opening PDF Report Page
  commandsManager.registerCommand('USMPR', 'openPDFReportPage', {
    commandFn: async () => {
      const { displaySetService, uiNotificationService } = servicesManager.services;

      // Find all PDF displaySets in current study
      const pdfDisplaySets = displaySetService.activeDisplaySets.filter(
        (ds: any) => ds.SOPClassUID === '1.2.840.10008.5.1.4.1.1.104.1'
      );

      if (pdfDisplaySets.length === 0) {
        uiNotificationService.show({
          title: 'No PDF Found',
          message: 'No PDF report available in this study.',
          type: 'warning',
          duration: 3000,
        });
        return;
      }

      // If only one PDF, open it directly
      if (pdfDisplaySets.length === 1) {
        const url = await pdfDisplaySets[0].renderedUrl;
        window.open(url, '_blank');
        return;
      }

      // If multiple PDFs, use the first one (TODO: Add selection UI)
      const url = await pdfDisplaySets[0].renderedUrl;
      window.open(url, '_blank');
    },
  });
}

// Memory management: Track which images are loaded at level 0
const ENABLE_LOW_MEMORY_MODE = true;
const ENABLE_STACK_PREFETCH_PHASE2 = false;
const ENABLE_VOLUME_BACKGROUND_LOAD = false;
const ENABLE_MPR_WORKER_TERMINATION = true;
const DROP_VOLUMES_ON_STACK_VIEW = false;

const loadedLevel0Images: Set<string> = new Set();
const STACK_PREFETCH_RANGE = 20; // Prefetch +/- 20 frames around current axial position
const MAX_LEVEL0_IMAGES = STACK_PREFETCH_RANGE * 2 + 1; // Keep window size in memory (LRU eviction)
let scrollListener: ((event: any) => void) | null = null;

// Helper function to setup single STACK viewport with MPR synchronization
/**
 * Clean up old series resources before loading new series
 * Destroys volumes, purges cache, and terminates workers to free memory
 */
/**
 * SELECTIVE cleanup: Only removes OLD series data, keeps new series intact
 * This matches the working approach from commit 309ec16a0
 */
async function cleanupOldSeries(oldSeriesUID: string) {
  if (pendingMprTerminateTimeout) {
    clearTimeout(pendingMprTerminateTimeout);
    pendingMprTerminateTimeout = null;
  }

  if (!oldSeriesUID) {
    return;
  }

  try {
    const cache = cornerstoneCore.cache;

    // 2) Remove Stack images belonging to OLD series only (SELECTIVE!)
    const cacheInfo = cache.getCacheInformation?.() || {};
    const imageCache = cacheInfo.imageCache || {};
    let imageRemoved = 0;
    let stackViewRemoved = 0;
    if (imageCache) {
      const allImageIds = Object.keys(imageCache);

      const stackViewImages = allImageIds.filter(id => id.includes('?stackView='));

      allImageIds.forEach(imageId => {
        // Check if imageId belongs to OLD series (SELECTIVE!)
        if (imageId.includes(oldSeriesUID)) {
          try {
            cache.removeImageLoadObject(imageId);
            imageRemoved++;
            if (imageId.includes('?stackView=')) {
              stackViewRemoved++;
            }
          } catch (e) {}
        }
      });
    }

    // 3) Clear loadedLevel0Images Set for old series (CRITICAL - holds references!)
    const loadedImagesBefore = loadedLevel0Images.size;
    const imagesToRemove: string[] = [];
    loadedLevel0Images.forEach(imageId => {
      if (imageId.includes(oldSeriesUID)) {
        imagesToRemove.push(imageId);
      }
    });
    imagesToRemove.forEach(imageId => loadedLevel0Images.delete(imageId));

    // 4) Clear viewport position tracking for old series
    let positionsCleared = 0;
    Object.keys(savedViewportPositions).forEach(key => {
      if (key.includes(oldSeriesUID)) {
        delete savedViewportPositions[key];
        positionsCleared++;
      }
    });

    // ⚠️ [DECISION] Do NOT terminate workers during series switching!
    //
    // Why workers should NOT be terminated here:
    // 1. Workers are series-agnostic - they can decode ANY series
    // 2. Terminating workers prevents immediate loading of next series
    // 3. New workers need ~800ms to initialize (blocks series loading)
    // 4. WASM heap is freed by garbage collection when workers are idle
    //
    // Workers ARE terminated:
    // - On mode exit (onModeExit function)
    // - When WASM errors exceed threshold (decodeRetryManager.ts)
    //
    // This allows fast series switching while relying on browser GC for memory cleanup.
  } catch (e) {
    console.error('⚠️ [CLEANUP] Failed:', e);
  }
}

// 🌐 Expose cleanup function globally for drag & drop and double-click handlers
// These handlers run BEFORE new series loads, allowing cleanup to happen at the right time
(window as any).__usmprCleanupOldSeries = cleanupOldSeries;
(window as any).__usmprCurrentSeriesUID = currentSeriesInstanceUID;

/**
 * Reload Stack viewport with new series imageIds
 * Called when series changes to update Stack viewport to display new series
 */
async function reloadStackViewportForNewSeries(servicesManager, viewportGridService, viewportData) {
  const { cornerstoneViewportService, displaySetService } = servicesManager.services;

  try {
    // Get Stack viewport
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (!stackViewport) {
      return;
    }

    // Get new series displaySet from viewportData
    // viewportData contains the new series information
    if (!viewportData?.data || viewportData.data.length === 0) {
      return;
    }

    // Get the first displaySet (primary series)
    const displaySetInstanceUID = viewportData.data[0]?.displaySetInstanceUID;
    if (!displaySetInstanceUID) {
      return;
    }

    const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
    if (!displaySet) {
      return;
    }

    // Get imageIds from displaySet
    const newImageIds = displaySet.imageIds;
    if (!newImageIds || newImageIds.length === 0) {
      return;
    }

    // Set decode level 0 for Stack viewport
    const level0Options = {
      retrieveOptions: {
        single: {
          streaming: isStreamingEnabled(),
          decodeLevel: 0, // Full resolution for STACK viewport
        },
      },
    };
    cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', level0Options);

    // Transform imageIds to create SEPARATE cache entries
    // Add ?stackView= parameter to avoid conflict with MPR volumes
    const stackOnlyImageIds = newImageIds.map((imageId, idx) => {
      const separator = imageId.includes('?') ? '&' : '?';
      return `${imageId}${separator}stackView=${idx}`;
    });

    // Reload Stack viewport with new imageIds
    const middleIndex = Math.floor(stackOnlyImageIds.length / 2);
    await stackViewport.setStack(stackOnlyImageIds, middleIndex);
    stackViewport.render();

    if (csToolsUtils?.stackContextPrefetch?.disable) {
      csToolsUtils.stackContextPrefetch.disable(stackViewport.element);
    }

    // Update saved viewport positions
    savedViewportPositions['mpr-stack-single'] = {
      index: middleIndex,
      imageIds: stackOnlyImageIds,
      viewportType: 'stack',
    };
    lastStackViewportIndex = middleIndex;
    lastStackOriginalImageIds = stackOnlyImageIds;
  } catch (error) {
    console.error('[Stack-Reload] ❌ Failed to reload Stack viewport:', error);
    throw error;
  }
}

async function setupSingleStackViewport(servicesManager, viewportGridService) {
  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    // STEP 1: Get STACK viewport and save current state
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (stackViewport) {
      const originalImageIds = stackViewport.getImageIds();
      const currentIndex = stackViewport.getCurrentImageIdIndex();

      // Initialize tracking of STACK position for syncing when returning to 4-port
      // CRITICAL: Check if we have a saved position for THIS specific viewport
      const viewportId = 'mpr-stack-single';
      const savedPos = savedViewportPositions[viewportId];
      const hasSavedPosition = savedPos && savedPos.index !== null && savedPos.index !== undefined;

      if (!hasSavedPosition) {
        // First time entering 1-port: Use current position (which will be "middle" from preset)
        savedViewportPositions[viewportId] = {
          index: currentIndex,
          imageIds: originalImageIds,
          viewportType: 'stack',
        };

        // Update legacy variables for backward compatibility
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = originalImageIds;
      } else {
        // We have a saved position for this viewport - jump to it!
        const targetIndex = savedPos.index!;

        // Update imageIds if we don't have them
        if (!savedPos.imageIds || savedPos.imageIds.length === 0) {
          savedViewportPositions[viewportId].imageIds = originalImageIds;
        }

        // Update legacy variables
        lastStackViewportIndex = targetIndex;
        lastStackOriginalImageIds = savedPos.imageIds || originalImageIds;

        // Jump the STACK viewport to the saved position
        try {
          // ✅ FIX: Clamp targetIndex to valid range (prevents index out of bounds when series changes)
          // Example: Series 1 has 280 frames (saved index 242), Series 2 has 221 frames → clamp to 220
          const maxIndex = originalImageIds.length - 1;
          const clampedIndex = Math.max(0, Math.min(targetIndex, maxIndex));

          if (clampedIndex !== targetIndex) {
          }

          if (clampedIndex !== currentIndex) {
            stackViewport.setImageIdIndex(clampedIndex);
          } else {
          }
        } catch (error) {
          console.error(`[StackSync] ❌ Failed to jump to saved position ${targetIndex}:`, error);
        }
      }

      if (originalImageIds && originalImageIds.length > 0) {
        // STEP 2: Set decode level 0 FIRST (before transforming imageIds)

        // Define level 0 options inline to ensure correct structure
        const level0Options = {
          retrieveOptions: {
            single: {
              streaming: isStreamingEnabled(),
              decodeLevel: 0, // Full resolution for STACK viewport
            },
          },
        };
        cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', level0Options);

        // Verify metadata provider was set
        const verifyMetadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get(
          'stack'
        ) as RetrieveMetadata | undefined;

        // STEP 3: Transform imageIds to create SEPARATE cache entries
        // This is the KEY to preserving MPR volumes!
        const stackOnlyImageIds = originalImageIds.map((imageId, idx) => {
          // Add query parameter to create different cache entry
          const separator = imageId.includes('?') ? '&' : '?';
          return `${imageId}${separator}stackView=${idx}`;
        });

        // STEP 4: Load viewport with TRANSFORMED imageIds
        // These will load at level 0 in SEPARATE cache entries
        // Original imageIds (used by volumes) remain untouched!
        try {
          // ✅ FIX: Clamp currentIndex to valid range (prevents index out of bounds)
          const maxIndex = stackOnlyImageIds.length - 1;
          const clampedCurrentIndex = Math.max(0, Math.min(currentIndex, maxIndex));

          if (clampedCurrentIndex !== currentIndex) {
          }

          await stackViewport.setStack(stackOnlyImageIds, clampedCurrentIndex);
          stackViewport.render();

          if (DROP_VOLUMES_ON_STACK_VIEW) {
            try {
              const { displaySetService } = servicesManager.services;
              const activeDisplaySets = displaySetService.getActiveDisplaySets();
              const displaySetUIDs = activeDisplaySets
                .filter(
                  ds => ds.Modality !== 'SR' && !ds.SeriesDescription?.includes('Annotations')
                )
                .map(ds => ds.displaySetInstanceUID);

              const volumes = cornerstoneCore.cache.getVolumes();
              volumes.forEach(volume => {
                const shouldRemove = displaySetUIDs.some(uid => volume?.volumeId?.includes(uid));
                if (shouldRemove) {
                  try {
                    if (volume && typeof volume.destroy === 'function') {
                      volume.destroy();
                    }
                  } catch (e) {}
                  try {
                    cornerstoneCore.cache.removeVolumeLoadObject(volume.volumeId);
                  } catch (e) {}
                }
              });
            } catch (e) {
              console.warn('[StackSync] Failed to drop volumes on stack view:', e);
            }
          }

          if (csToolsUtils?.stackContextPrefetch?.disable) {
            csToolsUtils.stackContextPrefetch.disable(stackViewport.element);
          }

          // Verify what was actually loaded
          const loadedImageIds = stackViewport.getImageIds();
          const loadedIndex = stackViewport.getCurrentImageIdIndex();
        } catch (err) {
          console.error('[StackSync] ❌ Failed to reload viewport:', err);
          throw err;
        }
      }
    }

    // Make STACK viewport visible and fullscreen
    viewportGridService.setActiveViewportId('mpr-stack-single');

    // Activate StackScrollMouseWheel tool on the 'default' tool group for the STACK viewport
    const { toolGroupService } = servicesManager.services;
    const defaultToolGroup = toolGroupService.getToolGroup('default');

    if (defaultToolGroup) {
      try {
        defaultToolGroup.setToolActive('StackScrollMouseWheel');
      } catch (e) {
        console.warn('[StackSync] ⚠️ Failed to activate StackScrollMouseWheel:', e);
      }
    } else {
      console.warn('[StackSync] ⚠️ default tool group not found');
    }

    // Setup ImageSliceSynchronizer for STACK ↔ VOLUME sync
    // This allows scrolling in STACK to update crosshairs in background MPR
    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      console.warn('[StackSync] No rendering engine found');
      return;
    }

    // NOTE: We do NOT add MPR volume viewports to the imageslice sync group
    // because imageslice synchronizers work with STACK viewports (image indices),
    // while VOLUME viewports use world coordinates. Mixing them causes volume viewports
    // to jump around or reload incorrectly.
    //
    // MPR viewports already use CrosshairsTool for synchronization in the background.

    // Setup on-demand loading with memory management
    setupMemoryManagedLoading(cornerstoneViewportService);
  } catch (error) {
    console.error('[StackSync] ❌ Failed to setup STACK viewport sync:', error);
  }
}

// Helper function to setup memory-managed loading for STACK viewport
function setupMemoryManagedLoading(cornerstoneViewportService) {
  // Clear previous listener if exists
  if (scrollListener) {
    cornerstoneCore.eventTarget.removeEventListener(
      cornerstoneCore.Enums.Events.STACK_VIEWPORT_SCROLL,
      scrollListener
    );
  }

  // Get the STACK viewport
  const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
  if (!stackViewport) {
    console.warn('[StackSync] STACK viewport not found for memory management');
    return;
  }

  const imageIds = stackViewport.getImageIds();
  if (!imageIds || imageIds.length === 0) {
    console.warn('[StackSync] No imageIds found in STACK viewport');
    return;
  }

  const totalImages = imageIds.length;
  const currentIndex = stackViewport.getCurrentImageIdIndex() || Math.floor(totalImages / 2);

  // Pre-load images around current position (+/- range)
  const loadRange = STACK_PREFETCH_RANGE;
  loadedLevel0Images.clear(); // Clear previous set
  for (let offset = -loadRange; offset <= loadRange; offset++) {
    const index = currentIndex + offset;
    if (index >= 0 && index < totalImages) {
      const imageId = imageIds[index];
      loadedLevel0Images.add(imageId);
    }
  }

  // Prefetch initial window via Cornerstone imageLoader
  loadedLevel0Images.forEach(imageId => {
    if (
      imageId &&
      !cornerstoneCore.cache.getImageLoadObject(imageId) &&
      !cornerstoneCore.cache.isLoaded(imageId)
    ) {
      imageLoader.loadAndCacheImage(imageId).catch(err => {
        console.debug('[StackSync] Prefetch failed:', err?.message || err);
      });
    }
  });

  // Display actual image dimensions and decode level for verification
  setTimeout(async () => {
    try {
      const currentImageId = imageIds[currentIndex];
      const image = await cornerstoneCore.imageLoader.loadImage(currentImageId);

      if (image) {
        // Check decode level from metadata
        const metadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get('stack') as
          | RetrieveMetadata
          | undefined;
        if (metadata?.retrieveOptions?.single) {
        }

        // Determine resolution level based on dimensions
        // Level 0 (full): Original size (e.g., 3460 × 1686)
        // Level 2 (quarter): 1/4 size (e.g., 865 × 421)
        const level2Width = Math.floor(image.width / 4);
        const level2Height = Math.floor(image.height / 4);

        // Detect actual resolution level
        // If dimensions are large (>2000px), it's level 0
        // If dimensions are small (<1000px), it's level 2
        if (image.width >= 2000 || image.height >= 1500) {
        } else if (image.width < 1000 && image.height < 600) {
        } else {
        }
      }
    } catch (error) {
      console.warn('[StackSync] Could not verify image dimensions:', error);
    }
  }, 500);

  // Listen for IMAGE_RENDERED events (fires for all viewport types)
  // This is more reliable than STACK_VIEWPORT_SCROLL which doesn't seem to fire
  let renderCount = 0;
  scrollListener = evt => {
    // Wrap entire handler in try-catch to prevent uncaught errors
    try {
      renderCount++;

      // ✅ ALWAYS log event to verify it's firing
      const viewportId = evt.detail?.viewportId || evt.detail?.viewport?.id;

      // Handle events for all three single viewports (STACK and VOLUME)
      // mpr-stack-single (axial STACK), mpr-1 (sagittal VOLUME), mpr-2 (coronal VOLUME)
      // CRITICAL: VOLUME viewports keep their original IDs in 1-port mode!
      const validViewportIds = ['mpr-stack-single', 'mpr-1', 'mpr-2'];
      if (!validViewportIds.includes(viewportId)) {
        return;
      }

      // Get the viewport and current index
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        console.warn(`[StackSync] ⚠️ Viewport ${viewportId} not found in scroll listener`);
        return;
      }

      const viewportType = viewport.type;

      let imageIdIndex = null;
      let imageIds = null;

      // Handle STACK vs VOLUME viewports differently
      if (viewportType === 'stack') {
        // STACK viewport: Use standard methods
        imageIds = viewport.getImageIds();
        if (!imageIds || imageIds.length === 0) {
          console.warn(`[StackSync] ⚠️ No imageIds found in STACK viewport ${viewportId}`);
          return;
        }
        imageIdIndex = viewport.getCurrentImageIdIndex();
      } else if (viewportType === 'orthographic' || viewportType === 'volume') {
        // VOLUME viewport: Check if it has the same methods
        if (typeof viewport.getCurrentImageIdIndex === 'function') {
          imageIdIndex = viewport.getCurrentImageIdIndex();
          imageIds = viewport.getImageIds();
        } else {
          console.warn(
            `[StackSync] ⚠️ VOLUME viewport ${viewportId} doesn't support getCurrentImageIdIndex`
          );
          return;
        }
      } else {
        console.warn(`[StackSync] ⚠️ Unknown viewport type: ${viewportType}`);
        return;
      }

      // Validate the index is within bounds
      if (imageIdIndex === null || imageIdIndex === undefined || imageIdIndex < 0) {
        console.warn(`[StackSync] ⚠️ Invalid imageIdIndex: ${imageIdIndex}`);
        return;
      }

      if (imageIds && imageIdIndex >= imageIds.length) {
        console.warn(
          `[StackSync] ⚠️ imageIdIndex out of bounds: ${imageIdIndex} (length: ${imageIds.length})`
        );
        return;
      }

      // Track current viewport position for syncing when returning to 4-port
      // Update both legacy variable and new tracking object
      if (viewportType === 'stack') {
        // For STACK viewports, save index and imageIds
        const originalImageIds = imageIds.map(id => id.split('?stackView=')[0]);
        savedViewportPositions[viewportId] = {
          index: imageIdIndex,
          imageIds: originalImageIds,
          viewportType: 'stack',
        };
        lastStackViewportIndex = imageIdIndex;
        lastStackOriginalImageIds = originalImageIds;
      } else {
        // For VOLUME viewports, save world position
        try {
          const camera = viewport.getCamera();
          if (camera && camera.focalPoint) {
            savedViewportPositions[viewportId] = {
              worldPosition: camera.focalPoint,
              viewportType: viewportType,
            };
          }
        } catch (e) {
          console.warn(`[SCROLL] Could not get camera for ${viewportId}:`, e);
        }
      }

      // Memory management: Only needed for STACK viewports with level 0 loading
      // VOLUME viewports use volume cache and don't need this
      if (viewportType === 'stack' && imageIds && imageIds.length > 0) {
        // 🚀 WASM 힙 메모리 보호: 스크롤 시 대기 중인 요청 취소
        // 빠른 스크롤 시 수십 개의 이미지 요청이 큐에 쌓여 WASM 힙 폭발 방지
        try {
          // interaction 요청 스택 정리 (현재 표시 중인 이미지 외 모든 대기 요청 취소)
          imageLoadPoolManager.clearRequestStack('interaction');
          imageLoadPoolManager.clearRequestStack('prefetch');
        } catch (e) {
          console.debug('[StackSync] Could not clear request stack:', e);
        }

        // Determine which images should be loaded at level 0 (current ± 2)
        // 범위를 줄여 WASM 힙 메모리 부담 감소 (5 → 2)
        const shouldBeLoaded: Set<string> = new Set();
        for (let offset = -STACK_PREFETCH_RANGE; offset <= STACK_PREFETCH_RANGE; offset++) {
          const index = imageIdIndex + offset;
          if (index >= 0 && index < imageIds.length) {
            shouldBeLoaded.add(imageIds[index]);
          }
        }

        // Clear images that are no longer needed (outside the prefetch window)
        const toRemove: string[] = [];
        loadedLevel0Images.forEach(imageId => {
          if (!imageId) {
            console.warn('[StackSync] ⚠️ Null/undefined imageId in loadedLevel0Images');
            return;
          }

          if (!shouldBeLoaded.has(imageId)) {
            toRemove.push(imageId);
            // Remove from cornerstone cache
            try {
              cornerstoneCore.cache.removeImageLoadObject(imageId);
            } catch (e) {
              // Image might not be in cache, that's okay
              console.debug('[StackSync] Cache removal failed (may not exist):', e.message);
            }
          }
        });

        // Remove from our tracking set
        toRemove.forEach(imageId => {
          if (imageId) {
            loadedLevel0Images.delete(imageId);
          }
        });

        // Hard eviction: remove any cached stackView images outside the window
        try {
          const imageCache = cornerstoneCore.cache.getCacheInformation().imageCache || {};
          Object.keys(imageCache).forEach(imageId => {
            if (!imageId || !imageId.includes('stackView=')) {
              return;
            }

            if (currentSeriesInstanceUID && !imageId.includes(currentSeriesInstanceUID)) {
              return;
            }

            if (!shouldBeLoaded.has(imageId)) {
              try {
                cornerstoneCore.cache.removeImageLoadObject(imageId);
              } catch (e) {
                // ignore
              }
            }
          });
        } catch (e) {
          console.debug('[StackSync] Cache sweep failed:', e);
        }

        // Add newly visible images to tracking with LRU eviction
        shouldBeLoaded.forEach(imageId => {
          if (!imageId) {
            return;
          }

          // Refresh LRU order if already tracked
          if (loadedLevel0Images.has(imageId)) {
            loadedLevel0Images.delete(imageId);
            loadedLevel0Images.add(imageId);
            return;
          }

          // Enforce MAX_LEVEL0_IMAGES limit (LRU eviction)
          while (loadedLevel0Images.size >= MAX_LEVEL0_IMAGES) {
            const oldestImageId = Array.from(loadedLevel0Images)[0];
            cornerstoneCore.cache.removeImageLoadObject(oldestImageId);
            loadedLevel0Images.delete(oldestImageId);
          }

          loadedLevel0Images.add(imageId);

          // Prefetch via Cornerstone imageLoader (stack viewport decoding path)
          if (
            !cornerstoneCore.cache.getImageLoadObject(imageId) &&
            !cornerstoneCore.cache.isLoaded(imageId)
          ) {
            imageLoader.loadAndCacheImage(imageId).catch(err => {
              console.debug('[StackSync] Prefetch failed:', err?.message || err);
            });
          }
        });

        if (toRemove.length > 0) {
        }
      }
    } catch (error) {
      // Catch all errors to prevent uncaught runtime errors
      console.error('[StackSync] ❌ Error in scroll listener:', error);
      console.error('[StackSync] ❌ Error stack:', error.stack);
    }
  };

  // Register IMAGE_RENDERED event listener (more reliable than STACK events)

  // Listen to both IMAGE_RENDERED and STACK_VIEWPORT_SCROLL events
  cornerstoneCore.eventTarget.addEventListener(
    cornerstoneCore.Enums.Events.IMAGE_RENDERED,
    scrollListener
  );

  // Also try STACK_VIEWPORT_SCROLL
  cornerstoneCore.eventTarget.addEventListener(
    cornerstoneCore.Enums.Events.STACK_VIEWPORT_SCROLL,
    scrollListener
  );

  // Add global helper to check current image resolution from console
  (window as any).checkStackResolution = async () => {
    const vp = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (!vp) {
      return;
    }
    const imageIds = vp.getImageIds();
    const index = vp.getCurrentImageIdIndex();
    const imageId = imageIds[index];
    const image = await cornerstoneCore.imageLoader.loadImage(imageId);
    const isLevel0 = image.width >= 2000 || image.height >= 1500;
    return image;
  };

  // Add global helper to manually clear all Stack caches for debugging
  (window as any).clearAllStackCaches = () => {
    try {
      let clearedCount = 0;
      const cachedImageIds = cornerstoneCore.cache.getCacheInformation().imageCache;

      Object.keys(cachedImageIds || {}).forEach((imageId: string) => {
        if (imageId && imageId.includes('stackView=')) {
          try {
            cornerstoneCore.cache.removeImageLoadObject(imageId);
            clearedCount++;
          } catch (e) {
            console.debug('Could not remove:', imageId.substring(0, 60));
          }
        }
      });

      loadedLevel0Images.clear();
      return clearedCount;
    } catch (e) {
      console.error('Failed to clear Stack caches:', e);
      return 0;
    }
  };

  // Safe cache cleanup helper: avoids purgeCache() to prevent blank MPR
  (window as any).usmprSafePurgeCache = () => {
    try {
      const keepSeriesUID = currentSeriesInstanceUID;
      const cacheInfo = cornerstoneCore.cache.getCacheInformation?.() || {};
      const allCachedImageIds = Object.keys(cacheInfo.imageCache || {});
      let removedImages = 0;

      allCachedImageIds.forEach(imageId => {
        if (!imageId) {
          return;
        }

        const isStackImage = imageId.includes('stackView=');
        const isOtherSeries = keepSeriesUID ? !imageId.includes(keepSeriesUID) : true;

        if (isStackImage || isOtherSeries) {
          try {
            cornerstoneCore.cache.removeImageLoadObject(imageId);
            removedImages++;
          } catch (e) {
            // ignore
          }
        }
      });

      const allVolumes = cornerstoneCore.cache.getVolumes();
      let removedVolumes = 0;
      allVolumes.forEach(volume => {
        const shouldRemove = keepSeriesUID ? !volume?.volumeId?.includes(keepSeriesUID) : true;
        if (shouldRemove) {
          try {
            if (volume && typeof volume.destroy === 'function') {
              volume.destroy();
            }
          } catch (e) {}
          try {
            cornerstoneCore.cache.removeVolumeLoadObject(volume.volumeId);
            removedVolumes++;
          } catch (e) {}
        }
      });

      try {
        if (keepSeriesUID) {
          clearCacheForSeriesChange([keepSeriesUID]);
        } else {
          clearCacheForSeriesChange([]);
        }
      } catch (e) {
        console.warn('[SafePurge] Failed to clear HTJ2K cache:', e);
      }
    } catch (e) {
      console.error('[SafePurge] Failed:', e);
    }
  };

  // =============================================================================
  // Browser Unload Event Handler Registration
  // =============================================================================

  /**
   * Browser 종료 시 캐시 정리 핸들러
   *
   * 목적: 브라우저 종료/새로고침 시 메모리에 초음파 영상이 남지 않도록 보안 강화
   *
   * 타이밍:
   * - 탭/창 닫기
   * - 페이지 새로고침 (F5)
   * - 다른 URL로 이동
   *
   * 제한사항:
   * - beforeunload 핸들러는 동기적으로 실행되어야 함
   * - await 사용 불가 (비동기 작업 불가)
   * - 따라서 window.cornerstone.cache.purgeCache()만 호출 (동기 함수)
   */
  const handleBeforeUnload = () => {
    try {
      // Cornerstone cache purge (동기 함수)
      // Dynamic import는 비동기이므로 사용 불가
      // 대신 window.cornerstone 전역 객체 사용
      if ((window as any).cornerstone && (window as any).cornerstone.cache) {
        (window as any).cornerstone.cache.purgeCache();
      }

      // HTJ2K cache 정리 (동기 호출 가능한 경우)
      if (typeof clearHTJ2KCache === 'function') {
        clearHTJ2KCache();
      }
    } catch (e) {
      console.warn('⚠️ [USMPR UNLOAD] Failed to clear cache:', e);
    }

    // 참고: return 값이나 event.returnValue는 브라우저 확인 다이얼로그를 표시하므로
    // 사용하지 않음 (사용자 경험 저하)
  };

  // Register beforeunload event listener
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Store reference for cleanup in onModeExit
  (window as any).usmprBeforeUnloadHandler = handleBeforeUnload;

  // 🔥 [CRITICAL FIX] Add navigation listener to detect leaving study view
  // Since onModeExit doesn't fire when clicking logo/back button to worklist,
  // we need to detect URL changes and trigger cleanup manually
  try {
    let lastPathname = window.location.pathname;
    const isStudyViewPath = path => path.includes('/viewer/') || path.includes('/study/');

    const handleNavigation = () => {
      const currentPathname = window.location.pathname;

      // Detect leaving study view (viewer route → anything else)
      if (isStudyViewPath(lastPathname) && !isStudyViewPath(currentPathname)) {
        // Trigger cleanup logic (same as onModeExit)
        try {
          const { syncGroupService, segmentationService } = servicesManager.services;

          if (syncGroupService && typeof syncGroupService.destroy === 'function') {
            syncGroupService.destroy();
          }

          if (segmentationService && typeof segmentationService.destroy === 'function') {
            segmentationService.destroy();
          }

          if (
            cornerstoneViewportService &&
            typeof cornerstoneViewportService.destroy === 'function'
          ) {
            cornerstoneViewportService.destroy();
          }

          // Clear caches
          try {
            clearHTJ2KCache();
          } catch (e) {
            console.warn('⚠️ [MEMORY CLEANUP] Failed to clear HTJ2K cache:', e);
          }

          import('@cornerstonejs/core')
            .then(({ cache }) => {
              if (cache && typeof cache.purgeCache === 'function') {
                cache.purgeCache();
              }
            })
            .catch(e => console.warn('⚠️ [MEMORY CLEANUP] Failed to purge cache:', e));
        } catch (e) {
          console.error('❌ [MEMORY CLEANUP] Error during cleanup:', e);
        }
      }

      lastPathname = currentPathname;
    };

    // Check for navigation every 500ms
    const navigationCheckInterval = setInterval(handleNavigation, 500);

    // Store interval for cleanup
    (window as any).usmprNavigationCheckInterval = navigationCheckInterval;
  } catch (error) {
    console.error('❌ [USMPR] Failed to setup navigation listener:', error);
    console.error('❌ [USMPR] Stack trace:', error.stack);
  }
}

// Helper function to teardown single STACK viewport synchronization
async function teardownSingleStackViewport(servicesManager, viewportGridService) {
  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    // CRITICAL: Read the current STACK viewport position BEFORE teardown!
    // This is simpler than event listeners which don't seem to fire
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (stackViewport) {
      try {
        const currentIndex = stackViewport.getCurrentImageIdIndex();
        const imageIds = stackViewport.getImageIds();

        // Validate the data before saving
        if (currentIndex < 0 || !imageIds || imageIds.length === 0) {
          console.warn('🔥 [TEARDOWN] ⚠️ Invalid viewport state - skipping position save');
          return;
        }

        if (currentIndex >= imageIds.length) {
          console.warn(
            `🔥 [TEARDOWN] ⚠️ Index out of bounds: ${currentIndex} >= ${imageIds.length}`
          );
          return;
        }

        // Save the position for synchronization when returning to 4-port
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = imageIds
          .map(id => {
            // Remove the ?stackView=XXX suffix to get original imageId
            // Handle cases where id might be null/undefined
            if (!id) {
              return null;
            }
            return id.split('?stackView=')[0];
          })
          .filter(id => id !== null); // Remove any null entries
      } catch (error) {
        console.error('🔥 [TEARDOWN] ❌ Error saving viewport position:', error);
      }
    }

    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      return;
    }

    // Keep decode level 0 for stack viewports (always full resolution)
    const stackRetrieveOptions = {
      retrieveOptions: {
        single: {
          streaming: true,
          decodeLevel: 0, // Full resolution (always show original quality for STACK)
        },
      },
    };
    cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', stackRetrieveOptions);

    // Clear STACK-specific imageIds from cache (memory cleanup)
    // Note: stackViewport already declared at top of function
    if (stackViewport) {
      const stackImageIds = stackViewport.getImageIds();

      // Clear all STACK imageIds (these have ?stackView=xxx suffix)
      if (stackImageIds && stackImageIds.length > 0) {
        stackImageIds.forEach(imageId => {
          try {
            cornerstoneCore.cache.removeImageLoadObject(imageId);
          } catch (e) {
            // Ignore if not in cache
          }
        });
      }
    }

    // Remove IMAGE_RENDERED listener for memory management
    if (scrollListener) {
      cornerstoneCore.eventTarget.removeEventListener(
        cornerstoneCore.Enums.Events.IMAGE_RENDERED,
        scrollListener
      );
      scrollListener = null;
    }

    // Clear loaded images tracking
    loadedLevel0Images.clear();

    // NOTE: We don't need to remove MPR viewports from sync group because
    // they were never added to it (they use CrosshairsTool for synchronization)
  } catch (error) {
    console.error('[StackSync] ❌ Failed to teardown STACK viewport sync:', error);
  }
}

// Custom onModeExit for USMPR - cleanup
export function onModeExit({ servicesManager }) {
  const {
    toolGroupService,
    customizationService,
    syncGroupService,
    segmentationService,
    cornerstoneViewportService,
    viewportGridService,
  } = servicesManager.services;

  // Restore auto cine for other modes (default: OT, US)
  customizationService.setCustomizations({
    autoCineModalities: {
      $set: ['OT', 'US'], // Restore default auto cine modalities
    },
  });

  if ((window as any).__usmprStackPrefetchEnable) {
    csToolsUtils.stackContextPrefetch.enable = (window as any).__usmprStackPrefetchEnable;
    delete (window as any).__usmprStackPrefetchEnable;
  }

  // Restore original hanging protocol methods
  const { hangingProtocolService } = servicesManager.services;
  const originalMethods = (window as any).usmprOriginalMethods;
  if (originalMethods) {
    if (originalMethods.setProtocol) {
      hangingProtocolService.setProtocol = originalMethods.setProtocol;
    }
    if (originalMethods.run) {
      hangingProtocolService.run = originalMethods.run;
    }
    if (originalMethods.setActiveProtocol) {
      hangingProtocolService.setActiveProtocol = originalMethods.setActiveProtocol;
    }
    (window as any).usmprOriginalMethods = null;
  }

  // Reset active protocol IDs to null (all protocols active again)
  hangingProtocolService.setActiveProtocolIds(null);

  // Destroy tool groups to prevent "already exists" errors on re-entry
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroupService.destroyToolGroup(toolGroupId);
    }
  });

  // Cleanup STACK viewport synchronization
  teardownSingleStackViewport(servicesManager, viewportGridService).catch(err => {
    console.error('[USMPR] Failed to teardown STACK viewport on mode exit:', err);
  });

  // Disable the STACK viewport
  try {
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (stackViewport && typeof stackViewport.disable === 'function') {
      stackViewport.disable();
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to disable STACK viewport:', e);
  }

  // Destroy 3D slice plane managers
  if (slicePlaneSync) {
    slicePlaneSync.destroy();
    slicePlaneSync = null;
  }

  if (slicePlaneManager) {
    slicePlaneManager.destroy();
    slicePlaneManager = null;
  }

  // Destroy resizable grid manager
  if (resizableGridManager) {
    resizableGridManager.destroy();
    resizableGridManager = null;
  }
  // Clean up global reference
  delete (window as any).usmprResizableGridManager;

  // Destroy layout config manager
  if (layoutConfigManager) {
    layoutConfigManager.destroy();
    layoutConfigManager = null;
  }

  // Unsubscribe from layout changes
  const layoutUnsubscribe = (window as any).usmprLayoutUnsubscribe;
  if (layoutUnsubscribe && typeof layoutUnsubscribe === 'function') {
    try {
      layoutUnsubscribe();
    } catch (e) {
      console.warn('⚠️ [USMPR EXIT] Failed to unsubscribe layout changes:', e);
    }
    delete (window as any).usmprLayoutUnsubscribe;
  }

  // Unsubscribe from viewport data changes
  const viewportDataChangedUnsub = (window as any).usmprViewportDataChangedUnsub;
  if (viewportDataChangedUnsub && typeof viewportDataChangedUnsub === 'function') {
    try {
      viewportDataChangedUnsub();
    } catch (e) {
      console.warn('⚠️ [USMPR EXIT] Failed to unsubscribe viewport data changes:', e);
    }
    delete (window as any).usmprViewportDataChangedUnsub;
  }

  // ✅ [CRITICAL] Clear global viewport position variables that hold imageIds arrays
  // These prevent garbage collection of image data (1GB+ leak!)
  Object.keys(savedViewportPositions).forEach(key => delete savedViewportPositions[key]);
  lastStackViewportIndex = null;
  lastStackOriginalImageIds = null;

  // Stop navigation check interval
  const navigationCheckInterval = (window as any).usmprNavigationCheckInterval;
  if (navigationCheckInterval) {
    clearInterval(navigationCheckInterval);
    delete (window as any).usmprNavigationCheckInterval;
  }

  // Clear crosshairs monitor interval
  const crosshairsMonitor = (window as any).usmprCrosshairsMonitor;
  if (crosshairsMonitor) {
    clearInterval(crosshairsMonitor);
    delete (window as any).usmprCrosshairsMonitor;
  }

  // Clear HTJ2K background loader cache AND Cornerstone cache to free memory
  // 1. Clear HTJ2K-specific cache
  try {
    const cacheStats = getCacheStats();

    clearHTJ2KCache();
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to clear HTJ2K cache:', e);
  }

  // 2. Clear ImageLoader's cache of undecoded/compressed files
  try {
    if (imageLoadPoolManager) {
      imageLoadPoolManager.clearRequestStack('interaction');
      imageLoadPoolManager.clearRequestStack('thumbnail');
      imageLoadPoolManager.clearRequestStack('prefetch');
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to clear ImageLoader cache:', e);
  }

  // 3. Terminate all Web Workers (HTJ2K decoders, histogram workers)
  // This frees ~2.5GB of native memory held by worker heaps
  try {
    const workerManager = getWebWorkerManager();
    if (workerManager) {
      // First, inspect the workerManager to see what's registered

      // Try to get registered workers
      if (workerManager.workerTypes) {
      }

      // Terminate all known worker types (CRITICAL: correct names!)
      const workerTypes = ['histogram-worker', 'dicomImageLoader'];
      let terminatedCount = 0;

      workerTypes.forEach(workerType => {
        try {
          if (typeof workerManager.terminate === 'function') {
            workerManager.terminate(workerType);
            terminatedCount++;
          }
        } catch (e) {
          console.debug(`[USMPR EXIT] Worker '${workerType}' not registered`);
        }
      });

      // Try terminateAllWorkers method if available
      if (typeof workerManager.terminateAllWorkers === 'function') {
        workerManager.terminateAllWorkers();
      } else {
      }
    }
  } catch (e) {
    console.error('⚠️ [USMPR EXIT] Failed to terminate Web Workers:', e);
  }

  // ✅ [CRITICAL FIX] Destroy services FIRST, BEFORE clearing cache
  // This ensures renderingEngine.destroy() can properly access volumes in cache to free WebGL contexts
  // Previous order was wrong: we were clearing cache first, then destroying rendering engine

  try {
    if (syncGroupService && typeof syncGroupService.destroy === 'function') {
      syncGroupService.destroy();
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy SyncGroupService:', e);
  }

  try {
    if (segmentationService && typeof segmentationService.destroy === 'function') {
      segmentationService.destroy();
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy SegmentationService:', e);
  }

  try {
    if (cornerstoneViewportService && typeof cornerstoneViewportService.destroy === 'function') {
      cornerstoneViewportService.destroy();
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy CornerstoneViewportService:', e);
  }

  // 2. NOW clear ALL cached volumes and Stack images AFTER destroying services
  // The renderingEngine.destroy() above already freed WebGL contexts
  // Now we just need to remove the volume/image references from cache
  try {
    const { cache } = cornerstoneCore;
    if (!cache) {
      console.warn('⚠️ [USMPR EXIT] Cornerstone cache not available');
    } else {
      let volumesRemoved = 0;
      let stackImagesRemoved = 0;

      try {
        // 2a. Remove ALL volumes explicitly using cache.getVolumes()
        const volumes = cache.getVolumes();
        volumes.forEach(volume => {
          try {
            const volumeId = volume.volumeId;

            // Remove from cache (WebGL textures already freed by renderingEngine.destroy())
            cache.removeVolumeLoadObject(volumeId);
            volumesRemoved++;
          } catch (e) {
            console.debug(`[USMPR EXIT] Failed to remove volume:`, e);
          }
        });
        if (volumesRemoved > 0) {
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to remove volumes:', e);
      }

      try {
        // 2b. Remove ALL Stack images (especially Level 0 images with ?stackView=)
        // Access private _imageCache to get all imageIds (no public API available)
        const cacheInfo = cache.getCacheInformation?.() || {};
        const imageCache = cacheInfo.imageCache || {};
        if (imageCache) {
          const allImageIds = Object.keys(imageCache);

          // Filter for Stack images (contain ?stackView= parameter)
          const stackImageIds = allImageIds.filter(id => id.includes('?stackView='));

          stackImageIds.forEach(imageId => {
            try {
              cache.removeImageLoadObject(imageId);
              stackImagesRemoved++;
            } catch (e) {
              console.debug(`[USMPR EXIT] Failed to remove image:`, e);
            }
          });
          if (stackImagesRemoved > 0) {
          }
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to remove Stack images:', e);
      }

      try {
        // 2c. Clear loadedLevel0Images tracking Set
        const prevSize = loadedLevel0Images.size;
        loadedLevel0Images.clear();
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to clear loadedLevel0Images:', e);
      }

      // 2d. Finally, purge any remaining cache entries
      try {
        if (typeof cache.purgeCache === 'function') {
          cache.purgeCache();
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to purge remaining cache:', e);
      }
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.warn('⚠️ [USMPR EXIT] Failed to clear Cornerstone cache:', errorMsg);
  }

  // Protocol changed subscription removed (no longer needed)

  // Remove beforeunload event listener
  const beforeUnloadHandler = (window as any).usmprBeforeUnloadHandler;
  if (beforeUnloadHandler) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    delete (window as any).usmprBeforeUnloadHandler;
  }

  // Clean up global reference
  delete (window as any).usmprLayoutConfigManager;

  // Note: DicomMetadataStore doesn't have a clear method - it's designed to persist for the session
}

// Toolbar sections for USMPR mode - extend basic sections with LayoutConfig
export const toolbarSections = {
  ...basicToolbarSections,
  // Override primary section to include LayoutConfig (remove StackScroll and Layout)
  [TOOLBAR_SECTIONS.primary]: [
    'MeasurementTools',
    'Zoom',
    'WindowLevel',
    'Pan',
    'Crosshairs',
    'LayoutConfig',
    'OpenReport',
    'OpenPDFReport',
    'Capture',
    'MoreTools',
  ],
  // Define which buttons appear in the MeasurementTools section
  // Note: CircleROI and EllipticalROI only work in Stack view (not in MPR viewports)
  MeasurementTools: ['Length', 'ArrowAnnotate', 'EllipticalROI', 'CircleROI'],
};

// Layout instance extending basic layout
export const usmprLayout = {
  ...basicLayout,
  id: ohif.layout,
  props: {
    ...basicLayout.props,
    leftPanels: [ohif.thumbnailList],
    rightPanels: [cornerstone.measurements],
    rightPanelClosed: true,
  },
};

export function layoutTemplate() {
  return structuredCloneWithFunctions(usmprLayout);
}

// Route extending basic route
export const usmprRoute = {
  ...basicRoute,
  path: 'usmpr',
  layoutTemplate,
  layoutInstance: usmprLayout,
};

// Combine basic toolbar buttons with USMPR custom buttons
export const toolbarButtons = [...basicToolbarButtons, ...usmprToolbarButtons];

/**
 * USMPR onModeInit - DataSource 설정 전에 호출됨
 * HTJ2K 지원 DataSource를 사용하도록 설정
 */
export function onModeInit({ extensionManager, appConfig, query }) {
  // URL에 DataSource가 명시적으로 지정되지 않은 경우에만 ohif-htj2k 사용
  // URL 형식: /usmpr/ohif-htj2k?... 또는 /usmpr?... (DataSource 미지정)
  const currentPath = window.location.pathname;
  const pathParts = currentPath.split('/').filter(Boolean);

  // URL에서 DataSource가 지정되었는지 확인
  // 예: /usmpr/ohif?... → pathParts = ['usmpr', 'ohif'] → dataSourceInUrl = 'ohif'
  // 예: /usmpr?... → pathParts = ['usmpr'] → dataSourceInUrl = undefined
  const modeRouteName = 'usmpr';
  const modeRouteIndex = pathParts.indexOf(modeRouteName);
  const dataSourceInUrl =
    modeRouteIndex >= 0 && pathParts.length > modeRouteIndex + 1
      ? pathParts[modeRouteIndex + 1]
      : undefined;

  // HTJ2K 설정 확인
  const htj2kConfig = appConfig?.htj2k;
  const isHTJ2KEnabled = htj2kConfig?.enabled && htj2kConfig?.enabledModes?.includes('usmpr');

  //   currentPath,
  //   dataSourceInUrl,
  //   isHTJ2KEnabled,
  //   defaultDataSource: appConfig?.defaultDataSourceName,
  // });

  // HTJ2K가 활성화되고, URL에 DataSource가 지정되지 않은 경우 HTJ2K DataSource 사용
  if (isHTJ2KEnabled && !dataSourceInUrl) {
    // HTJ2K DataSource 찾기 (설정 파일에 따라 이름이 다름)
    // - default.js: 'ohif-htj2k'
    // - local_dcm4chee.js: 'dicomweb-htj2k'
    const dataSources = appConfig?.dataSources || [];
    const htj2kDataSource = dataSources.find(
      ds => ds.sourceName === 'ohif-htj2k' || ds.sourceName === 'dicomweb-htj2k'
    );

    if (htj2kDataSource) {
      extensionManager.setActiveDataSource(htj2kDataSource.sourceName);
    } else {
      console.warn(
        '⚠️ [USMPR] HTJ2K DataSource not found (ohif-htj2k or dicomweb-htj2k), using default'
      );
    }
  } else if (dataSourceInUrl) {
  } else {
  }
}

// Mode instance extending basic mode instance
export const modeInstance = {
  ...basicModeInstance,
  id,
  routeName: 'usmpr',
  displayName: 'USMPR - MPR Viewer',
  routes: [usmprRoute],
  extensions: extensionDependencies,
  // Specify the USMPR hanging protocol
  hangingProtocol: '@ohif/hpUSMPR',
  // Use our custom validation to check for CT, MR, US modalities
  isValidMode,
  // Set HTJ2K DataSource before mode loads (called before DataSource is set)
  onModeInit,
  // Use MPR-specific onModeEnter
  onModeEnter,
  // Use MPR-specific onModeExit for cleanup
  onModeExit,
  // USMPR toolbar configuration
  toolbarButtons,
  toolbarSections,
  // Add customizations for double-click to toggle between single viewport and MPR
  customizationService: {
    cornerstoneViewportClickCommands: {
      doubleClick: ['toggleOneUp'],
    },
  },
};

// Mode object extending basic mode
const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

// USMPR Mode - Resizable 2x2 MPR Grid for CT Studies
export default mode;
