/**
 * Unit tests for Mammography Mode Commands Module
 *
 * @description
 * Tests command implementations for:
 * - FR-2.5.5: Mirror Mode Toggle
 * - FR-3.3.8: Prior Study Auto-Selection (openMammoCompare)
 */

import commandsModule, {
  detectViewportLaterality,
  detectViewportViewPosition,
} from '../commandsModule';
import { useMammographyStore } from '../store';

// Mock @ohif/core
jest.mock('@ohif/core', () => ({
  DicomMetadataStore: {
    getStudy: jest.fn(),
    getStudies: jest.fn(),
  },
  SeriesLateralityManager: {
    detectLaterality: jest.fn((displaySet) => {
      // Simulate DICOM metadata-based laterality detection
      if (displaySet?.ImageLaterality) return displaySet.ImageLaterality as 'R' | 'L';
      if (displaySet?.Laterality) return displaySet.Laterality as 'R' | 'L';
      const desc = String(displaySet?.SeriesDescription || '').toUpperCase();
      if (desc.includes('RCC') || desc.includes('RMLO')) return 'R';
      if (desc.includes('LCC') || desc.includes('LMLO')) return 'L';
      return null;
    }),
  },
}));

// Import after mock
import { DicomMetadataStore } from '@ohif/core';

// Mock window.location.href
delete (window as any).location;
window.location = { href: '' } as any;

