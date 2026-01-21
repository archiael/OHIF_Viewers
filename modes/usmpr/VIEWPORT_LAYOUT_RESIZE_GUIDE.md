# USMPR Layout Resizing - Technical Documentation

## Overview

### Purpose
The USMPR (Ultrasound Multi-Planar Reconstruction) mode provides an interactive drag-and-drop interface for resizing viewport layouts. Users can drag a central vertex handle to dynamically adjust the size of four viewports in a 2x2 grid configuration.

### Key Features
- **Real-time Drag & Drop**: Smooth, responsive viewport resizing with visual feedback
- **Persistent Storage**: Saves split positions to localStorage or sessionStorage
- **Visual Feedback**: Interactive drag handle with hover states and color transitions
- **Performance Optimized**: Lazy initialization and deferred layout updates during drag

---

## File Structure & Responsibilities

### Core Files

#### 1. `utils/ResizableGridManager.ts` (542 lines)
**Role**: Core drag-and-drop layout resizing logic

**Responsibilities**:
- Creates and manages drag handle and grid lines (vertical/horizontal dividers)
- Handles mouse events: `onMouseDown`, `onMouseMove`, `onMouseUp`
- Calculates and stores normalized split positions (0.0 - 1.0)
- Computes layout options for 4 viewports based on split position
- Renders visual elements (vertical line, horizontal line, drag handle)
- Manages storage persistence (session vs local storage)

**Key Methods**:
- `show()`: Displays the resizable grid interface
- `hide()`: Hides the grid interface when switching to single viewport
- `updateLayout()`: Applies new layout to ViewportGridService
- `saveMPRPosition()`: Persists split position to storage
- `loadPosition()`: Retrieves saved split position from storage

**File Location**: `modes/usmpr/src/utils/ResizableGridManager.ts`

---

#### 2. `index.tsx` (1523 lines)
**Role**: USMPR mode entry point and layout change handler

**Responsibilities**:
- Initializes ResizableGridManager on first MPR grid entry (lazy initialization)
- Listens to `LAYOUT_CHANGED` and `GRID_STATE_CHANGED` events
- Manages transitions between single viewport (1x1) and MPR grid (2x2)
- Restores viewport positions when switching layouts
- Integrates with SlicePlaneManager for 3D reference planes

**Key Event Handlers** (lines 191-624):
```typescript
// Layout change subscription
const { unsubscribe: layoutUnsubscribe } = viewportGridService.subscribe(
  viewportGridService.EVENTS.LAYOUT_CHANGED,
  ({ numRows, numCols }) => {
    // Handle 1x1 ↔ 2x2 transitions
    if (numRows === 1 && numCols === 1) {
      resizableGridManager?.hide();  // Single viewport mode
    } else if (numRows === 2 && numCols === 2) {
      resizableGridManager?.show();  // MPR grid mode
    }
  }
);
```

**File Location**: `modes/usmpr/src/index.tsx`

---

#### 3. `components/LayoutConfigModal.tsx` (860 lines)
**Role**: UI modal for layout configuration

**Responsibilities**:
- Provides interface for selecting view type per position (Axial, Sagittal, Coronal, 3D)
- Allows selection of 3D rendering presets (CT-Bone, CT-Lung, CT-Fat, MR-Default)
- Configures storage persistence preference (session vs local storage)
- Displays interactive color-coded viewport position cards
- Validates that each view type is used only once
- Triggers hanging protocol update via `refreshViewportsFromConfig()`

**File Location**: `modes/usmpr/src/components/LayoutConfigModal.tsx`

---

#### 4. `utils/LayoutConfigManager.tsx` (102 lines)
**Role**: Modal lifecycle manager

**Responsibilities**:
- Creates and destroys React root for modal
- Manages show/hide operations
- Stores services manager reference for hanging protocol updates

**File Location**: `modes/usmpr/src/utils/LayoutConfigManager.tsx`

---

### Supporting Files

#### 5. `extensions/default/src/hangingprotocols/hpUSMPR.ts`
**Role**: USMPR hanging protocol definition

