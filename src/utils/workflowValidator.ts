import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { calculateSharedCardDiffDate } from '../utils/dateUtils';

/**
 * Workflow validation utility for manufacturing steps
 * ALL steps are now optional - jobs can have any combination of steps
 * Dependencies only apply to steps that actually exist in the job planning
 */

export interface WorkflowStep {
  stepName: string;
  stepNo: number;
  id: number;
}

export interface WorkflowValidationResult {
  canProceed: boolean;
  message?: string;
  requiredSteps?: string[];
}

/**
 * Check if a step can proceed based on workflow rules
 * Now supports fully optional workflow - any step can be skipped
 */
export const validateWorkflowStep = async (
  jobStepId: number,
  currentStepName: string
): Promise<WorkflowValidationResult> => {
  // Get the job step and its planning
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    include: {
      jobPlanning: {
        include: { steps: true }
      }
    }
  });

  if (!jobStep) {
    throw new AppError('JobStep not found', 404);
  }

  const steps = jobStep.jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
  const currentStepIndex = steps.findIndex(s => s.id === jobStepId);

  // If this is the first step, it can always proceed
  if (currentStepIndex === 0) {
    return { canProceed: true };
  }

  // For all other steps, check dependencies based on what actually exists
  return await validateStepDependencies(jobStep.jobPlanning.nrcJobNo, currentStepName);
};

/**
 * Validate step dependencies based on what steps actually exist in the job
 * This makes ALL steps truly optional
 */
export const validateStepDependencies = async (
  nrcJobNo: string,
  currentStepName: string
): Promise<WorkflowValidationResult> => {
  try {
    // Get all existing steps for this job
    const existingSteps = await prisma.jobPlanning.findFirst({
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

    if (!existingSteps) {
      return { canProceed: false, message: 'Job planning not found' };
    }

    // Check dependencies based on what actually exists
    switch (currentStepName) {
      case 'PrintingDetails':
      case 'Corrugation':
        // These can run after PaperStore (if PaperStore exists)
        const paperStore = existingSteps.steps.find(s => s.stepName === 'PaperStore');
        if (paperStore && paperStore.paperStore) {
          return { canProceed: true, message: 'PaperStore exists, can proceed' };
        }
        return { canProceed: true, message: 'No PaperStore required, can proceed' };

      case 'FluteLaminateBoardConversion':
        // Can proceed if any of Corrugation or Printing exist and are accepted
        return await validateAnyCorrugationOrPrintingAccepted(nrcJobNo);

      case 'Punching':
        // Can proceed if any of Corrugation or Printing exist and are accepted
        return await validateAnyCorrugationOrPrintingAccepted(nrcJobNo);

      case 'SideFlapPasting':
        // Can proceed if any of Corrugation or Printing exist and are accepted
        return await validateAnyCorrugationOrPrintingAccepted(nrcJobNo);

      case 'QualityDept':
        // Can proceed if any of Corrugation or Printing exist and are accepted
        return await validateAnyCorrugationOrPrintingAccepted(nrcJobNo);

      case 'DispatchProcess':
        // Can proceed only if Quality Control (QC) has been completed
        return await validateQualityControlCompleted(nrcJobNo);

      default:
        // For any other step, check if previous step exists and is accepted
        return await validatePreviousStepAccepted(nrcJobNo, currentStepName);
    }
  } catch (error) {
    console.error('Error validating step dependencies:', error);
    return { canProceed: false, message: 'Error checking dependencies' };
  }
};

/**
 * Validate that any existing Corrugation OR Printing steps are accepted
 * If neither exists, step can still proceed
 */
export const validateAnyCorrugationOrPrintingAccepted = async (
  nrcJobNo: string
): Promise<WorkflowValidationResult> => {
  // Check if any Corrugation or Printing exist and are accepted
  const [corrugation, printing] = await Promise.all([
    prisma.corrugation.findFirst({
      where: { jobNrcJobNo: nrcJobNo }
    }),
    prisma.printingDetails.findFirst({
      where: { jobNrcJobNo: nrcJobNo }
    })
  ]);

  const requiredSteps: string[] = [];
  let canProceed = true;
  let message = '';

  // Check Corrugation (if exists, must be accepted)
  if (corrugation && corrugation.status !== 'accept') {
    requiredSteps.push('Corrugation (must be accepted)');
    canProceed = false;
    message += 'Corrugation step must be accepted. ';
  }

  // Check Printing (if exists, must be accepted)
  if (printing && printing.status !== 'accept') {
    requiredSteps.push('PrintingDetails (must be accepted)');
    canProceed = false;
    message += 'Printing step must be accepted. ';
  }

  if (canProceed) {
    const existingSteps = [];
    if (corrugation) existingSteps.push('Corrugation');
    if (printing) existingSteps.push('PrintingDetails');
    
    if (existingSteps.length === 0) {
      message = 'No Corrugation or Printing steps required for this job.';
    } else if (existingSteps.length === 1) {
      message = `${existingSteps[0]} step is accepted.`;
    } else {
      message = 'Both Corrugation and Printing steps are accepted.';
    }
  }

  return {
    canProceed,
    message: message.trim(),
    requiredSteps: requiredSteps.length > 0 ? requiredSteps : undefined
  };
};

/**
 * Validate that Quality Control (QC) has been completed before Dispatch
 */
export const validateQualityControlCompleted = async (
  nrcJobNo: string
): Promise<WorkflowValidationResult> => {
  try {
    // Get the job planning to find the Quality Control step
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          where: { stepName: 'QualityDept' },
          include: { qualityDept: true }
        }
      }
    });

    if (!jobPlanning) {
      return { canProceed: false, message: 'Job planning not found' };
    }

    const qualityStep = jobPlanning.steps.find(s => s.stepName === 'QualityDept');
    
    if (!qualityStep) {
      return { canProceed: false, message: 'Quality Control step not found' };
    }

    if (!qualityStep.qualityDept) {
      return { canProceed: false, message: 'Quality Control step not started' };
    }

    // Check if QC has been completed (qcCheckSignBy and qcCheckAt are set)
    if (!qualityStep.qualityDept.qcCheckSignBy || !qualityStep.qualityDept.qcCheckAt) {
      return { canProceed: false, message: 'Quality Control must be completed by Flying Squad before Dispatch can proceed' };
    }

    return { canProceed: true, message: 'Quality Control completed, Dispatch can proceed' };

  } catch (error) {
    console.error('Error validating Quality Control completion:', error);
    return { canProceed: false, message: 'Error checking Quality Control status' };
  }
};

