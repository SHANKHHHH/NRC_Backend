import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createJobPlanning = async (req: Request, res: Response) => {
  const { nrcJobNo, jobDemand, steps } = req.body;
  if (!nrcJobNo || !jobDemand || !Array.isArray(steps) || steps.length === 0) {
    throw new AppError('nrcJobNo, jobDemand, and steps are required', 400);
}


  const jobPlanning = await prisma.jobPlanning.create({
    data: {
      nrcJobNo,
      jobDemand,
      steps: {
        create: steps.map((step: any) => ({
          stepNo: step.stepNo,
          stepName: step.stepName,
          machineDetail: step.machineDetail,
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

// Get all JobPlannings with steps
export const getAllJobPlannings = async (_req: Request, res: Response) => {
  const jobPlannings = await prisma.jobPlanning.findMany({
    include: { steps: true },
    orderBy: { jobPlanId: 'desc' },
  });
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
  // Update the step with the provided fields
  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: req.body,
  });
  res.status(200).json({
    success: true,
    data: updatedStep,
    message: 'Step updated successfully',
  });
}; 