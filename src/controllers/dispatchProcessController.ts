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
  
  // Get accessible job numbers based on user's machine access
  const { getFilteredJobNumbers } = await import('../middleware/machineAccess');
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
  
  // Get all DispatchProcess records for accessible jobs
  const dispatchProcesses = await prisma.dispatchProcess.findMany({
    where: { jobNrcJobNo: { in: accessibleJobNumbers } },
    include: {
      job: {
        include: {
          purchaseOrders: {
            select: {
              totalPOQuantity: true
            }
          }
        }
      },
      jobStep: {
        select: {
          id: true,
          stepNo: true,
          stepName: true,
          status: true,
          startDate: true,
          endDate: true,
          user: true,
          completedBy: true,
          machineDetails: true
        }
      }
    },
    orderBy: { id: 'desc' }
  });
  
  // Group by job and format the data
  const jobsMap = new Map<string, any>();
  
  dispatchProcesses.forEach((dp, index) => {
    if (!jobsMap.has(dp.jobNrcJobNo)) {
      // Calculate total PO quantity
      let totalPOQuantity = 0;
      if (dp.job && dp.job.purchaseOrders && Array.isArray(dp.job.purchaseOrders)) {
        totalPOQuantity = dp.job.purchaseOrders.reduce((sum: number, po: any) => {
          const poQty = po?.totalPOQuantity ?? 0;
          return sum + (typeof poQty === 'number' ? poQty : parseInt(poQty?.toString() || '0', 10));
        }, 0);
      }
      
      jobsMap.set(dp.jobNrcJobNo, {
        nrcJobNo: dp.jobNrcJobNo,
        jobDetails: {
          ...dp.job,
          totalPOQuantity: totalPOQuantity
        },
        dispatchDetails: []
      });
    }
    
    // Add dispatch details to the job
    jobsMap.get(dp.jobNrcJobNo).dispatchDetails.push({
      idx: index + 1,
      id: dp.id,
      date: dp.date,
      shift: dp.shift,
      operatorName: dp.operatorName,
      dispatchNo: dp.dispatchNo,
      dispatchDate: dp.dispatchDate,
      remarks: dp.remarks,
      balanceQty: dp.balanceQty,
      qcCheckSignBy: dp.qcCheckSignBy,
      status: dp.status,
      jobStepId: dp.jobStepId,
      qcCheckAt: dp.qcCheckAt,
      quantity: dp.quantity,
      dispatchHistory: dp.dispatchHistory,
      totalDispatchedQty: dp.totalDispatchedQty,
      stepDetails: dp.jobStep
    });
  });
  
  const formattedData = Array.from(jobsMap.values());
  
  res.status(200).json({ 
    success: true, 
    count: formattedData.length, 
    data: formattedData 
  });
};

