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
const DECODE_LEVEL = 2;
const RESOLUTION_FACTOR = Math.pow(2, DECODE_LEVEL); // 4x reduction
const HTJ2K_ADJUSTMENT_ENABLED = true;

function isHTJ2K(instance) {
  const transferSyntaxUID =
    instance.AvailableTransferSyntaxUID ||
    instance._meta?.TransferSyntaxUID?.Value?.[0];
  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

function getAdjustedImagePixelModule(instance) {
  if (!HTJ2K_ADJUSTMENT_ENABLED || !isHTJ2K(instance)) {
    return null;
  }
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  if (!originalRows || !originalColumns) {
    return null;
  }
  const adjustedRows = Math.floor(originalRows / RESOLUTION_FACTOR);
  const adjustedColumns = Math.floor(originalColumns / RESOLUTION_FACTOR);
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
  if (!HTJ2K_ADJUSTMENT_ENABLED || !isHTJ2K(instance)) {
    return null;
  }
  const pixelSpacingInfo = csUtilities.getPixelSpacingInformation(instance);
  const { PixelSpacing } = pixelSpacingInfo || {};
  if (!PixelSpacing || PixelSpacing.length < 2) {
    return null;
  }
  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;
  const adjustedRows = Math.floor(originalRows / RESOLUTION_FACTOR);
  const adjustedColumns = Math.floor(originalColumns / RESOLUTION_FACTOR);
  const adjustedPixelSpacing = [
    PixelSpacing[0] * RESOLUTION_FACTOR,
    PixelSpacing[1] * RESOLUTION_FACTOR,
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
              } catch (error) {
                console.error('[HTJ2K L2] Error adjusting metadata:', error);
                // Continue without adjustment - don't break file loading
              }
            });

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
