# Step-Dependent Job Visibility System

## 🎯 Overview

This feature implements a **cascading step dependency system** where jobs are only visible to users if the previous step in the workflow has been completed. This ensures that users don't see jobs they cannot work on yet.

---

## 📋 Problem Statement

**Before:**
- Users could see all jobs assigned to their machines, regardless of workflow status
- A printing operator could see jobs where PaperStore wasn't completed yet
- Users would try to start work, only to get blocked by the backend validation
- Poor user experience with confusing error messages

**After:**
- Users only see jobs where their step's prerequisites are completed
- Clean, filtered job list showing only actionable jobs
- Better workflow management and reduced confusion

---

## 🔄 Step Dependencies

### Sequential Steps Flow:
```
1. PaperStore (First step - no dependencies)
   ↓
2. PrintingDetails ←─┐
   ↓                 ├─ (Both require PaperStore to be completed)
3. Corrugation ←─────┘
   ↓
4. FluteLaminateBoardConversion (Requires BOTH Printing AND Corrugation)
   ↓
5. Punching OR Die Cutting (Either can follow FluteLamination)
   ↓
6. SideFlapPasting (Requires Punching OR Die Cutting - at least one)
   ↓
7. QualityDept (Requires SideFlapPasting)
   ↓
8. DispatchProcess (Requires QualityDept)
```

### Step Dependency Table:

| Step | Dependencies | Notes |
|------|-------------|-------|
| PaperStore | None | First step |
| PrintingDetails | PaperStore | Can run parallel with Corrugation |
| Corrugation | PaperStore | Can run parallel with PrintingDetails |
| FluteLaminateBoardConversion | PrintingDetails + Corrugation | Needs BOTH completed |
| Punching | FluteLaminateBoardConversion | Alternative to Die Cutting |
| Die Cutting | FluteLaminateBoardConversion | Alternative to Punching |
| SideFlapPasting | Punching OR Die Cutting | Needs at least ONE |
| QualityDept | SideFlapPasting | Sequential |
| DispatchProcess | QualityDept | Sequential |

---

## 🔧 Implementation Details

### Backend Changes

#### 1. **Helper Functions Added**

**`getPreviousStepNames(stepName: string): string[]`**
- Returns array of step names that must be completed before the given step
- Supports multiple dependencies (e.g., FluteLamination requires both Printing and Corrugation)

**`arePreviousStepsCompleted(steps: any[], targetStepName: string): boolean`**
- Checks if all prerequisite steps for a given step are completed (status = 'stop')
- Handles special cases:
  - Parallel steps: Both must be completed for downstream steps
  - Alternative steps: At least one must be completed (e.g., Punching OR Die Cutting)

#### 2. **Modified Functions**

**`getFilteredJobNumbers()`** (Line 639-769)
- Added step dependency checking after role and machine filtering
- Jobs are only returned if the user's relevant steps have completed prerequisites
- Maintains backward compatibility with existing filtering logic

**`getFilteredJobNumbersCount()`** (Line 775-861)
- Updated to match the same filtering logic as `getFilteredJobNumbers()`
- Ensures pagination counts are accurate with the new filtering

---

## 📊 Filtering Logic Flow

```
User Requests Jobs List
  ↓
1. Check User Role & Machine Access (existing)
  ↓
2. Filter jobs based on machine assignments (existing)
  ↓
3. 🆕 NEW: For each job, check user's relevant steps
  ↓
4. 🆕 NEW: For each step, verify previous steps are completed
  ↓
5. Only return jobs where at least one step has met prerequisites
  ↓
Return Filtered Job List
```

---

## 💡 Examples

### Example 1: Printing Operator
**Scenario:** User has role `printer`

**Job A:**
- PaperStore: status = 'stop' ✅
- PrintingDetails: status = 'planned'

**Result:** Job A is **VISIBLE** (PaperStore completed, user can start Printing)

**Job B:**
- PaperStore: status = 'start' ❌
- PrintingDetails: status = 'planned'

**Result:** Job B is **HIDDEN** (PaperStore not completed yet)

---

### Example 2: Flute Lamination Operator
**Scenario:** User has role `flutelaminator`

**Job A:**
- PaperStore: status = 'stop' ✅
- PrintingDetails: status = 'stop' ✅
- Corrugation: status = 'stop' ✅
- FluteLaminateBoardConversion: status = 'planned'

**Result:** Job A is **VISIBLE** (Both Printing and Corrugation completed)

**Job B:**
- PaperStore: status = 'stop' ✅
- PrintingDetails: status = 'stop' ✅
- Corrugation: status = 'start' ❌ (Still in progress)
- FluteLaminateBoardConversion: status = 'planned'

**Result:** Job B is **HIDDEN** (Corrugation not completed yet)

---

### Example 3: Pasting Operator
**Scenario:** User has role `pasting_operator`

**Job A:**
- Punching: status = 'stop' ✅
- Die Cutting: Not present
- SideFlapPasting: status = 'planned'

