import { Types } from '@ohif/core';

// Helper function to get viewport configuration from storage
// Respects user's storage preference (session or local)
function getLayoutConfig() {
  console.log('🔍 [HP] getLayoutConfig() called');

  // Default configuration - always safe fallback
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'CT-Bone',
  };

  try {
    // Check user's storage preference (always in localStorage)
    const preference = localStorage.getItem('usmpr-storage-preference');
    const storage = preference === 'local' ? localStorage : sessionStorage;
    console.log(`🔍 [HP] Storage preference: ${preference || 'session (default)'}`);

    const saved = storage.getItem('usmpr-layout-config');
    console.log(`💾 [HP] ${storage === localStorage ? 'localStorage' : 'sessionStorage'} data:`, saved);

    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('📥 [HP] Found saved layout configuration:', parsed);

      // Validate that positions array is valid
      const positions = parsed.positions || parsed;
      if (Array.isArray(positions) && positions.length === 4) {
        console.log('✅ [HP] Using saved layout configuration');
        const config = {
          positions: positions,
          preset3D: parsed.preset3D || 'CT-Bone',
        };
        console.log('🔄 [HP] Returning config:', config);
        return config;
      } else {
        console.warn('⚠️ [HP] Invalid saved layout format, using defaults');
      }
    }
  } catch (e) {
    console.error('❌ [HP] Failed to parse saved layout:', e);
    // Clear corrupted data from both storages
    try {
      localStorage.removeItem('usmpr-layout-config');
      sessionStorage.removeItem('usmpr-layout-config');
    } catch (clearError) {
      console.error('Failed to clear corrupted layout:', clearError);
    }
  }

  // Default configuration
  console.log('📌 [HP] Using default layout configuration');
  console.log('🔄 [HP] Returning default config:', defaultConfig);
  return defaultConfig;
}

// Create viewport config based on view type and position
function createViewportConfig(
  viewType: string,
  positionIndex: number,
  preset3D: string = 'CT-Bone'
) {
  console.log(`🏗️ [HP] createViewportConfig called: viewType="${viewType}", position=${positionIndex}, preset3D="${preset3D}"`);

  // Validate viewType - fallback to Axial if invalid
  const validViewTypes = ['Axial', 'Sagittal', 'Coronal', '3D'];
  if (!viewType || !validViewTypes.includes(viewType)) {
    console.warn(`⚠️ [HP] Invalid viewType "${viewType}", using Axial instead`);
    viewType = 'Axial';
  }

  // Use position-based viewport ID (mpr-0, mpr-1, mpr-2, mpr-3)
  const viewportId = `mpr-${positionIndex}`;
  console.log(`📍 [HP] Creating viewport: id="${viewportId}", type="${viewType}"`);


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
                  CT: preset3D,
                  MR: preset3D,
                  US: preset3D,
                  default: preset3D,
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
  console.log('🎬 [HP] createViewportsFromConfig() called');
  try {
    const config = getLayoutConfig();
    console.log('🔄 [HP] Creating viewports with config:', config);

    // Ensure we have valid positions
    if (!config.positions || !Array.isArray(config.positions)) {
      console.error('❌ [HP] Invalid positions array, using defaults');
      const defaultViewports = ['Axial', 'Sagittal', 'Coronal', '3D'].map((viewType, index) =>
        createViewportConfig(viewType, index, 'CT-Bone')
      );
      // Add 5th STACK viewport
      defaultViewports.push({
        viewportOptions: {
          viewportId: 'mpr-stack-single',
          viewportType: 'stack',
          orientation: 'axial',
          toolGroupId: 'default',
          initialImageOptions: { preset: 'middle' },
        },
        displaySets: [{ id: 'mprDisplaySet' }],
      });
      console.log('✅ [HP] Created default viewports:', defaultViewports.length);
      return defaultViewports;
    }

    console.log(`🔨 [HP] Creating ${config.positions.length} viewports from saved config...`);
    const viewports = config.positions.map((viewType, index) => {
      try {
        const viewport = createViewportConfig(viewType, index, config.preset3D);
        console.log(`✅ [HP] Viewport ${index} created successfully`);
        return viewport;
      } catch (e) {
        console.error(`❌ [HP] Failed to create viewport ${index} with type ${viewType}:`, e);
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
        toolGroupId: 'default',
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
    console.log(`✅ [HP] Added 5th STACK viewport (mpr-stack-single)`);
    console.log(`✅ [HP] All ${viewports.length} viewports created successfully`);
    return viewports;
  } catch (e) {
    console.error('❌ [HP] Critical error creating viewports:', e);
    console.error('❌ [HP] Stack trace:', e.stack);
    // Ultimate fallback - default 2x2 grid
    const fallbackViewports = ['Axial', 'Sagittal', 'Coronal', '3D'].map((viewType, index) =>
      createViewportConfig(viewType, index, 'CT-Bone')
    );
    // Add 5th STACK viewport
    fallbackViewports.push({
      viewportOptions: {
        viewportId: 'mpr-stack-single',
        viewportType: 'stack',
        orientation: 'axial',
        toolGroupId: 'default',
        initialImageOptions: { preset: 'middle' },
      },
      displaySets: [{ id: 'mprDisplaySet' }],
    });
    console.log('✅ [HP] Created fallback viewports:', fallbackViewports.length);
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
  console.log('🔄 [HP] refreshViewportsFromConfig() called');
  hpUSMPR.stages[0].viewports = createViewportsFromConfig();
  console.log('✅ [HP] Viewports refreshed in local object');

  // Also update the protocol in the service's storage
  if (hangingProtocolService) {
    try {
      // Re-add the protocol to update the service's stored copy
      hangingProtocolService.addProtocol(hpUSMPR.id, hpUSMPR);
      console.log('✅ [HP] Protocol re-registered in HangingProtocolService');
    } catch (error) {
      console.warn('⚠️ [HP] Failed to re-register protocol:', error);
    }
  }
}

export { hpUSMPR };
