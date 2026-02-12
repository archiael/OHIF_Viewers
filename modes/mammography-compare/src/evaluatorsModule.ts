/**
 * Mammography Compare evaluators module
 *
 * Re-exports the shared base evaluators from mammography-shared.
 * Compare mode uses the same evaluators as mammography mode
 * (magnify, sync, compare) with no additional evaluators.
 */
import { createBaseEvaluators } from '@ohif/mode-mammography-shared';

const evaluatorsModule = ({ commandsManager }) => {
  return createBaseEvaluators({ commandsManager });
};

export default evaluatorsModule;
