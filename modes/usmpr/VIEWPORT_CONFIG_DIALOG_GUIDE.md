# Configure Viewport Layout Dialog - 기술 문서

## 개요

### 목적
Configure Viewport Layout Dialog는 USMPR 모드의 2x2 그리드 레이아웃에서 4개의 뷰포트 위치에 어떤 뷰 타입(Axial, Sagittal, Coronal, 3D)을 표시할지 사용자가 커스터마이즈할 수 있는 모달 인터페이스입니다. 다양한 임상 워크플로우와 사용자 선호도에 맞춰 유연성을 제공합니다.

### 주요 기능
- **인터랙티브 위치 할당**: 특정 위치에 뷰 타입을 배치하는 클릭 할당 인터페이스
- **4가지 뷰 타입**: Axial, Coronal, Sagittal, 3D 볼륨 렌더링
- **3D 프리셋 선택**: 4가지 커스텀 초음파 3D 렌더링 프리셋 중 선택
- **저장소 지속성 옵션**: Session storage(프라이버시 친화적) 또는 Local storage(세션 간 지속)
- **실시간 적용**: 페이지 새로고침 없이 즉시 변경사항 적용
- **색상 코드 UI**: 각 뷰 타입마다 구별되는 색상으로 쉽게 식별

---

## 파일 구조 및 역할

### 핵심 파일

#### 1. `components/LayoutConfigModal.tsx` (875줄)
**역할**: 메인 모달 UI 컴포넌트, modes\usmpr\VIEWPORT_CONFIG_DIALOG_GUIDE.md 파일 참고

**주요 State 변수**:
```typescript
// 4개 뷰포트의 뷰 위치 (Position 1-4)
const [positions, setPositions] = useState<ViewType[]>([
  'Axial',    // Position 1 (왼쪽 상단)
  'Sagittal', // Position 2 (오른쪽 상단)
  'Coronal',  // Position 3 (왼쪽 하단)
  '3D',       // Position 4 (오른쪽 하단)
]);

// 3D 렌더링 프리셋
const [preset3D, setPreset3D] = useState<PresetType>('US 3D 1');

// 저장소 지속성 선호도
const [storagePersistence, setStoragePersistence] = useState<'session' | 'local'>('session');

// 현재 선택된 뷰 타입 (할당용)
const [selectedView, setSelectedView] = useState<ViewType>(null);
```

**타입 정의**:
```typescript
type ViewType = 'Axial' | 'Coronal' | 'Sagittal' | '3D' | null;
type PresetType = 'US 3D 1' | 'US 3D 2' | 'US 3D 3' | 'US 3D 4';
```

**주요 함수**:

1. **설정 로드** (lines 33-70):
```typescript
useEffect(() => {
  if (isOpen) {
    // localStorage에서 저장소 선호도 로드
    const savedPreference = localStorage.getItem('usmpr-storage-preference');

    // 선택된 저장소 타입에서 레이아웃 설정 로드
    const storage = preferenceToUse === 'local' ? localStorage : sessionStorage;
    const saved = storage.getItem('usmpr-layout-config');

    if (saved) {
      const parsed = JSON.parse(saved);
      setPositions(parsed.positions);
      setPreset3D(parsed.preset3D || 'US 3D 1');
    }
  }
}, [isOpen, initialLayout]);
```

2. **뷰 선택** (lines 95-113):
```typescript
const handleViewButtonClick = (viewType: ViewType) => {
  // 이미 할당된 뷰 선택 방지
  if (isViewUsed(viewType)) {
    console.log(`${viewType} is already used`);
    return;
  }
  setSelectedView(viewType);
};

const handlePositionClick = (positionIndex: number) => {
  if (selectedView) {
    const newPositions = [...positions];
    newPositions[positionIndex] = selectedView;
    setPositions(newPositions);
    setSelectedView(null); // 할당 후 선택 초기화
  }
};
```

3. **설정 저장** (lines 120-191):
```typescript
const handleSave = () => {
  // 위치 검증 - null 값을 기본값으로 대체
  const validPositions = positions.map((pos, idx) => {
    if (pos === null || pos === undefined) {
      const defaults = ['Axial', 'Sagittal', 'Coronal', '3D'];
      return defaults[idx];
    }
    return pos;
  });

  const config = {
    positions: validPositions,
    preset3D,
  };

  // localStorage에 저장소 선호도 저장
  localStorage.setItem('usmpr-storage-preference', storagePersistence);

  // 선택된 저장소 타입에 레이아웃 설정 저장
  const storage = storagePersistence === 'local' ? localStorage : sessionStorage;
  storage.setItem('usmpr-layout-config', JSON.stringify(config));

  onClose();

  // 뷰포트를 새로고침하기 위해 hanging protocol 재적용
  if (servicesManager) {
    const { hangingProtocolService } = servicesManager.services;

    setTimeout(() => {
      // localStorage에서 프로토콜의 viewports 배열 새로고침
      refreshViewportsFromConfig(hangingProtocolService);

      // 업데이트된 뷰포트로 프로토콜 재실행
      hangingProtocolService.setProtocol('@ohif/hpUSMPR', {
        stageIndex: 0
      });

      // 지연 후 커스텀 US 프리셋 적용
      setTimeout(() => {
        const layoutConfig = JSON.parse(localStorage.getItem('usmpr-layout-config') || '{}');
        const presetName = layoutConfig.preset3D || 'US 3D 1';

        if ((window as any).applyCustomUSPreset) {
          const { cornerstoneViewportService } = servicesManager.services;
          (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
        }
      }, 200);
    }, 100);
  }
};
```

**UI 레이아웃**:

```
┌─────────────────────────────────────────────────┐
│  Configure Viewport Layout                      │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Position 1   │  │ Position 2   │            │
│  │ (Upper Left) │  │ (Upper Right)│            │
│  │              │  │              │            │
│  │   Axial      │  │  Sagittal    │            │
│  └──────────────┘  └──────────────┘            │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Position 3   │  │ Position 4   │            │
│  │ (Lower Left) │  │ (Lower Right)│            │
│  │              │  │              │            │
│  │  Coronal     │  │     3D       │            │
│  └──────────────┘  └──────────────┘            │
│                                                  │
│  Selected: [None/ViewType] - Click position     │
│                                                  │
│  ┌────┐ ┌────────┐ ┌─────────┐ ┌────┐         │
│  │ a. │ │  b.    │ │   c.    │ │ d. │         │
│  │Axial Coronal │ │Sagittal │ │ 3D │         │
│  └────┘ └────────┘ └─────────┘ └────┘         │
│                                                  │
│  3D Rendering Preset                            │
│  ┌───────┐┌───────┐┌───────┐┌───────┐         │
│  │US 3D 1││US 3D 2││US 3D 3││US 3D 4│         │
│  └───────┘└───────┘└───────┘└───────┘         │
│                                                  │
│  Viewport Position Storage                      │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Session    │  │    Local     │            │
│  │   Storage    │  │   Storage    │            │
│  └──────────────┘  └──────────────┘            │
│                                                  │
│         [Clear] [Cancel] [Save]                 │
└─────────────────────────────────────────────────┘
```

