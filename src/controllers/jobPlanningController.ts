import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { autoCompleteJobIfReady } from '../utils/workflowValidator';
import { Machine } from '@prisma/client';
import { getWorkflowStatus } from '../utils/workflowValidator';
import { updateJobMachineDetailsFlag } from '../utils/machineDetailsTracker';
import { getFilteredJobNumbers } from '../middleware/machineAccess';

export const createJobPlanning = async (req: Request, res: Response) => {
  const { nrcJobNo, jobDemand, steps, purchaseOrderId } = req.body;
  if (!nrcJobNo || !jobDemand || !Array.isArray(steps) || steps.length === 0) {
    throw new AppError('nrcJobNo, jobDemand, and steps are required', 400);
  }

  // Debug: Log the incoming data
  console.log('Creating job planning with steps:', JSON.stringify(steps, null, 2));
  
  // Debug: Log machine details specifically
  steps.forEach((step: any, index: number) => {
    console.log(`Step ${index + 1} (${step.stepName}) machineDetails:`, JSON.stringify(step.machineDetails, null, 2));
    if (step.machineDetails && step.machineDetails.length > 0) {
      step.machineDetails.forEach((machine: any, machineIndex: number) => {
        console.log(`  Machine ${machineIndex + 1}:`, JSON.stringify(machine, null, 2));
        console.log(`  Machine ${machineIndex + 1} keys:`, Object.keys(machine));
        console.log(`  Machine ${machineIndex + 1} machineId:`, machine.machineId);
        console.log(`  Machine ${machineIndex + 1} unit:`, machine.unit);
      });
    }
  });

  try {
    // Debug: Log the data being passed to Prisma
    const stepsData = steps.map((step: any) => ({
      stepNo: step.stepNo,
      stepName: step.stepName,
      status: 'planned' as const, // All new steps start as planned
      machineDetails: step.machineDetails || [],
    }));
    
    console.log('Steps data for Prisma:', JSON.stringify(stepsData, null, 2));
    
    const jobPlanning = await prisma.jobPlanning.create({
      data: {
        nrcJobNo,
        jobDemand,
        purchaseOrderId: purchaseOrderId ? parseInt(purchaseOrderId) : null,
        steps: {
          create: stepsData,
        },
      },
      include: { 
        steps: true
      },
    });

    // Immediately update the job's machine details flag based on initial steps
    try {
      await updateJobMachineDetailsFlag(nrcJobNo);
    } catch (e) {
      console.warn('Warning: could not update isMachineDetailsFilled on planning create:', e);
    }

    // Log the job planning creation action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBPLANNING_CREATED,
        `Created job planning for job: ${nrcJobNo} with demand: ${jobDemand}`,
        'JobPlanning',
        jobPlanning.jobPlanId.toString()
      );
    }

    res.status(201).json({
      success: true,
      data: jobPlanning,
      message: 'Job planning created successfully',
    });
  } catch (error) {
    console.error('Error creating job planning:', error);
    throw new AppError('Failed to create job planning', 500);
  }
};

// Helper to serialize a Machine object for JSON
function serializeMachine(machine: Machine) {
  return {
    ...machine,
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
}

// Get all JobPlannings with steps - Optimized version
export const getAllJobPlannings = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  
  // Get pagination parameters from query (opt-in - only paginate if page param is provided)
  const page = req.query.page ? parseInt(req.query.page as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
  const isPaginated = page !== undefined;
  const skip = isPaginated ? (page - 1) * limit : 0;
  
  // Get job numbers that are accessible to the user based on machine assignments
  const userRole = req.user?.role || '';
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
  
  // Bypass branch: Roles that should see ALL plannings without deduplication
  // Admin, Planner, Flying Squad, QC Manager, PaperStore, Production Head need to see all versions
  const bypassDeduplicationRoles = ['admin', 'planner', 'flyingsquad', 'qc_manager', 'paperstore', 'production_head'];
  const shouldBypassDeduplication = userMachineIds === null || 
    bypassDeduplicationRoles.some(role => userRole.includes(role));
  
  if (shouldBypassDeduplication) {
    const queryOptions: any = {
      include: {
        steps: {
          select: {
            id: true,
            stepNo: true,
            stepName: true,
            machineDetails: true,
            status: true,
            startDate: true,
            endDate: true,
            user: true,
            completedBy: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { stepNo: 'asc' }
        }
      },
      orderBy: { jobPlanId: 'desc' }
    };
    
    // Only add pagination if requested
    if (isPaginated) {
      queryOptions.skip = skip;
      queryOptions.take = limit;
    }
    
    const allPlanningsUnfiltered = await prisma.jobPlanning.findMany(queryOptions);
    
    // Build response
    const response: any = {
      success: true,
      count: allPlanningsUnfiltered.length,
      data: allPlanningsUnfiltered
    };
    
    // Only include pagination metadata if pagination was requested
    if (isPaginated && page !== undefined) {
      const totalCount = await prisma.jobPlanning.count();
      const totalPages = Math.ceil(totalCount / limit);
      
      response.pagination = {
        currentPage: page,
        totalPages: totalPages,
        totalJobs: totalCount,
        jobsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      };
    }
    
    return res.status(200).json(response);
  }
  
  // Paginate the accessible job numbers only if pagination is requested
  const jobNumbersToFetch = isPaginated 
    ? accessibleJobNumbers.slice(skip, skip + limit)
    : accessibleJobNumbers;
  
  // Get ALL job plannings for accessible jobs (NO deduplication)
  // Production roles with machines should see ALL accessible plannings, not just the latest
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: { in: jobNumbersToFetch } },
    include: {
      steps: {
        select: {
          id: true,
          stepNo: true,
          stepName: true,
          machineDetails: true,
          status: true,
          startDate: true,
          endDate: true,
          user: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { stepNo: 'asc' }
      }
    },
    orderBy: { jobPlanId: 'desc' },
  });

  // Extract machine IDs more efficiently
  const machineIds = new Set<string>();
  jobPlannings.forEach(planning => {
    planning.steps.forEach((step: any) => {
      if (Array.isArray(step.machineDetails)) {
        step.machineDetails.forEach((md: any) => {
          const id = (md && typeof md === 'object') ? (md.machineId || (md as any).id) : undefined;
          if (id && typeof id === 'string') {
            machineIds.add(id);
          }
        });
      }
    });
  });

  // Fetch machines in a single query if needed
  let machines: any[] = [];
  if (machineIds.size > 0) {
    machines = await prisma.machine.findMany({
      where: { id: { in: Array.from(machineIds) } },
      select: {
        id: true,
        description: true,
        status: true,
        capacity: true
      }
    });
  }
  const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));

  // 4. Replace machineId in each step's machineDetails with the full machine object (serialized)
  for (const planning of jobPlannings) {
    for (const step of planning.steps) {
      if (Array.isArray(step.machineDetails)) {
        step.machineDetails = step.machineDetails.map((md: any) => {
          const mid = (md && typeof md === 'object') ? (md.machineId || md.id) : undefined;
          if (mid && typeof mid === 'string' && machineMap[mid]) {
            const base: Record<string, any> = (md && typeof md === 'object') ? (md as Record<string, any>) : {};
            return { ...base, machine: machineMap[mid] };
          }
          return md;
        });
      }
    }
  }

  // Build response
  const response: any = {
    success: true,
    count: jobPlannings.length,
    data: jobPlannings
  };
  
  // Only include pagination metadata if pagination was requested
  if (isPaginated && page !== undefined) {
    const totalJobs = accessibleJobNumbers.length;
    const totalPages = Math.ceil(totalJobs / limit);
    
    response.pagination = {
      currentPage: page,
      totalPages: totalPages,
      totalJobs: totalJobs,
      jobsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }

  res.status(200).json(response);
};

