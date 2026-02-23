# Jump-to-Measurement 및 확대 문제 해결

## 문서 개요

이 문서는 jump-to-measurement 기능 관련 구현 시도, 성공 및 실패 사례를 추적합니다. 특히 MPR 모드 → Stack viewport → MPR 모드로 전환한 후 jump-to-measurement가 작동하지 않는 문제에 초점을 맞춥니다.

**상태**: ⚠️ **부분적으로 해결됨** - 일부 개선이 이루어졌으나 핵심 문제는 남아있음

**최종 업데이트**: 2026-02-08

---

## 문제 설명

### 주요 이슈

viewport 레이아웃 전환(MPR → Stack → MPR) 후, 패널에서 측정값을 클릭하면 MPR viewport가 제대로 중앙 정렬 및 확대되지 않습니다.

**재현 단계**:
1. MPR 모드에서 스터디 로드 (4V+1S 레이아웃)
2. 오른쪽 패널에서 측정값 클릭 → ✅ 정상 작동 (중앙 정렬 + 확대)
3. stack viewport로 전환 (one-up 버튼 토글)
4. stack에서 측정값 클릭 → ✅ 정상 작동
5. MPR 모드로 다시 전환 (one-up 다시 토글)
6. 오른쪽 패널에서 측정값 클릭 → ❌ **실패** - 중앙 정렬 없이 전체 이미지 표시

**예상 동작**:
- MPR viewport가 측정값 중심으로 정렬되어야 함
- MPR viewport가 4배 확대(기본값) 적용되어야 함
- 3D crosshair와 slice plane이 업데이트되어야 함
- 주석이 표시되어야 함

**실제 동작**:
- MPR viewport가 전체 이미지 표시 (중앙 정렬 안됨)
- 줌이 리셋되거나 적용되지 않음
- Crosshair가 업데이트될 수도 있고 안될 수도 있음
- 주석이 가끔 표시되지 않음

---

## 근본 원인 분석

### 확인된 Race Condition

**문제**: 레이아웃 변경 후 viewport가 준비되기 전에 SlicePlaneSync 초기화가 발생합니다.

**타임라인**:
```
T+0ms:     레이아웃 변경 핸들러 트리거
T+0ms:     SlicePlaneSync.initialize() 호출 (너무 빠름!)
T+0ms:     subscribeToViewportElements()가 viewport element 가져오려고 시도
           → getCornerstoneViewport()가 null 반환 (viewport 준비 안됨)
           → 이벤트 구독 실패 (조용히 실패)
T+200ms:   viewport.jumpToWorld() 완료 (viewport 안정화)
T+???:     사용자가 측정값 클릭
           → Viewport는 존재하지만 이벤트 리스너가 연결되지 않음
           → 점프 시도하지만 viewport 참조가 오래된 것일 수 있음
           → 중앙 정렬/줌 실패
```

### 기여 요인

1. **이벤트 억제 타이밍**: 중앙 정렬/줌 중 Crosshairs 도구가 카메라 업데이트를 방해함
2. **Viewport 참조 낡음**: 레이아웃 변경 후 getCornerstoneViewport()가 낡은 참조를 반환할 수 있음
3. **카메라 상태 리셋**: 레이아웃 전환 중 viewport 카메라가 리셋됨
4. **이벤트 리스너 누락**: viewport가 준비되지 않았을 때 SlicePlaneSync 이벤트 구독이 실패함

---

## 적용된 변경사항 (성공적으로 구현됨)

### 1. ✅ SlicePlaneSync 재시도 로직

**파일**: `modes/usmpr/src/utils/SlicePlaneSync.ts` (lines 86-141)

**변경사항**: viewport element 구독을 위한 지수 백오프 재시도 추가

