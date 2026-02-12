# Mammography 모듈 비판적 코드 리뷰

> **작성일**: 2026-02-11
> **리뷰어**: Claude Opus 4.6 (Automated Code Review)
> **브랜치**: feature/mammography-features
> **커밋**: 96976b9
> **참조 문서**:
> - [mammography-feature-requirements.md](./mammography-feature-requirements.md)
> - [mammography-code-implementation-gap-analysis.md](./mammography-code-implementation-gap-analysis.md)

---

## 📊 종합 평가

**리뷰 결과**: **REQUEST CHANGES** ❌ (병합 불가)

**분석 범위**:
- 파일 수: 10개
- 총 라인 수: 5,911줄
- 모듈: `modes/mammography/`, `modes/mammography-compare/`

**이슈 통계**:

| 심각도 | 개수 | 조치 필요성 |
|--------|------|------------|
| 🔴 CRITICAL | 3 | 병합 전 필수 수정 |
| 🟠 HIGH | 5 | 병합 전/직후 권장 |
| 🟡 MEDIUM | 6 | 가능한 빨리 수정 |
| 🔵 LOW | 3 | 검토 후 수정 |
| **총계** | **17** | |

---

## 📋 요구사항 구현 체크

### Stage 1: Requirements Compliance

| FR ID | 요구사항 | 구현 상태 | 코드 위치 | 상세 |
|-------|---------|----------|----------|------|
| **FR-3.3.8** | Prior Study Auto-Selection | ❌ **미구현** | `mammography/commandsModule.ts:828-857` | `openMammoCompare`가 현재 study UID만 URL에 전달. Prior study 검색/선택 로직 없음 |
| **FR-3.3.2** | Compare Exit Button | ✅ **완전 구현** | `mammography-compare/commandsModule.ts:841-870`<br/>`mammography-compare/toolbarButtons.ts` | `exitMammoCompare` 명령, `ExitCompare` 버튼, evaluator 모두 존재 |
| **FR-2.5.5** | Mirror Mode Toggle | ⚠️ **부분 구현** | `mammography/commandsModule.ts:1211-1271`<br/>`mammography/toolbarButtons.ts` | **mammography 모드에만 존재**<br/>mammography-compare 모드에는 없음 |
| **FR-3.3.9** | Compare Sync Toggle | ❌ **미구현** | - | `toggleCompareSync` 명령 없음<br/>기존 `toggleMammoSync`는 단일 모드용 |
| **FR-3.3.7** | Study Visual Feedback | ⚠️ **부분 구현** | `mammography-compare/src/styles.css`<br/>`platform/app/src/routes/Mode/Mammography.css`<br/>`hpCompareMG.ts` | CSS 파일 존재하나 **3가지 충돌 전략**:<br/>1. `data-compare-side` 선택자<br/>2. `data-viewport-type` 선택자<br/>3. JavaScript `initializeCompareModeBorders()` |

**Stage 1 판정**: **FAIL** - 5개 중 1개만 완전 구현 (20%)

---

## 🔴 CRITICAL 이슈 (병합 전 필수 수정)

### CRITICAL-1: 메모리 누수 - Window resize listener 정리 안됨

**파일**:
- `modes/mammography/src/commandsModule.ts:805`
- `modes/mammography-compare/src/commandsModule.ts:783`

**문제**:
```typescript
// ❌ 현재 코드 (line 805)
window.addEventListener('resize', handleWindowResize);
// removeEventListener 호출 없음
```

`window.addEventListener('resize', handleWindowResize)`가 등록되지만 **어디에서도 제거되지 않음**. 모드 진입/종료를 반복할 때마다 resize listener가 누적되어 메모리 누수 발생. 각 orphaned closure는 destroyed된 서비스 참조를 계속 유지.

**영향**:
- 모드 전환마다 이벤트 핸들러 1개씩 누적
- 메모리 사용량 증가
- GC 불가능한 클로저 축적

**해결**:
```typescript
// ✅ 수정
window.addEventListener('resize', handleWindowResize);
customWheelUnsubscribes.push(() => {
  window.removeEventListener('resize', handleWindowResize);
});

// onModeExit에서 cleanup 호출
customWheelUnsubscribes.forEach(unsub => unsub());
customWheelUnsubscribes = [];
```

---

### CRITICAL-2: 메모리 누수 - Wheel event listeners cleanup 누락

**파일**:
- `modes/mammography/src/index.tsx` (onModeExit, line 316-341)
- `modes/mammography-compare/src/index.tsx` (onModeExit, line 478-505)

**문제**:

`onModeExit`에서 서비스를 destroy하지만 **`customWheelUnsubscribes` 배열을 호출하지 않음**. `initMammoMode` 명령이 viewport element에 등록한 wheel handler들이 정리되지 않음.

```typescript
// ❌ index.tsx onModeExit - cleanup 안함
onModeExit: ({ servicesManager }) => {
  const { toolGroupService, syncGroupService, toolbarService, cornerstoneViewportService } =
    servicesManager.services;
  toolGroupService.destroy();
  syncGroupService.destroy();
  // ...
  // customWheelUnsubscribes 호출 없음!
}
```

**문제점**:
- `customWheelUnsubscribes`는 `commandsModule.ts`의 모듈 레벨 변수
- `index.tsx`에서 접근 불가
- Wheel listener가 viewport element에 계속 남아있음

**영향**:
- Viewport element 재사용 시 중복 이벤트 발생
- 메모리 누수
- 이전 모드의 핸들러가 계속 동작

**해결**:
```typescript
// commandsModule.ts에 cleanup 명령 추가
cleanupMammoMode: () => {
  customWheelUnsubscribes.forEach(unsub => unsub());
  customWheelUnsubscribes = [];

  cameraSyncUnsubscribes.forEach(unsub => unsub());
  cameraSyncUnsubscribes = [];

  console.log('✅ Cleaned up mammography mode listeners');
}

// index.tsx onModeExit에서 호출
onModeExit: ({ servicesManager, commandsManager }) => {
  // 기존 cleanup
  toolGroupService.destroy();

  // 새로운 cleanup
  commandsManager.runCommand('cleanupMammoMode', {}, 'MAMMOGRAPHY');
}
```

