import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

export const createQualityDept = async (req: Request, res: Response) => {
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
  const qualityDept = await prisma.qualityDept.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { qualityDept: { connect: { id: qualityDept.id } } } });

  // Log QualityDept step creation
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created QualityDept step for jobStepId: ${jobStepId}`,
      'QualityDept',
      qualityDept.id.toString()
    );
  }
  res.status(201).json({ success: true, data: qualityDept, message: 'QualityDept step created' });
};

export const getQualityDeptById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const qualityDept = await prisma.qualityDept.findUnique({ where: { id: Number(id) } });
  if (!qualityDept) throw new AppError('QualityDept not found', 404);
  res.status(200).json({ success: true, data: qualityDept });
};

export const getAllQualityDepts = async (_req: Request, res: Response) => {
  const qualityDepts = await prisma.qualityDept.findMany();
  res.status(200).json({ success: true, count: qualityDepts.length, data: qualityDepts });
};

export const getQualityDeptByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const qualityDepts = await prisma.qualityDept.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: qualityDepts });
};



export const updateQualityDept = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Step 1: Find the existing QualityDept record using jobNrcJobNo
    const existingQualityDept = await prisma.qualityDept.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingQualityDept) {
      throw new AppError('QualityDept record not found', 404);
    }

    // Step 2: Update using its unique id
    const qualityDept = await prisma.qualityDept.update({
      where: { id: existingQualityDept.id },
      data: req.body,
    });

    // Optional Logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated QualityDept step with jobNrcJobNo: ${nrcJobNo}`,
        'QualityDept',
        nrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: qualityDept,
      message: 'QualityDept updated',
    });

  } catch (error: unknown) {
    console.error('Update QualityDept error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteQualityDept = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.qualityDept.delete({ where: { id: Number(id) } });

  // Log QualityDept step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted QualityDept step with id: ${id}`,
      'QualityDept',
      id
    );
  }
  res.status(200).json({ success: true, message: 'QualityDept deleted' });
}; 