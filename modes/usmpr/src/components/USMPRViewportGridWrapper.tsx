import React, { useCallback, useEffect, useState } from 'react';
import { useViewportGrid } from '@ohif/ui-next';
import { ResizableMPRGrid } from './ResizableMPRGrid';

interface LayoutOption {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Wrapper component that adds resizable functionality to the USMPR 2x2 grid
 * This component overlays the drag handle on top of the existing ViewportGrid
 */
export const USMPRViewportGridWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [viewportGrid, viewportGridService] = useViewportGrid();
  const [isUSMPRMode, setIsUSMPRMode] = useState(false);

  // Check if we're in USMPR mode by checking the viewport count and layout
  useEffect(() => {
    const { layout, viewports } = viewportGrid;
    const { numCols, numRows } = layout;

    // USMPR mode has 2x2 grid with 4 viewports
    const isUSMPR = numCols === 2 && numRows === 2 && viewports.length === 4;
    setIsUSMPRMode(isUSMPR);
  }, [viewportGrid]);

  // Handle layout changes from ResizableMPRGrid
  const handleLayoutChange = useCallback(
    (layoutOptions: LayoutOption[]) => {
      if (!isUSMPRMode) return;

      const { layout, viewports } = viewportGrid;

      // Only update if we have 4 viewports (2x2 grid)
      if (viewports.length !== 4) return;

      // Get current layout from viewportGridService state
      const currentState = viewportGridService.getState();

      // Update the layout with new layoutOptions while preserving other properties
      viewportGridService.setLayout({
        numRows: layout.numRows,
        numCols: layout.numCols,
        layoutType: layout.layoutType || 'grid',
        layoutOptions,
        // Preserve the viewport configuration
        findOrCreateViewport: (pos) => {
          const viewport = viewports[pos];
          if (!viewport) return null;

          return {
            displaySetInstanceUIDs: viewport.displaySetInstanceUIDs || [],
            displaySetOptions: viewport.displaySetOptions || [],
            viewportOptions: viewport.viewportOptions || {},
          };
        },
        isHangingProtocolLayout: true,
      });
    },
    [isUSMPRMode, viewportGrid, viewportGridService]
  );

  // Only render the resizable overlay if we're in USMPR mode
  if (!isUSMPRMode) {
    return <>{children}</>;
  }

  return (
    <ResizableMPRGrid onLayoutChange={handleLayoutChange}>
      {children}
    </ResizableMPRGrid>
  );
};

export default USMPRViewportGridWrapper;
