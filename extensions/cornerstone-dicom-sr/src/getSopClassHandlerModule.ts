import { utils, classes, DisplaySetService, Types as OhifTypes } from '@ohif/core';
import i18n from '@ohif/i18n';
import { Enums as CSExtensionEnums } from '@ohif/extension-cornerstone';
import { adaptersSR } from '@cornerstonejs/adapters';

import addSRAnnotation from './utils/addSRAnnotation';
import isRehydratable from './utils/isRehydratable';
import {
  SOPClassHandlerName,
  SOPClassHandlerId,
  SOPClassHandlerId3D,
  SOPClassHandlerName3D,
} from './id';
import { CodeNameCodeSequenceValues, CodingSchemeDesignators } from './enums';

const { sopClassDictionary } = utils;
const { CORNERSTONE_3D_TOOLS_SOURCE_NAME, CORNERSTONE_3D_TOOLS_SOURCE_VERSION } = CSExtensionEnums;
const { MetadataProvider: metadataProvider } = classes;
const {
  TEXT_ANNOTATION_POSITION,
  COMMENT_CODE,
  CodeScheme: Cornerstone3DCodeScheme,
} = adaptersSR.Cornerstone3D;

// MODULE LOADED - This should appear in console when the module is loaded
// console.log('[SR MODULE] ########## getSopClassHandlerModule.ts LOADED ##########');

type InstanceMetadata = OhifTypes.InstanceMetadata;

// ⚡ PERFORMANCE: Cache processed SR measurements to avoid re-processing during layout changes
const _srMeasurementCache = new Map<string, any>();

/**
 * TODO
 * - [ ] Add SR thumbnail
 * - [ ] Make viewport
 * - [ ] Get stacks from referenced displayInstanceUID and load into wrapped CornerStone viewport
 */

const sopClassUids = [
  sopClassDictionary.BasicTextSR,
  sopClassDictionary.EnhancedSR,
  sopClassDictionary.ComprehensiveSR,
  sopClassDictionary.Comprehensive3DSR,
];

const validateSameStudyUID = (uid: string, instances): void => {
  instances.forEach(it => {
    if (it.StudyInstanceUID !== uid) {
      console.warn('Not all instances have the same UID', uid, it);
      throw new Error(`Instances ${it.SOPInstanceUID} does not belong to ${uid}`);
    }
  });
};

/**
 * Adds instances to the DICOM SR series, rather than creating a new
 * series, so that as SR's are saved, they append to the series, and the
 * key image display set gets updated as well, containing just the new series.
 * @param instances is a list of instances from THIS series that are not
 *     in this DICOM SR Display Set already.
 */
function addInstances(instances: InstanceMetadata[], _displaySetService: DisplaySetService) {
  this.instances.push(...instances);
  utils.sortStudyInstances(this.instances);
  // The last instance is the newest one, so is the one most interesting.
  // Eventually, the SR viewer should have the ability to choose which SR
  // gets loaded, and to navigate among them.
  this.instance = this.instances[this.instances.length - 1];
  this.isLoaded = false;
  return this;
}

/**
 * DICOM SR SOP Class Handler
 * For all referenced images in the TID 1500/300 sections, add an image to the
 * display.
 * @param {InstanceMetadata[]} instances - A set of instances all from the same series
 * @param {AppTypes.ServicesManager} servicesManager - The services that can be used for creating
 * @param {AppTypes.ExtensionManager} extensionManager - The extension manager
 * @returns {Types.DisplaySet[]} The list of display sets created for the given instances object
 */
function _getDisplaySetsFromSeries(
  instances,
  servicesManager: AppTypes.ServicesManager,
  extensionManager
) {
  // console.log('[SR _getDisplaySetsFromSeries] ===== CALLED WITH', instances?.length, 'INSTANCES =====');
  // If the series has no instances, stop here
  if (!instances || !instances.length) {
    throw new Error('No instances were provided');
  }

  utils.sortStudyInstances(instances);
  // The last instance is the newest one, so is the one most interesting.
  // Eventually, the SR viewer should have the ability to choose which SR
  // gets loaded, and to navigate among them.
  const instance = instances[instances.length - 1];
  // console.log('[SR _getDisplaySetsFromSeries] Latest instance SOPClassUID:', instance.SOPClassUID);

  const {
    StudyInstanceUID,
    SeriesInstanceUID,
    SOPInstanceUID,
    SeriesDescription,
    SeriesNumber,
    SeriesDate,
    SeriesTime,
    ConceptNameCodeSequence,
    SOPClassUID,
    imageId: predecessorImageId,
  } = instance;
  validateSameStudyUID(instance.StudyInstanceUID, instances);

  const is3DSR = SOPClassUID === sopClassDictionary.Comprehensive3DSR;

  const isImagingMeasurementReport =
    ConceptNameCodeSequence?.CodeValue === CodeNameCodeSequenceValues.ImagingMeasurementReport;

  const displaySet = {
    Modality: 'SR',
    displaySetInstanceUID: utils.guid(),
    SeriesDescription,
    SeriesNumber,
    SeriesDate,
    SeriesTime,
    SOPInstanceUID,
    SeriesInstanceUID,
    StudyInstanceUID,
    SOPClassHandlerId: is3DSR ? SOPClassHandlerId3D : SOPClassHandlerId,
    SOPClassUID,
    laterality: instance.ImageLaterality || instance.Laterality || null,
    instances,
    referencedImages: null,
    measurements: null,
    isDerivedDisplaySet: true,
    isLoaded: false,
    isImagingMeasurementReport,
    sopClassUids,
    instance,
    predecessorImageId,
    addInstances,
    label: SeriesDescription || `${i18n.t('Series')} ${SeriesNumber} - ${i18n.t('SR')}`,
  };

  displaySet.load = () => _load(displaySet, servicesManager, extensionManager);

  return [displaySet];
}

