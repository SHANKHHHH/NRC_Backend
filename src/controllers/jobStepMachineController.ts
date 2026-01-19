import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
// Using standard Error instead of Error

const prisma = new PrismaClient();

type PlanningIdentifiers = {
  jobPlanId?: number;
  jobStepId?: number;
};

function parsePlanningIdentifiers(req: Request): PlanningIdentifiers {
  const rawJobPlanId =
    (req.query?.jobPlanId as string | undefined) ??
    (req.body ? req.body.jobPlanId : undefined) ??
    ((req.params as any)?.jobPlanId as string | undefined);

  const rawJobStepId =
    (req.query?.jobStepId as string | undefined) ??
    (req.body ? req.body.jobStepId : undefined) ??
    ((req.params as any)?.jobStepId as string | undefined);

  const jobPlanId =
    rawJobPlanId !== undefined && rawJobPlanId !== null && rawJobPlanId !== ''
      ? Number(rawJobPlanId)
      : undefined;
  const jobStepId =
    rawJobStepId !== undefined && rawJobStepId !== null && rawJobStepId !== ''
      ? Number(rawJobStepId)
      : undefined;

  const normalizedJobPlanId =
    typeof jobPlanId === 'number' && !Number.isNaN(jobPlanId) ? jobPlanId : undefined;
  const normalizedJobStepId =
    typeof jobStepId === 'number' && !Number.isNaN(jobStepId) ? jobStepId : undefined;

  return {
    jobPlanId: normalizedJobPlanId,
    jobStepId: normalizedJobStepId,
  };
}

async function findJobStepForOperation(
  nrcJobNo: string,
  stepNo: number,
  identifiers: PlanningIdentifiers,
  include?: any
) {
  const { jobPlanId, jobStepId } = identifiers;

  const baseInclude = {
    jobPlanning: {
      select: { jobPlanId: true, nrcJobNo: true },
    },
  };

  const mergedInclude = include
    ? {
        ...include,
        jobPlanning: include.jobPlanning ?? baseInclude.jobPlanning,
      }
    : baseInclude;

  const buildQuery = (where: any) => {
    const query: any = { where };
    query.include = mergedInclude;
    return query;
  };

  if (jobStepId !== undefined) {
    const jobStep = await prisma.jobStep.findUnique(
      buildQuery({ id: jobStepId })
    ) as any;
    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }
    if (jobStep.jobPlanning.nrcJobNo !== nrcJobNo || jobStep.stepNo !== stepNo) {
      throw new AppError(
        `Job step ${jobStepId} does not belong to job ${nrcJobNo} step ${stepNo}`,
        400
      );
    }
    return jobStep;
  }

  const jobStep = await prisma.jobStep.findFirst(
    buildQuery({
      stepNo,
      jobPlanning: {
        nrcJobNo,
        ...(jobPlanId !== undefined ? { jobPlanId } : {})
      }
    })
  ) as any;

  if (!jobStep) {
    throw new AppError('Job step not found', 404);
  }

  return jobStep;
}

