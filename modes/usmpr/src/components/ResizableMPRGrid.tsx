import React, { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'usmpr-viewport-split-position';
const MIN_SIZE = 0.2; // 1/5 of total size
const MAX_SIZE = 0.8; // 4/5 of total size
const HANDLE_SIZE = 20; // Size of the draggable handle area in pixels

interface ResizableMPRGridProps {
  children: React.ReactNode;
  onLayoutChange?: (layoutOptions: Array<{ x: number; y: number; width: number; height: number }>) => void;
}

export const ResizableMPRGrid: React.FC<ResizableMPRGridProps> = ({
  children,
  onLayoutChange,
}) => {
  // Load saved position from localStorage or default to 0.5 (center)
  const getSavedPosition = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { horizontalSplit, verticalSplit } = JSON.parse(saved);
        return {
          horizontal: Math.max(MIN_SIZE, Math.min(MAX_SIZE, horizontalSplit)),
          vertical: Math.max(MIN_SIZE, Math.min(MAX_SIZE, verticalSplit)),
        };
      }
    } catch (e) {
      console.warn('Failed to load saved viewport position:', e);
    }
    return { horizontal: 0.5, vertical: 0.5 };
  };

  const [splitPosition, setSplitPosition] = useState(getSavedPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Save position to localStorage
  const savePosition = useCallback((horizontal: number, vertical: number) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ horizontalSplit: horizontal, verticalSplit: vertical })
      );
    } catch (e) {
      console.warn('Failed to save viewport position:', e);
    }
  }, []);

  // Calculate layout options based on split position
  const calculateLayoutOptions = useCallback(
    (horizontal: number, vertical: number) => {
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
    },
    []
  );

  // Notify parent of layout changes
  useEffect(() => {
    if (onLayoutChange) {
      const layoutOptions = calculateLayoutOptions(splitPosition.horizontal, splitPosition.vertical);
      onLayoutChange(layoutOptions);
    }
  }, [splitPosition, onLayoutChange, calculateLayoutOptions]);

  // Handle mouse down on drag handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle mouse move during drag
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Constrain to min/max sizes
      const horizontal = Math.max(MIN_SIZE, Math.min(MAX_SIZE, x));
      const vertical = Math.max(MIN_SIZE, Math.min(MAX_SIZE, y));

      setSplitPosition({ horizontal, vertical });
    },
    [isDragging]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      savePosition(splitPosition.horizontal, splitPosition.vertical);
    }
  }, [isDragging, splitPosition, savePosition]);

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'move';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Viewport container */}
      {children}

      {/* Vertical divider line */}
      <div
        style={{
          position: 'absolute',
          left: `${splitPosition.horizontal * 100}%`,
          top: 0,
          bottom: 0,
          width: '1px',
          backgroundColor: isDragging || isHovering ? '#3b82f6' : '#374151',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Horizontal divider line */}
      <div
        style={{
          position: 'absolute',
          top: `${splitPosition.vertical * 100}%`,
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: isDragging || isHovering ? '#3b82f6' : '#374151',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Draggable center handle */}
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          position: 'absolute',
          left: `calc(${splitPosition.horizontal * 100}% - ${HANDLE_SIZE / 2}px)`,
          top: `calc(${splitPosition.vertical * 100}% - ${HANDLE_SIZE / 2}px)`,
          width: `${HANDLE_SIZE}px`,
          height: `${HANDLE_SIZE}px`,
          cursor: 'move',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Visual indicator with 4-direction arrow */}
        <div
          style={{
            width: '12px',
            height: '12px',
            backgroundColor: isDragging || isHovering ? '#3b82f6' : '#6b7280',
            borderRadius: '50%',
            transition: 'all 0.2s',
            boxShadow:
              isDragging || isHovering
                ? '0 0 8px rgba(59, 130, 246, 0.6)'
                : '0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
        />

        {/* 4-direction arrow icon (shown on hover/drag) */}
        {(isHovering || isDragging) && (
          <svg
            style={{
              position: 'absolute',
              width: '16px',
              height: '16px',
              pointerEvents: 'none',
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Up arrow */}
            <path d="M12 5v14M5 12l7-7 7 7" />
            {/* Down arrow */}
            <path d="M12 19V5M19 12l-7 7-7-7" />
            {/* Left arrow */}
            <path d="M5 12h14M12 5l-7 7 7 7" />
            {/* Right arrow */}
            <path d="M19 12H5M12 19l7-7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
};

export default ResizableMPRGrid;
