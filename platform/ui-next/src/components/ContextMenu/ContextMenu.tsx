import React, { useEffect, useRef, useState } from 'react';
import classnames from 'classnames';

interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    tooltip?: string;
  }>;
  onClose: () => void;
}

/**
 * Context Menu Component
 * Displays a popup menu at the specified x, y coordinates
 */
const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    // Adjust position if menu would go off screen
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // If menu goes off right edge, move it left
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // If menu goes off bottom edge, move it up
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }

    // Close menu on click outside or escape key
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [x, y, onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-md border border-gray-700 bg-gray-900 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="py-1">
        {items.map((item, index) => (
          <button
            key={index}
            className={classnames(
              'flex w-full items-center px-4 py-2 text-left text-sm transition-colors',
              {
                'text-white hover:bg-gray-800': !item.disabled,
                'cursor-not-allowed text-gray-500': item.disabled,
              }
            )}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            title={item.tooltip}
          >
            <span className="truncate">{item.label}</span>
            {item.disabled && item.tooltip && (
              <span className="ml-2 text-xs text-gray-600">({item.tooltip})</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ContextMenu;
