import React, { useState, useEffect } from 'react';
import { refreshViewportsFromConfig } from '../../../../extensions/default/src/hangingprotocols/hpUSMPR';

interface LayoutConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  servicesManager?: any;
  initialLayout?: ViewType[];
}

type ViewType = 'Axial' | 'Coronal' | 'Sagittal' | '3D' | null;
type PresetType = 'CT-Bone' | 'CT-Lung' | 'CT-Fat' | 'MR-Default';

const LayoutConfigModal: React.FC<LayoutConfigModalProps> = ({
  isOpen,
  onClose,
  servicesManager,
  initialLayout,
}) => {
  console.log('🖼️ LayoutConfigModal rendered with isOpen:', isOpen);

  const [positions, setPositions] = useState<ViewType[]>([
    'Axial',
    'Sagittal',
    'Coronal',
    '3D',
  ]);

  const [preset3D, setPreset3D] = useState<PresetType>('CT-Bone');
  const [storagePersistence, setStoragePersistence] = useState<'session' | 'local'>('session');

  // Load initial layout when provided or from localStorage
  useEffect(() => {
    if (isOpen) {
      if (initialLayout) {
        console.log('📥 Loading initial layout:', initialLayout);
        setPositions(initialLayout);
      } else {
        // Try to load from localStorage
        const saved = localStorage.getItem('usmpr-layout-config');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            console.log('📥 Loading layout from localStorage:', parsed);
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

      // Load storage preference
      const savedPreference = localStorage.getItem('usmpr-storage-preference');
      if (savedPreference === 'local' || savedPreference === 'session') {
        setStoragePersistence(savedPreference);
        console.log('📥 Loading storage preference:', savedPreference);
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
      console.log(`${viewType} is already used`);
      return;
    }
    setSelectedView(viewType);
    console.log('Selected view type:', viewType);
  };

  const handlePositionClick = (positionIndex: number) => {
    if (selectedView) {
      const newPositions = [...positions];
      newPositions[positionIndex] = selectedView;
      setPositions(newPositions);
      console.log(`Assigned ${selectedView} to position ${positionIndex + 1}`);
      setSelectedView(null); // Clear selection after assigning
    }
  };

  const handleClear = () => {
    setPositions([null, null, null, null]);
    setSelectedView(null);
  };

  const handleSave = () => {
    console.log('💾 Saving layout configuration:', { positions, preset3D, storagePersistence });

    // Validate positions - replace nulls with defaults
    const validPositions = positions.map((pos, idx) => {
      if (pos === null || pos === undefined) {
        const defaults = ['Axial', 'Sagittal', 'Coronal', '3D'];
        console.warn(`⚠️ Position ${idx} is null, using default: ${defaults[idx]}`);
        return defaults[idx];
      }
      return pos;
    });

    // Save to localStorage with preset info
    const config = {
      positions: validPositions,
      preset3D,
    };
    localStorage.setItem('usmpr-layout-config', JSON.stringify(config));
    console.log('✅ Saved to localStorage:', config);

    // Save storage preference
    localStorage.setItem('usmpr-storage-preference', storagePersistence);
    console.log('✅ Saved storage preference:', storagePersistence);

    onClose();

    // Re-apply hanging protocol to refresh viewports with new config
    // This uses images already in memory - no page reload needed!
    if (servicesManager) {
      const { hangingProtocolService } = servicesManager.services;
      if (hangingProtocolService) {
        console.log('🔄 Re-applying hanging protocol with new layout config...');

        // Small delay to ensure localStorage is written and modal is closed
        setTimeout(() => {
          try {
            // First, refresh the protocol's viewports array from localStorage
            refreshViewportsFromConfig();

            // Then re-run the protocol with updated viewports
            hangingProtocolService.setProtocol('@ohif/hpUSMPR', {
              stageIndex: 0
            });
            console.log('✅ Hanging protocol re-applied successfully');
          } catch (error) {
            console.error('❌ Failed to re-apply hanging protocol:', error);
            console.warn('⚠️ Please reload the page manually to apply changes');
          }
        }, 100);
      }
    }
  };

  if (!isOpen) {
    console.log('❌ isOpen is false, returning null');
    return null;
  }

  console.log('✅ isOpen is true, rendering modal UI');

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
          padding: '24px',
          minWidth: '500px',
          maxWidth: '600px',
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

        {/* 3D Preset Selection */}
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
            3D Rendering Preset
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
            }}
          >
            <button
              onClick={() => setPreset3D('CT-Bone')}
              style={{
                padding: '8px 12px',
                backgroundColor: preset3D === 'CT-Bone' ? '#8b5cf6' : '#334155',
                color: '#fff',
                border: preset3D === 'CT-Bone' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              CT-Bone
            </button>
            <button
              onClick={() => setPreset3D('CT-Lung')}
              style={{
                padding: '8px 12px',
                backgroundColor: preset3D === 'CT-Lung' ? '#8b5cf6' : '#334155',
                color: '#fff',
                border: preset3D === 'CT-Lung' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              CT-Lung
            </button>
            <button
              onClick={() => setPreset3D('CT-Fat')}
              style={{
                padding: '8px 12px',
                backgroundColor: preset3D === 'CT-Fat' ? '#8b5cf6' : '#334155',
                color: '#fff',
                border: preset3D === 'CT-Fat' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              CT-Fat
            </button>
            <button
              onClick={() => setPreset3D('MR-Default')}
              style={{
                padding: '8px 12px',
                backgroundColor: preset3D === 'MR-Default' ? '#8b5cf6' : '#334155',
                color: '#fff',
                border: preset3D === 'MR-Default' ? '2px solid #fff' : 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              MR-Default
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
            Selected: {preset3D}
          </div>
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
