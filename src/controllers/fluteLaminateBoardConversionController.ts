import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';

export const createFluteLaminateBoardConversion = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for flute laminate board conversion
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    const hasAccess = await checkJobStepMachineAccess(userId, userRole, jobStepId);
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this flute lamination machine', 403);
    }
  }
  
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
  const fluteLaminateBoardConversion = await prisma.fluteLaminateBoardConversion.create({ data: { ...data, jobStepId } });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { flutelam: { connect: { id: fluteLaminateBoardConversion.id } } } });

  // Log FluteLaminateBoardConversion step creation
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
      `Created FluteLaminateBoardConversion step for jobStepId: ${jobStepId}`,
      'FluteLaminateBoardConversion',
      fluteLaminateBoardConversion.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: fluteLaminateBoardConversion, message: 'FluteLaminateBoardConversion step created' });
};

export const getFluteLaminateBoardConversionById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const flutelam = await prisma.fluteLaminateBoardConversion.findUnique({ where: { id: Number(id) } });
  if (!flutelam) throw new AppError('FluteLaminateBoardConversion not found', 404);
  res.status(200).json({ success: true, data: flutelam });
};

export const getAllFluteLaminateBoardConversions = async (req: Request, res: Response) => {
  const userRole = req.user?.role || '';
  
  try {
    // Get job steps for flutelaminator role using jobStepId as unique identifier
    // High demand jobs are visible to all users, regular jobs only to flutelaminators
    const jobSteps = await prisma.jobStep.findMany({
      where: { 
        stepName: 'FluteLaminateBoardConversion',
        OR: [
          // High demand jobs visible to all users
          {
            jobPlanning: {
              jobDemand: 'high'
            }
          },
          // Regular jobs only visible to flutelaminators (or admin/planner)
          ...(userRole === 'flutelaminator' || userRole === 'admin' || userRole === 'planner' || 
              (typeof userRole === 'string' && userRole.includes('flutelaminator')) ? [{
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
        flutelam: true
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
      flutelam: step.flutelam,
      isHighDemand: step.jobPlanning?.jobDemand === 'high'
    }));
    
    res.status(200).json({ 
      success: true, 
      count: formattedSteps.length, 
      data: formattedSteps,
      message: `Found ${formattedSteps.length} flutelamination job steps (high demand visible to all, regular jobs only to flutelaminators)`
    });
  } catch (error) {
    console.error('Error fetching flutelamination details:', error);
    throw new AppError('Failed to fetch flutelamination details', 500);
  }
};

export const getFluteLaminateBoardConversionByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const flutes = await prisma.fluteLaminateBoardConversion.findMany({ where: { jobNrcJobNo: nrcJobNo } });
  res.status(200).json({ success: true, data: flutes });
};


export const updateFluteLaminateBoardConversion = async (req: Request, res: Response) => {
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
    // Step 1: Find the record using jobNrcJobNo
    const existingRecord = await prisma.fluteLaminateBoardConversion.findFirst({
      where: { jobNrcJobNo: nrcJobNo },
    });

    if (!existingRecord) {
      throw new AppError('FluteLaminateBoardConversion record not found', 404);
    }

    // Enforce high-demand bypass or machine access
    if (req.user?.userId && req.user?.role) {
      const jobStep = await prisma.jobStep.findFirst({
        where: { flutelam: { id: existingRecord.id } },
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

    // Step 2: Update using the unique ID
    const fluteLaminateBoardConversion = await prisma.fluteLaminateBoardConversion.update({
      where: { id: existingRecord.id },
      data: req.body,
    });

    // Step 3: Log update
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated FluteLaminateBoardConversion step with jobNrcJobNo: ${nrcJobNo}`,
        'FluteLaminateBoardConversion',
        nrcJobNo
      );
    }

    // Step 4: Respond
    res.status(200).json({
      success: true,
      data: fluteLaminateBoardConversion,
      message: 'FluteLaminateBoardConversion updated',
    });
  } catch (error: unknown) {
    console.error('Update FluteLaminateBoardConversion error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteFluteLaminateBoardConversion = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.fluteLaminateBoardConversion.delete({ where: { id: Number(id) } });

  // Log FluteLaminateBoardConversion step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted FluteLaminateBoardConversion step with id: ${id}`,
      'FluteLaminateBoardConversion',
      id
    );
  }
  res.status(200).json({ success: true, message: 'FluteLaminateBoardConversion deleted' });
}; 