/**
 * Loads the display set with the given services and extension manager.
 * @param srDisplaySet - The display set to load.
 * @param servicesManager - The services manager containing displaySetService and measurementService.
 * @param extensionManager - The extension manager containing data sources.
 */
async function _load(
  srDisplaySet: OhifTypes.DisplaySet,
  servicesManager: AppTypes.ServicesManager,
  extensionManager: AppTypes.ExtensionManager
) {
  // console.log('[SR _load] ========== SR LOADING STARTED ==========');
  // console.log('[SR _load] Display Set:', srDisplaySet);
  const { displaySetService, measurementService } = servicesManager.services;
  const dataSources = extensionManager.getDataSources();
  const dataSource = dataSources[0];
  const { ContentSequence } = srDisplaySet.instance;
  // console.log('[SR _load] ContentSequence:', ContentSequence);

  async function retrieveBulkData(obj, parentObj = null, key = null) {
    for (const prop in obj) {
      if (typeof obj[prop] === 'object' && obj[prop] !== null) {
        await retrieveBulkData(obj[prop], obj, prop);
      } else if (Array.isArray(obj[prop])) {
        await Promise.all(obj[prop].map(item => retrieveBulkData(item, obj, prop)));
      } else if (prop === 'BulkDataURI') {
        const value = await dataSource.retrieve.bulkDataURI({
          BulkDataURI: obj[prop],
          StudyInstanceUID: srDisplaySet.instance.StudyInstanceUID,
          SeriesInstanceUID: srDisplaySet.instance.SeriesInstanceUID,
          SOPInstanceUID: srDisplaySet.instance.SOPInstanceUID,
        });
        if (parentObj && key) {
          parentObj[key] = new Float32Array(value);
        }
      }
    }
  }

  if (srDisplaySet.isLoaded !== true) {
    await retrieveBulkData(ContentSequence);
  }

  // console.log('[SR _load] isImagingMeasurementReport:', srDisplaySet.isImagingMeasurementReport);
  // console.log('[SR _load] ContentSequence length:', ContentSequence?.length);
  if (srDisplaySet.isImagingMeasurementReport) {
    srDisplaySet.referencedImages = _getReferencedImagesList(ContentSequence);
    srDisplaySet.measurements = _getMeasurements(ContentSequence);
    // console.log('[SR _load] Extracted', srDisplaySet.measurements?.length, 'measurements');
  } else {
    // console.log('[SR _load] Not an imaging measurement report, skipping measurement extraction');
    srDisplaySet.referencedImages = [];
    srDisplaySet.measurements = [];
  }
  const { predecessorImageId } = srDisplaySet;
  for (const measurement of srDisplaySet.measurements) {
    measurement.predecessorImageId = predecessorImageId;
  }

  const mappings = measurementService.getSourceMappings(
    CORNERSTONE_3D_TOOLS_SOURCE_NAME,
    CORNERSTONE_3D_TOOLS_SOURCE_VERSION
  );

  srDisplaySet.isHydrated = false;
  srDisplaySet.isRehydratable = isRehydratable(srDisplaySet, mappings);
  srDisplaySet.isLoaded = true;

  // console.log('🔵 [SR HANDLER] SR displaySet loaded:', srDisplaySet.displaySetInstanceUID);
  // console.log('   Measurements count:', srDisplaySet.measurements?.length || 0);
  // console.log('   Active displaySets count:', displaySetService.activeDisplaySets.length);

  /** Check currently added displaySets and add measurements if the sources exist */
  displaySetService.activeDisplaySets.forEach(activeDisplaySet => {
    // Skip the SR displaySet itself - measurements belong on image displaySets, not SR
    if (activeDisplaySet.displaySetInstanceUID === srDisplaySet.displaySetInstanceUID) {
      // console.log('🔵 [SR HANDLER] Skipping SR displaySet itself:', activeDisplaySet.displaySetInstanceUID);
      return;
    }

    // console.log('🔵 [SR HANDLER] Checking existing displaySet:', activeDisplaySet.displaySetInstanceUID);
    _checkIfCanAddMeasurementsToDisplaySet(
      srDisplaySet,
      activeDisplaySet,
      dataSource,
      servicesManager
    );
  });

  /** Subscribe to new displaySets as the source may come in after */
  displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_ADDED, data => {
    const { displaySetsAdded } = data;
    // console.log('🔵 [SR HANDLER] DISPLAY_SETS_ADDED event - count:', displaySetsAdded.length);
    /**
     * If there are still some measurements that have not yet been loaded into cornerstone,
     * See if we can load them onto any of the new displaySets.
     */
    displaySetsAdded.forEach(newDisplaySet => {
      // Skip SR displaySets - we only want to add measurements to image displaySets
      if (newDisplaySet.Modality === 'SR' || newDisplaySet.SOPClassHandlerId?.includes('SR')) {
        // console.log('🔵 [SR HANDLER] Skipping SR displaySet:', newDisplaySet.displaySetInstanceUID);
        return;
      }

      // console.log('🔵 [SR HANDLER] Checking new displaySet:', newDisplaySet.displaySetInstanceUID);
      _checkIfCanAddMeasurementsToDisplaySet(
        srDisplaySet,
        newDisplaySet,
        dataSource,
        servicesManager
      );
    });
  });
}

