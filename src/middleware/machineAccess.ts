import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './index';
import { RoleManager } from '../utils/roleUtils';

// Extend Request interface to include userRole
declare global {
  namespace Express {
    interface Request {
      userRole?: string;
    }
  }
}

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
      req.userRole = userRole; // Pass user role for high demand filtering
      return next();
    }

    if (!userId || !userRole) {
      throw new AppError('Authentication required for machine-based filtering', 401);
    }

    const userMachineIds = await getUserMachineIds(userId, userRole);
    req.userMachineIds = userMachineIds;
    req.userRole = userRole; // Pass user role for high demand filtering
    
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

/**
 * Check machine access for job step operations
 */
export const checkJobStepMachineAccess = async (userId: string, userRole: string, jobStepId: number): Promise<boolean> => {
  // Admins and Flying Squad members have access to all job steps
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return true;
  }

  // Get the job step and check machine access
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    select: { machineDetails: true }
  });

  if (!jobStep?.machineDetails || !Array.isArray(jobStep.machineDetails) || jobStep.machineDetails.length === 0) {
    return false; // No machine details means no access
  }

  const hasAccess = await Promise.all(
    jobStep.machineDetails.map((machine: any) => {
      const machineId = (machine && typeof machine === 'object') ? (machine.machineId || (machine as any).id) : machine;
      return checkMachineAccess(userId, userRole, machineId);
    })
  );
  
  return hasAccess.some(access => access);
};

/**
 * Helper function to check if step matches user's role
 */
function isStepForUserRole(stepName: string, userRole: string): boolean {
  const roleStepMapping = {
    'printer': 'PrintingDetails',
    'corrugator': 'Corrugation', 
    'punching_operator': 'Punching',
    'pasting_operator': 'SideFlapPasting',
    'flutelaminator': 'FluteLaminateBoardConversion',
    'paperstore': 'PaperStore',
    'qc_manager': 'QualityDept',
    'dispatch_executive': 'DispatchProcess'
  } as const;

  try {
    const roles = JSON.parse(userRole);
    if (Array.isArray(roles)) {
      return roles.some(r => (roleStepMapping as any)[r] === stepName);
    }
  } catch {
    // Single role string
  }
  return (roleStepMapping as any)[userRole] === stepName;
}

/**
 * Allow role-based bypass of machine access in high-demand mode
 */
export const allowHighDemandBypass = async (
  userRole: string,
  stepName: string,
  nrcJobNo: string
): Promise<boolean> => {
  try {
    const job = await prisma.job.findFirst({ where: { nrcJobNo }, select: { jobDemand: true } });
    if (job?.jobDemand === 'high' && isStepForUserRole(stepName, userRole)) {
      return true;
    }
  } catch {
    // fallthrough: no bypass
  }
  return false;
};

/**
 * Get filtered job step IDs based on user machine access and high demand jobs
 */
export const getFilteredJobStepIds = async (userMachineIds: string[] | null, userRole: string): Promise<number[]> => {
  if (userMachineIds === null || userMachineIds.length === 0) {
    // Admin/flying squad - return all job step IDs
    const allJobSteps = await prisma.jobStep.findMany({ select: { id: true } });
    return allJobSteps.map(js => js.id);
  }

  // Get all job steps with their machine details and planning/job info
  const allJobSteps = await prisma.jobStep.findMany({
    select: { 
      id: true, 
      machineDetails: true,
      stepName: true,
      jobPlanning: { select: { nrcJobNo: true } }
    }
  });

  const filteredJobSteps: number[] = [];
  for (const jobStep of allJobSteps) {
    // High-demand visibility: role-based visibility regardless of machine
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: jobStep.jobPlanning.nrcJobNo },
      select: { jobDemand: true }
    });
    if (job?.jobDemand === 'high' && isStepForUserRole(jobStep.stepName, userRole)) {
      filteredJobSteps.push(jobStep.id);
      continue;
    }

    // Normal visibility:
    // - If no machines assigned to the step, allow role-based visibility
    if (!Array.isArray(jobStep.machineDetails) || jobStep.machineDetails.length === 0) {
      if (isStepForUserRole(jobStep.stepName, userRole)) {
        filteredJobSteps.push(jobStep.id);
      }
      continue;
    }
    const hasMachineAccess = jobStep.machineDetails.some((machine: any) => {
      const mid = (machine && typeof machine === 'object') ? (machine.machineId || (machine as any).id) : machine;
      return typeof mid === 'string' && userMachineIds.includes(mid);
    });
    if (hasMachineAccess) filteredJobSteps.push(jobStep.id);
  }

  return filteredJobSteps;
};

/**
 * Get filtered job numbers based on user machine access (for job-level filtering)
 */
export const getFilteredJobNumbers = async (userMachineIds: string[] | null, userRole: string): Promise<string[]> => {
  if (userMachineIds === null || userMachineIds.length === 0) {
    // Admin/flying squad - return all job numbers
    const allJobs = await prisma.job.findMany({
      select: { nrcJobNo: true }
    });
    return allJobs.map(job => job.nrcJobNo);
  }

  // Include job-level machine filtering (job.machineId) OR step-level machine filtering
  const [jobs, jobPlannings] = await Promise.all([
    prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),
    prisma.jobPlanning.findMany({
      select: { nrcJobNo: true, steps: { select: { machineDetails: true, stepNo: true, stepName: true } } }
    })
  ]);

  const jobLevelAccessible = jobs
    .filter(j => (j.machineId && userMachineIds.includes(j.machineId)) || j.jobDemand === 'high')
    .map(j => j.nrcJobNo);

  const planningLevelAccessible = jobPlannings
    .filter(p => p.steps.some(s => {
      // High-demand grants role-based visibility regardless of machine
      const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';
      if (highDemandJob && isStepForUserRole(s.stepName, userRole)) return true;
      // Otherwise in normal mode:
      // - If step has no machine assignment, allow role-based visibility
      if (!Array.isArray(s.machineDetails) || s.machineDetails.length === 0) {
        return isStepForUserRole(s.stepName, userRole);
      }
      // - Or require machine match
      return Array.isArray(s.machineDetails) && s.machineDetails.some((m: any) => {
        const mid = (m && typeof m === 'object') ? (m.machineId || (m as any).id) : m;
        return typeof mid === 'string' && userMachineIds.includes(mid);
      });
    }))
    .map(p => p.nrcJobNo);

  const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);
  return Array.from(set);
};