import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
// Using standard Error instead of Error

const prisma = new PrismaClient();

// Get available machines for a specific job step
export const getAvailableMachines = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Get the job step
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      },
      include: {
        jobStepMachines: {
          include: {
            machine: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      } as any
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
    
    // Fallback: If no Job record, check jobPlanning.jobDemand
    // This only adds support for jobPlanning-only records without affecting existing jobs
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // For urgent jobs, skip machine access verification
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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
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
      throw new AppError('Job step not found', 404);
    }

    // CRITICAL: Validate that previous steps are completed before allowing this step to start
    const currentStepNo = parseInt(stepNo);
    if (currentStepNo > 1) {
      const allSteps = (jobStep as any).jobPlanning.steps;
      const previousSteps = allSteps.filter((s: any) => s.stepNo < currentStepNo);
      
      console.log(`🔍 [WORKFLOW] Checking ${previousSteps.length} previous steps for step ${currentStepNo}`);
      
      for (const prevStep of previousSteps) {
        console.log(`🔍 [WORKFLOW] Step ${prevStep.stepNo} (${prevStep.stepName}): status = ${prevStep.status}`);
        
        // Previous step must be completed (status = 'stop')
        if (prevStep.status !== 'stop') {
          throw new AppError(
            `Cannot start ${jobStep.stepName} (step ${currentStepNo}). Previous step "${prevStep.stepName}" (step ${prevStep.stepNo}) must be completed first. Current status: ${prevStep.status}`,
            400
          );
        }
      }
      
      console.log(`✅ [WORKFLOW] All previous steps completed. Allowing ${jobStep.stepName} to start.`);
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
            console.log(`📝 Created JobStepMachine entry for ${machineInfo.machineCode} (status: available)`);
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

    // Update the main job step status to started if not already
    if (jobStep.status === 'planned') {
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: {
          status: 'start',
          user: userId,
          startDate: new Date()
        }
      });
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
  console.log('\n\n✅ ============ COMPLETE WORK ON MACHINE CALLED ============');
  console.log('Job:', req.params.nrcJobNo);
  console.log('Step:', req.params.stepNo);
  console.log('Machine:', req.params.machineId);
  console.log('FormData:', JSON.stringify(req.body.formData, null, 2));
  console.log('============================================================\n');
  
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      }
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
    console.log(`📝 Updating formData for machine ${machineId} - NO status change`);

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

    console.log(`✅ FormData updated successfully, current status: ${updatedJobStepMachine.status}`);

    // Get all machines for this step
    const allMachines = await (prisma as any).jobStepMachine.findMany({
      where: { jobStepId: jobStep.id }
    });
    
    // Check if step completion criteria is met
    const stepNoInt = parseInt(stepNo);
    const completionCheck = await _checkStepCompletionCriteria(
      jobStep.id,
      stepNoInt,
      nrcJobNo,
      allMachines
    );

    console.log(`\n🎯 Completion check result:`, completionCheck);

    // If step should be completed, update everything
    if (completionCheck.shouldComplete) {
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
      await _updateIndividualStepWithFormData(stepNoInt, nrcJobNo, combinedFormData, allMachines, jobStep.user || undefined, jobStep.id);
      
      // Update JobStep status to 'stop' and set endDate
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: {
          status: 'stop',
          endDate: new Date()
        }
      });
      
      console.log(`✅ Step ${stepNoInt} completed successfully!`);
      console.log(`   - JobStep status: 'stop'`);
      console.log(`   - Individual step status: 'accept'`);
      console.log(`   - Total OK: ${completionCheck.totalOK}`);
      console.log(`   - Total Wastage: ${completionCheck.totalWastage}`);
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

    // Get the job step with all machine work
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      },
      include: {
        jobStepMachines: {
          include: {
            machine: true,
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      } as any
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      }
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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

// Hold work on a specific machine
export const holdWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
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
    
    // Fallback: If no Job record, check jobPlanning.jobDemand
    // This only adds support for jobPlanning-only records without affecting existing jobs
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // For urgent jobs, skip machine access verification
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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      }
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
      await _updateIndividualStepHoldRemark(parseInt(stepNo), nrcJobNo, holdRemark);
    }

    res.status(200).json({
      success: true,
      message: 'Work held on machine',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
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

// Resume work on a specific machine
export const resumeWorkOnMachine = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo, machineId } = req.params;
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
    
    // Fallback: If no Job record, check jobPlanning.jobDemand
    // This only adds support for jobPlanning-only records without affecting existing jobs
    if (!job) {
      const jobPlanning = await prisma.jobPlanning.findFirst({
        where: { nrcJobNo: nrcJobNo },
        select: { jobDemand: true }
      });
      isUrgentJob = jobPlanning?.jobDemand === 'high';
    }

    // For urgent jobs, skip machine access verification
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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      }
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
    await _updateIndividualStepStatus(parseInt(stepNo), nrcJobNo, 'in_progress');

    res.status(200).json({
      success: true,
      message: 'Work resumed on machine',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
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

// Get all held machines organized by jobs
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

    // Get all JobStepMachine entries with status 'hold'
    const heldMachines = await (prisma as any).jobStepMachine.findMany({
      where: {
        status: 'hold'
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true, role: true }
        },
        jobStep: {
          include: {
            jobPlanning: {
              include: {
                purchaseOrder: true,
                steps: {
                  orderBy: { stepNo: 'asc' }
                }
              }
            }
          }
        },
        job: {
          include: {
            purchaseOrders: true
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
            createdAt: hm.job?.createdAt
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
            status: po.status
          })) || [],
          steps: enrichedSteps,
          totalHeldMachines: jobHeldMachines.length,
          jobPlanningId: jobPlanning?.jobPlanId
        });
      }
    }

    const heldJobs = Array.from(jobsMap.values());

    res.status(200).json({
      success: true,
      message: `Found ${heldJobs.length} jobs with held machines`,
      data: {
        totalHeldJobs: heldJobs.length,
        totalHeldMachines: heldMachines.length,
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
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: nrcJobNo
        },
        stepNo: parseInt(stepNo)
      }
    });

    if (!jobStep) {
      throw new AppError('Job step not found', 404);
    }

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
async function _updateIndividualStepStatus(stepNo: number, nrcJobNo: string, status: string) {
  try {
    const stepName = _getStepName(stepNo);
    if (!stepName) return;

    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        await prisma.paperStore.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 2: // Printing
        {
          const printingResult = await prisma.printingDetails.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: { status: status as any }
          });
          console.log(`Updated ${printingResult.count} PrintingDetails records for job ${nrcJobNo}`);
        }
        break;
      case 3: // Corrugation
        await prisma.corrugation.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 4: // Flute Lamination
        await prisma.fluteLaminateBoardConversion.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 5: // Punching
        await prisma.punching.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 6: // Flap Pasting
        await prisma.sideFlapPasting.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 7: // Quality Control
        await prisma.qualityDept.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 8: // Dispatch
        await prisma.dispatchProcess.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
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

