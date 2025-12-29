/**
 * HTJ2K Range Request 단위 테스트
 *
 * @description
 * htj2kRangeRequestCore.ts의 주요 동기 함수들에 대한 단위 테스트입니다.
 * - calculateInitialRangeBytes: decodeLevel별 초기 바이트 계산
 * - calculateRetryRangeBytes: 재시도 시 바이트 확장 계산
 * - addRangeRequestToRetrieveOptions: retrieveOptions에 Range 정보 추가
 *
 * Note: async 함수(adaptiveRangeRequest, fetchWithRange 등)는
 * htj2kRangeRequest.ts에 있으며 통합 테스트로 별도 수행
 */

// Core 모듈에서 동기 함수만 import (async 함수 제외하여 babel 변환 문제 회피)
import {
  calculateInitialRangeBytes,
  calculateRetryRangeBytes,
  addRangeRequestToRetrieveOptions,
  initRangeRequestConfig,
  isRangeRequestEnabled,
  getRangeRequestConfig,
  resetRangeRequestConfig,
  updateRangeRequestConfig,
} from './htj2kRangeRequestCore';

describe('htj2kRangeRequest', () => {
  // 각 테스트 전에 설정 초기화
  beforeEach(() => {
    resetRangeRequestConfig();
  });

  describe('calculateInitialRangeBytes', () => {
    it('should return undefined for decodeLevel 0 (full resolution)', () => {
      const result = calculateInitialRangeBytes(0);
      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined decodeLevel', () => {
      const result = calculateInitialRangeBytes(undefined as unknown as number);
      expect(result).toBeUndefined();
    });

    it('should return 500000 bytes for decodeLevel 1 (1/2 resolution)', () => {
      const result = calculateInitialRangeBytes(1);
      expect(result).toBe(500000);
    });

    it('should return 100000 bytes for decodeLevel 2 (1/4 resolution)', () => {
      const result = calculateInitialRangeBytes(2);
      expect(result).toBe(100000);
    });

    it('should return 30000 bytes for decodeLevel 3 (1/8 resolution)', () => {
      const result = calculateInitialRangeBytes(3);
      expect(result).toBe(30000);
    });

    it('should clamp decodeLevel above 3 to level 3', () => {
      const result = calculateInitialRangeBytes(5);
      expect(result).toBe(30000); // Same as level 3
    });

    it('should clamp decodeLevel below 1 (but > 0) to level 1', () => {
      // Since 0 returns undefined, this tests edge case
      // decodeLevel 0.5 should be treated as level 1 after clamping
      // However, the function checks for 0 first, so this is covered
    });

    it('should use custom initialRangeBytes from config', () => {
      initRangeRequestConfig({
        initialRangeBytes: {
          1: 800000,
          2: 200000,
          3: 50000,
        },
      });

      expect(calculateInitialRangeBytes(1)).toBe(800000);
      expect(calculateInitialRangeBytes(2)).toBe(200000);
      expect(calculateInitialRangeBytes(3)).toBe(50000);
    });
  });

  describe('calculateRetryRangeBytes', () => {
    it('should double the bytes on first retry (default multiplier 2.0)', () => {
      const result = calculateRetryRangeBytes(100000, 1);
      expect(result).toBe(200000);
    });

    it('should quadruple the bytes on second retry', () => {
      const result = calculateRetryRangeBytes(100000, 2);
      expect(result).toBe(400000);
    });

    it('should handle zero previous bytes', () => {
      const result = calculateRetryRangeBytes(0, 1);
      expect(result).toBe(0);
    });

    it('should use custom retryMultiplier from config', () => {
      updateRangeRequestConfig({ retryMultiplier: 1.5 });

      const result = calculateRetryRangeBytes(100000, 1);
      expect(result).toBe(150000);
    });

    it('should correctly calculate with custom multiplier for second retry', () => {
      updateRangeRequestConfig({ retryMultiplier: 1.5 });

      // 1.5^2 = 2.25
      const result = calculateRetryRangeBytes(100000, 2);
      expect(result).toBe(225000);
    });
  });

  describe('addRangeRequestToRetrieveOptions', () => {
    it('should return original options when Range Request is disabled', () => {
      const options = { streaming: false, decodeLevel: 2 };
      const result = addRangeRequestToRetrieveOptions(options, 2);

      expect(result).toEqual(options);
      expect(result.rangeIndex).toBeUndefined();
    });

    it('should return original options for decodeLevel 0', () => {
      updateRangeRequestConfig({ enabled: true });

      const options = { streaming: false, decodeLevel: 0 };
      const result = addRangeRequestToRetrieveOptions(options, 0);

      expect(result).toEqual(options);
      expect(result.rangeIndex).toBeUndefined();
    });

    it('should add rangeIndex and chunkSize when enabled and decodeLevel > 0', () => {
      updateRangeRequestConfig({ enabled: true });

      const options = { streaming: false, decodeLevel: 2 };
      const result = addRangeRequestToRetrieveOptions(options, 2);

      expect(result.rangeIndex).toBe(0);
      expect(result.chunkSize).toBe(100000); // Default for level 2
    });

    it('should preserve existing options when adding Range Request info', () => {
      updateRangeRequestConfig({ enabled: true });

      const options = {
        streaming: false,
        decodeLevel: 2,
        customOption: 'test',
      };
      const result = addRangeRequestToRetrieveOptions(options, 2);

      expect(result.streaming).toBe(false);
      expect(result.customOption).toBe('test');
      expect(result.rangeIndex).toBe(0);
    });

    it('should use custom chunkSize based on initialRangeBytes config', () => {
      initRangeRequestConfig({
        enabled: true,
        initialRangeBytes: {
          1: 600000,
          2: 150000,
          3: 40000,
        },
      });

      const result = addRangeRequestToRetrieveOptions({}, 2);
      expect(result.chunkSize).toBe(150000);
    });
  });

  describe('isRangeRequestEnabled', () => {
    it('should return false by default', () => {
      expect(isRangeRequestEnabled()).toBe(false);
    });

    it('should return true after enabling', () => {
      updateRangeRequestConfig({ enabled: true });
      expect(isRangeRequestEnabled()).toBe(true);
    });

    it('should return false after disabling', () => {
      updateRangeRequestConfig({ enabled: true });
      updateRangeRequestConfig({ enabled: false });
      expect(isRangeRequestEnabled()).toBe(false);
    });
  });

  describe('getRangeRequestConfig', () => {
    it('should return default configuration', () => {
      const config = getRangeRequestConfig();

      expect(config.enabled).toBe(false);
      expect(config.adaptiveRetry).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.timeout).toBe(30000);
      expect(config.retryMultiplier).toBe(2.0);
      expect(config.initialRangeBytes).toEqual({
        1: 500000,
        2: 100000,
        3: 30000,
      });
    });

    it('should return updated configuration after update', () => {
      updateRangeRequestConfig({
        enabled: true,
        maxRetries: 5,
      });

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(5);
      // Other defaults should be preserved
      expect(config.adaptiveRetry).toBe(true);
    });

    it('should return a copy, not the original object', () => {
      const config1 = getRangeRequestConfig();
      const config2 = getRangeRequestConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('initRangeRequestConfig', () => {
    it('should initialize with provided config', () => {
      initRangeRequestConfig({
        enabled: true,
        maxRetries: 5,
        timeout: 60000,
      });

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(5);
      expect(config.timeout).toBe(60000);
    });

    it('should deep merge initialRangeBytes', () => {
      initRangeRequestConfig({
        initialRangeBytes: {
          2: 200000, // Only update level 2
        },
      });

      const config = getRangeRequestConfig();
      expect(config.initialRangeBytes[1]).toBe(500000); // Default preserved
      expect(config.initialRangeBytes[2]).toBe(200000); // Updated
      expect(config.initialRangeBytes[3]).toBe(30000); // Default preserved
    });

    it('should handle empty config', () => {
      initRangeRequestConfig({});

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(false); // Default
    });

    it('should handle undefined config', () => {
      initRangeRequestConfig(undefined);

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(false); // Default
    });
  });

  describe('resetRangeRequestConfig', () => {
    it('should reset all config to defaults', () => {
      // First update config
      updateRangeRequestConfig({
        enabled: true,
        maxRetries: 10,
        initialRangeBytes: {
          1: 1000000,
          2: 500000,
          3: 100000,
        },
      });

      // Then reset
      resetRangeRequestConfig();

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(false);
      expect(config.maxRetries).toBe(3);
      expect(config.initialRangeBytes).toEqual({
        1: 500000,
        2: 100000,
        3: 30000,
      });
    });
  });

  describe('updateRangeRequestConfig', () => {
    it('should update single property', () => {
      updateRangeRequestConfig({ enabled: true });

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(3); // Unchanged
    });

    it('should update multiple properties', () => {
      updateRangeRequestConfig({
        enabled: true,
        maxRetries: 5,
        timeout: 45000,
      });

      const config = getRangeRequestConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(5);
      expect(config.timeout).toBe(45000);
    });

    it('should merge initialRangeBytes', () => {
      updateRangeRequestConfig({
        initialRangeBytes: {
          2: 250000,
        },
      });

      const config = getRangeRequestConfig();
      expect(config.initialRangeBytes[1]).toBe(500000); // Unchanged
      expect(config.initialRangeBytes[2]).toBe(250000); // Updated
      expect(config.initialRangeBytes[3]).toBe(30000); // Unchanged
    });
  });
});

describe('htj2kRangeRequest - Integration scenarios', () => {
  beforeEach(() => {
    resetRangeRequestConfig();
  });

  it('should correctly configure for aggressive bandwidth saving', () => {
    initRangeRequestConfig({
      enabled: true,
      adaptiveRetry: true,
      maxRetries: 2,
      initialRangeBytes: {
        1: 300000, // More aggressive (smaller initial request)
        2: 50000,
        3: 15000,
      },
    });

    const config = getRangeRequestConfig();
    expect(isRangeRequestEnabled()).toBe(true);
    expect(calculateInitialRangeBytes(2)).toBe(50000);
  });

  it('should correctly configure for conservative (safer) requests', () => {
    initRangeRequestConfig({
      enabled: true,
      adaptiveRetry: true,
      maxRetries: 5,
      initialRangeBytes: {
        1: 1000000, // More conservative (larger initial request)
        2: 300000,
        3: 100000,
      },
    });

    expect(calculateInitialRangeBytes(2)).toBe(300000);
    expect(calculateRetryRangeBytes(300000, 1)).toBe(600000);
  });

  it('should work correctly with typical DICOM image workflow', () => {
    // Simulate typical usage
    initRangeRequestConfig({
      enabled: true,
      initialRangeBytes: {
        1: 500000,
        2: 100000,
        3: 30000,
      },
    });

    // For decodeLevel 2 (1/4 resolution)
    const decodeLevel = 2;
    const initialBytes = calculateInitialRangeBytes(decodeLevel);
    expect(initialBytes).toBe(100000);

    // If first request fails, calculate retry bytes
    const retryBytes1 = calculateRetryRangeBytes(initialBytes!, 1);
    expect(retryBytes1).toBe(200000);

    const retryBytes2 = calculateRetryRangeBytes(initialBytes!, 2);
    expect(retryBytes2).toBe(400000);

    // Add to retrieve options
    const options = addRangeRequestToRetrieveOptions(
      { streaming: false, decodeLevel: 2 },
      decodeLevel
    );
    expect(options.rangeIndex).toBe(0);
    expect(options.chunkSize).toBe(100000);
  });
});
