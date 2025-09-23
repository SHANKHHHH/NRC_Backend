import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';

export const createPrintingDetails = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for printing details
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    // Get the job step and check machine access
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: jobStepId },
      select: { machineDetails: true }
    });

    if (jobStep?.machineDetails && jobStep.machineDetails.length > 0) {
      const hasAccess = await Promise.all(
        jobStep.machineDetails.map((machine: any) => {
          const machineId = (machine && typeof machine === 'object') ? (machine.machineId || (machine as any).id) : machine;
          return checkMachineAccess(userId, userRole, machineId);
        })
      );
      
      if (!hasAccess.some(access => access)) {
        throw new AppError('Access denied: You do not have access to this printing machine', 403);
      }
    }
  }
  
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

export const getAllPrintingDetails = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  
  // Get unified role-specific step data
  const { UnifiedJobDataHelper } = await import('../utils/unifiedJobDataHelper');
  const printingSteps = await UnifiedJobDataHelper.getRoleSpecificStepData(userMachineIds, userRole, 'PrintingDetails');
  
  res.status(200).json({ 
    success: true, 
    count: printingSteps.length, 
    data: printingSteps 
  });
};


export const updatePrintingDetails = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const userRole = req.user?.role;

  // Check if Flying Squad is trying to update non-QC fields
  if (userRole && RoleManager.canOnlyPerformQC(userRole)) {
    const allowedFields = ['qcCheckSignBy', 'qcCheckAt', 'remarks'];
    const bodyKeys = Object.keys(req.body);
    const restrictedFields = bodyKeys.filter(key => !allowedFields.includes(key));
    
    if (restrictedFields.length > 0) {
      throw new AppError(
        `Flying Squad can only update QC-related fields. Restricted fields: ${restrictedFields.join(', ')}. Allowed fields: ${allowedFields.join(', ')}`, 
        403
      );
    }

    // Ensure qcCheckSignBy is set to current user
    if (req.body.qcCheckSignBy !== undefined) {
      req.body.qcCheckSignBy = req.user?.userId;
    }

    // Ensure qcCheckAt is set to current timestamp
    if (req.body.qcCheckAt !== undefined) {
      req.body.qcCheckAt = new Date();
    }
  }

  const existingPrintingDetails = await prisma.printingDetails.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });

  if (!existingPrintingDetails)
    throw new AppError('PrintingDetails not found', 404);

  // Enforce machine access for non-admin/non-flying-squad users based on the linked job step
  if (req.user?.userId && req.user?.role) {
    const jobStep = await prisma.jobStep.findFirst({
      where: { printingDetails: { id: existingPrintingDetails.id } },
      select: { id: true, stepName: true }
    });
    if (jobStep) {
      const { checkJobStepMachineAccess, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, jobStep.stepName, nrcJobNo);
      if (!bypass) {
        const hasAccess = await checkJobStepMachineAccess(req.user.userId, req.user.role, jobStep.id);
        if (!hasAccess) {
          throw new AppError('Access denied: You do not have access to machines for this step', 403);
        }
      }
    }
  }

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