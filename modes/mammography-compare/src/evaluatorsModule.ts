/**
 * Mammography Compare Mode Evaluators Module
 *
 * @description
 * Evaluators determine toolbar button states (active/inactive).
 * toolbarService calls these on every toolbar refresh.
 *
 * EVALUATORS:
 * - isCompareSyncActive: CompareSync button state (FR-3.3.9)
 * - isMirrorModeActiveCompare: MirrorModeCompare button state (FR-2.5.5)
 * - isCompareStageCCActive: ViewCC button state (active when stage 0 = CC compare)
 * - isCompareStageMloActive: ViewMLO button state (active when stage 1 = MLO compare)
 *
 * RETURN FORMAT:
 * { disabled: boolean, isActive: boolean }
 * - disabled: whether the button is grayed out (always false here)
 * - isActive: whether the button is highlighted (true = feature is ON)
 */

const evaluatorsModule = ({ servicesManager, commandsManager }) => {
  const { hangingProtocolService } = servicesManager.services;

  return {
    /**
     * Compare Sync button state (FR-3.3.9)
     * isActive = true when Compare Sync is ON (viewports synchronized across studies)
     */
    isCompareSyncActive: () => {
      try {
        const result = commandsManager.runCommand('isCompareSyncEnabled');
        return { disabled: false, isActive: result === true };
      } catch (error) {
        console.error('[isCompareSyncActive] Error:', error);
        return { disabled: false, isActive: false };
      }
    },

    /**
     * Mirror Mode button state (FR-2.5.5)
     * isActive = true when Mirror Mode is ON (chest wall alignment + L↔R sync active)
     */
    isMirrorModeActiveCompare: () => {
      try {
        const result = commandsManager.runCommand('isMirrorModeEnabledCompare');
        return { disabled: false, isActive: result === true };
      } catch (error) {
        console.error('[isMirrorModeActiveCompare] Error:', error);
        return { disabled: false, isActive: false };
      }
    },

    /**
     * ViewCC button state: active when stage 0 (CC compare) is active.
     * Stage 0 layout: [Current RCC | Current LCC | Prior RCC | Prior LCC]
     */
    isCompareStageCCActive: () => {
      try {
        const state = hangingProtocolService.getState();
        return { disabled: false, isActive: state.stageIndex === 0 };
      } catch (error) {
        console.error('[isCompareStageCCActive] Error:', error);
        return { disabled: false, isActive: true }; // default: CC stage
      }
    },

    /**
     * ViewMLO button state: active when stage 1 (MLO compare) is active.
     * Stage 1 layout: [Current RMLO | Current LMLO | Prior RMLO | Prior LMLO]
     */
    isCompareStageMloActive: () => {
      try {
        const state = hangingProtocolService.getState();
        return { disabled: false, isActive: state.stageIndex === 1 };
      } catch (error) {
        console.error('[isCompareStageMloActive] Error:', error);
        return { disabled: false, isActive: false };
      }
    },
  };
};

export default evaluatorsModule;
