# USMPR Cleanup Testing Checklist

## Overview

This document guides you through systematic testing of 5 cleanup methods to identify which combination:
- ✅ Prevents memory accumulation on series switching
- ✅ Allows Series 2 to load correctly (both MPR and Stack)

**File to edit**: `modes/usmpr/src/index.tsx` (lines 94-103)

**CLEANUP_CONFIG flags**:
```typescript
const CLEANUP_CONFIG = {
  clearStackViewport: false,    // Step 0: Clear Stack viewport state
  removeVolumes: false,         // Step 1: Remove volumes (GPU textures)
  purgeCache: false,            // Step 2: Purge image cache (JS heap)
  terminateWorkers: false,      // Step 3: Terminate workers (WASM heap)
  verifyCleanup: false,         // Step 4: Verify cleanup completed
};
```

---

## Test Matrix

| Test | clearStackViewport | removeVolumes | purgeCache | terminateWorkers | verifyCleanup | Purpose |
|------|-------------------|---------------|------------|------------------|---------------|---------|
| **0** | ❌ | ❌ | ❌ | ❌ | ❌ | **Baseline** - ef1d3db behavior |
| **1** | ✅ | ❌ | ❌ | ❌ | ❌ | Test Stack clear only |
| **2** | ❌ | ✅ | ❌ | ❌ | ❌ | Test volume removal only |
| **3** | ❌ | ❌ | ✅ | ❌ | ❌ | Test cache purge only |
| **4** | ❌ | ❌ | ❌ | ✅ | ❌ | **CRITICAL** - Workers only |
| **5** | ✅ | ✅ | ❌ | ❌ | ❌ | Stack clear + volumes |
| **6** | ✅ | ❌ | ✅ | ❌ | ❌ | Stack clear + cache |
| **7** | ✅ | ❌ | ❌ | ✅ | ❌ | Stack clear + workers |
| **8** | ❌ | ✅ | ✅ | ✅ | ❌ | **RECOMMENDED** - No Stack clear |
| **9** | ✅ | ✅ | ✅ | ✅ | ✅ | Current - Full cleanup |

---

## Testing Procedure

### For Each Test Configuration:

#### Step 1: Edit Configuration
1. Open `modes/usmpr/src/index.tsx`
2. Go to lines 94-103
3. Set boolean values according to test matrix
4. **Example for Test 0**:
   ```typescript
   const CLEANUP_CONFIG = {
     clearStackViewport: false,
     removeVolumes: false,
     purgeCache: false,
     terminateWorkers: false,
     verifyCleanup: false,
   };
   ```

#### Step 2: Restart Dev Server
1. **Stop dev server**: Ctrl+C in terminal
2. **Kill all node processes** (if needed):
   ```bash
   taskkill //F //IM node.exe //T
   ```
3. **Restart dev server**:
   ```bash
   yarn dev
   ```
4. **Wait for compilation**: Look for `webpack compiled` message

#### Step 3: Test Series 1 (Initial Load)
1. **Open browser**: http://localhost:3000
2. **Load local study** (drag & drop or file select)
3. **Check MPR viewports**: All 4 viewports should render images
4. **Switch to Stack view**: Double-click Axial viewport
5. **Scroll Stack images**: Use mouse wheel or slider
6. **Record memory** (Task Manager → Chrome → Memory):
   - After MPR loaded: _____ GB
   - After Stack scrolling: _____ GB

#### Step 4: Test Series 2 (Series Switch)
1. **Switch to Series 2**: Drag & drop new study or select from list
2. **Check console logs**:
   - Look for: `[USMPR-Cleanup] Series changed:`
   - Look for: `[USMPR-Cleanup] Starting cleanup...` (if any flags enabled)
   - Look for: `⏭️ Skipping...` messages (for disabled steps)
3. **Wait for Series 2 MPR to load**
4. **Check MPR viewports**: Do images appear?
5. **Switch to Stack view**: Double-click Axial viewport
6. **Check for WASM error** (console):
   - Look for: `Aborted(native code called abort())`
   - Look for: `RuntimeError: Aborted`
7. **If no error, scroll Stack images**
8. **Record memory** (Task Manager):
   - After Series 2 MPR loaded: _____ GB
   - After Series 2 Stack scrolling: _____ GB

---

## Results Template

Copy this template for each test:

```
=== Test X: [Description] ===
Config:
  clearStackViewport: [true/false]
  removeVolumes: [true/false]
  purgeCache: [true/false]
  terminateWorkers: [true/false]
  verifyCleanup: [true/false]

Series 1:
  MPR Load: [ ] OK  [ ] Error: _______
  Stack View: [ ] OK  [ ] Error: _______
  Memory after MPR: _____ GB
  Memory after Stack: _____ GB

Series 2:
  Cleanup logs: [ ] Appeared  [ ] Missing
  MPR Load: [ ] OK  [ ] Error: _______
  Stack View: [ ] OK  [ ] WASM abort()  [ ] Error: _______
  Memory after MPR: _____ GB
  Memory after Stack: _____ GB
  Memory accumulation: _____ GB (Series 2 - Series 1)

Console errors:
_____________________________________

Notes:
_____________________________________
```

---

## Success Criteria

For each test, check these criteria:

✅ **Pass**: All criteria met
- Series 1 MPR loads correctly
- Series 1 Stack view works
- Series 2 MPR loads correctly
- Series 2 Stack view works (NO WASM error)
- Memory accumulation < 3GB

⚠️ **Partial**: Some issues
- Series 2 loads but memory accumulates > 3GB
- OR Memory OK but Series 2 Stack has minor issues

❌ **Fail**: Critical failure
- Series 2 MPR fails to load
- OR Series 2 Stack WASM abort() error
- OR Memory accumulation > 5GB

