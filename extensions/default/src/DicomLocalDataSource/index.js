import { DicomMetadataStore, IWebApiDataSource, utils } from '@ohif/core';
import OHIF from '@ohif/core';
import dcmjs from 'dcmjs';
import { utilities as csUtilities } from '@cornerstonejs/core';

const metadataProvider = OHIF.classes.MetadataProvider;
const { EVENTS } = DicomMetadataStore;

// HTJ2K utilities (copied to avoid circular dependency with cornerstone extension)
const HTJ2K_TRANSFER_SYNTAX_UIDS = [
  '1.2.840.10008.1.2.4.201', // HTJ2K Lossless
  '1.2.840.10008.1.2.4.202', // HTJ2K Lossless RPCLoss
  '1.2.840.10008.1.2.4.203', // HTJ2K
];

// Get HTJ2K configuration from window.config
function getHTJ2KResolutionFactor() {
  const htj2kConfig = typeof window !== 'undefined' ? window.config?.htj2k : null;
  const decodeLevel = htj2kConfig?.volumeDecodeLevel ?? 2;
  return Math.pow(2, decodeLevel);
}

/**
 * Gets the current mode from URL path
 * OHIF URL pattern: /:modeId/:dataSource/?queryParams
 * Example: /usmpr/ohif/?StudyInstanceUIDs=...
 * @returns Current mode name (e.g., 'usmpr', 'basic') or null if not found
 */
function getCurrentMode() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Get mode from URL path (first segment after /)
    // URL: http://localhost:3000/usmpr/ohif/?... → mode: 'usmpr'
    const pathname = window.location.pathname;
    const segments = pathname.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
      return null;
    }

    // First segment is the mode
    const mode = segments[0];

    // Handle both '@ohif/mode-usmpr' and 'usmpr' formats
    return mode.replace('@ohif/mode-', '');
  } catch (error) {
    console.warn('[HTJ2K-Local] Failed to parse URL mode:', error);
    return null;
  }
}

function isHTJ2KConfigEnabled() {
  const htj2kConfig = typeof window !== 'undefined' ? window.config?.htj2k : null;

  if (!htj2kConfig?.enabled) {
    return false;
  }

  // Check if HTJ2K adjustment is enabled for current mode
  // enabledModes restricts which modes use HTJ2K Level 2 metadata adjustment
  // (e.g., basic mode should behave like original OHIF)
  if (htj2kConfig.enabledModes && Array.isArray(htj2kConfig.enabledModes)) {
    const currentMode = getCurrentMode();

    if (!currentMode) {
      // No mode specified in URL - disable HTJ2K adjustment
      return false;
    }

    const isEnabled = htj2kConfig.enabledModes.includes(currentMode);
    return isEnabled;
  }

  // If enabledModes not specified, enable for all modes (backward compatibility)
  return true;
}

// Utility to detect missing slices in a series
function checkForMissingSlices(instances) {
  if (!instances || instances.length < 2) {
    return { hasMissingSlices: false, report: 'Not enough instances to check' };
  }

  // Sort instances by ImagePositionPatient Z-coordinate
  const sortedInstances = [...instances].sort((a, b) => {
    const posA = a.ImagePositionPatient || [0, 0, 0];
    const posB = b.ImagePositionPatient || [0, 0, 0];
    return posA[2] - posB[2]; // Z-coordinate
  });

  // Calculate expected spacing
  const positions = sortedInstances.map(inst => {
    const pos = inst.ImagePositionPatient || [0, 0, 0];
    return pos[2];
  });

  const spacings = [];
  for (let i = 1; i < positions.length; i++) {
    spacings.push(Math.abs(positions[i] - positions[i - 1]));
  }

  const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const tolerance = avgSpacing * 0.1; // 10% tolerance

  // Check for gaps
  const gaps = [];
  for (let i = 0; i < spacings.length; i++) {
    if (Math.abs(spacings[i] - avgSpacing) > tolerance) {
      gaps.push({
        index: i,
        expected: avgSpacing.toFixed(2),
        actual: spacings[i].toFixed(2),
        position: positions[i].toFixed(2),
      });
    }
  }

  const report = {
    totalInstances: instances.length,
    averageSpacing: avgSpacing.toFixed(2) + 'mm',
    hasMissingSlices: gaps.length > 0,
    gaps: gaps,
  };

  if (gaps.length > 0) {
    console.warn('[Missing Slices] Detected gaps in series:', report);
  } else {
    console.log('[Slice Check] No missing slices detected. Total:', instances.length);
  }

  return report;
}

