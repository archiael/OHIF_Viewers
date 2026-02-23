# Mammography Compare Mode 동작 문서

> 작성일: 2026-02-23
> 브랜치: `feature/mammography-features`
> 관련 파일:
> - [`modes/mammography-compare/src/index.tsx`](../modes/mammography-compare/src/index.tsx)
> - [`modes/mammography-compare/src/commandsModule.ts`](../modes/mammography-compare/src/commandsModule.ts)
> - [`modes/mammography-compare/src/toolbarButtons.ts`](../modes/mammography-compare/src/toolbarButtons.ts)
> - [`modes/mammography-compare/src/evaluatorsModule.ts`](../modes/mammography-compare/src/evaluatorsModule.ts)
> - [`modes/mammography-compare/src/store.ts`](../modes/mammography-compare/src/store.ts)
> - [`extensions/default/src/hangingprotocols/hpMammoCompare.ts`](../extensions/default/src/hangingprotocols/hpMammoCompare.ts)
> - [`extensions/default/src/hangingprotocols/utils/mammoDisplaySetSelector.ts`](../extensions/default/src/hangingprotocols/utils/mammoDisplaySetSelector.ts)

---

## 1. 개요

Mammography Compare Mode는 현재(Current) 스터디와 이전(Prior) 스터디를 **1×4 그리드** (1행 4열)로 동시 표시하는 워크플로우입니다.

**요구사항 매핑:**
| FR | 기능 | 구현 위치 |
|--|--|--|
| FR-3.3.2 | Exit Compare 버튼 | `commandsModule.exitMammoCompare` |
| FR-2.5.5 | Mirror Mode (L↔R 동기화) | `index.tsx` CAMERA_MODIFIED 핸들러 |
| FR-3.3.9 | Compare Sync (스터디 간 동기화) | `index.tsx` CAMERA_MODIFIED 핸들러 |
| FR-3.3.x | 드래그&드롭 시 자동 페어링 | `index.tsx` applyAutoPairing |

---

## 2. 레이아웃

### Viewport 구성 (1×4 그리드, 왼쪽 2개 = 현재, 오른쪽 2개 = 이전)

```
CC Stage:
┌──────────┬──────────┬──────────────────┬──────────────────┐
│Current   │Current   │   Prior RCC      │   Prior LCC      │
│  RCC     │  LCC     │mammo-compare-rcc │mammo-compare-lcc │
│mammo-rcc │mammo-lcc │                  │                  │
└──────────┴──────────┴──────────────────┴──────────────────┘

MLO Stage:
┌──────────┬──────────┬───────────────────┬───────────────────┐
│Current   │Current   │   Prior RMLO      │   Prior LMLO      │
│  RMLO    │  LMLO    │mammo-compare-rmlo │mammo-compare-lmlo │
│mammo-rmlo│mammo-lmlo│                   │                   │
└──────────┴──────────┴───────────────────┴───────────────────┘
```

### Viewport ID 규칙
- **왼쪽 열** (Current study): `mammo-rcc`, `mammo-lcc`, `mammo-rmlo`, `mammo-lmlo`
- **오른쪽 열** (Prior study): `mammo-compare-rcc`, `mammo-compare-lcc`, `mammo-compare-rmlo`, `mammo-compare-lmlo`

### Viewport 관계 함수
```typescript
// 같은 스터디 내 L↔R 쌍 (Mirror 용도)
getMirrorPairId('mammo-rcc')         → 'mammo-lcc'
getMirrorPairId('mammo-compare-rcc') → 'mammo-compare-lcc'

// 현재↔이전 스터디 대응 쌍 (Compare Sync 용도)
getComparePairId('mammo-rcc')        → 'mammo-compare-rcc'
getComparePairId('mammo-compare-lcc')→ 'mammo-lcc'
```

---

## 3. URL 파라미터 규칙

```
/mammography-compare?StudyInstanceUIDs=<current_uid>,<prior_uid>&datasources=<source>
```

