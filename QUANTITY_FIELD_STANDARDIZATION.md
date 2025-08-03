# Quantity Field Standardization

## Overview
All 8 production steps now use a standardized `quantity` field for the main quantity value. This simplifies frontend integration and provides consistency across all endpoints.

## Updated Production Steps

### 1. PaperStore
- **Field**: `quantity` (Int?)
- **Description**: Required quantity for the job
- **Previous field**: `required`

### 2. PrintingDetails
- **Field**: `quantity` (Int?)
- **Description**: OK quantity after printing and finishing
- **Previous field**: `postPrintingFinishingOkQty`

### 3. Corrugation
- **Field**: `quantity` (Int?)
- **Description**: Number of sheets processed
- **Previous field**: `noOfSheets`

### 4. FluteLaminateBoardConversion
- **Field**: `quantity` (Int?)
- **Description**: OK quantity after conversion
- **Previous field**: `okQty`

### 5. Punching
- **Field**: `quantity` (Int?)
- **Description**: OK quantity after punching
- **Previous field**: `okQty`

### 6. SideFlapPasting
- **Field**: `quantity` (Int?)
- **Description**: Quantity processed (already standardized)
- **Previous field**: `quantity` (no change)

### 7. QualityDept
- **Field**: `quantity` (Int?)
- **Description**: Passed quantity (good quality)
- **Previous field**: `passQty`
- **Note**: `rejectedQty` is still available as a separate field

### 8. DispatchProcess
- **Field**: `quantity` (Int?)
- **Description**: Number of boxes dispatched
- **Previous field**: `noOfBoxes`
- **Note**: `balanceQty` is still available as a separate field

## API Usage

### Request Format
All production step endpoints now accept the same standardized format:

```json
{
  "jobStepId": 123,
  "quantity": 1000,
  "wastage": 50,
  "date": "2024-01-15",
  "shift": "Morning",
  "operatorName": "John Doe",
  // ... other step-specific fields
}
```

### Response Format
All endpoints return the standardized quantity field:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "jobNrcJobNo": "NRC001",
    "quantity": 1000,
    "wastage": 50,
    "status": "in_progress",
    // ... other fields
  },
  "message": "Step created successfully"
}
```

## Endpoints

All existing endpoints remain the same, only the field names have been standardized:

- `POST /api/paper-store` - Create PaperStore step
- `POST /api/printing-details` - Create PrintingDetails step
- `POST /api/corrugation` - Create Corrugation step
- `POST /api/flute-laminate-board-conversion` - Create FluteLaminateBoardConversion step
- `POST /api/punching` - Create Punching step
- `POST /api/side-flap-pasting` - Create SideFlapPasting step
- `POST /api/quality-dept` - Create QualityDept step
- `POST /api/dispatch-process` - Create DispatchProcess step

## Migration Notes

- The old field names are preserved in the database as comments for reference
- All existing functionality remains the same
- No breaking changes to API endpoints
- Only the field name has been standardized to `quantity`

## Frontend Implementation

Your frontend can now use a consistent approach for all production steps:

```typescript
interface ProductionStepData {
  jobStepId: number;
  quantity: number;
  wastage?: number;
  date?: string;
  shift?: string;
  operatorName?: string;
  // ... other optional fields
}

// Use the same interface for all 8 production steps
const createStep = async (stepType: string, data: ProductionStepData) => {
  const response = await fetch(`/api/${stepType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
};
``` 