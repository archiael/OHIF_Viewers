/** @type {AppTypes.Config} */

window.config = {
  name: 'config/default.js',
  routerBasename: null,
  // whiteLabeling: {},
  extensions: [],
  modes: ['@ohif/mode-usmpr'],
  customizationService: {},
  showStudyList: true,
  investigationalUseDialog: {
    option: 'never',
  },
  // Cornerstone 캐시 크기 (1GB) - 메모리 최적화: 2GB → 1GB
  // Volume viewport (Level 2): ~50MB per 100-slice series
  // Stack viewport (Level 0): ~100MB (20 images)
  // Rendering overhead: ~50MB
  // Total: ~250MB per series, 1GB allows 3-4 series cached safely
  maxCacheSize: 1024 * 1024 * 1024,
  // Optimized for HTJ2K performance - use more web workers for parallel decoding
  maxNumberOfWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,
  // Increased for HTJ2K parallel decoding performance
  maxNumRequests: {
    interaction: 150,
    thumbnail: 100,
    // Prefetch number is dependent on the http protocol. For http 2 or
    // above, the number of requests can be go a lot higher.
    prefetch: 50,
    // Compute requests for volume loading
    compute: 50,
  },
  showErrorDetails: 'always', // 'always', 'dev', 'production'
  // filterQueryParam: false,

  // HTJ2K Progressive Decoding 설정
  // decodeLevel: 0=Full(100%), 1=1/2(50%), 2=1/4(25%), 3=1/8(12.5%)
  htj2k: {
    enabled: true, // HTJ2K 기능 활성화
    enabledModes: ['usmpr'], // HTJ2K Level 2 metadata adjustment를 적용할 모드 (basic 모드는 원본 OHIF처럼 동작)
    volumeDecodeLevel: 2, // Volume(MPR)용 decodeLevel - 2=1/4 해상도 (빠른 로딩)
    stackDecodeLevel: 0, // Stack(Axial)용 초기 decodeLevel - 0=Full (Range Request 비활성화)
    stackFullResolutionOnScroll: true, // 스크롤 시 Full Resolution으로 전환
    streaming: false, // fetch streaming 비활성화 (HTJ2K 메모리 오류 발생)

    // Server API 설정 (Progressive Network Loading)
    // 서버가 ?level=N, ?complement=N 파라미터를 지원하면 활성화
    // 1차: ?level=2 → ~100KB, 2차: ?complement=2 → ~550KB
    serverApi: {
      // TODO: [HTJ2K 서버 Level 파라미터 기능 완료 후] enabled를 true로 변경
      // 현재 문제: 서버가 Level=2 파라미터를 받으면 고해상도 이미지가 완전히 전송될 때까지 뷰어에 표시 안 됨
      // 서버 수정 완료 후: enabled: true로 변경하면 DICOM fetch 시 ?level=2 파라미터가 URL에 추가됨
      //                  예: GET /frames/1?level=2 (현재는 GET /frames/1 로만 요청)
      enabled: false, // 서버 지원 확인 후 true로 변경
      levelParam: 'level',
      complementParam: 'complement',
      volumeLevel: 2,
      autoDetect: true, // X-HTJ2K-Level 헤더로 자동 감지
    },

    // HTTP Range Request 설정 (대역폭 최적화)
    // decodeLevel > 0일 때 필요한 바이트만 다운로드
    rangeRequest: {
      enabled: false, // Range Request 비활성화 (디코딩 오류 테스트)
      adaptiveRetry: true, // 실패 시 자동 재시도 (바이트 크기 확장)
      maxRetries: 3, // 최대 재시도 횟수
      timeout: 30000, // 요청 타임아웃 (ms)
      retryMultiplier: 2.0, // 재시도 시 바이트 증가 배율

      // decodeLevel별 초기 요청 바이트 크기
      // HTJ2K RPCL 구조 기반, 안전 마진 포함
      // Level N 디코딩에 필요한 데이터 비율: (1/2)^(2*N) = Level 1: 25%, Level 2: 6.25%, Level 3: 1.56%
      initialRangeBytes: {
        1: 1500000, // 1.5MB for Level 1 (1/2 resolution, ~25% data needed)
        2: 500000,  // 500KB for Level 2 (1/4 resolution, ~6.25% data needed)
        3: 100000,  // 100KB for Level 3 (1/8 resolution, ~1.56% data needed)
      },
    },
  },

  // Defines multi-monitor layouts
  multimonitor: [
    {
      id: 'split',
      test: ({ multimonitor }) => multimonitor === 'split',
      screens: [
        {
          id: 'ohif0',
          screen: null,
          location: {
            screen: 0,
            width: 0.5,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
        {
          id: 'ohif1',
          screen: null,
          location: {
            width: 0.5,
            height: 1,
            left: 0.5,
            top: 0,
          },
          options: 'location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
      ],
    },

    {
      id: '2',
      test: ({ multimonitor }) => multimonitor === '2',
      screens: [
        {
          id: 'ohif0',
          screen: 0,
          location: {
            width: 1,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'fullscreen=yes,location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
        {
          id: 'ohif1',
          screen: 1,
          location: {
            width: 1,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'fullscreen=yes,location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
      ],
    },
  ],
  defaultDataSourceName: 'ohif',
  /* Dynamic config allows user to pass "configUrl" query string this allows to load config without recompiling application. The regex will ensure valid configuration source */
  // dangerouslyUseDynamicConfig: {
  //   enabled: true,
  //   // regex will ensure valid configuration source and default is /.*/ which matches any character. To use this, setup your own regex to choose a specific source of configuration only.
  //   // Example 1, to allow numbers and letters in an absolute or sub-path only.
  //   // regex: /(0-9A-Za-z.]+)(\/[0-9A-Za-z.]+)*/
  //   // Example 2, to restricts to either hosptial.com or othersite.com.
  //   // regex: /(https:\/\/hospital.com(\/[0-9A-Za-z.]+)*)|(https:\/\/othersite.com(\/[0-9A-Za-z.]+)*)/
  //   regex: /.*/,
  // },
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif',
      configuration: {
        friendlyName: 'AWS S3 Static wado server',
        name: 'aws',
        wadoUriRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: false,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // HTJ2K가 필요하면 'ohif-htj2k' DataSource 사용
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          transform: url => url.replace('/pixeldata.mp4', '/rendered'),
        },
        omitQuotationForMultipartRequest: true,
      },
    },

    // HTJ2K 지원 서버용 DataSource (USMPR 모드에서 사용)
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif-htj2k',
      configuration: {
        friendlyName: 'AWS S3 Static wado server (HTJ2K)',
        name: 'aws-htj2k',
        wadoUriRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: false,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // HTJ2K Transfer Syntax 명시적 요청 (HTJ2K 지원 서버 필수)
        requestTransferSyntaxUID: '1.2.840.10008.1.2.4.201',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          transform: url => url.replace('/pixeldata.mp4', '/rendered'),
        },
        omitQuotationForMultipartRequest: true,
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif2',
      configuration: {
        friendlyName: 'AWS S3 Static wado secondary server',
        name: 'aws',
        wadoUriRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // HTJ2K가 필요하면 'ohif-htj2k' DataSource 사용
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif3',
      configuration: {
        friendlyName: 'AWS S3 Static wado secondary server',
        name: 'aws',
        wadoUriRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        qidoRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        wadoRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // HTJ2K가 필요하면 'ohif-htj2k' DataSource 사용
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
        omitQuotationForMultipartRequest: true,
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'local5000',
      configuration: {
        friendlyName: 'Static WADO Local Data',
        name: 'DCM4CHEE',
        qidoRoot: 'http://localhost:5000/dicomweb',
        wadoRoot: 'http://localhost:5000/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: true,
        supportsStow: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthanc',
      configuration: {
        friendlyName: 'local Orthanc DICOMWeb Server',
        name: 'Orthanc',
        wadoUriRoot: 'http://localhost:8042/dicom-web',
        qidoRoot: 'http://localhost:8042/dicom-web',
        wadoRoot: 'http://localhost:8042/dicom-web',
        qidoSupportsIncludeField: true,
        supportsReject: true,
        dicomUploadEnabled: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: {
          enabled: true,
          // This is an example config that can be used to fix the retrieve URL
          // where it has the wrong prefix (eg a canned prefix).  It is better to
          // just use the correct prefix out of the box, but that is sometimes hard
          // when URLs go through several systems.
          // Example URLS are:
          // "BulkDataURI" : "http://localhost/dicom-web/studies/1.2.276.0.7230010.3.1.2.2344313775.14992.1458058363.6979/series/1.2.276.0.7230010.3.1.3.1901948703.36080.1484835349.617/instances/1.2.276.0.7230010.3.1.4.1901948703.36080.1484835349.618/bulk/00420011",
          // when running on http://localhost:3003 with no server running on localhost.  This can be corrected to:
          // /orthanc/dicom-web/studies/1.2.276.0.7230010.3.1.2.2344313775.14992.1458058363.6979/series/1.2.276.0.7230010.3.1.3.1901948703.36080.1484835349.617/instances/1.2.276.0.7230010.3.1.4.1901948703.36080.1484835349.618/bulk/00420011
          // which is a valid relative URL, and will result in using the http://localhost:3003/orthanc/.... path
          // startsWith: 'http://localhost/',
          // prefixWith: '/orthanc/',
        },
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomwebproxy',
      sourceName: 'dicomwebproxy',
      configuration: {
        friendlyName: 'dicomweb delegating proxy',
        name: 'dicomwebproxy',
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
  httpErrorHandler: error => {
    // This is 429 when rejected from the public idc sandbox too often.
    console.warn(error.status);

    // Could use services manager here to bring up a dialog/modal if needed.
    console.warn('test, navigate to https://ohif.org/');
  },
  // segmentation: {
  //   segmentLabel: {
  //     enabledByDefault: true,
  //     labelColor: [255, 255, 0, 1], // must be an array
  //     hoverTimeout: 1,
  //     background: 'rgba(100, 100, 100, 0.5)', // can be any valid css color
  //   },
  // },
  // whiteLabeling: {
  //   createLogoComponentFn: function (React) {
  //     return React.createElement(
  //       'a',
  //       {
  //         target: '_self',
  //         rel: 'noopener noreferrer',
  //         className: 'text-purple-600 line-through',
  //         href: '_X___IDC__LOGO__LINK___Y_',
  //       },
  //       React.createElement('img', {
  //         src: './Logo.svg',
  //         className: 'w-14 h-14',
  //       })
  //     );
  //   },
  // },
};
