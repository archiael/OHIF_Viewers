/**
 * Mammography Compare Hanging Protocol
 *
 * @description
 * 현재(Current) 유방촬영 스터디와 이전(Prior) 스터디를 2×2 그리드로 동시 표시합니다.
 * 각 행은 같은 view(RCC/LCC)끼리, 각 열은 같은 스터디끼리 묶입니다.
 *
 * LAYOUT (CC stage, 1×4):
 * ┌────────┬────────┬────────────────┬────────────────┐
 * │Current │Current │   Prior RCC    │   Prior LCC    │
 * │  RCC   │  LCC   │mammo-compare-rcc│mammo-compare-lcc│
 * │mammo-rcc│mammo-lcc│               │                │
 * └────────┴────────┴────────────────┴────────────────┘
 *
 * LAYOUT (MLO stage, 1×4):
 * ┌────────┬────────┬─────────────────┬─────────────────┐
 * │Current │Current │   Prior RMLO    │   Prior LMLO    │
 * │  RMLO  │  LMLO  │mammo-compare-rmlo│mammo-compare-lmlo│
 * │mammo-rmlo│mammo-lmlo│             │                 │
 * └────────┴────────┴─────────────────┴─────────────────┘
 *
 * @requirement FR-3.3.8: Prior Study Auto-Selection
 * - URL에 StudyInstanceUIDs=current,prior 형태로 두 스터디 전달
 * - studyInstanceUIDsIndex=0 → current study
 * - studyInstanceUIDsIndex=1 → prior study
 *
 * @see modes/mammography-compare/src/index.tsx - Compare 모드 진입점
 * @see hangingprotocols/utils/mammoDisplaySetSelector.ts - displaySet 선택 규칙
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

// LEFT breast: chest wall on LEFT edge → pin to left
const leftBreastDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
    canvasPoint: [0.0, 0.5],
  },
};

// RIGHT breast: chest wall on RIGHT edge → pin to right
const rightBreastDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [1, 0.5],
    canvasPoint: [1.0, 0.5],
  },
};

const hpMammoCompare = {
  id: '@ohif/extension-default.hangingProtocolModule.hpMammoCompare',
  hasUpdatedPriorsInformation: false,
  name: 'Mammography Compare',
  protocolMatchingRules: [
    {
      id: 'Mammography',
      weight: 200, // hpMammo(150)보다 높아야 compare 모드에서 우선 선택됨
      attribute: 'ModalitiesInStudy',
      constraint: {
        contains: 'MG',
      },
      required: true,
    },
  ],
  toolGroupIds: ['mammography'],

  // Prior study 1개 참조 (studyInstanceUIDsIndex=1 → prior study)
  numberOfPriorsReferenced: 1,

  displaySetSelectors: {
    // Current study (studyInstanceUIDsIndex=0)
    RCC,
    LCC,
    RMLO,
    LMLO,
    MGFallback,
    // Prior study (studyInstanceUIDsIndex=1)
    RCCPrior,
    LCCPrior,
    RMLOPrior,
    LMLOPrior,
    MGFallbackPrior,
  },

  stages: [
    /**
     * CC Compare Stage
     *
     * 1×4 그리드 (왼쪽 2개 = Current study, 오른쪽 2개 = Prior study):
     * Col 0: mammo-rcc    (Current RCC)
     * Col 1: mammo-lcc    (Current LCC)
     * Col 2: mammo-compare-rcc  (Prior RCC)
     * Col 3: mammo-compare-lcc  (Prior LCC)
     */
    {
      name: 'CC compare',
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 4,
        },
      },
      viewports: [
        // Col 0: Current RCC
        {
          viewportOptions: {
            viewportId: 'mammo-rcc',
            toolGroupId: 'mammography',
            displayArea: rightBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'RCC' },
          ],
        },
        // Col 1: Current LCC
        {
          viewportOptions: {
            viewportId: 'mammo-lcc',
            toolGroupId: 'mammography',
            displayArea: leftBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'LCC' },
          ],
        },
        // Col 2: Prior RCC
        {
          viewportOptions: {
            viewportId: 'mammo-compare-rcc',
            toolGroupId: 'mammography',
            displayArea: rightBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'RCCPrior' },
          ],
        },
        // Col 3: Prior LCC
        {
          viewportOptions: {
            viewportId: 'mammo-compare-lcc',
            toolGroupId: 'mammography',
            displayArea: leftBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'LCCPrior' },
          ],
        },
      ],
    },

    /**
     * MLO Compare Stage
     *
     * 1×4 그리드 (왼쪽 2개 = Current study, 오른쪽 2개 = Prior study):
     * Col 0: mammo-rmlo   (Current RMLO)
     * Col 1: mammo-lmlo   (Current LMLO)
     * Col 2: mammo-compare-rmlo (Prior RMLO)
     * Col 3: mammo-compare-lmlo (Prior LMLO)
     */
    {
      name: 'MLO compare',
      viewportStructure: {
        type: 'grid',
        layoutType: 'grid',
        properties: {
          rows: 1,
          columns: 4,
        },
      },
      viewports: [
        // Col 0: Current RMLO
        {
          viewportOptions: {
            viewportId: 'mammo-rmlo',
            toolGroupId: 'mammography',
            displayArea: rightBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'RMLO' },
          ],
        },
        // Col 1: Current LMLO
        {
          viewportOptions: {
            viewportId: 'mammo-lmlo',
            toolGroupId: 'mammography',
            displayArea: leftBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'LMLO' },
          ],
        },
        // Col 2: Prior RMLO
        {
          viewportOptions: {
            viewportId: 'mammo-compare-rmlo',
            toolGroupId: 'mammography',
            displayArea: rightBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'RMLOPrior' },
          ],
        },
        // Col 3: Prior LMLO
        {
          viewportOptions: {
            viewportId: 'mammo-compare-lmlo',
            toolGroupId: 'mammography',
            displayArea: leftBreastDisplayArea,
            allowUnmatchedView: true,
          },
          displaySets: [
            { id: 'LMLOPrior' },
          ],
        },
      ],
    },
  ],
};

export default hpMammoCompare;