**Responsibilities**:
- Defines initial 2x2 grid layout with equal 50/50 splits
- Configures 5 viewports (4 MPR + 1 fullscreen stack view)
- Provides layout options for all viewport configurations
- Implements `refreshViewportsFromConfig()` to restore from localStorage

**Initial Layout Definition** (lines 248-272):
```typescript
{
  numRows: 2,
  numCols: 2,
  layoutOptions: [
    { x: 0, y: 0, width: 0.5, height: 0.5 },     // Top-Left
    { x: 0.5, y: 0, width: 0.5, height: 0.5 },   // Top-Right
    { x: 0, y: 0.5, width: 0.5, height: 0.5 },   // Bottom-Left
    { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }  // Bottom-Right
  ]
}
```

**File Location**: `extensions/default/src/hangingprotocols/hpUSMPR.ts`

---

#### 6. `utils/SlicePlaneManager.ts` (357 lines)
**Role**: 3D viewport slice plane visualization

**Responsibilities**:
- Creates and manages VTK plane actors for axial, sagittal, and coronal slices
- Displays slice positions as colored planes in 3D viewport
- Updates plane positions based on MPR viewport camera positions

**File Location**: `modes/usmpr/src/utils/SlicePlaneManager.ts`

---

#### 7. `utils/SlicePlaneSync.ts` (387 lines)
**Role**: Synchronizes 3D planes with MPR viewports

**Responsibilities**:
- Subscribes to `CAMERA_MODIFIED`, `IMAGE_RENDERED`, `STACK_NEW_IMAGE` events
- Keeps plane positions synchronized with viewport camera changes
- Updates 3D plane visualization when user navigates MPR slices

**File Location**: `modes/usmpr/src/utils/SlicePlaneSync.ts`

---

#### 8. `platform/ui-next/src/components/Viewport/ViewportGrid.tsx`
**Role**: Viewport grid container component

**Responsibilities**:
- Provides `data-cy="viewport-grid"` selector for ResizableGridManager to find container
- Applies relative positioning and 100% width/height styling
- Wraps viewport children to enable absolute positioning of grid elements

**File Location**: `platform/ui-next/src/components/Viewport/ViewportGrid.tsx`

---

#### 9. `toolbarButtons.ts`
**Role**: Toolbar button definitions

**Responsibilities**:
- Defines Layout Config button (lines 156-167)
- Opens LayoutConfigModal via USMPR command context

**File Location**: `modes/usmpr/src/toolbarButtons.ts`

---

## Architecture

### Component Relationship Diagram

```
┌─────────────────────────────────────────────────────┐
│                   USMPR Mode (index.tsx)             │
│  - onModeEnter: ResizableGridManager initialization  │
│  - LAYOUT_CHANGED event listener                     │
└───────────┬─────────────────────────────────────────┘
            │
            ├─────────────────────────────────┐
            │                                 │
            ▼                                 ▼
┌───────────────────────┐      ┌─────────────────────────────┐
│ ResizableGridManager  │      │   LayoutConfigModal         │
│  - Drag & Drop logic  │      │    - UI configuration       │
│  - Mouse events       │      │    - View type selection    │
│  - Split position     │◄─────┤    - Storage settings       │
│  - Layout calculation │      │                             │
└───────┬───────────────┘      └─────────────────────────────┘
        │                                   │
        │                                   │ managed by
        ▼                                   ▼
┌──────────────────────┐      ┌─────────────────────────────┐
│  ViewportGrid        │      │  LayoutConfigManager        │
│  - DOM container     │      │   - Modal lifecycle         │
│  - data-cy selector  │      └─────────────────────────────┘
└──────────────────────┘
        │
        │ renders
        ▼
┌──────────────────────────────────────────┐
│  Drag Handle + Grid Lines                │
│  - Vertical Line (divides left/right)    │
│  - Horizontal Line (divides top/bottom)  │
│  - Drag Handle (center vertex)           │
│    └── .drag-dot (12px circle)           │
│    └── .drag-arrow (directional SVG)     │
└──────────────────────────────────────────┘
```

