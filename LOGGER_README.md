# User Action Logger System

This document explains how to use the user action logging system in the NRC Backend application.

## Overview

The logging system tracks user actions and stores them in the `ActivityLog` table. This provides an audit trail of who performed what actions and when.

## Components

### 1. Logger Utility (`src/lib/logger.ts`)

Core logging functions:

- `logUserAction(userId, action, details?)` - Basic logging
- `logUserActionWithResource(userId, action, details?, resourceType?, resourceId?)` - Enhanced logging with resource context
- `ActionTypes` - Predefined action constants for consistency

### 2. Activity Logger Middleware (`src/middleware/activityLogger.ts`)

Automatic logging middleware that:

- Logs actions based on HTTP method and route patterns
- Provides `logSpecificAction()` for custom logging scenarios

### 3. Activity Log Controller (`src/controllers/activityLogController.ts`)

Endpoints to view and manage activity logs:

- `GET /api/activity-logs` - Get all logs (admin only)
- `GET /api/activity-logs/summary` - Get activity summary (admin only)
- `GET /api/activity-logs/user/:userId` - Get logs for specific user
- `GET /api/activity-logs/job/:nrcJobNo` - Get logs for specific job

## Usage Examples

### Manual Logging in Controllers

```typescript
import {
  logUserAction,
  logUserActionWithResource,
  ActionTypes,
} from "../lib/logger";

// Basic logging
await logUserAction(
  req.user.userId,
  "Job Created",
  "Created job for customer ABC"
);

// Enhanced logging with resource context
await logUserActionWithResource(
  req.user.userId,
  ActionTypes.JOB_CREATED,
  "Customer: ABC Corp, Style: SKU123",
  "Job",
  "ABC24-01-01"
);
```

### Automatic Logging

The middleware automatically logs actions based on route patterns:

- `POST /api/jobs` → "Job Created"
- `PUT /api/jobs/:nrcJobNo` → "Job Updated"
- `DELETE /api/jobs/:nrcJobNo` → "Job Deleted"
- `POST /api/auth/login` → "User Login"

### Custom Middleware Logging

```typescript
import { logSpecificAction } from "../middleware/activityLogger";

// Log specific action with custom details
router.post(
  "/custom-action",
  logSpecificAction("Custom Action", (req, res) => {
    return `Custom details: ${req.body.someField}`;
  }),
  yourController
);
```

## API Endpoints

### Get All Activity Logs (Admin Only)

```
GET /api/activity-logs?page=1&limit=50&userId=NRC001&action=Job&startDate=2024-01-01&endDate=2024-12-31
```

Query Parameters:

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)
- `userId` - Filter by user ID
- `action` - Filter by action (partial match)
- `startDate` - Filter from date (ISO format)
- `endDate` - Filter to date (ISO format)

### Get Activity Summary (Admin Only)

```
GET /api/activity-logs/summary
```

Returns:

- Activity counts (today, week, month, total)
- Top actions
- Top users

### Get User Activity Logs

```
GET /api/activity-logs/user/NRC001?page=1&limit=50
```

Users can only view their own logs unless they're admin.

### Get Job Activity Logs

```
GET /api/activity-logs/job/ABC24-01-01
```

Returns all activity logs related to a specific job.

## Predefined Action Types

```typescript
export const ActionTypes = {
  // Job actions
  JOB_CREATED: "Job Created",
  JOB_UPDATED: "Job Updated",
  JOB_DELETED: "Job Deleted",
  JOB_HOLD: "Job Put On Hold",
  JOB_ACTIVATED: "Job Activated",

  // Purchase Order actions
  PO_CREATED: "Purchase Order Created",
  PO_UPDATED: "Purchase Order Updated",
  PO_APPROVED: "Purchase Order Approved",

  // Production actions
  PRODUCTION_STEP_STARTED: "Production Step Started",
  PRODUCTION_STEP_COMPLETED: "Production Step Completed",
  PRODUCTION_STEP_REJECTED: "Production Step Rejected",

  // User actions
  USER_LOGIN: "User Login",
  USER_LOGOUT: "User Logout",
  USER_CREATED: "User Created",
  USER_UPDATED: "User Updated",
  USER_DEACTIVATED: "User Deactivated",

  // System actions
  SYSTEM_BACKUP: "System Backup",
  SYSTEM_MAINTENANCE: "System Maintenance",
};
```

## Database Schema

The `ActivityLog` model in Prisma schema:

```prisma
model ActivityLog {
  id        String   @id @default(cuid())
  user      User?    @relation(fields: [userId], references: [id])
  userId    String?
  action    String
  details   String?
  createdAt DateTime @default(now())
}
```

## Security Considerations

1. **Access Control**: Only admins can view all activity logs
2. **User Privacy**: Users can only view their own logs
3. **Data Retention**: Consider implementing log rotation/cleanup
4. **Performance**: Logging is asynchronous to avoid blocking requests

## Error Handling

The logger includes error handling:

- Database logging failures are logged to console
- Logging errors don't break the main application flow
- Graceful degradation when logging is unavailable

## Best Practices

1. **Use ActionTypes**: Use predefined action types for consistency
2. **Include Context**: Provide meaningful details in the details field
3. **Resource Linking**: Use `logUserActionWithResource` when possible
4. **Performance**: Don't log sensitive information
5. **Monitoring**: Regularly check log volume and performance impact

## Integration

The logging system is integrated into:

- Server middleware (automatic route-based logging)
- Job controller (manual logging for CRUD operations)
- Auth controller (login/logout/user management logging)
- All production step controllers (via middleware)

## Future Enhancements

Potential improvements:

- Log export functionality
- Real-time log streaming
- Advanced filtering and search
- Log analytics and reporting
- Integration with external monitoring tools