// Helper function to update individual step holdRemark
async function _updateIndividualStepHoldRemark(stepNo: number, nrcJobNo: string, holdRemark: string) {
  try {
    console.log(`🔍 [HOLD] Updating step ${stepNo} holdRemark for job ${nrcJobNo}`);
    
    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore
        await prisma.paperStore.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 2: // Printing
        await prisma.printingDetails.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 3: // Corrugation
        await prisma.corrugation.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 4: // Flute Lamination
        await prisma.fluteLaminateBoardConversion.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 5: // Punching
        await prisma.punching.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 6: // Flap Pasting
        await prisma.sideFlapPasting.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
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
async function _getPreviousStepQuantity(stepNo: number, nrcJobNo: string): Promise<number> {
  try {
    console.log(`🔍 [GET_PREV_QTY] Getting previous step quantity for step ${stepNo}, job ${nrcJobNo}`);
    
    // Step 1 (PaperStore) has no previous step
    if (stepNo === 1) {
      console.log(`📋 Step 1 has no previous step, returning 0`);
      return 0;
    }
    
    // Special handling for steps with non-sequential dependencies
    let quantity = 0;
    
    switch (stepNo) {
      case 2: // Printing gets from PaperStore
        const paperStoreForPrinting = await prisma.paperStore.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { available: true },
          orderBy: { id: 'desc' }
        });
        quantity = paperStoreForPrinting?.available || 0;
        console.log(`📋 Step 2 (Printing) gets from PaperStore: ${quantity}`);
        break;
        
      case 3: // Corrugation gets from PaperStore (parallel to Printing)
        const paperStoreForCorrugation = await prisma.paperStore.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { available: true },
          orderBy: { id: 'desc' }
        });
        quantity = paperStoreForCorrugation?.available || 0;
        console.log(`📋 Step 3 (Corrugation) gets from PaperStore: ${quantity}`);
        break;
        
      case 4: // Flute Lamination gets from Printing
        const printing = await prisma.printingDetails.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { quantity: true },
          orderBy: { id: 'desc' }
        });
        quantity = printing?.quantity || 0;
        console.log(`📋 Step 4 (FluteLamination) gets from Printing: ${quantity}`);
        break;
        
      case 5: // Punching gets from Flute Lamination (stepNo 4)
        const fluteLam = await prisma.fluteLaminateBoardConversion.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { quantity: true },
          orderBy: { id: 'desc' }
        });
        quantity = fluteLam?.quantity || 0;
        console.log(`📋 Step 5 (Punching) gets from FluteLamination (stepNo 4): ${quantity}`);
        break;
        
      case 6: // Flap Pasting gets from Punching (stepNo 5) - Die Cutting NOT in job planning!
        console.log(`🔍 [DEBUG] Querying Punching for job: ${nrcJobNo}`);
        const punchingForFlap = await prisma.punching.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { id: true, quantity: true, wastage: true, jobNrcJobNo: true },
          orderBy: { id: 'desc' }
        });
        console.log(`🔍 [DEBUG] Query result:`, JSON.stringify(punchingForFlap));
        quantity = punchingForFlap?.quantity || 0;
        console.log(`📋 Step 6 (FlapPasting) gets from Punching (stepNo 5): ${quantity} (from record ID: ${punchingForFlap?.id})`);
        break;
        
      case 7: // Quality gets from Flap Pasting (stepNo 6)
        const flapPasting = await prisma.sideFlapPasting.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { quantity: true },
          orderBy: { id: 'desc' }
        });
        quantity = flapPasting?.quantity || 0;
        console.log(`📋 Step 7 (Quality) gets from FlapPasting (stepNo 6): ${quantity}`);
        break;
        
      case 8: // Dispatch gets from Quality (stepNo 7)
        const quality = await prisma.qualityDept.findFirst({
          where: { jobNrcJobNo: nrcJobNo },
          select: { quantity: true },
          orderBy: { id: 'desc' }
        });
        quantity = quality?.quantity || 0;
        console.log(`📋 Step 8 (Dispatch) gets from Quality (stepNo 7): ${quantity}`);
        break;
        
      default:
        console.log(`⚠️ Unknown step ${stepNo}, returning 0`);
        quantity = 0;
    }
    
    return quantity;
  } catch (error) {
    console.error(`❌ Error getting previous step quantity:`, error);
    return 0;
  }
}