export const getDispatchProcessByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { jobPlanId } = req.query;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const jobPlanIdNumber = jobPlanId !== undefined ? Number(jobPlanId) : undefined;

  const dispatchProcesses = await prisma.dispatchProcess.findMany({
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
  
  // Add editability information for each dispatch process record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = dispatchProcesses.map(dp =>
    wrapWithEditability({
      ...dp,
      jobStepId: dp.jobStepId ?? dp.jobStep?.id,
      jobPlanningId: dp.jobStep?.jobPlanningId ?? null,
    })
  );
  
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

    // VALIDATION: Check if previous step is started (allows parallel work)
    const allSteps = jobStep.jobPlanning.steps;
    const currentStepIndex = allSteps.findIndex(s => s.id === jobStep.id);
    
    if (currentStepIndex > 0) {
      const previousStep = allSteps[currentStepIndex - 1];
      
      // For START: Previous step must be started (status = 'start' or 'stop')
      // This allows parallel work - Dispatch can start while previous step is in progress
      if (previousStep.status !== 'start' && previousStep.status !== 'stop') {
        throw new AppError(
          `Previous step (${previousStep.stepName}) must be started before starting Dispatch work. Current status: ${previousStep.status}`,
          400
        );
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
    const existingDispatchProcess: any = await prisma.dispatchProcess.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingDispatchProcess) {
      throw new AppError('DispatchProcess record not found', 404);
    }

    // No machine access enforcement for Dispatch; keep original simple flow

    // Filter out non-editable fields (fields that already have data)
    const { filterEditableFields } = await import('../utils/fieldEditability');
    const editableData = filterEditableFields(existingDispatchProcess, req.body);

    // Handle partial dispatch tracking
    let populatedData = editableData;
    const dispatchedQty = editableData.quantity || 0;
    
    // Also check if dispatch is already complete (even if no new quantity is being dispatched)
    // This handles cases where the dispatch was already completed but status wasn't updated
    let shouldCheckCompletion = false;
    const currentTotalDispatched = existingDispatchProcess.totalDispatchedQty || 0;
    let newTotalDispatched = currentTotalDispatched; // Default to current total
    
    // If this is a new dispatch (quantity is being set), update partial dispatch tracking
    if (dispatchedQty > 0) {
      shouldCheckCompletion = true;
      
      // Get job total quantity (PO quantity) to check if fully dispatched
      // First try to get the specific PO linked to this job planning
      let jobQuantity = 0;
      let purchaseOrderId: number | null = null;
      
      if (existingDispatchProcess.jobStepId) {
        try {
          // Get the jobStep to find jobPlanningId
          const jobStep = await prisma.jobStep.findUnique({
            where: { id: existingDispatchProcess.jobStepId },
            include: { jobPlanning: { select: { jobPlanId: true, purchaseOrderId: true } } }
          });
          
          if (jobStep?.jobPlanning?.purchaseOrderId) {
            purchaseOrderId = jobStep.jobPlanning.purchaseOrderId;
            // Get the specific PO
            const job = await prisma.job.findUnique({ 
              where: { nrcJobNo: decodedNrcJobNo },
              include: { purchaseOrders: true }
            });
            
            const matchingPO = job?.purchaseOrders?.find((po: any) => po.id === purchaseOrderId);
            if (matchingPO) {
              jobQuantity = matchingPO.totalPOQuantity || 0;
              console.log(`✅ [updateDispatchProcess] Using specific PO quantity: ${jobQuantity} for PO ID: ${purchaseOrderId}`);
            }
          }
        } catch (error) {
          console.error('⚠️ [updateDispatchProcess] Error fetching job planning PO, falling back to sum:', error);
        }
      }
      
      // Fallback to sum of all POs if specific PO not found
      if (jobQuantity === 0) {
        const job = await prisma.job.findUnique({ 
          where: { nrcJobNo: decodedNrcJobNo },
          include: { purchaseOrders: true }
        });
        jobQuantity = job?.purchaseOrders?.reduce((sum: number, po: any) => sum + (po.totalPOQuantity || 0), 0) || 0;
        console.log(`⚠️ [updateDispatchProcess] Using sum of all POs: ${jobQuantity}`);
      }
      
      // Calculate how much can be dispatched (remaining PO quantity)
      const remainingPOQuantity = Math.max(0, jobQuantity - currentTotalDispatched);
      
      // Actual quantity to dispatch (capped at remaining PO quantity)
      const actualDispatchQty = Math.min(dispatchedQty, remainingPOQuantity);
      
      // Calculate excess quantity (if user tried to dispatch more than PO)
      const excessQuantity = Math.max(0, dispatchedQty - remainingPOQuantity);
      
      // Calculate new total (only up to PO quantity)
      const newTotalDispatched = currentTotalDispatched + actualDispatchQty;
      
      // Update totalDispatchedQty
      populatedData.totalDispatchedQty = newTotalDispatched;
      
      // Update dispatch history with actual dispatched quantity
      const dispatchHistory = existingDispatchProcess.dispatchHistory 
        ? (Array.isArray(existingDispatchProcess.dispatchHistory) ? existingDispatchProcess.dispatchHistory : JSON.parse(existingDispatchProcess.dispatchHistory as string))
        : [];
      
      dispatchHistory.push({
        dispatchDate: new Date().toISOString(),
        dispatchedQty: actualDispatchQty,
        dispatchNo: editableData.dispatchNo || `DISP-${Date.now()}`,
        remarks: editableData.remarks || '',
        operatorName: editableData.operatorName || req.user?.userId
      });
      
      populatedData.dispatchHistory = dispatchHistory;
      
      // If excess quantity exists, create/update FinishQuantity record
      if (excessQuantity > 0 && jobQuantity > 0) {
        // Use the purchaseOrderId we found above, or get first PO as fallback
        if (!purchaseOrderId) {
          const job = await prisma.job.findUnique({ 
            where: { nrcJobNo: decodedNrcJobNo },
            include: { purchaseOrders: true }
          });
          const firstPO = job?.purchaseOrders?.[0];
          purchaseOrderId = firstPO?.id || null;
        }
        
        // Create or update FinishQuantity record
        await prisma.finishQuantity.create({
          data: {
            jobNrcJobNo: decodedNrcJobNo,
            purchaseOrderId: purchaseOrderId,
            overDispatchedQuantity: excessQuantity,
            totalPOQuantity: jobQuantity,
            totalDispatchedQuantity: newTotalDispatched,
            status: 'available',
            remarks: `Excess quantity from dispatch. User tried to dispatch ${dispatchedQty}, but PO quantity is ${jobQuantity}. ${actualDispatchQty} dispatched, ${excessQuantity} added to finish quantity.`
          }
        });
        
        console.log(`✅ [updateDispatchProcess] Created FinishQuantity: ${excessQuantity} units for job ${decodedNrcJobNo}`);
      }
      
    }
    
    // If no new dispatch but we need to check completion, or if we just processed a dispatch
    if (shouldCheckCompletion || (!dispatchedQty && currentTotalDispatched > 0 && existingDispatchProcess.status === 'in_progress')) {
      // Get job total quantity (PO quantity) to check if fully dispatched
      // First try to get the specific PO linked to this job planning
      let jobQuantity = 0;
      let purchaseOrderId: number | null = null;
      
      if (existingDispatchProcess.jobStepId) {
        try {
          // Get the jobStep to find jobPlanningId
          const jobStep = await prisma.jobStep.findUnique({
            where: { id: existingDispatchProcess.jobStepId },
            include: { jobPlanning: { select: { jobPlanId: true, purchaseOrderId: true } } }
          });
          
          if (jobStep?.jobPlanning?.purchaseOrderId) {
            purchaseOrderId = jobStep.jobPlanning.purchaseOrderId;
            // Get the specific PO
            const job = await prisma.job.findUnique({ 
              where: { nrcJobNo: decodedNrcJobNo },
              include: { purchaseOrders: true }
            });
            
            const matchingPO = job?.purchaseOrders?.find((po: any) => po.id === purchaseOrderId);
            if (matchingPO) {
              jobQuantity = matchingPO.totalPOQuantity || 0;
              console.log(`✅ [updateDispatchProcess] Using specific PO quantity: ${jobQuantity} for PO ID: ${purchaseOrderId}`);
            }
          }
        } catch (error) {
          console.error('⚠️ [updateDispatchProcess] Error fetching job planning PO, falling back to sum:', error);
        }
      }
      
      // Fallback to sum of all POs if specific PO not found
      if (jobQuantity === 0) {
        const job = await prisma.job.findUnique({ 
          where: { nrcJobNo: decodedNrcJobNo },
          include: { purchaseOrders: true }
        });
        jobQuantity = job?.purchaseOrders?.reduce((sum: number, po: any) => sum + (po.totalPOQuantity || 0), 0) || 0;
        console.log(`⚠️ [updateDispatchProcess] Using sum of all POs: ${jobQuantity}`);
      }
      
      const totalToCheck = shouldCheckCompletion ? (typeof newTotalDispatched !== 'undefined' ? newTotalDispatched : currentTotalDispatched) : currentTotalDispatched;
      
      // If fully dispatched (or exceeded), set status to 'accept'
      console.log(`🔍 [updateDispatchProcess] Completion check: totalToCheck=${totalToCheck}, jobQuantity=${jobQuantity}, purchaseOrderId=${purchaseOrderId}`);
      if (totalToCheck >= jobQuantity && jobQuantity > 0) {
        populatedData.status = 'accept';
        populatedData.date = new Date();
        console.log(`✅ [updateDispatchProcess] Dispatch fully completed: ${totalToCheck} >= ${jobQuantity}, setting status to 'accept'`);
        // Also update JobStep status to 'stop' to allow job completion
        if (existingDispatchProcess.jobStepId) {
          await prisma.jobStep.update({
            where: { id: existingDispatchProcess.jobStepId },
            data: { 
              status: 'stop',
              endDate: new Date(),
              completedBy: req.user?.userId || null
            }
          });
          console.log(`✅ [updateDispatchProcess] Updated JobStep ${existingDispatchProcess.jobStepId} status to 'stop'`);
        }
      } else {
        console.log(`📦 [updateDispatchProcess] Partial dispatch: ${totalToCheck} / ${jobQuantity}, keeping status as 'in_progress'`);
      }
    }

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