### Service Integration Diagram

```
ResizableGridManager
    │
    ├──► ViewportGridService.setLayout()
    │    └── Updates viewport positions
    │
    ├──► HangingProtocolService
    │    └── Reads/writes layout configuration
    │
    ├──► Storage (localStorage/sessionStorage)
    │    └── Saves/loads split positions
    │
    └──► ToolGroupService
         └── Manages tool groups ('mpr' vs 'default')
```

---

## Execution Flow

### 1. Initialization Flow

```
1. User enters USMPR mode
   ↓
2. index.tsx onModeEnter executes
   ↓
3. Hanging Protocol applied (hpUSMPR.ts)
   ↓
4. LAYOUT_CHANGED event fires
   ↓
5. If layout is 2x2 grid:
   ├── Initialize ResizableGridManager (lazy)
   ├── Query DOM: [data-cy="viewport-grid"]
   ├── Load saved split position from storage
   ├── Create visual elements
   │   ├── Vertical line (divider)
   │   ├── Horizontal line (divider)
   │   └── Drag handle (center vertex)
   └── Register event listeners
       ├── mousedown on drag handle
       ├── mouseenter/mouseleave for hover effects
       └── Global mousemove/mouseup (added during drag)
```

### 2. Drag-and-Drop Flow

```
1. User clicks drag handle (mousedown)
   ↓
2. ResizableGridManager.onMouseDown() executes (line 246)
   ├── isDragging = true
   ├── Register global mousemove/mouseup listeners
   ├── Update visual feedback (change to blue)
   └── Set cursor to 'move'
   ↓
3. User moves mouse (mousemove)
   ↓
4. ResizableGridManager.onMouseMove() executes (line 266)
   ├── Calculate normalized x, y relative to container
   ├── Update splitPosition.horizontal/vertical
   ├── Apply constraints (MIN_SIZE=0, MAX_SIZE=1.0)
   └── Update visual elements ONLY (layout not changed yet)
       └── Performance optimization: defer layout update until drag ends
   ↓
5. User releases mouse button (mouseup)
   ↓
6. ResizableGridManager.onMouseUp() executes (line 285)
   ├── isDragging = false
   ├── Update visual elements (restore colors)
   ├── saveMPRPosition() - persist to storage
   ├── updateLayout() - apply to ViewportGridService
   │   └── Apply new layout options to 4 viewports
   ├── Remove global event listeners
   └── Restore cursor
```

**Code Reference** (ResizableGridManager.ts):
```typescript
// line 246-261: Mouse down handler
private onMouseDown = (e: MouseEvent): void => {
  e.preventDefault();
  this.isDragging = true;

  document.addEventListener('mousemove', this.onMouseMove);
  document.addEventListener('mouseup', this.onMouseUp);

  this.updateVisualElements(true);  // Visual feedback: blue
  document.body.style.cursor = 'move';
};

// line 266-280: Mouse move handler
private onMouseMove = (e: MouseEvent): void => {
  if (!this.isDragging || !this.container) return;

  const rect = this.container.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  this.splitPosition.horizontal = Math.max(MIN_SIZE, Math.min(MAX_SIZE, x));
  this.splitPosition.vertical = Math.max(MIN_SIZE, Math.min(MAX_SIZE, y));

  this.updateVisualElements(true);  // Update visuals only during drag
};

// line 285-315: Mouse up handler
private onMouseUp = (): void => {
  if (!this.isDragging) return;

  this.isDragging = false;
  this.updateVisualElements(false);
  document.body.style.cursor = '';

  this.saveMPRPosition();  // Persist to storage
  this.updateLayout();     // Apply layout to viewports

  document.removeEventListener('mousemove', this.onMouseMove);
  document.removeEventListener('mouseup', this.onMouseUp);
};
```

### 3. Layout Transition Flow

