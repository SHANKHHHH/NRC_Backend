import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { Machine } from '@prisma/client';
import { getWorkflowStatus } from '../utils/workflowValidator';
import { updateJobMachineDetailsFlag } from '../utils/machineDetailsTracker';

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
            id: machine.machineId || machine.id,
            unit: machine.unit,
            machineCode: machine.machineCode,
            machineType: machine.machineType
          })) : [],
        })),
      },
    },
    include: { steps: true },
  });

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
export const getAllJobPlannings = async (_req: Request, res: Response) => {
  // Use a single optimized query with proper includes and selects
  const jobPlannings = await prisma.jobPlanning.findMany({
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
        orderBy: { stepNo: 'asc' } // Add ordering for consistent results
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
          if (md?.machineId && typeof md.machineId === 'string') {
            machineIds.add(md.machineId);
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
          if (
            md &&
            typeof md === 'object' &&
            !Array.isArray(md) &&
            'machineId' in md &&
            typeof md.machineId === 'string' &&
            machineMap[md.machineId]
          ) {
            return { ...md, machine: machineMap[md.machineId] };
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
  // Find the job planning for the given nrcJobNo
  const jobPlanning = await prisma.jobPlanning.findFirst({
    where: { nrcJobNo },
    select: { jobPlanId: true },
  });
  if (!jobPlanning) {
    throw new AppError('JobPlanning not found for that NRC Job No', 404);
  }
  // Find all steps for the jobPlanning
  const steps = await prisma.jobStep.findMany({
    where: { jobPlanningId: jobPlanning.jobPlanId },
    orderBy: { stepNo: 'asc' },
  });
  res.status(200).json({
    success: true,
    count: steps.length,
    data: steps,
  });
};

// Get a specific step for a given nrcJobNo and stepNo
export const getStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  // Find the job planning for the given nrcJobNo
  const jobPlanning = await prisma.jobPlanning.findFirst({
    where: { nrcJobNo },
    select: { jobPlanId: true },
  });
  if (!jobPlanning) {
    throw new AppError('JobPlanning not found for that NRC Job No', 404);
  }
  // Find the specific step for the jobPlanning
  const step = await prisma.jobStep.findFirst({
    where: {
      jobPlanningId: jobPlanning.jobPlanId,
      stepNo: Number(stepNo),
    },
  });
  if (!step) {
    throw new AppError('Step not found for that NRC Job No and step number', 404);
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

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: `Job step status updated to ${status}`,
  });
};

// Update any field of a specific step for a given nrcJobNo and stepNo
export const updateStepByNrcJobNoAndStepNo = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo } = req.params;
  // Find the job planning for the given nrcJobNo
  const jobPlanning = await prisma.jobPlanning.findFirst({
    where: { nrcJobNo },
    select: { jobPlanId: true },
  });
  if (!jobPlanning) {
    throw new AppError('JobPlanning not found for that NRC Job No', 404);
  }
  // Find the specific step for the jobPlanning
  const step = await prisma.jobStep.findFirst({
    where: {
      jobPlanningId: jobPlanning.jobPlanId,
      stepNo: Number(stepNo),
    },
  });
  if (!step) {
    throw new AppError('Step not found for that NRC Job No and step number', 404);
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

 