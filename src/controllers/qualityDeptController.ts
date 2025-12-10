import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { validateWorkflowStep } from '../utils/workflowValidator';
import { checkJobStepMachineAccess, getFilteredJobStepIds } from '../middleware/machineAccess';
import { RoleManager } from '../utils/roleUtils';
import { calculateShift } from '../utils/autoPopulateFields';

export const createQualityDept = async (req: Request, res: Response) => {
  const { jobStepId, ...data } = req.body;
  if (!jobStepId) throw new AppError('jobStepId is required', 400);
  
  // Check machine access for quality dept
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (userId && userRole) {
    const hasAccess = await checkJobStepMachineAccess(userId, userRole, jobStepId);
    if (!hasAccess) {
      throw new AppError('Access denied: You do not have access to this quality department machine', 403);
    }
  }
  
  // Validate workflow - QualityDept requires both Corrugation and Printing to be accepted
  const workflowValidation = await validateWorkflowStep(jobStepId, 'QualityDept');
  if (!workflowValidation.canProceed) {
    throw new AppError(workflowValidation.message || 'Workflow validation failed', 400);
  }
  
  // Parse individual rejection reason quantities if provided
  const rejectionReasonAQty = data.rejectionReasonAQty || data['Rejection Reason A Qty'] ? parseInt(data.rejectionReasonAQty || data['Rejection Reason A Qty'] || '0') || 0 : null;
  const rejectionReasonBQty = data.rejectionReasonBQty || data['Rejection Reason B Qty'] ? parseInt(data.rejectionReasonBQty || data['Rejection Reason B Qty'] || '0') || 0 : null;
  const rejectionReasonCQty = data.rejectionReasonCQty || data['Rejection Reason C Qty'] ? parseInt(data.rejectionReasonCQty || data['Rejection Reason C Qty'] || '0') || 0 : null;
  const rejectionReasonDQty = data.rejectionReasonDQty || data['Rejection Reason D Qty'] ? parseInt(data.rejectionReasonDQty || data['Rejection Reason D Qty'] || '0') || 0 : null;
  const rejectionReasonEQty = data.rejectionReasonEQty || data['Rejection Reason E Qty'] ? parseInt(data.rejectionReasonEQty || data['Rejection Reason E Qty'] || '0') || 0 : null;
  const rejectionReasonFQty = data.rejectionReasonFQty || data['Rejection Reason F Qty'] ? parseInt(data.rejectionReasonFQty || data['Rejection Reason F Qty'] || '0') || 0 : null;
  const rejectionReasonOthersQty = data.rejectionReasonOthersQty || data['Rejection Reason Others Qty'] ? parseInt(data.rejectionReasonOthersQty || data['Rejection Reason Others Qty'] || '0') || 0 : null;
  
  // Calculate total rejectedQty as sum of all reason quantities if any are provided
  const hasReasonQuantities = rejectionReasonAQty !== null || rejectionReasonBQty !== null || rejectionReasonCQty !== null || 
                               rejectionReasonDQty !== null || rejectionReasonEQty !== null || rejectionReasonFQty !== null || rejectionReasonOthersQty !== null;
  
  if (hasReasonQuantities) {
    const calculatedRejectedQty = (rejectionReasonAQty || 0) + (rejectionReasonBQty || 0) + (rejectionReasonCQty || 0) + 
                                   (rejectionReasonDQty || 0) + (rejectionReasonEQty || 0) + (rejectionReasonFQty || 0) + (rejectionReasonOthersQty || 0);
    data.rejectedQty = calculatedRejectedQty > 0 ? calculatedRejectedQty : data.rejectedQty;
    data.rejectionReasonAQty = rejectionReasonAQty !== null && rejectionReasonAQty > 0 ? rejectionReasonAQty : null;
    data.rejectionReasonBQty = rejectionReasonBQty !== null && rejectionReasonBQty > 0 ? rejectionReasonBQty : null;
    data.rejectionReasonCQty = rejectionReasonCQty !== null && rejectionReasonCQty > 0 ? rejectionReasonCQty : null;
    data.rejectionReasonDQty = rejectionReasonDQty !== null && rejectionReasonDQty > 0 ? rejectionReasonDQty : null;
    data.rejectionReasonEQty = rejectionReasonEQty !== null && rejectionReasonEQty > 0 ? rejectionReasonEQty : null;
    data.rejectionReasonFQty = rejectionReasonFQty !== null && rejectionReasonFQty > 0 ? rejectionReasonFQty : null;
    data.rejectionReasonOthersQty = rejectionReasonOthersQty !== null && rejectionReasonOthersQty > 0 ? rejectionReasonOthersQty : null;
  }
  
  // Set startedBy if user is creating the record (they become the owner)
  const qualityDept = await prisma.qualityDept.create({ 
    data: { 
      ...data, 
      jobStepId,
      startedBy: userId || null
    } 
  });
  await prisma.jobStep.update({ where: { id: jobStepId }, data: { qualityDept: { connect: { id: qualityDept.id } } } });

  // Log QualityDept step creation
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
      `Created QualityDept step for jobStepId: ${jobStepId}`,
      'QualityDept',
      qualityDept.id.toString(),
      jobStep?.jobPlanning?.nrcJobNo
    );
  }
  res.status(201).json({ success: true, data: qualityDept, message: 'QualityDept step created' });
};

