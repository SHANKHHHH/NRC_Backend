# Enhanced Held Machines API Documentation

## Overview
The enhanced `held-machines` API now includes comprehensive job planning details and supports filtering by Purchase Order (PO) number. This API provides detailed information about machines that are currently on hold, along with complete job planning and step details.

## Endpoint
```
GET /api/job-step-machines/held-machines
```

## Authentication
- **Required**: Bearer token in Authorization header
- **Roles**: Admin and Planner only

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `poNumber` | string | null | Filter results by specific Purchase Order number |
| `includeJobPlanningDetails` | boolean | true | Include comprehensive job planning details in response |

## Response Structure

### Success Response (200)
```json
{
  "success": true,
  "message": "Found X jobs with held machines for PO: PO-12345",
  "data": {
    "totalHeldJobs": 5,
    "totalHeldMachines": 12,
    "queryParameters": {
      "poNumber": "PO-12345",
      "includeJobPlanningDetails": true
    },
    "heldJobs": [
      {
        "jobDetails": {
          "nrcJobNo": "NRC-2024-001",
          "customerName": "ABC Corp",
          "styleItemSKU": "SKU-001",
          "fluteType": "B-Flute",
          "status": "ACTIVE",
          "jobDemand": "high",
          "boxDimensions": "100x50x30",
          "noOfColor": "4",
          "imageURL": "https://example.com/image.jpg",
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-01T00:00:00Z",
          // Additional job details
          "length": 100.0,
          "width": 50.0,
          "height": "30",
          "diePunchCode": 12345,
          "boardCategory": "Premium",
          "processColors": "CMYK",
          "specialColor1": "Pantone 286",
          "specialColor2": "Pantone 186",
          "specialColor3": null,
          "specialColor4": null,
          "overPrintFinishing": "UV Coating",
          "topFaceGSM": "250",
          "flutingGSM": "150",
          "bottomLinerGSM": "200",
          "decalBoardX": "100",
          "lengthBoardY": "50",
          "boardSize": "100x50",
          "noUps": "2",
          "artworkReceivedDate": "2024-01-01T00:00:00Z",
          "artworkApprovedDate": "2024-01-02T00:00:00Z",
          "shadeCardApprovalDate": "2024-01-03T00:00:00Z",
          "sharedCardDiffDate": 2,
          "srNo": 1.0,
          "noOfSheets": 1000,
          "isMachineDetailsFilled": true,
          "createdBy": {
            "id": "user-123",
            "name": "John Doe",
            "email": "john@example.com",
            "role": "planner"
          }
        },
        "purchaseOrders": [
          {
            "id": 1,
            "poNumber": "PO-12345",
            "customer": "ABC Corp",
            "totalPOQuantity": 1000,
            "pendingQuantity": 500,
            "deliveryDate": "2024-02-01T00:00:00Z",
            "nrcDeliveryDate": "2024-01-25T00:00:00Z",
            "poDate": "2024-01-01T00:00:00Z",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z",
            "jobPlannings": [
              {
                "jobPlanId": 1,
                "jobDemand": "high",
                "createdAt": "2024-01-01T00:00:00Z",
                "updatedAt": "2024-01-01T00:00:00Z",
                "stepsCount": 8,
                "steps": [
                  {
                    "stepId": 1,
                    "stepNo": 1,
                    "stepName": "PaperStore",
                    "status": "completed",
                    "startDate": "2024-01-01T00:00:00Z",
                    "endDate": "2024-01-02T00:00:00Z",
                    "user": "user-123",
                    "completedBy": "user-123"
                  }
                  // ... more steps
                ]
              }
            ]
          }
        ],
        "steps": [
          {
            "stepNo": 1,
            "stepName": "PaperStore",
            "stepStatus": "completed",
            "stepStartDate": "2024-01-01T00:00:00Z",
            "stepEndDate": "2024-01-02T00:00:00Z",
            "stepUser": "user-123",
            "stepCompletedBy": "user-123",
            "machineDetails": [],
            "hasHeldMachines": false,
            "heldMachinesCount": 0,
            "heldMachines": [],
            "stepSpecificData": {},
            "stepHoldRemark": null
          }
          // ... more steps
        ],
        "totalHeldMachines": 2,
        "jobPlanningDetails": {
          "jobPlanningId": 1,
          "jobDemand": "high",
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-01T00:00:00Z",
          "purchaseOrderDetails": {
            "id": 1,
            "poNumber": "PO-12345",
            "customer": "ABC Corp",
            "totalPOQuantity": 1000,
            "pendingQuantity": 500,
            "deliveryDate": "2024-02-01T00:00:00Z",
            "nrcDeliveryDate": "2024-01-25T00:00:00Z",
            "poDate": "2024-01-01T00:00:00Z",
            "status": "ACTIVE",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-01T00:00:00Z"
          },
          "allStepsDetails": [
            {
              "stepId": 1,
              "stepNo": 1,
              "stepName": "PaperStore",
              "status": "completed",
              "startDate": "2024-01-01T00:00:00Z",
              "endDate": "2024-01-02T00:00:00Z",
              "user": "user-123",
              "completedBy": "user-123",
              "createdAt": "2024-01-01T00:00:00Z",
              "updatedAt": "2024-01-01T00:00:00Z",
              "machineDetails": [],
              "stepSpecificData": {
                "paperStore": {
                  "id": 1,
                  "requiredQty": 1000,
                  "availableQty": 1000,
                  "sheetSize": "100x50",
                  "gsm": 250
                },
                "printingDetails": null,
                "corrugation": null,
                "flutelam": null,
                "punching": null,
                "qualityDept": null,
                "sideFlapPasting": null,
                "dispatchProcess": null
              },
              "machineAssignments": [
                {
                  "jobStepMachineId": "jsm-123",
                  "machineId": "machine-123",
                  "machineCode": "M001",
                  "machineType": "PaperStore",
                  "unit": "pcs",
                  "description": "Paper Store Machine 1",
                  "capacity": 1000,
                  "status": "hold",
                  "startedAt": "2024-01-01T00:00:00Z",
                  "completedAt": null,
                  "userId": "user-123",
                  "userName": "John Doe",
                  "userEmail": "john@example.com",
                  "userRole": "operator",
                  "quantity": 1000,
                  "remarks": "Hold for quality check",
                  "formData": {},
                  "requiredQty": 1000,
                  "availableQty": 1000,
                  "sheetSize": "100x50",
                  "gsm": 250,
                  "colorsUsed": null,
                  "processColors": null,
                  "specialColors": null,
                  "inksUsed": null,
                  "coatingType": null,
                  "quantityOK": null,
                  "fluteType": null,
                  "gsm1": null,
                  "gsm2": null,
                  "size": null,
                  "sheetsCount": null,
                  "okQuantity": null,
                  "dieUsed": null,
                  "rejectedQty": null
                }
              ]
            }
            // ... more steps
          ]
        },
        "artworks": [
          {
            "id": 1,
            "artworkType": "PDF",
            "filePath": "/artworks/job-001.pdf",
            "uploadedAt": "2024-01-01T00:00:00Z",
            "status": "approved"
          }
        ]
      }
    ]
  }
}
```

