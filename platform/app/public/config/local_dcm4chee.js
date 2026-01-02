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
  // 웹 워커 수 (디코딩 병렬 처리)
  maxNumberOfWebWorkers: navigator.hardwareConcurrency || 8,

  // 병렬 요청 수 설정 (HTJ2K 성능 최적화)
  // HTTP/2는 동일 도메인에 많은 병렬 연결 지원
  maxNumRequests: {
    interaction: 200,  // 사용자 인터랙션 시 최대 병렬 요청
    thumbnail: 100,    // 썸네일 로딩
    prefetch: 100,     // 백그라운드 프리로드
  },

  // HTJ2K Progressive Decoding 설정
  htj2k: {
    enabled: true,   // ✅ HTJ2K 활성화
    volumeDecodeLevel: 2,  // 2=1/4 해상도 (빠른 Volume 로딩)
    stackDecodeLevel: 2,   // 2=초기 로딩도 1/4 해상도 (Volume 우선 로딩)
    stackFullResolutionOnScroll: true,
    streaming: false,

    // ==========================================================================
    // Server API 설정 (Progressive Network Loading)
    // ==========================================================================
    // 서버가 ?level=N, ?complement=N 파라미터를 지원하면 활성화
    // 지원 서버: dcm4chee 커스텀 빌드 (X-HTJ2K-Level 헤더 반환)
    //
    // 동작 방식:
    // 1차 요청: ?level=2 → ~100KB (Level 2까지 완전한 HTJ2K)
    // 2차 요청: ?complement=2 → ~550KB (Level 2 이후 데이터)
    // 병합: level2Data[:-2] + complementData + EOC = Full HTJ2K
    serverApi: {
      enabled: true,  // ✅ 서버 API 활성화됨
      levelParam: 'level',        // URL 파라미터명 (?level=2)
      complementParam: 'complement', // URL 파라미터명 (?complement=2)
      volumeLevel: 2,             // Volume 요청 시 Level (2=1/4 해상도)
      autoDetect: false,          // X-HTJ2K-Level 헤더 감지 비활성화 (CORS 문제)
    },

    // Range Request 비활성화 - OpenJPH가 truncated HTJ2K 데이터를 지원하지 않음
    // 전체 파일 다운로드 후 decodeLevel로 1/4 해상도 디코딩
    rangeRequest: {
      enabled: false,  // OpenJPH partial decode 미지원으로 비활성화
      adaptiveRetry: true,
      maxRetries: 3,
      timeout: 30000,
      retryMultiplier: 2.0,
      initialRangeBytes: {
        1: 1500000,   // Level 1: ~1.5MB
        2: 500000,    // Level 2: ~500KB
        3: 100000,    // Level 3: ~100KB
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
        // HTJ2K passthrough 요청
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
