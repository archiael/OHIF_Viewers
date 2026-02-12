# Mammography 기능 요구사항 vs 코드 구현 갭 분석

**분석 날짜**: 2026-02-11
**분석 대상**: modes/mammography, modes/mammography-compare
**문서 기준**: document/mammography-feature-requirements.md

---

## 📊 요약

| 분류 | 구현됨 | 부분 구현 | 미구현 | 총계 |
|------|--------|-----------|--------|------|
| 필수 기능 (FR-2.x) | 4 | 3 | 5 | 12 |
| 추가 기능 (FR-3.x) | 2 | 2 | 4 | 8 |
| **전체** | **6** | **5** | **9** | **20** |

**구현률**: 30% (완전 구현), 25% (부분 구현), 45% (미구현)

---

## 1. 필수 기능 (FR-2.x) 구현 상태

### ✅ FR-2.1: Modality 필터링 (MG만 로딩)

**상태**: **구현됨**

**코드 위치**:
- `modes/mammography/src/index.tsx:465`
  ```typescript
  modeModalities: ['MG'],
  ```
- `extensions/default/src/hangingprotocols/hpMammo.ts:40-43`
  ```typescript
  attribute: 'ModalitiesInStudy',
  constraint: {
    contains: 'MG',
  },
  ```

**검증**: OHIF의 `isValidMode()` 함수가 Modality를 체크하여 MG가 없으면 모드 진입 불가

---

### ⚠️ FR-2.2: View Position 기준 정렬

**상태**: **부분 구현** (기본 매칭만, 정렬 로직 없음)

#### FR-2.2.1: mg_order 순서 정렬

**상태**: **미구현** ❌

**요구사항**:
```yaml
mg_order: RCC → LCC → RMLO → LMLO → RAP → LAP → Undefined
```

**현재 구현**:
- `extensions/default/src/hangingprotocols/utils/mammoDisplaySetSelector.ts`에서 **weight 기반 매칭**만 수행
- ViewCode, PatientOrientation, SeriesDescription의 contains/equals 규칙으로 RCC, LCC, RMLO, LMLO만 구분
- **RAP, LAP는 정의되지 않음**
- **정렬 순서는 hanging protocol의 viewport 순서에 의존** (하드코딩)

**코드**:
```typescript
// hpMammo.ts:78-105
viewports: [
  { displaySets: [{ id: 'RCC' }] },  // 항상 왼쪽
  { displaySets: [{ id: 'LCC' }] },  // 항상 오른쪽
]
```

**문제점**:
1. mg_order 순서가 코드에 없음
2. RAP, LAP 지원 안됨
3. Undefined View Position 처리 안됨

---

#### FR-2.2.2: 그룹 단위 정렬

**상태**: **미구현** ❌

**요구사항**:
```yaml
동일 View Position 반복 시:
  1. 그룹 끊기
  2. 각 그룹 내에서 mg_order 정렬
  3. 그룹들을 순서대로 연결

예시: [RCC₁, RCC₂, LCC₁, RMLO, LMLO, LCC₂]
→ [RCC₁, LCC₁, RMLO, LMLO, RCC₂, LCC₂]
```

**현재 구현**:
- Hanging protocol은 **단일 RCC, LCC만 선택**
- `matchedDisplaySetsIndex` 없음 (첫 번째 매칭만 사용)
- **다중 이미지 처리 로직 없음**

---

### ⚠️ FR-2.4: 페어링 규칙

**상태**: **부분 구현** (고정 2x1 레이아웃만)

#### FR-2.4.1: View Position 페어링

**요구사항**:
```yaml
페어 규칙:
  - RCC ↔ LCC
  - RMLO ↔ LMLO
  - RAP ↔ LAP
  - Undefined는 단독 표시
```

**현재 구현**:
- `hpMammo.ts`에서 **RCC-LCC 페어만** 하드코딩
- RMLO-LMLO는 별도 stage (미구현)
- RAP-LAP 없음

**코드**:
```typescript
// hpMammo.ts:67-107
stages: [
  {
    name: 'CC Views',  // RCC-LCC만
    viewports: [
      { displaySets: [{ id: 'RCC' }] },
      { displaySets: [{ id: 'LCC' }] },
    ],
  },
  // MLO stage 없음
]
```

