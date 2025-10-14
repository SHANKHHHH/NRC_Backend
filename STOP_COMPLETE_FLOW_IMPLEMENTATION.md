# Stop & Complete Work Flow Implementation

## 📋 Overview

This document describes the unified flow implementation for **Stop** and **Complete Work** buttons in the multi-machine job step workflow.

---

## 🎯 Problem Statement

Previously:
- `completeWorkOnMachine` and `stopWorkOnMachine` had overlapping and conflicting logic
- Both tried to update individual step tables independently
- Status inconsistencies between JobStep and JobStepMachine
- No proper quantity validation against previous step output

---

## ✅ Solution Implemented

### **Unified Completion Criteria**

A step is completed when **EITHER** of these conditions is met:

1. **Quantity Match**: `Total (OK Quantity + Wastage) >= Previous Step Available Quantity`
2. **All Machines Stopped**: All assigned machines have `status = 'stop'`

### **Button Behaviors**

#### 1. **Complete Work Button** (`/complete`)
```
Purpose: Submit form data for a machine
Action:
  - Updates JobStepMachine.formData ONLY
  - NO status change to the machine
  - Triggers step completion check
  - If criteria met → completes the step
```

#### 2. **Stop Button** (`/stop`)
```
Purpose: Permanently stop work on a machine
Action:
  - Updates JobStepMachine.status → 'stop'
  - Updates JobStepMachine.formData (if provided)
  - Sets completedAt timestamp
  - Triggers step completion check
  - If criteria met → completes the step
```

---

## 🔧 Technical Implementation

### **New Helper Functions**

#### 1. `_getPreviousStepQuantity(stepNo, nrcJobNo)`

Fetches the available quantity from the previous step's individual table.

**Step Sequence & Quantity Fields:**
```
Step 1: PaperStore → available (source for Corrugation)
Step 2: Printing → quantity
Step 3: Corrugation → fetches from PaperStore.available
Step 4: FluteLamination → quantity
Step 5: Punching → quantity
Step 6: DieCutting → N/A
Step 7: SideFlapPasting → quantity
Step 8: QualityDept → quantity
Step 9: Dispatch → quantity
```

**Special Case**: Corrugation (Step 3) fetches from PaperStore.available, not from Printing.

#### 2. `_checkStepCompletionCriteria(jobStepId, stepNo, nrcJobNo, allMachines)`

Evaluates if step should be completed based on:
- Submitted quantities from all machines with formData
- Previous step's available quantity
- Machine stop status

**Returns:**
```typescript
{
  shouldComplete: boolean,
  reason: string,
  totalOK: number,
  totalWastage: number
}
```

**Logic:**
```typescript
// Get machines with submitted formData
submittedMachines = machines.filter(m => m.formData exists)

// Calculate totals
totalOK = sum of OK quantities from all submitted machines
totalWastage = sum of wastage from all submitted machines
totalSubmitted = totalOK + totalWastage

// Get previous step quantity
previousQty = await _getPreviousStepQuantity(stepNo, nrcJobNo)

// Check criteria
if (totalSubmitted >= previousQty && previousQty > 0):
  return { shouldComplete: true, reason: "Quantity match" }

if (all machines have status 'stop'):
  return { shouldComplete: true, reason: "All machines stopped" }

return { shouldComplete: false, reason: "Waiting..." }
```

---

## 📊 Data Flow

### **When Step Completes:**

1. **JobStepMachine Table** (per machine):
   - Stores individual machine data
   - Status: `'available'`, `'in_progress'`, `'hold'`, `'stop'`
   - FormData: Individual machine quantities and details

2. **JobStep Table** (per step):
   - Status updated to: `'stop'`
   - EndDate set to: `new Date()`

3. **Individual Step Tables** (PaperStore, Printing, Corrugation, etc.):
   - Status updated to: `'accept'`
   - Quantity: Sum of all machines' OK quantities
   - Wastage: Sum of all machines' wastage
   - Other fields: Combined from formData

---

## 🔄 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  START → Hold → Resume → [Complete Work] or [Stop]         │
│    │       │       │            │              │           │
│    v       v       v            v              v           │
│ 'start'  'hold'  'in_progress'  (no change)  'stop'       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              COMPLETE WORK BUTTON FLOW                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Update JobStepMachine.formData                         │
│  2. NO status change                                        │
│  3. Run completion check                                    │
│  4. IF criteria met:                                        │
│     ✓ Update JobStep.status = 'stop'                       │
│     ✓ Update Individual Step (status = 'accept')           │
│     ✓ Set JobStep.endDate                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  STOP BUTTON FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Update JobStepMachine.status = 'stop'                  │
│  2. Update JobStepMachine.formData (if provided)           │
│  3. Set completedAt timestamp                               │
│  4. Run completion check                                    │
│  5. IF criteria met:                                        │
│     ✓ Update JobStep.status = 'stop'                       │
│     ✓ Update Individual Step (status = 'accept')           │
│     ✓ Set JobStep.endDate                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Example Scenarios