**색상 체계**:
```typescript
const getViewColor = (viewType: ViewType) => {
  switch (viewType) {
    case 'Axial':    return '#22c55e'; // 초록색
    case 'Coronal':  return '#3b82f6'; // 파란색
    case 'Sagittal': return '#f59e0b'; // 주황색
    case '3D':       return '#8b5cf6'; // 보라색
    default:         return '#64748b'; // 회색 (비어있음)
  }
};
```

**파일 위치**: `modes/usmpr/src/components/LayoutConfigModal.tsx`

---

#### 2. `utils/LayoutConfigManager.tsx` (103줄)
**역할**: 모달 생명주기 및 React root 관리

**클래스 구조**:
```typescript
export class LayoutConfigManager {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private servicesManager: any = null;

  // ... methods
}
```

**주요 메서드**:

1. **setServicesManager** (lines 17-19):
```typescript
/**
 * Hanging protocol 업데이트를 위한 services manager 설정
 */
setServicesManager(servicesManager: any): void {
  this.servicesManager = servicesManager;
}
```

2. **show** (lines 24-49):
```typescript
/**
 * 레이아웃 구성 모달 표시
 * - 컨테이너 div가 없으면 생성
 * - React root 생성
 * - 모달 컴포넌트 렌더링
 */
show(): void {
  console.log('📂 LayoutConfigManager.show() called');

  if (this.isOpen) {
    console.log('⚠️ Modal already open, returning');
    return;
  }

  this.isOpen = true;

  // 컨테이너가 존재하지 않으면 생성
  if (!this.container) {
    console.log('🆕 Creating new container');
    this.container = document.createElement('div');
    this.container.id = 'usmpr-layout-config-modal';
    document.body.appendChild(this.container);
    this.root = createRoot(this.container);
    console.log('✅ Container created and appended to body');
  }

  // 모달 렌더링
  this.render();
}
```

3. **hide** (lines 54-59):
```typescript
/**
 * 레이아웃 구성 모달 숨김
 */
hide(): void {
  if (!this.isOpen) return;

  this.isOpen = false;
  this.render();
}
```

4. **render** (lines 64-82):
```typescript
/**
 * 모달 컴포넌트 렌더링
 * - React 18 createRoot API 사용
 * - isOpen, onClose, servicesManager props 전달
 */
private render(): void {
  console.log('🎨 render() called, isOpen:', this.isOpen);

  if (!this.root) {
    console.error('❌ No root found, cannot render!');
    return;
  }

  this.root.render(
    <LayoutConfigModal
      isOpen={this.isOpen}
      onClose={() => this.hide()}
      servicesManager={this.servicesManager}
    />
  );
  console.log('✅ Modal rendered');
}
```

5. **destroy** (lines 87-99):
```typescript
/**
 * 모달 정리 및 제거
 * - React root 언마운트
 * - DOM에서 컨테이너 제거
 */
destroy(): void {
  if (this.root) {
    this.root.unmount();
    this.root = null;
  }

  if (this.container && this.container.parentNode) {
    this.container.parentNode.removeChild(this.container);
  }

  this.container = null;
  this.isOpen = false;
}
```

**파일 위치**: `modes/usmpr/src/utils/LayoutConfigManager.tsx`

---

#### 3. `toolbarButtons.ts` (170줄)
**역할**: 툴바 버튼 정의

**Layout Config 버튼** (lines 156-167):
```typescript
{
  id: 'LayoutConfig',
  uiType: 'ohif.toolButton',
  props: {
    icon: 'tool-layout',
    label: 'Layout Config',
    tooltip: 'Configure Viewport Layout',
    commands: {
      commandName: 'openLayoutConfigModal',
      context: 'USMPR',  // 커스텀 USMPR 명령 컨텍스트
    },
  },
}
```

**파일 위치**: `modes/usmpr/src/toolbarButtons.ts`

---

#### 4. `index.tsx` - 명령 등록
**역할**: 모달 열기를 위한 커스텀 명령 등록

**초기화** (lines 1001-1028):
```typescript
// LayoutConfigManager 인스턴스 생성
const layoutConfigManager = new LayoutConfigManager();
layoutConfigManager.setServicesManager(servicesManager);
console.log('🔧 LayoutConfigManager initialized:', layoutConfigManager);

// 툴바 버튼을 위해 전역 접근 가능하게 만들기
(window as any).usmprLayoutConfigManager = layoutConfigManager;

// USMPR 명령 컨텍스트 생성 및 등록
commandsManager.createContext('USMPR');
console.log('📦 Created USMPR command context');

// 레이아웃 구성 모달 열기를 위한 커스텀 명령 등록
commandsManager.registerCommand('USMPR', 'openLayoutConfigModal', {
  commandFn: () => {
    console.log('🎯 openLayoutConfigModal command called!');
    console.log('🔍 layoutConfigManager exists?', !!layoutConfigManager);
    if (layoutConfigManager) {
      console.log('📂 Calling layoutConfigManager.show()...');
      layoutConfigManager.show();
    } else {
      console.error('❌ layoutConfigManager is null!');
    }
  },
});
console.log('✅ openLayoutConfigModal command registered in USMPR context');
```

**파일 위치**: `modes/usmpr/src/index.tsx`

---

#### 5. `hangingprotocols/hpUSMPR.ts` - 구성 로직
**역할**: 레이아웃 구성 로드 및 적용

**헬퍼 함수**:

