# Measurement Jump Features - 구현 요약

## 개요

이 문서는 OHIF USMPR 모드에서 새로 구현된 측정값 네비게이션 및 viewport 동기화 기능을 설명합니다.

## 구현된 기능

### 1. MPR Viewport를 위한 점프-투-측정 기능과 센터링 ✅

**동작 방식**: 오른쪽 패널의 측정값을 클릭하면 MPR viewport (축축, 시상, 관상)는 다음과 같이 동작합니다:
- 측정값이 포함된 슬라이스로 이동
- **viewport를 측정값에 중앙 정렬** (사용자 설정에서 활성화된 경우)
- 3D viewport는 **이 동작에서 제외됨**

**수정된 파일**:
- `extensions/cornerstone/src/commandsModule.ts` - Enhanced `jumpToMeasurementViewport` 함수
- `extensions/cornerstone/src/utils/mprViewportSync.ts` - MPR viewport 작업을 위한 새로운 유틸리티

**동작 원리**:
```typescript
// annotation 중심 계산
const centerWorld = getAnnotationCenter(annotation);

// 모든 3개의 MPR viewport를 측정값 위치에 중앙 정렬
if (preferences.mprCenteringEnabled) {
  const mprViewportIds = ['mpr-0', 'mpr-1', 'mpr-2'];
  for (const vpId of mprViewportIds) {
    const mprViewport = cornerstoneViewportService.getCornerstoneViewport(vpId);
    if (mprViewport && isMPRViewport(mprViewport)) {
      // focal point를 annotation 위치로 이동
      // camera 위치는 같은 offset으로 업데이트되어 뷰 방향 유지
      centerMPRViewportOnPosition(mprViewport, centerWorld);
    }
  }
}
```

---

### 2. MPR Viewport를 위한 동기화된 확대/축소 ✅

**동작 방식**: 측정값을 클릭하면 3개의 MPR viewport (축축, 시상, 관상)는 모두 다음과 같이 동작합니다:
- 동일한 zoom 수준을 동시에 적용
- Zoom 배수는 설정 가능 (0-9 범위, 1x - 5.5x zoom으로 변환)
- 3D viewport는 **동기화에서 제외됨**

**확대/축소 모드**:
- **없음**: 확대/축소 미적용
- **측정값 클릭 시에만**: 패널에서 측정값을 클릭할 때만 zoom 적용
- **항상**: 모든 MPR viewport에서 연속적으로 zoom 동기화

**수정된 파일**:
- `extensions/cornerstone/src/commandsModule.ts`
- `extensions/cornerstone/src/utils/mprViewportSync.ts` - `syncMPRViewportZoom()` 함수

**동작 원리**:
```typescript
// 모든 MPR viewport에 동기화된 zoom 적용
if (preferences.magnificationSyncMode === 'onMeasurementClick') {
  const zoomMultiplier = getZoomMultiplier(preferences.magnificationRatio);
  syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);
}
```

**Zoom 배수 계산**:
- 비율 0 → 1.0x (zoom 없음)
- 비율 1 → 1.5x zoom
- 비율 2 → 2.0x zoom
- 비율 3 → 2.5x zoom
- ...
- 비율 9 → 5.5x zoom

---

### 3. Stack Viewport 점프-투-측정 기능 (센터링 없음) ✅

**동작 방식**: 오른쪽 패널의 측정값을 클릭하면 stack viewport는 다음과 같이 동작합니다:
- **측정값이 포함된 프레임으로 이동**
- **센터링 미적용**
- **확대/축소 미적용**
- 이는 stack viewport의 원래 동작을 유지합니다

**수정된 파일**:
- `extensions/cornerstone/src/commandsModule.ts` (기존 stack viewport 로직 유지)

---

### 4. 사용자 설정 UI ✅

**위치**: 설정 → 사용자 설정 → 측정값 네비게이션 섹션

**사용 가능한 옵션**:

