# USMPR Series Loading Restructure Plan

## Current Problems

### 1. Memory Inconsistency
- **Series 1**: 5GB memory usage
- **Series 2**: 2.8GB memory usage
- **Problem**: Different memory footprints indicate inconsistent loading

### 2. No Breast Laterality Filtering
**Current behavior** (from `hpUSMPR.ts:232-260`):
```typescript
mprDisplaySet: {
  seriesMatchingRules: [
    { attribute: 'numImageFrames', constraint: { greaterThan: 1 } },
    { attribute: 'SOPClassUID', constraint: { notEquals: 'PDF' } },
  ]
}
```

**Problem**:
- Loads ALL series that match (no laterality filter)
- If study has both RIGHT and LEFT breast series → BOTH might load
- This explains 5GB memory (2 series loaded) vs 2.8GB (1 series loaded)

### 3. Worklist Imports All Series
- User reports: "in worklist all series files are imported"
- All DICOM files imported at once, not filtered by laterality
- Need to separate RIGHT and LEFT series BEFORE loading

### 4. Incomplete Series Switch Cleanup
From `onDropHandlerCustomization.ts`:
- ✅ Removes volumes
- ✅ Purges cache
- ✅ Terminates workers
- ❌ But doesn't STOP ongoing decoding
- ❌ Doesn't ensure WASM memory is freed

## Root Cause Analysis

### Why Series 1 = 5GB?

**Hypothesis**: Loading BOTH RIGHT and LEFT series together
```
RIGHT series: 280 frames × 5MB/frame = 1.4GB
LEFT series: 280 frames × 5MB/frame = 1.4GB
GPU textures + WASM + overhead = ~2.2GB
Total: ~5GB ✅ Matches user's report!
```

### Why Series 2 = 2.8GB?

**Hypothesis**: After cleanup, only ONE series loads
```
One series: 280 frames × 5MB/frame = 1.4GB
GPU textures + WASM + overhead = ~1.4GB
Total: ~2.8GB ✅ Matches user's report!
```

**Conclusion**: Series 1 loads 2 series, Series 2 loads 1 series!

## Solution Architecture

### 1. Breast Series Division (NEW)

Add laterality detection to hanging protocol:

**File**: `extensions/default/src/hangingprotocols/hpUSMPR.ts`

```typescript
displaySetSelectors: {
  mprDisplaySet: {
    seriesMatchingRules: [
      {
        weight: 1,
        attribute: 'numImageFrames',
        constraint: { greaterThan: { value: 1 } },
        required: false,
      },
      {
        weight: 1,
        attribute: 'SOPClassUID',
        constraint: { notEquals: { value: '1.2.840.10008.5.1.4.1.1.104.1' } },
        required: false,
      },
      // ✅ NEW: Filter by laterality (prefer RIGHT, or single series)
      {
        weight: 10, // Higher weight = preferred
        attribute: 'Laterality',
        constraint: {
          equals: {
            // Dynamic value: will be set to current series' laterality
            // If both RIGHT and LEFT exist, RIGHT is preferred
            value: '{{currentLaterality}}',
          },
        },
        required: false,
      },
    ],
  },
}
```

### 2. Series Selection Logic (NEW)

**File**: `modes/usmpr/src/utils/SeriesLateralityManager.ts` (NEW FILE)