```typescript
private subscribeToViewportElementWithRetry(viewportInfo: ViewportInfo, attemptNum: number) {
  const maxAttempts = 5;
  const retryDelay = 100 * Math.pow(2, attemptNum); // 100ms, 200ms, 400ms, 800ms, 1600ms

  const viewport = this.cornerstoneViewportService.getCornerstoneViewport(viewportInfo.viewportId);

  if (!viewport || !viewport.element) {
    if (attemptNum < maxAttempts) {
      console.warn(`⚠️ [SlicePlaneSync] Viewport ${viewportInfo.viewportId} not ready, retrying in ${retryDelay}ms (attempt ${attemptNum + 1}/${maxAttempts})`);
      setTimeout(() => {
        this.subscribeToViewportElementWithRetry(viewportInfo, attemptNum + 1);
      }, retryDelay);
      return;
    }
    // ... handle max attempts
  }
  // ... subscribe to events
}
```

**결과**: SlicePlaneSync가 viewport 초기화가 느릴 때도 이벤트 리스너를 성공적으로 연결합니다.

---

### 2. ✅ SlicePlaneSync 지연 초기화

**파일**: `modes/usmpr/src/index.tsx` (lines 1245-1255)

**변경사항**: 레이아웃 변경 후 SlicePlaneSync 재초기화를 200ms 지연

```typescript
setTimeout(() => {
  slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
  slicePlaneSync.initialize(viewportInfos, coreEventTarget);
  slicePlaneSync.setEnabled(true);
  (window as any).usmprSlicePlaneSync = slicePlaneSync;
  console.log('✅ [SLICE PLANES] SlicePlaneSync re-initialized and ready for jump to measurement');
}, 200);  // Wait for jumpToWorld (200ms) to complete
```

**결과**: SlicePlaneSync가 viewport 안정화 후 초기화되어 신뢰성이 향상됩니다.

---

### 3. ✅ 중앙 정렬 및 줌 전체에 걸친 이벤트 억제

**파일**: `extensions/cornerstone/src/commandsModule.ts` (lines 295-333)

**변경사항**: 중앙 정렬과 줌 작업 모두 동안 이벤트 억제 유지

**이전** (문제 있음):
```typescript
// Center viewports
centerMPRViewportOnPosition(mprViewport, centerWorld);

// ❌ 여기서 이벤트 재활성화 - Crosshairs가 카메라를 리셋함!
viewport._suppressCameraModifiedEvents = false;

// Apply zoom (but camera already reset by Crosshairs!)
syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);
```

**이후** (수정됨):
```typescript
// Step 1: Suppress events on ALL viewports FIRST
for (const vpId of mprViewportIds) {
  mprViewport._suppressCameraModifiedEvents = true;
}

// Step 2: Center all viewports (with events suppressed)
for (const { viewport: mprViewport } of viewportsToCenter) {
  centerMPRViewportOnPosition(mprViewport, centerWorld);
}

// Step 3: Apply zoom (STILL with events suppressed)
syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);

// Step 4: Re-enable events ONLY AFTER zoom completes
// (Done inside syncMPRViewportZoom at the end)
```

**결과**: jump-to-measurement 중 Crosshairs 도구가 카메라 위치를 리셋하는 것을 방지합니다.

---

### 4. ✅ Stack Viewport가 MPR과 동일한 동작

**파일**: `extensions/cornerstone/src/commandsModule.ts` (lines 449-472)

**변경사항**: Stack viewport가 이제 항상 중앙 정렬하고 4배 줌 적용 (MPR과 동일)

```typescript
// Reset zoom to 1.0x base to prevent accumulation
currentViewport.setZoom(1.0);
currentViewport.render();

// Always apply 4x magnification (same as MPR default)
const zoomMultiplier = 4.0;
currentViewport.setZoom(zoomMultiplier);
currentViewport.render();

// Always center the annotation in stack viewport (same as MPR)
if (centerWorld) {
  actions.centerStackViewportOnAnnotation(currentViewport, centerWorld);
}
```

**결과**: viewport 타입 간 일관된 동작. 사용자 확인: "ok stack view is ok"

---

