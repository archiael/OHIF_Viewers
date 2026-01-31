# Series Loading Fixes - 2026-01-31

## Issues Fixed

### Issue 1: ❌ LEFT Series Loading First (Should be RIGHT)

**Problem**: When study has both RIGHT and LEFT breast series, LEFT was loading first instead of RIGHT.

**Root Cause**: Hanging protocol had no laterality preference - it loaded whichever series came first in the list.

**Solution**: Added laterality-based weighting to hanging protocol selector

**File**: `extensions/default/src/hangingprotocols/hpUSMPR.ts`

**Changes**:
```typescript
seriesMatchingRules: [
  // ... existing rules ...

  // ✅ NEW: Prefer RIGHT breast series (weight: 100)
  {
    weight: 100,
    attribute: 'Laterality',
    constraint: {
      equals: { value: 'R' }
    },
    required: false,
  },

  // ✅ NEW: Fallback to LEFT if no RIGHT (weight: 50)
  {
    weight: 50,
    attribute: 'Laterality',
    constraint: {
      equals: { value: 'L' }
    },
    required: false,
  },
]
```

**How It Works**:
- **RIGHT series**: Gets weight score of 100 + base weights = **HIGHEST priority**
- **LEFT series**: Gets weight score of 50 + base weights = **Second priority**
- **Unknown laterality**: Gets only base weights = **Lowest priority**
- Hanging protocol automatically selects highest-weighted series

**Expected Result**:
✅ RIGHT breast series loads first (if available)
✅ LEFT breast series loads only if no RIGHT available
✅ Falls back to first series if no laterality detected

---

### Issue 2: ❌ Can't Switch Series During Initial Load

**Problem**: When first series is loading, drag & drop or double-click to switch series doesn't work.

**Root Cause**:
1. Soft mode reset was awaited (blocking)
2. Cleanup might interfere with initial load state

**Solution**: Made series switching completely non-blocking

**File**: `extensions/default/src/customizations/onDropHandlerCustomization.ts`

**Changes**:

**1. Added non-blocking message**:
```typescript
// ✅ Allow series switching even during initial load
console.log('🔄 [DRAG DROP] Processing series switch (non-blocking)...');
```

**2. Made soft reset fire-and-forget**:
```typescript
// OLD: Blocking (awaited)
const resetResult = await (window as any).usmprSoftModeReset();

// NEW: Non-blocking (fire and forget)
(window as any).usmprSoftModeReset().catch(err => {
  console.warn('⚠️ Background soft reset error:', err);
});
console.log('✅ Soft mode reset started in background');
```

**3. Graceful handling when mode not ready**:
```typescript
if ((window as any).usmprSoftModeReset) {
  // Reset available - run it
} else {
  console.log('ℹ️  Soft mode reset not available yet (initial load), skipping');
}
```