1. **getLayoutConfig** (lines 5-56):
```typescript
/**
 * 저장소에서 뷰포트 구성 가져오기
 * 사용자의 저장소 선호도 존중 (session 또는 local)
 *
 * @returns {Object} positions와 preset3D를 포함한 레이아웃 구성
 */
function getLayoutConfig() {
  console.log('🔍 [HP] getLayoutConfig() called');

  // 기본 구성
  const defaultConfig = {
    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    preset3D: 'US 3D 1',
  };

  try {
    // 사용자의 저장소 선호도 확인 (항상 localStorage에 저장)
    const preference = localStorage.getItem('usmpr-storage-preference');
    const storage = preference === 'local' ? localStorage : sessionStorage;
    console.log(`🔍 [HP] Storage preference: ${preference || 'session (default)'}`);

    const saved = storage.getItem('usmpr-layout-config');
    console.log(`💾 [HP] ${storage === localStorage ? 'localStorage' : 'sessionStorage'} data:`, saved);

    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('📥 [HP] Found saved layout configuration:', parsed);

      // positions 배열이 유효한지 검증
      const positions = parsed.positions || parsed;
      if (Array.isArray(positions) && positions.length === 4) {
        console.log('✅ [HP] Using saved layout configuration');
        const config = {
          positions: positions,
          preset3D: parsed.preset3D || 'US 3D 1',
        };
        console.log('🔄 [HP] Returning config:', config);
        return config;
      } else {
        console.warn('⚠️ [HP] Invalid saved layout format, using defaults');
      }
    }
  } catch (e) {
    console.error('❌ [HP] Failed to parse saved layout:', e);
    // 손상된 데이터 정리
    localStorage.removeItem('usmpr-layout-config');
    sessionStorage.removeItem('usmpr-layout-config');
  }

  // 기본 구성
  console.log('📌 [HP] Using default layout configuration');
  return defaultConfig;
}
```

2. **createViewportConfig** (lines 68-132):
```typescript
/**
 * 뷰 타입과 위치를 기반으로 뷰포트 구성 생성
 *
 * @param {string} viewType - 'Axial', 'Sagittal', 'Coronal', 또는 '3D'
 * @param {number} positionIndex - 4개 뷰포트 위치를 위한 0-3
 * @param {string} preset3D - 3D 렌더링 프리셋 이름
 * @returns {Object} 뷰포트 구성 객체
 */
function createViewportConfig(
  viewType: string,
  positionIndex: number,
  preset3D: string = 'US 3D 1'
) {
  console.log(`🏗️ [HP] createViewportConfig called: viewType="${viewType}", position=${positionIndex}, preset3D="${preset3D}"`);

  // viewType 검증
  const validViewTypes = ['Axial', 'Sagittal', 'Coronal', '3D'];
  if (!viewType || !validViewTypes.includes(viewType)) {
    console.warn(`⚠️ [HP] Invalid viewType "${viewType}", using Axial instead`);
    viewType = 'Axial';
  }

  // 위치 기반 뷰포트 ID 사용
  const viewportId = `mpr-${positionIndex}`;

  // UI 프리셋 이름을 Cornerstone 프리셋으로 매핑
  const actualPreset = mapPresetName(preset3D);

  const baseConfig = {
    viewportOptions: {
      viewportId,
      viewportType: viewType === '3D' ? 'volume3d' : 'volume',
      orientation: viewType === '3D' ? 'coronal' : viewType.toLowerCase(),
      toolGroupId: viewType === '3D' ? 'volume3d' : 'mpr',
      initialImageOptions: {
        preset: 'middle',
      },
    },
    displaySets: [
      {
        id: 'mprDisplaySet',
        // 3D 뷰포트는 display preset을 가져옴
        ...(viewType === '3D'
          ? {
              options: {
                displayPreset: {
                  CT: actualPreset,
                  MR: actualPreset,
                  US: actualPreset,
                  default: actualPreset,
                },
              },
            }
          : {}),
      },
    ],
  };

  // 2D 뷰를 위한 syncGroups 추가
  if (viewType !== '3D') {
    baseConfig.viewportOptions['syncGroups'] = [
      {
        type: 'voi',
        id: 'mprAcquisitionUid',
        source: true,
        target: true,
      },
    ];
  }

  return baseConfig;
}
```

3. **createViewportsFromConfig** (lines 135-216):
```typescript
/**
 * 현재 구성을 기반으로 뷰포트 배열 생성
 * localStorage/sessionStorage에서 읽기
 *
 * @returns {Array} 5개 뷰포트 구성 배열 (4개 MPR + 1개 STACK)
 */
function createViewportsFromConfig() {
  console.log('🎬 [HP] createViewportsFromConfig() called');
  try {
    const config = getLayoutConfig();
    console.log('🔄 [HP] Creating viewports with config:', config);

    // 유효한 positions가 있는지 확인
    if (!config.positions || !Array.isArray(config.positions)) {
      console.error('❌ [HP] Invalid positions array, using defaults');
      // 기본 뷰포트 반환
    }

    console.log(`🔨 [HP] Creating ${config.positions.length} viewports from saved config...`);
    const viewports = config.positions.map((viewType, index) => {
      try {
        const viewport = createViewportConfig(viewType, index, config.preset3D);
        console.log(`✅ [HP] Viewport ${index} created successfully`);
        return viewport;
      } catch (e) {
        console.error(`❌ [HP] Failed to create viewport ${index} with type ${viewType}:`, e);
        // Axial 뷰로 폴백
        return createViewportConfig('Axial', index, config.preset3D);
      }
    });

    // STACK 단일 뷰를 위한 5번째 뷰포트 추가
    viewports.push({
      viewportOptions: {
        viewportId: 'mpr-stack-single',
        viewportType: 'stack',  // VOLUME이 아닌 STACK 타입
        orientation: 'axial',
        toolGroupId: 'default',
        initialImageOptions: { preset: 'middle' },
      },
      displaySets: [{ id: 'mprDisplaySet' }],
    });

    console.log(`✅ [HP] All ${viewports.length} viewports created successfully`);
    return viewports;
  } catch (e) {
    console.error('❌ [HP] Critical error creating viewports:', e);
    // 폴백 뷰포트 반환
  }
}
```

4. **refreshViewportsFromConfig** (lines 304-319):
```typescript
/**
 * localStorage에서 뷰포트를 새로고침하기 위한 export 함수
 * 레이아웃을 업데이트하기 위해 프로토콜을 재적용하기 전에 호출
 * 저장된 프로토콜을 업데이트하기 위해 hangingProtocolService 전달
 *
 * @param {Object} hangingProtocolService - 선택적 hanging protocol service
 */
export function refreshViewportsFromConfig(hangingProtocolService?) {
  console.log('🔄 [HP] refreshViewportsFromConfig() called');

  // 로컬 프로토콜 객체의 뷰포트 업데이트
  hpUSMPR.stages[0].viewports = createViewportsFromConfig();
  console.log('✅ [HP] Viewports refreshed in local object');

  // 서비스 저장소의 프로토콜도 업데이트
  if (hangingProtocolService) {
    try {
      // 서비스의 저장된 사본을 업데이트하기 위해 프로토콜 재추가
      hangingProtocolService.addProtocol(hpUSMPR.id, hpUSMPR);
      console.log('✅ [HP] Protocol re-registered in HangingProtocolService');
    } catch (error) {
      console.warn('⚠️ [HP] Failed to re-register protocol:', error);
    }
  }
}
```

