/**
 * Mammography Mode Evaluators Module
 *
 * @description
 * Evaluators are functions that determine toolbar button/menu item states.
 * OHIF's toolbarService calls these evaluators to decide button appearance:
 * - Active/Inactive (highlighted or not)
 * - Enabled/Disabled (clickable or grayed out)
 * - Visible/Hidden
 *
 * @architecture
 * FLOW:
 * 1. Toolbar renders buttons defined in toolbarButtons.ts
 * 2. Each button has an `evaluate` property pointing to an evaluator function
 * 3. toolbarService calls evaluator to get current button state
 * 4. Button UI updates based on evaluator return value
 * 5. When state changes (e.g., user toggles Mirror Mode):
 *    - Command calls refreshToolbarState()
 *    - toolbarService re-calls evaluators
 *    - Button UI updates
 *
 * @example
 * // In toolbarButtons.ts:
 * {
 *   id: 'MirrorMode',
 *   type: 'toggle',
 *   icon: 'tool-mirror',
 *   evaluate: 'isMirrorModeActive',  // References this evaluator
 * }
 *
 * @see modes/mammography/src/toolbarButtons.ts - Button definitions
 * @see modes/mammography/src/commandsModule.ts - State-changing commands
 * @see platform/core/src/services/ToolbarService - Evaluator execution
 */

const evaluatorsModule = ({ servicesManager, commandsManager }) => {
  return {
    /**
     * Evaluate Mirror Mode button state
     *
     * @description
     * Determines whether the Mirror Mode toggle button should appear "active" (highlighted).
     * This evaluator is called by OHIF's toolbarService whenever the toolbar needs to update.
     *
     * @requirement FR-2.5.5: Mirror Mode Toggle Button State
     * - Button appears ACTIVE (highlighted) when Mirror Mode is ON
     * - Button appears INACTIVE (normal) when Mirror Mode is OFF
     *
     * IMPLEMENTATION:
     * ===============
     * 1. Call 'isMirrorModeEnabled' command to get current state
     * 2. Command queries Zustand store: useMammographyStore.getState().isMirrorModeEnabled
     * 3. Return boolean:
     *    - true: Button shows as active (Mirror Mode ON)
     *    - false: Button shows as inactive (Mirror Mode OFF)
     *
     * WHEN IS THIS CALLED?
     * ====================
     * - Initial toolbar render (mode entry)
     * - After refreshToolbarState() is called (e.g., after toggleMirrorMode command)
     * - When viewport changes (activeViewportId change)
     * - Manual toolbar refresh
     *
     * ERROR HANDLING:
     * ===============
     * - If command execution fails: return false (default to inactive)
     * - If command returns non-boolean: strict equality check ensures false
     * - Logs error to console for debugging
     *
     * WHY STRICT EQUALITY (=== true)?
     * ================================
     * Ensures only boolean true returns true. Prevents truthy values like:
     * - undefined, null → false
     * - 0, "" → false
     * - "true" (string) → false
     * - 1 (number) → false
     * Only boolean true → true
     *
     * @returns {boolean} true if Mirror Mode is ON, false if OFF or error
     *
     * @see commandsModule.ts - isMirrorModeEnabled command
     * @see store.ts - isMirrorModeEnabled state
     * @see toolbarButtons.ts - Mirror Mode button definition
     *
     * @example
     * // Toolbar service calls this evaluator:
     * const isActive = evaluators.isMirrorModeActive();
     * // Result: true → button highlighted, false → button normal
     */
    isMirrorModeActive: () => {
      try {
        const result = commandsManager.runCommand('isMirrorModeEnabled');
        const isActive = result === true;
        return {
          disabled: false,
          isActive,
        };
      } catch (error) {
        console.error('Error evaluating Mirror Mode state:', error);
        return { disabled: false, isActive: false };
      }
    },
  };
};

export default evaluatorsModule;
