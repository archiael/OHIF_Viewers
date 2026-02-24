/**
 * Mammography Compare Mode Toolbar Buttons
 *
 * Buttons:
 * - Standard tools: Zoom, WindowLevel, Pan, Capture, Layout, Crosshairs
 * - ViewCC: Switch to CC compare stage (FR-3.3.8)
 * - ViewMLO: Switch to MLO compare stage (FR-3.3.8)
 * - MirrorModeCompare: Mirror Mode toggle (FR-2.5.5)
 * - CompareSync: Compare Sync toggle (FR-3.3.9)
 * - ExitCompare: Exit compare mode (FR-3.3.2)
 */

import type { Button } from '@ohif/core/types';
import i18n from 'i18next';

export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['mammography'],
  },
};

const toolbarButtons: Button[] = [
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
    id: 'Capture',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture',
      label: i18n.t('Buttons:Capture'),
      commands: 'showDownloadViewportModal',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Layout',
    uiType: 'ohif.layoutSelector',
    props: {
      rows: 3,
      columns: 4,
      evaluate: 'evaluate.action',
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

  /**
   * FR-3.3.8: CC View — Switch to CC compare stage (Stage 0)
   * Layout: [Current RCC | Current LCC | Prior RCC | Prior LCC]
   * isActive when hpMammoCompare stage 0 is active.
   */
  {
    id: 'ViewCC',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-view-cc',
      label: 'CC',
      tooltip: 'CC View (Cranio-caudal) — show CC for current and prior',
      commands: {
        commandName: 'setCompareStageCC',
        commandOptions: {},
        context: 'MAMMOGRAPHY_COMPARE',
      },
      evaluate: 'isCompareStageCCActive',
    },
  },

  /**
   * FR-3.3.8: MLO View — Switch to MLO compare stage (Stage 1)
   * Layout: [Current RMLO | Current LMLO | Prior RMLO | Prior LMLO]
   * isActive when hpMammoCompare stage 1 is active.
   */
  {
    id: 'ViewMLO',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-view-mlo',
      label: 'MLO',
      tooltip: 'MLO View (Medio-lateral oblique) — show MLO for current and prior',
      commands: {
        commandName: 'setCompareStageMlo',
        commandOptions: {},
        context: 'MAMMOGRAPHY_COMPARE',
      },
      evaluate: 'isCompareStageMloActive',
    },
  },

  /**
   * FR-2.5.5: Mirror Mode Toggle
   *
   * ON: chest wall alignment + L↔R pan/zoom sync within each study
   * OFF: standard view, no L↔R coupling
   */
  {
    id: 'MirrorModeCompare',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: 'Mirror Mode',
      tooltip: 'Toggle chest wall alignment and L↔R sync within each study',
      commands: {
        commandName: 'toggleMirrorModeCompare',
        commandOptions: {},
        context: 'MAMMOGRAPHY_COMPARE',
      },
      evaluate: 'isMirrorModeActiveCompare',
    },
  },

  /**
   * FR-3.3.9: Compare Sync Toggle
   *
   * ON: pan/zoom synchronized between current and prior study viewports
   * OFF: each study operates independently
   */
  {
    id: 'CompareSync',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-stack-image-sync',
      label: 'Compare Sync',
      tooltip: 'Toggle synchronization between current and prior studies',
      commands: {
        commandName: 'toggleCompareSync',
        commandOptions: {},
        context: 'MAMMOGRAPHY_COMPARE',
      },
      evaluate: 'isCompareSyncActive',
    },
  },

  /**
   * FR-3.3.2: Exit Compare Button
   */
  {
    id: 'ExitCompare',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'close',
      label: 'Exit Compare',
      tooltip: 'Exit Compare Mode and return to single-study view',
      commands: {
        commandName: 'exitMammoCompare',
        commandOptions: {},
        context: 'MAMMOGRAPHY_COMPARE',
      },
      evaluate: 'evaluate.action',
    },
  },
];

export default toolbarButtons;