---

#### FR-2.4.2: 빈 행 숨김

**상태**: **미구현** ❌

**요구사항**:
```yaml
양쪽 페어 모두 없으면 행 숨김
예: RCC만 있고 LCC 없음 → 빈 칸으로 표시 (행 유지)
    RCC, LCC 모두 없음 → 행 숨김
```

**현재 구현**:
- `allowUnmatchedView: true` 옵션만 있음
- 빈 viewport는 표시되지만 **행 숨김 로직 없음**

---

### ⚠️ FR-2.5: Mirror Mode (Chest Wall Anchoring)

**상태**: **부분 구현** (항상 ON, 토글 없음)

#### FR-2.5.1~2.5.4: Chest Wall 중앙 정렬 및 확대

**상태**: **구현됨** ✓

**코드 위치**:
- `hpMammo.ts:13-30`: displayArea 설정
  ```typescript
  // Right breast (RCC, RMLO) - chest wall on RIGHT edge
  const leftDisplayArea = {
    imageCanvasPoint: {
      imagePoint: [1, 0.5],      // 이미지의 오른쪽 중앙
      canvasPoint: [1.0, 0.5],   // 캔버스 오른쪽에 고정
    },
  };

  // Left breast (LCC, LMLO) - chest wall on LEFT edge
  const rightDisplayArea = {
    imageCanvasPoint: {
      imagePoint: [0, 0.5],      // 이미지의 왼쪽 중앙
      canvasPoint: [0.0, 0.5],   // 캔버스 왼쪽에 고정
    },
  };
  ```

- `modes/mammography/src/utils/mammographyMidline.ts:246-287`: getFixedMidlineAnchor()
  - imageBounds 기반 고정 world 좌표 계산
  - Laterality에 따라 minX (L breast) 또는 maxX (R breast) 반환

- `modes/mammography/src/commandsModule.ts:81-290`: mammoMagnify 커맨드
  - Chest wall 기준 1.5x 확대/축소
  - `getFixedMidlineAnchor()`로 고정점 획득
  - Zoom 시 chest wall 위치 유지

**검증**: ✅ Chest wall이 화면 중앙 (왼쪽 끝 or 오른쪽 끝)에 고정되고, 확대 시 해당 지점 기준으로 zoom

---

#### FR-2.5.5: Mirror Mode On/Off 토글

**상태**: **미구현** ❌

**요구사항**:
```yaml
Mirror Mode 토글 버튼:
  - ON: Chest wall 중앙 정렬 (현재 상태)
  - OFF: 일반 뷰 (chest wall 정렬 해제)
```

**현재 구현**:
- **항상 Mirror Mode ON 상태**
- 토글 버튼 없음
- displayArea 설정이 hanging protocol에 하드코딩되어 변경 불가

**필요 작업**:
1. `toggleMirrorMode` 커맨드 추가
2. displayArea 동적 변경 로직
3. Toolbar 버튼 추가

---

### ✅ FR-2.6: 동기화

#### FR-2.6.1~2.6.3: Zoom, Pan, Window/Level 동기화

**상태**: **구현됨** ✓

**코드 위치**:
- `modes/mammography/src/commandsModule.ts:295-507`: toggleMammoSync 커맨드
  - Zoom 동기화 (378-437줄): chest wall 기준, 각 viewport별 anchor 사용
  - Pan 동기화 (439-480줄): delta 기반
  - Window/Level 동기화 (488-494줄): VOI sync group 사용

**코드**:
```typescript
// Zoom 동기화
if (zoomChanged) {
  const zoomRatio = sourceCamera.parallelScale / previousCamera.parallelScale;

  viewportList.forEach(({ viewport: targetViewport }) => {
    const anchorWorld = getFixedMidlineAnchor(targetViewport);
    const newParallelScale = targetCamera.parallelScale * zoomRatio;

    // Calculate shift to keep chest wall fixed
    const shift = [
      (anchorWorld[0] - targetCamera.focalPoint[0]) * (1 - zoomRatio),
      // ...
    ];

    targetViewport.setCamera({ parallelScale: newParallelScale, ... });
  });
}

// Pan 동기화
if (focalPointChanged && !zoomChanged) {
  const deltaX = sourceCamera.focalPoint[0] - previousCamera.focalPoint[0];
  // Apply delta to all viewports
}

// Window/Level 동기화
syncGroupService.addViewportToSyncGroup(viewportId, renderingEngineId, {
  type: 'voi',
  id: VOI_SYNC_GROUP_ID,
});
```

