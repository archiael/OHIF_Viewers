/**
 * WebGL Context Loss Recovery
 *
 * VTK.js handles low-level context restoration (RenderWindow.js:85-87),
 * but its restoreContext() only does a "Release" render pass with null
 * renderer — it doesn't traverse to individual mapper/actor GL objects.
 * This leaves stale GL references (textures, shaders, VAOs) that cause
 * "bindTexture: object does not belong to this context" errors.
 *
 * This module:
 *   1. Detects context loss on offscreen canvases via contextPool
 *   2. On restoration, explicitly releases all stale GL resources from
 *      every viewport's VTK actors/mappers via releaseGraphicsResources()
 *   3. Then triggers renderingEngine.render() so VTK lazily recreates
 *      fresh GL objects from CPU-side data
 *
 * Architecture:
 *   ContextPoolRenderingEngine.contextPool.getAllContexts()
 *     → each offscreenMultiRenderWindow.getOpenGLRenderWindow().get3DContext().canvas
 *     → register webglcontextlost / webglcontextrestored listeners
 *     → on restored: releaseAllGLResources() → renderingEngine.render()
 */

const RESTORE_DELAY_MS = 200;

interface CanvasHandlers {
  lostHandler: (e: Event) => void;
  restoredHandler: (e: Event) => void;
}

let _renderingEngine: any = null;
let _contextLost = false;
let _canvasHandlers = new Map<HTMLCanvasElement, CanvasHandlers>();
let _onContextLost: (() => void) | null = null;
let _onContextRestored: (() => void) | null = null;
let _restoreTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Releases all stale GL resources (textures, shaders, VAOs) from every
 * viewport's VTK actors and mappers. This forces VTK to discard old GL
 * object references and recreate them fresh on the next render() call.
 *
 * Must be called BEFORE renderingEngine.render() after context restoration.
 */
function releaseAllGLResources(renderingEngine: any): void {
  try {
    const contextPool = renderingEngine?.contextPool;
    if (!contextPool) {
      return;
    }

    const contexts = contextPool.getAllContexts();
    if (!contexts || !Array.isArray(contexts)) {
      return;
    }

    let releasedCount = 0;

    for (const ctx of contexts) {
      try {
        const openGLRenderWindow = ctx.getOpenGLRenderWindow();
        if (!openGLRenderWindow) {
          continue;
        }

        // Get all renderers in this context and release their actors' GL resources
        const renderers = ctx.getRenderers();
        if (!renderers || !Array.isArray(renderers)) {
          continue;
        }

        for (const renderer of renderers) {
          try {
            const actors = renderer.getActors?.() || renderer.getVolumes?.() || [];
            for (const actor of actors) {
              try {
                const mapper = actor?.getMapper?.();
                if (mapper && typeof mapper.releaseGraphicsResources === 'function') {
                  mapper.releaseGraphicsResources(openGLRenderWindow);
                  releasedCount++;
                }
                // Also release the actor's own GL resources (property textures, etc.)
                if (actor && typeof actor.releaseGraphicsResources === 'function') {
                  actor.releaseGraphicsResources(openGLRenderWindow);
                }
              } catch (e) {
                // Non-critical: skip individual actor failures
              }
            }
          } catch (e) {
            // Non-critical: skip individual renderer failures
          }
        }
      } catch (e) {
        // Non-critical: skip inaccessible contexts
      }
    }

    // Also release via Cornerstone viewport actors (covers cases where
    // VTK renderers don't directly expose all actors)
    try {
      const viewports = renderingEngine.getViewports();
      if (viewports && Array.isArray(viewports)) {
        for (const viewport of viewports) {
          try {
            const actors = viewport.getActors?.();
            if (!actors) continue;

            // Get the openGLRenderWindow for this viewport's context
            const contextIndex = contextPool.getContextIndexForViewport?.(viewport.id);
            if (contextIndex === undefined) continue;

            const ctxData = contextPool.getContextByIndex?.(contextIndex);
            if (!ctxData) continue;

            const openGLRenderWindow = ctxData.context?.getOpenGLRenderWindow?.()
              || ctxData.getOpenGLRenderWindow?.();
            if (!openGLRenderWindow) continue;

            for (const actorEntry of actors) {
              try {
                const actor = actorEntry?.actor;
                const mapper = actor?.getMapper?.();
                if (mapper && typeof mapper.releaseGraphicsResources === 'function') {
                  mapper.releaseGraphicsResources(openGLRenderWindow);
                  releasedCount++;
                }
                if (actor && typeof actor.releaseGraphicsResources === 'function') {
                  actor.releaseGraphicsResources(openGLRenderWindow);
                }
              } catch (e) {
                // Non-critical
              }
            }
          } catch (e) {
            // Non-critical
          }
        }
      }
    } catch (e) {
      // Non-critical: viewport-level release is supplementary
    }

    console.log(`[WebGL Recovery] Released GL resources from ${releasedCount} mapper(s)`);
  } catch (e) {
    console.warn('[WebGL Recovery] GL resource release failed:', e);
  }
}

