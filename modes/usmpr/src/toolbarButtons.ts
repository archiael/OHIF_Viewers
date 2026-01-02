// USMPR-specific toolbar buttons only
// Basic measurement tools (Length, Bidirectional, etc.) come from basicToolbarButtons
const toolbarButtons = [
  {
    id: 'LayoutConfig',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-layout',
      label: 'Layout Config',
      tooltip: 'Configure Viewport Layout',
      commands: {
        commandName: 'openLayoutConfigModal',
        context: 'USMPR',
      },
    },
  },
  {
    id: 'ToggleAnnotations',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-annotate',
      label: 'Toggle',
      tooltip: 'Show/Hide All Measurements',
      commands: {
        commandName: 'toggleAllAnnotationsVisibility',
        context: 'CORNERSTONE',
      },
    },
  },
];

export default toolbarButtons;