---

## Priority Testing Order

**Don't test all 10 configurations** - start with these priority tests:

### Priority 1: Test 0 (Baseline)
**Config**: All flags `false`
**Why**: Establish baseline - should match ef1d3db behavior (loads OK, memory accumulates)
**Expected**: Series 2 loads fine, memory ~10.5GB

### Priority 2: Test 4 (Workers Only)
**Config**: Only `terminateWorkers: true`
**Why**: Worker termination was main cleanup in previous commits
**Expected**: If this works, it's the minimal solution!

### Priority 3: Test 8 (No Stack Clear)
**Config**: `removeVolumes: true, purgeCache: true, terminateWorkers: true`
**Why**: If Test 4 fails, test full cleanup WITHOUT clearStackViewport (suspected culprit)
**Expected**: Might prevent memory accumulation AND allow Series 2 loading

### Priority 4: Test 9 (Full Cleanup)
**Config**: All flags `true`
**Why**: This is current HEAD - should fail Series 2 Stack (WASM error)
**Expected**: Memory stable but Series 2 Stack WASM abort()

---

## Decision Tree

```
START
  |
  ├─> Test 0 (Baseline)
  |   ├─> Series 2 fails? → PROBLEM NOT IN CLEANUP (investigate other code)
  |   └─> Series 2 OK? → Continue to Test 4
  |
  ├─> Test 4 (Workers only)
  |   ├─> Series 2 OK + Memory < 10GB? → ✅ SOLUTION FOUND (use Test 4 config)
  |   ├─> Series 2 OK but Memory still high? → Continue to Test 8
  |   └─> Series 2 fails? → Continue to Test 8
  |
  ├─> Test 8 (No Stack clear)
  |   ├─> Series 2 OK + Memory < 8GB? → ✅ SOLUTION FOUND (use Test 8 config)
  |   └─> Series 2 fails? → Continue to individual tests
  |
  ├─> Test 9 (Full cleanup)
  |   └─> Confirm Series 2 Stack WASM error exists
  |
  └─> If all priority tests fail Series 2:
      Run Test 1, 2, 3 individually to isolate which step breaks loading
```

---

## Expected Results (Hypothesis)

Based on previous investigation:

| Test | Series 2 Load | Memory | Hypothesis |
|------|---------------|--------|------------|
| 0 | ✅ OK | ❌ 10.5GB | Baseline (no cleanup) |
| 4 | ✅ OK | ⚠️ 8-9GB | Workers help but not enough |
| 8 | ✅ OK | ✅ 7GB | Optimal solution |
| 9 | ❌ WASM error | ✅ 7GB | Over-aggressive cleanup |

**If hypothesis correct**:
- `clearStackViewport` is likely causing WASM error
- Solution: Use Test 8 config (full cleanup EXCEPT clearStackViewport)

---

## Troubleshooting

### Issue: "No cleanup logs appear"
- Check console filter: Remove any filters, show "Info" level
- Search for: `USMPR-Cleanup` or `Cleanup-Config`
- If still missing: Webpack might not have recompiled

### Issue: "Series doesn't load at all"
- Check console for errors
- Check network tab for failed requests
- Try different study/series

### Issue: "Can't tell memory usage"
- Windows: Task Manager → More Details → Chrome → Memory
- Look for process with highest memory
- OR use Chrome DevTools → Performance Monitor

### Issue: "Webpack won't recompile"
- Kill all node processes: `taskkill //F //IM node.exe //T`
- Delete `platform/app/.next` cache folder (if exists)
- Restart dev server

---

## Final Step: Document Your Findings

After completing priority tests (0, 4, 8, 9), create a summary:

```
=== SYSTEMATIC CLEANUP TESTING RESULTS ===
Date: [Date]

Test 0 (Baseline):
  Result: [Pass/Fail]
  Memory: [X GB]

Test 4 (Workers only):
  Result: [Pass/Fail]
  Memory: [X GB]

Test 8 (No Stack clear):
  Result: [Pass/Fail]
  Memory: [X GB]

Test 9 (Full cleanup):
  Result: [Pass/Fail]
  Memory: [X GB]

CONCLUSION:
- Optimal configuration: Test [X]
- Flags to enable: [list]
- Expected memory: [X GB]
- Trade-offs: [any compromises]

NEXT STEPS:
1. Update CLEANUP_CONFIG to optimal settings
2. Test with multiple series switches (3-5 series)
3. Confirm memory stays stable
```

---

## Quick Reference: Config Copy-Paste

**Test 0 (Baseline)**:
```typescript
const CLEANUP_CONFIG = {
  clearStackViewport: false,
  removeVolumes: false,
  purgeCache: false,
  terminateWorkers: false,
  verifyCleanup: false,
};
```

**Test 4 (Workers only)**:
```typescript
const CLEANUP_CONFIG = {
  clearStackViewport: false,
  removeVolumes: false,
  purgeCache: false,
  terminateWorkers: true,
  verifyCleanup: false,
};
```

**Test 8 (No Stack clear)**:
```typescript
const CLEANUP_CONFIG = {
  clearStackViewport: false,
  removeVolumes: true,
  purgeCache: true,
  terminateWorkers: true,
  verifyCleanup: false,
};
```

**Test 9 (Full cleanup)**:
```typescript
const CLEANUP_CONFIG = {
  clearStackViewport: true,
  removeVolumes: true,
  purgeCache: true,
  terminateWorkers: true,
  verifyCleanup: true,
};
```

---

**Good luck with testing!** 🧪

The goal is to find the cleanup configuration that:
- ✅ Prevents memory accumulation (< 8GB per series)
- ✅ Allows Series 2 to load without WASM errors
- ✅ Maintains stable performance across multiple series switches
