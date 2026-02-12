/**
 * Mammography Compare toolbar buttons
 *
 * Uses shared base toolbar from mammography-shared and adds compare-only buttons:
 * - ExitCompare: Return to single study mammography view
 *
 * Note: Compare mode places ExitCompare BEFORE the mammo buttons (MammoMagnify,
 * SyncAll, MammoCompare) so we use individual exports rather than createBaseToolbarButtons.
 */
import type { Button } from '@ohif/core/types';
import {
  sectionButtons,
  mammoMagnifyButton,
  syncAllImagesButton,
  mammoCompareButton,
  genericToolButtons,
} from '@ohif/mode-mammography-shared';
import i18n from 'i18next';

/**
 * Compare-mode only button: exit compare and return to single study view
 */
const exitCompareButton: Button = {
  id: 'ExitCompare',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'arrow-left',
    label: i18n.t('Buttons:Exit Compare'),
    tooltip: i18n.t('Buttons:Exit compare mode and return to single study view'),
    commands: { commandName: 'exitMammoCompare', context: 'MAMMOGRAPHY' },
    evaluate: 'evaluate.action',
  },
};

/**
 * Compare mode toolbar order:
 * sections -> ExitCompare -> MammoMagnify -> SyncAll -> MammoCompare -> generic tools
 */
const toolbarButtons: Button[] = [
  ...sectionButtons,
  exitCompareButton,
  mammoMagnifyButton,
  syncAllImagesButton,
  mammoCompareButton,
  ...genericToolButtons,
];

export default toolbarButtons;
