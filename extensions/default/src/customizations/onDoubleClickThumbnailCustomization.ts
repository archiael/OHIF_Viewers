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
              console.error('❌ [DOUBLE CLICK] Error loading SR displaySet:', error);
            }
          } else {
            console.error('❌ [DOUBLE CLICK] SR displaySet.load() not available!');
          }

          // Return early to prevent default double-click behavior (viewport change)
          return;
        }

        // USMPR: Clear old volumes from cache before loading new series (same as drag-and-drop)
        // activeViewportId already retrieved above

        if (cornerstoneCacheService && cornerstoneViewportService) {
          const cacheSizeBefore = cornerstoneCacheService.getCacheSize();
          console.log(
            `📊 [DOUBLE CLICK CACHE] Before cleanup: size=${(cacheSizeBefore / 1024 / 1024).toFixed(1)}MB`
          );
        }

        // Collect and remove old volumes from active viewport
        if (cornerstoneViewportService) {
          try {
            const cs3dViewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);

            if (cs3dViewport && (cs3dViewport.type === 'volume' || cs3dViewport.type === 'volume3d')) {
              const volumeIds = cs3dViewport
                .getActors()
                ?.map(actor => actor.referencedId)
                ?.filter(id => id && id.includes('cornerstoneStreamingImageVolume'));

              if (volumeIds && volumeIds.length > 0) {
                console.log(
                  `🗑️ [DOUBLE CLICK CACHE] Found volumes to remove from ${activeViewportId}:`,
                  volumeIds
                );

                // Remove old volumes from cache to allow new volume loading
                console.log(`🗑️ [DOUBLE CLICK CACHE] Removing ${volumeIds.length} old volume(s)...`);
                const { cache } = await import('@cornerstonejs/core');

                volumeIds.forEach(volumeId => {
                  try {
                    const volume = cache.getVolume(volumeId);
                    if (volume && volume.imageIds) {
                      console.log(
                        `🗑️ [DOUBLE CLICK CACHE] Volume has ${volume.imageIds.length} imageIds`
                      );
                      if (volume.imageIds.length >= 111) {
                        console.log(
                          `🗑️ [DOUBLE CLICK CACHE] Frame 111 (index 110) in old volume: ${volume.imageIds[110]}`
                        );
                      }
                    }

                    // Remove the volume - this should clean up imageIds
                    cache.removeVolumeLoadObject(volumeId);
                    console.log(`✅ [DOUBLE CLICK CACHE] Removed volume: ${volumeId}`);
                  } catch (error) {
                    console.warn(
                      `⚠️ [DOUBLE CLICK CACHE] Could not remove volume ${volumeId}:`,
                      error
                    );
                  }
                });
              }

              // USMPR-specific: Purge cache only in USMPR mode to fix frame 111 issue
              // IMPORTANT: Always call this in USMPR mode, even if no volumes were removed
              if (isUSMPRMode) {
                console.log(`🗑️ [DOUBLE CLICK CACHE] USMPR mode detected - calling cache.purgeCache() to clear stale images...`);
                try {
                  const { cache } = await import('@cornerstonejs/core');
                  cache.purgeCache();
                  console.log(`✅ [DOUBLE CLICK CACHE] Cache purged successfully`);
                } catch (purgeError) {
                  console.warn(`⚠️ [DOUBLE CLICK CACHE] Could not purge cache:`, purgeError);
                }
              } else {
                console.log(`✅ [DOUBLE CLICK CACHE] Non-USMPR mode - skipping cache.purgeCache()`);
              }

              if (cornerstoneCacheService) {
                const cacheSizeAfterCleanup = cornerstoneCacheService.getCacheSize();
                console.log(
                  `📊 [DOUBLE CLICK CACHE] After cleanup: size=${(cacheSizeAfterCleanup / 1024 / 1024).toFixed(1)}MB`
                );
              }
            }
          } catch (error) {
            console.error('❌ [DOUBLE CLICK CACHE] Error during cache cleanup:', error);
          }
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