function _measurementBelongsToDisplaySet({ measurement, displaySet }) {
  // ReferencedFrameOfReferenceSequence can be:
  // 1. A string (FrameOfReferenceUID directly)
  // 2. A DICOM sequence object with .FrameOfReferenceUID property
  const refSequence = measurement.coords[0].ReferencedFrameOfReferenceSequence;
  const measurementFrameOfRef = typeof refSequence === 'string'
    ? refSequence
    : refSequence?.FrameOfReferenceUID;

  const displaySetFrameOfRef = displaySet.FrameOfReferenceUID;

  // console.log('🔍 [SR] Checking if measurement belongs to displaySet:');
  // console.log('   Measurement FrameOfReferenceUID:', measurementFrameOfRef);
  // console.log('   DisplaySet FrameOfReferenceUID:', displaySetFrameOfRef);

  // If both have FrameOfReferenceUID, match by that
  if (measurementFrameOfRef && displaySetFrameOfRef) {
    const match = measurementFrameOfRef === displaySetFrameOfRef;
    // console.log('   Match by FrameOfReferenceUID:', match);
    return match;
  }

  // Fallback: If FrameOfReferenceUID is missing, match by StudyInstanceUID
  // This handles cases where FrameOfReferenceUID is not populated
  const measurementStudyUID = measurement.StudyInstanceUID;
  const displaySetStudyUID = displaySet.StudyInstanceUID;

  // console.log('   Fallback - Measurement StudyInstanceUID:', measurementStudyUID);
  // console.log('   Fallback - DisplaySet StudyInstanceUID:', displaySetStudyUID);

  if (measurementStudyUID && displaySetStudyUID) {
    const match = measurementStudyUID === displaySetStudyUID;
    // console.log('   Match by StudyInstanceUID:', match);
    return match;
  }

  // If we can't match by either, assume they belong together (same session)
  // console.log('   No matching criteria - assuming match (same session)');
  return true;
}

function _checkIfCanAddMeasurementsToDisplaySet(
  srDisplaySet: OhifTypes.DisplaySet,
  newDisplaySet: OhifTypes.DisplaySet,
  dataSource,
  servicesManager: AppTypes.ServicesManager
) {
  // console.log('🟢 [SR CHECK] _checkIfCanAddMeasurementsToDisplaySet called');
  // console.log('   SR displaySet:', srDisplaySet.displaySetInstanceUID);
  // console.log('   New displaySet:', newDisplaySet.displaySetInstanceUID, 'Modality:', newDisplaySet.Modality);

  const { customizationService } = servicesManager.services;

  const unloadedMeasurements = srDisplaySet.measurements.filter(
    measurement => measurement.loaded === false
  );

  // console.log('   Unloaded measurements:', unloadedMeasurements.length);
  // console.log('   New displaySet unsupported:', newDisplaySet.unsupported);

  if (!unloadedMeasurements.length || newDisplaySet.unsupported) {
    // console.log('   ⏭️ Skipping - no unloaded measurements or displaySet unsupported');
    return;
  }

  // Create a Map to efficiently look up ImageIds by SOPInstanceUID and frame number
  const imageIdMap = new Map<string, string>();
  const imageIds = dataSource.getImageIdsForDisplaySet(newDisplaySet);

  for (const imageId of imageIds) {
    const { SOPInstanceUID, frameNumber } = metadataProvider.getUIDsFromImageID(imageId);
    const key = `${SOPInstanceUID}:${frameNumber || 1}`;
    imageIdMap.set(key, imageId);
  }

  if (!unloadedMeasurements?.length) {
    return;
  }

  const is3DSR = srDisplaySet.SOPClassUID === sopClassDictionary.Comprehensive3DSR;
  // console.log('   is3DSR:', is3DSR, 'SOPClassUID:', srDisplaySet.SOPClassUID);

  for (let j = unloadedMeasurements.length - 1; j >= 0; j--) {
    let measurement = unloadedMeasurements[j];
    const is3DMeasurement = measurement.coords?.[0]?.ValueType === 'SCOORD3D';
    // console.log(`   🔸 Measurement ${j}: is3D=${is3DMeasurement}, ValueType=${measurement.coords?.[0]?.ValueType}`);

    const onBeforeSRAddMeasurement = customizationService.getCustomization(
      'onBeforeSRAddMeasurement'
    );

    if (typeof onBeforeSRAddMeasurement === 'function') {
      measurement = onBeforeSRAddMeasurement({
        measurement,
        StudyInstanceUID: srDisplaySet.StudyInstanceUID,
        SeriesInstanceUID: srDisplaySet.SeriesInstanceUID,
      });
    }

    // if it is 3d SR, group coords by SOP instance and add annotations
    if (
      is3DSR &&
      is3DMeasurement &&
      _measurementBelongsToDisplaySet({ measurement, displaySet: newDisplaySet })
    ) {
      // console.log('✅ [SR] Processing 3D SR annotation for displaySet:', newDisplaySet.displaySetInstanceUID);
      // console.log('   Measurement has', measurement.coords?.length, 'coords');

      // Group coords by ReferencedSOPInstanceUID
      const coordsBySOPInstance3D = new Map<string, any[]>();

      for (const coord of measurement.coords || []) {
        const refSOPSeq = coord.ReferencedSOPSequence;
        if (!refSOPSeq) {
          continue;
        }

        const sopUID = refSOPSeq.ReferencedSOPInstanceUID;
        const frame = refSOPSeq.ReferencedFrameNumber || 1;
        const key = `${sopUID}:${frame}`;

        if (!coordsBySOPInstance3D.has(key)) {
          coordsBySOPInstance3D.set(key, []);
        }
        coordsBySOPInstance3D.get(key).push(coord);
      }

      // console.log(`   📊 [SR] Grouped 3D coords into ${coordsBySOPInstance3D.size} SOP instances`);

      // If only one SOP instance, use original behavior
      if (coordsBySOPInstance3D.size <= 1) {
        // console.log('   Single SOP instance - using original behavior');
        addSRAnnotation({ measurement, displaySet: newDisplaySet });
        measurement.loaded = true;
        measurement.displaySetInstanceUID = newDisplaySet.displaySetInstanceUID;
        measurement.referenceSeriesUID = newDisplaySet.SeriesInstanceUID;
        unloadedMeasurements.splice(j, 1);
        // console.log('✅ [SR] 3D Measurement added successfully');
      } else {
        // Multiple SOP instances - create separate annotations for each
        coordsBySOPInstance3D.forEach((coords, key) => {
          const measurementForSlice = {
            ...measurement,
            coords: coords
          };

          const [sopUID] = key.split(':');
          // console.log(`   🎯 [SR] Adding 3D annotation for SOP ${sopUID.substring(0, 20)}...`);

          addSRAnnotation({
            measurement: measurementForSlice,
            displaySet: newDisplaySet
          });
        });

        measurement.loaded = true;
        measurement.displaySetInstanceUID = newDisplaySet.displaySetInstanceUID;
        measurement.referenceSeriesUID = newDisplaySet.SeriesInstanceUID;
        unloadedMeasurements.splice(j, 1);
        // console.log('✅ [SR] All 3D coords added successfully');
      }

      continue;
    }

    // Group coords by ReferencedSOPInstanceUID to handle measurements spanning multiple slices
    const coordsBySOPInstance = new Map<string, any[]>();

    for (const coord of measurement.coords) {
      const refSOPSeq = coord.ReferencedSOPSequence;
      if (!refSOPSeq) {
        continue;
      }

      const sopUID = refSOPSeq.ReferencedSOPInstanceUID;
      const frame = refSOPSeq.ReferencedFrameNumber || 1;
      const key = `${sopUID}:${frame}`;

      if (!coordsBySOPInstance.has(key)) {
        coordsBySOPInstance.set(key, []);
      }
      coordsBySOPInstance.get(key).push(coord);
    }

    // If no valid coords with ReferencedSOPSequence, skip this measurement
    if (coordsBySOPInstance.size === 0) {
      continue;
    }

    // console.log(`   📊 [SR] Grouped coords into ${coordsBySOPInstance.size} SOP instances`);

    // Create separate annotations for each SOP instance
    let allCoordsLoaded = true;
    coordsBySOPInstance.forEach((coords, key) => {
      const imageId = imageIdMap.get(key);

      if (!imageId) {
        console.warn(`   ⚠️ [SR] No imageId found for key: ${key}`);
        console.warn(`   ⚠️ [SR] Available keys in imageIdMap:`, Array.from(imageIdMap.keys()).slice(0, 5));
        allCoordsLoaded = false;
        return;
      }

      if (imageId) {
        // Create a measurement copy with only the coords for this specific slice
        const measurementForSlice = {
          ...measurement,
          coords: coords
        };

        const [sopUID, frameStr] = key.split(':');
        const frame = parseInt(frameStr, 10);

        // console.log(`   🎯 [SR] Adding annotation for SOP ${sopUID.substring(0, 20)}... frame ${frame}`);
        // console.log(`   🆔 [SR] ImageId: ${imageId}`);
        // console.log(`   📐 [SR] Coords count: ${coords.length}, ValueType: ${coords[0]?.ValueType}`);

        const success = addSRAnnotation({
          measurement: measurementForSlice,
          imageId,
          frameNumber: frame,
          displaySet: newDisplaySet
        });

        // Only mark as loaded if addSRAnnotation succeeded (returned non-null)
        if (success !== null) {
          // Store metadata on the first coord group processed
          if (allCoordsLoaded) {
            measurement.loaded = true;
            measurement.imageId = imageId;
            measurement.displaySetInstanceUID = newDisplaySet.displaySetInstanceUID;
            measurement.referenceSeriesUID = newDisplaySet.SeriesInstanceUID;
            measurement.ReferencedSOPInstanceUID = sopUID;
            measurement.frameNumber = frame;
          }
          // console.log(`   ✅ [SR] Annotation added successfully for frame ${frame}`);
        } else {
          allCoordsLoaded = false;
          console.warn(`   ⚠️ [SR] Annotation failed to load for frame ${frame} (metadata not ready) - will retry later`);
        }
      } else {
        allCoordsLoaded = false;
        console.warn(`   ⚠️ [SR] No imageId found for ${key}`);
      }
    });

    // Only remove from unloaded list if all coords were successfully loaded
    if (allCoordsLoaded) {
      unloadedMeasurements.splice(j, 1);
      // console.log(`   ✅ [SR] All coords loaded successfully - measurement complete`);
    }
  }
}