**파일 위치**: `extensions/default/src/hangingprotocols/hpUSMPR.ts`

---

## 아키텍처

### 컴포넌트 상호작용 다이어그램

```
┌─────────────────────────────────────────────────────┐
│                  툴바 버튼                            │
│  (Change Layout - tool-layout 아이콘)                │
└───────────────────┬─────────────────────────────────┘
                    │ onClick
                    ▼
┌─────────────────────────────────────────────────────┐
│         CommandsManager (USMPR 컨텍스트)             │
│  - commandName: 'openLayoutConfigModal'              │
└───────────────────┬─────────────────────────────────┘
                    │ executes
                    ▼
┌─────────────────────────────────────────────────────┐
│          LayoutConfigManager.show()                  │
│  - DOM 컨테이너 생성                                  │
│  - React root 생성                                   │
│  - LayoutConfigModal 렌더링                          │
└───────────────────┬─────────────────────────────────┘
                    │ renders
                    ▼
┌─────────────────────────────────────────────────────┐
│           LayoutConfigModal (React)                  │
│  - 저장소에서 구성 로드                                │
│  - 4개 위치 카드 표시                                  │
│  - 뷰 타입 버튼 표시                                   │
│  - 3D 프리셋 버튼 표시                                 │
│  - 저장소 선호도 버튼 표시                              │
└───────────────────┬─────────────────────────────────┘
                    │ 사용자가 Save 클릭
                    ▼
┌─────────────────────────────────────────────────────┐
│             handleSave()                             │
│  1. 위치 검증                                         │
│  2. localStorage/sessionStorage에 저장               │
│  3. 모달 닫기                                         │
│  4. refreshViewportsFromConfig() 호출                │
│  5. Hanging protocol 재적용                          │
└───────────────────┬─────────────────────────────────┘
                    │ updates
                    ▼
┌─────────────────────────────────────────────────────┐
│       HangingProtocolService                         │
│  - 저장소에서 업데이트된 구성 읽기                       │
│  - 새 뷰포트 구성 생성                                  │
│  - 뷰포트에 프로토콜 적용                               │
└───────────────────┬─────────────────────────────────┘
                    │ renders
                    ▼
┌─────────────────────────────────────────────────────┐
│          업데이트된 뷰포트 (2x2 그리드)                 │
│  - Position 1: 사용자 선택 뷰 타입                     │
│  - Position 2: 사용자 선택 뷰 타입                     │
│  - Position 3: 사용자 선택 뷰 타입                     │
│  - Position 4: 사용자 선택 뷰 타입                     │
└─────────────────────────────────────────────────────┘
```

### 데이터 흐름 다이어그램

```
사용자 동작 흐름:
1. "Change Layout" 버튼 클릭
   ↓
2. openLayoutConfigModal 명령 실행
   ↓
3. LayoutConfigManager.show() 호출
   ↓
4. 저장소 데이터로 LayoutConfigModal 렌더링
   ↓
5. 사용자가 뷰 타입 선택 (예: "Axial")
   ↓
6. 사용자가 위치 카드 클릭 (예: Position 1)
   ↓
7. 위치 업데이트: positions[0] = 'Axial'
   ↓
8. 사용자가 3D 프리셋 선택 (예: "US 3D 2")
   ↓
9. 사용자가 저장소 선호도 선택 (예: "Local Storage")
   ↓
10. 사용자가 "Save" 버튼 클릭
    ↓
11. handleSave() 실행:
    ├─ 저장소에 저장: {
    │    positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
    │    preset3D: 'US 3D 2'
    │  }
    ├─ localStorage에 저장소 선호도 저장
    ├─ 모달 닫기
    ├─ refreshViewportsFromConfig(hangingProtocolService) 호출
    └─ Hanging protocol 재적용
    ↓
12. 새 구성으로 뷰포트 업데이트

저장소 흐름:
localStorage (항상):
  - 'usmpr-storage-preference': 'session' | 'local'

localStorage 또는 sessionStorage (선호도 기반):
  - 'usmpr-layout-config': {
      positions: ['Axial', 'Sagittal', 'Coronal', '3D'],
      preset3D: 'US 3D 1'
    }
```

---

## 실행 흐름

### 1. 모달 열기 흐름

```
1. 사용자가 "Change Layout" 툴바 버튼 클릭
   ↓
2. 툴바가 명령 실행:
   commandsManager.runCommand('openLayoutConfigModal', {}, 'USMPR')
   ↓
3. USMPR 명령 컨텍스트가 commandFn 실행:
   └─ layoutConfigManager.show()
   ↓
4. LayoutConfigManager.show():
   ├─ 이미 열려 있는지 확인 (예이면 return)
   ├─ isOpen = true 설정
   ├─ 컨테이너 div가 없으면 생성
   │  └─ document.createElement('div')
   │  └─ document.body.appendChild(container)
   ├─ React root가 없으면 생성
   │  └─ createRoot(container)
   └─ render() 호출
   ↓
5. LayoutConfigManager.render():
   └─ root.render(<LayoutConfigModal isOpen={true} ... />)
   ↓
6. LayoutConfigModal 컴포넌트 마운트:
   ├─ useEffect 실행 (isOpen이 true로 변경됨)
   ├─ localStorage에서 저장소 선호도 로드
   ├─ 저장소 타입 결정 (local 또는 session)
   ├─ 저장소에서 저장된 구성 로드
   │  └─ storage.getItem('usmpr-layout-config')
   ├─ JSON 파싱 및 state 설정
   │  ├─ setPositions(parsed.positions)
   │  ├─ setPreset3D(parsed.preset3D)
   │  └─ setStoragePersistence(preference)
   └─ 모달 UI 렌더링
```

### 2. 뷰 선택 및 할당 흐름

```
1. 사용자가 뷰 타입 버튼 클릭 (예: "Axial")
   ↓
2. handleViewButtonClick('Axial') 실행:
   ├─ 'Axial'이 이미 사용되었는지 확인: isViewUsed('Axial')
   │  └─ positions.includes('Axial')
   ├─ 이미 사용됨: return (아무것도 안 함)
   ├─ 사용 안 됨: setSelectedView('Axial')
   └─ 버튼 하이라이트 (흰색 테두리 + 광택 효과)
   ↓
3. UI 업데이트:
   ├─ "Axial" 버튼이 흰색 테두리 표시
   ├─ 다른 위치들이 초록색 테두리 표시 (할당 준비)
   └─ 정보 텍스트: "Selected: Axial - Click a position above to assign"
   ↓
4. 사용자가 위치 카드 클릭 (예: Position 2)
   ↓
5. handlePositionClick(1) 실행:  // index 1 = Position 2
   ├─ selectedView가 존재하는지 확인
   ├─ 새 positions 배열 생성: [...positions]
   ├─ 위치 업데이트: newPositions[1] = 'Axial'
   ├─ setPositions(newPositions)
   └─ 선택 초기화: setSelectedView(null)
   ↓
6. UI 업데이트:
   ├─ Position 2 카드가 이제 초록색의 "Axial" 표시
   ├─ "Axial" 버튼이 비활성화됨 (회색 + ✓ 표시)
   ├─ 선택 초기화 (흰색 테두리 없음)
   └─ 정보 텍스트: "Click a view button below to start"
```

