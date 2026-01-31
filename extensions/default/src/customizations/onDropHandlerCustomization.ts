export default {
  customOnDropHandler: ({ servicesManager, commandsManager, viewportId, displaySetInstanceUID }) => {
    console.log('🎯 [DRAG DROP] Custom handler called');
    console.log('🎯 [DRAG DROP] viewportId:', viewportId);
    console.log('🎯 [DRAG DROP] displaySetInstanceUID:', displaySetInstanceUID);

    // Return Promise directly (no extra function layer)
    return (async () => {
      // 🚫 USMPR: Block drag and drop on stack viewport
      const isUSMPRMode = window.location.href.includes('/usmpr/');
      const isStackViewport = viewportId === 'mpr-stack-single';

      if (isUSMPRMode && isStackViewport) {
        console.warn('⚠️ [DRAG DROP] Stack viewport drag and drop is disabled in USMPR mode');
        return { handled: true }; // Mark as handled but do nothing
      }

      const { hangingProtocolService, cornerstoneCacheService, cornerstoneViewportService, displaySetService } = servicesManager.services;

      try {
        // Get viewport updates (same as double-click)
        let updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
          viewportId,
          displaySetInstanceUID,
          true // isHangingProtocolLayout - USMPR is a hanging protocol layout
        );

        // USMPR 수정: getViewportsRequireUpdate가 이전 시리즈 UID를 반환하는 버그 수정
        // Hanging Protocol 매칭이 잘못된 UID를 반환하면, 직접 새 UID로 교체
        if (updatedViewports && updatedViewports.length > 0) {
          const returnedUID = updatedViewports[0]?.displaySetInstanceUIDs?.[0];
          if (returnedUID && returnedUID !== displaySetInstanceUID) {
            console.warn(`⚠️ [DRAG DROP] UID mismatch detected!`);
            console.warn(`   Expected: ${displaySetInstanceUID}`);
            console.warn(`   Got: ${returnedUID}`);
            console.log(`🔧 [DRAG DROP] Forcing correct displaySetInstanceUID for all viewports`);

            // 모든 viewport의 displaySetInstanceUIDs를 새 UID로 교체
            updatedViewports = updatedViewports.map(vp => ({
              ...vp,
              displaySetInstanceUIDs: [displaySetInstanceUID],
            }));
          }
        }

        console.log('🎯 [DRAG DROP] updatedViewports:', updatedViewports);

        // Get displaySet for SR handling and series change detection
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

        // 🔥 [SERIES-CLEANUP] Detect series change and cleanup BEFORE loading
        // This matches commit 309ec16a0 architecture: cleanup is preventive, not reactive
        const newSeriesUID = displaySet?.SeriesInstanceUID;
        const currentSeriesUID = (window as any).__usmprCurrentSeriesUID;

        // 🔍 DEBUG: Log series UIDs for debugging
        console.log(`🔍 [DRAG DROP DEBUG] newSeriesUID: ${newSeriesUID?.slice(0, 30)}...`);
        console.log(`🔍 [DRAG DROP DEBUG] currentSeriesUID: ${currentSeriesUID?.slice(0, 30)}...`);
        console.log(`🔍 [DRAG DROP DEBUG] Are they different? ${newSeriesUID !== currentSeriesUID}`);
        console.log(`🔍 [DRAG DROP DEBUG] cleanupOldSeries available? ${typeof (window as any).__usmprCleanupOldSeries === 'function'}`);

        if (isUSMPRMode && newSeriesUID && currentSeriesUID && newSeriesUID !== currentSeriesUID) {
          console.log(`🗑️ [DRAG DROP CLEANUP] Series change detected: ${currentSeriesUID} → ${newSeriesUID}`);
          console.log(`🗑️ [DRAG DROP CLEANUP] Calling cleanupOldSeries BEFORE loading new series...`);

          // Call selective cleanup function (only removes old series data)
          if (typeof (window as any).__usmprCleanupOldSeries === 'function') {
            try {
              await (window as any).__usmprCleanupOldSeries(currentSeriesUID);
              console.log(`✅ [DRAG DROP CLEANUP] Old series cleaned up, ready to load new series`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error(`❌ [DRAG DROP CLEANUP] Cleanup failed: ${errorMsg}`);
            }
          } else {
            console.warn(`⚠️ [DRAG DROP CLEANUP] cleanupOldSeries function not available`);
          }

          // Small delay to allow cache cleanup to complete (workers terminated, will restart on load)
          await new Promise(resolve => setTimeout(resolve, 100));

          // 🔥 CRITICAL: Update currentSeriesUID to new series AFTER cleanup
          // This ensures next series change will cleanup THIS series correctly
          (window as any).__usmprCurrentSeriesUID = newSeriesUID;
          console.log(`✅ [DRAG DROP CLEANUP] Updated currentSeriesUID to new series`);
        } else if (isUSMPRMode) {
          // First series or same series - no cleanup needed
          if (!currentSeriesUID && newSeriesUID) {
            console.log(`ℹ️ [DRAG DROP] First series load - initializing currentSeriesUID`);
            console.log(`   Setting currentSeriesUID: ${newSeriesUID?.slice(0, 30)}...`);
            // 🔥 CRITICAL FIX: Set currentSeriesUID for the first series
            // Without this, the NEXT drag & drop will also think it's the first series!
            (window as any).__usmprCurrentSeriesUID = newSeriesUID;
          } else {
            console.log(`ℹ️ [DRAG DROP] No cleanup needed (same series)`);
            console.log(`   Current: ${currentSeriesUID}, New: ${newSeriesUID}`);
          }
        }

        // 🚫 Special handling for SR displaySets
        // SR measurements should be added as annotation layers, not change viewports
        if (displaySet?.Modality === 'SR' || displaySet?.SOPClassHandlerId?.includes('SR')) {
          console.log('✅ [DRAG DROP] SR displaySet detected - processing as annotation layer');
          console.log('   DisplaySet:', displaySet.displaySetInstanceUID);

          // Call the load() method to trigger SR handler
          // This will extract measurements and subscribe to DISPLAY_SETS_ADDED events
          console.log('🔄 [DRAG DROP] Calling SR displaySet.load() to process measurements...');

          if (typeof displaySet.load === 'function') {
            try {
              // load() is async, await it
              await displaySet.load();
              console.log('✅ [DRAG DROP] SR displaySet loaded - measurements should now appear');
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error('❌ [DRAG DROP] Error loading SR displaySet:', errorMsg);
              if (error instanceof Error && error.stack) {
                console.error('   Stack:', error.stack);
              }
            }
          } else {
            console.error('❌ [DRAG DROP] SR displaySet.load() not available!');
          }

          return { handled: true };
        }

        if (!updatedViewports || updatedViewports.length === 0) {
          console.warn('⚠️ [DRAG DROP] No viewports to update');
          return { handled: false };
        }

        // ℹ️ [DRAG DROP] Cleanup already done above via cleanupOldSeries (selective, series-based)
        // No need for viewport-based volume removal - cleanupOldSeries handles it better

        // Load new series
        console.log('🎯 [DRAG DROP] Calling setDisplaySetsForViewports');
        commandsManager.run('setDisplaySetsForViewports', {
          viewportsToUpdate: updatedViewports,
        });

        // Log cache stats after loading
        setTimeout(() => {
          if (cornerstoneCacheService) {
            const cacheSizeAfter = cornerstoneCacheService.getCacheSize();
            console.log(`📊 [DRAG DROP CACHE] After series load: size=${(cacheSizeAfter / 1024 / 1024).toFixed(1)}MB`);
          }
        }, 2000);

        // USMPR: Reapply custom US preset after loading
        setTimeout(() => {
          if ((window as any).applyCustomUSPreset) {
            console.log('🔄 [DRAG DROP] Reapplying custom US preset after series load');
            const layoutConfig = JSON.parse(localStorage.getItem('usmpr-layout-config') || '{}');
            const presetName = layoutConfig.preset3D || 'US 3D 1';
            (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
          }
        }, 50);

        // USMPR: Re-initialize slice planes after new series loads
        setTimeout(() => {
          console.log('🔄 [DRAG DROP] Re-initializing slice planes after series load');
          if ((window as any).reinitializeSlicePlanes) {
            (window as any).reinitializeSlicePlanes();
          }
        }, 1000);

      return { handled: true };
    } catch (error) {
      // Safely handle error object
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';

      console.error('❌ [DRAG DROP] Error handling drop:', errorMsg);
      if (errorStack) {
        console.error('Stack trace:', errorStack);
      }

      return { handled: false };
    }
    })(); // Immediately invoke the async function to return a Promise
  },
};
