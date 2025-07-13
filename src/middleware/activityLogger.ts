import { Request, Response, NextFunction } from 'express';
import { logUserAction, ActionTypes } from '../lib/logger';

/**
 * Middleware to automatically log user actions based on HTTP method and route
 */
export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  // Only log if user is authenticated
  if (!req.user?.userId) {
    return next();
  }

  const userId = req.user.userId;
  const method = req.method;
  const path = req.path;
  const resourceId = req.params.id || req.params.nrcJobNo || req.params.jobNrcJobNo;

  // Define action mappings based on HTTP method and route patterns
  const getActionForRoute = (method: string, path: string): string | null => {
    // Job routes
    if (path.includes('/jobs') && method === 'POST') return ActionTypes.JOB_CREATED;
    if (path.includes('/jobs') && method === 'PUT') return ActionTypes.JOB_UPDATED;
    if (path.includes('/jobs') && method === 'DELETE') return ActionTypes.JOB_DELETED;
    if (path.includes('/jobs') && path.includes('/hold') && method === 'PUT') return ActionTypes.JOB_HOLD;
    if (path.includes('/jobs') && path.includes('/activate') && method === 'PUT') return ActionTypes.JOB_ACTIVATED;

    // Purchase Order routes
    if (path.includes('/purchase-orders') && method === 'POST') return ActionTypes.PO_CREATED;
    if (path.includes('/purchase-orders') && method === 'PUT') return ActionTypes.PO_UPDATED;
    if (path.includes('/purchase-orders') && path.includes('/approve') && method === 'PUT') return ActionTypes.PO_APPROVED;

    // Production step routes
    if (path.includes('/paper-store') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/printing-details') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/corrugation') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/flute-laminate-board-conversion') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/punching') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/side-flap-pasting') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/quality-dept') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;
    if (path.includes('/dispatch-process') && method === 'POST') return ActionTypes.PRODUCTION_STEP_STARTED;

    // User management routes
    if (path.includes('/auth/register') && method === 'POST') return ActionTypes.USER_CREATED;
    if (path.includes('/auth/login') && method === 'POST') return ActionTypes.USER_LOGIN;
    if (path.includes('/users') && method === 'PUT') return ActionTypes.USER_UPDATED;
    if (path.includes('/users') && method === 'DELETE') return ActionTypes.USER_DEACTIVATED;

    return null;
  };

  const action = getActionForRoute(method, path);
  
  if (action) {
    // Log the action asynchronously (don't wait for it)
    logUserAction(
      userId, 
      action, 
      `${method} ${path}${resourceId ? ` - Resource ID: ${resourceId}` : ''}`
    ).catch(error => {
      console.error('Failed to log activity:', error);
    });
  }

  next();
};

/**
 * Middleware to log specific actions with custom details
 */
export const logSpecificAction = (action: string, getDetails?: (req: Request, res: Response) => string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.userId) {
      return next();
    }

    const details = getDetails ? getDetails(req, res) : undefined;
    
    logUserAction(req.user.userId, action, details).catch(error => {
      console.error('Failed to log specific action:', error);
    });

    next();
  };
}; 