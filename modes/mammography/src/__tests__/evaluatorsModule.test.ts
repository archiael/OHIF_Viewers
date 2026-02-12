/**
 * Unit tests for mammography evaluatorsModule
 * Tests toolbar button state evaluators
 */

import evaluatorsModule from '../evaluatorsModule';

describe('evaluatorsModule', () => {
  let mockCommandsManager;
  let evaluators;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCommandsManager = {
      runCommand: jest.fn(),
    };

    evaluators = evaluatorsModule({ commandsManager: mockCommandsManager });
  });

  describe('evaluate.mammography.magnify', () => {
    let magnifyEvaluator;

    beforeEach(() => {
      magnifyEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.magnify'
      );
    });

    it('should exist', () => {
      expect(magnifyEvaluator).toBeDefined();
      expect(magnifyEvaluator.evaluate).toBeInstanceOf(Function);
    });

    it('should return active state when magnified', () => {
      mockCommandsManager.runCommand.mockReturnValue(true);

      const result = magnifyEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: 'active',
        isActive: true,
      });

      expect(mockCommandsManager.runCommand).toHaveBeenCalledWith(
        'isMammoMagnified',
        {},
        'MAMMOGRAPHY'
      );
    });

    it('should return inactive state when not magnified', () => {
      mockCommandsManager.runCommand.mockReturnValue(false);

      const result = magnifyEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });

    it('should handle errors gracefully', () => {
      mockCommandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command error');
      });

      const result = magnifyEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });
  });

  describe('evaluate.mammography.sync', () => {
    let syncEvaluator;

    beforeEach(() => {
      syncEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.sync'
      );
    });

    it('should exist', () => {
      expect(syncEvaluator).toBeDefined();
      expect(syncEvaluator.evaluate).toBeInstanceOf(Function);
    });

    it('should return active state when sync enabled', () => {
      mockCommandsManager.runCommand.mockReturnValue(true);

      const result = syncEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: 'active',
        isActive: true,
      });

      expect(mockCommandsManager.runCommand).toHaveBeenCalledWith(
        'isMammoSyncEnabled',
        {},
        'MAMMOGRAPHY'
      );
    });

    it('should return inactive state when sync disabled', () => {
      mockCommandsManager.runCommand.mockReturnValue(false);

      const result = syncEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });

    it('should handle errors gracefully', () => {
      mockCommandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command error');
      });

      const result = syncEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });
  });

  describe('evaluate.mammography.compare', () => {
    let compareEvaluator;

    beforeEach(() => {
      compareEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.compare'
      );
    });

    it('should exist', () => {
      expect(compareEvaluator).toBeDefined();
      expect(compareEvaluator.evaluate).toBeInstanceOf(Function);
    });

    it('should return active state when compare mode active', () => {
      mockCommandsManager.runCommand.mockReturnValue(true);

      const result = compareEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: 'active',
        isActive: true,
      });

      expect(mockCommandsManager.runCommand).toHaveBeenCalledWith(
        'isMammoCompareActive',
        {},
        'MAMMOGRAPHY'
      );
    });

    it('should return inactive state when compare mode inactive', () => {
      mockCommandsManager.runCommand.mockReturnValue(false);

      const result = compareEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });

    it('should handle errors gracefully', () => {
      mockCommandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command error');
      });

      const result = compareEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });
  });

  describe('evaluate.mammography.mirrorMode', () => {
    let mirrorModeEvaluator;

    beforeEach(() => {
      mirrorModeEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.mirrorMode'
      );
    });

    it('should exist', () => {
      expect(mirrorModeEvaluator).toBeDefined();
      expect(mirrorModeEvaluator.evaluate).toBeInstanceOf(Function);
    });

    it('should return active state when mirror mode enabled', () => {
      mockCommandsManager.runCommand.mockReturnValue(true);

      const result = mirrorModeEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: 'active',
        isActive: true,
      });

      expect(mockCommandsManager.runCommand).toHaveBeenCalledWith(
        'isMirrorModeEnabled',
        {},
        'MAMMOGRAPHY'
      );
    });

    it('should return inactive state when mirror mode disabled', () => {
      mockCommandsManager.runCommand.mockReturnValue(false);

      const result = mirrorModeEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });

    it('should handle errors gracefully', () => {
      mockCommandsManager.runCommand.mockImplementation(() => {
        throw new Error('Command error');
      });

      const result = mirrorModeEvaluator.evaluate({
        viewportId: 'viewport1',
        button: {},
      });

      expect(result).toMatchObject({
        disabled: false,
        className: '',
        isActive: false,
      });
    });
  });

  describe('module structure', () => {
    it('should return array of evaluators', () => {
      expect(Array.isArray(evaluators)).toBe(true);
      expect(evaluators.length).toBe(4);
    });

    it('should have all required evaluators', () => {
      const evaluatorNames = evaluators.map(e => e.name);

      expect(evaluatorNames).toContain('evaluate.mammography.magnify');
      expect(evaluatorNames).toContain('evaluate.mammography.sync');
      expect(evaluatorNames).toContain('evaluate.mammography.compare');
      expect(evaluatorNames).toContain('evaluate.mammography.mirrorMode');
    });

    it('should have proper evaluator structure', () => {
      evaluators.forEach(evaluator => {
        expect(evaluator).toHaveProperty('name');
        expect(evaluator).toHaveProperty('evaluate');
        expect(typeof evaluator.name).toBe('string');
        expect(typeof evaluator.evaluate).toBe('function');
      });
    });
  });

  describe('evaluator parameters', () => {
    it('should receive viewportId parameter', () => {
      const magnifyEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.magnify'
      );

      mockCommandsManager.runCommand.mockReturnValue(false);

      magnifyEvaluator.evaluate({
        viewportId: 'test-viewport-123',
        button: {},
      });

      // Evaluator should work regardless of viewportId
      expect(mockCommandsManager.runCommand).toHaveBeenCalled();
    });

    it('should receive button parameter', () => {
      const magnifyEvaluator = evaluators.find(
        e => e.name === 'evaluate.mammography.magnify'
      );

      mockCommandsManager.runCommand.mockReturnValue(false);

      const testButton = { id: 'test-button' };
      magnifyEvaluator.evaluate({
        viewportId: 'viewport1',
        button: testButton,
      });

      expect(mockCommandsManager.runCommand).toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should always return disabled property', () => {
      evaluators.forEach(evaluator => {
        mockCommandsManager.runCommand.mockReturnValue(true);
        const result = evaluator.evaluate({
          viewportId: 'viewport1',
          button: {},
        });

        expect(result).toHaveProperty('disabled');
        expect(typeof result.disabled).toBe('boolean');
      });
    });

    it('should always return className property', () => {
      evaluators.forEach(evaluator => {
        mockCommandsManager.runCommand.mockReturnValue(true);
        const result = evaluator.evaluate({
          viewportId: 'viewport1',
          button: {},
        });

        expect(result).toHaveProperty('className');
        expect(typeof result.className).toBe('string');
      });
    });

    it('should always return isActive property', () => {
      evaluators.forEach(evaluator => {
        mockCommandsManager.runCommand.mockReturnValue(true);
        const result = evaluator.evaluate({
          viewportId: 'viewport1',
          button: {},
        });

        expect(result).toHaveProperty('isActive');
        expect(typeof result.isActive).toBe('boolean');
      });
    });
  });
});
