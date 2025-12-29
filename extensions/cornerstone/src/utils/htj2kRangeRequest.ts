/**
 * HTJ2K Range Request 유틸리티
 *
 * @description
 * HTJ2K Progressive Decoding을 위한 HTTP Range Request 기능을 제공합니다.
 * decodeLevel에 따라 필요한 바이트만 요청하여 대역폭을 최적화합니다.
 *
 * 이 파일은 async 함수를 포함하며, 동기 함수는 htj2kRangeRequestCore.ts에서 re-export합니다.
 *
 * @see https://tools.ietf.org/html/rfc7233 - HTTP Range Requests
 * @see document/htj2k-range-request-work-order.md - 작업 지시서
 */

// Core 모듈에서 동기 함수와 타입들 re-export
export {
  RangeRequestConfig,
  RangeByDecodeLevel,
  DEFAULT_RANGE_CONFIG,
  initRangeRequestConfig,
  getRangeRequestConfig,
  isRangeRequestEnabled,
  calculateInitialRangeBytes,
  calculateRetryRangeBytes,
  addRangeRequestToRetrieveOptions,
  updateRangeRequestConfig,
  resetRangeRequestConfig,
} from './htj2kRangeRequestCore';

import {
  getRangeRequestConfig,
  isRangeRequestEnabled,
  calculateInitialRangeBytes,
  calculateRetryRangeBytes,
} from './htj2kRangeRequestCore';

/**
 * Range Request로 데이터 가져오기
 *
 * @param url - 요청 URL
 * @param rangeEnd - Range 끝 바이트 (0부터 시작)
 * @param headers - 추가 헤더
 * @returns fetch Response 객체
 *
 * @throws Error - 네트워크 오류 또는 타임아웃
 *
 * @example
 * ```typescript
 * const response = await fetchWithRange(
 *   'https://server/dicom/image.jph',
 *   100000,
 *   { 'Accept': 'application/octet-stream' }
 * );
 *
 * if (response.status === 206) {
 *   console.log('Partial content received');
 *   const contentRange = response.headers.get('Content-Range');
 *   // "bytes 0-100000/1500000"
 * }
 * ```
 */
