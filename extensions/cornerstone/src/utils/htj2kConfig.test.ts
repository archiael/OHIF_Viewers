/**
 * HTJ2K Config Unit Tests
 *
 * @description
 * htj2kConfig.ts의 핵심 기능을 테스트합니다.
 * - 기본 설정 및 초기화
 * - Server API 관련 함수들
 * - URL 파라미터 처리
 *
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - 클라이언트 구현 스펙
 */

import {
  initHTJ2KConfig,
  getHTJ2KConfig,
  isHTJ2KEnabled,
  getDecodeLevel,
  getResolutionFactor,
  isStreamingEnabled,
  updateHTJ2KConfig,
  resetHTJ2KConfig,
  switchStackToFullResolution,
  resetStackDecodeLevel,
  isServerApiEnabled,
  getServerApiConfig,
  appendLevelParam,
  appendComplementParam,
  appendLevelParamToImageId,
  detectServerApiSupport,
  detectServerApiSupportFromXHR,
  resetServerApiDetection,
  getServerApiDetectionStatus,
} from './htj2kConfig';

// Mock initRangeRequestConfig
jest.mock('./htj2kRangeRequest', () => ({
  initRangeRequestConfig: jest.fn(),
}));

describe('htj2kConfig', () => {
  // Reset config before each test
  beforeEach(() => {
    resetHTJ2KConfig();
    resetServerApiDetection();
  });

  // ==========================================================================
  // Basic Configuration Tests
  // ==========================================================================
  describe('Basic Configuration', () => {
    it('should have default values after reset', () => {
      const config = getHTJ2KConfig();

      expect(config.enabled).toBe(true);
      expect(config.volumeDecodeLevel).toBe(2);
      expect(config.stackDecodeLevel).toBe(0);
      expect(config.stackFullResolutionOnScroll).toBe(true);
      expect(config.streaming).toBe(false);
    });

    it('should return HTJ2K enabled status', () => {
      expect(isHTJ2KEnabled()).toBe(true);

      updateHTJ2KConfig({ enabled: false });
      expect(isHTJ2KEnabled()).toBe(false);
    });

    it('should return correct decode level for volume', () => {
      expect(getDecodeLevel('volume')).toBe(2);
    });

    it('should return correct decode level for stack', () => {
      expect(getDecodeLevel('stack')).toBe(0);
    });

    it('should return 0 when HTJ2K is disabled', () => {
      updateHTJ2KConfig({ enabled: false });
      expect(getDecodeLevel('volume')).toBe(0);
      expect(getDecodeLevel('stack')).toBe(0);
    });

    it('should return streaming status', () => {
      expect(isStreamingEnabled()).toBe(false);

      updateHTJ2KConfig({ streaming: true });
      expect(isStreamingEnabled()).toBe(true);
    });
  });

  // ==========================================================================
  // Resolution Factor Tests
  // ==========================================================================
  describe('getResolutionFactor', () => {
    it('should calculate resolution factor for volume (2^2 = 4)', () => {
      expect(getResolutionFactor('volume')).toBe(4);
    });

    it('should calculate resolution factor for stack (2^0 = 1)', () => {
      expect(getResolutionFactor('stack')).toBe(1);
    });

    it('should return 1 when HTJ2K is disabled', () => {
      updateHTJ2KConfig({ enabled: false });
      expect(getResolutionFactor('volume')).toBe(1);
      expect(getResolutionFactor('stack')).toBe(1);
    });

    it('should calculate correct factor for different levels', () => {
      updateHTJ2KConfig({ volumeDecodeLevel: 3 });
      expect(getResolutionFactor('volume')).toBe(8); // 2^3

      updateHTJ2KConfig({ volumeDecodeLevel: 1 });
      expect(getResolutionFactor('volume')).toBe(2); // 2^1
    });
  });

  // ==========================================================================
  // Config Update Tests
  // ==========================================================================
  describe('updateHTJ2KConfig', () => {
    it('should update single property', () => {
      updateHTJ2KConfig({ volumeDecodeLevel: 3 });
      expect(getHTJ2KConfig().volumeDecodeLevel).toBe(3);
    });

    it('should update multiple properties', () => {
      updateHTJ2KConfig({
        volumeDecodeLevel: 1,
        stackDecodeLevel: 2,
        streaming: true,
      });

      const config = getHTJ2KConfig();
      expect(config.volumeDecodeLevel).toBe(1);
      expect(config.stackDecodeLevel).toBe(2);
      expect(config.streaming).toBe(true);
    });
  });

  // ==========================================================================
  // Stack Resolution Switch Tests
  // ==========================================================================
  describe('Stack Resolution Switch', () => {
    it('should switch stack to full resolution', () => {
      updateHTJ2KConfig({ stackDecodeLevel: 2 });
      expect(getDecodeLevel('stack')).toBe(2);

      switchStackToFullResolution();
      expect(getDecodeLevel('stack')).toBe(0);
    });

    it('should reset stack decode level', () => {
      switchStackToFullResolution();
      expect(getDecodeLevel('stack')).toBe(0);

      resetStackDecodeLevel(2);
      expect(getDecodeLevel('stack')).toBe(2);
    });

    it('should use default level when resetting without argument', () => {
      switchStackToFullResolution();
      resetStackDecodeLevel();
      expect(getDecodeLevel('stack')).toBe(2);
    });
  });

  // ==========================================================================
  // initHTJ2KConfig Tests
  // ==========================================================================
  describe('initHTJ2KConfig', () => {
    it('should initialize with app config', () => {
      const appConfig = {
        htj2k: {
          enabled: true,
          volumeDecodeLevel: 3,
          stackDecodeLevel: 1,
          streaming: true,
        },
      };

      initHTJ2KConfig(appConfig);
      const config = getHTJ2KConfig();

      expect(config.enabled).toBe(true);
      expect(config.volumeDecodeLevel).toBe(3);
      expect(config.stackDecodeLevel).toBe(1);
      expect(config.streaming).toBe(true);
    });

    it('should use defaults when htj2k is not in config', () => {
      initHTJ2KConfig({});
      const config = getHTJ2KConfig();

      expect(config.enabled).toBe(true);
      expect(config.volumeDecodeLevel).toBe(2);
    });

    it('should merge serverApi config', () => {
      const appConfig = {
        htj2k: {
          serverApi: {
            enabled: true,
            volumeLevel: 3,
          },
        },
      };

      initHTJ2KConfig(appConfig);
      const serverApiConfig = getServerApiConfig();

      expect(serverApiConfig.enabled).toBe(true);
      expect(serverApiConfig.volumeLevel).toBe(3);
      expect(serverApiConfig.levelParam).toBe('level'); // default preserved
    });
  });

  // ==========================================================================
  // Server API Configuration Tests
  // ==========================================================================
  describe('Server API Configuration', () => {
    it('should return default server API config', () => {
      const config = getServerApiConfig();

      expect(config.enabled).toBe(false);
      expect(config.levelParam).toBe('level');
      expect(config.complementParam).toBe('complement');
      expect(config.volumeLevel).toBe(2);
      expect(config.autoDetect).toBe(true);
    });

    it('should return server API disabled by default', () => {
      expect(isServerApiEnabled()).toBe(false);
    });

    it('should return server API enabled when configured', () => {
      initHTJ2KConfig({
        htj2k: {
          serverApi: { enabled: true },
        },
      });

      expect(isServerApiEnabled()).toBe(true);
    });

    it('should return false when HTJ2K is disabled', () => {
      initHTJ2KConfig({
        htj2k: {
          enabled: false,
          serverApi: { enabled: true },
        },
      });

      expect(isServerApiEnabled()).toBe(false);
    });
  });

  // ==========================================================================
  // appendLevelParam Tests
  // ==========================================================================
  describe('appendLevelParam', () => {
    beforeEach(() => {
      // Enable server API for these tests
      initHTJ2KConfig({
        htj2k: {
          serverApi: {
            enabled: true,
            levelParam: 'level',
            volumeLevel: 2,
          },
        },
      });
    });

    it('should append level param to URL without query string', () => {
      const result = appendLevelParam('https://server/frames/1', 2);
      expect(result).toBe('https://server/frames/1?level=2');
    });

    it('should append level param with & when URL has query string', () => {
      const result = appendLevelParam('https://server/frames/1?existing=param', 2);
      expect(result).toBe('https://server/frames/1?existing=param&level=2');
    });

    it('should use volumeLevel as default when level is not specified', () => {
      const result = appendLevelParam('https://server/frames/1');
      expect(result).toBe('https://server/frames/1?level=2');
    });

    it('should return original URL when server API is disabled', () => {
      resetHTJ2KConfig();
      const result = appendLevelParam('https://server/frames/1', 2);
      expect(result).toBe('https://server/frames/1');
    });
  });

  // ==========================================================================
  // appendComplementParam Tests
  // ==========================================================================
  describe('appendComplementParam', () => {
    beforeEach(() => {
      initHTJ2KConfig({
        htj2k: {
          serverApi: {
            enabled: true,
            complementParam: 'complement',
          },
        },
      });
    });

    it('should append complement param to URL', () => {
      const result = appendComplementParam('https://server/frames/1', 2);
      expect(result).toBe('https://server/frames/1?complement=2');
    });

    it('should append complement param with & when URL has query string', () => {
      const result = appendComplementParam('https://server/frames/1?existing=param', 2);
      expect(result).toBe('https://server/frames/1?existing=param&complement=2');
    });

    it('should return original URL when server API is disabled', () => {
      resetHTJ2KConfig();
      const result = appendComplementParam('https://server/frames/1', 2);
      expect(result).toBe('https://server/frames/1');
    });
  });

  // ==========================================================================
  // appendLevelParamToImageId Tests
  // ==========================================================================
  describe('appendLevelParamToImageId', () => {
    beforeEach(() => {
      initHTJ2KConfig({
        htj2k: {
          serverApi: {
            enabled: true,
            levelParam: 'level',
            volumeLevel: 2,
          },
        },
      });
    });

    it('should append level param to wadors imageId', () => {
      const result = appendLevelParamToImageId('wadors:https://server/frames/1', 2);
      expect(result).toBe('wadors:https://server/frames/1?level=2');
    });

    it('should preserve wadors prefix', () => {
      const result = appendLevelParamToImageId('wadors:https://server/frames/1');
      expect(result.startsWith('wadors:')).toBe(true);
    });

    it('should return original imageId for non-wadors scheme', () => {
      const imageId = 'dicomfile:///path/to/file.dcm';
      const result = appendLevelParamToImageId(imageId, 2);
      expect(result).toBe(imageId);
    });

    it('should return original imageId when server API is disabled', () => {
      resetHTJ2KConfig();
      const imageId = 'wadors:https://server/frames/1';
      const result = appendLevelParamToImageId(imageId, 2);
      expect(result).toBe(imageId);
    });
  });

  // ==========================================================================
  // Server API Detection Tests
  // ==========================================================================
  describe('Server API Detection', () => {
    beforeEach(() => {
      initHTJ2KConfig({
        htj2k: {
          serverApi: {
            enabled: true,
            autoDetect: true,
          },
        },
      });
    });

    it('should return null for initial detection status', () => {
      expect(getServerApiDetectionStatus()).toBeNull();
    });

    it('should detect server API support from Response headers', () => {
      const mockResponse = {
        headers: {
          has: jest.fn().mockReturnValue(true),
          get: jest.fn().mockReturnValue('2'),
        },
      } as unknown as Response;

      const result = detectServerApiSupport(mockResponse);

      expect(result).toBe(true);
      expect(getServerApiDetectionStatus()).toBe(true);
    });

    it('should detect no server API support from Response headers', () => {
      const mockResponse = {
        headers: {
          has: jest.fn().mockReturnValue(false),
          get: jest.fn().mockReturnValue(null),
        },
      } as unknown as Response;

      const result = detectServerApiSupport(mockResponse);

      expect(result).toBe(false);
      expect(getServerApiDetectionStatus()).toBe(false);
    });

    it('should detect server API support from XHR', () => {
      const mockXHR = {
        getResponseHeader: jest.fn().mockReturnValue('2'),
      } as unknown as XMLHttpRequest;

      const result = detectServerApiSupportFromXHR(mockXHR);

      expect(result).toBe(true);
      expect(getServerApiDetectionStatus()).toBe(true);
    });

    it('should detect no server API support from XHR', () => {
      const mockXHR = {
        getResponseHeader: jest.fn().mockReturnValue(null),
      } as unknown as XMLHttpRequest;

      const result = detectServerApiSupportFromXHR(mockXHR);

      expect(result).toBe(false);
      expect(getServerApiDetectionStatus()).toBe(false);
    });

    it('should reset detection status', () => {
      const mockXHR = {
        getResponseHeader: jest.fn().mockReturnValue('2'),
      } as unknown as XMLHttpRequest;

      detectServerApiSupportFromXHR(mockXHR);
      expect(getServerApiDetectionStatus()).toBe(true);

      resetServerApiDetection();
      expect(getServerApiDetectionStatus()).toBeNull();
    });

    it('should disable server API when auto-detect finds no support', () => {
      // First, enable server API
      expect(isServerApiEnabled()).toBe(true);

      // Then detect no support
      const mockXHR = {
        getResponseHeader: jest.fn().mockReturnValue(null),
      } as unknown as XMLHttpRequest;

      detectServerApiSupportFromXHR(mockXHR);

      // Should now be disabled
      expect(isServerApiEnabled()).toBe(false);
    });
  });

  // ==========================================================================
  // resetHTJ2KConfig Tests
  // ==========================================================================
  describe('resetHTJ2KConfig', () => {
    it('should reset all config to defaults', () => {
      updateHTJ2KConfig({
        enabled: false,
        volumeDecodeLevel: 3,
        stackDecodeLevel: 3,
        streaming: true,
      });

      resetHTJ2KConfig();

      const config = getHTJ2KConfig();
      expect(config.enabled).toBe(true);
      expect(config.volumeDecodeLevel).toBe(2);
      expect(config.stackDecodeLevel).toBe(0);
      expect(config.streaming).toBe(false);
    });

    it('should reset server API config to defaults', () => {
      initHTJ2KConfig({
        htj2k: {
          serverApi: {
            enabled: true,
            volumeLevel: 3,
          },
        },
      });

      resetHTJ2KConfig();

      const serverApiConfig = getServerApiConfig();
      expect(serverApiConfig.enabled).toBe(false);
      expect(serverApiConfig.volumeLevel).toBe(2);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================
  describe('Integration: Real-world scenarios', () => {
    it('should correctly configure for DICOMweb server with Server API', () => {
      // Simulate config from local_dcm4chee.js
      const appConfig = {
        htj2k: {
          enabled: true,
          volumeDecodeLevel: 2,
          stackDecodeLevel: 2,
          streaming: false,
          serverApi: {
            enabled: true,
            levelParam: 'level',
            complementParam: 'complement',
            volumeLevel: 2,
            autoDetect: true,
          },
        },
      };

      initHTJ2KConfig(appConfig);

      // Verify configuration
      expect(isHTJ2KEnabled()).toBe(true);
      expect(isServerApiEnabled()).toBe(true);
      expect(getDecodeLevel('volume')).toBe(2);
      expect(getResolutionFactor('volume')).toBe(4);

      // Test URL modification
      const originalUrl = 'https://192.168.10.237:8080/dicomweb/studies/123/series/456/instances/789/frames/1';
      const modifiedUrl = appendLevelParam(originalUrl, 2);
      expect(modifiedUrl).toContain('?level=2');

      // Test complement URL
      const complementUrl = appendComplementParam(originalUrl, 2);
      expect(complementUrl).toContain('?complement=2');
    });

    it('should correctly configure for AWS CloudFront (no Server API)', () => {
      // Simulate config for default.js (AWS CloudFront)
      const appConfig = {
        htj2k: {
          enabled: true,
          volumeDecodeLevel: 0,
          stackDecodeLevel: 0,
          streaming: false,
          serverApi: {
            enabled: false, // AWS S3 doesn't support Server API
          },
        },
      };

      initHTJ2KConfig(appConfig);

      // Verify configuration
      expect(isHTJ2KEnabled()).toBe(true);
      expect(isServerApiEnabled()).toBe(false);
      expect(getDecodeLevel('volume')).toBe(0);
      expect(getResolutionFactor('volume')).toBe(1);

      // URL should not be modified
      const originalUrl = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb/frames/1';
      const resultUrl = appendLevelParam(originalUrl, 2);
      expect(resultUrl).toBe(originalUrl); // No modification
    });
  });
});
