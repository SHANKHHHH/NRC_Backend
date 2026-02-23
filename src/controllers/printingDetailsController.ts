import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkMachineAccess, getFilteredJobNumbers } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';
import { calculateShift } from '../utils/autoPopulateFields';

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
  // If a minimal PrintingDetails was already created on START, update it; otherwise create a new one.
  const printingDetails = await prisma.printingDetails.upsert({
    where: { jobStepId: jobStepId },
    update: {
      ...data
    },
    create: {
      ...data,
      jobStepId
    }
  });

  await prisma.jobStep.update({
    where: { id: jobStepId },
    data: { printingDetails: { connect: { id: printingDetails.id } } }
  });

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

export const getPrintingDetailsByJobStepId = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  
  try {
    // Get job step with printing details using jobStepId as unique identifier
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        printingDetails: true
      }
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    if (jobStep.stepName !== 'PrintingDetails') {
      throw new AppError(`Job step ${jobStepId} is not a printing step`, 400);
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
      printingDetails: jobStep.printingDetails
    };

    res.status(200).json({ 
      success: true, 
      data: response,
      message: `Found printing job step using jobStepId: ${jobStepId}`
    });
  } catch (error) {
    console.error(`Error fetching printing details for jobStepId ${jobStepId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to fetch printing details', 500);
  }
};

export const getAllPrintingDetails = async (req: Request, res: Response) => {
  const userRole = req.user?.role || '';
  const userMachineIds = req.userMachineIds || []; // From middleware
  
  try {
    // Get job steps for printing role using jobStepId as unique identifier
    // High demand jobs are visible to all users, regular jobs only to printers with machine access
    const jobSteps = await prisma.jobStep.findMany({
      where: { 
        stepName: 'PrintingDetails',
        OR: [
          // High demand jobs visible to all users
          {
            jobPlanning: {
              jobDemand: 'high'
            }
          },
          // Regular jobs visible to printers, admin, planner, and production_head (so Production Head can see and continue)
          ...(userRole === 'printer' || userRole === 'admin' || userRole === 'planner' || userRole === 'production_head' ||
              (typeof userRole === 'string' && (userRole.includes('printer') || userRole.includes('production_head'))) ? [{
            jobPlanning: {
              jobDemand: { not: 'high' as any }
            },
            // Machine filtering will be done in application logic
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
        printingDetails: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Filter by machine access for non-admin/planner/production_head users (Production Head sees all to continue jobs)
    let filteredSteps = jobSteps;
    if (userRole !== 'admin' && userRole !== 'planner' && userRole !== 'production_head' && userMachineIds.length > 0) {
      filteredSteps = jobSteps.filter(step => {
        // High demand jobs are always visible
        if (step.jobPlanning?.jobDemand === 'high') return true;
        
        // Check if user has access to any machine in this step
        if (step.machineDetails && Array.isArray(step.machineDetails)) {
          return step.machineDetails.some((machine: any) => {
            const machineId = machine?.machineId || machine?.id;
            return userMachineIds.includes(machineId);
          });
        }
        
        // If no machine details, allow access (backward compatibility)
        return true;
      });
    }

    // Format response with jobStepId as unique identifier
    const formattedSteps = filteredSteps.map(step => ({
      jobStepId: step.id, // Use jobStepId as unique identifier
      stepName: step.stepName,
      status: step.status,
      user: step.user,
      completedBy: step.completedBy,
      startDate: step.startDate,
      endDate: step.endDate,
      createdAt: step.createdAt,
      updatedAt: step.updatedAt,
      machineDetails: step.machineDetails,
      jobPlanning: step.jobPlanning,
      printingDetails: step.printingDetails,
      isHighDemand: step.jobPlanning?.jobDemand === 'high'
    }));
    
    res.status(200).json({ 
      success: true, 
      count: formattedSteps.length, 
      data: formattedSteps,
      message: `Found ${formattedSteps.length} printing job steps (high demand visible to all, regular jobs to printers and production head)`
    });
  } catch (error) {
    console.error('Error fetching printing details:', error);
    throw new AppError('Failed to fetch printing details', 500);
  }
};


export const updatePrintingDetails = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  // URL decode the nrcJobNo parameter to handle spaces and special characters
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

  const existingPrintingDetails = await prisma.printingDetails.findFirst({
    where: { jobNrcJobNo: decodedNrcJobNo },
  });

  if (!existingPrintingDetails)
    throw new AppError('PrintingDetails not found', 404);

  // Enforce machine access for non-admin/non-flying-squad users based on the linked job step
  const jobStep = await prisma.jobStep.findFirst({
    where: { printingDetails: { id: existingPrintingDetails.id } },
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
  const editableData = filterEditableFields(existingPrintingDetails, req.body);

  // Auto-populate common step fields (date, shift, operator, machine)
  const { autoPopulateStepFields } = await import('../utils/autoPopulateFields');
  const populatedData = jobStep 
    ? await autoPopulateStepFields(editableData, jobStep.id, req.user?.userId, decodedNrcJobNo)
    : editableData;

  const printingDetails = await prisma.printingDetails.update({
    where: { id: existingPrintingDetails.id },
    data: populatedData, 
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
      `Updated PrintingDetails step with jobNrcJobNo: ${decodedNrcJobNo}`,
      'PrintingDetails',
      decodedNrcJobNo
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
  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const printingDetails = await prisma.printingDetails.findMany({ where: { jobNrcJobNo: decodedNrcJobNo } });
  
  // Auto-populate missing fields for each printing details record
  const { autoPopulateStepFields } = await import('../utils/autoPopulateFields');
  const populatedDetails = await Promise.all(
    printingDetails.map(async (pd) => {
      // Get jobStepId to find the job step
      const jobStep = await prisma.jobStep.findFirst({
        where: { 
          jobPlanning: {
            nrcJobNo: decodedNrcJobNo
          },
          stepName: 'PrintingDetails'
        }
      });
      
      if (jobStep) {
        return await autoPopulateStepFields(pd, jobStep.id, req.user?.userId, decodedNrcJobNo);
      }
      return pd;
    })
  );
  
  // Add editability information for each printing details record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = populatedDetails.map(pd => wrapWithEditability(pd));
  
  res.status(200).json({ success: true, data: dataWithEditability });
};

export const updatePrintingDetailsStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the PrintingDetails by jobNrcJobNo
  const existing = await prisma.printingDetails.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'PrintingDetails not found' });
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
  const updated = await prisma.printingDetails.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated PrintingDetails status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'PrintingDetails',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'PrintingDetails status updated' });
};