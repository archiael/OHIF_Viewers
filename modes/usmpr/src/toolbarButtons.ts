const toolbarButtons = [
  // MeasurementTools section marker
  {
    id: 'MeasurementTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: true,
    },
  },
  // Individual measurement tool buttons
  {
    id: 'Length',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-length',
      label: 'Length',
      tooltip: 'Length Tool',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'Length',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'Bidirectional',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-bidirectional',
      label: 'Bidirectional',
      tooltip: 'Bidirectional Tool',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'Bidirectional',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'EllipticalROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-elipse',
      label: 'Ellipse',
      tooltip: 'Ellipse Tool',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'EllipticalROI',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'CircleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-circle',
      label: 'Circle',
      tooltip: 'Circle Tool',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'CircleROI',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'Zoom',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-zoom',
      label: 'Zoom',
      tooltip: 'Zoom',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'Zoom',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level',
      label: 'Window Level',
      tooltip: 'Window Level',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'WindowLevel',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-move',
      label: 'Pan',
      tooltip: 'Pan',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'Pan',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'Crosshairs',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-crosshair',
      label: 'Crosshairs',
      tooltip: 'Crosshairs',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'Crosshairs',
        },
        context: 'CORNERSTONE',
      },
    },
  },
  {
    id: 'StackScroll',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-stack-scroll',
      label: 'Stack Scroll',
      tooltip: 'Stack Scroll',
      commands: {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'StackScroll',
        },
        context: 'CORNERSTONE',
      },
    },
  },
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
];

export default toolbarButtons;
