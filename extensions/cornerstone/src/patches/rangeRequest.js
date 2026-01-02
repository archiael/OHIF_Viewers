import { getOptions } from '@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/internal/options';
import metaDataManager from '@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadors/metaDataManager';
import extractMultipart from '@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadors/extractMultipart';
import { getImageQualityStatus } from '@cornerstonejs/dicom-image-loader/dist/esm/imageLoader/wadors/getImageQualityStatus';
export default function rangeRequest(url, imageId, defaultHeaders = {}, options = {}) {
    const globalOptions = getOptions();
    const { retrieveOptions = {}, streamingData } = options;
    const chunkSize = streamingData.chunkSize ||
        getValue(imageId, retrieveOptions, 'chunkSize') ||
        65536;
    // HTJ2K Range Request: Accept 헤더를 singlepart로 강제 설정
    // Range Request는 multipart 응답을 처리할 수 없으므로 application/octet-stream 사용
    console.log('[rangeRequest] ENTRY - defaultHeaders.Accept:', defaultHeaders.Accept);
    if (defaultHeaders.Accept && defaultHeaders.Accept.includes('multipart')) {
        defaultHeaders.Accept = 'application/octet-stream';
        console.log('[rangeRequest] Accept header forced to:', defaultHeaders.Accept);
    }
    console.log('[rangeRequest] creating errorInterceptor...');
    const errorInterceptor = (err) => {
        if (typeof globalOptions.errorInterceptor === 'function') {
            const error = new Error('request failed');
            globalOptions.errorInterceptor(error);
        }
        else {
            console.warn('rangeRequest:Caught', err);
        }
    };
    console.log('[rangeRequest] creating Promise...');
    const promise = new Promise(async (resolve, reject) => {
        console.log('[rangeRequest] Promise executor running');
        const headers = Object.assign({}, defaultHeaders);
        Object.keys(headers).forEach(function (key) {
            if (headers[key] === null || headers[key] === undefined) {
                delete headers[key];
            }
        });
        try {
            console.log('[rangeRequest] try block entered');
            if (!streamingData.encodedData) {
                streamingData.chunkSize = chunkSize;
                streamingData.rangesFetched = 0;
            }
            const byteRange = getByteRange(streamingData, retrieveOptions);
            console.log('[rangeRequest] byteRange:', byteRange);
            const { encodedData, responseHeaders } = await fetchRangeAndAppend(url, headers, byteRange, streamingData);
            console.log('[rangeRequest] fetchRangeAndAppend done, encodedData size:', encodedData?.byteLength);
            const contentType = responseHeaders.get('content-type');
            console.log('[rangeRequest] contentType:', contentType);
            const { totalBytes } = streamingData;
            const doneAllBytes = totalBytes === encodedData.byteLength;
            console.log('[rangeRequest] calling extractMultipart...');
            const extract = extractMultipart(contentType, encodedData, {
                isPartial: true,
            });
            console.log('[rangeRequest] extractMultipart done, pixelData size:', extract?.pixelData?.byteLength);
            const imageQualityStatus = getImageQualityStatus(retrieveOptions, doneAllBytes || extract.extractDone === true);
            // HTJ2K: retrieveOptions.decodeLevel을 명시적으로 전달
            // percentComplete 기반 계산을 방지하고 설정된 decodeLevel 사용
            const resultDecodeLevel = retrieveOptions.decodeLevel;
            console.log('[rangeRequest] resolve - decodeLevel:', resultDecodeLevel, 'imageQualityStatus:', imageQualityStatus);
            resolve({
                ...extract,
                imageQualityStatus,
                percentComplete: extract.extractDone
                    ? 100
                    : (encodedData.byteLength * 100) / totalBytes,
                decodeLevel: resultDecodeLevel,
            });
        }
        catch (err) {
            errorInterceptor(err);
            console.error(err);
            reject(err);
        }
    });
    return promise;
}
// HTJ2K Patch: fetch를 XHR로 교체 (WASM _setThrew 오류 방지)
// fetch API는 OpenJPH WASM 디코더에서 _setThrew is not defined 오류를 발생시킴
// XHR은 정상적으로 동작하므로 XHR 기반 구현으로 교체
async function fetchRangeAndAppend(url, headers, range, streamingData) {
    if (range) {
        headers = Object.assign(headers, {
            Range: `bytes=${range[0]}-${range[1]}`,
        });
    }
    console.log('[rangeRequest-XHR] Request Range:', range, 'URL:', url.substring(0, 80));
    let { encodedData } = streamingData;
    if (range[1] && encodedData?.byteLength > range[1]) {
        return streamingData;
    }
    // XHR 기반 Range Request (fetch 대신 사용)
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        // 헤더 설정
        Object.keys(headers).forEach((key) => {
            xhr.setRequestHeader(key, headers[key]);
        });
        xhr.onload = function () {
            console.log('[rangeRequest-XHR] Response status:', xhr.status);
            if (xhr.status >= 200 && xhr.status < 300) {
                const responseArrayBuffer = xhr.response;
                const responseTypedArray = new Uint8Array(responseArrayBuffer);
                let newByteArray;
                if (encodedData) {
                    newByteArray = new Uint8Array(encodedData.length + responseTypedArray.length);
                    newByteArray.set(encodedData, 0);
                    newByteArray.set(responseTypedArray, encodedData.length);
                    streamingData.rangesFetched = 1;
                } else {
                    newByteArray = new Uint8Array(responseTypedArray.length);
                    newByteArray.set(responseTypedArray, 0);
                    streamingData.rangesFetched++;
                }
                streamingData.encodedData = encodedData = newByteArray;
                // 헤더 처리를 위한 간단한 객체 (fetch Response.headers와 동일한 인터페이스)
                streamingData.responseHeaders = {
                    get: (name) => xhr.getResponseHeader(name)
                };
                const contentRange = xhr.getResponseHeader('Content-Range');
                if (contentRange) {
                    streamingData.totalBytes = Number(contentRange.split('/')[1]);
                } else if (xhr.status !== 206 || !range) {
                    streamingData.totalBytes = encodedData?.byteLength;
                } else if (range[1] === '' || encodedData?.length < range[1]) {
                    streamingData.totalBytes = encodedData.byteLength;
                } else {
                    streamingData.totalBytes = Number.MAX_SAFE_INTEGER;
                }
                console.log('[rangeRequest-XHR] Success - totalBytes:', streamingData.totalBytes, 'received:', encodedData.byteLength);
                resolve(streamingData);
            } else {
                reject(new Error(`XHR Range Request failed: ${xhr.status} ${xhr.statusText}`));
            }
        };
        xhr.onerror = function () {
            reject(new Error('XHR Range Request network error'));
        };
        xhr.send();
    });
}
function getValue(imageId, src, attr) {
    const value = src[attr];
    if (typeof value !== 'function') {
        return value;
    }
    const metaData = metaDataManager.get(imageId);
    return value(metaData, imageId);
}
function getByteRange(streamingData, retrieveOptions) {
    const { totalBytes, encodedData, chunkSize = 65536 } = streamingData;
    const { rangeIndex = 0 } = retrieveOptions;
    if (rangeIndex === -1 && (!totalBytes || !encodedData)) {
        return [0, ''];
    }
    if (rangeIndex === -1 || encodedData?.byteLength > totalBytes - chunkSize) {
        return [encodedData?.byteLength || 0, ''];
    }
    return [encodedData?.byteLength || 0, chunkSize * (rangeIndex + 1) - 1];
}
