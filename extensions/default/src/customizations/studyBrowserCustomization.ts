import { utils } from '@ohif/core';
import i18n from '@ohif/i18n';
const { formatDate } = utils;

export default {
  'studyBrowser.studyMenuItems': [],
  'studyBrowser.thumbnailMenuItems': [
    {
      id: 'tagBrowser',
      label: i18n.t('StudyBrowser:Tag Browser'),
      iconName: 'DicomTagBrowser',
      commands: 'openDICOMTagViewer',
    },
    {
      id: 'addAsLayer',
      label: i18n.t('StudyBrowser:Add as Layer'),
      iconName: 'ViewportViews',
      commands: 'addDisplaySetAsLayer',
    },
  ],
  'studyBrowser.sortFunctions': [
    {
      label: i18n.t('StudyBrowser:Series Number'),
      sortFunction: (a, b) => {
        return a?.SeriesNumber - b?.SeriesNumber;
      },
    },
    {
      label: i18n.t('StudyBrowser:Series Date'),
      sortFunction: (a, b) => {
        const dateA = new Date(formatDate(a?.SeriesDate));
        const dateB = new Date(formatDate(b?.SeriesDate));
        return dateB.getTime() - dateA.getTime();
      },
    },
  ],
  'studyBrowser.viewPresets': [
    {
      id: 'list',
      iconName: 'ListView',
      selected: false,
    },
    {
      id: 'thumbnails',
      iconName: 'ThumbnailView',
      selected: true,
    },
  ],
  'studyBrowser.studyMode': 'all',
  'studyBrowser.thumbnailDoubleClickCallback': {
    callbacks: [
      ({ activeViewportId, servicesManager, commandsManager, isHangingProtocolLayout }) =>
        async displaySetInstanceUID => {
          console.log('🖱️ [DOUBLE CLICK] Thumbnail double-clicked!');
          console.log('🖱️ [DOUBLE CLICK] displaySetInstanceUID:', displaySetInstanceUID);
          console.log('🖱️ [DOUBLE CLICK] activeViewportId:', activeViewportId);
          console.log('🖱️ [DOUBLE CLICK] isHangingProtocolLayout:', isHangingProtocolLayout);

          const { hangingProtocolService, uiNotificationService } = servicesManager.services;
          let updatedViewports = [];
          const viewportId = activeViewportId;

          try {
            updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
              viewportId,
              displaySetInstanceUID,
              isHangingProtocolLayout
            );
            console.log('🖱️ [DOUBLE CLICK] updatedViewports:', updatedViewports);
            if (updatedViewports && updatedViewports.length > 0) {
              console.log('🖱️ [DOUBLE CLICK] updatedViewports[0] details:');
              console.log('  - viewportId:', updatedViewports[0]?.viewportId);
              console.log('  - displaySetInstanceUIDs:', updatedViewports[0]?.displaySetInstanceUIDs);
              console.log('  - viewportOptions:', updatedViewports[0]?.viewportOptions);
              console.log('  - displaySetOptions:', updatedViewports[0]?.displaySetOptions);
              try {
                console.log('🖱️ [DOUBLE CLICK] Full viewport config:', JSON.stringify(updatedViewports[0], null, 2));
              } catch (e) {
                console.log('🖱️ [DOUBLE CLICK] Could not stringify viewport config:', e);
              }
            }
          } catch (error) {
            console.error('❌ [DOUBLE CLICK] Error getting viewports to update:', error);
            uiNotificationService.show({
              title: i18n.t('StudyBrowser:Thumbnail Double Click'),
              message: i18n.t(
                'StudyBrowser:The selected display sets could not be added to the viewport.'
              ),
              type: 'error',
              duration: 3000,
            });
          }

          console.log('🖱️ [DOUBLE CLICK] Calling setDisplaySetsForViewports with:', updatedViewports);
          commandsManager.run('setDisplaySetsForViewports', {
            viewportsToUpdate: updatedViewports,
          });

          // USMPR: Reapply custom US preset and re-initialize slice planes after loading new series
          setTimeout(() => {
            if ((window as any).applyCustomUSPreset) {
              console.log('🔄 [DOUBLE CLICK] Reapplying custom US preset after series load');
              const { cornerstoneViewportService } = servicesManager.services;
              const layoutConfig = JSON.parse(localStorage.getItem('usmpr-layout-config') || '{}');
              const presetName = layoutConfig.preset3D || 'US 3D 1';
              (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
            }
          }, 50);

          // USMPR: Re-initialize slice planes after new series loads
          // The slice planes are lost when the 3D viewport gets new volume actors
          setTimeout(() => {
            console.log('🔄 [DOUBLE CLICK] Re-initializing slice planes after series load');
            if ((window as any).reinitializeSlicePlanes) {
              (window as any).reinitializeSlicePlanes();
            }
          }, 1000); // Wait for 3D volume to be ready before re-initializing slice planes
        },
    ],
  },
};
