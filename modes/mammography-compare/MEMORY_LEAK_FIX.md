# Memory Leak Fix: FR-3.3.9 Compare Sync Toggle

## Problem
**CRITICAL Memory Leak**: Event listeners accumulate when users rapidly toggle the Compare Sync feature ON/OFF. Old listeners are not cleaned up before adding new ones, causing:
- Performance degradation over time
- Memory consumption growth
- Potential browser crashes in long sessions

## Root Cause
In `commandsModule.ts` line 917-1025, the `toggleCompareSync` command adds camera sync event listeners when enabling sync, but does NOT clean up existing listeners before adding new ones. This means:

1. User toggles sync ON → 2 listeners added per viewport pair
2. User toggles sync OFF → listeners removed ✓
3. User toggles sync ON again → **2 MORE listeners added** (4 total)
4. Repeat → listeners keep accumulating

Additionally, there was no cleanup on mode exit, so listeners persisted even after leaving the compare mode.

## Solution

### Fix 1: Clean up existing listeners before adding new ones (Lines 921-930)
```typescript
// CRITICAL FIX: Clean up any existing listeners first to prevent memory leak
console.log(`  🧹 Cleaning up ${compareSyncUnsubscribes.length} existing listeners before adding new ones`);
compareSyncUnsubscribes.forEach(unsub => {
  try {
    unsub();
  } catch (error) {
    console.warn('  ⚠️ [Compare Sync] Error during cleanup:', error);
  }
});
compareSyncUnsubscribes = []; // Clear array
```

### Fix 2: Add try-catch to cleanup functions (Lines 1009-1022)
```typescript
compareSyncUnsubscribes.push(() => {
  // Use try-catch to prevent errors during cleanup
  try {
    currentViewport.element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handleCurrentCameraModified);
  } catch (e) {
    console.warn('  ⚠️ Cleanup error (current):', e);
  }

  try {
    priorViewport.element.removeEventListener(Enums.Events.CAMERA_MODIFIED, handlePriorCameraModified);
  } catch (e) {
    console.warn('  ⚠️ Cleanup error (prior):', e);
  }
});
```

### Fix 3: Add cleanup function export (Lines 71-81 & 1339)
```typescript
// In commandsModule.ts
const cleanupCompareSyncListeners = () => {
  console.log(`🧹 [Compare Sync] Cleaning up ${compareSyncUnsubscribes.length} listeners`);
  compareSyncUnsubscribes.forEach(unsub => {
    try {
      unsub();
    } catch (error) {
      console.warn('  ⚠️ [Compare Sync] Cleanup error:', error);
    }
  });
  compareSyncUnsubscribes = [];
  isCompareSyncEnabled = false;
};

// Export for mode exit
return {
  actions,
  definitions,
  cleanupCompareSyncListeners,
};
```

### Fix 4: Mode exit cleanup (index.tsx Lines 183-186 & 357-365)
```typescript
// Store cleanup function reference in onModeEnter
const mammoCommands = commandsModule({ servicesManager, commandsManager });
this._compareSyncCleanup = mammoCommands.cleanupCompareSyncListeners;

// Call cleanup in onModeExit
export function onModeExit({ servicesManager, commandsManager }: withAppTypes) {
  // ... existing code ...

  // CRITICAL FIX: Clean up compare sync listeners on mode exit
  console.log('🧹 [Compare Sync] Cleaning up listeners on mode exit');
  if (this._compareSyncCleanup) {
    try {
      this._compareSyncCleanup();
      console.log('  ✅ Compare sync listeners cleaned up successfully');
    } catch (error) {
      console.warn('  ⚠️ [Compare Sync] Cleanup error on mode exit:', error);
    }
  }

  // ... existing cleanup code ...
}
```

## Testing Recommendations

### Test Case 1: Rapid Toggle
1. Open mammography-compare mode with current + prior studies
2. Click "Compare Sync" button 10 times rapidly (ON → OFF → ON → OFF...)
3. Open browser DevTools → Memory tab
4. Take heap snapshot
5. **Expected**: No accumulation of event listeners
6. **Verify**: Console logs show cleanup messages

### Test Case 2: Mode Exit Cleanup
1. Open mammography-compare mode
2. Enable Compare Sync (ON)
3. Navigate to another mode (e.g., click "Exit Compare")
4. Check console logs
5. **Expected**: "🧹 [Compare Sync] Cleaning up listeners on mode exit"
6. **Verify**: No lingering event listeners in memory

### Test Case 3: Long Session
1. Open mammography-compare mode
2. Toggle Compare Sync ON/OFF 50 times over 10 minutes
3. Pan/zoom viewports between toggles
4. Monitor browser memory usage
5. **Expected**: Memory remains stable (no continuous growth)

## Files Modified
- `modes/mammography-compare/src/commandsModule.ts` (Lines 71-81, 921-930, 1009-1022, 1339)
- `modes/mammography-compare/src/index.tsx` (Lines 183-186, 357-365)

## Priority
**CRITICAL** - Memory leaks cause performance degradation and browser crashes in production environments.

## Related Issues
- FR-3.3.9: Compare Sync Toggle

## Date
2026-02-11
