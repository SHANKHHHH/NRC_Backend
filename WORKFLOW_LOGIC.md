# Manufacturing Workflow Logic

## Overview

The manufacturing workflow has been updated to support parallel processing of certain steps while maintaining proper dependencies for downstream processes.

## Workflow Rules

### 1. Parallel Processing
- **Corrugation** and **Printing** can run independently and in parallel
- Neither step depends on the other being completed first
- Both steps can be started simultaneously

### 2. Dependency Requirements
Steps that require **both** Corrugation and Printing to be accepted:

- **Punching**
- **SideFlapPasting** 
- **QualityDept**
- **DispatchProcess**

### 3. Sequential Processing
Steps that follow the traditional sequential workflow (require previous step to be accepted):

- **PaperStore** → **PrintingDetails** (if PrintingDetails is not parallel)
- **PaperStore** → **Corrugation** (if Corrugation is not parallel)
- **FluteLaminateBoardConversion** → **Punching** (after both Corrugation and Printing are accepted)

## API Endpoints

### Check Workflow Status
```bash
GET /api/job-planning/:nrcJobNo/workflow-status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "nrcJobNo": "NON25-07-12",
    "steps": [
      {
        "stepNo": 1,
        "stepName": "PaperStore",
        "status": "planned",
        "details": { /* step details */ }
      },
      {
        "stepNo": 2,
        "stepName": "PrintingDetails", 
        "status": "accept",
        "details": { /* step details */ }
      },
      {
        "stepNo": 3,
        "stepName": "Corrugation",
        "status": "in_progress", 
        "details": { /* step details */ }
      }
    ]
  }
}
```

### Create Steps with Workflow Validation

#### Punching (requires both Corrugation and Printing)
```bash
POST /api/punching
{
  "jobStepId": 4,
  "date": "2025-01-15T00:00:00.000Z",
  "shift": "Morning",
  "operatorName": "John Doe",
  "quantity": 1000,
  "machine": "Punch01",
  "die": "Die001"
}
```

**Validation Response (if requirements not met):**
```json
{
  "success": false,
  "message": "Corrugation step must be accepted. Printing step must be completed.",
  "requiredSteps": [
    "Corrugation (must be accepted)",
    "PrintingDetails"
  ]
}
```

## Implementation Details

### Workflow Validator (`src/utils/workflowValidator.ts`)

The workflow validation logic is centralized in a utility module that:

1. **`validateWorkflowStep()`** - Main validation function that checks if a step can proceed
2. **`validateBothCorrugationAndPrintingAccepted()`** - Specifically validates that both Corrugation and Printing are accepted
3. **`validatePreviousStepAccepted()`** - Validates traditional sequential workflow
4. **`getWorkflowStatus()`** - Returns complete workflow status for a job

### Updated Controllers

The following controllers now use the new workflow validation:

- `punchingController.ts`
- `sideFlapPastingController.ts` 
- `qualityDeptController.ts`
- `dispatchProcessController.ts`

### Error Messages

The system provides clear error messages indicating:

- Which steps are required
- Whether steps need to be completed or accepted
- Specific workflow requirements for each step

## Testing the Workflow

### Scenario 1: Parallel Processing
1. Create PaperStore step
2. Create both Corrugation and PrintingDetails steps simultaneously
3. Both can proceed independently

### Scenario 2: Dependency Validation
1. Try to create Punching step before Corrugation is accepted
2. System will return error: "Corrugation step must be accepted. Printing step must be completed."

### Scenario 3: Successful Progression
1. Complete and accept both Corrugation and PrintingDetails
2. Create Punching step - should succeed
3. Continue with subsequent steps

## Benefits

1. **Increased Efficiency** - Parallel processing reduces total production time
2. **Flexible Workflow** - Supports different manufacturing scenarios
3. **Clear Validation** - Explicit error messages guide users
4. **Maintainable Code** - Centralized workflow logic
5. **Scalable** - Easy to add new workflow rules 