/**
 * Checks if a measurement references a specific SOP Instance UID.
 * @param {any} measurement - The measurement object.
 * @param {string} sopInstanceUID - The SOP Instance UID to check against.
 * @param {number} frameNumber - The frame number to check against (optional).
 * @returns {boolean} True if the measurement references the specified SOP Instance UID, false otherwise.
 */
function _measurementReferencesSOPInstanceUID(measurement, SOPInstanceUID, frameNumber) {
  const { coords } = measurement;

  /**
   * NOTE: The ReferencedFrameNumber can be multiple values according to the DICOM
   * Standard. But for now, we will support only one ReferenceFrameNumber.
   */
  const ReferencedFrameNumber =
    (measurement.coords[0].ReferencedSOPSequence &&
      measurement.coords[0].ReferencedSOPSequence?.ReferencedFrameNumber) ||
    1;

  if (frameNumber && Number(frameNumber) !== Number(ReferencedFrameNumber)) {
    return false;
  }

  for (let j = 0; j < coords.length; j++) {
    const coord = coords[j];
    const { ReferencedSOPInstanceUID } = coord.ReferencedSOPSequence;
    if (ReferencedSOPInstanceUID === SOPInstanceUID) {
      return true;
    }
  }

  return false;
}

/**
 * Retrieves the SOP class handler module.
 *
 * @param {OhifTypes.Extensions.ExtensionParams} params - The extension parameters.
 * @returns {Array} An array containing the SOP class handler modules.
 */
function getSopClassHandlerModule(params: OhifTypes.Extensions.ExtensionParams) {
  const { servicesManager, extensionManager } = params;
  const getDisplaySetsFromSeries = instances => {
    return _getDisplaySetsFromSeries(instances, servicesManager, extensionManager);
  };
  return [
    {
      name: SOPClassHandlerName,
      sopClassUids,
      getDisplaySetsFromSeries,
    },
    {
      name: SOPClassHandlerName3D,
      sopClassUids: [sopClassDictionary.Comprehensive3DSR],
      getDisplaySetsFromSeries,
    },
  ];
}