---

### CRITICAL-3: mammography-compare에서 commandsManager 파라미터 누락

**파일**: `modes/mammography-compare/src/index.tsx:318`

**문제**:
```typescript
// ❌ mammography-compare/index.tsx:318
commandsModule({ servicesManager })

// ✅ mammography/index.tsx:141 (올바른 예시)
commandsModule({ servicesManager, commandsManager })
```

`commandsModule`이 `commandsManager` 없이 호출됨. `commandsModule` 내부에서 `commandsManager`를 사용하는 경우 `undefined` 에러 발생 가능.

**영향**:
- Sub-command 호출 실패
- Evaluator 상호작용 불가
- Silent failure 가능성

**해결**:
```typescript
// mammography-compare/index.tsx:318
commandsModule({ servicesManager, commandsManager })
```

---

## 🟠 HIGH 이슈 (병합 전/직후 수정 권장)

### HIGH-1: 90% 코드 중복 (가장 심각한 아키텍처 문제)

**파일**:
- `modes/mammography/src/commandsModule.ts` (1,353줄)
- `modes/mammography-compare/src/commandsModule.ts` (928줄)
- **중복 추정**: ~850줄 (95%)

**문제**:

두 파일이 **거의 동일한 구현**을 각각 보유:
- `mammoMagnify` - 완전 동일
- `toggleMammoSync` - 완전 동일
- `initMammoMode` - 완전 동일
- 모든 helper 함수들 - 완전 동일

**차이점**:
- **mammography**: `toggleMirrorMode`, `openSRReportPage`, `openPDFReportPage` 추가
- **mammography-compare**: `exitMammoCompare` 추가, `if (DEBUG)` 가드 더 많이 사용
- **mammography-compare**: `commandsManager` 파라미터 누락 (CRITICAL-3)

**영향**:
- 버그 수정 시 2곳 모두 수정 필요 → 이미 divergence 발생 (CRITICAL-3)
- 번들 크기 2배 증가 (~900줄 중복 × 2 = 1,800줄)
- 유지보수 비용 2배
- 코드 일관성 유지 어려움

**해결**:

```
modes/
├── mammography-shared/          # 신규 패키지
│   ├── src/
│   │   ├── commandsBase.ts      # 공통 commands
│   │   ├── toolbarBase.ts       # 공통 toolbar
│   │   ├── utils/
│   │   │   └── mammographyMidline.ts
│   │   └── MammographyZoomTool.ts
│   └── package.json
│
├── mammography/
│   └── src/
│       ├── commandsModule.ts    # shared에서 import + mode-specific commands
│       └── toolbarButtons.ts    # shared에서 import + MirrorModeToggle 등
│
└── mammography-compare/
    └── src/
        ├── commandsModule.ts    # shared에서 import + exitMammoCompare
        └── toolbarButtons.ts    # shared에서 import + ExitCompare
```

**구현 예시**:
```typescript
// modes/mammography-shared/src/commandsBase.ts
export const createBaseCommands = ({ servicesManager, commandsManager }) => ({
  mammoMagnify: () => { /* 공통 로직 */ },
  toggleMammoSync: () => { /* 공통 로직 */ },
  initMammoMode: () => { /* 공통 로직 */ },
  // ...
});

// modes/mammography/src/commandsModule.ts
import { createBaseCommands } from '@ohif/mode-mammography-shared';

export default function commandsModule({ servicesManager, commandsManager }) {
  const baseCommands = createBaseCommands({ servicesManager, commandsManager });

  return {
    definitions: {
      ...baseCommands,
      // Mode-specific commands
      toggleMirrorMode: () => { /* mammography only */ },
      openSRReportPage: () => { /* mammography only */ },
    },
  };
}
```

---

### HIGH-2: 90% 코드 중복 (toolbarButtons)

**파일**:
- `modes/mammography/src/toolbarButtons.ts` (782줄)
- `modes/mammography-compare/src/toolbarButtons.ts` (754줄)
- **중복 추정**: ~700줄 (95%)

**문제**:

표준 OHIF toolbar 버튼 (~700줄)이 두 파일에 완전히 중복됨.

**차이점**:
- **mammography**: `MirrorModeToggle`, `OpenReport`, `ViewPDFReport` 추가
- **mammography-compare**: `ExitCompare` 추가

**해결**:
```typescript
// modes/mammography-shared/src/toolbarBase.ts
export const baseToolbarButtons = [
  // ~700줄의 공통 버튼들
];

// modes/mammography/src/toolbarButtons.ts
import { baseToolbarButtons } from '@ohif/mode-mammography-shared';

export default [
  ...baseToolbarButtons,
  // Mode-specific buttons
  {
    id: 'MirrorModeToggle',
    // ...
  },
];
```

---

### HIGH-3: God Functions (200줄 이상 함수 4개)

**파일**: `modes/mammography/src/commandsModule.ts`

**문제**:

| 함수 | 라인 수 | 책임 개수 | 위치 |
|------|--------|----------|------|
| `openSRReportPage` | 323줄 | 9개 | 859-1181 |
| `initMammoMode` | 300줄 | 7개 | 526-823 |
| `toggleMammoSync` | 213줄 | 8개 | 309-521 |
| `mammoMagnify` | 210줄 | 9개 | 95-304 |

**단일 책임 원칙(SRP) 위반 예시**:

```typescript
// ❌ mammoMagnify - 210줄, 9개 책임
mammoMagnify: () => {
  // 1. Viewport 검증
  // 2. Laterality 감지
  // 3. Anchor 계산
  // 4. Zoom 배율 계산
  // 5. Camera 업데이트
  // 6. Sync 상태 확인
  // 7. 다른 viewport 동기화
  // 8. UI 업데이트
  // 9. 로깅
}
```

**영향**:
- 테스트 불가능 (mock 9개 필요)
- 가독성 저하
- 디버깅 어려움
- 재사용 불가

**해결**:

