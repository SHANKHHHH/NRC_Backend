import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';

export const createQualityDept = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for quality dept
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    const hasAccess = await checkJobStepMachineAccess(userId, userRole, jobStepId);
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this quality department machine', 403);
    }
  }
  
  // Validate workflow - QualityDept requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'QualityDept');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  const qualityDept = await prisma.qualityDept.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { qualityDept: { connect: { id: qualityDept.id } } } });

  // Log QualityDept step creation
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
      `Created QualityDept step for jobStepId: ${jobStepId}`,
      'QualityDept',
      qualityDept.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
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

export const getAllQualityDepts = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  
  const userRole = req.user?.role || '';
  const jobStepIds = await getFilteredJobStepIds(userMachineIds || null, userRole);
  
  const qualityDepts = await prisma.qualityDept.findMany({
    where: { jobStepId: { in: jobStepIds } },
    include: {
      jobStep: {
        include: {
          jobPlanning: {
            select: { nrcJobNo: true }
          }
        }
      }
    }
  });
  
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