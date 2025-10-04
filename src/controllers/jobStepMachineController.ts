import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
// Using standard Error instead of Error

const prisma = new PrismaClient();

// Get available machines for a specific job step (only machines assigned to the user)
export const getAvailableMachines = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo, stepNo } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    const isUrgentJob = job?.jobDemand === 'high';

    // For urgent jobs, get all machines (no user restriction)
    // For regular jobs, get only user-assigned machines
    let userMachines;
    if (isUrgentJob) {
      // For urgent jobs, get all machines
      userMachines = await prisma.userMachine.findMany({
        where: { 
          isActive: true 
        },
        include: {
          machine: true
        }
      });
    } else {
      // For regular jobs, get only user-assigned machines
      userMachines = await prisma.userMachine.findMany({
        where: { 
          userId: userId,
          isActive: true 
        },
        include: {
          machine: true
        }
      });
    }

    const userMachineIds = userMachines.map(um => um.machineId);

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
      // Only show machines that are assigned to this user
      if (!userMachineIds.includes(machineInfo.machineId)) {
        continue; // Skip machines not assigned to this user
      }

      // Check if this machine is already tracked in JobStepMachine
      let jobStepMachine = (jobStep as any).jobStepMachines?.find(
        (jsm: any) => jsm.machineId === machineInfo.machineId
      );

      // If not tracked, create a new entry
      if (!jobStepMachine) {
        jobStepMachine = await (prisma as any).jobStepMachine.create({
          data: {
            jobStepId: jobStep.id,
            machineId: machineInfo.machineId,
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

    // Check if this is an urgent job
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    const isUrgentJob = job?.jobDemand === 'high';

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

    // Find or create JobStepMachine entry
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
          machineId: machineId,
          status: 'available'
        }
      });
    }

    // Check if machine is available
    if (jobStepMachine.status !== 'available') {
      throw new AppError('Machine is not available', 400);
    }

    // Update machine status to busy and assign to user
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        status: 'busy',
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
    res.status(500).json({
      success: false,
      message: 'Failed to start work on machine',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: nrcJobNo },
      select: { jobDemand: true }
    });

    const isUrgentJob = job?.jobDemand === 'high';

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

    if (jobStepMachine.status !== 'busy') {
      throw new AppError('Machine is not currently in progress', 400);
    }

    // Update machine status to completed
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        formData: formData || jobStepMachine.formData
      },
      include: {
        machine: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Check if all machines for this step are completed
    const allMachines = await (prisma as any).jobStepMachine.findMany({
      where: { jobStepId: jobStep.id }
    });

    const allCompleted = allMachines.every((machine: any) => machine.status === 'completed');

    // If all machines are completed, update the main job step status
    if (allCompleted) {
      await prisma.jobStep.update({
        where: { id: jobStep.id },
        data: {
          status: 'stop',
          endDate: new Date()
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Work completed on machine successfully',
      data: {
        jobStepMachineId: updatedJobStepMachine.id,
        machineId: updatedJobStepMachine.machineId,
        machineCode: updatedJobStepMachine.machine.machineCode,
        status: updatedJobStepMachine.status,
        completedAt: updatedJobStepMachine.completedAt,
        allMachinesCompleted: allCompleted
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
        busyMachines: machineWork?.filter((m: any) => m.status === 'busy').length || 0,
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
          status: 'available'
        }
      });
    }

    // Check if machine is available
    if (jobStepMachine.status !== 'available') {
      throw new AppError('Machine is not available', 400);
    }

    // Update machine status to busy and assign to user
    const updatedJobStepMachine = await (prisma as any).jobStepMachine.update({
      where: { id: jobStepMachine.id },
      data: {
        status: 'busy',
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
