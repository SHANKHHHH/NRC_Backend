import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';

export const createCorrugation = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for corrugation
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
        throw new AppError('Access denied: You do not have access to this corrugation machine', 403);
      }
    }
  }
  
  // Validate workflow - Corrugation can run in parallel with Printing
  const workflowValidation = await validateWorkflowStep(jobStepId, 'Corrugation');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const corrugation = await prisma.corrugation.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { corrugation: { connect: { id: corrugation.id } } } });

  // Log Corrugation step creation
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
      `Created Corrugation step for jobStepId: ${jobStepId}`,
      'Corrugation',
      corrugation.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: corrugation, message: 'Corrugation step created' });
};

export const getCorrugationById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const corrugation = await prisma.corrugation.findUnique({ where: { id: Number(id) } });
  if (!corrugation) throw new AppError('Corrugation not found', 404);
  res.status(200).json({ success: true, data: corrugation });
};

export const getCorrugationByJobStepId = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  
  try {
    // Get job step with corrugation details using jobStepId as unique identifier
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        corrugation: true
      }
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    if (jobStep.stepName !== 'Corrugation') {
      throw new AppError(`Job step ${jobStepId} is not a corrugation step`, 400);
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
      corrugation: jobStep.corrugation
    };

    res.status(200).json({ 
      success: true, 
      data: response,
      message: `Found corrugation job step using jobStepId: ${jobStepId}`
    });
  } catch (error) {
    console.error(`Error fetching corrugation details for jobStepId ${jobStepId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to fetch corrugation details', 500);
  }
};

export const getAllCorrugations = async (req: Request, res: Response) => {
  const userRole = req.user?.role || '';
  
  try {
    // Get job steps for corrugation role using jobStepId as unique identifier
    // High demand jobs are visible to all users, regular jobs only to corrugators
    const jobSteps = await prisma.jobStep.findMany({
      where: { 
        stepName: 'Corrugation',
        OR: [
          // High demand jobs visible to all users
          {
            jobPlanning: {
              jobDemand: 'high'
            }
          },
          // Regular jobs only visible to corrugators (or admin/planner)
          ...(userRole === 'corrugator' || userRole === 'admin' || userRole === 'planner' ? [{
            jobPlanning: {
              jobDemand: { not: 'high' as any }
            }
          }] : [])
        ]
      },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        corrugation: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Format response with jobStepId as unique identifier
    const formattedSteps = jobSteps.map(step => ({
      jobStepId: step.id, // Use jobStepId as unique identifier
      stepName: step.stepName,
      status: step.status,
      user: step.user,
      startDate: step.startDate,
      endDate: step.endDate,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
      machineDetails: step.machineDetails,
      jobPlanning: step.jobPlanning,
      corrugation: step.corrugation,
      isHighDemand: step.jobPlanning?.jobDemand === 'high'
    }));
    
    res.status(200).json({ 
      success: true, 
      count: formattedSteps.length, 
      data: formattedSteps,
      message: `Found ${formattedSteps.length} corrugation job steps (high demand visible to all, regular jobs only to corrugators)`
    });
  } catch (error) {
    console.error('Error fetching corrugation details:', error);
    throw new AppError('Failed to fetch corrugation details', 500);
  }
};

export const getCorrugationByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const corrugations = await prisma.corrugation.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: corrugations });
};


export const updateCorrugation = async (req: Request, res: Response) => {
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
    // Step 1: Find the Corrugation record by jobNrcJobNo
    const existingCorrugation = await prisma.corrugation.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingCorrugation) {
      throw new AppError('Corrugation record not found', 404);
    }

    // Enforce machine access for non-admin/non-flying-squad users based on the linked job step
    if (req.user?.userId && req.user?.role) {
      const jobStep = await prisma.jobStep.findFirst({
        where: { corrugation: { id: existingCorrugation.id } },
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

    // Step 2: Update using the unique id
    const corrugation = await prisma.corrugation.update({
      where: { id: existingCorrugation.id },
      data: req.body,
    });

  // Auto-update job's machine details flag if machineNo field present
  try {
    const hasMachineField = Object.prototype.hasOwnProperty.call(req.body || {}, 'machineNo');
    if (hasMachineField) {
      await prisma.jobStep.findFirst({
        where: { corrugation: { id: corrugation.id } },
        include: { jobPlanning: { select: { nrcJobNo: true } } }
      }).then(async (js) => {
        if (js?.jobPlanning?.nrcJobNo) {
          const { updateJobMachineDetailsFlag } = await import('../utils/machineDetailsTracker');
          await updateJobMachineDetailsFlag(js.jobPlanning.nrcJobNo);
        }
      });
    }
  } catch (e) {
    console.warn('Warning: could not update isMachineDetailsFilled after corrugation update:', e);
  }

    // Step 3: Optional logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated Corrugation step with jobNrcJobNo: ${nrcJobNo}`,
        'Corrugation',
        nrcJobNo
      );
    }

    // Step 4: Respond with success
    res.status(200).json({
      success: true,
      data: corrugation,
      message: 'Corrugation updated',
    });

  } catch (error: unknown) {
    console.error('Update Corrugation error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteCorrugation = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.corrugation.delete({ where: { id: Number(id) } });

  // Log Corrugation step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted Corrugation step with id: ${id}`,
      'Corrugation',
      id
    );
  }
  res.status(200).json({ success: true, message: 'Corrugation deleted' });
};