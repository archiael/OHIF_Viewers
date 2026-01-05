import {
  RCC,
  RMLO,
  LCC,
  LMLO,
  RCCPrior,
  LCCPrior,
  RMLOPrior,
  LMLOPrior,
  MGFallback,
  MGFallbackPrior,
} from './utils/mammoDisplaySetSelector';

// Left breast images (LCC, LMLO) - chest wall on LEFT edge, aligned to midline
const rightDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],  // Show 100% of image
  imageCanvasPoint: {
    imagePoint: [0, 0.5],  // Left edge middle of image (chest wall)
    canvasPoint: [0.0, 0.5],  // Pin chest wall to left edge (midline)
  },
};

// Right breast images (RCC, RMLO) - chest wall on RIGHT edge, aligned to midline
const leftDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],  // Show 100% of image
  imageCanvasPoint: {
    imagePoint: [1, 0.5],  // Right edge middle of image (chest wall)
    canvasPoint: [1.0, 0.5],  // Pin chest wall to right edge (midline)
  },
};

const hpMammography = {
  id: '@ohif/hpMammo',
  hasUpdatedPriorsInformation: false,
  name: 'Mammography Breast Screening',
  protocolMatchingRules: [
    {
      id: 'Mammography',
      weight: 150,
      attribute: 'ModalitiesInStudy',
      constraint: {
        contains: 'MG',
      },
      required: true,
    },
    {
      id: 'numberOfImages',
      attribute: 'numberOfDisplaySetsWithImages',
      constraint: {
        greaterThan: 0,
      },
      required: false,
    },
  ],
  toolGroupIds: ['mammography'],
  displaySetSelectors: {
    RCC,
    LCC,
    RMLO,
    LMLO,
    RCCPrior,
    LCCPrior,
    RMLOPrior,
    LMLOPrior,
    MGFallback,
    MGFallbackPrior,
  },

  stages: [
    {
      name: 'CC Views',
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'mammo-rcc',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            {
              id: 'RCC',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-lcc',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            {
              id: 'LCC',
            },
          ],
        },
      ],
    },

    // Compare CC current/prior side by side
    {
      name: 'CC compare',
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: {
            viewportId: 'mammo-compare-rcc',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            flipHorizontal: true,
            rotation: 180,
            allowUnmatchedView: true,
          },
          displaySets: [
            {
              id: 'RCC',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-compare-lcc',
            toolGroupId: 'mammography',
            flipHorizontal: true,
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            {
              id: 'LCC',
            },
          ],
        },
      ],
    },
  ],
  // Indicates it is prior aware, but will work with no priors
  numberOfPriorsReferenced: 0,
};

export default hpMammography;
