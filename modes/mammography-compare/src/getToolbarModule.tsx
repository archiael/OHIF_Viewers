/**
 * Mammography toolbar module - provides custom evaluators for button states
 */

export default function getToolbarModule({ commandsManager }) {
  return [
    {
      name: 'evaluate.mammography.magnify',
      evaluate: ({ viewportId }) => {
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
      evaluate: ({ viewportId }) => {
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
      evaluate: ({ viewportId }) => {
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
}