/**
 * Validate that the previous step is accepted (if it exists)
 */
export const validatePreviousStepAccepted = async (
  nrcJobNo: string,
  currentStepName: string
): Promise<WorkflowValidationResult> => {
  try {
    // Get the job planning to find the previous step
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: { steps: true }
    });

    if (!jobPlanning) {
      return { canProceed: false, message: 'Job planning not found' };
    }

    const steps = jobPlanning.steps.sort((a, b) => a.stepNo - b.stepNo);
    const currentStepIndex = steps.findIndex(s => s.stepName === currentStepName);

    if (currentStepIndex <= 0) {
      return { canProceed: true, message: 'First step or no previous step' };
    }

    const prevStep = steps[currentStepIndex - 1];
    
    // Check if previous step exists and is accepted
    let prevDetail: any = null;

    switch (prevStep.stepName) {
      case 'PaperStore':
        prevDetail = await prisma.paperStore.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'PrintingDetails':
        prevDetail = await prisma.printingDetails.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Corrugation':
        prevDetail = await prisma.corrugation.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'FluteLaminateBoardConversion':
        prevDetail = await prisma.fluteLaminateBoardConversion.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'Punching':
        prevDetail = await prisma.punching.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'SideFlapPasting':
        prevDetail = await prisma.sideFlapPasting.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'QualityDept':
        prevDetail = await prisma.qualityDept.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      case 'DispatchProcess':
        prevDetail = await prisma.dispatchProcess.findUnique({ where: { jobStepId: prevStep.id } });
        break;
      default:
        break;
    }

    if (!prevDetail) {
      return { canProceed: true, message: `Previous step (${prevStep.stepName}) not required` };
    }

    if (prevDetail.status !== 'accept') {
      return { 
        canProceed: false, 
        message: `Previous step (${prevStep.stepName}) must be accepted before proceeding.`,
        requiredSteps: [`${prevStep.stepName} (must be accepted)`]
      };
    }

    return { canProceed: true, message: `Previous step (${prevStep.stepName}) is accepted.` };
  } catch (error) {
    console.error('Error validating previous step:', error);
    return { canProceed: false, message: 'Error checking previous step' };
  }
};

