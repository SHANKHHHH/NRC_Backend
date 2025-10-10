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


// Complete work on a specific machine
export const completeWorkOnMachine = async (req: Request, res: Response) => {
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
        machineId: machineId,
        userId: userId
      }
    });

    if (!jobStepMachine) {
      throw new AppError('Machine work not found or not assigned to user', 404);
    }

    if (jobStepMachine.status !== 'stop') {
      throw new AppError('Machine must be in stop status to complete', 400);
    }

    // Update form data to individual fields AND formData for backward compatibility
    const updateData: any = {
      formData: formData || jobStepMachine.formData,
      updatedAt: new Date()
    };

    // Map form data to individual fields based on step type
    const stepNoInt = parseInt(stepNo);
    if (stepNoInt === 1) { // PaperStore
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.requiredQty) updateData.requiredQty = formData.requiredQty;
      if (formData?.availableQty) updateData.availableQty = formData.availableQty;
      if (formData?.sheetSize) updateData.sheetSize = formData.sheetSize;
      if (formData?.gsm) updateData.gsm = formData.gsm;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 2) { // Printing
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.colors || formData?.colorsUsed) updateData.colorsUsed = formData.colors || formData.colorsUsed;
      if (formData?.processColors) updateData.processColors = formData.processColors;
      if (formData?.specialColors) updateData.specialColors = formData.specialColors;
      if (formData?.inksUsed) updateData.inksUsed = formData.inksUsed;
      if (formData?.coatingType) updateData.coatingType = formData.coatingType;
      if (formData?.quantityOK || formData?.finalQuantity) updateData.quantityOK = formData.quantityOK || formData.finalQuantity;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 3) { // Corrugation
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.fluteType) updateData.fluteType = formData.fluteType;
      if (formData?.gsm1) updateData.gsm1 = formData.gsm1;
      if (formData?.gsm2) updateData.gsm2 = formData.gsm2;
      if (formData?.size) updateData.size = formData.size;
      if (formData?.sheetsCount) updateData.sheetsCount = formData.sheetsCount;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 4) { // Flute Lamination
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.okQuantity || formData?.finalQuantity) updateData.okQuantity = formData.okQuantity || formData.finalQuantity;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 5 || stepNoInt === 6) { // Punching/Die Cutting
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.dieUsed) updateData.dieUsed = formData.dieUsed;
      if (formData?.okQuantity || formData?.finalQuantity) updateData.okQuantity = formData.okQuantity || formData.finalQuantity;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 7) { // Flap Pasting
      if (formData?.quantity || formData?.finalQuantity) updateData.quantity = formData.quantity || formData.finalQuantity;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 8) { // Quality Control
      if (formData?.quantity) updateData.quantity = formData.quantity;
      if (formData?.rejectedQty) updateData.rejectedQty = formData.rejectedQty;
      if (formData?.remarks) updateData.remarks = formData.remarks;
    } else if (stepNoInt === 9) { // Dispatch
      if (formData?.quantity || formData?.finalQuantity) updateData.quantity = formData.quantity || formData.finalQuantity;
      if (formData?.remarks) updateData.remarks = formData.remarks;
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

    // Check if all machines are completed before updating individual step
    const allMachines = await (prisma as any).jobStepMachine.findMany({
      where: { jobStepId: jobStep.id }
    });
    
    console.log(`🔍 [COMPLETE DEBUG] Found ${allMachines.length} total JobStepMachine entries for this step`);
    allMachines.forEach((m: any, idx: number) => {
      console.log(`🔍 [COMPLETE DEBUG] Machine ${idx + 1}: status = ${m.status}, machineId = ${m.machineId}`);
    });
    
    const allMachinesCompleted = allMachines.every((m: any) => m.status === 'stop' || m.status === 'completed');
    console.log(`🔍 [COMPLETE DEBUG] allMachinesCompleted check result: ${allMachinesCompleted}`);
    
    // Only update individual step table if ALL machines are completed
    if (allMachinesCompleted) {
      try {
        console.log(`✅ ALL MACHINES COMPLETED - Updating individual step table to 'accept'`);
        await _updateIndividualStepWithFormData(stepNoInt, nrcJobNo, formData);
        console.log(`✅ Individual step table updated successfully`);
      } catch (error) {
        console.error(`🔍 [DEBUG] Error in _updateIndividualStepWithFormData:`, error);
        throw error;
      }
    } else {
      console.log(`⏸️ NOT ALL MACHINES COMPLETED - Individual step will remain unchanged`);
      console.log(`   Only ${allMachines.filter((m: any) => m.status === 'stop' || m.status === 'completed').length}/${allMachines.length} machines are done`);
    }

    // Complete button only updates form data, does not change step status

    res.status(200).json({
      success: true,
      message: 'Form data updated successfully',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        status: updatedJobStepMachine.status,
        updatedAt: updatedJobStepMachine.updatedAt
      }
    });

  } catch (error) {
    console.error('Error completing work on machine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete work on machine',
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
              case 6: // Die Cutting
                stepSpecificData = await prisma.punching.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 7: // Flap Pasting
                stepSpecificData = await prisma.sideFlapPasting.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 8: // Quality Control
                stepSpecificData = await prisma.qualityDept.findFirst({
                  where: { jobNrcJobNo: nrcJobNo }
                });
                break;
              case 9: // Dispatch
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
export const stopWorkOnMachine = async (req: Request, res: Response) => {
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

    // Check if machine is currently working or on hold (handle both 'busy' and 'in_progress' for backward compatibility)
    if (jobStepMachine.status !== 'in_progress' && jobStepMachine.status !== 'hold' && jobStepMachine.status !== 'busy') {
      throw new AppError('Machine is not currently working or on hold', 400);
    }

    // Update machine status to stop
    let updatedJobStepMachine;
    try {
      updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
        where: { id: jobStepMachine.id },
        data: {
          status: 'stop',
          formData: formData || jobStepMachine.formData,
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
    } catch (updateError) {
      console.error(`❌ [STOP ERROR] Failed to update JobStepMachine ${jobStepMachine.id}:`, updateError);
      throw new AppError(`Failed to update machine status: ${(updateError as Error).message}`, 500);
    }

    // Check if all machines for this step are finished (completed or stopped)
    const allMachines = await (prisma as any).jobStepMachine.findMany({
      where: { jobStepId: jobStep.id }
    });

    console.log(`🔍 [STOP DEBUG] Found ${allMachines.length} total JobStepMachine entries for this step`);
    allMachines.forEach((m: any, idx: number) => {
      console.log(`🔍 [STOP DEBUG] Machine ${idx + 1}: status = ${m.status}, machineId = ${m.machineId}`);
    });

    const allFinished = allMachines.every((m: any) => m.status === 'completed' || m.status === 'stop');
    console.log(`🔍 [STOP DEBUG] allFinished check result: ${allFinished}`);
    
    if (allFinished) {
      // Update the main job step status to 'stop'
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: { 
          status: 'stop',
          endDate: new Date()
        }
      });
      
      console.log(`🔍 [DEBUG] All machines finished, updated JobStep status to 'stop'`);
      
      // Don't update individual step status here - it will be updated when complete is called
      // Individual step tables are populated with form data on completion, not on stop
    } else {
      console.log(`🔍 [DEBUG] Not all machines finished yet, JobStep status remains unchanged`);
    }

    res.status(200).json({
      success: true,
      message: 'Work stopped on machine',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        status: updatedJobStepMachine.status,
        completedAt: updatedJobStepMachine.completedAt,
        updatedAt: updatedJobStepMachine.updatedAt,
        userId: updatedJobStepMachine.userId,
        userName: updatedJobStepMachine.user?.name,
        allMachinesFinished: allFinished
      }
    });

  } catch (error) {
    console.error('Error stopping work on machine:', error);
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
      case 6: // Die Cutting
        await prisma.punching.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 7: // Flap Pasting
        await prisma.sideFlapPasting.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 8: // Quality Control
        await prisma.qualityDept.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { status: status as any }
        });
        break;
      case 9: // Dispatch
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
      case 6: // Die Cutting
        await prisma.punching.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: { holdRemark: holdRemark }
        });
        break;
      case 7: // Flap Pasting
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
async function _updateIndividualStepWithFormData(stepNo: number, nrcJobNo: string, formData: any) {
  console.log(`🚨 [CRITICAL DEBUG] _updateIndividualStepWithFormData FUNCTION CALLED!`);
  try {
    console.log(`🔍 [DEBUG] _updateIndividualStepWithFormData called with stepNo: ${stepNo}, nrcJobNo: ${nrcJobNo}, formData:`, formData);
    
    // Update the appropriate step table based on step number
    switch (stepNo) {
      case 1: // PaperStore (No machine assignment - keep original flow)
        await prisma.paperStore.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: {
            quantity: formData.quantity || formData.requiredQty,
            available: formData.availableQty, // Note: schema field is 'available', not 'availableQty'
            sheetSize: formData.sheetSize,
            gsm: formData.gsm,
          }
        });
        break;
      case 2: // Printing
        {
          // First, try to update existing records
          const printingResult = await prisma.printingDetails.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: formData.quantity,
              noOfColours: formData.colors || formData.colorsUsed ? parseInt(formData.colors || formData.colorsUsed) : undefined,
              inksUsed: formData.inksUsed,
              coatingType: formData.coatingType
            }
          });
          
          // If no records were updated, create a new one
          if (printingResult.count === 0) {
            await prisma.printingDetails.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: formData.quantity,
                noOfColours: formData.colors || formData.colorsUsed ? parseInt(formData.colors || formData.colorsUsed) : undefined,
                inksUsed: formData.inksUsed,
                coatingType: formData.coatingType,
                status: 'accept'
              }
            });
            console.log(`Created new PrintingDetails record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${printingResult.count} PrintingDetails records with form data`);
          }
        }
        break;
      case 3: // Corrugation
        {
          console.log(`🔍 [DEBUG] Processing Corrugation case for job ${nrcJobNo}`);
          // First, try to update existing records
          const corrugationResult = await prisma.corrugation.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: formData.quantity,
              flute: formData.fluteType, // Note: schema field is 'flute', not 'fluteType'
              gsm1: formData.gsm1?.toString(), // Convert to string
              gsm2: formData.gsm2?.toString(), // Convert to string
              size: formData.size,
              remarks: formData.remarks
            }
          });
          
          // If no records were updated, create a new one
          if (corrugationResult.count === 0) {
            await prisma.corrugation.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: formData.quantity,
                flute: formData.fluteType,
                gsm1: formData.gsm1?.toString(), // Convert to string
                gsm2: formData.gsm2?.toString(), // Convert to string
                size: formData.size,
                remarks: formData.remarks,
                status: 'accept'
              }
            });
            console.log(`Created new Corrugation record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${corrugationResult.count} Corrugation records with form data`);
          }
        }
        break;
      case 4: // Flute Lamination
        {
          // First, try to update existing records
          const fluteResult = await prisma.fluteLaminateBoardConversion.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: formData.quantity
            }
          });
          
          // If no records were updated, create a new one
          if (fluteResult.count === 0) {
            await prisma.fluteLaminateBoardConversion.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: formData.quantity,
                status: 'accept'
              }
            });
            console.log(`Created new FluteLaminateBoardConversion record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${fluteResult.count} FluteLaminateBoardConversion records with form data`);
          }
        }
        break;
      case 5: // Punching
        {
          // First, try to update existing records
          const punchingResult = await prisma.punching.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: formData.quantity,
              die: formData.dieUsed, // Note: schema field is 'die', not 'dieUsed'
              remarks: formData.remarks
            }
          });
          
          // If no records were updated, create a new one
          if (punchingResult.count === 0) {
            await prisma.punching.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: formData.quantity,
                die: formData.dieUsed,
                remarks: formData.remarks,
                status: 'accept'
              }
            });
            console.log(`Created new Punching record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${punchingResult.count} Punching records with form data`);
          }
        }
        break;
      case 6: // Die Cutting
        {
          // First, try to update existing records
          const dieCuttingResult = await prisma.dieCutting.updateMany({
            where: { details: nrcJobNo }, // Note: DieCutting doesn't have jobNrcJobNo field
            data: {
              details: formData.dieUsed || formData.remarks
            }
          });
          
          // If no records were updated, create a new one
          if (dieCuttingResult.count === 0) {
            await prisma.dieCutting.create({
              data: {
                details: formData.dieUsed || formData.remarks || nrcJobNo
              }
            });
            console.log(`Created new DieCutting record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${dieCuttingResult.count} DieCutting records with form data`);
          }
        }
        break;
      case 7: // Flap Pasting
        {
          // First, try to update existing records
          const flapResult = await prisma.sideFlapPasting.updateMany({
            where: { jobNrcJobNo: nrcJobNo },
            data: {
              quantity: formData.quantity || formData.finalQuantity,
              remarks: formData.remarks
            }
          });
          
          // If no records were updated, create a new one
          if (flapResult.count === 0) {
            await prisma.sideFlapPasting.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                quantity: formData.quantity || formData.finalQuantity,
                remarks: formData.remarks,
                status: 'accept'
              }
            });
            console.log(`Created new SideFlapPasting record for job ${nrcJobNo}`);
          } else {
            console.log(`Updated ${flapResult.count} SideFlapPasting records with form data`);
          }
        }
        break;
      case 8: // Quality Control (No machine assignment - keep original flow)
        await prisma.qualityDept.updateMany({
          where: { jobNrcJobNo: nrcJobNo },
          data: {
            quantity: formData.quantity,
            rejectedQty: formData.rejectedQty,
            remarks: formData.remarks
          }
        });
        break;
      case 9: // Dispatch (No machine assignment - keep original flow)
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