/**
 * Retrieves the measurements from the ImagingMeasurementReportContentSequence.
 *
 * @param {any[]} imagingMeasurementReportContentSequence - The ImagingMeasurementReportContentSequence array.
 * @returns {any[]} The array of measurements.
 */
function _getMeasurements(ImagingMeasurementReportContentSequence) {
  // console.log('[SR _getMeasurements] Called with sequence length:', ImagingMeasurementReportContentSequence?.length);
  const ImagingMeasurements = ImagingMeasurementReportContentSequence.find(
    item =>
      item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.ImagingMeasurements
  );

  if (!ImagingMeasurements) {
    // console.log('[SR _getMeasurements] ImagingMeasurements not found!');
    return [];
  }
  // console.log('[SR _getMeasurements] Found ImagingMeasurements container');

  const MeasurementGroups = _getSequenceAsArray(ImagingMeasurements.ContentSequence).filter(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.MeasurementGroup
  );
  // console.log('[SR _getMeasurements] Found', MeasurementGroups.length, 'measurement groups');

  const mergedContentSequencesByTrackingUniqueIdentifiers =
    _getMergedContentSequencesByTrackingUniqueIdentifiers(MeasurementGroups);
  const measurements = [];
  // console.log('[SR _getMeasurements] Processing', Object.keys(mergedContentSequencesByTrackingUniqueIdentifiers).length, 'unique measurements');

  Object.keys(mergedContentSequencesByTrackingUniqueIdentifiers).forEach(
    trackingUniqueIdentifier => {
      const mergedContentSequence =
        mergedContentSequencesByTrackingUniqueIdentifiers[trackingUniqueIdentifier];
      // console.log('[SR _getMeasurements] Calling _processMeasurement for tracking ID:', trackingUniqueIdentifier);

      const measurement = _processMeasurement(mergedContentSequence);
      if (measurement) {
        measurements.push(measurement);
      }
    }
  );

  return measurements;
}

/**
 * Retrieves merged content sequences by tracking unique identifiers.
 *
 * @param {any[]} measurementGroups - The measurement groups.
 * @returns {Object} The merged content sequences by tracking unique identifiers.
 */
function _getMergedContentSequencesByTrackingUniqueIdentifiers(MeasurementGroups) {
  const mergedContentSequencesByTrackingUniqueIdentifiers = {};

  MeasurementGroups.forEach(MeasurementGroup => {
    const ContentSequence = _getSequenceAsArray(MeasurementGroup.ContentSequence);

    const TrackingUniqueIdentifierItem = ContentSequence.find(
      item =>
        item.ConceptNameCodeSequence.CodeValue ===
        CodeNameCodeSequenceValues.TrackingUniqueIdentifier
    );
    if (!TrackingUniqueIdentifierItem) {
      console.warn('No Tracking Unique Identifier, skipping ambiguous measurement.');
    }

    const trackingUniqueIdentifier = TrackingUniqueIdentifierItem.UID;

    if (mergedContentSequencesByTrackingUniqueIdentifiers[trackingUniqueIdentifier] === undefined) {
      // Add the full ContentSequence
      mergedContentSequencesByTrackingUniqueIdentifiers[trackingUniqueIdentifier] = [
        ...ContentSequence,
      ];
    } else {
      // Add the ContentSequence minus the tracking identifier, as we have this
      // Information in the merged ContentSequence anyway.
      ContentSequence.forEach(item => {
        if (
          item.ConceptNameCodeSequence.CodeValue !==
          CodeNameCodeSequenceValues.TrackingUniqueIdentifier
        ) {
          mergedContentSequencesByTrackingUniqueIdentifiers[trackingUniqueIdentifier].push(item);
        }
      });
    }
  });

  return mergedContentSequencesByTrackingUniqueIdentifiers;
}

/**
 * Processes the measurement based on the merged content sequence.
 * If the merged content sequence contains SCOORD or SCOORD3D value types,
 * it calls the _processTID1410Measurement function.
 * Otherwise, it calls the _processNonGeometricallyDefinedMeasurement function.
 *
 * @param {any[]} mergedContentSequence - The merged content sequence to process.
 * @returns {any} The processed measurement result.
 */
function _processMeasurement(mergedContentSequence) {
  // ⚡ PERFORMANCE: Check cache first to avoid re-processing during layout changes
  // Use TrackingUniqueIdentifier as unique key for each measurement
  const trackingId = mergedContentSequence[0]?.TrackingUniqueIdentifier;

  if (trackingId && _srMeasurementCache.has(trackingId)) {
    return _srMeasurementCache.get(trackingId);
  }

  const hasScoordAtTopLevel = mergedContentSequence.some(group => isScoordOr3d(group) && !isTextPosition(group));
  // console.log('[SR] Processing measurement - hasScoordAtTopLevel:', hasScoordAtTopLevel);

  let result;
  if (hasScoordAtTopLevel) {
    // console.log('[SR] Using TID1410 path');
    result = _processTID1410Measurement(mergedContentSequence);
  } else {
    // console.log('[SR] Using NonGeometricallyDefined path');
    result = _processNonGeometricallyDefinedMeasurement(mergedContentSequence);
  }

  // Cache the result
  if (trackingId) {
    _srMeasurementCache.set(trackingId, result);
  }
  return result;
}

/**
 * Processes TID 1410 style measurements from the mergedContentSequence.
 * TID 1410 style measurements have a SCOORD or SCOORD3D at the top level,
 * and non-geometric representations where each NUM has "INFERRED FROM" SCOORD/SCOORD3D.
 *
 * @param {any[]} mergedContentSequence - The merged content sequence containing the measurements.
 * @returns {any} The measurement object containing the loaded status, labels, coordinates, tracking unique identifier, and tracking identifier.
 */
