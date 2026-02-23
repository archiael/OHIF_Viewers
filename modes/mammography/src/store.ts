/**
 * Mammography Mode State Store
 *
 * @description
 * Zustand store for managing mammography mode state.
 * This store uses a singleton pattern - all components share the same state instance.
 *
 * @requirement FR-2.5.5: Mirror Mode Toggle
 * - Initial state: Mirror Mode **ON** (chest wall to edge)
 * - ON: Right breast chest wall pinned to right edge, Left breast to left edge
 * - OFF: All images centered in viewport
 * - Toggle button switches between ON ↔ OFF
 *
 * @architecture
 * - State stored in Zustand (not React component state)
 * - commandsModule reads state via `useMammographyStore.getState()`
 * - UI components subscribe via `useMammographyStore(state => state.xxx)`
 *
 * @example
 * ```typescript
 * // In command: read state
 * const store = useMammographyStore.getState();
 * const isEnabled = store.isMirrorModeEnabled;
 *
 * // In React component: subscribe to changes
 * const isMirrorModeEnabled = useMammographyStore(state => state.isMirrorModeEnabled);
 * ```
 */

import { create } from 'zustand';

/**
 * Mammography state interface
 */
interface MammographyState {
  /**
   * Mirror Mode enabled state
   * - true: Chest wall aligned to viewport edges (default)
   * - false: Images centered in viewport
   */
  isMirrorModeEnabled: boolean;

  /**
   * Toggle Mirror Mode ON ↔ OFF
   * Used by: commandsModule.toggleMirrorMode
   */
  toggleMirrorMode: () => void;

  /**
   * Set Mirror Mode to specific state
   * Used for: programmatic control (e.g., auto-enable on mode entry)
   *
   * @param enabled - true for ON, false for OFF
   */
  setMirrorMode: (enabled: boolean) => void;

  /**
   * Reset all state to initial defaults
   *
   * @description
   * Zustand store는 모듈 레벨 싱글톤으로 onModeExit 후에도 상태가 유지됩니다.
   * onModeEnter에서 이 메서드를 호출하여 stale state를 제거해야 합니다.
   *
   * PROBLEM WITHOUT THIS:
   * 1. 진입 → Mirror ON
   * 2. 사용자 토글 → Mirror OFF
   * 3. 워크리스트 이동
   * 4. 재진입 → store.isMirrorModeEnabled = false (stale!)
   * 5. HP는 Mirror ON으로 화면 설정
   * → 버튼 "OFF", 화면 "Mirror ON" ← 불일치!
   *
   * WHY NOT USE setMirrorMode(true) directly?
   * - resetToDefaults는 미래에 추가되는 모든 상태 필드도 초기화함
   * - 개별 set 호출보다 단일 진입점이 유지보수에 유리함
   */
  resetToDefaults: () => void;
}

/**
 * Mammography Zustand Store
 *
 * IMPORTANT: Initial state is Mirror Mode **ON**
 * This matches the requirement that mammography images should load
 * with chest wall aligned to edges by default.
 */
export const useMammographyStore = create<MammographyState>(set => ({
  /**
   * FR-2.5.5: Initial state is ON (chest wall to edge)
   *
   * WHY: Radiologists prefer chest wall alignment for easier comparison
   * between left and right breast images (mirror symmetry).
   */
  isMirrorModeEnabled: true,

  /**
   * Toggle Mirror Mode state
   *
   * FLOW:
   * 1. User clicks Mirror Mode button in toolbar
   * 2. Toolbar calls commandsManager.runCommand('toggleMirrorMode')
   * 3. Command calls this function to toggle state
   * 4. Command calls applyMirrorMode() to update all viewports
   * 5. Toolbar re-renders with new button state (evaluator checks this state)
   */
  toggleMirrorMode: () =>
    set(state => ({
      isMirrorModeEnabled: !state.isMirrorModeEnabled,
    })),

  /**
   * Set Mirror Mode to explicit state
   *
   * USE CASES:
   * - Auto-enable on mode entry (index.tsx onModeEnter)
   * - Reset to default state
   * - Programmatic control from other features
   *
   * @param enabled - true for ON (chest wall to edge), false for OFF (center)
   */
  setMirrorMode: (enabled: boolean) =>
    set({
      isMirrorModeEnabled: enabled,
    }),

  /**
   * Reset all state to initial defaults
   *
   * WHEN TO CALL: onModeEnter (modes/mammography/src/index.tsx)
   * WHY: Zustand store는 module-level singleton → onModeExit 후에도 상태 유지됨.
   *      재진입 시 이전 세션의 stale state가 남아 버튼 상태와 화면이 불일치할 수 있음.
   *
   * DEFAULT VALUES:
   * - isMirrorModeEnabled: true (FR-2.5.5: 초기값은 ON)
   */
  resetToDefaults: () =>
    set({
      isMirrorModeEnabled: true,
    }),
}));