```typescript
/**
 * Manages breast series division by laterality (RIGHT/LEFT)
 */
export class SeriesLateralityManager {
  /**
   * Detect laterality from DICOM metadata
   * Priority: Laterality tag → ImageLaterality → BodyPartExamined → SeriesDescription
   */
  static detectLaterality(metadata: any): 'R' | 'L' | null {
    // Check Laterality tag (0020,0060)
    if (metadata.Laterality) {
      return metadata.Laterality === 'R' ? 'R' : 'L';
    }

    // Check ImageLaterality (0020,0062)
    if (metadata.ImageLaterality) {
      return metadata.ImageLaterality === 'R' ? 'R' : 'L';
    }

    // Check BodyPartExamined (0018,0015) for "BREAST"
    if (metadata.BodyPartExamined?.toUpperCase().includes('BREAST')) {
      // Check SeriesDescription for RIGHT/LEFT keywords
      const desc = metadata.SeriesDescription?.toUpperCase() || '';
      if (desc.includes('RIGHT') || desc.includes('RT')) return 'R';
      if (desc.includes('LEFT') || desc.includes('LT')) return 'L';
    }

    return null;
  }

  /**
   * Group displaySets by laterality
   */
  static groupByLaterality(displaySets: any[]): {
    right: any[],
    left: any[],
    unknown: any[]
  } {
    const groups = { right: [], left: [], unknown: [] };

    displaySets.forEach(ds => {
      const laterality = this.detectLaterality(ds);
      if (laterality === 'R') {
        groups.right.push(ds);
      } else if (laterality === 'L') {
        groups.left.push(ds);
      } else {
        groups.unknown.push(ds);
      }
    });

    return groups;
  }

  /**
   * Select preferred series (RIGHT first, or single series)
   */
  static selectPreferredSeries(displaySets: any[]): any | null {
    const groups = this.groupByLaterality(displaySets);

    // Prefer RIGHT if it exists
    if (groups.right.length > 0) {
      console.log('✅ [Laterality] Selected RIGHT breast series');
      return groups.right[0];
    }

    // Fall back to LEFT
    if (groups.left.length > 0) {
      console.log('✅ [Laterality] Selected LEFT breast series');
      return groups.left[0];
    }

    // Fall back to first unknown series
    if (groups.unknown.length > 0) {
      console.log('⚠️ [Laterality] No laterality detected, using first series');
      return groups.unknown[0];
    }

    return null;
  }
}
```

### 3. Complete Series Switch Cleanup (ENHANCED)

**File**: `extensions/default/src/customizations/onDropHandlerCustomization.ts`

Current cleanup (lines 200-241):
```typescript
// ✅ Already removes volumes
cache.removeVolumeLoadObject(volume.volumeId);

// ✅ Already purges cache
cache.purgeCache();

// ✅ Already terminates workers
workerManager.terminate();
```

**Add**:
```typescript
// ✅ NEW: Stop ongoing image loading
const { imageLoadPoolManager } = await import('@cornerstonejs/core');
imageLoadPoolManager.clearRequestStack('interaction');
imageLoadPoolManager.clearRequestStack('thumbnail');
imageLoadPoolManager.clearRequestStack('prefetch');
console.log('🛑 [DRAG DROP CLEANUP] Stopped ongoing image loading');

// ✅ NEW: Clear imageLoader cache (separate from Cornerstone cache)
const { imageLoader } = await import('@cornerstonejs/core');
imageLoader.clearCache?.();
console.log('🗑️ [DRAG DROP CLEANUP] Cleared imageLoader cache');

// ✅ NEW: Force garbage collection (if available)
if (window.gc) {
  window.gc();
  console.log('🗑️ [DRAG DROP CLEANUP] Forced garbage collection');
}
```

### 4. Mode Exit Cleanup (ENHANCED)

**File**: `modes/usmpr/src/index.tsx`

Add to `onModeExit`:
```typescript
// ✅ CRITICAL: Stop ALL ongoing operations before cleanup
const { imageLoadPoolManager } = await import('@cornerstonejs/core');

// Clear ALL request stacks
['interaction', 'thumbnail', 'prefetch', 'compute'].forEach(type => {
  imageLoadPoolManager.clearRequestStack(type);
});
console.log('🛑 [USMPR EXIT] Stopped all image loading');

// Clear imageLoader cache
const { imageLoader } = await import('@cornerstonejs/core');
imageLoader.clearCache?.();
console.log('🗑️ [USMPR EXIT] Cleared imageLoader cache');

// Existing cleanup (volumes, cache, workers) ...
```

## Implementation Steps

### Step 1: Create SeriesLateralityManager
- [ ] Create `modes/usmpr/src/utils/SeriesLateralityManager.ts`
- [ ] Implement laterality detection logic
- [ ] Add unit tests for laterality detection

### Step 2: Integrate Laterality into onModeEnter
- [ ] Modify `modes/usmpr/src/index.tsx` - `onModeEnter`
- [ ] Filter displaySets by laterality BEFORE loading
- [ ] Prefer RIGHT series, fall back to LEFT or single series
- [ ] Log selected series laterality

### Step 3: Enhance Cleanup (Series Switch)
- [ ] Modify `onDropHandlerCustomization.ts`
- [ ] Add imageLoadPoolManager.clearRequestStack()
- [ ] Add imageLoader.clearCache()
- [ ] Test memory drops to ~0.5GB before new series loads