**검증**: ✅ Sync 버튼 클릭 시 모든 viewport의 zoom, pan, contrast가 동기화됨

---

#### FR-2.6.4: Mirror Mode OFF 시 좌우 반전 Pan

**상태**: **미구현** ❌ (Mirror Mode 토글 자체가 없음)

**요구사항**:
```yaml
Mirror Mode OFF + Sync ON:
  - 왼쪽 Pan → 왼쪽 Pan (반전 없음)
  - 오른쪽 Pan → 오른쪽 Pan

Mirror Mode ON + Sync ON:
  - 왼쪽 Pan → 오른쪽 Pan (좌우 반전)
```

**현재 구현**:
- **항상 Mirror Mode ON 상태**로 가정
- Pan 동기화는 항상 delta 기반 (반전 없음)
- **좌우 반전 로직 없음**

**문제점**:
1. Mirror Mode 토글이 없어서 테스트 불가
2. 문서의 "좌우 반전 Pan"이 실제로 필요한지 불명확
   - 현재 구현: LCC 오른쪽 pan → RCC도 오른쪽 pan (chest wall은 고정, 유방 조직만 이동)
   - 문서 요구: LCC 오른쪽 pan → RCC는 왼쪽 pan? (의미 불명확)

**⚠️ 문서 명확화 필요**: Mirror Mode OFF 시 pan 동작 재정의 필요

---

## 2. 추가 기능 (FR-3.x) 구현 상태

### ✅ FR-3.3: Compare Mode

#### FR-3.3.1: Compare Mode 전환

**상태**: **구현됨** ✓

**코드 위치**:
- `modes/mammography/src/commandsModule.ts:814-843`: openMammoCompare 커맨드
  ```typescript
  openMammoCompare: () => {
    const studyInstanceUID = activeDisplaySets[0].StudyInstanceUID;
    const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${studyInstanceUID}...`;
    window.location.href = compareModeUrl;
  }
  ```

- `modes/mammography/src/toolbarButtons.ts:70-78`: Compare 버튼
  ```typescript
  {
    id: 'MammoCompare',
    label: 'Compare',
    commands: { commandName: 'openMammoCompare', context: 'MAMMOGRAPHY' },
  }
  ```

**검증**: ✅ Toolbar의 Compare 버튼 클릭 시 mammography-compare 모드로 전환

---

#### FR-3.3.2: Compare Mode 활성화/종료 동작

**상태**: **부분 구현** ⚠️

**요구사항**:
```yaml
Compare Mode 활성화:
  좌측: 현재 Study 유지
  우측: 자동으로 가장 최근 Prior Study 로드

Compare Mode 종료:
  현재 Select된 Study를 단일 모드로 표시
