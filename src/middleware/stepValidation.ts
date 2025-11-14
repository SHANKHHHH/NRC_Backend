import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './index';

/**
 * Middleware to validate step transitions and prevent state inconsistencies
 * This prevents the frontend-backend sync issues by ensuring valid state transitions
 */
export const validateStepTransition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nrcJobNo } = req.params;
    const { status } = req.body;
    const jobPlanIdInput = (req.body?.jobPlanId ?? req.query?.jobPlanId) as string | number | undefined;
    const parsedJobPlanId = jobPlanIdInput !== undefined ? Number(jobPlanIdInput) : undefined;
    const jobPlanId = parsedJobPlanId !== undefined && !Number.isNaN(parsedJobPlanId) ? parsedJobPlanId : undefined;
    
    if (!nrcJobNo || !status) {
      return next(); // Skip validation if required params are missing
    }

    console.log(`🔍 [StepValidation] Validating step transition for job ${nrcJobNo} to status ${status}`);

    // Get current job planning steps using the same selection logic as job planning controller
    const { getJobPlanningData } = await import('../utils/jobPlanningSelector');
    const jobPlanning = await getJobPlanningData(nrcJobNo, jobPlanId);

    if (!jobPlanning) {
      throw new AppError('Job planning not found', 404);
    }

    // Check if user is paperstore - they can do any step without validation
    const userRole = req.user?.role;
    console.log(`🔍 [StepValidation] User role: ${userRole}, type: ${typeof userRole}`);
    if (userRole && userRole.includes('paperstore')) {
      console.log(`🔍 [StepValidation] Paperstore user - bypassing ALL step validation`);
      return next();
    }

    // Validate the step transition
    const validationResult = await validateStepTransitionLogic(jobPlanning.steps, status, req);
    
    if (!validationResult.isValid) {
      console.log(`❌ [StepValidation] Invalid transition: ${validationResult.reason || 'Unknown error'}`);
      throw new AppError(validationResult.reason || 'Invalid step transition', 400);
    }

    console.log(`✅ [StepValidation] Step transition validated successfully`);
    next();

  } catch (error) {
    console.error('❌ [StepValidation] Error during validation:', error);
    next(error);
  }
};

/**
 * Core logic for validating step transitions
 */
async function validateStepTransitionLogic(
  steps: any[], 
  newStatus: string, 
  req: Request
): Promise<{ isValid: boolean; reason?: string }> {
  
  // Get the step being updated from the request
  const stepNo = req.params.stepNo ? parseInt(req.params.stepNo) : null;
  const stepName = req.params.stepName || req.body.stepName;
  
  console.log(`🔍 [StepValidation] Looking for step: stepNo=${stepNo}, stepName=${stepName}`);
  
  if (!stepNo && !stepName) {
    console.log(`🔍 [StepValidation] No step info provided, skipping validation`);
    return { isValid: true }; // Can't validate without step info
  }

  // Find the step being updated
  const targetStep = steps.find(step => 
    (stepNo && step.stepNo === stepNo) || 
    (stepName && step.stepName === stepName)
  );

  console.log(`🔍 [StepValidation] Available steps:`, steps.map(s => ({ stepNo: s.stepNo, stepName: s.stepName, status: s.status })));
  console.log(`🔍 [StepValidation] Target step found:`, targetStep ? { stepNo: targetStep.stepNo, stepName: targetStep.stepName, status: targetStep.status } : 'NOT FOUND');

  if (!targetStep) {
    return { isValid: false, reason: 'Step not found in job planning' };
  }

  // Validate status transitions
  const currentStatus = targetStep.status;
  
  // Allow same status transitions (idempotent operations)
  if (currentStatus === newStatus) {
    return { isValid: true };
  }
  
  // Define valid status transitions
  const validTransitions: { [key: string]: string[] } = {
    'planned': ['start', 'stop'], // Can start or skip
    'start': ['stop'], // Can only complete
    'stop': [] // Cannot transition from completed
  };

  const allowedTransitions = validTransitions[currentStatus] || [];
  
  if (!allowedTransitions.includes(newStatus)) {
    return { 
      isValid: false, 
      reason: `Invalid transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.join(', ')}` 
    };
  }

  // Additional validation for specific statuses
  if (newStatus === 'start') {
    // For 'start' status, only check if previous steps are completed (except for parallel steps)
    // No need to validate completion data since we're just starting
    const validationResult = await validatePreviousStepsCompleted(steps, targetStep);
    if (!validationResult.isValid) {
      return validationResult;
    }
    // Allow start transition after previous steps validation
    return { isValid: true };
  }

  if (newStatus === 'stop') {
    // For high-demand jobs, be more lenient with completion validation
    const isHighDemand = await isJobHighDemand(req.params.nrcJobNo);
    
    if (isHighDemand) {
      // For high-demand jobs, only validate if completion data is actually provided
      const validationResult = await validateStepCompletionDataLenient(targetStep, req);
      if (!validationResult.isValid) {
        return validationResult;
      }
    } else {
      // For regular jobs, use strict validation as before
      const validationResult = await validateStepCompletionData(targetStep, req);
      if (!validationResult.isValid) {
        return validationResult;
      }
    }
  }

  return { isValid: true };
}