function getOffscreenCanvases(renderingEngine: any): HTMLCanvasElement[] {
  const canvases: HTMLCanvasElement[] = [];

  try {
    const contextPool = renderingEngine?.contextPool;
    if (!contextPool) {
      return canvases;
    }

    const contexts = contextPool.getAllContexts();
    if (!contexts || !Array.isArray(contexts)) {
      return canvases;
    }

    for (const ctx of contexts) {
      try {
        const openGLRenderWindow = ctx.getOpenGLRenderWindow();
        if (!openGLRenderWindow) {
          continue;
        }
        const glContext = openGLRenderWindow.get3DContext();
        if (glContext?.canvas) {
          canvases.push(glContext.canvas as HTMLCanvasElement);
        }
      } catch (e) {
        // Skip inaccessible contexts
      }
    }
  } catch (e) {
    console.warn('[WebGL Recovery] Failed to access offscreen canvases:', e);
  }

  return canvases;
}

/**
 * Sets up WebGL context loss recovery handlers on all offscreen canvases
 * managed by the rendering engine's context pool.
 *
 * Call after the rendering engine has enabled at least one viewport
 * (so the context pool is populated).
 */
export function setupContextLossRecovery(
  renderingEngine: any,
  onContextLost?: () => void,
  onContextRestored?: () => void
): void {
  // Teardown any existing handlers first
  teardownContextLossRecovery();

  _renderingEngine = renderingEngine;
  _onContextLost = onContextLost || null;
  _onContextRestored = onContextRestored || null;

  const canvases = getOffscreenCanvases(renderingEngine);

  if (canvases.length === 0) {
    console.warn('[WebGL Recovery] No offscreen canvases found. Context loss recovery not active.');
    return;
  }

  for (const canvas of canvases) {
    const lostHandler = (e: Event) => {
      // Note: VTK.js already calls preventDefault on the same canvas.
      // Our handler runs after VTK's since VTK registered first.
      _contextLost = true;
      console.error('[WebGL Recovery] Context LOST on offscreen canvas');
      _onContextLost?.();
    };

    const restoredHandler = (e: Event) => {
      console.log('[WebGL Recovery] Context RESTORED on offscreen canvas');

      // Delay to let VTK.js restoreContext() complete its Release render pass
      if (_restoreTimer) {
        clearTimeout(_restoreTimer);
      }
      _restoreTimer = setTimeout(() => {
        _restoreTimer = null;
        _contextLost = false;

        try {
          if (_renderingEngine && !_renderingEngine.hasBeenDestroyed) {
            // Step 1: Release all stale GL objects (textures, shaders, VAOs)
            // so VTK discards old references from the dead context
            releaseAllGLResources(_renderingEngine);

            // Step 2: Re-render — VTK will lazily recreate GL objects
            // from CPU-side data (volumes, geometry) on this render pass
            _renderingEngine.render();
            console.log('[WebGL Recovery] GL resources released and re-render triggered');
          }
        } catch (err) {
          console.warn('[WebGL Recovery] Re-render failed:', err);
        }

        _onContextRestored?.();
      }, RESTORE_DELAY_MS);
    };

    canvas.addEventListener('webglcontextlost', lostHandler);
    canvas.addEventListener('webglcontextrestored', restoredHandler);
    _canvasHandlers.set(canvas, { lostHandler, restoredHandler });
  }

  console.log(`[WebGL Recovery] Monitoring ${canvases.length} offscreen canvas(es)`);
}

/**
 * Removes all registered context loss/restored event listeners.
 * Call on mode exit or rendering engine destruction.
 */
export function teardownContextLossRecovery(): void {
  if (_restoreTimer) {
    clearTimeout(_restoreTimer);
    _restoreTimer = null;
  }

  _canvasHandlers.forEach((handlers, canvas) => {
    canvas.removeEventListener('webglcontextlost', handlers.lostHandler);
    canvas.removeEventListener('webglcontextrestored', handlers.restoredHandler);
  });
  _canvasHandlers.clear();

  _renderingEngine = null;
  _onContextLost = null;
  _onContextRestored = null;
  _contextLost = false;
}

/**
 * Checks if any monitored WebGL context is currently in a lost state.
 */
export function isWebGLContextLost(): boolean {
  return _contextLost;
}
