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

        // Get displaySet for SR handling
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

        // 🚫 Special handling for SR displaySets
        // SR measurements should be added as annotation layers, not change viewports
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

            // Remove old volumes from cache to allow new volume loading
            if (volumeIdsToRemove.size > 0) {
              console.log(`🗑️ [DRAG DROP CACHE] Removing ${volumeIdsToRemove.size} old volume(s)...`);
              const { cache } = await import('@cornerstonejs/core');

              volumeIdsToRemove.forEach(volumeId => {
                try {
                  const volume = cache.getVolume(volumeId);
                  if (volume && volume.imageIds) {
                    console.log(`🗑️ [DRAG DROP CACHE] Volume has ${volume.imageIds.length} imageIds`);
                    if (volume.imageIds.length >= 111) {
                      console.log(`🗑️ [DRAG DROP CACHE] Frame 111 (index 110) in old volume: ${volume.imageIds[110]}`);
                    }
                  }

                  // Remove the volume - this should clean up imageIds
                  cache.removeVolumeLoadObject(volumeId);
                  console.log(`✅ [DRAG DROP CACHE] Removed volume: ${volumeId}`);
                } catch (error) {
                  console.warn(`⚠️ [DRAG DROP CACHE] Could not remove volume ${volumeId}:`, error);
                }
              });
            }

            // USMPR-specific: Purge cache only in USMPR mode to fix frame 111 issue
            // IMPORTANT: Always call this in USMPR mode, even if no volumes were removed
            const isUSMPRMode = window.location.href.includes('/usmpr/');

            if (isUSMPRMode) {
              console.log(`🗑️ [DRAG DROP CACHE] USMPR mode detected - calling cache.purgeCache() to clear stale images...`);
              try {
                const { cache } = await import('@cornerstonejs/core');
                cache.purgeCache();
                console.log(`✅ [DRAG DROP CACHE] Cache purged successfully`);
              } catch (purgeError) {
                console.warn(`⚠️ [DRAG DROP CACHE] Could not purge cache:`, purgeError);
              }
            } else {
              console.log(`✅ [DRAG DROP CACHE] Non-USMPR mode - skipping cache.purgeCache()`);
            }

            if (cornerstoneCacheService) {
              const cacheSizeAfterCleanup = cornerstoneCacheService.getCacheSize();
              console.log(`📊 [DRAG DROP CACHE] After cleanup: size=${(cacheSizeAfterCleanup / 1024 / 1024).toFixed(1)}MB`);
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