### 5. ✅ 3D Crosshair 동기화 재활성화

**파일**: `extensions/cornerstone/src/commandsModule.ts` (lines 376-377)

**변경사항**: jump-to-measurement 중 crosshair/slice plane 업데이트 재활성화

```typescript
// Trigger crosshair and 3D slice plane updates
triggerCrosshairUpdate(cornerstoneViewportService, centerWorld);
```

**결과**: 측정값 클릭 시 3D crosshair 그리드와 slice plane이 업데이트됩니다.

---

### 6. ✅ 차단 재시도 지연 제거

**파일**: `extensions/cornerstone/src/commandsModule.ts` (lines 233-236, 250-257)

**변경사항**: 점프 실행을 차단하던 재시도 지연 제거

**이전** (차단됨):
```typescript
if (!viewport) {
  console.warn(`⚠️ [jumpToMeasurement] Viewport not ready, retrying in 300ms...`);
  setTimeout(() => {
    actions.jumpToMeasurementViewport({ annotationUID, measurement });
  }, 300);
  return;
}
```

**이후** (빠른 실패):
```typescript
if (!viewport) {
  console.error(`❌ [jumpToMeasurement] Viewport ${targetViewportId} is null - cannot jump`);
  return;
}
```

**결과**: 사용자 상호작용을 차단하는 대기 지연이 더 이상 없습니다.

---

## 실패한 시도 (되돌림 또는 중단됨)

### ❌ 시도 1: SlicePlaneSync 지연을 500ms로 증가

**파일**: `modes/usmpr/src/index.tsx`

**시도한 것**: setTimeout 지연을 200ms에서 500ms로 증가

```typescript
setTimeout(() => {
  slicePlaneSync = new SlicePlaneSync(slicePlaneManager, cornerstoneViewportService);
  // ...
}, 500);  // ❌ Too long!
```

**실패한 이유**: 사용자 피드백: "stack needed wait but MPR don't need wait. so if you changed code revert"

**결과**: 200ms 지연으로 되돌림

---

### ❌ 시도 2: 점프 함수에서 재시도와 함께 Viewport 준비 확인

**파일**: `extensions/cornerstone/src/commandsModule.ts`

**시도한 것**: 300ms 후 자동 재시도와 함께 null 체크 추가

```typescript
if (!viewport) {
  console.warn(`⚠️ [jumpToMeasurement] Viewport not ready yet, retrying in 300ms...`);
  setTimeout(() => {
    console.log('🔄 [jumpToMeasurement] Retrying jump to measurement...');
    actions.jumpToMeasurementViewport({ annotationUID, measurement });
  }, 300);
  return;
}
```

**실패한 이유**:
- MPR 모드에서 불필요한 지연 발생 (재시도가 필요 없음)
- 사용자 보고: "still back from stack jumptomeasure became impossible"
- 자동 재시도로 사용자 상호작용 차단

**결과**: 재시도 로직 제거, 이제 오류 메시지와 함께 빠르게 실패

---

### ❌ 시도 3: 레이아웃 변경 후 SR DisplaySets 재로드

**파일**: `modes/usmpr/src/index.tsx`

**시도한 것**: MPR 모드로 돌아온 후 모든 SR displaySet을 재로드하여 주석 복원

```typescript
// Reload SR displaySets to restore annotations
const srDisplaySets = displaySetService
  .getActiveDisplaySets()
  .filter(ds => ds.Modality === 'SR');

for (const displaySet of srDisplaySets) {
  await loadSRDisplaySet(displaySet);
}

// Force render to show annotations
cornerstoneViewportService.getRenderingEngine().render();
```

**실패한 이유**: 사용자 피드백: "not timing is not the issue and SR rehydration will not be the cause. revert all about SR reloading"

**결과**: SR 재로드 코드 완전히 되돌림

---

### ❌ 시도 4: 중앙 정렬과 줌 사이에 이벤트 재활성화

**파일**: `extensions/cornerstone/src/commandsModule.ts`

