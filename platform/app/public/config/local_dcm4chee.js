/** @type {AppTypes.Config} */
window.config = {
  routerBasename: '/worklist',
  showStudyList: true,
  investigationalUseDialog: {
    option: 'never',
  },
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  // Cornerstone 캐시 크기 (2GB) - 메모리 부족 시 LRU 정책으로 오래된 Volume 자동 해제
  maxCacheSize: 8 * 1024 * 1024 * 1024,
  // 웹 워커 수 (디코딩 병렬 처리)
  // CPU 코어 수에 맞춰 자동 설정, 최대 8개
  maxNumberOfWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),

  // 병렬 요청 수 설정 (HTJ2K 성능 최적화)
  // HTTP/2는 동일 도메인에 많은 병렬 연결 지원
  maxNumRequests: {
    interaction: 100, // 사용자 인터랙션 (스크롤, 줌 등)
    thumbnail: 50, // 썸네일 로딩
    prefetch: 30, // 백그라운드 프리로드
    compute: 50, // Volume 로딩
  },

  // HTJ2K Progressive Decoding 설정
  htj2k: {
    enabled: true, // ✅ HTJ2K 활성화
    enabledModes: ['usmpr'], // HTJ2K DataSource를 사용할 모드 (basic/viewer 모드는 일반 DataSource 사용)
    volumeDecodeLevel: 2, // 2=1/4 해상도 (빠른 Volume 로딩)
    stackDecodeLevel: 0, // 0=Full 해상도 (Stack은 원본 품질)
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
      enabled: true, // ✅ 서버 API 활성화됨
      levelParam: 'level', // URL 파라미터명 (?level=2)
      complementParam: 'complement', // URL 파라미터명 (?complement=2)
      volumeLevel: 2, // Volume 요청 시 Level (2=1/4 해상도)
      autoDetect: false, // X-HTJ2K-Level 헤더 감지 비활성화 (CORS 문제)
    },

    // Range Request 비활성화 - OpenJPH가 truncated HTJ2K 데이터를 지원하지 않음
    // 전체 파일 다운로드 후 decodeLevel로 1/4 해상도 디코딩
    rangeRequest: {
      enabled: false, // OpenJPH partial decode 미지원으로 비활성화
      adaptiveRetry: true,
      maxRetries: 3,
      timeout: 30000,
      retryMultiplier: 2.0,
      initialRangeBytes: {
        1: 1500000, // Level 1: ~1.5MB
        2: 500000, // Level 2: ~500KB
        3: 100000, // Level 3: ~100KB
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
        // 프록시 사용 (webpack dev server가 192.168.0.202:8080으로 프록시)
        wadoUriRoot: '/dicomweb',
        qidoRoot: '/dicomweb',
        wadoRoot: '/dicomweb',

        qidoSupportsIncludeField: true,

        // MVIEW PACS uses sessionId as query parameter for authentication
        defaultQueryParams: {
          sessionId: '',
        },
        imageRendering: 'wadors',
        enableStudyLazyLoad: true,
        thumbnailRendering: 'wadors',
        requestOptions: {
          auth: 'admin:admin',
        },
        dicomUploadEnabled: true,
        singlepart: 'pdf,video,image',
        // HTJ2K가 필요하면 'dicomweb-htj2k' DataSource 사용 (USMPR 모드에서 자동 선택)
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    // Mammography 전용 DataSource - JPEG Lossless 이미지를 Uncompressed로 변환 요청
    // 문제: jpeg-lossless-decoder-js가 12-bit Extended Resolution Mode(ERMF) 미지원
    // 해결: DCM4CHEE에 transfer-syntax=1.2.840.10008.1.2.1 요청 → 서버가 transcoding하여 Uncompressed 반환
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb-uncompressed',
      configuration: {
        friendlyName: 'DCM4CHEE Server (Uncompressed)',
        name: 'DCM4CHEE-Uncompressed',
        wadoUriRoot: '/dicomweb',
        qidoRoot: '/dicomweb',
        wadoRoot: '/dicomweb',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        enableStudyLazyLoad: true,
        thumbnailRendering: 'wadors',
        requestOptions: {
          auth: 'admin:admin',
        },
        dicomUploadEnabled: true,
        singlepart: 'pdf,video,image',
        // Uncompressed Explicit VR Little Endian 요청
        // DCM4CHEE가 JPEG Lossless를 서버 측에서 디코딩하여 반환
        // acceptHeader는 배열(string[])로 지정해야 generateAcceptHeader()가 올바르게 처리
        acceptHeader: [
          'multipart/related; type=application/octet-stream; transfer-syntax=1.2.840.10008.1.2.1',
        ],
        // 또는 requestTransferSyntaxUID로도 지정 가능 (acceptHeader가 비어있을 때 사용됨)
        requestTransferSyntaxUID: '1.2.840.10008.1.2.1',
        bulkDataURI: {
          enabled: true,
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    // HTJ2K 지원 DataSource (USMPR 모드에서 자동 선택)
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb-htj2k',
      configuration: {
        friendlyName: 'DCM4CHEE Server (HTJ2K)',
        name: 'DCM4CHEE-HTJ2K',
        // 프록시 사용
        wadoUriRoot: '/dicomweb',
        qidoRoot: '/dicomweb',
        wadoRoot: '/dicomweb',
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
