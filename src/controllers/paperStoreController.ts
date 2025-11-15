import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
// Machine access checks removed for PaperStore create/update per requirement
import { RoleManager } from '../utils/roleUtils';

// Create PaperStore step detail, only if previous step is accepted
export const createPaperStore = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for paper store
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  // Machine access check removed: allow creating PaperStore regardless of machine assignment
  
  // Find the JobStep
  const jobStep = await prisma.jobStep.findUnique({ where: { id: jobStepId }, include: { jobPlanning: { include: { steps: true } } } });
  if (!jobStep) throw new AppError('JobStep not found', 404);
  // Check if this is the first step or not
  const steps = jobStep.jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
  const thisStepIndex = steps.findIndex(s => s.id === jobStepId);
  if (thisStepIndex > 0) {
    const prevStep = steps[thisStepIndex - 1];
    // Fetch the detail model for the previous step
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
  // Create PaperStore
  const paperStore = await prisma.paperStore.create({ data: { ...data, jobStepId } });
  // Link to JobStep
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { paperStore: { connect: { id: paperStore.id } } } });

  // Log PaperStore step creation
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
      `Created PaperStore step for jobStepId: ${jobStepId}`,
      'PaperStore',
      paperStore.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: paperStore, message: 'PaperStore step created' });
};

export const getPaperStoreById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const paperStore = await prisma.paperStore.findUnique({ where: { id: Number(id) } });
  if (!paperStore) throw new AppError('PaperStore not found', 404);
  res.status(200).json({ success: true, data: paperStore });
};