**시도한 것**: 중앙 정렬 후 줌 전에 카메라 이벤트 재활성화

```typescript
// Center viewports
for (const { viewport } of viewportsToCenter) {
  centerMPRViewportOnPosition(viewport, centerWorld);
}

// ❌ Re-enable events here
for (const { viewport } of viewportsToCenter) {
  viewport._suppressCameraModifiedEvents = false;
  viewport.render();
}

// Apply zoom (but Crosshairs already interfered!)
syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);
```

**실패한 이유**:
- Crosshairs 도구가 즉시 viewport를 기본 위치로 동기화함
- 사용자 보고: "just whole image without center"
- 잘못된 카메라 위치에 줌 적용됨

**결과**: 이벤트가 이제 중앙 정렬과 줌 모두를 통해 억제된 상태로 유지됨

---

### ❌ 시도 5: 3D Crosshair 동기화 완전히 비활성화

**파일**: `extensions/cornerstone/src/commandsModule.ts`

**시도한 것**: 점프 중 3D crosshair/slice plane 업데이트를 완전히 비활성화

```typescript
// DISABLED: User request - remove 3D crosshair sync during jump-to-measurement
console.log('🎯 [jumpToMeasurement] Skipping crosshair update (disabled per user request)');
// triggerCrosshairUpdate(cornerstoneViewportService, centerWorld);
```

**임시였던 이유**: 사용자가 crosshair 동기화 문제로부터 중앙 정렬 문제를 분리하기 원함

**결과**: 나중에 사용자 요청으로 재활성화: "can you reapply cross hair synch method again"

---

## 현재 상태 요약

### ✅ 작동하는 것

1. **Stack viewport jump-to-measurement**: 중앙 정렬 + 4배 줌이 올바르게 작동
2. **SlicePlaneSync 재시도 로직**: 느린 viewport 초기화를 우아하게 처리
3. **이벤트 억제**: 중앙 정렬/줌 중 Crosshairs 간섭 방지
4. **3D crosshair 동기화**: 재활성화되어 작동 중
5. **SlicePlaneSync 지연 초기화**: 레이아웃 변경 후 200ms 지연

### ❌ 여전히 작동하지 않는 것

1. **MPR 복원 후 jump-to-measurement**: 핵심 문제 남아있음 - stack에서 MPR로 전환한 후 MPR viewport가 중앙 정렬 없이 전체 이미지 표시
2. **레이아웃 변경 후 viewport 카메라 상태**: 카메라가 잘못된 상태일 수 있음
3. **주석 가시성**: 레이아웃 전환 후 주석이 가끔 표시되지 않음

### ⏸️ 연기된 이슈

사용자에 따르면: "jumptomeasure problem i will fix later"

---

## 기술적 세부사항

### 이벤트 억제 구현

**속성**: `viewport._suppressCameraModifiedEvents`

**목적**: 수동 업데이트 중 Crosshairs 도구가 카메라를 동기화하는 것을 방지

**중요한 타이밍**:
```typescript
// CORRECT: Suppress → Center → Zoom → Re-enable
viewport._suppressCameraModifiedEvents = true;
centerMPRViewportOnPosition(viewport, centerWorld);
syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);
viewport._suppressCameraModifiedEvents = false; // Only after BOTH operations
viewport.render();
```

---

### SlicePlaneSync 초기화 타이밍

**Race condition 타임라인**:
- T+0ms: 레이아웃 변경
- T+0ms: SlicePlaneSync.initialize() (즉시)
- T+200ms: viewport.jumpToWorld() 완료
- **해결책**: SlicePlaneSync.initialize()를 T+200ms로 지연

**왜 구체적으로 200ms인가**:
- 레이아웃 핸들러의 기존 `viewport.jumpToWorld()` 지연과 일치 (index.tsx의 1025줄)
- 사용자가 MPR 모드에 적절하다고 테스트하고 확인함
- 500ms는 너무 길었음 (사용자가 되돌림 요청)

