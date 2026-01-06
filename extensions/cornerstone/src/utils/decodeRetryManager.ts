/**
 * HTJ2K Decode Retry Manager
 *
 * @description
 * WASM 힙 메모리 부족으로 인한 디코딩 실패 시 재시도를 관리합니다.
 * "Couldn't process because" 오류는 OpenJPH WASM의 메모리 할당 실패를 나타내며,
 * 동시 디코딩 수가 줄어들면 성공할 수 있습니다.
 *
 * 전략:
 * 1. 디코딩 실패 감지 (에러 메시지 패턴 매칭)
 * 2. 지수 백오프로 재시도 (100ms → 200ms → 400ms)
 * 3. 최대 3회 재시도 후 포기
 * 4. 동시 재시도 수 제한 (WASM 힙 압박 방지)
 */

import { htj2kLog } from './htj2kDebugLogger';
import { getWebWorkerManager } from '@cornerstonejs/core';

/** WASM 오류 카운터 (워커 재시작 결정용) */
let wasmErrorCount = 0;
let lastWorkerRestartTime = 0;
const WASM_ERROR_THRESHOLD = 5; // 연속 5회 오류 시 워커 재시작
const MIN_RESTART_INTERVAL_MS = 3000; // 최소 3초 간격으로 재시작

/** 누적 디코딩 카운터 (주기적 워커 재시작용) */
let totalDecodeCount = 0;
const DECODE_COUNT_THRESHOLD = 100; // 100회 디코딩마다 워커 재시작 검토

/**
 * WASM 오류 발생 시 워커 재시작 (필요한 경우)
 *
 * @description
 * 연속 WASM 오류가 임계치를 초과하면 워커를 재시작하여 WASM 힙을 리셋합니다.
 */
export function handleWasmError(): void {
  wasmErrorCount++;
  const now = Date.now();

  console.log(`[DecodeRetryManager] 🚨 WASM error count: ${wasmErrorCount}/${WASM_ERROR_THRESHOLD}`);

  // 임계치 초과 및 최소 간격 확인
  if (wasmErrorCount >= WASM_ERROR_THRESHOLD && (now - lastWorkerRestartTime) > MIN_RESTART_INTERVAL_MS) {
    console.log(`[DecodeRetryManager] 🔄 WASM error threshold exceeded, restarting workers...`);

    try {
      const workerManager = getWebWorkerManager();
      if (workerManager && typeof workerManager.terminate === 'function') {
        workerManager.terminate('dicomImageLoader');
        console.log(`[DecodeRetryManager] ✅ Workers terminated, WASM heap will reset on next decode`);
        lastWorkerRestartTime = now;
        wasmErrorCount = 0; // 카운터 리셋
      }
    } catch (e) {
      console.warn('[DecodeRetryManager] Failed to restart workers:', e);
    }
  }
}

/**
 * WASM 오류 카운터 리셋 (성공적인 디코딩 후)
 */
export function resetWasmErrorCount(): void {
  if (wasmErrorCount > 0) {
    // 로그 비활성화 - 매 이미지마다 호출되어 성능 저하
    // console.log(`[DecodeRetryManager] ✅ Reset WASM error count (was ${wasmErrorCount})`);
    wasmErrorCount = 0;
  }
}

/**
 * 디코딩 완료 시 호출 - 누적 카운터 증가 (모니터링용)
 *
 * @description
 * Stack 스크롤 등으로 디코딩 횟수를 추적합니다.
 *
 * ⚠️ 주기적 워커 재시작은 비활성화됨:
 * Volume 로딩 중 워커 재시작 시 로딩이 중단되어 MPR이 표시되지 않는 문제 발생.
 * 워커 재시작은 시리즈 변경 시에만 안전하게 수행됨.
 *
 * @returns 항상 false (워커 재시작하지 않음)
 */
export function incrementDecodeCount(): boolean {
  totalDecodeCount++;
  // 로그 비활성화 - 성능 저하 방지
  return false;
}

/**
 * 디코딩 카운터 리셋 (시리즈 변경 시)
 */
export function resetDecodeCount(): void {
  if (totalDecodeCount > 0) {
    console.log(`[DecodeRetryManager] 🔄 Reset decode count (was ${totalDecodeCount})`);
    totalDecodeCount = 0;
  }
}

/**
 * 현재 디코딩 카운터 조회
 */
export function getDecodeCount(): number {
  return totalDecodeCount;
}

/**
 * WASM 오류 이벤트 리스너 설정
 *
 * @description
 * loadImage.js에서 발생하는 'htj2k-wasm-error' 이벤트를 수신하여
 * 워커 재시작을 트리거합니다.
 */
let wasmErrorListenerInstalled = false;

export function installWasmErrorListener(): void {
  if (wasmErrorListenerInstalled || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('htj2k-wasm-error', (event: any) => {
    const detail = event?.detail;
    console.log(`[DecodeRetryManager] 📡 Received htj2k-wasm-error event:`, detail);
    handleWasmError();
  });

  wasmErrorListenerInstalled = true;
  console.log('[DecodeRetryManager] 🎧 WASM error event listener installed');
}

/** 재시도 설정 */
interface RetryConfig {
  /** 최대 재시도 횟수 */
  maxRetries: number;
  /** 초기 대기 시간 (ms) */
  initialDelayMs: number;
  /** 백오프 배율 */
  backoffMultiplier: number;
  /** 최대 대기 시간 (ms) */
  maxDelayMs: number;
  /** 동시 재시도 최대 수 */
  maxConcurrentRetries: number;
}

/** 기본 재시도 설정 */
const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 200,
  backoffMultiplier: 2,
  maxDelayMs: 2000,
  maxConcurrentRetries: 5,
};

