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
 * Returns null for admin/flying squad/planner (no filtering needed)
 */
export const getUserMachineIds = async (userId: string, userRole: string): Promise<string[] | null> => {
  // Parse role if it's a JSON string
  let parsedRole: string | string[] = userRole;
  if (typeof userRole === 'string') {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        parsedRole = roles;
      }
    } catch {
      // Not JSON, use as is
    }
  }

  // Admins, Flying Squad members, and Planners bypass machine restrictions
  const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;
  if (RoleManager.isAdmin(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.isPlanner(roleString)) {
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

    console.log('🔍 [MACHINE FILTERING DEBUG] Starting middleware:', {
      userId: userId,
      userRole: userRole,
      endpoint: req.path
    });

    // Parse role if it's a JSON string
    let parsedRole: string | string[] = userRole || '';
    if (userRole && typeof userRole === 'string') {
      try {
        const roles = JSON.parse(userRole);
        if (Array.isArray(roles)) {
          parsedRole = roles;
        }
      } catch {
        // Not JSON, use as is
      }
    }

    console.log('🔍 [MACHINE FILTERING DEBUG] Parsed role:', parsedRole);

    // Admins, Flying Squad members, and Planners bypass machine restrictions
    const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;
    if (userRole && (RoleManager.isAdmin(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.isPlanner(roleString))) {
      console.log('🔍 [MACHINE FILTERING DEBUG] Admin/Planner/Flying Squad - bypassing machine restrictions');
      req.userMachineIds = null; // Indicate no filtering needed
      req.userRole = userRole; // Pass user role for high demand filtering
      return next();
    }

    if (!userId || !userRole) {
      throw new AppError('Authentication required for machine-based filtering', 401);
    }

    const userMachineIds = await getUserMachineIds(userId, userRole);
    console.log('🔍 [MACHINE FILTERING DEBUG] User machine IDs:', {
      userId: userId,
      userRole: userRole,
      userMachineIds: userMachineIds,
      userMachineIdsLength: userMachineIds?.length || 0
    });
    
    req.userMachineIds = userMachineIds;
    req.userRole = userRole; // Pass user role for high demand filtering
    
    next();
  } catch (error) {
    console.error('❌ [MACHINE FILTERING DEBUG] Error:', error);
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
    select: { 
      machineDetails: true,
      stepName: true,
      jobPlanning: { 
        select: { nrcJobNo: true } 
      }
    }
  });

  if (!jobStep) {
    return false;
  }

  // Check for role-based access first
  if (isStepForUserRole(jobStep.stepName, userRole)) {
    return true;
  }

  // Parse machine details using enhanced parser
  const stepMachineIds = parseMachineDetails(jobStep.machineDetails);
  
  // If no machine details, no access (unless role-based access above)
  if (stepMachineIds.length === 0) {
    return false;
  }

  // Check machine-based access
  const hasAccess = await Promise.all(
    stepMachineIds.map(machineId => checkMachineAccess(userId, userRole, machineId))
  );
  
  return hasAccess.some(access => access);
};

/**
 * Check machine access for job step operations - ALL actions require machine access
 * - Start, Stop, Complete: All require machine access
 * - Shows simple "Access Denied" message instead of big popup
 */
export const checkJobStepMachineAccessWithAction = async (
  userId: string, 
  userRole: string, 
  jobStepId: number, 
  action: 'start' | 'stop' | 'complete'
): Promise<boolean> => {
  // Admins and Flying Squad members have access to all job step operations
  if (RoleManager.isAdmin(userRole) || RoleManager.isFlyingSquad(userRole)) {
    return true;
  }

  // Get the job step and check machine access
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    select: { 
      machineDetails: true,
      stepName: true,
      jobPlanning: { 
        select: { nrcJobNo: true } 
      }
    }
  });

  if (!jobStep) {
    return false;
  }

  // Check for role-based access first
  if (isStepForUserRole(jobStep.stepName, userRole)) {
    const stepMachineIds = parseMachineDetails(jobStep.machineDetails);
    
    // If no machine details, allow access for role-based users
    if (stepMachineIds.length === 0) {
      return true;
    }

    // Check machine-based access for ALL actions (start, stop, complete)
    const hasAccess = await Promise.all(
      stepMachineIds.map(machineId => checkMachineAccess(userId, userRole, machineId))
    );
    
    return hasAccess.some(access => access);
  }

  // For users without role access, check machine access for all actions
  const stepMachineIds = parseMachineDetails(jobStep.machineDetails);
  
  // If no machine details, no access
  if (stepMachineIds.length === 0) {
    return false;
  }

  // Check machine-based access for ALL actions
  const hasAccess = await Promise.all(
    stepMachineIds.map(machineId => checkMachineAccess(userId, userRole, machineId))
  );
  
  return hasAccess.some(access => access);
};

/**
 * Enhanced machine details parser that handles all database edge cases
 * Handles: 0 values, empty arrays, typos (machineld), valid JSON objects
 */
