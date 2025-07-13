# Machine Management API Documentation

This document describes the Machine Management API endpoints for the NRC Backend application.

## Base URL

```
/api/machines
```

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Machine Model

```typescript
{
  id: string;           // Auto-generated CUID
  unit: string;         // e.g., "NR1", "MK", "DG"
  machineCode: string;  // e.g., "PR01", "CR01", "FL01" (not unique)
  machineType: string;  // e.g., "Printing", "Corrugation", "Flute Laminator"
  description: string;  // e.g., "Heidelberg 5-Color Printing Machine"
  type: string;         // e.g., "Automatic", "Manual", "Semi Auto"
  capacity: number;     // Capacity (8 Hours), e.g., 27000
  remarks?: string;     // Optional remarks
  status: "available" | "busy";  // Machine status
  isActive: boolean;    // Whether machine is active
  createdAt: Date;
  updatedAt: Date;
}
```

**Note:** Machine codes are not unique. Multiple machines can have the same machine code, which allows for multiple machines of the same type in different units (e.g., PR01 in NR1 unit and PR01 in NR2 unit).

## Endpoints

### 1. Get All Machines

**GET** `/api/machines`

Get all machines with optional filtering and pagination.

**Query Parameters:**

- `status` (optional): Filter by status (`available` or `busy`)
- `machineType` (optional): Filter by machine type (partial match)
- `isActive` (optional): Filter by active status (`true` or `false`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

**Response:**

```json
{
  "success": true,
  "count": 10,
  "total": 25,
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalPages": 1
  },
  "data": [
    {
      "id": "clx1234567890",
      "unit": "NR1",
      "machineCode": "PR01",
      "machineType": "Printing",
      "description": "Heidelberg 5-Color Printing Machine",
      "type": "Automatic",
      "capacity": 27000,
      "remarks": "Up to 5 color with varnish",
      "status": "available",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "jobs": []
    }
  ]
}
```

### 2. Get Available Machines

**GET** `/api/machines/available`

Get only available machines (status = available, isActive = true).

**Query Parameters:**

- `machineType` (optional): Filter by machine type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

**Response:**

```json
{
  "success": true,
  "count": 5,
  "total": 5,
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalPages": 1
  },
  "data": [
    {
      "id": "clx1234567890",
      "unit": "NR1",
      "machineCode": "PR01",
      "machineType": "Printing",
      "description": "Heidelberg 5-Color Printing Machine",
      "type": "Automatic",
      "capacity": 27000,
      "remarks": "Up to 5 color with varnish",
      "status": "available",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 3. Get Busy Machines

**GET** `/api/machines/busy`

Get only busy machines (status = busy, isActive = true) with their current jobs.

**Query Parameters:**

- `machineType` (optional): Filter by machine type
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

**Response:**

```json
{
  "success": true,
  "count": 3,
  "total": 3,
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalPages": 1
  },
  "data": [
    {
      "id": "clx1234567890",
      "unit": "NR1",
      "machineCode": "PR01",
      "machineType": "Printing",
      "description": "Heidelberg 5-Color Printing Machine",
      "type": "Automatic",
      "capacity": 27000,
      "remarks": "Up to 5 color with varnish",
      "status": "busy",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "jobs": [
        {
          "id": 1,
          "nrcJobNo": "ABC24-01-01",
          "customerName": "ABC Corp",
          "status": "ACTIVE",
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

### 4. Get Machine Statistics

**GET** `/api/machines/stats`

Get machine statistics and breakdowns.

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 25,
      "available": 15,
      "busy": 8,
      "inactive": 2
    },
    "byType": [
      {
        "machineType": "Printing",
        "_count": {
          "machineType": 10
        }
      },
      {
        "machineType": "Corrugation",
        "_count": {
          "machineType": 8
        }
      }
    ],
    "byUnit": [
      {
        "unit": "NR1",
        "_count": {
          "unit": 15
        }
      },
      {
        "unit": "MK",
        "_count": {
          "unit": 10
        }
      }
    ]
  }
}
```

### 5. Get Machine by ID

**GET** `/api/machines/:id`

Get a specific machine by its ID.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "unit": "NR1",
    "machineCode": "PR01",
    "machineType": "Printing",
    "description": "Heidelberg 5-Color Printing Machine",
    "type": "Automatic",
    "capacity": 27000,
    "remarks": "Up to 5 color with varnish",
    "status": "available",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "jobs": []
  }
}
```

### 6. Create Machine

**POST** `/api/machines`

Create a new machine. Requires admin or production_head role.

**Request Body:**

```json
{
  "unit": "NR1",
  "machineCode": "PR01",
  "machineType": "Printing",
  "description": "Heidelberg 5-Color Printing Machine",
  "type": "Automatic",
  "capacity": 27000,
  "remarks": "Up to 5 color with varnish"
}
```

**Required Fields:**

- `unit`: Machine unit (e.g., "NR1", "MK", "DG")
- `machineCode`: Machine code (e.g., "PR01", "CR01") - Not unique, multiple machines can have the same code
- `machineType`: Type of machine (e.g., "Printing", "Corrugation")
- `description`: Machine description
- `type`: Machine type (e.g., "Automatic", "Manual", "Semi Auto")
- `capacity`: Capacity in 8 hours

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "unit": "NR1",
    "machineCode": "PR01",
    "machineType": "Printing",
    "description": "Heidelberg 5-Color Printing Machine",
    "type": "Automatic",
    "capacity": 27000,
    "remarks": "Up to 5 color with varnish",
    "status": "available",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Machine created successfully"
}
```

### 7. Update Machine

**PUT** `/api/machines/:id`

Update an existing machine. Requires admin or production_head role.

**Request Body:**

```json
{
  "description": "Updated Heidelberg 5-Color Printing Machine",
  "capacity": 30000,
  "remarks": "Updated remarks"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "unit": "NR1",
    "machineCode": "PR01",
    "machineType": "Printing",
    "description": "Updated Heidelberg 5-Color Printing Machine",
    "type": "Automatic",
    "capacity": 30000,
    "remarks": "Updated remarks",
    "status": "available",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Machine updated successfully"
}
```

### 8. Update Machine Status

**PATCH** `/api/machines/:id/status`

Update machine status (available/busy). Requires admin or production_head role.

**Request Body:**

```json
{
  "status": "busy"
}
```

**Valid Status Values:**

- `"available"`: Machine is available for jobs
- `"busy"`: Machine is currently busy with a job

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "unit": "NR1",
    "machineCode": "PR01",
    "machineType": "Printing",
    "description": "Heidelberg 5-Color Printing Machine",
    "type": "Automatic",
    "capacity": 27000,
    "remarks": "Up to 5 color with varnish",
    "status": "busy",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Machine status updated to busy"
}
```

### 9. Delete Machine

**DELETE** `/api/machines/:id`

Soft delete a machine by setting isActive to false. Requires admin role.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "unit": "NR1",
    "machineCode": "PR01",
    "machineType": "Printing",
    "description": "Heidelberg 5-Color Printing Machine",
    "type": "Automatic",
    "capacity": 27000,
    "remarks": "Up to 5 color with varnish",
    "status": "available",
    "isActive": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Machine deactivated successfully"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Unit, Machine Code, Machine Type, Description, Type, and Capacity are required",
  "statusCode": 400
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Access token required",
  "statusCode": 401
}
```

### 403 Forbidden

```json
{
  "success": false,
  "message": "You are not authorized to perform this action",
  "statusCode": 403
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Machine not found",
  "statusCode": 404
}
```

## Usage Examples

### Get Available Printing Machines

```bash
curl -X GET "http://localhost:3000/api/machines/available?machineType=Printing" \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Create a New Machine

```bash
curl -X POST "http://localhost:3000/api/machines" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "unit": "NR1",
    "machineCode": "PR02",
    "machineType": "Printing",
    "description": "Heidelberg 6-Color Printing Machine",
    "type": "Automatic",
    "capacity": 30000,
    "remarks": "Up to 6 color with varnish"
  }'
```

### Update Machine Status

```bash
curl -X PATCH "http://localhost:3000/api/machines/clx1234567890/status" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "busy"}'
```

## Activity Logging

All machine operations are automatically logged to the activity log system:

- **Machine Created**: When a new machine is created
- **Machine Updated**: When machine details are updated
- **Machine Status Updated**: When machine status changes
- **Machine Deleted**: When a machine is deactivated

## Testing

Run the test script to verify the machine routes:

```bash
node test-machines.js
```