### Step 4: Enhance Cleanup (Mode Exit)
- [ ] Modify `modes/usmpr/src/index.tsx` - `onModeExit`
- [ ] Stop all ongoing operations FIRST
- [ ] Then cleanup volumes, cache, workers
- [ ] Verify no memory leaks on mode re-enter

### Step 5: Update Right Panel Series List
- [ ] Show "RIGHT" and "LEFT" labels in series thumbnails
- [ ] Allow user to switch between RIGHT/LEFT series
- [ ] Trigger complete cleanup on series switch

## Expected Results

### Memory Usage (After Restructure)

```
Series 1 (RIGHT):  2.8GB (ONE series only) ✅
Series 2 (LEFT):   2.8GB (ONE series only) ✅
Series 3 (RIGHT):  2.8GB (ONE series only) ✅

Consistent memory across all series switches!
```

### Series Switching Behavior

```
User action: Drag & drop LEFT series (or double-click thumbnail)
↓
1. Stop ongoing image loading     [imageLoadPoolManager.clearRequestStack()]
2. Remove volumes (GPU textures)  [cache.removeVolumeLoadObject()]
3. Purge cache (JS heap)          [cache.purgeCache()]
4. Clear imageLoader cache        [imageLoader.clearCache()]
5. Terminate workers (WASM heap)  [workerManager.terminate()]
6. Memory drops to ~0.5GB         [Verified in Task Manager]
↓
7. Load new series (LEFT)         [setDisplaySetsForViewports()]
8. Memory rises to ~2.8GB         [Consistent with Series 1]
9. No WASM errors ✅
10. All features work ✅
```

### User Experience

1. **Worklist**: Shows both RIGHT and LEFT series thumbnails
2. **Initial load**: Automatically loads RIGHT series (preferred)
3. **Switch series**: Click LEFT thumbnail → complete cleanup → loads LEFT series
4. **Memory**: Always ~2.8GB per series (no accumulation)
5. **Performance**: No lag, no crashes, smooth switching

## Testing Checklist

### Test 1: Initial Load (RIGHT Preferred)
- [ ] Load study with both RIGHT and LEFT series
- [ ] Verify only RIGHT series loads (memory ~2.8GB)
- [ ] Check right panel shows both series thumbnails

### Test 2: Series Switch (LEFT)
- [ ] Click LEFT series thumbnail
- [ ] Verify cleanup logs (stop loading, remove volumes, purge cache, terminate workers)
- [ ] Verify memory drops to ~0.5GB between series
- [ ] Verify LEFT series loads (memory ~2.8GB)
- [ ] Verify no WASM errors

### Test 3: Series Switch (Back to RIGHT)
- [ ] Click RIGHT series thumbnail again
- [ ] Verify same cleanup process
- [ ] Verify memory still ~2.8GB
- [ ] Verify no memory accumulation

### Test 4: Multiple Switches (Stress Test)
- [ ] Switch between RIGHT and LEFT 10 times
- [ ] Memory should stay at ~2.8GB (no accumulation)
- [ ] No crashes, no errors

### Test 5: Single Series Study
- [ ] Load study with only one series (no laterality)
- [ ] Verify series loads normally (memory ~2.8GB)
- [ ] Verify no errors

## Success Criteria

✅ Series 1 and Series 2 use SAME memory (~2.8GB each)
✅ Only ONE series loads at a time (not both RIGHT and LEFT)
✅ Complete cleanup on series switch (memory drops to ~0.5GB)
✅ No WASM errors on Series 2
✅ User can switch between RIGHT and LEFT series unlimited times
✅ Memory stays consistent (no accumulation)

## Risk Mitigation

### Risk 1: Laterality detection fails
- **Mitigation**: Fall back to loading first available series
- **Impact**: Works like current behavior (no worse than before)

### Risk 2: Cleanup too aggressive
- **Mitigation**: Keep existing cleanup, just add stop loading + clear imageLoader
- **Fallback**: Remove new cleanup steps if issues arise

### Risk 3: Breaking existing features
- **Mitigation**: Test all features after each step (MPR, Stack, tools, annotations)
- **Rollback**: Git commit after each step for easy rollback

---

**Document Created**: 2026-01-31
**Status**: Ready for Implementation
**Estimated Time**: 4-6 hours
