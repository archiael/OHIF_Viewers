/**
 * Slice Plane Manager
 *
 * Manages VTK.js plane actors that visualize MPR slice positions in 3D volume viewports.
 * Creates colored transparent THICK planes (red=axial, yellow=sagittal, sky blue=coronal) that match
 * the crosshair colors and show where the current MPR slices intersect the volume.
 * Uses thin boxes instead of flat planes so they're visible from all angles (even edge-on).
 */

import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';

export type SliceOrientation = 'axial' | 'sagittal' | 'coronal';

export interface SlicePlaneConfig {
  color: [number, number, number]; // RGB 0-1
  opacity: number; // 0-1
  size: number; // Plane size in mm
  thickness: number; // Plane thickness in mm (for visibility when viewed edge-on)
}

export interface SlicePlaneInfo {
  orientation: SliceOrientation;
  actor: any; // vtkActor
  cubeSource: any; // vtkCubeSource (thin box for thickness)
  mapper: any; // vtkMapper
  config: SlicePlaneConfig;
}

// EXACT colors from initToolGroups.ts colorsByOrientation:
// axial: rgb(200, 0, 0), sagittal: rgb(200, 200, 0), coronal: rgb(135, 206, 235)
const DEFAULT_CONFIGS: Record<SliceOrientation, SlicePlaneConfig> = {
  axial: {
    color: [1.0, 0.0, 0.0], // rgb(255, 0, 0) = bright red
    opacity: 0.35, // More visible, less transparent
    size: 500, // mm (width and height)
    thickness: 0.5, // mm (very thin, just visible when viewed edge-on)
  },
  sagittal: {
    color: [1.0, 1.0, 0.0], // rgb(255, 255, 0) = bright yellow
    opacity: 0.35, // More visible, less transparent
    size: 500,
    thickness: 0.5,
  },
  coronal: {
    color: [0.4, 0.8, 1.0], // rgb(102, 204, 255) = bright sky blue
    opacity: 0.35, // More visible, less transparent
    size: 500,
    thickness: 0.5,
  },
};

export class SlicePlaneManager {
  private planes: Map<SliceOrientation, SlicePlaneInfo>;
  private viewport3D: any = null;
  private visible: boolean = true;
  private initialized: boolean = false;
  private _updateCount: Record<SliceOrientation, number> = {} as any;

  constructor() {
    this.planes = new Map();
  }

  /**
   * Initialize slice planes for a 3D viewport
   */
  public initialize(viewport3D: any, config?: Partial<Record<SliceOrientation, SlicePlaneConfig>>) {
    console.log('✈️ Initializing SlicePlaneManager...');

    if (!viewport3D) {
      console.error('❌ Cannot initialize SlicePlaneManager: no 3D viewport provided');
      return;
    }

    this.viewport3D = viewport3D;

    // Create planes for each orientation
    const orientations: SliceOrientation[] = ['axial', 'sagittal', 'coronal'];

    orientations.forEach(orientation => {
      const planeConfig = config?.[orientation] || DEFAULT_CONFIGS[orientation];
      const planeInfo = this.createPlane(orientation, planeConfig);
      this.planes.set(orientation, planeInfo);

      // Add actor to 3D viewport
      try {
        viewport3D.addActor({ uid: `slicePlane-${orientation}`, actor: planeInfo.actor });
        console.log(`✅ Added ${orientation} slice plane to 3D viewport`);
      } catch (error) {
        console.error(`❌ Failed to add ${orientation} slice plane:`, error);
      }
    });

    this.initialized = true;
    console.log('✅ SlicePlaneManager initialized with 3 planes');

    // Trigger initial render
    this.render();
  }

