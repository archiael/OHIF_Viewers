/**
 * Mammography Mode Tool Groups Initialization
 *
 * Sets up tool groups for mammography workflow:
 * - mammography: Main tool group for breast imaging
 */

function initMammographyToolGroup(extensionManager, toolGroupService, commandsManager) {
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
          calculateStats: false,
        },
      },
      { toolName: SRToolNames.DICOMSRDisplay },
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
    enabled: [
      { toolName: toolNames.ImageOverlayViewer },
      { toolName: toolNames.ReferenceLines },
    ],
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
      console.warn(
        `⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`
      );
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
      console.warn(
        `⚠️ Tool group ${toolGroupId} already exists despite check. Force destroying and retrying...`
      );
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

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  initMammographyToolGroup(extensionManager, toolGroupService, commandsManager);
  initSRToolGroup(extensionManager, toolGroupService);
}

export default initToolGroups;
