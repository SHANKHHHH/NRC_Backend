import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { checkJobReadyForCompletion, autoCompleteJobIfReady } from '../utils/workflowValidator';

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

    // Find a step where status is 'stop' and dispatchProcess.status is 'accept'
    const jobStep = jobPlanning.steps.find(
      step => step.status === 'stop' && step.dispatchProcess && step.dispatchProcess.status === 'accept'
    );
    if (!jobStep) {
      throw new AppError('No step with status "stop" and dispatch process accepted', 400);
    }
    const dispatchProcess = jobStep.dispatchProcess;

    // Get job details
    const job = await prisma.job.findUnique({
      where: { nrcJobNo }
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Get purchase order details - use the specific PO linked to this job planning
    let purchaseOrder = null;
    if (jobPlanning.purchaseOrderId) {
      purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: jobPlanning.purchaseOrderId }
      });
      if (purchaseOrder) {
        console.log(`✅ [completeJob] Using specific PO ID ${jobPlanning.purchaseOrderId} for job planning ${jobPlanning.jobPlanId}`);
      }
    }
    
    // Fallback to first PO if specific PO not found
    if (!purchaseOrder) {
      purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      });
      if (purchaseOrder) {
        console.log(`⚠️ [completeJob] Using first PO (fallback) for job ${nrcJobNo}`);
      }
    }

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
          paperStore: jobPlanning.steps.filter(s => s.paperStore).map(s => s.paperStore),
          printingDetails: jobPlanning.steps.filter(s => s.printingDetails).map(s => s.printingDetails),
          corrugation: jobPlanning.steps.filter(s => s.corrugation).map(s => s.corrugation),
          flutelam: jobPlanning.steps.filter(s => s.flutelam).map(s => s.flutelam),
          punching: jobPlanning.steps.filter(s => s.punching).map(s => s.punching),
          sideFlapPasting: jobPlanning.steps.filter(s => s.sideFlapPasting).map(s => s.sideFlapPasting),
          qualityDept: jobPlanning.steps.filter(s => s.qualityDept).map(s => s.qualityDept),
          dispatchProcess: jobPlanning.steps.filter(s => s.dispatchProcess).map(s => s.dispatchProcess)
        },
        completedBy: userId,
        totalDuration,
        remarks,
        finalStatus: 'completed'
      }
    });

    // Delete all JobStep records for this job planning
    await prisma.jobStep.deleteMany({ where: { jobPlanningId: jobPlanning.jobPlanId } });

    // Delete the JobPlanning record
    await prisma.jobPlanning.delete({ where: { jobPlanId: jobPlanning.jobPlanId } });

    // Update the Job record: set status to INACTIVE and specified fields to NULL
    await prisma.job.update({
      where: { nrcJobNo },
      data: {
        status: 'INACTIVE',
        shadeCardApprovalDate: null,
        artworkApprovedDate: null,
        artworkReceivedDate: null,
        imageURL: null
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

/**
 * Check if a job is ready for completion and auto-complete it if possible
 */
export const checkAndAutoCompleteJob = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const userId = req.user?.userId;

  try {
    // Check if job is ready for completion
    const completionCheck = await checkJobReadyForCompletion(nrcJobNo);
    
    if (!completionCheck.isReady) {
      return res.status(200).json({
        success: true,
        data: {
          isReadyForCompletion: false,
          reason: completionCheck.reason
        }
      });
    }

    // Job is ready - proceed with auto-completion
    const result = await autoCompleteJobIfReady(nrcJobNo, userId);
    
    if (result.completed) {
      // Log the completion
      if (userId) {
        await logUserActionWithResource(
          userId,
          ActionTypes.JOB_COMPLETED,
          `Auto-completed job: ${nrcJobNo}`,
          'CompletedJob',
          result.completedJob.id.toString(),
          nrcJobNo
        );
      }

      res.status(200).json({
        success: true,
        data: {
          isReadyForCompletion: true,
          autoCompleted: true,
          completedJob: result.completedJob,
          message: 'Job automatically completed successfully'
        }
      });
    } else {
      res.status(200).json({
        success: true,
        data: {
          isReadyForCompletion: true,
          autoCompleted: false,
          reason: result.reason,
          message: 'Job is ready for completion but auto-completion failed'
        }
      });
    }

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

/**
 * Get all jobs that are ready for completion
 */
export const getJobsReadyForCompletion = async (req: Request, res: Response) => {
  try {
    // Get all active job plannings
    const jobPlannings = await prisma.jobPlanning.findMany({
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

    const readyJobs = [];

    for (const jobPlanning of jobPlannings) {
      const completionCheck = await checkJobReadyForCompletion(jobPlanning.nrcJobNo);
      if (completionCheck.isReady) {
        readyJobs.push({
          nrcJobNo: jobPlanning.nrcJobNo,
          jobPlanId: jobPlanning.jobPlanId,
          jobDemand: jobPlanning.jobDemand,
          steps: jobPlanning.steps,
          reason: 'All steps stopped and dispatch process accepted'
        });
      }
    }

    res.status(200).json({
      success: true,
      count: readyJobs.length,
      data: readyJobs
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};