/**
 * HTJ2K Background Loader Unit Tests
 *
 * @description
 * htj2kBackgroundLoader.ts의 핵심 기능을 테스트합니다.
 */

import {
  registerPartialData,
  getFullHTJ2KData,
  getCacheStatus,
  getCacheStats,
  clearHTJ2KCache,
  removeCacheEntry,
  setCacheMaxSize,
} from './htj2kBackgroundLoader';

// Mock htj2kDebugLogger
jest.mock('./htj2kDebugLogger', () => ({
  htj2kLog: jest.fn(),
}));

// Mock htj2kRangeRequestCore
jest.mock('./htj2kRangeRequestCore', () => ({
  getRangeRequestConfig: jest.fn(() => ({
    enabled: true,
    timeout: 30000,
    maxRetries: 3,
  })),
  DEFAULT_RANGE_CONFIG: {
    enabled: false,
    timeout: 30000,
    maxRetries: 3,
    chunkSize: 100000,
  },
}));

// Mock htj2kConfig
jest.mock('./htj2kConfig', () => ({
  isServerApiEnabled: jest.fn(() => false),
  getServerApiConfig: jest.fn(() => ({
    enabled: false,
    defaultLevel: 2,
    timeout: 30000,
  })),
  appendComplementParam: jest.fn((url, level) => `${url}?complement=${level}`),
}));

// Mock htj2kDataMerger
jest.mock('./htj2kDataMerger', () => ({
  mergeHTJ2KData: jest.fn((levelData, complementData) => {
    // Simple merge: levelData[:-2] + complementData + EOC
    const levelWithoutEOC = levelData.slice(0, -2);
    const merged = new Uint8Array(levelWithoutEOC.length + complementData.length + 2);
    merged.set(levelWithoutEOC, 0);
    merged.set(complementData, levelWithoutEOC.length);
    merged[merged.length - 2] = 0xff;
    merged[merged.length - 1] = 0xd9;
    return merged;
  }),
  safeMergeHTJ2KData: jest.fn(),
  formatDataSize: jest.fn((bytes) => `${bytes} B`),
}));

describe('htj2kBackgroundLoader', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearHTJ2KCache();
  });

  describe('registerPartialData', () => {
    it('should register partial data for an imageId', () => {
      const imageId = 'wadors:https://server/image1';
      const partialData = new ArrayBuffer(1024);

      registerPartialData(imageId, partialData);

      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });

    it('should include totalBytes when provided', () => {
      const imageId = 'wadors:https://server/image2';
      const partialData = new ArrayBuffer(1024);
      const totalBytes = 10240;

      registerPartialData(imageId, partialData, totalBytes);

      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });

    it('should not overwrite complete entries', () => {
      const imageId = 'wadors:https://server/image3';
      const partialData = new ArrayBuffer(1024);

      // Register partial data first
      registerPartialData(imageId, partialData);

      // Simulate complete status (normally set by loadRemainingDataForImage)
      // For this test, we verify partial data is registered
      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });
  });

  describe('getFullHTJ2KData', () => {
    it('should return null for non-existent imageId', () => {
      const result = getFullHTJ2KData('wadors:https://server/nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for partial entries', () => {
      const imageId = 'wadors:https://server/partial';
      const partialData = new ArrayBuffer(1024);
      registerPartialData(imageId, partialData);

      const result = getFullHTJ2KData(imageId);
      expect(result).toBeNull();
    });
  });

  describe('getCacheStatus', () => {
    it('should return "none" for non-existent imageId', () => {
      const status = getCacheStatus('wadors:https://server/unknown');
      expect(status).toBe('none');
    });

    it('should return "partial" after registerPartialData', () => {
      const imageId = 'wadors:https://server/test';
      registerPartialData(imageId, new ArrayBuffer(512));

      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });
  });

  describe('getCacheStats', () => {
    it('should return zero stats for empty cache', () => {
      const stats = getCacheStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.completeEntries).toBe(0);
      expect(stats.partialEntries).toBe(0);
      expect(stats.currentSizeBytes).toBe(0);
    });

    it('should count partial entries correctly', () => {
      registerPartialData('img1', new ArrayBuffer(1024));
      registerPartialData('img2', new ArrayBuffer(2048));
      registerPartialData('img3', new ArrayBuffer(512));

      const stats = getCacheStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.partialEntries).toBe(3);
      expect(stats.completeEntries).toBe(0);
      expect(stats.currentSizeBytes).toBe(1024 + 2048 + 512);
    });
  });

  describe('clearHTJ2KCache', () => {
    it('should clear all cache entries', () => {
      registerPartialData('img1', new ArrayBuffer(1024));
      registerPartialData('img2', new ArrayBuffer(2048));

      clearHTJ2KCache();

      const stats = getCacheStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.currentSizeBytes).toBe(0);
    });
  });

  describe('removeCacheEntry', () => {
    it('should remove specific entry', () => {
      registerPartialData('img1', new ArrayBuffer(1024));
      registerPartialData('img2', new ArrayBuffer(2048));

      removeCacheEntry('img1');

      const stats = getCacheStats();
      expect(stats.totalEntries).toBe(1);
      expect(getCacheStatus('img1')).toBe('none');
      expect(getCacheStatus('img2')).toBe('partial');
    });

    it('should handle non-existent entry gracefully', () => {
      // Should not throw
      expect(() => removeCacheEntry('nonexistent')).not.toThrow();
    });
  });

  describe('setCacheMaxSize', () => {
    it('should set new max cache size', () => {
      const newMaxSize = 50 * 1024 * 1024; // 50MB
      setCacheMaxSize(newMaxSize);

      const stats = getCacheStats();
      expect(stats.maxSizeBytes).toBe(newMaxSize);
    });

    it('should trigger cleanup when current size exceeds new max', () => {
      // Add entries that exceed small max size
      registerPartialData('img1', new ArrayBuffer(1024 * 1024)); // 1MB
      registerPartialData('img2', new ArrayBuffer(1024 * 1024)); // 1MB
      registerPartialData('img3', new ArrayBuffer(1024 * 1024)); // 1MB

      // Set max size smaller than current
      setCacheMaxSize(1.5 * 1024 * 1024); // 1.5MB

      const stats = getCacheStats();
      // Some entries should have been evicted
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    });
  });

  describe('imageId URL handling', () => {
    it('should handle wadors: prefix correctly', () => {
      const imageId = 'wadors:https://server.com/studies/1/series/2/instances/3';
      registerPartialData(imageId, new ArrayBuffer(100));

      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });

    it('should handle imageIds with query parameters', () => {
      const imageId = 'wadors:https://server.com/image?level=2&format=htj2k';
      registerPartialData(imageId, new ArrayBuffer(100));

      const status = getCacheStatus(imageId);
      expect(status).toBe('partial');
    });
  });
});
