import { Types, annotation } from '@cornerstonejs/tools';
import { metaData } from '@cornerstonejs/core';
import { adaptersSR } from '@cornerstonejs/adapters';

import getRenderableData from './getRenderableData';
import toolNames from '../tools/toolNames';

const { MeasurementReport } = adaptersSR.Cornerstone3D;

/**
 * Adds a DICOM SR (Structured Report) annotation to the annotation manager.
 * This function processes measurement data from DICOM SR and converts it into
 * a format suitable for display in the Cornerstone3D viewer.
 *
 * @param {Object} params - The parameters object
 * @param {Object} params.measurement - The DICOM SR measurement data containing coordinates, labels, and metadata
 * @param {Array} params.measurement.coords - Array of coordinate objects with GraphicType, ValueType, and other properties
 * @param {string} params.measurement.TrackingUniqueIdentifier - Unique identifier for the measurement
 * @param {string} params.measurement.TrackingIdentifier - Tracking identifier for adapter lookup
 * @param {Array} [params.measurement.labels] - Optional array of label objects
 * @param {string} [params.measurement.displayText] - Optional display text for the annotation
 * @param {Object} [params.measurement.textBox] - Optional text box configuration
 * @param {string|null} [params.imageId] - Optional image ID for the referenced image (defaults to null)
 * @param {number|null} [params.frameNumber] - Optional frame number for multi-frame images (defaults to null)
 * @param {Object} params.displaySet - The display set containing the image
 * @param {string} params.displaySet.displaySetInstanceUID - Unique identifier for the display set
 * @returns {void}
 *
 * @example
 * ```typescript
 * addSRAnnotation({
 *   measurement: {
 *     TrackingUniqueIdentifier: '1.2.3.4.5',
 *     TrackingIdentifier: 'POINT',
 *     coords: [{
 *       GraphicType: 'POINT',
 *       ValueType: 'SCOORD',
 *       // ... other coordinate properties
 *     }],
 *     labels: [{ value: 'Measurement Point' }],
 *     displayText: 'Point measurement'
 *   },
 *   imageId: 'wadouri:file://path/to/image.dcm', // Optional
 *   frameNumber: 0, // Optional
 *   displaySet: { displaySetInstanceUID: '1.2.3.4' }
 * });
 * ```
 */