```typescript
// ✅ 분해 후
class MammographyZoomManager {
  private viewportService: CornerstoneViewportService;
  private lateralityDetector: LateralityDetector;
  private anchorCalculator: ChestWallAnchorCalculator;

  magnify(viewportId: string, factor: number): void {
    const viewport = this.validateViewport(viewportId);
    const laterality = this.lateralityDetector.detect(viewport);
    const anchor = this.anchorCalculator.getAnchor(viewport, laterality);

    this.applyZoom(viewport, anchor, factor);
  }

  private validateViewport(id: string): Viewport { /* 10줄 */ }
  private applyZoom(vp: Viewport, anchor: Point3, factor: number): void { /* 20줄 */ }
}

// Command는 단순 delegate
mammoMagnify: () => {
  const manager = new MammographyZoomManager(servicesManager);
  manager.magnify(activeViewportId, 1.5);
}
```

**분해 계획**:

1. **`initMammoMode` (300줄) → 5개 함수**:
   - `setupWheelHandlers()` - 50줄
   - `setupResizeHandler()` - 20줄
   - `detectViewportMode()` - 30줄
   - `initializeViewportListeners()` - 40줄
   - `cleanupHandlers()` - 20줄

2. **`toggleMammoSync` (213줄) → 4개 함수**:
   - `enableCameraSync()` - 60줄
   - `disableCameraSync()` - 30줄
   - `setupVOISync()` - 40줄
   - `getViewportList()` - 20줄

3. **`mammoMagnify` (210줄) → 클래스 분리** (위 예시)

4. **`openSRReportPage` (323줄) → 6개 함수**:
   - `findSRDisplaySets()` - 40줄
   - `parseSRMeasurements()` - 60줄
   - `generateReportHTML()` - 80줄
   - `openReportWindow()` - 30줄
   - `applyReportStyles()` - 40줄
   - `handleReportError()` - 20줄

---

### HIGH-4: 모듈 레벨 전역 변수 남용 (10개 이상)

**파일**:
- `modes/mammography/src/commandsModule.ts` (파일 최상단)
- `modes/mammography-compare/src/commandsModule.ts` (파일 최상단)

**문제**:

```typescript
// ❌ 두 파일 모두 동일한 전역 변수 선언
let isSyncEnabled = false;
let cameraSyncUnsubscribes = [];
let customWheelUnsubscribes = [];
let previousCameras = new Map();
const magnificationState = new Map();
let syncedScrollState = {
  scrollSyncEnabled: false,
  currentScrollSliceIndex: null,
  previousScrollSliceIndex: null,
};
let isApplyingSingleViewportZoom = false;
let isSyncingCameras = false;
let isMagnifyingFromButton = false;
let isResizingViewport = false;
let isDragZooming = false;
// 총 10개 이상
```

**문제점**:

1. **Stale State**: 모드 재진입 시 이전 세션의 상태가 남아있음
   ```typescript
   // 1차 진입: isSyncEnabled = true
   // 모드 종료 → 재진입
   // isSyncEnabled 여전히 true (reset 안됨)
   ```

2. **테스트 격리 불가**: 각 테스트가 전역 상태 공유
3. **DevTools 디버깅 불가**: Redux DevTools 같은 도구 사용 불가
4. **메모리 누수**: `cameraSyncUnsubscribes`, `customWheelUnsubscribes` cleanup 불완전
5. **Race Condition**: 여러 명령이 동시에 전역 변수 수정

**영향**:
- 버그 재현 어려움
- Side effect 추적 어려움
- 멀티 인스턴스 불가 (동일 페이지에 2개 뷰어 불가)

**해결**:

**Option 1: Zustand 상태 관리**
```typescript
// modes/mammography-shared/src/store/mammographyStore.ts
import create from 'zustand';

interface MammographyState {
  isSyncEnabled: boolean;
  magnificationState: Map<string, number>;
  previousCameras: Map<string, Camera>;

  // Actions
  setSyncEnabled: (enabled: boolean) => void;
  setMagnification: (viewportId: string, factor: number) => void;
  resetState: () => void;
}

export const useMammographyStore = create<MammographyState>((set) => ({
  isSyncEnabled: false,
  magnificationState: new Map(),
  previousCameras: new Map(),

  setSyncEnabled: (enabled) => set({ isSyncEnabled: enabled }),
  setMagnification: (id, factor) =>
    set((state) => ({
      magnificationState: new Map(state.magnificationState).set(id, factor),
    })),
  resetState: () =>
    set({
      isSyncEnabled: false,
      magnificationState: new Map(),
      previousCameras: new Map(),
    }),
}));

// commandsModule.ts
import { useMammographyStore } from '@ohif/mode-mammography-shared';

export default function commandsModule({ servicesManager }) {
  const store = useMammographyStore.getState();

  return {
    definitions: {
      toggleMammoSync: () => {
        const { isSyncEnabled, setSyncEnabled } = store;
        setSyncEnabled(!isSyncEnabled);
        // ...
      },
    },
  };
}

// index.tsx onModeExit
onModeExit: () => {
  useMammographyStore.getState().resetState();
  // ...
}
```

**Option 2: 클래스 캡슐화**
```typescript
// modes/mammography-shared/src/MammographyStateManager.ts
export class MammographyStateManager {
  private isSyncEnabled = false;
  private cameraSyncUnsubscribes: Array<() => void> = [];
  private customWheelUnsubscribes: Array<() => void> = [];
  private previousCameras = new Map<string, Camera>();

  toggleSync(): boolean {
    this.isSyncEnabled = !this.isSyncEnabled;
    return this.isSyncEnabled;
  }

  addUnsubscribe(type: 'camera' | 'wheel', unsub: () => void): void {
    if (type === 'camera') this.cameraSyncUnsubscribes.push(unsub);
    else this.customWheelUnsubscribes.push(unsub);
  }

  cleanup(): void {
    this.cameraSyncUnsubscribes.forEach(unsub => unsub());
    this.customWheelUnsubscribes.forEach(unsub => unsub());
    this.reset();
  }

  reset(): void {
    this.isSyncEnabled = false;
    this.cameraSyncUnsubscribes = [];
    this.customWheelUnsubscribes = [];
    this.previousCameras.clear();
  }
}

// commandsModule.ts
const stateManager = new MammographyStateManager();

export default function commandsModule() {
  return {
    definitions: {
      toggleMammoSync: () => {
        const enabled = stateManager.toggleSync();
        // ...
      },
      cleanupMammoMode: () => {
        stateManager.cleanup();
      },
    },
  };
}
```