// Get all JobPlannings with steps
export const getAllJobPlanningsSimple = async (req: Request, res: Response) => {
  const jobPlannings = await prisma.jobPlanning.findMany({
    select: {
      jobPlanId: true,
      nrcJobNo: true,
      jobDemand: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  res.status(200).json({
    success: true,
    data: jobPlannings
  });
};

// Get a JobPlanning by nrcJobNo with steps
export const getJobPlanningByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    const { getJobPlanningData } = await import('../utils/jobPlanningSelector');
    const jobPlanning = await getJobPlanningData(decodedNrcJobNo);
    
  if (!jobPlanning) {
    throw new AppError('JobPlanning not found for that NRC Job No', 404);
  }
    
  res.status(200).json({
    success: true,
    data: jobPlanning,
  });
  } catch (error) {
    console.error('Error in getJobPlanningByNrcJobNo:', error);
    throw new AppError('Failed to get job planning data', 500);
  }
};

// Get job planning by Purchase Order ID
export const getJobPlanningByPurchaseOrderId = async (req: Request, res: Response) => {
  const { purchaseOrderId } = req.params;
  
  try {
    const jobPlannings = await prisma.jobPlanning.findMany({
      where: {
        purchaseOrderId: parseInt(purchaseOrderId)
      },
      include: {
        steps: {
          orderBy: { stepNo: 'asc' }
        }
      }
    });
    
    if (!jobPlannings || jobPlannings.length === 0) {
      throw new AppError('No job planning found for this Purchase Order', 404);
    }
    
    res.status(200).json({
      success: true,
      count: jobPlannings.length,
      data: jobPlannings
    });
  } catch (error) {
    console.error('Error in getJobPlanningByPurchaseOrderId:', error);
    throw new AppError('Failed to get job planning by PO ID', 500);
  }
};

// Get all steps for a given nrcJobNo
export const getStepsByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    const { getStepsForJob } = await import('../utils/jobPlanningSelector');
    const { steps } = await getStepsForJob(decodedNrcJobNo);
  
  if (steps.length === 0) {
    throw new AppError('No steps found for that NRC Job No', 404);
  }
  
  res.status(200).json({
    success: true,
    count: steps.length,
    data: steps,
  });
  } catch (error) {
    console.error('Error in getStepsByNrcJobNo:', error);
    throw new AppError('Failed to get steps for job', 500);
  }
};

// Get a specific step for a given nrcJobNo and stepNo
export const getStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  console.log(`🚨 [getStepByNrcJobNoAndStepNo] Request for stepNo: ${stepNo}, nrcJobNo: ${decodedNrcJobNo}`);
  
  // Simple fix: Just query the step directly by stepNo and nrcJobNo
  const step = await prisma.jobStep.findFirst({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: decodedNrcJobNo
      }
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      }
    },
    orderBy: {
      stepNo: 'asc'
    }
  });

  console.log(`🚨 [getStepByNrcJobNoAndStepNo] Found step: ${step?.stepName} (stepNo: ${step?.stepNo}, ID: ${step?.id})`);

  if (!step) {
    throw new AppError('Step not found', 404);
  }
  
  res.status(200).json({
    success: true,
    data: step,
  });
};

