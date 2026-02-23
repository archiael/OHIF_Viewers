import { Types } from '@ohif/core';

// Helper function to get viewport configuration from storage
// Respects user's storage preference (session or local)
function getLayoutConfig() {
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'US 3D 1',
  };

  try {
    const preference = localStorage.getItem('usmpr-storage-preference');
    const storage = preference === 'local' ? localStorage : sessionStorage;

    const saved = storage.getItem('usmpr-layout-config');

    if (saved) {
      const parsed = JSON.parse(saved);

      const positions = parsed.positions || parsed;
      if (Array.isArray(positions) && positions.length === 4) {
        return {
          positions: positions,
          preset3D: parsed.preset3D || 'US 3D 1',
        };
      } else {
        console.warn('[HP] Invalid saved layout format, using defaults');
      }
    }
  } catch (e) {
    console.error('[HP] Failed to parse saved layout:', e);
    try {
      localStorage.removeItem('usmpr-layout-config');
      sessionStorage.removeItem('usmpr-layout-config');
    } catch (clearError) {
      console.error('[HP] Failed to clear corrupted layout:', clearError);
    }
  }

  return defaultConfig;
}

// Map UI preset names to actual Cornerstone preset names
// NOTE: We use CT-Bone as a placeholder, but custom US VTK presets will be applied immediately after
function mapPresetName(uiPresetName: string): string {
  // Always use CT-Bone as initial preset - custom US presets will override immediately
  return 'CT-Bone';
}

// Create viewport config based on view type and position
function createViewportConfig(
  viewType: string,
  positionIndex: number,
  preset3D: string = 'US 3D 1'
) {
  // Validate viewType - fallback to Axial if invalid
  const validViewTypes = ['Axial', 'Sagittal', 'Coronal', '3D'];
  if (!viewType || !validViewTypes.includes(viewType)) {
    console.warn(`[HP] Invalid viewType "${viewType}", using Axial instead`);
    viewType = 'Axial';
  }

  const viewportId = `mpr-${positionIndex}`;

  // Map UI preset name to actual Cornerstone preset name
  const actualPreset = mapPresetName(preset3D);

  const baseConfig = {
    viewportOptions: {
      viewportId,
      viewportType: viewType === '3D' ? 'volume3d' : 'volume',
      orientation: viewType === '3D' ? 'coronal' : viewType.toLowerCase(),
      toolGroupId: viewType === '3D' ? 'volume3d' : 'mpr',
      initialImageOptions: {
        preset: 'middle',
      },
    },
    displaySets: [
      {
        // Use generic display set selector that works for CT, MR, and US
        id: 'mprDisplaySet',
        ...(viewType === '3D'
          ? {
              options: {
                displayPreset: {
                  CT: actualPreset,
                  MR: actualPreset,
                  US: actualPreset,
                  default: actualPreset,
                },
              },
            }
          : {}),
      },
    ],
  };

  // Add syncGroups for 2D views
  if (viewType !== '3D') {
    baseConfig.viewportOptions['syncGroups'] = [
      {
        type: 'voi',
        id: 'mprAcquisitionUid',
        source: true,
        target: true,
      },
    ];
  }

  return baseConfig;
}

