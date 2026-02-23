const priorStudyMatchingRules = [
  {
    // The priorInstance is a study counter that indicates what position this study is in
    // and the value comes from the options parameter.
    attribute: 'studyInstanceUIDsIndex',
    from: 'options',
    required: true,
    constraint: {
      equals: { value: 1 },
    },
  },
];

const currentStudyMatchingRules = [
  {
    // The priorInstance is a study counter that indicates what position this study is in
    // and the value comes from the options parameter.
    attribute: 'studyInstanceUIDsIndex',
    from: 'options',
    required: true,
    constraint: {
      equals: { value: 0 },
    },
  },
];

const LCCSeriesMatchingRules = [
  // Priority 1: DICOM ImageLaterality tag (0020,0062) — most reliable
  {
    weight: 30,
    attribute: 'ImageLaterality',
    constraint: {
      equals: 'L',
    },
  },
  // Priority 2: ViewCode (SCT:399162004 = Cranio-caudal)
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399162004',
    },
  },
  // Priority 3: SeriesDescription keyword match (fallback)
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'L CC',
    },
  },
  {
    weight: 15,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'LCC',
    },
  },
  // Legacy: PatientOrientation (less reliable, kept for broad compatibility)
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      contains: 'L',
    },
  },
];

const RCCSeriesMatchingRules = [
  // Priority 1: DICOM ImageLaterality tag (0020,0062) — most reliable
  {
    weight: 30,
    attribute: 'ImageLaterality',
    constraint: {
      equals: 'R',
    },
  },
  // Priority 2: ViewCode (SCT:399162004 = Cranio-caudal)
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399162004',
    },
  },
  // Priority 3: SeriesDescription keyword match (fallback)
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'R CC',
    },
  },
  {
    weight: 15,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'RCC',
    },
  },
  // Legacy: PatientOrientation
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['P', 'L'],
    },
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotEqual: ['A', 'R'],
    },
    required: true,
  },
  // Negative match: exclude "CC" without R prefix to avoid LCC → RCC misassignment
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'CC',
    },
  },
];

const LMLOSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399368009',
    },
  },
  {
    weight: 0,
    attribute: 'ViewCode',
    constraint: {
      doesNotEqual: 'SCT:399162004',
    },
    required: true,
  },
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['A', 'R'],
    },
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'L MLO',
    },
  },
];

const RMLOSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399368009',
    },
  },
  {
    attribute: 'ViewCode',
    constraint: {
      doesNotEqual: 'SCT:399162004',
    },
    required: true,
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotContain: ['P', 'FL'],
    },
    required: true,
  },
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['P', 'L'],
    },
  },
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['A', 'FR'],
    },
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'R MLO',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotContain: 'CC',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotEqual: 'L MLO',
    },
  },
];

const RCC = {
  seriesMatchingRules: RCCSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const RCCPrior = {
  seriesMatchingRules: RCCSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const LCC = {
  seriesMatchingRules: LCCSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const LCCPrior = {
  seriesMatchingRules: LCCSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const RMLO = {
  seriesMatchingRules: RMLOSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const RMLOPrior = {
  seriesMatchingRules: RMLOSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const LMLO = {
  seriesMatchingRules: LMLOSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const LMLOPrior = {
  seriesMatchingRules: LMLOSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

/**
 * Fallback selector - 모든 MG 이미지에 매칭 (규칙에 맞지 않는 이미지용)
 * RCC, LCC, RMLO, LMLO 규칙에 맞지 않는 이미지도 표시할 수 있도록 함
 */
const MGFallbackSeriesMatchingRules = [
  {
    weight: 1,  // 낮은 weight로 다른 selector보다 후순위
    attribute: 'Modality',
    constraint: {
      equals: 'MG',
    },
  },
];

const MGFallback = {
  seriesMatchingRules: MGFallbackSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const MGFallbackPrior = {
  seriesMatchingRules: MGFallbackSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

export { RCC, LCC, RMLO, LMLO, RCCPrior, LCCPrior, RMLOPrior, LMLOPrior, MGFallback, MGFallbackPrior };
