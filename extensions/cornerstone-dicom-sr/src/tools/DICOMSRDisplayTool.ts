import { Types, metaData, utilities as csUtils, StackViewport, getEnabledElement } from '@cornerstonejs/core';
import {
  AnnotationTool,
  annotation,
  drawing,
  utilities,
  Types as cs3DToolsTypes,
} from '@cornerstonejs/tools';
import { vec3 } from 'gl-matrix';
import { getTrackingUniqueIdentifiersForElement } from './modules/dicomSRModule';
import { SCOORDTypes } from '../enums';
import toolNames from './toolNames';

export default class DICOMSRDisplayTool extends AnnotationTool {
  static toolName = toolNames.DICOMSRDisplay;

  constructor(
    toolProps = {},
    defaultToolProps = {
      configuration: {},
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _getTextBoxLinesFromLabels(labels) {
    // TODO -> max 5 for now (label + shortAxis + longAxis), need a generic solution for this!

    const labelLength = Math.min(labels.length, 5);
    const lines = [];

    for (let i = 0; i < labelLength; i++) {
      const labelEntry = labels[i];
      lines.push(`${_labelToShorthand(labelEntry.label)}: ${labelEntry.value}`);
    }

    return lines;
  }

  // This tool should not inherit from AnnotationTool and we should not need
  // to add the following lines.
  isPointNearTool = () => null;
  getHandleNearImagePoint = () => null;

  renderAnnotation = (enabledElement: Types.IEnabledElement, svgDrawingHelper: any): void => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    // ✅ IMPORTANT: SR annotations are added WITHOUT element binding (global annotations)
    // Get all annotations and filter by SR marker (TrackingUniqueIdentifier)
    // SR annotations use actual tool names (Length, PlanarFreehandROI, etc.) NOT 'DICOMSRDisplay'
    const allAnnotations = annotation.state.getAllAnnotations();

    // Debug logging for Stack viewport - BEFORE filtering
    if (viewport.id === 'mpr-stack-single') {
      console.log(`[SR-RENDER-DEBUG] Stack viewport - BEFORE filter:`, {
        viewportId: viewport.id,
        viewportType: viewport.type,
        totalAnnotations: allAnnotations?.length || 0,
        thisToolName: this.getToolName(),
        annotationToolNames: allAnnotations?.map(a => a.metadata?.toolName || 'NO_TOOLNAME').slice(0, 10)
      });
    }

    // Filter for SR annotations by checking for TrackingUniqueIdentifier (SR-specific property)
    let annotations = allAnnotations.filter(annot => annot.data?.TrackingUniqueIdentifier !== undefined);

    // Debug logging for Stack viewport - AFTER filtering
    if (viewport.id === 'mpr-stack-single') {
      console.log(`[SR-RENDER-DEBUG] Stack viewport - AFTER filter:`, {
        viewportId: viewport.id,
        viewportType: viewport.type,
        annotationsCount: annotations?.length || 0,
        toolName: this.getToolName()
      });
    }

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      if (viewport.id === 'mpr-stack-single') {
        console.log(`[SR-RENDER-DEBUG] No annotations found for Stack viewport`);
      }
      return;
    }

    const beforeFilter = annotations.length;
    annotations = this.filterInteractableAnnotationsForElement(element, annotations);

    if (viewport.id === 'mpr-stack-single') {
      console.log(`[SR-RENDER-DEBUG] After filterInteractableAnnotationsForElement:`, {
        before: beforeFilter,
        after: annotations?.length || 0,
        filtered: annotations
      });
    }

    if (!annotations?.length) {
      if (viewport.id === 'mpr-stack-single') {
        console.log(`[SR-RENDER-DEBUG] All annotations filtered out for Stack viewport`);
      }
      return;
    }

    const trackingUniqueIdentifiersForElement = getTrackingUniqueIdentifiersForElement(element);

    const { activeIndex, trackingUniqueIdentifiers } = trackingUniqueIdentifiersForElement;

    const activeTrackingUniqueIdentifier = trackingUniqueIdentifiers[activeIndex];

    // Filter toolData to only render the data for the active SR.
    // CRITICAL: If trackingUniqueIdentifiers is empty (no SR panel/selection in this mode),
    // show ALL annotations. Otherwise only show selected SR annotations.
    const filteredAnnotations = trackingUniqueIdentifiers.length === 0
      ? annotations
      : annotations.filter(annotation =>
          trackingUniqueIdentifiers.includes(annotation.data?.TrackingUniqueIdentifier)
        );

    if (!viewport._actors?.size) {
      return;
    }

    const styleSpecifier: cs3DToolsTypes.AnnotationStyle.StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };
    const { style: annotationStyle } = annotation.config;