// Update a specific job step's status, startDate, endDate, and user
export const updateJobStepStatus = async (req: Request, res: Response) => {
  const { nrcJobNo, jobPlanId, jobStepNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  const { status } = req.body;
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];

  if (!['planned', 'start', 'stop', 'completed'].includes(status)) {
    throw new AppError('Invalid status value. Must be one of: planned, start, stop, completed', 400);
  }

  // Find the job step
  const jobStep = await prisma.jobStep.findFirst({
    where: {
      id: Number(jobStepNo),
      jobPlanningId: Number(jobPlanId),
      jobPlanning: { nrcJobNo: decodedNrcJobNo },
    },
  });
  if (!jobStep) {
    throw new AppError('JobStep not found for the given jobPlanId and nrcJobNo', 404);
  }

  // Enforce machine access for all steps including PaperStore
  if (req.user?.userId && req.user?.role) {
    const { checkJobStepMachineAccessWithAction, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, jobStep.stepName, decodedNrcJobNo);
      if (!bypass) {
      // Determine action based on status change
      const action = req.body.status === 'start' ? 'start' : 
                    req.body.status === 'stop' ? 'stop' : 'complete';
      
      const hasAccess = await checkJobStepMachineAccessWithAction(req.user.userId, req.user.role, jobStep.id, action);
        if (!hasAccess) {
        throw new AppError('Access Denied', 403);
      }
    }
  }

  // Prepare update data
  const updateData: any = { status };
  const now = new Date();
  if (status === 'start') {
    updateData.startDate = now;
    updateData.user = userId || null;
  } else if (status === 'stop') {
    updateData.endDate = now;
    updateData.completedBy = userId || null;
  }

  const updatedStep = await prisma.jobStep.update({
    where: { id: Number(jobStepNo) },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === 'string') {
    try {
      console.log(`Attempting to log activity for user ${userId}, step ${jobStepNo}, status ${status}`);
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Job step status updated to ${status}`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId,
          jobStepNo,
          status,
          startDate: updatedStep.startDate,
          endDate: updatedStep.endDate
        }),
        'JobStep',
        jobStepNo
      );
      console.log(`Successfully logged activity for user ${userId}, step ${jobStepNo}`);
    } catch (error) {
      console.error(`Failed to log activity for user ${userId}, step ${jobStepNo}:`, error);
    }
  } else {
    console.log(`Skipping activity log - userId: ${userId}, type: ${typeof userId}`);
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(decodedNrcJobNo, userId);
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: `Job step status updated to ${status} and job automatically completed`,
          autoCompleted: true,
          completedJob: completionResult.completedJob
        });
      }
    } catch (error) {
      console.error('Error checking auto-completion:', error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: `Job step status updated to ${status}`,
  });
};

// Unified update: status and/or machineDetails
export const upsertStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Starting step update for job ${decodedNrcJobNo}, step ${stepNo}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Original nrcJobNo: ${nrcJobNo}, Decoded: ${decodedNrcJobNo}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] User ID: ${userId}, Role: ${userRole}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Request body:`, req.body);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Status: ${req.body.status}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Step number as number: ${Number(stepNo)}`);

  // Get the prioritized job planning first
  const { getJobPlanningData } = await import('../utils/jobPlanningSelector');
  const jobPlanning = await getJobPlanningData(decodedNrcJobNo);
  
  if (!jobPlanning) {
    throw new AppError('Job planning not found', 404);
  }

  // Find steps with the given step number from the prioritized job planning
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] About to query steps with stepNo: ${Number(stepNo)}, jobPlanningId: ${jobPlanning.jobPlanId}`);
  
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanningId: jobPlanning.jobPlanId
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      }
    }
  });
  
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Database query returned ${steps.length} steps`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Found ${steps.length} steps for step number ${stepNo} in job planning ${jobPlanning.jobPlanId}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Query parameters - stepNo: ${Number(stepNo)}, jobPlanningId: ${jobPlanning.jobPlanId}`);
  steps.forEach((s, index) => {
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Step ${index}: ${s.stepName} (step ${s.stepNo}), ID: ${s.id}`);
  });
  
  if (steps.length === 0) {
    throw new AppError('Step not found for that NRC Job No and step number', 404);
  }

  // Use the step with the correct step number (stepNo from URL parameter)
  // Don't filter by role here - role validation happens later
  let step = steps[0]; // Default to first step
  
  // If there are multiple steps with the same step number, use the first one
  // The step number should be unique per job planning, but if not, we'll use the first match
  if (steps.length > 1) {
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Multiple steps found for step number ${stepNo}, using the first one`);
  }
  
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Selected step: ${step.stepName} (step ${step.stepNo})`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Selected step ID: ${step.id}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Selected step current status: ${step.status}`);

  // Enforce role-based access control and step dependencies for all users
  if (req.user?.userId && req.user?.role) {
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Before role check - Step: ${step.stepName} (step ${step.stepNo})`);
    const { isStepForUserRole } = await import('../middleware/machineAccess');
    
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Role access check - User role: ${req.user.role}, Step: ${step.stepName}, Job demand: ${jobPlanning.jobDemand}`);
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] isStepForUserRole result: ${isStepForUserRole(step.stepName, req.user.role)}`);
    
    // Always check if the step matches the user's role (even for high demand jobs)
    // High demand jobs bypass machine access but still respect role-based step access
    if (!isStepForUserRole(step.stepName, req.user.role)) {
      console.log(`❌ [upsertStepByNrcJobNoAndStepNo] Access denied - User role '${req.user.role}' does not have access to step '${step.stepName}'`);
      throw new AppError(`User role '${req.user.role}' does not have access to step '${step.stepName}'`, 403);
    }
    
    // Step dependency validation - different rules for 'start' vs 'stop' status
    if (req.body.status === 'start' || req.body.status === 'stop') {
      console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Checking step dependencies for step ${step.stepNo}`);
      
      // Get all steps for this job planning to check dependencies
      const allSteps = await prisma.jobStep.findMany({
        where: { jobPlanningId: jobPlanning.jobPlanId },
        orderBy: { stepNo: 'asc' }
      });
      
      console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Found ${allSteps.length} total steps for job planning`);
      
      // Check if previous steps meet requirements
      const currentStepNo = step.stepNo;
      const previousSteps = allSteps.filter(s => s.stepNo < currentStepNo);
      
      console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Previous steps to check: ${previousSteps.length}`);
      previousSteps.forEach(prevStep => {
        console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Previous step ${prevStep.stepNo} (${prevStep.stepName}): status = ${prevStep.status}`);
      });
      
      if (req.body.status === 'start') {
        // For START: Previous steps must be started (status = 'start' or 'stop')
        const notStartedSteps = previousSteps.filter(s => s.status !== 'start' && s.status !== 'stop');
        
        if (notStartedSteps.length > 0) {
          const notStartedStepNames = notStartedSteps.map(s => `${s.stepName} (step ${s.stepNo})`).join(', ');
          console.log(`❌ [upsertStepByNrcJobNoAndStepNo] Cannot start step ${currentStepNo} - previous steps not started: ${notStartedStepNames}`);
          throw new AppError(`Cannot start step ${currentStepNo} (${step.stepName}) - previous steps must be started first: ${notStartedStepNames}`, 400);
        }
        
        console.log(`✅ [upsertStepByNrcJobNoAndStepNo] All previous steps started, allowing step ${currentStepNo} to start`);
      } else if (req.body.status === 'stop') {
        // For STOP: Previous steps must be completed (status = 'stop')
        const notCompletedSteps = previousSteps.filter(s => s.status !== 'stop');
        
        if (notCompletedSteps.length > 0) {
          const notCompletedStepNames = notCompletedSteps.map(s => `${s.stepName} (step ${s.stepNo})`).join(', ');
          console.log(`❌ [upsertStepByNrcJobNoAndStepNo] Cannot stop step ${currentStepNo} - previous steps not completed: ${notCompletedStepNames}`);
          throw new AppError(`Cannot stop step ${currentStepNo} (${step.stepName}) - previous steps must be completed first: ${notCompletedStepNames}`, 400);
        }
        
        console.log(`✅ [upsertStepByNrcJobNoAndStepNo] All previous steps completed, allowing step ${currentStepNo} to stop`);
      }
    }
    
    console.log(`✅ [upsertStepByNrcJobNoAndStepNo] Access granted for step ${step.stepName}`);
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] After role check - Step: ${step.stepName} (step ${step.stepNo})`);
  }

  const updateData: any = {};

  // Optional status handling
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!['planned', 'start', 'stop'].includes(status)) {
      throw new AppError('Invalid status value. Must be one of: planned, start, stop', 400);
    }

    // ✅ PROTECTION: For machine-based steps, prevent status updates via this endpoint
    // Machine-based steps should only have status updated via completeWorkOnMachine API
    const machineBasedSteps = ['PrintingDetails', 'Corrugation', 'FluteLaminateBoardConversion', 
                                'Punching', 'SideFlapPasting'];
    const isMachineStep = machineBasedSteps.includes(step.stepName);
    
    if (isMachineStep && status === 'stop') {
      console.log(`⚠️ [upsertStepByNrcJobNoAndStepNo] Ignoring status='stop' for machine-based step ${step.stepName}`);
      console.log(`ℹ️  Status for machine steps is controlled by completeWorkOnMachine API based on completion criteria`);
      // DO NOT update status for machine-based steps
      // Just log and skip, but still process other fields
    } else {
      // For non-machine steps (PaperStore, Quality, Dispatch) or non-stop statuses, allow status update
      const now = new Date();

      if (status === 'planned') {
        updateData.status = 'planned';
        updateData.startDate = null;
        updateData.endDate = null;
        updateData.user = null;
      } else if (status === 'start') {
        updateData.status = 'start';
        updateData.startDate = now;
        updateData.user = userId || null;
      } else if (status === 'stop') {
        updateData.status = 'stop';
        updateData.endDate = now;
        updateData.completedBy = userId || null;
      }
    }
  }

  // Optional machineDetails handling
  let machineDetailsProvided = false;
  if (req.body.machineDetails !== undefined) {
    machineDetailsProvided = true;
    updateData.machineDetails = Array.isArray(req.body.machineDetails)
      ? req.body.machineDetails.map((m: any) => ({
          machineId: m.machineId || m.id,
          unit: m.unit,
          machineCode: m.machineCode,
          machineType: m.machineType,
        }))
      : [];
  }

  // Handle form data fields for step completion - store in appropriate step-specific models
  const formDataFields = ['quantity', 'oprName', 'size', 'passQuantity', 'checkedBy', 'noOfBoxes', 'dispatchNo', 'remarks'];
  const hasFormData = formDataFields.some(field => req.body[field] !== undefined);
  
  // Create individual step records for status changes (start/stop) or when form data is present
  if (hasFormData || req.body.status === 'start' || req.body.status === 'stop') {
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Processing step data for step: ${step.stepName}`);
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Form data received:`, req.body);
    console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Status: ${req.body.status}, Has form data: ${hasFormData}`);
    
    try {
      // Store form data in the appropriate step-specific model based on step name
      await storeStepFormData(step.stepName, decodedNrcJobNo, step.id, req.body);
    } catch (formDataError: any) {
      console.error(`❌ [upsertStepByNrcJobNoAndStepNo] Error storing form data:`, formDataError);
      throw new AppError(`Failed to store form data: ${formDataError.message}`, 500);
    }
  }

  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Request body status:`, req.body.status);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Update data:`, updateData);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Step ID: ${step.id}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Step current status: ${step.status}`);

  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Updated step result:`, updatedStep);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Original step ID: ${step.id}, Updated step ID: ${updatedStep.id}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Original step name: ${step.stepName}, Updated step name: ${updatedStep.stepName}`);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Original step no: ${step.stepNo}, Updated step no: ${updatedStep.stepNo}`);

  if (machineDetailsProvided) {
    await updateJobMachineDetailsFlag(decodedNrcJobNo);
  }

  // Check if job should be automatically completed when step status is set to 'stop'
  if (updateData.status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(decodedNrcJobNo, userId);
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: 'Step updated successfully and job automatically completed',
          autoCompleted: true,
          completedJob: completionResult.completedJob
        });
      }
    } catch (error) {
      console.error('Error checking auto-completion:', error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: 'Step updated successfully',
  });
};

// Update step status for a given nrcJobNo and stepNo (frontend URL pattern)
export const updateStepStatusByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  const { status } = req.body;
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  console.log(`🔍 [StepUpdate] Starting step update for job ${decodedNrcJobNo}, step ${stepNo}, status ${status}`);
  console.log(`🔍 [StepUpdate] User ID: ${userId}, Role: ${userRole}`);

  if (!['planned', 'start', 'stop', 'completed'].includes(status)) {
    throw new AppError('Invalid status value. Must be one of: planned, start, stop, completed', 400);
  }

  // Get the prioritized job planning first
  const { getJobPlanningData } = await import('../utils/jobPlanningSelector');
  const jobPlanning = await getJobPlanningData(decodedNrcJobNo);
  
  console.log(`🔍 [StepUpdate] Found job planning:`, jobPlanning ? `ID ${jobPlanning.jobPlanId}` : 'null');
  
  if (!jobPlanning) {
    throw new AppError('Job planning not found', 404);
  }

  // Find steps with the given step number from the prioritized job planning
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanningId: jobPlanning.jobPlanId
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      }
    }
  });
  
  if (steps.length === 0) {
    throw new AppError('Step not found for that NRC Job No and step number', 404);
  }

  // If user has a role, filter by role-appropriate step name
  let step = steps[0]; // Default to first step
  
  if (userRole) {
    const { isStepForUserRole } = await import('../middleware/machineAccess');
    
    // Find the step that matches the user's role
    const roleMatchedStep = steps.find(s => isStepForUserRole(s.stepName, userRole));
    
    if (roleMatchedStep) {
      step = roleMatchedStep;
    }
    // If no role match found, use the first step (backward compatibility)
  }

  // Prepare update data
  const updateData: any = { status };
  const now = new Date();
  if (status === 'start') {
    updateData.startDate = now;
    updateData.user = userId || null;
  } else if (status === 'stop') {
    updateData.endDate = now;
    updateData.completedBy = userId || null;
  }

  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === 'string') {
    try {
      console.log(`Attempting to log activity for user ${userId}, step ${step.id}, status ${status}`);
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Job step status updated to ${status}`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId: step.jobPlanning.jobPlanId,
          stepNo,
          status,
          startDate: updatedStep.startDate,
          endDate: updatedStep.endDate
        }),
        'JobStep',
        stepNo
      );
      console.log(`Successfully logged activity for user ${userId}, step ${step.id}`);
    } catch (error) {
      console.error(`Failed to log activity for user ${userId}, step ${step.id}:`, error);
    }
  } else {
    console.log(`Skipping activity log - userId: ${userId}, type: ${typeof userId}`);
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(decodedNrcJobNo, userId);
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: `Job step status updated to ${status} and job automatically completed`,
          autoCompleted: true,
          completedJob: completionResult.completedJob
        });
      }
    } catch (error) {
      console.error('Error checking auto-completion:', error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: `Job step status updated to ${status}`,
  });
};

