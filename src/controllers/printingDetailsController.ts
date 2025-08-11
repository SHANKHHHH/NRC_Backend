import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';

export const createPrintingDetails = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Validate workflow - PrintingDetails can run in parallel with Corrugation
  const workflowValidation = await validateWorkflowStep(jobStepId, 'PrintingDetails');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const printingDetails = await prisma.printingDetails.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { printingDetails: { connect: { id: printingDetails.id } } } });

  // Log PrintingDetails step creation
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
      `Created PrintingDetails step for jobStepId: ${jobStepId}`,
      'PrintingDetails',
      printingDetails.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
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
  const { nrcJobNo } = req.params;

  
  const existingPrintingDetails = await prisma.printingDetails.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });

  if (!existingPrintingDetails)
    throw new AppError('PrintingDetails not found', 404);

  const printingDetails = await prisma.printingDetails.update({
    where: { id: existingPrintingDetails.id },
    data: req.body, 
  });

  // Auto-update job's machine details flag if machine field present
  try {
    const hasMachineField = Object.prototype.hasOwnProperty.call(req.body || {}, 'machine');
    if (hasMachineField) {
      await prisma.jobStep.findFirst({
        where: { printingDetails: { id: printingDetails.id } },
        include: { jobPlanning: { select: { nrcJobNo: true } } }
      }).then(async (js) => {
        if (js?.jobPlanning?.nrcJobNo) {
          const { updateJobMachineDetailsFlag } = await import('../utils/machineDetailsTracker');
          await updateJobMachineDetailsFlag(js.jobPlanning.nrcJobNo);
        }
      });
    }
  } catch (e) {
    console.warn('Warning: could not update isMachineDetailsFilled after printingDetails update:', e);
  }

  // Log update
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated PrintingDetails step with jobNrcJobNo: ${nrcJobNo}`,
      'PrintingDetails',
      nrcJobNo
    );
  }

  res.status(200).json({
    success: true,
    data: printingDetails,
    message: 'PrintingDetails updated',
  });
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

export const getPrintingDetailsByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const printingDetails = await prisma.printingDetails.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: printingDetails });
};