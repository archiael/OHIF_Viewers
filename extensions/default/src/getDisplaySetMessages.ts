import sortInstancesByPosition from '@ohif/core/src/utils/sortInstancesByPosition';
import { constructableModalities } from '@ohif/core/src/utils/isDisplaySetReconstructable';
import { DisplaySetMessage, DisplaySetMessageList } from '@ohif/core';
import checkMultiFrame from './utils/validations/checkMultiframe';
import checkSingleFrames from './utils/validations/checkSingleFrames';
/**
 * Checks if a series is reconstructable to a 3D volume.
 *
 * @param {Object[]} instances An array of `OHIFInstanceMetadata` objects.
 */
export default function getDisplaySetMessages(
  instances: Array<any>,
  isReconstructable: boolean,
  isDynamicVolume: boolean
): DisplaySetMessageList {
  const messages = new DisplaySetMessageList();

  if (isDynamicVolume) {
    return messages;
  }

  if (!instances.length) {
    messages.addMessage(DisplaySetMessage.CODES.NO_VALID_INSTANCES);
    return;
  }

  const firstInstance = instances[0];
  const { Modality, ImageType, NumberOfFrames } = firstInstance;
  // Due to current requirements, LOCALIZER series doesn't have any messages
  if (ImageType?.includes('LOCALIZER')) {
    return messages;
  }

  if (!constructableModalities.includes(Modality)) {
    return messages;
  }

  const isMultiframe = NumberOfFrames > 1;
  // Can't reconstruct if all instances don't have the ImagePositionPatient.
  if (!isMultiframe && !instances.every(instance => instance.ImagePositionPatient)) {
    messages.addMessage(DisplaySetMessage.CODES.NO_POSITION_INFORMATION);
  }

  const sortedInstances = sortInstancesByPosition(instances);

  isMultiframe
    ? checkMultiFrame(sortedInstances[0], messages)
    : checkSingleFrames(sortedInstances, messages);

  if (!isReconstructable) {
    // For US modality: Don't show NOT_RECONSTRUCTABLE warning if images have ImagePositionPatient
    // US images with proper position data are reconstructable in USMPR mode
    const isUSWithPosition = Modality === 'US' && instances.every(instance => instance.ImagePositionPatient);

    if (!isUSWithPosition) {
      messages.addMessage(DisplaySetMessage.CODES.NOT_RECONSTRUCTABLE);
    }
  }
  return messages;
}