## Usage Examples

### 1. Get all held machines with job planning details
```bash
curl -X GET "http://localhost:3000/api/job-step-machines/held-machines?includeJobPlanningDetails=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 2. Filter by specific PO number
```bash
curl -X GET "http://localhost:3000/api/job-step-machines/held-machines?poNumber=PO-12345&includeJobPlanningDetails=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 3. Get held machines without job planning details (faster response)
```bash
curl -X GET "http://localhost:3000/api/job-step-machines/held-machines?includeJobPlanningDetails=false" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 4. JavaScript/Node.js Example
```javascript
const axios = require('axios');

async function getHeldMachinesForPO(poNumber) {
  try {
    const response = await axios.get('http://localhost:3000/api/job-step-machines/held-machines', {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN',
        'Content-Type': 'application/json'
      },
      params: {
        poNumber: poNumber,
        includeJobPlanningDetails: true
      }
    });

    console.log('Held jobs:', response.data.data.totalHeldJobs);
    console.log('Held machines:', response.data.data.totalHeldMachines);
    
    return response.data.data.heldJobs;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Usage
getHeldMachinesForPO('PO-12345');
```

## Key Features

### 1. **PO Filtering**
- Filter held machines by specific Purchase Order number
- Useful for tracking machines on hold for specific orders

### 2. **Comprehensive Job Planning Details**
- Complete job planning information including all steps
- Step-specific data for each process (PaperStore, Printing, Corrugation, etc.)
- Machine assignments for each step
- Form data and work progress details

### 3. **Enhanced Job Information**
- Complete job details including dimensions, colors, materials
- Artwork information
- User who created the job
- Purchase order details with job plannings

### 4. **Machine Assignment Details**
- Complete machine information
- User assignments and roles
- Work progress and form data
- Step-specific form fields

### 5. **Performance Optimization**
- Option to exclude job planning details for faster responses
- Efficient database queries with proper indexing

## Error Responses

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Only admin and planner roles can view held machines.",
  "error": "Insufficient permissions"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to get held machines",
  "error": "Database connection error"
}
```

## Database Schema Dependencies

The API relies on the following database relationships:
- `JobStepMachine` → `Job` → `PurchaseOrder` → `JobPlanning` → `JobStep`
- `JobStepMachine` → `Machine` → Machine details
- `JobStepMachine` → `User` → User details
- `JobStep` → Step-specific tables (PaperStore, PrintingDetails, etc.)

## Performance Considerations

1. **Large Datasets**: For large datasets, consider using pagination
2. **Job Planning Details**: Set `includeJobPlanningDetails=false` for faster responses when detailed planning info is not needed
3. **PO Filtering**: Use PO filtering to reduce response size when looking for specific orders
4. **Database Indexing**: Ensure proper indexes on `status`, `nrcJobNo`, and `poNumber` fields

## Testing

Use the provided test script:
```bash
node test-enhanced-held-machines-api.js
```

Make sure to update the `AUTH_TOKEN` and test with actual PO numbers from your database.
