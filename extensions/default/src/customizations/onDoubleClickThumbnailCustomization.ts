import { isCurrentMode } from '../utils/getModeFromUrl';

/**
 * Custom double-click handler for thumbnails in the study browser.
 * Provides special handling for SR (Structured Report) displaySets in USMPR mode
 * to prevent viewport layout changes while still loading measurements as annotation layers.
 */
export default {
  id: 'studyBrowser.thumbnailDoubleClickCallback',
  callbacks: [
    ({ servicesManager, commandsManager }) => {
      return async (displaySetInstanceUID: string) => {
        const { displaySetService, cornerstoneCacheService, cornerstoneViewportService, viewportGridService } =
          servicesManager.services;
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

        // Check if we're in USMPR mode (handles routerBasename correctly)
        const isUSMPRMode = isCurrentMode('usmpr');

        // Get active viewport to check if it's the stack viewport
        const activeViewportId = viewportGridService.getActiveViewportId();
        const isStackViewport = activeViewportId === 'mpr-stack-single';

        // 🚫 USMPR: Block double-click on stack viewport for non-SR displaySets
        if (isUSMPRMode && isStackViewport && displaySet?.Modality !== 'SR' && !displaySet?.SOPClassHandlerId?.includes('SR')) {
          console.warn('⚠️ [DOUBLE CLICK] Stack viewport series loading is disabled in USMPR mode');
          return; // Early return to prevent loading
        }

        // 🚫 Special handling for SR displaySets IN USMPR MODE ONLY
        // SR measurements should be added as annotation layers, not change viewports
        if (isUSMPRMode && (displaySet?.Modality === 'SR' || displaySet?.SOPClassHandlerId?.includes('SR'))) {
          // Call the load() method to trigger SR handler
          // This will extract measurements and subscribe to DISPLAY_SETS_ADDED events
          if (typeof displaySet.load === 'function') {
            try {
              // load() is async, await it
              await displaySet.load();
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error('❌ [DOUBLE CLICK] Error loading SR displaySet:', errorMsg);
            }
          } else {
            console.error('❌ [DOUBLE CLICK] SR displaySet.load() not available!');
          }

          // Return early to prevent default double-click behavior (viewport change)
          return;
        }

        // 🔥 [SERIES-CLEANUP] Detect series change and cleanup BEFORE loading
        // This matches commit 309ec16a0 architecture: cleanup is preventive, not reactive
        const newSeriesUID = displaySet?.SeriesInstanceUID;
        const currentSeriesUID = (window as any).__usmprCurrentSeriesUID;

        if (isUSMPRMode && newSeriesUID && currentSeriesUID && newSeriesUID !== currentSeriesUID) {
          try {
            // Import cache directly in this scope (same as commit 58a7437)
            const { cache } = await import('@cornerstonejs/core');

            // CRITICAL FIX from commit 58a7437: Global cache purge to clear ALL stale data
            // This clears GPU textures and all internal cache references
            cache.purgeCache();

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ [DOUBLE CLICK CLEANUP] Cleanup failed: ${errorMsg}`);
          }

          // Small delay to allow cache cleanup to complete
          await new Promise(resolve => setTimeout(resolve, 100));

          // 🔥 CRITICAL: Update currentSeriesUID to new series AFTER cleanup
          // This ensures next series change will cleanup THIS series correctly
          (window as any).__usmprCurrentSeriesUID = newSeriesUID;
        }

        // For non-SR displaySets, use the default behavior
        // This triggers the normal viewport display set loading
        commandsManager.run('setDisplaySetsForViewports', {
          viewportsToUpdate: [
            {
              viewportId: activeViewportId,
              displaySetInstanceUIDs: [displaySetInstanceUID],
            },
          ],
        });
      };
    },
  ],
};