// Get available machines for a specific job step
export const getAvailableMachines = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers,
      {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true }
        },
        jobStepMachines: {
          include: {
            machine: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    );

    // Extract machine details from the step's machineDetails JSON
    const machineDetails = jobStep.machineDetails as any[];
    const availableMachines = [];

    for (const machineInfo of machineDetails) {
      // Get the machine ID from the correct field (id, not machineId)
      const machineId = machineInfo.machineId || machineInfo.id;
      
      // Check if this machine is already tracked in JobStepMachine
      let jobStepMachine = (jobStep as any).jobStepMachines?.find(
        (jsm: any) => jsm.machineId === machineId
      );

      // If not tracked, create a new entry
      if (!jobStepMachine) {
        jobStepMachine = await (prisma as any).jobStepMachine.create({
          data: {
            jobStepId: jobStep.id,
            machineId: machineId,
            nrcJobNo: nrcJobNo,
            stepNo: parseInt(stepNo),
            status: 'available'
          },
          include: {
            machine: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        });
      }

      availableMachines.push({
        id: jobStepMachine.id,
        machineId: jobStepMachine.machineId,
        machineCode: machineInfo.machineCode || jobStepMachine.machine.machineCode,
        machineType: machineInfo.machineType || jobStepMachine.machine.machineType,
        unit: machineInfo.unit || jobStepMachine.machine.unit,
        status: jobStepMachine.status,
        startedAt: jobStepMachine.startedAt,
        completedAt: jobStepMachine.completedAt,
        userId: jobStepMachine.userId,
        userName: jobStepMachine.user?.name,
        userEmail: jobStepMachine.user?.email,
        isAvailable: jobStepMachine.status === 'available'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        stepId: jobStep.id,
        stepName: jobStep.stepName,
        stepNo: jobStep.stepNo,
        jobPlanId: jobStep.jobPlanningId,
        machines: availableMachines
      }
    });

  } catch (error) {
    console.error('Error getting available machines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available machines',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


// Start work on a specific machine
export const startWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    if (!machineId || machineId === 'null' || machineId === 'undefined') {
      throw new AppError('No machine assigned for this step. Please contact the planner to assign a machine.', 400);
    }

    // Check if this is an urgent job
    // Check job.jobDemand first (existing functionality - UNCHANGED)
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    // Fallback: If no Job record OR jobDemand is not 'high', check jobPlanning.jobDemand
    // This ensures we check JobPlanning.jobDemand as the source of truth
    if (!job || !isUrgentJob) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }
    
    console.log(`🔍 [StartWork] Job ${nrcJobNo}, Step ${stepNo}, Machine ${machineId}, isUrgentJob: ${isUrgentJob}, jobDemand: ${job?.jobDemand || 'N/A'}`);

    // 🎯 NEW: For both urgent and regular jobs, skip machine access verification
    // Regular jobs now work like urgent jobs - shown on all machines, no access check
    // When a worker starts the job on a machine, it will be removed from other machines

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers,
      {
        jobPlanning: {
          include: {
            steps: {
              orderBy: { stepNo: 'asc' }
            }
          }
        }
      }
    );

    // CRITICAL: Validate that previous steps are started before allowing this step to start
    const currentStepNo = parseInt(stepNo);
    if (currentStepNo > 1) {
      const allSteps = (jobStep as any).jobPlanning.steps;
      const previousSteps = allSteps.filter((s: any) => s.stepNo < currentStepNo);
      
      for (const prevStep of previousSteps) {
        // Previous step must be started (status = 'start' or 'stop') - allows parallel work
        if (prevStep.status !== 'start' && prevStep.status !== 'stop') {
          throw new AppError(
            `Cannot start ${jobStep.stepName} (step ${currentStepNo}). Previous step "${prevStep.stepName}" (step ${prevStep.stepNo}) must be started first. Current status: ${prevStep.status}`,
            400
          );
        }
      }
    }

    // CRITICAL: Create JobStepMachine entries for ALL machines in this step (if not already created)
    // This ensures the allFinished check works correctly for multi-machine steps
    const machineDetails = jobStep.machineDetails as any[];
    if (machineDetails && machineDetails.length > 0) {
      for (const machineInfo of machineDetails) {
        if (machineInfo.machineId) {
          const existing = await (prisma as any).jobStepMachine.findFirst({
            where: {
              jobStepId: jobStep.id,
              machineId: machineInfo.machineId
            }
          });
          
          if (!existing) {
            await (prisma as any).jobStepMachine.create({
              data: {
                jobStepId: jobStep.id,
                nrcJobNo: nrcJobNo,
                machineId: machineInfo.machineId,
                stepNo: parseInt(stepNo),
                status: 'available'
              }
            });
          }
        }
      }
    }
    
    // Find or create JobStepMachine entry for THIS machine
    let jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: machineId
      }
    });

    if (!jobStepMachine) {
      jobStepMachine = await (prisma as any).jobStepMachine.create({
        data: {
          jobStepId: jobStep.id,
          nrcJobNo: nrcJobNo,
          machineId: machineId,
          stepNo: parseInt(stepNo),
          status: 'available'
        }
      });
    }

    // Check if machine is available or can be restarted
    if (jobStepMachine.status !== 'available' && jobStepMachine.status !== 'stop') {
      throw new AppError('Machine is not available', 400);
    }

    // Update machine status to in_progress and assign to user
    // For urgent jobs (excluding PaperStore), set startedByMachineId to make step exclusive to this machine
    const updateData: any = {
      status: 'in_progress',
      userId: userId,
      startedAt: new Date(),
      formData: formData || null
    };
    
    // For urgent jobs (excluding PaperStore), set startedByMachineId to make step exclusive
    let jobStepUpdateData: any = {};
    const stepNoInt = parseInt(stepNo);
    // 🎯 NEW: For both urgent and regular jobs, set startedByMachineId and update machineDetails
    // This ensures the job is removed from other machines when started on one machine
    if (stepNoInt !== 1) { // Step 1 is PaperStore
      console.log(`🔍 [StartWork] Urgent job detected! Setting startedByMachineId=${machineId} for step ${stepNoInt} (${jobStep.stepName})`);
      console.log(`🔍 [StartWork] JobStepMachine ID: ${jobStepMachine.id}, Current machineId: ${jobStepMachine.machineId}, Requested machineId: ${machineId}`);
      updateData.startedByMachineId = machineId;
      
      // Get the machine details to update JobStep.machineDetails
      const machine = await prisma.machine.findUnique({
        where: { id: machineId },
        select: {
          id: true,
          machineCode: true,
          machineType: true,
          unit: true,
          description: true,
          status: true,
          capacity: true
        }
      });
      
      if (machine) {
        // Update JobStep.machineDetails to only include this machine
        const updatedMachineDetails = [{
          id: machine.id,
          machineId: machine.id,
          machineCode: machine.machineCode,
          machineType: machine.machineType,
          unit: machine.unit,
          machine: machine
        }];
        
        jobStepUpdateData.machineDetails = updatedMachineDetails as any;
        console.log(`🔍 [Urgent Job] Will update JobStep ${jobStep.id} machineDetails to only include machine ${machine.machineCode} (${machineId})`);
      } else {
        console.log(`🔍 [Urgent Job] ERROR: Machine ${machineId} not found!`);
      }
    } else {
      console.log(`🔍 [StartWork] NOT setting startedByMachineId - isUrgentJob: ${isUrgentJob}, stepNo: ${stepNoInt}`);
    }
    
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: updateData,
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Update the main job step status to started if not already, and machineDetails for urgent jobs
    if (jobStep.status === 'planned' || Object.keys(jobStepUpdateData).length > 0) {
      const finalJobStepUpdate: any = {};
      if (jobStep.status === 'planned') {
        finalJobStepUpdate.status = 'start';
        finalJobStepUpdate.user = userId;
        finalJobStepUpdate.startDate = new Date();
      }
      if (Object.keys(jobStepUpdateData).length > 0) {
        Object.assign(finalJobStepUpdate, jobStepUpdateData);
      }
      
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: finalJobStepUpdate
      });
    }
    
    // 🎯 NEW: If Printing (step 2) is started, mark Corrugation (step 3) as waiting for Production Head
    // NOTE: stepNoInt is already declared above in this function; reuse it to avoid redeclaration.
    // This is for the website dashboard (not the app)
    if (stepNoInt === 2 && jobStep.stepName === 'PrintingDetails') {
      try {
        const corrugationStep = await prisma.jobStep.findFirst({
          where: {
            jobPlanningId: jobStep.jobPlanningId,
            stepNo: 3,
            stepName: 'Corrugation'
          }
        }) as any; // productionHeadContinued exists in schema
        
          if (corrugationStep && corrugationStep.productionHeadContinued === false) {
          await prisma.jobStep.update({
            where: { id: corrugationStep.id },
            data: { productionHeadContinued: false } as any // Ensure it's marked as waiting
          });
          console.log(`🎯 Marked Corrugation step (${corrugationStep.id}) as waiting for Production Head continuation (Printing started)`);
        }
      } catch (error) {
        console.error(`❌ Error marking Corrugation for Production Head:`, error);
        // Don't throw - this is not critical
      }
    }

    // Don't update individual step status here - it will be updated when work is completed
    // Individual step tables (PrintingDetails, etc.) are only populated with data when the work is done

    res.status(200).json({
      success: true,
      message: 'Work started on machine successfully',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        startedAt: updatedJobStepMachine.startedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name
      }
    });

  } catch (error) {
    console.error('Error starting work on machine:', error);
    
    // If it's an AppError with a status code, use that status code
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to start work on machine',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};


// Complete work on a specific machine - ONLY updates formData, triggers completion check
export const completeWorkOnMachine = async (req: Request, res: Response) => {
  
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    if (!formData || Object.keys(formData).length === 0) {
      throw new AppError('Form data is required', 400);
    }

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // For regular jobs, verify user has access to this machine
    if (!isUrgentJob) {
      const userMachine = await prisma.userMachine.findFirst({
        where: {
          userId: userId,
          machineId: machineId,
          isActive: true
        }
      });

      if (!userMachine) {
        throw new AppError('You do not have access to this machine', 403);
      }
    }

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers,
      {
        jobPlanning: {
          include: {
            steps: {
              orderBy: { stepNo: 'asc' }
            }
          }
        }
      }
    );

    // Find JobStepMachine entry
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: machineId
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found', 404);
    }

    // ONLY UPDATE FORMDATA - NO STATUS CHANGE

    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        formData: formData,
        updatedAt: new Date()
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });


    // Get all machines for this step
    const allMachines = await (prisma as any).jobStepMachine.findMany({
      where: { jobStepId: jobStep.id }
    });
    
    // Check if step completion criteria is met
    const stepNoInt = parseInt(stepNo);
    const completionCheck = await _checkStepCompletionCriteria(
      jobStep.id,
      stepNoInt,
      jobStep.jobPlanningId,
      nrcJobNo,
      allMachines
    );

    console.log(`\n🎯 Completion check result:`, completionCheck);

    // If step should be completed, validate previous steps before proceeding
    if (completionCheck.shouldComplete) {
      console.log(`\n🎯 [VALIDATION] Checking if previous steps are completed before allowing step completion`);
      
      // Get all steps for validation
      const allStepsForValidation = jobStep.jobPlanning.steps as any[];
      const previousStepsForValidation = allStepsForValidation.filter((s: any) => s.stepNo < stepNoInt);
      
      // For COMPLETION: All previous steps must have status = 'stop'
      const notCompletedPreviousSteps = previousStepsForValidation.filter(s => s.status !== 'stop');
      
      if (notCompletedPreviousSteps.length > 0) {
        const notCompletedNames = notCompletedPreviousSteps.map(s => `${s.stepName} (step ${s.stepNo}, status: ${s.status})`).join(', ');
        console.log(`❌ [VALIDATION] Cannot complete step ${stepNoInt} - previous steps not completed: ${notCompletedNames}`);
        throw new AppError(
          `Cannot complete step ${stepNoInt}. Previous steps must be completed first: ${notCompletedNames}`,
          400
        );
      }
      
      console.log(`✅ [VALIDATION] All previous steps completed. Allowing step ${stepNoInt} to complete.`);
      
      console.log(`\n🎉 STEP COMPLETION TRIGGERED!`);
      console.log(`Reason: ${completionCheck.reason}`);
      
      // Create combined formData - merge ALL machines' formData
      // This ensures we get all fields even if different machines filled different fields
      const submittedMachines = allMachines.filter((m: any) => m.formData && Object.keys(m.formData).length > 0);
      
      const combinedFormData: any = {
        quantity: completionCheck.totalOK, // ✅ Calculated total
        wastage: completionCheck.totalWastage, // ✅ Calculated total
        status: 'accept'
      };
      
      // Merge all non-quantity fields from all machines
      // Later machines' values will override earlier ones if there are conflicts
      submittedMachines.forEach((m: any) => {
        if (m.formData) {
          Object.keys(m.formData).forEach(key => {
            // Skip quantity/wastage fields (we use calculated totals)
            const lowerKey = key.toLowerCase();
            if (!lowerKey.includes('quantity') && 
                !lowerKey.includes('wastage') && 
                !lowerKey.includes('qty') &&
                key !== 'Status' && 
                key !== 'Start Time' && 
                key !== 'End Time') {
              combinedFormData[key] = m.formData[key];
            }
          });
        }
      });
      
      console.log(`📊 Combined formData from ${submittedMachines.length} machines:`, {
        quantity: combinedFormData.quantity,
        wastage: combinedFormData.wastage,
        totalFields: Object.keys(combinedFormData).length,
        status: combinedFormData.status
      });
      
      // Update individual step table with status 'accept'
      await _updateIndividualStepWithFormData(stepNoInt, nrcJobNo, combinedFormData, jobStep.id, allMachines, jobStep.user || undefined);
      
      // Collect all unique users who completed work on machines for this step
      // A machine is considered "completed" if it has formData (work was completed)
      const completedUsers = new Set<string>();
      allMachines.forEach((machine: any) => {
        if (machine.userId && machine.formData && Object.keys(machine.formData).length > 0) {
          completedUsers.add(machine.userId);
        }
      });
      
      // If no completed machines, use the current user who triggered completion
      const finalCompletedBy = completedUsers.size > 0 
        ? Array.from(completedUsers).join(', ') 
        : userId;
      
      console.log(`👥 Users who completed machines: ${Array.from(completedUsers).join(', ')}`);
      console.log(`📝 Final completedBy: ${finalCompletedBy}`);
      
      // Update JobStep status to 'stop' and set endDate and completedBy
      const updateData: any = {
        status: 'stop',
        endDate: new Date(),
        completedBy: finalCompletedBy
      };
      
      const updatedJobStep = await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: updateData
      });
      
      console.log(`✅ Step ${stepNoInt} completed successfully!`);
      console.log(`   - JobStep status: 'stop'`);
      console.log(`   - Individual step status: 'accept'`);
      console.log(`   - Total OK: ${completionCheck.totalOK}`);
      console.log(`   - Total Wastage: ${completionCheck.totalWastage}`);
      
      // 🎯 NEW: If Printing (step 2) is completed, mark Corrugation (step 3) as waiting for Production Head
      // This is for the website dashboard (not the app)
      if (stepNoInt === 2 && jobStep.stepName === 'PrintingDetails') {
        try {
          const corrugationStep = await prisma.jobStep.findFirst({
            where: {
              jobPlanningId: jobStep.jobPlanningId,
              stepNo: 3,
              stepName: 'Corrugation'
            }
          }) as any; // productionHeadContinued exists in schema
          
          if (corrugationStep) {
            await prisma.jobStep.update({
              where: { id: corrugationStep.id },
              data: { productionHeadContinued: false } as any // Mark as waiting for Production Head
            });
            console.log(`🎯 Marked Corrugation step (${corrugationStep.id}) as waiting for Production Head continuation`);
          }
        } catch (error) {
          console.error(`❌ Error marking Corrugation for Production Head:`, error);
          // Don't throw - this is not critical
        }
      }
      
      // Log activity for step completion - log for each user who completed a machine
      if (userId && typeof userId === 'string') {
        try {
          await logUserActionWithResource(
            userId,
            ActionTypes.PRODUCTION_STEP_COMPLETED,
            JSON.stringify({
              message: `Step ${stepNoInt} (${jobStep.stepName}) completed`,
              nrcJobNo: nrcJobNo,
              jobPlanId: jobStep.jobPlanning?.jobPlanId,
              stepNo: stepNoInt,
              stepName: jobStep.stepName,
              totalOK: completionCheck.totalOK,
              totalWastage: completionCheck.totalWastage,
              completedBy: finalCompletedBy,
              endDate: updatedJobStep.endDate
            }),
            'JobStep',
            jobStep.id.toString(),
            nrcJobNo
          );
          console.log(`✅ Logged activity for step ${stepNoInt} completion for user ${userId}`);
        } catch (error) {
          console.error(`❌ Failed to log activity for step completion:`, error);
          // Don't throw - activity logging is not critical
        }
      }
    } else {
      console.log(`⏳ Step not yet complete: ${completionCheck.reason}`);
    }

    res.status(200).json({
      success: true,
      message: 'Work data submitted successfully',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        updatedAt: updatedJobStepMachine.updatedAt,
        stepCompleted: completionCheck.shouldComplete,
        completionReason: completionCheck.reason
      }
    });

  } catch (error) {
    console.error('❌ Error completing work on machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit work data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get machine work status for a job step
export const getMachineWorkStatus = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo } = req.params;
    const identifiers = parsePlanningIdentifiers(req);

    // Get the job step with all machine work
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers,
      {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true }
        },
        jobStepMachines: {
          include: {
            machine: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    );

    const machineWork = (jobStep as any).jobStepMachines?.map((jsm: any) => ({
      id: jsm.id,
      machineId: jsm.machineId,
      machineCode: jsm.machine.machineCode,
      machineType: jsm.machine.machineType,
      unit: jsm.machine.unit,
      status: jsm.status,
      startedAt: jsm.startedAt,
      completedAt: jsm.completedAt,
      userId: jsm.userId,
      userName: jsm.user?.name,
      userEmail: jsm.user?.email,
      formData: jsm.formData
    }));

    res.status(200).json({
      success: true,
      data: {
        stepId: jobStep.id,
        stepName: jobStep.stepName,
        stepNo: jobStep.stepNo,
        jobPlanId: jobStep.jobPlanningId,
        stepStatus: jobStep.status,
        machineWork: machineWork,
        totalMachines: machineWork?.length || 0,
        completedMachines: machineWork?.filter((m: any) => m.status === 'completed').length || 0,
        stoppedMachines: machineWork?.filter((m: any) => m.status === 'stop').length || 0,
        finishedMachines: machineWork?.filter((m: any) => m.status === 'completed' || m.status === 'stop').length || 0,
        busyMachines: machineWork?.filter((m: any) => m.status === 'in_progress').length || 0,
        availableMachines: machineWork?.filter((m: any) => m.status === 'available').length || 0
      }
    });

  } catch (error) {
    console.error('Error getting machine work status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get machine work status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Auto-assign user's machine for urgent jobs
export const autoAssignMachineForUrgentJob = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    if (job?.jobDemand !== 'high') {
      throw new AppError('This endpoint is only for urgent jobs', 400);
    }

    // Get user's first available machine
    const userMachine = await prisma.userMachine.findFirst({
      where: {
        userId: userId,
        isActive: true
      },
      include: {
        machine: true
      }
    });

    if (!userMachine) {
      throw new AppError('No machines assigned to user', 400);
    }

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers
    );

    // Find or create JobStepMachine entry
    let jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: userMachine.machineId
      }
    });

    if (!jobStepMachine) {
      jobStepMachine = await (prisma as any).jobStepMachine.create({
        data: {
          jobStepId: jobStep.id,
          machineId: userMachine.machineId,
          nrcJobNo: nrcJobNo,
          stepNo: parseInt(stepNo),
          status: 'available'
        }
      });
    }

    // Check if machine is available or can be restarted
    if (jobStepMachine.status !== 'available' && jobStepMachine.status !== 'stop') {
      throw new AppError('Machine is not available', 400);
    }

    // Update machine status to in_progress and assign to user
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        status: 'in_progress',
        userId: userId,
        startedAt: new Date(),
        formData: formData || null
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Work started on machine for urgent job',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        startedAt: updatedJobStepMachine.startedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name
      }
    });

  } catch (error) {
    console.error('Error auto-assigning machine for urgent job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to auto-assign machine for urgent job',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

async function _getJobPlanDetails(jobPlanId: number) {
  const jobPlan = await prisma.jobPlanning.findFirst({
    where: { jobPlanId },
    select: {
      jobPlanId: true,
      nrcJobNo: true
    }
  });

  if (!jobPlan) {
    throw new AppError('Job plan not found', 404);
  }

  return jobPlan;
}

async function _getJobStepIdsForJobPlan(jobPlanId: number) {
  const jobSteps = await prisma.jobStep.findMany({
    where: { jobPlanningId: jobPlanId },
    select: { id: true }
  });

  if (!jobSteps.length) {
    throw new AppError('No job steps found for this job plan', 404);
  }

  return jobSteps.map((step) => step.id);
}

// Simple major hold for entire job (no machine/step required)
export const majorHoldJob = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo } = req.params;
    const userId = req.user?.userId;
    const { majorHoldRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const totalMachinesAffected = await _performMajorHold({
      nrcJobNo,
      majorHoldRemark,
      jobStepIds: undefined
    });

    res.status(200).json({
      success: true,
      message: 'Entire job major held - all machines and steps affected',
      data: {
        jobNrcJobNo: nrcJobNo,
        majorHoldRemark: majorHoldRemark || 'Job major held',
        totalMachinesAffected
      }
    });

  } catch (error) {
    console.error('Error major holding job:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

// Simple major hold for a specific job plan (no machine/step required)
export const majorHoldJobPlan = async (req: Request, res: Response) => {
  try {
    const { jobPlanId } = req.params;
    const userId = req.user?.userId;
    const { majorHoldRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const parsedJobPlanId = parseInt(jobPlanId);
    if (isNaN(parsedJobPlanId)) {
      throw new AppError('Invalid jobPlanId provided', 400);
    }

    const jobPlan = await _getJobPlanDetails(parsedJobPlanId);
    const jobStepIds = await _getJobStepIdsForJobPlan(parsedJobPlanId);

    console.log(`🔴 [MAJOR HOLD] Holding job plan ${jobPlanId} (${jobPlan.nrcJobNo}) - updating linked machines and steps`);

    const totalMachinesAffected = await _performMajorHold({
      jobPlanId: parsedJobPlanId,
      jobStepIds,
      nrcJobNo: jobPlan.nrcJobNo,
      majorHoldRemark
    });

    res.status(200).json({
      success: true,
      message: 'Job plan major held - linked machines and steps affected',
      data: {
        jobPlanId: parsedJobPlanId,
        jobNrcJobNo: jobPlan.nrcJobNo,
        totalStepsAffected: jobStepIds.length,
        totalMachinesAffected,
        majorHoldRemark: majorHoldRemark || 'Job plan major held'
      }
    });

  } catch (error) {
    console.error('Error major holding job plan:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

type MajorHoldOptions = {
  nrcJobNo: string;
  jobPlanId?: number;
  jobStepIds?: number[];
  majorHoldRemark?: string;
};

async function _performMajorHold(options: MajorHoldOptions): Promise<number> {
  const { nrcJobNo, jobPlanId, jobStepIds, majorHoldRemark } = options;

  const activeStatuses = ['in_progress', 'busy', 'start', 'hold'];

  console.log(`🔴 [MAJOR HOLD] Holding scope ${jobPlanId ? `jobPlanId=${jobPlanId}` : `job=${nrcJobNo}`} - updating machines and steps`);
  
  // 1. First, fetch relevant JobStepMachine entries to store their previous status
  let jobStepMachinesToUpdate;
  try {
    jobStepMachinesToUpdate = await (prisma as any).jobStepMachine.findMany({
      where: jobPlanId
        ? {
            jobStep: { jobPlanningId: jobPlanId },
            status: { in: activeStatuses }
          }
        : {
            nrcJobNo: nrcJobNo,
            status: { in: activeStatuses }
          }
    });

    console.log(`🔍 [MAJOR HOLD] Found ${jobStepMachinesToUpdate.length} JobStepMachine entries to update`);
  } catch (fetchError) {
    console.error(`❌ [MAJOR HOLD ERROR] Failed to fetch JobStepMachine entries:`, fetchError);
    throw new AppError(`Failed to fetch machine statuses: ${(fetchError as Error).message}`, 500);
  }

  // 2. Update JobStepMachine entries to major_hold, storing previous status in remarks
  try {
    const updatePromises = jobStepMachinesToUpdate.map((machine: any) => {
      const previousStatus = machine.status;
      const remarksWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark || 'Job major held'}`;
      return (prisma as any).jobStepMachine.update({
        where: { id: machine.id },
        data: {
          status: 'major_hold',
          remarks: remarksWithPrevStatus,
          updatedAt: new Date()
        }
      });
    });

    await Promise.all(updatePromises);
    console.log(`✅ [MAJOR HOLD] Updated ${jobStepMachinesToUpdate.length} JobStepMachine entries to major_hold with previous status stored`);
  } catch (updateError) {
    console.error(`❌ [MAJOR HOLD ERROR] Failed to update JobStepMachine entries:`, updateError);
    throw new AppError(`Failed to update machine statuses: ${(updateError as Error).message}`, 500);
  }

  // 3. Update step tables
  try {
    await _updateAllJobStepsToMajorHold(nrcJobNo, majorHoldRemark || 'Job major held', jobStepIds);
    console.log(`✅ [MAJOR HOLD] Updated step tables to major_hold status`);
  } catch (stepError) {
    console.error(`❌ [MAJOR HOLD ERROR] Failed to update step tables:`, stepError);
  }

  return jobStepMachinesToUpdate.length;
}

// Simple resume major hold for entire job (no machine/step required)
export const resumeMajorHoldJob = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { resumeRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if user has admin or planner role
    if (!userRole || (userRole !== 'admin' && userRole !== 'planner')) {
      throw new AppError('Only admin or planner can resume major holds', 403);
    }

    const totalMachinesAffected = await _performMajorHoldResume({
      nrcJobNo,
      resumeRemark,
      jobStepIds: undefined
    });

    res.status(200).json({
      success: true,
      message: 'Entire job resumed by admin/planner - all machines and steps affected',
      data: {
        resumedBy: userId,
        resumedByRole: userRole,
        resumeRemark: resumeRemark || 'Job resumed by admin/planner',
        totalMachinesAffected,
        jobNrcJobNo: nrcJobNo
      }
    });

  } catch (error) {
    console.error('Error resuming major hold job:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

// Simple resume major hold for a specific job plan (no machine/step required)
export const resumeMajorHoldJobPlan = async (req: Request, res: Response) => {
  try {
    const { jobPlanId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { resumeRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    if (!userRole || (userRole !== 'admin' && userRole !== 'planner')) {
      throw new AppError('Only admin or planner can resume major holds', 403);
    }

    const parsedJobPlanId = parseInt(jobPlanId);
    if (isNaN(parsedJobPlanId)) {
      throw new AppError('Invalid jobPlanId provided', 400);
    }

    const jobPlan = await _getJobPlanDetails(parsedJobPlanId);
    const jobStepIds = await _getJobStepIdsForJobPlan(parsedJobPlanId);

    const totalMachinesAffected = await _performMajorHoldResume({
      nrcJobNo: jobPlan.nrcJobNo,
      jobPlanId: parsedJobPlanId,
      jobStepIds,
      resumeRemark
    });

    res.status(200).json({
      success: true,
      message: 'Job plan resumed by admin/planner - linked machines and steps affected',
      data: {
        jobPlanId: parsedJobPlanId,
        resumedBy: userId,
        resumedByRole: userRole,
        resumeRemark: resumeRemark || 'Job plan resumed by admin/planner',
        totalMachinesAffected
      }
    });

  } catch (error) {
    console.error('Error resuming major hold job plan:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

type ResumeOptions = {
  nrcJobNo: string;
  jobPlanId?: number;
  jobStepIds?: number[];
  resumeRemark?: string;
};

async function _performMajorHoldResume(options: ResumeOptions): Promise<number> {
  const { nrcJobNo, jobPlanId, jobStepIds, resumeRemark } = options;

  console.log(`🟢 [ADMIN RESUME] Resuming scope ${jobPlanId ? `jobPlanId=${jobPlanId}` : `job=${nrcJobNo}`} - updating machines and steps`);
  
  // 1. Fetch JobStepMachine entries to restore their previous status
  let jobStepMachinesToResume;
  try {
    jobStepMachinesToResume = await (prisma as any).jobStepMachine.findMany({
      where: jobPlanId
        ? {
            jobStep: { jobPlanningId: jobPlanId },
            status: 'major_hold'
          }
        : {
            nrcJobNo: nrcJobNo,
            status: 'major_hold'
          }
    });
    console.log(`🔍 [ADMIN RESUME] Found ${jobStepMachinesToResume.length} JobStepMachine entries to resume`);
  } catch (fetchError) {
    console.error(`❌ [ADMIN RESUME ERROR] Failed to fetch JobStepMachine entries:`, fetchError);
    throw new AppError(`Failed to fetch machine statuses: ${(fetchError as Error).message}`, 500);
  }

  // 2. Update each machine individually, restoring previous status from remarks
  try {
    const updatePromises = jobStepMachinesToResume.map((machine: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      let remarks = resumeRemark || 'Job resumed by admin/planner';
      
      if (machine.remarks && machine.remarks.includes('PREV_STATUS:')) {
        const match = machine.remarks.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
          console.log(`🔍 [ADMIN RESUME] Restoring machine ${machine.id} to previous status: ${previousStatus}`);
        }
      }
      
      return (prisma as any).jobStepMachine.update({
        where: { id: machine.id },
        data: {
          status: previousStatus,
          remarks: remarks,
          updatedAt: new Date()
        }
      });
    });
    
    await Promise.all(updatePromises);
    console.log(`✅ [ADMIN RESUME] Updated ${jobStepMachinesToResume.length} JobStepMachine entries to their previous status`);
  } catch (updateError) {
    console.error(`❌ [ADMIN RESUME ERROR] Failed to update JobStepMachine entries:`, updateError);
    throw new AppError(`Failed to update machine statuses: ${(updateError as Error).message}`, 500);
  }

  // 3. Update ALL step tables back to previous status
  try {
    await _resumeAllJobStepsFromMajorHold(nrcJobNo, jobStepIds);
    console.log(`✅ [ADMIN RESUME] Updated step tables to their previous status`);
  } catch (stepError) {
    console.error(`❌ [ADMIN RESUME ERROR] Failed to update step tables:`, stepError);
  }

  return jobStepMachinesToResume.length;
}

// Major hold work on a specific machine (only resumable by admin/planner)
export const majorHoldWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const userId = req.user?.userId;
    const { formData, majorHoldRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // Find the specific JobStepMachine entry
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        nrcJobNo: nrcJobNo,
        stepNo: parseInt(stepNo),
        machineId: machineId,
        status: {
          in: ['in_progress', 'busy'] // Handle both statuses for backward compatibility
        }
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found', 404);
    }

    // Check if machine is currently working
    if (jobStepMachine.status !== 'in_progress' && jobStepMachine.status !== 'busy') {
      throw new AppError('Machine is not currently working', 400);
    }

    // MAJOR HOLD: Update ALL machines and steps for the entire job
    console.log(`🔴 [MAJOR HOLD] Holding entire job ${nrcJobNo} - updating all machines and steps`);
    
    // 1. First, fetch all JobStepMachine entries to store their previous status
    let jobStepMachinesToUpdate;
    try {
      jobStepMachinesToUpdate = await (prisma as any).jobStepMachine.findMany({
        where: {
          nrcJobNo: nrcJobNo,
          status: {
            in: ['in_progress', 'busy', 'start'] // Hold all active machines
          }
        }
      });
      console.log(`🔍 [MAJOR HOLD] Found ${jobStepMachinesToUpdate.length} JobStepMachine entries to update`);
    } catch (fetchError) {
      console.error(`❌ [MAJOR HOLD ERROR] Failed to fetch JobStepMachine entries:`, fetchError);
      throw new AppError(`Failed to fetch machine statuses: ${(fetchError as Error).message}`, 500);
    }

    // 2. Update ALL JobStepMachine entries to major_hold, storing previous status in remarks
    let updatedJobStepMachines;
    try {
      // Update each machine individually to preserve previous status
      const updatePromises = jobStepMachinesToUpdate.map((machine: any) => {
        const previousStatus = machine.status;
        const remarksWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark || 'Job major held'}`;
        return (prisma as any).jobStepMachine.update({
          where: { id: machine.id },
        data: {
          status: 'major_hold',
            remarks: remarksWithPrevStatus,
          updatedAt: new Date()
        }
      });
      });
      
      await Promise.all(updatePromises);
      updatedJobStepMachines = { count: jobStepMachinesToUpdate.length };
      console.log(`✅ [MAJOR HOLD] Updated ${updatedJobStepMachines.count} JobStepMachine entries to major_hold with previous status stored`);
    } catch (updateError) {
      console.error(`❌ [MAJOR HOLD ERROR] Failed to update JobStepMachine entries:`, updateError);
      throw new AppError(`Failed to update machine statuses: ${(updateError as Error).message}`, 500);
    }

    // 2. Update ALL step tables for this job to major_hold status
    try {
      await _updateAllJobStepsToMajorHold(nrcJobNo, majorHoldRemark);
      console.log(`✅ [MAJOR HOLD] Updated all step tables to major_hold status`);
    } catch (stepError) {
      console.error(`❌ [MAJOR HOLD ERROR] Failed to update step tables:`, stepError);
      // Don't throw error to avoid breaking the main flow, but log it
    }

    // 3. Get the updated JobStepMachine for response
    let updatedJobStepMachine;
    try {
      updatedJobStepMachine = await (prisma as any).jobStepMachine.findFirst({
        where: { id: jobStepMachine.id },
        include: {
          machine: true,
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });
    } catch (findError) {
      console.error(`❌ [MAJOR HOLD ERROR] Failed to find updated JobStepMachine:`, findError);
      // Use original jobStepMachine for response
      updatedJobStepMachine = jobStepMachine;
    }

    res.status(200).json({
      success: true,
      message: 'Entire job major held - all machines and steps affected',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        status: updatedJobStepMachine.status,
        majorHoldRemark: updatedJobStepMachine.remarks,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name,
        totalMachinesAffected: updatedJobStepMachines.count,
        jobNrcJobNo: nrcJobNo
      }
    });

  } catch (error) {
    console.error('Error major holding work on machine:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

// Hold work on a specific machine (temporary hold)
export const holdWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData, holdRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    // Check job.jobDemand first (existing functionality - UNCHANGED)
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    // Fallback: If no Job record OR jobDemand is not 'high', check jobPlanning.jobDemand
    // This ensures we check JobPlanning.jobDemand as the source of truth
    if (!job || !isUrgentJob) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }
    
    console.log(`🔍 [StartWork] Job ${nrcJobNo}, Step ${stepNo}, Machine ${machineId}, isUrgentJob: ${isUrgentJob}, jobDemand: ${job?.jobDemand || 'N/A'}`);

    // 🎯 NEW: For both urgent and regular jobs, skip machine access verification
    // Regular jobs now work like urgent jobs - shown on all machines, no access check
    // When a worker starts the job on a machine, it will be removed from other machines

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers
    );

    // Find JobStepMachine entry
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: machineId
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found', 404);
    }

    // Check if machine is currently working (handle both 'busy' and 'in_progress' for backward compatibility)
    if (jobStepMachine.status !== 'in_progress' && jobStepMachine.status !== 'busy') {
      throw new AppError('Machine is not currently working', 400);
    }

    // Update machine status to hold with holdRemark
    let updatedJobStepMachine;
    try {
      updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
        where: { id: jobStepMachine.id },
        data: {
          status: 'hold',
          formData: formData || jobStepMachine.formData,
          remarks: holdRemark || jobStepMachine.remarks, // Save hold remark
          updatedAt: new Date()
        },
        include: {
          machine: true,
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });
    } catch (updateError) {
      console.error(`❌ [HOLD ERROR] Failed to update JobStepMachine ${jobStepMachine.id}:`, updateError);
      throw new AppError(`Failed to update machine status: ${(updateError as Error).message}`, 500);
    }

    // Update individual step holdRemark as well
    if (holdRemark) {
      await _updateIndividualStepHoldRemark(parseInt(stepNo), nrcJobNo, holdRemark, jobStep.id);
    }

    res.status(200).json({
      success: true,
      message: 'Work held on machine',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        holdRemark: updatedJobStepMachine.remarks,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name
      }
    });

  } catch (error) {
    console.error('Error holding work on machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to hold work on machine',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Admin/Planner resume major hold work on a specific machine
export const adminResumeMajorHold = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { formData, resumeRemark } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if user has admin or planner role
    if (!userRole || (userRole !== 'admin' && userRole !== 'planner')) {
      throw new AppError('Only admin or planner can resume major holds', 403);
    }

    // Find the specific JobStepMachine entry with major_hold status
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        nrcJobNo: nrcJobNo,
        stepNo: parseInt(stepNo),
        machineId: machineId,
        status: 'major_hold'
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Major held machine work not found', 404);
    }

    // ADMIN RESUME: Resume ALL machines and steps for the entire job
    console.log(`🟢 [ADMIN RESUME] Resuming entire job ${nrcJobNo} - updating all machines and steps`);
    
    // 1. First, fetch all JobStepMachine entries to restore their previous status
    let jobStepMachinesToResume;
    try {
      jobStepMachinesToResume = await (prisma as any).jobStepMachine.findMany({
        where: {
          nrcJobNo: nrcJobNo,
          status: 'major_hold'
        }
      });
      console.log(`🔍 [ADMIN RESUME] Found ${jobStepMachinesToResume.length} JobStepMachine entries to resume`);
    } catch (fetchError) {
      console.error(`❌ [ADMIN RESUME ERROR] Failed to fetch JobStepMachine entries:`, fetchError);
      throw new AppError(`Failed to fetch machine statuses: ${(fetchError as Error).message}`, 500);
    }

    // 2. Update each machine individually, restoring previous status from remarks
    let updatedJobStepMachines;
    try {
      const updatePromises = jobStepMachinesToResume.map((machine: any) => {
        let previousStatus = 'in_progress'; // Default fallback
        let remarks = resumeRemark || 'Job resumed by admin/planner';
        
        // Extract previous status from remarks if stored
        if (machine.remarks && machine.remarks.includes('PREV_STATUS:')) {
          const match = machine.remarks.match(/PREV_STATUS:([^|]+)/);
          if (match && match[1]) {
            previousStatus = match[1].trim();
            console.log(`🔍 [ADMIN RESUME] Restoring machine ${machine.id} to previous status: ${previousStatus}`);
          }
        }
        
        return (prisma as any).jobStepMachine.update({
          where: { id: machine.id },
        data: {
            status: previousStatus,
            remarks: remarks,
          updatedAt: new Date()
        }
      });
      });
      
      await Promise.all(updatePromises);
      updatedJobStepMachines = { count: jobStepMachinesToResume.length };
      console.log(`✅ [ADMIN RESUME] Updated ${updatedJobStepMachines.count} JobStepMachine entries to their previous status`);
    } catch (updateError) {
      console.error(`❌ [ADMIN RESUME ERROR] Failed to update JobStepMachine entries:`, updateError);
      throw new AppError(`Failed to update machine statuses: ${(updateError as Error).message}`, 500);
    }

    // 2. Update ALL step tables for this job back to their previous status
    try {
      await _resumeAllJobStepsFromMajorHold(nrcJobNo);
      console.log(`✅ [ADMIN RESUME] Updated all step tables to their previous status`);
    } catch (stepError) {
      console.error(`❌ [ADMIN RESUME ERROR] Failed to update step tables:`, stepError);
      // Don't throw error to avoid breaking the main flow, but log it
    }

    // 3. Get the updated JobStepMachine for response
    let updatedJobStepMachine;
    try {
      updatedJobStepMachine = await (prisma as any).jobStepMachine.findFirst({
        where: { id: jobStepMachine.id },
        include: {
          machine: true,
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });
    } catch (findError) {
      console.error(`❌ [ADMIN RESUME ERROR] Failed to find updated JobStepMachine:`, findError);
      // Use original jobStepMachine for response
      updatedJobStepMachine = jobStepMachine;
    }

    res.status(200).json({
      success: true,
      message: 'Entire job resumed by admin/planner - all machines and steps affected',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        status: updatedJobStepMachine.status,
        resumedBy: userId,
        resumedByRole: userRole,
        resumeRemark: updatedJobStepMachine.remarks,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name,
        totalMachinesAffected: updatedJobStepMachines.count,
        jobNrcJobNo: nrcJobNo
      }
    });

  } catch (error) {
    console.error('Error resuming major hold work on machine:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

// Resume work on a specific machine (temporary hold)
export const resumeWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    // Check job.jobDemand first (existing functionality - UNCHANGED)
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    // Fallback: If no Job record OR jobDemand is not 'high', check jobPlanning.jobDemand
    // This ensures we check JobPlanning.jobDemand as the source of truth
    if (!job || !isUrgentJob) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }
    
    console.log(`🔍 [StartWork] Job ${nrcJobNo}, Step ${stepNo}, Machine ${machineId}, isUrgentJob: ${isUrgentJob}, jobDemand: ${job?.jobDemand || 'N/A'}`);

    // 🎯 NEW: For both urgent and regular jobs, skip machine access verification
    // Regular jobs now work like urgent jobs - shown on all machines, no access check
    // When a worker starts the job on a machine, it will be removed from other machines

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers
    );

    // Find JobStepMachine entry
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: machineId
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found', 404);
    }

    // Check if machine is currently on hold
    if (jobStepMachine.status !== 'hold') {
      throw new AppError('Machine is not currently on hold', 400);
    }

    // Update machine status to in_progress
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        status: 'in_progress',
        formData: formData || jobStepMachine.formData,
        updatedAt: new Date()
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Update individual step status to 'in_progress' (unchanged from start)
    await _updateIndividualStepStatus(parseInt(stepNo), jobStep.id, nrcJobNo, 'in_progress');

    res.status(200).json({
      success: true,
      message: 'Work resumed on machine',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name
      }
    });

  } catch (error) {
    console.error('Error resuming work on machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume work on machine',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get all held machines organized by jobs with enhanced job planning details
export const getAllHeldMachines = async (req: Request, res: Response) => {
  try {
    // Role-based access control - only admin and planner can access
    const userRole = req.user?.role?.toLowerCase();
    
    if (!userRole || (userRole !== 'admin' && userRole !== 'planner')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only admin and planner roles can view held machines.',
        error: 'Insufficient permissions'
      });
    }

    // Get optional query parameters
    const { poNumber, includeJobPlanningDetails = 'true' } = req.query;
    const shouldIncludeJobPlanningDetails = includeJobPlanningDetails === 'true';

    // Build where clause for filtering
    const whereClause: any = {
      status: 'hold'
    };

    // If PO number is specified, filter by it
    if (poNumber) {
      whereClause.job = {
        purchaseOrders: {
          some: {
            poNumber: poNumber as string
          }
        }
      };
    }

    // Get all JobStepMachine entries with status 'hold' and enhanced includes
    const heldMachines = await (prisma as any).jobStepMachine.findMany({
      where: whereClause,
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true, role: true }
        },
        jobStep: {
          include: {
            jobPlanning: {
              include: {
                purchaseOrder: {
                  include: {
                    job: {
                      select: {
                        nrcJobNo: true,
                        customerName: true,
                        styleItemSKU: true,
                        jobDemand: true,
                        status: true
                      }
                    }
                  }
                },
                steps: {
                  include: {
                    // Include all step-specific data
                    paperStore: true,
                    printingDetails: true,
                    corrugation: true,
                    flutelam: true,
                    punching: true,
                    qualityDept: true,
                    sideFlapPasting: true,
                    dispatchProcess: true,
                    jobStepMachines: {
                      include: {
                        machine: true,
                        user: {
                          select: { id: true, name: true, email: true, role: true }
                        }
                      }
                    }
                  },
                  orderBy: { stepNo: 'asc' }
                }
              }
            }
          }
        },
        job: {
          include: {
            purchaseOrders: {
              include: {
                jobPlannings: {
                  include: {
                    steps: {
                      include: {
                        paperStore: true,
                        printingDetails: true,
                        corrugation: true,
                        flutelam: true,
                        punching: true,
                        qualityDept: true,
                        sideFlapPasting: true,
                        dispatchProcess: true
                      },
                      orderBy: { stepNo: 'asc' }
                    }
                  }
                }
              }
            },
            artworks: true,
            user: {
              select: { id: true, name: true, email: true, role: true }
            }
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Group held machines by job
    const jobsMap = new Map();

    for (const hm of heldMachines) {
      const nrcJobNo = hm.nrcJobNo;
      
      if (!jobsMap.has(nrcJobNo)) {
        // Get all steps for this job with their held machines
        const jobPlanning = hm.jobStep?.jobPlanning;
        const allSteps = jobPlanning?.steps || [];
        
        // Get all held machines for this job
        const jobHeldMachines = heldMachines.filter((m: any) => m.nrcJobNo === nrcJobNo);
        
        // Enrich each step with held machine info and step-specific details
        const enrichedSteps = await Promise.all(
          allSteps.map(async (step: any) => {
            // Find held machines for this step
            const stepHeldMachines = jobHeldMachines.filter((m: any) => m.stepNo === step.stepNo);
            
            // Get step-specific details based on stepNo
            let stepSpecificData: any = null;
            
            switch (step.stepNo) {
              case 1: // PaperStore
                stepSpecificData = await prisma.paperStore.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 2: // Printing
                stepSpecificData = await prisma.printingDetails.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 3: // Corrugation
                stepSpecificData = await prisma.corrugation.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 4: // Flute Lamination
                stepSpecificData = await prisma.fluteLaminateBoardConversion.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 5: // Punching
                stepSpecificData = await prisma.punching.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 6: // Flap Pasting
                stepSpecificData = await prisma.sideFlapPasting.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 7: // Quality Control
                stepSpecificData = await prisma.qualityDept.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 8: // Dispatch
                stepSpecificData = await prisma.dispatchProcess.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
            }

            return {
              stepNo: step.stepNo,
              stepName: step.stepName,
              stepStatus: step.status,
              stepStartDate: step.startDate,
              stepEndDate: step.endDate,
              stepUser: step.user,
              stepCompletedBy: step.completedBy,
              machineDetails: step.machineDetails,
              hasHeldMachines: stepHeldMachines.length > 0,
              heldMachinesCount: stepHeldMachines.length,
              heldMachines: stepHeldMachines.map((m: any) => ({
                // Machine details
                machineId: m.machineId,
                machineCode: m.machine.machineCode,
                machineType: m.machine.machineType,
                unit: m.machine.unit,
                description: m.machine.description,
                capacity: m.machine.capacity,
                
                // JobStepMachine status and hold info
                jobStepMachineStatus: m.status, // The actual status from JobStepMachine table (hold/in_progress/stop/etc)
                holdRemark: m.remarks,
                heldAt: m.updatedAt,
                startedAt: m.startedAt,
                completedAt: m.completedAt,
                
                // User who held it
                heldBy: {
                  id: m.user?.id,
                  name: m.user?.name,
                  email: m.user?.email,
                  role: m.user?.role
                },
                
                // Form data (work in progress)
                formData: m.formData
              })),
              stepSpecificData: stepSpecificData,
              stepHoldRemark: stepSpecificData?.holdRemark
            };
          })
        );

        // Enhanced job planning details
        const enhancedJobPlanningDetails = shouldIncludeJobPlanningDetails ? {
          jobPlanningId: jobPlanning?.jobPlanId,
          jobDemand: jobPlanning?.jobDemand,
          createdAt: jobPlanning?.createdAt,
          updatedAt: jobPlanning?.updatedAt,
          purchaseOrderDetails: jobPlanning?.purchaseOrder ? {
            id: jobPlanning.purchaseOrder.id,
            poNumber: jobPlanning.purchaseOrder.poNumber,
            customer: jobPlanning.purchaseOrder.customer,
            totalPOQuantity: jobPlanning.purchaseOrder.totalPOQuantity,
            pendingQuantity: jobPlanning.purchaseOrder.pendingQuantity,
            deliveryDate: jobPlanning.purchaseOrder.deliveryDate,
            nrcDeliveryDate: jobPlanning.purchaseOrder.nrcDeliveryDate,
            poDate: jobPlanning.purchaseOrder.poDate,
            status: jobPlanning.purchaseOrder.status,
            createdAt: jobPlanning.purchaseOrder.createdAt,
            updatedAt: jobPlanning.purchaseOrder.updatedAt
          } : null,
          allStepsDetails: jobPlanning?.steps?.map((step: any) => ({
            stepId: step.id,
            stepNo: step.stepNo,
            stepName: step.stepName,
            status: step.status,
            startDate: step.startDate,
            endDate: step.endDate,
            user: step.user,
            completedBy: step.completedBy,
            createdAt: step.createdAt,
            updatedAt: step.updatedAt,
            machineDetails: step.machineDetails,
            // Step-specific data
            stepSpecificData: {
              paperStore: step.paperStore,
              printingDetails: step.printingDetails,
              corrugation: step.corrugation,
              flutelam: step.flutelam,
              punching: step.punching,
              qualityDept: step.qualityDept,
              sideFlapPasting: step.sideFlapPasting,
              dispatchProcess: step.dispatchProcess
            },
            // Machine assignments for this step
            machineAssignments: step.jobStepMachines?.map((jsm: any) => ({
              jobStepMachineId: jsm.id,
              machineId: jsm.machineId,
              machineCode: jsm.machine?.machineCode,
              machineType: jsm.machine?.machineType,
              unit: jsm.machine?.unit,
              description: jsm.machine?.description,
              capacity: jsm.machine?.capacity,
              status: jsm.status,
              startedAt: jsm.startedAt,
              completedAt: jsm.completedAt,
              userId: jsm.userId,
              userName: jsm.user?.name,
              userEmail: jsm.user?.email,
              userRole: jsm.user?.role,
              // Form data
              quantity: jsm.quantity,
              remarks: jsm.remarks,
              formData: jsm.formData,
              // Step-specific form fields
              requiredQty: jsm.requiredQty,
              availableQty: jsm.availableQty,
              sheetSize: jsm.sheetSize,
              gsm: jsm.gsm,
              colorsUsed: jsm.colorsUsed,
              processColors: jsm.processColors,
              specialColors: jsm.specialColors,
              inksUsed: jsm.inksUsed,
              coatingType: jsm.coatingType,
              quantityOK: jsm.quantityOK,
              fluteType: jsm.fluteType,
              gsm1: jsm.gsm1,
              gsm2: jsm.gsm2,
              size: jsm.size,
              sheetsCount: jsm.sheetsCount,
              okQuantity: jsm.okQuantity,
              dieUsed: jsm.dieUsed,
              rejectedQty: jsm.rejectedQty
            })) || []
          })) || []
        } : null;

        jobsMap.set(nrcJobNo, {
          jobDetails: {
            nrcJobNo: hm.job?.nrcJobNo,
            customerName: hm.job?.customerName,
            styleItemSKU: hm.job?.styleItemSKU,
            fluteType: hm.job?.fluteType,
            status: hm.job?.status,
            jobDemand: hm.job?.jobDemand,
            boxDimensions: hm.job?.boxDimensions,
            noOfColor: hm.job?.noOfColor,
            imageURL: hm.job?.imageURL,
            createdAt: hm.job?.createdAt,
            updatedAt: hm.job?.updatedAt,
            // Additional job details
            length: hm.job?.length,
            width: hm.job?.width,
            height: hm.job?.height,
            diePunchCode: hm.job?.diePunchCode,
            boardCategory: hm.job?.boardCategory,
            processColors: hm.job?.processColors,
            specialColor1: hm.job?.specialColor1,
            specialColor2: hm.job?.specialColor2,
            specialColor3: hm.job?.specialColor3,
            specialColor4: hm.job?.specialColor4,
            overPrintFinishing: hm.job?.overPrintFinishing,
            topFaceGSM: hm.job?.topFaceGSM,
            flutingGSM: hm.job?.flutingGSM,
            bottomLinerGSM: hm.job?.bottomLinerGSM,
            decalBoardX: hm.job?.decalBoardX,
            lengthBoardY: hm.job?.lengthBoardY,
            boardSize: hm.job?.boardSize,
            noUps: hm.job?.noUps,
            artworkReceivedDate: hm.job?.artworkReceivedDate,
            artworkApprovedDate: hm.job?.artworkApprovedDate,
            shadeCardApprovalDate: hm.job?.shadeCardApprovalDate,
            sharedCardDiffDate: hm.job?.sharedCardDiffDate,
            srNo: hm.job?.srNo,
            noOfSheets: hm.job?.noOfSheets,
            isMachineDetailsFilled: hm.job?.isMachineDetailsFilled,
            // User who created the job
            createdBy: hm.job?.user ? {
              id: hm.job.user.id,
              name: hm.job.user.name,
              email: hm.job.user.email,
              role: hm.job.user.role
            } : null
          },
          purchaseOrders: hm.job?.purchaseOrders?.map((po: any) => ({
            id: po.id,
            poNumber: po.poNumber,
            customer: po.customer,
            totalPOQuantity: po.totalPOQuantity,
            pendingQuantity: po.pendingQuantity,
            deliveryDate: po.deliveryDate,
            nrcDeliveryDate: po.nrcDeliveryDate,
            poDate: po.poDate,
            status: po.status,
            createdAt: po.createdAt,
            updatedAt: po.updatedAt,
            // Enhanced PO details with job plannings
            jobPlannings: po.jobPlannings?.map((jp: any) => ({
              jobPlanId: jp.jobPlanId,
              jobDemand: jp.jobDemand,
              createdAt: jp.createdAt,
              updatedAt: jp.updatedAt,
              stepsCount: jp.steps?.length || 0,
              steps: jp.steps?.map((step: any) => ({
                stepId: step.id,
                stepNo: step.stepNo,
                stepName: step.stepName,
                status: step.status,
                startDate: step.startDate,
                endDate: step.endDate,
                user: step.user,
                completedBy: step.completedBy
              })) || []
            })) || []
          })) || [],
          steps: enrichedSteps,
          totalHeldMachines: jobHeldMachines.length,
          // Enhanced job planning details
          jobPlanningDetails: enhancedJobPlanningDetails,
          // Artwork details
          artworks: hm.job?.artworks?.map((artwork: any) => ({
            id: artwork.id,
            artworkType: artwork.artworkType,
            filePath: artwork.filePath,
            uploadedAt: artwork.uploadedAt,
            status: artwork.status
          })) || []
        });
      }
    }

    const heldJobs = Array.from(jobsMap.values());

    res.status(200).json({
      success: true,
      message: `Found ${heldJobs.length} jobs with held machines${poNumber ? ` for PO: ${poNumber}` : ''}`,
      data: {
        totalHeldJobs: heldJobs.length,
        totalHeldMachines: heldMachines.length,
        queryParameters: {
          poNumber: poNumber || null,
          includeJobPlanningDetails: shouldIncludeJobPlanningDetails
        },
        heldJobs: heldJobs
      }
    });

  } catch (error) {
    console.error('Error getting held machines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get held machines',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Stop work on a specific machine
// Stop work on a specific machine - Sets status to 'stop' and triggers completion check
export const stopWorkOnMachine = async (req: Request, res: Response) => {
  console.log('\n\n🛑 ============ STOP WORK ON MACHINE CALLED ============');
  console.log('Job:', req.params.nrcJobNo);
  console.log('Step:', req.params.stepNo);
  console.log('Machine:', req.params.machineId);
  console.log('FormData:', JSON.stringify(req.body.formData, null, 2));
  console.log('===========================================================\n');
  
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
    const identifiers = parsePlanningIdentifiers(req);
    const userId = req.user?.userId;
    const { formData } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    let isUrgentJob = job?.jobDemand === 'high';
    
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // For regular jobs, verify user has access to this machine
    if (!isUrgentJob) {
      const userMachine = await prisma.userMachine.findFirst({
        where: {
          userId: userId,
          machineId: machineId,
          isActive: true
        }
      });

      if (!userMachine) {
        throw new AppError('You do not have access to this machine', 403);
      }
    }

    // Get the job step
    const jobStep = await findJobStepForOperation(
      nrcJobNo,
      parseInt(stepNo),
      identifiers
    );

    // Find JobStepMachine entry
    const jobStepMachine = await (prisma as any).jobStepMachine.findFirst({
      where: {
        jobStepId: jobStep.id,
        machineId: machineId
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found', 404);
    }

    // Allow stopping machines that are in_progress, hold, busy, OR available (never started)
    // This allows users to mark unused machines as 'stop' to trigger step completion
    if (jobStepMachine.status === 'stop') {
      throw new AppError('Machine is already stopped', 400);
    }

    console.log(`🛑 Stopping machine ${machineId} (current status: ${jobStepMachine.status}) - changing status to 'stop' ONLY (no data save)`);

    // Update machine status to 'stop' - DO NOT save formData
    // FormData is saved only via Complete Work button
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
        where: { id: jobStepMachine.id },
        data: {
          status: 'stop',
          completedAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          machine: true,
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

    console.log(`✅ Machine status updated to 'stop' (formData NOT saved)`);

    // Stop button does NOT trigger completion check
    // Completion check only happens when Complete Work button saves formData
    console.log(`ℹ️  Step completion will be checked when Complete Work is clicked`);

    // Update JobStep status to 'start' if this is the first machine to stop
    // (JobStep should only go to 'stop' when step actually completes)
    if (jobStep.status !== 'stop') {
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: { 
          status: 'start'  // Keep as 'start' until step completes
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Machine stopped successfully',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        jobPlanId: jobStep.jobPlanningId,
        status: updatedJobStepMachine.status,
        completedAt: updatedJobStepMachine.completedAt,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name
      }
    });

  } catch (error) {
    console.error('❌ Error stopping work on machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop work on machine',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Helper function to update individual step status (PaperStore, Printing, etc.)
async function _updateIndividualStepStatus(stepNo: number, jobStepId: number, nrcJobNo: string, status: string) {
  try {
    const stepName = _getStepName(stepNo);
    if (!stepName) return;

    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        {
          const result = await prisma.paperStore.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.paperStore.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 2: // Printing
        {
          const result = await prisma.printingDetails.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            const fallback = await prisma.printingDetails.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
            console.log(`Updated ${fallback.count} PrintingDetails records for job ${nrcJobNo} (fallback by nrcJobNo)`);
          } else {
            console.log(`Updated ${result.count} PrintingDetails records for jobStepId ${jobStepId}`);
          }
        }
        break;
      case 3: // Corrugation
        {
          const result = await prisma.corrugation.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.corrugation.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 4: // Flute Lamination
        {
          const result = await prisma.fluteLaminateBoardConversion.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.fluteLaminateBoardConversion.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 5: // Punching
        {
          const result = await prisma.punching.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.punching.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 6: // Flap Pasting
        {
          const result = await prisma.sideFlapPasting.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.sideFlapPasting.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 7: // Quality Control
        {
          const result = await prisma.qualityDept.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.qualityDept.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
      case 8: // Dispatch
        {
          const result = await prisma.dispatchProcess.updateMany({
            where: { jobStepId },
            data: { status: status as any }
          });
          if (result.count === 0) {
            await prisma.dispatchProcess.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { status: status as any }
            });
          }
        }
        break;
    }
  } catch (error) {
    console.error(`Error updating individual step status for step ${stepNo}:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Helper function to get step name from step number
function _getStepName(stepNo: number): string | null {
  const stepNames: { [key: number]: string } = {
    1: 'PaperStore',
    2: 'Printing',
    3: 'Corrugation',
    4: 'FluteLamination',
    5: 'Punching',
    6: 'DieCutting',
    7: 'FlapPasting',
    8: 'QualityControl',
    9: 'Dispatch'
  };
  return stepNames[stepNo] || null;
}

// Helper function to update ALL job steps to major_hold status
async function _updateAllJobStepsToMajorHold(nrcJobNo: string, majorHoldRemark: string, jobStepIds?: number[]) {
  try {
    console.log(`🔍 [MAJOR HOLD] Updating ALL steps to major_hold for job ${nrcJobNo}`);
    
    // First, fetch all step records to store their previous status
    const fetchPromises = [
      (prisma.paperStore.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.printingDetails.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.corrugation.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.fluteLaminateBoardConversion.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.punching.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.sideFlapPasting.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.qualityDept.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } }),
      (prisma.dispatchProcess.findMany as any)({ where: { jobNrcJobNo: nrcJobNo } })
    ];
    
    const [paperStoreRecords, printingRecords, corrugationRecords, fluteRecords, punchingRecords, flapRecords, qualityRecords, dispatchRecords] = await Promise.all(fetchPromises);
    
    const filterRecords = (records: any[]) => {
      if (!jobStepIds || jobStepIds.length === 0) {
        return records;
      }
      return records.filter((record: any) => record.jobStepId && jobStepIds.includes(record.jobStepId));
    };
    
    // Update each record individually, storing previous status in majorHoldRemark
    const updatePromises: Promise<any>[] = [];
    
      // PaperStore
    filterRecords(paperStoreRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.paperStore.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // PrintingDetails
    filterRecords(printingRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.printingDetails.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // Corrugation
    filterRecords(corrugationRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.corrugation.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // FluteLaminateBoardConversion
    filterRecords(fluteRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.fluteLaminateBoardConversion.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // Punching
    filterRecords(punchingRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.punching.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // SideFlapPasting
    filterRecords(flapRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.sideFlapPasting.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // QualityDept
    filterRecords(qualityRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.qualityDept.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
        })
      );
    });
    
      // DispatchProcess
    filterRecords(dispatchRecords).forEach((record: any) => {
      const previousStatus = record.status;
      const remarkWithPrevStatus = `PREV_STATUS:${previousStatus}|${majorHoldRemark}`;
      updatePromises.push(
        (prisma.dispatchProcess.update as any)({
          where: { id: record.id },
        data: { 
          status: 'major_hold',
            majorHoldRemark: remarkWithPrevStatus
        }
      })
      );
    });

    // Execute all updates in parallel
    const results = await Promise.all(updatePromises);
    
    // Log the results
    console.log(`✅ [MAJOR HOLD] Updated ${results.length} step records across all step tables with previous status stored`);
    
    return results;
  } catch (error) {
    console.error(`❌ [MAJOR HOLD ERROR] Failed to update all job steps:`, error);
    throw error;
  }
}

// Helper function to update individual step majorHoldRemark
async function _updateIndividualStepMajorHoldRemark(stepNo: number, nrcJobNo: string, majorHoldRemark: string) {
  try {
    console.log(`🔍 [MAJOR HOLD] Updating step ${stepNo} majorHoldRemark for job ${nrcJobNo}`);
    
    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        await (prisma.paperStore.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
      case 2: // Printing
        await (prisma.printingDetails.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
      case 3: // Corrugation
        await (prisma.corrugation.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
      case 4: // Flute Lamination
        await (prisma.fluteLaminateBoardConversion.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
      case 5: // Punching
        await (prisma.punching.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
      case 6: // Flap Pasting
        await (prisma.sideFlapPasting.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: majorHoldRemark }
        });
        break;
    }
    console.log(`✅ Updated step ${stepNo} majorHoldRemark successfully`);
  } catch (error) {
    console.error(`Error updating step ${stepNo} majorHoldRemark:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Helper function to resume ALL job steps from major_hold status
async function _resumeAllJobStepsFromMajorHold(nrcJobNo: string, jobStepIds?: number[]) {
  try {
    console.log(`🔍 [ADMIN RESUME] Resuming ALL steps from major_hold for job ${nrcJobNo}`);
    
    // First, fetch all step records with major_hold status to restore their previous status
    const fetchPromises = [
      (prisma.paperStore.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.printingDetails.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.corrugation.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.fluteLaminateBoardConversion.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.punching.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.sideFlapPasting.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.qualityDept.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } }),
      (prisma.dispatchProcess.findMany as any)({ where: { jobNrcJobNo: nrcJobNo, status: 'major_hold' } })
    ];
    
    const [paperStoreRecords, printingRecords, corrugationRecords, fluteRecords, punchingRecords, flapRecords, qualityRecords, dispatchRecords] = await Promise.all(fetchPromises);
    
    const filterRecords = (records: any[]) => {
      if (!jobStepIds || jobStepIds.length === 0) {
        return records;
      }
      return records.filter((record: any) => record.jobStepId && jobStepIds.includes(record.jobStepId));
    };
    
    // Update each record individually, restoring previous status from majorHoldRemark
    const updatePromises: Promise<any>[] = [];
    
      // PaperStore
    filterRecords(paperStoreRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.paperStore.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null // Clear the major hold remark
        }
        })
      );
    });
    
      // PrintingDetails
    filterRecords(printingRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.printingDetails.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // Corrugation
    filterRecords(corrugationRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.corrugation.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // FluteLaminateBoardConversion
    filterRecords(fluteRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.fluteLaminateBoardConversion.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // Punching
    filterRecords(punchingRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.punching.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // SideFlapPasting
    filterRecords(flapRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.sideFlapPasting.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // QualityDept
    filterRecords(qualityRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.qualityDept.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
        })
      );
    });
    
      // DispatchProcess
    filterRecords(dispatchRecords).forEach((record: any) => {
      let previousStatus = 'in_progress'; // Default fallback
      if (record.majorHoldRemark && record.majorHoldRemark.includes('PREV_STATUS:')) {
        const match = record.majorHoldRemark.match(/PREV_STATUS:([^|]+)/);
        if (match && match[1]) {
          previousStatus = match[1].trim();
        }
      }
      updatePromises.push(
        (prisma.dispatchProcess.update as any)({
          where: { id: record.id },
        data: { 
            status: previousStatus,
          majorHoldRemark: null
        }
      })
      );
    });

    // Execute all updates in parallel
    const results = await Promise.all(updatePromises);
    
    // Log the results
    console.log(`✅ [ADMIN RESUME] Resumed ${results.length} step records across all step tables to their previous status`);
    
    return results;
  } catch (error) {
    console.error(`❌ [ADMIN RESUME ERROR] Failed to resume all job steps:`, error);
    throw error;
  }
}

// Helper function to clear individual step majorHoldRemark
async function _clearIndividualStepMajorHoldRemark(stepNo: number, nrcJobNo: string) {
  try {
    console.log(`🔍 [CLEAR MAJOR HOLD] Clearing step ${stepNo} majorHoldRemark for job ${nrcJobNo}`);
    
    // Clear the major hold remark from the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        await (prisma.paperStore.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
      case 2: // Printing
        await (prisma.printingDetails.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
      case 3: // Corrugation
        await (prisma.corrugation.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
      case 4: // Flute Lamination
        await (prisma.fluteLaminateBoardConversion.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
      case 5: // Punching
        await (prisma.punching.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
      case 6: // Flap Pasting
        await (prisma.sideFlapPasting.updateMany as any)({
          where: { jobNrcJobNo: nrcJobNo },
          data: { majorHoldRemark: null }
        });
        break;
    }
    console.log(`✅ Cleared step ${stepNo} majorHoldRemark successfully`);
  } catch (error) {
    console.error(`Error clearing step ${stepNo} majorHoldRemark:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Helper function to update individual step holdRemark
async function _updateIndividualStepHoldRemark(stepNo: number, nrcJobNo: string, holdRemark: string, jobStepId?: number) {
  try {
    console.log(`🔍 [HOLD] Updating step ${stepNo} holdRemark for job ${nrcJobNo}`);
    
    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        {
          const result = await prisma.paperStore.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.paperStore.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
      case 2: // Printing
        {
          const result = await prisma.printingDetails.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.printingDetails.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
      case 3: // Corrugation
        {
          const result = await prisma.corrugation.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.corrugation.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
      case 4: // Flute Lamination
        {
          const result = await prisma.fluteLaminateBoardConversion.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.fluteLaminateBoardConversion.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
      case 5: // Punching
        {
          const result = await prisma.punching.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.punching.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
      case 6: // Flap Pasting
        {
          const result = await prisma.sideFlapPasting.updateMany({
            where: jobStepId ? { jobStepId } : { jobNrcJobNo: nrcJobNo },
            data: { holdRemark: holdRemark }
          });
          if (result.count === 0 && jobStepId) {
            await prisma.sideFlapPasting.updateMany({
              where: { jobNrcJobNo: nrcJobNo },
              data: { holdRemark: holdRemark }
            });
          }
        }
        break;
    }
    console.log(`✅ Updated step ${stepNo} holdRemark successfully`);
  } catch (error) {
    console.error(`Error updating step ${stepNo} holdRemark:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}

// Helper function to update individual step tables with form data
// IMPORTANT: This should ONLY be called when ALL machines for the step are completed!
// Helper function to get previous step's available/OK quantity
async function _getPreviousStepQuantity(stepNo: number, jobPlanId: number, nrcJobNo: string): Promise<number> {
  try {
    console.log(`🔍 [GET_PREV_QTY] Getting previous step quantity for step ${stepNo}, job ${nrcJobNo}, jobPlanId ${jobPlanId}`);

    if (stepNo === 1) {
      return 0;
    }

    const getStepId = async (targetStepNo: number): Promise<number | undefined> => {
      if (targetStepNo <= 0) return undefined;
      const step = await prisma.jobStep.findFirst({
        where: {
          jobPlanningId: jobPlanId,
          stepNo: targetStepNo
        },
        select: { id: true }
      });
      return step?.id;
    };

    const getPaperStoreQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.paperStore.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          return record.available ?? record.quantity ?? 0;
        }
      }
      const fallback = await prisma.paperStore.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        select: { available: true, quantity: true },
        orderBy: { id: 'desc' }
      });
      return fallback?.available ?? fallback?.quantity ?? 0;
    };

    const getPrintingQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.printingDetails.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          const recordAny = record as any;
          return record.quantity ?? recordAny.quantityOK ?? recordAny.okQuantity ?? 0;
        }
      }
      const fallback = await prisma.printingDetails.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        orderBy: { id: 'desc' }
      });
      if (!fallback) return 0;
      const fallbackAny = fallback as any;
      return fallback.quantity ?? fallbackAny.quantityOK ?? fallbackAny.okQuantity ?? 0;
    };

    const getFluteQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.fluteLaminateBoardConversion.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          return record.quantity ?? 0;
        }
      }
      const fallback = await prisma.fluteLaminateBoardConversion.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        select: { quantity: true },
        orderBy: { id: 'desc' }
      });
      return fallback?.quantity ?? 0;
    };

    const getPunchingQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.punching.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          return record.quantity ?? 0;
        }
      }
      const fallback = await prisma.punching.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        select: { quantity: true },
        orderBy: { id: 'desc' }
      });
      return fallback?.quantity ?? 0;
    };

    const getFlapQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.sideFlapPasting.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          return record.quantity ?? 0;
        }
      }
      const fallback = await prisma.sideFlapPasting.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        select: { quantity: true },
        orderBy: { id: 'desc' }
      });
      return fallback?.quantity ?? 0;
    };

    const getQualityQuantity = async (stepId?: number) => {
      if (stepId) {
        const record = await prisma.qualityDept.findUnique({
          where: { jobStepId: stepId }
        });
        if (record) {
          return record.quantity ?? 0;
        }
      }
      const fallback = await prisma.qualityDept.findFirst({
        where: { jobNrcJobNo: nrcJobNo },
        select: { quantity: true },
        orderBy: { id: 'desc' }
      });
      return fallback?.quantity ?? 0;
    };

    switch (stepNo) {
      case 2: {
        const prevStepId = await getStepId(1);
        return await getPaperStoreQuantity(prevStepId);
      }
      case 3: {
        const prevStepId = await getStepId(1); // Corrugation depends on PaperStore output
        return await getPaperStoreQuantity(prevStepId);
      }
      case 4: {
        const prevStepId = await getStepId(2);
        return await getPrintingQuantity(prevStepId);
      }
      case 5: {
        const prevStepId = await getStepId(4);
        return await getFluteQuantity(prevStepId);
      }
      case 6: {
        const prevStepId = await getStepId(5);
        return await getPunchingQuantity(prevStepId);
      }
      case 7: {
        const prevStepId = await getStepId(6);
        return await getFlapQuantity(prevStepId);
      }
      case 8: {
        const prevStepId = await getStepId(7);
        return await getQualityQuantity(prevStepId);
      }
      default:
        return 0;
    }
  } catch (error) {
    console.error(`❌ Error getting previous step quantity:`, error);
    return 0;
  }
}

