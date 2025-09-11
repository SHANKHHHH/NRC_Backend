import { prisma } from './prisma';

/**
 * Logs a user action to the ActivityLog table.
 * @param userId - The ID of the user performing the action.
 * @param action - A short description of the action.
 * @param details - Optional details about the action.
 * @param nrcJobNo - Optional NRC job number associated with the action.
 */
export async function logUserAction(userId: string, action: string, details?: string, nrcJobNo?: string) {
  try {
    // First check if the user exists in the User table
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!userExists) {
      // User doesn't exist, log to console instead
      console.log(`User Action Log (Console Only): ${new Date().toISOString()} - User: ${userId} (not found in DB) - Action: ${action} - Details: ${details || 'N/A'} - NRC Job No: ${nrcJobNo || 'N/A'}`);
      return;
    }

    // User exists, proceed with database logging
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
        nrcJobNo,
      },
    });
  } catch (error) {
    // Log to console if database logging fails
    console.error('Failed to log user action to database:', error);
    console.log(`User Action Log: ${new Date().toISOString()} - User: ${userId} - Action: ${action} - Details: ${details || 'N/A'} - NRC Job No: ${nrcJobNo || 'N/A'}`);
  }
}

/**
 * Logs a user action with additional context.
 * @param userId - The ID of the user performing the action.
 * @param action - A short description of the action.
 * @param details - Optional details about the action.
 * @param resourceType - Type of resource being acted upon (e.g., 'Job', 'PurchaseOrder').
 * @param resourceId - ID of the resource being acted upon.
 * @param nrcJobNo - Optional NRC job number associated with the action.
 */
export async function logUserActionWithResource(
  userId: string, 
  action: string, 
  details?: string, 
  resourceType?: string, 
  resourceId?: string,
  nrcJobNo?: string
) {
  const enhancedDetails = [
    details,
    resourceType && resourceId ? `Resource: ${resourceType} (${resourceId})` : null
  ].filter(Boolean).join(' | ');

  await logUserAction(userId, action, enhancedDetails || undefined, nrcJobNo);
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
  JOB_COMPLETED: 'Job Completed',
  
  // User actions
  USER_LOGIN: 'User Login',
  USER_LOGOUT: 'User Logout',
  USER_CREATED: 'User Created',
  USER_UPDATED: 'User Updated',
  USER_DEACTIVATED: 'User Deactivated',
  USER_ROLE_ADDED: 'User Role Added',
  USER_ROLE_REMOVED: 'User Role Removed',
  USER_ROLES_UPDATED: 'User Roles Updated',
  
  // QC actions
  QC_CHECK_PERFORMED: 'QC Check Performed',
  QC_CHECK_APPROVED: 'QC Check Approved',
  QC_CHECK_REJECTED: 'QC Check Rejected',
  
  // System actions
  SYSTEM_BACKUP: 'System Backup',
  SYSTEM_MAINTENANCE: 'System Maintenance',
} as const;