```
Single Viewport (1x1) ↔ MPR Grid (2x2) Transition:

1. Toolbar button click or layout change
   ↓
2. GRID_STATE_CHANGED event fires
   ↓
3. index.tsx event handler executes (lines 191-624)
   ├── Detect new layout
   ├── 1x1 → 2x2 transition:
   │   ├── ResizableGridManager.show()
   │   ├── Restore saved positions
   │   └── Activate SlicePlaneManager
   └── 2x2 → 1x1 transition:
       ├── ResizableGridManager.hide()
       ├── Save current positions
       └── Deactivate SlicePlaneManager
```

---

## Key Data Structures

### SplitPosition Interface

```typescript
/**
 * @interface SplitPosition
 * @description Represents the grid split position using normalized coordinates
 *
 * All values are normalized to range [0.0, 1.0]:
 * - 0.0 represents the left/top edge
 * - 1.0 represents the right/bottom edge
 * - 0.5 represents the center (50/50 split)
 */
interface SplitPosition {
  /**
   * Horizontal split line position
   * @type {number}
   * @range 0.0 (leftmost) to 1.0 (rightmost)
   */
  horizontal: number;

  /**
   * Vertical split line position
   * @type {number}
   * @range 0.0 (topmost) to 1.0 (bottommost)
   */
  vertical: number;
}
```

### Layout Options Calculation

```typescript
/**
 * @function calculateLayoutOptions
 * @description Converts split position to 4 viewport layout configurations
 *
 * @param {SplitPosition} splitPosition - Current grid split position
 * @returns {Array<LayoutOption>} Array of 4 layout options (TL, TR, BL, BR)
 *
 * @example
 * // For splitPosition = { horizontal: 0.6, vertical: 0.4 }
 * // Returns:
 * [
 *   { x: 0,   y: 0,   width: 0.6, height: 0.4 },  // Top-Left: 60% width, 40% height
 *   { x: 0.6, y: 0,   width: 0.4, height: 0.4 },  // Top-Right: 40% width, 40% height
 *   { x: 0,   y: 0.4, width: 0.6, height: 0.6 },  // Bottom-Left: 60% width, 60% height
 *   { x: 0.6, y: 0.4, width: 0.4, height: 0.6 }   // Bottom-Right: 40% width, 60% height
 * ]
 *
 * @see ResizableGridManager.ts lines 140-157
 */
const calculateLayoutOptions = (splitPosition: SplitPosition) => {
  const { horizontal, vertical } = splitPosition;

  return [
    // Top-Left quadrant
    { x: 0, y: 0, width: horizontal, height: vertical },

    // Top-Right quadrant
    { x: horizontal, y: 0, width: 1 - horizontal, height: vertical },

    // Bottom-Left quadrant
    { x: 0, y: vertical, width: horizontal, height: 1 - vertical },

    // Bottom-Right quadrant
    { x: horizontal, y: vertical, width: 1 - horizontal, height: 1 - vertical }
  ];
};
```

---

## Key Code Snippets

### 1. Drag Handle Creation

```typescript
/**
 * @method createDragHandle
 * @description Creates the interactive drag handle element
 * @private
 *
 * Structure:
 * - Container div (20x20px, centered at split intersection)
 *   - .drag-dot (12px circle, color-changing based on state)
 *   - .drag-arrow (SVG icon, visible on hover)
 *
 * @see ResizableGridManager.ts - createDragHandle()
 */
const dragHandle = document.createElement('div');
dragHandle.style.cssText = `
  position: absolute;
  width: ${HANDLE_SIZE}px;         /* 20px */
  height: ${HANDLE_SIZE}px;        /* 20px */
  cursor: move;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);  /* Center on split intersection */
`;

// Inner dot element
const dragDot = document.createElement('div');
dragDot.className = 'drag-dot';
dragDot.style.cssText = `
  width: 12px;
  height: 12px;
  background-color: #6b7280;  /* Gray in normal state */
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
`;

// Arrow icon (visible on hover)
const dragArrow = createArrowIcon();  // Multi-directional SVG
dragHandle.appendChild(dragDot);
dragHandle.appendChild(dragArrow);
```

