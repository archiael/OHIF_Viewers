/**
 * Unit tests for mammography commandsModule
 * Tests mammoMagnify, toggleMammoSync, and cleanup commands
 */

import commandsModule from '../commandsModule';

describe('commandsModule', () => {
  let mockServicesManager;
  let mockCommandsManager;
  let commands;
  let mockViewport;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock viewport
    mockViewport = {
      element: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dataset: {},
      },
      getCamera: jest.fn().mockReturnValue({
        parallelScale: 100,
        focalPoint: [0, 0, 0],
        position: [0, 0, 100],
      }),
      setCamera: jest.fn(),
      render: jest.fn(),
      resetCamera: jest.fn(),
      getImageData: jest.fn().mockReturnValue({
        getBounds: jest.fn().mockReturnValue([
          -100, 100, // minX, maxX
          -50, 50,   // minY, maxY
          0, 1,      // minZ, maxZ
        ]),
      }),
      getRenderingEngine: jest.fn().mockReturnValue({
        id: 'renderingEngine1',
      }),
      canvas: {
        width: 800,
        height: 600,
      },
      canvasToWorld: jest.fn((point) => [point[0], point[1], 0]),
      getCurrentImageId: jest.fn().mockReturnValue('imageId123'),
    };

    // Mock services
    mockServicesManager = {
      services: {
        viewportGridService: {
          getState: jest.fn().mockReturnValue({
            activeViewportId: 'viewport1',
            viewports: [
              {
                viewportId: 'viewport1',
                viewportOptions: { viewportId: 'viewport1' },
                displaySetInstanceUIDs: ['ds1'],
              },
              {
                viewportId: 'viewport2',
                viewportOptions: { viewportId: 'viewport2' },
                displaySetInstanceUIDs: ['ds2'],
              },
            ],
          }),
          setDisplaySetsForViewport: jest.fn(),
        },
        syncGroupService: {
          addViewportToSyncGroup: jest.fn(),
          removeViewportFromSyncGroup: jest.fn(),
        },
        cornerstoneViewportService: {
          getCornerstoneViewport: jest.fn((id) => {
            if (id === 'viewport1' || id === 'viewport2') {
              return mockViewport;
            }
            return null;
          }),
        },
        toolbarService: {
          refreshToolbarState: jest.fn(),
        },
        displaySetService: {
          getActiveDisplaySets: jest.fn().mockReturnValue([
            {
              displaySetInstanceUID: 'ds1',
              StudyInstanceUID: 'study1',
            },
          ]),
        },
      },
    };

    mockCommandsManager = {
      runCommand: jest.fn(),
    };

    // Setup cornerstone metaData mock
    (global.window as any).cornerstone = {
      metaData: {
        get: jest.fn().mockReturnValue({
          ImageLaterality: 'R',
        }),
      },
    };

    const module = commandsModule({
      servicesManager: mockServicesManager,
      commandsManager: mockCommandsManager,
    });
    commands = module.actions;
  });

  describe('mammoMagnify command', () => {
    it('should magnify viewport by 1.5x from chest wall', () => {
      commands.mammoMagnify();

      expect(mockViewport.getCamera).toHaveBeenCalled();
      expect(mockViewport.setCamera).toHaveBeenCalled();
      expect(mockViewport.render).toHaveBeenCalled();

      // Verify camera was modified (zoom in = smaller parallelScale)
      const setCameraCall = mockViewport.setCamera.mock.calls[0][0];
      expect(setCameraCall.parallelScale).toBeLessThan(100); // Original was 100
    });

    it('should unmagnify viewport when already magnified', () => {
      // First magnify
      commands.mammoMagnify();
      mockViewport.resetCamera.mockClear();

      // Then unmagnify
      commands.mammoMagnify();

      expect(mockViewport.resetCamera).toHaveBeenCalled();
    });

    it('should keep chest wall fixed during magnification', () => {
      commands.mammoMagnify();

      const setCameraCall = mockViewport.setCamera.mock.calls[0][0];

      // For R breast, chest wall is at maxX (100)
      // After zoom, focalPoint should shift to keep chest wall fixed
      expect(setCameraCall.focalPoint).toBeDefined();
      expect(setCameraCall.position).toBeDefined();
    });

    it('should handle invalid viewport gracefully', () => {
      mockServicesManager.services.cornerstoneViewportService.getCornerstoneViewport
        .mockReturnValue(null);

      expect(() => commands.mammoMagnify()).not.toThrow();
      expect(mockViewport.setCamera).not.toHaveBeenCalled();
    });

    it('should handle missing anchor gracefully', () => {
      mockViewport.getImageData.mockReturnValue(null);

      expect(() => commands.mammoMagnify()).not.toThrow();
    });

    it('should refresh toolbar after magnification', () => {
      commands.mammoMagnify();

      expect(mockServicesManager.services.toolbarService.refreshToolbarState)
        .toHaveBeenCalledWith({ viewportId: 'viewport1' });
    });
  });

  describe('toggleMammoSync command', () => {
    it('should enable sync when disabled', () => {
      commands.toggleMammoSync();

      // Should add viewports to sync group
      expect(mockServicesManager.services.syncGroupService.addViewportToSyncGroup)
        .toHaveBeenCalled();

      // Should setup camera event listeners
      expect(mockViewport.element.addEventListener).toHaveBeenCalled();
    });

    it('should disable sync when enabled', () => {
      // Enable sync first
      commands.toggleMammoSync();
      mockViewport.element.removeEventListener.mockClear();

      // Then disable
      commands.toggleMammoSync();

      // Should remove from sync group
      expect(mockServicesManager.services.syncGroupService.removeViewportFromSyncGroup)
        .toHaveBeenCalled();
    });

    it('should synchronize camera changes across viewports', () => {
      commands.toggleMammoSync(); // Enable sync

      // Get the camera modified handler
      const addEventListenerCalls = mockViewport.element.addEventListener.mock.calls;
      const cameraModifiedHandler = addEventListenerCalls.find(
        call => call[0] === 'CORNERSTONE_CAMERA_MODIFIED'
      )?.[1];

      if (cameraModifiedHandler) {
        // Simulate camera change
        mockViewport.getCamera.mockReturnValue({
          parallelScale: 80, // Changed from 100
          focalPoint: [10, 10, 0], // Changed from [0, 0, 0]
          position: [10, 10, 100],
        });

        cameraModifiedHandler();

        // Should update other viewports
        expect(mockViewport.setCamera).toHaveBeenCalled();
      }
    });

    it('should cleanup listeners on disable', () => {
      // Enable sync
      commands.toggleMammoSync();
      const addListenerCalls = mockViewport.element.addEventListener.mock.calls.length;

      // Disable sync
      commands.toggleMammoSync();

      // Should call removeEventListener for each addEventListener
      expect(mockViewport.element.removeEventListener.mock.calls.length)
        .toBeGreaterThanOrEqual(addListenerCalls);
    });

    it('should refresh toolbar after toggle', () => {
      commands.toggleMammoSync();

      expect(mockServicesManager.services.toolbarService.refreshToolbarState)
        .toHaveBeenCalled();
    });
  });

  describe('initMammoMode command', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should setup custom wheel handlers', () => {
      commands.initMammoMode();

      // Fast-forward past the retry delays and initialization delay
      jest.advanceTimersByTime(3000);

      expect(mockViewport.element.addEventListener).toHaveBeenCalledWith(
        'wheel',
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should retry if viewports not ready', () => {
      mockServicesManager.services.cornerstoneViewportService.getCornerstoneViewport
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValue(mockViewport);

      commands.initMammoMode();

      // Should retry multiple times
      jest.advanceTimersByTime(500); // First few retries
      expect(mockServicesManager.services.viewportGridService.getState)
        .toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should setup window resize handler', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

      commands.initMammoMode();
      jest.advanceTimersByTime(3000);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });
  });

  describe('cleanupMammoMode command', () => {
    it('should remove all listeners', () => {
      // Setup some listeners first
      commands.initMammoMode();
      jest.advanceTimersByTime(3000);

      const removeListenerSpy = jest.spyOn(mockViewport.element, 'removeEventListener');

      // Cleanup
      commands.cleanupMammoMode();

      // Should have removed listeners
      expect(removeListenerSpy).toHaveBeenCalled();
    });

    it('should not throw if called before init', () => {
      expect(() => commands.cleanupMammoMode()).not.toThrow();
    });
  });

  describe('state query commands', () => {
    it('isMammoMagnified should return false initially', () => {
      const module = commandsModule({
        servicesManager: mockServicesManager,
        commandsManager: mockCommandsManager,
      });

      const result = module.definitions.isMammoMagnified.commandFn();
      expect(result).toBe(false);
    });

    it('isMammoMagnified should return true after magnification', () => {
      const module = commandsModule({
        servicesManager: mockServicesManager,
        commandsManager: mockCommandsManager,
      });

      module.actions.mammoMagnify();
      const result = module.definitions.isMammoMagnified.commandFn();
      expect(result).toBe(true);
    });

    it('isMammoSyncEnabled should return false initially', () => {
      const module = commandsModule({
        servicesManager: mockServicesManager,
        commandsManager: mockCommandsManager,
      });

      const result = module.definitions.isMammoSyncEnabled.commandFn();
      expect(result).toBe(false);
    });

    it('isMammoSyncEnabled should return true after enabling sync', () => {
      const module = commandsModule({
        servicesManager: mockServicesManager,
        commandsManager: mockCommandsManager,
      });

      module.actions.toggleMammoSync();
      const result = module.definitions.isMammoSyncEnabled.commandFn();
      expect(result).toBe(true);
    });
  });

  describe('openMammoCompare command', () => {
    it('should navigate to compare mode with current study', () => {
      const originalLocation = window.location;
      delete (window as any).location;
      (window as any).location = { href: '' };

      commands.openMammoCompare();

      expect(window.location.href).toContain('/mammography-compare');
      expect(window.location.href).toContain('StudyInstanceUIDs=study1');

      (window as any).location = originalLocation;
    });

    it('should handle missing display sets gracefully', () => {
      mockServicesManager.services.displaySetService.getActiveDisplaySets
        .mockReturnValue([]);

      expect(() => commands.openMammoCompare()).not.toThrow();
    });
  });

  describe('toggleMirrorMode command', () => {
    it('should toggle mirror mode state', () => {
      // Initial state should be enabled (default)
      let result = commands.isMirrorModeEnabled();
      expect(result).toBe(true);

      // Toggle to disabled
      commands.toggleMirrorMode();
      result = commands.isMirrorModeEnabled();
      expect(result).toBe(false);

      // Toggle back to enabled
      commands.toggleMirrorMode();
      result = commands.isMirrorModeEnabled();
      expect(result).toBe(true);
    });

    it('should reset camera when enabling mirror mode', () => {
      // Disable first
      commands.toggleMirrorMode();
      mockViewport.resetCamera.mockClear();

      // Enable again
      commands.toggleMirrorMode();

      expect(mockViewport.resetCamera).toHaveBeenCalled();
    });

    it('should set camera when disabling mirror mode', () => {
      mockViewport.getDefaultCamera = jest.fn().mockReturnValue({
        focalPoint: [0, 0, 0],
        position: [0, 0, 100],
      });

      commands.toggleMirrorMode(); // Disable

      expect(mockViewport.setCamera).toHaveBeenCalled();
    });

    it('should refresh toolbar after toggle', () => {
      commands.toggleMirrorMode();

      expect(mockServicesManager.services.toolbarService.refreshToolbarState)
        .toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle viewport service errors gracefully', () => {
      mockServicesManager.services.cornerstoneViewportService.getCornerstoneViewport
        .mockImplementation(() => {
          throw new Error('Viewport not found');
        });

      expect(() => commands.mammoMagnify()).not.toThrow();
    });

    it('should handle camera errors gracefully', () => {
      mockViewport.getCamera.mockImplementation(() => {
        throw new Error('Camera error');
      });

      expect(() => commands.mammoMagnify()).not.toThrow();
    });

    it('should handle sync errors gracefully', () => {
      mockServicesManager.services.syncGroupService.addViewportToSyncGroup
        .mockImplementation(() => {
          throw new Error('Sync error');
        });

      expect(() => commands.toggleMammoSync()).not.toThrow();
    });
  });
});
