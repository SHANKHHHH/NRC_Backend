import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';
import { calculateShift } from '../utils/autoPopulateFields';

export const createPunching = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for punching
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    const hasAccess = await checkJobStepMachineAccess(userId, userRole, jobStepId);
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this punching machine', 403);
    }
  }
  
  // Validate workflow - Punching requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'Punching');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
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

export const getPunchingByJobStepId = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  
  try {
    // Get job step with punching details using jobStepId as unique identifier
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        punching: true
      }
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    if (jobStep.stepName !== 'Punching') {
      throw new AppError(`Job step ${jobStepId} is not a punching step`, 400);
    }

    // Format response with jobStepId as unique identifier
    const response = {
      jobStepId: jobStep.id,
      stepName: jobStep.stepName,
      status: jobStep.status,
      user: jobStep.user,
      startDate: jobStep.startDate,
      endDate: jobStep.endDate,
      createdAt: jobStep.createdAt,
      updatedAt: jobStep.updatedAt,
      machineDetails: jobStep.machineDetails,
      jobPlanning: jobStep.jobPlanning,
      punching: jobStep.punching
    };

    res.status(200).json({ 
      success: true, 
      data: response,
      message: `Found punching job step using jobStepId: ${jobStepId}`
    });
  } catch (error) {
    console.error(`Error fetching punching details for jobStepId ${jobStepId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to fetch punching details', 500);
  }
};

export const getAllPunchings = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  
  // Get unified role-specific step data
  const { UnifiedJobDataHelper } = await import('../utils/unifiedJobDataHelper');
  const punchingSteps = await UnifiedJobDataHelper.getRoleSpecificStepData(userMachineIds || null, userRole, 'Punching');
  
  res.status(200).json({ 
    success: true, 
    count: punchingSteps.length, 
    data: punchingSteps 
  });
};


export const updatePunching = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
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
    // Step 1: Find punching record using jobNrcJobNo
    const existingPunching = await prisma.punching.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingPunching) {
      throw new AppError('Punching record not found', 404);
    }

    // Enforce high-demand bypass or machine access
    const jobStep = await prisma.jobStep.findFirst({
      where: { punching: { id: existingPunching.id } },
      select: { id: true, stepName: true }
    });
    
    if (req.user?.userId && req.user?.role && jobStep) {
      const { checkJobStepMachineAccess, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, jobStep.stepName, nrcJobNo);
      if (!bypass) {
        const hasAccess = await checkJobStepMachineAccess(req.user.userId, req.user.role, jobStep.id);
        if (!hasAccess) {
          throw new AppError('Access denied: You do not have access to machines for this step', 403);
        }
      }
    }

    // Filter out non-editable fields (fields that already have data)
    const { filterEditableFields } = await import('../utils/fieldEditability');
    const editableData = filterEditableFields(existingPunching, req.body);

    // Auto-populate common step fields and punching-specific fields
    const { autoPopulateStepFields, autoPopulatePunchingFields } = await import('../utils/autoPopulateFields');
    let populatedData = editableData;
    if (jobStep) {
      populatedData = await autoPopulateStepFields(editableData, jobStep.id, req.user?.userId, decodedNrcJobNo);
    }
    populatedData = await autoPopulatePunchingFields(populatedData, decodedNrcJobNo);

    // Step 2: Update using its unique `id`
    const punching = await prisma.punching.update({
      where: { id: existingPunching.id },
      data: populatedData,
    });

  // Auto-update job's machine details flag if machine field present
  try {
    const hasMachineField = Object.prototype.hasOwnProperty.call(req.body || {}, 'machine');
    if (hasMachineField) {
      await prisma.jobStep.findFirst({
        where: { punching: { id: punching.id } },
        include: { jobPlanning: { select: { nrcJobNo: true } } }
      }).then(async (js) => {
        if (js?.jobPlanning?.nrcJobNo) {
          const { updateJobMachineDetailsFlag } = await import('../utils/machineDetailsTracker');
          await updateJobMachineDetailsFlag(js.jobPlanning.nrcJobNo);
        }
      });
    }
  } catch (e) {
    console.warn('Warning: could not update isMachineDetailsFilled after punching update:', e);
  }

    // Optional logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated Punching step with jobNrcJobNo: ${decodedNrcJobNo}`,
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
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const punchings = await prisma.punching.findMany({ where: { jobNrcJobNo: decodedNrcJobNo } });
  
  // Auto-populate missing fields for each punching record
  const { autoPopulateStepFields, autoPopulatePunchingFields } = await import('../utils/autoPopulateFields');
  const populatedPunchings = await Promise.all(
    punchings.map(async (p) => {
      // Get jobStepId to find the job step
      const jobStep = await prisma.jobStep.findFirst({
        where: { 
          jobPlanning: {
            nrcJobNo: decodedNrcJobNo
          },
          stepName: 'Punching'
        }
      });
      
      if (jobStep) {
        // First apply common step fields
        const withCommonFields = await autoPopulateStepFields(p, jobStep.id, req.user?.userId, decodedNrcJobNo);
        // Then apply punching specific fields
        return await autoPopulatePunchingFields(withCommonFields, decodedNrcJobNo);
      }
      return p;
    })
  );
  
  // Add editability information for each punching record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = populatedPunchings.map(p => wrapWithEditability(p));
  
  res.status(200).json({ success: true, data: dataWithEditability });
};

export const updatePunchingStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the Punching by jobNrcJobNo
  const existing = await prisma.punching.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Punching not found' });
  }
  
  // Prepare update data
  const updateData: any = { status: status as any };
  
  // Auto-populate date and time for status changes
  const currentDate = new Date();
  updateData.date = currentDate;
  updateData.shift = calculateShift(currentDate);
  
  // If status is hold or in_progress, update remarks
  if (remarks && (status === 'hold' || status === 'in_progress')) {
    updateData.remarks = remarks;
  }
  
  // Update the status
  const updated = await prisma.punching.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated Punching status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'Punching',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'Punching status updated' });
};