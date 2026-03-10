export const API_CONFIG = {
  reportEndpoint: '/api/v1/dicom/sr',
  pdfEndpoint: '/api/v1/dicom/pdf',
};

export const BIRADS_CATEGORIES = [
  { value: '', label: '-' },
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4a' },
  { value: '5', label: '4b' },
  { value: '6', label: '4c' },
  { value: '7', label: '5' },
  { value: '8', label: '6' },
];

export const NATURES = [
  '',
  'Mass',
  'Cyst',
  'Complicated cyst',
  'Duct dilatation',
  'Calcification',
  'Foreign body',
  'Vessel',
  'Lymph node',
  'Abscess',
];

export const ECHO_PATTERNS = [
  '',
  'anechoic',
  'hypoechoic',
  'isoechoic',
  'hyperechoic',
  'complex echoic',
];

export const SHAPES = ['', 'round', 'oval', 'irregular'];

export const ORIENTATIONS = ['', 'parallel', 'non-parallel'];

export const MARGINS = [
  '',
  'circumscribed',
  'indistinct',
  'angulated',
  'spiculated',
  'microlobulated',
];

export interface Measurement {
  uid: string;
  frameRange: string;
  position: string;
  size: string;
  maxSurfVol: string;
  nature: string;
  biRads: string;
  maligPercent: string;
  echo: string;
  shape: string;
  orientation: string;
  margin: string;
  includeEcho: boolean;
  includeShape: boolean;
  includeOrientation: boolean;
  includeMargin: boolean;
}

export interface ReportData {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  patientID: string;
  patientName: string;
  patientSex?: string;
  patientBirthDate?: string;
  studyDate: string;
  accessionNumber?: string;
  radiologist?: string;
  breastComposition?: string;
  ductDilatation?: string;
  measurements: Measurement[];
}

export function createEmptyMeasurement(): Measurement {
  return {
    uid: 'manual_' + Date.now(),
    frameRange: '',
    position: '',
    size: '',
    maxSurfVol: '',
    nature: 'Mass',
    biRads: '',
    maligPercent: '',
    echo: '',
    shape: '',
    orientation: '',
    margin: '',
    includeEcho: true,
    includeShape: true,
    includeOrientation: true,
    includeMargin: true,
  };
}
