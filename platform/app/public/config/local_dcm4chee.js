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
    enabled: true,   // ✅ HTJ2K 활성화
    volumeDecodeLevel: 2,  // 2=1/4 해상도 (빠른 Volume 로딩)
    stackDecodeLevel: 0,   // 0=Full 해상도 (고화질 진단)
    stackFullResolutionOnScroll: true,
    streaming: false,
    // Range Request 비활성화 - DCM4CHEE 서버 HTJ2K progressive 미지원으로 추정
    rangeRequest: {
      enabled: false,  // ❌ 비활성화 (서버가 HTJ2K progressive 미지원)
      adaptiveRetry: true,
      maxRetries: 3,
      timeout: 30000,
      retryMultiplier: 2.0,
      initialRangeBytes: {
        1: 1500000,
        2: 500000,
        3: 100000,
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
        // HTJ2K passthrough 요청 (Range Request 없이 전체 다운로드)
        acceptHeader: 'multipart/related; type=image/jph',
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
