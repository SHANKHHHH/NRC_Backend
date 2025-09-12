import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './index';
import { RoleManager } from '../utils/roleUtils';

// Extend Request interface to include userMachineIds
declare global {
  namespace Express {
    interface Request {
      userMachineIds?: string[] | null;
    }
  }
}

/**
 * Get machine IDs assigned to a user
 * Returns null for admin/flying squad (no filtering needed)
 */
export const getUserMachineIds = async (userId: string, userRole: string): Promise<string[] | null> => {
  // Admins and Flying Squad members bypass machine restrictions
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return null;
  }

  const userMachines = await prisma.userMachine.findMany({
    where: { 
      userId, 
      isActive: true 
    },
    select: { machineId: true }
  });

  return userMachines.map(um => um.machineId);
};

/**
 * Check if user has access to a specific job's machine
 */
export const checkJobMachineAccess = async (userId: string, userRole: string, jobId: number): Promise<boolean> => {
  // Admins and Flying Squad members have access to all jobs
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return true;
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { machineId: true }
  });

  if (!job || !job.machineId) {
    return false; // Job has no machine assigned
  }

  const userMachines = await prisma.userMachine.findMany({
    where: { 
      userId, 
      isActive: true,
      machineId: job.machineId
    },
    select: { id: true }
  });

  return userMachines.length > 0;
};

/**
 * Check if user has access to a specific PO's machines
 */
export const checkPOMachineAccess = async (userId: string, userRole: string, poId: number): Promise<boolean> => {
  // Admins and Flying Squad members have access to all POs
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return true;
  }

  // Get user's assigned machines
  const userMachines = await prisma.userMachine.findMany({
    where: { 
      userId, 
      isActive: true 
    },
    select: { machineId: true }
  });

  const userMachineIds = userMachines.map(um => um.machineId);

  // Check if PO is assigned to any of user's machines
  const poMachineAccess = await prisma.purchaseOrderMachine.findFirst({
    where: {
      purchaseOrderId: poId,
      machineId: { in: userMachineIds }
    }
  });

  if (poMachineAccess) {
    return true;
  }

  // Check if PO is linked to a job on user's machines
  const poJobAccess = await prisma.purchaseOrder.findFirst({
    where: {
      id: poId,
      job: {
        machineId: { in: userMachineIds }
      }
    }
  });

  return !!poJobAccess;
};

/**
 * Middleware to require machine access for job-related routes
 */
export const requireJobMachineAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const jobId = parseInt(req.params.id);

    if (!userId || !userRole) {
      throw new AppError('Authentication required', 401);
    }

    if (isNaN(jobId)) {
      throw new AppError('Invalid job ID', 400);
    }

    const hasAccess = await checkJobMachineAccess(userId, userRole, jobId);
    
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this job', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to require machine access for PO-related routes
 */
export const requirePOMachineAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const poId = parseInt(req.params.id);

    if (!userId || !userRole) {
      throw new AppError('Authentication required', 401);
    }

    if (isNaN(poId)) {
      throw new AppError('Invalid PO ID', 400);
    }

    const hasAccess = await checkPOMachineAccess(userId, userRole, poId);
    
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this purchase order', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to add machine filtering to requests
 * This middleware should be used on GET routes that need machine-based filtering
 */
export const addMachineFiltering = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    // Admins and Flying Squad members bypass machine restrictions
    if (userRole && (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole))) {
      req.userMachineIds = null; // Indicate no filtering needed
      return next();
    }

    if (!userId || !userRole) {
      throw new AppError('Authentication required for machine-based filtering', 401);
    }

    const userMachineIds = await getUserMachineIds(userId, userRole);
    req.userMachineIds = userMachineIds;
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Generic machine access check
 */
export const checkMachineAccess = async (userId: string, userRole: string, machineId: string): Promise<boolean> => {
  // Admins and Flying Squad members have access to all machines
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return true;
  }

  const userMachine = await prisma.userMachine.findFirst({
    where: {
      userId,
      machineId,
      isActive: true
    }
  });

  return !!userMachine;
};
