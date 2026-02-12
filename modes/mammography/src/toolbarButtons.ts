/**
 * Mammography Mode Toolbar Buttons
 *
 * FR-2.5.5: Mirror Mode Toggle Button
 * - Initial state: ON (chest wall to edge)
 * - Toggle: ON ↔ OFF
 */

const toolbarButtons = [
  {
    id: 'MirrorMode',
    uiType: 'ohif.radioGroup',
    props: {
      type: 'tool',
      icon: 'tool-layout',
      label: 'Mirror Mode',
      commands: [
        {
          commandName: 'toggleMirrorMode',
          commandOptions: {},
          context: 'CORNERSTONE',
        },
      ],
      evaluate: {
        name: 'isMirrorModeActive',
        disabledText: 'Mirror Mode unavailable',
      },
    },
  },
  {
    id: 'OpenMammoCompare',
    uiType: 'ohif.splitButton',
    props: {
      groupId: 'MammoWorkflow',
      primary: {
        id: 'OpenMammoCompare',
        label: 'Compare Mode',
        icon: 'tab-compare',
        tooltip: 'Open Mammography Compare Mode',
        commands: [
          {
            commandName: 'openMammoCompare',
            commandOptions: {},
          },
        ],
        evaluate: 'action',
      },
    },
  },
];

export default toolbarButtons;