### 2. Layout Update Implementation

```typescript
/**
 * @method updateLayout
 * @description Applies the current split position to the viewport grid
 * @private
 *
 * This method is called when:
 * - Drag operation completes (mouseup)
 * - Layout is programmatically changed
 *
 * @see ResizableGridManager.ts - updateLayout()
 */
private updateLayout(): void {
  if (!this.viewportGridService) return;

  const { horizontal, vertical } = this.splitPosition;

  // Calculate layout options for 4 viewports
  const layoutOptions = [
    { x: 0, y: 0, width: horizontal, height: vertical },
    { x: horizontal, y: 0, width: 1 - horizontal, height: vertical },
    { x: 0, y: vertical, width: horizontal, height: 1 - vertical },
    { x: horizontal, y: vertical, width: 1 - horizontal, height: 1 - vertical }
  ];

  // Apply to ViewportGridService
  this.viewportGridService.setLayout({
    numRows: 2,
    numCols: 2,
    layoutOptions
  });
}
```

### 3. Storage Management

```typescript
/**
 * @method saveMPRPosition
 * @description Persists current split position to storage
 * @private
 *
 * Storage key: 'usmpr-mpr-position'
 * Storage type: Determined by user preference (session/local)
 *
 * @see ResizableGridManager.ts - saveMPRPosition()
 */
private saveMPRPosition(): void {
  const storageType = this.getStorageType();  // localStorage or sessionStorage
  const key = 'usmpr-mpr-position';

  storageType.setItem(key, JSON.stringify(this.splitPosition));
}

/**
 * @method loadPosition
 * @description Retrieves saved split position from storage
 * @private
 *
 * @returns {SplitPosition} Saved position or default (0.5, 0.5)
 *
 * @see ResizableGridManager.ts - loadPosition()
 */
private loadPosition(): SplitPosition {
  const storageType = this.getStorageType();
  const key = 'usmpr-mpr-position';

  const saved = storageType.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.warn('Failed to parse saved position, using default');
    }
  }

  // Default: 50/50 split
  return { horizontal: 0.5, vertical: 0.5 };
}

/**
 * @method getStorageType
 * @description Determines storage type based on user preference
 * @private
 *
 * @returns {Storage} localStorage or sessionStorage
 *
 * Priority:
 * 1. User preference from 'usmpr-storage-preference'
 * 2. Default to sessionStorage for privacy
 */
private getStorageType(): Storage {
  const preference = localStorage.getItem('usmpr-storage-preference');
  return preference === 'local' ? localStorage : sessionStorage;
}
```

### 4. Visual Element Updates

```typescript
/**
 * @method updateVisualElements
 * @description Updates drag handle and grid line appearance
 * @private
 *
 * @param {boolean} isActive - True when hovering or dragging
 *
 * Color scheme:
 * - Inactive: Gray (#6b7280 for dot, #374151 for lines)
 * - Active: Blue (#3b82f6 with glow effect)
 *
 * @see ResizableGridManager.ts - updateVisualElements()
 */
private updateVisualElements(isActive: boolean): void {
  if (!this.dragHandle || !this.verticalLine || !this.horizontalLine) return;

  const dotColor = isActive ? '#3b82f6' : '#6b7280';  // Blue : Gray
  const lineColor = isActive ? '#3b82f6' : '#374151';
  const glowEffect = isActive ? '0 0 8px rgba(59, 130, 246, 0.5)' : '0 2px 4px rgba(0, 0, 0, 0.2)';

  // Update drag dot
  const dragDot = this.dragHandle.querySelector('.drag-dot') as HTMLElement;
  if (dragDot) {
    dragDot.style.backgroundColor = dotColor;
    dragDot.style.boxShadow = glowEffect;
  }

  // Update arrow visibility
  const dragArrow = this.dragHandle.querySelector('.drag-arrow') as HTMLElement;
  if (dragArrow) {
    dragArrow.style.opacity = isActive ? '1' : '0';
  }

  // Update grid lines
  this.verticalLine.style.backgroundColor = lineColor;
  this.horizontalLine.style.backgroundColor = lineColor;

  // Position elements
  this.positionElements();
}
```

