/**
 * Utility functions for extracting mode information from the current URL.
 *
 * These functions account for `window.config.routerBasename` so that
 * custom base paths (e.g. '/worklist') are properly stripped before
 * parsing the mode segment from the pathname.
 *
 * OHIF URL pattern: [routerBasename]/:modeId/:dataSource/?queryParams
 * Examples:
 *   routerBasename='/'         → /usmpr/ohif/?StudyInstanceUIDs=...
 *   routerBasename='/worklist' → /worklist/usmpr/ohif/?StudyInstanceUIDs=...
 */

/**
 * Returns the pathname with `routerBasename` removed.
 *
 * Boundary-safe: '/work' will NOT match '/worklist' because we verify
 * that the character following the basename is either '/' or end-of-string.
 *
 * @returns pathname without the basename prefix (e.g. '/usmpr/ohif/...')
 */
export function getPathnameWithoutBasename(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  const pathname = window.location.pathname;

  // @ts-ignore - window.config is set by OHIF at startup
  const routerBasename: string = window.config?.routerBasename || '/';

  // Normalize: strip trailing slashes, treat '/' as empty
  const normalizedBasename =
    routerBasename === '/' ? '' : routerBasename.replace(/\/+$/, '');

  if (!normalizedBasename) {
    return pathname;
  }

  if (pathname.startsWith(normalizedBasename)) {
    const remainder = pathname.slice(normalizedBasename.length);
    // Boundary check: the next char must be '/' or we must be at the end
    if (remainder === '' || remainder.startsWith('/')) {
      return remainder || '/';
    }
  }

  // Basename not found in pathname — return as-is
  return pathname;
}

/**
 * Gets the current mode from the URL path.
 *
 * @returns Current mode name (e.g. 'usmpr', 'basic') or null if not found
 */
export function getCurrentMode(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const strippedPath = getPathnameWithoutBasename();
    const segments = strippedPath.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
      return null;
    }

    // First segment after basename is the mode
    const mode = segments[0];

    // Handle both '@ohif/mode-usmpr' and 'usmpr' formats
    return mode.replace('@ohif/mode-', '');
  } catch (error) {
    console.warn('[getModeFromUrl] Failed to parse URL mode:', error);
    return null;
  }
}

/**
 * Checks whether the current URL corresponds to the given mode name.
 *
 * @param modeName - Mode to check (e.g. 'usmpr')
 * @returns true if the current URL mode matches
 */
export function isCurrentMode(modeName: string): boolean {
  return getCurrentMode() === modeName;
}
