/**
 * Mammography Mode Evaluators Module
 *
 * Evaluators determine button/menu item states (active, disabled, etc.)
 * Used by toolbarService to update UI based on current state
 */

const evaluatorsModule = ({ servicesManager, commandsManager }) => {
  return {
    /**
     * Evaluate Mirror Mode button state
     * Returns true if Mirror Mode is currently enabled
     */
    isMirrorModeActive: () => {
      try {
        const result = commandsManager.runCommand('isMirrorModeEnabled');
        return result === true;
      } catch (error) {
        console.error('Error evaluating Mirror Mode state:', error);
        return false;
      }
    },
  };
};

export default evaluatorsModule;
