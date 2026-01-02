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
        const { displaySetService } = servicesManager.services;
        const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

        // Check if we're in USMPR mode
        const currentRoute = window.location.hash;
        const isUSMPRMode = currentRoute.includes('/usmpr/');

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

        // For non-SR displaySets, use the default behavior
        // This triggers the normal viewport display set loading
        commandsManager.run('setViewportDisplaySets', {
          viewportId: servicesManager.services.viewportGridService.getActiveViewportId(),
          displaySetInstanceUIDs: [displaySetInstanceUID],
        });
      };
    },
  ],
};
