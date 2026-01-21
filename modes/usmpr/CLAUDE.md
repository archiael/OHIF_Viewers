# # CLAUDE.md
USMPR Mode Documentation

## Table of Contents
1. [Module Overview](#1-module-overview)
    - 1.1. [Role in OHIF React App](#11-role-in-ohif-react-app)
    - 1.2. [Key Features](#12-key-features)
2. [Detailed Feature Guides](#2-detailed-feature-guides)
    - 2.1. [Configure Viewport Layout Dialog](#21-configure-viewport-layout-dialog)
        - 2.1.1. [Purpose & Usage](#211-purpose--usage)
        - 2.1.2. [Architecture & Data Flow](#212-architecture--data-flow)
    - 2.2. [Resizable Grid Layout](#22-resizable-grid-layout)
        - 2.2.1. [Drag & Drop Interaction](#221-drag--drop-interaction)
        - 2.2.2. [Implementation Details](#222-implementation-details)
3. [Key Files & Components](#3-key-files--components)
    - 3.1. [Core Entry Points](#31-core-entry-points)
    - 3.2. [Components](#32-components-components)
    - 3.3. [Utilities](#33-utilities-utils)
    - 3.4. [HTJ2K Background Loading & Cache Management](#34-htj2k-background-loading--cache-management)
        - 3.4.1. [Key Functions](#341-key-functions)
        - 3.4.2. [Usage in USMPR Mode](#342-usage-in-usmpr-mode)
    - 3.5. [US Volume Rendering](#35-us-volume-rendering)
        - 3.5.1. [Volume Presets](#351-volume-presets-usvolumepresetsts)
        - 3.5.2. [Preset Conversion](#352-preset-conversion-convertpresetstocornerstonets)
        - 3.5.3. [Quality Optimization](#353-quality-optimization-usvolumequalityts)
4. [React Architecture & State Management](#4-react-architecture--state-management)
    - 4.1. [Global vs Local State](#41-global-vs-local-state)
    - 4.2. [UI Patterns](#42-ui-patterns)
5. [OHIF Concepts](#5-ohif-concepts)
    - 5.1. [Extensions vs Modes](#51-extensions-vs-modes)
    - 5.2. [Hanging Protocols](#52-hanging-protocols)
6. [Developer Guide](#6-developer-guide)
    - 6.1. [Learning Path](#61-learning-path)
    - 6.2. [Debugging Tips](#62-debugging-tips)

## 1. Module Overview

### 1.1. Role in OHIF React App

The `modes/usmpr/src` folder contains the core logic for the **USMPR (Ultrasound Multi-Planar Reconstruction) Mode**. This mode provides a 2x2 multi-planar viewer for visualizing 3D volume data (CT, MR, US) with synchronized crosshairs and interactive layout controls.

### 1.2. Key Features

*   **4V+1S Layout**: 4 Volume viewports (Axial, Sagittal, Coronal, 3D) + 1 hidden Stack viewport.
*   **Crosshair Synchronization**: Synchronized mouse position across all 4 planar views.
*   **3D Slice Plane Rendering**: Visualizes the current MPR slice position as colored planes in the 3D view.
*   **Interactive Layout Resizing**: Drag-and-drop interface to adjust viewport sizes.
*   **Layout Configuration**: User-customizable assignment of views to grid positions.
*   **HTJ2K Optimization**: Level 2 (1/4 resolution) for Volume, Level 0 (full resolution) for Stack.
*   **HTJ2K Background Loading**: Progressive background loading with cache management for optimal performance.
*   **US Volume Rendering**: Specialized presets and quality optimization for Ultrasound 3D visualization.

---

## 2. Detailed Feature Guides

This section details specific interactive features implemented in this mode.

### 2.1. Configure Viewport Layout Dialog

**Source**: `modes/usmpr/VIEWPORT_CONFIG_DIALOG_GUIDE.md`

### 2.1.1. Purpose & Usage
The "Configure Viewport Layout" dialog allows users to customize what is displayed in each of the four quadrants of the 2x2 grid. Users can assign specific view types (Axial, Coronal, Sagittal, 3D) to any position and select 3D rendering presets.

*   **Access**: Through the "Change Layout" toolbar button.
*   **Persistence**: Settings can be saved to either `sessionStorage` (default) or `localStorage`.

### 2.1.2. Architecture & Data Flow
*   **Component**: `LayoutConfigModal.tsx` handles the UI logic, including position state, validation (ensuring each view is used once), and storage management.
*   **Lifecycle**: `LayoutConfigManager.tsx` manages the modal's lifecycle (show/hide) using a React Portal to render it at the root level.
*   **Application**: When saved, `refreshViewportsFromConfig()` updates the Hanging Protocol, triggering a layout refresh without a full page reload.

### 2.2. Resizable Grid Layout

**Source**: `modes/usmpr/VIEWPORT_LAYOUT_RESIZE_GUIDE.md`

### 2.2.1. Drag & Drop Interaction
The USMPR mode features a draggable vertex at the center of the 2x2 grid.
*   **Interaction**: Users drag the central handle to resize the four viewports simultaneously.
*   **Visual Feedback**: The handle and grid lines change color (blue) and show a glow effect during interaction.
*   **Persistence**: Split positions are saved to storage (`usmpr-mpr-position`) and restored when the layout is reloaded.

### 2.2.2. Implementation Details
*   **Logic**: `ResizableGridManager.ts` handles all mouse events (`mousedown`, `mousemove`, `mouseup`) and calculates normalized split positions (0.0 - 1.0).
*   **Optimization**: Layout updates are deferred until the drag ends (`mouseup`) to prevent expensive viewport re-rendering during movement. Visual elements (lines, handle) are updated in real-time.
*   **State**: It automatically initializes when entering the 2x2 layout and hides when switching to a single viewport.

---

## 3. Key Files & Components

### 3.1. Core Entry Points
*   **`index.tsx`**: Main entry point. initializes managers (`ResizableGridManager`), sets up event listeners, and handles mode lifecycle.
*   **`toolbarButtons.ts`**: Defines toolbar interaction, including the layout config command.

### 3.2. Components (`components/`)
*   **`LayoutConfigModal.tsx`**: The React component for the layout configuration dialog.

### 3.3. Utilities (`utils/`)
*   **`ResizableGridManager.ts`**: Class managing the DOM elements and logic for the drag-and-drop grid resizing.
*   **`LayoutConfigManager.tsx`**: Helper class to bridge the Imperative command calls to the React modal component.
*   **`SlicePlaneManager.ts`**: Manages VTK.js actors to render colored slice planes (Axial=Red, Sagittal=Yellow, Coronal=Blue) in the 3D viewport.
*   **`SlicePlaneSync.ts`**: Synchronizes the 3D slice planes with the camera position of the MPR viewports.
*   **`usVolumePresets.ts`**: Defines VTK.js volume rendering presets for Ultrasound imaging (4 skin surface presets: A, B, C, D with different opacity and color transfer functions).
*   **`convertPresetsToCornerstone.ts`**: Converts VTK.js presets (vtkColorTransferFunction, vtkPiecewiseFunction) to Cornerstone3D-compatible preset string formats for volume rendering.
*   **`usVolumeQuality.ts`**: Optimizes GPU raycast quality settings for US volume rendering by calculating sample distance based on image spacing (typically 0.6 × minSpacing).

### 3.4. HTJ2K Background Loading & Cache Management

The USMPR mode integrates advanced HTJ2K image loading with intelligent cache management to optimize performance for large 3D volumes.

#### 3.4.1. Key Functions

**From `extensions/cornerstone/src/utils/htj2kBackgroundLoader.ts`**:

*   **`loadRemainingHTJ2KData(imageIds, onProgress, onComplete)`**:
    - Progressively loads remaining HTJ2K data in the background using Range Requests
    - Used when Range Request is enabled (standard DICOMweb servers)
    - Reports progress percentage and completion statistics

*   **`loadBackgroundHTJ2KData(imageIds, onProgress, onComplete)`**:
    - Alternative loading method using Server API for bulk downloads
    - Used when Server API is enabled (custom optimized servers)
    - More efficient for downloading multiple images at once

*   **`getCacheStats()`**:
    - Returns current cache statistics: `totalEntries`, `currentSizeBytes`, `maxSizeBytes`
    - Useful for monitoring memory usage and cache efficiency

*   **`clearHTJ2KCache()`**:
    - Clears all HTJ2K cache entries to free memory
    - Called automatically during mode exit and series changes

*   **`clearCacheForSeriesChange()`**:
    - Selective cache clearing when switching between series
    - Preserves relevant cached data while freeing unnecessary memory

#### 3.4.2. Usage in USMPR Mode

The background loading is triggered after the initial viewport rendering (in `index.tsx`):

```typescript
// Line ~420-465 in index.tsx
if (isServerApiEnabled()) {
  // Server API: Bulk download all at once
  await loadBackgroundHTJ2KData(imageIdsArray, onProgress, onComplete);
} else {
  // Range Request: Progressive download
  await loadRemainingHTJ2KData(imageIdsArray, onProgress, onComplete);
}

// Get cache statistics
const cacheStats = getCacheStats();
console.log(`Cache: ${cacheStats.totalEntries} entries, ${cacheStats.currentSizeBytes / 1024 / 1024} MB`);
```

On mode exit (`onModeExit` at line ~2715):
```typescript
const cacheStats = getCacheStats();
clearHTJ2KCache(); // Free all memory
```

### 3.5. US Volume Rendering

The mode provides specialized support for Ultrasound 3D volume rendering with optimized presets and quality settings.

#### 3.5.1. Volume Presets (`usVolumePresets.ts`)

Defines 4 VTK.js-based presets for US surface rendering:

*   **Preset A**: Baseline moderate opacity (beige-to-white gradient)
*   **Preset B**: Higher opacity for denser tissue visualization
*   **Preset C**: Lower opacity for semi-transparent views
*   **Preset D**: High-contrast visualization with adjusted gradient

Each preset includes:
- `vtkColorTransferFunction`: RGB color mapping (0-255 range)
- `vtkPiecewiseFunction`: Scalar opacity curve
- `vtkPiecewiseFunction`: Gradient opacity for edge detection
- Shading parameters: ambient, diffuse, specular lighting

#### 3.5.2. Preset Conversion (`convertPresetsToCornerstone.ts`)

Converts VTK.js presets to Cornerstone3D string format:

```typescript
// VTK format → Cornerstone string format
colorTransferToString(vtkColorTransferFunction)
// Output: "50 x1 r1 g1 b1 x2 r2 g2 b2 ..." (50 sample points)

piecewiseToString(vtkPiecewiseFunction)
// Output: "50 x1 opacity1 x2 opacity2 ..." (50 sample points)
```

This allows VTK.js presets to be used directly with Cornerstone3D volume rendering.

#### 3.5.3. Quality Optimization (`usVolumeQuality.ts`)

**Function**: `applyGpuRayCastQuality({ volumeMapper, imageData })`

Optimizes GPU raycast rendering quality based on image spacing:

```typescript
const spacing = imageData.getSpacing(); // [x, y, z] in mm
const minSpacing = Math.min(...spacing);
const sampleDistance = 0.6 * minSpacing; // Optimal for US surface rendering

volumeMapper.setSampleDistance(sampleDistance);
volumeMapper.setAutoAdjustSampleDistances(false); // Predictable results
```

**Trade-offs**:
- Smaller `sampleDistance` (e.g., 0.4 × minSpacing): Sharper but slower
- Larger `sampleDistance` (e.g., 1.0 × minSpacing): Faster but blockier
- Default 0.6 × minSpacing: Balanced quality/performance for US imaging

---

## 4. React Architecture & State Management

### 4.1. Global vs Local State
*   **Global (OHIF Services)**: Accessed via `servicesManager` (e.g., `viewportGridService`, `hangingProtocolService`). Used for major app state like the current layout grid.
*   **Local (Module Level)**: Singleton manager instances (`resizableGridManager`, `slicePlaneManager`) initialized in `index.tsx` manage feature-specific logic.

### 4.2. UI Patterns
*   **Portal Pattern**: `LayoutConfigManager` uses React Portals to render modals outside the main DOM hierarchy (attached to body) to avoid z-index and overflow issues.
*   **Manager Class Pattern**: TypeScript classes (`ResizableGridManager`) are used for heavy DOM manipulation or VTK.js integration, keeping complex logic out of React components.

---

## 5. OHIF Concepts

### 5.1. Extensions vs Modes
*   **Mode**: This folder (`modes/usmpr`) defines a specific workflow by composing extensions.
*   **Extension**: Provides reusable building blocks (viewports, commands) used by this mode.

### 5.2. Hanging Protocols
*   **`hpUSMPR.ts`**: Defines the initial 2x2 layout and how viewports map to data. It creates 5 viewports: 4 visible MPR viewports and 1 stack viewport.

---

## 6. Developer Guide

### 6.1. Learning Path
1.  **Entry Point**: Start with `index.tsx` to understand the initialization flow (`onModeEnter`) and lifecycle management.
2.  **UI Customization**: Study `LayoutConfigModal.tsx` to see how to build settings dialogs that interact with OHIF services.
3.  **Interaction**: Analyze `ResizableGridManager.ts` to understand how to layer interactive DOM elements over the canvas.
4.  **3D Visualization**: Look at `SlicePlaneManager.ts` for examples of direct VTK.js actor manipulation.
5.  **HTJ2K Optimization**: Review the background loading logic in `index.tsx` (lines ~420-465) and cache management in `onModeExit` (line ~2715).
6.  **Volume Rendering**: Explore `usVolumePresets.ts` to understand VTK.js transfer functions, then see `convertPresetsToCornerstone.ts` for format conversion.
7.  **Quality Tuning**: Study `usVolumeQuality.ts` to learn how to optimize GPU raycast rendering based on image properties.

### 6.2. Debugging Tips
*   **Console Logs**: The mode emits distinct logs like `[USMPR INIT]`, `[HP]`, `[HTJ2K-BG]`, and `[US Quality]`.
*   **Common Issues**:
    *   *Crosshairs missing*: Check `SlicePlaneSync.ts` event subscriptions.
    *   *Layout not saving*: Verify `localStorage` vs `sessionStorage` setting in the config dialog.
    *   *HTJ2K loading slow*: Check `getCacheStats()` output and verify server supports Range Requests or Server API.
    *   *3D Volume blocky*: Adjust sample distance in `usVolumeQuality.ts` (try 0.4-0.8 × minSpacing).
    *   *Cache memory issues*: Monitor cache size with `getCacheStats()` and ensure `clearHTJ2KCache()` is called on mode exit.

---

## File Statistics

| File | Lines | Purpose |
|------|-------|---------|
| `index.tsx` | 2869 | Main mode entry point with lifecycle management |
| `toolbarButtons.ts` | ~708 | Toolbar button definitions |
| `LayoutConfigModal.tsx` | ~428 | Layout configuration dialog UI |
| `ResizableGridManager.ts` | ~350 | Drag-and-drop grid resizing logic |
| `SlicePlaneManager.ts` | ~280 | 3D slice plane visualization |
| `SlicePlaneSync.ts` | ~180 | Slice plane synchronization |
| `LayoutConfigManager.tsx` | ~150 | Modal lifecycle management |
| `usVolumePresets.ts` | ~200 | VTK.js volume rendering presets |
| `convertPresetsToCornerstone.ts` | ~120 | Preset format conversion |
| `usVolumeQuality.ts` | ~80 | GPU raycast quality optimization |

**Total Mode Complexity**: ~5,500 lines across 10+ files

---

**Documentation Version**: OHIF v3.12.0-beta based
**Last Updated**: 2026-01-21
**Mode Type**: Custom (mView-WebV2)
**Primary Use Case**: Multi-planar US/CT/MR volume visualization with HTJ2K optimization
