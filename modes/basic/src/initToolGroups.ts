import { getOrientationString } from '../../../extensions/cornerstone/src/utils/getCornerstoneOrientation';

const colours = {
  'viewport-0': 'rgb(200, 0, 0)',
  'viewport-1': 'rgb(200, 200, 0)',
  'viewport-2': 'rgb(135, 206, 235)',
};

const colorsByOrientation = {
  axial: 'rgb(200, 0, 0)',
  sagittal: 'rgb(200, 200, 0)',
  coronal: 'rgb(135, 206, 235)',
};

// Get USMPR layout configuration from localStorage to map viewport IDs to orientations
function getUSMPRViewportOrientationMap() {
  console.log('🗺️ [getUSMPRViewportOrientationMap] Reading layout config from localStorage');

  try {
    const saved = localStorage.getItem('usmpr-layout-config');
    console.log('🗺️ [getUSMPRViewportOrientationMap] Saved config:', saved);

    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('🗺️ [getUSMPRViewportOrientationMap] Parsed config:', parsed);

      const positions = parsed.positions || parsed;
      console.log('🗺️ [getUSMPRViewportOrientationMap] Positions array:', positions);

      // Create mapping: mpr-0 -> axial, mpr-1 -> sagittal, etc.
      const map = {};
      positions.forEach((viewType, index) => {
        const viewportId = `mpr-${index}`;
        const orientation = viewType.toLowerCase(); // 'Axial' -> 'axial', etc.
        console.log(`🗺️ [getUSMPRViewportOrientationMap] Mapping ${viewportId} -> ${orientation}`);
        map[viewportId] = orientation;
      });

      console.log('🗺️ [getUSMPRViewportOrientationMap] Final map:', map);
      return map;
    }
  } catch (e) {
    console.error('🗺️ [getUSMPRViewportOrientationMap] Failed to parse USMPR layout config:', e);
  }

  // Default mapping
  const defaultMap = {
    'mpr-0': 'axial',
    'mpr-1': 'sagittal',
    'mpr-2': 'coronal',
    'mpr-3': '3d',
  };
  console.log('🗺️ [getUSMPRViewportOrientationMap] Using default map:', defaultMap);
  return defaultMap;
}

function initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, toolGroupId) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const SRUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone-dicom-sr.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;
  const { toolNames: SRToolNames } = SRUtilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }, { numTouchPoints: 2 }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }, { numTouchPoints: 3 }],
      },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              eventDetails,
            });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              data,
              eventDetails,
            });
          },
          // Disable automatic measurement calculation for ArrowAnnotate
          calculateStats: false,
        },
      },
      { toolName: SRToolNames.DICOMSRDisplay },
      {
        toolName: toolNames.SegmentBidirectional,
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      {
        toolName: toolNames.EllipticalROI,
        configuration: {
          // Disable automatic measurement calculation for EllipticalROI (annotation only)
          calculateStats: false,
        },
      },
      {
        toolName: toolNames.CircleROI,
        configuration: {
          // Disable automatic measurement calculation for CircleROI (annotation only)
          calculateStats: false,
        },
      },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.Magnify },
      { toolName: toolNames.CalibrationLine },
      {
        toolName: toolNames.PlanarFreehandContourSegmentation,
        configuration: {
          displayOnePointAsCrosshairs: true,
        },
      },
      { toolName: toolNames.UltrasoundDirectional },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.WindowLevelRegion },
    ],
    enabled: [{ toolName: toolNames.ImageOverlayViewer }, { toolName: toolNames.ReferenceLines }],
  };

  const updatedTools = commandsManager.run('initializeSegmentLabelTool', { tools });

  // Destroy existing toolgroup if it exists to prevent "already exists" error
  const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    console.log(`🗑️ Destroying existing toolgroup: ${toolGroupId}`);
    toolGroupService.destroyToolGroup(toolGroupId);
  }

  try {
    toolGroupService.createToolGroupAndAddTools(toolGroupId, updatedTools);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.warn(`⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`);
      try {
        toolGroupService.destroyToolGroup(toolGroupId);
      } catch (destroyError) {
        console.warn(`Failed to destroy tool group ${toolGroupId}:`, destroyError);
      }
      toolGroupService.createToolGroupAndAddTools(toolGroupId, updatedTools);
    } else {
      throw error;
    }
  }
}

