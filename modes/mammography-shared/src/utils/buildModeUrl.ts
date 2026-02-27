/**
 * Build a full-page-reload URL for a mammography mode, respecting routerBasename.
 *
 * window.location.href ignores BrowserRouter's basename prop,
 * so we must manually prepend the configured routerBasename.
 */
export function buildModeUrl(modePath: string, params: URLSearchParams | string): string {
  const routerBasename = (window as any).config?.routerBasename || '/';
  const base = routerBasename.endsWith('/') ? routerBasename : routerBasename + '/';
  const query = typeof params === 'string' ? params : params.toString();
  return `${base}${modePath}${query ? '?' + query : ''}`;
}
