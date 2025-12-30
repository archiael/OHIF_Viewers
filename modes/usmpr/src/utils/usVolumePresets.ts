import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

/**
 * Helper to build vtkColorTransferFunction from array of [value, r, g, b]
 */
function buildColor(points: Array<[number, number, number, number]>) {
  const color = vtkColorTransferFunction.newInstance();
  points.forEach(([value, r, g, b]) => {
    color.addRGBPoint(value, r, g, b);
  });
  return color;
}

/**
 * Helper to build vtkPiecewiseFunction from array of [value, opacity]
 */
function buildPiecewise(points: Array<[number, number]>) {
  const piecewise = vtkPiecewiseFunction.newInstance();
  points.forEach(([value, opacity]) => {
    piecewise.addPoint(value, opacity);
  });
  return piecewise;
}

/**
 * US Skin Surface Preset A
 * - Baseline surface rendering for US (0-255 range)
 * - Moderate opacity, good for general surface visualization
 * - Beige-to-white color gradient
 */
export function createUsSkinPresetA() {
  const color = buildColor([
    [0, 0.0, 0.0, 0.0], // Black background
    [30, 0.85, 0.72, 0.65], // Beige skin tone
    [80, 1.0, 0.9, 0.85], // Light skin
    [255, 1.0, 1.0, 1.0], // White highlights
  ]);

  const scalarOpacity = buildPiecewise([
    [0, 0.0], // Fully transparent at 0
    [10, 0.0], // Start showing at 10
    [18, 0.02], // Very subtle
    [28, 0.1], // Gradual increase
    [45, 0.35], // Moderate opacity
    [80, 0.55], // Higher opacity for surface
    [255, 0.6], // Maximum opacity
  ]);

  const gradientOpacity = buildPiecewise([
    [0, 0.0], // No gradient = no opacity
    [5, 0.0], // Start showing edges at 5
    [10, 0.12], // Subtle edges
    [20, 0.45], // Moderate edges
    [40, 0.85], // Strong edges
    [80, 1.0], // Maximum edge detection
  ]);

  return {
    id: 'US_SKIN_A',
    name: 'US Skin Surface A',
    color,
    scalarOpacity,
    gradientOpacity,
    shading: {
      shade: true,
      ambient: 0.2,
      diffuse: 0.7,
      specular: 0.3,
      specularPower: 20,
    },
    scalarOpacityUnitDistance: 1.0,
  };
}

/**
 * US Skin Surface Preset B
 * - Alternative surface rendering with less speckle
 * - Lower maximum opacity for smoother appearance
 * - More aggressive low-value cutoff
 */
export function createUsSkinPresetB() {
  const color = buildColor([
    [0, 0.0, 0.0, 0.0],
    [35, 0.88, 0.75, 0.68],
    [85, 1.0, 0.92, 0.87],
    [255, 1.0, 1.0, 1.0],
  ]);

  const scalarOpacity = buildPiecewise([
    [0, 0.0],
    [15, 0.0], // Higher cutoff to reduce noise
    [25, 0.03],
    [35, 0.12],
    [50, 0.28],
    [90, 0.42],
    [255, 0.45], // Lower max opacity for less speckle
  ]);

  const gradientOpacity = buildPiecewise([
    [0, 0.0],
    [8, 0.0],
    [15, 0.15],
    [25, 0.5],
    [45, 0.88],
    [90, 1.0],
  ]);

  return {
    id: 'US_SKIN_B',
    name: 'US Skin Surface B',
    color,
    scalarOpacity,
    gradientOpacity,
    shading: {
      shade: true,
      ambient: 0.22,
      diffuse: 0.68,
      specular: 0.28,
      specularPower: 18,
    },
    scalarOpacityUnitDistance: 1.0,
  };
}

/**
 * US Skin Surface Preset C
 * - Brighter, more yellow-toned rendering
 * - Increased opacity for more solid appearance
 */