// Update any field of a specific step for a given nrcJobNo and stepNo
export const updateStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  const userRole = req.user?.role;
  
  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: decodedNrcJobNo
      }
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      }
    }
  });
  
  if (steps.length === 0) {
    throw new AppError('Step not found for that NRC Job No and step number', 404);
  }

  // If user has a role, filter by role-appropriate step name
  let step = steps[0]; // Default to first step
  
  if (userRole) {
    const { isStepForUserRole } = await import('../middleware/machineAccess');
    
    // Find the step that matches the user's role
    const roleMatchedStep = steps.find(s => isStepForUserRole(s.stepName, userRole));
    
    if (roleMatchedStep) {
      step = roleMatchedStep;
    }
    // If no role match found, use the first step (backward compatibility)
  }
  // Process machine details if provided
  const updateData = { ...req.body };
  
  // If machineDetails is provided, process it to match the format
  if (req.body.machineDetails) {
    updateData.machineDetails = req.body.machineDetails.map((machine: any) => ({
      id: machine.machineId || machine.id,
      unit: machine.unit,
      machineCode: machine.machineCode,
      machineType: machine.machineType
    }));
  }

  // Update the step with the processed fields
  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
  });

  // If machineDetails were updated, automatically update the job's machine details flag
  if (req.body.machineDetails !== undefined) {
    await updateJobMachineDetailsFlag(decodedNrcJobNo);
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: 'Step updated successfully',
  });
}; 