---

### Viewport Null 참조 처리

**이전 접근법 (실패)**:
- viewport가 null이면 자동 재시도
- 300ms 대기 후 다시 시도
- 문제: 불필요하게 MPR 모드를 차단함

**현재 접근법 (작동함)**:
- 명확한 오류 메시지와 함께 빠르게 실패
- 자동 재시도 없음
- SlicePlaneSync 재시도 로직이 viewport 준비 상태를 처리하도록 함
- 사용자가 측정값을 다시 클릭하여 수동으로 재시도할 수 있음

---

## 남아있는 가설 (검증되지 않음)

### 가설 1: Viewport 카메라 상태가 보존되지 않음

**이론**: 레이아웃 전환 시 viewport 카메라 상태(focalPoint, position, parallelScale)가 제대로 보존되거나 복원되지 않습니다.

**증거**:
- 콘솔 로그가 레이아웃 전환 중 focalPoint 변경을 보여줌
- 사용자가 "whole image" 보고 (카메라가 fit으로 리셋되었음을 시사)

**테스트되지 않은 해결책**: 레이아웃 변경 전 카메라 상태 저장, 이후 복원

---

### 가설 2: Cornerstone RenderingEngine 상태 이슈

**이론**: 레이아웃 변경 후 RenderingEngine이 전환 상태에 있어 viewport 참조가 오래된 것일 수 있습니다.

**증거**:
- getCornerstoneViewport()가 null 또는 오래된 참조를 반환
- SlicePlaneSync 이벤트 구독이 초기에 실패

**테스트되지 않은 해결책**: renderingEngine.render() 추가 + RENDERING_ENGINE_RENDERED 이벤트 대기

---

### 가설 3: Crosshairs 도구 상태 손상

**이론**: 레이아웃 전환 중 Crosshairs 도구 상태가 손상됩니다.

**증거**:
- 초기 MPR 모드에서 Crosshairs 동기화가 잘 작동함
- stack → MPR 전환 후 깨짐

**테스트되지 않은 해결책**:
- 레이아웃 변경 후 Crosshairs 도구를 파괴하고 재생성
- 또는: Crosshairs 도구 상태를 수동으로 리셋

---

## 콘솔 로그 시그니처

### 성공한 점프 (초기 MPR 모드)

```
🔍 [jumpToMeasurement] viewportId: mpr-0
[DEBUG isMPRViewport] viewport type: orthographic
[MPR Sync] Current focalPoint: [x, y, z]
[MPR Sync] Target worldPosition: [x, y, z]
[MPR Sync] Setting new focalPoint: [x, y, z]
[MPR Sync] ✅ Centered axial viewport on measurement
[MPR Zoom mpr-0] BEFORE resetCamera - focalPoint: [x, y, z]
[MPR Zoom mpr-0] AFTER resetCamera - focalPoint: [x', y', z']
[MPR Zoom mpr-0] Final focalPoint: [x, y, z] (preserved!)
[MPR Sync] ✅ Zoom complete - all viewports synchronized
[MPR Sync] Triggering crosshair and slice plane updates
[MPR Sync] ✅ 3D slice planes updated
```

### 실패한 점프 (Stack → MPR 후)

```
🔍 [jumpToMeasurement] viewportId: mpr-0
[DEBUG isMPRViewport] viewport type: orthographic
[MPR Sync] Current focalPoint: [x, y, z]
[MPR Sync] Target worldPosition: [x, y, z]
[MPR Sync] Setting new focalPoint: [x, y, z]
[MPR Sync] ✅ Centered axial viewport on measurement
[MPR Zoom mpr-0] BEFORE resetCamera - focalPoint: [x, y, z]
[MPR Zoom mpr-0] AFTER resetCamera - focalPoint: [x', y', z'] (DIFFERENT!)
[MPR Zoom mpr-0] Final focalPoint: [x', y', z'] (NOT PRESERVED!)
[MPR Sync] ✅ Zoom complete - all viewports synchronized (but wrong position!)
```

