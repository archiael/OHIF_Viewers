import SUPPORTED_TOOLS from './constants/supportedTools';
import { getIsLocked } from './utils/getIsLocked';
import getSOPInstanceAttributes from './utils/getSOPInstanceAttributes';
import { getIsVisible } from './utils/getIsVisible';

const ArrowAnnotate = {
  toAnnotation: measurement => {},

  /**
   * Maps cornerstone annotation event data to measurement service format.
   *
   * @param {Object} cornerstone Cornerstone event data
   * @return {Measurement} Measurement instance
   */
  toMeasurement: (
    csToolsEventDetail,
    displaySetService,
    cornerstoneViewportService,
    getValueTypeFromToolType,
    customizationService
  ) => {
    const { annotation } = csToolsEventDetail;
    const { metadata, data, annotationUID } = annotation;

    const isLocked = getIsLocked(annotationUID);
    const isVisible = getIsVisible(annotationUID);
    if (!metadata || !data) {
      console.warn('Length tool: Missing metadata or data');
      return null;
    }

    const { toolName, referencedImageId, FrameOfReferenceUID } = metadata;
    const validToolType = SUPPORTED_TOOLS.includes(toolName);

    if (!validToolType) {
      throw new Error('Tool not supported');
    }

    const { SOPInstanceUID, SeriesInstanceUID, StudyInstanceUID } = getSOPInstanceAttributes(
      referencedImageId,
      displaySetService,
      annotation
    );

    let displaySet;

    if (SOPInstanceUID) {
      displaySet = displaySetService.getDisplaySetForSOPInstanceUID(
        SOPInstanceUID,
        SeriesInstanceUID
      );
    } else {
      displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];
    }

    const { points, textBox } = data.handles;

    const mappedAnnotations = getMappedAnnotations(annotation, displaySetService);

    const displayText = getDisplayText(mappedAnnotations, displaySet, customizationService);
    const getReport = () => _getReport(mappedAnnotations, points, FrameOfReferenceUID);

    // Check customization service for measurement data display in panel
    const customization = customizationService?.getCustomization?.('cornerstone.measurements');
    const arrowConfig = customization?.ArrowAnnotate;

    // If displayText is empty array, clear measurement data but keep label (annotation text)
    const shouldHideData = arrowConfig && Array.isArray(arrowConfig.displayText) && arrowConfig.displayText.length === 0;

    return {
      uid: annotationUID,
      SOPInstanceUID,
      FrameOfReferenceUID,
      points,
      textBox,
      isLocked,
      isVisible,
      metadata,
      referenceSeriesUID: SeriesInstanceUID,
      referenceStudyUID: StudyInstanceUID,
      referencedImageId,
      frameNumber: mappedAnnotations[0]?.frameNumber || 1,
      toolName: metadata.toolName,
      displaySetInstanceUID: displaySet.displaySetInstanceUID,
      label: data.label,
      displayText: displayText,
      data: shouldHideData ? {} : data.cachedStats,
      type: getValueTypeFromToolType(toolName),
      getReport,
    };
  },
};

function getMappedAnnotations(annotation, displaySetService) {
  const { metadata, data } = annotation;
  const { text } = data;
  const { referencedImageId } = metadata;

  const annotations = [];

  const { SOPInstanceUID, SeriesInstanceUID, frameNumber } = getSOPInstanceAttributes(
    referencedImageId,
    displaySetService,
    annotation
  );

  const displaySet = displaySetService.getDisplaySetsForSeries(SeriesInstanceUID)[0];

  const { SeriesNumber } = displaySet;

  annotations.push({
    SeriesInstanceUID,
    SOPInstanceUID,
    SeriesNumber,
    frameNumber,
    text,
  });

  return annotations;
}

function getDisplayText(mappedAnnotations, displaySet, customizationService) {
  const displayText = {
    primary: [],
    secondary: [],
  };

  // Check customization service for display configuration
  const customization = customizationService?.getCustomization?.('cornerstone.measurements');
  const arrowConfig = customization?.ArrowAnnotate;

  // If displayText configuration is empty array, return empty displayText (hide measurements)
  // BUT we still want to show the annotation text on viewport for Arrow tool
  // The text will be handled by the annotation rendering, not by displayText overlay
  if (arrowConfig && Array.isArray(arrowConfig.displayText) && arrowConfig.displayText.length === 0) {
    // For Arrow tool, we still show the text through the annotation's own rendering
    // Just return empty displayText to hide any measurement overlays
    if (!mappedAnnotations || !mappedAnnotations.length) {
      return displayText;
    }

    const { text } = mappedAnnotations[0];

    // Add the annotation text to primary so it shows on viewport
    if (text) {
      displayText.primary.push(text);
    }

    return displayText;
  }

  if (!mappedAnnotations || !mappedAnnotations.length) {
    return displayText;
  }

  const { SeriesNumber, SOPInstanceUID, frameNumber, text } = mappedAnnotations[0];

  const instance = displaySet.instances.find(image => image.SOPInstanceUID === SOPInstanceUID);

  let InstanceNumber;
  if (instance) {
    InstanceNumber = instance.InstanceNumber;
  }

  const instanceText = InstanceNumber ? ` I: ${InstanceNumber}` : '';
  const frameText = displaySet.isMultiFrame ? ` F: ${frameNumber}` : '';

  // Add the annotation text to the primary array
  if (text) {
    displayText.primary.push(text);
  }

  // Add the series information to the secondary array
  displayText.secondary.push(`S: ${SeriesNumber}${instanceText}${frameText}`);

  return displayText;
}

function _getReport(mappedAnnotations, points, FrameOfReferenceUID) {
  const columns = [];
  const values = [];

  columns.push('AnnotationType');
  values.push('Cornerstone:ArrowAnnote');

  mappedAnnotations.forEach(annotation => {
    const { text } = annotation;
    columns.push(`Text`);
    values.push(text);
  });

  if (FrameOfReferenceUID) {
    columns.push('FrameOfReferenceUID');
    values.push(FrameOfReferenceUID);
  }

  if (points) {
    columns.push('points');
    values.push(points.map(p => p.join(' ')).join(';'));
  }

  return {
    columns,
    values,
  };
}
export default ArrowAnnotate;