// Helper function to check if step completion criteria is met
async function _checkStepCompletionCriteria(
  jobStepId: number,
  stepNo: number,
  nrcJobNo: string,
  allMachines: any[]
): Promise<{ shouldComplete: boolean; reason: string; totalOK: number; totalWastage: number }> {
  try {
    console.log(`\n🎯 [COMPLETION CHECK] Checking completion criteria for step ${stepNo}, job ${nrcJobNo}`);
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
    const previousStepQuantity = await _getPreviousStepQuantity(stepNo, nrcJobNo);
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

async function _updateIndividualStepWithFormData(stepNo: number, nrcJobNo: string, formData: any, allMachines?: any[], jobStepUser?: string, jobStepId?: number) {
  console.log(`🚨 [CRITICAL DEBUG] _updateIndividualStepWithFormData FUNCTION CALLED!`);
  console.log(`🔍 [DEBUG] Step: ${stepNo}, Job: ${nrcJobNo}, JobStepId: ${jobStepId}`);
  console.log(`🔍 [DEBUG] FormData received:`, JSON.stringify(formData, null, 2));
  console.log(`🔍 [DEBUG] Status to set: ${formData.status || 'accept'}`);
  console.log(`🔍 [DEBUG] Quantity: ${formData.quantity}, Wastage: ${formData.wastage}`);
  
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
      case 1: // PaperStore (No machine assignment - keep original flow)
        await prisma.paperStore.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: {
            quantity: formData.quantity || formData.requiredQty,
            available: formData.available || formData.availableQty, // Try 'available' first, then 'availableQty'
            sheetSize: formData.sheetSize,
            gsm: formData.gsm,
            status: formData.status || 'accept' // Add status update
          }
        });
        break;
      case 2: // Printing
        {
          // Handle field name variations (with spaces, capitals, camelCase)
          const quantity = formData.quantity || formData['Quantity OK'] || formData.quantityOK || formData.okQuantity;
          const wastage = formData.wastage || formData.Wastage || formData.WASTAGE;
          const colors = formData.colors || formData.colorsUsed || formData['Colors Used'];
          const inks = formData.inksUsed || formData['Inks Used'];
          const coating = formData.coatingType || formData['Coating Type'];
          const separateSheets = formData.separateSheets || formData['Separate Sheets'];
          const extraSheets = formData.extraSheets || formData['Extra Sheets'];
          
          console.log(`🔍 [Printing] Mapped fields: quantity=${quantity}, wastage=${wastage}, colors=${colors}, inks=${inks}, coating=${coating}`);
          console.log(`🔍 [Printing] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // First, try to update existing records
          const printingResult = await prisma.printingDetails.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              noOfColours: colors ? parseInt(colors) : undefined,
              inksUsed: inks,
              coatingType: coating,
              separateSheets: separateSheets ? parseInt(separateSheets) : undefined,
              extraSheets: extraSheets ? parseInt(extraSheets) : undefined,
              machine: machineCodesStr || undefined, // ✅ Store all machine codes
              date: now, // ✅ Auto-populate date
              shift: shift, // ✅ Auto-populate shift
              oprName: operatorName || undefined, // ✅ Auto-populate operator name
              jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
              status: formData.status || 'accept' // Only called when all machines complete
            }
          });
          
          // If no records were updated, create a new one
          if (printingResult.count === 0) {
            await prisma.printingDetails.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: quantity ? parseInt(quantity) : undefined,
                wastage: wastage ? parseInt(wastage) : undefined,
                noOfColours: colors ? parseInt(colors) : undefined,
                inksUsed: inks,
                coatingType: coating,
                separateSheets: separateSheets ? parseInt(separateSheets) : undefined,
                extraSheets: extraSheets ? parseInt(extraSheets) : undefined,
                machine: machineCodesStr || undefined, // ✅ Store all machine codes
                date: now, // ✅ Auto-populate date
                shift: shift, // ✅ Auto-populate shift
                oprName: operatorName || undefined, // ✅ Auto-populate operator name
                jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
                status: formData.status || 'accept' // Only called when all machines complete
              }
            });
            console.log(`Created new PrintingDetails record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${printingResult.count} PrintingDetails records`);
          }
        }
        break;
      case 3: // Corrugation
        {
          console.log(`🔍 [DEBUG] Processing Corrugation case for job ${nrcJobNo}`);
          
          // Handle field name variations
          const sheetsCount = formData.quantity || formData.sheetsCount || formData['Sheets Count'];
          const fluteType = formData.fluteType || formData.flute || formData['Flute Type'];
          const gsm1 = formData.gsm1 || formData['GSM1 (Top Face)'] || formData['GSM1'];
          const gsm2 = formData.gsm2 || formData['GSM2 (Bottom Face)'] || formData['GSM2'];
          const size = formData.size || formData.Size;
          
          console.log(`🔍 [Corrugation] Mapped: sheetsCount=${sheetsCount}, flute=${fluteType}, gsm1=${gsm1}, gsm2=${gsm2}`);
          console.log(`🔍 [Corrugation] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // First, try to update existing records
          const corrugationResult = await prisma.corrugation.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: sheetsCount ? parseInt(sheetsCount) : undefined,
              flute: fluteType, // Note: schema field is 'flute', not 'fluteType'
              gsm1: gsm1?.toString(), // Convert to string
              gsm2: gsm2?.toString(), // Convert to string
              size: size,
              machineNo: machineCodesStr || undefined, // ✅ Store all machine codes
              date: now, // ✅ Auto-populate date
              shift: shift, // ✅ Auto-populate shift
              oprName: operatorName || undefined, // ✅ Auto-populate operator
              remarks: formData.remarks || formData.Remarks,
              jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
              status: formData.status || 'accept' // Only called when all machines complete
            }
          });
          
          // If no records were updated, create a new one
          if (corrugationResult.count === 0) {
            await prisma.corrugation.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: sheetsCount ? parseInt(sheetsCount) : undefined,
                flute: fluteType,
                gsm1: gsm1?.toString(), // Convert to string
                gsm2: gsm2?.toString(), // Convert to string
                size: size,
                machineNo: machineCodesStr || undefined, // ✅ Store all machine codes
                date: now, // ✅ Auto-populate date
                shift: shift, // ✅ Auto-populate shift
                oprName: operatorName || undefined, // ✅ Auto-populate operator
                remarks: formData.remarks || formData.Remarks,
                jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
                status: formData.status || 'accept' // Only called when all machines complete
              }
            });
            console.log(`Created new Corrugation record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${corrugationResult.count} Corrugation records`);
          }
        }
        break;
      case 4: // Flute Lamination
        {
          // Handle field name variations
          const okQuantity = formData.quantity || formData.okQuantity || formData['OK Quantity'];
          const wastage = formData.wastage || formData.Wastage;
          const film = formData.film || formData.filmType || formData['Film Type'];
          const adhesive = formData.adhesive || formData.Adhesive;
          
          console.log(`🔍 [FluteLam] Mapped: okQuantity=${okQuantity}, wastage=${wastage}, film=${film}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // First, try to update existing records
          const fluteResult = await prisma.fluteLaminateBoardConversion.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              film: film,
              adhesive: adhesive,
              date: now, // ✅ Auto-populate date
              shift: shift, // ✅ Auto-populate shift
              operatorName: operatorName || undefined, // ✅ Auto-populate operator
              status: formData.status || 'accept' // Only called when all machines complete
            }
          });
          
          // If no records were updated, create a new one
          if (fluteResult.count === 0) {
            await prisma.fluteLaminateBoardConversion.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: okQuantity ? parseInt(okQuantity) : undefined,
                wastage: wastage ? parseInt(wastage) : undefined,
                film: film,
                adhesive: adhesive,
                date: now, // ✅ Auto-populate date
                shift: shift, // ✅ Auto-populate shift
                operatorName: operatorName || undefined, // ✅ Auto-populate operator
                status: formData.status || 'accept' // Only called when all machines complete
              }
            });
            console.log(`Created new FluteLaminateBoardConversion record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${fluteResult.count} FluteLaminateBoardConversion records (qty=${okQuantity}, wastage=${wastage})`);
          }
        }
        break;
      case 5: // Punching
        {
          // Handle field name variations
          const okQuantity = formData.quantity || formData.okQuantity || formData['OK Quantity'];
          const wastage = formData.wastage || formData.Wastage;
          const die = formData.dieUsed || formData.die || formData['Die Used (diePunchCode)'];
          
          console.log(`🔍 [Punching] Mapped: okQuantity=${okQuantity}, wastage=${wastage}, die=${die}`);
          console.log(`🔍 [Punching] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // First, try to update existing records
          const punchingResult = await prisma.punching.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: okQuantity ? parseInt(okQuantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              die: die, // Note: schema field is 'die', not 'dieUsed'
              machine: machineCodesStr || undefined, // ✅ Store all machine codes
              date: now, // ✅ Auto-populate date
              shift: shift, // ✅ Auto-populate shift
              operatorName: operatorName || undefined, // ✅ Auto-populate operator
              remarks: formData.remarks || formData.Remarks,
              jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
              status: formData.status || 'accept' // Only called when all machines complete
            }
          });
          
          // If no records were updated, create a new one
          if (punchingResult.count === 0) {
            await prisma.punching.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: okQuantity ? parseInt(okQuantity) : undefined,
                wastage: wastage ? parseInt(wastage) : undefined,
                die: die,
                machine: machineCodesStr || undefined, // ✅ Store all machine codes
                date: now, // ✅ Auto-populate date
                shift: shift, // ✅ Auto-populate shift
                operatorName: operatorName || undefined, // ✅ Auto-populate operator
                remarks: formData.remarks || formData.Remarks,
                jobStepId: jobStepId || undefined, // ✅ Link to JobStep (required for next step validation)
                status: formData.status || 'accept' // Only called when all machines complete
              }
            });
            console.log(`Created new Punching record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${punchingResult.count} Punching records`);
          }
        }
        break;
      case 6: // Flap Pasting (stepNo 6 in database)
        {
          // Handle field name variations
          const quantity = formData.quantity || formData.Quantity || formData.finalQuantity;
          const wastage = formData.wastage || formData.Wastage;
          const adhesive = formData.adhesive || formData.Adhesive;
          
          console.log(`🔍 [Pasting] Mapped: quantity=${quantity}, wastage=${wastage}, adhesive=${adhesive}`);
          console.log(`🔍 [Pasting] Machines used: ${machineCodesStr}`);
          
          // Auto-populate fields
          const now = new Date();
          const currentHour = now.getHours();
          const shift = currentHour >= 6 && currentHour < 14 ? 'Morning' :
                       currentHour >= 14 && currentHour < 22 ? 'Afternoon' : 'Night';
          
          // First, try to update existing records
          const flapResult = await prisma.sideFlapPasting.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: quantity ? parseInt(quantity) : undefined,
              wastage: wastage ? parseInt(wastage) : undefined,
              adhesive: adhesive,
              machineNo: machineCodesStr || undefined, // ✅ Store all machine codes
              date: now, // ✅ Auto-populate date
              shift: shift, // ✅ Auto-populate shift
              operatorName: operatorName || undefined, // ✅ Auto-populate operator
              remarks: formData.remarks || formData.Remarks,
              jobStepId: jobStepId || undefined, // ✅ Link to JobStep
              status: formData.status || 'accept' // Only called when all machines complete
            }
          });
          
          // If no records were updated, create a new one
          if (flapResult.count === 0) {
            await prisma.sideFlapPasting.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: quantity ? parseInt(quantity) : undefined,
                wastage: wastage ? parseInt(wastage) : undefined,
                adhesive: adhesive,
                machineNo: machineCodesStr || undefined, // ✅ Store all machine codes
                date: now, // ✅ Auto-populate date
                shift: shift, // ✅ Auto-populate shift
                operatorName: operatorName || undefined, // ✅ Auto-populate operator
                remarks: formData.remarks || formData.Remarks,
                jobStepId: jobStepId || undefined, // ✅ Link to JobStep
                status: formData.status || 'accept' // Only called when all machines complete
              }
            });
            console.log(`Created new SideFlapPasting record for job ${nrcJobNo} with jobStepId ${jobStepId}`);
          } else {
            console.log(`Updated ${flapResult.count} SideFlapPasting records (qty=${quantity}, wastage=${wastage}, machines=${machineCodesStr}, jobStepId=${jobStepId})`);
          }
        }
        break;
      case 7: // Quality Control (stepNo 7 in database - No machine assignment)
        await prisma.qualityDept.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: {
            quantity: formData.quantity,
            rejectedQty: formData.rejectedQty,
            remarks: formData.remarks
          }
        });
        break;
      case 8: // Dispatch (stepNo 8 in database - No machine assignment)
        await prisma.dispatchProcess.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: {
            quantity: formData.quantity || formData.finalQuantity,
            remarks: formData.remarks
          }
        });
        break;
    }
    console.log(`✅ Updated individual step ${stepNo} with form data`);
  } catch (error) {
    console.error(`Error updating individual step ${stepNo} with form data:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}
