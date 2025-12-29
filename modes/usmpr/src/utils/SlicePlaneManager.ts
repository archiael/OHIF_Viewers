/**
 * Slice Plane Manager
 *
 * Manages VTK.js plane actors that visualize MPR slice positions in 3D volume viewports.
 * Creates semi-transparent colored volume planes with edges (red=axial, yellow=sagittal, sky blue=coronal)
 * that match the crosshair colors and show where the current MPR slices intersect the volume.
 * Uses thin boxes (3mm thickness) with surface and edges to ensure visibility from all angles.
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
  cubeSource: any; // vtkCubeSource (thin box for volume plane)
  mapper: any; // vtkMapper
  config: SlicePlaneConfig;
}

// EXACT colors from initToolGroups.ts colorsByOrientation:
// axial: rgb(200, 0, 0), sagittal: rgb(200, 200, 0), coronal: rgb(135, 206, 235)
// Converted to 0-1 range: divide by 255
// WIREFRAME MODE: Shows only colored edges (no semi-transparent surface)
const DEFAULT_CONFIGS: Record<SliceOrientation, SlicePlaneConfig> = {
  axial: {
    color: [200/255, 0, 0], // rgb(200, 0, 0) = red, matches crosshair
    opacity: 1.0, // Full opacity for wireframe edges
    size: 500, // mm (width and height)
    thickness: 3.0, // mm (box thickness for wireframe)
  },
  sagittal: {
    color: [200/255, 200/255, 0], // rgb(200, 200, 0) = yellow, matches crosshair
    opacity: 1.0, // Full opacity for wireframe edges
    size: 500,
    thickness: 3.0, // mm (box thickness for wireframe)
  },
  coronal: {
    color: [135/255, 206/255, 235/255], // rgb(135, 206, 235) = sky blue, matches crosshair
    opacity: 1.0, // Full opacity for wireframe edges
    size: 500,
    thickness: 3.0, // mm (box thickness for wireframe)
  },
};

export class SlicePlaneManager {
  private planes: Map<SliceOrientation, SlicePlaneInfo>;
  private viewport3D: any = null;
  private visible: boolean = false; // Start hidden by default - caller must explicitly show
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

    // CRITICAL: Clean up old actors from THIS viewport BEFORE setting this.viewport3D
    // This ensures we remove actors from the viewport we're about to use, not from an old reference
    const orientations: SliceOrientation[] = ['axial', 'sagittal', 'coronal'];

    console.log('🧹 [SlicePlaneManager] AGGRESSIVELY removing ALL old slice plane actors...');

    // Method 1: Remove ALL actors with our UIDs
    const uidsToRemove = orientations.map(orientation => `slicePlane-${orientation}`);

    try {
      if (typeof viewport3D.removeActors === 'function' && uidsToRemove.length > 0) {
        viewport3D.removeActors(uidsToRemove);
        console.log(`✅ Attempted to remove actors by UIDs: ${uidsToRemove.join(', ')}`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to remove actors by UID:', error);
    }

    // Method 2: Get renderer and manually remove any thin box-shaped actors (our slice planes)
    try {
      const renderer = viewport3D.getRenderer?.();
      if (renderer && typeof renderer.getActors === 'function') {
        const rendererActors = renderer.getActors() || [];
        console.log(`🔍 Found ${rendererActors.length} actors in renderer`);

        // Remove actors that look like our slice planes
        // Slice planes are thin cubes (500x500x3mm), so we check for thin box geometry
        let removedCount = 0;
        rendererActors.forEach(actorObj => {
          try {
            const actor = actorObj.actor || actorObj;
            const mapper = actor?.getMapper?.();
            const inputData = mapper?.getInputData?.();

            // Check if this is a thin box (our slice planes are thin cubes)
            if (inputData) {
              const bounds = inputData.getBounds?.();
              // Our planes are 500x500x3mm boxes
              if (bounds && bounds.length === 6) {
                const xSize = Math.abs(bounds[1] - bounds[0]);
                const ySize = Math.abs(bounds[3] - bounds[2]);
                const zSize = Math.abs(bounds[5] - bounds[4]);

                // Check if this matches our slice plane dimensions
                // Our planes are 500mm × 500mm × 3mm (or close to it due to floating point)
                const sizes = [xSize, ySize, zSize].sort((a, b) => a - b);
                const [smallest, medium, largest] = sizes;

                // Check if dimensions match our planes (with some tolerance)
                // smallest should be ~3mm, medium and largest should be ~500mm
                const isOurPlane =
                  smallest > 1 && smallest < 10 &&  // thickness is 3mm
                  medium > 400 && medium < 600 &&    // size is 500mm
                  largest > 400 && largest < 600;    // size is 500mm

                if (isOurPlane) {
                  renderer.removeActor(actor);
                  removedCount++;
                  console.log(`🗑️ Removed slice plane actor (${xSize.toFixed(1)}×${ySize.toFixed(1)}×${zSize.toFixed(1)}mm)`);
                }
              }
            }
          } catch (err) {
            // Ignore errors checking individual actors
          }
        });

        if (removedCount > 0) {
          console.log(`✅ Forcibly removed ${removedCount} plane-like actors from renderer`);
        } else {
          console.log(`ℹ️ No plane-like actors found to remove`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not access renderer for cleanup:', error);
    }

    // Force render after cleanup to ensure actors are fully removed from scene
    try {
      viewport3D.render();
      console.log('🔄 Viewport rendered after cleanup');
    } catch (error) {
      console.warn('⚠️ Failed to render after cleanup:', error);
    }

    // NOW set the viewport reference for this manager
    this.viewport3D = viewport3D;

    // Create planes for each orientation
    orientations.forEach(orientation => {
      const planeConfig = config?.[orientation] || DEFAULT_CONFIGS[orientation];
      const planeInfo = this.createPlane(orientation, planeConfig);
      this.planes.set(orientation, planeInfo);

      // CRITICAL: Set actor to HIDDEN before adding to viewport
      // This prevents planes from appearing briefly before setVisible(false) is called
      planeInfo.actor.setVisibility(false);

      // Add actor to 3D viewport (hidden)
      try {
        viewport3D.addActor({ uid: `slicePlane-${orientation}`, actor: planeInfo.actor });
        console.log(`✅ Added ${orientation} slice plane to 3D viewport with UID: slicePlane-${orientation} (visibility: false)`);
      } catch (error) {
        console.error(`❌ Failed to add ${orientation} slice plane:`, error);
        console.error('   Error details:', error);
      }
    });

    this.initialized = true;
    console.log(`✅ SlicePlaneManager initialized with ${this.planes.size} planes (all hidden initially)`);
    console.log(`   Planes created: ${Array.from(this.planes.keys()).join(', ')}`);

    // Trigger initial render
    this.render();
  }

  /**
   * Create a VTK plane actor using a flat plane - shows as single rectangular outline
   * Wireframe mode displays the plane as 4 lines forming a rectangle
   */
  private createPlane(orientation: SliceOrientation, config: SlicePlaneConfig): SlicePlaneInfo {
    // Import vtkPlaneSource
    const vtkPlaneSource = require('@kitware/vtk.js/Filters/Sources/PlaneSource').default;

    // Create flat plane geometry
    const planeSource = vtkPlaneSource.newInstance();

    // Set plane size - define corners of the rectangle
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

    // Set actor properties
    const property = actor.getProperty();

    // WIREFRAME MODE: Show plane outline as a single rectangle (4 lines)
    property.setRepresentation(1); // 1=Wireframe (edges only)

    // Disable lighting to show pure colors
    property.setLighting(false);

    // Set wireframe color
    property.setColor(...config.color);

    // Set line width for visibility
    property.setLineWidth(3); // Thick lines for visibility

    // Full opacity for lines
    property.setOpacity(1.0);

    // Set polygon offset to render in front of volume
    mapper.setResolveCoincidentTopology(true);
    mapper.setResolveCoincidentTopologyToPolygonOffset();
    mapper.setResolveCoincidentTopologyPolygonOffsetParameters(-100, -100);

    console.log(
      `🎨 Created ${orientation} plane (FLAT): ` +
      `color=[${config.color.map(c => c.toFixed(3)).join(',')}], ` +
      `lineWidth=3, size=${config.size}mm`
    );

    return {
      orientation,
      actor,
      cubeSource: planeSource, // Store as cubeSource for compatibility
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

    const { actor, cubeSource } = planeInfo;

    // Keep cube centered at origin (will be positioned via actor transformation)
    cubeSource.setCenter(0, 0, 0);

    // Calculate rotation to align cube's Z-axis with the desired normal vector
    // The cube is initially aligned with Z-axis, so we rotate it to match the normal
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
        `📐 [SlicePlaneManager] Updated ${orientation} plane: pos=[${position.map(v => v.toFixed(1)).join(',')}], normal=[${normal.map(v => v.toFixed(2)).join(',')}]`
      );
    }
  }

  /**
   * Set visibility of all slice planes
   */
  public setVisible(visible: boolean) {
    console.log(`👁️ [SlicePlaneManager] setVisible(${visible}) called - ${this.planes.size} planes`);
    this.visible = visible;

    this.planes.forEach(({ actor, orientation }) => {
      actor.setVisibility(visible);
      console.log(`  ${visible ? '✅' : '🙈'} ${orientation} plane visibility set to ${visible}`);
    });

    this.render();
    console.log(`✅ [SlicePlaneManager] Visibility set to ${visible} and rendered`);
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

    // Remove actors from viewport using multiple methods to ensure cleanup
    if (this.viewport3D) {
      const orientations: SliceOrientation[] = ['axial', 'sagittal', 'coronal'];

      // Method 1: Try removeActors with UIDs (preferred)
      console.log('🧹 Attempting to remove actors by UID...');
      orientations.forEach(orientation => {
        const actorUID = `slicePlane-${orientation}`;
        try {
          if (typeof this.viewport3D.removeActors === 'function') {
            this.viewport3D.removeActors([actorUID]);
            console.log(`✅ Removed ${orientation} by UID`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to remove ${orientation} by UID:`, error);
        }
      });

      // Method 2: Try direct renderer access as backup
      console.log('🧹 Attempting direct renderer cleanup...');
      this.planes.forEach(({ orientation, actor }) => {
        try {
          const renderer = this.viewport3D.getRenderer?.();
          if (renderer && typeof renderer.removeActor === 'function') {
            renderer.removeActor(actor);
            console.log(`✅ Removed ${orientation} from renderer`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed renderer removal for ${orientation}:`, error);
        }
      });

      // Trigger final render to update viewport
      try {
        this.viewport3D.render();
        console.log('🔄 Viewport rendered after actor removal');
      } catch (error) {
        console.warn('⚠️ Failed to render viewport during destroy:', error);
      }
    }

    // Clean up plane objects
    this.planes.forEach(({ actor, cubeSource, mapper }) => {
      if (cubeSource) {
        cubeSource.delete();
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