export const getQualityDeptById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const qualityDept = await prisma.qualityDept.findUnique({ where: { id: Number(id) } });
  if (!qualityDept) throw new AppError('QualityDept not found', 404);
  res.status(200).json({ success: true, data: qualityDept });
};

export const getQualityDeptByJobStepId = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  
  try {
    // Get job step with quality dept details using jobStepId as unique identifier
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: {
            nrcJobNo: true,
            jobDemand: true
          }
        },
        qualityDept: true
      }
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    if (jobStep.stepName !== 'QualityDept') {
      throw new AppError(`Job step ${jobStepId} is not a quality dept step`, 400);
    }

    // Format response with jobStepId as unique identifier
    const response = {
      jobStepId: jobStep.id,
      stepName: jobStep.stepName,
      status: jobStep.status,
      user: jobStep.user,
      startDate: jobStep.startDate,
      endDate: jobStep.endDate,
      createdAt: jobStep.createdAt,
      updatedAt: jobStep.updatedAt,
      machineDetails: jobStep.machineDetails,
      jobPlanning: jobStep.jobPlanning,
      qualityDept: jobStep.qualityDept
    };

    res.status(200).json({ 
      success: true, 
      data: response,
      message: `Found quality dept job step using jobStepId: ${jobStepId}`
    });
  } catch (error) {
    console.error(`Error fetching quality dept details for jobStepId ${jobStepId}:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to fetch quality dept details', 500);
  }
};

export const getAllQualityDepts = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware
  const userRole = req.user?.role || '';
  const userId = req.user?.userId;
  
  // Get accessible job numbers based on user's machine access
  const { getFilteredJobNumbers } = await import('../middleware/machineAccess');
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
  
  // Filter logic: Show jobs that are either:
  // 1. Not started by anyone (startedBy is null) - available to all QC executives
  // 2. Started by the current user (startedBy === userId) - only visible to that user
  const whereClause: any = {
    jobNrcJobNo: { in: accessibleJobNumbers },
    OR: [
      { startedBy: null },           // Not started - available to all
      { startedBy: userId }           // Started by current user
    ]
  };
  
  // Get all QualityDept records for accessible jobs with filtering
  const qualityDepts = await prisma.qualityDept.findMany({
    where: whereClause,
    include: {
      job: {
        select: {
          id: true,
          nrcJobNo: true,
          customerName: true,
          styleItemSKU: true,
          status: true,
          latestRate: true,
          length: true,
          width: true,
          height: true,
          boxDimensions: true,
          boardSize: true,
          noUps: true,
          fluteType: true,
          jobDemand: true
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
  
  qualityDepts.forEach((qd, index) => {
    if (!jobsMap.has(qd.jobNrcJobNo)) {
      jobsMap.set(qd.jobNrcJobNo, {
        nrcJobNo: qd.jobNrcJobNo,
        jobDetails: qd.job,
        qualityDetails: []
      });
    }
    
    // Add quality details to the job
    jobsMap.get(qd.jobNrcJobNo).qualityDetails.push({
      idx: index + 1,
      id: qd.id,
      date: qd.date,
      shift: qd.shift,
      operatorName: qd.operatorName,
      checkedBy: qd.checkedBy,
      remarks: qd.remarks,
      qcCheckSignBy: qd.qcCheckSignBy,
      status: qd.status,
      jobStepId: qd.jobStepId,
      qcCheckAt: qd.qcCheckAt,
      quantity: qd.quantity,
      rejectedQty: qd.rejectedQty,
      reasonForRejection: qd.reasonForRejection,
      stepDetails: qd.jobStep
    });
  });
  
  const formattedData = Array.from(jobsMap.values());
  
  res.status(200).json({ 
    success: true, 
    count: formattedData.length, 
    data: formattedData 
  });
};

export const getQualityDeptByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { jobPlanId } = req.query;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const jobPlanIdNumber = jobPlanId !== undefined ? Number(jobPlanId) : undefined;
  const userId = req.user?.userId;

  // Filter logic: Show jobs that are either:
  // 1. Not started by anyone (startedBy is null) - available to all QC executives
  // 2. Started by the current user (startedBy === userId) - only visible to that user
  const whereClause: any = {
    jobNrcJobNo: decodedNrcJobNo,
    OR: [
      { startedBy: null },           // Not started - available to all
      { startedBy: userId }           // Started by current user
    ],
    ...(jobPlanIdNumber !== undefined && !Number.isNaN(jobPlanIdNumber)
      ? {
          jobStep: {
            is: {
              jobPlanningId: jobPlanIdNumber,
            },
          },
        }
      : {}),
  };

  const qualityDepts = await prisma.qualityDept.findMany({
    where: whereClause,
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
  
  // Add editability information for each quality dept record
  const { wrapWithEditability } = await import('../utils/fieldEditability');
  const dataWithEditability = qualityDepts.map(qd =>
    wrapWithEditability({
      ...qd,
      jobStepId: qd.jobStepId ?? qd.jobStep?.id,
      jobPlanningId: qd.jobStep?.jobPlanningId ?? null,
    })
  );
  
  res.status(200).json({ success: true, data: dataWithEditability });
};



// Start QualityDept work (with previous step validation)
export const startQualityWork = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the JobStep for QualityDept
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: decodedNrcJobNo
        },
        stepName: 'QualityDept'
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
      throw new AppError('QualityDept job step not found', 404);
    }

    // VALIDATION: Check if previous step is started (allows parallel work)
    const allSteps = jobStep.jobPlanning.steps;
    const currentStepIndex = allSteps.findIndex(s => s.id === jobStep.id);
    
    if (currentStepIndex > 0) {
      const previousStep = allSteps[currentStepIndex - 1];
      
      // For START: Previous step must be started (status = 'start' or 'stop')
      // This allows parallel work - Quality can start while previous step is in progress
      if (previousStep.status !== 'start' && previousStep.status !== 'stop') {
        throw new AppError(
          `Previous step (${previousStep.stepName}) must be started before starting Quality work. Current status: ${previousStep.status}`,
          400
        );
      }
      
    }

    // Get current user ID
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User ID not found', 401);
    }

    // Find or create QualityDept record
    let qualityDept = await prisma.qualityDept.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo }
    });

    if (!qualityDept) {
      // Create new QualityDept record and mark as started by this user
      qualityDept = await prisma.qualityDept.create({
        data: {
          jobNrcJobNo: decodedNrcJobNo,
          jobStepId: jobStep.id,
          status: 'in_progress',
          startedBy: userId
        }
      });
    } else {
      // If already started by someone else, don't allow another user to take it
      if (qualityDept.startedBy && qualityDept.startedBy !== userId) {
        throw new AppError('This QC job is already being handled by another QC executive', 403);
      }
      
      // Update existing record to in_progress and set startedBy if not set
      qualityDept = await prisma.qualityDept.update({
        where: { id: qualityDept.id },
        data: { 
          status: 'in_progress',
          startedBy: qualityDept.startedBy || userId
        }
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
        `Started Quality work for job: ${decodedNrcJobNo}`,
        'QualityDept',
        decodedNrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: qualityDept,
      message: 'Quality work started successfully',
    });
  } catch (error: unknown) {
    console.error('Start Quality work error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Hold QualityDept work
export const holdQualityDept = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const { holdRemark } = req.body;
  
  try {
    // Find the QualityDept record
    const existingQualityDept = await prisma.qualityDept.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingQualityDept) {
      throw new AppError('QualityDept record not found', 404);
    }

    // Update status to hold
    const updatedQualityDept = await prisma.qualityDept.update({
      where: { id: existingQualityDept.id },
      data: {
        status: 'hold',
        remarks: holdRemark || 'Work on hold'
      },
    });

    // Also update JobStep status
    if (existingQualityDept.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingQualityDept.jobStepId },
        data: { status: 'start' } // Keep JobStep as 'start' when individual step is on hold
      });
    }

    res.status(200).json({
      success: true,
      data: updatedQualityDept,
      message: 'QualityDept work held successfully',
    });
  } catch (error: unknown) {
    console.error('Hold QualityDept error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

// Resume QualityDept work
export const resumeQualityDept = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  try {
    // Find the QualityDept record
    const existingQualityDept = await prisma.qualityDept.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingQualityDept) {
      throw new AppError('QualityDept record not found', 404);
    }

    // Update status to in_progress
    const updatedQualityDept = await prisma.qualityDept.update({
      where: { id: existingQualityDept.id },
      data: {
        status: 'in_progress',
      },
    });

    // Also update JobStep status
    if (existingQualityDept.jobStepId) {
      await prisma.jobStep.update({
        where: { id: existingQualityDept.jobStepId },
        data: { status: 'start' }
      });
    }

    res.status(200).json({
      success: true,
      data: updatedQualityDept,
      message: 'QualityDept work resumed successfully',
    });
  } catch (error: unknown) {
    console.error('Resume QualityDept error:', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

export const updateQualityDept = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  const userRole = req.user?.role;
  
  // Debug: Log incoming rejection reason data
  console.log('🔍 [updateQualityDept] req.body rejection reason fields:', {
    rejectionReasonAQty: req.body.rejectionReasonAQty,
    'Rejection Reason A Qty': req.body['Rejection Reason A Qty'],
    rejectionReasonBQty: req.body.rejectionReasonBQty,
    'Rejection Reason B Qty': req.body['Rejection Reason B Qty'],
    allKeys: Object.keys(req.body).filter(k => k.toLowerCase().includes('rejection') || k.toLowerCase().includes('reason'))
  });
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
    // Step 1: Find the existing QualityDept record using jobNrcJobNo
    const existingQualityDept = await prisma.qualityDept.findFirst({
      where: { jobNrcJobNo: decodedNrcJobNo },
    });

    if (!existingQualityDept) {
      throw new AppError('QualityDept record not found', 404);
    }

    // Enforce high-demand bypass or machine access
    const jobStep = await prisma.jobStep.findFirst({
      where: { qualityDept: { id: existingQualityDept.id } },
      select: { id: true, stepName: true }
    });
    
    if (req.user?.userId && req.user?.role && jobStep) {
      const { checkJobStepMachineAccess, allowHighDemandBypass } = await import('../middleware/machineAccess');
      const bypass = await allowHighDemandBypass(req.user.role, jobStep.stepName, decodedNrcJobNo);
      if (!bypass) {
        const hasAccess = await checkJobStepMachineAccess(req.user.userId, req.user.role, jobStep.id);
        if (!hasAccess) {
          throw new AppError('Access denied: You do not have access to machines for this step', 403);
        }
      }
    }

    // Parse individual rejection reason quantities BEFORE filtering (always allow these to be updated)
    // Simple parsing: if value exists and is a valid number, use it (including 0)
    const parseRejectionQty = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      const strValue = value.toString().trim();
      if (strValue === '') return null;
      const parsed = parseInt(strValue, 10);
      return isNaN(parsed) ? null : parsed;
    };
    
    const rawA = req.body.rejectionReasonAQty || req.body['Rejection Reason A Qty'];
    const rawB = req.body.rejectionReasonBQty || req.body['Rejection Reason B Qty'];
    const rawC = req.body.rejectionReasonCQty || req.body['Rejection Reason C Qty'];
    const rawD = req.body.rejectionReasonDQty || req.body['Rejection Reason D Qty'];
    const rawE = req.body.rejectionReasonEQty || req.body['Rejection Reason E Qty'];
    const rawF = req.body.rejectionReasonFQty || req.body['Rejection Reason F Qty'];
    const rawOthers = req.body.rejectionReasonOthersQty || req.body['Rejection Reason Others Qty'];
    
    console.log('🔍 [updateQualityDept] Raw rejection reason values from req.body:', { 
      rawA, rawB, rawC, rawD, rawE, rawF, rawOthers,
      allRejectionKeys: Object.keys(req.body).filter(k => k.toLowerCase().includes('rejection') || k.toLowerCase().includes('reason'))
    });
    
    const rejectionReasonAQty = parseRejectionQty(rawA);
    const rejectionReasonBQty = parseRejectionQty(rawB);
    const rejectionReasonCQty = parseRejectionQty(rawC);
    const rejectionReasonDQty = parseRejectionQty(rawD);
    const rejectionReasonEQty = parseRejectionQty(rawE);
    const rejectionReasonFQty = parseRejectionQty(rawF);
    const rejectionReasonOthersQty = parseRejectionQty(rawOthers);
    
    console.log('🔍 [updateQualityDept] Parsed rejection reason values:', { 
      rejectionReasonAQty, rejectionReasonBQty, rejectionReasonCQty, 
      rejectionReasonDQty, rejectionReasonEQty, rejectionReasonFQty, rejectionReasonOthersQty 
    });
    
    // Calculate total rejectedQty as sum of all reason quantities
    const sum = (rejectionReasonAQty ?? 0) + (rejectionReasonBQty ?? 0) + (rejectionReasonCQty ?? 0) + 
                (rejectionReasonDQty ?? 0) + (rejectionReasonEQty ?? 0) + (rejectionReasonFQty ?? 0) + (rejectionReasonOthersQty ?? 0);
    
    // Always set rejection reason fields if any are provided (even if sum is 0)
    const hasAnyRejectionReason = rejectionReasonAQty !== null || rejectionReasonBQty !== null || rejectionReasonCQty !== null || 
                                   rejectionReasonDQty !== null || rejectionReasonEQty !== null || rejectionReasonFQty !== null || rejectionReasonOthersQty !== null;
    
    if (hasAnyRejectionReason) {
      // Update rejectedQty only if sum > 0, otherwise keep existing or use provided value
      if (sum > 0) {
        req.body.rejectedQty = sum;
      }
      // Always set rejection reason fields (even if null or 0)
      req.body.rejectionReasonAQty = rejectionReasonAQty;
      req.body.rejectionReasonBQty = rejectionReasonBQty;
      req.body.rejectionReasonCQty = rejectionReasonCQty;
      req.body.rejectionReasonDQty = rejectionReasonDQty;
      req.body.rejectionReasonEQty = rejectionReasonEQty;
      req.body.rejectionReasonFQty = rejectionReasonFQty;
      req.body.rejectionReasonOthersQty = rejectionReasonOthersQty;
      
      console.log('🔍 [updateQualityDept] Setting req.body with rejection reason fields:', {
        rejectedQty: req.body.rejectedQty,
        rejectionReasonAQty: req.body.rejectionReasonAQty,
        rejectionReasonBQty: req.body.rejectionReasonBQty,
        rejectionReasonCQty: req.body.rejectionReasonCQty,
        rejectionReasonDQty: req.body.rejectionReasonDQty,
        rejectionReasonEQty: req.body.rejectionReasonEQty,
        rejectionReasonFQty: req.body.rejectionReasonFQty,
        rejectionReasonOthersQty: req.body.rejectionReasonOthersQty,
      });
    }

    // Filter out non-editable fields (fields that already have data)
    // Always allow rejection reason fields to be editable
    const { filterEditableFields } = await import('../utils/fieldEditability');
    const editableData = filterEditableFields(
      existingQualityDept, 
      req.body,
      ['status', 'remarks', 'qcCheckSignBy', 'qcCheckAt', 'rejectionReasonAQty', 'rejectionReasonBQty', 'rejectionReasonCQty', 'rejectionReasonDQty', 'rejectionReasonEQty', 'rejectionReasonFQty', 'rejectionReasonOthersQty', 'rejectedQty']
    );

    // Auto-populate common step fields (date, shift, operator)
    const { autoPopulateStepFields } = await import('../utils/autoPopulateFields');
    const populatedData = jobStep 
      ? await autoPopulateStepFields(editableData, jobStep.id, req.user?.userId, decodedNrcJobNo)
      : editableData;

    // Step 2: Update using its unique id
    const qualityDept = await prisma.qualityDept.update({
      where: { id: existingQualityDept.id },
      data: populatedData,
    });

    // Optional Logging
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBSTEP_UPDATED,
        `Updated QualityDept step with jobNrcJobNo: ${decodedNrcJobNo}`,
        'QualityDept',
        nrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: qualityDept,
      message: 'QualityDept updated',
    });

  } catch (error: unknown) {
    console.error('Update QualityDept error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
    } else {
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};


export const deleteQualityDept = async (req: Request, res: Response) => {
  const { id } = req.params;
  await prisma.qualityDept.delete({ where: { id: Number(id) } });

  // Log QualityDept step deletion
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_DELETED,
      `Deleted QualityDept step with id: ${id}`,
      'QualityDept',
      id
    );
  }
  res.status(200).json({ success: true, message: 'QualityDept deleted' });
};

export const updateQualityDeptStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const { status, remarks } = req.body;
  
  // Validate status
  if (!['reject', 'accept', 'hold', 'in_progress'].includes(status)) {
    throw new AppError('Invalid status. Must be one of: reject, accept, hold, in_progress', 400);
  }
  
  // Find the QualityDept by jobNrcJobNo
  const existing = await prisma.qualityDept.findFirst({
    where: { jobNrcJobNo: nrcJobNo },
  });
  
  if (!existing) {
    return res.status(404).json({ success: false, message: 'QualityDept not found' });
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
  const updated = await prisma.qualityDept.update({
    where: { id: existing.id },
    data: updateData,
  });
  
  // Log action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOBSTEP_UPDATED,
      `Updated QualityDept status to ${status} for jobNrcJobNo: ${nrcJobNo}${remarks ? ` with remarks: ${remarks}` : ''}`,
      'QualityDept',
      nrcJobNo
    );
  }
  
  res.status(200).json({ success: true, data: updated, message: 'QualityDept status updated' });
}; 