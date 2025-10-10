import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';
import { calculateShift } from '../utils/autoPopulateFields';

export const createDispatchProcess = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // No machine access check for Dispatch; keep original simple flow
  
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
  
  // Get unified role-specific step data
  const { UnifiedJobDataHelper } = await import('../utils/unifiedJobDataHelper');
  const dispatchProcessSteps = await UnifiedJobDataHelper.getRoleSpecificStepData(userMachineIds || null, userRole, 'DispatchProcess');
  
  res.status(200).json({ 
    success: true, 
    count: dispatchProcessSteps.length, 
    data: dispatchProcessSteps 
  });
};

export const getDispatchProcessByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const dispatchProcesses = await prisma.dispatchProcess.findMany({ where: { jobNrcJobNo: decodedNrcJobNo } });
  
  // Add editability information for each dispatch process record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = dispatchProcesses.map(dp => wrapWithEditability(dp));
  
  res.status(200).json({ success: true, data: dataWithEditability });
};


// Start DispatchProcess work (with previous step validation)
export const startDispatchWork = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the JobStep for DispatchProcess
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: decodedNrcJobNo
        },
        stepName: 'DispatchProcess'
      },
      include: {
        jobPlanning: {
          include: {
            steps: {
              orderBy: { stepNo: 'asc' }
            }
          }
        }
      }
    });

    if (!jobStep) {
      throw new AppError('DispatchProcess job step not found', 404);
    }

    // VALIDATION: Check if previous step is completed (status = accept)
    const allSteps = jobStep.jobPlanning.steps;
    const currentStepIndex = allSteps.findIndex(s => s.id === jobStep.id);
    
    if (currentStepIndex > 0) {
      const previousStep = allSteps[currentStepIndex - 1];
      
      // Find the previous step's individual form data
      let previousStepDetail: any = null;
      switch (previousStep.stepName) {
        case 'PaperStore':
          previousStepDetail = await prisma.paperStore.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'PrintingDetails':
          previousStepDetail = await prisma.printingDetails.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'Corrugation':
          previousStepDetail = await prisma.corrugation.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'FluteLaminateBoardConversion':
          previousStepDetail = await prisma.fluteLaminateBoardConversion.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'Punching':
          previousStepDetail = await prisma.punching.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'SideFlapPasting':
          previousStepDetail = await prisma.sideFlapPasting.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        case 'QualityDept':
          previousStepDetail = await prisma.qualityDept.findFirst({ where: { jobStepId: previousStep.id } });
          break;
        default:
          break;
      }
      
      // Check if previous step status is 'accept'
      if (!previousStepDetail || previousStepDetail.status !== 'accept') {
        throw new AppError(`Previous step (${previousStep.stepName}) must be completed before starting Dispatch work`, 400);
      }
    }

    // Find or create DispatchProcess record
    let dispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo }
    });

    if (!dispatchProcess) {
      // Create new DispatchProcess record
      dispatchProcess = await prisma.dispatchProcess.create({
        data: {
          jobNrcJobNo: decodedNrcJobNo,
          jobStepId: jobStep.id,
          status: 'in_progress'
        }
      });
    } else if (dispatchProcess.status !== 'in_progress') {
      // Update existing record to in_progress
      dispatchProcess = await prisma.dispatchProcess.update({
        where: { id: dispatchProcess.id },
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
        `Started Dispatch work for job: ${decodedNrcJobNo}`,
        'DispatchProcess',
        decodedNrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: dispatchProcess,
      message: 'Dispatch work started successfully',
    });
  } catch (error: unknown) {
    console.error('Start Dispatch work error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Hold DispatchProcess work
export const holdDispatchProcess = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const { holdRemark } = req.body;
  
  try {
    // Find the DispatchProcess record
    const existingDispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // Update status to hold
    const updatedDispatchProcess = await prisma.dispatchProcess.update({
      where: { id: existingDispatchProcess.id },
      data: {
        status: 'hold',
        remarks: holdRemark || 'Work on hold'
      },
    });

    // Also update JobStep status
    if (existingDispatchProcess.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingDispatchProcess.jobStepId },
        data: { status: 'start' } // Keep JobStep as 'start' when individual step is on hold
      });
    }

    res.status(200).json({
      success: true,
      data: updatedDispatchProcess,
      message: 'DispatchProcess work held successfully',
    });
  } catch (error: unknown) {
    console.error('Hold DispatchProcess error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Resume DispatchProcess work
export const resumeDispatchProcess = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the DispatchProcess record
    const existingDispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // Update status to in_progress
    const updatedDispatchProcess = await prisma.dispatchProcess.update({
      where: { id: existingDispatchProcess.id },
      data: {
        status: 'in_progress',
      },
    });

    // Also update JobStep status
    if (existingDispatchProcess.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingDispatchProcess.jobStepId },
        data: { status: 'start' }
      });
    }

    res.status(200).json({
      success: true,
      data: updatedDispatchProcess,
      message: 'DispatchProcess work resumed successfully',
    });
  } catch (error: unknown) {
    console.error('Resume DispatchProcess error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

export const updateDispatchProcess = async (req: Request, res: Response) => {
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
    // Step 1: Find the DispatchProcess record by jobNrcJobNo
    const existingDispatchProcess = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // No machine access enforcement for Dispatch; keep original simple flow

    // Filter out non-editable fields (fields that already have data)
    const { filterEditableFields } = await import('../utils/fieldEditability');
    const editableData = filterEditableFields(existingDispatchProcess, req.body);

    // Keep simple flow for Dispatch: use editable data directly
    const populatedData = editableData;

    // Step 2: Update using its unique id
    const dispatchProcess = await prisma.dispatchProcess.update({
      where: { id: existingDispatchProcess.id },
      data: populatedData,
    });

    // Step 3: Log update
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated DispatchProcess step with jobNrcJobNo: ${decodedNrcJobNo}`,
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

export const updateDispatchProcessStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the DispatchProcess by jobNrcJobNo
  const existing = await prisma.dispatchProcess.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'DispatchProcess not found' });
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
  const updated = await prisma.dispatchProcess.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated DispatchProcess status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'DispatchProcess',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'DispatchProcess status updated' });
}; 