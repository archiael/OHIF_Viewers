# Series Loading Fixes v2 - 2026-01-31

## What Changed

### Issue 1: LEFT Series Loading First (Should be RIGHT)

**Additional Fix**: Extended laterality detection patterns

**Files Modified**:
- `extensions/default/src/hangingprotocols/hpUSMPR.ts`

**Changes**:
Added multiple detection patterns for laterality (not just `'R'` and `'L'`):

```typescript
// Checks multiple DICOM fields:
// 1. Laterality tag (0020,0060) - 'R' = weight 100
// 2. ImageLaterality tag (0020,0062) - 'R' = weight 100
// 3. SeriesDescription contains 'RIGHT' = weight 90
// 4. SeriesDescription contains 'RT' = weight 90
// 5. Laterality tag 'L' = weight 50
// 6. ImageLaterality tag 'L' = weight 50
// 7. SeriesDescription contains 'LEFT' = weight 45
// 8. SeriesDescription contains 'LT' = weight 45
```

**Why This Helps**:
- Some DICOM files use full words ('RIGHT', 'LEFT') instead of abbreviations
- ImageLaterality (0020,0062) is sometimes used instead of Laterality (0020,0060)
- SeriesDescription is a fallback when tags are missing
- Multiple detection methods increase reliability

---

### Issue 2: Can't Switch Series During Initial Load

**Additional Fix**: Added error handling and retry logic

**Files Modified**:
- `extensions/default/src/customizations/onDropHandlerCustomization.ts`

**Changes**:

**1. Error Handling for getViewportsRequireUpdate**:
```typescript
try {
  updatedViewports = hangingProtocolService.getViewportsRequireUpdate(...);
} catch (updateError) {
  // Fallback: Create update manually if HP service fails during initial load
  updatedViewports = [{
    viewportId: viewportId,
    displaySetInstanceUIDs: [displaySetInstanceUID],
  }];
}
```

**2. Retry Logic for DisplaySet**:
```typescript
if (!displaySet) {
  // Wait 500ms for displaySets to be created during initial load
  await new Promise(resolve => setTimeout(resolve, 500));
  const retryDisplaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
}
```

**3. More Logging**:
```typescript
console.log('🔄 [DRAG DROP] Target viewport:', viewportId);
console.log('🔄 [DRAG DROP] New displaySetInstanceUID:', displaySetInstanceUID);
console.log('✅ [DRAG DROP] getViewportsRequireUpdate returned:', updatedViewports?.length);
```

**Why This Helps**:
- During initial load, HangingProtocolService might not be ready → fallback to manual update
- During initial load, displaySets might not be created yet → wait and retry
- More logging helps debug what's happening

---

## Testing Instructions

### Test 1: Verify RIGHT Series Loads First

**Steps**:
1. Load study with **BOTH** RIGHT and LEFT breast series
2. Observe which series loads in MPR viewports
3. Check console logs

**Expected Console Output**:
```
[HP] Creating viewports with config...
🏥 [Laterality] RIGHT series detected
  - Laterality tag: R (weight +100)
  OR
  - SeriesDescription: "US RT Breast" (weight +90)
✅ Selected RIGHT breast series
```

**Expected Result**:
- ✅ RIGHT breast series loads first
- ✅ LEFT breast series does NOT load
- ✅ Memory usage: ~2.8GB (not 5GB)

---

### Test 2: Verify Series Switching During Initial Load

**Steps**:
1. Start loading Series 1 (e.g., drag RIGHT breast to viewport)
2. **Immediately** (while Series 1 is still loading):
   - Drag & drop Series 2 (e.g., LEFT breast)
   - OR double-click Series 2 thumbnail
3. Observe console and viewport behavior

**Expected Console Output**:
```
🔄 [DRAG DROP] Processing series switch (non-blocking)...
🔄 [DRAG DROP] Target viewport: mpr-0
🔄 [DRAG DROP] New displaySetInstanceUID: ...
✅ [DRAG DROP] getViewportsRequireUpdate returned: 4 viewports
  OR (if HP service not ready)
⚠️ [DRAG DROP] getViewportsRequireUpdate failed, creating manual update
  OR (if displaySet not ready)
⚠️ [DRAG DROP] DisplaySet not found yet (initial load?), waiting...
✅ [DRAG DROP] DisplaySet found after retry
🛑 [DRAG DROP CLEANUP] Stopping all ongoing image loading...
✅ [DRAG DROP CLEANUP] Cleared interaction request stack
... (cleanup continues)
```

**Expected Result**:
- ✅ Series 2 starts loading **immediately** (non-blocking)
- ✅ Series 1 loading **stops** (cleanup triggered)
- ✅ Series 2 MPR viewports load successfully
- ✅ No "frozen" or unresponsive UI
- ✅ Even if displaySet/HP service not ready, fallback logic works

---

## Summary of All Changes

### Files Modified

1. **`extensions/default/src/hangingprotocols/hpUSMPR.ts`**
   - Added 8 laterality detection rules (vs original 2)
   - Checks Laterality, ImageLaterality, and SeriesDescription
   - Handles 'R', 'L', 'RIGHT', 'LEFT', 'RT', 'LT' variations

2. **`extensions/default/src/customizations/onDropHandlerCustomization.ts`**
   - Made soft reset fire-and-forget (non-blocking)
   - Added try-catch around getViewportsRequireUpdate with manual fallback
   - Added 500ms retry if displaySet not ready during initial load
   - Added detailed logging for debugging
   - Complete cleanup: stop loading, clear caches, terminate workers

---

## Troubleshooting

### Issue: RIGHT Series Still Not Loading First

**Check Console Logs**:
- Look for laterality detection logs
- Check if any rules matched (weight +100, +90, +50, +45)

**Possible Causes**:
1. DICOM files don't have laterality metadata
2. SeriesDescription doesn't contain RIGHT/LEFT keywords
3. Both series have identical scores (rare)

**Solutions**:
- Add custom laterality detection in DICOM files
- Use SeriesDescription naming convention: "US RT Breast", "US LT Breast"
- Manually drag RIGHT series to viewport first

### Issue: Series Switch Still Blocked During Load

**Check Console Logs**:
- Look for "getViewportsRequireUpdate failed" or "DisplaySet not found yet"
- Check if fallback logic triggered

**Possible Causes**:
1. Hanging protocol service not initialized yet
2. DisplaySets not created yet
3. Viewport service not ready

**Solutions**:
- All cases now have fallback logic (manual update, retry)
- If still fails, check browser console for errors
- Increase retry delay from 500ms to 1000ms if needed

---

**Status**: ✅ Enhanced with multiple detection patterns and robust error handling

Both issues should now be fixed with better reliability:
1. ✅ RIGHT series loads first (multiple detection methods)
2. ✅ Series switching works during initial load (fallback + retry logic)
