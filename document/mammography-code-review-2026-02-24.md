# Mammography Feature Branch — 비판적 코드 리뷰

> **작성일**: 2026-02-24
> **대상 브랜치**: `feature/mammography-features`
> **검토 범위**: modes/mammography, modes/mammography-compare, extensions/default, extensions/cornerstone
> **검토 관점**: 코드 구조보다 **수단과 목적의 적합성** 및 **리팩토링 필요성**
> **메타 검토**: Momus (Opus 4.6) 비판적 검증 반영 (오분류 2건 수정, 누락 이슈 4건 추가)
>
> **수정 상태**: Quick Wins 및 P1/P2 완료 + Post-Implementation 리뷰 반영 (2026-02-24)

---

## 목차

1. [전체 요약](#전체-요약)
2. [P1 — 고우선순위 구조 문제](#p1--고우선순위-구조-문제)
3. [P2 — 기능 정확성 문제](#p2--기능-정확성-문제)
4. [P3 — 성능 및 견고성](#p3--성능-및-견고성)
5. [데드 코드](#데드-코드)
6. [Compare 모드 상세 리뷰](#compare-모드-상세-리뷰)
7. [심각도별 전체 요약 표](#심각도별-전체-요약-표)
8. [리팩토링 우선순위 권장사항](#리팩토링-우선순위-권장사항)

---

## 전체 요약

Mammography feature branch는 기능적으로 동작하며 핵심 엣지케이스(동기화 루프 방지, 자동 페어링 루프 방지)가 고려되어 있습니다. 그러나 **수단과 목적의 불일치**가 여러 곳에서 발견됩니다.

특히:
- **공유 라이브러리(`mammography-shared`)를 만들었으나 사용하지 않음** — 대규모 코드 중복 (P1)
- **두 모드 간 CC 판별 로직 불일치** — compare 모드는 이미 수정됐지만 mammography 모드는 안 됨 (P2)
- **compare 모드 `applyAutoWindowing`이 DICOM W/L 무시** — mammography 모드는 올바르게 구현됨 (P2)
- **`window.location.href` 모드 전환** — 의도적 full reload일 가능성이 높으나 문서화 필요 (P1)
- **`IMAGE_RENDERED` 매 프레임마다** chest wall alignment 재적용 시도 (P3)

> **중요 메타 노트**: 초기 리뷰에서 오분류된 2건이 Momus 검토로 수정됨:
> - `chestWallWorldCache` — `index.tsx`에서 실제 소비됨 (false positive)
> - `partnerLaterality` — 현재 코드베이스에 존재하지 않음 (phantom bug)

---

## P1 — 고우선순위 구조 문제

### [P1-1] `window.location.href`로 모드 전환 — 주석 없는 full page reload

**파일**:
- `modes/mammography/src/commandsModule.ts:352`
- `modes/mammography-compare/src/commandsModule.ts:75`

**현황**:
```typescript
// mammography commandsModule.ts
window.location.href = compareModeUrl;

// mammography-compare commandsModule.ts
window.location.href = mammographyUrl;
```

`window.location.href` 변경은 전체 페이지를 다시 로드합니다. OHIF는 SPA이지만, 모드 전환 시 full reload를 **의도적으로** 사용했을 가능성이 높습니다.

**의도적 full reload를 정당화하는 이유**:
- `mammography` ↔ `mammography-compare`는 서로 다른 Hanging Protocol, viewport 구성, tool group, 이벤트 리스너를 가짐
- `onModeExit`에서 `toolGroupService.destroy()`, `cornerstoneViewportService.destroy()` 등을 호출 — SPA 내비게이션 시 동일 렌더 사이클에서 destroy + init이 겹칠 수 있음
- 이미지 캐시 손실은 acceptable tradeoff일 수 있음

**문제점**: 이 결정의 **이유가 코드에 문서화되지 않음**

**권장 수정**: 코드 주석 추가 (즉각적 리팩토링보다 낮은 비용)
```typescript
// INTENTIONAL: Full page reload for mode transition.
// SPA navigation (React Router) risks race conditions with onModeExit
// destroying services (toolGroupService, cornerstoneViewportService)
// that onModeEnter of the target mode needs.
// TODO: Investigate SPA navigation after OHIF mode lifecycle is better understood.
window.location.href = compareModeUrl;
```

### [P1-2] `modes/mammography-shared` — 만들었으나 한 군데도 임포트하지 않음

**파일**: `modes/mammography-shared/` (전체 디렉토리)

**문제**:
`mammography-shared` 패키지가 존재하지만, `mammography`와 `mammography-compare` 어디에서도 임포트하지 않습니다. 이로 인해 두 모드 간에 **대규모 코드 중복**이 발생하고 있습니다.

구체적 중복 확인 항목:
- `detectViewType()` 로직 (두 모드 모두 별도 구현)
- chest wall alignment 유틸리티
- mirror mode 동기화 패턴 (global mutex 기반)
- Zustand store 유사 구조

**결과**: 버그 수정 시 두 곳에 동일하게 수정해야 하는 유지보수 부채 (실제 사례: CC regex fix는 compare 모드에만 적용됨, mammography 모드는 누락 → [P2-1])

**권장 수정**:
공통 로직을 `mammography-shared`로 이동하고 두 모드에서 임포트:
```typescript
// mammography-shared/src/index.ts
export { detectViewType } from './utils/detectViewType';
export { applyChestWallAlignment } from './utils/chestWall';
export { type MirrorSyncState } from './types';
```

### [P1-3] `extensions/default/src/Panels/getImageSrcFromImageId.js` — 모든 모달리티에 커스텀 썸네일 적용

**파일**: `extensions/default/src/Panels/getImageSrcFromImageId.js`

**문제**: Mammography용으로 추가된 커스텀 썸네일 렌더러(pixel min/max 기반 auto-windowing)가 CT, MR 등 모든 모달리티에도 적용됩니다.

**결과**:
- CT 이미지의 DICOM Window Center/Width 설정 무시 → 전체 HU 범위로 렌더링
- CT 썸네일 대비 저하 가능성 (단, 썸네일은 진단용이 아니므로 임팩트 제한적)

**권장 수정**: modality 체크 추가
```javascript
// MG, DX, CR 등 plain radiography에만 커스텀 windowing 적용
if (['MG', 'DX', 'CR', 'XA'].includes(imageMetadata?.Modality)) {
  // min/max 기반 auto-windowing
} else {
  // 기존 Cornerstone 기본 렌더링 (DICOM W/L 사용)
}
```

---

## P2 — 기능 정확성 문제

### [P2-1] `detectViewType`/`detectViewportViewPosition` — CC 판별 로직 모드 간 불일치

**파일**:
- `modes/mammography/src/commandsModule.ts:675-676` ← **미수정** (버그)
- `modes/mammography-compare/src/index.tsx:140` ← **이미 수정됨** (참조용)

**문제**: mammography 모드에서 compare 모드가 이미 수정한 CC false positive가 여전히 존재

```typescript
// mammography/commandsModule.ts:675 - 버그 있음
if (desc.includes('CC')) return 'CC';   // "RACCOON STUDY" → CC로 오분류
if (desc.includes('MLO')) return 'MLO'; // "RACCOON STUDY" → MLO 미분류, CC 반환

// mammography-compare/index.tsx:248 - 이미 수정됨 (참조)
if (/\b(?:[RL]\s*)?CC\b/.test(desc)) return 'CC';
```

같은 버그가 `detectDisplaySetViewPosition`(line 721)에도 중복 존재합니다.

**권장 수정**: compare 모드의 수정 사항을 mammography 모드에도 적용
```typescript
if (/\b(?:[RL]\s*)?CC\b/.test(desc)) return 'CC';
if (/\b(?:[RL]\s*)?MLO\b/.test(desc)) return 'MLO';
```

### [P2-2] `applyAutoWindowing` — compare 모드가 DICOM W/L 무시 (mammography 모드는 올바르게 구현됨)

**파일**:
- `modes/mammography-compare/src/index.tsx:376` ← **문제 있음**
- `modes/mammography/src/index.tsx:398-433` ← **올바른 구현 (참조용)**

**compare 모드 문제**:
```typescript
// compare/index.tsx:376 - DICOM W/L 무시, 전체 pixel range 사용
viewport.setProperties({ voiRange: { lower: minPixelValue, upper: maxPixelValue } });
```

**mammography 모드의 올바른 구현** (참조):
```typescript
// mammography/index.tsx:398-433 - DICOM VOI scaling 적용
const voiLuts = imageMetadata?.['0028,3010']?.Value;
if (voiLuts?.length > 0) {
  // VOI LUT 적용
} else if (windowCenter && windowWidth) {
  // DICOM W/L 적용
} else {
  // fallback: min/max
}
```

**결과**: 임플란트/금속 마커가 있는 mammography 이미지에서 contrast 저하 가능성

**권장 수정**: compare 모드의 `applyAutoWindowing`을 mammography 모드의 구현으로 대체하거나, `mammography-shared`에서 공유

### [P2-3] `CornerstoneViewportService` — `isComputedVOI` 변경이 모든 모드에 영향

**파일**: `extensions/cornerstone/src/services/ViewportService/CornerstoneViewportService.ts:358`

**문제**: Mammography를 위한 VOI 처리 방식 변경이 USMPR, basic 모드 등 **모든 모드**에 적용됩니다.

**권장 수정**: 모달리티 또는 모드 컨텍스트로 분기하거나, 변경 이유와 영향 범위를 코드 주석에 명시.

### [P2-4] Manual `CAMERA_MODIFIED` 동기화 — `SyncGroupService` 우회

**파일**: `modes/mammography/src/index.tsx:516-576`

**문제**: Mammography 모드는 OHIF의 표준 `SyncGroupService`를 사용하지 않고 `CAMERA_MODIFIED` 이벤트를 직접 구독하여 수동으로 카메라를 동기화합니다.

**이유**: Mirror mode의 X축 반전 로직이 필요하여 표준 sync를 사용할 수 없음 — 이것은 이해 가능한 설계 선택

**권장 수정**: SPA 접근 방식 변경보다, **코드 주석으로 이유 명시**가 우선:
```typescript
// SyncGroupService를 사용하지 않는 이유:
// Mirror mode는 좌우 viewport 간 X축을 반전해야 함.
// SyncGroupService는 카메라를 직접 복사하므로 반전 로직을 삽입할 수 없음.
```

### [P2-5] `hpMammo.ts` — 사용되지 않는 compare stage

**파일**: `extensions/default/src/hangingprotocols/hpMammo.ts:113-157`

**문제**: `hpMammo` hanging protocol에 "compare" stage가 정의되어 있으나, 실제 Compare 모드는 `hpMammoCompare` 별도 프로토콜을 사용합니다.

**권장 수정**: 제거

### [P2-6] 모드 내 헬퍼 함수 중복 (같은 파일 내)

**파일**: `modes/mammography/src/commandsModule.ts:422-437` 및 `modes/mammography/src/index.tsx:215-237`

**문제**: `getOppositeViewportId`와 laterality 감지 로직이 같은 모드의 두 파일에 동일하게 구현되어 있습니다. `[P1-2]`의 `mammography-shared` 문제와 별개로, 같은 모드 내에서도 중복이 존재합니다.

**결과**: 하나만 수정하면 버그 발생

**권장 수정**: 하나의 유틸리티 파일로 통합

---

## P3 — 성능 및 견고성

### [P3-1] `IMAGE_RENDERED` 핸들러 — 매 프레임 chest wall alignment 시도

**파일**: `modes/mammography-compare/src/index.tsx:607-618`

**문제**:
```typescript
const renderedHandler = (_event: Event) => {
  if (useMammographyCompareStore.getState().isMirrorModeEnabled) {
    applyChestWallAlignment(viewportId, cornerstoneViewportService);  // 매 프레임!
  }
};
```

`IMAGE_RENDERED`는 pan/zoom 조작 시 초당 수십 번 발생합니다. 매번 `viewport.setDisplayArea()` + `viewport.render()`가 호출됩니다.

**비교**: compare 모드에는 `_chestWallAlignedSet`이 이미 있지만 이 핸들러에서 사용되지 않음 (mammography 모드는 좌표 캐시 패턴으로 다르게 처리)

**권장 수정**:
```typescript
const renderedHandler = (_event: Event) => {
  if (!_autoWindowedSet.has(viewportId)) {
    applyAutoWindowing(viewportId, cornerstoneViewportService);
  }
  if (isMirrorModeEnabled && !_chestWallAlignedSet.has(viewportId)) {
    applyChestWallAlignment(viewportId, cornerstoneViewportService);
    _chestWallAlignedSet.add(viewportId);  // 이미 존재하는 set 활용
  }
};
```

### [P3-2] `_autoPairingTimer` — 2초 하드코딩 지연

**파일**: `modes/mammography-compare/src/index.tsx:907`

**문제**:
```typescript
_autoPairingTimer = setTimeout(() => {
  _autoPairingEnabled = true;
}, 2000);
```

느린 네트워크, 대용량 study, PACS 서버 응답 지연 시 2초 내에 HP 초기 로드가 완료되지 않을 수 있습니다.

**권장 수정**: 이벤트 기반으로 전환
```typescript
hangingProtocolService.subscribe(EVENTS.PROTOCOL_APPLIED, () => {
  _autoPairingEnabled = true;
});
```

### [P3-3] viewport 4개 개별 `setDisplaySetsForViewport` 호출

**파일**: `modes/mammography-compare/src/index.tsx:285-292`

**문제**: 배치 처리 가능한 작업을 4번 개별 호출 → 4회의 VIEWPORT_DATA_CHANGED 이벤트 발생

**권장 수정**:
```typescript
viewportGridService.setDisplaySetsForViewports(
  assignments.map(([viewportId, ds]) => ({
    viewportId,
    displaySetInstanceUIDs: ds?.displaySetInstanceUID ? [ds.displaySetInstanceUID] : [],
  }))
);
```

---

## 데드 코드

### [DEAD-1] `chestWallAnchor.ts` — 프로덕션 코드에서 미사용 (테스트 파일에는 존재)

**파일**: `modes/mammography/src/chestWallAnchor.ts`

`computeChestWallAnchorPan`과 `computeChestWallAnchorPanDynamic`이 `commandsModule.ts`에서 re-export되지만, **`index.tsx`에서는 호출되지 않습니다**. 단, 단위 테스트(`chestWallAnchor.test.ts`)에서는 사용됩니다.

**맥락**: `commandsModule.ts`의 `chestWallWorldCache`가 이 함수들이 소비할 좌표를 캐시합니다. 현재 `index.tsx`는 이 함수들 대신 직접 pan 값을 복사하는 방식을 사용합니다. 이것은 **대안적 알고리즘**으로서 단위 테스트와 함께 보존된 상태입니다.

**권장 수정**: "대안 알고리즘" 또는 "미래 사용 예정"임을 주석으로 명시하거나, 사용 계획이 없으면 제거.

### [DEAD-2] `mammography-compare/src/index.tsx` — 죽은 named export

**파일**: `modes/mammography-compare/src/index.tsx:1032-1033`

```typescript
// OHIF 모드 시스템이 처리하지 않으며, onModeEnter에서 수동 등록
export const getCommandsModule = commandsModule;    // 데드
export const getEvaluatorsModule = evaluatorsModule; // 데드
```

mammography 모드(`index.tsx:845-847`)는 이미 이를 제거하고 이유를 주석으로 명시합니다.

**권장 수정**: 두 줄 제거.

---

## Compare 모드 상세 리뷰

> Compare 모드(`mammography-compare`) 코드를 집중 리뷰한 결과입니다.

### 요약

전반적으로 동기화 루프 방지, 자동 페어링 루프 방지 등 핵심 엣지케이스가 고려되어 있습니다. `getComparePairId` prefix 순서, `getMirrorPairId` replace 동작, 4-way Mirror+Compare sync, `_compareSyncState.isSyncing` 가드 — 모두 올바르게 동작합니다.

---

### [CM-1] `_isApplyingPairedLayout` — async 타이밍으로 인한 실질적 무용 가드

**파일**: `modes/mammography-compare/src/index.tsx:276-294`

```typescript
_isApplyingPairedLayout = true;
try {
  assignments.forEach(([vpId, ds]) => {
    viewportGridService.setDisplaySetsForViewport({ ... });
  });
} finally {
  _isApplyingPairedLayout = false;  // setDisplaySetsForViewport 완료 전에 해제
}
```

`setDisplaySetsForViewport`는 `async`이므로 플래그가 실제 처리 완료 전에 해제됩니다. **실질적 루프 방지는 `_expectedPairDisplaySets`에 전적으로 의존**합니다.

**권장 수정**: `_isApplyingPairedLayout`의 역할과 한계를 주석으로 명시.

---

### [CM-2] prior study 미로드 시 자동 채움 미지원

**파일**: `modes/mammography-compare/src/index.tsx:247-250`

prior study가 아직 로드되지 않은 상태에서 auto-pairing이 실행되면 우측 viewport가 빈 상태로 남습니다. 이후 prior study가 로드되어도 자동으로 채워지지 않습니다.

**권장 수정**: `DISPLAY_SETS_ADDED` 이벤트 구독하여 prior 로드 후 재페어링.

---

### [CM-3] `toggleMirrorModeCompare` — toggle 시 즉시 alignment 적용/해제 누락

**파일**: `modes/mammography-compare/src/commandsModule.ts:79-82`

Mirror Mode OFF 시 기존에 적용된 `setDisplayArea`가 복원되지 않습니다. ON 전환 시에는 다음 `IMAGE_RENDERED` 이벤트까지 대기해야 합니다.

---

### 정상 동작 확인 항목 (변경 불필요)

| 항목 | 결론 |
|------|------|
| `getComparePairId` prefix 순서 | 올바름 (longer prefix first) |
| `getMirrorPairId` replace 동작 | 올바름 (현재 규칙에서 안전) |
| Mirror + Compare 동시 활성화 4-way sync | 올바름 |
| `_compareSyncState.isSyncing` 가드 | 올바름 (JS 싱글스레드 특성 활용) |
| `chestWallWorldCache` | 올바름 — `index.tsx`에서 소비됨 (초기 리뷰 오류 수정) |
| `_isAutoLoadingPair` | INFO — 문서화 마커, 실제 루프 방지는 별도 로직 |

---

## 심각도별 전체 요약 표

| 우선순위 | 항목 | 파일:줄 | 영향 범위 |
|---------|------|---------|---------|
| **P1** | `window.location.href` 주석 없는 full reload | mammography/commandsModule.ts:352, compare/commandsModule.ts:75 | 코드 명확성 / 유지보수 |
| **P1** | `mammography-shared` 미사용 — 대규모 코드 중복 | modes/mammography-shared/ | 유지보수성 |
| **P1** | 커스텀 썸네일 모든 모달리티 적용 | getImageSrcFromImageId.js | CT/MR 썸네일 품질 |
| **P2** | `detectViewType` CC regex: mammography 모드 미수정 | mammography/commandsModule.ts:675 | 기능 정확성 |
| **P2** | compare `applyAutoWindowing` DICOM W/L 무시 | compare/index.tsx:376 | 의료 영상 품질 |
| **P2** | `isComputedVOI` 변경 — 전체 모드 영향 | CornerstoneViewportService.ts:358 | 전체 모드 VOI |
| **P2** | Manual CAMERA_MODIFIED sync (문서화 필요) | mammography/index.tsx:516-576 | 향후 호환성 |
| **P2** | `hpMammo.ts` 미사용 compare stage | hpMammo.ts:113-157 | 코드 명확성 |
| **P2** | 모드 내 헬퍼 함수 중복 | mammography/commandsModule.ts:422, index.tsx:215 | 유지보수성 |
| **P3** | IMAGE_RENDERED 매 프레임 alignment | compare/index.tsx:607-618 | 성능 |
| **P3** | 2초 하드코딩 auto-pairing 지연 | compare/index.tsx:907 | 견고성 |
| **P3** | 4개 viewport 개별 호출 | compare/index.tsx:285-292 | 성능 |
| **DEAD** | `chestWallAnchor.ts` 프로덕션 미사용 (테스트는 있음) | mammography/chestWallAnchor.ts | 코드 크기 |
| **DEAD** | `getCommandsModule`/`getEvaluatorsModule` export | compare/index.tsx:1032-1033 | 코드 명확성 |
| **INFO** | `_isApplyingPairedLayout` 한계 (주석 필요) | compare/index.tsx:276-294 | 코드 명확성 |
| **INFO** | prior study 미로드 자동 채움 미지원 | compare/index.tsx:247-250 | 기능 개선 |
| **INFO** | Mirror toggle 즉시 적용 누락 | compare/commandsModule.ts:79-82 | UX 개선 |

---

## 리팩토링 우선순위 권장사항

### Quick Wins (1시간 이내, 위험도 낮음)

1. **CC regex fix**: `mammography/commandsModule.ts:675-676` — `includes('CC')` → `/\b(?:[RL]\s*)?CC\b/.test(desc)` (compare 모드 이미 수정됨, 3분)
2. **Dead export 제거**: `compare/index.tsx:1032-1033` — `getCommandsModule`, `getEvaluatorsModule` 두 줄 제거 (5분)
3. **full reload 주석 추가**: `mammography/commandsModule.ts:352`, `compare/commandsModule.ts:75` — 의도 설명 (10분)

### 단기 수정 (P1, 1-2 스프린트)

1. `mammography-shared` 활성화 — 공통 로직 이동으로 중복 제거
2. `getImageSrcFromImageId.js` modality 체크 추가

### 중기 수정 (P2, 다음 마일스톤)

1. compare 모드 `applyAutoWindowing` — mammography 모드 구현 참조하여 DICOM W/L 우선 적용
2. `hpMammo.ts` 미사용 compare stage 제거
3. 모드 내 헬퍼 함수 중복 제거

### 장기 검토 (P3)

1. `IMAGE_RENDERED` 핸들러 최적화 — `_chestWallAlignedSet` 활용
2. auto-pairing 이벤트 기반 활성화
3. `CAMERA_MODIFIED` 수동 sync — SyncGroupService 마이그레이션 가능성 검토

---

---

## Post-Implementation 리뷰 (2026-02-24)

> 수정 완료 후 직접 코드 검토를 통해 발견된 추가 이슈 및 수정 내역

### 수정 완료 항목

| 항목 | 파일 | 조치 |
|------|------|------|
| [BUG-1] `applyAutoWindowing` — `_autoWindowedSet.add()` render 이후 호출 (race condition) | compare/index.tsx | `add()` → `render()` 이전으로 이동 |
| [BUG-2] `applyAutoWindowing` — 빈 배열 DICOM 태그에서 NaN VOI | compare/index.tsx | `Number.isFinite()` 가드 추가 |
| [MINOR-2] MLO regex 불일치 — CC는 정규식, MLO는 `includes` 사용 | mammography/commandsModule.ts (2개소) | `/\b(?:[RL]\s*)?MLO\b/` 적용 |
| MLO 정규식 false positive / CC 우선순위 테스트 추가 | commandsModule.test.ts | 5개 테스트 추가 (총 45개 → pass) |

### [BUG-1] 상세 설명

Cornerstone3D는 `viewport.render()` 내부에서 `IMAGE_RENDERED` 이벤트를 **동기적으로** 발생시킵니다(`element.dispatchEvent()`). 이로 인해:

```
render() 호출
  └─ IMAGE_RENDERED 동기 발생
      └─ renderedHandler: !_autoWindowedSet.has(vp) → true (아직 add 안 됨)
          └─ applyAutoWindowing 재귀 호출 → 무한 루프 가능
_autoWindowedSet.add(viewportId)  ← 너무 늦음
```

mammography/index.tsx는 `render()` 이전에 guard를 설정하는 올바른 패턴을 이미 사용했으나, 코드 이식 시 이 순서가 역전됨. 수정 후:

```typescript
_autoWindowedSet.add(viewportId);         // ← guard 먼저
viewport.setProperties({ voiRange: ... });
viewport.render();
```

### [BUG-2] 상세 설명

```typescript
const windowCenter = Number(Array.isArray(wcRaw) ? wcRaw[0] : wcRaw);
// wcRaw = [] → wcRaw[0] = undefined → Number(undefined) = NaN
```

NaN이 `voiRange.lower/upper`로 전달되면 Cornerstone은 예외를 발생시키지 않고 잘못된 렌더링을 수행. 이후 `_autoWindowedSet`에 의해 재시도도 막혀 뷰포트가 영구적으로 잘못된 상태가 됨.

수정: `Number.isFinite(windowCenter) && Number.isFinite(windowWidth)` 가드 추가 → 실패 시 pixel range fallback.

### 잔존 Known Issues (수정 보류)

| 항목 | 이유 |
|------|------|
| [MINOR-1] 두 번째/세 번째 `window.location.href` 주석에 라인 번호 미포함 | 낮은 위험도, 리팩토링 시 일괄 처리 |
| [MINOR-3] compare `applyAutoWindowing` 디버그 로깅 없음 | mammography 모드에도 동일 패턴으로 추가 검토 필요 |
| [BUG-2] mammography/index.tsx도 동일 NaN 취약점 보유 | mammography 모드도 동일 패턴 → 별도 PR 권장 |

### 최종 테스트 결과

```
mammography mode:         45 tests — 45 passed (MLO regex 5개 신규)
mammography-compare mode: 101 tests — 101 passed
```

---

*검토 도구: Claude oracle (Opus 4.6) 초기 분석 + Momus (Opus 4.6) 비판적 메타 검토 + Post-Implementation 코드 검토*
*오분류 수정: `chestWallWorldCache` (false positive), `partnerLaterality` (phantom bug)*
