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

        // Check if we're in USMPR mode (support both hash and history routing)
        const isUSMPRMode = window.location.href.includes('/usmpr/');

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
          console.log('✅ [DOUBLE CLICK] SR displaySet detected - processing as annotation layer');
          console.log('   DisplaySet:', displaySet.displaySetInstanceUID);

          // Call the load() method to trigger SR handler
          // This will extract measurements and subscribe to DISPLAY_SETS_ADDED events
          console.log('🔄 [DOUBLE CLICK] Calling SR displaySet.load() to process measurements...');

          if (typeof displaySet.load === 'function') {
            try {
              // load() is async, await it
              await displaySet.load();
              console.log('✅ [DOUBLE CLICK] SR displaySet loaded - measurements should now appear');
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
          console.log(`🗑️ [DOUBLE CLICK CLEANUP] Series change detected: ${currentSeriesUID} → ${newSeriesUID}`);
          console.log(`🗑️ [DOUBLE CLICK CLEANUP] Calling cleanupOldSeries BEFORE loading new series...`);

          // Call selective cleanup function (only removes old series data)
          if (typeof (window as any).__usmprCleanupOldSeries === 'function') {
            try {
              await (window as any).__usmprCleanupOldSeries(currentSeriesUID);
              console.log(`✅ [DOUBLE CLICK CLEANUP] Old series cleaned up, ready to load new series`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error(`❌ [DOUBLE CLICK CLEANUP] Cleanup failed: ${errorMsg}`);
            }
          } else {
            console.warn(`⚠️ [DOUBLE CLICK CLEANUP] cleanupOldSeries function not available`);
          }

          // Small delay to allow cleanup to complete
          await new Promise(resolve => setTimeout(resolve, 300));
        } else if (isUSMPRMode) {
          console.log(`ℹ️ [DOUBLE CLICK] No cleanup needed (first series or same series)`);
          console.log(`   Current: ${currentSeriesUID}, New: ${newSeriesUID}`);
        }

        // ℹ️ [DOUBLE CLICK] Cleanup already done above via cleanupOldSeries (selective, series-based)

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