/**
 * Validate that previous steps are completed before starting a new step
 */
async function validatePreviousStepsCompleted(
  steps: any[], 
  targetStep: any
): Promise<{ isValid: boolean; reason?: string }> {
  
  const targetStepNo = targetStep.stepNo;
  
  // Define parallel step groups (steps that can run simultaneously)
  const parallelGroups = [
    ['PrintingDetails', 'Corrugation'], // Printing and Corrugation can run in parallel
  ];
  
  // Check if this step is part of a parallel group
  const parallelGroup = parallelGroups.find(group => 
    group.includes(targetStep.stepName)
  );
  
  if (parallelGroup) {
    // For parallel steps, only check non-parallel previous steps
    const nonParallelPreviousSteps = steps.filter(step => 
      step.stepNo < targetStepNo && 
      !parallelGroup.includes(step.stepName)
    );
    
    const incompleteSteps = nonParallelPreviousSteps.filter(step => step.status !== 'stop');
    if (incompleteSteps.length > 0) {
      return {
        isValid: false,
        reason: `Previous steps must be completed before starting ${targetStep.stepName}. Incomplete steps: ${incompleteSteps.map(s => s.stepName).join(', ')}`
      };
    }
  } else {
    // For sequential steps, check all previous steps
    const previousSteps = steps.filter(step => step.stepNo < targetStepNo);
    const incompleteSteps = previousSteps.filter(step => step.status !== 'stop');
    
    if (incompleteSteps.length > 0) {
      return {
        isValid: false,
        reason: `Previous steps must be completed before starting ${targetStep.stepName}. Incomplete steps: ${incompleteSteps.map(s => s.stepName).join(', ')}`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Validate that step has required data before completion (strict validation for regular jobs)
 */
async function validateStepCompletionData(
  step: any, 
  req: Request
): Promise<{ isValid: boolean; reason?: string }> {
  
  // Check if step has required completion data
  const requiredFields = getRequiredFieldsForStep(step.stepName);
  
  console.log(`🔍 [StepValidation] Strict validation for regular job ${step.stepName}, required fields: ${requiredFields.join(', ')}`);
  console.log(`🔍 [StepValidation] Request body:`, req.body);
  
  for (const field of requiredFields) {
    if (!req.body[field] || req.body[field] === '') {
      return {
        isValid: false,
        reason: `Required field '${field}' is missing for completing ${step.stepName} step`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Check if a job is high-demand
 */
async function isJobHighDemand(nrcJobNo: string): Promise<boolean> {
  try {
    const job = await prisma.job.findFirst({
      where: { nrcJobNo },
      select: { jobDemand: true }
    });
    return job?.jobDemand === 'high';
  } catch (error) {
    console.error('Error checking job demand:', error);
    return false;
  }
}

/**
 * Lenient validation for high-demand jobs - only validate if completion data is provided
 */
async function validateStepCompletionDataLenient(
  step: any, 
  req: Request
): Promise<{ isValid: boolean; reason?: string }> {
  
  // Check if step has required completion data
  const requiredFields = getRequiredFieldsForStep(step.stepName);
  
  console.log(`🔍 [StepValidation] Lenient validation for high-demand job ${step.stepName}, required fields: ${requiredFields.join(', ')}`);
  console.log(`🔍 [StepValidation] Request body:`, req.body);
  
  // Only validate if we have completion data in the request
  // If no completion data is provided, assume it's just a status update
  const hasCompletionData = requiredFields.some(field => req.body[field] !== undefined);
  
  if (!hasCompletionData) {
    console.log(`🔍 [StepValidation] No completion data provided for high-demand job, allowing status update`);
    return { isValid: true };
  }
  
  for (const field of requiredFields) {
    if (!req.body[field] || req.body[field] === '') {
      return {
        isValid: false,
        reason: `Required field '${field}' is missing for completing ${step.stepName} step`
      };
    }
  }
  
  return { isValid: true };
}

/**
 * Get required fields for each step type
 */
function getRequiredFieldsForStep(stepName: string): string[] {
  const requiredFields: { [key: string]: string[] } = {
    'PaperStore': ['quantity', 'size'],
    'PrintingDetails': ['quantity', 'oprName'],
    'Corrugation': ['quantity', 'oprName'],
    'FluteLaminateBoardConversion': ['quantity', 'oprName'],
    'Punching': ['quantity', 'oprName'],
    'Die Cutting': ['quantity', 'oprName'],
    'SideFlapPasting': ['quantity', 'oprName'],
    'QualityDept': ['passQuantity', 'checkedBy'],
    'DispatchProcess': ['noOfBoxes', 'dispatchNo']
  };
  
  return requiredFields[stepName] || [];
}

/**
 * Middleware to auto-correct common state inconsistencies
 */
export const autoCorrectStateInconsistencies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nrcJobNo } = req.params;
    
    if (!nrcJobNo) {
      return next();
    }

    console.log(`🔧 [AutoCorrect] Checking for state inconsistencies in job ${nrcJobNo}`);

    // Get job planning with steps
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          orderBy: { stepNo: 'asc' }
        }
      }
    });

    if (!jobPlanning) {
      return next();
    }

    // Check for and fix common inconsistencies
    await fixCommonInconsistencies(jobPlanning.steps, nrcJobNo);
    
    next();

  } catch (error) {
    console.error('❌ [AutoCorrect] Error during auto-correction:', error);
    next(error);
  }
};

/**
 * Fix common state inconsistencies
 */
async function fixCommonInconsistencies(steps: any[], nrcJobNo: string) {
  let fixesApplied = 0;

  for (const step of steps) {
    // Fix: If step has endDate but status is not 'stop', update status to 'stop'
    if (step.endDate && step.status !== 'stop') {
      console.log(`🔧 [AutoCorrect] Fixing step ${step.stepName}: has endDate but status is ${step.status}`);
      
      await prisma.jobStep.update({
        where: { id: step.id },
        data: { status: 'stop' }
      });
      
      fixesApplied++;
    }

    // Fix: If step status is 'start' but has no startDate, add startDate
    if (step.status === 'start' && !step.startDate) {
      console.log(`🔧 [AutoCorrect] Fixing step ${step.stepName}: status is start but no startDate`);
      
      await prisma.jobStep.update({
        where: { id: step.id },
        data: { startDate: new Date() }
      });
      
      fixesApplied++;
    }

    // Fix: If step status is 'stop' but has no endDate, add endDate
    if (step.status === 'stop' && !step.endDate) {
      console.log(`🔧 [AutoCorrect] Fixing step ${step.stepName}: status is stop but no endDate`);
      
      await prisma.jobStep.update({
        where: { id: step.id },
        data: { endDate: new Date() }
      });
      
      fixesApplied++;
    }
  }

  if (fixesApplied > 0) {
    console.log(`✅ [AutoCorrect] Applied ${fixesApplied} fixes to job ${nrcJobNo}`);
  }
}