### 3. 저장 및 적용 흐름

```
1. 사용자가 "Save" 버튼 클릭
   ↓
2. handleSave() 실행:
   ├─ 단계 1: 위치 검증
   │  └─ null 값을 기본값으로 대체:
   │      ['Axial', 'Sagittal', 'Coronal', '3D'][index]
   ↓
   ├─ 단계 2: 구성 객체 생성
   │  const config = {
   │    positions: validPositions,
   │    preset3D: preset3D
   │  };
   ↓
   ├─ 단계 3: 저장소 선호도 저장
   │  └─ localStorage.setItem('usmpr-storage-preference', storagePersistence)
   ↓
   ├─ 단계 4: 레이아웃 구성 저장
   │  ├─ 저장소 타입 결정:
   │  │  const storage = storagePersistence === 'local'
   │  │                  ? localStorage
   │  │                  : sessionStorage;
   │  └─ storage.setItem('usmpr-layout-config', JSON.stringify(config))
   ↓
   ├─ 단계 5: 모달 닫기
   │  └─ onClose()
   │      └─ LayoutConfigManager.hide()
   │          └─ isOpen = false
   │          └─ render()
   ↓
   ├─ 단계 6: Hanging protocol 재적용 (100ms 지연 후)
   │  └─ setTimeout(() => {
   │      ├─ refreshViewportsFromConfig(hangingProtocolService)
   │      │  ├─ 저장소에서 구성 읽기
   │      │  ├─ 새 뷰포트 구성 생성
   │      │  └─ HangingProtocolService에서 프로토콜 업데이트
   │      ├─ hangingProtocolService.setProtocol('@ohif/hpUSMPR', { stageIndex: 0 })
   │      │  └─ 뷰포트 재구성 트리거
   │      └─ 커스텀 US 프리셋 적용 (200ms 후)
   │          └─ window.applyCustomUSPreset(cornerstoneViewportService, presetName)
   │    }, 100);
   ↓
3. Hanging Protocol이 구성 읽기:
   ├─ getLayoutConfig() 호출
   │  ├─ localStorage에서 'usmpr-storage-preference' 읽기
   │  ├─ 저장소 타입 결정
   │  ├─ 저장소에서 'usmpr-layout-config' 읽기
   │  └─ { positions, preset3D } 반환
   ↓
   ├─ createViewportsFromConfig() 호출
   │  └─ 각 위치마다:
   │      └─ createViewportConfig(viewType, index, preset3D)
   │          ├─ 뷰포트 ID 생성: `mpr-${index}`
   │          ├─ viewportType 설정: '3D' → 'volume3d', 그 외 → 'volume'
   │          ├─ orientation 설정: viewType.toLowerCase()
   │          ├─ toolGroupId 설정: '3D' → 'volume3d', 그 외 → 'mpr'
   │          └─ 뷰포트 구성 반환
   ↓
   └─ 뷰포트 배열 생성: [viewport0, viewport1, viewport2, viewport3, stackViewport]
   ↓
4. HangingProtocolService가 프로토콜 적용:
   ├─ 기존 뷰포트 파괴
   ├─ 구성 기반 새 뷰포트 생성
   ├─ Display sets 적용
   └─ 화면에 렌더링
   ↓
5. 커스텀 US 프리셋 적용:
   └─ window.applyCustomUSPreset() (200ms 후)
       ├─ 3D 뷰포트 찾기
       ├─ VTK 볼륨 actor 가져오기
       ├─ 커스텀 transfer functions 적용
       └─ 뷰포트 렌더링
   ↓
6. 최종 결과: 사용자 선택 구성으로 뷰포트 업데이트됨
```

---

## 저장소 스키마

### 저장소 키

| 키 이름 | 저장소 위치 | 목적 | 데이터 타입 |
|----------|-----------------|---------|-----------|
| `usmpr-storage-preference` | localStorage (항상) | 사용자의 저장소 타입 선호도 | `'session' \| 'local'` |
| `usmpr-layout-config` | localStorage 또는 sessionStorage (선호도 기반) | 뷰포트 레이아웃 구성 | `{ positions: ViewType[], preset3D: PresetType }` |

### 데이터 구조

#### 레이아웃 구성
```typescript
interface LayoutConfig {
  /**
   * 뷰포트 위치를 위한 4개 뷰 타입 배열
   * Index 0: Position 1 (왼쪽 상단)
   * Index 1: Position 2 (오른쪽 상단)
   * Index 2: Position 3 (왼쪽 하단)
   * Index 3: Position 4 (오른쪽 하단)
   */
  positions: [ViewType, ViewType, ViewType, ViewType];

  /**
   * 3D 렌더링 프리셋 이름
   * 3D 뷰포트의 볼륨 렌더링에 사용됨
   */
  preset3D: PresetType;
}

type ViewType = 'Axial' | 'Coronal' | 'Sagittal' | '3D';
type PresetType = 'US 3D 1' | 'US 3D 2' | 'US 3D 3' | 'US 3D 4';
```

#### 예시 저장소 데이터
```json
{
  "positions": ["Axial", "Sagittal", "Coronal", "3D"],
  "preset3D": "US 3D 2"
}
```

---

## UI 디자인 사양

### 위치 카드

**레이아웃**: 16px 간격의 2x2 그리드

**카드 상태**:
1. **기본** (뷰 선택 안 됨):
   - 테두리: `2px solid #475569` (회색)
   - 배경: `#0f172a` (어두운색)
   - 커서: `default`

2. **할당 준비** (뷰 선택됨):
   - 테두리: `2px solid #22c55e` (초록색)
   - 배경: `#0f172a`
   - 커서: `pointer`

3. **호버** (뷰 선택됨):
   - 테두리: `2px solid #16a34a` (진한 초록색)
   - 배경: `#1e293b` (밝은색)

**카드 내용**:
```
┌─────────────────────┐
│ Position 1          │  ← 12px 회색 텍스트
│ (Upper Left)        │
│                     │
│ Axial               │  ← 18px 굵게, 뷰 타입별 색상
└─────────────────────┘
```