describe('Mammography Commands Module', () => {
  let servicesManager: any;
  let commandsManager: any;
  let commands: any;

  beforeEach(() => {
    // Reset store to initial state
    useMammographyStore.setState({ isMirrorModeEnabled: true });

    // Mock services
    servicesManager = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            // mammography viewport ID 패턴 (rcc↔lcc, rmlo↔lmlo) 사용
            // getOppositeViewportId('mammo-rcc') → 'mammo-lcc' 가 되어야 mirror sync 동작
            activeViewportId: 'mammo-rcc',
            viewports: [
              {
                viewportId: 'mammo-rcc',
                displaySetInstanceUIDs: ['ds-1'],
              },
              {
                viewportId: 'mammo-lcc',
                displaySetInstanceUIDs: ['ds-2'],
              },
            ],
          })),
        },
        cornerstoneViewportService: {
          getCornerstoneViewport: jest.fn((viewportId) => ({
            setDisplayArea: jest.fn(),
            render: jest.fn(),
            // Mirror sync에 필요한 pan/camera API mock
            getPan: jest.fn(() => [50, 10]),
            getCamera: jest.fn(() => ({ parallelScale: 1.5, focalPoint: [0, 0, 0] })),
            setPan: jest.fn(),
            setCamera: jest.fn(),
          })),
        },
        displaySetService: {
          getActiveDisplaySets: jest.fn(() => [
            {
              StudyInstanceUID: 'study-123',
              SeriesDescription: 'RCC',
            },
          ]),
          getDisplaySetByUID: jest.fn((uid) => ({
            StudyInstanceUID: 'study-123',
            SeriesDescription: 'RCC',
          })),
        },
        toolbarService: {
          refreshToolbarState: jest.fn(),
        },
        uiNotificationService: {
          show: jest.fn(),
        },
      },
    };

    commandsManager = {};

    // Get command module
    const module = commandsModule({ servicesManager, commandsManager });
    commands = module.actions;

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('toggleMirrorMode', () => {
    it('should toggle Mirror Mode state from ON to OFF', () => {
      // Initial state: ON
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);

      // Execute command
      commands.toggleMirrorMode();

      // State should be toggled to OFF
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(false);
    });

    it('should toggle Mirror Mode state from OFF to ON', () => {
      // Set initial state to OFF
      useMammographyStore.setState({ isMirrorModeEnabled: false });

      // Execute command
      commands.toggleMirrorMode();

      // State should be toggled to ON
      expect(useMammographyStore.getState().isMirrorModeEnabled).toBe(true);
    });

    it('should call viewport services to apply Mirror Mode', () => {
      // Initial state: ON → toggle to OFF (no mirror sync on OFF)
      commands.toggleMirrorMode();

      // Should always query viewport grid state
      expect(servicesManager.services.viewportGridService.getState).toHaveBeenCalled();
    });

    it('should sync mirror pan/zoom when toggling Mirror Mode ON', () => {
      // Start with Mirror Mode OFF
      useMammographyStore.setState({ isMirrorModeEnabled: false });

      // Toggle to ON
      commands.toggleMirrorMode();

      // Mirror Mode ON: active viewport(mammo-rcc) + opposite(mammo-lcc) should both be fetched
      expect(servicesManager.services.cornerstoneViewportService.getCornerstoneViewport).toHaveBeenCalledWith(
        'mammo-rcc'
      );
      expect(servicesManager.services.cornerstoneViewportService.getCornerstoneViewport).toHaveBeenCalledWith(
        'mammo-lcc'
      );
    });

    it('should refresh toolbar after toggling', () => {
      commands.toggleMirrorMode();

      expect(servicesManager.services.toolbarService.refreshToolbarState).toHaveBeenCalledWith({
        viewportId: 'mammo-rcc',
      });
    });

    it('should show notification after toggling Mirror Mode ON', () => {
      // Set to OFF first
      useMammographyStore.setState({ isMirrorModeEnabled: false });

      // Toggle to ON
      commands.toggleMirrorMode();

      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Mirror Mode',
          type: expect.any(String),
        })
      );
    });
  });

  describe('isMirrorModeEnabled', () => {
    it('should return true when Mirror Mode is ON', () => {
      useMammographyStore.setState({ isMirrorModeEnabled: true });

      const result = commands.isMirrorModeEnabled();

      expect(result).toBe(true);
    });

    it('should return false when Mirror Mode is OFF', () => {
      useMammographyStore.setState({ isMirrorModeEnabled: false });

      const result = commands.isMirrorModeEnabled();

      expect(result).toBe(false);
    });

    it('should reflect real-time state changes', () => {
      useMammographyStore.setState({ isMirrorModeEnabled: true });
      expect(commands.isMirrorModeEnabled()).toBe(true);

      useMammographyStore.setState({ isMirrorModeEnabled: false });
      expect(commands.isMirrorModeEnabled()).toBe(false);

      useMammographyStore.setState({ isMirrorModeEnabled: true });
      expect(commands.isMirrorModeEnabled()).toBe(true);
    });
  });

  describe('openMammoCompare - FR-3.3.8: Prior Study Auto-Selection', () => {
    beforeEach(() => {
      // Reset window.location.href
      window.location.href = '';
      window.location.search = '';
    });

    it('should navigate to compare mode with current study when no active displaySets', () => {
      servicesManager.services.displaySetService.getActiveDisplaySets.mockReturnValue([]);

      commands.openMammoCompare();

      // Should not navigate (early return on error)
      expect(window.location.href).toBe('');
    });

    it('should navigate to compare mode with current study only when metadata not found', () => {
      (DicomMetadataStore.getStudy as jest.Mock).mockReturnValue(null);

      commands.openMammoCompare();

      // Should navigate with current study only
      expect(window.location.href).toContain('/mammography-compare');
      expect(window.location.href).toContain('StudyInstanceUIDs=study-123');
    });

    it('should find and load prior study when available (FR-3.3.8)', () => {
      // Mock current study metadata
      (DicomMetadataStore.getStudy as jest.Mock).mockReturnValue({
        StudyInstanceUID: 'study-current',
        PatientID: 'patient-001',
        StudyDate: '20250201',
      });

      // Mock all studies including prior
      (DicomMetadataStore.getStudies as jest.Mock).mockReturnValue([
        {
          StudyInstanceUID: 'study-current',
          PatientID: 'patient-001',
          StudyDate: '20250201',
          ModalitiesInStudy: ['MG'],
        },
        {
          StudyInstanceUID: 'study-prior-recent',
          PatientID: 'patient-001',
          StudyDate: '20240101', // Prior study (older)
          ModalitiesInStudy: ['MG'],
        },
        {
          StudyInstanceUID: 'study-prior-old',
          PatientID: 'patient-001',
          StudyDate: '20230101', // Older prior study
          ModalitiesInStudy: ['MG'],
        },
        {
          StudyInstanceUID: 'study-different-patient',
          PatientID: 'patient-002', // Different patient - should be filtered out
          StudyDate: '20240601',
          ModalitiesInStudy: ['MG'],
        },
        {
          StudyInstanceUID: 'study-different-modality',
          PatientID: 'patient-001',
          StudyDate: '20240301',
          ModalitiesInStudy: ['CT'], // Different modality - should be filtered out
        },
      ]);

      commands.openMammoCompare();

      // Should navigate with both current and most recent prior study
      expect(window.location.href).toContain('/mammography-compare');
      expect(window.location.href).toContain('study-123'); // Current
      expect(window.location.href).toContain('study-prior-recent'); // Most recent prior
      expect(window.location.href).not.toContain('study-prior-old'); // Older prior should not be included
      expect(window.location.href).not.toContain('study-different-patient');
      expect(window.location.href).not.toContain('study-different-modality');

      // Should show success notification
      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Compare Mode',
          message: expect.stringContaining('20240101'), // Prior study date
          type: 'info',
        })
      );
    });

    it('should navigate with current study only when no prior study found', () => {
      (DicomMetadataStore.getStudy as jest.Mock).mockReturnValue({
        StudyInstanceUID: 'study-current',
        PatientID: 'patient-001',
        StudyDate: '20250201',
      });

      // Mock only current study (no prior)
      (DicomMetadataStore.getStudies as jest.Mock).mockReturnValue([
        {
          StudyInstanceUID: 'study-current',
          PatientID: 'patient-001',
          StudyDate: '20250201',
          ModalitiesInStudy: ['MG'],
        },
      ]);

      commands.openMammoCompare();

      // Should navigate with current study only
      expect(window.location.href).toContain('/mammography-compare');
      expect(window.location.href).toContain('study-123');
      expect(window.location.href).not.toContain(','); // No prior study in URL

      // Should show warning notification
      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Compare Mode',
          message: expect.stringContaining('No prior'),
          type: 'warning',
        })
      );
    });

    it('should handle errors gracefully and fallback to current study only', () => {
      (DicomMetadataStore.getStudy as jest.Mock).mockImplementation(() => {
        throw new Error('Metadata store error');
      });

      commands.openMammoCompare();

      // Should navigate with current study only (fallback)
      expect(window.location.href).toContain('/mammography-compare');
      expect(window.location.href).toContain('study-123');

      // Should show warning notification
      expect(servicesManager.services.uiNotificationService.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Compare Mode',
          message: expect.stringContaining('Could not search'),
          type: 'warning',
        })
      );
    });

    it('should preserve datasources query parameter', () => {
      (DicomMetadataStore.getStudy as jest.Mock).mockReturnValue({
        StudyInstanceUID: 'study-current',
        PatientID: 'patient-001',
        StudyDate: '20250201',
      });

      (DicomMetadataStore.getStudies as jest.Mock).mockReturnValue([
        {
          StudyInstanceUID: 'study-current',
          PatientID: 'patient-001',
          StudyDate: '20250201',
          ModalitiesInStudy: ['MG'],
        },
      ]);

      // Set datasources query parameter
      window.location.search = '?datasources=dicomweb';

      commands.openMammoCompare();

      // Should preserve datasources parameter
      expect(window.location.href).toContain('datasources=dicomweb');
    });
  });

  describe('command registration', () => {
    it('should export all required commands', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.actions).toHaveProperty('toggleMirrorMode');
      expect(module.actions).toHaveProperty('isMirrorModeEnabled');
      expect(module.actions).toHaveProperty('openMammoCompare');
    });

    it('should export command definitions', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.definitions).toHaveProperty('toggleMirrorMode');
      expect(module.definitions).toHaveProperty('isMirrorModeEnabled');
      expect(module.definitions).toHaveProperty('openMammoCompare');
    });

    it('should have correct command function references', () => {
      const module = commandsModule({ servicesManager, commandsManager });

      expect(module.definitions.toggleMirrorMode.commandFn).toBe(module.actions.toggleMirrorMode);
      expect(module.definitions.isMirrorModeEnabled.commandFn).toBe(
        module.actions.isMirrorModeEnabled
      );
      expect(module.definitions.openMammoCompare.commandFn).toBe(module.actions.openMammoCompare);
    });
  });
});

