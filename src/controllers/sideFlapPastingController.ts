import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

export const createSideFlapPasting = async (req: Request, res: Response) => {
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
  const sideFlapPasting = await prisma.sideFlapPasting.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { sideFlapPasting: { connect: { id: sideFlapPasting.id } } } });
  res.status(201).json({ success: true, data: sideFlapPasting, message: 'SideFlapPasting step created' });
};

export const getSideFlapPastingById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sideFlapPasting = await prisma.sideFlapPasting.findUnique({ where: { id: Number(id) } });
  if (!sideFlapPasting) throw new AppError('SideFlapPasting not found', 404);
  res.status(200).json({ success: true, data: sideFlapPasting });
};

export const getAllSideFlapPastings = async (_req: Request, res: Response) => {
  const sideFlapPastings = await prisma.sideFlapPasting.findMany();
  res.status(200).json({ success: true, count: sideFlapPastings.length, data: sideFlapPastings });
};

export const updateSideFlapPasting = async (req: Request, res: Response) => {
  const { id } = req.params;
  const sideFlapPasting = await prisma.sideFlapPasting.update({ where: { id: Number(id) }, data: req.body });
  res.status(200).json({ success: true, data: sideFlapPasting, message: 'SideFlapPasting updated' });
};

export const deleteSideFlapPasting = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.sideFlapPasting.delete({ where: { id: Number(id) } });
  res.status(200).json({ success: true, message: 'SideFlapPasting deleted' });
}; 