---

## Storage Keys

| Key Name | Purpose | Data Format | Default Value |
|----------|---------|-------------|---------------|
| `usmpr-mpr-position` | Stores split position for MPR 2x2 grid | `{ horizontal: number, vertical: number }` | `{ horizontal: 0.5, vertical: 0.5 }` |
| `usmpr-hidden-position` | Stores split position when in single viewport mode | `{ horizontal: number, vertical: number }` | `{ horizontal: 0.5, vertical: 0.5 }` |
| `usmpr-layout-config` | Stores viewport layout configuration | JSON object with view types and 3D presets | See LayoutConfigModal |
| `usmpr-storage-preference` | User's storage type preference | `'session'` or `'local'` | `'session'` |

---

## Visual Design

### Drag Handle States

| State | Dot Color | Line Color | Shadow/Glow | Arrow Visibility |
|-------|-----------|------------|-------------|------------------|
| **Normal** | `#6b7280` (Gray) | `#374151` (Dark Gray) | `0 2px 4px rgba(0,0,0,0.2)` | Hidden |
| **Hover** | `#3b82f6` (Blue) | `#3b82f6` (Blue) | `0 0 8px rgba(59,130,246,0.5)` | Visible |
| **Dragging** | `#3b82f6` (Blue) | `#3b82f6` (Blue) | `0 0 8px rgba(59,130,246,0.5)` | Visible |

### Element Dimensions

```typescript
/**
 * @constant HANDLE_SIZE
 * @description Drag handle container size
 * @type {number}
 * @value 20
 */
const HANDLE_SIZE = 20;  // pixels

/**
 * Drag dot: 12px diameter circle
 * Arrow icon: SVG, scales with container
 * Grid lines: 2px width
 */
```

### CSS Styling

All styles are dynamically generated as inline CSS (no separate CSS file):

```typescript
// Drag handle container
dragHandle.style.cssText = `
  position: absolute;
  width: 20px;
  height: 20px;
  cursor: move;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
`;

// Vertical line (left-right divider)
verticalLine.style.cssText = `
  position: absolute;
  width: 2px;
  background-color: #374151;
  z-index: 999;
  pointer-events: none;
  transition: background-color 0.2s ease;
`;

// Horizontal line (top-bottom divider)
horizontalLine.style.cssText = `
  position: absolute;
  height: 2px;
  background-color: #374151;
  z-index: 999;
  pointer-events: none;
  transition: background-color 0.2s ease;
`;
```

---

## Performance Optimizations

### 1. Lazy Initialization
```typescript
/**
 * ResizableGridManager is instantiated only when:
 * - User first enters MPR grid mode (2x2 layout)
 * - Not created for single viewport mode
 *
 * @see index.tsx lines 243-250
 */
if (!resizableGridManager && numRows === 2 && numCols === 2) {
  resizableGridManager = new ResizableGridManager(
    viewportGridService,
    hangingProtocolService
  );
}
```

### 2. Deferred Layout Updates
```typescript
/**
 * During drag operation:
 * - onMouseMove: Updates visual elements ONLY
 * - onMouseUp: Applies layout to viewports
 *
 * Benefit: Prevents expensive viewport recreation during drag
 */
private onMouseMove = (e: MouseEvent): void => {
  // ... calculate new position ...
  this.updateVisualElements(true);  // Visual feedback only
  // Layout NOT updated here
};

private onMouseUp = (): void => {
  // ... finalize drag ...
  this.updateLayout();  // Layout updated once at end
};
```

### 3. Event Listener Management
```typescript
/**
 * Global listeners added only during active drag:
 * - Reduces overhead when not dragging
 * - Properly cleaned up on drag end
 */
private onMouseDown = (): void => {
  document.addEventListener('mousemove', this.onMouseMove);
  document.addEventListener('mouseup', this.onMouseUp);
};

private onMouseUp = (): void => {
  document.removeEventListener('mousemove', this.onMouseMove);
  document.removeEventListener('mouseup', this.onMouseUp);
};
```

