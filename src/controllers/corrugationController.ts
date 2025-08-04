import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';

export const createCorrugation = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Validate workflow - Corrugation can run in parallel with Printing
  const workflowValidation = await validateWorkflowStep(jobStepId, 'Corrugation');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const corrugation = await prisma.corrugation.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { corrugation: { connect: { id: corrugation.id } } } });

  // Log Corrugation step creation
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
      `Created Corrugation step for jobStepId: ${jobStepId}`,
      'Corrugation',
      corrugation.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: corrugation, message: 'Corrugation step created' });
};

export const getCorrugationById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const corrugation = await prisma.corrugation.findUnique({ where: { id: Number(id) } });
  if (!corrugation) throw new AppError('Corrugation not found', 404);
  res.status(200).json({ success: true, data: corrugation });
};

export const getAllCorrugations = async (_req: Request, res: Response) => {
  const corrugations = await prisma.corrugation.findMany();
  res.status(200).json({ success: true, count: corrugations.length, data: corrugations });
};

export const getCorrugationByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const corrugations = await prisma.corrugation.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: corrugations });
};


export const updateCorrugation = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Step 1: Find the Corrugation record by jobNrcJobNo
    const existingCorrugation = await prisma.corrugation.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingCorrugation) {
      throw new AppError('Corrugation record not found', 404);
    }

    // Step 2: Update using the unique id
    const corrugation = await prisma.corrugation.update({
      where: { id: existingCorrugation.id },
      data: req.body,
    });

    // Step 3: Optional logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated Corrugation step with jobNrcJobNo: ${nrcJobNo}`,
        'Corrugation',
        nrcJobNo
      );
    }

    // Step 4: Respond with success
    res.status(200).json({
      success: true,
      data: corrugation,
      message: 'Corrugation updated',
    });

  } catch (error: unknown) {
    console.error('Update Corrugation error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteCorrugation = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.corrugation.delete({ where: { id: Number(id) } });

  // Log Corrugation step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted Corrugation step with id: ${id}`,
      'Corrugation',
      id
    );
  }
  res.status(200).json({ success: true, message: 'Corrugation deleted' });
}; 