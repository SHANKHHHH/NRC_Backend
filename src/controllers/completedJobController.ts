import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Check if a job is ready for completion
 * Criteria: Job step status is 'stop' AND dispatch process is 'accept'
 */
export const checkJobCompletion = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Get the job planning
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          include: {
            dispatchProcess: true
          }
        }
      }
    });

    if (!jobPlanning) {
      throw new AppError('Job planning not found', 404);
    }

    // Debug log: print all steps and their dispatchProcess
    console.log('DEBUG: jobPlanning.steps:', JSON.stringify(jobPlanning.steps, null, 2));

    // Find a step where status is 'stop' and dispatchProcess.status is 'accept'
    const jobStep = jobPlanning.steps.find(
      step => step.status === 'stop' && step.dispatchProcess && step.dispatchProcess.status === 'accept'
    );
    if (!jobStep) {
      return res.status(200).json({
        success: true,
        data: {
          isReadyForCompletion: false,
          reason: 'No step with status "stop" and dispatch process accepted'
        }
      });
    }
    const dispatchProcess = jobStep.dispatchProcess;

    res.status(200).json({
      success: true,
      data: {
        isReadyForCompletion: true,
        jobPlanning,
        jobStep,
        dispatchProcess
      }
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

/**
 * Complete a job - move it to completed jobs table
 */
export const completeJob = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { remarks } = req.body;
  const userId = req.user?.userId;

  try {
    // First check if job is ready for completion
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          include: {
            paperStore: true,
            printingDetails: true,
            corrugation: true,
            flutelam: true,
            punching: true,
            sideFlapPasting: true,
            qualityDept: true,
            dispatchProcess: true
          }
        }
      }
    });

    if (!jobPlanning) {
      throw new AppError('Job planning not found', 404);
    }

    // Check completion criteria
    const jobStep = jobPlanning.steps.find(step => step.status === 'stop');
    if (!jobStep) {
      throw new AppError('Job step status must be "stop" to complete', 400);
    }

    const dispatchProcess = jobStep.dispatchProcess;
    if (!dispatchProcess || dispatchProcess.status !== 'accept') {
      throw new AppError('Dispatch process must be accepted to complete', 400);
    }

    // Get job details
    const job = await prisma.job.findUnique({
      where: { nrcJobNo }
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Get purchase order details if any
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { jobNrcJobNo: nrcJobNo }
    });

    // Calculate total duration
    const startDate = jobPlanning.steps.reduce((earliest, step) => {
      if (step.startDate && (!earliest || step.startDate < earliest)) {
        return step.startDate;
      }
      return earliest;
    }, null as Date | null);

    const endDate = jobPlanning.steps.reduce((latest, step) => {
      if (step.endDate && (!latest || step.endDate > latest)) {
        return step.endDate;
      }
      return latest;
    }, null as Date | null);

    const totalDuration = startDate && endDate 
      ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) // days
      : null;

    // Create completed job record
    const completedJob = await prisma.completedJob.create({
      data: {
        nrcJobNo,
        jobPlanId: jobPlanning.jobPlanId,
        jobDemand: jobPlanning.jobDemand,
        jobDetails: job,
        purchaseOrderDetails: purchaseOrder ?? Prisma.JsonNull,
        allSteps: jobPlanning.steps,
        allStepDetails: {
          paperStore: jobPlanning.steps.map(s => s.paperStore).filter(Boolean),
          printingDetails: jobPlanning.steps.map(s => s.printingDetails).filter(Boolean),
          corrugation: jobPlanning.steps.map(s => s.corrugation).filter(Boolean),
          flutelam: jobPlanning.steps.map(s => s.flutelam).filter(Boolean),
          punching: jobPlanning.steps.map(s => s.punching).filter(Boolean),
          sideFlapPasting: jobPlanning.steps.map(s => s.sideFlapPasting).filter(Boolean),
          qualityDept: jobPlanning.steps.map(s => s.qualityDept).filter(Boolean),
          dispatchProcess: jobPlanning.steps.map(s => s.dispatchProcess).filter(Boolean)
        },
        completedBy: userId,
        totalDuration,
        remarks,
        finalStatus: 'completed'
      }
    });

    // Log the completion
    if (userId) {
      await logUserActionWithResource(
        userId,
        ActionTypes.JOB_COMPLETED,
        `Completed job: ${nrcJobNo} with total duration: ${totalDuration} days`,
        'CompletedJob',
        completedJob.id.toString(),
        nrcJobNo
      );
    }

    res.status(201).json({
      success: true,
      data: completedJob,
      message: 'Job completed successfully'
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

/**
 * Get all completed jobs
 */
export const getAllCompletedJobs = async (req: Request, res: Response) => {
  try {
    const completedJobs = await prisma.completedJob.findMany({
      orderBy: { completedAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      count: completedJobs.length,
      data: completedJobs
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

/**
 * Get a specific completed job
 */
export const getCompletedJobById = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const completedJob = await prisma.completedJob.findUnique({
      where: { id: Number(id) }
    });

    if (!completedJob) {
      throw new AppError('Completed job not found', 404);
    }

    res.status(200).json({
      success: true,
      data: completedJob
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
}; 