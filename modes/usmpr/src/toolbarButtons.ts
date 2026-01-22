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
  {
    id: 'OpenReport',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'pencil',
      label: 'SR',
      tooltip: 'Edit SR Report',
      size: 'tiny',
      className: '!w-[28px] !h-[28px] [&_svg]:!w-[20px] [&_svg]:!h-[20px] !mt-2',
      commands: {
        commandName: 'openSRReportPage',
        context: 'USMPR',
      },
    },
  },
  {
    id: 'OpenPDFReport',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'clipboard',
      label: 'PDF Report',
      tooltip: 'View PDF Report',
      size: 'tiny',
      className: '!w-[28px] !h-[28px] [&_svg]:!w-[20px] [&_svg]:!h-[20px] !mt-2',
      commands: {
        commandName: 'openPDFReportPage',
        context: 'USMPR',
      },
    },
  },
];

export default toolbarButtons;
