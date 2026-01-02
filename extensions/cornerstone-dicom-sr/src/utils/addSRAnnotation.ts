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
  if (valueType === 'SCOORD3D' && TrackingIdentifier) {
    // Extract tool name from "Cornerstone3DTools@^0.1.0:Length" -> "Length"
    const toolNameMatch = TrackingIdentifier.match(/:(.+)$/);
    if (toolNameMatch) {
      const extractedToolName = toolNameMatch[1];

      // If Circle/Ellipse was converted to POLYLINE, use DICOMSRDisplay
      // because the original tool expects different data format
      if ((extractedToolName === 'CircleROI' || extractedToolName === 'EllipticalROI') &&
          graphicType === 'POLYLINE') {
        toolName = toolNames.DICOMSRDisplay;
        console.log(`📌 [SR] Using DICOMSRDisplay for converted ${extractedToolName} (POLYLINE)`);
      } else {
        toolName = extractedToolName;
        console.log(`📌 [SR] Using tool name "${toolName}" for SCOORD3D annotation`);
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
  // For other measurements, numeric value is in labels[0].value
  let label = undefined;
  let displayText = measurement.displayText || undefined;

  // ArrowAnnotate uses .label (CodeMeaning) instead of .value (numeric value)
  if (toolName === 'ArrowAnnotate' && measurement.labels?.[0]?.label) {
    label = measurement.labels[0].label;
    console.log('🔍 [SR Load] ArrowAnnotate detected:');
    console.log('   measurement.TrackingIdentifier:', measurement.TrackingIdentifier);
    console.log('   measurement.labels:', measurement.labels);
    console.log('   Using labels[0].label as text:', label);
  } else {
    label = measurement.labels?.[0]?.value || undefined;
  }

  // For ArrowAnnotate, set text property and don't include cachedStats
  const annotationData: any = {
    label,
    displayText,
    handles: {
      textBox: measurement.textBox ?? {},
      points: graphicTypePoints[0],
    },
    frameNumber,
    renderableData,
    TrackingUniqueIdentifier,
    TrackingIdentifier,
    labels: measurement.labels,
  };

  // ArrowAnnotate uses 'text' property to display label, not cachedStats
  if (toolName === 'ArrowAnnotate' && label) {
    annotationData.text = label;
    console.log('   ✅ Set ArrowAnnotate text to:', label);
  } else {
    // Other tools use cachedStats for measurements
    annotationData.cachedStats = {};
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
    },
    data: annotationData,
  };

  /**
   * Add the annotation to the annotation state manager.
   * Note: Using annotation.state.addAnnotation() instead of annotationManager.addAnnotation()
   * because the latter was not triggering annotation_added events properly.
   *
   * @param {Types.Annotation} SRAnnotation - The annotation to add
   */
  annotation.state.addAnnotation(SRAnnotation);

  return SRAnnotation; // Return annotation to indicate success
}
