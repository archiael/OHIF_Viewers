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
import { eventTarget as coreEventTarget, imageLoader, Enums, imageLoadPoolManager, getWebWorkerManager } from '@cornerstonejs/core';
import { annotation } from '@cornerstonejs/tools';
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
    index?: number;              // For STACK viewports (mpr-stack-single)
    imageIds?: string[];         // Original imageIds for STACK
    worldPosition?: number[];    // For VOLUME viewports (mpr-1, mpr-2)
    viewportType?: string;       // 'stack' or 'orthographic'
  };
} = {};

// Legacy variables for backward compatibility (mainly used for STACK viewport)
let lastStackViewportIndex: number | null = null;
let lastStackOriginalImageIds: string[] | null = null;

// Track current series for cleanup on series change
let currentSeriesInstanceUID: string | null = null;

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
  if (hasCT) description = 'CT study - MPR available';
  else if (hasMR) description = 'MR study - MPR available';
  else if (hasUS) description = 'US study - MPR available';

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
    console.log(`🎨 [US VR] applyCustomUSPreset called with preset: ${presetName}`);

    // Import US preset utilities dynamically
    const { createUsSkinPresetA, createUsSkinPresetB, createUsSkinPresetC, createUsSkinPresetD, applyVolumeRenderingPreset } = await import('./utils/usVolumePresets');
    const { applyGpuRayCastQuality } = await import('./utils/usVolumeQuality');

    // Get current layout to find 3D viewport position
    const layoutConfig = getLayoutConfig();
    console.log('🎨 [US VR] Layout config:', layoutConfig);
    const position3D = layoutConfig?.positions?.indexOf('3D');
    console.log(`🎨 [US VR] 3D viewport is at position: ${position3D}`);

    if (position3D === -1 || position3D === undefined) {
      console.log('ℹ️ [US VR] No 3D viewport in current layout, skipping preset application');
      return;
    }

    // Get the 3D viewport
    const viewportId = `mpr-${position3D}`;
    console.log(`🎨 [US VR] Looking for viewport with ID: ${viewportId}`);
    const viewport3D = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport3D) {
      console.warn(`⚠️ [US VR] 3D viewport not found at position ${position3D} (ID: ${viewportId})`);
      return;
    }
    console.log(`✅ [US VR] Found 3D viewport at position ${position3D} (ID: ${viewportId})`);

    // Map preset name to factory function
    const presetMap = {
      'US 3D 1': createUsSkinPresetA,
      'US 3D 2': createUsSkinPresetB,
      'US 3D 3': createUsSkinPresetC,
      'US 3D 4': createUsSkinPresetD,
    };

    const presetFactory = presetMap[presetName] || createUsSkinPresetA;
    const preset = presetFactory();
    console.log(`🎨 [US VR] Applying preset: ${preset.name}`);

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
    console.log('✅ [US VR] Custom transfer functions applied');

    // Get mapper and apply quality settings
    const mapper = volumeActor.getMapper();
    if (mapper && imageData) {
      applyGpuRayCastQuality({ volumeMapper: mapper, imageData });
      console.log('✅ [US VR] Quality settings applied');
    }

    // Trigger re-render
    viewport3D.render();
    console.log('✅ [US VR] Viewport re-rendered with custom US preset');
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
    // console.log('🔄 [SLICE PLANES] Re-initializing slice planes after series change...');

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
      // console.log('🔄 [SLICE PLANES] Destroying old slicePlaneManager...');
      try {
        slicePlaneManager.destroy();
      } catch (e) {
        console.warn('⚠️ [SLICE PLANES] Error destroying old manager:', e);
      }
    }

    // Destroy old slice plane sync if it exists
    if (slicePlaneSync) {
      // console.log('🔄 [SLICE PLANES] Destroying old slicePlaneSync...');
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
    // console.log('🔄 [SLICE PLANES] Creating new SlicePlaneManager...');
    slicePlaneManager = new SlicePlaneManager();
    slicePlaneManager.initialize(viewport3D);
    slicePlaneManager.setVisible(false); // Hidden initially - will show after images load
    // console.log('✅ [SLICE PLANES] SlicePlaneManager re-initialized (hidden until images load)');

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
    // console.log('🔄 [SLICE PLANES] Creating new SlicePlaneSync...');
    const coreEventTarget = (window as any).cornerstoneEventTarget;
    slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
    slicePlaneSync.initialize(viewportInfos, coreEventTarget);
    slicePlaneSync.setEnabled(true);
    // console.log('✅ [SLICE PLANES] SlicePlaneSync re-initialized');

    // Update positions after delay, then show planes (hidden initially to avoid showing before images load)
    slicePlaneShowTimeout1 = window.setTimeout(() => {
      // console.log('🔄 [SLICE PLANES] Updating plane positions after viewport load...');
      if (slicePlaneSync) {
        slicePlaneSync.updateAllPlanes();
      }
    }, 1000);

    // Show planes after images are loaded
    slicePlaneShowTimeout2 = window.setTimeout(() => {
      // console.log('🔄 [SLICE PLANES] Final plane position update and showing planes...');
      if (slicePlaneSync) {
        slicePlaneSync.updateAllPlanes();
      }
      if (slicePlaneManager) {
        slicePlaneManager.setVisible(true);
        // console.log('👁️ [SLICE PLANES] Planes now visible after images loaded');
      }
    }, 2000);

    // console.log('✅ [SLICE PLANES] Slice planes re-initialized successfully after series change');
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

  // console.log(`[HTJ2K-BG] 🚀 Starting Level 0 preload for ${totalImages} images...`);

  // 병렬 처리 (동시 20개)
  const BATCH_SIZE = 20;

  for (let i = 0; i < totalImages; i += BATCH_SIZE) {
    const batch = imageIds.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(imageId => {
      return imageLoader.loadAndCacheImage(imageId, {
        decodeLevel: 0,
      }).then(() => {
        successCount++;
      }).catch(() => {
        failCount++;
      }).finally(() => {
        loadedCount++;
      });
    });

    // 배치 완료 대기
    await Promise.all(batchPromises);

    const percent = Math.round((loadedCount / totalImages) * 100);
    // console.log(`[HTJ2K-BG] Preload: ${percent}% (${loadedCount}/${totalImages})`);
  }

  // console.log(`[HTJ2K-BG] ✅ Level 0 preload complete: ${successCount} success, ${failCount} failed`);
}

async function triggerHTJ2KBackgroundLoad(cornerstoneViewportService: any): Promise<void> {
  // HTJ2K가 비활성화되어 있으면 Background Load 스킵
  if (!isHTJ2KEnabled()) {
    // console.log('[HTJ2K-BG] ℹ️ HTJ2K disabled, skipping background load');
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
          // console.log(`[HTJ2K-BG] Found ${imageIds.length} imageIds from ${viewportId}`);
        }
      }
    }

    if (allImageIds.size === 0) {
      // console.log('[HTJ2K-BG] ℹ️ No imageIds found in Volume viewports, skipping background load');
      return;
    }

    const imageIdsArray = Array.from(allImageIds);

    // Server API, Range Request 활성화 여부에 따라 다른 전략 사용
    // 우선순위: Server API > Range Request > Level 0 Preload
    if (isServerApiEnabled()) {
      // Server API 활성화: ?complement=2 요청으로 나머지 데이터 다운로드
      // console.log(`[HTJ2K-BG] 📊 Starting Server API background load for ${imageIdsArray.length} unique images`);

      await loadBackgroundHTJ2KData(
        imageIdsArray,
        'volume', // ⚠️ Volume viewport는 Level 0 로딩 건너뜀 (메모리 최적화)
        (progress) => {
          if (progress.percent % 20 === 0) {
            // console.log(`[HTJ2K-BG] Loading complement: ${progress.percent}% (${progress.loaded}/${progress.total})`);
          }
        },
        (result) => {
          const cacheStats = getCacheStats();
          // console.log('[HTJ2K-BG] ✅ Server API background loading complete!');
          // console.log(`[HTJ2K-BG] 📊 Results: ${result.successCount} success, ${result.failCount} failed`);
          // console.log(`[HTJ2K-BG] 📊 Total bytes: ${(result.totalBytes / 1024 / 1024).toFixed(2)} MB`);
          // console.log(`[HTJ2K-BG] 📊 Cache: ${cacheStats.completeEntries} complete entries`);
        }
      );
    } else if (isRangeRequestEnabled()) {
      // Range Request 활성화: 나머지 데이터만 추가 다운로드
      // console.log(`[HTJ2K-BG] 📊 Starting Range Request background load for ${imageIdsArray.length} unique images`);

      await loadRemainingHTJ2KData(
        imageIdsArray,
        'volume', // ⚠️ Volume viewport는 Level 0 로딩 건너뜀 (메모리 최적화)
        (progress) => {
          if (progress.percent % 20 === 0) {
            // console.log(`[HTJ2K-BG] Loading: ${progress.percent}% (${progress.loaded}/${progress.total})`);
          }
        },
        (result) => {
          const cacheStats = getCacheStats();
          // console.log('[HTJ2K-BG] ✅ Background loading complete!');
          // console.log(`[HTJ2K-BG] 📊 Results: ${result.successCount} success, ${result.failCount} failed`);
          // console.log(`[HTJ2K-BG] 📊 Total bytes: ${(result.totalBytes / 1024 / 1024).toFixed(2)} MB`);
          // console.log(`[HTJ2K-BG] 📊 Cache: ${cacheStats.completeEntries} complete, ${cacheStats.partialEntries} partial`);
        }
      );
    } else {
      // Range Request 비활성화: Level 0 전체 이미지 미리 다운로드
      // console.log(`[HTJ2K-BG] 📊 Starting Level 0 preload for ${imageIdsArray.length} unique images`);
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
    // console.log('[HTJ2K-Scale] HTJ2K disabled, skipping camera scale correction');
    return;
  }

  // IMPORTANT: Camera scale correction is ONLY needed when metadata adjustment is NOT working
  // When metadata adjustment is enabled (for local files), PixelSpacing is already adjusted
  // and the Volume has correct physical size. Applying camera scale correction would be
  // a DOUBLE CORRECTION causing images to appear 4x zoomed in.
  //
  // Camera scale correction should only be used for DICOMweb where metadata can't be
  // adjusted on the server side.
  // console.log('[HTJ2K-Scale] ⚠️ Camera scale correction DISABLED - metadata adjustment handles scaling');
  // console.log('[HTJ2K-Scale] If images appear zoomed, check metadata adjustment logs: [HTJ2K L2]');
  return;

  // DISABLED CODE - kept for reference in case needed for DICOMweb without metadata adjustment
  /*
  const resolutionFactor = getResolutionFactor('volume');
  if (resolutionFactor <= 1) {
    // console.log('[HTJ2K-Scale] Resolution factor is 1, no correction needed');
    return;
  }

  // console.log(`[HTJ2K-Scale] 🔧 Applying camera scale correction (factor: ${resolutionFactor})`);

  // Volume viewports (mpr-0, mpr-1, mpr-2) - 3D viewport (mpr-3) 제외
  const volumeViewportIds = ['mpr-0', 'mpr-1', 'mpr-2'];

  for (const viewportId of volumeViewportIds) {
    try {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        // console.log(`[HTJ2K-Scale] Viewport ${viewportId} not found, skipping`);
        continue;
      }

      // Camera 가져오기
      const camera = viewport.getCamera();
      if (!camera) {
        // console.log(`[HTJ2K-Scale] Camera not found for ${viewportId}, skipping`);
        continue;
      }

      // parallelScale 조정: 1/resolutionFactor로 줄이면 resolutionFactor배 확대
      const originalScale = camera.parallelScale;
      const correctedScale = originalScale / resolutionFactor;

      viewport.setCamera({
        ...camera,
        parallelScale: correctedScale,
      });

      // console.log(`[HTJ2K-Scale] ✅ ${viewportId}: parallelScale ${originalScale.toFixed(2)} → ${correctedScale.toFixed(2)}`);
    } catch (error) {
      console.error(`[HTJ2K-Scale] Error correcting ${viewportId}:`, error);
    }
  }

  // console.log('[HTJ2K-Scale] Camera scale correction complete');
  */
}