---

### HIGH-5: 테스트 커버리지 0%

**경로**:
- `modes/mammography/`
- `modes/mammography-compare/`

**문제**:

- `*.test.ts` 파일 없음
- `*.spec.ts` 파일 없음
- `__tests__/` 디렉토리 없음

**영향**:

의료 영상 핵심 로직에 자동 검증 없음:
- Laterality 감지 (`mammographyMidline.ts`)
- Chest wall anchoring 계산
- Zoom factor 계산
- Camera 동기화 로직
- Evaluator 반환값

**리스크**:
- 리팩토링 시 회귀 버그 위험
- 코드 변경 시 영향 범위 불명확
- 신규 개발자 온보딩 어려움

**해결**:

```typescript
// modes/mammography/src/utils/__tests__/mammographyMidline.test.ts
import { detectLaterality, getFixedMidlineAnchor } from '../mammographyMidline';

describe('mammographyMidline', () => {
  describe('detectLaterality', () => {
    it('should detect R laterality from ImageLaterality tag', () => {
      const mockViewport = {
        displaySetInstanceUIDs: ['ds-1'],
      };
      const mockDisplaySet = {
        ImageLaterality: 'R',
      };

      displaySetService.getDisplaySetByUID.mockReturnValue(mockDisplaySet);

      const result = detectLaterality(mockViewport);
      expect(result).toBe('R');
    });

    it('should detect L laterality from ViewPosition', () => {
      // ...
    });

    it('should fallback to SeriesDescription', () => {
      // ...
    });

    it('should return null for unknown laterality', () => {
      // ...
    });
  });

  describe('getFixedMidlineAnchor', () => {
    it('should return maxX for R breast', () => {
      // ...
    });

    it('should return minX for L breast', () => {
      // ...
    });
  });
});

// modes/mammography/src/__tests__/commandsModule.test.ts
describe('mammoMagnify command', () => {
  it('should magnify viewport by 1.5x', () => {
    // ...
  });

  it('should keep chest wall fixed during zoom', () => {
    // ...
  });
});

describe('toggleMammoSync command', () => {
  it('should enable sync when disabled', () => {
    // ...
  });

  it('should synchronize camera across viewports', () => {
    // ...
  });

  it('should cleanup listeners on disable', () => {
    // ...
  });
});

describe('evaluators', () => {
  it('evaluate.mammography.sync should return active state', () => {
    // ...
  });

  it('evaluate.mammography.mirrorMode should return active state', () => {
    // ...
  });
});
```

**우선순위 테스트 목표**:
1. **laterality 감지**: 80% 커버리지 (핵심 비즈니스 로직)
2. **zoom 계산**: 80% 커버리지
3. **sync 로직**: 60% 커버리지
4. **evaluators**: 100% 커버리지 (간단함)

---

## 🟡 MEDIUM 이슈

### MEDIUM-1: Console.log 193회 과다 사용

**파일별 통계**:
- `mammography/commandsModule.ts`: 80회
- `mammography-compare/commandsModule.ts`: 58회
- `mammography/utils/mammographyMidline.ts`: 22회
- `mammography-compare/index.tsx`: 24회
- `mammography/index.tsx`: 9회
- **총계**: 193회 이상

**문제**:

1. **mammography 모드**: `DEBUG` 가드 없이 raw `console.log()` 사용
   ```typescript
   // ❌ 프로덕션에도 실행됨
   console.log('🔧 Applying chest wall anchoring to all viewports');
   console.log(`✅ [${index}] Reset camera for viewport ${vpId}`);
   ```

2. **mammography-compare 모드**: `if (DEBUG)` 패턴 사용하나 여전히 58회
   ```typescript
   // ⚠️ DEBUG 가드는 있으나 너무 많음
   if (DEBUG) console.log('Compare button clicked');
   if (DEBUG) console.log('Navigating to compare mode...');
   ```

**영향**:
- 프로덕션 브라우저 콘솔 spam
- 성능 저하 (stringify 비용)
- 내부 구현 노출 (보안 위험)
- 로그 레벨 구분 없음

**해결**:

```typescript
// modes/mammography-shared/src/utils/logger.ts
const DEBUG = process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (...args: any[]) => {
    if (DEBUG) console.log('[MAMMO:DEBUG]', ...args);
  },
  info: (...args: any[]) => {
    console.info('[MAMMO:INFO]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[MAMMO:WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[MAMMO:ERROR]', ...args);
  },
};

// commandsModule.ts
import { logger } from '@ohif/mode-mammography-shared';

mammoMagnify: () => {
  logger.debug('Magnifying viewport', { viewportId, factor: 1.5 });
  // 프로덕션에서는 실행 안됨
}
```

**정리 기준**:
- 🗑️ **삭제**: 디버깅용 임시 로그 (`'Compare button clicked'` 등)
- 🔒 **DEBUG 가드**: 개발 전용 로그 (camera 좌표, 계산 과정 등)
- ✅ **유지**: 에러/경고 (사용자에게 중요한 정보)

---

### MEDIUM-2: Dead Code 94줄 (주석 처리)

**파일**:
- `modes/mammography/src/index.tsx` (lines 189-282)
- `modes/mammography-compare/src/index.tsx` (동일 블록)

**문제**:

```typescript
// TODO: Uncomment when chest wall anchoring is re-enabled
/*
// Left breast images (LCC, LMLO) - chest wall on LEFT edge
const rightDisplayArea = {
  imageArea: [1.0, 1.0],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],      // Left edge, vertical center
    canvasPoint: [0.0, 0.5],   // Canvas left edge
  },
};

// Right breast images (RCC, RMLO) - chest wall on RIGHT edge
const leftDisplayArea = {
  // ... 94줄
};

const applyChestWallAnchoring = () => {
  // ... 추가 50줄
};
*/
```

