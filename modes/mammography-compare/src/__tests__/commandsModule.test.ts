/**
 * Unit tests for Mammography Compare Mode Commands Module
 *
 * @description
 * Tests command implementations for:
 * - FR-3.3.2: Compare Exit Button (exitMammoCompare)
 * - FR-2.5.5: Mirror Mode Toggle (toggleMirrorModeCompare, isMirrorModeEnabledCompare)
 * - FR-3.3.9: Compare Sync Toggle (toggleCompareSync, isCompareSyncEnabled)
 *
 * NOTE: Actual camera synchronization is event-driven (CAMERA_MODIFIED in index.tsx).
 * Commands only manage Zustand state and toolbar refresh.
 */

import commandsModule from '../commandsModule';
import { useMammographyCompareStore } from '../store';

// Mock window.location.href
delete (window as any).location;
window.location = { href: '', search: '' } as any;

describe('Mammography Compare Commands Module', () => {
  let servicesManager: any;
  let commandsManager: any;
  let commands: any;

  beforeEach(() => {
    // Reset store to initial state (both features ON)
    useMammographyCompareStore.setState({
      isCompareSyncEnabled: true,
      isMirrorModeEnabled: true,
    });

    // Mock services (syncGroupService removed - sync is now event-driven)
    servicesManager = {
      services: {
        displaySetService: {
          getActiveDisplaySets: jest.fn(() => [
            {
              StudyInstanceUID: 'study-current',
            },
          ]),
        },
        viewportGridService: {
          getState: jest.fn(() => ({
            activeViewportId: 'viewport-1',
            viewports: [
              {
                viewportId: 'viewport-1',
                displaySetInstanceUIDs: ['ds-1'],
              },
              {
                viewportId: 'viewport-2',
                displaySetInstanceUIDs: ['ds-2'],
              },
            ],
          })),
        },
        toolbarService: {
          refreshToolbarState: jest.fn(),
        },
        uiNotificationService: {
          show: jest.fn(),
        },
      },
    };

    commandsManager = {};

    // Get command module
    const module = commandsModule({ servicesManager, commandsManager });
    commands = module.actions;

    // Reset window.location
    window.location.href = '';
    window.location.search = '';

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('exitMammoCompare - FR-3.3.2', () => {
    // ── URL 기반 current study 식별 (1순위) ──────────────────────────────

    it('should use first UID from URL StudyInstanceUIDs param as current study', () => {
      // URL에 StudyInstanceUIDs=current,prior 형식으로 두 스터디 제공
      window.location.search = '?StudyInstanceUIDs=study-current,study-prior';

      commands.exitMammoCompare();

      // URL에서 파싱한 첫 번째 UID(current)로 이동해야 함
      expect(window.location.href).toContain('StudyInstanceUIDs=study-current');
      expect(window.location.href).not.toContain('study-prior');
      // getActiveDisplaySets는 호출하지 않아야 함 (URL 파싱 성공)
      expect(servicesManager.services.displaySetService.getActiveDisplaySets).not.toHaveBeenCalled();
    });

    it('should not use prior study UID even if it appears second in URL', () => {
      window.location.search = '?StudyInstanceUIDs=uid-current,uid-prior';

      commands.exitMammoCompare();

      expect(window.location.href).toContain(encodeURIComponent('uid-current'));
      expect(window.location.href).not.toContain(encodeURIComponent('uid-prior'));
    });

    it('should handle URL with single StudyInstanceUID (no prior)', () => {
      window.location.search = '?StudyInstanceUIDs=only-study';

      commands.exitMammoCompare();

      expect(window.location.href).toContain(encodeURIComponent('only-study'));
    });

    it('should handle URL with whitespace around UIDs', () => {
      window.location.search = '?StudyInstanceUIDs= study-current , study-prior ';

      commands.exitMammoCompare();

      expect(window.location.href).toContain(encodeURIComponent('study-current'));
    });

    it('should encode StudyInstanceUID from URL when it contains special characters', () => {
      window.location.search = '?StudyInstanceUIDs=1.2.840.10008%2F12345';

      commands.exitMammoCompare();

      // URL 파싱 후 encodeURIComponent 적용됨
      expect(window.location.href).toContain('/mammography');
    });

    // ── fallback: URL에 StudyInstanceUIDs 없을 때 ─────────────────────────

    it('should fall back to getActiveDisplaySets when URL has no StudyInstanceUIDs param', () => {
      window.location.search = ''; // URL에 파라미터 없음

      commands.exitMammoCompare();

      // fallback으로 getActiveDisplaySets 호출
      expect(servicesManager.services.displaySetService.getActiveDisplaySets).toHaveBeenCalled();
      expect(window.location.href).toContain('StudyInstanceUIDs=study-current');
    });

    it('should fall back when StudyInstanceUIDs param is empty string', () => {
      window.location.search = '?StudyInstanceUIDs=';

      commands.exitMammoCompare();

      expect(servicesManager.services.displaySetService.getActiveDisplaySets).toHaveBeenCalled();
    });

    it('should fall back when StudyInstanceUIDs param is only commas', () => {
      window.location.search = '?StudyInstanceUIDs=,,,';

      commands.exitMammoCompare();

      // filter(Boolean)로 빈 문자열 제거 → 빈 배열 → fallback
      expect(servicesManager.services.displaySetService.getActiveDisplaySets).toHaveBeenCalled();
    });

    // ── fallback error handling ────────────────────────────────────────────

    it('should navigate to mammography mode with fallback study', () => {
      // URL 없음 → fallback to getActiveDisplaySets → study-current
      commands.exitMammoCompare();

      expect(window.location.href).toContain('/mammography');
      expect(window.location.href).toContain('StudyInstanceUIDs=study-current');
    });

    it('should preserve datasources query parameter (from URL)', () => {
      window.location.search = '?StudyInstanceUIDs=study-current,study-prior&datasources=dicomweb';

      commands.exitMammoCompare();

      expect(window.location.href).toContain('datasources=dicomweb');
    });

    it('should preserve datasources query parameter (fallback path)', () => {
      window.location.search = '?datasources=dicomweb';

      commands.exitMammoCompare();

      expect(window.location.href).toContain('datasources=dicomweb');
    });

    it('should show error notification when no active displaySets (fallback path)', () => {
      window.location.search = ''; // URL 파라미터 없음 → fallback
      servicesManager.services.displaySetService.getActiveDisplaySets.mockReturnValue([]);

      commands.exitMammoCompare();

      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          message: 'No active study found',
          type: 'error',
        })
      );
      expect(window.location.href).toBe('');
    });

    it('should show error notification when displaySets is null (fallback path)', () => {
      window.location.search = '';
      servicesManager.services.displaySetService.getActiveDisplaySets.mockReturnValue(null);

      commands.exitMammoCompare();

      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      );
    });

    it('should encode StudyInstanceUID in URL (fallback path)', () => {
      window.location.search = '';
      servicesManager.services.displaySetService.getActiveDisplaySets.mockReturnValue([
        { StudyInstanceUID: 'study-with-special-chars!@#' },
      ]);

      commands.exitMammoCompare();

      expect(window.location.href).toContain(encodeURIComponent('study-with-special-chars!@#'));
    });

    it('should not navigate when error occurs in fallback path', () => {
      window.location.search = '';
      servicesManager.services.displaySetService.getActiveDisplaySets.mockReturnValue([]);

      commands.exitMammoCompare();

      // error → return early → href unchanged
      expect(window.location.href).toBe('');
    });
  });

  describe('toggleMirrorModeCompare - FR-2.5.5', () => {
    it('should toggle Mirror Mode state from ON to OFF', () => {
      // Initial state: ON
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      commands.toggleMirrorModeCompare();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should toggle Mirror Mode state from OFF to ON', () => {
      useMammographyCompareStore.setState({ isMirrorModeEnabled: false });

      commands.toggleMirrorModeCompare();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should refresh toolbar after toggling', () => {
      commands.toggleMirrorModeCompare();

      expect(servicesManager.services.toolbarService.refreshToolbarState).toHaveBeenCalledWith({
        viewportId: 'viewport-1',
      });
    });

    it('should not affect Compare Sync state', () => {
      useMammographyCompareStore.setState({ isCompareSyncEnabled: true });

      commands.toggleMirrorModeCompare();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });
  });

  describe('isMirrorModeEnabledCompare - FR-2.5.5', () => {
    it('should return true when Mirror Mode is ON', () => {
      useMammographyCompareStore.setState({ isMirrorModeEnabled: true });

      const result = commands.isMirrorModeEnabledCompare();

      expect(result).toBe(true);
    });

    it('should return false when Mirror Mode is OFF', () => {
      useMammographyCompareStore.setState({ isMirrorModeEnabled: false });

      const result = commands.isMirrorModeEnabledCompare();

      expect(result).toBe(false);
    });

    it('should reflect real-time state changes', () => {
      useMammographyCompareStore.setState({ isMirrorModeEnabled: true });
      expect(commands.isMirrorModeEnabledCompare()).toBe(true);

      useMammographyCompareStore.setState({ isMirrorModeEnabled: false });
      expect(commands.isMirrorModeEnabledCompare()).toBe(false);

      useMammographyCompareStore.setState({ isMirrorModeEnabled: true });
      expect(commands.isMirrorModeEnabledCompare()).toBe(true);
    });
  });

  describe('toggleCompareSync - FR-3.3.9', () => {
    it('should toggle Compare Sync state from ON to OFF', () => {
      // Initial state: ON
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      commands.toggleCompareSync();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
    });

    it('should toggle Compare Sync state from OFF to ON', () => {
      useMammographyCompareStore.setState({ isCompareSyncEnabled: false });

      commands.toggleCompareSync();

      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);
    });

    it('should refresh toolbar after toggling', () => {
      commands.toggleCompareSync();

      expect(servicesManager.services.toolbarService.refreshToolbarState).toHaveBeenCalledWith({
        viewportId: 'viewport-1',
      });
    });

    it('should not affect Mirror Mode state', () => {
      useMammographyCompareStore.setState({ isMirrorModeEnabled: true });

      commands.toggleCompareSync();

      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should handle missing activeViewportId gracefully', () => {
      servicesManager.services.viewportGridService.getState.mockReturnValue({
        activeViewportId: null,
        viewports: [],
      });

      expect(() => commands.toggleCompareSync()).not.toThrow();
    });
  });

  describe('isCompareSyncEnabled - FR-3.3.9', () => {
    it('should return true when Compare Sync is ON', () => {
      useMammographyCompareStore.setState({ isCompareSyncEnabled: true });

      const result = commands.isCompareSyncEnabled();

      expect(result).toBe(true);
    });

    it('should return false when Compare Sync is OFF', () => {
      useMammographyCompareStore.setState({ isCompareSyncEnabled: false });

      const result = commands.isCompareSyncEnabled();

      expect(result).toBe(false);
    });

    it('should reflect real-time state changes', () => {
      useMammographyCompareStore.setState({ isCompareSyncEnabled: true });
      expect(commands.isCompareSyncEnabled()).toBe(true);

      useMammographyCompareStore.setState({ isCompareSyncEnabled: false });
      expect(commands.isCompareSyncEnabled()).toBe(false);

      useMammographyCompareStore.setState({ isCompareSyncEnabled: true });
      expect(commands.isCompareSyncEnabled()).toBe(true);
    });
  });

  describe('command registration', () => {
    it('should export all required commands', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.actions).toHaveProperty('exitMammoCompare');
      expect(module.actions).toHaveProperty('toggleMirrorModeCompare');
      expect(module.actions).toHaveProperty('isMirrorModeEnabledCompare');
      expect(module.actions).toHaveProperty('toggleCompareSync');
      expect(module.actions).toHaveProperty('isCompareSyncEnabled');
    });

    it('should export command definitions', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.definitions).toHaveProperty('exitMammoCompare');
      expect(module.definitions).toHaveProperty('toggleMirrorModeCompare');
      expect(module.definitions).toHaveProperty('isMirrorModeEnabledCompare');
      expect(module.definitions).toHaveProperty('toggleCompareSync');
      expect(module.definitions).toHaveProperty('isCompareSyncEnabled');
    });

    it('should have correct command function references', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.definitions.exitMammoCompare.commandFn).toBe(module.actions.exitMammoCompare);
      expect(module.definitions.toggleMirrorModeCompare.commandFn).toBe(
        module.actions.toggleMirrorModeCompare
      );
      expect(module.definitions.isMirrorModeEnabledCompare.commandFn).toBe(
        module.actions.isMirrorModeEnabledCompare
      );
      expect(module.definitions.toggleCompareSync.commandFn).toBe(module.actions.toggleCompareSync);
      expect(module.definitions.isCompareSyncEnabled.commandFn).toBe(
        module.actions.isCompareSyncEnabled
      );
    });
  });

  describe('integration scenarios', () => {
    it('should support full workflow: enter compare → toggle mirror OFF → toggle sync OFF → exit', () => {
      // 1. Initially both features ON
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      // 2. User toggles Mirror Mode OFF
      commands.toggleMirrorModeCompare();
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true); // unchanged

      // 3. User toggles Compare Sync OFF
      commands.toggleCompareSync();
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false); // unchanged

      // 4. User exits compare mode
      commands.exitMammoCompare();
      expect(window.location.href).toContain('/mammography');
    });

    it('should toggle both features independently', () => {
      // Toggle Mirror Mode multiple times
      commands.toggleMirrorModeCompare(); // ON → OFF
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(false);

      commands.toggleMirrorModeCompare(); // OFF → ON
      expect(useMammographyCompareStore.getState().isMirrorModeEnabled).toBe(true);

      // Toggle Compare Sync multiple times
      commands.toggleCompareSync(); // ON → OFF
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(false);

      commands.toggleCompareSync(); // OFF → ON
      expect(useMammographyCompareStore.getState().isCompareSyncEnabled).toBe(true);

      // Each toggle should have called toolbar refresh
      expect(servicesManager.services.toolbarService.refreshToolbarState).toHaveBeenCalledTimes(4);
    });

    it('should correctly report state after toggles', () => {
      // Toggle Mirror Mode OFF
      commands.toggleMirrorModeCompare();
      expect(commands.isMirrorModeEnabledCompare()).toBe(false);

      // Toggle Compare Sync OFF
      commands.toggleCompareSync();
      expect(commands.isCompareSyncEnabled()).toBe(false);

      // Toggle Mirror Mode back ON
      commands.toggleMirrorModeCompare();
      expect(commands.isMirrorModeEnabledCompare()).toBe(true);
      expect(commands.isCompareSyncEnabled()).toBe(false); // Compare Sync remains OFF
    });
  });
});