### 뷰 타입 버튼

**레이아웃**: 12px 간격의 4개 버튼

**버튼 상태**:

1. **사용 가능**:
   - 배경: 뷰별 색상 (초록/파랑/주황/보라)
   - 색상: 흰색
   - 테두리: 없음
   - 커서: `pointer`
   - 불투명도: 1.0

2. **선택됨**:
   - 배경: 뷰별 색상
   - 색상: 흰색
   - 테두리: `3px solid #fff`
   - Box-shadow: `0 0 10px rgba(color, 0.5)`
   - 커서: `pointer`

3. **사용됨** (이미 할당됨):
   - 배경: `#475569` (회색)
   - 색상: `#94a3b8` (밝은 회색)
   - 테두리: 없음
   - 커서: `not-allowed`
   - 불투명도: 0.5
   - 접미사: ` ✓` (체크 표시)

4. **호버** (사용 가능한 경우만):
   - 배경: 뷰 색상의 어두운 음영
   - 전환: `all 0.2s`

**뷰 색상**:
```typescript
Axial:    #22c55e (초록)   → 호버: #16a34a
Coronal:  #3b82f6 (파랑)   → 호버: #2563eb
Sagittal: #f59e0b (주황)   → 호버: #d97706
3D:       #8b5cf6 (보라)   → 호버: #7c3aed
```

### 3D 프리셋 버튼

**레이아웃**: 8px 간격의 4개 버튼

**버튼 상태**:

1. **선택 안 됨**:
   - 배경: `#334155` (진한 회색)
   - 색상: 흰색
   - 테두리: 없음
   - Padding: `8px 12px`
   - Font-size: 12px

2. **선택됨**:
   - 배경: `#8b5cf6` (보라)
   - 색상: 흰색
   - 테두리: `2px solid #fff`
   - Font-weight: 600

3. **호버**:
   - 배경: `#475569` (밝은 회색)

### 저장소 선호도 버튼

**레이아웃**: 12px 간격의 2개 버튼

**버튼 구조**:
```
┌────────────────────┐
│  Session Storage   │  ← 주요 텍스트
│  Clears on close   │  ← 보조 텍스트 (11px, 80% 불투명도)
└────────────────────┘
```

**상태**:

1. **Session Storage 선택**:
   - 배경: `#22c55e` (초록색)
   - 테두리: `2px solid #fff`

2. **Local Storage 선택**:
   - 배경: `#3b82f6` (파랑)
   - 테두리: `2px solid #fff`

3. **선택 안 됨**:
   - 배경: `#334155` (진한 회색)
   - 테두리: 없음

### 동작 버튼

**레이아웃**: 12px 간격의 오른쪽 정렬 행

1. **Clear 버튼**:
   - 배경: `#ef4444` (빨강)
   - 호버: `#dc2626`
   - 모든 위치를 null로 초기화

2. **Cancel 버튼**:
   - 배경: `#475569` (회색)
   - 호버: `#334155`
   - 저장하지 않고 모달 닫기

3. **Save 버튼**:
   - 배경: `#3b82f6` (파랑)
   - 호버: `#2563eb`
   - 구성 저장 및 적용

---

## 사용자 워크플로우 예시

### 예시 1: Position 1을 Axial에서 Coronal로 변경

```
초기 상태:
  Position 1: Axial
  Position 2: Sagittal
  Position 3: Coronal
  Position 4: 3D

단계:
1. "Change Layout" 버튼 클릭
2. 현재 구성으로 모달 열림
3. "Coronal" 버튼 클릭
   → 버튼이 흰색 테두리로 하이라이트
   → 정보: "Selected: Coronal - Click a position above to assign"
4. Position 1 카드 클릭 (왼쪽 상단)
   → Position 1이 "Coronal"로 변경 (파랑)
   → "Coronal" 버튼이 ✓와 함께 비활성화
   → 선택 초기화
5. Position 3가 이제 비어있음 확인 (이전엔 Coronal이었음)
6. "Axial" 버튼 클릭
7. Position 3 카드 클릭
   → Position 3가 "Axial"로 변경 (초록)
8. "Save" 클릭
   → 모달 닫힘
   → 뷰포트 즉시 업데이트

최종 상태:
  Position 1: Coronal (Position 3에서 이동)
  Position 2: Sagittal (변경 없음)
  Position 3: Axial (Position 1에서 이동)
  Position 4: 3D (변경 없음)
```

### 예시 2: 지속 저장소로 "의사 모드" 전환

```
초기 상태:
  저장소: Session Storage (기본값)
  브라우저 닫을 때 구성 초기화

단계:
1. "Change Layout" 버튼 클릭
2. "Viewport Position Storage" 섹션에서:
   → "Local Storage" 버튼 클릭
   → 버튼이 파란색 배경으로 하이라이트
   → 정보: "Doctor mode: Viewport positions persist across sessions"
3. 원하는 레이아웃 구성
4. "Save" 클릭
   → 구성이 localStorage에 저장
   → 선호도가 localStorage에 저장: 'usmpr-storage-preference' = 'local'
5. 브라우저 닫기
6. 브라우저 재실행 및 USMPR 모드로 이동
   → localStorage에서 구성 로드
   → 브라우저 닫기 전과 동일한 레이아웃

결과:
  - 브라우저 세션 간 레이아웃 유지
  - 매일 동일한 구성을 사용하는 의사에게 유용
```

### 예시 3: 커스텀 4x3D 레이아웃 생성 시도

```
목표: 서로 다른 프리셋으로 4개 위치 모두에 3D 뷰 표시

단계:
1. "Change Layout" 버튼 클릭
2. "Clear" 버튼 클릭
   → 모든 위치가 "Empty"가 됨
   → 모든 뷰 버튼이 사용 가능해짐
3. "3D" 버튼 클릭
4. Position 1 카드 클릭
   → Position 1: 3D
   → "3D" 버튼 비활성화
5. 잠깐... "3D"가 비활성화되어 다른 위치에 할당 불가!

문제:
  - 각 뷰 타입은 한 번만 사용 가능
  - 현재 디자인으로는 4x3D 레이아웃 생성 불가

제한사항:
  - 이것은 현재 구현의 제약사항
  - 각 뷰포트는 고유한 뷰 타입을 가져야 함
  - 유효한 조합: Axial, Coronal, Sagittal, 3D 각 하나씩
```

---

## 기술 구현 세부사항

### React Hooks 사용

**useState** - 상태 관리:
```typescript
const [positions, setPositions] = useState<ViewType[]>([...]);
const [preset3D, setPreset3D] = useState<PresetType>('US 3D 1');
const [storagePersistence, setStoragePersistence] = useState<'session' | 'local'>('session');
const [selectedView, setSelectedView] = useState<ViewType>(null);
```