// Custom onModeEnter for USMPR - uses basic tool initialization
export function onModeEnter({ servicesManager, extensionManager, commandsManager }) {
  console.log('🚀🚀🚀 [USMPR] onModeEnter CALLED - Mode is starting');

  try {
    const savedConfig = localStorage.getItem('usmpr-layout-config');
    console.log('💾 [USMPR] Saved config:', savedConfig ? 'exists' : 'none');
  } catch (e) {
    console.error('❌ [USMPR INIT] Error checking saved config:', e);
  }

  console.log('📍 [USMPR] Checkpoint 1: Getting services');

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

  console.log('📍 [USMPR] Checkpoint 2: Services obtained');

  console.log('📍 [USMPR] Checkpoint 2.1: About to disable auto cine');

  // Disable auto cine for USMPR mode (user can enable it manually if needed)
  // console.log('⏸️ [USMPR] Disabling auto cine on mode enter');
  customizationService.setCustomizations({
    autoCineModalities: {
      $set: [],  // Empty array = no modalities auto-start cine
    },
  });

  console.log('📍 [USMPR] Checkpoint 2.2: Auto cine disabled, about to filter SR protocols');

  // Store servicesManager globally for slice plane re-initialization
  (window as any).usmprServicesManager = servicesManager;
  // console.log('✅ [USMPR INIT] Stored servicesManager globally');

  // 🔒 Prevent SR protocol from changing USMPR layout
  // SR measurements will still be added via addSRAnnotation() as annotation layers
  // console.log('🔒 [USMPR] Configuring active protocols to exclude SR');

  const currentActiveProtocols = hangingProtocolService.activeProtocolIds ||
    Array.from(hangingProtocolService.protocols.keys());

  // console.log('📋 [USMPR] Current active protocols BEFORE filtering:', currentActiveProtocols);

  // Filter out SR protocol
  const filteredProtocols = currentActiveProtocols.filter(id => {
    const lowerCaseId = id?.toLowerCase() || '';
    const shouldInclude = lowerCaseId !== '@ohif/sr' &&
           lowerCaseId !== 'sr' &&
           !lowerCaseId.includes('sr key images');
    if (!shouldInclude) {
      console.warn(`🚫 [USMPR] Filtering out protocol: ${id}`);
    }
    return shouldInclude;
  });

  // console.log('📋 [USMPR] Filtered protocols AFTER excluding SR:', filteredProtocols);

  hangingProtocolService.setActiveProtocolIds(filteredProtocols);

  console.log('📍 [USMPR] Checkpoint 2.3: Active protocols filtered, about to override methods');

  // console.log('✅ [USMPR] Active protocols set successfully');
  // console.log('ℹ️  [USMPR] SR measurements will be added as annotation layers');

  // 🔒 SUPER AGGRESSIVE SR PROTECTION: Override ALL hanging protocol change methods
  // When SR files are loaded, OHIF tries to apply SR hanging protocol (Stack viewports)
  // We want to keep USMPR Volume viewports and just add measurements to them
  // console.log('🔒 [USMPR] Installing SUPER aggressive SR protection');

  const originalProtocolId = '@ohif/hpUSMPR';

  // Store original methods
  const originalSetProtocol = hangingProtocolService.setProtocol?.bind(hangingProtocolService);
  const originalRun = hangingProtocolService.run?.bind(hangingProtocolService);
  const originalSetActiveProtocol = hangingProtocolService.setActiveProtocol?.bind(hangingProtocolService);

  (window as any).usmprOriginalMethods = {
    setProtocol: originalSetProtocol,
    run: originalRun,
    setActiveProtocol: originalSetActiveProtocol,
  };

  // Override ALL protocol change methods
  if (hangingProtocolService.setProtocol) {
    hangingProtocolService.setProtocol = function(protocolId, options = {}) {
      if (protocolId === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED setProtocol(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      // console.log(`✅ [USMPR] setProtocol(${protocolId})`);
      return originalSetProtocol(protocolId, options);
    };
  }

  if (hangingProtocolService.run) {
    hangingProtocolService.run = function(protocol, options = {}) {
      if (protocol?.id === '@ohif/sr' || protocol === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED run(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      // console.log(`✅ [USMPR] run(${protocol?.id || protocol})`);
      return originalRun(protocol, options);
    };
  }

  if (hangingProtocolService.setActiveProtocol) {
    hangingProtocolService.setActiveProtocol = function(protocolId, options = {}) {
      if (protocolId === '@ohif/sr') {
        console.error(`🚨 [USMPR] BLOCKED setActiveProtocol(@ohif/sr) - Should not happen!`);
        console.error(`🚨 [USMPR] Active protocols:`, hangingProtocolService.activeProtocolIds);
        console.trace('SR protocol stack trace');
        return;
      }
      // console.log(`✅ [USMPR] setActiveProtocol(${protocolId})`);
      return originalSetActiveProtocol(protocolId, options);
    };
  }

  console.log('📍 [USMPR] Checkpoint 2.4: SR protection installed, about to clear measurements');

  // console.log('✅ [USMPR] SUPER aggressive SR protection installed');

  // console.log('🧹 [USMPR INIT] Clearing measurements');
  // Clear measurements
  measurementService.clearMeasurements();

  console.log('📍 [USMPR] Checkpoint 2.4.5: Measurements cleared, about to destroy tool groups');

  // console.log('🔧 [USMPR INIT] Starting tool group initialization');
  // Destroy any existing tool groups before creating new ones
  // This prevents "ToolGroup already exists" errors when re-entering the mode
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      // console.log(`🧹 [USMPR INIT] Cleaning up existing tool group '${toolGroupId}'`);
      toolGroupService.destroyToolGroup(toolGroupId);
    }
  });

  console.log('📍 [USMPR] Checkpoint 2.5: About to call initToolGroups');

  // console.log('⚙️ [USMPR INIT] Calling initToolGroups...');
  // Initialize tool groups using basic mode's initToolGroups
  // This properly registers tools with the extensionManager
  try {
    initToolGroups(extensionManager, toolGroupService, commandsManager);
    console.log('📍 [USMPR] Checkpoint 2.6: initToolGroups completed successfully');
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
      global: {}
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
          // console.log('✅ CrosshairsTool patched with error handling');
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
  // console.log('🎬 [USMPR] Initialized lastCrosshairsState =', lastCrosshairsState);

  // NOTE: lastStackViewportIndex and lastStackOriginalImageIds are defined as module-level
  // variables at the top of this file (lines 40-42). Do NOT redeclare them here!

  const layoutChangeHandler = evt => {
    const handlerStart = performance.now();
    console.log('[PERF-LAYOUT] layoutChangeHandler START');

    // LAYOUT_CHANGED events have numCols/numRows at top level
    const { numCols, numRows } = evt;
    // console.log('🚨 [LAYOUT] numRows:', numRows, 'numCols:', numCols);

    // Validate we have the data we need
    if (typeof numCols !== 'number' || typeof numRows !== 'number') {
      return;
    }

    // Only process when layout dimensions actually change
    const hasLayoutChanged =
      previousLayout.numRows !== numRows ||
      previousLayout.numCols !== numCols;

    if (!hasLayoutChanged) {
      // Skip redundant events (e.g., drag with same 2x2 layout)
      return;
    }

    // Update tracking
    previousLayout = { numRows, numCols };

    const isSingleViewport = numRows === 1 && numCols === 1;
    const isMPRGrid = numRows === 2 && numCols === 2;

    // console.log('🚨 [LAYOUT] isSingleViewport:', isSingleViewport);
    // console.log('🚨 [LAYOUT] isMPRGrid:', isMPRGrid);
    // console.log('📐 Layout change detected:', {
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
      // console.log('🔧 [USMPR] Fallback: Initializing ResizableGridManager for MPR mode');
      const container = document.querySelector('[data-cy="viewport-grid"]');
      if (container) {
        resizableGridManager = new ResizableGridManager(viewportGridService);
        resizableGridManager.initialize('[data-cy="viewport-grid"]');
        resizableGridManager.show();

        // Make it globally accessible for layout config modal
        (window as any).usmprResizableGridManager = resizableGridManager;

        // console.log('✅ [USMPR] ResizableGridManager initialized (fallback)');
      }
    }

    if (resizableGridManager) {
      if (isSingleViewport) {
        // console.log('📐 Calling hide() because isSingleViewport=true');
        resizableGridManager.hide();
      } else if (isMPRGrid) {
        // console.log('📐 Calling show() because isMPRGrid=true');
        resizableGridManager.show();
      }
    }

    if (isSingleViewport) {
      // console.log('🎯 [LAYOUT] ===== ENTERING 1-PORT MODE =====');
      // console.log('🎯 [LAYOUT] lastCrosshairsState BEFORE reset:', lastCrosshairsState);

      // When switching to single viewport, save crosshairs state from MPR tool group
      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        crosshairsWasActive = activeTool === 'Crosshairs';
        // console.log('💾 Saved crosshairs state from MPR:', crosshairsWasActive);
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
      }

      // Don't hide planes here - let the monitor handle it based on crosshair state
      // The monitor will detect if crosshairs are deactivated and hide planes automatically

      // Reset crosshairs state so monitor will detect change when returning to 4-port
      lastCrosshairsState = false;
      // console.log('🔄 [USMPR] Reset lastCrosshairsState to false (single viewport)');
      // console.log('🔄 [USMPR] Monitor will handle plane visibility based on crosshair state');
      // console.log('🎯 [LAYOUT] lastCrosshairsState AFTER reset:', lastCrosshairsState);
      // console.log('🎯 [LAYOUT] ===== 1-PORT MODE SETUP COMPLETE =====');
    } else if (isMPRGrid && toolGroup) {
      // ✨ KEY INSIGHT: When toggling layouts, viewports are NOT destroyed/recreated!
      // The viewportGridService just resizes/repositions existing viewport instances.
      // console.log('🔄 Restoring to MPR grid - volume viewports maintain their position');

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
      console.log(`ℹ️ [LAYOUT] Layout changed, keeping workers alive for ongoing/future loading`);

      // CRITICAL: Read viewport position from toggleOneUp command
      // Works for axial (STACK), sagittal, and coronal (VOLUME) viewports
      // console.log('💾 [LAYOUT] Reading saved viewport position from toggleOneUp...');

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
            // console.log(`🔍 [LAYOUT] ===== VOLUME VIEWPORT RESTORE =====`);
            // console.log(`🔍 [LAYOUT] ViewportId: ${viewportId}`);
            // console.log(`🔍 [LAYOUT] ViewportType: ${savedPosition.viewportType}`);
            // console.log(`🔍 [LAYOUT] WorldPosition:`, savedPosition.worldPosition);

            savedViewportPositions[viewportId] = {
              worldPosition: savedPosition.worldPosition,
              viewportType: savedPosition.viewportType
            };
            // console.log(`✅ [LAYOUT] Saved ${viewportId} (VOLUME) world position:`, savedPosition.worldPosition);

            // Set flag to skip STACK sync logic below
            returningFromVolumeViewport = true;

            // CRITICAL: Clear legacy STACK variables so STACK sync doesn't run
            lastStackViewportIndex = null;
            lastStackOriginalImageIds = null;
            // console.log(`🚫 [LAYOUT] Cleared STACK variables - we're returning from VOLUME viewport`);

            // Jump to the saved world position immediately
            // CRITICAL: Jump ALL THREE viewports, not just axial!
            // Each viewport only respects its own slice direction, so we need to jump all of them
            setTimeout(() => {
              try {
                // console.log(`🔍 [LAYOUT] Attempting to jump ALL viewports to world position...`);
                const worldPos = savedPosition.worldPosition;

                // Get all three MPR viewports
                const viewportIds = ['mpr-0', 'mpr-1', 'mpr-2'];  // axial, sagittal, coronal
                const viewportNames = ['Axial', 'Sagittal', 'Coronal'];

                for (let i = 0; i < viewportIds.length; i++) {
                  const vpId = viewportIds[i];
                  const vpName = viewportNames[i];
                  const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);

                  if (viewport && viewport.jumpToWorld) {
                    // console.log(`🔍 [LAYOUT] Jumping ${vpName} (${vpId}) to:`, worldPos);
                    viewport.jumpToWorld(worldPos);
                    // console.log(`[LAYOUT] ✅ ${vpName} jumped successfully`);
                  } else {
                    console.warn(`[LAYOUT] ⚠️ ${vpName} (${vpId}) not available or no jumpToWorld`);
                  }
                }

                // console.log(`[LAYOUT] ✅ All MPR viewports jumped to VOLUME world position:`, worldPos);
                // console.log(`[LAYOUT] ✅ CrosshairsTool should keep them synchronized`);

                // Verify positions after 500ms
                setTimeout(() => {
                  // console.log(`🔍 [LAYOUT] Verifying positions 500ms later...`);
                  for (let i = 0; i < viewportIds.length; i++) {
                    const vpId = viewportIds[i];
                    const vpName = viewportNames[i];
                    const viewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
                    if (viewport && viewport.getCamera) {
                      const camera = viewport.getCamera();
                      // console.log(`🔍 [LAYOUT] ${vpName} camera focal point:`, camera?.focalPoint);
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
              viewportType: savedPosition.viewportType
            };

            // Also update legacy variables for STACK sync to use
            lastStackViewportIndex = savedPosition.index;
            lastStackOriginalImageIds = savedPosition.imageIds;

            // console.log(`✅ [LAYOUT] Saved ${viewportId} (STACK) position: slice ${savedPosition.index} of ${savedPosition.imageIds?.length}`);

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
      // console.log('🔓 [USMPR] Tearing down STACK viewport synchronization');
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
      // console.log('🔧 WindowLevel set to passive (MPR grid)');

      // Restore crosshairs state based on what it was before switching to 1-port
      // If crosshairsWasActive is true, activate it; otherwise, keep it passive
      // console.log('🔄 Restoring crosshairs state - was active before?', crosshairsWasActive);
      if (crosshairsWasActive) {
        toolGroup.setToolActive('Crosshairs', {
          bindings: [
            {
              mouseButton: Enums.MouseBindings.Primary, // Left mouse button for crosshairs
            },
          ],
        });
        // console.log('✅ Crosshairs restored to ACTIVE (user had it enabled)');
        // Update monitor state to match
        lastCrosshairsState = true;
      } else {
        toolGroup.setToolPassive('Crosshairs');
        // console.log('⏸️ Crosshairs restored to PASSIVE (user had it disabled)');
        // Update monitor state to match
        lastCrosshairsState = false;
      }

      // ============== WORLD COORDINATE SYNC START ==============
      // console.log('🚀 [DEBUG] ===== RETURNING TO 4-PORT: SYNC CHECK =====');
      // console.log('🚀 [DEBUG] savedViewportPositions:', JSON.stringify(savedViewportPositions, null, 2));
      // console.log('🚀 [DEBUG] lastStackViewportIndex:', lastStackViewportIndex);
      // console.log('🚀 [DEBUG] lastStackOriginalImageIds:', lastStackOriginalImageIds?.length);
      // console.log('🚀 [DEBUG] returningFromVolumeViewport:', returningFromVolumeViewport);

      // Sync ALL MPR viewports to saved viewport position via world coordinates
      // User wants: 1-port slice 200 → 4-port all viewports at slice 200
      // Architecture: Saved position → ImagePositionPatient → jumpToWorld() → CrosshairsTool → all MPR viewports sync
      if (lastStackViewportIndex !== null && lastStackOriginalImageIds !== null) {
        // console.log(`[USMPR] 🌍 EXECUTING STACK sync to world position: slice ${lastStackViewportIndex}`);
        // console.log(`[USMPR] Total original imageIds:`, lastStackOriginalImageIds?.length);

        setTimeout(() => {
          try {
            // Validate the index is within bounds
            if (lastStackViewportIndex < 0 || lastStackViewportIndex >= lastStackOriginalImageIds.length) {
              console.warn(`[USMPR] ⚠️ Index out of bounds: ${lastStackViewportIndex} (array length: ${lastStackOriginalImageIds.length})`);
              return;
            }

            // Get the original imageId (without ?stackView suffix) at the STACK position
            const originalImageId = lastStackOriginalImageIds[lastStackViewportIndex];
            // console.log(`[USMPR] Looking up imageId at index ${lastStackViewportIndex}:`, originalImageId);

            if (!originalImageId) {
              console.warn(`[USMPR] ⚠️ No imageId found at index ${lastStackViewportIndex}`);
              console.warn(`[USMPR] lastStackOriginalImageIds:`, lastStackOriginalImageIds);
              return;
            }

            // Get ImagePositionPatient (world coordinates) from DICOM metadata
            const imagePlaneModule = cornerstoneCore.metaData.get('imagePlaneModule', originalImageId);
            // console.log('[USMPR] imagePlaneModule:', imagePlaneModule);

            if (!imagePlaneModule || !imagePlaneModule.imagePositionPatient) {
              console.warn('[USMPR] ⚠️ No imagePlaneModule or imagePositionPatient found');
              console.warn('[USMPR] Available metadata keys:', Object.keys(imagePlaneModule || {}));
              return;
            }

            const worldPosition = imagePlaneModule.imagePositionPatient;
            // console.log(`[USMPR] 📍 World position from IPP [x, y, z]:`, worldPosition);

            // Jump to world position using axial viewport
            // CrosshairsTool automatically propagates to sagittal/coronal
            const axialViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-0');
            // console.log('[USMPR] Axial viewport:', axialViewport?.id, 'type:', axialViewport?.type);
            // console.log('[USMPR] jumpToWorld method available:', typeof axialViewport?.jumpToWorld);

            if (axialViewport && axialViewport.jumpToWorld) {
              axialViewport.jumpToWorld(worldPosition);
              // console.log(`[USMPR] ✅ jumpToWorld called with:`, worldPosition);
              // console.log(`[USMPR] ✅ All MPR viewports should sync via CrosshairsTool`);
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
        // console.log('[USMPR] ✅ SKIPPING STACK sync - not returning from STACK viewport');
        // console.log('[USMPR]   lastStackViewportIndex:', lastStackViewportIndex);
        // console.log('[USMPR]   lastStackOriginalImageIds:', lastStackOriginalImageIds?.length, 'imageIds');
      }

      // Also ensure StackScrollMouseWheel is active for mouse wheel scrolling
      try {
        toolGroup.setToolActive('StackScrollMouseWheel');
        // console.log('✅ StackScrollMouseWheel activated for mouse wheel scrolling');
      } catch (e) {
        console.warn('⚠️ StackScrollMouseWheel not available:', e);
      }

      crosshairsWasActive = false; // Reset flag

      // No need to restore position - viewports keep their frame positions automatically!
      // console.log('✅ Frame positions preserved automatically (viewports not recreated)');

      // CRITICAL DEBUG: Check current crosshairs state and manager status
      // console.log('🔍 [USMPR] ===== RETURNING TO 4-PORT DEBUG =====');
      // console.log('🔍 [USMPR] slicePlaneManager exists:', !!slicePlaneManager);
      // console.log('🔍 [USMPR] slicePlaneSync exists:', !!slicePlaneSync);
      // console.log('🔍 [USMPR] lastCrosshairsState:', lastCrosshairsState);

      const mprToolGroup = toolGroupService.getToolGroup('mpr');
      if (mprToolGroup) {
        const activeTool = mprToolGroup.getActivePrimaryMouseButtonTool();
        const isCrosshairsActive = activeTool === 'Crosshairs';
        // console.log('🔍 [USMPR] Current active tool:', activeTool);
        // console.log('🔍 [USMPR] Crosshairs currently active:', isCrosshairsActive);

        // Force state reset to ensure monitor detects change
        lastCrosshairsState = false;
        // console.log('🔍 [USMPR] Reset lastCrosshairsState to false');
        // console.log('🔍 [USMPR] Monitor should detect change on next tick (100ms)');
      } else {
        console.warn('⚠️ [USMPR] MPR tool group not found!');
      }

      // CRITICAL: Re-initialize slice planes when returning to 4-port
      // console.log('🔄 [SLICE PLANES] ===== Re-initializing slice planes for 4-port =====');
      const layoutConfig = getLayoutConfig();
      const position3D = layoutConfig?.positions?.indexOf('3D');
      // console.log('🔄 [SLICE PLANES] 3D viewport position:', position3D);

      if (position3D !== -1 && position3D !== undefined) {
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
        // console.log('🔄 [SLICE PLANES] 3D viewport exists:', !!viewport3D);

        if (viewport3D) {
          // Destroy old slice plane manager if it exists
          if (slicePlaneManager) {
            // console.log('🔄 [SLICE PLANES] Destroying old slicePlaneManager...');
            try {
              slicePlaneManager.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old manager:', e);
            }
          }

          // Destroy old slice plane sync if it exists
          if (slicePlaneSync) {
            // console.log('🔄 [SLICE PLANES] Destroying old slicePlaneSync...');
            try {
              slicePlaneSync.destroy();
            } catch (e) {
              console.warn('⚠️ [SLICE PLANES] Error destroying old sync:', e);
            }
          }

          // Re-initialize slice plane manager
          // console.log('🔄 [SLICE PLANES] Creating new SlicePlaneManager...');
          slicePlaneManager = new SlicePlaneManager();
          slicePlaneManager.initialize(viewport3D);
          slicePlaneManager.setVisible(true); // Always visible
          // console.log('✅ [SLICE PLANES] SlicePlaneManager re-initialized');

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
          // console.log('🔄 [SLICE PLANES] Creating new SlicePlaneSync...');
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(true); // Always enabled
          // console.log('✅ [SLICE PLANES] SlicePlaneSync re-initialized');

          // console.log('✅ [SLICE PLANES] Slice planes restored successfully!');

          // Re-apply custom US preset after returning to 4-port
          setTimeout(() => {
            const currentLayoutConfig = getLayoutConfig();
            const currentPresetName = currentLayoutConfig.preset3D || 'US 3D 1';
            // console.log(`🎨 [US VR] Re-applying custom US preset after 4-port restore: ${currentPresetName}`);
            applyCustomUSPreset(cornerstoneViewportService, currentPresetName);
          }, 100); // Apply quickly to minimize flash of old preset
        }
        // Silent if 3D viewport not found - may still be initializing
      } else {
        // Silent if no 3D position - layout might not include 3D viewport
      }
      // console.log('🔄 [SLICE PLANES] ===== End slice plane re-initialization =====');

      // console.log('🔍 [USMPR] ===== END DEBUG =====');
    }
  };

  // Subscribe to layout changes
  // console.log('🔌 Available viewportGridService.EVENTS:', viewportGridService.EVENTS);
  // console.log('🔌 Subscribing to LAYOUT_CHANGED event:', viewportGridService.EVENTS.LAYOUT_CHANGED);

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
          const shouldClear = seriesUIDs.length === 0 || seriesUIDs.some(uid => imageId.includes(uid));

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
        console.log(`🧹 [Stack Cache] Cleared ${clearedCount} cache entries + ${prevSize} tracked Level 0 images`);
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
            console.log(`🗑️ [Volume Cache] Removed: ${volumeId.substring(0, 50)}... (${sizeMB}MB)`);
          } catch (e) {
            console.debug('[Volume Cache] Failed to remove volume:', e);
          }
        }
      });

      if (clearedCount > 0) {
        console.log(`🧹 [Volume Cache] Cleared ${clearedCount} old volumes`);
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
      // console.log(`🎯 Event fired: ${eventName} (${eventKey})`, evt);
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
        const seriesChanged = currentSeriesUIDs.length > 0 &&
          (previousSeriesUIDs.length === 0 ||
           !currentSeriesUIDs.every(uid => previousSeriesUIDs.includes(uid)));

        if (seriesChanged) {
          // console.log(`🔄 [USMPR] Series changed: [${previousSeriesUIDs.join(', ')}] → [${currentSeriesUIDs.join(', ')}]`);

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
          console.log(`[USMPR-SeriesChange] Detected: [${previousSeriesUIDs.join(', ')}] → [${currentSeriesUIDs.join(', ')}]`);

          // 🔵 [LATERALITY] On FIRST load, check if we should switch to RIGHT series
          // TEMPORARILY DISABLED for debugging - will re-enable after fixing import
          const ENABLE_LATERALITY_SELECTION = false;
          if (ENABLE_LATERALITY_SELECTION && previousSeriesUIDs.length === 0 && currentSeriesUIDs.length > 0) {
            console.log('[USMPR-Laterality] First series load - checking laterality preference...');

            try {
              // Check if SeriesLateralityManager is available
              if (!SeriesLateralityManager) {
                console.error('[USMPR-Laterality] SeriesLateralityManager not imported!');
                throw new Error('SeriesLateralityManager not available');
              }

              // Get all displaySets for the current study
              const allDisplaySets = displaySetService.getActiveDisplaySets();
              console.log(`[USMPR-Laterality] Found ${allDisplaySets.length} displaySets in study`);

              // Filter to only image series (exclude SR)
              const imageSeries = allDisplaySets.filter(ds =>
                ds.Modality !== 'SR' &&
                !ds.SOPClassHandlerId?.includes('SR') &&
                ds.numImageFrames > 1
              );
              console.log(`[USMPR-Laterality] ${imageSeries.length} image series (excluding SR)`);

              // 🔍 DEBUG: Log DICOM tags for each series to diagnose laterality detection
              imageSeries.forEach((ds, i) => {
                console.log(`[USMPR-Laterality-DEBUG] Series ${i + 1}/${imageSeries.length}:`);
                console.log(`  - SeriesInstanceUID: ${ds.SeriesInstanceUID?.slice(0, 30)}...`);
                console.log(`  - SeriesDescription: "${ds.SeriesDescription}"`);
                console.log(`  - Laterality tag: "${ds.Laterality}"`);
                console.log(`  - ImageLaterality tag: "${ds.ImageLaterality}"`);
                console.log(`  - BodyPartExamined: "${ds.BodyPartExamined}"`);
                console.log(`  - Modality: "${ds.Modality}"`);

                // Try detection
                const detected = SeriesLateralityManager.detectLaterality(ds);
                console.log(`  - Detected laterality: ${detected || 'UNKNOWN'}`);
              });

              if (imageSeries.length > 1) {
                // Group by laterality
                const groups = SeriesLateralityManager.groupByLaterality(imageSeries);

                // Check if we have RIGHT series available
                if (groups.right.length > 0) {
                  const currentLoadedUID = currentSeriesUIDs[0];
                  const rightSeriesUID = groups.right[0].SeriesInstanceUID;

                  console.log(`[USMPR-Laterality] Current: ${currentLoadedUID?.slice(0, 20)}...`);
                  console.log(`[USMPR-Laterality] RIGHT series: ${rightSeriesUID?.slice(0, 20)}...`);

                  // If current series is NOT RIGHT, switch to RIGHT
                  if (currentLoadedUID !== rightSeriesUID) {
                    console.log('🔄 [USMPR-Laterality] Switching to RIGHT series...');

                    // Get RIGHT displaySet
                    const rightDisplaySet = groups.right[0];

                    // Switch all volume viewports to RIGHT series
                    commandsManager.run('setDisplaySetsForViewports', {
                      viewportsToUpdate: [
                        { viewportId: 'mpr-0', displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID] },
                        { viewportId: 'mpr-1', displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID] },
                        { viewportId: 'mpr-2', displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID] },
                        { viewportId: 'mpr-3', displaySetInstanceUIDs: [rightDisplaySet.displaySetInstanceUID] },
                      ],
                    });

                    // 🔥 CRITICAL: Update currentSeriesInstanceUID to RIGHT series
                    // Without this, drag & drop won't detect series change!
                    currentSeriesInstanceUID = rightSeriesUID;
                    (window as any).__usmprCurrentSeriesUID = rightSeriesUID;
                    console.log(`🔍 [LATERALITY-FIX] Updated currentSeriesInstanceUID to RIGHT: ${rightSeriesUID?.slice(0, 30)}...`);

                    console.log('✅ [USMPR-Laterality] Switched to RIGHT series successfully');
                  } else {
                    console.log('✅ [USMPR-Laterality] Already displaying RIGHT series');
                  }
                } else {
                  console.log('ℹ️ [USMPR-Laterality] No RIGHT series found, keeping current series');
                }
              } else {
                console.log('ℹ️ [USMPR-Laterality] Only one image series - no laterality selection needed');
              }
            } catch (error) {
              console.error('❌ [USMPR-Laterality] Error selecting RIGHT series');
              console.error('   Error message:', error instanceof Error ? error.message : String(error));
              console.error('   Error stack:', error instanceof Error ? error.stack : 'No stack trace');
              console.error('   Error object:', error);
            }
          }

          // Update global currentSeriesInstanceUID for drag & drop handler to use
          currentSeriesInstanceUID = currentSeriesUIDs[0] || null;
          (window as any).__usmprCurrentSeriesUID = currentSeriesInstanceUID;

          // 🔍 DEBUG: Log current series UID for cleanup tracking
          console.log(`🔍 [DEBUG] Updated currentSeriesInstanceUID: ${currentSeriesInstanceUID?.slice(0, 30)}...`);
          console.log(`🔍 [DEBUG] Window global: ${(window as any).__usmprCurrentSeriesUID?.slice(0, 30)}...`);

          // Reload Stack viewport with new series imageIds
          reloadStackViewportForNewSeries(servicesManager, viewportGridService, viewportData)
            .catch(err => {
              console.error('[USMPR-SeriesChange] Stack reload failed:', err);
            });

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
  // console.log('✅ Subscribed to all events');

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
  // console.log('🎬 [USMPR] Crosshairs monitor ENABLED - tracking state for layout preservation');

  const crosshairsMonitor = setInterval(() => {
    // Track crosshairs state to preserve it across layout changes
    const toolGroup = toolGroupService.getToolGroup('mpr');
    if (!toolGroup) {
      if (monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil) {
        // console.log('⚠️ [USMPR] Crosshairs monitor: tool group not found');
      }
      monitorCount++;
      return;
    }

    const activeTool = toolGroup.getActivePrimaryMouseButtonTool();
    const isCrosshairsActive = activeTool === 'Crosshairs';

    // Log periodically OR during verbose period
    const shouldLog = monitorCount % 50 === 0 || Date.now() < verboseLoggingUntil;
    if (shouldLog) {
      // console.log(`🔍 [MONITOR] Check #${monitorCount}: activeTool="${activeTool}", isCrosshairsActive=${isCrosshairsActive}, lastState=${lastCrosshairsState}, slicePlaneManager=${!!slicePlaneManager}, slicePlaneSync=${!!slicePlaneSync}`);
    }
    monitorCount++;

    // Only update if state changed
    if (isCrosshairsActive !== lastCrosshairsState) {
      // console.log(`🔄 [MONITOR] ===== CROSSHAIR STATE CHANGE =====`);
      // console.log(`🔄 [MONITOR] lastCrosshairsState: ${lastCrosshairsState} -> isCrosshairsActive: ${isCrosshairsActive}`);

      // Enable verbose logging for next 3 seconds
      verboseLoggingUntil = Date.now() + 3000;

      lastCrosshairsState = isCrosshairsActive;

      // Update crosshairsWasActive to preserve state across layout changes
      crosshairsWasActive = isCrosshairsActive;
      // console.log(`💾 [MONITOR] Updated crosshairsWasActive = ${crosshairsWasActive}`);

      // Slice planes remain always visible regardless of crosshair state
      // console.log(`ℹ️ [MONITOR] Slice planes remain visible (always on)`);
      // console.log(`🔄 [MONITOR] ===== END STATE CHANGE =====`);
    }
  }, 100); // Check every 100ms

  // console.log('ℹ️ [USMPR] Crosshairs monitor ENABLED - tracking state for layout preservation');

  // Store interval for cleanup
  (window as any).usmprCrosshairsMonitor = crosshairsMonitor;

  // Initialize ResizableGridManager with retry mechanism
  // DICOMweb loading takes longer, so we need to retry if container is not ready
  // console.log('🔧 [USMPR] Initializing ResizableGridManager...');
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
          // console.log('✅ [USMPR] ResizableGridManager shown with saved positions');
        }
      }, 50);
      // console.log('✅ [USMPR] ResizableGridManager initialized');
    } else if (!container && retryCount < maxRetries) {
      // Retry with increasing delay (100ms, 200ms, 300ms, ...)
      const delay = (retryCount + 1) * 100;
      // console.log(`⏳ [USMPR] Viewport grid container not found, retrying in ${delay}ms (${retryCount + 1}/${maxRetries})`);
      setTimeout(() => initResizableGrid(retryCount + 1, maxRetries), delay);
    } else if (!container) {
      console.warn('⚠️ [USMPR] Viewport grid container not found after max retries');
    }
  };
  // Start initialization with initial delay
  setTimeout(() => initResizableGrid(), 50);

  // Initialize 3D reference planes and related components
  // console.log('🎬 [USMPR] Scheduling 3D slice plane initialization...');
  setTimeout(() => {
    // Initialize 3D reference planes
    // console.log('🔧 [USMPR] ===== STARTING 3D SLICE PLANE INITIALIZATION =====');
    try {
      // console.log('🔧 [USMPR] Getting layout config...');
      const layoutConfig = getLayoutConfig();
      // console.log('🔧 [USMPR] Layout config:', layoutConfig);
      // console.log('🔧 [USMPR] Layout positions:', layoutConfig?.positions);

      const position3D = layoutConfig?.positions?.indexOf('3D');
      // console.log('🔧 [USMPR] 3D viewport position index:', position3D);

      if (position3D !== -1 && position3D !== undefined) {
        // console.log(`📍 [USMPR] Found 3D viewport at position ${position3D}`);
        // console.log(`📍 [USMPR] Looking for viewport with ID: mpr-${position3D}`);

        // Get the 3D viewport
        const viewport3D = cornerstoneViewportService.getCornerstoneViewport(`mpr-${position3D}`);
        // console.log('📍 [USMPR] Viewport3D retrieved:', !!viewport3D);

        if (viewport3D) {
          // console.log('📍 [USMPR] Viewport3D type:', viewport3D.type);
          // console.log('✅ [USMPR] 3D viewport retrieved successfully');

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
            // console.log('🔄 [USMPR] Destroying existing slicePlaneManager before initial setup...');
            try {
              slicePlaneManager.destroy();
            } catch (e) {
              console.warn('⚠️ [USMPR] Error destroying old manager:', e);
            }
          }

          // Destroy old slice plane sync if it exists
          if (slicePlaneSync) {
            // console.log('🔄 [USMPR] Destroying existing slicePlaneSync before initial setup...');
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
          // console.log('🙈 [USMPR] Slice planes initialized (hidden, will show after images load)');

          // Map viewport positions to orientations (skip 3D position)
          const viewportInfos = [];
          layoutConfig.positions.forEach((viewType, index) => {
            if (viewType !== '3D') {
              viewportInfos.push({
                viewportId: `mpr-${index}`,
                orientation: viewType.toLowerCase(), // 'axial', 'sagittal', 'coronal'
              });
              // console.log(`📍 [USMPR] Mapped mpr-${index} to ${viewType.toLowerCase()}`);
            }
          });

          // Initialize slice plane sync with Cornerstone event target
          slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
          slicePlaneSync.initialize(viewportInfos, coreEventTarget);
          slicePlaneSync.setEnabled(true); // ✅ ALWAYS ENABLED - syncing slice planes automatically
          // console.log('✅ [USMPR] Slice plane sync set to ALWAYS ENABLED');

          // console.log('✅ [USMPR] 3D reference planes initialized successfully');

          // Update slice plane positions after a delay to ensure viewports are fully loaded
          slicePlaneShowTimeout1 = window.setTimeout(() => {
            // console.log('🔄 [USMPR] Updating slice plane positions after viewport load...');
            if (slicePlaneSync) {
              slicePlaneSync.updateAllPlanes();
              // console.log('✅ [USMPR] Slice planes repositioned to viewport centers');
            }
          }, 1000); // Wait 1000ms for viewports to fully load and position cameras

          // Force another update after volume rendering to ensure correct position
          // Then show the planes (they were hidden initially to avoid showing before images load)
          slicePlaneShowTimeout2 = window.setTimeout(() => {
            // console.log('🔄 [USMPR] Final slice plane position update...');
            if (slicePlaneSync) {
              slicePlaneSync.updateAllPlanes();
              // console.log('✅ [USMPR] Final slice plane positions updated');
            }
            // Now show the planes after images are loaded and positioned
            if (slicePlaneManager) {
              slicePlaneManager.setVisible(true);
              // console.log('👁️ [USMPR] Slice planes now visible (images loaded)');
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
    // console.log('🏁 [USMPR] 3D slice plane initialization completed (check messages above for result)');
  }, 200); // Reduced delay to minimize flash of old CT preset

  // Initialize layout config manager
  layoutConfigManager = new LayoutConfigManager();
  layoutConfigManager.setServicesManager(servicesManager);
  // console.log('🔧 LayoutConfigManager initialized:', layoutConfigManager);

  // Make it globally accessible for toolbar button
  (window as any).usmprLayoutConfigManager = layoutConfigManager;

  // 🔄 Helper function to load SR displaySets
  // This is called on initial load and when viewports/layout changes
  const loadSRDisplaySets = async (reason = 'initial load') => {
    // console.log(`🔍 [USMPR] Loading SR displaySets (${reason})...`);
    const allDisplaySets = displaySetService.activeDisplaySets;
    const srDisplaySets = allDisplaySets.filter(ds =>
      ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
    );

    if (srDisplaySets.length > 0) {
      // console.log(`✅ [USMPR] Found ${srDisplaySets.length} SR displaySet(s) - loading measurements`);

      // Load each SR displaySet to extract and add measurements
      for (const srDS of srDisplaySets) {
        // console.log('🔄 [USMPR] Loading SR displaySet:', srDS.displaySetInstanceUID);

        if (typeof srDS.load === 'function') {
          try {
            await srDS.load();
            // console.log('✅ [USMPR] SR displaySet loaded - measurements should appear');
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
        // console.log('🔄 [USMPR] Triggering viewport re-render for SR annotations');
        renderingEngine.renderViewports(renderingEngine.getViewports().map(vp => vp.id));
      }
    } else {
      // console.log('ℹ️  [USMPR] No SR displaySets found');
    }
  };

  // 🔄 Automatically load SR displaySets on initial load
  setTimeout(() => loadSRDisplaySets('initial load'), 1000);

  // 🔄 Subscribe to viewport data changes to reload SR when images change
  const viewportDataChangedUnsub = cornerstoneViewportService.subscribe(
    cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED,
    evt => {
      // console.log('🔄 [USMPR] Viewport data changed - checking if SR reload needed');
      // Only reload if we have SR displaySets
      const allDisplaySets = displaySetService.activeDisplaySets;
      const hasSR = allDisplaySets.some(ds =>
        ds.Modality === 'SR' || ds.SOPClassHandlerId?.includes('SR')
      );
      if (hasSR) {
        setTimeout(() => loadSRDisplaySets('viewport data changed'), 200);
      }
    }
  );

  // Store unsubscribe function for cleanup
  (window as any).usmprViewportDataChangedUnsub = viewportDataChangedUnsub;

  // Create and register USMPR commands context
  commandsManager.createContext('USMPR');
  // console.log('📦 Created USMPR command context');

  // Register custom command for opening layout config modal
  commandsManager.registerCommand('USMPR', 'openLayoutConfigModal', {
    commandFn: () => {
      // console.log('🎯 openLayoutConfigModal command called!');
      // console.log('🔍 layoutConfigManager exists?', !!layoutConfigManager);
      if (layoutConfigManager) {
        // console.log('📂 Calling layoutConfigManager.show()...');
        layoutConfigManager.show();
      } else {
        console.error('❌ layoutConfigManager is null!');
      }
    },
  });
  // console.log('✅ openLayoutConfigModal command registered in USMPR context');

  // Register command for opening SR Report Page
  commandsManager.registerCommand('USMPR', 'openSRReportPage', {
    commandFn: async () => {
      // console.log('🔍 Opening SR Report Page...');

      const { measurementService, displaySetService } = servicesManager.services;

      // Extract ALL measurements (including SR)
      const measurements = Array.from(measurementService.measurements.values());

      // Get study/series context
      const activeDisplaySets = displaySetService.activeDisplaySets;
      const firstDS = activeDisplaySets[0];

      // console.log('📊 Total measurements:', measurements.length);
      // console.log('📊 All measurements:', measurements);

      // Log each measurement's details
      measurements.forEach((m, idx) => {
        // console.log(`📊 Measurement ${idx}:`, {
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

      // console.log('📊 First display set:', firstDS);

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
          // console.log('📋 Full measurement object:', m);

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

          // console.log('📋 Extracted text for parsing:', displayText);

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
            }
          };

          // console.log('✅ Extracted measurement data:', extractedData);
          // console.log(`   - Position: "${extractedData.position}"`);
          // console.log(`   - Echo: "${extractedData.echo}"`);
          // console.log(`   - Shape: "${extractedData.shape}"`);
          // console.log(`   - Orientation: "${extractedData.orientation}"`);
          // console.log(`   - Margin: "${extractedData.margin}"`);

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
        // console.log(`🔍 Looking for field: ${fieldName}`);
        // console.log(`📦 Measurement keys:`, Object.keys(measurement));
        // console.log(`📦 metadata:`, measurement.metadata);
        // console.log(`📦 metadata.clinical:`, measurement.metadata?.clinical);

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
        if (measurement.metadata?.clinical && measurement.metadata.clinical[fieldName] !== undefined) {
          const rawValue = measurement.metadata.clinical[fieldName];
          const convertedValue = convertValue(rawValue);
          // console.log(`✅ Found ${fieldName} in metadata.clinical: ${rawValue} → "${convertedValue}"`);
          return convertedValue;
        }

        // 2. Check metadata directly
        if (measurement.metadata && measurement.metadata[fieldName] !== undefined) {
          // console.log(`✅ Found ${fieldName} in metadata:`, measurement.metadata[fieldName]);
          return convertValue(measurement.metadata[fieldName]);
        }

        // 3. Check finding object
        if (measurement.finding && measurement.finding[fieldName] !== undefined) {
          // console.log(`✅ Found ${fieldName} in finding:`, measurement.finding[fieldName]);
          return convertValue(measurement.finding[fieldName]);
        }

        // 4. Check data object (SR annotations might store here)
        if (measurement.data && measurement.data[fieldName] !== undefined) {
          // console.log(`✅ Found ${fieldName} in data:`, measurement.data[fieldName]);
          return convertValue(measurement.data[fieldName]);
        }

        // 5. Check top level
        if (measurement[fieldName] !== undefined) {
          // console.log(`✅ Found ${fieldName} at top level:`, measurement[fieldName]);
          return convertValue(measurement[fieldName]);
        }

        // 6. Check if it's in findingSites with a specific type
        if (measurement.findingSites && Array.isArray(measurement.findingSites)) {
          for (const site of measurement.findingSites) {
            if (site.type === fieldName && site.text) {
              // console.log(`✅ Found ${fieldName} in findingSites:`, site.text);
              return site.text;
            }
          }
        }

        // console.log(`❌ ${fieldName} not found anywhere`);
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
        if (!text || typeof text !== 'string') return '';

        // Match patterns like "(slice 25)" or "slice 20-25" or "frame 10-15"
        const sliceMatch = text.match(/\(slice\s+(\d+(?:-\d+)?)\)/i) || text.match(/slice\s+(\d+(?:-\d+)?)/i);
        const frameMatch = text.match(/frame\s+(\d+(?:-\d+)?)/i);

        if (sliceMatch) return sliceMatch[1];
        if (frameMatch) return frameMatch[1];

        return '';
      }

      // Helper function to extract malignancy percentage like "M:83%"
      function extractMaligPercent(text) {
        if (!text || typeof text !== 'string') return '';

        // Match pattern like "M:83%" or "M: 83%"
        const match = text.match(/M[:\s]*(\d+)%/i);
        if (match) return match[1];

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
          if (measurement.stats.max !== undefined) parts.push(`${measurement.stats.max.toFixed(1)}`);
          if (measurement.area !== undefined) parts.push(`${measurement.area.toFixed(1)}`);
          if (measurement.volume !== undefined) parts.push(`${measurement.volume.toFixed(1)}`);
        }

        return parts.join('/');
      }

      // Helper function to extract field from text (echo, margin, shape) - kept for compatibility
      function extractFieldFromText(text, field) {
        if (!text || typeof text !== 'string') return '';

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
        const text = String(measurement.label || measurement.finding?.text || measurement.displayText || '');

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

        // console.log('📍 Extracted position from:', text.substring(0, 100), '→', position);
        return position;
      }

      // Helper function to extract size
      function extractSizeFromMeasurement(measurement) {
        // console.log('📏 Extracting size from:', measurement.toolName, measurement);

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
            // console.log('📏 Extracted size from label:', match[1]);
            return match[1];
          }
        }

        // PRIORITY 3: Length tool direct property
        if (measurement.toolName === 'Length' && measurement.length) {
          return measurement.length.toFixed(1);
        }

        // PRIORITY 4: EllipticalROI or CircleROI - get mean diameter or area
        if ((measurement.toolName === 'EllipticalROI' || measurement.toolName === 'CircleROI')) {
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
          const text = String(measurement.text || measurement.finding?.text || measurement.displayText || '');
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
        // console.log('✅ Stored report data with', reportData.measurements.length, 'measurements');
        // console.log('✅ Report data:', reportData);

        // Open report page in new tab
        window.open('/report.html', '_blank');
      } catch (error) {
        console.error('❌ Failed to store report data:', error);
        alert('Failed to open report page. Please try again.');
      }
    },
  });
  // console.log('✅ openSRReportPage command registered in USMPR context');

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
  // console.log('✅ openPDFReportPage command registered in USMPR context');
}

// Memory management: Track which images are loaded at level 0
let loadedLevel0Images: Set<string> = new Set();
const MAX_LEVEL0_IMAGES = 20; // Keep 20 images at full resolution in memory (20 × 5MB = 100MB)
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
  console.log(`🔍 [CLEANUP-DEBUG] cleanupOldSeries CALLED with UID: ${oldSeriesUID?.slice(0, 30)}...`);

  if (!oldSeriesUID) {
    console.log('[USMPR-Cleanup] No old series UID - skipping cleanup');
    return;
  }

  try {
    console.log(`🧹 [CLEANUP] Starting SELECTIVE cleanup for OLD series: ${oldSeriesUID?.slice(0, 15)}...`);
    console.log(`🔍 [CLEANUP-DEBUG] Call stack trace:`, new Error().stack);

    const cache = cornerstoneCore.cache;

    // 1. Log all volumes to see their format
    const volumes = cache.getVolumes();
    console.log(`📊 [CLEANUP] Current volumes in cache (${volumes.length} total):`);
    volumes.forEach((v, i) => {
      console.log(`   ${i + 1}. ${v.volumeId}`);
    });

    // 2. Remove volumes belonging to OLD series only (SELECTIVE!)
    let removedCount = 0;
    volumes.forEach(v => {
      if (v.volumeId.includes(oldSeriesUID)) {
        console.log(`   🗑️ Removing OLD volume: ${v.volumeId}`);
        try {
          cache.removeVolumeLoadObject(v.volumeId);
          removedCount++;
        } catch (e) {
          console.debug('[CLEANUP] Volume already removed:', v.volumeId);
        }
      }
    });

    // 3. Remove Stack images belonging to OLD series only (SELECTIVE!)
    const imageCache = (cache as any)._imageCache;
    let imageRemoved = 0;
    let stackViewRemoved = 0;
    if (imageCache) {
      const allImageIds = Object.keys(imageCache);
      console.log(`📊 [CLEANUP] Current Stack images in cache: ${allImageIds.length}`);

      const stackViewImages = allImageIds.filter(id => id.includes('?stackView='));
      console.log(`   - Stack viewport images (?stackView=): ${stackViewImages.length}`);

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

    // 4. Clear loadedLevel0Images Set for old series (CRITICAL - holds references!)
    const loadedImagesBefore = loadedLevel0Images.size;
    const imagesToRemove: string[] = [];
    loadedLevel0Images.forEach(imageId => {
      if (imageId.includes(oldSeriesUID)) {
        imagesToRemove.push(imageId);
      }
    });
    imagesToRemove.forEach(imageId => loadedLevel0Images.delete(imageId));
    console.log(`🗑️ [CLEANUP] Cleared ${imagesToRemove.length} images from loadedLevel0Images Set (${loadedImagesBefore} → ${loadedLevel0Images.size})`);

    // 5. Clear viewport position tracking for old series
    let positionsCleared = 0;
    Object.keys(savedViewportPositions).forEach(key => {
      if (key.includes(oldSeriesUID)) {
        delete savedViewportPositions[key];
        positionsCleared++;
      }
    });
    console.log(`🗑️ [CLEANUP] Cleared ${positionsCleared} viewport positions for old series`);

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
    console.log(`ℹ️ [CLEANUP] Keeping workers alive for next series (will GC when idle)`);

    console.log(`✅ [CLEANUP] Removed ${removedCount} volumes, ${imageRemoved} images (${stackViewRemoved} stackView) from OLD series`);
    console.log(`   Cache now holds: ${cache.getVolumes().length} volumes, ${Object.keys(imageCache || {}).length} images`);
    console.log(`🎯 [CLEANUP] Series-specific data removed - ready for new series`);
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
    console.log('[Stack-Reload] 🔄 Reloading Stack viewport for new series...');

    // Get Stack viewport
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (!stackViewport) {
      console.log('[Stack-Reload] ⚠️ Stack viewport not found, skipping reload');
      return;
    }

    // Get new series displaySet from viewportData
    // viewportData contains the new series information
    if (!viewportData?.data || viewportData.data.length === 0) {
      console.log('[Stack-Reload] ⚠️ No viewport data available');
      return;
    }

    // Get the first displaySet (primary series)
    const displaySetInstanceUID = viewportData.data[0]?.displaySetInstanceUID;
    if (!displaySetInstanceUID) {
      console.log('[Stack-Reload] ⚠️ No displaySetInstanceUID found');
      return;
    }

    const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
    if (!displaySet) {
      console.log('[Stack-Reload] ⚠️ DisplaySet not found:', displaySetInstanceUID);
      return;
    }

    // Get imageIds from displaySet
    let newImageIds = displaySet.imageIds;
    if (!newImageIds || newImageIds.length === 0) {
      console.log('[Stack-Reload] ⚠️ No imageIds in displaySet');
      return;
    }

    console.log(`[Stack-Reload] 📋 Found ${newImageIds.length} imageIds in new series`);

    // Set decode level 0 for Stack viewport
    const level0Options = {
      retrieveOptions: {
        single: {
          streaming: isStreamingEnabled(),
          decodeLevel: 0,  // Full resolution for STACK viewport
        },
      },
    };
    cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', level0Options);
    console.log('[Stack-Reload] ✅ Set decode level 0 for Stack viewport');

    // Transform imageIds to create SEPARATE cache entries
    // Add ?stackView= parameter to avoid conflict with MPR volumes
    const stackOnlyImageIds = newImageIds.map((imageId, idx) => {
      const separator = imageId.includes('?') ? '&' : '?';
      return `${imageId}${separator}stackView=${idx}`;
    });

    console.log('[Stack-Reload] 🔄 Transformed imageIds for separate cache');
    console.log('[Stack-Reload] Sample transformed imageId:', stackOnlyImageIds[0]);

    // Reload Stack viewport with new imageIds
    const middleIndex = Math.floor(stackOnlyImageIds.length / 2);
    await stackViewport.setStack(stackOnlyImageIds, middleIndex);
    stackViewport.render();

    console.log(`[Stack-Reload] ✅ Stack viewport reloaded with ${stackOnlyImageIds.length} imageIds (starting at index ${middleIndex})`);

    // Update saved viewport positions
    savedViewportPositions['mpr-stack-single'] = {
      index: middleIndex,
      imageIds: stackOnlyImageIds,
      viewportType: 'stack'
    };
    lastStackViewportIndex = middleIndex;
    lastStackOriginalImageIds = stackOnlyImageIds;

    console.log('[Stack-Reload] 📍 Saved new Stack viewport position');

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
          viewportType: 'stack'
        };

        // Update legacy variables for backward compatibility
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = originalImageIds;

        // console.log(`[StackSync] 📍 Initial STACK position (first time): slice ${currentIndex}`);
      } else {
        // We have a saved position for this viewport - jump to it!
        const targetIndex = savedPos.index!;
        // console.log(`[StackSync] 📍 Found saved STACK position: slice ${targetIndex} (current viewport is at: ${currentIndex})`);

        // Update imageIds if we don't have them
        if (!savedPos.imageIds || savedPos.imageIds.length === 0) {
          savedViewportPositions[viewportId].imageIds = originalImageIds;
          // console.log(`[StackSync] 📍 Updated imageIds (${originalImageIds?.length} items)`);
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
            console.log(`[StackSync] ⚠️ Clamped saved index ${targetIndex} → ${clampedIndex} (max: ${maxIndex})`);
          }

          if (clampedIndex !== currentIndex) {
            stackViewport.setImageIdIndex(clampedIndex);
            // console.log(`[StackSync] ✅ Jumped STACK viewport from slice ${currentIndex} to saved slice ${clampedIndex}`);
          } else {
            // console.log(`[StackSync] ℹ️ Already at saved position (${clampedIndex})`);
          }
        } catch (error) {
          console.error(`[StackSync] ❌ Failed to jump to saved position ${targetIndex}:`, error);
        }
      }

      if (originalImageIds && originalImageIds.length > 0) {
        // STEP 2: Set decode level 0 FIRST (before transforming imageIds)
        // console.log('[StackSync] 🔧 Setting decode level 0 for STACK viewport');

        // Define level 0 options inline to ensure correct structure
        const level0Options = {
          retrieveOptions: {
            single: {
              streaming: isStreamingEnabled(),
              decodeLevel: 0,  // Full resolution for STACK viewport
            },
          },
        };
        // console.log('[StackSync] level0Options (streaming from config):', level0Options);
        cornerstoneCore.utilities.imageRetrieveMetadataProvider.add('stack', level0Options);

        // Verify metadata provider was set
        const verifyMetadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get('stack') as RetrieveMetadata | undefined;
        // console.log('[StackSync] 📋 Full metadata provider response:', verifyMetadata);
        // console.log('[StackSync] 📋 Decode level:', verifyMetadata?.retrieveOptions?.single?.decodeLevel);

        // console.log(`[StackSync] 🔄 Transforming ${originalImageIds.length} imageIds for separate cache...`);

        // STEP 3: Transform imageIds to create SEPARATE cache entries
        // This is the KEY to preserving MPR volumes!
        const stackOnlyImageIds = originalImageIds.map((imageId, idx) => {
          // Add query parameter to create different cache entry
          const separator = imageId.includes('?') ? '&' : '?';
          return `${imageId}${separator}stackView=${idx}`;
        });

        // console.log('[StackSync] ✅ ImageIds transformed (volumes preserved)');
        // console.log('[StackSync] Sample transformed imageId:', stackOnlyImageIds[currentIndex]);

        // STEP 4: Load viewport with TRANSFORMED imageIds
        // These will load at level 0 in SEPARATE cache entries
        // Original imageIds (used by volumes) remain untouched!
        try {
          // ✅ FIX: Clamp currentIndex to valid range (prevents index out of bounds)
          const maxIndex = stackOnlyImageIds.length - 1;
          const clampedCurrentIndex = Math.max(0, Math.min(currentIndex, maxIndex));

          if (clampedCurrentIndex !== currentIndex) {
            console.log(`[StackSync] ⚠️ Clamped current index ${currentIndex} → ${clampedCurrentIndex} (max: ${maxIndex})`);
          }

          await stackViewport.setStack(stackOnlyImageIds, clampedCurrentIndex);
          stackViewport.render();
          // console.log('[StackSync] ✅ Viewport setStack completed');

          // Verify what was actually loaded
          const loadedImageIds = stackViewport.getImageIds();
          const loadedIndex = stackViewport.getCurrentImageIdIndex();
          // console.log('[StackSync] Viewport now has:', loadedImageIds?.length, 'imageIds');
          // console.log('[StackSync] Current index:', loadedIndex);
          // console.log('[StackSync] Current imageId:', loadedImageIds?.[loadedIndex]);
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
        // console.log('[StackSync] ✅ StackScrollMouseWheel activated on STACK viewport');
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

    // console.log('[StackSync] ℹ️ MPR volume viewports will NOT be synced to STACK viewport');
    // console.log('[StackSync] ℹ️ They maintain their position via CrosshairsTool');

    // Setup on-demand loading with memory management
    setupMemoryManagedLoading(cornerstoneViewportService);

    // console.log('[StackSync] ✅ Single STACK viewport synced with MPR viewports');
    // console.log('[StackSync] ✅ Decode level 0 active - loading ~10 images at full resolution');
    // console.log('[StackSync] 📦 Memory-managed loading enabled (max 10 images at level 0)');
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

  // console.log(`[StackSync] 📦 Pre-loading center 10 images (current index: ${currentIndex}, total: ${totalImages})`);

  // Pre-load 10 images around current position (5 before, current, 4 after)
  const loadRange = 5;
  loadedLevel0Images.clear(); // Clear previous set
  for (let offset = -loadRange; offset <= loadRange - 1; offset++) {
    const index = currentIndex + offset;
    if (index >= 0 && index < totalImages) {
      const imageId = imageIds[index];
      loadedLevel0Images.add(imageId);
    }
  }

  // console.log(`[StackSync] ✅ Tracking ${loadedLevel0Images.size} images for level 0 loading`);

  // Display actual image dimensions and decode level for verification
  setTimeout(async () => {
    try {
      const currentImageId = imageIds[currentIndex];
      const image = await cornerstoneCore.imageLoader.loadImage(currentImageId);

      if (image) {
        // console.log(`[StackSync] 📊 Image Data Verification:`);
        // console.log(`  └─ Image ID: ${currentImageId}`);
        // console.log(`  └─ Dimensions: ${image.width} × ${image.height} pixels`);
        // console.log(`  └─ Columns: ${image.columns}, Rows: ${image.rows}`);

        // Check decode level from metadata
        const metadata = cornerstoneCore.utilities.imageRetrieveMetadataProvider.get('stack') as RetrieveMetadata | undefined;
        if (metadata?.retrieveOptions?.single) {
          // console.log(`  └─ Decode Level Setting: ${metadata.retrieveOptions.single.decodeLevel}`);
        }

        // Determine resolution level based on dimensions
        // Level 0 (full): Original size (e.g., 3460 × 1686)
        // Level 2 (quarter): 1/4 size (e.g., 865 × 421)
        const level2Width = Math.floor(image.width / 4);
        const level2Height = Math.floor(image.height / 4);

        // console.log(`  └─ If this is Level 0: ${image.width} × ${image.height} pixels (current)`);
        // console.log(`  └─ If this is Level 2: Level 0 would be ${image.width * 4} × ${image.height * 4} pixels`);
        // console.log(`  └─ Level 2 equivalent: ${level2Width} × ${level2Height} pixels`);

        // Detect actual resolution level
        // If dimensions are large (>2000px), it's level 0
        // If dimensions are small (<1000px), it's level 2
        if (image.width >= 2000 || image.height >= 1500) {
          // console.log(`  └─ ✅ FULL RESOLUTION (Level 0) confirmed! Image is ${image.width}×${image.height}`);
        } else if (image.width < 1000 && image.height < 600) {
          // console.log(`  └─ ⚠️ QUARTER RESOLUTION (Level 2) - Image is only ${image.width}×${image.height}`);
        } else {
          // console.log(`  └─ ℹ️ Intermediate resolution: ${image.width}×${image.height}`);
        }
      }
    } catch (error) {
      console.warn('[StackSync] Could not verify image dimensions:', error);
    }
  }, 500);

  // Listen for IMAGE_RENDERED events (fires for all viewport types)
  // This is more reliable than STACK_VIEWPORT_SCROLL which doesn't seem to fire
  let renderCount = 0;
  scrollListener = (evt) => {
    // Wrap entire handler in try-catch to prevent uncaught errors
    try {
      renderCount++;

      // ✅ ALWAYS log event to verify it's firing
      const viewportId = evt.detail?.viewportId || evt.detail?.viewport?.id;
      // console.log(`🔔 [SCROLL-EVENT #${renderCount}] Viewport: ${viewportId}`);

      // Handle events for all three single viewports (STACK and VOLUME)
      // mpr-stack-single (axial STACK), mpr-1 (sagittal VOLUME), mpr-2 (coronal VOLUME)
      // CRITICAL: VOLUME viewports keep their original IDs in 1-port mode!
      const validViewportIds = ['mpr-stack-single', 'mpr-1', 'mpr-2'];
      if (!validViewportIds.includes(viewportId)) {
        // console.log(`⏭️ [SCROLL-EVENT] Skipping viewport: ${viewportId}`);
        return;
      }

      // console.log(`🎯 [IMAGE-RENDERED] Event received for ${viewportId}`);

      // Get the viewport and current index
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        console.warn(`[StackSync] ⚠️ Viewport ${viewportId} not found in scroll listener`);
        return;
      }

      const viewportType = viewport.type;
      // console.log(`[StackSync] 📋 Viewport type: ${viewportType}`);

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
          console.warn(`[StackSync] ⚠️ VOLUME viewport ${viewportId} doesn't support getCurrentImageIdIndex`);
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
        console.warn(`[StackSync] ⚠️ imageIdIndex out of bounds: ${imageIdIndex} (length: ${imageIds.length})`);
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
          viewportType: 'stack'
        };
        lastStackViewportIndex = imageIdIndex;
        lastStackOriginalImageIds = originalImageIds;
        // console.log(`🔄 [SCROLL] Updated STACK position for ${viewportId}: slice ${imageIdIndex}`);
      } else {
        // For VOLUME viewports, save world position
        try {
          const camera = viewport.getCamera();
          if (camera && camera.focalPoint) {
            savedViewportPositions[viewportId] = {
              worldPosition: camera.focalPoint,
              viewportType: viewportType
            };
            // console.log(`🔄 [SCROLL] Updated VOLUME position for ${viewportId}:`, camera.focalPoint);
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
        for (let offset = -2; offset <= 2; offset++) {
          const index = imageIdIndex + offset;
          if (index >= 0 && index < imageIds.length) {
            shouldBeLoaded.add(imageIds[index]);
          }
        }

        // Clear images that are no longer needed (more than 2 slices away)
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

        // Add newly visible images to tracking with LRU eviction
        shouldBeLoaded.forEach(imageId => {
          if (imageId && !loadedLevel0Images.has(imageId)) {
            // Enforce MAX_LEVEL0_IMAGES limit (LRU eviction)
            while (loadedLevel0Images.size >= MAX_LEVEL0_IMAGES) {
              const oldestImageId = Array.from(loadedLevel0Images)[0];
              cornerstoneCore.cache.removeImageLoadObject(oldestImageId);
              loadedLevel0Images.delete(oldestImageId);
              console.log(`🗑️ [Stack-LRU] Evicted: ${oldestImageId.substring(0, 50)}...`);
            }
            loadedLevel0Images.add(imageId);
          }
        });

        if (toRemove.length > 0) {
          // console.log(`[StackSync] 🗑️  Cleared ${toRemove.length} distant images from cache (keeping ${loadedLevel0Images.size} near current position)`);
        }
      }
    } catch (error) {
      // Catch all errors to prevent uncaught runtime errors
      console.error('[StackSync] ❌ Error in scroll listener:', error);
      console.error('[StackSync] ❌ Error stack:', error.stack);
    }
  };

  // Register IMAGE_RENDERED event listener (more reliable than STACK events)
  // console.log('[StackSync] 🎧 Registering IMAGE_RENDERED event listener...');
  // console.log('[StackSync] 🔍 STACK viewport type:', stackViewport.type);

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

  // console.log('[StackSync] ✅ Scroll-based memory management active');
  // console.log('[StackSync] 👂 Listening for IMAGE_RENDERED + STACK_VIEWPORT_SCROLL events');

  // Add global helper to check current image resolution from console
  (window as any).checkStackResolution = async () => {
    const vp = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    if (!vp) {
      // console.log('❌ Stack viewport not found');
      return;
    }
    const imageIds = vp.getImageIds();
    const index = vp.getCurrentImageIdIndex();
    const imageId = imageIds[index];
    const image = await cornerstoneCore.imageLoader.loadImage(imageId);
    const isLevel0 = image.width >= 2000 || image.height >= 1500;
    // console.log(`🔍 Current: Index ${index}/${imageIds.length}, ${image.width}×${image.height}, Level ${isLevel0 ? 0 : 2} ${isLevel0 ? '✅' : '❌'}`);
    return image;
  };
  // console.log('💡 TIP: Type checkStackResolution() in console to check current image resolution');

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
      console.log(`🧹 Manually cleared ${clearedCount} Stack images from cache`);
      return clearedCount;
    } catch (e) {
      console.error('Failed to clear Stack caches:', e);
      return 0;
    }
  };
  // console.log('💡 TIP: Type clearAllStackCaches() in console to manually clear all Stack image caches');

  // =============================================================================
  // Browser Unload Event Handler Registration
  // =============================================================================

  console.log('📍 [USMPR] Checkpoint 3: Setting up beforeunload listener');

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
    console.log('[USMPR UNLOAD] Browser closing - clearing cache...');

    try {
      // Cornerstone cache purge (동기 함수)
      // Dynamic import는 비동기이므로 사용 불가
      // 대신 window.cornerstone 전역 객체 사용
      if ((window as any).cornerstone && (window as any).cornerstone.cache) {
        (window as any).cornerstone.cache.purgeCache();
        console.log('✅ [USMPR UNLOAD] Cornerstone cache purged');
      }

      // HTJ2K cache 정리 (동기 호출 가능한 경우)
      if (typeof clearHTJ2KCache === 'function') {
        clearHTJ2KCache();
        console.log('✅ [USMPR UNLOAD] HTJ2K cache cleared');
      }
    } catch (e) {
      console.warn('⚠️ [USMPR UNLOAD] Failed to clear cache:', e);
    }

    // 참고: return 값이나 event.returnValue는 브라우저 확인 다이얼로그를 표시하므로
    // 사용하지 않음 (사용자 경험 저하)
  };

  // Register beforeunload event listener
  window.addEventListener('beforeunload', handleBeforeUnload);
  console.log('✅ [USMPR] Browser beforeunload listener registered');

  // Store reference for cleanup in onModeExit
  (window as any).usmprBeforeUnloadHandler = handleBeforeUnload;

  // 🔥 [CRITICAL FIX] Add navigation listener to detect leaving study view
  // Since onModeExit doesn't fire when clicking logo/back button to worklist,
  // we need to detect URL changes and trigger cleanup manually
  console.log('📍 [USMPR] Checkpoint 4: About to setup navigation listener');

  try {
    console.log('🔥🔥🔥 [USMPR] Setting up navigation listener for memory cleanup');

    let lastPathname = window.location.pathname;
    const isStudyViewPath = (path) => path.includes('/viewer/') || path.includes('/study/');

    console.log('🔍 [USMPR] Initial pathname:', lastPathname);
    console.log('🔍 [USMPR] Is study view?', isStudyViewPath(lastPathname));

    const handleNavigation = () => {
    const currentPathname = window.location.pathname;

    // Detect leaving study view (viewer route → anything else)
    if (isStudyViewPath(lastPathname) && !isStudyViewPath(currentPathname)) {
      console.log('🔥🔥🔥 [MEMORY CLEANUP] Detected navigation to worklist - triggering cleanup');

      // Trigger cleanup logic (same as onModeExit)
      try {
        const { syncGroupService, segmentationService } = servicesManager.services;

        if (syncGroupService && typeof syncGroupService.destroy === 'function') {
          syncGroupService.destroy();
          console.log('✅ [MEMORY CLEANUP] SyncGroupService destroyed');
        }

        if (segmentationService && typeof segmentationService.destroy === 'function') {
          segmentationService.destroy();
          console.log('✅ [MEMORY CLEANUP] SegmentationService destroyed');
        }

        if (cornerstoneViewportService && typeof cornerstoneViewportService.destroy === 'function') {
          cornerstoneViewportService.destroy();
          console.log('✅ [MEMORY CLEANUP] CornerstoneViewportService destroyed (WebGL freed)');
        }

        // Clear caches
        try {
          clearHTJ2KCache();
          console.log('✅ [MEMORY CLEANUP] HTJ2K cache cleared');
        } catch (e) {
          console.warn('⚠️ [MEMORY CLEANUP] Failed to clear HTJ2K cache:', e);
        }

        import('@cornerstonejs/core').then(({ cache }) => {
          if (cache && typeof cache.purgeCache === 'function') {
            cache.purgeCache();
            console.log('✅ [MEMORY CLEANUP] Cornerstone cache purged');
          }
        }).catch(e => console.warn('⚠️ [MEMORY CLEANUP] Failed to purge cache:', e));

        console.log('🔥🔥🔥 [MEMORY CLEANUP] Cleanup completed - memory should drop');
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

    console.log('✅✅✅ [USMPR] Navigation listener registered! Interval ID:', navigationCheckInterval);
  } catch (error) {
    console.error('❌ [USMPR] Failed to setup navigation listener:', error);
    console.error('❌ [USMPR] Stack trace:', error.stack);
  }

  console.log('✅✅✅ [USMPR] onModeEnter COMPLETED');
}

// Helper function to teardown single STACK viewport synchronization
async function teardownSingleStackViewport(servicesManager, viewportGridService) {
  // console.log('🔥 [TEARDOWN] ===== FUNCTION CALLED =====');

  const { syncGroupService, cornerstoneViewportService } = servicesManager.services;

  try {
    // CRITICAL: Read the current STACK viewport position BEFORE teardown!
    // This is simpler than event listeners which don't seem to fire
    // console.log('🔥 [TEARDOWN] Getting mpr-stack-single viewport...');
    const stackViewport = cornerstoneViewportService.getCornerstoneViewport('mpr-stack-single');
    // console.log('🔥 [TEARDOWN] stackViewport exists?', !!stackViewport);
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
          console.warn(`🔥 [TEARDOWN] ⚠️ Index out of bounds: ${currentIndex} >= ${imageIds.length}`);
          return;
        }

        // Save the position for synchronization when returning to 4-port
        lastStackViewportIndex = currentIndex;
        lastStackOriginalImageIds = imageIds.map(id => {
          // Remove the ?stackView=XXX suffix to get original imageId
          // Handle cases where id might be null/undefined
          if (!id) return null;
          return id.split('?stackView=')[0];
        }).filter(id => id !== null); // Remove any null entries

        // console.log(`🎯 [TEARDOWN] Saved STACK position: slice ${currentIndex} of ${imageIds.length}`);
        // console.log(`🎯 [TEARDOWN] Original imageIds saved: ${lastStackOriginalImageIds?.length}`);
      } catch (error) {
        console.error('🔥 [TEARDOWN] ❌ Error saving viewport position:', error);
      }
    }

    const renderingEngine = cornerstoneViewportService.getRenderingEngine();

    if (!renderingEngine) {
      return;
    }

    // console.log('[StackSync] 🔧 Tearing down STACK viewport synchronization');

    // Keep decode level 0 for stack viewports (always full resolution)
    // console.log('[StackSync] 🔧 Keeping decode level 0 (full resolution)');
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

      // console.log('[StackSync] 🗑️ Clearing STACK-specific imageIds from cache...');

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

      // console.log(`[StackSync] ✅ Cleared ${stackImageIds?.length || 0} STACK images (volumes preserved)`);
    }

    // Remove IMAGE_RENDERED listener for memory management
    if (scrollListener) {
      cornerstoneCore.eventTarget.removeEventListener(
        cornerstoneCore.Enums.Events.IMAGE_RENDERED,
        scrollListener
      );
      scrollListener = null;
      // console.log('[StackSync] ✅ IMAGE_RENDERED listener removed');
    }

    // Clear loaded images tracking
    loadedLevel0Images.clear();
    // console.log('[StackSync] ✅ Cleared level 0 image tracking');

    // NOTE: We don't need to remove MPR viewports from sync group because
    // they were never added to it (they use CrosshairsTool for synchronization)

    // console.log('[StackSync] ✅ STACK viewport teardown complete');
    // console.log('[StackSync] ✅ Decode level 2 restored for future stack viewports');
  } catch (error) {
    console.error('[StackSync] ❌ Failed to teardown STACK viewport sync:', error);
  }
}

