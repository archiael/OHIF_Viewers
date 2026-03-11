import { api } from 'dicomweb-client';
import { DicomMetadataStore, IWebApiDataSource, utils, errorHandler, classes } from '@ohif/core';
import { utilities as csUtilities } from '@cornerstonejs/core';

import {
  mapParams,
  search as qidoSearch,
  seriesInStudy,
  processResults,
  processSeriesResults,
} from './qido.js';
import dcm4cheeReject from './dcm4cheeReject.js';

import getImageId from './utils/getImageId.js';
import dcmjs from 'dcmjs';
import { retrieveStudyMetadata, deleteStudyMetadataPromise } from './retrieveStudyMetadata.js';
import StaticWadoClient from './utils/StaticWadoClient';
import getDirectURL from '../utils/getDirectURL';
import { fixBulkDataURI } from './utils/fixBulkDataURI';
import { HeadersInterface } from '@ohif/core/src/types/RequestHeaders';
import { getCurrentMode } from '../utils/getModeFromUrl';

const { DicomMetaDictionary, DicomDict } = dcmjs.data;

const { naturalizeDataset, denaturalizeDataset } = DicomMetaDictionary;

const ImplementationClassUID = '2.25.270695996825855179949881587723571202391.2.0.0';

// ============================================================================
// HTJ2K Level 2 Metadata Adjustment for DICOMweb
// This ensures metadata matches the actual decoded pixel dimensions when using
// progressive decoding (decodeLevel 2 = quarter resolution)
// ============================================================================

// HTJ2K Transfer Syntax UIDs
const HTJ2K_TRANSFER_SYNTAX_UIDS = [
  '1.2.840.10008.1.2.4.201', // HTJ2K Lossless
  '1.2.840.10008.1.2.4.202', // HTJ2K Lossless RPCL
  '1.2.840.10008.1.2.4.203', // HTJ2K
];

// Import HTJ2K configuration from central config manager
// Note: We can't directly import from cornerstone extension due to circular dependency
// So we use a local function that reads from window.config
function getHTJ2KResolutionFactor(): number {
  // @ts-ignore - window.config is set by OHIF
  const htj2kConfig = typeof window !== 'undefined' ? window.config?.htj2k : null;
  const decodeLevel = htj2kConfig?.volumeDecodeLevel ?? 2;
  return Math.pow(2, decodeLevel);
}

// getCurrentMode() is imported from '../utils/getModeFromUrl'
// It handles routerBasename stripping so '/worklist/usmpr/...' correctly returns 'usmpr'

function isHTJ2KConfigEnabled(): boolean {
  // @ts-ignore - window.config is set by OHIF
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
      console.log('[HTJ2K] No mode in URL, HTJ2K metadata adjustment disabled');
      return false;
    }

    const isEnabled = htj2kConfig.enabledModes.includes(currentMode);

    if (!isEnabled) {
      console.log(
        `[HTJ2K] Mode '${currentMode}' not in enabledModes, HTJ2K metadata adjustment disabled`
      );
    }

    return isEnabled;
  }

  // If enabledModes not specified, enable for all modes (backward compatibility)
  return true;
}

/**
 * Detects if an instance uses HTJ2K compression
 * @param instance - DICOM instance object (naturalized)
 * @returns true if instance uses HTJ2K compression
 */