function _processTID1410Measurement(mergedContentSequence) {
  // Need to deal with TID 1410 style measurements, which will have a SCOORD or SCOORD3D at the top level,
  // And non-geometric representations where each NUM has "INFERRED FROM" SCOORD/SCOORD3D

  const graphicItem = mergedContentSequence.find(
    group => group.ValueType === 'SCOORD' || group.ValueType === 'SCOORD3D'
  );

  const UIDREFContentItem = mergedContentSequence.find(group => group.ValueType === 'UIDREF');

  const TrackingIdentifierContentItem = mergedContentSequence.find(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.TrackingIdentifier
  );

  if (!graphicItem) {
    console.warn(
      `graphic ValueType ${graphicItem.ValueType} not currently supported, skipping annotation.`
    );
    return;
  }

  const NUMContentItems = mergedContentSequence.filter(group => group.ValueType === 'NUM');
  // console.log(`[SR] Found ${NUMContentItems.length} NUM items in measurement`);

  const { ConceptNameCodeSequence: conceptNameItem } = graphicItem;
  const { CodeValue: graphicValue, CodingSchemeDesignator: graphicDesignator } = conceptNameItem;
  const graphicCode = `${graphicDesignator}:${graphicValue}`;

  const pointDataItem = _getCoordsFromSCOORDOrSCOORD3D(graphicItem);
  const is3DMeasurement = pointDataItem.ValueType === 'SCOORD3D';
  const pointLength = is3DMeasurement ? 3 : 2;
  const pointsLength = pointDataItem.GraphicData.length / pointLength;

  // Extract displayText from first NUM item's CodeMeaning (contains the human-readable label)
  const firstNum = NUMContentItems[0];
  const displayTextFromNum = firstNum?.ConceptNameCodeSequence?.[0]?.CodeMeaning || TrackingIdentifierContentItem.TextValue;
  // console.log('[SR Debug TID1410] displayTextFromNum:', displayTextFromNum);

  const measurement = {
    loaded: false,
    labels: [],
    coords: [pointDataItem],
    TrackingUniqueIdentifier: UIDREFContentItem.UID,
    TrackingIdentifier: TrackingIdentifierContentItem.TextValue,
    displayText: displayTextFromNum, // Use CodeMeaning from NUM item for human-readable label
    graphicCode,
    is3DMeasurement,
    pointsLength,
    graphicType: pointDataItem.GraphicType,
  };

  NUMContentItems.forEach(item => {
    const { ConceptNameCodeSequence, MeasuredValueSequence } = item;
    if (MeasuredValueSequence) {
      measurement.labels.push(
        _getLabelFromMeasuredValueSequence(ConceptNameCodeSequence, MeasuredValueSequence)
      );
    }
  });

  // Extract clinical fields from AI codes (AI012-AI017)
  const clinicalFields = {
    'AI012': 'malignancy_avg',  // Average malignancy percentage
    'AI013': 'malignancy_max',  // Maximum malignancy percentage
    'AI014': 'echo_pattern',  // 0-4: anechoic, hypoechoic, isoechoic, hyperechoic, complex echoic
    'AI015': 'shape',          // 0-2: round, oval, irregular
    'AI016': 'orientation',    // 0-1: parallel, non-parallel
    'AI017': 'margin',         // 0-4: circumscribed, indistinct, angulated, spiculated, microlobulated
  };

  // Extract measurement fields from AI codes (size dimensions)
  const measurementFields = {
    'AI019': 'size_x_mm',       // X dimension (width) in mm
    'AI020': 'size_y_mm',       // Y dimension (depth) in mm
    'AI021': 'size_z_mm',       // Z dimension (thickness) in mm
  };

  // Extract standard measurement codes (SCT scheme)
  const standardMeasurements = {
    '33001003': 'max_diameter_mm',    // Diameter
    '118565006': 'volume_mm3',        // Volume
    '410668003': 'surface_area_mm2',  // Surface area
  };

  // console.log(`[SR] Checking ${NUMContentItems.length} NUM items for AI codes...`);
  NUMContentItems.forEach(item => {
    const { ConceptNameCodeSequence, MeasuredValueSequence } = item;
    const codeValue = ConceptNameCodeSequence?.[0]?.CodeValue;
    const codingScheme = ConceptNameCodeSequence?.[0]?.CodingSchemeDesignator;
    // console.log(`[SR] NUM item: ${codingScheme}:${codeValue}`);

    if (codingScheme === 'LOCAL' && clinicalFields[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = clinicalFields[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR] Extracted clinical field: ${fieldName} = ${numericValue}`);
      }
    }

    // Extract measurement fields (size dimensions)
    if (codingScheme === 'LOCAL' && measurementFields[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = measurementFields[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR] Extracted measurement field: ${fieldName} = ${numericValue}`);
      }
    }

    // Extract standard measurements (SCT codes)
    if (codingScheme === 'SCT' && standardMeasurements[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = standardMeasurements[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR] Extracted standard measurement: ${fieldName} = ${numericValue}`);
      }
    }
  });

  const findingSites = mergedContentSequence.filter(
    item =>
      item.ConceptNameCodeSequence.CodingSchemeDesignator === CodingSchemeDesignators.SCT &&
      item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.FindingSiteSCT
  );
  if (findingSites.length) {
    measurement.labels.push({
      label: CodeNameCodeSequenceValues.FindingSiteSCT,
      value: findingSites[0].ConceptCodeSequence.CodeMeaning,
    });
  }

  return measurement;
}

/**
 * Processes the non-geometrically defined measurement from the merged content sequence.
 *
 * @param {any[]} mergedContentSequence The merged content sequence containing the measurement data.
 * @returns {any} The processed measurement object.
 */
function _processNonGeometricallyDefinedMeasurement(mergedContentSequence) {
  const NUMContentItems = mergedContentSequence.filter(group => group.ValueType === 'NUM');
  const UIDREFContentItem = mergedContentSequence.find(group => group.ValueType === 'UIDREF');

  const TrackingIdentifierContentItem = mergedContentSequence.find(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.TrackingIdentifier
  );

  const finding = mergedContentSequence.find(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.Finding
  );

  const findingSites = mergedContentSequence.filter(
    item =>
      item.ConceptNameCodeSequence.CodingSchemeDesignator === CodingSchemeDesignators.SRT &&
      item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.FindingSite
  );

  const commentSites = mergedContentSequence.filter(
    item =>
      item.ConceptNameCodeSequence.CodingSchemeDesignator === COMMENT_CODE.schemeDesignator &&
      item.ConceptNameCodeSequence.CodeValue === COMMENT_CODE.value
  );

  // Extract displayText from first NUM item's CodeMeaning (contains the human-readable label)
  const firstNumWithCoords = NUMContentItems.find(item => item.ContentSequence && item.ContentSequence.length > 0);
  const displayTextFromNum = firstNumWithCoords?.ConceptNameCodeSequence?.[0]?.CodeMeaning || TrackingIdentifierContentItem.TextValue;
  // console.log('[SR Debug] displayTextFromNum:', displayTextFromNum);

  const measurement = {
    loaded: false,
    labels: [],
    coords: [],
    TrackingUniqueIdentifier: UIDREFContentItem.UID,
    TrackingIdentifier: TrackingIdentifierContentItem.TextValue,
    displayText: displayTextFromNum, // Use CodeMeaning from NUM item for human-readable label
  };

  if (commentSites) {
    for (const group of commentSites) {
      if (group.TextValue) {
        measurement.labels.push({ label: group.TextValue, value: '' });
      }
    }
  }

  if (
    finding &&
    finding.ConceptCodeSequence &&
    CodingSchemeDesignators.CornerstoneCodeSchemes.includes(
      finding.ConceptCodeSequence.CodingSchemeDesignator
    ) &&
    finding.ConceptCodeSequence.CodeValue === Cornerstone3DCodeScheme.codeValues.CORNERSTONEFREETEXT
  ) {
    measurement.labels.push({
      label: Cornerstone3DCodeScheme.codeValues.CORNERSTONEFREETEXT,
      value: finding.ConceptCodeSequence.CodeMeaning,
    });
  }

  // TODO -> Eventually hopefully support SNOMED or some proper code library, just free text for now.
  if (findingSites.length) {
    const cornerstoneFreeTextFindingSite = findingSites.find(
      FindingSite =>
        CodingSchemeDesignators.CornerstoneCodeSchemes.includes(
          FindingSite.ConceptCodeSequence.CodingSchemeDesignator
        ) &&
        FindingSite.ConceptCodeSequence.CodeValue ===
          Cornerstone3DCodeScheme.codeValues.CORNERSTONEFREETEXT
    );

    if (cornerstoneFreeTextFindingSite) {
      measurement.labels.push({
        label: Cornerstone3DCodeScheme.codeValues.CORNERSTONEFREETEXT,
        value: cornerstoneFreeTextFindingSite.ConceptCodeSequence.CodeMeaning,
      });
    }
  }

  NUMContentItems.forEach(item => {
    const { ConceptNameCodeSequence, ContentSequence, MeasuredValueSequence } = item;

    // Skip NUM items without ContentSequence (e.g., metadata measurements without geometric data)
    if (!ContentSequence) {
      // Still add non-geometric measurements as labels if they have values
      if (MeasuredValueSequence) {
        measurement.labels.push(
          _getLabelFromMeasuredValueSequence(ConceptNameCodeSequence, MeasuredValueSequence)
        );
      }
      return;
    }

    // ContentSequence is an array - get first item (should be SCOORD or SCOORD3D)
    const graphicItem = ContentSequence[0];
    if (!graphicItem) {
      return;
    }

    const { ValueType } = graphicItem;
    if (ValueType !== 'SCOORD' && ValueType !== 'SCOORD3D') {
      console.warn(`Graphic ${ValueType} not currently supported, skipping annotation.`);
      return;
    }

    const coords = _getCoordsFromSCOORDOrSCOORD3D(graphicItem);
    if (coords) {
      measurement.coords.push(coords);
    }

    if (MeasuredValueSequence) {
      measurement.labels.push(
        _getLabelFromMeasuredValueSequence(ConceptNameCodeSequence, MeasuredValueSequence)
      );
    }
  });

  // Extract clinical fields from AI codes (AI012-AI017)
  const clinicalFields = {
    'AI012': 'malignancy_avg',  // Average malignancy percentage
    'AI013': 'malignancy_max',  // Maximum malignancy percentage
    'AI014': 'echo_pattern',  // 0-4: anechoic, hypoechoic, isoechoic, hyperechoic, complex echoic
    'AI015': 'shape',          // 0-2: round, oval, irregular
    'AI016': 'orientation',    // 0-1: parallel, non-parallel
    'AI017': 'margin',         // 0-4: circumscribed, indistinct, angulated, spiculated, microlobulated
  };

  // Extract measurement fields from AI codes (size dimensions)
  const measurementFields = {
    'AI019': 'size_x_mm',       // X dimension (width) in mm
    'AI020': 'size_y_mm',       // Y dimension (depth) in mm
    'AI021': 'size_z_mm',       // Z dimension (thickness) in mm
  };

  // Extract standard measurement codes (SCT scheme)
  const standardMeasurements = {
    '33001003': 'max_diameter_mm',    // Diameter
    '118565006': 'volume_mm3',        // Volume
    '410668003': 'surface_area_mm2',  // Surface area
  };

  // console.log(`[SR NonGeo] Checking ${NUMContentItems.length} NUM items for AI codes...`);
  NUMContentItems.forEach(item => {
    const { ConceptNameCodeSequence, MeasuredValueSequence } = item;
    const codeValue = ConceptNameCodeSequence?.[0]?.CodeValue;
    const codingScheme = ConceptNameCodeSequence?.[0]?.CodingSchemeDesignator;

    if (codingScheme === 'LOCAL' && clinicalFields[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = clinicalFields[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR NonGeo] Extracted clinical field: ${fieldName} = ${numericValue}`);
      }
    }

    // Extract measurement fields (size dimensions)
    if (codingScheme === 'LOCAL' && measurementFields[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = measurementFields[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR NonGeo] Extracted measurement field: ${fieldName} = ${numericValue}`);
      }
    }

    // Extract standard measurements (SCT codes)
    if (codingScheme === 'SCT' && standardMeasurements[codeValue] && MeasuredValueSequence) {
      const numericValue = MeasuredValueSequence[0]?.NumericValue;
      if (numericValue !== undefined) {
        const fieldName = standardMeasurements[codeValue];
        if (!measurement.clinical) {
          measurement.clinical = {};
        }
        measurement.clinical[fieldName] = numericValue;
        // console.log(`[SR NonGeo] Extracted standard measurement: ${fieldName} = ${numericValue}`);
      }
    }
  });

  return measurement;
}

/**
 * Extracts coordinates from a graphic item of type SCOORD or SCOORD3D.
 * @param {any} graphicItem - The graphic item containing the coordinates.
 * @returns {any} The extracted coordinates.
 */
const _getCoordsFromSCOORDOrSCOORD3D = graphicItem => {
  const { ValueType, GraphicType, GraphicData } = graphicItem;
  const coords = { ValueType, GraphicType, GraphicData };

  // For SCOORD (2D), ReferencedSOPSequence can be:
  // 1. A direct property (non-standard but simple)
  // 2. In ContentSequence as IMAGE item (DICOM-compliant, created by highdicom)
  // For SCOORD3D (3D), it's in ContentSequence
  coords.ReferencedSOPSequence =
    graphicItem.ReferencedSOPSequence ||
    graphicItem.ContentSequence?.ReferencedSOPSequence;

  // If not found directly, look for IMAGE item in ContentSequence (DICOM-compliant structure)
  if (!coords.ReferencedSOPSequence && graphicItem.ContentSequence) {
    const imageItem = Array.isArray(graphicItem.ContentSequence)
      ? graphicItem.ContentSequence.find(item => item.ValueType === 'IMAGE')
      : (graphicItem.ContentSequence.ValueType === 'IMAGE' ? graphicItem.ContentSequence : null);

    if (imageItem && imageItem.ReferencedSOPSequence) {
      coords.ReferencedSOPSequence = imageItem.ReferencedSOPSequence;
    }
  }

  coords.ReferencedFrameOfReferenceSequence =
    graphicItem.ReferencedFrameOfReferenceUID ||
    graphicItem.ContentSequence?.ReferencedFrameOfReferenceSequence;
  return coords;
};

/**
 * Retrieves the label and value from the provided ConceptNameCodeSequence and MeasuredValueSequence.
 * @param {any} conceptNameCodeSequence - The ConceptNameCodeSequence object.
 * @param {any} measuredValueSequence - The MeasuredValueSequence object.
 * @returns {Object} An object containing the label and value.
 *                    The label represents the CodeMeaning from the ConceptNameCodeSequence.
 *                    The value represents the formatted NumericValue and CodeValue from the MeasuredValueSequence.
 *                    Example: { label: 'Long Axis', value: '31.00 mm' }
 */
function _getLabelFromMeasuredValueSequence(ConceptNameCodeSequence, MeasuredValueSequence) {
  const { CodeMeaning } = ConceptNameCodeSequence;
  const { NumericValue, MeasurementUnitsCodeSequence } = MeasuredValueSequence;
  const { CodeValue } = MeasurementUnitsCodeSequence;
  const formatedNumericValue = NumericValue ? Number(NumericValue).toFixed(2) : '';
  return {
    label: CodeMeaning,
    value: `${formatedNumericValue} ${CodeValue}`,
  }; // E.g. Long Axis: 31.0 mm
}

/**
 * Retrieves a list of referenced images from the Imaging Measurement Report Content Sequence.
 *
 * @param {any[]} imagingMeasurementReportContentSequence - The Imaging Measurement Report Content Sequence.
 * @returns {any[]} The list of referenced images.
 */
function _getReferencedImagesList(ImagingMeasurementReportContentSequence) {
  const ImageLibrary = ImagingMeasurementReportContentSequence.find(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.ImageLibrary
  );

  if (!ImageLibrary) {
    return [];
  }

  const ImageLibraryGroup = _getSequenceAsArray(ImageLibrary.ContentSequence).find(
    item => item.ConceptNameCodeSequence.CodeValue === CodeNameCodeSequenceValues.ImageLibraryGroup
  );
  if (!ImageLibraryGroup) {
    return [];
  }

  const referencedImages = [];

  _getSequenceAsArray(ImageLibraryGroup.ContentSequence).forEach(item => {
    const { ReferencedSOPSequence } = item;
    if (!ReferencedSOPSequence) {
      return;
    }
    for (const ref of _getSequenceAsArray(ReferencedSOPSequence)) {
      if (ref.ReferencedSOPClassUID) {
        const { ReferencedSOPClassUID, ReferencedSOPInstanceUID } = ref;

        referencedImages.push({
          ReferencedSOPClassUID,
          ReferencedSOPInstanceUID,
        });
      }
    }
  });

  return referencedImages;
}

/**
 * Converts a DICOM sequence to an array.
 * If the sequence is null or undefined, an empty array is returned.
 * If the sequence is already an array, it is returned as is.
 * Otherwise, the sequence is wrapped in an array and returned.
 *
 * @param {any} sequence - The DICOM sequence to convert.
 * @returns {any[]} The converted array.
 */
function _getSequenceAsArray(sequence) {
  if (!sequence) {
    return [];
  }
  return Array.isArray(sequence) ? sequence : [sequence];
}

function isScoordOr3d(group) {
  return group.ValueType === 'SCOORD' || group.ValueType === 'SCOORD3D';
}

function isTextPosition(group) {
  const concept = group.ConceptNameCodeSequence[0];
  return (
    concept &&
    concept.CodeValue === TEXT_ANNOTATION_POSITION.value &&
    concept.CodingSchemeDesignator === TEXT_ANNOTATION_POSITION.schemeDesignator
  );
}

export default getSopClassHandlerModule;