/**
 * detectViewportLaterality 유닛 테스트
 *
 * @description
 * DICOM 메타데이터 기반 viewport laterality 감지 함수 테스트.
 * SeriesLateralityManager.detectLaterality()를 사용하여 displaySet에서
 * 'R' | 'L' | null을 반환합니다.
 *
 * [C-8 FIX] CAMERA_MODIFIED 핸들러가 viewport ID 패턴 대신 메타데이터 캐시를 사용하도록
 * VIEWPORT_DATA_CHANGED 시 이 함수로 laterality를 감지합니다.
 */
describe('detectViewportLaterality', () => {
  /**
   * Helper: servicesManager mock 생성
   *
   * @param viewportId - 조회할 viewport ID
   * @param displaySet - mock displaySet 데이터 (DICOM 메타데이터)
   */
  function createServicesManager(viewportId: string, displaySet: any | null) {
    return {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: [
              {
                viewportId,
                displaySetInstanceUIDs: displaySet ? ['ds-1'] : [],
              },
            ],
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => displaySet),
        },
      },
    };
  }

  it('should return R for right breast series with ImageLaterality=R', () => {
    // ImageLaterality is highest priority in SeriesLateralityManager
    const displaySet = { ImageLaterality: 'R', SeriesDescription: 'RCC' };
    const sm = createServicesManager('mammo-rcc', displaySet);

    const result = detectViewportLaterality('mammo-rcc', sm);

    expect(result).toBe('R');
  });

  it('should return L for left breast series with ImageLaterality=L', () => {
    const displaySet = { ImageLaterality: 'L', SeriesDescription: 'LCC' };
    const sm = createServicesManager('mammo-lcc', displaySet);

    const result = detectViewportLaterality('mammo-lcc', sm);

    expect(result).toBe('L');
  });

  it('should return R using Laterality tag when ImageLaterality is missing', () => {
    // Priority 2: Laterality tag
    const displaySet = { Laterality: 'R', SeriesDescription: 'Mammogram' };
    const sm = createServicesManager('mammo-rcc', displaySet);

    const result = detectViewportLaterality('mammo-rcc', sm);

    expect(result).toBe('R');
  });

  it('should return R using SeriesDescription when DICOM laterality tags missing', () => {
    // Priority 3: SeriesDescription pattern matching (RCC → R)
    const displaySet = { SeriesDescription: 'RCC' };
    const sm = createServicesManager('mammo-rcc', displaySet);

    const result = detectViewportLaterality('mammo-rcc', sm);

    expect(result).toBe('R');
  });

  it('should return L using SeriesDescription when DICOM laterality tags missing', () => {
    const displaySet = { SeriesDescription: 'LCC' };
    const sm = createServicesManager('mammo-lcc', displaySet);

    const result = detectViewportLaterality('mammo-lcc', sm);

    expect(result).toBe('L');
  });

  it('should return null when laterality is unknown (no DICOM tags, unknown description)', () => {
    // No laterality metadata → SeriesLateralityManager returns null
    const displaySet = { SeriesDescription: 'Mammogram Screen' };
    const sm = createServicesManager('mammo-screen', displaySet);

    const result = detectViewportLaterality('mammo-screen', sm);

    // unknown description with no laterality tag → null
    expect(result).toBeNull();
  });

  it('should return null when viewport not found in viewportGridService', () => {
    // viewport ID does not match any viewport in the grid
    const sm = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: [
              { viewportId: 'other-viewport', displaySetInstanceUIDs: ['ds-1'] },
            ],
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => null),
        },
      },
    };

    const result = detectViewportLaterality('non-existent-viewport', sm);

    expect(result).toBeNull();
  });

  it('should return null when displaySetInstanceUIDs is empty', () => {
    const sm = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: [
              { viewportId: 'mammo-rcc', displaySetInstanceUIDs: [] },
            ],
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => null),
        },
      },
    };

    const result = detectViewportLaterality('mammo-rcc', sm);

    expect(result).toBeNull();
  });

  it('should return null when displaySet is not found', () => {
    const sm = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: [
              { viewportId: 'mammo-rcc', displaySetInstanceUIDs: ['non-existent'] },
            ],
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => null), // displaySet not found
        },
      },
    };

    const result = detectViewportLaterality('mammo-rcc', sm);

    expect(result).toBeNull();
  });

  it('should return null on service error (graceful failure)', () => {
    const sm = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => {
            throw new Error('Service unavailable');
          }),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(),
        },
      },
    };

    // Should not throw; returns null on error
    expect(() => detectViewportLaterality('mammo-rcc', sm)).not.toThrow();
    const result = detectViewportLaterality('mammo-rcc', sm);
    expect(result).toBeNull();
  });

  it('should handle Map-type viewports correctly', () => {
    // viewportGridService can return viewports as Map, Array, or Object
    const displaySet = { ImageLaterality: 'L' };
    const sm = {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: new Map([
              ['mammo-lcc', { viewportId: 'mammo-lcc', displaySetInstanceUIDs: ['ds-1'] }],
            ]),
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => displaySet),
        },
      },
    };

    const result = detectViewportLaterality('mammo-lcc', sm);

    expect(result).toBe('L');
  });
});

