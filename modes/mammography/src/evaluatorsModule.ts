/**
 * Mammography evaluators module
 *
 * Uses shared base evaluators from mammography-shared and adds mammography-only:
 * - evaluate.mammography.mirrorMode
 */
import { createBaseEvaluators } from '@ohif/mode-mammography-shared';

const evaluatorsModule = ({ commandsManager }) => {
  const baseEvaluators = createBaseEvaluators({ commandsManager });

  // Mammography-only evaluator for mirror mode
  const mirrorModeEvaluator = {
    name: 'evaluate.mammography.mirrorMode',
    evaluate: ({ viewportId, button }) => {
      try {
        const isMirrorModeEnabled = commandsManager.runCommand('isMirrorModeEnabled', {}, 'MAMMOGRAPHY');
        return {
          disabled: false,
          className: isMirrorModeEnabled ? 'active' : '',
          isActive: isMirrorModeEnabled,
        };
      } catch (error) {
        return {
          disabled: false,
          className: '',
          isActive: false,
        };
      }
    },
  };

  return [...baseEvaluators, mirrorModeEvaluator];
};

export default evaluatorsModule;
