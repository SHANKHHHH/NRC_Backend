import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

/**
 * Workflow validation utility for manufacturing steps
 * Handles the case where Corrugation and Printing can run in parallel
 * but both must be accepted before proceeding to next steps
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

  // Special workflow rules for steps that require both Corrugation and Printing
  const stepsRequiringBothCorrugationAndPrinting = [
    'Punching',
    'SideFlapPasting',
    'QualityDept',
    'DispatchProcess'
  ];

  if (stepsRequiringBothCorrugationAndPrinting.includes(currentStepName)) {
    return await validateBothCorrugationAndPrintingAccepted(jobStep.jobPlanning.nrcJobNo);
  }

  // For other steps, check if the previous step is accepted
  const prevStep = steps[currentStepIndex - 1];
  return await validatePreviousStepAccepted(prevStep);
};

/**
 * Validate that both Corrugation and Printing steps are accepted
 */
export const validateBothCorrugationAndPrintingAccepted = async (
  nrcJobNo: string
): Promise<WorkflowValidationResult> => {
  // Check if both Corrugation and Printing exist and are accepted
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

  // Check Corrugation
  if (!corrugation) {
    requiredSteps.push('Corrugation');
    canProceed = false;
    message += 'Corrugation step must be completed. ';
  } else if (corrugation.status !== 'accept') {
    requiredSteps.push('Corrugation (must be accepted)');
    canProceed = false;
    message += 'Corrugation step must be accepted. ';
  }

  // Check Printing
  if (!printing) {
    requiredSteps.push('PrintingDetails');
    canProceed = false;
    message += 'Printing step must be completed. ';
  } else if (printing.status !== 'accept') {
    requiredSteps.push('PrintingDetails (must be accepted)');
    canProceed = false;
    message += 'Printing step must be accepted. ';
  }

  if (canProceed) {
    message = 'Both Corrugation and Printing steps are accepted.';
  }

  return {
    canProceed,
    message: message.trim(),
    requiredSteps: requiredSteps.length > 0 ? requiredSteps : undefined
  };
};

/**
 * Validate that the previous step is accepted
 */
export const validatePreviousStepAccepted = async (
  prevStep: WorkflowStep
): Promise<WorkflowValidationResult> => {
  let prevDetail: any = null;

  // Get the previous step details based on step name
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
    return {
      canProceed: false,
      message: `Previous step (${prevStep.stepName}) must be completed first.`,
      requiredSteps: [prevStep.stepName]
    };
  }

  if (prevDetail.status !== 'accept') {
    return {
      canProceed: false,
      message: `Previous step (${prevStep.stepName}) must be accepted before proceeding.`,
      requiredSteps: [`${prevStep.stepName} (must be accepted)`]
    };
  }

  return {
    canProceed: true,
    message: `Previous step (${prevStep.stepName}) is accepted.`
  };
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