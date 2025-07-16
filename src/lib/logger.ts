import { prisma } from './prisma';

/**
 * Logs a user action to the ActivityLog table.
 * @param userId - The ID of the user performing the action.
 * @param action - A short description of the action.
 * @param details - Optional details about the action.
 */
export async function logUserAction(userId: string, action: string, details?: string) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
      },
    });
  } catch (error) {
    // Log to console if database logging fails
    console.error('Failed to log user action to database:', error);
    console.log(`User Action Log: ${new Date().toISOString()} - User: ${userId} - Action: ${action} - Details: ${details || 'N/A'}`);
  }
}

/**
 * Logs a user action with additional context.
 * @param userId - The ID of the user performing the action.
 * @param action - A short description of the action.
 * @param details - Optional details about the action.
 * @param resourceType - Type of resource being acted upon (e.g., 'Job', 'PurchaseOrder').
 * @param resourceId - ID of the resource being acted upon.
 */
export async function logUserActionWithResource(
  userId: string, 
  action: string, 
  details?: string, 
  resourceType?: string, 
  resourceId?: string
) {
  const enhancedDetails = [
    details,
    resourceType && resourceId ? `Resource: ${resourceType} (${resourceId})` : null
  ].filter(Boolean).join(' | ');

  await logUserAction(userId, action, enhancedDetails || undefined);
}

/**
 * Common action types for consistent logging
 */
export const ActionTypes = {
  // Job actions
  JOB_CREATED: 'Job Created',
  JOB_UPDATED: 'Job Updated',
  JOB_DELETED: 'Job Deleted',
  JOB_HOLD: 'Job Put On Hold',
  JOB_ACTIVATED: 'Job Activated',
  
  // Purchase Order actions
  PO_CREATED: 'Purchase Order Created',
  PO_UPDATED: 'Purchase Order Updated',
  PO_APPROVED: 'Purchase Order Approved',
  
  // Production actions
  PRODUCTION_STEP_STARTED: 'Production Step Started',
  PRODUCTION_STEP_COMPLETED: 'Production Step Completed',
  PRODUCTION_STEP_REJECTED: 'Production Step Rejected',
  
  // Machine actions
  MACHINE_CREATED: 'Machine Created',
  MACHINE_UPDATED: 'Machine Updated',
  MACHINE_DELETED: 'Machine Deleted',
  MACHINE_STATUS_UPDATED: 'Machine Status Updated',

  // JobPlanning and JobStep actions
  JOBPLANNING_CREATED: 'JobPlanning Created',
  JOBPLANNING_UPDATED: 'JobPlanning Updated',
  JOBPLANNING_DELETED: 'JobPlanning Deleted',
  JOBSTEP_CREATED: 'JobStep Created',
  JOBSTEP_UPDATED: 'JobStep Updated',
  JOBSTEP_DELETED: 'JobStep Deleted',
  
  // User actions
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  USER_CREATED: 'User Created',
  USER_UPDATED: 'User Updated',
  USER_DEACTIVATED: 'User Deactivated',
  
  // System actions
  SYSTEM_BACKUP: 'System Backup',
  SYSTEM_MAINTENANCE: 'System Maintenance',
} as const; 