  /**
   * Create a VTK thick plane actor for a specific orientation
   * Uses a thin box (cube) instead of flat plane for visibility when viewed edge-on
   */
  private createPlane(orientation: SliceOrientation, config: SlicePlaneConfig): SlicePlaneInfo {
    // Create thick plane geometry using a thin box
    const cubeSource = vtkCubeSource.newInstance();

    // Set box dimensions: large in 2 dimensions (plane), thin in 1 dimension (thickness)
    // Initially set as X-Y plane with Z thickness (will be rotated for orientation)
    cubeSource.setXLength(config.size);
    cubeSource.setYLength(config.size);
    cubeSource.setZLength(config.thickness); // Thickness for edge-on visibility

    // Center the box at origin
    cubeSource.setCenter(0, 0, 0);

    // Create mapper
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(cubeSource.getOutputPort());

    // Create actor
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    // Set actor properties (color, opacity)
    const property = actor.getProperty();
    property.setColor(...config.color);
    property.setOpacity(config.opacity);

    // SURFACE MODE: Show transparent colored planes with prominent edges
    property.setRepresentation(2); // 0=Points, 1=Wireframe, 2=Surface

    // Make ALL edges visible and prominent
    property.setEdgeVisibility(true);
    property.setEdgeColor(...config.color); // Bright color for edges
    property.setLineWidth(4); // Thick edges

    // Enable lighting with high ambient to show true colors
    property.setLighting(true);

    // High ambient ensures colors are visible from all angles
    // Low diffuse prevents lighting from changing the color
    property.setAmbient(0.9);
    property.setDiffuse(0.1);
    property.setSpecular(0.0); // No specular highlights

    // Make the actor render on top by setting it as translucent with higher priority
    // This ensures all edges are visible even when behind the volume
    actor.getProperty().setOpacity(config.opacity);

    // Force the mapper to use translucent rendering which renders after opaque objects
    mapper.setStatic(false);
    mapper.setResolveCoincidentTopology(true);
    mapper.setResolveCoincidentTopologyToPolygonOffset();
    mapper.setResolveCoincidentTopologyPolygonOffsetParameters(-1, -1);

    console.log(`🎨 Created ${orientation} thick plane: color=${config.color}, opacity=${config.opacity}, thickness=${config.thickness}mm`);

    return {
      orientation,
      actor,
      cubeSource,
      mapper,
      config,
    };
  }

  /**
   * Update the position and orientation of a thick slice plane (cube)
   */
  public updatePlanePosition(
    orientation: SliceOrientation,
    position: [number, number, number],
    normal: [number, number, number]
  ) {
    const planeInfo = this.planes.get(orientation);

    if (!planeInfo) {
      console.warn(`⚠️ Cannot update ${orientation} plane: not found`);
      return;
    }

    const { actor, cubeSource } = planeInfo;

    // Keep cube centered at origin (will be positioned via actor transformation)
    cubeSource.setCenter(0, 0, 0);

    // Calculate rotation to align cube's Z-axis with the normal vector
    // The cube is initially aligned with Z-axis, so we need to rotate it to match the normal
    const [nx, ny, nz] = normal;

    // Normalize the normal vector
    const normalMag = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const normalizedNormal: [number, number, number] = [
      nx / normalMag,
      ny / normalMag,
      nz / normalMag,
    ];

    // Calculate rotation from Z-axis [0, 0, 1] to normal vector
    // Using axis-angle rotation
    const zAxis: [number, number, number] = [0, 0, 1];

    // Cross product: rotationAxis = zAxis × normal
    const rotationAxis: [number, number, number] = [
      zAxis[1] * normalizedNormal[2] - zAxis[2] * normalizedNormal[1],
      zAxis[2] * normalizedNormal[0] - zAxis[0] * normalizedNormal[2],
      zAxis[0] * normalizedNormal[1] - zAxis[1] * normalizedNormal[0],
    ];

    // Rotation angle: angle = acos(zAxis · normal)
    const dotProduct = zAxis[0] * normalizedNormal[0] + zAxis[1] * normalizedNormal[1] + zAxis[2] * normalizedNormal[2];
    const rotationAngle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI); // Convert to degrees

    // Build transformation matrix: first rotate, then translate to position
    let matrix;