**useEffect** - 모달 열릴 때 구성 로드:
```typescript
useEffect(() => {
  if (isOpen) {
    // 저장소에서 구성 로드
  }
}, [isOpen, initialLayout]);
```

### 이벤트 핸들러

**버튼 클릭 핸들러**:
- `handleViewButtonClick(viewType)` - 뷰 타입 선택
- `handlePositionClick(positionIndex)` - 위치에 뷰 할당
- `handleClear()` - 모든 위치 초기화
- `handleSave()` - 구성 저장 및 적용

**인라인 이벤트 핸들러** (호버 효과용):
- `onMouseEnter={(e) => { ... }}` - 호버 시 배경색 변경
- `onMouseLeave={(e) => { ... }}` - 배경색 복원

### CSS-in-JS 스타일링

모든 스타일은 `style` prop을 사용하여 인라인:

```typescript
<div
  style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',  // 반투명 오버레이
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,  // 모달이 최상위에 있도록 보장
  }}
  onClick={onClose}  // 외부 클릭 시 닫기
>
  <div
    onClick={e => e.stopPropagation()}  // 내부 클릭 시 닫힘 방지
  >
    {/* 모달 내용 */}
  </div>
</div>
```

### 로깅 전략

디버깅을 위한 광범위한 콘솔 로깅:

```typescript
console.log('📂 LayoutConfigManager.show() called');
console.log('🎯 openLayoutConfigModal command called!');
console.log('🔍 [HP] getLayoutConfig() called');
console.log('💾 Saving layout configuration:', config);
console.log('✅ Viewports refreshed in local object');
```

**이모지 접두사**:
- 📂 파일/폴더 작업
- 🎯 명령 실행
- 🔍 검색/쿼리
- 💾 데이터 저장
- ✅ 성공
- ❌ 오류
- ⚠️ 경고
- 🔄 새로고침/업데이트
- 🎨 렌더링

---

## OHIF 서비스와의 통합

### 1. CommandsManager

**커스텀 컨텍스트 생성**:
```typescript
commandsManager.createContext('USMPR');
```

**커스텀 명령 등록**:
```typescript
commandsManager.registerCommand('USMPR', 'openLayoutConfigModal', {
  commandFn: () => {
    layoutConfigManager.show();
  },
});
```

**툴바에서 명령 실행**:
```typescript
{
  commands: {
    commandName: 'openLayoutConfigModal',
    context: 'USMPR',  // USMPR 컨텍스트 사용
  },
}
```

### 2. HangingProtocolService

**프로토콜 추가/업데이트**:
```typescript
hangingProtocolService.addProtocol(hpUSMPR.id, hpUSMPR);
```

**활성 프로토콜 설정**:
```typescript
hangingProtocolService.setProtocol('@ohif/hpUSMPR', {
  stageIndex: 0
});
```

**프로토콜 구조**:
```typescript
const hpUSMPR: Types.HangingProtocol.Protocol = {
  id: '@ohif/hpUSMPR',
  name: 'USMPR - Multi-Modality MPR Viewer',
  stages: [
    {
      name: 'MPR 2x2',
      viewportStructure: { ... },
      viewports: createViewportsFromConfig(),  // 동적 뷰포트
    },
  ],
};
```

### 3. CornerstoneViewportService

**커스텀 프리셋 적용** (프로토콜 적용 후 호출):
```typescript
if ((window as any).applyCustomUSPreset) {
  const { cornerstoneViewportService } = servicesManager.services;
  (window as any).applyCustomUSPreset(cornerstoneViewportService, presetName);
}
```

---

## 오류 처리

### 검증

**위치 검증** (handleSave 내부):
```typescript
const validPositions = positions.map((pos, idx) => {
  if (pos === null || pos === undefined) {
    const defaults = ['Axial', 'Sagittal', 'Coronal', '3D'];
    console.warn(`⚠️ Position ${idx} is null, using default: ${defaults[idx]}`);
    return defaults[idx];
  }
  return pos;
});
```

**뷰 타입 검증** (createViewportConfig 내부):
```typescript
const validViewTypes = ['Axial', 'Sagittal', 'Coronal', '3D'];
if (!viewType || !validViewTypes.includes(viewType)) {
  console.warn(`⚠️ Invalid viewType "${viewType}", using Axial instead`);
  viewType = 'Axial';
}
```

### 폴백 메커니즘

**저장소 파싱 오류**:
```typescript
try {
  const parsed = JSON.parse(saved);
  // 파싱된 데이터 사용
} catch (e) {
  console.error('❌ Failed to parse saved layout:', e);
  // 손상된 데이터 제거
  localStorage.removeItem('usmpr-layout-config');
  sessionStorage.removeItem('usmpr-layout-config');
  // 기본 구성 사용
}
```

**뷰포트 생성 오류**:
```typescript
try {
  const viewport = createViewportConfig(viewType, index, config.preset3D);
  return viewport;
} catch (e) {
  console.error(`❌ Failed to create viewport ${index}:`, e);
  // Axial 뷰로 폴백
  return createViewportConfig('Axial', index, config.preset3D);
}
```

**최종 폴백** (createViewportsFromConfig 내부):
```typescript
catch (e) {
  console.error('❌ Critical error creating viewports:', e);
  // 기본 2x2 그리드 반환
  const fallbackViewports = ['Axial', 'Sagittal', 'Coronal', '3D'].map(
    (viewType, index) => createViewportConfig(viewType, index, 'US 3D 1')
  );
  return fallbackViewports;
}
```

---

## 성능 고려사항

### 지연된 적용

**프로토콜 업데이트 전 100ms 지연**:
```typescript
setTimeout(() => {
  refreshViewportsFromConfig(hangingProtocolService);
  hangingProtocolService.setProtocol('@ohif/hpUSMPR', { stageIndex: 0 });
}, 100);
```

**이유**: localStorage 쓰기가 완료되고 모달이 완전히 닫힌 후 뷰포트를 업데이트하기 위함.

**프리셋 적용 전 200ms 지연**:
```typescript
setTimeout(() => {
  window.applyCustomUSPreset(cornerstoneViewportService, presetName);
}, 200);
```

**이유**: VTK transfer functions를 적용하기 전에 뷰포트가 완전히 초기화되도록 보장.

### 모달 렌더링

**조건부 렌더링**:
```typescript
if (!isOpen) {
  return null;  // 닫혀 있을 때 렌더링하지 않음
}
```

**이유**: 불필요한 DOM 요소 및 React reconciliation 방지.

### 상태 업데이트

