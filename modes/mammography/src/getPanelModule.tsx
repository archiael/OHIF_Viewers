import React from 'react';
import StudyListPanel from './panels/StudyListPanel';

/**
 * Panel Module for Mammography Mode
 * Provides custom study list panel with compare functionality
 */
function getPanelModule({ servicesManager, commandsManager, extensionManager }) {
  return [
    {
      name: 'studyListCompare',
      iconName: 'tab-studies',
      iconLabel: 'Studies',
      label: 'Studies',
      component: props => (
        <StudyListPanel
          {...props}
          servicesManager={servicesManager}
          commandsManager={commandsManager}
          extensionManager={extensionManager}
        />
      ),
    },
  ];
}

export default getPanelModule;
