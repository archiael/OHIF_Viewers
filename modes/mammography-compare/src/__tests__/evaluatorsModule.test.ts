/**
 * Unit tests for Mammography Compare Mode Evaluators Module
 *
 * @description
 * Tests evaluator implementations for toolbar button states:
 * - FR-3.3.9: Compare Sync button active state
 *
 * RETURN FORMAT:
 * evaluatorsModule는 OHIF toolButton 형식의 객체를 반환합니다:
 * { disabled: boolean, isActive: boolean }
 *
 * - disabled: 버튼 비활성화 여부 (compare에서는 항상 false)
 * - isActive: 버튼 활성(하이라이트) 여부
 */

import evaluatorsModule from '../evaluatorsModule';

describe('Mammography Compare Evaluators Module', () => {
  let servicesManager: any;
  let commandsManager: any;
  let evaluators: any;

  let mockHangingProtocolService: any;

  beforeEach(() => {
    // Mock hangingProtocolService
    mockHangingProtocolService = {
      getState: jest.fn().mockReturnValue({ stageIndex: 0, protocolId: 'hpMammoCompare' }),
    };

    // Mock services
    servicesManager = {
      services: {
        hangingProtocolService: mockHangingProtocolService,
      },
    };

    // Mock commandsManager
    commandsManager = {
      runCommand: jest.fn(),
    };

    // Get evaluators module
    evaluators = evaluatorsModule({ servicesManager, commandsManager });

    // Spy on console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isCompareSyncActive - FR-3.3.9', () => {
    /**
     * evaluatorsModule.ts는 OHIF toolbar evaluator 형식을 따릅니다:
     * 반환 타입: { disabled: boolean, isActive: boolean }
     *
     * WHY OBJECT NOT BOOLEAN?
     * OHIF의 ToolButton 컴포넌트는 evaluator 반환값에서
     * { isActive } 속성을 읽어 버튼 하이라이트를 결정합니다.
     * boolean을 반환하면 작동하지 않습니다.
     *
     * @see platform/ui/src/components/ToolButton - activeClasses 적용 로직
     */

    it('should return { isActive: true } when Compare Sync is enabled', () => {
      commandsManager.runCommand.mockReturnValue(true);

      const result = evaluators.isCompareSyncActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isCompareSyncEnabled');
      expect(result).toEqual({ disabled: false, isActive: true });
    });

    it('should return { isActive: false } when Compare Sync is disabled', () => {
      commandsManager.runCommand.mockReturnValue(false);

      const result = evaluators.isCompareSyncActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isCompareSyncEnabled');
      expect(result).toEqual({ disabled: false, isActive: false });
    });

    it('should return { isActive: false } when command returns non-boolean value (string)', () => {
      // 엄격한 === true 체크: string "true"는 false로 처리해야 함
      commandsManager.runCommand.mockReturnValue('true');

      const result = evaluators.isCompareSyncActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns undefined', () => {
      commandsManager.runCommand.mockReturnValue(undefined);

      const result = evaluators.isCompareSyncActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns null', () => {
      commandsManager.runCommand.mockReturnValue(null);

      const result = evaluators.isCompareSyncActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns 0 (falsy but not boolean false)', () => {
      commandsManager.runCommand.mockReturnValue(0);

      const result = evaluators.isCompareSyncActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns empty string', () => {
      commandsManager.runCommand.mockReturnValue('');

      const result = evaluators.isCompareSyncActive();

      expect(result.isActive).toBe(false);
    });

    it('should handle errors gracefully and return { isActive: false }', () => {
      commandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command execution failed');
      });

      const result = evaluators.isCompareSyncActive();

      expect(result).toEqual({ disabled: false, isActive: false });
      expect(console.error).toHaveBeenCalledWith(
        '[isCompareSyncActive] Error:',
        expect.any(Error)
      );
    });

    it('should call runCommand exactly once per evaluation', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isCompareSyncActive();

      expect(commandsManager.runCommand).toHaveBeenCalledTimes(1);
    });

    it('should reflect real-time state changes', () => {
      // First call: Compare Sync ON
      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isCompareSyncActive().isActive).toBe(true);

      // Second call: Compare Sync OFF
      commandsManager.runCommand.mockReturnValueOnce(false);
      expect(evaluators.isCompareSyncActive().isActive).toBe(false);

      // Third call: Compare Sync ON again
      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isCompareSyncActive().isActive).toBe(true);

      // Should have called runCommand 3 times
      expect(commandsManager.runCommand).toHaveBeenCalledTimes(3);
    });

    it('should work correctly with multiple rapid evaluations', () => {
      commandsManager.runCommand.mockReturnValue(true);

      // Simulate toolbar rapidly re-evaluating button state
      const results = [
        evaluators.isCompareSyncActive(),
        evaluators.isCompareSyncActive(),
        evaluators.isCompareSyncActive(),
        evaluators.isCompareSyncActive(),
        evaluators.isCompareSyncActive(),
      ];

      expect(results).toEqual([
        { disabled: false, isActive: true },
        { disabled: false, isActive: true },
        { disabled: false, isActive: true },
        { disabled: false, isActive: true },
        { disabled: false, isActive: true },
      ]);
      expect(commandsManager.runCommand).toHaveBeenCalledTimes(5);
    });

    it('should handle command not found error', () => {
      commandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command "isCompareSyncEnabled" not found');
      });

      const result = evaluators.isCompareSyncActive();

      expect(result).toEqual({ disabled: false, isActive: false });
      expect(console.error).toHaveBeenCalledWith(
        '[isCompareSyncActive] Error:',
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('should always have disabled: false (Compare Sync button is always clickable)', () => {
      // Compare Sync 버튼은 항상 클릭 가능 (disabled 없음)
      commandsManager.runCommand.mockReturnValue(true);
      expect(evaluators.isCompareSyncActive().disabled).toBe(false);

      commandsManager.runCommand.mockReturnValue(false);
      expect(evaluators.isCompareSyncActive().disabled).toBe(false);
    });
  });

  describe('isMirrorModeActiveCompare - FR-2.5.5', () => {
    /**
     * isMirrorModeActiveCompare는 isCompareSyncActive와 동일한 구조이나
     * 'isMirrorModeEnabledCompare' 커맨드를 사용합니다.
     */

    it('should return { isActive: true } when Mirror Mode is enabled', () => {
      commandsManager.runCommand.mockReturnValue(true);

      const result = evaluators.isMirrorModeActiveCompare();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabledCompare');
      expect(result).toEqual({ disabled: false, isActive: true });
    });

    it('should return { isActive: false } when Mirror Mode is disabled', () => {
      commandsManager.runCommand.mockReturnValue(false);

      const result = evaluators.isMirrorModeActiveCompare();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabledCompare');
      expect(result).toEqual({ disabled: false, isActive: false });
    });

    it('should return { isActive: false } when command returns non-boolean truthy (string)', () => {
      commandsManager.runCommand.mockReturnValue('true');

      const result = evaluators.isMirrorModeActiveCompare();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns undefined', () => {
      commandsManager.runCommand.mockReturnValue(undefined);

      expect(evaluators.isMirrorModeActiveCompare().isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns null', () => {
      commandsManager.runCommand.mockReturnValue(null);

      expect(evaluators.isMirrorModeActiveCompare().isActive).toBe(false);
    });

    it('should handle errors gracefully and return { isActive: false }', () => {
      commandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command execution failed');
      });

      const result = evaluators.isMirrorModeActiveCompare();

      expect(result).toEqual({ disabled: false, isActive: false });
      expect(console.error).toHaveBeenCalledWith(
        '[isMirrorModeActiveCompare] Error:',
        expect.any(Error)
      );
    });

    it('should always have disabled: false (Mirror Mode button is always clickable)', () => {
      commandsManager.runCommand.mockReturnValue(true);
      expect(evaluators.isMirrorModeActiveCompare().disabled).toBe(false);

      commandsManager.runCommand.mockReturnValue(false);
      expect(evaluators.isMirrorModeActiveCompare().disabled).toBe(false);
    });

    it('should reflect real-time state changes', () => {
      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isMirrorModeActiveCompare().isActive).toBe(true);

      commandsManager.runCommand.mockReturnValueOnce(false);
      expect(evaluators.isMirrorModeActiveCompare().isActive).toBe(false);

      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isMirrorModeActiveCompare().isActive).toBe(true);
    });

    it('should call isMirrorModeEnabledCompare not isCompareSyncEnabled', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isMirrorModeActiveCompare();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabledCompare');
      expect(commandsManager.runCommand).not.toHaveBeenCalledWith('isCompareSyncEnabled');
    });
  });

  describe('evaluator independence', () => {
    it('isCompareSyncActive and isMirrorModeActiveCompare should use different commands', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isCompareSyncActive();
      evaluators.isMirrorModeActiveCompare();

      const calls = commandsManager.runCommand.mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('isCompareSyncEnabled');
      expect(calls).toContain('isMirrorModeEnabledCompare');
    });

    it('should be independently callable without interference', () => {
      // Mirror Mode ON, Compare Sync OFF 시뮬레이션
      commandsManager.runCommand.mockImplementation((cmd: string) => {
        if (cmd === 'isMirrorModeEnabledCompare') return true;
        if (cmd === 'isCompareSyncEnabled') return false;
        return undefined;
      });

      const mirrorResult = evaluators.isMirrorModeActiveCompare();
      const syncResult = evaluators.isCompareSyncActive();

      expect(mirrorResult.isActive).toBe(true);
      expect(syncResult.isActive).toBe(false);
    });
  });

  describe('module structure', () => {
    it('should export isCompareSyncActive evaluator', () => {
      expect(evaluators).toHaveProperty('isCompareSyncActive');
      expect(typeof evaluators.isCompareSyncActive).toBe('function');
    });

    it('should export isMirrorModeActiveCompare evaluator', () => {
      expect(evaluators).toHaveProperty('isMirrorModeActiveCompare');
      expect(typeof evaluators.isMirrorModeActiveCompare).toBe('function');
    });

    it('should expose all evaluators', () => {
      const keys = Object.keys(evaluators);
      expect(keys).toEqual(expect.arrayContaining([
        'isCompareSyncActive',
        'isMirrorModeActiveCompare',
        'isCompareStageCCActive',
        'isCompareStageMloActive',
      ]));
      expect(keys).toHaveLength(4);
    });

    it('should be a function that returns an object', () => {
      const module = evaluatorsModule({ servicesManager, commandsManager });
      expect(typeof module).toBe('object');
      expect(module).not.toBeNull();
    });

    it('should return { disabled, isActive } object from evaluator', () => {
      commandsManager.runCommand.mockReturnValue(true);
      const result = evaluators.isCompareSyncActive();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('disabled');
      expect(result).toHaveProperty('isActive');
    });
  });

  describe('integration with commandsManager', () => {
    it('should pass correct command name to runCommand', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isCompareSyncActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isCompareSyncEnabled');
      expect(commandsManager.runCommand).not.toHaveBeenCalledWith('toggleCompareSync');
      expect(commandsManager.runCommand).not.toHaveBeenCalledWith('exitMammoCompare');
    });

    it('should not call runCommand with additional arguments', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isCompareSyncActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isCompareSyncEnabled');
      // Verify only one argument was passed
      expect(commandsManager.runCommand.mock.calls[0].length).toBe(1);
    });
  });

  describe('isCompareStageCCActive - stage 0 (CC compare)', () => {
    it('should return { isActive: true } when stage 0 (CC) is active', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 0 });
      const result = evaluators.isCompareStageCCActive();
      expect(result).toEqual({ disabled: false, isActive: true });
    });

    it('should return { isActive: false } when stage 1 (MLO) is active', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 1 });
      const result = evaluators.isCompareStageCCActive();
      expect(result).toEqual({ disabled: false, isActive: false });
    });

    it('should return default { isActive: true } on error (CC is default stage)', () => {
      mockHangingProtocolService.getState.mockImplementation(() => {
        throw new Error('HP service unavailable');
      });
      const result = evaluators.isCompareStageCCActive();
      expect(result).toEqual({ disabled: false, isActive: true });
      expect(console.error).toHaveBeenCalled();
    });

    it('should call hangingProtocolService.getState()', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 0 });
      evaluators.isCompareStageCCActive();
      expect(mockHangingProtocolService.getState).toHaveBeenCalledTimes(1);
    });
  });

  describe('isCompareStageMloActive - stage 1 (MLO compare)', () => {
    it('should return { isActive: false } when stage 0 (CC) is active', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 0 });
      const result = evaluators.isCompareStageMloActive();
      expect(result).toEqual({ disabled: false, isActive: false });
    });

    it('should return { isActive: true } when stage 1 (MLO) is active', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 1 });
      const result = evaluators.isCompareStageMloActive();
      expect(result).toEqual({ disabled: false, isActive: true });
    });

    it('should return default { isActive: false } on error', () => {
      mockHangingProtocolService.getState.mockImplementation(() => {
        throw new Error('HP service unavailable');
      });
      const result = evaluators.isCompareStageMloActive();
      expect(result).toEqual({ disabled: false, isActive: false });
      expect(console.error).toHaveBeenCalled();
    });

    it('CC and MLO stage evaluators should be mutually exclusive', () => {
      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 0 });
      expect(evaluators.isCompareStageCCActive().isActive).toBe(true);
      expect(evaluators.isCompareStageMloActive().isActive).toBe(false);

      mockHangingProtocolService.getState.mockReturnValue({ stageIndex: 1 });
      expect(evaluators.isCompareStageCCActive().isActive).toBe(false);
      expect(evaluators.isCompareStageMloActive().isActive).toBe(true);
    });
  });
});