**상태 업데이트 배치** (React가 이벤트 핸들러에서 자동으로 배치):
```typescript
setPositions(newPositions);
setSelectedView(null);
// 두 업데이트가 단일 재렌더링으로 배치됨
```

---

## 문제 해결

### 일반적인 문제

#### 1. 버튼 클릭 시 모달이 열리지 않음

**증상**:
- "Change Layout" 버튼 클릭
- 모달이 나타나지 않음

**가능한 원인**:
- LayoutConfigManager 초기화 안 됨
- USMPR 컨텍스트에 명령이 등록되지 않음
- 컨테이너가 생성되지 않음

**해결방법**:
```typescript
// 콘솔 오류 확인:
console.log('🔍 layoutConfigManager exists?', !!layoutConfigManager);

// 명령 등록 확인:
console.log('✅ openLayoutConfigModal command registered in USMPR context');

// DOM에 컨테이너가 존재하는지 확인:
const container = document.getElementById('usmpr-layout-config-modal');
console.log('Container exists?', !!container);
```

#### 2. 구성이 지속되지 않음

**증상**:
- 구성 저장
- 페이지 새로고침
- 구성이 기본값으로 재설정됨

**가능한 원인**:
- Session Storage 사용 중 (브라우저 닫을 때 초기화)
- 브라우저에서 localStorage 비활성화
- 저장소에 손상된 데이터

**해결방법**:
```typescript
// 저장소 선호도 확인:
const preference = localStorage.getItem('usmpr-storage-preference');
console.log('Storage preference:', preference);

// localStorage 사용 가능 여부 확인:
try {
  localStorage.setItem('test', 'test');
  localStorage.removeItem('test');
  console.log('localStorage is available');
} catch (e) {
  console.error('localStorage is blocked:', e);
}

// 저장된 데이터 확인:
const saved = sessionStorage.getItem('usmpr-layout-config');
console.log('Saved config:', saved);
```

#### 3. 저장 후 뷰포트가 업데이트되지 않음

**증상**:
- 새 구성 저장
- 모달 닫힘
- 뷰포트가 변경되지 않음

**가능한 원인**:
- 모달에 hangingProtocolService가 전달되지 않음
- refreshViewportsFromConfig() 호출 안 됨
- 프로토콜 업데이트 실패

**해결방법**:
```typescript
// servicesManager가 전달되었는지 확인:
console.log('servicesManager:', servicesManager);

// refreshViewportsFromConfig가 호출되었는지 확인:
console.log('🔄 [HP] refreshViewportsFromConfig() called');

// 프로토콜이 재적용되었는지 확인:
console.log('✅ Hanging protocol re-applied successfully');
```

#### 4. 3D 뷰에 커스텀 US 프리셋이 적용되지 않음

**증상**:
- "US 3D 2" 프리셋 선택
- 저장 및 적용
- 3D 뷰가 기본 CT-Bone 프리셋 표시

**가능한 원인**:
- `window.applyCustomUSPreset` 사용 불가
- 지연 시간이 너무 짧음 (뷰포트 준비 안 됨)
- 3D 뷰포트를 찾을 수 없음

**해결방법**:
```typescript
// 함수 존재 여부 확인:
console.log('applyCustomUSPreset available?', !!(window as any).applyCustomUSPreset);

// 3D 뷰포트 존재 여부 확인:
const viewport3D = cornerstoneViewportService.getViewport('mpr-3');  // ID 조정
console.log('3D viewport:', viewport3D);

// 필요시 지연 시간 증가:
setTimeout(() => {
  window.applyCustomUSPreset(cornerstoneViewportService, presetName);
}, 500);  // 200ms에서 500ms로 증가
```

---

## 향후 개선사항

### 계획된 기능

1. **드래그 앤 드롭 위치 할당**
   - 뷰 타입 버튼을 위치 카드로 드래그
   - 호버 효과가 있는 시각적 드롭 영역

2. **레이아웃 프리셋**
   - 여러 커스텀 레이아웃 저장
   - 저장된 레이아웃 간 빠른 전환
   - 프리셋 예시: "Standard MPR", "3D Focus", "Dual Sagittal"

3. **중복 뷰 지원**
   - 여러 위치에 동일한 뷰 타입 허용
   - 서로 다른 슬라이스 위치 비교에 유용
   - 뷰포트 ID 관리 변경 필요

4. **미리보기 모드**
   - 사용자 구성 시 레이아웃의 실시간 미리보기
   - 분할 화면: 현재 레이아웃 대 새 레이아웃
   - "적용 전 시도"

5. **키보드 단축키**
   - 숫자 키(1-4)로 위치 선택
   - 문자 키(a-d)로 뷰 타입 선택
   - Enter로 저장, Escape로 취소

6. **실행 취소/다시 실행**
   - 구성 히스토리 추적
   - 모달에 실행 취소/다시 실행 버튼
   - Ctrl+Z / Ctrl+Y 지원

7. **구성 내보내기/가져오기**
   - 레이아웃을 JSON 파일로 내보내기
   - 파일에서 레이아웃 가져오기
   - 사용자 간 구성 공유

8. **모바일/터치 지원**
   - 터치 친화적인 버튼 크기
   - 탐색을 위한 스와이프 제스처
   - 태블릿용 반응형 레이아웃

---

## 관련 파일

### 전체 파일 경로

```
핵심 파일:
├── modes/usmpr/src/components/LayoutConfigModal.tsx (875줄)
├── modes/usmpr/src/utils/LayoutConfigManager.tsx (103줄)
├── modes/usmpr/src/toolbarButtons.ts (170줄)
├── modes/usmpr/src/index.tsx (명령 등록, lines 1001-1028)
└── extensions/default/src/hangingprotocols/hpUSMPR.ts (구성 로직)
```

---

## 참조

### 외부 의존성
- **React 18**: `useState`, `useEffect` 훅, `createRoot` API
- **TypeScript**: 타입 정의 및 인터페이스

### 내부 OHIF 서비스
- `CommandsManager`: 명령 등록 및 실행
- `HangingProtocolService`: 프로토콜 관리 및 적용
- `CornerstoneViewportService`: 뷰포트 인스턴스 관리
- `ServicesManager`: 중앙 서비스 허브

### 저장소 API
- `localStorage`: 세션 간 지속적 저장소
- `sessionStorage`: 임시 저장소 (브라우저 닫을 때 초기화)

### 커스텀 함수
- `refreshViewportsFromConfig()`: 저장소에서 프로토콜 뷰포트 업데이트
- `window.applyCustomUSPreset()`: 커스텀 VTK transfer functions 적용

---

**문서 버전**: 1.0
**최종 업데이트**: 2024-12-24
**유지관리자**: USMPR 개발 팀
