import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';

export const createDispatchProcess = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for dispatch process
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    const hasAccess = await checkJobStepMachineAccess(userId, userRole, jobStepId);
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this dispatch process machine', 403);
    }
  }
  
  // Validate workflow - DispatchProcess requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'DispatchProcess');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const dispatchProcess = await prisma.dispatchProcess.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { dispatchProcess: { connect: { id: dispatchProcess.id } } } });

  // Log DispatchProcess step creation
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
      `Created DispatchProcess step for jobStepId: ${jobStepId}`,
      'DispatchProcess',
      dispatchProcess.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: dispatchProcess, message: 'DispatchProcess step created' });
};

export const getDispatchProcessById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const dispatchProcess = await prisma.dispatchProcess.findUnique({ where: { id: Number(id) } });
  if (!dispatchProcess) throw new AppError('DispatchProcess not found', 404);
  res.status(200).json({ success: true, data: dispatchProcess });
};

export const getAllDispatchProcesses = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  
  // Get role-based step data from job plannings
  const { getRoleBasedStepData } = await import('../utils/stepDataHelper');
  const dispatchProcessSteps = await getRoleBasedStepData(userMachineIds, userRole, 'DispatchProcess');
  
  res.status(200).json({ 
    success: true, 
    count: dispatchProcessSteps.length, 
    data: dispatchProcessSteps 
  });
};

export const getDispatchProcessByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const dispatchProcesses = await prisma.dispatchProcess.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: dispatchProcesses });
};


export const updateDispatchProcess = async (req: Request, res: Response) => {
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

  try {
    // Step 1: Find the DispatchProcess record by jobNrcJobNo
    const existingDispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // Enforce high-demand bypass or machine access
    if (req.user?.userId && req.user?.role) {
      const jobStep = await prisma.jobStep.findFirst({
        where: { dispatchProcess: { id: existingDispatchProcess.id } },
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

    // Step 2: Update using its unique id
    const dispatchProcess = await prisma.dispatchProcess.update({
      where: { id: existingDispatchProcess.id },
      data: req.body,
    });

    // Step 3: Log update
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated DispatchProcess step with jobNrcJobNo: ${nrcJobNo}`,
        'DispatchProcess',
        nrcJobNo
      );
    }

    // Step 4: Respond
    res.status(200).json({
      success: true,
      data: dispatchProcess,
      message: 'DispatchProcess updated',
    });

  } catch (error: unknown) {
    console.error('Update DispatchProcess error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteDispatchProcess = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.dispatchProcess.delete({ where: { id: Number(id) } });

  // Log DispatchProcess step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted DispatchProcess step with id: ${id}`,
      'DispatchProcess',
      id
    );
  }
  res.status(200).json({ success: true, message: 'DispatchProcess deleted' });
}; 