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
 * Returns null for admin/planner/flying squad/qc_manager (no filtering needed)
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

  // Admins, Planners, Flying Squad members, and QC Managers bypass machine restrictions
  const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;
  if (RoleManager.isAdmin(roleString) || RoleManager.isPlanner(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.hasRole(roleString, 'qc_manager')) {
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
  // Admins, Planners, Flying Squad members, and QC Managers have access to all jobs
  if (RoleManager.isAdmin(userRole) || RoleManager.isPlanner(userRole) || RoleManager.isFlyingSquad(userRole) || RoleManager.hasRole(userRole, 'qc_manager')) {
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
  // Admins, Planners, Flying Squad members, and QC Managers have access to all POs
  if (RoleManager.isAdmin(userRole) || RoleManager.isPlanner(userRole) || RoleManager.isFlyingSquad(userRole) || RoleManager.hasRole(userRole, 'qc_manager')) {
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

    // Admins, Planners, Flying Squad members, and QC Managers bypass machine restrictions
    const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;
    if (userRole && (RoleManager.isAdmin(roleString) || RoleManager.isPlanner(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.hasRole(roleString, 'qc_manager'))) {
      console.log('🔍 [MACHINE FILTERING DEBUG] Admin/Planner/Flying Squad/QC Manager - bypassing machine restrictions');
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
  // Admins, Planners, Flying Squad members, and QC Managers have access to all machines
  if (RoleManager.isAdmin(userRole) || RoleManager.isPlanner(userRole) || RoleManager.isFlyingSquad(userRole) || RoleManager.hasRole(userRole, 'qc_manager')) {
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
  // Admins, Planners, Flying Squad members, and QC Managers have access to all job steps
  if (RoleManager.isAdmin(userRole) || RoleManager.isPlanner(userRole) || RoleManager.isFlyingSquad(userRole) || RoleManager.hasRole(userRole, 'qc_manager')) {
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
  // Admins, Planners, Flying Squad members, and QC Managers have access to all job step operations
  if (RoleManager.isAdmin(userRole) || RoleManager.isPlanner(userRole) || RoleManager.isFlyingSquad(userRole) || RoleManager.hasRole(userRole, 'qc_manager')) {
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
    'punching_operator': ['Punching', 'Die Cutting', 'DispatchProcess'],
    'pasting_operator': 'SideFlapPasting',
    'flutelaminator': 'FluteLaminateBoardConversion',
    'paperstore': ['PaperStore', 'DispatchProcess'],
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
    // First check job.jobDemand (existing functionality - UNCHANGED)
    const job = await prisma.job.findFirst({ where: { nrcJobNo }, select: { jobDemand: true } });
    if (job?.jobDemand === 'high' && isStepForUserRole(stepName, userRole)) {
      return true;
    }
    
    // If no Job record found, fallback to check jobPlanning.jobDemand
    // This only adds support for jobPlanning-only records without affecting existing jobs
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({ where: { nrcJobNo }, select: { jobDemand: true } });
      if (jobPlanning?.jobDemand === 'high' && isStepForUserRole(stepName, userRole)) {
        return true;
      }
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
    // Check job.jobDemand first (existing functionality - UNCHANGED)
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: jobStep.jobPlanning.nrcJobNo },
      select: { jobDemand: true }
    });
    if (job?.jobDemand === 'high' && isStepForUserRole(jobStep.stepName, userRole)) {
      filteredJobSteps.push(jobStep.id);
      continue;
    }
    
    // Fallback: If no Job record, check jobPlanning.jobDemand
    // This only adds support for jobPlanning-only records without affecting existing jobs
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: jobStep.jobPlanning.nrcJobNo },
        select: { jobDemand: true }
      });
      if (jobPlanning?.jobDemand === 'high' && isStepForUserRole(jobStep.stepName, userRole)) {
        filteredJobSteps.push(jobStep.id);
        continue;
      }
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
 * Helper function to get previous step name(s) for a given step
 * Returns array to support parallel steps (e.g., FluteLamination requires both Printing and Corrugation)
 */
function getPreviousStepNames(stepName: string): string[] {
  const stepDependencies: { [key: string]: string[] } = {
    'PaperStore': [], // First step, no dependencies
    'PrintingDetails': ['PaperStore'],
    'Corrugation': ['PaperStore'],
    'FluteLaminateBoardConversion': ['PrintingDetails', 'Corrugation'], // Requires both parallel steps
    'Punching': ['FluteLaminateBoardConversion'],
    'Die Cutting': ['FluteLaminateBoardConversion'], // Alternative to Punching
    'SideFlapPasting': ['Punching', 'Die Cutting'], // Can follow either
    'QualityDept': ['SideFlapPasting'],
    'DispatchProcess': ['QualityDept']
  };

  return stepDependencies[stepName] || [];
}

/**
 * Check if all previous steps for a given step are started/completed in a job (parallel start logic)
 */
function arePreviousStepsCompleted(steps: any[], targetStepName: string): boolean {
  const previousStepNames = getPreviousStepNames(targetStepName);
  
  // If no previous steps required, return true
  if (previousStepNames.length === 0) {
    return true;
  }

  // Check if all previous steps exist and are started or completed (status = 'start' or 'stop')
  for (const prevStepName of previousStepNames) {
    const prevStep = steps.find(s => s.stepName === prevStepName);
    
    // For parallel dependencies (like FluteLamination requiring both Printing and Corrugation)
    // we need ALL to be started or completed. But for alternatives (like SideFlapPasting after Punching OR Die Cutting)
    // we need at least ONE to be started or completed
    if (targetStepName === 'SideFlapPasting' && previousStepNames.includes('Punching') && previousStepNames.includes('Die Cutting')) {
      // Special case: SideFlapPasting needs either Punching OR Die Cutting
      const punchingStep = steps.find(s => s.stepName === 'Punching');
      const dieCuttingStep = steps.find(s => s.stepName === 'Die Cutting');
      
      const punchingReady = punchingStep && (punchingStep.status === 'start' || punchingStep.status === 'stop');
      const dieCuttingReady = dieCuttingStep && (dieCuttingStep.status === 'start' || dieCuttingStep.status === 'stop');
      
      if (!punchingReady && !dieCuttingReady) {
        return false;
      }
      // If at least one is started or completed, continue checking other dependencies
      continue;
    }
    
    // For all other cases, the previous step must exist and be started or completed/accepted
    if (!prevStep) {
      return false;
    }
    const prevStatus = typeof prevStep.status === 'string'
      ? prevStep.status.toLowerCase()
      : '';
    const allowedStatuses = new Set(['start', 'stop', 'stopped', 'completed', 'accept']);
    if (!allowedStatuses.has(prevStatus)) {
      return false;
    }
  }

  return true;
}

/**
 * Get filtered job numbers based on user machine access (for job-level filtering)
 * Now includes step dependency filtering - users only see jobs where previous steps are completed
 * Now supports pagination to prevent performance issues with large datasets
 */
export const getFilteredJobNumbers = async (
  userMachineIds: string[] | null, 
  userRole: string,
  options: { limit?: number; offset?: number } = {}
): Promise<string[]> => {
  const { limit = 7000, offset = 0 } = options;

  if (userMachineIds === null) {
    // Admin/Planner/Flying Squad/QC Manager (bypass): return union of Job and JobPlanning job numbers
    // (some plannings may not have Jobs yet)
    const [jobs, plannings] = await Promise.all([
      prisma.job.findMany({
        select: { nrcJobNo: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.jobPlanning.findMany({
        select: { nrcJobNo: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.nrcJobNo));
    plannings.forEach(p => set.add(p.nrcJobNo));
    return Array.from(set);
  }

  // Special handling for paperstore users - they can see all jobs (no machine restrictions)
  // Return union of Job and JobPlanning job numbers (same as bypass users)
  if (userRole.includes('paperstore')) {
    const [jobs, plannings] = await Promise.all([
      prisma.job.findMany({
        select: { nrcJobNo: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.jobPlanning.findMany({
        select: { nrcJobNo: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);
    const set = new Set<string>();
    jobs.forEach(j => set.add(j.nrcJobNo));
    plannings.forEach(p => set.add(p.nrcJobNo));
    return Array.from(set);
  }

  // Include job-level machine filtering (job.machineId) OR step-level machine filtering
  const [jobs, jobPlannings] = await Promise.all([
    prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),
    prisma.jobPlanning.findMany({
      select: { 
        nrcJobNo: true, 
        jobDemand: true, 
        steps: { 
          select: { machineDetails: true, stepNo: true, stepName: true, status: true },
          orderBy: { stepNo: 'asc' }
        } 
      }
    })
  ]);

  const jobLevelAccessible = jobs
    .filter(j => (j.machineId && userMachineIds.includes(j.machineId)) || j.jobDemand === 'high')
    .map(j => j.nrcJobNo);

  const planningLevelAccessible = jobPlannings
    .filter(p => {
      // First check if any step matches user's role and machine access
      const hasAccessibleStep = p.steps.some(s => {
        // High-demand grants role-based visibility regardless of machine
        // Check job.jobDemand first (existing functionality - UNCHANGED)
        const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';
        if (highDemandJob && isStepForUserRole(s.stepName, userRole)) return true;
        
        // Fallback: If no Job record, check jobPlanning.jobDemand
        // This only adds support for jobPlanning-only records without affecting existing jobs
        const jobExists = jobs.some(j => j.nrcJobNo === p.nrcJobNo);
        if (!jobExists && p.jobDemand === 'high' && isStepForUserRole(s.stepName, userRole)) return true;
        
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
      });

      // If no accessible step, job is not visible
      if (!hasAccessibleStep) {
        return false;
      }

      // 🎯 NEW: Step dependency filtering
      // Check if the user's relevant steps have their previous steps completed
      const userRelevantSteps = p.steps.filter(s => isStepForUserRole(s.stepName, userRole));
      
      if (userRelevantSteps.length === 0) {
        // If no steps match user's role, use machine-based filtering only
        return true;
      }

      // For each step that matches the user's role, check if previous steps are completed
      const hasStepWithCompletedPrerequisites = userRelevantSteps.some(userStep => {
        const ready = arePreviousStepsCompleted(p.steps, userStep.stepName);
        if (!ready && (Array.isArray(userRole) ? userRole.join(',') : userRole).toLowerCase().includes('quality')) {
          console.log(`🔍 [MachineAccess] Quality filtering blocked job ${p.nrcJobNo} at step ${userStep.stepName}. Steps:`, JSON.stringify(p.steps.map(s => ({ stepName: s.stepName, status: s.status }))));
        }
        return ready;
      });

      return hasStepWithCompletedPrerequisites;
    })
    .map(p => p.nrcJobNo);

  const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);
  return Array.from(set);
};

/**
 * Get total count of filtered job numbers for pagination
 * Now includes step dependency filtering - same logic as getFilteredJobNumbers
 */
export const getFilteredJobNumbersCount = async (userMachineIds: string[] | null, userRole: string): Promise<number> => {
  if (userMachineIds === null) {
    // Admin/Planner/Flying Squad/QC Manager - return total count
    return await prisma.job.count();
  }

  // Special handling for paperstore users - they can see all jobs
  if (userRole.includes('paperstore')) {
    return await prisma.job.count();
  }

  // For other users, get the filtered count using the same logic as getFilteredJobNumbers
  const [jobs, jobPlannings] = await Promise.all([
    prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),
    prisma.jobPlanning.findMany({
      select: { 
        nrcJobNo: true, 
        jobDemand: true,
        steps: { 
          select: { machineDetails: true, stepNo: true, stepName: true, status: true },
          orderBy: { stepNo: 'asc' }
        } 
      }
    })
  ]);

  const jobLevelAccessible = jobs
    .filter(j => (j.machineId && userMachineIds.includes(j.machineId)) || j.jobDemand === 'high')
    .map(j => j.nrcJobNo);

  const planningLevelAccessible = jobPlannings
    .filter(p => {
      // First check if any step matches user's role and machine access
      const hasAccessibleStep = p.steps.some(s => {
        // High-demand grants role-based visibility regardless of machine
        const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';
        if (highDemandJob && isStepForUserRole(s.stepName, userRole)) return true;
        
        // Fallback: If no Job record, check jobPlanning.jobDemand
        const jobExists = jobs.some(j => j.nrcJobNo === p.nrcJobNo);
        if (!jobExists && p.jobDemand === 'high' && isStepForUserRole(s.stepName, userRole)) return true;
        
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
      });

      // If no accessible step, job is not visible
      if (!hasAccessibleStep) {
        return false;
      }

      // 🎯 NEW: Step dependency filtering
      // Check if the user's relevant steps have their previous steps completed
      const userRelevantSteps = p.steps.filter(s => isStepForUserRole(s.stepName, userRole));
      
      if (userRelevantSteps.length === 0) {
        // If no steps match user's role, use machine-based filtering only
        return true;
      }

      // For each step that matches the user's role, check if previous steps are completed
      const hasStepWithCompletedPrerequisites = userRelevantSteps.some(userStep => {
        return arePreviousStepsCompleted(p.steps, userStep.stepName);
      });

      return hasStepWithCompletedPrerequisites;
    })
    .map(p => p.nrcJobNo);

  const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);
  return set.size;
};