    // Debug: Log first time to see what's happening
    if (filteredAnnotations.length > 0 && viewport.id === 'mpr-stack-single') {
      const firstAnnot = filteredAnnotations[0];
      const firstVisible = annotation.visibility.isAnnotationVisible(firstAnnot.annotationUID);
      console.log(`[SR-RENDER] Stack viewport: ${filteredAnnotations.length} annotations, first visible=${firstVisible}`);
    }

    for (let i = 0; i < filteredAnnotations.length; i++) {
      const annot = filteredAnnotations[i];
      const annotationUID = annot.annotationUID;

      // ✅ IMPORTANT: Check visibility before rendering
      // This allows toggle visibility to work for SR annotations
      const isVisible = annotation.visibility.isAnnotationVisible(annotationUID);
      if (!isVisible) {
        if (i === 0) {
          console.log(`[SR-RENDER] Skipping annotation ${annotationUID} - not visible`);
        }
        continue; // Skip rendering invisible annotations
      }

      const { renderableData, TrackingUniqueIdentifier, TrackingIdentifier } = annot.data;
      const { referencedImageId } = annot.metadata;

      styleSpecifier.annotationUID = annotationUID;

      const toolGroupStyles = annotationStyle.getToolGroupToolStyles(this.toolGroupId);
      const groupStyle = toolGroupStyles ? toolGroupStyles[this.getToolName()] : undefined;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annot);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annot);
      const color =
        TrackingUniqueIdentifier === activeTrackingUniqueIdentifier
          ? 'rgb(0, 255, 0)'
          : this.getStyle('color', styleSpecifier, annot);

      const options = {
        color,
        lineDash,
        lineWidth,
        ...(groupStyle || {}),
      };

      Object.keys(renderableData).forEach(GraphicType => {
        const renderableDataForGraphicType = renderableData[GraphicType];

        let renderMethod;
        let canvasCoordinatesAdapter;

        switch (GraphicType) {
          case SCOORDTypes.POINT:
            renderMethod = this.renderPoint;
            break;
          case SCOORDTypes.MULTIPOINT:
            renderMethod = this.renderMultipoint;
            break;
          case SCOORDTypes.POLYLINE:
            renderMethod = this.renderPolyLine;
            break;
          case SCOORDTypes.CIRCLE:
            renderMethod = this.renderEllipse;
            break;
          case SCOORDTypes.ELLIPSE:
            renderMethod = this.renderEllipse;
            canvasCoordinatesAdapter = utilities.math.ellipse.getCanvasEllipseCorners;
            break;
          default:
            throw new Error(`Unsupported GraphicType: ${GraphicType}`);
        }

        const canvasCoordinates = renderMethod(
          svgDrawingHelper,
          viewport,
          renderableDataForGraphicType,
          annotationUID,
          referencedImageId,
          options
        );

        // Skip text rendering for Circle/Ellipse converted to POLYLINE
        // (they should only show the shape, not measurement values)
        const isConvertedCircleOrEllipse =
          TrackingIdentifier &&
          (TrackingIdentifier.includes('CircleROI') || TrackingIdentifier.includes('EllipticalROI')) &&
          GraphicType === 'POLYLINE';

        if (!isConvertedCircleOrEllipse) {
          this.renderTextBox(
            svgDrawingHelper,
            viewport,
            canvasCoordinates,
            canvasCoordinatesAdapter,
            annot,  // ✅ FIX: Use 'annot' (SR annotation) not 'annotation' (module)
            styleSpecifier,
            options
          );
        }
      });
    }
  };

  renderPolyLine(
    svgDrawingHelper,
    viewport,
    renderableData,
    annotationUID,
    referencedImageId,
    options
  ) {
    const drawingOptions = {
      color: options.color,
      width: options.lineWidth,
      lineDash: options.lineDash,
    };
    let allCanvasCoordinates = [];
    renderableData.map((data, index) => {
      const canvasCoordinates = data.map(p => viewport.worldToCanvas(p));
      const lineUID = `${index}`;

      if (canvasCoordinates.length === 2) {
        drawing.drawLine(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates[0],
          canvasCoordinates[1],
          drawingOptions
        );
      } else {
        drawing.drawPolyline(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates,
          drawingOptions
        );
      }

      allCanvasCoordinates = allCanvasCoordinates.concat(canvasCoordinates);
    });

    return allCanvasCoordinates; // used for drawing textBox
  }

  renderMultipoint(
    svgDrawingHelper,
    viewport,
    renderableData,
    annotationUID,
    referencedImageId,
    options
  ) {
    let canvasCoordinates;
    renderableData.map((data, index) => {
      canvasCoordinates = data.map(p => viewport.worldToCanvas(p));
      const handleGroupUID = '0';
      drawing.drawHandles(svgDrawingHelper, annotationUID, handleGroupUID, canvasCoordinates, {
        color: options.color,
      });
    });
  }

  renderPoint(
    svgDrawingHelper,
    viewport,
    renderableData,
    annotationUID,
    referencedImageId,
    options
  ) {
    const canvasCoordinates = [];
    renderableData.map((data, index) => {
      const point = data[0];
      // This gives us one point for arrow
      canvasCoordinates.push(viewport.worldToCanvas(point));

      if (data[1] !== undefined) {
        canvasCoordinates.push(viewport.worldToCanvas(data[1]));
      }
      else{
         // We get the other point for the arrow by using the image size
      const imagePixelModule = metaData.get('imagePixelModule', referencedImageId);

      let xOffset = 10;
      let yOffset = 10;

      if (imagePixelModule) {
        const { columns, rows } = imagePixelModule;
        xOffset = columns / 10;
        yOffset = rows / 10;
      }

      const imagePoint = csUtils.worldToImageCoords(referencedImageId, point);
      const arrowEnd = csUtils.imageToWorldCoords(referencedImageId, [
        imagePoint[0] + xOffset,
        imagePoint[1] + yOffset,
      ]);

      canvasCoordinates.push(viewport.worldToCanvas(arrowEnd));
        
      }
     

      const arrowUID = `${index}`;

      // Todo: handle drawing probe as probe, currently we are drawing it as an arrow
      drawing.drawArrow(
        svgDrawingHelper,
        annotationUID,
        arrowUID,
        canvasCoordinates[1],
        canvasCoordinates[0],
        {
          color: options.color,
          width: options.lineWidth,
        }
      );
    });

    return canvasCoordinates; // used for drawing textBox
  }

  renderEllipse(
    svgDrawingHelper,
    viewport,
    renderableData,
    annotationUID,
    referencedImageId,
    options
  ) {
    let canvasCoordinates;
    renderableData.map((data, index) => {
      if (data.length === 0) {
        // since oblique ellipse is not supported for hydration right now
        // we just return
        return;
      }

      const ellipsePointsWorld = data;

      const rotation = viewport.getRotation();

      canvasCoordinates = ellipsePointsWorld.map(p => viewport.worldToCanvas(p));
      let canvasCorners;
      if (rotation == 90 || rotation == 270) {
        canvasCorners = utilities.math.ellipse.getCanvasEllipseCorners([
          canvasCoordinates[2],
          canvasCoordinates[3],
          canvasCoordinates[0],
          canvasCoordinates[1],
        ]) as Array<Types.Point2>;
      } else {
        canvasCorners = utilities.math.ellipse.getCanvasEllipseCorners(
          canvasCoordinates
        ) as Array<Types.Point2>;
      }

      const lineUID = `${index}`;
      drawing.drawEllipse(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCorners[0],
        canvasCorners[1],
        {
          color: options.color,
          width: options.lineWidth,
          lineDash: options.lineDash,
        }
      );
    });

    return canvasCoordinates;
  }

  renderTextBox(
    svgDrawingHelper,
    viewport,
    canvasCoordinates,
    canvasCoordinatesAdapter,
    annotation,
    styleSpecifier,
    options = {}
  ) {
    if (!canvasCoordinates || !annotation) {
      return;
    }

    const { annotationUID, data = {} } = annotation;
    const { labels } = data;
    const { color } = options;

    let adaptedCanvasCoordinates = canvasCoordinates;
    // adapt coordinates if there is an adapter
    if (typeof canvasCoordinatesAdapter === 'function') {
      adaptedCanvasCoordinates = canvasCoordinatesAdapter(canvasCoordinates);
    }
    const textLines = this._getTextBoxLinesFromLabels(labels);
    const canvasTextBoxCoords = utilities.drawing.getTextBoxCoordsCanvas(adaptedCanvasCoordinates);

    if (!annotation.data?.handles?.textBox?.worldPosition) {
      annotation.data.handles.textBox.worldPosition = viewport.canvasToWorld(canvasTextBoxCoords);
    }

    const textBoxPosition = viewport.worldToCanvas(annotation.data.handles.textBox.worldPosition);

    const textBoxUID = '1';
    const textBoxOptions = this.getLinkedTextBoxStyle(styleSpecifier, annotation);

    const boundingBox = drawing.drawLinkedTextBox(
      svgDrawingHelper,
      annotationUID,
      textBoxUID,
      textLines,
      textBoxPosition,
      canvasCoordinates,
      {},
      {
        ...textBoxOptions,
        color,
      }
    );

    const { x: left, y: top, width, height } = boundingBox;

    annotation.data.handles.textBox.worldBoundingBox = {
      topLeft: viewport.canvasToWorld([left, top]),
      topRight: viewport.canvasToWorld([left + width, top]),
      bottomLeft: viewport.canvasToWorld([left, top + height]),
      bottomRight: viewport.canvasToWorld([left + width, top + height]),
    };
  }

  /**
   * Override annotation filtering for stack viewports to use spatial intersection
   * (like volume viewports) instead of exact imageId matching.
   */
  filterInteractableAnnotationsForElement(element: HTMLDivElement, annotations: any[]): any[] {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    // For stack viewports with SCOORD3D annotations, use spatial filtering
    if (viewport instanceof StackViewport) {
      return annotations.filter(annotation => {
        const { valueType } = annotation.metadata;

        // SCOORD (2D) uses default imageId filtering
        if (valueType !== 'SCOORD3D') {
          return viewport.isReferenceViewable(annotation.metadata);
        }

        // SCOORD3D: Use spatial filtering (like volume viewports)
        const currentImageId = viewport.getCurrentImageId();
        if (!currentImageId) {
          return false;
        }

        const imagePlane = metaData.get('imagePlaneModule', currentImageId);
        if (!imagePlane) {
          return false;
        }

        // Validate and normalize imagePlane metadata
        if (!imagePlane.imagePositionPatient) {
          console.warn('[DICOMSRDisplayTool] Missing imagePositionPatient in imagePlane');
          return false;
        }

        // Extract rowCosines and columnCosines
        // Stack viewport may use imageOrientationPatient instead of separate rowCosines/columnCosines
        let rowCosines = imagePlane.rowCosines;
        let columnCosines = imagePlane.columnCosines;

        if (!rowCosines || !columnCosines) {
          // Try to extract from imageOrientationPatient (common in stack viewports)
          const imageOrientationPatient = imagePlane.imageOrientationPatient;
          if (imageOrientationPatient && imageOrientationPatient.length === 6) {
            rowCosines = [imageOrientationPatient[0], imageOrientationPatient[1], imageOrientationPatient[2]];
            columnCosines = [imageOrientationPatient[3], imageOrientationPatient[4], imageOrientationPatient[5]];
          } else {
            console.warn('[DICOMSRDisplayTool] Missing orientation data in imagePlane', imagePlane);
            return false;
          }
        }

        const annotationPoints = annotation.data.handles.points || [];
        return _annotationIntersectsSlice(annotationPoints, {
          imagePositionPatient: imagePlane.imagePositionPatient,
          rowCosines,
          columnCosines,
          pixelSpacing: imagePlane.pixelSpacing
        });
      });
    }

    // Volume viewports use default filtering from parent class
    return super.filterInteractableAnnotationsForElement(element, annotations);
  }
}

