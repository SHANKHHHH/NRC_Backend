import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

// Create a new JobPlanning with steps
export const createJobPlanning = async (req: Request, res: Response) => {
  const { nrcJobNo, jobDemand, steps } = req.body;
  if (!nrcJobNo || !jobDemand || !Array.isArray(steps) || steps.length === 0) {
    throw new AppError('nrcJobNo, jobDemand, and steps are required', 400);
  }

  // Create JobPlanning and related JobSteps in a transaction
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