// Function to create viewports array based on current config
function createViewportsFromConfig() {
  try {
    const config = getLayoutConfig();

    if (!config.positions || !Array.isArray(config.positions)) {
      console.error('[HP] Invalid positions array, using defaults');
      const defaultViewports = ['Axial', 'Sagittal', 'Coronal', '3D'].map((viewType, index) =>
        createViewportConfig(viewType, index, 'US 3D 1')
      );
      // Add 5th STACK viewport
      defaultViewports.push({
        viewportOptions: {
          viewportId: 'mpr-stack-single',
          viewportType: 'stack',
          orientation: 'axial',
          toolGroupId: 'mpr',  // ✅ Use 'mpr' tool group
          initialImageOptions: { preset: 'middle' },
        },
        displaySets: [{ id: 'mprDisplaySet' }],
      });
      return defaultViewports;
    }

    const viewports = config.positions.map((viewType, index) => {
      try {
        return createViewportConfig(viewType, index, config.preset3D);
      } catch (e) {
        console.error(`[HP] Failed to create viewport ${index} with type ${viewType}:`, e);
        // Fallback to Axial view if viewport creation fails
        return createViewportConfig('Axial', index, config.preset3D);
      }
    });

    // Add 5th viewport for STACK single view (hidden by default, shown when toggling axial to single)
    viewports.push({
      viewportOptions: {
        viewportId: 'mpr-stack-single',
        viewportType: 'stack',  // STACK type, not VOLUME
        orientation: 'axial',
        toolGroupId: 'mpr',  // ✅ Use 'mpr' tool group to share measurements/annotations with MPR viewports
        initialImageOptions: {
          preset: 'middle',
        },
      },
      displaySets: [
        {
          id: 'mprDisplaySet',
        },
      ],
    });
    return viewports;
  } catch (e) {
    console.error('[HP] Critical error creating viewports:', e);
    // Ultimate fallback - default 2x2 grid
    const fallbackViewports = ['Axial', 'Sagittal', 'Coronal', '3D'].map((viewType, index) =>
      createViewportConfig(viewType, index, 'US 3D 1')
    );
    // Add 5th STACK viewport
    fallbackViewports.push({
      viewportOptions: {
        viewportId: 'mpr-stack-single',
        viewportType: 'stack',
        orientation: 'axial',
        toolGroupId: 'mpr',  // ✅ Use 'mpr' tool group
        initialImageOptions: { preset: 'middle' },
      },
      displaySets: [{ id: 'mprDisplaySet' }],
    });
    return fallbackViewports;
  }
}

const hpUSMPR: Types.HangingProtocol.Protocol = {
  id: '@ohif/hpUSMPR',
  name: 'USMPR - Multi-Modality MPR Viewer',
  description: 'Multi-Planar Reconstruction (CT/MR/US) with 2x2 viewport layout',
  locked: true,
  createdDate: '2024-01-01',
  modifiedDate: '2024-01-01',
  availableTo: {},
  editableBy: {},
  // Do NOT specify protocolMatchingRules - this keeps it as optional mode
  protocolMatchingRules: [],
  numberOfPriorsReferenced: 0,
  imageLoadStrategy: 'nth',
  toolGroupIds: ['mpr', 'volume3d'],
  displaySetSelectors: {
    mprDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: {
              value: 1,
            },
          },
          required: false,
        },
        // Exclude PDF DICOM from MPR viewports
        {
          weight: 1,
          attribute: 'SOPClassUID',
          constraint: {
            notEquals: {
              value: '1.2.840.10008.5.1.4.1.1.104.1', // Encapsulated PDF
            },
          },
          required: false,
        },
        // Removed isReconstructable check for USMPR mode
        // The isReconstructable validation is too strict and shows warnings even for
        // US images that DO have ImagePositionPatient and proper orientation metadata.
        // USMPR mode is specifically designed to handle multi-modality MPR including US.
      ],
    },
  },
  stages: [
    {
      name: 'MPR 2x2',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 2,
          layoutOptions: [
            {
              x: 0,
              y: 0,
              width: 0.5,
              height: 0.5,
            },
            {
              x: 0.5,
              y: 0,
              width: 0.5,
              height: 0.5,
            },
            {
              x: 0,
              y: 0.5,
              width: 0.5,
              height: 0.5,
            },
            {
              x: 0.5,
              y: 0.5,
              width: 0.5,
              height: 0.5,
            },
            // 5th viewport for STACK single view (fullscreen overlay)
            {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
          ],
        },
      },
      // Initial viewports from config
      viewports: createViewportsFromConfig(),
      createdDate: '2024-01-01',
    },
  ],
};

// Export function to refresh viewports from localStorage
// Call this before re-applying the protocol to update layout
// Pass the hangingProtocolService to update the stored protocol
export function refreshViewportsFromConfig(hangingProtocolService?) {
  hpUSMPR.stages[0].viewports = createViewportsFromConfig();

  if (hangingProtocolService) {
    try {
      hangingProtocolService.addProtocol(hpUSMPR.id, hpUSMPR);
    } catch (error) {
      console.warn('[HP] Failed to re-register protocol:', error);
    }
  }
}

export { hpUSMPR };