export async function fetchWithRange(
  url: string,
  rangeEnd: number,
  headers: Record<string, string> = {}
): Promise<Response> {
  const rangeConfig = getRangeRequestConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), rangeConfig.timeout);

  try {
    const response = await fetch(url, {
      headers: {
        ...headers,
        Range: `bytes=0-${rangeEnd}`,
      },
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 적응형 Range Request 수행
 *
 * @description
 * 초기 Range로 요청 후, 데이터가 불충분하면 자동으로 확장하여 재요청합니다.
 * 최대 재시도 횟수까지 시도하며, 모두 실패하면 전체 파일을 다운로드합니다.
 *
 * @param url - 요청 URL
 * @param decodeLevel - 목표 디코딩 레벨
 * @param headers - 추가 헤더
 * @param onProgress - 진행 콜백 (선택)
 * @returns ArrayBuffer와 메타데이터
 *
 * @throws Error - 모든 재시도 실패 및 전체 다운로드도 실패 시
 *
 * @example
 * ```typescript
 * try {
 *   const result = await adaptiveRangeRequest(
 *     'https://server/dicom/image.jph',
 *     2, // 1/4 resolution
 *     { 'Accept': 'multipart/related' }
 *   );
 *
 *   console.log(`Downloaded ${result.bytesDownloaded} of ${result.totalBytes} bytes`);
 *   console.log(`Retries: ${result.retryCount}`);
 *
 *   // result.data를 사용하여 디코딩
 * } catch (error) {
 *   console.error('Range request failed:', error);
 * }
 * ```
 */
export async function adaptiveRangeRequest(
  url: string,
  decodeLevel: number,
  headers: Record<string, string> = {},
  onProgress?: (info: { bytesDownloaded: number; totalBytes?: number; retryCount: number }) => void
): Promise<{
  data: ArrayBuffer;
  bytesDownloaded: number;
  totalBytes: number | undefined;
  retryCount: number;
  usedFullDownload: boolean;
}> {
  const rangeConfig = getRangeRequestConfig();

  // decodeLevel 0이거나 Range Request 비활성화 시 전체 다운로드
  if (decodeLevel === 0 || !isRangeRequestEnabled()) {
    const response = await fetch(url, { headers });
    const data = await response.arrayBuffer();
    return {
      data,
      bytesDownloaded: data.byteLength,
      totalBytes: data.byteLength,
      retryCount: 0,
      usedFullDownload: true,
    };
  }

  let currentRangeBytes = calculateInitialRangeBytes(decodeLevel);
  if (!currentRangeBytes) {
    // fallback to full download
    const response = await fetch(url, { headers });
    const data = await response.arrayBuffer();
    return {
      data,
      bytesDownloaded: data.byteLength,
      totalBytes: data.byteLength,
      retryCount: 0,
      usedFullDownload: true,
    };
  }

  let retryCount = 0;
  let totalBytes: number | undefined;

  while (retryCount <= rangeConfig.maxRetries) {
    try {
      const response = await fetchWithRange(url, currentRangeBytes, headers);

      // 서버가 Range Request를 지원하는지 확인
      if (response.status === 200) {
        // 서버가 Range를 무시하고 전체 파일 반환
        const data = await response.arrayBuffer();
        return {
          data,
          bytesDownloaded: data.byteLength,
          totalBytes: data.byteLength,
          retryCount,
          usedFullDownload: true,
        };
      }

      if (response.status === 206) {
        // Partial Content - Range Request 성공
        const contentRange = response.headers.get('Content-Range');
        if (contentRange) {
          // "bytes 0-100000/1500000" 형식에서 전체 크기 추출
          const match = contentRange.match(/\/(\d+)/);
          if (match) {
            totalBytes = parseInt(match[1], 10);
          }
        }

        const data = await response.arrayBuffer();

        onProgress?.({
          bytesDownloaded: data.byteLength,
          totalBytes,
          retryCount,
        });

        return {
          data,
          bytesDownloaded: data.byteLength,
          totalBytes,
          retryCount,
          usedFullDownload: false,
        };
      }

      // 다른 상태 코드는 오류로 처리
      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error) {
      if (!rangeConfig.adaptiveRetry || retryCount >= rangeConfig.maxRetries) {
        // 재시도 비활성화 또는 최대 재시도 도달 - 전체 다운로드 시도
        console.warn(
          `[HTJ2K-RangeRequest] Range request failed after ${retryCount} retries, falling back to full download`
        );

        const response = await fetch(url, { headers });
        const data = await response.arrayBuffer();
        return {
          data,
          bytesDownloaded: data.byteLength,
          totalBytes: data.byteLength,
          retryCount,
          usedFullDownload: true,
        };
      }

      // 재시도: 바이트 크기 확장
      retryCount++;
      currentRangeBytes = calculateRetryRangeBytes(currentRangeBytes, 1);

      console.log(
        `[HTJ2K-RangeRequest] Retry ${retryCount}/${rangeConfig.maxRetries} with ${currentRangeBytes} bytes`
      );
    }
  }

  // 이론상 도달하지 않음 (위의 while 루프에서 반환됨)
  throw new Error('[HTJ2K-RangeRequest] Unexpected code path');
}

/**
 * Range Request 지원 여부 테스트
 *
 * @description
 * HEAD 요청으로 서버가 Range Request를 지원하는지 확인합니다.
 * Accept-Ranges 헤더가 'bytes'이면 지원합니다.
 *
 * @param url - 테스트할 URL
 * @returns 지원 여부와 전체 파일 크기
 *
 * @example
 * ```typescript
 * const support = await testRangeRequestSupport('https://server/dicom/image.jph');
 *
 * if (support.supported) {
 *   console.log(`Server supports Range Request, file size: ${support.contentLength}`);
 * } else {
 *   console.log('Server does not support Range Request');
 * }
 * ```
 */
export async function testRangeRequestSupport(
  url: string
): Promise<{ supported: boolean; contentLength: number | undefined }> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
    });

    const acceptRanges = response.headers.get('Accept-Ranges');
    const contentLength = response.headers.get('Content-Length');

    return {
      supported: acceptRanges === 'bytes',
      contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
    };
  } catch {
    return {
      supported: false,
      contentLength: undefined,
    };
  }
}
