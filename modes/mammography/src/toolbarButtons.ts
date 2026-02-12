/**
 * Mammography toolbar buttons
 *
 * Uses shared base toolbar from mammography-shared and adds mammography-only buttons:
 * - MirrorModeToggle: Toggle chest wall alignment
 * - OpenReport: Open SR report editor
 * - ViewPDFReport: View PDF report
 */
import type { Button } from '@ohif/core/types';
import { createBaseToolbarButtons } from '@ohif/mode-mammography-shared';
import i18n from 'i18next';

/**
 * Mammography-only buttons (not in compare mode)
 */
const mammographySpecificButtons: Button[] = [
  {
    id: 'MirrorModeToggle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: i18n.t('Buttons:Mirror Mode'),
      tooltip: i18n.t('Buttons:Toggle chest wall alignment (mirror image)'),
      commands: { commandName: 'toggleMirrorMode', context: 'MAMMOGRAPHY' },
      evaluate: 'evaluate.mammography.mirrorMode',
    },
  },
  {
    id: 'OpenReport',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'pencil',
      label: 'Write Report',
      tooltip: 'Edit SR Report',
      size: 'tiny',
      className: '!w-[28px] !h-[28px] [&_svg]:!w-[20px] [&_svg]:!h-[20px] !mt-2',
      commands: {
        commandName: 'openSRReportPage',
        context: 'MAMMOGRAPHY',
      },
    },
  },
  {
    id: 'ViewPDFReport',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'clipboard',
      label: 'PDF Report',
      tooltip: 'View PDF Report',
      size: 'tiny',
      className: '!w-[28px] !h-[28px] [&_svg]:!w-[20px] [&_svg]:!h-[20px] !mt-2',
      commands: { commandName: 'openPDFReportPage', context: 'MAMMOGRAPHY' },
      evaluate: 'evaluate.action',
    },
  },
];

const toolbarButtons: Button[] = createBaseToolbarButtons(mammographySpecificButtons);

export default toolbarButtons;