**주요 차이점**: 줌 후 최종 focalPoint가 저장된 focalPoint와 일치하지 않음

---

## 디버깅 체크리스트

이 이슈를 추가로 조사할 때 확인할 사항:

- [ ] 레이아웃 변경 전/후 viewport 카메라 상태
- [ ] 전환 중 RenderingEngine 상태
- [ ] Crosshairs 도구 구성 및 상태
- [ ] viewport element에 대한 이벤트 리스너 연결
- [ ] DisplaySet 서비스 상태 (displaySet이 보존되는가?)
- [ ] 레이아웃 변경에 걸친 ToolState 지속성
- [ ] Volume loader 상태 (volume이 여전히 로드되어 있는가?)
- [ ] 전환 중 카메라 수정 이벤트 발생
- [ ] SlicePlaneSync 초기화 완료 타이밍

---

## 관련 파일

### 핵심 구현 파일
- `extensions/cornerstone/src/commandsModule.ts` - Jump-to-measurement 로직
- `extensions/cornerstone/src/utils/mprViewportSync.ts` - MPR viewport 유틸리티
- `modes/usmpr/src/index.tsx` - USMPR 모드 레이아웃 변경 핸들러
- `modes/usmpr/src/utils/SlicePlaneSync.ts` - 3D slice plane 동기화

### 설정 파일
- `extensions/cornerstone/src/utils/measurementJumpPreferences.ts` - 사용자 환경설정
- `extensions/default/src/customizations/userPreferencesCustomization.tsx` - 설정 UI

### 문서
- `docs/measurement-jump-features.md` - 기능 문서
- `C:\Users\user\.claude\plans\crystalline-floating-ember.md` - 조사 계획

---

## 다음 단계 (연기됨)

사용자 요청에 따라 다음 조사가 연기되었습니다:

1. **카메라 상태 보존**: 레이아웃 복원 후 줌 중 카메라 focalPoint가 변경되는 이유 조사
2. **Viewport 참조 낡음**: viewport 준비 상태 검증 추가
3. **Crosshairs 도구 리셋**: 레이아웃 변경 후 Crosshairs 도구가 재초기화가 필요한지 확인
4. **RenderingEngine 이벤트**: RENDERING_ENGINE_RENDERED 또는 유사한 이벤트 수신
5. **Volume Loader 상태**: 레이아웃 전환 후 volume이 여전히 로드되어 있는지 확인

---

## Git 히스토리 참조

**브랜치**: `feature/heeboong` (또는 현재 작업 브랜치)

**관련 커밋**:
- SlicePlaneSync 재시도 로직 구현
- 중앙 정렬/줌을 위한 이벤트 억제 수정
- MPR과 일치하는 Stack viewport 동작
- 3D crosshair 동기화 재활성화
- (참고: 정확한 커밋 해시는 git log 확인)

**되돌린 변경사항**:
- SR displaySets 재로드 시도
- 500ms SlicePlaneSync 지연
- jumpToMeasurementViewport의 자동 재시도 로직

---

## 사용자 피드백 요약

문제 해결 중 사용자의 주요 인용:

1. "changing viewport to stack viewport is OK. but when back to MPR viewport jumptomeasurement not works."
2. "still MPR show whole image with measurement selected"
3. "stack needed wait but MPR don't need wait. so if you changed code revert"
4. "try make stack jumptomeasure in same way just same in MPR viewport with same centered and magnified x4"
5. "ok stack view is ok"
6. "not timing is not the issue and SR rehydration will not be the cause. revert all about SR reloading"
7. "but back from stack jumptomeasure not working"
8. "can you reapply cross hair synch method again. jumptomeasure problem i will fix later."

---

**문서 상태**: 살아있는 문서 - 조사가 계속됨에 따라 업데이트

**소유자**: 개발 팀
**최종 수정**: 2026-02-08