export const getPaperStoreByJobStepId = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  
  try {
    // Get job step with paper store details using jobStepId as unique identifier
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        paperStore: true
      }
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    if (jobStep.stepName !== 'PaperStore') {
      throw new AppError(`Job step ${jobStepId} is not a paper store step`, 400);
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
      paperStore: jobStep.paperStore
    };

    res.status(200).json({ 
      success: true, 
      data: response,
      message: `Found paper store job step using jobStepId: ${jobStepId}`
    });
  } catch (error) {
    console.error(`Error fetching paper store details for jobStepId ${jobStepId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to fetch paper store details', 500);
  }
};

export const getAllPaperStores = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  
  // Get unified role-specific step data
  const { UnifiedJobDataHelper } = await import('../utils/unifiedJobDataHelper');
  const paperStoreSteps = await UnifiedJobDataHelper.getRoleSpecificStepData(userMachineIds || null, userRole, 'PaperStore');
  
  res.status(200).json({ 
    success: true, 
    count: paperStoreSteps.length, 
    data: paperStoreSteps 
  });
};

export const getPaperStoreByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { jobPlanId } = req.query;
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const jobPlanIdNumber = jobPlanId !== undefined ? Number(jobPlanId) : undefined;
  
  const paperStores = await prisma.paperStore.findMany({
    where: {
      jobNrcJobNo: decodedNrcJobNo,
      ...(jobPlanIdNumber !== undefined && !Number.isNaN(jobPlanIdNumber)
        ? {
            jobStep: {
              is: {
                jobPlanningId: jobPlanIdNumber,
              },
            },
          }
        : {}),
    },
    include: {
      jobStep: {
        select: {
          id: true,
          jobPlanningId: true,
          stepNo: true,
          status: true,
        },
      },
    },
  });
  
  // Auto-populate missing fields for each paper store record
  const { autoPopulateStepFields, autoPopulatePaperStoreFields } = await import('../utils/autoPopulateFields');
  const populatedStores = await Promise.all(
    paperStores.map(async (ps) => {
      const jobStepId = ps.jobStepId || ps.jobStep?.id;
      let processed = ps;

      if (jobStepId) {
        // First apply common step fields
        const withCommonFields = await autoPopulateStepFields(ps, jobStepId, req.user?.userId, decodedNrcJobNo);
        // Then apply paper store specific fields
        processed = await autoPopulatePaperStoreFields(withCommonFields, decodedNrcJobNo);
      }

      return {
        ...processed,
        jobStepId: jobStepId ?? processed.jobStepId,
        jobPlanningId: ps.jobStep?.jobPlanningId ?? null,
      };
    })
  );
  
  // Add editability information for each paper store record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = populatedStores.map(ps => wrapWithEditability(ps));
  
  res.status(200).json({ success: true, data: dataWithEditability });
};

// Start PaperStore work (simplified without workflow validation)
export const startPaperStoreWork = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the JobStep for PaperStore
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: decodedNrcJobNo
        },
        stepName: 'PaperStore'
      }
    });

    if (!jobStep) {
      throw new AppError('PaperStore job step not found', 404);
    }

    // Find or create PaperStore record
    let paperStore = await prisma.paperStore.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo }
    });

    if (!paperStore) {
      // Create new PaperStore record
      paperStore = await prisma.paperStore.create({
        data: {
          jobNrcJobNo: decodedNrcJobNo,
          jobStepId: jobStep.id,
          status: 'in_progress'
        }
      });
    } else if (paperStore.status !== 'in_progress') {
      // Update existing record to in_progress
      paperStore = await prisma.paperStore.update({
        where: { id: paperStore.id },
        data: { status: 'in_progress' }
      });
    }

    // Update JobStep status to start
    await prisma.jobStep.update({
      where: { id: jobStep.id },
      data: {
        status: 'start',
        startDate: new Date()
      }
    });

    // Log action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Started PaperStore work for job: ${decodedNrcJobNo}`,
        'PaperStore',
        decodedNrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: paperStore,
      message: 'PaperStore work started successfully',
    });
  } catch (error: unknown) {
    console.error('Start PaperStore work error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Hold PaperStore work
export const holdPaperStore = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const { holdRemark } = req.body;
  
  try {
    // Find the PaperStore record
    const existingPaperStore = await prisma.paperStore.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingPaperStore) {
      throw new AppError('PaperStore record not found', 404);
    }

    // Update status to hold
    const updatedPaperStore = await prisma.paperStore.update({
      where: { id: existingPaperStore.id },
      data: {
        status: 'hold',
        holdRemark: holdRemark || 'Work on hold'
      },
    });

    // Also update JobStep status
    if (existingPaperStore.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingPaperStore.jobStepId },
        data: { status: 'start' } // Keep JobStep as 'start' when individual step is on hold
      });
    }

    res.status(200).json({
      success: true,
      data: updatedPaperStore,
      message: 'PaperStore work held successfully',
    });
  } catch (error: unknown) {
    console.error('Hold PaperStore error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Resume PaperStore work
export const resumePaperStore = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the PaperStore record
    const existingPaperStore = await prisma.paperStore.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingPaperStore) {
      throw new AppError('PaperStore record not found', 404);
    }

    // Update status to in_progress
    const updatedPaperStore = await prisma.paperStore.update({
      where: { id: existingPaperStore.id },
      data: {
        status: 'in_progress',
      },
    });

    // Also update JobStep status
    if (existingPaperStore.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingPaperStore.jobStepId },
        data: { status: 'start' }
      });
    }

    res.status(200).json({
      success: true,
      data: updatedPaperStore,
      message: 'PaperStore work resumed successfully',
    });
  } catch (error: unknown) {
    console.error('Resume PaperStore error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

export const updatePaperStore = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const userRole = req.user?.role;
  const { jobStepId } = req.body;
  if (jobStepId !== undefined) {
    delete req.body.jobStepId;
  }
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
  // const paperStore = await prisma.paperStore.update({ where: { jobNrcJobNo: nrcJobNo }, data: req.body });

  // // Log PaperStore step update
  // if (req.user?.userId) {
  //   await logUserActionWithResource(
  //     req.user.userId,
  //     ActionTypes.JOBSTEP_UPDATED,
  //     `Updated PaperStore step with id: ${nrcJobNo}`,
  //     'PaperStore',
  //     nrcJobNo
  //   );
  // }
  // res.status(200).json({ success: true, data: paperStore, message: 'PaperStore updated' });

// Step 1: Find the PaperStore by jobStepId (preferred) or fallback to jobNrcJobNo
let existing = jobStepId !== undefined
  ? await prisma.paperStore.findUnique({
      where: { jobStepId: Number(jobStepId) },
    })
  : null;

if (!existing) {
  existing = await prisma.paperStore.findFirst({
    where: { jobNrcJobNo: decodedNrcJobNo },
  });
}

// Machine access enforcement removed for PaperStore as per requirement

  // Filter out non-editable fields (fields that already have data)
const { filterEditableFields } = await import('../utils/fieldEditability');
const editableData = filterEditableFields(existing ?? {}, req.body);

// Always allow overriding status when explicitly provided
if (req.body.status !== undefined) {
  editableData.status = req.body.status;
}

// Auto-populate fields from job details
const { autoPopulatePaperStoreFields } = await import('../utils/autoPopulateFields');
const populatedData = await autoPopulatePaperStoreFields(editableData, decodedNrcJobNo);

if (!existing) {
  const created = await prisma.paperStore.create({
    data: {
      jobNrcJobNo: decodedNrcJobNo,
      ...(jobStepId !== undefined ? { jobStepId: Number(jobStepId) } : {}),
      ...populatedData,
    },
  });

  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_CREATED,
      `Created PaperStore step with jobNrcJobNo: ${decodedNrcJobNo}`,
      'PaperStore',
      decodedNrcJobNo
    );
  }

  return res.status(200).json({ success: true, data: created, message: 'PaperStore created' });
}

// Step 2: Use its ID to update (since ID is unique)
const updated = await prisma.paperStore.update({
  where: { id: existing.id },
  data: populatedData,
});

// Log action
if (req.user?.userId) {
  await logUserActionWithResource(
    req.user.userId,
    ActionTypes.JOBSTEP_UPDATED,
    `Updated PaperStore step with jobNrcJobNo: ${decodedNrcJobNo}`,
    'PaperStore',
    decodedNrcJobNo
  );
}

res.status(200).json({ success: true, data: updated, message: 'PaperStore updated' });

};

export const updatePaperStoreStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the PaperStore by jobNrcJobNo
  const existing = await prisma.paperStore.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'PaperStore not found' });
  }
  
  // Prepare update data
  const updateData: any = { status };
  
  // Note: PaperStore model doesn't have date, shift, or remarks fields
  // Only update status for now
  
  // If status is hold or in_progress, we could add remarks to a different field
  // but PaperStore model doesn't have remarks field either
  
  // Update the status
  const updated = await prisma.paperStore.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated PaperStore status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'PaperStore',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'PaperStore status updated' });
};

export const deletePaperStore = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.paperStore.delete({ where: { id: Number(id) } });

  // Log PaperStore step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted PaperStore step with id: ${id}`,
      'PaperStore',
      id
    );
  }
  res.status(200).json({ success: true, message: 'PaperStore deleted' });
}; 