### 4. Constraint Validation
```typescript
/**
 * @constant MIN_SIZE
 * @constant MAX_SIZE
 * @description Prevents unnecessary calculations for invalid positions
 */
const MIN_SIZE = 0.0;
const MAX_SIZE = 1.0;

this.splitPosition.horizontal = Math.max(MIN_SIZE, Math.min(MAX_SIZE, x));
this.splitPosition.vertical = Math.max(MIN_SIZE, Math.min(MAX_SIZE, y));
```

---

## Integration Points

### 1. ViewportGridService

```typescript
/**
 * @service ViewportGridService
 * @description Manages viewport grid layout and positioning
 *
 * Integration methods:
 * - setLayout(config): Updates viewport positions
 * - subscribe(event, callback): Listens to layout changes
 *
 * Events:
 * - LAYOUT_CHANGED: Fired when grid configuration changes
 * - GRID_STATE_CHANGED: Fired when switching between layouts
 */

// Subscribe to layout changes
viewportGridService.subscribe(
  viewportGridService.EVENTS.LAYOUT_CHANGED,
  ({ numRows, numCols, layoutOptions }) => {
    // Handle layout change
  }
);

// Apply new layout
viewportGridService.setLayout({
  numRows: 2,
  numCols: 2,
  layoutOptions: [
    { x: 0, y: 0, width: 0.6, height: 0.4 },
    // ... other viewports
  ]
});
```

### 2. HangingProtocolService

```typescript
/**
 * @service HangingProtocolService
 * @description Manages hanging protocol definitions and application
 *
 * Integration:
 * - Reads initial layout from protocol
 * - Updates protocol when LayoutConfigModal changes configuration
 */

// Read protocol
const protocol = hangingProtocolService.getActiveProtocol();

// Update via LayoutConfigModal
refreshViewportsFromConfig(servicesManager);
```

### 3. ToolGroupService

```typescript
/**
 * @service ToolGroupService
 * @description Manages Cornerstone tool groups
 *
 * Tool groups:
 * - 'mpr': Active in MPR grid mode (2x2)
 * - 'default': Active in single viewport mode (1x1)
 *
 * Integration:
 * - Activates/deactivates Crosshairs tool
 * - Manages tool state per layout
 */

// Activate MPR tools
const mprToolGroup = toolGroupService.getToolGroup('mpr');
mprToolGroup.setToolActive('Crosshairs');
```

### 4. CornerstoneViewportService

```typescript
/**
 * @service CornerstoneViewportService
 * @description Manages Cornerstone viewport instances
 *
 * Integration:
 * - Gets/sets viewport positions
 * - Manages STACK viewport for fullscreen mode
 * - Jumps to world coordinates for position restoration
 */

// Get viewport
const viewport = cornerstoneViewportService.getViewport(viewportId);

// Jump to position
viewport.setCamera({ position, focalPoint, viewUp });
```

---

## Implementation Details

### DOM Query Strategy

```typescript
/**
 * @description Finds the viewport grid container using data-cy attribute
 *
 * Selector: [data-cy="viewport-grid"]
 * Defined in: platform/ui-next/src/components/Viewport/ViewportGrid.tsx
 */
const container = document.querySelector('[data-cy="viewport-grid"]') as HTMLElement;

if (!container) {
  console.error('ViewportGrid container not found');
  return;
}

this.container = container;
```

### Event Handling Pattern

```typescript
/**
 * @description Event listener registration pattern
 *
 * Local listeners (persistent):
 * - mousedown on drag handle
 * - mouseenter/mouseleave for hover effects
 *
 * Global listeners (temporary, during drag only):
 * - mousemove on document
 * - mouseup on document
 */

// Persistent listeners
dragHandle.addEventListener('mousedown', this.onMouseDown);
dragHandle.addEventListener('mouseenter', () => this.updateVisualElements(true));
dragHandle.addEventListener('mouseleave', () => this.updateVisualElements(false));

// Temporary listeners (added in onMouseDown, removed in onMouseUp)
document.addEventListener('mousemove', this.onMouseMove);
document.addEventListener('mouseup', this.onMouseUp);
```

