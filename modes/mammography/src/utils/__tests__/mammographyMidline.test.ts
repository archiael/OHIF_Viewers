/**
 * Unit tests for mammographyMidline utility functions
 * Tests laterality detection and chest wall anchor calculation
 */

import {
  inferLateralityFromViewport,
  getMidlineCanvasPoint,
  getFixedMidlineAnchor,
} from '../mammographyMidline';

describe('mammographyMidline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('inferLateralityFromViewport', () => {
    it('should detect R from dataset attribute', () => {
      const viewport = {
        element: {
          dataset: {
            mammoLaterality: 'R',
          },
        },
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('R');
    });

    it('should detect L from dataset attribute', () => {
      const viewport = {
        element: {
          dataset: {
            mammoLaterality: 'L',
          },
        },
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('L');
    });

    it('should detect R from ViewPosition tag (0018,5101)', () => {
      const mockInstance = {
        '00185101': 'RCC',
        ViewPosition: 'RCC',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('R');
    });

    it('should detect L from ViewPosition tag', () => {
      const mockInstance = {
        '00185101': 'LMLO',
        ViewPosition: 'LMLO',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('L');
    });

    it('should detect from ProtocolName tag (0018,1030)', () => {
      const mockInstance = {
        '00181030': 'Right Breast CC',
        ProtocolName: 'Right Breast CC',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('R');
    });

    it('should detect from ImageLaterality field', () => {
      const mockInstance = {
        ImageLaterality: 'R',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('R');
    });

    it('should detect from SeriesDescription', () => {
      const mockInstance = {
        SeriesDescription: 'LCC View',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBe('L');
    });

    it('should return null for unknown laterality', () => {
      const mockInstance = {
        SeriesDescription: 'Unknown View',
      };

      (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBeNull();
    });

    it('should return null for null viewport', () => {
      const result = inferLateralityFromViewport(null);
      expect(result).toBeNull();
    });

    it('should return null when no imageId available', () => {
      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue(null),
      };

      const result = inferLateralityFromViewport(viewport);
      expect(result).toBeNull();
    });
  });

  describe('getMidlineCanvasPoint', () => {
    it('should return right edge for R breast', () => {
      const viewport = {
        canvas: {
          width: 800,
          height: 600,
        },
      };

      const result = getMidlineCanvasPoint(viewport, 'R');
      expect(result).toEqual([800, 300]); // [width, height/2]
    });

    it('should return left edge for L breast', () => {
      const viewport = {
        canvas: {
          width: 800,
          height: 600,
        },
      };

      const result = getMidlineCanvasPoint(viewport, 'L');
      expect(result).toEqual([0, 300]); // [0, height/2]
    });

    it('should return center for unknown laterality', () => {
      const viewport = {
        canvas: {
          width: 800,
          height: 600,
        },
      };

      const result = getMidlineCanvasPoint(viewport, null);
      expect(result).toEqual([400, 300]); // [width/2, height/2]
    });

    it('should handle viewport without canvas', () => {
      const viewport = {};

      const result = getMidlineCanvasPoint(viewport, 'R');
      expect(result).toEqual([0, 0]);
    });
  });

  describe('getFixedMidlineAnchor', () => {
    it('should return maxX for R breast', () => {
      const mockImageBounds = [
        -100, 100, // minX, maxX
        -50, 50,   // minY, maxY
        0, 1,      // minZ, maxZ
      ];

      const viewport = {
        element: { dataset: { mammoLaterality: 'R' } },
        getImageData: jest.fn().mockReturnValue({
          getBounds: jest.fn().mockReturnValue(mockImageBounds),
        }),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toEqual([100, 0, 0.5]); // [maxX, centerY, centerZ]
    });

    it('should return minX for L breast', () => {
      const mockImageBounds = [
        -100, 100, // minX, maxX
        -50, 50,   // minY, maxY
        0, 1,      // minZ, maxZ
      ];

      const viewport = {
        element: { dataset: { mammoLaterality: 'L' } },
        getImageData: jest.fn().mockReturnValue({
          getBounds: jest.fn().mockReturnValue(mockImageBounds),
        }),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toEqual([-100, 0, 0.5]); // [minX, centerY, centerZ]
    });

    it('should try alternate methods if getImageData fails', () => {
      const mockImageBounds = [
        -100, 100, // minX, maxX
        -50, 50,   // minY, maxY
        0, 1,      // minZ, maxZ
      ];

      const viewport = {
        element: { dataset: { mammoLaterality: 'R' } },
        getImageData: jest.fn().mockReturnValue(null),
        getDefaultImageData: jest.fn().mockReturnValue({
          getBounds: jest.fn().mockReturnValue(mockImageBounds),
        }),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toEqual([100, 0, 0.5]);
    });

    it('should return null when no laterality detected', () => {
      const viewport = {
        element: { dataset: {} },
        getCurrentImageId: jest.fn().mockReturnValue(null),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toBeNull();
    });

    it('should return null when bounds unavailable', () => {
      const viewport = {
        element: { dataset: { mammoLaterality: 'R' } },
        getImageData: jest.fn().mockReturnValue(null),
        getDefaultImageData: jest.fn().mockReturnValue(null),
        getBounds: jest.fn().mockReturnValue(null),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toBeNull();
    });

    it('should return null when bounds array is invalid', () => {
      const viewport = {
        element: { dataset: { mammoLaterality: 'R' } },
        getImageData: jest.fn().mockReturnValue({
          getBounds: jest.fn().mockReturnValue([1, 2, 3]), // Invalid length
        }),
      };

      const result = getFixedMidlineAnchor(viewport);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle various ViewPosition formats', () => {
      const testCases = [
        { input: 'RCC', expected: 'R' },
        { input: 'RMLO', expected: 'R' },
        { input: 'R-CC', expected: 'R' },
        { input: 'R-MLO', expected: 'R' },
        { input: 'LCC', expected: 'L' },
        { input: 'LMLO', expected: 'L' },
        { input: 'L-CC', expected: 'L' },
        { input: 'L-MLO', expected: 'L' },
      ];

      testCases.forEach(({ input, expected }) => {
        const mockInstance = {
          ViewPosition: input,
        };

        (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

        const viewport = {
          element: { dataset: {} },
          getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
        };

        const result = inferLateralityFromViewport(viewport);
        expect(result).toBe(expected);
      });
    });

    it('should handle case-insensitive laterality strings', () => {
      const testCases = [
        { ImageLaterality: 'r' },
        { ImageLaterality: 'R' },
        { ImageLaterality: 'right' },
        { ImageLaterality: 'RIGHT' },
      ];

      testCases.forEach(mockInstance => {
        (global.window as any).cornerstone.metaData.get.mockReturnValue(mockInstance);

        const viewport = {
          element: { dataset: {} },
          getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
        };

        const result = inferLateralityFromViewport(viewport);
        expect(result).toBe('R');
      });
    });
  });
});
