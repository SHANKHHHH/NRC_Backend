import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

// Create PaperStore step detail, only if previous step is accepted
export const createPaperStore = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  // Find the JobStep
  const jobStep = await prisma.jobStep.findUnique({ where: { id: jobStepId }, include: { jobPlanning: { include: { steps: true } } } });
  if (!jobStep) throw new AppError('JobStep not found', 404);
  // Check if this is the first step or not
  const steps = jobStep.jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
  const thisStepIndex = steps.findIndex(s => s.id === jobStepId);
  if (thisStepIndex > 0) {
    const prevStep = steps[thisStepIndex - 1];
    // Fetch the detail model for the previous step
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
  // Create PaperStore
  const paperStore = await prisma.paperStore.create({ data: { ...data, jobStepId } });
  // Link to JobStep
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { paperStore: { connect: { id: paperStore.id } } } });

  // Log PaperStore step creation
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created PaperStore step for jobStepId: ${jobStepId}`,
      'PaperStore',
      paperStore.id.toString()
    );
  }
  res.status(201).json({ success: true, data: paperStore, message: 'PaperStore step created' });
};

export const getPaperStoreById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const paperStore = await prisma.paperStore.findUnique({ where: { id: Number(id) } });
  if (!paperStore) throw new AppError('PaperStore not found', 404);
  res.status(200).json({ success: true, data: paperStore });
};

export const getAllPaperStores = async (_req: Request, res: Response) => {
  const paperStores = await prisma.paperStore.findMany();
  res.status(200).json({ success: true, count: paperStores.length, data: paperStores });
};

export const getPaperStoreByNrcJobNo = async (req: Request, res: Response) => {
  console.log('Route hit: getPaperStoreByNrcJobNo');
  console.log('nrcJobNo:', req.params.nrcJobNo);
  console.log('Full URL:', req.originalUrl);
  
  const { nrcJobNo } = req.params;
  const paperStores = await prisma.paperStore.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: paperStores });
};

export const updatePaperStore = async (req: Request, res: Response) => {
  const { id } = req.params;
  const paperStore = await prisma.paperStore.update({ where: { id: Number(id) }, data: req.body });

  // Log PaperStore step update
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated PaperStore step with id: ${id}`,
      'PaperStore',
      id
    );
  }
  res.status(200).json({ success: true, data: paperStore, message: 'PaperStore updated' });
};

export const deletePaperStore = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.paperStore.delete({ where: { id: Number(id) } });

  // Log PaperStore step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted PaperStore step with id: ${id}`,
      'PaperStore',
      id
    );
  }
  res.status(200).json({ success: true, message: 'PaperStore deleted' });
}; 