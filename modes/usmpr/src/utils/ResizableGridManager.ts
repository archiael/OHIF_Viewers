const STORAGE_KEY_MPR = 'usmpr-mpr-position'; // Save MPR grid position separately
const STORAGE_KEY_HIDDEN = 'usmpr-hidden-position'; // Save hidden position separately
const MIN_SIZE = 0; // Allow dragging to edges
const MAX_SIZE = 1.0; // Allow dragging to edges
const HANDLE_SIZE = 20; // Size of the draggable handle area in pixels

interface SplitPosition {
  horizontal: number;
  vertical: number;
}

/**
 * Manager class for the resizable MPR grid
 * Injects drag handles into the viewport grid and manages resizing
 */
export class ResizableGridManager {
  private container: HTMLElement | null = null;
  private viewportGridService: any;
  private splitPosition: SplitPosition;
  private mprPosition: SplitPosition | null = null; // Saved MPR grid position
  private hiddenPosition: SplitPosition | null = null; // Saved hidden position
  private isDragging: boolean = false;
  private isHovering: boolean = false;

  // DOM elements
  private verticalLine: HTMLDivElement | null = null;
  private horizontalLine: HTMLDivElement | null = null;
  private dragHandle: HTMLDivElement | null = null;

  // Event listeners (stored for cleanup)
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseUpHandler: (() => void) | null = null;

  constructor(viewportGridService: any) {
    this.viewportGridService = viewportGridService;
    // Load saved MPR position from storage (defaults to 50/50 if no saved position)
    this.mprPosition = this.loadMPRPosition();
    this.splitPosition = { ...this.mprPosition }; // Initialize with saved position
    this.hiddenPosition = this.loadHiddenPosition();
  }

  /**
   * Get the storage type based on user preference
   * Defaults to sessionStorage for privacy
   */
  private getStorageType(): Storage {
    try {
      const preference = localStorage.getItem('usmpr-storage-preference');
      if (preference === 'local') {
        return localStorage;
      }
    } catch (e) {
      console.warn('Failed to read storage preference:', e);
    }
    // Default to sessionStorage for privacy
    return sessionStorage;
  }

  /**
   * Load saved MPR grid position from user preference (session or local storage)
   */
  private loadMPRPosition(): SplitPosition {
    try {
      const storage = this.getStorageType();
      const saved = storage.getItem(STORAGE_KEY_MPR);
      if (saved) {
        const { horizontal, vertical } = JSON.parse(saved);
        return {
          horizontal: Math.max(MIN_SIZE, Math.min(MAX_SIZE, horizontal)),
          vertical: Math.max(MIN_SIZE, Math.min(MAX_SIZE, vertical)),
        };
      }
    } catch (e) {
      console.warn('Failed to load saved MPR position:', e);
    }
    return { horizontal: 0.5, vertical: 0.5 };
  }

  /**
   * Load saved hidden position from user preference (session or local storage)
   */
  private loadHiddenPosition(): SplitPosition {
    try {
      const storage = this.getStorageType();
      const saved = storage.getItem(STORAGE_KEY_HIDDEN);
      if (saved) {
        const { horizontal, vertical } = JSON.parse(saved);
        return {
          horizontal: Math.max(MIN_SIZE, Math.min(MAX_SIZE, horizontal)),
          vertical: Math.max(MIN_SIZE, Math.min(MAX_SIZE, vertical)),
        };
      }
    } catch (e) {
      console.warn('Failed to load saved hidden position:', e);
    }
    return { horizontal: 0.9999, vertical: 0.9999 }; // Default to bottom-right corner
  }

  /**
   * Save MPR position to user preference (session or local storage)
   */
  private saveMPRPosition(): void {
    try {
      const storage = this.getStorageType();
      storage.setItem(
        STORAGE_KEY_MPR,
        JSON.stringify({
          horizontal: this.splitPosition.horizontal,
          vertical: this.splitPosition.vertical,
        })
      );
    } catch (e) {
      console.warn('Failed to save MPR position:', e);
    }
  }