/** 현재 재시도 중인 imageId 수 */
let currentRetryCount = 0;

/** 재시도 대기 큐 */
const retryQueue: Array<{
  imageId: string;
  attempt: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  loadFn: () => Promise<any>;
}> = [];

/** 큐 처리 중 여부 */
let isProcessingQueue = false;

/**
 * WASM 메모리 오류인지 확인
 *
 * @param error - 발생한 오류
 * @returns WASM 메모리 오류 여부
 */
export function isWasmMemoryError(error: any): boolean {
  if (!error) {
    return false;
  }

  const errorMessage = error.message || error.toString() || '';

  // OpenJPH WASM 메모리 오류 패턴
  // 콘솔에서 확인된 오류: "Couldn't decode 411377536", "Couldn't process because 411377536"
  const wasmErrorPatterns = [
    /Couldn't process because/i,
    /Couldn't decode/i,
    /RuntimeError: Aborted/i,
    /out of memory/i,
    /memory access out of bounds/i,
    /allocation failed/i,
    /Cannot enlarge memory/i,
    // 숫자만 있는 경우 (WASM 메모리 주소)
    /^\d{9,}$/,
  ];

  const isWasmError = wasmErrorPatterns.some(pattern => pattern.test(errorMessage));

  if (isWasmError) {
    console.log(`[DecodeRetryManager] 🔍 WASM error detected: "${errorMessage.substring(0, 100)}"`);
    // WASM 오류 발생 시 카운터 증가 및 워커 재시작 검토
    handleWasmError();
  }

  return isWasmError;
}

/**
 * 지연 후 Promise 반환
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 재시도 큐 처리
 */
async function processRetryQueue(): Promise<void> {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  while (retryQueue.length > 0 && currentRetryCount < DEFAULT_CONFIG.maxConcurrentRetries) {
    const item = retryQueue.shift();
    if (!item) {
      continue;
    }

    currentRetryCount++;

    // 지수 백오프 계산
    const delayMs = Math.min(
      DEFAULT_CONFIG.initialDelayMs * Math.pow(DEFAULT_CONFIG.backoffMultiplier, item.attempt - 1),
      DEFAULT_CONFIG.maxDelayMs
    );

    htj2kLog('decodeRetryManager', `⏳ Retry scheduled`, {
      imageId: item.imageId.substring(0, 50),
      attempt: item.attempt,
      delayMs,
      queueLength: retryQueue.length,
    });

    // 지연 후 재시도
    await delay(delayMs);

    try {
      const result = await item.loadFn();
      htj2kLog('decodeRetryManager', `✅ Retry successful`, {
        imageId: item.imageId.substring(0, 50),
        attempt: item.attempt,
      });
      item.resolve(result);
    } catch (retryError) {
      if (isWasmMemoryError(retryError) && item.attempt < DEFAULT_CONFIG.maxRetries) {
        // 다시 큐에 추가
        retryQueue.push({
          ...item,
          attempt: item.attempt + 1,
        });
        htj2kLog('decodeRetryManager', `🔄 Re-queued for retry`, {
          imageId: item.imageId.substring(0, 50),
          nextAttempt: item.attempt + 1,
        });
      } else {
        // 최대 재시도 초과 또는 다른 오류
        htj2kLog('decodeRetryManager', `❌ Retry failed permanently`, {
          imageId: item.imageId.substring(0, 50),
          attempt: item.attempt,
          error: retryError?.message || retryError,
        });
        item.reject(retryError);
      }
    } finally {
      currentRetryCount--;
    }
  }

  isProcessingQueue = false;

  // 큐에 아직 항목이 있으면 계속 처리
  if (retryQueue.length > 0) {
    setTimeout(() => processRetryQueue(), 50);
  }
}

/**
 * 디코딩 재시도 래퍼
 *
 * @description
 * 이미지 로드 함수를 래핑하여 WASM 메모리 오류 발생 시 자동 재시도합니다.
 *
 * @param imageId - 이미지 ID (로깅용)
 * @param loadFn - 실제 이미지 로드 함수
 * @returns 이미지 로드 Promise
 *
 * @example
 * ```typescript
 * const image = await withDecodeRetry(imageId, () => originalLoader(imageId, options));
 * ```
 */
export function withDecodeRetry<T>(
  imageId: string,
  loadFn: () => Promise<T>
): Promise<T> {
  return loadFn().catch(error => {
    if (isWasmMemoryError(error)) {
      htj2kLog('decodeRetryManager', `🚨 WASM memory error detected, queuing retry`, {
        imageId: imageId.substring(0, 50),
        error: error?.message?.substring(0, 100) || error,
      });

      // 재시도 큐에 추가
      return new Promise<T>((resolve, reject) => {
        retryQueue.push({
          imageId,
          attempt: 1,
          resolve,
          reject,
          loadFn,
        });

        // 큐 처리 시작
        processRetryQueue();
      });
    }

    // WASM 메모리 오류가 아니면 그대로 throw
    throw error;
  });
}

/**
 * 재시도 통계 조회
 */
export function getRetryStats(): {
  queueLength: number;
  currentRetries: number;
  maxConcurrent: number;
} {
  return {
    queueLength: retryQueue.length,
    currentRetries: currentRetryCount,
    maxConcurrent: DEFAULT_CONFIG.maxConcurrentRetries,
  };
}

/**
 * 재시도 큐 클리어 (테스트용)
 */
export function clearRetryQueue(): void {
  while (retryQueue.length > 0) {
    const item = retryQueue.shift();
    if (item) {
      item.reject(new Error('Retry queue cleared'));
    }
  }
  currentRetryCount = 0;
}
