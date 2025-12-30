import { metaData, utilities as csUtilities, cache } from '@cornerstonejs/core';

import OHIF, { DicomMetadataStore, utils } from '@ohif/core';
import dcmjs from 'dcmjs';
import { adaptersSR } from '@cornerstonejs/adapters';

import getFilteredCornerstoneToolState from './utils/getFilteredCornerstoneToolState';
import hydrateStructuredReport from './utils/hydrateStructuredReport';
import { createOriginalMetadataProvider } from './utils/createOriginalMetadataProvider';

const { downloadBlob } = utils;

const { MeasurementReport } = adaptersSR.Cornerstone3D;
const { log } = OHIF;

interface Options {
  SeriesDescription?: string;
  SeriesInstanceUID?: string;
  SeriesNumber?: number;
  InstanceNumber?: number;
  SeriesDate?: string;
  SeriesTime?: string;
}

/**
 * @param measurementData An array of measurements from the measurements service
 * that you wish to serialize.
 * @param additionalFindingTypes toolTypes that should be stored with labels as Findings
 * @param options Naturalized DICOM JSON headers to merge into the displaySet.
 *
 */
const _generateReport = (measurementData, additionalFindingTypes, options: Options = {}) => {
  const filteredToolState = getFilteredCornerstoneToolState(
    measurementData,
    additionalFindingTypes
  );

  // Create metadata provider that returns ORIGINAL metadata (not HTJ2K-adjusted)
  // for imagePlaneModule/imagePixelModule queries during SR generation.
  // This ensures SCOORD coordinates are calculated using original pixel spacing.
  // HTJ2K Level 2 decoding adjusts metadata (128×128, 4mm spacing) in customMetadata for rendering,
  // but SR must use original metadata (512×512, 1mm spacing) for coordinate calculations.
  const originalMetadataProvider = createOriginalMetadataProvider();

  const report = MeasurementReport.generateReport(
    filteredToolState,
    originalMetadataProvider,
    options
  );

  const { dataset } = report;

  // Set the default character set as UTF-8
  // https://dicom.innolitics.com/ciods/nm-image/sop-common/00080005
  if (typeof dataset.SpecificCharacterSet === 'undefined') {
    dataset.SpecificCharacterSet = 'ISO_IR 192';
  }

  return dataset;
};