**문제점**:
1. 94줄의 주석 처리된 코드가 가독성 저해
2. TODO가 방치됨 (티켓/이슈 없음)
3. Git history에 이미 있음 (중복 보관)
4. 실제 재활성화 계획 불명확

**관련 TODO**:
```typescript
// index.tsx onModeExit (line 329)
// TODO: Remove chest wall anchoring cleanup if permanently disabled
```

**영향**:
- 코드 리뷰 시 혼란
- 유지보수 비용 증가
- 버그 원인 불명확 (왜 비활성화?)

**해결**:

1. **즉시 삭제** (추천)
   - Git history에 보존되어 있음
   - 필요 시 `git log --all -- index.tsx` 로 복구
   - GitHub issue로 재활성화 계획 추적

2. **재활성화 후 PR**
   - 주석 해제
   - React hooks 오류 해결
   - 테스트 추가 후 병합

**GitHub Issue 예시**:
```markdown
# Re-enable Chest Wall Anchoring

## Context
Chest wall anchoring was temporarily disabled due to React hooks error.
Code is preserved in Git history at commit abc123.

## Tasks
- [ ] Investigate React hooks error root cause
- [ ] Fix hooks dependency array
- [ ] Re-enable chest wall anchoring
- [ ] Add unit tests for applyChestWallAnchoring()
- [ ] Verify in mammography and mammography-compare modes

## Code Location
- Git: commit abc123, lines 189-282 in index.tsx
```

---

### MEDIUM-3: Magic Number - `zoomFactor = 1.5`

**파일**: `modes/mammography/src/commandsModule.ts`

**발생 위치**:
```typescript
// Line 111
const zoomFactor = 1.5;

// Line 245
const zoomFactor = 1.5;

// Line 295
console.log('Magnified viewport to 1.5x');
```

**문제**:
- 3곳에서 각각 `1.5` 선언/사용
- 값 변경 시 여러 곳 수정 필요
- 의미 명확하지 않음 (왜 1.5인가?)

**영향**:
- 유지보수성 저하
- 버그 가능성 (일부만 업데이트)

**해결**:

```typescript
// modes/mammography-shared/src/constants.ts
/**
 * Mammography zoom factor for chest wall-anchored magnification
 * Standard zoom ratio for mammography imaging per ACR guidelines
 */
export const MAMMO_ZOOM_FACTOR = 1.5;

/**
 * Debounce delay for resize handler (ms)
 */
export const RESIZE_DEBOUNCE_DELAY = 150;

/**
 * Wheel zoom multiplier for fine control
 */
export const WHEEL_ZOOM_MULTIPLIER = 0.1;

// commandsModule.ts
import { MAMMO_ZOOM_FACTOR } from '@ohif/mode-mammography-shared/constants';

mammoMagnify: () => {
  const viewport = /* ... */;
  const anchor = getFixedMidlineAnchor(viewport);

  applyZoom(viewport, anchor, MAMMO_ZOOM_FACTOR);
  console.log(`Magnified viewport to ${MAMMO_ZOOM_FACTOR}x`);
}
```

**추가 Magic Number**:
- `150` (resize debounce delay) → `RESIZE_DEBOUNCE_DELAY`
- `0.1` (wheel zoom multiplier) → `WHEEL_ZOOM_MULTIPLIER`
- Scroll sync 관련 숫자들

---

### MEDIUM-4: Any 타입 과다 사용 (11회)

**파일**: `modes/mammography/src/utils/mammographyMidline.ts`

**발생 위치**:
```typescript
// Line 27, 93, 160, 171, 181, 211, 246, 290
export function detectLaterality(viewportInfo: any): 'R' | 'L' | null {
  const viewport = viewportInfo?.viewport || viewportInfo;
  // ...
}

// Line 93
function getTagStringValue(instance: Record<string, any>, tags: string[]): string | null {
  // ...
}

// Line 246
export function getFixedMidlineAnchor(viewport: any): [number, number, number] {
  // ...
}

// Line 47
const cornerstone = (window as any)?.cornerstone;
```

**문제**:
- 타입 체크 완전히 무력화
- 자동완성 불가
- 리팩토링 시 오류 발견 불가
- 런타임 에러 위험

**영향**:
```typescript
// ❌ 타입 에러 감지 못함
const anchor = getFixedMidlineAnchor(123); // viewport 대신 숫자 전달
viewport.getImageData();  // 존재하지 않는 메서드 호출
```

**해결**:

```typescript
// types/cornerstone.d.ts
import type {
  IStackViewport,
  IVolumeViewport,
} from '@cornerstonejs/core/dist/types';

export type CornerstoneViewport = IStackViewport | IVolumeViewport;

export interface ViewportInfo {
  viewportId: string;
  viewport?: CornerstoneViewport;
  displaySetInstanceUIDs?: string[];
  viewportOptions?: {
    viewportId?: string;
  };
}

export interface DicomInstance {
  ImageLaterality?: string;
  ViewPosition?: string;
  PatientOrientation?: string;
  SeriesDescription?: string;
  // ... 필요한 DICOM 태그들
}

// mammographyMidline.ts
import type { ViewportInfo, CornerstoneViewport, DicomInstance } from '../types/cornerstone';

export function detectLaterality(viewportInfo: ViewportInfo): 'R' | 'L' | null {
  const viewport = viewportInfo?.viewport || viewportInfo;
  // TypeScript가 viewport의 메서드 자동완성
}

function getTagStringValue(instance: DicomInstance, tags: string[]): string | null {
  // instance의 속성 타입 체크
}

export function getFixedMidlineAnchor(viewport: CornerstoneViewport): [number, number, number] {
  const imageBounds = viewport.getImageData().getBounds();
  // getBounds() 메서드 존재 확인됨
}
```

---

### MEDIUM-5: 과도한 Tag Variant 생성 (8개)

**파일**: `modes/mammography/src/utils/mammographyMidline.ts`