export function createUsSkinPresetC() {
  const color = buildColor([
    [0, 0.0, 0.0, 0.0],
    [30, 0.9, 0.8, 0.65], // More yellow tone
    [80, 1.0, 0.95, 0.8], // Bright yellow-white
    [255, 1.0, 1.0, 0.95], // Slight yellow tint on highlights
  ]);

  const scalarOpacity = buildPiecewise([
    [0, 0.0],
    [10, 0.0],
    [18, 0.03],
    [28, 0.15],
    [45, 0.42],
    [80, 0.62],
    [255, 0.65], // Higher max opacity
  ]);

  const gradientOpacity = buildPiecewise([
    [0, 0.0],
    [5, 0.0],
    [10, 0.15],
    [20, 0.5],
    [40, 0.9],
    [80, 1.0],
  ]);

  return {
    id: 'US_SKIN_C',
    name: 'US Skin Surface C',
    color,
    scalarOpacity,
    gradientOpacity,
    shading: {
      shade: true,
      ambient: 0.25,
      diffuse: 0.65,
      specular: 0.35,
      specularPower: 22,
    },
    scalarOpacityUnitDistance: 1.0,
  };
}

/**
 * US Skin Surface Preset D
 * - Maximum brightness and opacity
 * - Most opaque for solid surface appearance
 * - Strong yellow-white tones
 */
export function createUsSkinPresetD() {
  const color = buildColor([
    [0, 0.0, 0.0, 0.0],
    [30, 0.95, 0.85, 0.7], // Strong yellow
    [80, 1.0, 0.98, 0.85], // Very bright yellow-white
    [255, 1.0, 1.0, 0.98], // Almost pure white
  ]);

  const scalarOpacity = buildPiecewise([
    [0, 0.0],
    [10, 0.0],
    [18, 0.05],
    [28, 0.2],
    [45, 0.5],
    [80, 0.7],
    [255, 0.75], // Maximum opacity
  ]);

  const gradientOpacity = buildPiecewise([
    [0, 0.0],
    [5, 0.0],
    [10, 0.18],
    [20, 0.55],
    [40, 0.95],
    [80, 1.0],
  ]);

  return {
    id: 'US_SKIN_D',
    name: 'US Skin Surface D',
    color,
    scalarOpacity,
    gradientOpacity,
    shading: {
      shade: true,
      ambient: 0.3,
      diffuse: 0.6,
      specular: 0.4,
      specularPower: 25,
    },
    scalarOpacityUnitDistance: 1.0,
  };
}

/**
 * Apply a volume rendering preset to a volume actor
 * @param volumeActor - The vtkVolume actor
 * @param preset - Preset object with color, scalarOpacity, gradientOpacity, shading
 */
export function applyVolumeRenderingPreset({ volumeActor, preset }) {
  const prop = volumeActor.getProperty();

  // Apply transfer functions
  prop.setRGBTransferFunction(0, preset.color);
  prop.setScalarOpacity(0, preset.scalarOpacity);
  if (typeof prop.setGradientOpacity === 'function' && preset.gradientOpacity) {
    prop.setGradientOpacity(0, preset.gradientOpacity);
  }

  // Apply shading parameters (with safety checks for API compatibility)
  if (typeof prop.setShade === 'function') {
    prop.setShade(!!preset.shading?.shade);
  }
  if (typeof prop.setAmbient === 'function') {
    prop.setAmbient(preset.shading?.ambient ?? 0.2);
  }
  if (typeof prop.setDiffuse === 'function') {
    prop.setDiffuse(preset.shading?.diffuse ?? 0.7);
  }
  if (typeof prop.setSpecular === 'function') {
    prop.setSpecular(preset.shading?.specular ?? 0.3);
  }
  if (typeof prop.setSpecularPower === 'function') {
    prop.setSpecularPower(preset.shading?.specularPower ?? 20);
  }

  // Apply scalar opacity unit distance if provided
  if (typeof preset.scalarOpacityUnitDistance === 'number') {
    prop.setScalarOpacityUnitDistance(preset.scalarOpacityUnitDistance);
  }

  // Mark as modified to trigger re-render
  prop.modified();
}
