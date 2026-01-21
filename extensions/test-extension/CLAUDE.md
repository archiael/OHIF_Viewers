# extensions/test-extension

## 목차
1. [모듈 개요](#1-모듈-개요)
   - 1.1. [주요 책임](#1.1-주요-책임)
   - 1.2. [연결되는 화면/기능](#1.2-연결되는-화면기능)
2. [주요 파일/컴포넌트 리스트](#2-주요-파일컴포넌트-리스트)
   - 2.1. [진입점 및 모듈 등록](#2.1-진입점-및-모듈-등록)
   - 2.2. [Hanging Protocol 관련](#2.2-hanging-protocol-관련)
   - 2.3. [Custom Attribute (Hanging Protocol 확장)](#2.3-custom-attribute-hanging-protocol-확장)
   - 2.4. [Context Menu Customization](#2.4-context-menu-customization)
   - 2.5. [Panel Module](#2.5-panel-module)
   - 2.6. [Customization Module](#2.6-customization-module)
   - 2.7. [데이터 흐름 다이어그램](#2.7-데이터-흐름-다이어그램)
3. [리액트 관점에서 볼 포인트](#3-리액트-관점에서-볼-포인트)
   - 3.1. [상태 관리 방식](#3.1-상태-관리-방식)
   - 3.2. [재사용 가능한 UI 컴포넌트 패턴](#3.2-재사용-가능한-ui-컴포넌트-패턴)
   - 3.3. [커스텀 훅](#3.3-커스텀-훅)
   - 3.4. [React 관련 특이사항](#3.4-react-관련-특이사항)
4. [OHIF 특유 개념 정리](#4-ohif-특유-개념-정리)
   - 4.1. [Extension (확장 프로그램)](#4.1-extension-확장-프로그램)
   - 4.2. [Hanging Protocol (레이아웃 프로토콜)](#4.2-hanging-protocol-레이아웃-프로토콜)
   - 4.3. [Custom Attribute (커스텀 속성)](#4.3-custom-attribute-커스텀-속성)
   - 4.4. [CustomizationService (커스터마이제이션 서비스)](#4.4-customizationservice-커스터마이제이션-서비스)
   - 4.5. [DisplaySet](#4.5-displayset)
   - 4.6. [관련 폴더](#4.6-관련-폴더)
5. [초보 개발자용 학습 가이드](#5-초보-개발자용-학습-가이드)
   - 5.1. [추천 학습 순서](#5.1-추천-학습-순서)
   - 5.2. [이 확장을 이해하면 할 수 있게 되는 것](#5.2-이-확장을-이해하면-할-수-있게-되는-것)
   - 5.3. [주의사항](#5.3-주의사항)
6. [참고 자료](#6-참고-자료)

---


## 1. 모듈 개요

`test-extension`은 OHIF의 **E2E(End-to-End) 테스트 및 기능 검증을 위한 확장 모듈**입니다. 프로덕션 환경에서 사용되지 않으며, 다음과 같은 테스트 유틸리티를 제공합니다:

### 1.1. 주요 책임
- **Hanging Protocol 테스트**: 다양한 그리드 레이아웃 전환을 테스트하기 위한 커스텀 Hanging Protocol 제공
- **Custom Attribute 확장**: Hanging Protocol에서 사용할 수 있는 커스텀 속성 등록 (displaySet 개수, 이미지 프레임 수, 속성 매칭 등)
- **Context Menu 커스터마이제이션**: 측정(measurement) 주석에 DICOM 코딩 값을 적용하는 컨텍스트 메뉴 테스트
- **패널 모듈 테스트**: Cornerstone extension의 측정 패널 컴포넌트를 재사용한 패널 등록

### 1.2. 연결되는 화면/기능
- E2E 테스트 시나리오에서 사용
- Hanging Protocol 자동 선택 및 레이아웃 전환 테스트
- 측정 도구의 컨텍스트 메뉴 기능 검증
- DisplaySet 매칭 로직 검증

---

## 2. 주요 파일/컴포넌트 리스트

### 2.1. 진입점 및 모듈 등록
- **`src/index.tsx`**: Extension 메인 진입점, 모든 모듈을 ExtensionManager에 등록
- **`src/id.js`**: Extension ID 정의 (`@ohif/extension-test`)

### 2.2. Hanging Protocol 관련
- **`src/hpTestSwitch.ts`** (240줄): 여러 레이아웃을 테스트하는 Hanging Protocol 정의
  - 2x2, 3x2 그리드 레이아웃 제공
  - Viewport 위치별로 다른 displaySet index 매핑
  - Stage 전환 시 viewportId 재사용 패턴 테스트
- **`src/hp/index.ts`**: HP 모듈 export (현재 hpMN import 참조하나 파일 없음)

### 2.3. Custom Attribute (Hanging Protocol 확장)
- **`src/custom-attribute/numberOfDisplaySets.ts`**: DisplaySet 개수를 반환하는 커스텀 속성
- **`src/custom-attribute/maxNumImageFrames.ts`**: DisplaySet 중 최대 이미지 프레임 수 반환
- **`src/custom-attribute/sameAs.ts`**: 다른 DisplaySet과 특정 속성이 동일한지 비교

### 2.4. Context Menu Customization
- **`src/custom-context-menu/index.ts`**: Context menu 관련 모듈 export
- **`src/custom-context-menu/codingValues.ts`** (95줄): DICOM SCT 코드 값 정의 (부위, 소견, 방향)
- **`src/custom-context-menu/contextMenuCodeItem.ts`**: 코드 값을 메뉴 아이템으로 변환하는 transform 함수
- **`src/custom-context-menu/findingsContextMenu.ts`** (99줄): 측정 컨텍스트 메뉴 구조 정의

### 2.5. Panel Module
- **`src/getPanelModule.tsx`**: Cornerstone의 PanelMeasurement 컴포넌트를 래핑한 패널 등록

### 2.6. Customization Module
- **`src/getCustomizationModule.ts`**: CustomizationService에 등록할 커스터마이제이션 정의

---

### 2.7. 데이터 흐름 다이어그램

```
[Extension 등록]
    │
    ├─> preRegistration
    │       └─> HangingProtocolService.addCustomAttribute()
    │               ├─ numberOfDisplaySets
    │               ├─ maxNumImageFrames
    │               └─ sameAs
    │
    ├─> getHangingProtocolModule()
    │       └─> hpTestSwitch (2x2, 3x2 레이아웃)
    │
    ├─> getCustomizationModule()
    │       ├─> custom-context-menu
    │       │       ├─ codingValues (SCT 코드)
    │       │       ├─ contextMenuCodeItem (transform)
    │       │       └─ findingsContextMenu (메뉴 구조)
    │       └─> contextMenuCodeItem
    │
    └─> getPanelModule()
            └─> panelMeasurementSeries (Cornerstone 재사용)
```

---

## 3. 리액트 관점에서 볼 포인트

### 3.1. 상태 관리 방식
- **ServicesManager 의존**: `preRegistration`에서 `servicesManager`를 받아 `HangingProtocolService`에 접근
- **Props 전달**: `getPanelModule`에서 `commandsManager`, `servicesManager`, `extensionManager`를 자식 컴포넌트에 props로 전달
- **Stateless 구조**: 대부분 설정 객체(plain object) 정의로 구성되어 있어 React state 거의 미사용

### 3.2. 재사용 가능한 UI 컴포넌트 패턴
- **컴포넌트 재사용**: `@ohif/extension-cornerstone`의 `PanelMeasurement`, `StudyMeasurements`, `SeriesMeasurements` 컴포넌트를 import하여 조합
  ```tsx
  <PanelMeasurement {...childProps}>
    <StudyMeasurements>
      <SeriesMeasurements />
    </StudyMeasurements>
  </PanelMeasurement>
  ```
- **Composition Pattern**: 부모-자식 계층 구조로 측정 데이터를 계층적으로 표시

### 3.3. 커스텀 훅
- 이 확장에는 별도의 커스텀 훅이 없음 (설정 및 유틸리티 함수만 존재)

### 3.4. React 관련 특이사항
- **Transform 함수**: `contextMenuCodeItem`에서 `$transform` 함수를 통해 런타임에 커스터마이제이션 적용
  ```typescript
  $transform: function (customizationService) {
    const codingValues = customizationService.getCustomization('codingValues');
    // 코드 값을 메뉴 아이템으로 변환
  }
  ```

---

## 4. OHIF 특유 개념 정리

### 4.1. Extension (확장 프로그램)
이 모듈 자체가 Extension입니다. Extension은 OHIF 뷰어에 기능을 추가하는 플러그인 모듈입니다.

**구조**:
```typescript
const testExtension: Types.Extensions.Extension = {
  id: '@ohif/extension-test',
  preRegistration: ({ servicesManager }) => { /* ... */ },
  getCustomizationModule,
  getPanelModule,
  getHangingProtocolModule,
};
```

### 4.2. Hanging Protocol (레이아웃 프로토콜)
의료 영상의 자동 레이아웃 배치 규칙을 정의합니다. `hpTestSwitch`는 다음을 포함합니다:

- **protocolMatchingRules**: 어떤 조건에서 이 프로토콜을 사용할지 결정
- **displaySetSelectors**: 어떤 시리즈를 선택할지 정의
- **stages**: 레이아웃 단계 (2x2, 3x2 등)
- **viewports**: 각 viewport에 어떤 displaySet을 표시할지 정의

**예시**:
```typescript
{
  name: '2x2 0a1b2c3d',
  viewportStructure: { layoutType: 'grid', properties: { rows: 2, columns: 2 } },
  viewports: [viewport0a, viewport1b, viewport2c, viewport3d],
}
```

### 4.3. Custom Attribute (커스텀 속성)
Hanging Protocol의 매칭 규칙에서 사용할 수 있는 커스텀 조건입니다.

**등록 방식**:
```typescript
hangingProtocolService.addCustomAttribute(
  'numberOfDisplaySets',
  'Number of displays sets',
  numberOfDisplaySets // (study, extraData) => extraData?.displaySets?.length
);
```

**사용 예시** (Hanging Protocol에서):
```typescript
protocolMatchingRules: [
  {
    attribute: 'numberOfDisplaySetsWithImages',
    constraint: { greaterThan: 0 },
  }
]
```

### 4.4. CustomizationService (커스터마이제이션 서비스)
런타임에 UI/동작을 커스터마이즈할 수 있는 서비스입니다. Context menu, toolbar 등의 동작을 동적으로 변경할 수 있습니다.

**이 확장의 커스터마이제이션**:
- `codingValues`: DICOM SCT 코드 정의 (예: `'SCT:69536005'` = 'Head')
- `contextMenuCodeItem`: 코드 값을 메뉴 아이템으로 변환
- `findingsContextMenu`: 측정 도구의 우클릭 메뉴 구조

### 4.5. DisplaySet
DICOM 시리즈에서 추출된 표시 가능한 이미지 세트입니다. 여러 이미지를 하나의 단위로 묶어 viewport에 표시합니다.

**Custom Attribute에서의 사용**:
```typescript
// sameAs.ts - 두 DisplaySet의 속성 비교
const altDisplaySet = displaySets.find(it => it.displaySetInstanceUID == displaySetInstanceUID);
return testValue === displaySet[sameAttribute];
```

### 4.6. 관련 폴더
- `platform/core/src/services/HangingProtocolService`: HP 관련 서비스
- `platform/core/src/services/CustomizationService`: 커스터마이제이션 서비스
- `extensions/cornerstone/`: 이 확장이 패널 컴포넌트를 재사용하는 곳
- `modes/*`: Hanging Protocol을 실제로 사용하는 모드들

---

## 5. 초보 개발자용 학습 가이드

### 5.1. 추천 학습 순서

**1단계: 기본 구조 이해**
- `src/index.tsx` 읽기 → Extension이 어떤 모듈을 export하는지 파악
- `package.json` 확인 → 의존성 및 peerDependencies 이해

**2단계: Hanging Protocol 이해**
- `src/hpTestSwitch.ts` 분석 → 레이아웃 정의 방식 학습
- `viewportStructure`, `viewports`, `stages` 개념 이해
- `displaySetSelectors`와 `matchedDisplaySetsIndex` 관계 파악

**3단계: Custom Attribute 학습**
- `src/custom-attribute/numberOfDisplaySets.ts` (가장 간단)
- `src/custom-attribute/maxNumImageFrames.ts` (배열 처리)
- `src/custom-attribute/sameAs.ts` (복잡한 비교 로직)
- `preRegistration`에서 어떻게 등록되는지 확인

**4단계: Customization 이해**
- `src/custom-context-menu/codingValues.ts` → DICOM 코드 값 구조
- `src/custom-context-menu/contextMenuCodeItem.ts` → Transform 함수 패턴
- `src/custom-context-menu/findingsContextMenu.ts` → 메뉴 계층 구조

**5단계: 통합 테스트**
- E2E 테스트 코드에서 이 확장이 어떻게 사용되는지 확인 (`tests/` 폴더)
- 실제 뷰어에서 Hanging Protocol 동작 테스트

### 5.2. 이 확장을 이해하면 할 수 있게 되는 것

**"OHIF Extension 개발의 핵심 패턴을 이해하고, Hanging Protocol 커스터마이징, Context Menu 확장, Custom Attribute 추가 등 OHIF의 확장 메커니즘을 활용할 수 있습니다."**

구체적으로:
- 새로운 Hanging Protocol 정의 및 등록
- Hanging Protocol에서 사용할 커스텀 매칭 조건 추가
- 측정 도구에 커스텀 컨텍스트 메뉴 추가
- DICOM 코딩 값을 활용한 주석 분류 시스템 구현
- 다른 확장의 컴포넌트를 재사용하는 패널 생성

### 5.3. 주의사항
- 이 확장은 **테스트 전용**이므로 프로덕션 코드 작성 시 참고용으로만 사용
- `src/hp/index.ts`에서 참조하는 `hpMN` 파일이 없는 것은 버그일 수 있음 (확인 필요)
- Customization의 `$transform` 함수는 런타임에 실행되므로 디버깅 시 주의

---

## 6. 참고 자료

- OHIF Extensions 공식 문서: https://docs.ohif.org/development/extensions/
- Hanging Protocol 가이드: https://docs.ohif.org/configuration/hanging-protocols
- CustomizationService 문서: https://docs.ohif.org/platform/services/customization-service
- DICOM SCT 코드: https://dicom.nema.org/medical/dicom/current/output/html/part16.html