export default function addSRAnnotation({ measurement, imageId = null, frameNumber = null, displaySet }) {
  // console.log('🔵 [addSRAnnotation] Called with measurement:', measurement);
  // console.log('🔵 [addSRAnnotation] measurement.displayText:', measurement.displayText);

  const { TrackingUniqueIdentifier, TrackingIdentifier } = measurement;
  const { ValueType: valueType, GraphicType: graphicType } = measurement.coords[0];

  /**
   * For SCOORD3D (3D) annotations, use the actual tool name from TrackingIdentifier
   * (e.g., "Length", "ArrowAnnotate") so they render properly with original tool styling.
   * For SCOORD (2D) annotations, use DICOMSRDisplay for Stack viewports.
   *
   * EXCEPTION: Circle/Ellipse converted to POLYLINE must use DICOMSRDisplay
   * because the original tools expect circle/ellipse data format, not polyline points.
   */
  let toolName = toolNames.DICOMSRDisplay;
  let isConvertedCircleOrEllipse = false; // Flag to hide measurements for converted shapes

  if (valueType === 'SCOORD3D' && TrackingIdentifier) {
    // Extract tool name from "Cornerstone3DTools@^0.1.0:Length" -> "Length"
    const toolNameMatch = TrackingIdentifier.match(/:(.+)$/);
    if (toolNameMatch) {
      const extractedToolName = toolNameMatch[1];

      // If Circle/Ellipse was converted to POLYLINE, use PlanarFreehandROI
      // because it has measurement mapping and supports POLYLINE data
      if ((extractedToolName === 'CircleROI' || extractedToolName === 'EllipticalROI') &&
          graphicType === 'POLYLINE') {
        toolName = 'PlanarFreehandROI';
        isConvertedCircleOrEllipse = true; // Mark as converted shape
        // console.log(`📌 [SR] Using PlanarFreehandROI for converted ${extractedToolName} (POLYLINE)`);
      } else {
        toolName = extractedToolName;
        // console.log(`📌 [SR] Using tool name "${toolName}" for SCOORD3D annotation`);
      }
    }
  }

  /**
   * @type {Object} Renderable data organized by graphic type
   * Groups coordinate data by GraphicType for efficient rendering
   */
  const renderableData = measurement.coords.reduce((acc, coordProps) => {
    acc[coordProps.GraphicType] = acc[coordProps.GraphicType] || [];
    acc[coordProps.GraphicType].push(getRenderableData({ ...coordProps, imageId }));
    return acc;
  }, {});

  const graphicTypePoints = renderableData[graphicType];

  // Check if we got valid renderable data
  if (!graphicTypePoints || graphicTypePoints.length === 0 ||
      (graphicTypePoints[0] && graphicTypePoints[0].length === 0)) {
    console.warn('[addSRAnnotation] No valid renderable data - measurement not ready to load');
    console.warn('[addSRAnnotation] This is likely due to missing image metadata - will retry later');
    return null; // Return null to indicate measurement couldn't be loaded
  }

  /**
   * TODO: Read the tool name from the DICOM SR identification type in the future.
   */
  let frameOfReferenceUID = null;
  let planeRestriction = null;

  /**
   * Store the view reference for use in initial navigation
   */
  if (imageId) {
    const imagePlaneModule = metaData.get('imagePlaneModule', imageId);
    frameOfReferenceUID = imagePlaneModule?.frameOfReferenceUID;
  }

  /**
   * Store the view reference for use in initial navigation
   */
  if (valueType === 'SCOORD3D') {
    // ReferencedFrameOfReferenceSequence can be a string (UID) or object with .FrameOfReferenceUID
    const refSequence = measurement.coords[0].ReferencedFrameOfReferenceSequence;
    frameOfReferenceUID = typeof refSequence === 'string'
      ? refSequence
      : refSequence?.FrameOfReferenceUID;

    planeRestriction = {
      FrameOfReferenceUID: frameOfReferenceUID,
      point: graphicTypePoints[0][0],
    };
  }

  /**
   * Store the view reference for use in initial navigation
   */
  measurement.viewReference = {
    planeRestriction,
    FrameOfReferenceUID: frameOfReferenceUID,
    referencedImageId: imageId,
  };

  /**
   * @type {Types.Annotation} The annotation object to be added to the annotation manager
   * Contains all necessary metadata and data for rendering the DICOM SR measurement
   */
  // For ArrowAnnotate, user text is stored in labels[0].label (CodeMeaning from CORNERSTONEFREETEXT)
  // For other SR measurements, use displayText directly as label for measurement panel
  let label = undefined;
  let displayText = measurement.displayText || undefined;

  // Set label for measurement panel (always preserve, even for converted shapes)
  // ArrowAnnotate uses .label (CodeMeaning) instead of .value (numeric value)
  if (toolName === 'ArrowAnnotate' && measurement.labels?.[0]?.label) {
    label = measurement.labels[0].label;
    // console.log('🔍 [SR Load] ArrowAnnotate detected:');
    // console.log('   measurement.TrackingIdentifier:', measurement.TrackingIdentifier);
    // console.log('   measurement.labels:', measurement.labels);
    // console.log('   Using labels[0].label as text:', label);
  }
  // For other SR measurements, use displayText as the label (human-readable text for panel)
  else if (displayText) {
    label = displayText;  // Use displayText directly as label
    // console.log('🔍 [SR Load] Using displayText as label for measurement panel:', displayText);
  }
  else {
    label = measurement.labels?.[0]?.value || undefined;
  }

  // For converted Circle/Ellipse, hide viewport textBox but keep label for measurement panel
  if (isConvertedCircleOrEllipse) {
    // console.log('   🔇 Hiding viewport measurements for converted Circle/Ellipse (label preserved for panel)');
  }

  // For ArrowAnnotate, set text property and don't include cachedStats
  const annotationData: any = {
    label,
    displayText,
    handles: {
      // For converted Circle/Ellipse, set textBox to undefined to prevent measurement display
      textBox: isConvertedCircleOrEllipse ? undefined : (measurement.textBox ?? {}),
      points: graphicTypePoints[0],
    },
    frameNumber,
    renderableData,
    TrackingUniqueIdentifier,
    TrackingIdentifier,
    labels: measurement.labels,
  };

  // Add configuration to disable stats for converted Circle/Ellipse
  if (isConvertedCircleOrEllipse) {
    annotationData.configuration = {
      calculateStats: false,
      renderTextBox: false,
    };
  }

  // ArrowAnnotate uses 'text' property to display label, not cachedStats
  if (toolName === 'ArrowAnnotate' && label) {
    annotationData.text = label;
    // console.log('   ✅ Set ArrowAnnotate text to:', label);
  } else if (!isConvertedCircleOrEllipse) {
    // Other tools use cachedStats for measurements
    // But skip for converted Circle/Ellipse to prevent measurement display
    annotationData.cachedStats = {};
  }

  // PlanarFreehandROI expects data.contour.polyline structure
  if (toolName === 'PlanarFreehandROI' && graphicType === 'POLYLINE') {
    annotationData.contour = {
      polyline: graphicTypePoints[0]
    };
    // console.log('   ✅ Set PlanarFreehandROI contour.polyline with', graphicTypePoints[0].length, 'points');
  }

  const SRAnnotation: Types.Annotation = {
    annotationUID: TrackingUniqueIdentifier,
    highlighted: false,
    isLocked: false,
    // SCOORD3D (3D) measurements should NOT be preview so they render on Volume viewports
    // SCOORD (2D) measurements can be preview as they render on Stack viewports
    isPreview: valueType !== 'SCOORD3D',
    invalidated: false,
    metadata: {
      toolName,
      planeRestriction,
      valueType,
      graphicType,
      FrameOfReferenceUID: frameOfReferenceUID,
      referencedImageId: imageId,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      // Add SeriesInstanceUID for proper measurement mapping
      SeriesInstanceUID: displaySet.SeriesInstanceUID,
      StudyInstanceUID: displaySet.StudyInstanceUID,
      // Add referenceSeriesUID for measurement panel matching
      referenceSeriesUID: displaySet.SeriesInstanceUID,
      // Hide measurements for Circle/Ellipse converted to POLYLINE
      hideMeasurements: isConvertedCircleOrEllipse,
      // Flag to identify SR-originated annotations
      isSRAnnotation: true,
      // Include clinical data from SR DICOM (echo_pattern, shape, orientation, margin)
      clinical: measurement.clinical || undefined,
    },
    data: annotationData,
    // Disable automatic stats calculation for converted Circle/Ellipse
    autoGenerated: isConvertedCircleOrEllipse ? false : undefined,
  };

  /**
   * Add the annotation to the annotation state manager.
   * Note: Using annotation.state.addAnnotation() instead of annotationManager.addAnnotation()
   * because the latter was not triggering annotation_added events properly.
   *
   * @param {Types.Annotation} SRAnnotation - The annotation to add
   */
  annotation.state.addAnnotation(SRAnnotation);

  /**
   * For converted Circle/Ellipse, hide textBox and its connecting line
   * while keeping the shape outline visible
   */
  if (isConvertedCircleOrEllipse) {
    try {
      annotation.config.style.setAnnotationStyles(SRAnnotation.annotationUID, {
        // Hide textBox (measurement numbers)
        textBoxFontSize: '0px',
        textBoxFontFamily: '',
        textBoxColor: 'rgba(0, 0, 0, 0)',
        // Hide textBox connecting line (dashed line from shape to textBox)
        textBoxLinkLineWidth: '0',
      });
      // console.log('   🎨 Applied invisible textBox style for converted Circle/Ellipse');
    } catch (error) {
      console.warn('   ⚠️ Could not set annotation style:', error);
    }
  }

  /**
   * Explicitly set the annotation to visible by default.
   * This ensures SR annotations are visible when loaded, and can be toggled off later.
   */
  annotation.visibility.setAnnotationVisibility(SRAnnotation.annotationUID, true);

  return SRAnnotation; // Return annotation to indicate success
}
