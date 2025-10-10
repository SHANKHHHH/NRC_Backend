import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkMachineAccess, getFilteredJobNumbers } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';
import { calculateShift } from '../utils/autoPopulateFields';

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
  const userMachineIds = req.userMachineIds || []; // From middleware
  
  console.log('🔍 [CORRUGATION DEBUG] User Info:', {
    userId: req.user?.userId,
    userRole: userRole,
    userMachineIds: userMachineIds,
    userMachineIdsLength: userMachineIds.length
  });
  
  try {
    // Get job steps for corrugation role using jobStepId as unique identifier
    // High demand jobs are visible to all users, regular jobs only to corrugators with machine access
    console.log('🔍 [CORRUGATION DEBUG] Building query for role:', userRole);
    
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
          // Regular jobs only visible to corrugators (or admin/planner) with machine access
          ...(userRole === 'corrugator' || userRole === 'admin' || userRole === 'planner' || 
              (typeof userRole === 'string' && userRole.includes('corrugator')) ? [{
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
        corrugation: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    console.log('🔍 [CORRUGATION DEBUG] Raw job steps from DB:', {
      totalSteps: jobSteps.length,
      highDemandSteps: jobSteps.filter(step => step.jobPlanning?.jobDemand === 'high').length,
      regularSteps: jobSteps.filter(step => step.jobPlanning?.jobDemand !== 'high').length,
      sampleSteps: jobSteps.slice(0, 3).map(step => ({
        id: step.id,
        stepName: step.stepName,
        jobDemand: step.jobPlanning?.jobDemand,
        machineDetails: step.machineDetails
      }))
    });

    // Filter by machine access for non-admin/planner users
    let filteredSteps = jobSteps;
    if (userRole !== 'admin' && userRole !== 'planner' && userMachineIds.length > 0) {
      console.log('🔍 [CORRUGATION DEBUG] Applying machine filtering for user with machines:', userMachineIds);
      
      filteredSteps = jobSteps.filter(step => {
        // High demand jobs are always visible
        if (step.jobPlanning?.jobDemand === 'high') {
          console.log('✅ [CORRUGATION DEBUG] High demand job allowed:', step.id);
          return true;
        }
        
        // Check if user has access to any machine in this step
        if (step.machineDetails && Array.isArray(step.machineDetails)) {
          const hasAccess = step.machineDetails.some((machine: any) => {
            const machineId = machine?.machineId || machine?.id;
            const hasMachineAccess = userMachineIds.includes(machineId);
            console.log('🔍 [CORRUGATION DEBUG] Machine check:', {
              stepId: step.id,
              machineId: machineId,
              userHasAccess: hasMachineAccess,
              userMachineIds: userMachineIds
            });
            return hasMachineAccess;
          });
          
          if (!hasAccess) {
            console.log('❌ [CORRUGATION DEBUG] No machine access for step:', step.id);
          }
          
          return hasAccess;
        }
        
        // If no machine details, allow access (backward compatibility)
        console.log('✅ [CORRUGATION DEBUG] No machine details, allowing access:', step.id);
        return true;
      });
      
      console.log('🔍 [CORRUGATION DEBUG] After machine filtering:', {
        originalCount: jobSteps.length,
        filteredCount: filteredSteps.length,
        removedCount: jobSteps.length - filteredSteps.length
      });
    } else {
      console.log('🔍 [CORRUGATION DEBUG] No machine filtering applied - user role:', userRole, 'machines:', userMachineIds.length);
    }

    // Format response with jobStepId as unique identifier
    const formattedSteps = filteredSteps.map(step => ({
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
    
    console.log('🔍 [CORRUGATION DEBUG] Final response:', {
      totalSteps: formattedSteps.length,
      highDemandSteps: formattedSteps.filter(step => step.isHighDemand).length,
      regularSteps: formattedSteps.filter(step => !step.isHighDemand).length,
      userRole: userRole,
      userMachineIds: userMachineIds
    });

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
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const corrugations = await prisma.corrugation.findMany({ where: { jobNrcJobNo: decodedNrcJobNo } });
  
  // Auto-populate missing fields for each corrugation record
  const { autoPopulateStepFields, autoPopulateCorrugationFields } = await import('../utils/autoPopulateFields');
  const populatedCorrugations = await Promise.all(
    corrugations.map(async (c) => {
      // Get jobStepId to find the job step
      const jobStep = await prisma.jobStep.findFirst({
        where: { 
          jobPlanning: {
            nrcJobNo: decodedNrcJobNo
          },
          stepName: 'Corrugation'
        }
      });
      
      if (jobStep) {
        // First apply common step fields
        const withCommonFields = await autoPopulateStepFields(c, jobStep.id, req.user?.userId, decodedNrcJobNo);
        // Then apply corrugation specific fields
        return await autoPopulateCorrugationFields(withCommonFields, decodedNrcJobNo);
      }
      return c;
    })
  );
  
  // Add editability information for each corrugation record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = populatedCorrugations.map(c => wrapWithEditability(c));
  
  res.status(200).json({ success: true, data: dataWithEditability });
};


export const updateCorrugation = async (req: Request, res: Response) => {
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
    // Step 1: Find the Corrugation record by jobNrcJobNo
    const existingCorrugation = await prisma.corrugation.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingCorrugation) {
      throw new AppError('Corrugation record not found', 404);
    }

    // Enforce machine access for non-admin/non-flying-squad users based on the linked job step
    const jobStep = await prisma.jobStep.findFirst({
      where: { corrugation: { id: existingCorrugation.id } },
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
    const editableData = filterEditableFields(existingCorrugation, req.body);

    // Auto-populate common step fields and corrugation-specific fields
    const { autoPopulateStepFields, autoPopulateCorrugationFields } = await import('../utils/autoPopulateFields');
    let populatedData = editableData;
    if (jobStep) {
      populatedData = await autoPopulateStepFields(editableData, jobStep.id, req.user?.userId, decodedNrcJobNo);
    }
    populatedData = await autoPopulateCorrugationFields(populatedData, decodedNrcJobNo);

    // Step 2: Update using the unique id
    const corrugation = await prisma.corrugation.update({
      where: { id: existingCorrugation.id },
      data: populatedData,
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
        `Updated Corrugation step with jobNrcJobNo: ${decodedNrcJobNo}`,
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

export const updateCorrugationStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the Corrugation by jobNrcJobNo
  const existing = await prisma.corrugation.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Corrugation not found' });
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
  const updated = await prisma.corrugation.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated Corrugation status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'Corrugation',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'Corrugation status updated' });
};