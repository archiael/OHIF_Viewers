import { volumeLoader } from '@cornerstonejs/core';
import {
  cornerstoneStreamingImageVolumeLoader,
  cornerstoneStreamingDynamicImageVolumeLoader,
} from '@cornerstonejs/core/loaders';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { errorHandler, utils } from '@ohif/core';

const { registerVolumeLoader } = volumeLoader;

/**
 * Emscripten _setThrew Shim
 *
 * @description
 * @cornerstonejs/codec-openjph WASM 모듈에서 _setThrew 함수가 정의되지 않아
 * HTJ2K 디코딩 시 예외가 발생하면 "_setThrew is not defined" 오류가 발생합니다.
 *
 * 이 shim은 Emscripten의 예외 처리 메커니즘을 위한 fallback을 제공합니다.
 * - __THREW__: 예외 발생 여부 (0 = 정상, 1 = 예외 발생)
 * - __threwValue: 예외 값
 *
 * @see https://github.com/emscripten-core/emscripten/issues/15330
 * @see https://github.com/emscripten-core/emscripten/issues/22227
 */
(function installSetThrewShim() {
  if (typeof window !== 'undefined') {
    // 이미 정의되어 있으면 건너뛰기
    if (typeof window._setThrew === 'function') {
      console.log('[HTJ2K] _setThrew already defined');
      return;
    }

    // Emscripten 예외 상태 변수
    window.__THREW__ = 0;
    window.__threwValue = 0;

    /**
     * Emscripten _setThrew 함수 구현
     *
     * @param {number} threw - 예외 발생 여부 (0 또는 1)
     * @param {number} value - 예외 값
     */
    window._setThrew = function(threw, value) {
      if (window.__THREW__ === 0) {
        window.__THREW__ = threw;
        window.__threwValue = value;
      }
    };

    console.log('[HTJ2K] _setThrew shim installed for OpenJPH WASM exception handling');
  }
})();

export default function initWADOImageLoader(
  userAuthenticationService,
  appConfig,
  extensionManager
) {
  registerVolumeLoader('cornerstoneStreamingImageVolume', cornerstoneStreamingImageVolumeLoader);

  registerVolumeLoader(
    'cornerstoneStreamingDynamicImageVolume',
    cornerstoneStreamingDynamicImageVolumeLoader
  );

  dicomImageLoader.init({
    maxWebWorkers: Math.min(
      Math.max(navigator.hardwareConcurrency - 1, 1),
      appConfig.maxNumberOfWebWorkers
    ),
    beforeSend: function (xhr) {
      //TODO should be removed in the future and request emitted by DicomWebDataSource
      const sourceConfig = extensionManager.getActiveDataSource()?.[0].getConfig() ?? {};
      const headers = userAuthenticationService.getAuthorizationHeader();

      const acceptHeader = utils.generateAcceptHeader(
        sourceConfig.acceptHeader,
        sourceConfig.requestTransferSyntaxUID,
        sourceConfig.omitQuotationForMultipartRequest
      );

      const xhrRequestHeaders = {
        Accept: acceptHeader,
      };

      if (headers) {
        Object.assign(xhrRequestHeaders, headers);
      }

      return xhrRequestHeaders;
    },
    errorInterceptor: error => {
      const handler = errorHandler.getHTTPErrorHandler();
      if (typeof handler === 'function') {
        handler(error);
      } else {
        console.warn('[OHIF] WADO image load error:', error?.message || error);
      }
    },
  });

  console.log('[OHIF] WADO Image Loader initialized');
}

export function destroy() {
  console.debug('Destroying WADO Image Loader');
}
