import { Types } from '@ohif/core';

// Helper function to get viewport configuration from localStorage
function getLayoutConfig() {
  try {
    const saved = localStorage.getItem('usmpr-layout-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('📥 Using saved layout configuration:', parsed);

      // Handle new format with positions and preset3D
      if (parsed.positions) {
        return {
          positions: parsed.positions,
          preset3D: parsed.preset3D || 'CT-Bone',
        };
      }

      // Handle old format (just array of positions)
      return {
        positions: parsed,
        preset3D: 'CT-Bone',
      };
    }
  } catch (e) {
    console.error('Failed to parse saved layout:', e);
  }

  // Default configuration
  return {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'CT-Bone',
  };
}

// Create viewport config based on view type and position
function createViewportConfig(
  viewType: string,
  positionIndex: number,
  preset3D: string = 'CT-Bone'
) {
  // Use position-based viewport ID (mpr-0, mpr-1, mpr-2, mpr-3)
  const viewportId = `mpr-${positionIndex}`;

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
        // Use matchingScores to automatically select best display set
        // This will match ctMPRDisplaySet, mrMPRDisplaySet, or usMPRDisplaySet
        // based on the actual modality of the loaded study
        matchingScores: [
          {
            id: 'ctMPRDisplaySet',
          },
          {
            id: 'mrMPRDisplaySet',
          },
          {
            id: 'usMPRDisplaySet',
          },
        ],
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
    ctMPRDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'Modality',
          constraint: {
            equals: {
              value: 'CT',
            },
          },
          required: false,
        },
        {
          weight: 2,
          attribute: 'isReconstructable',
          constraint: {
            equals: {
              value: true,
            },
          },
          required: false,
        },
        {
          weight: 3,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: {
              value: 10,
            },
          },
          required: false,
        },
      ],
    },
    mrMPRDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'Modality',
          constraint: {
            equals: {
              value: 'MR',
            },
          },
          required: false,
        },
        {
          weight: 2,
          attribute: 'isReconstructable',
          constraint: {
            equals: {
              value: true,
            },
          },
          required: false,
        },
        {
          weight: 3,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: {
              value: 10,
            },
          },
          required: false,
        },
      ],
    },
    usMPRDisplaySet: {
      seriesMatchingRules: [
        {
          weight: 1,
          attribute: 'Modality',
          constraint: {
            equals: {
              value: 'US',
            },
          },
          required: false,
        },
        {
          weight: 2,
          attribute: 'isReconstructable',
          constraint: {
            equals: {
              value: true,
            },
          },
          required: false,
        },
        {
          weight: 3,
          attribute: 'numImageFrames',
          constraint: {
            greaterThan: {
              value: 10,
            },
          },
          required: false,
        },
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
          ],
        },
      },
      viewports: (() => {
        const config = getLayoutConfig();
        console.log('🔄 Creating viewports with config:', config);
        return config.positions.map((viewType, index) =>
          createViewportConfig(viewType, index, config.preset3D)
        );
      })(),
      createdDate: '2024-01-01',
    },
  ],
};

export { hpUSMPR };