function initSRToolGroup(extensionManager, toolGroupService) {
  const SRUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone-dicom-sr.utilityModule.tools'
  );

  if (!SRUtilityModule) {
    return;
  }

  const CS3DUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames: SRToolNames } = SRUtilityModule.exports;
  const { toolNames, Enums } = CS3DUtilityModule.exports;
  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Primary,
          },
        ],
      },
      {
        toolName: toolNames.Pan,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Auxiliary,
          },
        ],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Secondary,
          },
          { numTouchPoints: 2 },
        ],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }, { numTouchPoints: 3 }],
      },
    ],
    passive: [
      { toolName: SRToolNames.SRLength },
      { toolName: SRToolNames.SRArrowAnnotate },
      { toolName: SRToolNames.SRBidirectional },
      { toolName: SRToolNames.SREllipticalROI },
      { toolName: SRToolNames.SRCircleROI },
      { toolName: SRToolNames.SRPlanarFreehandROI },
      { toolName: SRToolNames.SRRectangleROI },
      { toolName: toolNames.WindowLevelRegion },
    ],
    enabled: [
      {
        toolName: SRToolNames.DICOMSRDisplay,
      },
    ],
    // disabled
  };

  const toolGroupId = 'SRToolGroup';

  // Destroy existing toolgroup if it exists
  const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    console.log(`🗑️ Destroying existing toolgroup: ${toolGroupId}`);
    toolGroupService.destroyToolGroup(toolGroupId);
  }

  try {
    toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.warn(`⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`);
      try {
        toolGroupService.destroyToolGroup(toolGroupId);
      } catch (destroyError) {
        console.warn(`Failed to destroy tool group ${toolGroupId}:`, destroyError);
      }
      toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
    } else {
      throw error;
    }
  }
}

function initMPRToolGroup(extensionManager, toolGroupService, commandsManager) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const SRUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone-dicom-sr.utilityModule.tools'
  );

  const serviceManager = extensionManager._servicesManager;
  const { cornerstoneViewportService } = serviceManager.services;

  const { toolNames, Enums } = utilityModule.exports;
  const { toolNames: SRToolNames } = SRUtilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }, { numTouchPoints: 2 }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }, { numTouchPoints: 3 }],
      },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              eventDetails,
            });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              data,
              eventDetails,
            });
          },
          // Disable automatic measurement calculation for ArrowAnnotate
          calculateStats: false,
        },
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      { toolName: toolNames.RectangleROI },
      {
        toolName: toolNames.EllipticalROI,
        configuration: {
          calculateStats: false,
        },
      },
      {
        toolName: toolNames.CircleROI,
        configuration: {
          calculateStats: false,
        },
      },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.WindowLevelRegion },
      {
        toolName: toolNames.PlanarFreehandContourSegmentation,
        configuration: {
          displayOnePointAsCrosshairs: true,
        },
      },
    ],
    enabled: [
      {
        toolName: SRToolNames.DICOMSRDisplay,
      },
    ],
    disabled: [
      {
        toolName: toolNames.Crosshairs,
        configuration: {
          viewportIndicators: true,
          viewportIndicatorsConfig: {
            circleRadius: 5,
            xOffset: 0.95,
            yOffset: 0.05,
          },
          disableOnPassive: true,
          autoPan: {
            enabled: false,
            panSize: 10,
          },
          getReferenceLineColor: viewportId => {
            // console.log('🎨 [getReferenceLineColor] Called for viewportId:', viewportId);

            const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
            const viewportOptions = viewportInfo?.viewportOptions;

            // console.log('🎨 [getReferenceLineColor] viewportInfo available:', !!viewportInfo);
            // console.log('🎨 [getReferenceLineColor] viewportOptions:', viewportOptions);

            if (viewportOptions) {
              // Convert orientation enum to string if needed
              const orientationKey = typeof viewportOptions.orientation === 'string'
                ? viewportOptions.orientation
                : getOrientationString(viewportOptions.orientation);

              // console.log('🎨 [getReferenceLineColor] orientationKey:', orientationKey);
              // console.log('🎨 [getReferenceLineColor] viewportOptions.id:', viewportOptions.id);
              // console.log('🎨 [getReferenceLineColor] colours[id]:', colours[viewportOptions.id]);
              // console.log('🎨 [getReferenceLineColor] colorsByOrientation[key]:', colorsByOrientation[orientationKey]);

              const color = colours[viewportOptions.id] ||
                colorsByOrientation[orientationKey] ||
                '#0c0';

              // console.log('🎨 [getReferenceLineColor] Returning color:', color);
              return color;
            } else {
              // console.log('🎨 [getReferenceLineColor] Using fallback - viewportInfo not available');

              // Viewport not found yet - try to determine color from viewport ID pattern
              // This handles the case where viewports are being initialized asynchronously

              // First check if it's a basic mode viewport ID
              if (colours[viewportId]) {
                // console.log('🎨 [getReferenceLineColor] Basic mode color found:', colours[viewportId]);
                return colours[viewportId];
              }

              // For USMPR viewports, get orientation from layout config
              if (viewportId.startsWith('mpr-')) {
                // console.log('🎨 [getReferenceLineColor] USMPR viewport detected, reading layout config');
                const usmprOrientationMap = getUSMPRViewportOrientationMap();
                // console.log('🎨 [getReferenceLineColor] USMPR orientation map:', usmprOrientationMap);

                const orientation = usmprOrientationMap[viewportId];
                // console.log('🎨 [getReferenceLineColor] Orientation for', viewportId, ':', orientation);
                // console.log('🎨 [getReferenceLineColor] colorsByOrientation[orientation]:', colorsByOrientation[orientation]);

                if (orientation && colorsByOrientation[orientation]) {
                  const color = colorsByOrientation[orientation];
                  // console.log('🎨 [getReferenceLineColor] Returning USMPR color:', color);
                  return color;
                }
              }

              // console.warn('🎨 [getReferenceLineColor] missing viewport?', viewportId);
              // console.log('🎨 [getReferenceLineColor] Returning default green #0c0');
              return '#0c0';
            }
          },
        },
      },
      {
        toolName: toolNames.AdvancedMagnify,
      },
      { toolName: toolNames.ReferenceLines },
    ],
  };

  const toolGroupId = 'mpr';

  // Destroy existing toolgroup if it exists
  const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    console.log(`🗑️ Destroying existing toolgroup: ${toolGroupId}`);
    toolGroupService.destroyToolGroup(toolGroupId);
  }

  try {
    toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.warn(`⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`);
      try {
        toolGroupService.destroyToolGroup(toolGroupId);
      } catch (destroyError) {
        console.warn(`Failed to destroy tool group ${toolGroupId}:`, destroyError);
      }
      toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
    } else {
      throw error;
    }
  }
}
function initVolume3DToolGroup(extensionManager, toolGroupService) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.TrackballRotateTool,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }, { numTouchPoints: 2 }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }, { numTouchPoints: 3 }],
      },
    ],
  };

  const toolGroupId = 'volume3d';

  // Destroy existing toolgroup if it exists
  const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    console.log(`🗑️ Destroying existing toolgroup: ${toolGroupId}`);
    toolGroupService.destroyToolGroup(toolGroupId);
  }

  try {
    toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.warn(`⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`);
      try {
        toolGroupService.destroyToolGroup(toolGroupId);
      } catch (destroyError) {
        console.warn(`Failed to destroy tool group ${toolGroupId}:`, destroyError);
      }
      toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
    } else {
      throw error;
    }
  }
}

