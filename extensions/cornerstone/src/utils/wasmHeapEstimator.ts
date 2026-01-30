/**
 * WASM Heap Estimator
 *
 * @description
 * HTJ2K WASM decoder의 heap 사용량을 decode operation 기반으로 추정합니다.
 * WASM heap은 JavaScript에서 직접 관찰할 수 없으므로,
 * decode level과 횟수를 추적하여 heap 사용량을 추정합니다.
 *
 * @see wasmHeapEstimator - Singleton instance
 *
 * Memory Estimation:
 * - Level 0 (Full): ~5MB per decode
 * - Level 1 (1/2):  ~1.5MB per decode
 * - Level 2 (1/4):  ~0.4MB per decode
 * - Fragmentation:  1.2x multiplier
 */

/**
 * Heap 상수 (경험적 측정값)
 */
const HEAP_CONSTANTS = {
  /** Level 0 decode 당 WASM heap 사용량 (bytes) */
  LEVEL_0_HEAP: 5 * 1024 * 1024, // 5MB

  /** Level 1 decode 당 WASM heap 사용량 (bytes) */
  LEVEL_1_HEAP: 1.5 * 1024 * 1024, // 1.5MB

  /** Level 2 decode 당 WASM heap 사용량 (bytes) */
  LEVEL_2_HEAP: 0.4 * 1024 * 1024, // 0.4MB

  /** WASM allocator fragmentation 배수 */
  FRAGMENTATION_MULTIPLIER: 1.2,

  /** Worker 재시작 임계값 (bytes) - 800MB */
  MAX_HEAP_THRESHOLD: 800 * 1024 * 1024,

  /** Worker 재시작 최소 간격 (ms) - 5초 */
  MIN_RESTART_INTERVAL: 5000,
};

/**
 * WASM Heap Estimator 클래스
 */
class WasmHeapEstimator {
  /** Decode 횟수 카운터 */
  private decodeCounters = {
    level0: 0,
    level1: 0,
    level2: 0,
  };

  /** 마지막 worker 재시작 시각 (timestamp) */
  private lastWorkerRestart = 0;

  /**
   * Decode 작업 추적
   * @param level - Decode level (0, 1, 2)
   */
  trackDecode(level: 0 | 1 | 2): void {
    switch (level) {
      case 0:
        this.decodeCounters.level0++;
        break;
      case 1:
        this.decodeCounters.level1++;
        break;
      case 2:
        this.decodeCounters.level2++;
        break;
    }
  }

  /**
   * 현재 추정 heap 사용량 (MB)
   * @returns Heap 사용량 (MB)
   */
  estimateHeapMB(): number {
    const level0Heap = this.decodeCounters.level0 * HEAP_CONSTANTS.LEVEL_0_HEAP;
    const level1Heap = this.decodeCounters.level1 * HEAP_CONSTANTS.LEVEL_1_HEAP;
    const level2Heap = this.decodeCounters.level2 * HEAP_CONSTANTS.LEVEL_2_HEAP;

    const rawTotal = level0Heap + level1Heap + level2Heap;
    const totalWithFragmentation = rawTotal * HEAP_CONSTANTS.FRAGMENTATION_MULTIPLIER;

    return totalWithFragmentation / (1024 * 1024);
  }

  /**
   * Worker 재시작 필요 여부 판단
   * @returns true면 worker 재시작 필요
   */
  shouldRestartWorkers(): boolean {
    const now = Date.now();

    // 최소 재시작 간격 체크 (과도한 재시작 방지)
    if (now - this.lastWorkerRestart < HEAP_CONSTANTS.MIN_RESTART_INTERVAL) {
      return false;
    }

    // Heap 임계값 초과 확인
    const estimatedBytes = this.estimateHeapMB() * 1024 * 1024;
    return estimatedBytes >= HEAP_CONSTANTS.MAX_HEAP_THRESHOLD;
  }

  /**
   * Worker 재시작 후 상태 초기화
   */
  resetAfterWorkerRestart(): void {
    this.decodeCounters = { level0: 0, level1: 0, level2: 0 };
    this.lastWorkerRestart = Date.now();
  }

  /**
   * 현재 decode 카운터 상태 반환 (디버깅용)
   */
  getCounters() {
    return { ...this.decodeCounters };
  }

  /**
   * 상세 heap 추정 정보 반환 (디버깅용)
   */
  getDetailedEstimate() {
    const level0Heap = this.decodeCounters.level0 * HEAP_CONSTANTS.LEVEL_0_HEAP;
    const level1Heap = this.decodeCounters.level1 * HEAP_CONSTANTS.LEVEL_1_HEAP;
    const level2Heap = this.decodeCounters.level2 * HEAP_CONSTANTS.LEVEL_2_HEAP;

    return {
      volumeMPR: level2Heap / (1024 * 1024), // Level 2 (MPR)
      stackLevel1: level1Heap / (1024 * 1024), // Level 1 (Stack background)
      stackLevel0: level0Heap / (1024 * 1024), // Level 0 (Stack current window)
      totalEstimatedMB: this.estimateHeapMB(),
      counters: this.getCounters(),
    };
  }
}

/**
 * Singleton instance
 * @example
 * ```typescript
 * import { wasmHeapEstimator } from './wasmHeapEstimator';
 *
 * // Track decode operation
 * wasmHeapEstimator.trackDecode(2); // Level 2 for MPR
 *
 * // Check if restart needed
 * if (wasmHeapEstimator.shouldRestartWorkers()) {
 *   workerManager.terminate('dicomImageLoader');
 *   wasmHeapEstimator.resetAfterWorkerRestart();
 * }
 *
 * // Get current estimate
 * console.log('Heap estimate:', wasmHeapEstimator.estimateHeapMB(), 'MB');
 * ```
 */
export const wasmHeapEstimator = new WasmHeapEstimator();