function parseMachineDetails(machineDetails: any): string[] {
  if (!machineDetails) return [];
  
  // Handle 0 values (converted to empty array)
  if (machineDetails === 0) return [];
  
  // Handle empty arrays
  if (Array.isArray(machineDetails) && machineDetails.length === 0) return [];
  
  // Handle valid JSON arrays
  if (Array.isArray(machineDetails)) {
    return machineDetails
      .map((machine: any) => {
        if (machine && typeof machine === 'object') {
          // Handle both correct and typo versions (machineld -> machineId)
          return machine.machineId || machine.machineld || machine.id;
        }
        return machine;
      })
      .filter((id: any) => typeof id === 'string' && id.length > 0);
  }
  
  return [];
}

/**
 * Helper function to check if step matches user's role
 * Enhanced to handle all role formats from database
 */
export function isStepForUserRole(stepName: string, userRole: string | string[]): boolean {
  const roleStepMapping = {
    'printer': 'PrintingDetails',
    'corrugator': 'Corrugation', 
    'punching_operator': ['Punching', 'Die Cutting'],
    'pasting_operator': 'SideFlapPasting',
    'flutelaminator': 'FluteLaminateBoardConversion',
    'paperstore': ['PaperStore', 'PrintingDetails', 'Corrugation', 'FluteLaminateBoardConversion', 'Punching', 'Die Cutting', 'SideFlapPasting', 'QualityDept', 'DispatchProcess'],
    'qc_manager': 'QualityDept',
    'dispatch_executive': ['DispatchProcess', 'PaperStore']
  } as const;

  // Handle array roles directly
  if (Array.isArray(userRole)) {
    return userRole.some(r => {
      const roleSteps = (roleStepMapping as any)[r];
      if (Array.isArray(roleSteps)) {
        return roleSteps.includes(stepName);
      }
      return roleSteps === stepName;
    });
  }

  // Handle string roles - try to parse as JSON first
  if (typeof userRole === 'string') {
    try {
      const roles = JSON.parse(userRole);
      if (Array.isArray(roles)) {
        return roles.some(r => {
          const roleSteps = (roleStepMapping as any)[r];
          if (Array.isArray(roleSteps)) {
            return roleSteps.includes(stepName);
          }
          return roleSteps === stepName;
        });
      }
    } catch {
      // Not JSON, treat as single role string
    }
    const roleSteps = (roleStepMapping as any)[userRole];
    if (Array.isArray(roleSteps)) {
      return roleSteps.includes(stepName);
    }
    return roleSteps === stepName;
  }

  return false;
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
  if (userMachineIds === null) {
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

    // Role-based visibility: If step matches user role AND has machine assignment, require machine match
    if (isStepForUserRole(jobStep.stepName, userRole)) {
      const stepMachineIds = parseMachineDetails(jobStep.machineDetails);
      if (stepMachineIds.length > 0) {
        const hasMachineAccess = stepMachineIds.some(machineId => 
          userMachineIds.includes(machineId)
        );
        if (hasMachineAccess) {
          filteredJobSteps.push(jobStep.id);
          continue;
        }
      } else {
        // If no machine details, allow access (for backward compatibility)
        filteredJobSteps.push(jobStep.id);
        continue;
      }
    }

    // Machine-based visibility: If step has machine assignment, require machine match
    const stepMachineIds = parseMachineDetails(jobStep.machineDetails);
    if (stepMachineIds.length > 0) {
      const hasMachineAccess = stepMachineIds.some(machineId => 
        userMachineIds.includes(machineId)
      );
      if (hasMachineAccess) filteredJobSteps.push(jobStep.id);
    }
  }

  return filteredJobSteps;
};

/**
 * Get filtered job numbers based on user machine access (for job-level filtering)
 */
export const getFilteredJobNumbers = async (userMachineIds: string[] | null, userRole: string): Promise<string[]> => {
  if (userMachineIds === null) {
    // Admin/flying squad - return all job numbers
    const allJobs = await prisma.job.findMany({
      select: { nrcJobNo: true }
    });
    return allJobs.map(job => job.nrcJobNo);
  }

  // Special handling for paperstore users - they can see all jobs (no machine restrictions)
  if (userRole.includes('paperstore')) {
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
      
      // Role-based visibility: If step matches user role AND has machine assignment, require machine match
      if (isStepForUserRole(s.stepName, userRole)) {
        const stepMachineIds = parseMachineDetails(s.machineDetails);
        if (stepMachineIds.length > 0) {
          return stepMachineIds.some(machineId => userMachineIds.includes(machineId));
        }
        // If no machine details, allow access (for backward compatibility)
        return true;
      }
      
      // Machine-based visibility: If step has machine assignment, require machine match
      const stepMachineIds = parseMachineDetails(s.machineDetails);
      if (stepMachineIds.length > 0) {
        return stepMachineIds.some(machineId => userMachineIds.includes(machineId));
      }
      
      return false;
    }))
    .map(p => p.nrcJobNo);

  const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);
  return Array.from(set);
};