    // Check if rotation is needed (avoid rotating if already aligned)
    if (rotationAngle > 0.1 && rotationAngle < 179.9) {
      // Normalize rotation axis
      const axisMag = Math.sqrt(rotationAxis[0] * rotationAxis[0] + rotationAxis[1] * rotationAxis[1] + rotationAxis[2] * rotationAxis[2]);

      if (axisMag > 0.0001) {
        const normalizedAxis: [number, number, number] = [
          rotationAxis[0] / axisMag,
          rotationAxis[1] / axisMag,
          rotationAxis[2] / axisMag,
        ];

        // Create transformation: rotate then translate
        matrix = vtkMatrixBuilder
          .buildFromDegree()
          .translate(...position)
          .rotate(rotationAngle, normalizedAxis)
          .getMatrix();
      } else {
        // No rotation needed, just translate
        matrix = vtkMatrixBuilder
          .buildFromDegree()
          .translate(...position)
          .getMatrix();
      }
    } else if (rotationAngle >= 179.9) {
      // Special case: 180-degree rotation (normal is opposite to Z-axis)
      // Rotate 180 degrees around X-axis, then translate
      matrix = vtkMatrixBuilder
        .buildFromDegree()
        .translate(...position)
        .rotate(180, [1, 0, 0])
        .getMatrix();
    } else {
      // No rotation needed (already aligned), just translate
      matrix = vtkMatrixBuilder
        .buildFromDegree()
        .translate(...position)
        .getMatrix();
    }

    actor.setUserMatrix(matrix);

    // Only log every 10th update to reduce noise
    if (!this._updateCount[orientation]) this._updateCount[orientation] = 0;
    this._updateCount[orientation]++;

    if (this._updateCount[orientation] % 10 === 1) {
      console.log(
        `📐 [SlicePlaneManager] Updated ${orientation} thick plane: pos=[${position.map(v => v.toFixed(1)).join(',')}], normal=[${normal.map(v => v.toFixed(2)).join(',')}]`
      );
    }
  }

  /**
   * Set visibility of all slice planes
   */
  public setVisible(visible: boolean) {
    this.visible = visible;

    this.planes.forEach(({ actor, orientation }) => {
      actor.setVisibility(visible);
    });

    this.render();
  }

  /**
   * Set visibility of a specific slice plane
   */
  public setPlaneVisible(orientation: SliceOrientation, visible: boolean) {
    const planeInfo = this.planes.get(orientation);

    if (!planeInfo) {
      console.warn(`⚠️ Cannot set visibility for ${orientation} plane: not found`);
      return;
    }

    planeInfo.actor.setVisibility(visible);
    console.log(`${visible ? '👁️' : '🙈'} ${orientation} plane ${visible ? 'shown' : 'hidden'}`);

    this.render();
  }

  /**
   * Update opacity of all planes
   */
  public setOpacity(opacity: number) {
    this.planes.forEach(({ actor, orientation }) => {
      const property = actor.getProperty();
      property.setOpacity(opacity);
      console.log(`💧 ${orientation} plane opacity set to ${opacity}`);
    });

    this.render();
  }

  /**
   * Update opacity of a specific plane
   */
  public setPlaneOpacity(orientation: SliceOrientation, opacity: number) {
    const planeInfo = this.planes.get(orientation);

    if (!planeInfo) {
      console.warn(`⚠️ Cannot set opacity for ${orientation} plane: not found`);
      return;
    }

    const property = planeInfo.actor.getProperty();
    property.setOpacity(opacity);
    console.log(`💧 ${orientation} plane opacity set to ${opacity}`);

    this.render();
  }

  /**
   * Get current visibility state
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Trigger viewport render
   */
  public render() {
    if (this.viewport3D) {
      this.viewport3D.render();
    }
  }

  /**
   * Clean up resources
   */
  public destroy() {
    console.log('🗑️ Destroying SlicePlaneManager...');

    // Remove actors from viewport
    if (this.viewport3D) {
      this.planes.forEach(({ orientation }) => {
        try {
          this.viewport3D.removeActor(`slicePlane-${orientation}`);
          console.log(`✅ Removed ${orientation} slice plane from viewport`);
        } catch (error) {
          console.error(`❌ Failed to remove ${orientation} slice plane:`, error);
        }
      });

      // Trigger final render
      this.viewport3D.render();
    }

    // Clean up plane objects
    this.planes.forEach(({ actor, planeSource, mapper }) => {
      if (planeSource) {
        planeSource.delete();
      }
      if (mapper) {
        mapper.delete();
      }
      if (actor) {
        actor.delete();
      }
    });

    this.planes.clear();
    this.viewport3D = null;
    this.initialized = false;

    console.log('✅ SlicePlaneManager destroyed');
  }

  /**
   * Check if manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get plane info for a specific orientation
   */
  public getPlane(orientation: SliceOrientation): SlicePlaneInfo | undefined {
    return this.planes.get(orientation);
  }
}

export default SlicePlaneManager;