- **index 0** (`studyInstanceUIDsIndex=0`): Current study → 왼쪽 열 뷰포트
- **index 1** (`studyInstanceUIDsIndex=1`): Prior study → 오른쪽 열 뷰포트

이 규칙은 Hanging Protocol (`hpMammoCompare.ts`)의 `numberOfPriorsReferenced: 1` 설정과 `studyMatchingRules`에 의해 적용됩니다.

---

## 4. onModeEnter 흐름

```
onModeEnter()
  │
  ├─ Store 리셋: useMammographyCompareStore.resetToDefaults()
  │     (isMirrorModeEnabled = true, isCompareSyncEnabled = true 로 초기화)
  │
  ├─ 이전 세션 리스너 정리 (_listenerMap 순회 → removeEventListener)
  ├─ 상태 초기화:
  │    _listenerMap.clear()
  │    _lateralityCache.clear()
  │    _autoWindowedSet.clear()
  │    _autoPairingEnabled = false       ← 재진입 시 stale true 방지
  │    _isApplyingPairedLayout = false
  │    _expectedPairDisplaySets.clear()
  │
  ├─ initToolGroups() → 'mammography' 툴그룹 생성
  │     (setToolActiveToolbar는 toolGroupIds: ['mammography'] 사용)
  │
  ├─ commandsModule 등록 (MAMMOGRAPHY_COMPARE 컨텍스트)
  ├─ evaluatorsModule 등록 (isMirrorModeActiveCompare, isCompareSyncActive)
  ├─ toolbarService.register / updateSection (툴바 버튼 설정)
  │
  ├─ VIEWPORT_DATA_CHANGED 구독
  │     → addListenersToViewport(viewportId)
  │         ├─ CAMERA_MODIFIED 리스너 (Mirror + Compare Sync)
  │         ├─ STACK_NEW_IMAGE 리스너 (Auto-windowing)
  │         └─ IMAGE_RENDERED 리스너 (Auto-windowing retry + 흉벽 정렬 retry)
  │     → detectAndCacheLaterality(viewportId)
  │     → applyChestWallAlignment() (Mirror Mode ON 시)
  │     → applyAutoPairing() (_autoPairingEnabled 가드, 루프 방지 로직 포함)
  │
  ├─ 이전 _autoPairingTimer clearTimeout (재진입 시 중복 타이머 방지)
  └─ setTimeout 2초 후 → _autoPairingEnabled = true
```

---

## 5. 동기화 매트릭스 (CAMERA_MODIFIED 핸들러)

| Mirror Mode | Compare Sync | 동작 |
|:-----------:|:------------:|------|
| OFF | OFF | 활성 뷰포트만 변경됨 |
| ON  | OFF | 같은 스터디의 L↔R 쌍에 **X축 반전 Pan + Zoom** 적용 |
| OFF | ON  | 반대 스터디의 동일 위치 뷰포트에 **동일 Pan + Zoom** 적용 |
| ON  | ON  | 위 두 가지 모두 적용 + 반대 스터디의 L↔R 쌍도 동기화 |

> **주의**: Pan X축만 반전되고 Pan Y와 Zoom은 동일값이 복사됩니다.

### 루프 방지 메커니즘
`_compareSyncState.isSyncing` 플래그를 사용:
1. 핸들러 진입 시 `isSyncing = true`
2. `setPan` / `setCamera` 호출로 발생하는 2차 CAMERA_MODIFIED는 `if (isSyncing) return;`으로 조기 종료
3. `try/finally`로 항상 `isSyncing = false` 복구

---

## 6. 드래그&드롭 자동 페어링 (applyAutoPairing)

### 목적
사용자가 시리즈 패널에서 뷰포트로 시리즈를 드래그하면 4개 뷰포트 전체를 자동으로 페어링합니다.

