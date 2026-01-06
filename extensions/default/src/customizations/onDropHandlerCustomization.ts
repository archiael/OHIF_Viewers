export default {
  customOnDropHandler: ({ servicesManager, commandsManager, viewportId, displaySetInstanceUID }) => {
    console.log('🎯 [DRAG DROP] Custom handler called');
    console.log('🎯 [DRAG DROP] viewportId:', viewportId);
    console.log('🎯 [DRAG DROP] displaySetInstanceUID:', displaySetInstanceUID);

    // Return Promise directly (no extra function layer)
    return (async () => {
      const { hangingProtocolService, cornerstoneCacheService, cornerstoneViewportService, displaySetService } = servicesManager.services;

      try {
        // Get viewport updates (same as double-click)
        let updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
          viewportId,
          displaySetInstanceUID,
          true // isHangingProtocolLayout - USMPR is a hanging protocol layout
        );

        console.log('🎯 [DRAG DROP] updatedViewports:', updatedViewports);

        // 🚫 Special handling for SR displaySets
        // SR measurements should be added as annotation layers, not change viewports
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
        if (displaySet?.Modality === 'SR' || displaySet?.SOPClassHandlerId?.includes('SR')) {
          console.log('✅ [DRAG DROP] SR displaySet detected - processing as annotation layer');
          console.log('   DisplaySet:', displaySet.displaySetInstanceUID);

          // Call the load() method to trigger SR handler
          // This will extract measurements and subscribe to DISPLAY_SETS_ADDED events
          console.log('🔄 [DRAG DROP] Calling SR displaySet.load() to process measurements...');

          if (typeof displaySet.load === 'function') {
            // load() is async, await it
            await displaySet.load();
            console.log('✅ [DRAG DROP] SR displaySet loaded - measurements should now appear');
          } else {
            console.error('❌ [DRAG DROP] SR displaySet.load() not available!');
          }

          return { handled: true };
        }

        if (!updatedViewports || updatedViewports.length === 0) {
          console.warn('⚠️ [DRAG DROP] No viewports to update');
          return { handled: false };
        }

        // USMPR: Clear old volumes from cache before loading new series
        if (cornerstoneCacheService) {
          const cacheSizeBefore = cornerstoneCacheService.getCacheSize();
          console.log(`📊 [DRAG DROP CACHE] Before cleanup: size=${(cacheSizeBefore / 1024 / 1024).toFixed(1)}MB`);
        }

        // Collect and remove old volumes
        if (cornerstoneViewportService) {
          try {
            const volumeIdsToRemove = new Set();

            for (const viewportUpdate of updatedViewports) {
              const cs3dViewport = cornerstoneViewportService.getCornerstoneViewport(viewportUpdate.viewportId);

              if (cs3dViewport && (cs3dViewport.type === 'volume' || cs3dViewport.type === 'volume3d')) {
                const volumeIds = cs3dViewport.getActors()
                  ?.map(actor => actor.referencedId)
                  ?.filter(id => id && id.includes('cornerstoneStreamingImageVolume'));

                if (volumeIds && volumeIds.length > 0) {
                  volumeIds.forEach(id => volumeIdsToRemove.add(id));
                  console.log(`🗑️ [DRAG DROP CACHE] Found volumes to remove from ${viewportUpdate.viewportId}:`, volumeIds);
                }
              }
            }

            // 🚫 [DISABLED] Volume 캐시 제거 로직 비활성화
            // ⚠️ 시리즈 전환 시 Volume을 제거하면 새 Volume 로딩에 실패하는 문제 발생
            // Cornerstone의 자동 캐시 관리에 의존 (maxCacheSize 설정으로 LRU 방식 적용)
            if (volumeIdsToRemove.size > 0) {
              console.log(`ℹ️ [DRAG DROP CACHE] Found ${volumeIdsToRemove.size} old volume(s) - NOT removing (relying on auto cache management)`);
              volumeIdsToRemove.forEach(volumeId => {
                console.log(`ℹ️ [DRAG DROP CACHE] Keeping volume: ${volumeId.substring(0, 60)}...`);
              });

              if (cornerstoneCacheService) {
                const cacheSizeAfterCleanup = cornerstoneCacheService.getCacheSize();
                console.log(`📊 [DRAG DROP CACHE] Current cache: size=${(cacheSizeAfterCleanup / 1024 / 1024).toFixed(1)}MB`);
              }
            }
          } catch (error) {
            console.error('❌ [DRAG DROP CACHE] Error during cache cleanup:', error);
          }
        }

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
      console.error('❌ [DRAG DROP] Error handling drop:', error);
      return { handled: false };
    }
    })(); // Immediately invoke the async function to return a Promise
  },
};