// Helper function to check if step completion criteria is met
async function _checkStepCompletionCriteria(
  jobStepId: number,
  stepNo: number,
  jobPlanId: number,
  nrcJobNo: string,
  allMachines: any[]
): Promise<{ shouldComplete: boolean; reason: string; totalOK: number; totalWastage: number }> {
  try {
    console.log(`\n🎯 [COMPLETION CHECK] Checking completion criteria for step ${stepNo}, job ${nrcJobNo}, jobPlanId ${jobPlanId}`);
    console.log(`📊 Total machines assigned: ${allMachines.length}`);
    
    // Get machines that have formData (submitted)
    const submittedMachines = allMachines.filter((m: any) => m.formData && Object.keys(m.formData).length > 0);
    console.log(`📝 Machines with formData submitted: ${submittedMachines.length}`);
    
    // Calculate total submitted quantities
    let totalOK = 0;
    let totalWastage = 0;
    
    submittedMachines.forEach((m: any) => {
      let fData = m.formData as any;
      
      // Safety check: if formData is a string, parse it
      if (typeof fData === 'string') {
        try {
          fData = JSON.parse(fData);
        } catch (e) {
          console.error(`❌ Failed to parse formData for machine ${m.machineId}`);
          fData = null;
        }
      }
      
      if (fData) {
        // Handle various field name variations (case-insensitive)
        const okQty = fData.quantity || fData.Quantity || fData.quantityOK || fData.okQuantity || 
                     fData['Quantity OK'] || fData['OK Quantity'] || 
                     fData.sheetsCount || fData['Sheets Count'] || 
                     fData.finalQuantity || 0;
        const wastage = fData.wastage || fData.Wastage || fData.WASTAGE || 0;
        
        console.log(`  🔍 [DEBUG] Machine ${m.machineId} formData:`, JSON.stringify(fData));
        console.log(`  🔍 [DEBUG] Extracted: okQty=${okQty}, wastage=${wastage}`);
        
        totalOK += parseInt(okQty) || 0;
        totalWastage += parseInt(wastage) || 0;
        console.log(`  📦 Machine ${m.machineId}: OK=${okQty}, Wastage=${wastage}, Status=${m.status}`);
      }
    });
    
    const totalSubmitted = totalOK + totalWastage;
    console.log(`📊 Total quantities - OK: ${totalOK}, Wastage: ${totalWastage}, Total: ${totalSubmitted}`);
    
    // Get previous step quantity
    const previousStepQuantity = await _getPreviousStepQuantity(stepNo, jobPlanId, nrcJobNo);
    console.log(`📋 Previous step quantity: ${previousStepQuantity}`);
    console.log(`🔍 [DEBUG] previousStepQuantity assigned at line 1585: ${previousStepQuantity}`);
    
    // Check criteria 1: Total submitted >= Previous step quantity
    if (previousStepQuantity > 0 && totalSubmitted >= previousStepQuantity) {
      console.log(`✅ CRITERIA MET: Total submitted (${totalSubmitted}) >= Previous quantity (${previousStepQuantity})`);
      return {
        shouldComplete: true,
        reason: `Quantity match: ${totalSubmitted} >= ${previousStepQuantity}`,
        totalOK,
        totalWastage
      };
    }
    
    // Check criteria 2: All machines are EXPLICITLY stopped (status = 'stop')
    // This is for partial quantity scenarios when all machines are manually stopped
    // Machines with status 'available' (never started) do NOT count as stopped
    const stoppedMachines = allMachines.filter((m: any) => m.status === 'stop');
    const inProgressMachines = allMachines.filter((m: any) => m.status === 'in_progress' || m.status === 'hold');
    const availableMachines = allMachines.filter((m: any) => m.status === 'available');
    
    console.log(`🛑 Machine status breakdown:`);
    console.log(`   - Stopped: ${stoppedMachines.length}`);
    console.log(`   - In Progress/Hold: ${inProgressMachines.length}`);
    console.log(`   - Available (not used): ${availableMachines.length}`);
    console.log(`   - Total: ${allMachines.length}`);
    
    // Only complete if:
    // 1. All machines are stopped (status='stop'), AND
    // 2. No machines are available (unused) - if machines are unused, quantity should match instead
    if (stoppedMachines.length === allMachines.length && 
        availableMachines.length === 0 && 
        stoppedMachines.length > 0) {
      console.log(`✅ CRITERIA MET: All ${allMachines.length} machines explicitly stopped`);
      return {
        shouldComplete: true,
        reason: `All ${allMachines.length} machines stopped (partial quantity accepted)`,
        totalOK,
        totalWastage
      };
    }
    
    // If there are unused machines (available), do NOT allow completion without quantity match
    if (availableMachines.length > 0) {
      const prevQtyCheck = previousStepQuantity; // Create a const copy to check for variable mutation
      console.log(`🔍 [DEBUG] previousStepQuantity at line 1629: ${previousStepQuantity}`);
      console.log(`🔍 [DEBUG] prevQtyCheck (const copy): ${prevQtyCheck}`);
      console.log(`🔍 [DEBUG] availableMachines.length: ${availableMachines.length}`);
      console.log(`🔍 [DEBUG] About to log error message with previousStepQuantity: ${previousStepQuantity}`);
      console.log(`⚠️ Cannot complete: ${availableMachines.length} machine(s) never used. Quantity must match ${previousStepQuantity}.`);
      console.log(`🔍 [DEBUG] After error message - previousStepQuantity: ${previousStepQuantity}, prevQtyCheck: ${prevQtyCheck}`);
    }
    
    // Criteria not met
    console.log(`⏳ Criteria NOT met - waiting for more submissions or stops`);
    return {
      shouldComplete: false,
      reason: `Waiting: ${totalSubmitted}/${previousStepQuantity} submitted, ${stoppedMachines.length}/${allMachines.length} stopped`,
      totalOK,
      totalWastage
    };
    
  } catch (error) {
    console.error(`❌ Error checking step completion criteria:`, error);
    return {
      shouldComplete: false,
      reason: 'Error checking criteria',
      totalOK: 0,
      totalWastage: 0
    };
  }
}

