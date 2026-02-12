/**
 * Mammography logging utility with environment-aware log levels
 *
 * Provides structured logging with prefixes for easy identification in console.
 * Debug logs are only shown in development mode to avoid production spam.
 *
 * @example
 * import { logger } from '@ohif/mode-mammography-shared';
 *
 * logger.debug('Camera state:', camera);  // Only in development
 * logger.info('Magnification applied');   // Always visible
 * logger.warn('Viewport not found');      // Always visible
 * logger.error('Failed to detect laterality');  // Always visible
 */

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Structured logger for mammography mode
 *
 * Methods:
 * - debug: Development-only debug messages
 * - info: Informational messages (always shown)
 * - warn: Warning messages (always shown)
 * - error: Error messages (always shown)
 */
export const logger = {
  /**
   * Log debug message (development mode only)
   * @param args - Arguments to log
   */
  debug: (...args: any[]): void => {
    if (DEBUG) {
      console.log('[MAMMO:DEBUG]', ...args);
    }
  },

  /**
   * Log informational message
   * @param args - Arguments to log
   */
  info: (...args: any[]): void => {
    console.info('[MAMMO:INFO]', ...args);
  },

  /**
   * Log warning message
   * @param args - Arguments to log
   */
  warn: (...args: any[]): void => {
    console.warn('[MAMMO:WARN]', ...args);
  },

  /**
   * Log error message
   * @param args - Arguments to log
   */
  error: (...args: any[]): void => {
    console.error('[MAMMO:ERROR]', ...args);
  },
};
