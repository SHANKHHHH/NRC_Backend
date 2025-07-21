import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createFluteLaminateBoardConversion = async (req: Request, res: Response) => {
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
  const fluteLaminateBoardConversion = await prisma.fluteLaminateBoardConversion.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { flutelam: { connect: { id: fluteLaminateBoardConversion.id } } } });

  // Log FluteLaminateBoardConversion step creation
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created FluteLaminateBoardConversion step for jobStepId: ${jobStepId}`,
      'FluteLaminateBoardConversion',
      fluteLaminateBoardConversion.id.toString()
    );
  }
  res.status(201).json({ success: true, data: fluteLaminateBoardConversion, message: 'FluteLaminateBoardConversion step created' });
};

export const getFluteLaminateBoardConversionById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const flutelam = await prisma.fluteLaminateBoardConversion.findUnique({ where: { id: Number(id) } });
  if (!flutelam) throw new AppError('FluteLaminateBoardConversion not found', 404);
  res.status(200).json({ success: true, data: flutelam });
};

export const getAllFluteLaminateBoardConversions = async (_req: Request, res: Response) => {
  const flutelams = await prisma.fluteLaminateBoardConversion.findMany();
  res.status(200).json({ success: true, count: flutelams.length, data: flutelams });
};

export const getFluteLaminateBoardConversionByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const flutes = await prisma.fluteLaminateBoardConversion.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: flutes });
};

export const updateFluteLaminateBoardConversion = async (req: Request, res: Response) => {
  const { id } = req.params;
  const fluteLaminateBoardConversion = await prisma.fluteLaminateBoardConversion.update({ where: { id: Number(id) }, data: req.body });

  // Log FluteLaminateBoardConversion step update
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated FluteLaminateBoardConversion step with id: ${id}`,
      'FluteLaminateBoardConversion',
      id
    );
  }
  res.status(200).json({ success: true, data: fluteLaminateBoardConversion, message: 'FluteLaminateBoardConversion updated' });
};

export const deleteFluteLaminateBoardConversion = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.fluteLaminateBoardConversion.delete({ where: { id: Number(id) } });

  // Log FluteLaminateBoardConversion step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted FluteLaminateBoardConversion step with id: ${id}`,
      'FluteLaminateBoardConversion',
      id
    );
  }
  res.status(200).json({ success: true, message: 'FluteLaminateBoardConversion deleted' });
}; 