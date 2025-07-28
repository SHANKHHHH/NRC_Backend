import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createCorrugation = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  const jobStep = await prisma.jobStep.findUnique({ where: { id: jobStepId }, include: { jobPlanning: { include: { steps: true } } } });
  if (!jobStep) throw new AppError('JobStep not found', 404);
  const steps = jobStep.jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
  const thisStepIndex = steps.findIndex(s => s.id === jobStepId);
  if (thisStepIndex > 0) {
    const prevStep = steps[thisStepIndex - 1];
    let prevDetail: any = null;
    switch (prevStep.stepName) {
      case 'PaperStore':
        prevDetail = await prisma.paperStore.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'PrintingDetails':
        prevDetail = await prisma.printingDetails.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Corrugation':
        prevDetail = await prisma.corrugation.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'FluteLaminateBoardConversion':
        prevDetail = await prisma.fluteLaminateBoardConversion.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Punching':
        prevDetail = await prisma.punching.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'SideFlapPasting':
        prevDetail = await prisma.sideFlapPasting.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'QualityDept':
        prevDetail = await prisma.qualityDept.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'DispatchProcess':
        prevDetail = await prisma.dispatchProcess.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      default:
        break;
    }
    if (!prevDetail || prevDetail.status !== 'accept') {
      throw new AppError('Previous step must be accepted before creating this step', 400);
    }
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