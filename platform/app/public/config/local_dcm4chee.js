/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,

  // HTJ2K Progressive Decoding 설정
  htj2k: {
    enabled: true,
    volumeDecodeLevel: 2,
    stackDecodeLevel: 2,
    stackFullResolutionOnScroll: true,
    streaming: false,
    // Range Request 활성화 - _setThrew shim이 initWADOImageLoader.js에 설치됨
    rangeRequest: {
      enabled: true,  // HTTP Range Request로 부분 데이터만 먼저 로드
      adaptiveRetry: true,
      maxRetries: 3,
      timeout: 30000,
      retryMultiplier: 2.0,
      // Level별 초기 바이트 수 (HTJ2K progressive decoding)
      // Level 2: 저해상도 먼저 로드 → 이후 전체 해상도
      initialRangeBytes: {
        1: 500000,   // Level 1: ~500KB
        2: 100000,   // Level 2: ~100KB (빠른 초기 로드)
        3: 30000,    // Level 3: ~30KB (매우 빠른 썸네일용)
      },
    },
  },

  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'DCM4CHEE Server',
        name: 'DCM4CHEE',
        wadoUriRoot: 'http://192.168.10.237:8080/dicomweb',
        qidoRoot: 'http://192.168.10.237:8080/dicomweb',
        wadoRoot: 'http://192.168.10.237:8080/dicomweb',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        enableStudyLazyLoad: true,
        thumbnailRendering: 'wadors',
        requestOptions: {
          auth: 'admin:admin',
        },
        dicomUploadEnabled: true,
        singlepart: 'pdf,video,image',
        // singlepart 요청을 위한 Accept 헤더 (Range Request 지원에 필요)
        acceptHeader: ['application/octet-stream'],
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  studyListFunctionsEnabled: true,
};
