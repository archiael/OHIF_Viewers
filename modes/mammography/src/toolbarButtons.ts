/**
 * Mammography Mode - Additional Toolbar Buttons
 *
 * Basic 모드 버튼들을 가져오되, tool activation 시 mammography 툴 그룹에도 적용되도록
 * Zoom/WindowLevel/Pan/Crosshairs 버튼을 재정의합니다. (basic 버튼을 덮어씌움)
 * MirrorMode, OpenMammoCompare는 mammography 전용 버튼입니다.
 */

import type { Button } from '@ohif/core/types';
import i18n from 'i18next';

// Basic 모드 버튼들과 달리 mammography 툴 그룹도 포함
export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup', 'volume3d', 'mammography'],
  },
};

const mammographyButtons: Button[] = [
  // Basic 모드 버튼들을 mammography toolGroup 포함하도록 재정의 (덮어쓰기)
  {
    id: 'Zoom',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-zoom',
      label: i18n.t('Buttons:Zoom'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level',
      label: i18n.t('Buttons:Window Level'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-move',
      label: i18n.t('Buttons:Pan'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Crosshairs',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-crosshair',
      label: i18n.t('Buttons:Crosshairs'),
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  // Mammography 전용 버튼
  {
    id: 'MirrorMode',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: 'Mirror Mode',
      tooltip: 'Toggle Mirror Mode (chest wall positioning)',
      commands: {
        commandName: 'toggleMirrorMode',
        commandOptions: {},
      },
      evaluate: 'isMirrorModeActive',
    },
  },
  {
    id: 'OpenMammoCompare',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'TabStudies',
      label: 'Compare Mode',
      tooltip: 'Open Mammography Compare Mode',
      commands: {
        commandName: 'openMammoCompare',
        commandOptions: {},
      },
      evaluate: 'evaluate.action',
    },
  },
];

export default mammographyButtons;