### CSS Classes

```typescript
/**
 * CSS classes used in drag handle:
 *
 * .drag-dot
 * - Purpose: Visual indicator (circle)
 * - Styling: Inline CSS
 * - States: Color changes on hover/drag
 *
 * .drag-arrow
 * - Purpose: Directional indicator (SVG)
 * - Styling: Inline CSS
 * - States: Visibility changes on hover/drag
 */
```

---

## Future Enhancements

### Planned Improvements

1. **Touch Event Support**
   - Add touch event handlers for mobile/tablet devices
   - Implement touch gestures for viewport resizing
   - Test on various screen sizes

2. **Keyboard Shortcuts**
   - Arrow keys for fine-tuned adjustments
   - Shift + Arrow for larger increments
   - Reset to default (50/50) shortcut

3. **Layout Presets**
   - Quick select buttons for common layouts
   - Examples: 1:1, 2:1, 1:2, 3:1
   - Save custom presets

4. **Animation Transitions**
   - Smooth transitions when applying presets
   - Ease-in-out animations for layout changes
   - Configurable animation duration

5. **Undo/Redo Functionality**
   - Track layout history
   - Ctrl+Z / Ctrl+Y shortcuts
   - Visual indication of undo/redo availability

6. **Accessibility Improvements**
   - ARIA labels for screen readers
   - Keyboard-only navigation support
   - High contrast mode support

---

## Troubleshooting

### Common Issues

#### 1. Drag handle not appearing
**Cause**: ViewportGrid container not found in DOM

**Solution**:
```typescript
// Check if container exists
const container = document.querySelector('[data-cy="viewport-grid"]');
if (!container) {
  console.error('ViewportGrid not mounted yet');
}
```

#### 2. Layout not persisting across sessions
**Cause**: Storage preference set to sessionStorage

**Solution**:
```typescript
// Change to localStorage in LayoutConfigModal
localStorage.setItem('usmpr-storage-preference', 'local');
```

#### 3. Drag handle position incorrect
**Cause**: Container size changed but handle not updated

**Solution**:
```typescript
// Manually trigger position update
resizableGridManager?.positionElements();
```

---

## Related Files

### Full File Paths

```
Core Files:
├── modes/usmpr/src/utils/ResizableGridManager.ts
├── modes/usmpr/src/index.tsx
├── modes/usmpr/src/components/LayoutConfigModal.tsx
└── modes/usmpr/src/utils/LayoutConfigManager.tsx

Supporting Files:
├── modes/usmpr/src/utils/SlicePlaneManager.ts
├── modes/usmpr/src/utils/SlicePlaneSync.ts
├── modes/usmpr/src/toolbarButtons.ts
├── extensions/default/src/hangingprotocols/hpUSMPR.ts
└── platform/ui-next/src/components/Viewport/ViewportGrid.tsx
```

---

## References

### External Dependencies
- **Cornerstone3D**: Viewport rendering engine
- **VTK.js**: 3D visualization for slice planes
- **React**: UI component framework

### Internal Services
- `ViewportGridService`: Grid layout management
- `HangingProtocolService`: Protocol definitions
- `ToolGroupService`: Tool management
- `CornerstoneViewportService`: Viewport instances

### Events
- `LAYOUT_CHANGED`: Grid configuration changed
- `GRID_STATE_CHANGED`: Grid state transition
- `CAMERA_MODIFIED`: Viewport camera position changed
- `IMAGE_RENDERED`: Viewport rendered new image
- `STACK_NEW_IMAGE`: New stack image loaded

---

**Document Version**: 1.0
**Last Updated**: 2025-12-22
**Maintainer**: USMPR Development Team
