import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { RoleManager } from '../utils/roleUtils';

/**
 * Get all job steps across all departments for flying squad review
 */
export const getAllJobSteps = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canAccessAllJobSteps(userRole)) {
    throw new AppError('You are not authorized to access all job steps. Required roles: admin, planner, or flying_squad', 403);
  }

  const { 
    stepName, 
    status, 
    hasQCCheck, 
    nrcJobNo, 
    page = '1', 
    limit = '50' 
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Build where clause for job steps
  const where: any = {};
  
  if (stepName) {
    where.stepName = {
      contains: stepName as string,
      mode: 'insensitive'
    };
  }
  
  if (status) {
    where.status = status;
  }

  if (nrcJobNo) {
    where.jobPlanning = {
      nrcJobNo: {
        contains: nrcJobNo as string,
        mode: 'insensitive'
      }
    };
  }

  // Get job steps with their related step details
  const [jobSteps, total] = await Promise.all([
    prisma.jobStep.findMany({
      where,
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true
          }
        },
        // Include all possible step details
        paperStore: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            sheetSize: true
          }
        },
        printingDetails: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            noOfColours: true
          }
        },
        corrugation: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            flute: true
          }
        },
        flutelam: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            film: true
          }
        },
        punching: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            die: true
          }
        },
        sideFlapPasting: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            adhesive: true
          }
        },
        qualityDept: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            rejectedQty: true
          }
        },
        dispatchProcess: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true,
            quantity: true,
            dispatchNo: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.jobStep.count({ where })
  ]);

  // Filter by QC check status if specified
  let filteredSteps = jobSteps;
  if (hasQCCheck !== undefined) {
    const hasQCCheckBool = hasQCCheck === 'true';
    filteredSteps = jobSteps.filter(step => {
      const stepDetail = getStepDetail(step);
      const hasQC = stepDetail && stepDetail.qcCheckSignBy !== null;
      return hasQCCheckBool ? hasQC : !hasQC;
    });
  }

  res.status(200).json({
    success: true,
    count: filteredSteps.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    data: filteredSteps
  });
};

/**
 * Get job steps that need QC check (no QC check done yet)
 */
export const getJobStepsNeedingQCCheck = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canAccessAllJobSteps(userRole)) {
    throw new AppError('You are not authorized to access all job steps. Required roles: admin, planner, or flying_squad', 403);
  }

  const { page = '1', limit = '50' } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Get all job steps
  const jobSteps = await prisma.jobStep.findMany({
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true
          }
        },
      paperStore: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
      printingDetails: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
      corrugation: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
        flutelam: {
          select: {
            id: true,
            status: true,
            qcCheckSignBy: true,
            qcCheckAt: true
          }
        },
      punching: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
      sideFlapPasting: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
      qualityDept: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      },
      dispatchProcess: {
        select: {
          id: true,
          status: true,
          qcCheckSignBy: true,
          qcCheckAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Filter steps that need QC check
  const stepsNeedingQC = jobSteps.filter(step => {
    const stepDetail = getStepDetail(step);
    return stepDetail && stepDetail.qcCheckSignBy === null;
  });

  // Apply pagination
  const paginatedSteps = stepsNeedingQC.slice(skip, skip + limitNum);

  res.status(200).json({
    success: true,
    count: paginatedSteps.length,
    total: stepsNeedingQC.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(stepsNeedingQC.length / limitNum)
    },
    data: paginatedSteps
  });
};

/**
 * Perform QC check on a specific job step
 */
