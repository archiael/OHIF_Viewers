import React, { useState, useEffect } from 'react';
import { refreshViewportsFromConfig } from '../../../../extensions/default/src/hangingprotocols/hpUSMPR';

interface LayoutConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  servicesManager?: any;
  initialLayout?: ViewType[];
}

type ViewType = 'Axial' | 'Coronal' | 'Sagittal' | '3D' | null;
type PresetType = 'US 3D 1' | 'US 3D 2' | 'US 3D 3' | 'US 3D 4';

const LayoutConfigModal: React.FC<LayoutConfigModalProps> = ({
  isOpen,
  onClose,
  servicesManager,
  initialLayout,
}) => {
  const [positions, setPositions] = useState<ViewType[]>([
    'Axial',
    'Sagittal',
    'Coronal',
    '3D',
  ]);

  const [preset3D, setPreset3D] = useState<PresetType>('US 3D 1');
  const [storagePersistence, setStoragePersistence] = useState<'session' | 'local'>('session');

  // Load initial layout when provided or from storage
  useEffect(() => {
    if (isOpen) {
      // First, load storage preference
      const savedPreference = localStorage.getItem('usmpr-storage-preference');
      const preferenceToUse = (savedPreference === 'local' || savedPreference === 'session')
        ? savedPreference
        : 'session';
      setStoragePersistence(preferenceToUse);

      if (initialLayout) {
        setPositions(initialLayout);
      } else {
        // Load from the selected storage type
        const storage = preferenceToUse === 'local' ? localStorage : sessionStorage;
        const saved = storage.getItem('usmpr-layout-config');

        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.positions) {
              setPositions(parsed.positions);
              if (parsed.preset3D) {
                setPreset3D(parsed.preset3D);
              }
            } else {
              // Old format compatibility
              setPositions(parsed);
            }
          } catch (e) {
            console.error('Failed to parse saved layout:', e);
          }
        }
      }
    }
  }, [isOpen, initialLayout]);

  const [selectedView, setSelectedView] = useState<ViewType>(null);

  // Check if a view type is already used
  const isViewUsed = (viewType: ViewType) => {
    return positions.includes(viewType);
  };

  // Get color for a view type
  const getViewColor = (viewType: ViewType) => {
    switch (viewType) {
      case 'Axial':
        return '#22c55e'; // Green
      case 'Coronal':
        return '#3b82f6'; // Blue
      case 'Sagittal':
        return '#f59e0b'; // Orange
      case '3D':
        return '#8b5cf6'; // Purple
      default:
        return '#64748b'; // Gray for empty
    }
  };

  const handleViewButtonClick = (viewType: ViewType) => {
    // Don't allow selecting a view that's already used
    if (isViewUsed(viewType)) {
      return;
    }
    setSelectedView(viewType);
  };

  const handlePositionClick = (positionIndex: number) => {
    if (selectedView) {
      const newPositions = [...positions];

      // Check if selectedView is already used in another position (uniqueness enforcement)
      const existingIndex = newPositions.findIndex(p => p === selectedView);
      if (existingIndex !== -1 && existingIndex !== positionIndex) {
        // Swap: move existing position to null, assign to new position
        newPositions[existingIndex] = null;
      }

      newPositions[positionIndex] = selectedView;

      // Auto-fill logic: If 3 positions are now filled, auto-fill the 4th
      const filledCount = newPositions.filter(p => p !== null).length;
      if (filledCount === 3) {
        // Find the one remaining viewport type
        const allTypes: ViewType[] = ['Axial', 'Coronal', 'Sagittal', '3D'];
        const usedTypes = newPositions.filter(p => p !== null);
        const remainingType = allTypes.find(t => !usedTypes.includes(t));

        // Auto-fill the empty position
        const emptyIndex = newPositions.findIndex(p => p === null);
        if (emptyIndex !== -1 && remainingType) {
          newPositions[emptyIndex] = remainingType;
        }
      }

      setPositions(newPositions);
      setSelectedView(null); // Clear selection after assigning
    }
  };

  const handleClear = () => {
    setPositions([null, null, null, null]);
    setSelectedView(null);
  };

  const handleSave = () => {
    // Validate positions - replace nulls with defaults
    const validPositions = positions.map((pos, idx) => {
      if (pos === null || pos === undefined) {
        const defaults = ['Axial', 'Sagittal', 'Coronal', '3D'];
        console.warn(`⚠️ Position ${idx} is null, using default: ${defaults[idx]}`);
        return defaults[idx];
      }
      return pos;
    });

    // Save layout config to selected storage type
    const config = {
      positions: validPositions,
      preset3D: 'US 3D 1', // Always use default preset
    };

    // Always save preference to localStorage (this setting itself persists)
    localStorage.setItem('usmpr-storage-preference', storagePersistence);

    // Save layout config to the selected storage type
    const storage = storagePersistence === 'local' ? localStorage : sessionStorage;
    storage.setItem('usmpr-layout-config', JSON.stringify(config));

    onClose();

    // Re-apply hanging protocol to refresh viewports with new config
    // This uses images already in memory - no page reload needed!
    if (servicesManager) {
      const { hangingProtocolService } = servicesManager.services;
      if (hangingProtocolService) {
        // Small delay to ensure localStorage is written and modal is closed
        setTimeout(() => {
          try {
            // First, refresh the protocol's viewports array from localStorage
            // Pass the service so it can update the stored protocol too
            refreshViewportsFromConfig(hangingProtocolService);

            // Then re-run the protocol with updated viewports
            hangingProtocolService.setProtocol('@ohif/hpUSMPR', {
              stageIndex: 0
            });

            // Apply custom US preset after a delay to ensure viewport is ready
            setTimeout(() => {
              const storage = storagePersistence === 'local' ? localStorage : sessionStorage;
              const layoutConfig = JSON.parse(storage.getItem('usmpr-layout-config') || '{}');
              const presetName = layoutConfig.preset3D || 'US 3D 1';

              // Call global applyCustomUSPreset function
              if ((window as any).applyCustomUSPreset) {
                const { cornerstoneViewportService } = servicesManager.services;
                (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
              } else {
                console.warn('⚠️ [LayoutConfigModal] applyCustomUSPreset not available');
              }

              // Reapply handle position to resize viewports after layout change
              // NOTE: Increased delay to 1000ms to ensure viewports are fully initialized
              setTimeout(() => {
                if ((window as any).usmprResizableGridManager) {
                  (window as any).usmprResizableGridManager.reapplyPosition();
                } else {
                  console.warn('⚠️ [LayoutConfigModal] usmprResizableGridManager not available');
                }
              }, 1000); // Increased delay to ensure viewports are fully initialized
            }, 200); // Apply quickly after hanging protocol reloads
          } catch (error) {
            console.error('❌ Failed to re-apply hanging protocol:', error);
            console.warn('⚠️ Please reload the page manually to apply changes');
          }
        }, 100);
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          padding: '16px',
          width: '90vw',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#fff',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: 600,
            borderBottom: '2px solid #3b82f6',
            paddingBottom: '10px',
          }}
        >
          Configure Viewport Layout
        </h2>

        {/* Grid showing 4 positions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          {/* Position 1 - Upper Left */}
          <div
            onClick={() => handlePositionClick(0)}
            style={{
              border: selectedView ? '2px solid #22c55e' : '2px solid #475569',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#0f172a',
              cursor: selectedView ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#16a34a';
                e.currentTarget.style.backgroundColor = '#1e293b';
              }
            }}
            onMouseLeave={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#22c55e';
                e.currentTarget.style.backgroundColor = '#0f172a';
              }
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
              }}
            >
              Position 1 (Upper Left)
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: getViewColor(positions[0]),
                minHeight: '28px',
              }}
            >
              {positions[0] || 'Empty'}
            </div>
          </div>

          {/* Position 2 - Upper Right */}
          <div
            onClick={() => handlePositionClick(1)}
            style={{
              border: selectedView ? '2px solid #22c55e' : '2px solid #475569',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#0f172a',
              cursor: selectedView ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#16a34a';
                e.currentTarget.style.backgroundColor = '#1e293b';
              }
            }}
            onMouseLeave={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#22c55e';
                e.currentTarget.style.backgroundColor = '#0f172a';
              }
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
              }}
            >
              Position 2 (Upper Right)
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: getViewColor(positions[1]),
                minHeight: '28px',
              }}
            >
              {positions[1] || 'Empty'}
            </div>
          </div>

          {/* Position 3 - Lower Left */}
          <div
            onClick={() => handlePositionClick(2)}
            style={{
              border: selectedView ? '2px solid #22c55e' : '2px solid #475569',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#0f172a',
              cursor: selectedView ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#16a34a';
                e.currentTarget.style.backgroundColor = '#1e293b';
              }
            }}
            onMouseLeave={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#22c55e';
                e.currentTarget.style.backgroundColor = '#0f172a';
              }
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
              }}
            >
              Position 3 (Lower Left)
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: getViewColor(positions[2]),
                minHeight: '28px',
              }}
            >
              {positions[2] || 'Empty'}
            </div>
          </div>

          {/* Position 4 - Lower Right */}
          <div
            onClick={() => handlePositionClick(3)}
            style={{
              border: selectedView ? '2px solid #22c55e' : '2px solid #475569',
              borderRadius: '6px',
              padding: '12px',
              backgroundColor: '#0f172a',
              cursor: selectedView ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#16a34a';
                e.currentTarget.style.backgroundColor = '#1e293b';
              }
            }}
            onMouseLeave={e => {
              if (selectedView) {
                e.currentTarget.style.borderColor = '#22c55e';
                e.currentTarget.style.backgroundColor = '#0f172a';
              }
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
              }}
            >
              Position 4 (Lower Right)
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: getViewColor(positions[3]),
                minHeight: '28px',
              }}
            >
              {positions[3] || 'Empty'}
            </div>
          </div>
        </div>

        {/* Current selection info */}
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '14px',
            color: selectedView ? '#22c55e' : '#94a3b8',
            fontWeight: selectedView ? 600 : 400,
          }}
        >
          {selectedView
            ? `Selected: ${selectedView} - Click a position above to assign`
            : 'Click a view button below to start'}
        </div>

        {/* View type buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <button
            onClick={() => handleViewButtonClick('Axial')}
            disabled={isViewUsed('Axial')}
            style={{
              padding: '12px 16px',
              backgroundColor: isViewUsed('Axial') ? '#475569' : '#22c55e',
              color: isViewUsed('Axial') ? '#94a3b8' : '#fff',
              border: selectedView === 'Axial' ? '3px solid #fff' : 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isViewUsed('Axial') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedView === 'Axial' ? '0 0 10px rgba(34, 197, 94, 0.5)' : 'none',
              opacity: isViewUsed('Axial') ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!isViewUsed('Axial')) {
                e.currentTarget.style.backgroundColor = '#16a34a';
              }
            }}
            onMouseLeave={e => {
              if (!isViewUsed('Axial')) {
                e.currentTarget.style.backgroundColor = '#22c55e';
              }
            }}
          >
            a. Axial {isViewUsed('Axial') ? '✓' : ''}
          </button>

          <button
            onClick={() => handleViewButtonClick('Coronal')}
            disabled={isViewUsed('Coronal')}
            style={{
              padding: '12px 16px',
              backgroundColor: isViewUsed('Coronal') ? '#475569' : '#3b82f6',
              color: isViewUsed('Coronal') ? '#94a3b8' : '#fff',
              border: selectedView === 'Coronal' ? '3px solid #fff' : 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isViewUsed('Coronal') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedView === 'Coronal' ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none',
              opacity: isViewUsed('Coronal') ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!isViewUsed('Coronal')) {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }
            }}
            onMouseLeave={e => {
              if (!isViewUsed('Coronal')) {
                e.currentTarget.style.backgroundColor = '#3b82f6';
              }
            }}
          >
            b. Coronal {isViewUsed('Coronal') ? '✓' : ''}
          </button>

          <button
            onClick={() => handleViewButtonClick('Sagittal')}
            disabled={isViewUsed('Sagittal')}
            style={{
              padding: '12px 16px',
              backgroundColor: isViewUsed('Sagittal') ? '#475569' : '#f59e0b',
              color: isViewUsed('Sagittal') ? '#94a3b8' : '#fff',
              border: selectedView === 'Sagittal' ? '3px solid #fff' : 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isViewUsed('Sagittal') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedView === 'Sagittal' ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none',
              opacity: isViewUsed('Sagittal') ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!isViewUsed('Sagittal')) {
                e.currentTarget.style.backgroundColor = '#d97706';
              }
            }}
            onMouseLeave={e => {
              if (!isViewUsed('Sagittal')) {
                e.currentTarget.style.backgroundColor = '#f59e0b';
              }
            }}
          >
            c. Sagittal {isViewUsed('Sagittal') ? '✓' : ''}
          </button>

          <button
            onClick={() => handleViewButtonClick('3D')}
            disabled={isViewUsed('3D')}
            style={{
              padding: '12px 16px',
              backgroundColor: isViewUsed('3D') ? '#475569' : '#8b5cf6',
              color: isViewUsed('3D') ? '#94a3b8' : '#fff',
              border: selectedView === '3D' ? '3px solid #fff' : 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isViewUsed('3D') ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: selectedView === '3D' ? '0 0 10px rgba(139, 92, 246, 0.5)' : 'none',
              opacity: isViewUsed('3D') ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!isViewUsed('3D')) {
                e.currentTarget.style.backgroundColor = '#7c3aed';
              }
            }}
            onMouseLeave={e => {
              if (!isViewUsed('3D')) {
                e.currentTarget.style.backgroundColor = '#8b5cf6';
              }
            }}
          >
            d. 3D {isViewUsed('3D') ? '✓' : ''}
          </button>
        </div>

        {/* Viewport Position Storage Preference */}
        <div
          style={{
            marginTop: '20px',
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            border: '1px solid #475569',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '12px',
              color: '#e2e8f0',
            }}
          >
            Viewport Position Storage
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <button
              onClick={() => setStoragePersistence('session')}
              style={{
                padding: '12px 16px',
                backgroundColor: storagePersistence === 'session' ? '#22c55e' : '#334155',
                color: '#fff',
                border: storagePersistence === 'session' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={e => {
                if (storagePersistence !== 'session') {
                  e.currentTarget.style.backgroundColor = '#475569';
                }
              }}
              onMouseLeave={e => {
                if (storagePersistence !== 'session') {
                  e.currentTarget.style.backgroundColor = '#334155';
                }
              }}
            >
              <span>Session Storage</span>
              <span style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>
                Clears on browser close
              </span>
            </button>
            <button
              onClick={() => setStoragePersistence('local')}
              style={{
                padding: '12px 16px',
                backgroundColor: storagePersistence === 'local' ? '#3b82f6' : '#334155',
                color: '#fff',
                border: storagePersistence === 'local' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={e => {
                if (storagePersistence !== 'local') {
                  e.currentTarget.style.backgroundColor = '#475569';
                }
              }}
              onMouseLeave={e => {
                if (storagePersistence !== 'local') {
                  e.currentTarget.style.backgroundColor = '#334155';
                }
              }}
            >
              <span>Local Storage</span>
              <span style={{ fontSize: '11px', opacity: 0.8, fontWeight: 400 }}>
                Persists forever
              </span>
            </button>
          </div>
          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              color: '#94a3b8',
              fontStyle: 'italic',
            }}
          >
            {storagePersistence === 'session'
              ? 'Default: Viewport positions clear when browser closes (privacy-friendly)'
              : 'Doctor mode: Viewport positions persist across sessions'}
          </div>
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleClear}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#dc2626';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#ef4444';
            }}
          >
            Clear
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#475569',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#334155';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#475569';
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default LayoutConfigModal;
