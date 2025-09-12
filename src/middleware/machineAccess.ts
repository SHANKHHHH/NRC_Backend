import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './index';
import { RoleManager } from '../utils/roleUtils';

/**
 * Check if user has access to a specific machine
 */
export const checkMachineAccess = async (userId: string, machineId: string): Promise<boolean> => {
  try {
    const userMachine = await prisma.userMachine.findFirst({
      where: {
        userId,
        machineId,
        isActive: true
      }
    });
    
    return !!userMachine;
  } catch (error) {
    console.error('Error checking machine access:', error);
    return false;
  }
};

/**
 * Get user's assigned machine IDs
 */
export const getUserMachineIds = async (userId: string): Promise<string[]> => {
  try {
    const userMachines = await prisma.userMachine.findMany({
      where: {
        userId,
        isActive: true
      },
      select: { machineId: true }
    });
    
    return userMachines.map(um => um.machineId);
  } catch (error) {
    console.error('Error getting user machine IDs:', error);
    return [];
  }
};

/**
 * Check if user has access to a job's machine
 */
export const checkJobMachineAccess = async (userId: string, nrcJobNo: string): Promise<boolean> => {
  try {
    const job = await prisma.job.findUnique({
      where: { nrcJobNo },
      select: { machineId: true }
    });
    
    if (!job || !job.machineId) {
      return false;
    }
    
    return await checkMachineAccess(userId, job.machineId);
  } catch (error) {
    console.error('Error checking job machine access:', error);
    return false;
  }
};

/**
 * Check if user has access to a purchase order's machines
 */
export const checkPOMachineAccess = async (userId: string, poId: number): Promise<boolean> => {
  try {
    const userMachineIds = await getUserMachineIds(userId);
    
    if (userMachineIds.length === 0) {
      return false;
    }
    
    // Check direct PO-machine assignments
    const poMachineAssignment = await prisma.purchaseOrderMachine.findFirst({
      where: {
        purchaseOrderId: poId,
        machineId: { in: userMachineIds }
      }
    });
    
    if (poMachineAssignment) {
      return true;
    }
    
    // Check if PO is linked to a job on user's machine
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { job: { select: { machineId: true } } }
    });
    
    if (po?.job?.machineId) {
      return userMachineIds.includes(po.job.machineId);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking PO machine access:', error);
    return false;
  }
};

/**
 * Middleware to require machine access for job operations
 */
export const requireJobMachineAccess = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const nrcJobNo = req.params.nrcJobNo || req.body.nrcJobNo;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!nrcJobNo) {
    throw new AppError('Job number is required', 400);
  }

  // Admin and flying squad can access all jobs
  const userRole = req.user?.role;
  if (userRole && (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole))) {
    return next();
  }

  const hasAccess = await checkJobMachineAccess(userId, nrcJobNo);
  
  if (!hasAccess) {
    throw new AppError('Access denied: You do not have access to this job\'s machine', 403);
  }

  next();
};

/**
 * Middleware to require machine access for purchase order operations
 */
export const requirePOMachineAccess = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const poId = req.params.poId || req.body.poId;

  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  if (!poId) {
    throw new AppError('Purchase Order ID is required', 400);
  }

  // Admin and flying squad can access all POs
  const userRole = req.user?.role;
  if (userRole && (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole))) {
    return next();
  }

  const hasAccess = await checkPOMachineAccess(userId, parseInt(poId));
  
  if (!hasAccess) {
    throw new AppError('Access denied: You do not have access to this purchase order\'s machines', 403);
  }

  next();
};

/**
 * Middleware to add machine filtering to requests
 * This adds user's machine IDs to the request object for use in controllers
 */
export const addMachineFiltering = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;

  if (!userId) {
    return next();
  }

  // Admin and flying squad can see all data
  const userRole = req.user?.role;
  if (userRole && (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole))) {
    req.userMachineIds = null; // null means no filtering
    return next();
  }

  try {
    const userMachineIds = await getUserMachineIds(userId);
    req.userMachineIds = userMachineIds;
  } catch (error) {
    console.error('Error adding machine filtering:', error);
    req.userMachineIds = [];
  }

  next();
};

// Extend Request interface to include userMachineIds
declare global {
  namespace Express {
    interface Request {
      userMachineIds?: string[] | null;
    }
  }
}