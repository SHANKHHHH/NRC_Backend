import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createPunching = async (req: Request, res: Response) => {
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