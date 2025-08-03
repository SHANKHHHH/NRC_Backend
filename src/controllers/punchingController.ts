import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';

export const createPunching = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Validate workflow - Punching requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'Punching');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const punching = await prisma.punching.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { punching: { connect: { id: punching.id } } } });

  // Log Punching step creation
  if (req.user?.userId) {
    // Get the nrcJobNo from the jobStep
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: jobStepId },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true
          }
        }
      }
    });

    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created Punching step for jobStepId: ${jobStepId}`,
      'Punching',
      punching.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: punching, message: 'Punching step created' });
};

export const getPunchingById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const punching = await prisma.punching.findUnique({ where: { id: Number(id) } });
  if (!punching) throw new AppError('Punching not found', 404);
  res.status(200).json({ success: true, data: punching });
};

export const getAllPunchings = async (_req: Request, res: Response) => {
  const punchings = await prisma.punching.findMany();
  res.status(200).json({ success: true, count: punchings.length, data: punchings });
};


export const updatePunching = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Step 1: Find punching record using jobNrcJobNo
    const existingPunching = await prisma.punching.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingPunching) {
      throw new AppError('Punching record not found', 404);
    }

    // Step 2: Update using its unique `id`
    const punching = await prisma.punching.update({
      where: { id: existingPunching.id },
      data: req.body,
    });

    // Optional logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated Punching step with jobNrcJobNo: ${nrcJobNo}`,
        'Punching',
        nrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: punching,
      message: 'Punching step updated',
    });
  } catch (error) {
  console.error('Update punching error:', error);

  const status = (error instanceof AppError && error.statusCode) || 500;
  const message = (error instanceof Error && error.message) || 'Internal Server Error';

  res.status(status).json({
    success: false,
    message,
  });
}
  
};


export const deletePunching = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.punching.delete({ where: { id: Number(id) } });

  // Log Punching step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted Punching step with id: ${id}`,
      'Punching',
      id
    );
  }
  res.status(200).json({ success: true, message: 'Punching deleted' });
};

export const getPunchingByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const punchings = await prisma.punching.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: punchings });
}; 