1. **측정값에 MPR viewport 중앙 정렬** (토글)
   - 중앙 정렬 동작 활성화/비활성화
   - 기본값: ON

2. **확대/축소 동기화 모드** (드롭다운)
   - 없음
   - 측정값 클릭 시에만 (기본값)
   - 항상 동기화됨

3. **확대/축소 비율** (0-9 숫자 입력)
   - 실시간 zoom 배수 표시 (예: "2.0x zoom")
   - 기본값: 2 (2.0x zoom)

**수정된 파일**:
- `extensions/default/src/customizations/userPreferencesCustomization.tsx`

**동작 원리**:
```typescript
// 설정은 localStorage에 저장됨
saveMeasurementJumpPreferences({
  mprCenteringEnabled: true,
  magnificationSyncMode: 'onMeasurementClick',
  magnificationRatio: 2,
});

// 측정값으로 점프할 때 로드됨
const preferences = getMeasurementJumpPreferences();
```

---

## 파일 구조

### 새로 생성된 파일

1. **`extensions/cornerstone/src/utils/measurementJumpPreferences.ts`**
   - 설정에 대한 타입 정의
   - localStorage 로드/저장 함수
   - Zoom 배수 계산

2. **`extensions/cornerstone/src/utils/mprViewportSync.ts`**
   - MPR viewport 감지 유틸리티
   - 중앙 정렬 함수
   - 동기화된 zoom 함수

### 수정된 파일

1. **`extensions/cornerstone/src/commandsModule.ts`**
   - Enhanced `jumpToMeasurementViewport` 함수
   - 설정 로딩 추가
   - MPR 중앙 정렬 로직 추가
   - 동기화된 확대/축소 추가

2. **`extensions/default/src/customizations/userPreferencesCustomization.tsx`**
   - 측정값 네비게이션 섹션 추가
   - 설정용 UI 컨트롤 추가
   - 저장/로드 기능 통합

---

## 사용 지침

### 사용자를 위한 지침

1. **설정 액세스**:
   - 툴바의 설정 아이콘 (기어 모양) 클릭
   - "사용자 설정" 선택

2. **측정값 네비게이션 구성**:
   - "측정값 네비게이션" 섹션까지 스크롤
   - "측정값에 MPR viewport 중앙 정렬" 토글 (권장: ON)
   - 확대/축소 동기화 모드 선택 (권장: "측정값 클릭 시에만")
   - 확대/축소 비율 설정 (권장: 2 for 2.0x zoom)

3. **패널에서 측정값 클릭**:
   - 오른쪽 패널은 측정값 목록을 표시합니다
   - 임의의 측정값을 클릭합니다
   - **MPR viewport**: 슬라이스로 이동 + 중앙 정렬 + zoom 적용
   - **Stack viewport**: 프레임으로 이동만 (센터링/zoom 없음)

### 개발자를 위한 지침

**viewport가 MPR인지 확인**:
```typescript
import { isMPRViewport } from './utils/mprViewportSync';

if (isMPRViewport(viewport)) {
  // 이것은 축축, 시상, 또는 관상입니다
}
```

**viewport를 위치에 중앙 정렬**:
```typescript
import { centerMPRViewportOnPosition } from './utils/mprViewportSync';

const worldPosition: [number, number, number] = [x, y, z];
centerMPRViewportOnPosition(viewport, worldPosition);
```

**MPR viewport 간 zoom 동기화**:
```typescript
import { syncMPRViewportZoom } from './utils/mprViewportSync';

const zoomMultiplier = 2.0; // 2x zoom
syncMPRViewportZoom(cornerstoneViewportService, zoomMultiplier);
```

**사용자 설정 가져오기**:
```typescript
import { getMeasurementJumpPreferences } from './utils/measurementJumpPreferences';

const prefs = getMeasurementJumpPreferences();
console.log(prefs.mprCenteringEnabled); // true/false
console.log(prefs.magnificationSyncMode); // 'none' | 'onMeasurementClick' | 'always'
console.log(prefs.magnificationRatio); // 0-9
```