/**
 * Get workflow status for a job
 */
export const getWorkflowStatus = async (nrcJobNo: string) => {
  const jobPlanning = await prisma.jobPlanning.findFirst({
    where: { nrcJobNo },
    include: {
      steps: {
        orderBy: { stepNo: 'asc' },
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

  return {
    nrcJobNo,
    steps: jobPlanning.steps.map(step => ({
      stepNo: step.stepNo,
      stepName: step.stepName,
      status: step.status,
      details: step.paperStore || step.printingDetails || step.corrugation || 
               step.flutelam || step.punching || step.sideFlapPasting || 
               step.qualityDept || step.dispatchProcess
    }))
  };
};

/**
 * Check if a job is ready for automatic completion
 * Criteria: All EXISTING steps must have status 'stop' and dispatch process must be 'accept'
 */
export const checkJobReadyForCompletion = async (nrcJobNo: string): Promise<{
  isReady: boolean;
  reason?: string;
  jobPlanning?: any;
}> => {
  try {
    // Get the job planning with all steps and their details
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
      return { isReady: false, reason: 'Job planning not found' };
    }

    // Check if all EXISTING steps have status 'stop'
    const allStepsStopped = jobPlanning.steps.every(step => step.status === 'stop');
    if (!allStepsStopped) {
      const stoppedSteps = jobPlanning.steps.filter(step => step.status === 'stop').length;
      const totalSteps = jobPlanning.steps.length;
      return { 
        isReady: false, 
        reason: `Not all steps are stopped. ${stoppedSteps}/${totalSteps} steps are stopped.` 
      };
    }

    // Check if dispatch process exists and is accepted
    const dispatchStep = jobPlanning.steps.find(step => 
      step.stepName === 'DispatchProcess' || step.dispatchProcess
    );

    if (!dispatchStep || !dispatchStep.dispatchProcess) {
      return { isReady: false, reason: 'Dispatch process not found' };
    }

    if (dispatchStep.dispatchProcess.status !== 'accept') {
      return { isReady: false, reason: 'Dispatch process not accepted' };
    }

    // All criteria met - job is ready for completion
    return { 
      isReady: true, 
      jobPlanning 
    };

  } catch (error) {
    console.error('Error checking job completion readiness:', error);
    return { isReady: false, reason: 'Error checking completion status' };
  }
};

/**
 * Automatically complete a job if it meets all completion criteria
 */
export const autoCompleteJobIfReady = async (nrcJobNo: string, userId?: string): Promise<{
  completed: boolean;
  reason?: string;
  completedJob?: any;
}> => {
  try {
    // Check if job is ready for completion
    const completionCheck = await checkJobReadyForCompletion(nrcJobNo);
    
    if (!completionCheck.isReady) {
      return { completed: false, reason: completionCheck.reason };
    }

    // Job is ready - proceed with completion
    const jobPlanning = completionCheck.jobPlanning;

    // Get job details
    const job = await prisma.job.findUnique({
      where: { nrcJobNo }
    });

    if (!job) {
      return { completed: false, reason: 'Job not found' };
    }

    // Get purchase order details - use the specific PO linked to this job planning
    let purchaseOrder = null;
    if (jobPlanning.purchaseOrderId) {
      purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: jobPlanning.purchaseOrderId }
      });
      if (purchaseOrder) {
        console.log(`✅ [autoCompleteJobIfReady] Using specific PO ID ${jobPlanning.purchaseOrderId} for job planning ${jobPlanning.jobPlanId}`);
      }
    }
    
    // Fallback to first PO if specific PO not found
    if (!purchaseOrder) {
      purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      });
      if (purchaseOrder) {
        console.log(`⚠️ [autoCompleteJobIfReady] Using first PO (fallback) for job ${nrcJobNo}`);
      }
    }

    // Calculate total duration
    const startDate = jobPlanning.steps.reduce((earliest: Date | null, step: any) => {
      if (step.startDate && (!earliest || step.startDate < earliest)) {
        return step.startDate;
      }
      return earliest;
    }, null);

    const endDate = jobPlanning.steps.reduce((latest: Date | null, step: any) => {
      if (step.endDate && (!latest || step.endDate > latest)) {
        return step.endDate;
      }
      return latest;
    }, null);

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
        purchaseOrderDetails: purchaseOrder ? JSON.parse(JSON.stringify(purchaseOrder)) : null,
        allSteps: jobPlanning.steps,
        allStepDetails: {
          paperStore: jobPlanning.steps.filter((s: any) => s.paperStore).map((s: any) => s.paperStore),
          printingDetails: jobPlanning.steps.filter((s: any) => s.printingDetails).map((s: any) => s.printingDetails),
          corrugation: jobPlanning.steps.filter((s: any) => s.corrugation).map((s: any) => s.corrugation),
          flutelam: jobPlanning.steps.filter((s: any) => s.flutelam).map((s: any) => s.flutelam),
          punching: jobPlanning.steps.filter((s: any) => s.punching).map((s: any) => s.punching),
          sideFlapPasting: jobPlanning.steps.filter((s: any) => s.sideFlapPasting).map((s: any) => s.sideFlapPasting),
          qualityDept: jobPlanning.steps.filter((s: any) => s.qualityDept).map((s: any) => s.qualityDept),
          dispatchProcess: jobPlanning.steps.filter((s: any) => s.dispatchProcess).map((s: any) => s.dispatchProcess)
        },
        completedBy: userId || 'system',
        totalDuration,
        remarks: 'Automatically completed by system',
        finalStatus: 'completed'
      }
    });

    // CRITICAL: Clean up all step-specific data BEFORE deleting JobSteps
    // JobStepMachine is automatically deleted via CASCADE on JobStep deletion
    // But step-specific tables (PaperStore, PrintingDetails, etc.) need manual deletion
    
    const stepIds = jobPlanning.steps.map((s: any) => s.id);
    
    // Delete all step-specific records for this job
    await Promise.all([
      prisma.paperStore.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.printingDetails.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.corrugation.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.fluteLaminateBoardConversion.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.punching.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.sideFlapPasting.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.qualityDept.deleteMany({ where: { jobStepId: { in: stepIds } } }),
      prisma.dispatchProcess.deleteMany({ where: { jobStepId: { in: stepIds } } })
    ]);
    
    console.log(`Cleaned up all step-specific data for ${stepIds.length} steps`);

    // Delete all JobStep records for this job planning (this will also delete JobStepMachine via CASCADE)
    await prisma.jobStep.deleteMany({ where: { jobPlanningId: jobPlanning.jobPlanId } });

    // Delete the JobPlanning record
    await prisma.jobPlanning.delete({ where: { jobPlanId: jobPlanning.jobPlanId } });

    // Update the Job record: set status to INACTIVE but preserve important dates
    await prisma.job.update({
      where: { nrcJobNo },
      data: {
        status: 'INACTIVE',
        // Don't clear these important dates - they are historical data
        // shadeCardApprovalDate: null,  // Keep the shade card approval date
        // artworkApprovedDate: null,    // Keep the artwork approval date  
        // artworkReceivedDate: null,    // Keep the artwork received date
        imageURL: null,  // Only clear the image URL as it's not historical data
        // Recalculate the shared card diff date to reflect current completion date
        sharedCardDiffDate: calculateSharedCardDiffDate(job.shadeCardApprovalDate)
      }
    });

    console.log(`Job ${nrcJobNo} automatically completed`);

    return { 
      completed: true, 
      completedJob 
    };

  } catch (error) {
    console.error('Error auto-completing job:', error);
    return { completed: false, reason: 'Error during auto-completion' };
  }
};