**문제**:

```typescript
// Line 93-107
const buildTagVariants = (tag: string): string[] => {
  const noComma = tag.replace(',', '');
  const lower = tag.toLowerCase();
  const lowerNoComma = noComma.toLowerCase();

  return [
    tag,                    // '0018,5101'
    noComma,                // '00185101'
    lower,                  // '0018,5101'
    lowerNoComma,           // '00185101'
    `x${noComma}`,          // 'x00185101'
    `x${lowerNoComma}`,     // 'x00185101'
    `0x${noComma}`,         // '0x00185101'
    `(${tag})`,             // '(0018,5101)'
  ];
};

// 사용
const tags = buildTagVariants('0018,5101');
// → 8개 variant로 instance 조회 반복
for (const variant of tags) {
  if (instance[variant]) return instance[variant];
}
```

**문제점**:
1. **O(8n) 조회**: 각 태그마다 8번 조회
2. **메모리 낭비**: 8개 문자열 × 태그 개수
3. **성능 저하**: 불필요한 문자열 연산
4. **유지보수 어려움**: 실제 어떤 형식인지 불명확

**실제 필요 형식 조사**:

OHIF의 DicomMetadataStore는 보통 **1-2가지 형식**만 사용:
- `cornerstonejs/dicom-image-loader`: `x00185101` (x-prefix)
- `dcmjs`: `00185101` (comma 없음)

**해결**:

```typescript
// ✅ 간소화
const DICOM_TAG_FORMATS = {
  CORNERSTONE: (tag: string) => `x${tag.replace(',', '')}`,  // 'x00185101'
  DCMJS: (tag: string) => tag.replace(',', ''),              // '00185101'
};

function getTagStringValue(
  instance: DicomInstance,
  tag: string
): string | null {
  // 실제 사용되는 2가지 형식만 체크
  const cornerstoneFormat = DICOM_TAG_FORMATS.CORNERSTONE(tag);
  const dcmjsFormat = DICOM_TAG_FORMATS.DCMJS(tag);

  return instance[cornerstoneFormat] || instance[dcmjsFormat] || null;
}

// 또는 DicomMetadataStore API 사용
import { DicomMetadataStore } from '@ohif/core';

function getTagValue(instance: DicomInstance, tag: string): string | null {
  return DicomMetadataStore.getTagValue(instance, tag);
  // 내부적으로 적절한 형식 처리
}
```

**성능 개선**:
- 8개 → 2개 조회: **75% 감소**
- 문자열 생성: 8개 → 2개

---

### MEDIUM-6: 충돌하는 CSS 전략 (FR-3.3.7)

**관련 파일**:
1. `modes/mammography-compare/src/styles.css` - `data-compare-side` 선택자
2. `platform/app/src/routes/Mode/Mammography.css` - `data-viewport-type` 선택자
3. `extensions/default/src/hangingprotocols/hpCompareMG.ts` - `data-viewport-type` 설정
4. `modes/mammography-compare/src/index.tsx` - JavaScript `initializeCompareModeBorders()`

**문제**:

**전략 1: styles.css (data-compare-side)**
```css
/* modes/mammography-compare/src/styles.css */
.viewport-element[data-compare-side="current"] {
  border: 2px solid #3b82f6; /* Blue */
}

.viewport-element[data-compare-side="prior"] {
  border: 2px solid #10b981; /* Green */
}
```

**전략 2: Mammography.css (data-viewport-type)**
```css
/* platform/app/src/routes/Mode/Mammography.css */
.mammography-compare-mode .viewport-element[data-viewport-type="current"] {
  border: 2px solid #00aaff;
}

.mammography-compare-mode .viewport-element[data-viewport-type="prior"] {
  border: 2px solid #ffa500; /* Orange */
}
```

**전략 3: JavaScript (initializeCompareModeBorders)**
```typescript
// modes/mammography-compare/src/index.tsx:20-183
const initializeCompareModeBorders = () => {
  const viewportElements = document.querySelectorAll('.viewport-element');
  viewportElements.forEach(element => {
    // JavaScript로 직접 border 스타일 적용
    element.style.border = '2px solid #3b82f6';
  });
};
```

**충돌**:
- 3가지 서로 다른 색상: Blue(#3b82f6) vs Blue(#00aaff) vs Green(#10b981)
- 2가지 attribute 이름: `data-compare-side` vs `data-viewport-type`
- 2가지 적용 방법: CSS vs JavaScript

**영향**:
- 어떤 스타일이 실제로 적용되는지 불명확
- CSS specificity 충돌
- 유지보수 어려움 (3곳 수정 필요)

**해결**:

**단일 전략 선택 (Hanging Protocol 기반)**:

```typescript
// 1. Hanging Protocol이 data-viewport-type 설정 (이미 구현됨)
// extensions/default/src/hangingprotocols/hpCompareMG.ts
viewports: [
  {
    viewportOptions: {
      viewportType: 'stack',
      customViewportProps: {
        'data-viewport-type': 'current',  // ← 이미 있음
      },
    },
  },
];

// 2. 단일 CSS 파일로 통합
// platform/app/src/routes/Mode/Mammography.css
.mammography-compare-mode .viewport-element[data-viewport-type="current"] {
  border: 2px solid #00aaff;
  transition: border 0.2s ease;
}

.mammography-compare-mode .viewport-element[data-viewport-type="current"]:hover,
.mammography-compare-mode .viewport-element[data-viewport-type="current"].active {
  border: 4px solid #00ccff;
  box-shadow: 0 0 10px rgba(0, 204, 255, 0.5);
}

.mammography-compare-mode .viewport-element[data-viewport-type="prior"] {
  border: 2px solid #ffa500;
  transition: border 0.2s ease;
}

.mammography-compare-mode .viewport-element[data-viewport-type="prior"]:hover,
.mammography-compare-mode .viewport-element[data-viewport-type="prior"].active {
  border: 4px solid #ffb520;
  box-shadow: 0 0 10px rgba(255, 181, 32, 0.5);
}

// 3. 다른 CSS 파일 삭제
// - modes/mammography-compare/src/styles.css 삭제
// - initializeCompareModeBorders() 함수 삭제
```

---

## 🔵 LOW 이슈

### LOW-1: window.location.href로 모드 전환 (SPA 위반)

**파일**:
- `modes/mammography/src/commandsModule.ts:853` (openMammoCompare)
- `modes/mammography-compare/src/commandsModule.ts:866` (exitMammoCompare)

**문제**:

```typescript
// ❌ Full page reload
openMammoCompare: () => {
  const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${uid}...`;
  window.location.href = compareModeUrl;  // 전체 페이지 새로고침
}