function initMammographyToolGroup(extensionManager, toolGroupService, commandsManager) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }, { numTouchPoints: 2 }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }, { numTouchPoints: 3 }],
      },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              eventDetails,
            });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              data,
              eventDetails,
            });
          },
          // Disable automatic measurement calculation for ArrowAnnotate
          calculateStats: false,
        },
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      {
        toolName: toolNames.EllipticalROI,
        configuration: {
          calculateStats: false,
        },
      },
      {
        toolName: toolNames.CircleROI,
        configuration: {
          calculateStats: false,
        },
      },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.CalibrationLine },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.WindowLevelRegion },
    ],
    enabled: [{ toolName: toolNames.ImageOverlayViewer }, { toolName: toolNames.ReferenceLines }],
  };

  const updatedTools = commandsManager.run('initializeSegmentLabelTool', { tools });

  const toolGroupId = 'mammography';

  // Destroy existing toolgroup if it exists
  const existingToolGroup = toolGroupService.getToolGroup(toolGroupId);
  if (existingToolGroup) {
    console.log(`🗑️ Destroying existing toolgroup: ${toolGroupId}`);
    toolGroupService.destroyToolGroup(toolGroupId);
  }

  try {
    toolGroupService.createToolGroupAndAddTools(toolGroupId, updatedTools);
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.warn(`⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`);
      try {
        toolGroupService.destroyToolGroup(toolGroupId);
      } catch (destroyError) {
        console.warn(`Failed to destroy tool group ${toolGroupId}:`, destroyError);
      }
      toolGroupService.createToolGroupAndAddTools(toolGroupId, updatedTools);
    } else {
      throw error;
    }
  }
}

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, 'default');
  initSRToolGroup(extensionManager, toolGroupService);
  initMPRToolGroup(extensionManager, toolGroupService, commandsManager);
  initVolume3DToolGroup(extensionManager, toolGroupService);
  initMammographyToolGroup(extensionManager, toolGroupService, commandsManager);
}

export default initToolGroups;