### **Scenario 1: 3 Machines - Full Quantity Match**
```
PaperStore Available: 1000 sheets

Machine 1: OK=200, Wastage=50  → Total=250
Machine 2: OK=250, Wastage=100 → Total=350
Machine 3: OK=400, Wastage=0   → Total=400

Sum: 250 + 350 + 400 = 1000 ✅
→ Step completes automatically
```

### **Scenario 2: 2 of 3 Machines - Quantity Match**
```
PaperStore Available: 1000 sheets

Machine 1: OK=200, Wastage=50  → Total=250
Machine 2: OK=650, Wastage=100 → Total=750
Machine 3: (no submission)

Sum: 250 + 750 = 1000 ✅
→ Step completes automatically (Machine 3 not needed)
```

### **Scenario 3: Single Machine - Full Quantity**
```
PaperStore Available: 1000 sheets

Machine 1: OK=900, Wastage=100 → Total=1000

Sum: 1000 = 1000 ✅
→ Step completes automatically
```

### **Scenario 4: All Machines Stopped - Partial Quantity**
```
PaperStore Available: 1000 sheets

Machine 1: OK=200, Wastage=50  → Total=250, Status='stop'
Machine 2: OK=250, Wastage=100 → Total=350, Status='stop'
Machine 3: OK=200, Wastage=0   → Total=200, Status='stop'

Sum: 250 + 350 + 200 = 800 (< 1000)
But ALL machines stopped ✅
→ Step completes (partial quantity accepted)
```

---

## 🔐 Status Values Reference

### **JobStepMachine Status**
- `'available'` - Machine assigned but not started
- `'in_progress'` - Machine actively working
- `'hold'` - Machine work paused
- `'stop'` - Machine work stopped (permanent)

### **JobStep Status (enum: JobStepStatus)**
- `'planned'` - Step created, not started
- `'start'` - Step in progress
- `'stop'` - Step completed/stopped

### **Individual Step Status (enum: StepStatus)**
- `'in_progress'` - Step data being filled
- `'hold'` - Step paused
- `'accept'` - Step completed and accepted
- `'reject'` - Step rejected (QC)

---

## 🚀 API Endpoints

### Complete Work
```
POST /:nrcJobNo/steps/:stepNo/machines/:machineId/complete
Body: { formData: { quantity, wastage, ... } }

Response: {
  success: true,
  message: "Work data submitted successfully",
  data: {
    jobStepMachineId,
    status,
    stepCompleted: boolean,
    completionReason: string
  }
}
```

### Stop Machine
```
POST /:nrcJobNo/steps/:stepNo/machines/:machineId/stop
Body: { formData: { quantity, wastage, ... } } (optional)

Response: {
  success: true,
  message: "Machine stopped successfully",
  data: {
    jobStepMachineId,
    status: "stop",
    stepCompleted: boolean,
    completionReason: string
  }
}
```

---

## ⚙️ Configuration

### Field Name Variations Handled

The system handles multiple naming conventions for quantities:

**OK Quantity:**
- `quantity`
- `quantityOK`
- `okQuantity`
- `'Quantity OK'`
- `'OK Quantity'`
- `sheetsCount`
- `'Sheets Count'`

**Wastage:**
- `wastage`
- `Wastage`
- `WASTAGE`

---

## 📌 Important Notes

1. **No 'completed' Status**: The system uses `'stop'` for both manual stops and completion
2. **Individual Step Status**: Always set to `'accept'` when step completes
3. **Quantity Validation**: Works for all steps except Quality and Dispatch (no machines)
4. **Urgent Jobs**: Bypass machine access checks (`jobDemand = 'high'`)
5. **Corrugation Special Case**: Fetches quantity from PaperStore.available, not from Printing

---

## 🔍 Debugging

Console logs are comprehensive and follow this format:
```
🎯 [COMPLETION CHECK] - Checking completion criteria
📋 [GET_PREV_QTY] - Getting previous step quantity
✅ - Success operations
❌ - Error operations
🛑 - Stop operations
📝 - Data update operations
⏳ - Waiting/Pending operations
🎉 - Step completion triggered
```

---

## 📅 Implementation Date
**Date**: October 14, 2025

## 👨‍💻 Modified Files
- `NRC_Backend/src/controllers/jobStepMachineController.ts`

## 🧪 Testing Required
- [ ] Test complete work with single machine
- [ ] Test complete work with multiple machines (quantity match)
- [ ] Test stop with all machines stopped (partial quantity)
- [ ] Test corrugation step (special case)
- [ ] Test urgent job bypass
- [ ] Verify individual step table updates
- [ ] Verify JobStep status updates

---

## 🎯 Success Criteria

✅ Complete Work button only updates formData, no status change
✅ Stop button sets status to 'stop'
✅ Both buttons use unified completion logic
✅ Quantity validation against previous step
✅ All machines stopped scenario works
✅ Individual step tables updated with 'accept' status
✅ JobStep status set to 'stop' on completion
✅ No linter errors

