/**
 * Unit tests for Mammography Mode Evaluators Module
 *
 * @description
 * Tests evaluator implementations for toolbar button states:
 * - FR-2.5.5: Mirror Mode button active state
 *
 * RETURN FORMAT:
 * evaluatorsModule는 OHIF toolButton 형식의 객체를 반환합니다:
 * { disabled: boolean, isActive: boolean }
 *
 * - disabled: 버튼 비활성화 여부 (mammography에서는 항상 false)
 * - isActive: 버튼 활성(하이라이트) 여부
 */

import evaluatorsModule from '../evaluatorsModule';

describe('Mammography Evaluators Module', () => {
  let servicesManager: any;
  let commandsManager: any;
  let evaluators: any;

  beforeEach(() => {
    // Mock services
    servicesManager = {
      services: {},
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

  describe('isMirrorModeActive', () => {
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

    it('should return { isActive: true } when Mirror Mode is enabled', () => {
      commandsManager.runCommand.mockReturnValue(true);

      const result = evaluators.isMirrorModeActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabled');
      expect(result).toEqual({ disabled: false, isActive: true });
    });

    it('should return { isActive: false } when Mirror Mode is disabled', () => {
      commandsManager.runCommand.mockReturnValue(false);

      const result = evaluators.isMirrorModeActive();

      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabled');
      expect(result).toEqual({ disabled: false, isActive: false });
    });

    it('should return { isActive: false } when command returns non-boolean value (string)', () => {
      // 엄격한 === true 체크: string "true"는 false로 처리해야 함
      commandsManager.runCommand.mockReturnValue('true');

      const result = evaluators.isMirrorModeActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns undefined', () => {
      commandsManager.runCommand.mockReturnValue(undefined);

      const result = evaluators.isMirrorModeActive();

      expect(result.isActive).toBe(false);
    });

    it('should return { isActive: false } when command returns null', () => {
      commandsManager.runCommand.mockReturnValue(null);

      const result = evaluators.isMirrorModeActive();

      expect(result.isActive).toBe(false);
    });

    it('should handle errors gracefully and return { isActive: false }', () => {
      commandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command execution failed');
      });

      const result = evaluators.isMirrorModeActive();

      expect(result).toEqual({ disabled: false, isActive: false });
      expect(console.error).toHaveBeenCalledWith(
        'Error evaluating Mirror Mode state:',
        expect.any(Error)
      );
    });

    it('should call runCommand exactly once per evaluation', () => {
      commandsManager.runCommand.mockReturnValue(true);

      evaluators.isMirrorModeActive();

      expect(commandsManager.runCommand).toHaveBeenCalledTimes(1);
    });

    it('should reflect real-time state changes', () => {
      // First call: Mirror Mode ON
      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isMirrorModeActive().isActive).toBe(true);

      // Second call: Mirror Mode OFF
      commandsManager.runCommand.mockReturnValueOnce(false);
      expect(evaluators.isMirrorModeActive().isActive).toBe(false);

      // Third call: Mirror Mode ON again
      commandsManager.runCommand.mockReturnValueOnce(true);
      expect(evaluators.isMirrorModeActive().isActive).toBe(true);
    });

    it('should always have disabled: false (Mirror Mode button is always clickable)', () => {
      // Mirror Mode 버튼은 항상 클릭 가능 (disabled 없음)
      commandsManager.runCommand.mockReturnValue(true);
      expect(evaluators.isMirrorModeActive().disabled).toBe(false);

      commandsManager.runCommand.mockReturnValue(false);
      expect(evaluators.isMirrorModeActive().disabled).toBe(false);
    });
  });

  describe('module structure', () => {
    it('should export isMirrorModeActive evaluator', () => {
      expect(evaluators).toHaveProperty('isMirrorModeActive');
      expect(typeof evaluators.isMirrorModeActive).toBe('function');
    });

    it('should not expose other properties', () => {
      const keys = Object.keys(evaluators);
      expect(keys).toEqual(['isMirrorModeActive']);
    });

    it('should be a function that returns an object', () => {
      commandsManager.runCommand.mockReturnValue(true);
      const result = evaluators.isMirrorModeActive();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('disabled');
      expect(result).toHaveProperty('isActive');
    });

    it('should pass correct command name to runCommand', () => {
      commandsManager.runCommand.mockReturnValue(true);
      evaluators.isMirrorModeActive();
      expect(commandsManager.runCommand).toHaveBeenCalledWith('isMirrorModeEnabled');
    });

    it('should not call runCommand with additional arguments', () => {
      commandsManager.runCommand.mockReturnValue(true);
      evaluators.isMirrorModeActive();
      const callArgs = commandsManager.runCommand.mock.calls[0];
      expect(callArgs.length).toBe(1);
    });
  });
});