/**
 * Helper function to check if annotation points intersect with a slice plane.
 * @param annotationPoints - Array of 3D points from the annotation
 * @param imagePlane - Image plane metadata (position, orientation, spacing)
 * @returns true if any point intersects the slice, false otherwise
 */
function _annotationIntersectsSlice(
  annotationPoints: Types.Point3[],
  imagePlane: {
    imagePositionPatient: number[];
    rowCosines: number[];
    columnCosines: number[];
    pixelSpacing?: number[];
  }
): boolean {
  if (!annotationPoints || annotationPoints.length === 0) {
    return false;
  }

  // Calculate slice normal vector (perpendicular to slice plane)
  const sliceNormal = vec3.cross(
    vec3.create(),
    vec3.fromValues(...imagePlane.rowCosines),
    vec3.fromValues(...imagePlane.columnCosines)
  );
  vec3.normalize(sliceNormal, sliceNormal);

  // Get slice position (image origin in world coordinates)
  const slicePosition = vec3.fromValues(...imagePlane.imagePositionPatient);

  // Slice thickness - use pixelSpacing[2] if available, otherwise default to 1.0mm
  const sliceThickness = imagePlane.pixelSpacing?.[2] || 1.0;
  const halfThickness = sliceThickness / 2;

  // Check if any annotation point is within slice thickness
  for (const point of annotationPoints) {
    const pointVec = vec3.fromValues(point[0], point[1], point[2]);
    const pointToSlice = vec3.sub(vec3.create(), pointVec, slicePosition);
    const distance = Math.abs(vec3.dot(pointToSlice, sliceNormal));

    if (distance <= halfThickness) {
      return true; // Point intersects slice
    }
  }

  return false;
}

const SHORT_HAND_MAP = {
  'Short Axis': 'W: ',
  'Long Axis': 'L: ',
  AREA: 'Area: ',
  Length: '',
  CORNERSTONEFREETEXT: '',
};

function _labelToShorthand(label) {
  const shortHand = SHORT_HAND_MAP[label];

  if (shortHand !== undefined) {
    return shortHand;
  }

  return label;
}