// Get workflow status for a job
export const getJobWorkflowStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    const workflowStatus = await getWorkflowStatus(decodedNrcJobNo);
    
    res.status(200).json({
      success: true,
      data: workflowStatus
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to get workflow status', 500);
  }
};

// Bulk update all job steps and their details
export const bulkUpdateJobSteps = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  const { steps, jobDetails } = req.body;

  try {
    // 1. Update job details if provided (outside transaction)
    if (jobDetails) {
      await prisma.job.update({
        where: { nrcJobNo: decodedNrcJobNo },
        data: jobDetails
      });
    }

    // 2. Get existing job planning (outside transaction)
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo: decodedNrcJobNo },
      include: { 
        steps: {
          include: {
            paperStore: true,
            printingDetails: true,
            corrugation: true,
            flutelam: true,
            punching: true,
            sideFlapPasting: true,
            qualityDept: true,
            dispatchProcess: true
          }
        }
      }
    });

    if (!jobPlanning) {
      throw new AppError('Job planning not found', 404);
    }

    // 3. Use transaction only for step updates (with increased timeout)
    await prisma.$transaction(async (tx) => {
      for (const stepData of steps) {
        const { stepNo, stepName, status, machineDetails, stepDetails } = stepData;
        
        const step = jobPlanning.steps.find(s => s.stepNo === stepNo);
        if (!step) continue;

        // Update step basic info
        await tx.jobStep.update({
          where: { id: step.id },
          data: {
            status,
            machineDetails,
            startDate: status === 'start' ? new Date() : undefined,
            endDate: status === 'stop' ? new Date() : undefined,
            user: req.user?.userId || null
          }
        });

        // Update step-specific details based on stepName
        if (stepDetails) {
          switch (stepName) {
            case 'PaperStore':
              if (step.paperStore) {
                await tx.paperStore.update({
                  where: { id: step.paperStore.id },
                  data: stepDetails
                });
              }
              break;
            case 'PrintingDetails':
              if (step.printingDetails) {
                await tx.printingDetails.update({
                  where: { id: step.printingDetails.id },
                  data: stepDetails
                });
              }
              break;
            case 'Corrugation':
              if (step.corrugation) {
                await tx.corrugation.update({
                  where: { id: step.corrugation.id },
                  data: stepDetails
                });
              }
              break;
            case 'FluteLaminateBoardConversion':
              if (step.flutelam) {
                await tx.fluteLaminateBoardConversion.update({
                  where: { id: step.flutelam.id },
                  data: stepDetails
                });
              }
              break;
            case 'Punching':
              if (step.punching) {
                await tx.punching.update({
                  where: { id: step.punching.id },
                  data: stepDetails
                });
              }
              break;
            case 'SideFlapPasting':
              if (step.sideFlapPasting) {
                await tx.sideFlapPasting.update({
                  where: { id: step.sideFlapPasting.id },
                  data: stepDetails
                });
              }
              break;
            case 'QualityDept':
              if (step.qualityDept) {
                await tx.qualityDept.update({
                  where: { id: step.qualityDept.id },
                  data: stepDetails
                });
              }
              break;
            case 'DispatchProcess':
              if (step.dispatchProcess) {
                await tx.dispatchProcess.update({
                  where: { id: step.dispatchProcess.id },
                  data: stepDetails
                });
              }
              break;
          }
        }
      }
    }, {
      timeout: 15000 // 15 seconds timeout
    });

    // 4. Update job machine details flag (outside transaction)
    await updateJobMachineDetailsFlag(decodedNrcJobNo);

    // 5. Return updated data (outside transaction)
    const updatedData = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo: decodedNrcJobNo },
      include: { 
        steps: {
          include: {
            paperStore: true,
            printingDetails: true,
            corrugation: true,
            flutelam: true,
            punching: true,
            sideFlapPasting: true,
            qualityDept: true,
            dispatchProcess: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedData,
      message: 'All job steps updated successfully'
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update job steps',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update job step by job step ID directly (solves multiple job plannings issue)
export const updateJobStepById = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  const userRole = req.user?.role;
  
  console.log(`🔍 [updateJobStepById] Starting update for step ${jobStepId}`);
  console.log(`🔍 [updateJobStepById] User role: ${userRole} (type: ${typeof userRole})`);
  console.log(`🔍 [updateJobStepById] Request body:`, req.body);
  console.log(`🔍 [updateJobStepById] req.user:`, req.user);
  
  try {
    // Find the specific job step by ID
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true, jobDemand: true }
        }
      }
    });
    
    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    // Check if user has access to this step based on role
    if (userRole) {
      const { isStepForUserRole } = await import('../middleware/machineAccess');
      
      console.log(`🔍 [updateJobStepById] Role access check - User role: ${userRole}, Step: ${jobStep.stepName}, Job demand: ${jobStep.jobPlanning.jobDemand}`);
      console.log(`🔍 [updateJobStepById] isStepForUserRole result: ${isStepForUserRole(jobStep.stepName, userRole)}`);
      
      // Always check if the step matches the user's role (even for high demand jobs)
      // High demand jobs bypass machine access but still respect role-based step access
      if (!isStepForUserRole(jobStep.stepName, userRole)) {
        console.log(`❌ [updateJobStepById] Access denied - User role '${userRole}' does not have access to step '${jobStep.stepName}'`);
        throw new AppError(`User role '${userRole}' does not have access to step '${jobStep.stepName}'`, 403);
      }
      console.log(`✅ [updateJobStepById] Access granted for step ${jobStep.stepName}`);
    }

    // Process machine details if provided
    const updateData = { ...req.body };
    
    // If machineDetails is provided, process it to match the format
    if (req.body.machineDetails) {
      updateData.machineDetails = req.body.machineDetails.map((machine: any) => ({
        id: machine.machineId || machine.id,
        unit: machine.unit,
        machineCode: machine.machineCode,
        machineType: machine.machineType
      }));
    }

    // Update the job step
    console.log(`🔍 [updateJobStepById] Updating step with data:`, updateData);
    let updatedStep;
    try {
      updatedStep = await prisma.jobStep.update({
      where: { id: Number(jobStepId) },
      data: updateData,
    });
      console.log(`🔍 [updateJobStepById] Step updated successfully:`, updatedStep);
    } catch (prismaError: any) {
      console.error(`❌ [updateJobStepById] Prisma update error:`, prismaError);
      throw new AppError(`Database update failed: ${prismaError.message}`, 500);
    }

    // Skip machine details flag update for now to avoid 500 errors
    // TODO: Fix updateJobMachineDetailsFlag function

    res.status(200).json({
      success: true,
      data: updatedStep,
      message: `Job step ${jobStepId} updated successfully`
    });

  } catch (error: any) {
    console.error(`Error updating job step ${jobStepId}:`, error);
    console.error(`Error details:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    // Provide more specific error information
    if (error.code === 'P2002') {
      throw new AppError('A step with this data already exists', 400);
    } else if (error.code === 'P2025') {
      throw new AppError('Step not found', 404);
    } else if (error.code === 'P2003') {
      throw new AppError('Foreign key constraint failed', 400);
    }
    throw new AppError(`Failed to update job step: ${error.message}`, 500);
  }
};

/**
 * Store form data in the appropriate step-specific model
 */
async function storeStepFormData(stepName: string, nrcJobNo: string, jobStepId: number, formData: any) {
  const stepNameLower = stepName.toLowerCase();
  
  console.log(`🔍 [storeStepFormData] Processing step: ${stepName} (${stepNameLower})`);
  console.log(`🔍 [storeStepFormData] Job: ${nrcJobNo}, Step ID: ${jobStepId}`);
  console.log(`🔍 [storeStepFormData] Form data:`, formData);
  
  // Fetch JobStep data to get correct operator name and machine info
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    include: {
      jobPlanning: {
        include: {
          steps: true
        }
      }
    }
  });
  
  if (!jobStep) {
    throw new Error(`JobStep with ID ${jobStepId} not found`);
  }
  
  // Get operator name from JobStep user field
  const operatorName = jobStep.user || 'System';
  
  // Get machine info from JobStep machineDetails
  const machineDetails = jobStep.machineDetails as any[];
  const machineInfo = machineDetails?.[0];
  const machineCode = machineInfo?.machineCode || null;
  const machineType = machineInfo?.machineType || null;
  
  console.log(`🔍 [storeStepFormData] JobStep user: ${operatorName}, Machine: ${machineCode}`);
  
  // Calculate shift for auto-population
  const { calculateShift } = await import('../utils/autoPopulateFields');
  const currentDate = new Date();
  const calculatedShift = calculateShift(currentDate);
  
  // Determine step-specific status based on JobStep status
  let stepStatus: 'in_progress' | 'accept';
  if (formData.status === 'stop') {
    stepStatus = 'accept';
  } else {
    stepStatus = 'in_progress'; // default for 'start' or any other status
  }
  
  console.log(`🔍 [storeStepFormData] JobStep status: ${formData.status} → Step status: ${stepStatus}`);
  console.log(`🔍 [storeStepFormData] Step name: ${stepName}, Step name lower: ${stepNameLower}`);
  
  try {
    if (stepNameLower.includes('paperstore')) {
      // Use user input for quantity and available, fallback to null if not provided
      const quantity = formData.quantity ? parseInt(formData.quantity) || null : null;
      const available = formData.available ? parseInt(formData.available) || null : null;
      
      await prisma.paperStore.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: formData.quantity ? quantity : null,
          available: formData.available ? available : null,
          sheetSize: formData.sheetSize,
          mill: formData.mill,
          gsm: formData.gsm,
          quality: formData.quality,
          extraMargin: formData.extraMargin,
          issuedDate: formData.issuedDate ? new Date(formData.issuedDate) : undefined,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          available,
          sheetSize: formData.sheetSize || 'A4',
          mill: formData.mill,
          gsm: formData.gsm,
          quality: formData.quality,
          extraMargin: formData.extraMargin,
          issuedDate: formData.issuedDate ? new Date(formData.issuedDate) : new Date(),
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes('printing')) {
      // Use user input for quantity, fallback to null if not provided
      const quantity = formData.quantity ? parseInt(formData.quantity) || null : null;
      await prisma.printingDetails.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: formData.quantity ? quantity : null,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          noOfColours: formData.noOfColours ? parseInt(formData.noOfColours) || null : null,
          inksUsed: formData.inksUsed,
          wastage: formData.wastage ? parseInt(formData.wastage) || null : null,
          coatingType: formData.coatingType,
          separateSheets: formData.separateSheets ? parseInt(formData.separateSheets) || null : null,
          extraSheets: formData.extraSheets ? parseInt(formData.extraSheets) || null : null,
          machine: machineCode, // Use JobStep machine instead of form data
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          noOfColours: formData.noOfColours ? parseInt(formData.noOfColours) || null : null,
          inksUsed: formData.inksUsed,
          wastage: formData.wastage ? parseInt(formData.wastage) || null : null,
          coatingType: formData.coatingType,
          separateSheets: formData.separateSheets ? parseInt(formData.separateSheets) || null : null,
          extraSheets: formData.extraSheets ? parseInt(formData.extraSheets) || null : null,
          machine: machineCode, // Use JobStep machine instead of form data
        },
      });
    } else if (stepNameLower.includes('corrugation')) {
      // Use user input for quantity, fallback to null if not provided
      const quantity = (formData.quantity || formData['Sheets Count']) ? parseInt(formData.quantity || formData['Sheets Count']) || null : null;
      await prisma.corrugation.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          machineNo: machineCode, // Use JobStep machine instead of form data
          size: formData.size || formData['Size'],
          gsm1: formData.gsm1 || formData['GSM1'],
          gsm2: formData.gsm2 || formData['GSM2'],
          flute: formData.flute || formData['Flute Type'],
          remarks: formData.remarks || formData['Remarks'],
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          machineNo: machineCode, // Use JobStep machine instead of form data
          size: formData.size || formData['Size'],
          gsm1: formData.gsm1 || formData['GSM1'],
          gsm2: formData.gsm2 || formData['GSM2'],
          flute: formData.flute || formData['Flute Type'],
          remarks: formData.remarks || formData['Remarks'],
        },
      });
      } else if (stepNameLower.includes('flute')) {
        // Use user input for quantity, fallback to null if not provided
        const quantity = (formData.quantity || formData['OK Quantity']) ? parseInt(formData.quantity || formData['OK Quantity']) || null : null;
        await prisma.fluteLaminateBoardConversion.upsert({
          where: { jobStepId },
          update: {
            status: stepStatus,
            quantity: quantity,
            operatorName: operatorName, // Use JobStep user instead of form data
            date: formData.date ? new Date(formData.date) : undefined,
            shift: formData.shift,
            film: formData.film || formData['Film Type'],
            adhesive: formData.adhesive || formData['Adhesive'],
            wastage: (formData.wastage || formData['Wastage']) ? parseInt(formData.wastage || formData['Wastage']) || null : null,
            // QC fields are only updated by Flying Squad, not by regular operators
          },
          create: {
            jobNrcJobNo: nrcJobNo,
            jobStepId,
            status: stepStatus,
            quantity,
            operatorName: operatorName, // Use JobStep user instead of form data
            date: formData.date ? new Date(formData.date) : new Date(),
            shift: formData.shift,
            film: formData.film || formData['Film Type'],
            adhesive: formData.adhesive || formData['Adhesive'],
            wastage: (formData.wastage || formData['Wastage']) ? parseInt(formData.wastage || formData['Wastage']) || null : null,
            // QC fields are only updated by Flying Squad, not by regular operators
          },
        });
    } else if (stepNameLower.includes('punching') || stepNameLower.includes('die cutting')) {
      // Use user input for quantity, fallback to null if not provided
      const quantity = (formData.quantity || formData['OK Quantity']) ? parseInt(formData.quantity || formData['OK Quantity']) || null : null;
      await prisma.punching.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          machine: machineCode, // Use JobStep machine instead of form data
          die: formData.die || formData['Die Used'],
          wastage: (formData.wastage || formData['Wastage']) ? parseInt(formData.wastage || formData['Wastage']) || null : null,
          remarks: formData.remarks || formData['Remarks'],
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          machine: machineCode, // Use JobStep machine instead of form data
          die: formData.die || formData['Die Used'],
          wastage: (formData.wastage || formData['Wastage']) ? parseInt(formData.wastage || formData['Wastage']) || null : null,
          remarks: formData.remarks || formData['Remarks'],
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes('flap')) {
      // Use user input for quantity, fallback to null if not provided
      // Frontend sends 'Quantity' (capitalized) but backend expects 'quantity' (lowercase)
      const quantity = formData.Quantity ? parseInt(formData.Quantity) || null : 
                      formData.quantity ? parseInt(formData.quantity) || null : null;
      await prisma.sideFlapPasting.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift || null,
          machineNo: machineCode, // Use JobStep machine instead of form data
          adhesive: formData.adhesive || null,
          wastage: formData.Wastage ? parseInt(formData.Wastage) || null : 
                  formData.wastage ? parseInt(formData.wastage) || null : null,
          remarks: formData.Remarks || formData.remarks || null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift || null,
          machineNo: machineCode, // Use JobStep machine instead of form data
          adhesive: formData.adhesive || null,
          wastage: formData.Wastage ? parseInt(formData.Wastage) || null : 
                  formData.wastage ? parseInt(formData.wastage) || null : null,
          remarks: formData.Remarks || formData.remarks || null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes('quality')) {
      // Use user input for quantity, fallback to null if not provided
      // Frontend sends 'passQuantity' from 'Pass Quantity' field
      const quantity = (formData.passQuantity || formData['Pass Quantity']) ? parseInt(formData.passQuantity || formData['Pass Quantity']) || null : null;
      await prisma.qualityDept.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          checkedBy: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift || null,
          operatorName: operatorName, // Use JobStep user instead of form data
          rejectedQty: (formData.rejectedQty || formData['Reject Quantity']) ? parseInt(formData.rejectedQty || formData['Reject Quantity']) || null : null,
          reasonForRejection: formData.reasonForRejection || formData['Reason for Rejection'] || null,
          remarks: formData.remarks || formData['Remarks'] || null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          checkedBy: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift || null,
          operatorName: operatorName, // Use JobStep user instead of form data
          rejectedQty: (formData.rejectedQty || formData['Reject Quantity']) ? parseInt(formData.rejectedQty || formData['Reject Quantity']) || null : null,
          reasonForRejection: formData.reasonForRejection || formData['Reason for Rejection'] || null,
          remarks: formData.remarks || formData['Remarks'] || null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes('dispatch')) {
      // Use user input for quantity, fallback to null if not provided
      const quantity = (formData.noOfBoxes || formData['No of Boxes']) ? parseInt(formData.noOfBoxes || formData['No of Boxes']) || null : null;
      await prisma.dispatchProcess.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          dispatchNo: formData.dispatchNo || formData['Dispatch No'] || `DISP-${Date.now()}`,
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          operatorName: operatorName, // Use JobStep user instead of form data
          dispatchDate: (formData.dispatchDate || formData['Dispatch Date']) ? new Date(formData.dispatchDate || formData['Dispatch Date']) : undefined,
          balanceQty: (formData.balanceQty || formData['Balance Qty']) ? parseInt(formData.balanceQty || formData['Balance Qty']) || null : null,
          remarks: formData.remarks || formData['Remarks'],
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          dispatchNo: formData.dispatchNo || formData['Dispatch No'] || `DISP-${Date.now()}`,
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          operatorName: operatorName, // Use JobStep user instead of form data
          dispatchDate: (formData.dispatchDate || formData['Dispatch Date']) ? new Date(formData.dispatchDate || formData['Dispatch Date']) : new Date(),
          balanceQty: (formData.balanceQty || formData['Balance Qty']) ? parseInt(formData.balanceQty || formData['Balance Qty']) || null : null,
          remarks: formData.remarks || formData['Remarks'],
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    }
    
    console.log(`✅ [storeStepFormData] Successfully stored form data for ${stepName}`);
  } catch (error) {
    console.error(`❌ [storeStepFormData] Error storing form data for ${stepName}:`, error);
    throw error;
  }
}