function isHTJ2K(instance) {
  const transferSyntaxUID =
    instance.AvailableTransferSyntaxUID ||
    instance._meta?.TransferSyntaxUID?.Value?.[0];
  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

function getAdjustedImagePixelModule(instance) {
  if (!isHTJ2KConfigEnabled() || !isHTJ2K(instance)) {
    return null;
  }
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  if (!originalRows || !originalColumns) {
    return null;
  }
  const resolutionFactor = getHTJ2KResolutionFactor();
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);
  if (adjustedRows < 8 || adjustedColumns < 8) {
    return null;
  }
  return {
    rows: adjustedRows,
    columns: adjustedColumns,
    samplesPerPixel: instance.SamplesPerPixel || 1,
    photometricInterpretation: instance.PhotometricInterpretation,
    bitsAllocated: instance.BitsAllocated,
    bitsStored: instance.BitsStored,
    highBit: instance.HighBit,
    pixelRepresentation: instance.PixelRepresentation,
    planarConfiguration: instance.PlanarConfiguration,
    pixelAspectRatio: instance.PixelAspectRatio,
    smallestPixelValue: instance.SmallestPixelValue,
    largestPixelValue: instance.LargestPixelValue,
  };
}

function getAdjustedImagePlaneModule(instance) {
  if (!isHTJ2KConfigEnabled() || !isHTJ2K(instance)) {
    return null;
  }
  const pixelSpacingInfo = csUtilities.getPixelSpacingInformation(instance);
  const { PixelSpacing } = pixelSpacingInfo || {};
  if (!PixelSpacing || PixelSpacing.length < 2) {
    return null;
  }
  const resolutionFactor = getHTJ2KResolutionFactor();
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);
  const adjustedPixelSpacing = [
    PixelSpacing[0] * resolutionFactor,
    PixelSpacing[1] * resolutionFactor,
  ];
  return {
    frameOfReferenceUID: instance.FrameOfReferenceUID,
    rows: adjustedRows,
    columns: adjustedColumns,
    spacingBetweenSlices: instance.SpacingBetweenSlices,
    imageOrientationPatient: instance.ImageOrientationPatient,
    imagePositionPatient: instance.ImagePositionPatient,
    sliceThickness: instance.SliceThickness,
    sliceLocation: instance.SliceLocation,
    pixelSpacing: adjustedPixelSpacing,
    rowPixelSpacing: adjustedPixelSpacing[0],
    columnPixelSpacing: adjustedPixelSpacing[1],
  };
}

const END_MODALITIES = {
  SR: true,
  SEG: true,
  DOC: true,
};

const compareValue = (v1, v2, def = 0) => {
  if (v1 === v2) {
    return def;
  }
  if (v1 < v2) {
    return -1;
  }
  return 1;
};

// Sorting SR modalities to be at the end of series list
const customSort = (seriesA, seriesB) => {
  const instanceA = seriesA.instances[0];
  const instanceB = seriesB.instances[0];
  const modalityA = instanceA.Modality;
  const modalityB = instanceB.Modality;

  const isEndA = END_MODALITIES[modalityA];
  const isEndB = END_MODALITIES[modalityB];

  if (isEndA && isEndB) {
    // Compare by series date
    return compareValue(instanceA.SeriesNumber, instanceB.SeriesNumber);
  }
  if (!isEndA && !isEndB) {
    return compareValue(instanceB.SeriesNumber, instanceA.SeriesNumber);
  }
  return isEndA ? -1 : 1;
};

