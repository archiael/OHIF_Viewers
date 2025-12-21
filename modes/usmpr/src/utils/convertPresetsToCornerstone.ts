import {
  createUsSkinPresetA,
  createUsSkinPresetB,
  createUsSkinPresetC,
  createUsSkinPresetD,
} from './usVolumePresets';

/**
 * Convert vtkColorTransferFunction to Cornerstone preset string format
 * Format: "numPoints x1 r1 g1 b1 x2 r2 g2 b2 ..."
 */
function colorTransferToString(colorTransfer) {
  const range = colorTransfer.getRange();
  const numPoints = 50; // Sample at regular intervals
  const points: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const value = range[0] + (i / (numPoints - 1)) * (range[1] - range[0]);
    const rgb = colorTransfer.getColor(value);
    points.push(value, rgb[0], rgb[1], rgb[2]);
  }

  return `${numPoints} ${points.join(' ')}`;
}

/**
 * Convert vtkPiecewiseFunction to Cornerstone preset string format
 * Format: "numPoints x1 opacity1 x2 opacity2 ..."
 */
function piecewiseToString(piecewise) {
  const range = piecewise.getRange();
  const numPoints = 50; // Sample at regular intervals
  const points: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const value = range[0] + (i / (numPoints - 1)) * (range[1] - range[0]);
    const opacity = piecewise.getValue(value);
    points.push(value, opacity);
  }

  return `${numPoints} ${points.join(' ')}`;
}

/**
 * Convert VTK preset to Cornerstone preset object format
 */
function convertPresetToCornerstoneFormat(vtkPreset) {
  const { color, scalarOpacity, gradientOpacity, shading } = vtkPreset;

  // For gradient opacity, Cornerstone uses a simpler 4-point format
  // We'll use the gradient range to create a simple ramp
  const gradRange = gradientOpacity.getRange();

  return {
    name: vtkPreset.name,
    colorTransfer: colorTransferToString(color),
    scalarOpacity: piecewiseToString(scalarOpacity),
    gradientOpacity: `4 ${gradRange[0]} 0.0 ${gradRange[1]} 1.0`,
    shade: shading.shade ? '1' : '0',
    ambient: shading.ambient.toString(),
    diffuse: shading.diffuse.toString(),
    specular: shading.specular.toString(),
    specularPower: shading.specularPower.toString(),
    interpolation: '1',
  };
}

/**
 * Create all US presets in Cornerstone format
 */
export function createCornerstoneUSPresets() {
  const presetA = createUsSkinPresetA();
  const presetB = createUsSkinPresetB();
  const presetC = createUsSkinPresetC();
  const presetD = createUsSkinPresetD();

  return [
    convertPresetToCornerstoneFormat(presetA),
    convertPresetToCornerstoneFormat(presetB),
    convertPresetToCornerstoneFormat(presetC),
    convertPresetToCornerstoneFormat(presetD),
  ];
}