async function _updateIndividualStepWithFormData(stepNo: number, nrcJobNo: string, formData: any, jobStepId: number, allMachines?: any[], jobStepUser?: string) {
  console.log(`🚨 [CRITICAL DEBUG] _updateIndividualStepWithFormData FUNCTION CALLED!`);
  console.log(`🔍 [DEBUG] Step: ${stepNo}, Job: ${nrcJobNo}, JobStepId: ${jobStepId}`);
  console.log(`🔍 [DEBUG] FormData received:`, JSON.stringify(formData, null, 2));
  console.log(`🔍 [DEBUG] Status to set: ${formData.status || 'accept'}`);
  console.log(`🔍 [DEBUG] Quantity: ${formData.quantity}, Wastage: ${formData.wastage}`);
  
  // 🎯 AUTO-POPULATE: Fetch job details to auto-populate fields not in form
  const job = await prisma.job.findUnique({
    where: { nrcJobNo },
    select: {
      topFaceGSM: true,
      flutingGSM: true,
      bottomLinerGSM: true,
      fluteType: true,
      processColors: true,
      noOfColor: true,
      diePunchCode: true,
      boardSize: true,
      length: true,
      width: true,
      overPrintFinishing: true
    }
  });
  
  console.log(`🎯 [AUTO-POPULATE] Fetched job details for auto-population:`, job);
  
  // ✅ Collect all machine codes that were used (have formData)
  let machineCodesStr = '';
  let operatorName = jobStepUser || formData.oprName || formData.operatorName || null;
  
  if (allMachines && allMachines.length > 0) {
    const usedMachines = allMachines.filter((m: any) => m.formData && Object.keys(m.formData).length > 0);
    
    // Get machine codes
    const machineCodes = await Promise.all(
      usedMachines.map(async (m: any) => {
        const machine = await prisma.machine.findUnique({
          where: { id: m.machineId },
          select: { machineCode: true }
        });
        return machine?.machineCode || m.machineId;
      })
    );
    machineCodesStr = machineCodes.join(', ');
    
    // Get operator name from first machine's userId if not already set
    if (!operatorName && usedMachines.length > 0 && usedMachines[0].userId) {
      operatorName = usedMachines[0].userId;
    }
    
    console.log(`🔧 [DEBUG] Used machines: ${machineCodesStr}`);
    console.log(`🔧 [DEBUG] Operator: ${operatorName}`);
  }
  
  try {
    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        console.log(`🔧 [PaperStore] Upserting with jobStepId: ${jobStepId}`);
        // 🎯 AUTO-POPULATE from job details
        const sheetSize = formData.sheetSize || `${job?.length || 0} x ${job?.width || 0}` || job?.boardSize;
        const gsm = formData.gsm || job?.topFaceGSM;
        
        await prisma.paperStore.upsert({
          where: { jobStepId: jobStepId },
          update: {
            quantity: formData.quantity || formData.requiredQty,
            available: formData.available || formData.availableQty,
            sheetSize: sheetSize, // ✅ Auto-populated from job
            gsm: gsm, // ✅ Auto-populated from job
            status: formData.status || 'accept'
          },
          create: {
            jobNrcJobNo: nrcJobNo,
            jobStepId: jobStepId,
            quantity: formData.quantity || formData.requiredQty,
            available: formData.available || formData.availableQty,
            sheetSize: sheetSize, // ✅ Auto-populated from job
            gsm: gsm, // ✅ Auto-populated from job
            status: formData.status || 'accept'
          }
        });
        console.log(`✅ [PaperStore] Record upserted successfully with auto-populated fields`);
        break;
      case 2: // Printing
        {
          // Handle field name variations (with spaces, capitals, camelCase)
          const quantity = formData.quantity || formData['Quantity OK'] || formData.quantityOK || formData.okQuantity;
          const wastage = formData.wastage || formData.Wastage || formData.WASTAGE;
          
          // 🎯 AUTO-POPULATE from job details (user doesn't need to fill these)
          const colors = formData.colors || formData.colorsUsed || formData['Colors Used'] || job?.noOfColor;
          const inks = formData.inksUsed || formData['Inks Used'] || job?.processColors;
          const coating = formData.coatingType || formData['Coating Type'] || job?.overPrintFinishing;
          const separateSheets = formData.separateSheets || formData['Separate Sheets'];
          const extraSheets = formData.extraSheets || formData['Extra Sheets'];
          
          console.log(`🔍 [Printing] User entered: quantity=${quantity}, wastage=${wastage}`);
          console.log(`🎯 [Printing] Auto-populated: colors=${colors}, inks=${inks}, coating=${coating}`);
          console.log(`🔍 [Printing] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // Use upsert to properly link to JobStep
          console.log(`🔧 [Printing] Upserting with jobStepId: ${jobStepId}`);
          await prisma.printingDetails.upsert({
            where: { jobStepId: jobStepId },
            update: {
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              noOfColours: colors ? parseInt(colors) : undefined,
              inksUsed: inks,
              coatingType: coating,
              separateSheets: separateSheets ? parseInt(separateSheets) : undefined,
              extraSheets: extraSheets ? parseInt(extraSheets) : undefined,
              machine: machineCodesStr || undefined,
              date: now,
              shift: shift,
              oprName: operatorName || undefined,
              status: formData.status || 'accept'
            },
            create: {
              jobNrcJobNo: nrcJobNo,
              jobStepId: jobStepId,
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              noOfColours: colors ? parseInt(colors) : undefined,
              inksUsed: inks,
              coatingType: coating,
              separateSheets: separateSheets ? parseInt(separateSheets) : undefined,
              extraSheets: extraSheets ? parseInt(extraSheets) : undefined,
              machine: machineCodesStr || undefined,
              date: now,
              shift: shift,
              oprName: operatorName || undefined,
              status: formData.status || 'accept'
            }
          });
          console.log(`✅ [Printing] Record upserted successfully`)
        }
        break;
      case 3: // Corrugation
        {
          console.log(`🔍 [DEBUG] Processing Corrugation case for job ${nrcJobNo}`);
          
          // Handle field name variations - user only enters quantity and wastage
          const sheetsCount = formData.quantity || formData.sheetsCount || formData['Sheets Count'];
          const wastage = formData.wastage || formData.Wastage;
          
          // 🎯 AUTO-POPULATE from job details (user doesn't need to fill these)
          const fluteType = formData.fluteType || formData.flute || formData['Flute Type'] || job?.fluteType;
          const gsm1 = formData.gsm1 || formData['GSM1 (Top Face)'] || formData['GSM1'] || job?.topFaceGSM;
          const gsm2 = formData.gsm2 || formData['GSM2 (Bottom Face)'] || formData['GSM2'] || job?.bottomLinerGSM;
          const size = formData.size || formData.Size || job?.boardSize || `${job?.length || 0} x ${job?.width || 0}`;
          
          console.log(`🔍 [Corrugation] User entered: sheetsCount=${sheetsCount}, wastage=${wastage}`);
          console.log(`🎯 [Corrugation] Auto-populated: flute=${fluteType}, gsm1=${gsm1}, gsm2=${gsm2}, size=${size}`);
          console.log(`🔍 [Corrugation] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // Use upsert to properly link to JobStep
          console.log(`🔧 [Corrugation] Upserting with jobStepId: ${jobStepId}`);
          await prisma.corrugation.upsert({
            where: { jobStepId: jobStepId },
            update: {
              quantity: sheetsCount ? parseInt(sheetsCount) : undefined,
              flute: fluteType,
              gsm1: gsm1?.toString(),
              gsm2: gsm2?.toString(),
              size: size,
              machineNo: machineCodesStr || undefined,
              date: now,
              shift: shift,
              oprName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            },
            create: {
              jobNrcJobNo: nrcJobNo,
              jobStepId: jobStepId,
              quantity: sheetsCount ? parseInt(sheetsCount) : undefined,
              flute: fluteType,
              gsm1: gsm1?.toString(),
              gsm2: gsm2?.toString(),
              size: size,
              machineNo: machineCodesStr || undefined,
              date: now,
              shift: shift,
              oprName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            }
          });
          console.log(`✅ [Corrugation] Record upserted successfully`)
        }
        break;
      case 4: // Flute Lamination
        {
          // Handle field name variations - user only enters quantity and wastage
          const okQuantity = formData.quantity || formData.okQuantity || formData['OK Quantity'];
          const wastage = formData.wastage || formData.Wastage;
          
          // 🎯 AUTO-POPULATE from job details (removed from form UI)
          const film = formData.film || formData.filmType || formData['Film Type'] || 'Standard Film';
          const adhesive = formData.adhesive || formData.Adhesive || 'Standard Adhesive';
          
          console.log(`🔍 [FluteLam] User entered: okQuantity=${okQuantity}, wastage=${wastage}`);
          console.log(`🎯 [FluteLam] Auto-populated: film=${film}, adhesive=${adhesive}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // Use upsert to properly link to JobStep
          console.log(`🔧 [FluteLamination] Upserting with jobStepId: ${jobStepId}`);
          await prisma.fluteLaminateBoardConversion.upsert({
            where: { jobStepId: jobStepId },
            update: {
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              film: film,
              adhesive: adhesive,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              status: formData.status || 'accept'
            },
            create: {
              jobNrcJobNo: nrcJobNo,
              jobStepId: jobStepId,
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              film: film,
              adhesive: adhesive,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              status: formData.status || 'accept'
            }
          });
          console.log(`✅ [FluteLamination] Record upserted successfully (qty=${okQuantity}, wastage=${wastage})`)
        }
        break;
      case 5: // Punching
        {
          // Handle field name variations - user only enters quantity and wastage
          const okQuantity = formData.quantity || formData.okQuantity || formData['OK Quantity'];
          const wastage = formData.wastage || formData.Wastage;
          
          // 🎯 AUTO-POPULATE from job details (removed from form UI)
          const die = formData.dieUsed || formData.die || formData['Die Used (diePunchCode)'] || job?.diePunchCode?.toString();
          
          console.log(`🔍 [Punching] User entered: okQuantity=${okQuantity}, wastage=${wastage}`);
          console.log(`🎯 [Punching] Auto-populated: die=${die} (from job.diePunchCode)`);
          console.log(`🔍 [Punching] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // Use upsert to properly link to JobStep
          console.log(`🔧 [Punching] Upserting with jobStepId: ${jobStepId}`);
          await prisma.punching.upsert({
            where: { jobStepId: jobStepId },
            update: {
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              die: die,
              machine: machineCodesStr || undefined,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            },
            create: {
              jobNrcJobNo: nrcJobNo,
              jobStepId: jobStepId,
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              die: die,
              machine: machineCodesStr || undefined,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            }
          });
          console.log(`✅ [Punching] Record upserted successfully`);
        }
        break;
      case 6: // Flap Pasting (stepNo 6 in database)
        {
          // Handle field name variations - user only enters quantity and wastage
          const quantity = formData.quantity || formData.Quantity || formData.finalQuantity;
          const wastage = formData.wastage || formData.Wastage;
          
          // 🎯 AUTO-POPULATE from job details (removed from form UI)
          const adhesive = formData.adhesive || formData.Adhesive || 'Standard Adhesive';
          
          console.log(`🔍 [Pasting] User entered: quantity=${quantity}, wastage=${wastage}`);
          console.log(`🎯 [Pasting] Auto-populated: adhesive=${adhesive}`);
          console.log(`🔍 [Pasting] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // Use upsert to properly link to JobStep
          console.log(`🔧 [SideFlapPasting] Upserting with jobStepId: ${jobStepId}`);
          await prisma.sideFlapPasting.upsert({
            where: { jobStepId: jobStepId },
            update: {
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              adhesive: adhesive,
              machineNo: machineCodesStr || undefined,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            },
            create: {
              jobNrcJobNo: nrcJobNo,
              jobStepId: jobStepId,
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              adhesive: adhesive,
              machineNo: machineCodesStr || undefined,
              date: now,
              shift: shift,
              operatorName: operatorName || undefined,
              remarks: formData.remarks || formData.Remarks,
              status: formData.status || 'accept'
            }
          });
          console.log(`✅ [SideFlapPasting] Record upserted successfully (qty=${quantity}, wastage=${wastage})`)
        }
        break;
      case 7: // Quality Control
        console.log(`🔧 [QualityDept] Upserting with jobStepId: ${jobStepId}`);
        
        // Parse individual rejection reason quantities
        const parseRejectionQty = (value: any): number => {
          if (!value) return 0;
          const parsed = parseInt(value.toString());
          return isNaN(parsed) ? 0 : parsed;
        };
        
        const rejectionReasonAQty = parseRejectionQty(formData.rejectionReasonAQty || formData['Rejection Reason A Qty']);
        const rejectionReasonBQty = parseRejectionQty(formData.rejectionReasonBQty || formData['Rejection Reason B Qty']);
        const rejectionReasonCQty = parseRejectionQty(formData.rejectionReasonCQty || formData['Rejection Reason C Qty']);
        const rejectionReasonDQty = parseRejectionQty(formData.rejectionReasonDQty || formData['Rejection Reason D Qty']);
        const rejectionReasonEQty = parseRejectionQty(formData.rejectionReasonEQty || formData['Rejection Reason E Qty']);
        const rejectionReasonFQty = parseRejectionQty(formData.rejectionReasonFQty || formData['Rejection Reason F Qty']);
        const rejectionReasonOthersQty = parseRejectionQty(formData.rejectionReasonOthersQty || formData['Rejection Reason Others Qty']);
        
        // Calculate total rejectedQty as sum of all reason quantities
        const calculatedRejectedQty = rejectionReasonAQty + rejectionReasonBQty + rejectionReasonCQty + 
                                       rejectionReasonDQty + rejectionReasonEQty + rejectionReasonFQty + rejectionReasonOthersQty;
        
        // Use calculated total, but fallback to manual entry if provided (for backward compatibility)
        const rejectedQty = calculatedRejectedQty > 0 ? calculatedRejectedQty : (formData.rejectedQty || 0);
        
        await prisma.qualityDept.upsert({
          where: { jobStepId: jobStepId },
          update: {
            quantity: formData.quantity,
            rejectedQty: rejectedQty,
            remarks: formData.remarks,
            status: formData.status || 'accept',
            rejectionReasonAQty: rejectionReasonAQty > 0 ? rejectionReasonAQty : null,
            rejectionReasonBQty: rejectionReasonBQty > 0 ? rejectionReasonBQty : null,
            rejectionReasonCQty: rejectionReasonCQty > 0 ? rejectionReasonCQty : null,
            rejectionReasonDQty: rejectionReasonDQty > 0 ? rejectionReasonDQty : null,
            rejectionReasonEQty: rejectionReasonEQty > 0 ? rejectionReasonEQty : null,
            rejectionReasonFQty: rejectionReasonFQty > 0 ? rejectionReasonFQty : null,
            rejectionReasonOthersQty: rejectionReasonOthersQty > 0 ? rejectionReasonOthersQty : null,
          },
          create: {
            jobNrcJobNo: nrcJobNo,
            jobStepId: jobStepId,
            quantity: formData.quantity,
            rejectedQty: rejectedQty,
            remarks: formData.remarks,
            status: formData.status || 'accept',
            rejectionReasonAQty: rejectionReasonAQty > 0 ? rejectionReasonAQty : null,
            rejectionReasonBQty: rejectionReasonBQty > 0 ? rejectionReasonBQty : null,
            rejectionReasonCQty: rejectionReasonCQty > 0 ? rejectionReasonCQty : null,
            rejectionReasonDQty: rejectionReasonDQty > 0 ? rejectionReasonDQty : null,
            rejectionReasonEQty: rejectionReasonEQty > 0 ? rejectionReasonEQty : null,
            rejectionReasonFQty: rejectionReasonFQty > 0 ? rejectionReasonFQty : null,
            rejectionReasonOthersQty: rejectionReasonOthersQty > 0 ? rejectionReasonOthersQty : null,
          }
        });
        console.log(`✅ [QualityDept] Record upserted successfully`);
        break;
      case 8: // Dispatch
        console.log(`🔧 [DispatchProcess] Upserting with jobStepId: ${jobStepId}`);
        await prisma.dispatchProcess.upsert({
          where: { jobStepId: jobStepId },
          update: {
            quantity: formData.quantity || formData.finalQuantity,
            remarks: formData.remarks,
            status: formData.status || 'accept'
          },
          create: {
            jobNrcJobNo: nrcJobNo,
            jobStepId: jobStepId,
            quantity: formData.quantity || formData.finalQuantity,
            remarks: formData.remarks,
            status: formData.status || 'accept'
          }
        });
        console.log(`✅ [DispatchProcess] Record upserted successfully`);
        break;
    }
    console.log(`✅ Updated individual step ${stepNo} with form data`);
  } catch (error) {
    console.error(`Error updating individual step ${stepNo} with form data:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}