function createDicomLocalApi(dicomLocalConfig) {
  const { name } = dicomLocalConfig;

  const implementation = {
    initialize: ({ params, query }) => {},
    query: {
      studies: {
        mapParams: () => {},
        search: params => {
          const studyUIDs = DicomMetadataStore.getStudyInstanceUIDs();

          return studyUIDs.map(StudyInstanceUID => {
            let numInstances = 0;
            const modalities = new Set();

            // Calculating the number of instances in the study and modalities
            // present in the study
            const study = DicomMetadataStore.getStudy(StudyInstanceUID);
            study.series.forEach(aSeries => {
              numInstances += aSeries.instances.length;
              modalities.add(aSeries.instances[0].Modality);
            });

            // first instance in the first series
            const firstInstance = study?.series[0]?.instances[0];

            if (firstInstance) {
              return {
                accession: firstInstance.AccessionNumber,
                date: firstInstance.StudyDate,
                description: firstInstance.StudyDescription,
                mrn: firstInstance.PatientID,
                patientName: utils.formatPN(firstInstance.PatientName),
                studyInstanceUid: firstInstance.StudyInstanceUID,
                time: firstInstance.StudyTime,
                //
                instances: numInstances,
                modalities: Array.from(modalities).join('/'),
                NumInstances: numInstances,
              };
            }
          });
        },
        processResults: () => {
          console.warn(' DICOMLocal QUERY processResults not implemented');
        },
      },
      series: {
        search: studyInstanceUID => {
          const study = DicomMetadataStore.getStudy(studyInstanceUID);
          return study.series.map(aSeries => {
            const firstInstance = aSeries?.instances[0];
            return {
              studyInstanceUid: studyInstanceUID,
              seriesInstanceUid: firstInstance.SeriesInstanceUID,
              modality: firstInstance.Modality,
              seriesNumber: firstInstance.SeriesNumber,
              seriesDate: firstInstance.SeriesDate,
              numSeriesInstances: aSeries.instances.length,
              description: firstInstance.SeriesDescription,
            };
          });
        },
      },
      instances: {
        search: () => {
          console.warn(' DICOMLocal QUERY instances SEARCH not implemented');
        },
      },
    },
    retrieve: {
      directURL: params => {
        const { instance, tag, defaultType } = params;

        const value = instance[tag];
        if (value instanceof Array && value[0] instanceof ArrayBuffer) {
          return URL.createObjectURL(
            new Blob([value[0]], {
              type: defaultType,
            })
          );
        }
      },
      series: {
        metadata: async ({ StudyInstanceUID, madeInClient = false } = {}) => {
          if (!StudyInstanceUID) {
            throw new Error('Unable to query for SeriesMetadata without StudyInstanceUID');
          }

          // Instances metadata already added via local upload
          const study = DicomMetadataStore.getStudy(StudyInstanceUID, madeInClient);

          // Series metadata already added via local upload
          DicomMetadataStore._broadcastEvent(EVENTS.SERIES_ADDED, {
            StudyInstanceUID,
            madeInClient,
          });

          study.series.forEach(aSeries => {
            const { SeriesInstanceUID } = aSeries;

            const isMultiframe = aSeries.instances[0].NumberOfFrames > 1;

            aSeries.instances.forEach((instance, index) => {
              const {
                url: imageId,
                StudyInstanceUID,
                SeriesInstanceUID,
                SOPInstanceUID,
              } = instance;

              instance.imageId = imageId;

              // Add imageId specific mapping to this data as the URL isn't necessarily WADO-URI.
              metadataProvider.addImageIdToUIDs(imageId, {
                StudyInstanceUID,
                SeriesInstanceUID,
                SOPInstanceUID,
                frameIndex: isMultiframe ? index : 1,
              });

              // Apply HTJ2K Level 2 metadata adjustments
              try {
                const adjustedImagePixelModule = getAdjustedImagePixelModule(instance);
                if (adjustedImagePixelModule) {
                  metadataProvider.addCustomMetadata(
                    imageId,
                    'imagePixelModule',
                    adjustedImagePixelModule
                  );
                  console.log(
                    `[HTJ2K L2] ${imageId} adjusted to ${adjustedImagePixelModule.rows}x${adjustedImagePixelModule.columns}`
                  );
                }

                const adjustedImagePlaneModule = getAdjustedImagePlaneModule(instance);
                if (adjustedImagePlaneModule) {
                  metadataProvider.addCustomMetadata(
                    imageId,
                    'imagePlaneModule',
                    adjustedImagePlaneModule
                  );
                  console.log(
                    `[HTJ2K L2] ${imageId} spacing adjusted to [${adjustedImagePlaneModule.pixelSpacing}]`
                  );
                }

                // CRITICAL: Ensure frameOfReferenceUID is always available in imagePlaneModule
                // Stack viewport annotations need this to have FrameOfReferenceUID in metadata
                // Without this, stack viewport measurements will be saved as 2D SCOORD instead of 3D SCOORD3D
                if (!adjustedImagePlaneModule && instance.FrameOfReferenceUID) {
                  // Get the default imagePlaneModule from instance and add frameOfReferenceUID
                  const pixelSpacingInfo = csUtilities.getPixelSpacingInformation(instance);
                  const imagePlaneModuleWithFrameOfRef = {
                    frameOfReferenceUID: instance.FrameOfReferenceUID,
                    rows: instance.Rows,
                    columns: instance.Columns,
                    imageOrientationPatient: instance.ImageOrientationPatient,
                    imagePositionPatient: instance.ImagePositionPatient,
                    pixelSpacing: pixelSpacingInfo?.PixelSpacing,
                    rowPixelSpacing: pixelSpacingInfo?.RowPixelSpacing,
                    columnPixelSpacing: pixelSpacingInfo?.ColumnPixelSpacing,
                    sliceThickness: instance.SliceThickness,
                    sliceLocation: instance.SliceLocation,
                    spacingBetweenSlices: instance.SpacingBetweenSlices,
                  };
                  metadataProvider.addCustomMetadata(
                    imageId,
                    'imagePlaneModule',
                    imagePlaneModuleWithFrameOfRef
                  );
                }
              } catch (error) {
                console.error('[HTJ2K L2] Error adjusting metadata:', error);
                // Continue without adjustment - don't break file loading
              }
            });

            // Check for missing slices in this series
            checkForMissingSlices(aSeries.instances);

            DicomMetadataStore._broadcastEvent(EVENTS.INSTANCES_ADDED, {
              StudyInstanceUID,
              SeriesInstanceUID,
              madeInClient,
            });
          });
        },
      },
    },
    store: {
      dicom: naturalizedReport => {
        const reportBlob = dcmjs.data.datasetToBlob(naturalizedReport);

        //Create a URL for the binary.
        var objectUrl = URL.createObjectURL(reportBlob);
        window.location.assign(objectUrl);
      },
    },
    getImageIdsForDisplaySet(displaySet) {
      const images = displaySet.images;
      const imageIds = [];

      if (!images) {
        return imageIds;
      }

      displaySet.images.forEach(instance => {
        const NumberOfFrames = instance.NumberOfFrames;
        if (NumberOfFrames > 1) {
          // in multiframe we start at frame 1
          for (let i = 1; i <= NumberOfFrames; i++) {
            const imageId = this.getImageIdsForInstance({
              instance,
              frame: i,
            });
            imageIds.push(imageId);
          }
        } else {
          const imageId = this.getImageIdsForInstance({ instance });
          imageIds.push(imageId);
        }
      });

      return imageIds;
    },
    getImageIdsForInstance({ instance, frame }) {
      // Important: Never use instance.imageId because it might be multiframe,
      // which would make it an invalid imageId.
      // if (instance.imageId) {
      //   return instance.imageId;
      // }

      const { StudyInstanceUID, SeriesInstanceUID } = instance;
      const SOPInstanceUID = instance.SOPInstanceUID || instance.SopInstanceUID;
      const storedInstance = DicomMetadataStore.getInstance(
        StudyInstanceUID,
        SeriesInstanceUID,
        SOPInstanceUID
      );

      let imageId = storedInstance.url;

      if (frame !== undefined) {
        imageId += `&frame=${frame}`;
      }

      return imageId;
    },
    deleteStudyMetadataPromise() {
      console.log('deleteStudyMetadataPromise not implemented');
    },
    getStudyInstanceUIDs: ({ params, query }) => {
      const { StudyInstanceUIDs: paramsStudyInstanceUIDs } = params;
      const queryStudyInstanceUIDs = query.getAll('StudyInstanceUIDs');

      const StudyInstanceUIDs = queryStudyInstanceUIDs || paramsStudyInstanceUIDs;
      const StudyInstanceUIDsAsArray =
        StudyInstanceUIDs && Array.isArray(StudyInstanceUIDs)
          ? StudyInstanceUIDs
          : [StudyInstanceUIDs];

      // Put SRs at the end of series list to make sure images are loaded first
      let isStudyInCache = false;
      StudyInstanceUIDsAsArray.forEach(StudyInstanceUID => {
        const study = DicomMetadataStore.getStudy(StudyInstanceUID);
        if (study) {
          study.series = study.series.sort(customSort);
          isStudyInCache = true;
        }
      });

      return isStudyInCache ? StudyInstanceUIDsAsArray : [];
    },
  };
  return IWebApiDataSource.create(implementation);
}

export { createDicomLocalApi };
