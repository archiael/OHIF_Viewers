export default {
  customOnDropHandler: ({ servicesManager, commandsManager, viewportId, displaySetInstanceUID }) => {
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

            // 모든 viewport의 displaySetInstanceUIDs를 새 UID로 교체
            updatedViewports = updatedViewports.map(vp => ({
              ...vp,
              displaySetInstanceUIDs: [displaySetInstanceUID],
            }));
          }
        }

        // Get displaySet for SR handling and series change detection
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

        // 🔥 [SERIES-CLEANUP] Detect series change and cleanup BEFORE loading
        // This matches commit 309ec16a0 architecture: cleanup is preventive, not reactive
        const newSeriesUID = displaySet?.SeriesInstanceUID;
        const currentSeriesUID = (window as any).__usmprCurrentSeriesUID;

        if (isUSMPRMode && newSeriesUID && currentSeriesUID && newSeriesUID !== currentSeriesUID) {
          try {
            const cleanupFn = (window as any).__usmprCleanupOldSeries;
            if (typeof cleanupFn === 'function') {
              await cleanupFn(currentSeriesUID);
            } else if (typeof (window as any).usmprSafePurgeCache === 'function') {
              (window as any).usmprSafePurgeCache();
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : '';
            console.error(`❌ [DRAG DROP CLEANUP] Cleanup failed: ${errorMsg}`);
            if (errorStack) {
              console.error(`   Stack trace:`, errorStack);
            }
          }

          // Small delay to allow cleanup to complete
          await new Promise(resolve => setTimeout(resolve, 100));

          // 🔥 CRITICAL: Update currentSeriesUID to new series AFTER cleanup
          // This ensures next series change will cleanup THIS series correctly
          (window as any).__usmprCurrentSeriesUID = newSeriesUID;
        } else if (isUSMPRMode) {
          // First series or same series - no cleanup needed
          if (!currentSeriesUID && newSeriesUID) {
            // 🔥 CRITICAL FIX: Set currentSeriesUID for the first series
            // Without this, the NEXT drag & drop will also think it's the first series!
            (window as any).__usmprCurrentSeriesUID = newSeriesUID;
          }
        }

        // 🚫 Special handling for SR displaySets
        // SR measurements should be added as annotation layers, not change viewports
        if (displaySet?.Modality === 'SR' || displaySet?.SOPClassHandlerId?.includes('SR')) {
          // Call the load() method to trigger SR handler
          // This will extract measurements and subscribe to DISPLAY_SETS_ADDED events
          if (typeof displaySet.load === 'function') {
            try {
              // load() is async, await it
              await displaySet.load();
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
            const layoutConfig = JSON.parse(localStorage.getItem('usmpr-layout-config') || '{}');
            const presetName = layoutConfig.preset3D || 'US 3D 1';
            (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
          }
        }, 50);

        // USMPR: Re-initialize slice planes after new series loads
        setTimeout(() => {
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
