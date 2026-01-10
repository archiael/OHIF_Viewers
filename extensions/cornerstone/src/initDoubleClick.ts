import { eventTarget, EVENTS } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/tools';
import { CommandsManager, CustomizationService } from '@ohif/core';
import { findNearbyToolData } from './utils/findNearbyToolData';

const cs3DToolsEvents = Enums.Events;

/**
 * Generates a double click event name, consisting of:
 *    * alt when the alt key is down
 *    * ctrl when the cctrl key is down
 *    * shift when the shift key is down
 *    * 'doubleClick'
 */
function getDoubleClickEventName(evt: CustomEvent) {
  const nameArr = [];
  if (evt.detail.event.altKey) {
    nameArr.push('alt');
  }
  if (evt.detail.event.ctrlKey) {
    nameArr.push('ctrl');
  }
  if (evt.detail.event.shiftKey) {
    nameArr.push('shift');
  }
  nameArr.push('doubleClick');
  return nameArr.join('');
}

export type initDoubleClickArgs = {
  customizationService: CustomizationService;
  commandsManager: CommandsManager;
};

function initDoubleClick({ customizationService, commandsManager }: initDoubleClickArgs): void {
  const cornerstoneViewportHandleDoubleClick = (evt: CustomEvent) => {
    // PERFORMANCE FIX: Skip nearbyToolData check to prevent blocking with large SR datasets
    // The check was iterating through 1000+ annotations, causing 1.3s delay
    // SR annotations are display-only and should not block viewport double-click toggling
    // const nearbyToolData = findNearbyToolData(commandsManager, evt);
    // if (nearbyToolData) {
    //   return;
    // }

    const eventName = getDoubleClickEventName(evt);

    // Allows for the customization of the double click on a viewport.
    const customizations = customizationService.getCustomization(
      'cornerstoneViewportClickCommands'
    );

    const toRun = customizations[eventName];

    if (!toRun) {
      return;
    }

    // Get the viewport ID from the element that was double-clicked
    const element = evt.detail?.element || evt.currentTarget;
    if (element && element.dataset?.viewportId) {
      // Pass the viewport ID to the command so it knows which viewport was clicked
      commandsManager.run(toRun, { viewportId: element.dataset.viewportId });
    } else {
      commandsManager.run(toRun);
    }
  };

  function elementEnabledHandler(evt: CustomEvent) {
    const { element } = evt.detail;

    element.addEventListener(
      cs3DToolsEvents.MOUSE_DOUBLE_CLICK,
      cornerstoneViewportHandleDoubleClick
    );
  }

  function elementDisabledHandler(evt: CustomEvent) {
    const { element } = evt.detail;

    element.removeEventListener(
      cs3DToolsEvents.MOUSE_DOUBLE_CLICK,
      cornerstoneViewportHandleDoubleClick
    );
  }

  eventTarget.addEventListener(EVENTS.ELEMENT_ENABLED, elementEnabledHandler.bind(null));

  eventTarget.addEventListener(EVENTS.ELEMENT_DISABLED, elementDisabledHandler.bind(null));
}

export default initDoubleClick;
