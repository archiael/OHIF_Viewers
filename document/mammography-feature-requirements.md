# Mammography 기능 요구사항 명세서

> **프로젝트**: mView-WebV2 (OHIF Viewer v3.12.0-beta 기반)
> **작성일**: 2026-02-11
> **최종 수정**: 2026-02-11
> **브랜치**: feature/mammography-features (commit: 96976b9)
> **참조 문서**: [20260211_03_MG_Sort_Mirror_Compare_Analysis.md](./20260211_03_MG_Sort_Mirror_Compare_Analysis.md)

---

## 목차

1. [개요](#1-개요)
2. [현재 구현 상태](#2-현재-구현-상태)
3. [요구사항 상세](#3-요구사항-상세)
   - 3.1. [FR-3.3.8: Prior Study Auto-Selection](#31-fr-338-prior-study-auto-selection)
   - 3.2. [FR-3.3.2: Compare Exit Button](#32-fr-332-compare-exit-button)
   - 3.3. [FR-2.5.5: Mirror Mode Toggle](#33-fr-255-mirror-mode-toggle)
   - 3.4. [FR-3.3.9: Compare Sync Toggle](#34-fr-339-compare-sync-toggle)
   - 3.5. [FR-3.3.7: Study Visual Feedback](#35-fr-337-study-visual-feedback)
4. [구현 계획](#4-구현-계획)
5. [테스트 계획](#5-테스트-계획)

---

## 1. 개요

### 1.1 목적

OHIF Viewer의 Mammography 모드에 다음 **5가지 기능**을 추가하여 방사선과 워크플로우를 개선합니다:

1. **Prior Study Auto-Selection**: Compare 모드 진입 시 이전 검사 자동 선택
2. **Compare Exit Button**: Compare 모드 나가기 버튼
3. **Mirror Mode Toggle**: 흉벽 정렬 on/off 토글 기능
4. **Compare Sync Toggle**: Current/Prior 간 동기화 on/off 제어
5. **Study Visual Feedback**: Compare 모드에서 현재/이전 스터디 시각적 구분

### 1.2 배경

**현재 구현되어 있는 기능**:
- ✅ MammoMagnify: 흉벽 기준 1.5배 확대/축소
- ✅ SyncAllImages: 단일 스터디 내 줌/팬/윈도우레벨 동기화
- ✅ MammoCompare: 비교 모드로 전환 (기본 기능만)
- ✅ Hanging Protocol: displayArea 설정

**누락되어 있는 기능** (이번에 추가):
- ❌ Prior study 자동 선택 및 로딩
- ❌ Compare 모드 나가기 버튼
- ❌ Mirror mode 토글 버튼
- ❌ Compare 모드 동기화 제어
- ❌ Compare 모드 시각적 피드백

### 1.3 참조 시스템

mViewSystems (JavaFX DICOM Viewer)의 구현을 참조하되, OHIF의 아키텍처에 맞게 재설계합니다.

---

## 2. 현재 구현 상태

### 2.1 구현된 기능

| 기능 | 파일 | 상태 |
|------|------|------|
| MammoMagnify | commandsModule.ts:84-293 | ✅ 구현됨 |
| SyncAllImages | commandsModule.ts:298-510 | ✅ 구현됨 |
| MammoCompare | commandsModule.ts:817-846 | ⚠️ 기본 기능만 |
| Hanging Protocol | hpMammo.ts | ✅ displayArea 설정됨 |
| DisplaySet Selectors | mammoDisplaySetSelector.ts | ✅ RCC/LCC/RMLO/LMLO + Prior + Fallback |

### 2.2 주석 처리된 코드

**modes/mammography/src/index.tsx:174-267**
```typescript
// TODO: Temporarily commented out chest wall anchoring to isolate React hooks error
/*
const rightDisplayArea = { ... }
const leftDisplayArea = { ... }
const applyChestWallAnchoring = () => { ... }
*/
```

**이유**: React hooks error 격리 위해 임시 비활성화
**영향**: 현재 chest wall anchoring이 자동 적용되지 않음
**조치**: Mirror Mode Toggle 구현 시 재활성화 필요

---

## 3. 요구사항 상세

## 3.1. FR-3.3.8: Prior Study Auto-Selection

### 3.1.1 기능 설명

**목적**: Compare 모드 진입 시 이전 검사를 자동으로 선택하여 로딩

**현재 문제**:
- `openMammoCompare` 명령이 현재 스터디 UID만 전달
- Prior study 선택 로직 없음 → 사용자가 수동 선택해야 함

**개선 후**:
1. MammoCompare 버튼 클릭
2. 시스템이 자동으로 이전 검사 검색:
   - 동일 PatientID
   - Modality = MG
   - StudyDate < 현재 스터디 날짜
   - 가장 최근 검사 선택
3. URL에 current + prior UID 전달:
   `/mammography-compare?StudyInstanceUIDs=current-uid,prior-uid`
4. Compare 모드에서 두 스터디 자동 로딩

### 3.1.2 기술 사양

#### 3.1.2.1 Prior Study 검색 알고리즘

```typescript
// commandsModule.ts의 openMammoCompare 수정
openMammoCompare: () => {
  const { displaySetService } = servicesManager.services;
  const activeDisplaySets = displaySetService.getActiveDisplaySets();

  if (!activeDisplaySets || activeDisplaySets.length === 0) {
    console.error('No active display sets found');
    return;
  }

  const currentStudyUID = activeDisplaySets[0].StudyInstanceUID;
  const patientID = activeDisplaySets[0].PatientID;
  const currentStudyDate = activeDisplaySets[0].StudyDate;

  // Search for prior studies
  const priorStudy = findMostRecentPriorStudy(patientID, currentStudyDate, 'MG');

  if (!priorStudy) {
    console.warn('No prior MG study found for patient:', patientID);
    // Fallback: Compare 모드로 이동하되 prior 없음
    const url = `/mammography-compare?StudyInstanceUIDs=${encodeURIComponent(currentStudyUID)}`;
    window.location.href = url;
    return;
  }

  // Navigate with both current and prior
  const url = `/mammography-compare?StudyInstanceUIDs=${encodeURIComponent(currentStudyUID)},${encodeURIComponent(priorStudy.StudyInstanceUID)}`;
  console.log('Navigating to compare mode with prior study:', url);
  window.location.href = url;
}

function findMostRecentPriorStudy(patientID, currentStudyDate, modality) {
  // Option 1: DicomMetadataStore 사용
  const studies = DicomMetadataStore.getStudiesByPatientID?.(patientID);
  if (!studies) return null;

  const priorStudies = studies
    .filter(s => s.Modality === modality)
    .filter(s => s.StudyDate < currentStudyDate)
    .sort((a, b) => b.StudyDate - a.StudyDate);

  return priorStudies[0] || null;

  // Option 2: DataSource query 사용 (비동기)
  // const dataSource = extensionManager.getDataSource();
  // return await dataSource.query.studies.search({ PatientID: patientID, Modality: modality });
}
```

#### 3.1.2.2 URL 파라미터 파싱

```typescript
// mammography-compare 모드의 onModeEnter에서
onModeEnter({ servicesManager }) {
  const urlParams = new URLSearchParams(window.location.search);
  const studyUIDs = urlParams.get('StudyInstanceUIDs')?.split(',') || [];

  const currentStudyUID = studyUIDs[0];
  const priorStudyUID = studyUIDs[1]; // Optional

  // Load current study
  await loadStudy(currentStudyUID);

  // Load prior study if available
  if (priorStudyUID) {
    await loadStudy(priorStudyUID);
  }
}
```

### 3.1.3 구현 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `modes/mammography/src/commandsModule.ts` | openMammoCompare 수정, findMostRecentPriorStudy 추가 |
| `modes/mammography-compare/src/index.tsx` | URL 파라미터 파싱, 복수 스터디 로딩 |
| `platform/core/src/classes/DicomMetadataStore.js` | getStudiesByPatientID 메서드 확인/추가 |

### 3.1.4 Fallback 처리

**Prior study 없을 경우**:
1. Console warning 출력
2. Compare 모드로 이동 (prior 없이)
3. Prior viewport는 빈 상태로 표시
4. 사용자에게 알림: "No prior study available"

---

## 3.2. FR-3.3.2: Compare Exit Button

### 3.2.1 기능 설명

**목적**: Compare 모드에서 단일 스터디 모드로 쉽게 돌아갈 수 있는 버튼 제공

**동작**:
1. 사용자가 "Exit Compare" 버튼 클릭
2. `/mammography` URL로 이동 (현재 스터디 유지)
3. 단일 스터디 레이아웃으로 복원
4. Prior 스터디 데이터 언로드

### 3.2.2 UI 설계

**툴바 버튼**:
- **ID**: `ExitCompare`
- **아이콘**: `icon-close` 또는 `icon-exit`
- **레이블**: "Exit Compare"
- **툴팁**: "Return to single study view"
- **위치**: Compare 모드 toolbar의 `MammoCompare` 위치 (대체)
- **스타일**: 빨간색 계열 (#dc3545)

### 3.2.3 기술 사양

#### 3.2.3.1 Command 정의

```typescript
// modes/mammography-compare/src/commandsModule.ts
exitMammoCompare: () => {
  console.log('Exit Compare - returning to single study view');

  try {
    const { displaySetService } = servicesManager.services;
    const activeDisplaySets = displaySetService.getActiveDisplaySets();

    // Get current study UID (not prior)
    const currentStudyDisplaySet = activeDisplaySets.find(
      ds => ds.studyInstanceUIDsIndex === 0
    );

    const studyInstanceUID = currentStudyDisplaySet?.StudyInstanceUID ||
                             activeDisplaySets[0]?.StudyInstanceUID;

    if (!studyInstanceUID) {
      console.warn('No study UID found, navigating to mammography without params');
      window.location.href = '/mammography';
      return;
    }

    // Get datasources parameter from current URL
    const urlParams = new URLSearchParams(window.location.search);
    const dataSourceQuery = urlParams.get('datasources') || '';

    // Navigate to mammography mode (single study)
    const mammographyUrl = `/mammography?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}${
      dataSourceQuery ? `&datasources=${encodeURIComponent(dataSourceQuery)}` : ''
    }`;

    console.log('Navigating to:', mammographyUrl);
    window.location.href = mammographyUrl;
  } catch (error) {
    console.error('Error exiting compare mode:', error);
    window.location.href = '/mammography';
  }
}
```

#### 3.2.3.2 Toolbar Button 정의

```typescript
// modes/mammography-compare/src/toolbarButtons.ts
{
  id: 'ExitCompare',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'icon-close',
    label: 'Exit Compare',
    tooltip: 'Return to single study view',
    commands: { commandName: 'exitMammoCompare', context: 'MAMMOGRAPHY' },
    evaluate: 'evaluate.action',
    className: 'exit-compare-button',
  },
}
```

#### 3.2.3.3 Toolbar Section 업데이트

```typescript
// modes/mammography-compare/src/index.tsx
export const toolbarSections = {
  [TOOLBAR_SECTIONS.primary]: [
    'MammoMagnify',
    'MirrorModeToggle',
    'SyncAllImages',
    'ExitCompare',  // MammoCompare 대신 표시
    'MeasurementTools',
    // ...
  ],
};
```

### 3.2.4 구현 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `modes/mammography-compare/src/commandsModule.ts` | exitMammoCompare command 추가 |
| `modes/mammography-compare/src/toolbarButtons.ts` | ExitCompare 버튼 정의 추가 |
| `modes/mammography-compare/src/index.tsx` | toolbarSections 업데이트, command 등록 |

---

## 3.3. FR-2.5.5: Mirror Mode Toggle

### 3.3.1 기능 설명

**목적**: 방사선과 의사가 chest wall anchoring(흉벽 정렬)을 수동으로 on/off 할 수 있는 토글 버튼 제공

**동작**:
- **초기 로딩**: Mirror Mode **ON** (기본값)
  - Hanging Protocol의 displayArea 설정 적용
  - 우측 유방(RCC, RMLO): 흉벽을 오른쪽 가장자리에 고정
  - 좌측 유방(LCC, LMLO): 흉벽을 왼쪽 가장자리에 고정

- **Mirror Mode ON**:
  - 양쪽 유방의 흉벽이 중앙을 향하도록 대칭 배치

- **Mirror Mode OFF**:
  - 모든 이미지를 viewport 중앙에 배치

**중요**: 자동 감지 불필요, DICOM 태그로만 Laterality 판단

### 3.3.2 기술 사양

#### 3.3.2.1 Command 정의

```typescript
// commandsModule.ts
let isMirrorModeEnabled = true; // 기본값: ON

toggleMirrorMode: () => {
  const { viewportGridService, cornerstoneViewportService } = servicesManager.services;

  isMirrorModeEnabled = !isMirrorModeEnabled;
  console.log('Mirror Mode toggled:', isMirrorModeEnabled);

  const { viewports } = viewportGridService.getState();

  viewports.forEach(vp => {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(vp.viewportId);
    if (!viewport) return;

    if (isMirrorModeEnabled) {
      // Apply chest wall anchoring
      const laterality = detectLaterality(vp);
      const displayArea = laterality === 'R' ? leftDisplayArea : rightDisplayArea;
      viewport.setDisplayArea(displayArea);
    } else {
      // Reset to center
      const centerDisplayArea = {
        imageArea: [1.0, 1.0],
        imageCanvasPoint: {
          imagePoint: [0.5, 0.5],
          canvasPoint: [0.5, 0.5],
        },
      };
      viewport.setDisplayArea(centerDisplayArea);
    }

    viewport.resetCamera();
    viewport.render();
  });

  refreshToolbarForViewport(viewportGridService.getState().activeViewportId);
}

isMirrorModeEnabled: () => {
  return isMirrorModeEnabled;
}
```

#### 3.3.2.2 Laterality 감지 (DICOM 태그만)

```typescript
// utils/mammographyMidline.ts
export function detectLaterality(viewportInfo) {
  const { displaySetInstanceUIDs } = viewportInfo;
  if (!displaySetInstanceUIDs || displaySetInstanceUIDs.length === 0) {
    return null;
  }

  const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUIDs[0]);
  if (!displaySet) return null;

  // 1순위: DICOM ImageLaterality (0020,0062)
  const laterality = displaySet.ImageLaterality || displaySet.instances?.[0]?.ImageLaterality;
  if (laterality === 'R' || laterality === 'RIGHT') return 'R';
  if (laterality === 'L' || laterality === 'LEFT') return 'L';

  // 2순위: ViewPosition (0018,5101)
  const viewPosition = displaySet.ViewPosition || displaySet.instances?.[0]?.ViewPosition;
  if (viewPosition) {
    if (viewPosition.includes('R')) return 'R';
    if (viewPosition.includes('L')) return 'L';
  }

  // 3순위: SeriesDescription
  const seriesDesc = displaySet.SeriesDescription || '';
  if (seriesDesc.includes('R CC') || seriesDesc.includes('R MLO')) return 'R';
  if (seriesDesc.includes('L CC') || seriesDesc.includes('L MLO')) return 'L';

  return null;
}
```

#### 3.3.2.3 Toolbar Button 정의

```typescript
// toolbarButtons.ts
{
  id: 'MirrorModeToggle',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'icon-tool-flip-horizontal',
    label: 'Mirror Mode',
    tooltip: 'Toggle chest wall alignment',
    commands: { commandName: 'toggleMirrorMode', context: 'MAMMOGRAPHY' },
    evaluate: 'evaluate.mammography.mirrorMode',
  },
}
```

#### 3.3.2.4 Evaluator 정의

```typescript
// evaluatorsModule.ts
{
  name: 'evaluate.mammography.mirrorMode',
  evaluate: () => {
    const isMirrorEnabled = commandsManager.runCommand('isMirrorModeEnabled', {}, 'MAMMOGRAPHY');
    return {
      disabled: false,
      className: isMirrorEnabled ? 'active' : '',
      isActive: isMirrorEnabled,
    };
  },
}
```

### 3.3.3 구현 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `modes/mammography/src/commandsModule.ts` | toggleMirrorMode, isMirrorModeEnabled 추가 |
| `modes/mammography/src/evaluatorsModule.ts` | evaluate.mammography.mirrorMode 추가 |
| `modes/mammography/src/toolbarButtons.ts` | MirrorModeToggle 버튼 추가 |
| `modes/mammography/src/index.tsx` | toolbarSections 업데이트 |
| `modes/mammography/src/utils/mammographyMidline.ts` | detectLaterality 함수 추가 |
| `modes/mammography-compare/` | 동일 구조로 추가 |

---

## 3.4. FR-3.3.9: Compare Sync Toggle

### 3.4.1 기능 설명

**목적**: Compare 모드에서 현재/이전 스터디 간 동기화를 on/off 제어

**동작**:
- **Sync ON** (기본값):
  - 한쪽 viewport 스크롤 → 다른쪽도 동일 스크롤
  - 한쪽 줌 → 다른쪽도 동일 비율 줌
  - 한쪽 팬 → 다른쪽도 동일 팬
  - 윈도우레벨 동기화

- **Sync OFF**:
  - 각 패널 독립적으로 조작 가능

### 3.4.2 UI 설계

**툴바 버튼**:
- **ID**: `CompareSyncToggle`
- **아이콘**: `icon-link` (체인 아이콘)
- **레이블**: "Sync"
- **툴팁**: "Synchronize current and prior study viewports"
- **위치**: Compare 모드 toolbar
- **상태 표시**: Active (ON) - 파란색

### 3.4.3 기술 사양

#### 3.4.3.1 Command 정의

```typescript
// modes/mammography-compare/src/commandsModule.ts
const COMPARE_VOI_SYNC_GROUP_ID = 'mammo-compare-voi-sync';
let isCompareSyncEnabled = true; // 기본값: ON
let compareSyncUnsubscribes = [];

toggleCompareSync: () => {
  const { viewportGridService, cornerstoneViewportService, syncGroupService } = servicesManager.services;

  isCompareSyncEnabled = !isCompareSyncEnabled;
  console.log('Compare Sync toggled:', isCompareSyncEnabled);

  const { viewports } = viewportGridService.getState();

  if (isCompareSyncEnabled) {
    // Enable sync between current and prior viewports
    const currentViewports = viewports.filter(vp =>
      vp.viewportId?.includes('current')
    );
    const priorViewports = viewports.filter(vp =>
      vp.viewportId?.includes('prior')
    );

    // Set up scroll/zoom/pan sync
    currentViewports.forEach((currentVp, index) => {
      const priorVp = priorViewports[index];
      if (!priorVp) return;

      const currentViewport = cornerstoneViewportService.getCornerstoneViewport(currentVp.viewportId);
      const priorViewport = cornerstoneViewportService.getCornerstoneViewport(priorVp.viewportId);

      if (!currentViewport || !priorViewport) return;

      // Camera sync
      const handleCameraModified = () => {
        const sourceCamera = currentViewport.getCamera();
        priorViewport.setCamera(sourceCamera);
        priorViewport.render();
      };

      currentViewport.element.addEventListener('CAMERA_MODIFIED', handleCameraModified);
      compareSyncUnsubscribes.push(() => {
        currentViewport.element.removeEventListener('CAMERA_MODIFIED', handleCameraModified);
      });

      // VOI sync
      const renderingEngineId = currentViewport.getRenderingEngine().id;
      [currentVp.viewportId, priorVp.viewportId].forEach(vpId => {
        syncGroupService.addViewportToSyncGroup(vpId, renderingEngineId, {
          type: 'voi',
          id: COMPARE_VOI_SYNC_GROUP_ID,
          source: true,
          target: true,
        });
      });
    });

    console.log('✅ Compare sync enabled');
  } else {
    // Disable sync
    compareSyncUnsubscribes.forEach(unsub => unsub());
    compareSyncUnsubscribes = [];

    viewports.forEach(vp => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(vp.viewportId);
      if (viewport) {
        const renderingEngineId = viewport.getRenderingEngine().id;
        syncGroupService.removeViewportFromSyncGroup(
          vp.viewportId,
          renderingEngineId,
          COMPARE_VOI_SYNC_GROUP_ID
        );
      }
    });

    console.log('✅ Compare sync disabled');
  }

  refreshToolbarForViewport(viewportGridService.getState().activeViewportId);
}

isCompareSyncEnabled: () => {
  return isCompareSyncEnabled;
}
```

#### 3.4.3.2 Toolbar Button & Evaluator

```typescript
// toolbarButtons.ts
{
  id: 'CompareSyncToggle',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'icon-link',
    label: 'Sync',
    tooltip: 'Synchronize current and prior study viewports',
    commands: { commandName: 'toggleCompareSync', context: 'MAMMOGRAPHY' },
    evaluate: 'evaluate.mammography.compareSync',
  },
}

// evaluatorsModule.ts
{
  name: 'evaluate.mammography.compareSync',
  evaluate: () => {
    const isSyncEnabled = commandsManager.runCommand('isCompareSyncEnabled', {}, 'MAMMOGRAPHY');
    return {
      disabled: false,
      className: isSyncEnabled ? 'active' : '',
      isActive: isSyncEnabled,
    };
  },
}
```

### 3.4.4 구현 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `modes/mammography-compare/src/commandsModule.ts` | toggleCompareSync, isCompareSyncEnabled 추가 |
| `modes/mammography-compare/src/evaluatorsModule.ts` | evaluate.mammography.compareSync 추가 |
| `modes/mammography-compare/src/toolbarButtons.ts` | CompareSyncToggle 버튼 추가 |
| `modes/mammography-compare/src/index.tsx` | toolbarSections 업데이트 |

---

## 3.5. FR-3.3.7: Study Visual Feedback

### 3.5.1 기능 설명

**목적**: Compare 모드에서 현재 스터디와 이전 스터디를 시각적으로 구분

**동작**:
- **현재 스터디**: 뷰포트 테두리 **파란색** (#00aaff)
- **이전 스터디**: 뷰포트 테두리 **주황색** (#ffa500)
- **활성 뷰포트**: 더 두껍고 밝은 테두리 (4px)

### 3.5.2 기술 사양

#### 3.5.2.1 CSS 스타일

```css
/* platform/app/src/routes/Mode/Mammography.css */
.mammography-compare-mode .viewport-element[data-viewport-type="current"] {
  border: 2px solid #00aaff;
}

.mammography-compare-mode .viewport-element[data-viewport-type="current"].active {
  border: 4px solid #00ccff;
  box-shadow: 0 0 10px rgba(0, 204, 255, 0.5);
}

.mammography-compare-mode .viewport-element[data-viewport-type="prior"] {
  border: 2px solid #ffa500;
}

.mammography-compare-mode .viewport-element[data-viewport-type="prior"].active {
  border: 4px solid #ffb520;
  box-shadow: 0 0 10px rgba(255, 181, 32, 0.5);
}
```

#### 3.5.2.2 Viewport ID 규칙

```typescript
// Current study viewports
'mammo-current-rcc'
'mammo-current-lcc'
'mammo-current-rmlo'
'mammo-current-lmlo'

// Prior study viewports
'mammo-prior-rcc'
'mammo-prior-lcc'
'mammo-prior-rmlo'
'mammo-prior-lmlo'
```

### 3.5.3 구현 파일 목록

| 파일 | 수정 내용 |
|------|----------|
| `platform/app/src/routes/Mode/Mammography.css` | 신규: CSS 스타일 정의 |
| `modes/mammography-compare/src/index.tsx` | viewport data attributes 추가 |
| `extensions/default/src/hangingprotocols/hpCompareMG.ts` | 신규: Compare HP (viewport ID 규칙 적용) |

---

## 4. 구현 계획

### 4.1 구현 순서

#### Phase 1: 필수 기능 (우선순위 높음)
```
1. FR-3.3.8: Prior Study Auto-Selection   ⭐⭐⭐ (최우선)
2. FR-3.3.2: Compare Exit Button           ⭐⭐
3. FR-2.5.5: Mirror Mode Toggle            ⭐⭐
4. FR-3.3.9: Compare Sync Toggle           ⭐⭐
```

#### Phase 2: 개선 기능
```
5. FR-3.3.7: Study Visual Feedback         ⭐
```

### 4.2 예상 소요 시간

| 기능 | 복잡도 | 예상 시간 |
|------|--------|----------|
| FR-3.3.8 | 중간 | 2-3시간 |
| FR-3.3.2 | 낮음 | 30분 |
| FR-2.5.5 | 낮음 | 1-2시간 |
| FR-3.3.9 | 낮음 | 1-2시간 |
| FR-3.3.7 | 중간 | 2-3시간 |
| **총계** | | **7-11시간** |

### 4.3 병렬 작업 전략

**ultrawork 모드 활용**:
- FR-3.3.8, FR-3.3.2, FR-2.5.5, FR-3.3.9를 동시 구현
- 각 기능별로 executor agent 활용
- 완료 후 통합 테스트

---

## 5. 테스트 계획

### 5.1 단위 테스트

```typescript
// __tests__/commandsModule.test.ts
describe('FR-3.3.8: Prior Study Auto-Selection', () => {
  it('should find most recent prior study', () => { ... });
  it('should handle no prior study gracefully', () => { ... });
});

describe('FR-3.3.2: Compare Exit Button', () => {
  it('should navigate to mammography mode with current study', () => { ... });
});

describe('FR-2.5.5: Mirror Mode Toggle', () => {
  it('should toggle mirror mode state', () => { ... });
  it('should apply displayArea when enabled', () => { ... });
});

describe('FR-3.3.9: Compare Sync Toggle', () => {
  it('should synchronize viewport cameras', () => { ... });
});
```

### 5.2 E2E 테스트 (Playwright)

```typescript
test('Prior study auto-selection', async ({ page }) => {
  await page.goto('/mammography?StudyInstanceUIDs=...');
  await page.click('[data-button-id="MammoCompare"]');
  await page.waitForURL(/mammography-compare.*StudyInstanceUIDs=.*,.*/);//expect(await page.url()).toContain(','); // 2개 UID
});

test('Exit Compare button', async ({ page }) => {
  await page.goto('/mammography-compare?StudyInstanceUIDs=uid1,uid2');
  await page.click('[data-button-id="ExitCompare"]');
  await page.waitForURL(/\/mammography\?StudyInstanceUIDs=[^,]+$/);
});

test('Mirror Mode Toggle', async ({ page }) => {
  await page.goto('/mammography?StudyInstanceUIDs=...');
  const viewport = await page.locator('[data-viewport-id="mammo-rcc"]');

  await page.click('[data-button-id="MirrorModeToggle"]');
  // Check position changed
});

test('Compare Sync Toggle', async ({ page }) => {
  await page.goto('/mammography-compare?StudyInstanceUIDs=uid1,uid2');

  // Sync ON: scroll one viewport
  await page.mouse.wheel(0, 100);
  // Verify both viewports scrolled

  // Sync OFF
  await page.click('[data-button-id="CompareSyncToggle"]');
  await page.mouse.wheel(0, 100);
  // Verify only one viewport scrolled
});
```

### 5.3 수동 테스트 체크리스트

#### FR-3.3.8: Prior Study Auto-Selection
- [ ] Compare 버튼 클릭 시 prior study 자동 로딩
- [ ] Prior study 없을 경우 fallback 동작 확인
- [ ] URL에 2개 StudyInstanceUID 포함 확인

#### FR-3.3.2: Compare Exit Button
- [ ] Exit 버튼 클릭 시 단일 스터디 모드로 복귀
- [ ] Current study 유지 확인
- [ ] Prior study 언로드 확인

#### FR-2.5.5: Mirror Mode Toggle
- [ ] 초기 로딩 시 Mirror Mode ON 확인
- [ ] 버튼 클릭 시 on/off 토글 확인
- [ ] 이미지 위치 변경 확인 (chest wall ↔ center)

#### FR-3.3.9: Compare Sync Toggle
- [ ] Sync ON: 스크롤/줌/팬 동기화 확인
- [ ] Sync OFF: 독립 조작 확인
- [ ] 윈도우레벨 동기화 확인

#### FR-3.3.7: Study Visual Feedback
- [ ] Current study 파란색 테두리 확인
- [ ] Prior study 주황색 테두리 확인
- [ ] 활성 viewport 강조 확인

---

**문서 버전**: 2.0
**최종 업데이트**: 2026-02-11
**변경 이력**:
- v1.0 (2026-02-11): 초안 작성 (3개 기능)
- v2.0 (2026-02-11): 5개 기능으로 업데이트, Mirror Mode 자동 감지 제거