### 처리 흐름
```
사용자가 시리즈 드래그 → VIEWPORT_DATA_CHANGED 발생
  │
  ├─ _autoPairingEnabled 체크 (모드 진입 후 2초 경과 필요)
  ├─ _expectedPairDisplaySets 체크 (우리가 설정한 UID라면 스킵 → 루프 방지)
  │
  └─ applyAutoPairing(viewportId)
       │
       ├─ 드래그된 뷰포트에서 현재 displaySet 파악
       ├─ detectViewType() → 'CC' 또는 'MLO'
       ├─ SeriesLateralityManager.detectLaterality() → 'R' 또는 'L'
       │
       ├─ getActiveDisplaySets()로 두 스터디의 모든 시리즈 조회
       ├─ 다른 스터디 UID 탐지
       │
       ├─ 4개 시리즈 탐색 (같은 스터디 R/L, 다른 스터디 R/L)
       │    isLeftSide: URL의 StudyInstanceUIDs[0] === changedStudyUID
       │      → true이면 드롭된 스터디가 왼쪽(current) 열
       │      → false이면 드롭된 스터디가 오른쪽(prior) 열
       │      → URL 파싱 실패 시 viewport ID 기반 휴리스틱으로 폴백
       │
       ├─ _expectedPairDisplaySets에 4개 UID 기록 (루프 방지용)
       └─ viewportGridService.setDisplaySetsForViewport() × 4 호출
            (매칭 없는 뷰포트는 빈 UID 배열 → 빈 화면)
```

### 루프 방지 (이중 구조)
| 메커니즘 | 역할 |
|--|--|
| `_isApplyingPairedLayout` | `setDisplaySetsForViewport` 호출 중 동기 이벤트 방지 |
| `_expectedPairDisplaySets` | 비동기로 발생하는 VIEWPORT_DATA_CHANGED 이벤트 방지 |
| `_autoPairingEnabled` (2초 지연) | 초기 Hanging Protocol 로딩 이벤트 방지 |

### 뷰타입 탐지 (detectViewType)
```typescript
// ViewCode DICOM 속성 우선, SeriesDescription 폴백
SCT:399162004 → CC view
SCT:399368009 → MLO view
SeriesDescription에 'CC' 포함 → CC
SeriesDescription에 'MLO' 포함 → MLO
```

---

## 7. Mirror Mode (흉벽 정렬)

### 개념
유방 이미지는 흉벽이 이미지의 특정 가장자리에 위치합니다:
- **R breast**: 흉벽이 오른쪽 → `imageCanvasPoint: { imagePoint: [1, 0.5], canvasPoint: [1.0, 0.5] }`
- **L breast**: 흉벽이 왼쪽 → `imageCanvasPoint: { imagePoint: [0, 0.5], canvasPoint: [0.0, 0.5] }`

### Mirror Mode ON 동작
1. 뷰포트 데이터 변경 시 `detectAndCacheLaterality()` 호출 → `_lateralityCache` 갱신
2. `applyChestWallAlignment()` 호출 → 흉벽 위치에 따라 `displayArea` 설정
3. CAMERA_MODIFIED 시 같은 스터디 L↔R 쌍에 X축 반전 Pan 동기화

---

## 8. Exit Compare Mode (exitMammoCompare)

### 현재 스터디 식별 방법
1. **1순위**: URL 파라미터 `StudyInstanceUIDs=current,prior`에서 첫 번째 UID 추출
   - 이유: URL index 0 = current study (hpMammoCompare의 studyInstanceUIDsIndex=0 규칙과 일치)
2. **폴백**: `displaySetService.getActiveDisplaySets?.()` 호출
   - 빈 배열이면 `uiNotificationService.show('No active study found')` 후 early return
   - 그렇지 않으면 `activeDisplaySets[0].StudyInstanceUID` 사용

### 네비게이션
```typescript
window.location.href = `/mammography?StudyInstanceUIDs=${currentStudyUID}`;
```

---

## 9. 상태 관리 (Zustand Store)