/**
 * detectViewportViewPosition — CC 판별 정규식 테스트
 *
 * @description
 * [BUG FIX] desc.includes('CC') → /\b(?:[RL]\s*)?CC\b/ 정규식 교체.
 * "RACCOON", "ACCESSION" 같이 CC가 포함된 단어에서 false positive 방지.
 *
 * Priority 3 (SeriesDescription) 경로를 통해서만 테스트 가능:
 *   - Priority 1: ViewPosition 태그 없음
 *   - Priority 2: ViewCode/ViewCodeSequence 없음
 *   - Priority 3: SeriesDescription 키워드 판별 ← 테스트 대상
 */
describe('detectViewportViewPosition — CC regex false positive prevention', () => {
  /**
   * Helper: servicesManager mock 생성
   * ViewPosition, ViewCode 없이 SeriesDescription만 있는 displaySet 설정
   */
  function createSMWithDesc(viewportId: string, seriesDescription: string) {
    const displaySet = {
      // Priority 1, 2가 없는 상태로 Priority 3(SeriesDescription)만 활성화
      SeriesDescription: seriesDescription,
      instances: [{ SeriesDescription: seriesDescription }],
    };
    return {
      services: {
        viewportGridService: {
          getState: jest.fn(() => ({
            viewports: [
              {
                viewportId,
                displaySetInstanceUIDs: ['ds-1'],
              },
            ],
          })),
        },
        displaySetService: {
          getDisplaySetByUID: jest.fn(() => displaySet),
        },
      },
    };
  }

  // ── CC true positive (정상 검출) ──────────────────────────────────────

  it('should detect CC from plain "CC" description', () => {
    const sm = createSMWithDesc('mammo-rcc', 'CC');
    expect(detectViewportViewPosition('mammo-rcc', sm)).toBe('CC');
  });

  it('should detect CC from "RCC" description', () => {
    const sm = createSMWithDesc('mammo-rcc', 'RCC');
    expect(detectViewportViewPosition('mammo-rcc', sm)).toBe('CC');
  });

  it('should detect CC from "LCC" description', () => {
    const sm = createSMWithDesc('mammo-lcc', 'LCC');
    expect(detectViewportViewPosition('mammo-lcc', sm)).toBe('CC');
  });

  it('should detect CC from "CC VIEW" description', () => {
    const sm = createSMWithDesc('mammo-rcc', 'CC VIEW');
    expect(detectViewportViewPosition('mammo-rcc', sm)).toBe('CC');
  });

  it('should detect CC from "R CC" description (with space)', () => {
    const sm = createSMWithDesc('mammo-rcc', 'R CC');
    expect(detectViewportViewPosition('mammo-rcc', sm)).toBe('CC');
  });

  it('should detect CC from "L CC MAMMOGRAM" description', () => {
    const sm = createSMWithDesc('mammo-lcc', 'L CC MAMMOGRAM');
    expect(detectViewportViewPosition('mammo-lcc', sm)).toBe('CC');
  });

  // ── CC false positive (이전 includes 방식의 버그 케이스) ──────────────

  it('should NOT return CC for "RACCOON STUDY" (classic false positive)', () => {
    const sm = createSMWithDesc('mammo-rcc', 'RACCOON STUDY');
    // "RACCOON"에 CC가 포함되지만 단어 경계가 없음 → null 또는 다른 값
    const result = detectViewportViewPosition('mammo-rcc', sm);
    expect(result).not.toBe('CC');
  });

  it('should NOT return CC for "ACCESSION" description', () => {
    const sm = createSMWithDesc('mammo-rcc', 'ACCESSION');
    const result = detectViewportViewPosition('mammo-rcc', sm);
    expect(result).not.toBe('CC');
  });

  it('should NOT return CC for "ACCESS CHECK" description', () => {
    const sm = createSMWithDesc('mammo-rcc', 'ACCESS CHECK');
    const result = detectViewportViewPosition('mammo-rcc', sm);
    expect(result).not.toBe('CC');
  });

  it('should NOT return CC for "PMCC" (no word boundary before CC)', () => {
    // "PMCC" → \b before P (ok), but then M-C-C has no boundary between M and C
    const sm = createSMWithDesc('mammo-rcc', 'PMCC SCREEN');
    const result = detectViewportViewPosition('mammo-rcc', sm);
    expect(result).not.toBe('CC');
  });

  // ── MLO 정상 동작 확인 ────────────────────────────────────────────────

  it('should still detect MLO from "MLO" description', () => {
    const sm = createSMWithDesc('mammo-rmlo', 'MLO');
    expect(detectViewportViewPosition('mammo-rmlo', sm)).toBe('MLO');
  });

  it('should still detect MLO from "RMLO" description', () => {
    const sm = createSMWithDesc('mammo-rmlo', 'RMLO');
    expect(detectViewportViewPosition('mammo-rmlo', sm)).toBe('MLO');
  });

  it('should still detect MLO from "LMLO VIEW" description', () => {
    const sm = createSMWithDesc('mammo-lmlo', 'LMLO VIEW');
    expect(detectViewportViewPosition('mammo-lmlo', sm)).toBe('MLO');
  });

  it('should still detect MLO from "L MLO MAMMOGRAM" description (with space)', () => {
    const sm = createSMWithDesc('mammo-lmlo', 'L MLO MAMMOGRAM');
    expect(detectViewportViewPosition('mammo-lmlo', sm)).toBe('MLO');
  });

  // ── MLO false positive (includes 방식 버그 케이스) — regex로 방지 ──────

  it('should NOT return MLO for "MLOCATH" (MLO prefix in longer word)', () => {
    // 구 desc.includes('MLO') → 'MLO' 오분류. 정규식은 단어 경계 요구.
    const sm = createSMWithDesc('mammo-rmlo', 'MLOCATH STUDY');
    const result = detectViewportViewPosition('mammo-rmlo', sm);
    expect(result).not.toBe('MLO');
  });

  // ── CC와 MLO가 함께 있을 때 우선순위 명확화 ──────────────────────────

  it('should return CC (not MLO) for "MLO CC SUPPLEMENTAL" — CC check runs first', () => {
    // 코드에서 CC를 먼저 체크: /\bCC\b/ → 'CC' 반환 (MLO 체크 미도달)
    // "MLO CC SUPPLEMENTAL"은 드문 케이스지만 CC가 독립 단어로 있으면 CC 우선
    const sm = createSMWithDesc('mammo-rmlo', 'MLO CC SUPPLEMENTAL');
    const result = detectViewportViewPosition('mammo-rmlo', sm);
    expect(result).toBe('CC');  // CC 먼저 검사되므로 CC 반환
  });
});