---

## 테스트 체크리스트

- [ ] 측정값이 있는 스터디 로드 (SR DICOM 또는 새 측정값 생성)
- [ ] 오른쪽 패널의 측정값 클릭
- [ ] MPR viewport (축축, 시상, 관상)가 올바른 슬라이스로 이동하는지 확인
- [ ] MPR viewport가 측정값에 중앙 정렬되는지 확인 (활성화된 경우)
- [ ] MPR viewport가 동기화된 zoom을 적용하는지 확인 (활성화된 경우)
- [ ] 3D viewport가 영향을 받지 않는지 확인
- [ ] Stack viewport가 프레임으로만 이동하는지 확인 (센터링/zoom 없음)
- [ ] 사용자 설정을 열고 설정 변경
- [ ] 페이지 새로고침 후 설정이 유지되는지 확인
- [ ] "기본값으로 재설정" 버튼이 작동하는지 확인

---

## 향후 개선 사항 (대기 중)

### 5. Viewport 전환 시 확대/축소/중앙 정렬 유지

**요구사항**: 축축 MPR과 stack viewport 간 전환 시:
- 확대/축소 비율 유지
- 동일한 중앙 지점 유지 (crosshair 위치)
- Stack viewport에서 더 넓은 뷰 표시

**상태**: 구현 대기 중
**예상 복잡도**: 중간
**영향받는 파일**:
- TBD

---

## 문제 해결

### 문제: 중앙 정렬이 작동하지 않음
- 사용자 설정 → "측정값에 MPR viewport 중앙 정렬"이 ON인지 확인
- 측정값이 유효한 world 좌표를 가지고 있는지 확인
- 브라우저 콘솔에서 오류를 확인

### 문제: Zoom이 동기화되지 않음
- 확대/축소 동기화 모드가 "없음"이 아닌지 확인
- 확대/축소 비율이 > 0인지 확인
- 패널의 측정값을 클릭하고 있는지 확인 (새 annotation 생성 아님)

### 문제: Stack viewport 중앙 정렬/확대/축소
- **이것은 예상된 동작입니다!** Stack viewport는 중앙 정렬이나 zoom을 해서는 안 됩니다
- 오직 MPR viewport (축축, 시상, 관상)만 영향을 받습니다

### 문제: 설정이 저장되지 않음
- 브라우저 localStorage가 활성화되어 있는지 확인
- 콘솔에서 오류를 확인
- "기본값으로 재설정"을 시도한 후 다시 구성

---

## 기술 정보

### 3D viewport를 제외하는 이유는?

3D 볼륨 렌더링 viewport는 완전히 다른 camera 모델과 zoom 동작을 가지고 있습니다. 2D MPR viewport와 동기화하면 혼란스러운 동작과 잠재적 충돌을 야기할 수 있습니다.

### Stack viewport를 중앙 정렬에서 제외하는 이유는?

Stack viewport는 볼륨 재구성 없이 개별 2D 이미지를 표시합니다. 사용자 요구사항에서 stack viewport는 프레임으로만 이동하여 측정값 검토 워크플로우와의 일관성을 위해 현재 pan/zoom을 유지하도록 지정했습니다.

### 성능 고려사항

- 3개의 viewport에서 zoom 동기화는 3개의 렌더링을 트리거합니다
- 중앙 정렬 계산은 프로젝션 수학을 사용합니다 (빠름)
- 설정은 첫 로드 후 메모리에 캐시됩니다
- 네트워크 요청 없음

---

## Commit 정보

**Commit**: TBD (생성 필요)
**수정된 파일**: 4개 파일 생성, 2개 파일 수정
**추가된 줄**: ~500
**제거된 줄**: ~50

---

**마지막 업데이트**: 2026-02-07
**저자**: Claude Sonnet 4.5
