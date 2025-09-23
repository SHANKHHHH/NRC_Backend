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
  const { nrcJobNo, jobDemand, steps } = req.body;
  if (!nrcJobNo || !jobDemand || !Array.isArray(steps) || steps.length === 0) {
    throw new AppError('nrcJobNo, jobDemand, and steps are required', 400);
  }

  // Debug: Log the incoming data
  console.log('Creating job planning with steps:', JSON.stringify(steps, null, 2));


  const jobPlanning = await prisma.jobPlanning.create({
    data: {
      nrcJobNo,
      jobDemand,
      steps: {
        create: steps.map((step: any) => ({
          stepNo: step.stepNo,
          stepName: step.stepName,
          machineDetails: step.machineDetails ? step.machineDetails.map((machine: any) => ({
            machineId: machine.machineId || machine.id,
            unit: machine.unit,
            machineCode: machine.machineCode,
            machineType: machine.machineType
          })) : [],
        })),
      },
    },
    include: { steps: true },
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
  
  // Get job numbers that are accessible to the user based on machine assignments
  const userRole = req.user?.role || '';
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
  
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: { in: accessibleJobNumbers } },
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
    planning.steps.forEach(step => {
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
        step.machineDetails = step.machineDetails.map(md => {
          const mid = (md && typeof md === 'object') ? ((md as any).machineId || (md as any).id) : undefined;
          if (mid && typeof mid === 'string' && machineMap[mid]) {
            const base: Record<string, any> = (md && typeof md === 'object') ? (md as Record<string, any>) : {};
            return { ...base, machine: machineMap[mid] };
          }
          return md;
        });
      }
    }
  }

  res.status(200).json({
    success: true,
    count: jobPlannings.length,
    data: jobPlannings,
  });
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
  const jobPlanning = await prisma.jobPlanning.findFirst({
    where: { nrcJobNo },
    include: { steps: true },
  });
  if (!jobPlanning) {
    throw new AppError('JobPlanning not found for that NRC Job No', 404);
  }
  res.status(200).json({
    success: true,
    data: jobPlanning,
  });
};

// Get all steps for a given nrcJobNo
export const getStepsByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  // Find all steps from all plannings for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      jobPlanning: {
        nrcJobNo: nrcJobNo
      }
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      }
    },
    orderBy: [
      { jobPlanningId: 'asc' },
      { stepNo: 'asc' }
    ],
  });
  
  if (steps.length === 0) {
    throw new AppError('No steps found for that NRC Job No', 404);
  }
  
  res.status(200).json({
    success: true,
    count: steps.length,
    data: steps,
  });
};

// Get a specific step for a given nrcJobNo and stepNo
export const getStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  const userRole = req.user?.role;
  
  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: nrcJobNo
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
  
  res.status(200).json({
    success: true,
    data: step,
  });
};

// Update a specific job step's status, startDate, endDate, and user
export const updateJobStepStatus = async (req: Request, res: Response) => {
  const { nrcJobNo, jobPlanId, jobStepNo } = req.params;
  const { status } = req.body;
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];

  if (!['planned', 'start', 'stop'].includes(status)) {
    throw new AppError('Invalid status value. Must be one of: planned, start, stop', 400);
  }

  // Find the job step
  const jobStep = await prisma.jobStep.findFirst({
    where: {
      id: Number(jobStepNo),
      jobPlanningId: Number(jobPlanId),
      jobPlanning: { nrcJobNo: nrcJobNo },
    },
  });
  if (!jobStep) {
    throw new AppError('JobStep not found for the given jobPlanId and nrcJobNo', 404);
  }

  // Enforce machine access for most steps, but bypass for PaperStore as requested
  if (req.user?.userId && req.user?.role) {
    if (jobStep.stepName !== 'PaperStore') {
      const { checkJobStepMachineAccess, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, jobStep.stepName, nrcJobNo);
      if (!bypass) {
        const hasAccess = await checkJobStepMachineAccess(req.user.userId, req.user.role, jobStep.id);
        if (!hasAccess) {
          throw new AppError('Access denied: You do not have access to machines for this step', 403);
        }
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
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === 'string') {
    await logUserActionWithResource(
      userId,
      ActionTypes.JOBSTEP_UPDATED,
      JSON.stringify({
        message: `Job step status updated to ${status}`,
        nrcJobNo,
        jobPlanId,
        jobStepNo,
        status,
        startDate: updatedStep.startDate,
        endDate: updatedStep.endDate
      }),
      'JobStep',
      jobStepNo
    );
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(nrcJobNo, userId);
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
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: nrcJobNo
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

  // Enforce machine access, but bypass for PaperStore step per requirement
  if (req.user?.userId && req.user?.role) {
    if (step.stepName !== 'PaperStore') {
      const { checkJobStepMachineAccess, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, step.stepName, nrcJobNo);
      if (!bypass) {
        const hasAccess = await checkJobStepMachineAccess(req.user.userId, req.user.role, step.id);
        if (!hasAccess) {
          throw new AppError('Access denied: You do not have access to machines for this step', 403);
        }
      }
    }
  }

  const updateData: any = {};

  // Optional status handling
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!['planned', 'start', 'stop'].includes(status)) {
      throw new AppError('Invalid status value. Must be one of: planned, start, stop', 400);
    }
    updateData.status = status;

    const now = new Date();

    if (status === 'start') {
      updateData.startDate = now;
      updateData.user = userId || null;
    } else if (status === 'stop') {
      updateData.endDate = now;
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
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (machineDetailsProvided) {
    await updateJobMachineDetailsFlag(nrcJobNo);
  }

  // Check if job should be automatically completed when step status is set to 'stop'
  if (updateData.status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(nrcJobNo, userId);
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
  const { status } = req.body;
  let userId = req.user?.userId || req.headers['user-id'];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  if (!['planned', 'start', 'stop'].includes(status)) {
    throw new AppError('Invalid status value. Must be one of: planned, start, stop', 400);
  }

  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: nrcJobNo
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

  // Prepare update data
  const updateData: any = { status };
  const now = new Date();
  if (status === 'start') {
    updateData.startDate = now;
    updateData.user = userId || null;
  } else if (status === 'stop') {
    updateData.endDate = now;
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
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === 'string') {
    await logUserActionWithResource(
      userId,
      ActionTypes.JOBSTEP_UPDATED,
      JSON.stringify({
        message: `Job step status updated to ${status}`,
        nrcJobNo,
        jobPlanId: step.jobPlanning.jobPlanId,
        stepNo,
        status,
        startDate: updatedStep.startDate,
        endDate: updatedStep.endDate
      }),
      'JobStep',
      stepNo
    );
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === 'stop') {
    try {
      const completionResult = await autoCompleteJobIfReady(nrcJobNo, userId);
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
  const userRole = req.user?.role;
  
  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: nrcJobNo
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
    await updateJobMachineDetailsFlag(nrcJobNo);
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
  
  try {
    const workflowStatus = await getWorkflowStatus(nrcJobNo);
    
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
  const { steps, jobDetails } = req.body;

  try {
    // 1. Update job details if provided (outside transaction)
    if (jobDetails) {
      await prisma.job.update({
        where: { nrcJobNo },
        data: jobDetails
      });
    }

    // 2. Get existing job planning (outside transaction)
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
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
    await updateJobMachineDetailsFlag(nrcJobNo);

    // 5. Return updated data (outside transaction)
    const updatedData = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
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