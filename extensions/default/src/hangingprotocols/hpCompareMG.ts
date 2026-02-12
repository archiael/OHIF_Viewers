/**
 * hpCompareMG.ts - Mammography Compare Mode Hanging Protocol (FR-3.3.7)
 *
 * 유방 촬영(Mammography) 비교 모드의 레이아웃 및 뷰포트 배치 정의
 * 현재 검사(Current Study)와 과거 검사(Prior Study)를 나란히 비교합니다.
 *
 * 레이아웃:
 * ┌──────────────────┬──────────────────┐
 * │  Current RCC     │  Prior RCC       │
 * │ (mammo-current   │ (mammo-prior-rcc)│
 * │  -rcc)           │                  │
 * ├──────────────────┼──────────────────┤
 * │  Current LCC     │  Prior LCC       │
 * │ (mammo-current   │ (mammo-prior-lcc)│
 * │  -lcc)           │                  │
 * ├──────────────────┼──────────────────┤
 * │  Current RMLO    │  Prior RMLO      │
 * │ (mammo-current   │ (mammo-prior     │
 * │  -rmlo)          │  -rmlo)          │
 * ├──────────────────┼──────────────────┤
 * │  Current LMLO    │  Prior LMLO      │
 * │ (mammo-current   │ (mammo-prior-lmlo│
 * │  -lmlo)          │ )                │
 * └──────────────────┴──────────────────┘
 *
 * Viewport ID 명칭 규칙:
 * - 현재 검사: 'mammo-current-{view}' (view: rcc, lcc, rmlo, lmlo)
 * - 과거 검사: 'mammo-prior-{view}' (view: rcc, lcc, rmlo, lmlo)
 *
 * data-viewport-type 속성:
 * - current: 현재 검사 뷰포트 (파란색 테두리)
 * - prior: 과거 검사 뷰포트 (주황색 테두리)
 *
 * 색상 스타일 (Mammography.css에서 정의):
 * - 현재 검사: #00aaff (파란색) - 활성 시 #00ccff + box-shadow
 * - 과거 검사: #ffa500 (주황색) - 활성 시 #ffb520 + box-shadow
 */

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

// Chest wall anchoring displayArea 설정
// 좌측 유방(LCC, LMLO): 흉벽을 왼쪽 가장자리에 고정
const rightDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],  // Show 100% of image
  imageCanvasPoint: {
    imagePoint: [0, 0.5],  // Left edge middle of image (chest wall)
    canvasPoint: [0.0, 0.5],  // Pin chest wall to left edge (midline)
  },
};

// 우측 유방(RCC, RMLO): 흉벽을 오른쪽 가장자리에 고정
const leftDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],  // Show 100% of image
  imageCanvasPoint: {
    imagePoint: [1, 0.5],  // Right edge middle of image (chest wall)
    canvasPoint: [1.0, 0.5],  // Pin chest wall to right edge (midline)
  },
};

const hpCompareMG = {
  id: '@ohif/hpCompareMG',
  hasUpdatedPriorsInformation: true,
  name: 'Mammography Compare - Current vs Prior',
  protocolMatchingRules: [
    {
      id: 'Mammography',
      weight: 200,
      attribute: 'ModalitiesInStudy',
      constraint: {
        contains: 'MG',
      },
      required: true,
    },
    {
      id: 'TwoStudies',
      weight: 150,
      attribute: 'StudyInstanceUID',
      from: 'prior',
      required: true,
      constraint: {
        notNull: true,
      },
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
      name: 'Compare - Current vs Prior (2x2)',
      stageActivation: {
        enabled: {
          minViewportsMatched: 4,
        },
      },
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 4,
          columns: 2,
        },
      },
      viewports: [
        // Row 1: RCC views
        {
          viewportOptions: {
            viewportId: 'mammo-current-rcc',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'RCC',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-prior-rcc',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'RCCPrior',
            },
          ],
        },

        // Row 2: LCC views
        {
          viewportOptions: {
            viewportId: 'mammo-current-lcc',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'LCC',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-prior-lcc',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'LCCPrior',
            },
          ],
        },

        // Row 3: RMLO views
        {
          viewportOptions: {
            viewportId: 'mammo-current-rmlo',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'RMLO',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-prior-rmlo',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'RMLOPrior',
            },
          ],
        },

        // Row 4: LMLO views
        {
          viewportOptions: {
            viewportId: 'mammo-current-lmlo',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'LMLO',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-prior-lmlo',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'LMLOPrior',
            },
          ],
        },
      ],
    },

    // Fallback stage: 2-column layout with fewer viewports
    // Note: When no prior study is found, prior viewports will be empty.
    // The viewport containers will still be rendered with the orange border,
    // indicating this is the prior position but no data is available.
    // TODO: Consider adding an empty state component (e.g., "No Prior Study Found" message)
    // in the empty viewport to improve UX.
    {
      name: 'Compare - Current vs Prior (Fallback)',
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 2,
        },
      },
      viewports: [
        // Current study (left column)
        {
          viewportOptions: {
            viewportId: 'mammo-current-primary',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'RCC',
            },
          ],
        },
        // Prior study (right column)
        {
          viewportOptions: {
            viewportId: 'mammo-prior-primary',
            toolGroupId: 'mammography',
            displayArea: leftDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'RCCPrior',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-current-secondary',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'current',
          },
          displaySets: [
            {
              id: 'LCC',
            },
          ],
        },
        {
          viewportOptions: {
            viewportId: 'mammo-prior-secondary',
            toolGroupId: 'mammography',
            displayArea: rightDisplayArea,
            allowUnmatchedView: true,
            'data-viewport-type': 'prior',
          },
          displaySets: [
            {
              id: 'LCCPrior',
            },
          ],
        },
      ],
    },
  ],

  numberOfPriorsReferenced: 1,
};

export default hpCompareMG;
