/**
 * HTJ2K Data Merger Unit Tests
 *
 * @description
 * htj2kDataMerger.ts의 핵심 기능을 테스트합니다.
 * - EOC/SOC 마커 검증
 * - 데이터 병합 로직
 * - 병합 결과 검증
 *
 * @see PROMPT-SERVER-HTJ2K-API.md - Server API 스펙
 * @see TASK-72-CLIENT-API-IMPLEMENTATION.md - 클라이언트 구현 스펙
 */

import {
  EOC_MARKER,
  SOC_MARKER,
  hasValidEOC,
  hasValidSOC,
  validateMergedData,
  mergeHTJ2KData,
  canMerge,
  safeMergeHTJ2KData,
  formatDataSize,
  calculateMergeRatio,
} from './htj2kDataMerger';

// Mock htj2kDebugLogger
jest.mock('./htj2kDebugLogger', () => ({
  htj2kLog: jest.fn(),
}));

describe('htj2kDataMerger', () => {
  // ==========================================================================
  // Constants Tests
  // ==========================================================================
  describe('Constants', () => {
    it('should have correct EOC marker value', () => {
      expect(EOC_MARKER).toEqual(new Uint8Array([0xFF, 0xD9]));
    });

    it('should have correct SOC marker value', () => {
      expect(SOC_MARKER).toEqual(new Uint8Array([0xFF, 0x4F]));
    });
  });

  // ==========================================================================
  // hasValidEOC Tests
  // ==========================================================================
  describe('hasValidEOC', () => {
    it('should return true for data ending with EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      expect(hasValidEOC(data)).toBe(true);
    });

    it('should return false for data not ending with EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0x00, 0x00]);
      expect(hasValidEOC(data)).toBe(false);
    });

    it('should return false for empty data', () => {
      const data = new Uint8Array([]);
      expect(hasValidEOC(data)).toBe(false);
    });

    it('should return false for data with only 1 byte', () => {
      const data = new Uint8Array([0xD9]);
      expect(hasValidEOC(data)).toBe(false);
    });

    it('should return false for null/undefined data', () => {
      expect(hasValidEOC(null as any)).toBe(false);
      expect(hasValidEOC(undefined as any)).toBe(false);
    });
  });

  // ==========================================================================
  // hasValidSOC Tests
  // ==========================================================================
  describe('hasValidSOC', () => {
    it('should return true for data starting with SOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      expect(hasValidSOC(data)).toBe(true);
    });

    it('should return false for data not starting with SOC marker', () => {
      const data = new Uint8Array([0x00, 0x00, 0xFF, 0x4F, 0xFF, 0xD9]);
      expect(hasValidSOC(data)).toBe(false);
    });

    it('should return false for empty data', () => {
      const data = new Uint8Array([]);
      expect(hasValidSOC(data)).toBe(false);
    });

    it('should return false for data with only 1 byte', () => {
      const data = new Uint8Array([0xFF]);
      expect(hasValidSOC(data)).toBe(false);
    });

    it('should return false for null/undefined data', () => {
      expect(hasValidSOC(null as any)).toBe(false);
      expect(hasValidSOC(undefined as any)).toBe(false);
    });
  });

  // ==========================================================================
  // validateMergedData Tests
  // ==========================================================================
  describe('validateMergedData', () => {
    it('should validate correct HTJ2K data', () => {
      // Valid HTJ2K: SOC + data + EOC
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      const result = validateMergedData(data);

      expect(result.valid).toBe(true);
      expect(result.details?.hasSOC).toBe(true);
      expect(result.details?.hasEOC).toBe(true);
    });

    it('should fail for data without SOC marker', () => {
      const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9]);
      const result = validateMergedData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid SOC marker');
      expect(result.details?.hasSOC).toBe(false);
    });

    it('should fail for data without EOC marker', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0x00, 0x00]);
      const result = validateMergedData(data);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid EOC marker');
      expect(result.details?.hasEOC).toBe(false);
    });

    it('should validate expected size when provided', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      const result = validateMergedData(data, 6);

      expect(result.valid).toBe(true);
      expect(result.details?.sizeMatch).toBe(true);
    });

    it('should fail when size does not match expected', () => {
      const data = new Uint8Array([0xFF, 0x4F, 0x00, 0x00, 0xFF, 0xD9]);
      const result = validateMergedData(data, 100);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Size mismatch');
      expect(result.details?.sizeMatch).toBe(false);
    });
  });

  // ==========================================================================
  // mergeHTJ2KData Tests
  // ==========================================================================
  describe('mergeHTJ2KData', () => {
    it('should merge level data and complement data correctly', () => {
      // Level data: SOC + header + level 2 data + EOC
      const levelData = new Uint8Array([
        0xFF, 0x4F, // SOC
        0x00, 0x01, 0x02, // header/data
        0xFF, 0xD9, // EOC
      ]);

      // Complement data: level 1 + level 0 data (no header/EOC)
      const complementData = new Uint8Array([0x03, 0x04, 0x05]);

      const result = mergeHTJ2KData(levelData, complementData);

      // Expected: levelData[:-2] + complementData + EOC
      expect(result.length).toBe(5 + 3 + 2); // 10 bytes
      expect(result[0]).toBe(0xFF); // SOC byte 1
      expect(result[1]).toBe(0x4F); // SOC byte 2
      expect(result[5]).toBe(0x03); // complement start
      expect(result[result.length - 2]).toBe(0xFF); // EOC byte 1
      expect(result[result.length - 1]).toBe(0xD9); // EOC byte 2
    });

    it('should handle empty complement data', () => {
      const levelData = new Uint8Array([
        0xFF, 0x4F,
        0x00, 0x01,
        0xFF, 0xD9,
      ]);
      const complementData = new Uint8Array([]);

      const result = mergeHTJ2KData(levelData, complementData);

      // Expected: levelData[:-2] + EOC = same as levelData
      expect(result.length).toBe(levelData.length);
      expect(hasValidSOC(result)).toBe(true);
      expect(hasValidEOC(result)).toBe(true);
    });

    it('should throw error for too short level data', () => {
      const levelData = new Uint8Array([0xFF]);
      const complementData = new Uint8Array([0x00, 0x01]);

      expect(() => mergeHTJ2KData(levelData, complementData)).toThrow(
        'Invalid levelData: must be at least 2 bytes'
      );
    });

    it('should throw error for null/undefined level data', () => {
      const complementData = new Uint8Array([0x00, 0x01]);

      expect(() => mergeHTJ2KData(null as any, complementData)).toThrow();
      expect(() => mergeHTJ2KData(undefined as any, complementData)).toThrow();
    });
  });

  // ==========================================================================
  // canMerge Tests
  // ==========================================================================
  describe('canMerge', () => {
    it('should return true when both level and complement data exist', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);
      const complementData = new Uint8Array([0x00, 0x01]);

      expect(canMerge(levelData, complementData)).toBe(true);
    });

    it('should return false when level data is null', () => {
      const complementData = new Uint8Array([0x00, 0x01]);

      expect(canMerge(null, complementData)).toBe(false);
    });

    it('should return false when complement data is null', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);

      expect(canMerge(levelData, null)).toBe(false);
    });

    it('should return false when level data is too short', () => {
      const levelData = new Uint8Array([0xFF]);
      const complementData = new Uint8Array([0x00, 0x01]);

      expect(canMerge(levelData, complementData)).toBe(false);
    });

    it('should return true with empty complement data', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);
      const complementData = new Uint8Array([]);

      expect(canMerge(levelData, complementData)).toBe(true);
    });
  });

  // ==========================================================================
  // safeMergeHTJ2KData Tests
  // ==========================================================================
  describe('safeMergeHTJ2KData', () => {
    it('should return merged data on success', () => {
      const levelData = new Uint8Array([
        0xFF, 0x4F, // SOC
        0x00, 0x01,
        0xFF, 0xD9, // EOC
      ]);
      const complementData = new Uint8Array([0x02, 0x03]);

      const result = safeMergeHTJ2KData(levelData, complementData);

      expect(result).not.toBeNull();
      expect(hasValidSOC(result!)).toBe(true);
      expect(hasValidEOC(result!)).toBe(true);
    });

    it('should return null when level data is missing', () => {
      const complementData = new Uint8Array([0x00, 0x01]);

      const result = safeMergeHTJ2KData(null, complementData);

      expect(result).toBeNull();
    });

    it('should return null when complement data is missing', () => {
      const levelData = new Uint8Array([0xFF, 0x4F, 0xFF, 0xD9]);

      const result = safeMergeHTJ2KData(levelData, null);

      expect(result).toBeNull();
    });

    it('should return null when size validation fails', () => {
      const levelData = new Uint8Array([
        0xFF, 0x4F,
        0x00, 0x01,
        0xFF, 0xD9,
      ]);
      const complementData = new Uint8Array([0x02, 0x03]);

      // Expected size doesn't match
      const result = safeMergeHTJ2KData(levelData, complementData, 100);

      expect(result).toBeNull();
    });

    it('should return merged data when expected size matches', () => {
      const levelData = new Uint8Array([
        0xFF, 0x4F, // SOC
        0x00, 0x01,
        0xFF, 0xD9, // EOC
      ]);
      const complementData = new Uint8Array([0x02, 0x03]);

      // Expected: 4 (level without EOC) + 2 (complement) + 2 (EOC) = 8
      const result = safeMergeHTJ2KData(levelData, complementData, 8);

      expect(result).not.toBeNull();
      expect(result!.length).toBe(8);
    });
  });

  // ==========================================================================
  // formatDataSize Tests
  // ==========================================================================
  describe('formatDataSize', () => {
    it('should format bytes correctly', () => {
      expect(formatDataSize(500)).toBe('500 B');
      expect(formatDataSize(1023)).toBe('1023 B');
    });

    it('should format KB correctly', () => {
      expect(formatDataSize(1024)).toBe('1.0 KB');
      expect(formatDataSize(1536)).toBe('1.5 KB');
      expect(formatDataSize(102400)).toBe('100.0 KB');
    });

    it('should handle zero', () => {
      expect(formatDataSize(0)).toBe('0 B');
    });
  });

  // ==========================================================================
  // calculateMergeRatio Tests
  // ==========================================================================
  describe('calculateMergeRatio', () => {
    it('should calculate correct ratios', () => {
      // Level: 100KB, Complement: 550KB
      // Total: 100 - 2 + 550 + 2 = 650KB
      const levelSize = 102400; // 100KB
      const complementSize = 563200; // 550KB

      const result = calculateMergeRatio(levelSize, complementSize);

      // totalSize = 100KB - 2 + 550KB = ~650KB
      expect(result.totalSize).toBe(levelSize + complementSize - 2);

      // levelPercent: (100KB - 2) / totalSize * 100
      expect(result.levelPercent).toBeGreaterThan(15);
      expect(result.levelPercent).toBeLessThan(16);

      // complementPercent: 550KB / totalSize * 100
      expect(result.complementPercent).toBeGreaterThan(84);
      expect(result.complementPercent).toBeLessThan(85);
    });

    it('should handle small sizes', () => {
      const result = calculateMergeRatio(100, 200);

      expect(result.totalSize).toBe(298); // 100 + 200 - 2
    });
  });

  // ==========================================================================
  // Integration Tests: Real-world merge scenario
  // ==========================================================================
  describe('Integration: Real-world merge scenario', () => {
    it('should correctly merge simulated Level 2 and Complement data', () => {
      // Simulate Level 2 data (~100KB equivalent structure)
      const levelData = new Uint8Array(100);
      levelData[0] = 0xFF; // SOC
      levelData[1] = 0x4F;
      // Fill with some data
      for (let i = 2; i < 98; i++) {
        levelData[i] = i % 256;
      }
      levelData[98] = 0xFF; // EOC
      levelData[99] = 0xD9;

      // Simulate Complement data (~50 bytes for test)
      const complementData = new Uint8Array(50);
      for (let i = 0; i < 50; i++) {
        complementData[i] = (100 + i) % 256;
      }

      // Merge
      const merged = mergeHTJ2KData(levelData, complementData);

      // Verify structure
      expect(merged.length).toBe(98 + 50 + 2); // level without EOC + complement + EOC
      expect(hasValidSOC(merged)).toBe(true);
      expect(hasValidEOC(merged)).toBe(true);

      // Verify content
      // First bytes should be SOC
      expect(merged[0]).toBe(0xFF);
      expect(merged[1]).toBe(0x4F);

      // Level data content (indices 2-97)
      expect(merged[2]).toBe(2);
      expect(merged[97]).toBe(97);

      // Complement data starts at index 98
      expect(merged[98]).toBe(100);
      expect(merged[147]).toBe(149);

      // Last bytes should be EOC
      expect(merged[merged.length - 2]).toBe(0xFF);
      expect(merged[merged.length - 1]).toBe(0xD9);
    });

    it('should validate merged data matches expected formula', () => {
      // Test the formula: fullData = levelData[:-2] + complementData + EOC
      const levelData = new Uint8Array([
        0xFF, 0x4F, // SOC
        0x01, 0x02, 0x03, 0x04, // Level 2 data
        0xFF, 0xD9, // EOC (to be removed)
      ]);

      const complementData = new Uint8Array([
        0x05, 0x06, 0x07, // Level 1+0 data
      ]);

      const merged = mergeHTJ2KData(levelData, complementData);

      // Expected: [SOC, data, complement, EOC]
      const expected = new Uint8Array([
        0xFF, 0x4F, // SOC (preserved from level)
        0x01, 0x02, 0x03, 0x04, // Level 2 data
        0x05, 0x06, 0x07, // Complement data
        0xFF, 0xD9, // New EOC
      ]);

      expect(merged.length).toBe(expected.length);
      for (let i = 0; i < merged.length; i++) {
        expect(merged[i]).toBe(expected[i]);
      }
    });
  });
});