export const performQCCheck = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformQCCheck(userRole)) {
    throw new AppError('You are not authorized to perform QC checks. Required roles: admin or flying_squad', 403);
  }

  const { id } = req.params;
  const { remarks } = req.body;

  // Find the job step
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: parseInt(id) },
    include: {
      jobPlanning: {
        select: {
          nrcJobNo: true
        }
      }
    }
  });

  if (!jobStep) {
    throw new AppError('Job step not found', 404);
  }

  // Get the step detail based on step name
  const stepDetail = await getStepDetailFromDB(jobStep);
  if (!stepDetail) {
    throw new AppError('Step detail not found', 404);
  }

  // Update the QC check fields
  const updateData = {
    qcCheckSignBy: req.user?.userId,
    qcCheckAt: new Date()
  };

  let updatedStep;
  const stepName = jobStep.stepName;

  switch (stepName) {
    case 'PaperStore':
      updatedStep = await prisma.paperStore.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'PrintingDetails':
      updatedStep = await prisma.printingDetails.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'Corrugation':
      updatedStep = await prisma.corrugation.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'FluteLaminateBoardConversion':
      updatedStep = await prisma.fluteLaminateBoardConversion.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'Punching':
      updatedStep = await prisma.punching.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'SideFlapPasting':
      updatedStep = await prisma.sideFlapPasting.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'QualityDept':
      updatedStep = await prisma.qualityDept.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    case 'DispatchProcess':
      updatedStep = await prisma.dispatchProcess.update({
        where: { id: stepDetail.id },
        data: updateData
      });
      break;
    default:
      throw new AppError('Invalid step name', 400);
  }

  // Log the QC check action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.QC_CHECK_PERFORMED,
      `QC check performed on ${stepName} step for job: ${jobStep.jobPlanning?.nrcJobNo}`,
      stepName,
      stepDetail.id.toString(),
      jobStep.jobPlanning?.nrcJobNo
    );
  }

  res.status(200).json({
    success: true,
    data: {
      jobStepId: jobStep.id,
      stepName: jobStep.stepName,
      nrcJobNo: jobStep.jobPlanning?.nrcJobNo,
      qcCheckSignBy: req.user?.userId,
      qcCheckAt: updateData.qcCheckAt,
      remarks
    },
    message: 'QC check completed successfully'
  });
};

/**
 * Get QC check statistics
 */
export const getQCStats = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canAccessAllJobSteps(userRole)) {
    throw new AppError('You are not authorized to access QC statistics. Required roles: admin, planner, or flying_squad', 403);
  }

  // Get all job steps with their QC status
  const jobSteps = await prisma.jobStep.findMany({
    include: {
      paperStore: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      printingDetails: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      corrugation: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      flutelam: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      punching: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      sideFlapPasting: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      qualityDept: { select: { qcCheckSignBy: true, qcCheckAt: true } },
      dispatchProcess: { select: { qcCheckSignBy: true, qcCheckAt: true } }
    }
  });

  let totalSteps = 0;
  let qcCheckedSteps = 0;
  const qcStatsByStep: { [key: string]: { total: number; checked: number } } = {};

  jobSteps.forEach(step => {
    const stepDetail = getStepDetail(step);
    if (stepDetail) {
      totalSteps++;
      if (stepDetail.qcCheckSignBy) {
        qcCheckedSteps++;
      }

      if (!qcStatsByStep[step.stepName]) {
        qcStatsByStep[step.stepName] = { total: 0, checked: 0 };
      }
      qcStatsByStep[step.stepName].total++;
      if (stepDetail.qcCheckSignBy) {
        qcStatsByStep[step.stepName].checked++;
      }
    }
  });

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalSteps,
        qcCheckedSteps,
        pendingQCChecks: totalSteps - qcCheckedSteps,
        qcCheckRate: totalSteps > 0 ? (qcCheckedSteps / totalSteps * 100).toFixed(2) : 0
      },
      byStepType: qcStatsByStep
    }
  });
};

// Helper function to get step detail from job step
function getStepDetail(step: any) {
  const stepName = step.stepName;
  switch (stepName) {
    case 'PaperStore':
      return step.paperStore;
    case 'PrintingDetails':
      return step.printingDetails;
    case 'Corrugation':
      return step.corrugation;
    case 'FluteLaminateBoardConversion':
      return step.flutelam;
    case 'Punching':
      return step.punching;
    case 'SideFlapPasting':
      return step.sideFlapPasting;
    case 'QualityDept':
      return step.qualityDept;
    case 'DispatchProcess':
      return step.dispatchProcess;
    default:
      return null;
  }
}

// Helper function to get step detail from database
async function getStepDetailFromDB(step: any) {
  const stepName = step.stepName;
  switch (stepName) {
    case 'PaperStore':
      return await prisma.paperStore.findUnique({ where: { jobStepId: step.id } });
    case 'PrintingDetails':
      return await prisma.printingDetails.findUnique({ where: { jobStepId: step.id } });
    case 'Corrugation':
      return await prisma.corrugation.findUnique({ where: { jobStepId: step.id } });
    case 'FluteLaminateBoardConversion':
      return await prisma.fluteLaminateBoardConversion.findUnique({ where: { jobStepId: step.id } });
    case 'Punching':
      return await prisma.punching.findUnique({ where: { jobStepId: step.id } });
    case 'SideFlapPasting':
      return await prisma.sideFlapPasting.findUnique({ where: { jobStepId: step.id } });
    case 'QualityDept':
      return await prisma.qualityDept.findUnique({ where: { jobStepId: step.id } });
    case 'DispatchProcess':
      return await prisma.dispatchProcess.findUnique({ where: { jobStepId: step.id } });
    default:
      return null;
  }
}