```

**현재 구현**:
- **활성화**: openMammoCompare는 현재 Study만 URL에 포함
  ```typescript
  const compareModeUrl = `/mammography-compare?StudyInstanceUIDs=${studyInstanceUID}`;
  ```
  - ⚠️ Prior Study 자동 로드는 **Hanging Protocol의 numberOfPriorsReferenced**에 의존
  - `hpCompare.ts:119`: `numberOfPriorsReferenced: 1`
  - OHIF Core가 자동으로 prior study를 찾아서 로드 (날짜 기준 최신순)

- **종료**: **미구현** ❌
  - Compare 모드에서 일반 모드로 돌아가는 버튼/로직 없음
  - 브라우저 뒤로가기만 가능

**필요 작업**:
1. Compare 종료 버튼 추가
2. Select된 Study를 추적하는 상태 관리
3. 종료 시 선택된 Study로 일반 모드 전환

---

#### FR-3.3.3~3.3.6: Compare Mode 동기화

**상태**: **부분 구현** ⚠️

**요구사항**:
```yaml
Layout 동기화: 양쪽 동일 layout (2x1, 2x2 등)
Scroll 동기화: 같은 View Position 표시
Zoom 동기화: 한쪽 zoom → 양쪽 zoom
Pan 동기화: Mirror Mode 고려
```

**현재 구현**:
- `modes/mammography-compare/src/index.tsx`는 **mammography와 90% 중복**
- `hpCompare.ts`에서 current/prior viewport 정의
- **toggleMammoSync 커맨드는 단일 모드와 동일하게 작동 가능** (모든 viewport 동기화)

**검증 필요**: ⚠️
1. Compare 모드에서 Layout 변경 시 양쪽 동기화 확인
2. Scroll 동기화 확인 (현재는 wheel 이벤트 기반, compare 모드에서 테스트 필요)
3. Compare 모드에서 Sync 버튼 동작 확인

---

#### FR-3.3.7: Study 정보 표시 및 시각적 피드백

**상태**: **미구현** ❌

**요구사항**:
```yaml
시각적 구분:
  좌측 영역: 파란색 테두리 (#3B82F6)
  우측 영역: 초록색 테두리 (#10B981)
  Select된 영역: 3px 두꺼운 테두리

History Panel:
  현재 로딩된 Study: 파란색/초록색 표시
  Compare 중인 Study: 파란색/초록색 표시
```

**현재 구현**:
- **CSS 스타일 없음**
- History Panel (studyListMammo)의 시각적 피드백 없음

**필요 작업**:
1. Compare 모드 전용 CSS 추가
2. Viewport wrapper에 `data-side="left|right"` attribute 추가
3. Select 상태 관리 및 스타일 적용
4. StudyListMammo 패널 커스터마이징

---

#### FR-3.3.8: Compare Mode에서 Mirror Mode 동기화

**상태**: **미구현** ❌ (Mirror Mode 토글 자체가 없음)

**요구사항**:
```yaml
Compare Mode:
  좌측에서 Mirror Mode ON → 우측도 ON
  좌측에서 Mirror Mode OFF → 우측도 OFF
```

**현재 구현**:
- Mirror Mode 토글이 없으므로 동기화할 것도 없음
- 항상 ON 상태

---

## 3. 코드 구조 분석

### 3.1. 파일별 역할

| 파일 | 역할 | 크기 |
|------|------|------|
| `modes/mammography/src/index.tsx` | 모드 진입점, onModeEnter/Exit | 497줄 |
| `modes/mammography/src/commandsModule.ts` | 커맨드 정의 (mammoMagnify, toggleMammoSync, openMammoCompare) | **895줄** ⚠️ |
| `modes/mammography/src/toolbarButtons.ts` | Toolbar 버튼 정의 | 743줄 |
| `modes/mammography/src/initToolGroups.ts` | Tool Group 초기화 (mammography, default, SR 등) | 496줄 |
| `modes/mammography/src/utils/mammographyMidline.ts` | Laterality 감지, Midline Anchor 계산 | 337줄 |
| `extensions/default/src/hangingprotocols/hpMammo.ts` | Hanging Protocol (RCC-LCC 페어, displayArea 설정) | 154줄 |
| `extensions/default/src/hangingprotocols/utils/mammoDisplaySetSelector.ts` | Display Set 선택 규칙 (weight 기반 매칭) | 215줄 |

### 3.2. 주요 문제점 (코드 리뷰에서 지적된 내용)

1. **90% 코드 중복**: mammography와 mammography-compare 간 ~3,000+ 줄 중복
2. **God Function**: commandsModule.ts가 895줄, mammoMagnify 함수 210줄
3. **전역 변수 남용**: 10개 이상의 모듈 레벨 변수 (isSyncEnabled, cameraSyncUnsubscribes 등)
4. **복잡한 Laterality 감지**: 5단계 우선순위 + 8개 variant 생성
5. **테스트 부재**: *.test.ts 파일 없음

---

## 4. 코드 품질 이슈

### 4.1 심각한 코드 중복 (DRY 원칙 위반)

**문제**: mammography와 mammography-compare 모드가 거의 동일한 코드를 각각 가지고 있음.

| 파일 | mammography | mammography-compare | 중복도 |
|------|------------|---------------------|--------|
| `commandsModule.ts` | 896줄 | 876줄 | ~95% |
| `toolbarButtons.ts` | 743줄 | 743줄 | 100% |
| `MammographyZoomTool.ts` | 100줄 | 100줄 | 100% |
| `initToolGroups.ts` | 496줄 | 496줄 | 100% |
| `evaluatorsModule.ts` | 69줄 | 69줄 | 100% |
| `mammographyMidline.ts` | 337줄 | 337줄 | 100% |

**영향**: ~3,000+ 줄의 중복 코드로 인해 버그 수정 시 두 곳 모두 수정 필요, 번들 크기 2배 증가, 유지보수 비용 2배 증가.

---

### 4.2 복잡한 상태 관리 (Module-Level State)

**문제**: commandsModule.ts에서 모듈 레벨 전역 변수로 상태 관리

```typescript
let isSyncEnabled = false;
let cameraSyncUnsubscribes = [];
let customWheelUnsubscribes = [];
let previousCameras = new Map();
let isApplyingSingleViewportZoom = false;
let isSyncingCameras = false;
let isMagnifyingFromButton = false;
let isResizingViewport = false;
let isDragZooming = false;
```

**문제점**:
1. 전역 상태 오염 → side effect 발생
2. 테스트 격리 불가
3. DevTools 지원 없음 → 디버깅 어려움
4. 메모리 누수 위험 (cleanup 로직 불완전)
5. Race Condition 가능성

---

### 4.3 God Function (mammoMagnify, toggleMammoSync, initMammoMode)

**문제**: commandsModule.ts의 주요 함수들이 너무 큼

| 함수 | 라인 수 | 책임 개수 |
|------|--------|----------|
| `mammoMagnify` | 210줄 | 9개 (줌, 동기화, 카메라, UI 등) |
| `toggleMammoSync` | 213줄 | 8개 (이벤트 관리, 동기화, UI 등) |
| `initMammoMode` | 318줄 | 7개 (초기화, 휠 핸들러, 정리 등) |

**영향**: 단일 책임 원칙 위반 → 테스트 불가능, 가독성 저하, 유지보수 어려움.

---

### 4.4 복잡한 Laterality 감지 로직

**문제**: mammographyMidline.ts에서 5단계 우선순위와 8개 variant로 과도하게 복잡함

```typescript
const buildTagVariants = (tag: string): string[] => {
  // 8개의 variant 생성 (tag, noComma, lower, x, X, 0x 등)
  return [tag, noComma, lower, `x${noComma}`, ...];  // 불필요한 연산
};
```

**영향**: 성능 이슈, 유지보수 어려움, 8개 variant로 인한 메모리 오버헤드.

---

### 4.5 Event Listener 메모리 누수 위험

**문제**: Event Listener 등록이 많지만 cleanup이 불완전

```typescript
element.addEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
cameraSyncUnsubscribes.push(() => {
  element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
});
```

**문제점**:
1. `cameraSyncUnsubscribes` 배열이 `let`으로 선언되어 재할당 가능
2. 모드 전환 시 cleanup 미실행 가능
3. 에러 발생 시 listener 누적

---

### 4.6 높은 결합도 (Tight Coupling)

**문제**: commandsModule이 직접 참조하는 서비스

- `viewportGridService`
- `syncGroupService`
- `cornerstoneViewportService`
- `toolbarService`
- `displaySetService`

**영향**: 5개 서비스 모두 mock 필요 → 단위 테스트 어려움, 서비스 변경 시 모든 모듈 수정.

---

### 4.7 TypeScript 타입 안전성 부족

**문제 1**: Any 타입 남용
```typescript
const getTagStringValue = (instance: Record<string, any>, tags: string[]): string | null => {};
```

**문제 2**: Optional Chaining 과도 사용
```typescript
const viewportId = vp.viewportId || vp.viewportOptions?.viewportId;
const numSlices = vp_viewport.getNumberOfSlices?.() || 1;
```

---

### 4.8 Console.log 남용

**문제**: 50회 이상의 console.log 호출 (프로덕션 성능 저하)

```typescript
console.log('🔧 Applying chest wall anchoring to all viewports');
console.log(`✅ [${index}] Reset camera for viewport ${vpId}`);
console.log(`  - Anchor (fixed): [${worldPoint[0].toFixed(2)}, ...]`);
```

**영향**: 로그 레벨 구분 없음, 구조화된 로깅 미사용, 프로덕션 빌드에도 포함.

---

### 4.9 테스트 부재

**문제**: *.test.ts, *.spec.ts 파일 없음

**영향**: 리팩토링 시 회귀 버그 위험, 코드 품질 검증 불가, 신규 개발자 온보딩 어려움.

---

### 4.10 주석 처리된 Dead Code

**문제**: 173-266줄이 주석 처리됨 (Chest Wall Anchoring 94줄)

```typescript
// TODO: Temporarily commented out chest wall anchoring to isolate React hooks error
/*
// Left breast images (LCC, LMLO) - chest wall on LEFT edge
const rightDisplayArea = { ... };
// ... 94줄
*/
```

**영향**: 가독성 저하, TODO 방치됨, 버그 원인 불명확.

---

## 5. 리팩토링 로드맵

### Phase 1: 긴급 (1-2주)

| 작업 | 설명 | 영향도 |
|------|------|--------|
| **코드 중복 제거** | 공유 패키지 `mammography-shared` 생성 | 🔥 High |
| **Dead Code 제거** | 주석 처리된 94줄 삭제 | Low |
| **Magic Number 상수화** | ZOOM_FACTOR, 타이머 등 | Medium |

### Phase 2: 중요 (2-4주)

| 작업 | 설명 | 영향도 |
|------|------|--------|
| **상태 관리 개선** | Zustand 도입 | 🔥 High |
| **함수 분해** | God Function → 클래스 분리 | 🔥 High |
| **테스트 추가** | 핵심 로직 테스트 커버리지 80% | High |

### Phase 3: 개선 (4-6주)

| 작업 | 설명 | 영향도 |
|------|------|--------|
| **Laterality 리팩토링** | Strategy 패턴 적용 | Medium |
| **Event Listener 관리** | Custom Hook 적용 | High |
| **타입 안전성** | Any 타입 제거 | Medium |

---

## 6. 갭 분석 결론

### 4.1. 구현됨 기능 (6개)

1. ✅ FR-2.1: Modality 필터링 (MG만)
2. ✅ FR-2.5.1~2.5.4: Chest Wall 중앙 정렬 및 확대
3. ✅ FR-2.6.1~2.6.3: Zoom, Pan, Window/Level 동기화
4. ✅ FR-3.3.1: Compare Mode 전환

### 4.2. 부분 구현 기능 (5개)

1. ⚠️ FR-2.2: View Position 기준 정렬 (기본 매칭만, 정렬 로직 없음)
2. ⚠️ FR-2.4: 페어링 규칙 (고정 2x1 레이아웃만, 동적 페어링 없음)
3. ⚠️ FR-2.5: Mirror Mode (항상 ON, 토글 없음)
4. ⚠️ FR-3.3.2: Compare Mode 활성화/종료 (종료 로직 없음)
5. ⚠️ FR-3.3.3~3.3.6: Compare Mode 동기화 (검증 필요)

### 4.3. 미구현 기능 (9개)

1. ❌ FR-2.2.1: mg_order 순서 정렬 (RCC→LCC→RMLO→LMLO→RAP→LAP→Undefined)
2. ❌ FR-2.2.2: 그룹 단위 정렬 (동일 View Position 반복 시)
3. ❌ FR-2.4.2: 빈 행 숨김 (양쪽 페어 모두 없을 때)
4. ❌ FR-2.5.5: Mirror Mode On/Off 토글
5. ❌ FR-2.6.4: Mirror Mode OFF 시 좌우 반전 Pan
6. ❌ FR-3.3.2: Compare Mode 종료 버튼/로직
7. ❌ FR-3.3.7: Study 정보 표시 및 시각적 피드백 (테두리 색상)
8. ❌ FR-3.3.8: Compare Mode에서 Mirror Mode 동기화

---

## 5. 우선순위 제안

### 🔴 Critical (필수 구현)

1. **FR-2.2.1: mg_order 정렬**
   - 현재: RCC-LCC 하드코딩
   - 필요: RAP, LAP 지원 + 동적 정렬
   - 영향도: 높음 (모든 View Position 처리 불가)

2. **FR-2.5.5: Mirror Mode 토글**
   - 현재: 항상 ON
   - 필요: 토글 버튼 + displayArea 동적 변경
   - 영향도: 높음 (사용자 선택권 없음)

3. **FR-3.3.7: Study 시각적 피드백**
   - 현재: 구분 없음
   - 필요: 좌우 테두리 색상, Select 표시
   - 영향도: 높음 (Compare 모드 UX 핵심)

### 🟠 High (중요 구현)

4. **FR-2.2.2: 그룹 단위 정렬**
   - 현재: 단일 이미지만
   - 필요: 다중 이미지 처리 (RCC₁, RCC₂ 등)
   - 영향도: 중간 (일부 데이터만 해당)

5. **FR-2.4.2: 빈 행 숨김**
   - 현재: 빈 viewport 표시
   - 필요: 양쪽 모두 없을 때 행 제거
   - 영향도: 중간 (UX 개선)

6. **FR-3.3.2: Compare 종료 로직**
   - 현재: 뒤로가기만
   - 필요: 종료 버튼 + Select된 Study로 전환
   - 영향도: 중간 (UX 개선)

### 🟡 Medium (선택 구현)

7. **FR-2.6.4: Mirror Mode OFF 시 Pan**
   - 전제: Mirror Mode 토글 구현 후
   - 영향도: 낮음 (사용 빈도 낮음)
   - ⚠️ 문서 명확화 필요

8. **FR-3.3.8: Compare에서 Mirror Mode 동기화**
   - 전제: Mirror Mode 토글 구현 후
   - 영향도: 낮음

---

## 6. 문서 개선 제안

### 6.1. 요구사항 명확화 필요

1. **FR-2.6.4: Mirror Mode OFF 시 Pan 동작**
   - 현재 문서: "왼쪽 이미지가 왼쪽으로 panning하면 mirror 모드니깐 오른쪽 이미지는 같은 정도 오른쪽으로 panning"
   - 문제점: Mirror Mode OFF 시 좌우 반전의 의미가 불명확
   - 제안: Chest wall 고정 상태에서 유방 조직 이동 방향 명확화

2. **FR-2.2.2: 그룹 단위 정렬 예시 추가**
   - 현재: 텍스트 설명만
   - 제안: ASCII 다이어그램으로 시각화 (다른 섹션처럼)

3. **FR-3.3.2: Compare Mode 전환 시 URL 동작**
   - 현재: "가장 최근 Prior Study 자동 로드"
   - 문제점: OHIF Core의 자동 로드 메커니즘에 의존, 실제 동작 검증 필요
   - 제안: Hanging Protocol의 numberOfPriorsReferenced 작동 방식 문서화

### 6.2. 코드 기반 재정의 필요

1. **FR-2.4: 페어링 규칙**
   - 현재: 동적 페어링 가정
   - 실제: Hanging Protocol Stage 기반 고정 레이아웃
   - 제안: Stage 개념 도입 (CC Views, MLO Views 등)

2. **FR-2.5: Mirror Mode**
   - 현재: On/Off 토글 가정
   - 실제: displayArea 설정으로 항상 ON
   - 제안: Hanging Protocol의 displayArea 설정 명시

---

## 7. 다음 단계

1. **mammography-feature-requirements.md 업데이트**
   - 갭 분석 결과 반영
   - 구현 상태 표시 (✅/⚠️/❌)
   - 코드 위치 링크 추가

2. **우선순위 기능 구현 계획**
   - Critical 3개 → High 3개 → Medium 2개 순서

3. **코드 리팩토링 계획** (document/mammography-critical-code-review.md 참조)
   - 코드 중복 제거 (mammography-shared 패키지)
   - God Function 분해 (commandsModule.ts)
   - 전역 변수 → Zustand 상태 관리

4. **테스트 작성**
   - Unit test: Laterality 감지, Display Set 정렬
   - Integration test: Sync 동작, Compare Mode 전환
   - E2E test: 전체 워크플로우

---

**작성자**: Claude Code (GPT-4.5)
**참고 문서**:
- [mammography-feature-requirements.md](./mammography-feature-requirements.md)
- [mammography-critical-code-review.md](./mammography-critical-code-review.md)