const commandsModule = (props: withAppTypes) => {
  const { servicesManager, extensionManager, commandsManager } = props;
  const { customizationService } = servicesManager.services;

  const actions = {
    changeColorMeasurement: ({ uid }) => {
      // When this gets supported, it probably belongs in cornerstone, not sr
      throw new Error('Unsupported operation: changeColorMeasurement');
      // const { color } = measurementService.getMeasurement(uid);
      // const rgbaColor = {
      //   r: color[0],
      //   g: color[1],
      //   b: color[2],
      //   a: color[3] / 255.0,
      // };
      // colorPickerDialog(uiDialogService, rgbaColor, (newRgbaColor, actionId) => {
      //   if (actionId === 'cancel') {
      //     return;
      //   }

      //   const color = [newRgbaColor.r, newRgbaColor.g, newRgbaColor.b, newRgbaColor.a * 255.0];
      // segmentationService.setSegmentColor(viewportId, segmentationId, segmentIndex, color);
      // });
    },

    /**
     *
     * @param measurementData An array of measurements from the measurements service
     * @param additionalFindingTypes toolTypes that should be stored with labels as Findings
     * @param options Naturalized DICOM JSON headers to merge into the displaySet.
     * as opposed to Finding Sites.
     * that you wish to serialize.
     */
    downloadReport: ({ measurementData, additionalFindingTypes, options = {} }) => {
      const srDataset = _generateReport(measurementData, additionalFindingTypes, options);
      const reportBlob = dcmjs.data.datasetToBlob(srDataset);

      //Create a URL for the binary.
      downloadBlob(reportBlob, { filename: 'dicom-sr.dcm' });
    },

    /**
     *
     * @param measurementData An array of measurements from the measurements service
     * that you wish to serialize.
     * @param dataSource The dataSource that you wish to use to persist the data.
     * @param additionalFindingTypes toolTypes that should be stored with labels as Findings
     * @param options Naturalized DICOM JSON headers to merge into the displaySet.
     * @return The naturalized report
     */
    storeMeasurements: async ({
      measurementData,
      dataSource,
      additionalFindingTypes,
      options = {},
    }) => {
      // Use the @cornerstonejs adapter for converting to/from DICOM
      // But it is good enough for now whilst we only have cornerstone as a datasource.
      log.info('[DICOMSR] storeMeasurements');

      if (!dataSource || !dataSource.store || !dataSource.store.dicom) {
        log.error('[DICOMSR] datasource has no dataSource.store.dicom endpoint!');
        return Promise.reject({});
      }

      try {
        const naturalizedReport = _generateReport(measurementData, additionalFindingTypes, options);

        const { StudyInstanceUID, ContentSequence } = naturalizedReport;
        // The content sequence has 5 or more elements, of which
        // the `[4]` element contains the annotation data, so this is
        // checking that there is some annotation data present.
        if (!ContentSequence?.[4].ContentSequence?.length) {
          console.log('naturalizedReport missing imaging content', naturalizedReport);
          throw new Error('Invalid report, no content');
        }
        if (!naturalizedReport.SOPClassUID) {
          throw new Error('No sop class uid');
        }

        const onBeforeDicomStore = customizationService.getCustomization('onBeforeDicomStore');

        let dicomDict;
        if (typeof onBeforeDicomStore === 'function') {
          dicomDict = onBeforeDicomStore({ dicomDict, measurementData, naturalizedReport });
        }

        await dataSource.store.dicom(naturalizedReport, null, dicomDict);

        if (StudyInstanceUID) {
          dataSource.deleteStudyMetadataPromise(StudyInstanceUID);
        }

        // The "Mode" route listens for DicomMetadataStore changes
        // When a new instance is added, it listens and
        // automatically calls makeDisplaySets
        DicomMetadataStore.addInstances([naturalizedReport], true);

        return naturalizedReport;
      } catch (error) {
        console.warn(error);
        log.error(`[DICOMSR] Error while saving the measurements: ${error.message}`);
        throw new Error(error.message || 'Error while saving the measurements.');
      }
    },

    /**
     * Loads measurements by hydrating and loading the SR for the given display set instance UID
     * and displays it in the active viewport.
     */
    hydrateStructuredReport: ({ displaySetInstanceUID }) => {
      return hydrateStructuredReport(
        { servicesManager, extensionManager, commandsManager },
        displaySetInstanceUID
      );
    },

    /**
     * Exports measurements to Python SR server (dicom_sr_server) using original metadata.
     * This ensures SCOORD coordinates are calculated correctly using original dimensions
     * and pixel spacing, not HTJ2K-adjusted metadata.
     *
     * @param measurementData Array of measurements from measurementService
     * @param serverUrl URL of the Python SR server (default: http://localhost:8000)
     * @returns Promise with server response
     */
    exportToPythonSRServer: async ({ measurementData, serverUrl = 'http://localhost:8000' }) => {
      const { measurementService, uiNotificationService } = servicesManager.services;

      if (!measurementData || measurementData.length === 0) {
        uiNotificationService?.show({
          title: 'Export Failed',
          message: 'No measurements to export',
          type: 'error',
        });
        return;
      }

      console.log('🔧 [exportToPythonSRServer] Starting export with', measurementData.length, 'measurements');

      try {
        // Extract study/patient info from first measurement
        const firstMeasurement = measurementData[0];
        let referencedImageId = firstMeasurement.referencedImageId;

        // For volume measurements, try to get imageId from volumeId + sliceIndex
        if (!referencedImageId && firstMeasurement.metadata?.volumeId) {
          const volumeId = firstMeasurement.metadata.volumeId;
          const sliceIndex = firstMeasurement.metadata.sliceIndex;

          console.log(`🔍 [Volume Measurement] Extracting SOPInstanceUID from volumeId: ${volumeId}, sliceIndex: ${sliceIndex}`);

          // Get volume from cache
          const volume = cache.getVolume(volumeId);

          if (volume && sliceIndex !== undefined) {
            // Get imageId at this slice index
            const imageIds = volume.imageIds;
            if (imageIds && imageIds[sliceIndex]) {
              referencedImageId = imageIds[sliceIndex];
              console.log(`✅ [Volume Measurement] Found imageId at slice ${sliceIndex}: ${referencedImageId}`);
            }
          }
        }

        if (!referencedImageId) {
          throw new Error('No referencedImageId found in measurement - cannot determine study context');
        }

        // Get original instance metadata (not HTJ2K-adjusted)
        const instance = metaData.get('instance', referencedImageId);
        if (!instance) {
          throw new Error('Cannot find instance metadata for measurement');
        }

        const studyInstanceUID = instance.StudyInstanceUID;
        const patientID = instance.PatientID || '';
        const patientName = instance.PatientName ?
          (typeof instance.PatientName === 'string' ? instance.PatientName :
           instance.PatientName.Alphabetic || '') : '';

        console.log(`📋 [Study Context] StudyInstanceUID: ${studyInstanceUID}`);

        // Convert measurements to Python server format
        const measurements = measurementData.map(measurement => {
          const {
            uid,
            label,
            type,
            points = [],
          } = measurement;

          console.log(`\n📏 [Measurement ${uid}] Processing ${type} measurement`);

          // Determine imageId for this measurement
          let measurementImageId = measurement.referencedImageId;

          // For volume measurements, extract imageId from volumeId + sliceIndex
          if (!measurementImageId && measurement.metadata?.volumeId) {
            const volumeId = measurement.metadata.volumeId;
            const sliceIndex = measurement.metadata.sliceIndex;

            console.log(`   🔍 Volume measurement: volumeId=${volumeId}, sliceIndex=${sliceIndex}`);

            // Get volume from cache
            const volume = cache.getVolume(volumeId);

            if (volume) {
              const imageIds = volume.imageIds;
              console.log(`   📊 Volume has ${imageIds?.length || 0} images, sliceIndex=${sliceIndex}`);

              if (imageIds && imageIds.length > 0) {
                // Try to get imageId at the specified slice index
                if (sliceIndex !== undefined && imageIds[sliceIndex]) {
                  measurementImageId = imageIds[sliceIndex];
                  console.log(`   ✅ Found imageId at slice ${sliceIndex}: ${measurementImageId}`);
                } else {
                  // Fallback: use first valid imageId (any slice provides the same study/series metadata)
                  measurementImageId = imageIds[0];
                  console.warn(`   ⚠️  SliceIndex ${sliceIndex} invalid (volume has ${imageIds.length} slices), using first slice for metadata: ${measurementImageId}`);
                }
              } else {
                console.warn(`   ❌ No imageIds in volume`);
              }
            } else {
              console.warn(`   ❌ Could not get volume from cache: ${volumeId}`);
            }
          }

          if (!measurementImageId) {
            console.warn(`   ❌ No imageId found for measurement ${uid} - skipping`);
            return null;
          }

          // Get original metadata for this measurement's image
          const measurementInstance = metaData.get('instance', measurementImageId);
          if (!measurementInstance) {
            console.warn(`   ❌ No instance metadata found for imageId: ${measurementImageId}`);
            return null;
          }

          console.log(`   ✅ Found SOPInstanceUID: ${measurementInstance.SOPInstanceUID}`);
          console.log(`   ✅ FrameOfReferenceUID: ${measurementInstance.FrameOfReferenceUID}`);

          // Get FrameOfReferenceUID - for Volume measurements, try volume metadata if instance doesn't have it
          let frameOfReferenceUID = measurementInstance.FrameOfReferenceUID;
          if (!frameOfReferenceUID && measurement.metadata?.volumeId) {
            const volumeId = measurement.metadata.volumeId;
            const volume = cache.getVolume(volumeId);
            if (volume?.metadata?.FrameOfReferenceUID) {
              frameOfReferenceUID = volume.metadata.FrameOfReferenceUID;
              console.log(`   ✅ Got FrameOfReferenceUID from volume: ${frameOfReferenceUID}`);
            } else if (volume?.imageIds?.[0]) {
              // Try getting from first image in volume
              const firstImageMeta = metaData.get('instance', volume.imageIds[0]);
              if (firstImageMeta?.FrameOfReferenceUID) {
                frameOfReferenceUID = firstImageMeta.FrameOfReferenceUID;
                console.log(`   ✅ Got FrameOfReferenceUID from first volume image: ${frameOfReferenceUID}`);
              }
            }
          }

          // Get original pixel spacing using cornerstone utilities
          const pixelSpacingInfo = csUtilities.getPixelSpacingInformation(measurementInstance);
          const pixelSpacing = pixelSpacingInfo?.PixelSpacing || null;

          // Build metadata object with ORIGINAL values (not HTJ2K-adjusted)
          const metadata = {
            referencedImageId: measurementImageId,
            FrameOfReferenceUID: frameOfReferenceUID || null,
            SOPInstanceUID: measurementInstance.SOPInstanceUID || null,
            SOPClassUID: measurementInstance.SOPClassUID || null,
            ImageOrientationPatient: measurementInstance.ImageOrientationPatient || null,
            ImagePositionPatient: measurementInstance.ImagePositionPatient || null,
            PixelSpacing: pixelSpacing,
            SliceThickness: measurementInstance.SliceThickness || null,
            Rows: measurementInstance.Rows,
            Columns: measurementInstance.Columns,
          };

          // Extract world coordinate points from measurement
          const worldPoints = points.map(point => {
            // Points should already be in world coordinates [x, y, z]
            return Array.isArray(point) ? point : [point.x, point.y, point.z];
          });

          console.log(`   ✅ Extracted ${worldPoints.length} world coordinate points`);
          console.log(`   📍 Points format: nested array [[x,y,z], ...] for Python server`);

          // Extract measurement value (length, area, etc.) from data object
          // The data object has keys like "volumeId:..." with nested stats
          let measurementValue = null;

          // Skip measurement values for annotation-only tools
          const annotationOnlyTools = ['ArrowAnnotate', 'CircleROI', 'EllipticalROI'];
          const isAnnotationOnly = annotationOnlyTools.includes(measurement.toolName);

          if (isAnnotationOnly) {
            console.log(`   ℹ️  ${measurement.toolName} - annotation only, skipping measurement value`);
          } else if (measurement.data) {
            // Get first key (volumeId key)
            const dataKeys = Object.keys(measurement.data);
            if (dataKeys.length > 0) {
              const firstKey = dataKeys[0];
              const stats = measurement.data[firstKey];

              // Extract length or area from stats
              if (stats && typeof stats === 'object') {
                if ('length' in stats) {
                  measurementValue = {
                    length: stats.length,
                    unit: stats.unit || 'mm'
                  };
                  console.log(`   ✅ Found length value: ${stats.length} ${stats.unit || 'mm'}`);
                } else if ('area' in stats) {
                  measurementValue = {
                    area: stats.area,
                    unit: stats.unit || 'mm2'
                  };
                  console.log(`   ✅ Found area value: ${stats.area} ${stats.unit || 'mm2'}`);
                }
              }
            }
          }

          return {
            uid,
            toolName: measurement.toolName || type,  // Use actual toolName ('Length', 'EllipticalROI')
            label: label || null,
            type,
            points: worldPoints,  // Nested array [[x,y,z], ...] - Python server expects this format
            data: measurementValue,  // Send only the extracted measurement value
            metadata,
          };
        }).filter(m => m !== null);  // Remove any null entries

        if (measurements.length === 0) {
          throw new Error('No valid measurements to export');
        }

        // Get seriesInstanceUID from instance we already extracted
        const seriesInstanceUID = instance?.SeriesInstanceUID || '';
        console.log(`📋 [Study Context] SeriesInstanceUID: ${seriesInstanceUID}`);

        // Build request payload matching Python server's AnnotationsRequest model
        const requestPayload = {
          studyInstanceUID,
          seriesInstanceUID,
          patientID,
          patientName,
          measurements,
        };

        console.log('\n📤 [Python SR Export] Request payload:');
        console.log(`   Study: ${studyInstanceUID}`);
        console.log(`   Series: ${seriesInstanceUID}`);
        console.log(`   Patient: ${patientName} (${patientID})`);
        console.log(`   Measurements: ${measurements.length}`);
        measurements.forEach((m, idx) => {
          const valueStr = m.data ?
            (m.data.length ? `${m.data.length} ${m.data.unit}` :
             m.data.area ? `${m.data.area} ${m.data.unit}` : 'no value') :
            'no data';
          console.log(`     ${idx + 1}. ${m.toolName} (${valueStr}): SOPInstanceUID=${m.metadata.SOPInstanceUID?.substring(0, 20)}...`);
        });

        // Send POST request to Python SR server
        console.log(`\n🌐 [Python SR Export] Sending to ${serverUrl}/api/save-annotations...`);

        const response = await fetch(`${serverUrl}/api/save-annotations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        console.log(`📥 [Python SR Export] Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [Python SR Export] Server error: ${errorText}`);
          throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ [Python SR Export] Success! Server response:', result);

        uiNotificationService?.show({
          title: 'Export Successful',
          message: `${measurements.length} measurement(s) exported to Python SR server`,
          type: 'success',
        });

        return result;

      } catch (error) {
        console.error('❌ [Python SR Export] Error:', error);
        console.error('❌ [Python SR Export] Error stack:', error.stack);
        uiNotificationService?.show({
          title: 'Export Failed',
          message: error.message || 'Failed to export measurements',
          type: 'error',
        });
        throw error;
      }
    },
  };

  const definitions = {
    downloadReport: actions.downloadReport,
    storeMeasurements: actions.storeMeasurements,
    hydrateStructuredReport: actions.hydrateStructuredReport,
    exportToPythonSRServer: actions.exportToPythonSRServer,
  };

  return {
    actions,
    definitions,
    defaultContext: 'CORNERSTONE_STRUCTURED_REPORT',
  };
};

export default commandsModule;
