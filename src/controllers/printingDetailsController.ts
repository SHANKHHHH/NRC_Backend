import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createPrintingDetails = async (req: Request, res: Response) => {
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
  const printingDetails = await prisma.printingDetails.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { printingDetails: { connect: { id: printingDetails.id } } } });

  // Log PrintingDetails step creation
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created PrintingDetails step for jobStepId: ${jobStepId}`,
      'PrintingDetails',
      printingDetails.id.toString()
    );
  }
  res.status(201).json({ success: true, data: printingDetails, message: 'PrintingDetails step created' });
};

export const getPrintingDetailsById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const printingDetails = await prisma.printingDetails.findUnique({ where: { id: Number(id) } });
  if (!printingDetails) throw new AppError('PrintingDetails not found', 404);
  res.status(200).json({ success: true, data: printingDetails });
};

export const getAllPrintingDetails = async (_req: Request, res: Response) => {
  const printingDetails = await prisma.printingDetails.findMany();
  res.status(200).json({ success: true, count: printingDetails.length, data: printingDetails });
};

export const updatePrintingDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  const printingDetails = await prisma.printingDetails.update({ where: { id: Number(id) }, data: req.body });

  // Log PrintingDetails step update
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated PrintingDetails step with id: ${id}`,
      'PrintingDetails',
      id
    );
  }
  res.status(200).json({ success: true, data: printingDetails, message: 'PrintingDetails updated' });
};

export const deletePrintingDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.printingDetails.delete({ where: { id: Number(id) } });

  // Log PrintingDetails step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted PrintingDetails step with id: ${id}`,
      'PrintingDetails',
      id
    );
  }
  res.status(200).json({ success: true, message: 'PrintingDetails deleted' });
}; 