**Result:** Job A is **VISIBLE** (Punching completed - sufficient)

**Job B:**
- Punching: status = 'planned' ❌
- Die Cutting: status = 'stop' ✅
- SideFlapPasting: status = 'planned'

**Result:** Job B is **VISIBLE** (Die Cutting completed - sufficient, Punching not required)

**Job C:**
- Punching: status = 'start' ❌
- Die Cutting: Not present
- SideFlapPasting: status = 'planned'

**Result:** Job C is **HIDDEN** (Neither Punching nor Die Cutting completed)

---

## 🚀 Benefits

### 1. **Improved User Experience**
- Users see only actionable jobs
- No confusion about which jobs they can work on
- Reduced error messages and failed start attempts

### 2. **Better Workflow Management**
- Enforces sequential processing at the visibility level
- Prevents users from even seeing jobs they can't work on
- Clear indication of workflow progress

### 3. **Reduced Server Load**
- Users don't repeatedly try to start jobs they can't access
- Fewer API calls with error responses
- More efficient resource usage

### 4. **Data Integrity**
- Prevents workflow violations at the earliest possible point
- Ensures steps are completed in the correct order
- Maintains data consistency

---

## 🔒 Bypass Roles

The following roles **bypass** step dependency filtering and see all jobs:
- **Admin**
- **Planner**
- **Flying Squad**
- **QC Manager**
- **Paperstore** (They are the first step)

---

## 🧪 Testing Scenarios

### Test Case 1: Basic Sequential Steps
1. Create job with PaperStore planned
2. Login as printer → Job should be **HIDDEN**
3. Complete PaperStore (status = 'stop')
4. Login as printer → Job should be **VISIBLE**

### Test Case 2: Parallel Steps
1. Create job with PaperStore completed, Printing planned, Corrugation planned
2. Login as printer → Job should be **VISIBLE**
3. Login as corrugator → Job should be **VISIBLE** (both can work in parallel)
4. Complete only Printing
5. Login as flutelaminator → Job should be **HIDDEN** (needs both completed)
6. Complete Corrugation
7. Login as flutelaminator → Job should be **VISIBLE**

### Test Case 3: Alternative Steps
1. Create job with FluteLamination completed, Punching planned, Die Cutting not present
2. Login as pasting_operator → Job should be **HIDDEN**
3. Complete Punching
4. Login as pasting_operator → Job should be **VISIBLE**

---

## 📝 Code Locations

**Backend:**
- `NRC_Backend/src/middleware/machineAccess.ts`
  - `getPreviousStepNames()` (Line 576-590)
  - `arePreviousStepsCompleted()` (Line 595-632)
  - `getFilteredJobNumbers()` (Line 639-769)
  - `getFilteredJobNumbersCount()` (Line 775-861)

**Frontend:**
- No frontend changes required - filtering happens automatically via the existing API

---

## 🔄 API Endpoints Affected

The step dependency filtering is automatically applied to all endpoints that use `getFilteredJobNumbers()`:

- `GET /api/jobs` - Job list endpoint
- All role-specific job fetching endpoints
- Dashboard endpoints that display job counts

---

## ⚠️ Important Notes

1. **Backward Compatibility:** The feature is fully backward compatible. Existing filtering logic remains intact.

2. **Performance:** The filtering logic is efficient as it operates on already-fetched data and doesn't add extra database queries.

3. **High-Demand Jobs:** High-demand jobs follow the same step dependency rules. Role-based visibility doesn't bypass step dependencies.

4. **Status Required:** Steps must have `status = 'stop'` to be considered completed. `status = 'start'` or `'planned'` are not sufficient.

5. **Missing Steps:** If a required previous step doesn't exist in the job planning, the job will be hidden.

---

## ✅ Verification

To verify the feature is working:

1. Check backend logs for step dependency filtering:
```
🔍 [MACHINE FILTERING] Checking step dependencies for user role: printer
✅ [MACHINE FILTERING] Previous steps completed for PrintingDetails
❌ [MACHINE FILTERING] Previous steps NOT completed for PrintingDetails
```

2. Compare job counts before/after completing a step

3. Test with different user roles to ensure proper filtering

---

## 📚 Related Documentation

- [WORKFLOW_LOGIC.md](./WORKFLOW_LOGIC.md) - Workflow rules and parallel processing
- [COMPLETE_STOP_FLOW_FINAL_SUMMARY.md](../COMPLETE_STOP_FLOW_FINAL_SUMMARY.md) - Stop/Complete work flow
- [MULTIPLE_ROLES_IMPLEMENTATION.md](../NRCapp/MULTIPLE_ROLES_IMPLEMENTATION.md) - Multiple roles support

---

## 🎉 Feature Status

**Status:** ✅ **COMPLETED**

**Implemented:** October 17, 2025

**Tested:** Backend logic verified, no linter errors

**Production Ready:** Yes