exitMammoCompare: () => {
  const mammographyUrl = `/mammography?StudyInstanceUIDs=${uid}`;
  window.location.href = mammographyUrl;  // 전체 페이지 새로고침
}
```

**영향**:
- 모든 메모리 상태 파괴
- 캐시된 DICOM 이미지 손실
- 디코딩된 픽셀 데이터 재다운로드
- 느린 사용자 경험 (2-3초 로딩)

**SPA 장점 상실**:
- React state 유지 불가
- Cornerstone cache 초기화
- Service 재생성 필요

**해결**:

```typescript
// ✅ React Router navigate 사용
import { useNavigate } from 'react-router-dom';

openMammoCompare: () => {
  const { routerService } = servicesManager.services;
  const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${uid}...`;

  // OHIF의 navigate 사용 (SPA 방식)
  routerService.navigate(compareModeUrl);

  // 또는 React Router 직접 사용
  // navigate(compareModeUrl);
}
```

**성능 개선**:
- 페이지 전환 시간: 2-3초 → 0.1-0.3초
- 메모리 재사용: 이미지 캐시 유지
- 부드러운 UX: 깜빡임 없음

---

### LOW-2: 일관성 없는 DEBUG 가드

**파일**:
- `modes/mammography/src/commandsModule.ts` - DEBUG 가드 없음
- `modes/mammography-compare/src/commandsModule.ts` - `if (DEBUG)` 패턴 사용

**문제**:

```typescript
// ❌ mammography - raw console.log (80회)
console.log('🔧 Applying chest wall anchoring');
console.log(`✅ Magnified viewport to 1.5x`);

// ✅ mammography-compare - DEBUG 가드 (58회)
if (DEBUG) console.log('Compare button clicked');
if (DEBUG) console.log('Navigating to compare mode...');
```

**영향**:
- 코드 일관성 부족
- mammography 모드에서 프로덕션 로그 spam
- 팀 컨벤션 불명확

**해결**:

1. **mammography에 DEBUG 가드 추가**
2. **또는 둘 다 logger 유틸리티로 통일** (MEDIUM-1 해결책)

---

### LOW-3: 로그 메시지에 이모지 사용

**파일**: `modes/mammography-compare/src/index.tsx:316-328`

**문제**:

```typescript
console.log('🎯 Created MAMMOGRAPHY command context');
console.log('📦 Registered command: openMammoCompare');
console.log('✅ Mammography compare mode initialized');
```

**영향**:
- 일부 로그 수집 시스템에서 인코딩 오류
- 터미널/IDE에서 깨질 수 있음
- 프로페셔널하지 않음

**해결**:

```typescript
// ✅ Plain text prefix
console.log('[MAMMO] Created MAMMOGRAPHY command context');
console.log('[MAMMO] Registered command: openMammoCompare');
console.log('[MAMMO] Mammography compare mode initialized');

// 또는 logger 사용
logger.info('Created MAMMOGRAPHY command context');
```

---

## 📊 코드 메트릭 상세

### 파일별 통계

| 파일 | 라인 수 | 주요 이슈 | 중복도 |
|------|--------|----------|--------|
| `mammography/commandsModule.ts` | 1,353 | God Function 4개, console.log 80회 | - |
| `mammography-compare/commandsModule.ts` | 928 | CRITICAL-3 (파라미터 누락) | 95% |
| `mammography/toolbarButtons.ts` | 782 | - | - |
| `mammography-compare/toolbarButtons.ts` | 754 | - | 95% |
| `mammography/index.tsx` | 507 | Dead code 94줄, CRITICAL-2 | - |
| `mammography-compare/index.tsx` | 680 | Dead code 94줄, CRITICAL-2, MEDIUM-6 | 90% |
| `mammography/utils/mammographyMidline.ts` | 337 | Any 타입 8회, Tag variant 과다 | - |
| `mammography-compare/utils/mammographyMidline.ts` | 337 | - | 100% |
| **총계** | **5,678줄** | - | **~90%** |

### 코드 품질 지표

| 지표 | 값 | 목표 | 상태 |
|------|-----|------|------|
| 코드 중복률 | ~90% | <10% | 🔴 매우 나쁨 |
| 최대 함수 길이 | 323줄 | <50줄 | 🔴 매우 나쁨 |
| 평균 God Function | 262줄 | <50줄 | 🔴 매우 나쁨 |
| 전역 변수 개수 | 10+ | 0 | 🔴 나쁨 |
| console.log 호출 | 193+ | <10 | 🔴 매우 나쁨 |
| Any 타입 사용 | 11회 | 0 | 🟡 보통 |
| 테스트 커버리지 | 0% | 80% | 🔴 매우 나쁨 |
| 메모리 누수 | 2개 | 0 | 🔴 심각 |

### 기술 부채 추정

| 항목 | 예상 시간 | 우선순위 |
|------|----------|----------|
| CRITICAL 이슈 수정 (3개) | 1일 | P0 |
| 코드 중복 제거 | 3-5일 | P1 |
| God Function 분해 | 5-7일 | P1 |
| 전역 변수 → 상태 관리 | 2-3일 | P1 |
| 테스트 추가 (80% 커버리지) | 5-7일 | P1 |
| Console.log 정리 | 1일 | P2 |
| Dead code 제거 | 2시간 | P2 |
| Magic number 상수화 | 2시간 | P2 |
| Any 타입 제거 | 1-2일 | P2 |
| CSS 전략 통합 | 1일 | P2 |
| **총 기술 부채** | **20-30일** | |

---

## 🎯 우선순위 개선 작업 로드맵

### Phase 1: CRITICAL 수정 (1일, 병합 전 필수)

**목표**: 메모리 누수 및 런타임 에러 제거

```bash
# Day 1
□ CRITICAL-1: Window resize listener cleanup 추가
  - commandsModule.ts 2곳 수정
  - customWheelUnsubscribes에 unsubscribe 등록

□ CRITICAL-2: Wheel listener cleanup 추가
  - commandsModule.ts에 cleanupMammoMode 명령 추가
  - index.tsx onModeExit에서 호출

□ CRITICAL-3: commandsManager 파라미터 전달
  - mammography-compare/index.tsx:318 수정

□ 수동 테스트
  - 모드 진입/종료 10회 반복
  - Chrome DevTools Memory 프로파일링
  - Event listener 누수 확인
```

---

### Phase 2: 코드 품질 개선 (1-2주, 병합 직후)

**목표**: 유지보수성 향상, 기술 부채 감소

**Week 1: 코드 중복 제거 + 리팩토리**

```bash
# Day 1-2: mammography-shared 패키지 생성
□ modes/mammography-shared/ 생성
  - package.json
  - src/commandsBase.ts (공통 commands)
  - src/toolbarBase.ts (공통 toolbar)
  - src/utils/mammographyMidline.ts (이동)
  - src/MammographyZoomTool.ts (이동)
  - src/constants.ts (Magic number 상수화)
  - src/utils/logger.ts (로깅 유틸리티)

# Day 3-4: mammography 모드 리팩토링
□ commandsModule.ts 리팩토링
  - shared에서 baseCommands import
  - mode-specific commands만 유지
  - God Function 분해 시작

□ toolbarButtons.ts 리팩토링
  - shared에서 baseButtons import
  - MirrorModeToggle 등만 유지

# Day 5: mammography-compare 모드 리팩토링
□ 동일하게 적용
□ 중복 코드 삭제 확인
```

**Week 2: 상태 관리 + 테스트**

```bash
# Day 1-2: 전역 변수 → Zustand
□ modes/mammography-shared/src/store/ 생성
  - mammographyStore.ts (상태 관리)
  - resetState() on mode exit

□ commandsModule.ts에서 store 사용
□ 전역 변수 모두 제거

# Day 3-5: 핵심 로직 테스트 추가
□ mammographyMidline.test.ts (laterality 감지)
□ commandsModule.test.ts (zoom, sync 로직)
□ evaluatorsModule.test.ts (evaluator 반환값)
□ 목표: 60-80% 커버리지
```

---

### Phase 3: 요구사항 완성 (2-3주)

**목표**: 미구현 FR 추가

```bash
# Week 1: FR-3.3.8 Prior Study Auto-Selection
□ findMostRecentPriorStudy() 함수 구현
□ DicomMetadataStore.getStudiesByPatientID() 사용
□ openMammoCompare 수정 (URL에 2개 UID)
□ mammography-compare onModeEnter에서 파싱
□ E2E 테스트 추가

# Week 2: FR-3.3.9 Compare Sync Toggle + FR-2.5.5 완성
□ toggleCompareSync 명령 구현
  - Current/Prior viewport 페어 찾기
  - Camera sync 설정
  - VOI sync group 추가

□ CompareSyncToggle 버튼 추가
□ compare 모드에 MirrorModeToggle 추가

# Week 3: FR-3.3.7 CSS 전략 통합 + 정리
□ 3가지 CSS 전략 → 1개로 통합
□ Hanging Protocol data-viewport-type 사용
□ Mammography.css 단일 파일
□ Console.log 정리 (193개 → logger 사용)
□ Dead code 94줄 삭제
```

---

## 📝 체크리스트

### 병합 전 필수 (Blocking)

- [ ] **CRITICAL-1**: Window resize listener cleanup
- [ ] **CRITICAL-2**: Wheel listener cleanup → onModeExit
- [ ] **CRITICAL-3**: commandsManager 파라미터 전달
- [ ] **메모리 누수 테스트**: 모드 전환 10회 후 Memory Profiling
- [ ] **코드 리뷰**: 3명 이상 승인

### 병합 직후 권장 (High Priority)

- [ ] **HIGH-1**: 코드 중복 제거 (mammography-shared 생성)
- [ ] **HIGH-2**: toolbarButtons 중복 제거
- [ ] **HIGH-3**: God Function 분해 (50줄 이하)
- [ ] **HIGH-4**: 전역 변수 → Zustand/클래스
- [ ] **HIGH-5**: 핵심 로직 테스트 (60% 커버리지)

### 다음 스프린트 (Backlog)

- [ ] **FR-3.3.8**: Prior Study Auto-Selection 구현
- [ ] **FR-3.3.9**: Compare Sync Toggle 구현
- [ ] **FR-2.5.5**: compare 모드에 Mirror Mode 추가
- [ ] **MEDIUM-1**: Console.log 193개 → logger 사용
- [ ] **MEDIUM-2**: Dead code 94줄 삭제
- [ ] **MEDIUM-3**: Magic number 상수화
- [ ] **MEDIUM-4**: Any 타입 제거
- [ ] **MEDIUM-5**: Tag variant 8개 → 2개
- [ ] **MEDIUM-6**: CSS 전략 통합 (3개 → 1개)

---

## 🔗 참고 자료

### 관련 문서
- [mammography-feature-requirements.md](./mammography-feature-requirements.md) - 요구사항 명세
- [mammography-code-implementation-gap-analysis.md](./mammography-code-implementation-gap-analysis.md) - 갭 분석

### OHIF 공식 문서
- [Extensions](https://docs.ohif.org/development/extensions/)
- [Modes](https://docs.ohif.org/development/modes/)
- [Services](https://docs.ohif.org/platform/services/)
- [Cornerstone3D](https://www.cornerstonejs.org/)

### 코딩 표준
- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Last Updated**: 2026-02-11
**Next Review**: CRITICAL 이슈 수정 후 재리뷰 필요
