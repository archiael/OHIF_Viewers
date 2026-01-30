/**
 * Stack Cache Window Manager
 *
 * Manages a sliding window of cached Stack images to minimize memory usage.
 * Only keeps current frame ±20 in memory, purges frames outside the window.
 *
 * Memory: 41 frames × 5MB (Level 0) = ~205MB constant
 */

import * as cornerstone from '@cornerstonejs/core';

const CACHE_WINDOW_SIZE = 20; // ±20 frames around current

interface CacheWindow {
  currentIndex: number;
  startIndex: number;
  endIndex: number;
  totalFrames: number;
}

class StackCacheWindowManager {
  private lastWindowStart = -1;
  private lastWindowEnd = -1;
  private imageIds: string[] = [];

  /**
   * Set the image IDs for the current series
   */
  setImageIds(imageIds: string[]): void {
    this.imageIds = imageIds;
    this.lastWindowStart = -1;
    this.lastWindowEnd = -1;
    console.log(`[CacheWindow] Initialized with ${imageIds.length} images`);
  }

  /**
   * Calculate the current cache window
   */
  private calculateWindow(currentIndex: number): CacheWindow {
    const totalFrames = this.imageIds.length;
    const startIndex = Math.max(0, currentIndex - CACHE_WINDOW_SIZE);
    const endIndex = Math.min(totalFrames - 1, currentIndex + CACHE_WINDOW_SIZE);

    return {
      currentIndex,
      startIndex,
      endIndex,
      totalFrames,
    };
  }

  /**
   * Update cache window on scroll
   * Purges frames outside current ±20 window
   */
  updateWindow(currentIndex: number): void {
    if (this.imageIds.length === 0) {
      console.warn('[CacheWindow] No imageIds set');
      return;
    }

    const window = this.calculateWindow(currentIndex);
    const { startIndex, endIndex } = window;

    // Check if window has changed significantly (moved more than 5 frames)
    const windowMoved =
      Math.abs(startIndex - this.lastWindowStart) > 5 ||
      Math.abs(endIndex - this.lastWindowEnd) > 5;

    if (!windowMoved && this.lastWindowStart !== -1) {
      // Window hasn't moved enough, skip purging
      return;
    }

    console.log(
      `[CacheWindow] Window: [${startIndex}-${endIndex}] (current: ${currentIndex})`
    );

    // Purge frames outside the new window
    this.purgeOutsideWindow(startIndex, endIndex);

    // Update last window
    this.lastWindowStart = startIndex;
    this.lastWindowEnd = endIndex;
  }

  /**
   * Purge image cache entries outside the window
   */
  private purgeOutsideWindow(startIndex: number, endIndex: number): void {
    const cache = cornerstone.cache;
    if (!cache) {
      console.warn('[CacheWindow] Cache not available');
      return;
    }

    let purgedCount = 0;

    // Purge images outside the window
    this.imageIds.forEach((imageId, index) => {
      if (index < startIndex || index > endIndex) {
        try {
          // Remove from cache
          cache.removeImageLoadObject(imageId);
          purgedCount++;
        } catch (e) {
          // Silently ignore errors (image might not be cached)
        }
      }
    });

    if (purgedCount > 0) {
      console.log(`[CacheWindow] Purged ${purgedCount} images outside window`);
    }
  }

  /**
   * Clear all cached images (on series change)
   */
  clear(): void {
    const cache = cornerstone.cache;
    if (!cache) return;

    this.imageIds.forEach(imageId => {
      try {
        cache.removeImageLoadObject(imageId);
      } catch (e) {
        // Ignore
      }
    });

    this.imageIds = [];
    this.lastWindowStart = -1;
    this.lastWindowEnd = -1;
    console.log('[CacheWindow] Cleared all cached images');
  }

  /**
   * Get current window info for debugging
   */
  getWindowInfo(): { start: number; end: number; size: number } {
    return {
      start: this.lastWindowStart,
      end: this.lastWindowEnd,
      size: this.lastWindowEnd - this.lastWindowStart + 1,
    };
  }
}

// Singleton instance
export const stackCacheWindowManager = new StackCacheWindowManager();
