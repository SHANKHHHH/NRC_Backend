import { Request, Response, NextFunction } from 'express';
import { AppError } from './index';
import { RoleManager } from '../utils/roleUtils';

/**
 * Middleware to restrict Flying Squad to only QC operations
 * Flying Squad can only update qcCheckSignBy and qcCheckAt fields
 */
export const restrictFlyingSquadToQC = (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.user?.role;
  
  if (!userRole) {
    throw new AppError('User role not found', 401);
  }

  // If user is not Flying Squad, allow normal access
  if (!RoleManager.isFlyingSquad(userRole)) {
    return next();
  }

  // For Flying Squad, restrict to only QC-related fields
  const allowedFields = ['qcCheckSignBy', 'qcCheckAt', 'remarks'];
  const bodyKeys = Object.keys(req.body);
  
  // Check if any non-QC fields are being updated
  const restrictedFields = bodyKeys.filter(key => !allowedFields.includes(key));
  
  if (restrictedFields.length > 0) {
    throw new AppError(
      `Flying Squad can only update QC-related fields. Restricted fields: ${restrictedFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`, 
      403
    );
  }

  // Ensure qcCheckSignBy is set to current user
  if (req.body.qcCheckSignBy !== undefined) {
    req.body.qcCheckSignBy = req.user?.userId;
  }

  // Ensure qcCheckAt is set to current timestamp
  if (req.body.qcCheckAt !== undefined) {
    req.body.qcCheckAt = new Date();
  }

  next();
};

/**
 * Middleware to check if user can update step status
 * Flying Squad cannot update step status (planned, start, stop)
 */
export const restrictStepStatusUpdate = (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.user?.role;
  
  if (!userRole) {
    throw new AppError('User role not found', 401);
  }

  // If user is Flying Squad, block step status updates
  if (RoleManager.isFlyingSquad(userRole)) {
    if (req.body.status !== undefined) {
      throw new AppError(
        'Flying Squad cannot update step status. You can only perform QC checks.', 
        403
      );
    }
  }

  next();
};

/**
 * Middleware to check if user can update machine details
 * Flying Squad cannot update machine assignments
 */
export const restrictMachineDetailsUpdate = (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.user?.role;
  
  if (!userRole) {
    throw new AppError('User role not found', 401);
  }

  // If user is Flying Squad, block machine details updates
  if (RoleManager.isFlyingSquad(userRole)) {
    if (req.body.machineDetails !== undefined) {
      throw new AppError(
        'Flying Squad cannot update machine details. You can only perform QC checks.', 
        403
      );
    }
  }

  next();
};

/**
 * Middleware to check if user can update step timing
 * Flying Squad cannot update startDate, endDate, user fields
 */
export const restrictStepTimingUpdate = (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.user?.role;
  
  if (!userRole) {
    throw new AppError('User role not found', 401);
  }

  // If user is Flying Squad, block timing updates
  if (RoleManager.isFlyingSquad(userRole)) {
    const timingFields = ['startDate', 'endDate', 'user'];
    const restrictedFields = timingFields.filter(field => req.body[field] !== undefined);
    
    if (restrictedFields.length > 0) {
      throw new AppError(
        `Flying Squad cannot update step timing. Restricted fields: ${restrictedFields.join(', ')}. You can only perform QC checks.`, 
        403
      );
    }
  }

  next();
};