  /**
   * Save hidden position to user preference (session or local storage)
   */
  private saveHiddenPosition(): void {
    try {
      if (this.hiddenPosition) {
        const storage = this.getStorageType();
        storage.setItem(
          STORAGE_KEY_HIDDEN,
          JSON.stringify({
            horizontal: this.hiddenPosition.horizontal,
            vertical: this.hiddenPosition.vertical,
          })
        );
      }
    } catch (e) {
      console.warn('Failed to save hidden position:', e);
    }
  }

  /**
   * Calculate layout options based on split position
   */
  private calculateLayoutOptions(): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const { horizontal, vertical } = this.splitPosition;
    return [
      // Top-left
      { x: 0, y: 0, width: horizontal, height: vertical },
      // Top-right
      { x: horizontal, y: 0, width: 1 - horizontal, height: vertical },
      // Bottom-left
      { x: 0, y: vertical, width: horizontal, height: 1 - vertical },
      // Bottom-right
      { x: horizontal, y: vertical, width: 1 - horizontal, height: 1 - vertical },
    ];
  }

  /**
   * Update viewport grid layout
   */
  private async updateLayout(): Promise<void> {
    try {
      const layoutOptions = this.calculateLayoutOptions();
      const state = this.viewportGridService.getState();
      const { viewports } = state;

      // Convert viewports Map to array if needed
      const viewportsArray = Array.isArray(viewports)
        ? viewports
        : viewports instanceof Map
        ? Array.from(viewports.values())
        : Object.values(viewports || {});

      if (viewportsArray.length !== 4) {
        console.warn('ResizableGridManager: Expected 4 viewports, got', viewportsArray.length);
        return;
      }

      await this.viewportGridService.setLayout({
        numRows: 2,
        numCols: 2,
        layoutType: 'grid',
        layoutOptions,
        findOrCreateViewport: (pos: number) => {
          const viewport = viewportsArray[pos];
          if (!viewport) {
            return null;
          }

          return {
            displaySetInstanceUIDs: viewport.displaySetInstanceUIDs || [],
            displaySetOptions: viewport.displaySetOptions || [],
            viewportOptions: viewport.viewportOptions || {},
          };
        },
        isHangingProtocolLayout: true, // USMPR is a hanging protocol layout
      });
    } catch (error) {
      console.error('ResizableGridManager: Failed to update layout', error);
    }
  }

  /**
   * Update visual elements positions
   */
  private updateVisualElements(): void {
    if (!this.verticalLine || !this.horizontalLine || !this.dragHandle) return;

    const { horizontal, vertical } = this.splitPosition;
    const color = this.isDragging || this.isHovering ? '#3b82f6' : '#374151';

    // Update vertical line
    this.verticalLine.style.left = `${horizontal * 100}%`;
    this.verticalLine.style.backgroundColor = color;

    // Update horizontal line
    this.horizontalLine.style.top = `${vertical * 100}%`;
    this.horizontalLine.style.backgroundColor = color;

    // Update drag handle
    this.dragHandle.style.left = `calc(${horizontal * 100}% - ${HANDLE_SIZE / 2}px)`;
    this.dragHandle.style.top = `calc(${vertical * 100}% - ${HANDLE_SIZE / 2}px)`;

    // Update drag handle appearance
    const dot = this.dragHandle.querySelector('.drag-dot') as HTMLElement;
    if (dot) {
      dot.style.backgroundColor = this.isDragging || this.isHovering ? '#3b82f6' : '#6b7280';
      dot.style.boxShadow =
        this.isDragging || this.isHovering
          ? '0 0 8px rgba(59, 130, 246, 0.6)'
          : '0 2px 4px rgba(0, 0, 0, 0.3)';
    }

    // Show/hide arrow icon
    const arrow = this.dragHandle.querySelector('.drag-arrow') as HTMLElement;
    if (arrow) {
      arrow.style.display = this.isDragging || this.isHovering ? 'block' : 'none';
    }
  }

  /**
   * Handle mouse down on drag handle
   */
  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    this.isDragging = true;
    this.updateVisualElements();

    // Add global event listeners
    this.mouseMoveHandler = this.onMouseMove.bind(this);
    this.mouseUpHandler = this.onMouseUp.bind(this);

    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('mouseup', this.mouseUpHandler);

    // Prevent text selection
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
  };

  /**
   * Handle mouse move during drag
   */
  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Constrain to min/max sizes
    this.splitPosition.horizontal = Math.max(MIN_SIZE, Math.min(MAX_SIZE, x));
    this.splitPosition.vertical = Math.max(MIN_SIZE, Math.min(MAX_SIZE, y));

    // Only update visual elements during drag, not the actual viewport layout
    // This prevents viewport recreation which breaks CrosshairsTool
    this.updateVisualElements();
  }

  /**
   * Handle mouse up
   */
  private onMouseUp(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.updateVisualElements();

    // Update mprPosition to keep it in sync with current position
    this.mprPosition = {
      horizontal: this.splitPosition.horizontal,
      vertical: this.splitPosition.vertical,
    };
    this.saveMPRPosition();

    // Apply the final layout update now that dragging has ended
    // This ensures viewports are only recreated once, not continuously during drag
    this.updateLayout();

    // Remove global event listeners
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler);
      this.mouseUpHandler = null;
    }

    // Restore defaults
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  /**
   * Initialize and inject the resizable grid overlay
   */
  initialize(containerSelector: string = '[data-cy="viewport-grid"]', shouldHide: boolean = false): void {
    // Find the viewport grid container
    this.container = document.querySelector(containerSelector);
    if (!this.container) {
      console.warn('Viewport grid container not found');
      return;
    }

    // Create visual elements
    this.createVisualElements();

    // Apply initial layout from saved position
    this.updateLayout();
    this.updateVisualElements();

    // Hide elements if requested (after setup is complete)
    if (shouldHide) {
      this.hide();
    }
  }

  /**
   * Create visual elements (lines and drag handle)
   */
  private createVisualElements(): void {
    if (!this.container) return;

    // Remove existing elements first to prevent duplicates
    if (this.verticalLine && this.verticalLine.parentNode) {
      this.verticalLine.parentNode.removeChild(this.verticalLine);
    }
    if (this.horizontalLine && this.horizontalLine.parentNode) {
      this.horizontalLine.parentNode.removeChild(this.horizontalLine);
    }
    if (this.dragHandle && this.dragHandle.parentNode) {
      this.dragHandle.parentNode.removeChild(this.dragHandle);
    }

    // Create vertical line
    this.verticalLine = document.createElement('div');
    this.verticalLine.style.cssText = `
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      pointer-events: none;
      z-index: 10;
    `;
    this.container.appendChild(this.verticalLine);

    // Create horizontal line
    this.horizontalLine = document.createElement('div');
    this.horizontalLine.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: 1px;
      pointer-events: none;
      z-index: 10;
    `;
    this.container.appendChild(this.horizontalLine);

    // Create drag handle
    this.dragHandle = document.createElement('div');
    this.dragHandle.style.cssText = `
      position: absolute;
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      cursor: move;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create dot indicator
    const dot = document.createElement('div');
    dot.className = 'drag-dot';
    dot.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 50%;
      transition: all 0.2s;
    `;
    this.dragHandle.appendChild(dot);

    // Create arrow icon
    const arrow = document.createElement('div');
    arrow.className = 'drag-arrow';
    arrow.style.cssText = `
      position: absolute;
      width: 16px;
      height: 16px;
      pointer-events: none;
      display: none;
    `;
    arrow.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12l7-7 7 7" />
        <path d="M12 19V5M19 12l-7 7-7-7" />
        <path d="M5 12h14M12 5l-7 7 7 7" />
        <path d="M19 12H5M12 19l7-7-7-7" />
      </svg>
    `;
    this.dragHandle.appendChild(arrow);

    // Add event listeners
    this.dragHandle.addEventListener('mousedown', this.onMouseDown);
    this.dragHandle.addEventListener('mouseenter', () => {
      this.isHovering = true;
      this.updateVisualElements();
    });
    this.dragHandle.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.updateVisualElements();
    });

    this.container.appendChild(this.dragHandle);
  }

  /**
   * Hide dividing lines and handle (for single viewport mode)
   * Only hides visual elements, does not change layout
   */
  hide(): void {
    // Save current MPR position for restoration later
    this.mprPosition = {
      horizontal: this.splitPosition.horizontal,
      vertical: this.splitPosition.vertical,
    };

    // Simply hide the visual elements - no layout changes needed
    // The hanging protocol handles the single viewport layout
    if (this.verticalLine) {
      this.verticalLine.style.display = 'none';
    }
    if (this.horizontalLine) {
      this.horizontalLine.style.display = 'none';
    }
    if (this.dragHandle) {
      this.dragHandle.style.display = 'none';
    }
  }

  /**
   * Show dividing lines and handle (for MPR grid mode)
   * Restores MPR position from separate storage
   */
  show(): void {
    // Show the lines and handle first
    if (this.verticalLine) {
      this.verticalLine.style.display = '';
    }
    if (this.horizontalLine) {
      this.horizontalLine.style.display = '';
    }
    if (this.dragHandle) {
      this.dragHandle.style.display = 'flex';
    }

    // Restore MPR position from separate storage
    if (this.mprPosition) {
      this.splitPosition.horizontal = this.mprPosition.horizontal;
      this.splitPosition.vertical = this.mprPosition.vertical;

      // Update visual elements ONLY (no layout recalculation)
      // Note: updateLayout() removed to prevent duplicate layout operations
      // during viewport toggle. The toggleOneUp command already handles layout updates.
      // We only need to restore visual element positions here.
      this.updateVisualElements();
    }
  }

  /**
   * Reapply saved handle position to viewports
   * This resizes viewports to match the saved handle position
   * Called after layout configuration changes
   */
  public reapplyPosition(): void {
    console.log('🔄 [ResizableGridManager] reapplyPosition() called');

    // Check if container exists
    if (!this.container) {
      console.warn('⚠️ [ResizableGridManager] Container not found, skipping reapplyPosition');
      return;
    }

    // Load saved position (or use current if already loaded)
    if (!this.mprPosition) {
      this.mprPosition = this.loadMPRPosition();
    }

    console.log('📍 [ResizableGridManager] Current position:', this.splitPosition);
    console.log('📍 [ResizableGridManager] Saved position:', this.mprPosition);

    // Apply the saved position to viewports
    this.splitPosition = { ...this.mprPosition };

    // Update visual elements and layout to match handle position
    this.updateVisualElements();

    // Use updateLayout with error handling
    try {
      this.updateLayout();
      console.log('✅ [ResizableGridManager] Reapplied saved handle position:', this.mprPosition);
    } catch (error) {
      console.error('❌ [ResizableGridManager] Failed to update layout:', error);
    }
  }

  /**
   * Clean up and remove all elements
   */
  destroy(): void {
    // Remove event listeners
    if (this.dragHandle) {
      this.dragHandle.removeEventListener('mousedown', this.onMouseDown);
    }

    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
    }

    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler);
    }

    // Remove DOM elements
    if (this.verticalLine && this.verticalLine.parentNode) {
      this.verticalLine.parentNode.removeChild(this.verticalLine);
    }
    if (this.horizontalLine && this.horizontalLine.parentNode) {
      this.horizontalLine.parentNode.removeChild(this.horizontalLine);
    }
    if (this.dragHandle && this.dragHandle.parentNode) {
      this.dragHandle.parentNode.removeChild(this.dragHandle);
    }

    // Clear references
    this.container = null;
    this.verticalLine = null;
    this.horizontalLine = null;
    this.dragHandle = null;
    this.mouseMoveHandler = null;
    this.mouseUpHandler = null;

    // Restore defaults
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
}

export default ResizableGridManager;
