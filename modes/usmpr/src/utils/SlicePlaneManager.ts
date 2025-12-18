/**
 * Slice Plane Manager
 *
 * Manages VTK.js plane actors that visualize MPR slice positions in 3D volume viewports.
 * Creates colored transparent planes (bright red=axial, bright yellow=sagittal, blue=coronal) that
 * show where the current MPR slices intersect the volume.
 */

import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

export type SliceOrientation = 'axial' | 'sagittal' | 'coronal';

export interface SlicePlaneConfig {
  color: [number, number, number]; // RGB 0-1
  opacity: number; // 0-1
  size: number; // Plane size in mm
}

export interface SlicePlaneInfo {
  orientation: SliceOrientation;
  actor: any; // vtkActor
  planeSource: any; // vtkPlaneSource
  mapper: any; // vtkMapper
  config: SlicePlaneConfig;
}

const DEFAULT_CONFIGS: Record<SliceOrientation, SlicePlaneConfig> = {
  axial: {
    color: [1.0, 0, 0], // rgb(255, 0, 0) = bright red
    opacity: 0.3,
    size: 500, // mm
  },
  sagittal: {
    color: [1.0, 1.0, 0], // rgb(255, 255, 0) = bright yellow
    opacity: 0.3,
    size: 500,
  },
  coronal: {
    color: [0, 0, 1.0], // rgb(0, 0, 255) = blue
    opacity: 0.3,
    size: 500,
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
   * Create a VTK plane actor for a specific orientation
   */
  private createPlane(orientation: SliceOrientation, config: SlicePlaneConfig): SlicePlaneInfo {
    // Create plane geometry
    const planeSource = vtkPlaneSource.newInstance();

    // Set plane size
    planeSource.setXResolution(1);
    planeSource.setYResolution(1);

    // Set initial plane dimensions (will be updated based on volume bounds)
    const halfSize = config.size / 2;
    planeSource.setOrigin(-halfSize, -halfSize, 0);
    planeSource.setPoint1(halfSize, -halfSize, 0);
    planeSource.setPoint2(-halfSize, halfSize, 0);

    // Create mapper
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(planeSource.getOutputPort());

    // Create actor
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    // Set actor properties (color, opacity)
    const property = actor.getProperty();
    property.setColor(...config.color);
    property.setOpacity(config.opacity);

    // Make plane edges visible
    property.setEdgeVisibility(true);
    property.setEdgeColor(...config.color);
    property.setLineWidth(2);

    // Disable lighting for flat appearance
    property.setLighting(false);

    console.log(`🎨 Created ${orientation} plane: color=${config.color}, opacity=${config.opacity}`);

    return {
      orientation,
      actor,
      planeSource,
      mapper,
      config,
    };
  }

  /**
   * Update the position and orientation of a slice plane
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

    const { planeSource, config } = planeInfo;
    const halfSize = config.size / 2;

    // Calculate plane coordinate system
    // We need to find two perpendicular vectors in the plane
    const [nx, ny, nz] = normal;

    // Find first perpendicular vector (tangent 1)
    let t1: [number, number, number];
    if (Math.abs(nx) < 0.9) {
      // Cross product with X axis
      t1 = [0, nz, -ny];
    } else {
      // Cross product with Y axis
      t1 = [-nz, 0, nx];
    }

    // Normalize t1
    const t1Mag = Math.sqrt(t1[0] * t1[0] + t1[1] * t1[1] + t1[2] * t1[2]);
    t1 = [t1[0] / t1Mag, t1[1] / t1Mag, t1[2] / t1Mag];

    // Find second perpendicular vector (tangent 2) = normal × t1
    const t2: [number, number, number] = [
      ny * t1[2] - nz * t1[1],
      nz * t1[0] - nx * t1[2],
      nx * t1[1] - ny * t1[0],
    ];

    // Set plane corners
    const origin: [number, number, number] = [
      position[0] - halfSize * t1[0] - halfSize * t2[0],
      position[1] - halfSize * t1[1] - halfSize * t2[1],
      position[2] - halfSize * t1[2] - halfSize * t2[2],
    ];

    const point1: [number, number, number] = [
      position[0] + halfSize * t1[0] - halfSize * t2[0],
      position[1] + halfSize * t1[1] - halfSize * t2[1],
      position[2] + halfSize * t1[2] - halfSize * t2[2],
    ];

    const point2: [number, number, number] = [
      position[0] - halfSize * t1[0] + halfSize * t2[0],
      position[1] - halfSize * t1[1] + halfSize * t2[1],
      position[2] - halfSize * t1[2] + halfSize * t2[2],
    ];

    // Update plane geometry
    planeSource.setOrigin(...origin);
    planeSource.setPoint1(...point1);
    planeSource.setPoint2(...point2);

    // Only log every 10th update to reduce noise
    if (!this._updateCount[orientation]) this._updateCount[orientation] = 0;
    this._updateCount[orientation]++;

    if (this._updateCount[orientation] % 10 === 1) {
      console.log(
        `📐 [SlicePlaneManager] Updated ${orientation} plane: pos=[${position.map(v => v.toFixed(1)).join(',')}], normal=[${normal.map(v => v.toFixed(2)).join(',')}]`
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
      console.log(`${visible ? '👁️' : '🙈'} ${orientation} plane ${visible ? 'shown' : 'hidden'}`);
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
