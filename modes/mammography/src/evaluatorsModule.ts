/**
 * Mammography-specific evaluators for toolbar buttons
 * These evaluators check command states and return button appearance/behavior
 */

const evaluatorsModule = ({ commandsManager }) => {
  return [
    {
      name: 'evaluate.mammography.magnify',
      evaluate: ({ viewportId, button }) => {
        try {
          const isMagnified = commandsManager.runCommand('isMammoMagnified', {}, 'MAMMOGRAPHY');
          return {
            disabled: false,
            className: isMagnified ? 'active' : '',
            isActive: isMagnified,
          };
        } catch (error) {
          return {
            disabled: false,
            className: '',
            isActive: false,
          };
        }
      },
    },
    {
      name: 'evaluate.mammography.sync',
      evaluate: ({ viewportId, button }) => {
        try {
          const isSyncEnabled = commandsManager.runCommand('isMammoSyncEnabled', {}, 'MAMMOGRAPHY');
          return {
            disabled: false,
            className: isSyncEnabled ? 'active' : '',
            isActive: isSyncEnabled,
          };
        } catch (error) {
          return {
            disabled: false,
            className: '',
            isActive: false,
          };
        }
      },
    },
    {
      name: 'evaluate.mammography.compare',
      evaluate: ({ viewportId, button }) => {
        try {
          const isCompareActive = commandsManager.runCommand('isMammoCompareActive', {}, 'MAMMOGRAPHY');
          return {
            disabled: false,
            className: isCompareActive ? 'active' : '',
            isActive: isCompareActive,
          };
        } catch (error) {
          return {
            disabled: false,
            className: '',
            isActive: false,
          };
        }
      },
    },
  ];
};

export default evaluatorsModule;