function isHTJ2K(instance: any): boolean {
  // Check AvailableTransferSyntaxUID first (common in DICOMweb responses)
  const transferSyntaxUID =
    instance.AvailableTransferSyntaxUID ||
    instance._meta?.TransferSyntaxUID?.Value?.[0] ||
    instance.TransferSyntaxUID;

  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

/**
 * Checks if a Transfer Syntax UID is HTJ2K
 * @param transferSyntaxUID - Transfer Syntax UID string
 * @returns true if the UID is HTJ2K
 */
function isHTJ2KTransferSyntax(transferSyntaxUID: string): boolean {
  return HTJ2K_TRANSFER_SYNTAX_UIDS.includes(transferSyntaxUID);
}

/**
 * Gets adjusted imagePixelModule for HTJ2K Level 2 decoding
 * Returns adjusted module without modifying the instance object
 * @param instance - DICOM instance object (naturalized, NOT modified)
 * @param forceHTJ2K - Force HTJ2K adjustment regardless of instance metadata (use when config requests HTJ2K)
 * @returns Adjusted imagePixelModule or null if not applicable
 */
function getAdjustedImagePixelModule(instance: any, forceHTJ2K: boolean = false): any {
  // Check if HTJ2K is enabled in config
  if (!isHTJ2KConfigEnabled()) {
    return null;
  }

  // Use forceHTJ2K when config.requestTransferSyntaxUID is HTJ2K
  // This handles cases where DICOMweb metadata doesn't include TransferSyntaxUID
  if (!forceHTJ2K && !isHTJ2K(instance)) {
    return null;
  }

  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;

  if (!originalRows || !originalColumns) {
    return null;
  }

  // Get resolution factor from config
  const resolutionFactor = getHTJ2KResolutionFactor();

  // Calculate adjusted dimensions
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);

  // Validate adjusted dimensions are reasonable
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

/**
 * Gets adjusted imagePlaneModule for HTJ2K Level 2 decoding
 * Returns adjusted module without modifying the instance object
 * @param instance - DICOM instance object (naturalized, NOT modified)
 * @param forceHTJ2K - Force HTJ2K adjustment regardless of instance metadata (use when config requests HTJ2K)
 * @returns Adjusted imagePlaneModule or null if not applicable
 */
function getAdjustedImagePlaneModule(instance: any, forceHTJ2K: boolean = false): any {
  // Check if HTJ2K is enabled in config
  if (!isHTJ2KConfigEnabled()) {
    return null;
  }

  // Use forceHTJ2K when config.requestTransferSyntaxUID is HTJ2K
  if (!forceHTJ2K && !isHTJ2K(instance)) {
    return null;
  }

  const originalRows = instance.Rows;
  const originalColumns = instance.Columns;

  if (!originalRows || !originalColumns) {
    return null;
  }

  // Get pixel spacing using cornerstone utilities
  const pixelSpacingInfo = csUtilities.getPixelSpacingInformation(instance);
  const { PixelSpacing } = pixelSpacingInfo || {};

  if (!PixelSpacing || PixelSpacing.length < 2) {
    return null;
  }

  // Get resolution factor from config
  const resolutionFactor = getHTJ2KResolutionFactor();

  // Calculate adjusted dimensions
  const adjustedRows = Math.floor(originalRows / resolutionFactor);
  const adjustedColumns = Math.floor(originalColumns / resolutionFactor);

  // Validate adjusted dimensions
  if (adjustedRows < 8 || adjustedColumns < 8) {
    return null;
  }

  // Calculate adjusted pixel spacing
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

// ============================================================================
const ImplementationVersionName = 'OHIF-3.11.0';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

const metadataProvider = classes.MetadataProvider;

export type DicomWebConfig = {
  /** Data source name */
  name: string;
  //  wadoUriRoot - Legacy? (potentially unused/replaced)
  /** Base URL to use for QIDO requests */
  qidoRoot?: string;
  wadoRoot?: string; // - Base URL to use for WADO requests
  wadoUri?: string; // - Base URL to use for WADO URI requests
  qidoSupportsIncludeField?: boolean; // - Whether QIDO supports the "Include" option to request additional fields in response
  imageRendering?: string; // - wadors | ? (unsure of where/how this is used)
  thumbnailRendering?: string;
  /**
   wadors - render using the wadors fetch.  The full image is retrieved and rendered in cornerstone to thumbnail size  png and returned as binary data to the src attribute of the  image tag.
           for example,  <img  src=data:image/png;base64,sdlfk;adkfadfk....asldfjkl;asdkf>
   thumbnailDirect -  get the direct url endpoint for the thumbnail as the image src (eg not authentication required).
           for example, <img src=http://server:port/wadors/studies/1.2.3/thumbnail?accept=image/jpeg>
   thumbnail - render using the thumbnail endpoint on wadors using bulkDataURI, passing authentication params  to the url.
    rendered - should use the rendered endpoint instead of the thumbnail endpoint
*/
  /** Whether the server supports reject calls (i.e. DCM4CHEE) */
  supportsReject?: boolean;
  /** indicates if the retrieves can fetch singlepart. Options are bulkdata, video, image, or  true */
  singlepart?: boolean | string;
  /** Transfer syntax to request from the server */
  requestTransferSyntaxUID?: string;
  acceptHeader?: string[]; // - Accept header to use for requests
  /** Whether to omit quotation marks for multipart requests */
  omitQuotationForMultipartRequest?: boolean;
  /** Whether the server supports fuzzy matching */
  supportsFuzzyMatching?: boolean;
  /** Whether the server supports wildcard matching */
  supportsWildcard?: boolean;
  /** Whether the server supports the native DICOM model */
  supportsNativeDICOMModel?: boolean;
  /** Whether to enable request tag */
  enableRequestTag?: boolean;
  /** Whether to enable study lazy loading */
  enableStudyLazyLoad?: boolean;
  /** Whether to enable bulkDataURI */
  bulkDataURI?: BulkDataURIConfig;
  /** Function that is called after the configuration is initialized */
  onConfiguration: (config: DicomWebConfig, params) => DicomWebConfig;
  /** Whether to use the static WADO client */
  staticWado?: boolean;
  /** User authentication service */
  userAuthenticationService: Record<string, unknown>;
};

export type BulkDataURIConfig = {
  /** Enable bulkdata uri configuration */
  enabled?: boolean;
  /**
   * Remove the startsWith string.
   * This is used to correct reverse proxied URLs by removing the startsWith path
   */
  startsWith?: string;
  /**
   * Adds this prefix path.  Only used if the startsWith is defined and has
   * been removed.  This allows replacing the base path.
   */
  prefixWith?: string;
  /** Transform the bulkdata path.  Used to replace a portion of the path */
  transform?: (uri: string) => string;
  /**
   * Adds relative resolution to the path handling.
   * series is the default, as the metadata retrieved is series level.
   */
  relativeResolution?: 'studies' | 'series';
};

/**
 * The header options are the options passed into the generateWadoHeader
 * command.  This takes an extensible set of attributes to allow future enhancements.
 */
export interface HeaderOptions {
  includeTransferSyntax?: boolean;
}

/**
 * Metadata and some other requests don't permit the transfer syntax to be included,
 * so pass in the excludeTransferSyntax parameter.
 */
export const excludeTransferSyntax: HeaderOptions = { includeTransferSyntax: false };

/**
 * Creates a DICOM Web API based on the provided configuration.
 *
 * @param dicomWebConfig - Configuration for the DICOM Web API
 * @returns DICOM Web API object
 */
function createDicomWebApi(dicomWebConfig: DicomWebConfig, servicesManager) {
  const { userAuthenticationService } = servicesManager.services;
  let dicomWebConfigCopy,
    qidoConfig,
    wadoConfig,
    qidoDicomWebClient,
    wadoDicomWebClient,
    getAuthorizationHeader,
    generateWadoHeader;
  // Default to enabling bulk data retrieves, with no other customization as
  // this is part of hte base standard.
  dicomWebConfig.bulkDataURI ||= { enabled: true };

  const implementation = {
    initialize: ({ params, query }) => {
      if (dicomWebConfig.onConfiguration && typeof dicomWebConfig.onConfiguration === 'function') {
        dicomWebConfig = dicomWebConfig.onConfiguration(dicomWebConfig, {
          params,
          query,
        });
      }

      dicomWebConfigCopy = JSON.parse(JSON.stringify(dicomWebConfig));

      getAuthorizationHeader = () => {
        const xhrRequestHeaders: HeadersInterface = {};
        const authHeaders = userAuthenticationService.getAuthorizationHeader();
        if (authHeaders && authHeaders.Authorization) {
          xhrRequestHeaders.Authorization = authHeaders.Authorization;
        }
        return xhrRequestHeaders;
      };

      /**
       * Generates the wado header for requesting resources from DICOMweb.
       * These are classified into those that are dependent on the transfer syntax
       * and those that aren't, as defined by the include transfer syntax attribute.
       */
      generateWadoHeader = (options: HeaderOptions): HeadersInterface => {
        const authorizationHeader = getAuthorizationHeader();
        if (options?.includeTransferSyntax !== false) {
          //Generate accept header depending on config params
          const formattedAcceptHeader = utils.generateAcceptHeader(
            dicomWebConfig.acceptHeader,
            dicomWebConfig.requestTransferSyntaxUID,
            dicomWebConfig.omitQuotationForMultipartRequest
          );
          return {
            ...authorizationHeader,
            Accept: formattedAcceptHeader,
          };
        } else {
          // The base header will be included in the request. We simply skip customization options around
          // transfer syntaxes and whether the request is multipart. In other words, a request in
          // which the server expects Accept: application/dicom+json will still include that in the
          // header.
          return {
            ...authorizationHeader,
          };
        }
      };

      qidoConfig = {
        url: dicomWebConfig.qidoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: userAuthenticationService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
        supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
      };

      wadoConfig = {
        url: dicomWebConfig.wadoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: userAuthenticationService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
        supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
      };

      // TODO -> Two clients sucks, but its better than 1000.
      // TODO -> We'll need to merge auth later.
      qidoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(qidoConfig)
        : new api.DICOMwebClient(qidoConfig);

      wadoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(wadoConfig)
        : new api.DICOMwebClient(wadoConfig);
    },
    query: {
      studies: {
        mapParams: mapParams.bind(),
        search: async function (origParams) {
          qidoDicomWebClient.headers = getAuthorizationHeader();
          const { studyInstanceUid, seriesInstanceUid, ...mappedParams } =
            mapParams(origParams, {
              supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
              supportsWildcard: dicomWebConfig.supportsWildcard,
            }) || {};

          const results = await qidoSearch(qidoDicomWebClient, undefined, undefined, mappedParams);

          return processResults(results);
        },
        processResults: processResults.bind(),
      },
      series: {
        // mapParams: mapParams.bind(),
        search: async function (studyInstanceUid) {
          qidoDicomWebClient.headers = getAuthorizationHeader();
          const results = await seriesInStudy(qidoDicomWebClient, studyInstanceUid);

          return processSeriesResults(results);
        },
        // processResults: processResults.bind(),
      },
      instances: {
        search: (studyInstanceUid, queryParameters) => {
          qidoDicomWebClient.headers = getAuthorizationHeader();
          return qidoSearch.call(
            undefined,
            qidoDicomWebClient,
            studyInstanceUid,
            null,
            queryParameters
          );
        },
      },
    },
    retrieve: {
      /**
       * Generates a URL that can be used for direct retrieve of the bulkdata
       *
       * @param {object} params
       * @param {string} params.tag is the tag name of the URL to retrieve
       * @param {object} params.instance is the instance object that the tag is in
       * @param {string} params.defaultType is the mime type of the response
       * @param {string} params.singlepart is the type of the part to retrieve
       * @returns an absolute URL to the resource, if the absolute URL can be retrieved as singlepart,
       *    or is already retrieved, or a promise to a URL for such use if a BulkDataURI
       */

      getGetThumbnailSrc: function (instance, imageId) {
        // Helper function to extract Icon Image Sequence (0088,0200) if available
        const tryGetIconImageSequence = async () => {
          try {
            // Get instance metadata to extract Icon Image Sequence
            const metadata = DicomMetadataStore.getInstance(
              instance.StudyInstanceUID,
              instance.SeriesInstanceUID,
              instance.SOPInstanceUID
            );

            // Try different tag access methods
            const iconImageSequence =
              metadata?.['00880200'] || metadata?.IconImageSequence || metadata?.['0088,0200'];

            if (metadata && iconImageSequence) {
              if (iconImageSequence && iconImageSequence.Value && iconImageSequence.Value[0]) {
                const iconImage = iconImageSequence.Value[0];

                // Extract pixel data from Icon Image Sequence
                // The icon image typically contains: Rows, Columns, BitsAllocated, PixelData
                if (iconImage['7FE00010']) {
                  // PixelData tag (7FE0,0010)
                  const pixelDataElement = iconImage['7FE00010'];

                  // Only use InlineBinary (embedded base64), not BulkDataURI (WADO-RS)
                  if (pixelDataElement.InlineBinary) {
                    // Convert base64 to blob
                    console.log(
                      `✅ [IconImage] Using Icon Image Sequence for ${instance.SOPInstanceUID} (InlineBinary)`
                    );
                    const binary = atob(pixelDataElement.InlineBinary);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                      bytes[i] = binary.charCodeAt(i);
                    }

                    // Create a blob URL for the thumbnail
                    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
                  } else {
                    console.log(
                      `⚠️ [IconImage] Icon Image Sequence found but no InlineBinary data for ${instance.SOPInstanceUID}`
                    );
                  }
                }
              }
            }
          } catch (error) {
            console.warn('[IconImage] Error extracting Icon Image Sequence:', error);
          }
          return null;
        };

        // WADORS mode - try Icon Image Sequence first, then fall back to rendering middle frame
        if (dicomWebConfig.thumbnailRendering === 'wadors') {
          console.log(`✅ [IconImage] Entering WADORS mode for ${instance.SOPInstanceUID}`);
          return async function getThumbnailSrc(options) {
            // Try Icon Image Sequence first (PRIORITY)
            const iconImageUrl = await tryGetIconImageSequence.call(this);
            if (iconImageUrl) {
              return iconImageUrl;
            }
            if (!imageId) {
              return null;
            }
            if (!options?.getImageSrc) {
              return null;
            }
            // This renders the middle frame of the series as thumbnail
            return options.getImageSrc(imageId);
          }.bind(this);
        }

        // iconImage mode - only use Icon Image Sequence
        if (dicomWebConfig.thumbnailRendering === 'iconImage') {
          return async function getThumbnailSrc() {
            const iconImageUrl = await tryGetIconImageSequence.call(this);
            if (iconImageUrl) {
              return iconImageUrl;
            }

            // Fallback to standard thumbnail if Icon Image Sequence not available
            console.warn(
              '[IconImage] Icon Image Sequence not found, falling back to standard thumbnail'
            );
            const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
            const bulkDataURI = `${dicomWebConfig.wadoRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/${SOPInstanceUID}/thumbnail?accept=image/jpeg`;
            return URL.createObjectURL(
              new Blob(
                [
                  await this.bulkDataURI({
                    BulkDataURI: bulkDataURI.replace('wadors:', ''),
                    defaultType: 'image/jpeg',
                    mediaTypes: ['image/jpeg'],
                    thumbnail: true,
                  }),
                ],
                { type: 'image/jpeg' }
              )
            );
          }.bind(this);
        }
        if (dicomWebConfig.thumbnailRendering === 'thumbnailDirect') {
          return function getThumbnailSrc() {
            return this.directURL({
              instance: instance,
              defaultPath: '/thumbnail',
              defaultType: 'image/jpeg',
              singlepart: true,
              tag: 'Absent',
            });
          }.bind(this);
        }

        if (dicomWebConfig.thumbnailRendering === 'thumbnail') {
          return async function getThumbnailSrc() {
            const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
            const bulkDataURI = `${dicomWebConfig.wadoRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/${SOPInstanceUID}/thumbnail?accept=image/jpeg`;
            return URL.createObjectURL(
              new Blob(
                [
                  await this.bulkDataURI({
                    BulkDataURI: bulkDataURI.replace('wadors:', ''),
                    defaultType: 'image/jpeg',
                    mediaTypes: ['image/jpeg'],
                    thumbnail: true,
                  }),
                ],
                { type: 'image/jpeg' }
              )
            );
          }.bind(this);
        }
        if (dicomWebConfig.thumbnailRendering === 'rendered') {
          return async function getThumbnailSrc() {
            const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
            const bulkDataURI = `${dicomWebConfig.wadoRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/${SOPInstanceUID}/rendered?accept=image/jpeg`;
            return URL.createObjectURL(
              new Blob(
                [
                  await this.bulkDataURI({
                    BulkDataURI: bulkDataURI.replace('wadors:', ''),
                    defaultType: 'image/jpeg',
                    mediaTypes: ['image/jpeg'],
                    thumbnail: true,
                  }),
                ],
                { type: 'image/jpeg' }
              )
            );
          }.bind(this);
        }
      },

      directURL: params => {
        return getDirectURL(
          {
            wadoRoot: dicomWebConfig.wadoRoot,
            singlepart: dicomWebConfig.singlepart,
          },
          params
        );
      },
      /**
       * Provide direct access to the dicom web client for certain use cases
       * where the dicom web client is used by an external library such as the
       * microscopy viewer.
       * Note this instance only needs to support the wado queries, and may not
       * support any QIDO or STOW operations.
       */
      getWadoDicomWebClient: () => wadoDicomWebClient,

      bulkDataURI: async ({ StudyInstanceUID, BulkDataURI }) => {
        qidoDicomWebClient.headers = getAuthorizationHeader();
        const options = {
          multipart: false,
          BulkDataURI,
          StudyInstanceUID,
        };
        return qidoDicomWebClient.retrieveBulkData(options).then(val => {
          const ret = (val && val[0]) || undefined;
          return ret;
        });
      },
      series: {
        metadata: async ({
          StudyInstanceUID,
          filters,
          sortCriteria,
          sortFunction,
          madeInClient = false,
          returnPromises = false,
        } = {}) => {
          if (!StudyInstanceUID) {
            throw new Error('Unable to query for SeriesMetadata without StudyInstanceUID');
          }

          if (dicomWebConfig.enableStudyLazyLoad) {
            return implementation._retrieveSeriesMetadataAsync(
              StudyInstanceUID,
              filters,
              sortCriteria,
              sortFunction,
              madeInClient,
              returnPromises
            );
          }

          return implementation._retrieveSeriesMetadataSync(
            StudyInstanceUID,
            filters,
            sortCriteria,
            sortFunction,
            madeInClient
          );
        },
      },
    },

    store: {
      dicom: async (dataset, request, dicomDict) => {
        wadoDicomWebClient.headers = getAuthorizationHeader();
        if (dataset instanceof ArrayBuffer) {
          const options = {
            datasets: [dataset],
            request,
          };
          await wadoDicomWebClient.storeInstances(options);
        } else {
          let effectiveDicomDict = dicomDict;

          if (!dicomDict) {
            const meta = {
              FileMetaInformationVersion: dataset._meta?.FileMetaInformationVersion?.Value,
              MediaStorageSOPClassUID: dataset.SOPClassUID,
              MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
              TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
              ImplementationClassUID,
              ImplementationVersionName,
            };

            const denaturalized = denaturalizeDataset(meta);
            const defaultDicomDict = new DicomDict(denaturalized);
            defaultDicomDict.dict = denaturalizeDataset(dataset);

            effectiveDicomDict = defaultDicomDict;
          }

          const part10Buffer = effectiveDicomDict.write();

          const options = {
            datasets: [part10Buffer],
            request,
          };

          await wadoDicomWebClient.storeInstances(options);
        }
      },
    },

    _retrieveSeriesMetadataSync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient
    ) => {
      const enableStudyLazyLoad = false;
      wadoDicomWebClient.headers = generateWadoHeader(excludeTransferSyntax);
      // data is all SOPInstanceUIDs
      const data = await retrieveStudyMetadata(
        wadoDicomWebClient,
        StudyInstanceUID,
        enableStudyLazyLoad,
        filters,
        sortCriteria,
        sortFunction,
        dicomWebConfig
      );

      // first naturalize the data
      const naturalizedInstancesMetadata = data.map(naturalizeDataset);

      const seriesSummaryMetadata = {};
      const instancesPerSeries = {};

      // Check if config requests HTJ2K transfer syntax
      const forceHTJ2K = isHTJ2KTransferSyntax(dicomWebConfig.requestTransferSyntaxUID);

      naturalizedInstancesMetadata.forEach(instance => {
        if (!seriesSummaryMetadata[instance.SeriesInstanceUID]) {
          seriesSummaryMetadata[instance.SeriesInstanceUID] = {
            StudyInstanceUID: instance.StudyInstanceUID,
            StudyDescription: instance.StudyDescription,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SeriesDescription: instance.SeriesDescription,
            SeriesNumber: instance.SeriesNumber,
            SeriesTime: instance.SeriesTime,
            SOPClassUID: instance.SOPClassUID,
            ProtocolName: instance.ProtocolName,
            Modality: instance.Modality,
          };
        }

        if (!instancesPerSeries[instance.SeriesInstanceUID]) {
          instancesPerSeries[instance.SeriesInstanceUID] = [];
        }

        const imageId = implementation.getImageIdsForInstance({
          instance,
        });

        instance.imageId = imageId;
        instance.wadoRoot = dicomWebConfig.wadoRoot;
        instance.wadoUri = dicomWebConfig.wadoUri;

        metadataProvider.addImageIdToUIDs(imageId, {
          StudyInstanceUID,
          SeriesInstanceUID: instance.SeriesInstanceUID,
          SOPInstanceUID: instance.SOPInstanceUID,
        });

        // Apply HTJ2K Level 2 metadata adjustments via MetadataProvider
        // This ensures Cornerstone uses adjusted dimensions for rendering
        // while instance object retains original metadata for SR generation
        // forceHTJ2K is true when config.requestTransferSyntaxUID is HTJ2K (handles missing TransferSyntaxUID in metadata)
        try {
          const adjustedImagePixelModule = getAdjustedImagePixelModule(instance, forceHTJ2K);
          if (adjustedImagePixelModule) {
            metadataProvider.addCustomMetadata(
              imageId,
              'imagePixelModule',
              adjustedImagePixelModule
            );
            // console.log(
            //   `[HTJ2K-DICOMweb] ${imageId} imagePixelModule adjusted to ${adjustedImagePixelModule.rows}x${adjustedImagePixelModule.columns}`
            // );
          }

          const adjustedImagePlaneModule = getAdjustedImagePlaneModule(instance, forceHTJ2K);
          if (adjustedImagePlaneModule) {
            metadataProvider.addCustomMetadata(
              imageId,
              'imagePlaneModule',
              adjustedImagePlaneModule
            );
            // console.log(
            //   `[HTJ2K-DICOMweb] ${imageId} imagePlaneModule spacing adjusted to [${adjustedImagePlaneModule.pixelSpacing}]`
            // );
          }
        } catch (error) {
          console.error('[HTJ2K-DICOMweb] Error adjusting metadata:', error);
          // Continue without adjustment - don't break file loading
        }

        instancesPerSeries[instance.SeriesInstanceUID].push(instance);
      });

      // grab all the series metadata
      const seriesMetadata = Object.values(seriesSummaryMetadata);
      DicomMetadataStore.addSeriesMetadata(seriesMetadata, madeInClient);

      Object.keys(instancesPerSeries).forEach(seriesInstanceUID =>
        DicomMetadataStore.addInstances(instancesPerSeries[seriesInstanceUID], madeInClient)
      );

      return seriesSummaryMetadata;
    },

    _retrieveSeriesMetadataAsync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient = false,
      returnPromises = false
    ) => {
      const enableStudyLazyLoad = true;
      wadoDicomWebClient.headers = generateWadoHeader(excludeTransferSyntax);
      // Get Series
      const { preLoadData: seriesSummaryMetadata, promises: seriesPromises } =
        await retrieveStudyMetadata(
          wadoDicomWebClient,
          StudyInstanceUID,
          enableStudyLazyLoad,
          filters,
          sortCriteria,
          sortFunction,
          dicomWebConfig
        );

      /**
       * Adds the retrieve bulkdata function to naturalized DICOM data.
       * This is done recursively, for sub-sequences.
       */
      const addRetrieveBulkDataNaturalized = (naturalized, instance = naturalized) => {
        if (!naturalized) {
          return naturalized;
        }
        for (const key of Object.keys(naturalized)) {
          const value = naturalized[key];

          if (Array.isArray(value) && typeof value[0] === 'object') {
            // Fix recursive values
            const validValues = value.filter(Boolean);
            validValues.forEach(child => addRetrieveBulkDataNaturalized(child, instance));
            continue;
          }

          // The value.Value will be set with the bulkdata read value
          // in which case it isn't necessary to re-read this.
          if (value && value.BulkDataURI && !value.Value) {
            // handle the scenarios where bulkDataURI is relative path
            fixBulkDataURI(value, instance, dicomWebConfig);
            // Provide a method to fetch bulkdata
            value.retrieveBulkData = retrieveBulkData.bind(qidoDicomWebClient, value);
          }
        }
        return naturalized;
      };

      /**
       * naturalizes the dataset, and adds a retrieve bulkdata method
       * to any values containing BulkDataURI.
       * @param {*} instance
       * @returns naturalized dataset, with retrieveBulkData methods
       */
      const addRetrieveBulkData = instance => {
        const naturalized = naturalizeDataset(instance);

        // if we know the server doesn't use bulkDataURI, then don't
        if (!dicomWebConfig.bulkDataURI?.enabled) {
          return naturalized;
        }

        return addRetrieveBulkDataNaturalized(naturalized);
      };

      // Async load series, store as retrieved
      function storeInstances(instances) {
        const naturalizedInstances = instances.map(addRetrieveBulkData);

        // Check if config requests HTJ2K transfer syntax
        const forceHTJ2K = isHTJ2KTransferSyntax(dicomWebConfig.requestTransferSyntaxUID);

        // Adding instanceMetadata to OHIF MetadataProvider
        naturalizedInstances.forEach(instance => {
          instance.wadoRoot = dicomWebConfig.wadoRoot;
          instance.wadoUri = dicomWebConfig.wadoUri;

          const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
          const numberOfFrames = instance.NumberOfFrames || 1;
          // Process all frames consistently, whether single or multiframe
          for (let i = 0; i < numberOfFrames; i++) {
            const frameNumber = i + 1;
            const frameImageId = implementation.getImageIdsForInstance({
              instance,
              frame: frameNumber,
            });
            // Add imageId specific mapping to this data as the URL isn't necessarily WADO-URI.
            metadataProvider.addImageIdToUIDs(frameImageId, {
              StudyInstanceUID,
              SeriesInstanceUID,
              SOPInstanceUID,
              frameNumber: numberOfFrames > 1 ? frameNumber : undefined,
            });
          }

          // Adding imageId to each instance
          // Todo: This is not the best way I can think of to let external
          // metadata handlers know about the imageId that is stored in the store
          const imageId = implementation.getImageIdsForInstance({
            instance,
          });
          instance.imageId = imageId;

          // Apply HTJ2K Level 2 metadata adjustments via MetadataProvider
          // This ensures Cornerstone uses adjusted dimensions for rendering
          // while instance object retains original metadata for SR generation
          // forceHTJ2K is true when config.requestTransferSyntaxUID is HTJ2K (handles missing TransferSyntaxUID in metadata)
          try {
            const adjustedImagePixelModule = getAdjustedImagePixelModule(instance, forceHTJ2K);
            if (adjustedImagePixelModule) {
              metadataProvider.addCustomMetadata(
                imageId,
                'imagePixelModule',
                adjustedImagePixelModule
              );
              // console.log(
              //   `[HTJ2K-DICOMweb] ${imageId} imagePixelModule adjusted to ${adjustedImagePixelModule.rows}x${adjustedImagePixelModule.columns}`
              // );
            }

            const adjustedImagePlaneModule = getAdjustedImagePlaneModule(instance, forceHTJ2K);
            if (adjustedImagePlaneModule) {
              metadataProvider.addCustomMetadata(
                imageId,
                'imagePlaneModule',
                adjustedImagePlaneModule
              );
              // console.log(
              //   `[HTJ2K-DICOMweb] ${imageId} imagePlaneModule spacing adjusted to [${adjustedImagePlaneModule.pixelSpacing}]`
              // );
            }
          } catch (error) {
            console.error('[HTJ2K-DICOMweb] Error adjusting metadata:', error);
            // Continue without adjustment - don't break file loading
          }
        });

        DicomMetadataStore.addInstances(naturalizedInstances, madeInClient);
      }

      function setSuccessFlag() {
        const study = DicomMetadataStore.getStudy(StudyInstanceUID);
        if (!study) {
          return;
        }
        study.isLoaded = true;
      }

      // Google Cloud Healthcare doesn't return StudyInstanceUID, so we need to add
      // it manually here
      seriesSummaryMetadata.forEach(aSeries => {
        aSeries.StudyInstanceUID = StudyInstanceUID;
      });

      DicomMetadataStore.addSeriesMetadata(seriesSummaryMetadata, madeInClient);

      const seriesDeliveredPromises = seriesPromises.map(promise => {
        if (!returnPromises) {
          promise?.start();
        }
        return promise.then(instances => {
          storeInstances(instances);
        });
      });

      if (returnPromises) {
        Promise.all(seriesDeliveredPromises).then(() => setSuccessFlag());
        return seriesPromises;
      } else {
        await Promise.all(seriesDeliveredPromises);
        setSuccessFlag();
      }

      return seriesSummaryMetadata;
    },
    deleteStudyMetadataPromise,
    getImageIdsForDisplaySet(displaySet) {
      const images = displaySet.images;
      const imageIds = [];

      if (!images) {
        return imageIds;
      }

      displaySet.images.forEach(instance => {
        const NumberOfFrames = instance.NumberOfFrames;

        if (NumberOfFrames > 1) {
          for (let frame = 1; frame <= NumberOfFrames; frame++) {
            const imageId = this.getImageIdsForInstance({
              instance,
              frame,
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
    getImageIdsForInstance({ instance, frame = undefined }) {
      const imageIds = getImageId({
        instance,
        frame,
        config: dicomWebConfig,
      });
      return imageIds;
    },
    getConfig() {
      return dicomWebConfigCopy;
    },
    getStudyInstanceUIDs({ params, query }) {
      const paramsStudyInstanceUIDs = params.StudyInstanceUIDs || params.studyInstanceUIDs;

      const queryStudyInstanceUIDs = utils.splitComma(
        query.getAll('StudyInstanceUIDs').concat(query.getAll('studyInstanceUIDs'))
      );

      const StudyInstanceUIDs =
        (queryStudyInstanceUIDs.length && queryStudyInstanceUIDs) || paramsStudyInstanceUIDs;
      const StudyInstanceUIDsAsArray =
        StudyInstanceUIDs && Array.isArray(StudyInstanceUIDs)
          ? StudyInstanceUIDs
          : [StudyInstanceUIDs];

      return StudyInstanceUIDsAsArray;
    },
  };

  if (dicomWebConfig.supportsReject) {
    implementation.reject = dcm4cheeReject(dicomWebConfig.wadoRoot, getAuthorizationHeader);
  }

  return IWebApiDataSource.create(implementation);
}

/**
 * A bindable function that retrieves the bulk data against this as the
 * dicomweb client, and on the given value element.
 *
 * @param value - a bind value that stores the retrieve value to short circuit the
 *    next retrieve instance.
 * @param options - to allow specifying the content type.
 */
function retrieveBulkData(value, options = {}) {
  const { mediaType } = options;
  const useOptions = {
    // The bulkdata fetches work with either multipart or
    // singlepart, so set multipart to false to let the server
    // decide which type to respond with.
    multipart: false,
    BulkDataURI: value.BulkDataURI,
    mediaTypes: mediaType ? [{ mediaType }, { mediaType: 'application/octet-stream' }] : undefined,
    ...options,
  };
  return this.retrieveBulkData(useOptions).then(val => {
    // There are DICOM PDF cases where the first ArrayBuffer in the array is
    // the bulk data and DICOM video cases where the second ArrayBuffer is
    // the bulk data. Here we play it safe and do a find.
    const ret =
      (val instanceof Array && val.find(arrayBuffer => arrayBuffer?.byteLength)) || undefined;
    value.Value = ret;
    return ret;
  });
}

export { createDicomWebApi };