```typescript
// store.ts
interface MammographyCompareState {
  isMirrorModeEnabled: boolean;   // Mirror Mode ON/OFF  (기본값: true)
  isCompareSyncEnabled: boolean;  // Compare Sync ON/OFF (기본값: true)
  toggleMirrorMode(): void;
  toggleCompareSync(): void;
  resetToDefaults(): void;        // onModeEnter 시 호출 → 두 값 모두 true로 복귀
}
```

> **기본 상태**: 모드 진입 시 Mirror Mode와 Compare Sync가 **모두 ON**으로 시작됩니다.

---

## 10. Toolbar 버튼

| 버튼 ID | 아이콘 | 명령 | 평가자 |
|--|--|--|--|
| `Zoom` | `tool-zoom` | `setToolActiveToolbar` | `evaluate.cornerstoneTool` |
| `WindowLevel` | `tool-window-level` | `setToolActiveToolbar` | `evaluate.cornerstoneTool` |
| `Pan` | `tool-move` | `setToolActiveToolbar` | `evaluate.cornerstoneTool` |
| `Capture` | `tool-capture` | `showDownloadViewportModal` | `evaluate.action` |
| `Layout` | - | - | `evaluate.action` |
| `Crosshairs` | `tool-crosshair` | `setToolActiveToolbar` | `evaluate.cornerstoneTool` |
| `MirrorModeCompare` | `tool-flip-horizontal` | `toggleMirrorModeCompare` | `isMirrorModeActiveCompare` |
| `CompareSync` | `tool-stack-image-sync` | `toggleCompareSync` | `isCompareSyncActive` |
| `ExitCompare` | `close` | `exitMammoCompare` | `evaluate.action` |

---

## 11. onModeExit 정리 순서

```
onModeExit()
  │
  ├─ VIEWPORT_DATA_CHANGED 구독 해제 (_viewportDataChangedSub.unsubscribe)
  ├─ 모든 뷰포트 element 이벤트 리스너 제거 (_listenerMap 순회)
  ├─ _listenerMap.clear()
  │
  ├─ 모듈 상태 초기화:
  │    _lateralityCache.clear()
  │    _autoWindowedSet.clear()
  │    _compareSyncState.isSyncing = false
  │    _isApplyingPairedLayout = false
  │    _autoPairingEnabled = false
  │    _expectedPairDisplaySets.clear()
  │    clearTimeout(_autoPairingTimer) ← 2초 타이머 취소 (BUG-2 수정)
  │
  └─ 서비스 destroy:
       toolGroupService.destroy()
       syncGroupService.destroy()
       segmentationService.destroy()
       cornerstoneViewportService.destroy()
```

---

## 12. 알려진 이슈 및 해결 내역

| 이슈 | 원인 | 해결 |
|--|--|--|
| `customizationService.addModeCustomizations is not a function` | API 미존재 | 해당 호출 제거 |
| 툴바 "Missing Icon" 표시 | 미등록 아이콘 ID 사용 | `tool-link`→`tool-stack-image-sync`, `tool-close`→`close` |
| 드래그&드롭 후 이미지 사라짐 | `getDisplaySets()` 미존재 → 빈 배열 → 모든 뷰포트 클리어 | `getActiveDisplaySets()` 사용 + 빈 배열 가드 추가 |
| 드래그&드롭 시 `viewportGridService is not defined` | onModeEnter destructure 누락 | `viewportGridService` destructure에 추가 |
| 모드 조기 종료 시 `_autoPairingEnabled = true` 오발동 | setTimeout 핸들 미저장 | `_autoPairingTimer` 변수 추가 + onModeExit에서 clearTimeout (BUG-2 수정) |
| exitMammoCompare에서 prior 스터디로 이동 가능성 | `activeDisplaySets[0]`이 prior일 수 있음 | URL의 `StudyInstanceUIDs` 첫 번째 값 우선 사용 (DESIGN-3 수정) |