**Expected Result**:
✅ Series switching works IMMEDIATELY, even during initial load
✅ Cleanup runs in background (doesn't block)
✅ User sees new series loading right away
✅ No "frozen" UI waiting for reset to complete

---

## Testing Instructions

### Test 1: Verify RIGHT Series Loads First

**Steps**:
1. Kill port 3000 and restart dev server:
   ```bash
   wmic process where "name='node.exe'" delete
   yarn dev
   ```
2. Load study with **BOTH** RIGHT and LEFT breast series
3. Observe which series loads in MPR viewports

**Expected Console Output**:
```
[HP] Creating viewports with config...
🏥 [Laterality] RIGHT series: US RT Breast (or similar)
✅ [Laterality] Selected RIGHT breast series (preferred)
```

**Expected Result**:
- ✅ RIGHT breast series loads first
- ✅ Console shows "RIGHT series" or "Selected RIGHT breast series"
- ✅ Check viewport images match RIGHT laterality

**If LEFT Still Loads First**:
- Check console for laterality detection logs
- Verify DICOM metadata has Laterality tag
- May need to check SeriesDescription for RIGHT/LEFT keywords

---

### Test 2: Verify Series Switching During Initial Load

**Steps**:
1. Start loading Series 1 (e.g., drag RIGHT breast to viewport)
2. **Immediately** (while Series 1 is still loading):
   - Drag & drop Series 2 (e.g., LEFT breast)
   - OR double-click Series 2 thumbnail
3. Observe if Series 2 starts loading immediately

**Expected Console Output**:
```
🔄 [DRAG DROP] Processing series switch (non-blocking)...
🔄 [DRAG DROP] Triggering soft mode reset (non-blocking)...
✅ [DRAG DROP] Soft mode reset started in background
🛑 [DRAG DROP CLEANUP] Stopping all ongoing image loading...
✅ [DRAG DROP CLEANUP] Cleared interaction request stack
... (cleanup continues)
✅✅✅ [DRAG DROP CLEANUP] COMPLETE cleanup finished - loading new series
```

**Expected Result**:
- ✅ Series 2 starts loading **immediately** (non-blocking)
- ✅ Series 1 loading **stops** (cleanup clears request stacks)
- ✅ Series 2 MPR viewports load without waiting
- ✅ No "frozen" or unresponsive UI

**If Series Switching Still Blocked**:
- Check console for errors during cleanup
- Verify "Processing series switch (non-blocking)" message appears
- Check if soft reset error occurs

---

### Test 3: Verify Cleanup Still Works

**Steps**:
1. Load Series 1 completely
2. Monitor memory (Task Manager)
3. Switch to Series 2 via drag & drop
4. Check console for cleanup logs
5. Monitor memory drops before Series 2 loads

**Expected Console Output**:
```
🛑 [DRAG DROP CLEANUP] Stopping all ongoing image loading...
✅ [DRAG DROP CLEANUP] All image loading stopped
✅ [DRAG DROP CLEANUP] Cleared imageLoader cache
🗑️ [DRAG DROP CLEANUP] Removing 4 volumes...
✅ [DRAG DROP CLEANUP] Removed 4/4 volumes
✅ [DRAG DROP CLEANUP] Terminated workers (freed WASM heap)
✅✅✅ [DRAG DROP CLEANUP] COMPLETE cleanup finished
```

**Expected Memory Behavior**:
```
Before switch: 2.8-5GB (Series 1 loaded)
During cleanup: 0.5-1GB (memory drops)
After Series 2 loads: 2.8-5GB (consistent with Series 1)
```

**Success Criteria**:
- ✅ Memory drops during cleanup
- ✅ Series 2 uses same memory as Series 1
- ✅ No memory accumulation

---

## Summary of Changes

### Files Modified

1. **`extensions/default/src/hangingprotocols/hpUSMPR.ts`**
   - Added RIGHT laterality preference (weight: 100)
   - Added LEFT laterality fallback (weight: 50)
   - Lines added: ~18 lines

2. **`extensions/default/src/customizations/onDropHandlerCustomization.ts`**
   - Made series switching non-blocking
   - Made soft reset fire-and-forget (background)
   - Added graceful handling for initial load
   - Lines modified: ~20 lines

### Expected User Experience

**Before Fixes**:
- ❌ LEFT series loads first (wrong)
- ❌ Can't switch series during initial load (blocked)
- ❌ UI freezes waiting for reset

**After Fixes**:
- ✅ RIGHT series loads first (preferred)
- ✅ Can switch series anytime, even during loading
- ✅ Immediate response, no blocking
- ✅ Cleanup still works in background

---

## Troubleshooting

### Issue: RIGHT Series Still Not Loading First

**Check**:
1. Console for laterality detection:
   ```
   🏥 [Laterality] RIGHT series: ...
   ```
2. DICOM metadata has Laterality tag:
   - Open DICOM file in viewer
   - Check metadata panel
   - Look for "Laterality (0020,0060)" tag

**Solutions**:
- If Laterality tag missing, SeriesLateralityManager checks SeriesDescription
- Ensure series names contain "RIGHT", "LEFT", "RT", or "LT"
- May need to manually edit DICOM tags

### Issue: Series Switch Still Blocked During Load

**Check**:
1. Console for soft reset message:
   ```
   ✅ Soft mode reset started in background
   ```
2. Any errors during cleanup

**Solutions**:
- Ensure dev server restarted (changes to onDropHandler require restart)
- Clear browser cache (Ctrl+Shift+Del)
- Try incognito mode to rule out cached code

### Issue: Cleanup Not Working

**Check**:
1. Console for cleanup steps (all should appear)
2. Memory in Task Manager (should drop)

**Solutions**:
- Verify all cleanup logs appear
- Check if volumes found (should be 4 volumes)
- Verify workers terminated

---

## Next Steps

1. **Restart dev server**:
   ```bash
   wmic process where "name='node.exe'" delete
   yarn dev
   ```

2. **Test RIGHT series loads first**:
   - Load study with both RIGHT and LEFT
   - Verify RIGHT loads initially

3. **Test series switching during load**:
   - Start loading Series 1
   - Immediately switch to Series 2
   - Verify non-blocking behavior

4. **Report results**:
   - Which series loaded first?
   - Did series switch work during initial load?
   - Any console errors?

---

**Status**: ✅ Ready for Testing

Both issues should now be fixed:
1. ✅ RIGHT series loads first
2. ✅ Series switching works during initial load (non-blocking)