// Custom onModeExit for USMPR - cleanup
export function onModeExit({ servicesManager }) {
  console.log('🔥🔥🔥 [USMPR EXIT] onModeExit CALLED - Starting cleanup...');
  const {
    toolGroupService,
    customizationService,
    syncGroupService,
    segmentationService,
    cornerstoneViewportService,
    viewportGridService,
  } = servicesManager.services;

  // Restore auto cine for other modes (default: OT, US)
  // console.log('▶️ [USMPR] Restoring auto cine on mode exit');
  customizationService.setCustomizations({
    autoCineModalities: {
      $set: ['OT', 'US'],  // Restore default auto cine modalities
    },
  });

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
    // console.log('✅ [USMPR] Restored original hanging protocol methods');
  }

  // Reset active protocol IDs to null (all protocols active again)
  hangingProtocolService.setActiveProtocolIds(null);
  // console.log('✅ [USMPR] Reset active protocols on mode exit');

  // Destroy tool groups to prevent "already exists" errors on re-entry
  const toolGroupIds = ['default', 'SRToolGroup', 'mpr', 'volume3d', 'mammography'];
  toolGroupIds.forEach(toolGroupId => {
    const toolGroup = toolGroupService.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroupService.destroyToolGroup(toolGroupId);
      // console.log(`✅ [USMPR] Tool group '${toolGroupId}' destroyed`);
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
      // console.log('✅ [USMPR] STACK viewport disabled');
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to disable STACK viewport:', e);
  }

  // Destroy 3D slice plane managers
  if (slicePlaneSync) {
    slicePlaneSync.destroy();
    slicePlaneSync = null;
    // console.log('✅ [USMPR] SlicePlaneSync destroyed');
  }

  if (slicePlaneManager) {
    slicePlaneManager.destroy();
    slicePlaneManager = null;
    // console.log('✅ [USMPR] SlicePlaneManager destroyed');
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
  console.log('✅ [USMPR EXIT] Cleared viewport position variables');

  // Stop navigation check interval
  const navigationCheckInterval = (window as any).usmprNavigationCheckInterval;
  if (navigationCheckInterval) {
    clearInterval(navigationCheckInterval);
    delete (window as any).usmprNavigationCheckInterval;
    console.log('✅ [USMPR EXIT] Navigation check interval stopped');
  }

  // Clear crosshairs monitor interval
  const crosshairsMonitor = (window as any).usmprCrosshairsMonitor;
  if (crosshairsMonitor) {
    clearInterval(crosshairsMonitor);
    delete (window as any).usmprCrosshairsMonitor;
    // console.log('✅ [USMPR] Crosshairs monitor stopped');
  }

  // Clear HTJ2K background loader cache AND Cornerstone cache to free memory
  // 1. Clear HTJ2K-specific cache
  try {
    const cacheStats = getCacheStats();
    console.log(`[USMPR EXIT] Clearing cache: ${cacheStats.totalEntries} entries, ${(cacheStats.currentSizeBytes / 1024 / 1024).toFixed(2)} MB`);

    clearHTJ2KCache();
    console.log('✅ [USMPR EXIT] HTJ2K cache cleared');
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to clear HTJ2K cache:', e);
  }

  // 2. Clear ImageLoader's cache of undecoded/compressed files
  try {
    if (imageLoadPoolManager) {
      imageLoadPoolManager.clearRequestStack('interaction');
      imageLoadPoolManager.clearRequestStack('thumbnail');
      imageLoadPoolManager.clearRequestStack('prefetch');
      console.log('✅ [USMPR EXIT] ImageLoader request stacks cleared');
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
      console.log('[USMPR EXIT] WorkerManager:', workerManager);
      console.log('[USMPR EXIT] WorkerManager keys:', Object.keys(workerManager));

      // Try to get registered workers
      if (workerManager.workerTypes) {
        console.log('[USMPR EXIT] Registered worker types:', Object.keys(workerManager.workerTypes));
      }

      // Terminate all known worker types (CRITICAL: correct names!)
      const workerTypes = ['histogram-worker', 'dicomImageLoader'];
      let terminatedCount = 0;

      workerTypes.forEach(workerType => {
        try {
          if (typeof workerManager.terminate === 'function') {
            workerManager.terminate(workerType);
            terminatedCount++;
            console.log(`[USMPR EXIT] Terminated worker: ${workerType}`);
          }
        } catch (e) {
          console.debug(`[USMPR EXIT] Worker '${workerType}' not registered`);
        }
      });

      // Try terminateAllWorkers method if available
      if (typeof workerManager.terminateAllWorkers === 'function') {
        workerManager.terminateAllWorkers();
        console.log('✅ [USMPR EXIT] All Web Workers terminated');
      } else {
        console.log(`ℹ️ [USMPR EXIT] Terminated ${terminatedCount} worker types (no terminateAllWorkers method)`);
      }
    }
  } catch (e) {
    console.error('⚠️ [USMPR EXIT] Failed to terminate Web Workers:', e);
  }

  // ✅ [CRITICAL FIX] Destroy services FIRST, BEFORE clearing cache
  // This ensures renderingEngine.destroy() can properly access volumes in cache to free WebGL contexts
  // Previous order was wrong: we were clearing cache first, then destroying rendering engine
  console.log('🔥🔥🔥 [USMPR EXIT] Destroying viewport services (BEFORE cache cleanup)...');

  try {
    if (syncGroupService && typeof syncGroupService.destroy === 'function') {
      syncGroupService.destroy();
      console.log('✅ [USMPR EXIT] SyncGroupService destroyed');
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy SyncGroupService:', e);
  }

  try {
    if (segmentationService && typeof segmentationService.destroy === 'function') {
      segmentationService.destroy();
      console.log('✅ [USMPR EXIT] SegmentationService destroyed');
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy SegmentationService:', e);
  }

  try {
    if (cornerstoneViewportService && typeof cornerstoneViewportService.destroy === 'function') {
      cornerstoneViewportService.destroy();
      console.log('✅ [USMPR EXIT] CornerstoneViewportService destroyed (WebGL contexts freed)');
    }
  } catch (e) {
    console.warn('⚠️ [USMPR EXIT] Failed to destroy CornerstoneViewportService:', e);
  }

  // 2. NOW clear ALL cached volumes and Stack images AFTER destroying services
  // The renderingEngine.destroy() above already freed WebGL contexts
  // Now we just need to remove the volume/image references from cache
  console.log('🔥🔥🔥 [USMPR EXIT] Starting cache cleanup (volumes + Stack images)...');
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
        console.log(`[USMPR EXIT] Found ${volumes.length} volumes to remove`);
        volumes.forEach(volume => {
          try {
            const volumeId = volume.volumeId;

            // Remove from cache (WebGL textures already freed by renderingEngine.destroy())
            cache.removeVolumeLoadObject(volumeId);
            volumesRemoved++;
            console.log(`[USMPR EXIT]   Removed volume from cache: ${volumeId}`);
          } catch (e) {
            console.debug(`[USMPR EXIT] Failed to remove volume:`, e);
          }
        });
        if (volumesRemoved > 0) {
          console.log(`✅ [USMPR EXIT] Removed ${volumesRemoved} volumes from cache`);
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to remove volumes:', e);
      }

      try {
        // 2b. Remove ALL Stack images (especially Level 0 images with ?stackView=)
        // Access private _imageCache to get all imageIds (no public API available)
        const imageCache = (cache as any)._imageCache;
        if (imageCache) {
          const allImageIds = Object.keys(imageCache);
          console.log(`[USMPR EXIT] Found ${allImageIds.length} total images in cache`);

          // Filter for Stack images (contain ?stackView= parameter)
          const stackImageIds = allImageIds.filter(id => id.includes('?stackView='));
          console.log(`[USMPR EXIT] Found ${stackImageIds.length} Stack viewport images to remove`);

          stackImageIds.forEach(imageId => {
            try {
              cache.removeImageLoadObject(imageId);
              stackImagesRemoved++;
            } catch (e) {
              console.debug(`[USMPR EXIT] Failed to remove image:`, e);
            }
          });
          if (stackImagesRemoved > 0) {
            console.log(`✅ [USMPR EXIT] Removed ${stackImagesRemoved} Stack images from cache`);
          }
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to remove Stack images:', e);
      }

      try {
        // 2c. Clear loadedLevel0Images tracking Set
        const prevSize = loadedLevel0Images.size;
        loadedLevel0Images.clear();
        console.log(`✅ [USMPR EXIT] Cleared ${prevSize} images from loadedLevel0Images Set`);
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to clear loadedLevel0Images:', e);
      }

      // 2d. Finally, purge any remaining cache entries
      try {
        if (typeof cache.purgeCache === 'function') {
          cache.purgeCache();
          console.log('✅ [USMPR EXIT] Cornerstone cache purged');
        }
      } catch (e) {
        console.warn('⚠️ [USMPR EXIT] Failed to purge remaining cache:', e);
      }

      console.log(`🧹 [USMPR EXIT] Cache cleanup summary: ${volumesRemoved} volumes, ${stackImagesRemoved} Stack images removed`);
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
    console.log('✅ [USMPR EXIT] Browser beforeunload listener removed');
  }

  // Clean up global reference
  delete (window as any).usmprLayoutConfigManager;

  // Note: DicomMetadataStore doesn't have a clear method - it's designed to persist for the session

  console.log('🔥🔥🔥 [USMPR EXIT] onModeExit COMPLETED - All cleanup done');
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
  // console.log('🔧 [USMPR] onModeInit - Checking HTJ2K DataSource configuration');

  // URL에 DataSource가 명시적으로 지정되지 않은 경우에만 ohif-htj2k 사용
  // URL 형식: /usmpr/ohif-htj2k?... 또는 /usmpr?... (DataSource 미지정)
  const currentPath = window.location.pathname;
  const pathParts = currentPath.split('/').filter(Boolean);

  // URL에서 DataSource가 지정되었는지 확인
  // 예: /usmpr/ohif?... → pathParts = ['usmpr', 'ohif'] → dataSourceInUrl = 'ohif'
  // 예: /usmpr?... → pathParts = ['usmpr'] → dataSourceInUrl = undefined
  const modeRouteName = 'usmpr';
  const modeRouteIndex = pathParts.indexOf(modeRouteName);
  const dataSourceInUrl = modeRouteIndex >= 0 && pathParts.length > modeRouteIndex + 1
    ? pathParts[modeRouteIndex + 1]
    : undefined;

  // HTJ2K 설정 확인
  const htj2kConfig = appConfig?.htj2k;
  const isHTJ2KEnabled = htj2kConfig?.enabled && htj2kConfig?.enabledModes?.includes('usmpr');

  // console.log('📋 [USMPR] onModeInit config:', {
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
    const htj2kDataSource = dataSources.find(ds =>
      ds.sourceName === 'ohif-htj2k' || ds.sourceName === 'dicomweb-htj2k'
    );

    if (htj2kDataSource) {
      // console.log(`✅ [USMPR] Setting active DataSource to ${htj2kDataSource.sourceName} for HTJ2K support`);
      extensionManager.setActiveDataSource(htj2kDataSource.sourceName);
    } else {
      console.warn('⚠️ [USMPR] HTJ2K DataSource not found (ohif-htj2k or dicomweb-htj2k), using default');
    }
  } else if (dataSourceInUrl) {
    // console.log(`ℹ️ [USMPR] DataSource explicitly set in URL: ${dataSourceInUrl}`);
  } else {
    // console.log('ℹ️ [USMPR] HTJ2K not enabled for usmpr mode, using default DataSource');
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
