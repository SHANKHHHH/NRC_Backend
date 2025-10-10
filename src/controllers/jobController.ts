import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { getFilteredJobNumbers } from '../middleware/machineAccess';
import { calculateSharedCardDiffDate } from '../utils/dateUtils';
import { RoleManager } from '../utils/roleUtils';



export const createJob = async (req: Request, res: Response) => {
  // Authorization Check - Now supports multiple roles
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformPlannerAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin or planner', 403);
  }

  const { nrcJobNo, styleItemSKU, customerName, imageURL, ...rest } = req.body; //datasets

  if (!styleItemSKU || !customerName) {
    throw new AppError('Style Item SKU and Customer Name are required', 400);
  }

  // Optional: Validate imageURL if present
  if (imageURL && typeof imageURL !== 'string') {
    throw new AppError('imageURL must be a string', 400);
  }

  // Always generate nrcJobNo (ignore if provided in request)
  // Get first 3 letters of customer name (uppercase, remove spaces)
  const customerPrefix = customerName.replace(/\s+/g, '').substring(0, 3).toUpperCase();

  // Get current year and month
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // Last 2 digits
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month with leading zero

  // Collision-safe generator: find highest existing serial for this prefix and retry if needed
  const prefix = `${customerPrefix}${year}-${month}-`; // e.g., SAK24-09-
  let generatedNrcJobNo = '';
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    // Find current highest serial for this prefix
    const highest = await prisma.job.findFirst({
      where: { nrcJobNo: { startsWith: prefix } },
      select: { nrcJobNo: true },
      orderBy: { nrcJobNo: 'desc' }
    });

    let nextSerial = 1;
    if (highest?.nrcJobNo) {
      const parts = highest.nrcJobNo.split('-');
      const last = parts[parts.length - 1];
      const num = parseInt(last, 10);
      if (!isNaN(num)) nextSerial = num + 1;
    }
    const serialString = nextSerial.toString().padStart(2, '0');
    generatedNrcJobNo = `${prefix}${serialString}`; // e.g., SAK24-09-01

    try {
      // Attempt creation with this generated number
      const job = await prisma.job.create({
        data: {
          nrcJobNo: generatedNrcJobNo,
          styleItemSKU,
          customerName,
          imageURL: imageURL || null,
          sharedCardDiffDate: calculateSharedCardDiffDate(rest.shadeCardApprovalDate),
          ...rest,
        },
      });

      // Log the job creation action
      if (req.user?.userId) {
        await logUserActionWithResource(
          req.user.userId,
          ActionTypes.JOB_CREATED,
          JSON.stringify({
            message: 'Job created',
            jobNo: generatedNrcJobNo,
            customerName,
            styleItemSKU
          }),
          'Job',
          generatedNrcJobNo
        );
      }

      return res.status(201).json({
        success: true,
        data: job,
        message: 'Job created successfully',
      });
    } catch (error: any) {
      // Prisma unique constraint error code P2002
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        if (attempts < maxAttempts) {
          // Retry with next serial
          continue;
        }
        throw new AppError('Failed to generate unique job number. Please retry.', 409);
      }
      throw error;
    }
  }

  // Fallback (should not reach here)
  throw new AppError('Unexpected error generating job number', 500);
};


//get all jobs
export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const userMachineIds = req.userMachineIds; // From middleware
    
    // Get pagination parameters from query (opt-in - only paginate if page param is provided)
    const page = req.query.page ? parseInt(req.query.page as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
    const isPaginated = page !== undefined;
    const skip = isPaginated ? (page - 1) * limit : 0;
    
    // Get job numbers that are accessible to the user based on machine assignments
    const userRole = req.user?.role || '';
    const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
    
    // Paginate the accessible job numbers only if pagination is requested
    const jobNumbers = isPaginated 
      ? accessibleJobNumbers.slice(skip, skip + limit)
      : accessibleJobNumbers;
    
    const jobs = await prisma.job.findMany({
      where: {
        nrcJobNo: { in: jobNumbers }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        // Include all relations to get actual data instead of empty arrays
        purchaseOrders: true,
        paperStores: true,
        printingDetails: true,
        corrugations: true,
        fluteLaminateBoardConversions: true,
        punchings: true,
        sideFlapPastings: true,
        qualityDepts: true,
        dispatchProcesses: true,
        artworks: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        machine: {
          select: {
            id: true,
            description: true,
            status: true
          }
        }
      }
    });

    // Get unified role-based job data
    const { UnifiedJobDataHelper } = await import('../utils/unifiedJobDataHelper');
    const safeJobs = await UnifiedJobDataHelper.getRoleBasedJobData(userMachineIds || null, userRole);
    
    // Filter safe jobs to match the job numbers (paginated or all)
    const filteredSafeJobs = safeJobs.filter(job => jobNumbers.includes(job.nrcJobNo));
    
    // Build response
    const response: any = {
      success: true,
      count: filteredSafeJobs.length,
      data: filteredSafeJobs
    };
    
    // Only include pagination metadata if pagination was requested
    if (isPaginated && page !== undefined) {
      const totalJobs = accessibleJobNumbers.length;
      const totalPages = Math.ceil(totalJobs / limit);
      
      response.pagination = {
        currentPage: page,
        totalPages: totalPages,
        totalJobs: totalJobs,
        jobsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      };
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    
    // Handle the specific Prisma error
    if (error instanceof Error && error.message.includes('type \'Null\' is not a subtype of type \'List<dynamic>\'')) {
      res.status(500).json({
        success: false,
        message: 'Failed to load jobs: Database schema mismatch detected. Please contact administrator.',
        error: 'SCHEMA_MISMATCH'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to load jobs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};


export const getJobByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  
  const job = await prisma.job.findUnique({
    where: { nrcJobNo },
    include: {
      purchaseOrders: {
        select: {
          id: true,
          customer: true,
          style: true,
          plant: true,
          unit: true,
          totalPOQuantity: true,
          status: true,
          shadeCardApprovalDate: true,
          sharedCardDiffDate: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      ...job,
      hasPurchaseOrders: job.purchaseOrders.length > 0,
      noOfSheets: job.noOfSheets || 0, // Include noOfSheets in response
    },
  });
};

// New function: Get job details with comprehensive PO details
export const getJobWithPODetails = async (req: Request, res: Response) => {
  // Authorization Check - Admin, Planner, and other production roles
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformProductionAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin, planner, or production_head', 403);
  }

  const { nrcJobNo } = req.params;
  
  try {
    const job = await prisma.job.findUnique({
      where: { nrcJobNo },
      include: {
        purchaseOrders: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!job) {
      throw new AppError('Job not found with that NRC Job No', 404);
    }

    // Fetch all job plannings for this job (now PO-specific)
    const jobPlannings = await prisma.jobPlanning.findMany({
      where: { nrcJobNo },
      include: {
        steps: {
          orderBy: {
            stepNo: 'asc'
          }
        }
      }
    });


    // Create PO-specific job plannings using the new schema
    const poJobPlannings = [];
    
    for (const po of job.purchaseOrders) {
      // Find job planning for this specific PO
      const poJobPlanning = jobPlannings.find((jp: any) => jp.purchaseOrderId === po.id);
      
      // Check if this PO has any machine assignments
      const poMachines = await prisma.purchaseOrderMachine.findMany({
        where: { purchaseOrderId: po.id },
        select: { machineId: true }
      });
      
      const poMachineIds = poMachines.map(pom => pom.machineId);
      
      if (poJobPlanning) {
        // PO has job planning
        poJobPlannings.push({
          poId: po.id,
          poNumber: po.poNumber,
          poQuantity: po.totalPOQuantity,
          poStatus: po.status,
          poDate: po.poDate,
          hasJobPlanning: true,
          jobPlanId: poJobPlanning.jobPlanId,
          steps: poJobPlanning.steps || [],
          assignedMachines: poMachineIds,
          completedSteps: (poJobPlanning.steps || []).filter((step: any) => step.status === 'stop').length,
          totalSteps: (poJobPlanning.steps || []).length,
          createdAt: poJobPlanning.createdAt,
          updatedAt: poJobPlanning.updatedAt
        });
      } else {
        // PO has no job planning
        poJobPlannings.push({
          poId: po.id,
          poNumber: po.poNumber,
          poQuantity: po.totalPOQuantity,
          poStatus: po.status,
          poDate: po.poDate,
          hasJobPlanning: false,
          jobPlanId: null,
          steps: [],
          assignedMachines: poMachineIds,
          completedSteps: 0,
          totalSteps: 0,
          createdAt: null,
          updatedAt: null
        });
      }
    }

    // Format the response with job details and PO-specific plannings
    const response = {
      // Job details
      nrcJobNo: job.nrcJobNo,
      styleItemSKU: job.styleItemSKU,
      customerName: job.customerName,
      fluteType: job.fluteType,
      status: job.status,
      latestRate: job.latestRate,
      preRate: job.preRate,
      length: job.length,
      width: job.width,
      height: job.height,
      boxDimensions: job.boxDimensions,
      diePunchCode: job.diePunchCode,
      boardCategory: job.boardCategory,
      noOfColor: job.noOfColor,
      processColors: job.processColors,
      specialColor1: job.specialColor1,
      specialColor2: job.specialColor2,
      specialColor3: job.specialColor3,
      specialColor4: job.specialColor4,
      overPrintFinishing: job.overPrintFinishing,
      topFaceGSM: job.topFaceGSM,
      flutingGSM: job.flutingGSM,
      bottomLinerGSM: job.bottomLinerGSM,
      decalBoardX: job.decalBoardX,
      lengthBoardY: job.lengthBoardY,
      boardSize: job.boardSize,
      noUps: job.noUps,
      artworkReceivedDate: job.artworkReceivedDate,
      artworkApprovedDate: job.artworkApprovedDate,
      shadeCardApprovalDate: job.shadeCardApprovalDate,
      sharedCardDiffDate: job.sharedCardDiffDate,
      srNo: job.srNo,
      jobDemand: job.jobDemand,
      imageURL: job.imageURL,
      noOfSheets: job.noOfSheets,
      isMachineDetailsFilled: job.isMachineDetailsFilled,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      userId: job.userId,
      machineId: job.machineId,
      clientId: job.clientId,
      styleId: job.styleId,
      
      // PO-specific job plannings
      poJobPlannings: poJobPlannings,
      
      // All purchase orders
      hasPurchaseOrders: job.purchaseOrders.length > 0,
      purchaseOrders: job.purchaseOrders,
      
      // Summary statistics
      totalPOs: job.purchaseOrders.length,
      totalJobPlannings: jobPlannings.length,
      completedJobPlannings: poJobPlannings.filter(po => po.hasJobPlanning).length
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching job with PO details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


export const updateJobByNrcJobNo = async (req: Request, res: Response) => {

  const { nrcJobNo } = req.params;
  const { imageURL, ...rest } = req.body;

  // Optional: Validate imageURL if present
  if (imageURL && typeof imageURL !== 'string') {
    throw new AppError('imageURL must be a string', 400);
  }

  try {
    // First check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { nrcJobNo }
    });

    if (!existingJob) {
      throw new AppError('Job not found with that NRC Job No', 404);
    }

    // Now update the job
    const job = await prisma.job.update({
      where: { nrcJobNo },
      data: {
        ...rest,
        ...(imageURL !== undefined ? { imageURL } : {}),
        sharedCardDiffDate: calculateSharedCardDiffDate(rest.shadeCardApprovalDate),
      },
    });

    // Log the job update action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOB_UPDATED,
        JSON.stringify({
          message: 'Job updated',
          jobNo: nrcJobNo,
          updatedFields: Object.keys(req.body)
        }),
        'Job',
        nrcJobNo
      );
    }

    res.status(200).json({
      success: true,
      data: job,
      message: 'Job updated successfully',
    });
  } catch (error) {
    // If it's already an AppError, re-throw it
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle Prisma errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      throw new AppError('Job not found with that NRC Job No', 404);
    }
    
    // Log unexpected errors
    console.error('Error updating job:', error);
    throw new AppError('Failed to update job', 500);
  }
};

export const recalculateSharedCardDiffDate = async (req: Request, res: Response) => {
  try {
    // Get all jobs that have shadeCardApprovalDate
    const jobs = await prisma.job.findMany({
      where: {
        shadeCardApprovalDate: {
          not: null
        }
      },
      select: {
        id: true,
        nrcJobNo: true,
        shadeCardApprovalDate: true
      }
    });

    let updatedCount = 0;
    
    for (const job of jobs) {
      const sharedCardDiffDate = calculateSharedCardDiffDate(job.shadeCardApprovalDate);
      
      await prisma.job.update({
        where: { id: job.id },
        data: { sharedCardDiffDate }
      });
      
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Successfully recalculated shared card diff date for ${updatedCount} jobs`,
      updatedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error recalculating shared card diff dates'
    });
  }
};


export const deleteJobByNrcJobNo = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformAdminAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required role: admin', 403);
  }

  const { nrcJobNo } = req.params;
  
  const job = await prisma.job.update({
    where: { nrcJobNo },
    data: { status: 'INACTIVE' },
  });

  // Log the job deletion action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOB_DELETED,
      JSON.stringify({
        message: 'Job deactivated',
        jobNo: nrcJobNo
      }),
      'Job',
      nrcJobNo
    );
  }

  res.status(200).json({
    success: true,
    data: job,
    message: 'Job deactivated successfully',
  });
};

export const holdJobByNrcJobNo = async (req: Request, res: Response) => {

  const { nrcJobNo } = req.params;

  const job = await prisma.job.update({
    where: { nrcJobNo },
    data: { status: 'HOLD' },
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
  }

  // Log the job hold action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.JOB_HOLD,
      JSON.stringify({
        message: 'Job put on hold',
        jobNo: nrcJobNo
      }),
      'Job',
      nrcJobNo
    );
  }

  res.status(200).json({
    success: true,
    data: job,
    message: 'Job put on hold successfully',
  });
}; 

// Check if job has job planning and machine details
export const checkJobPlanningStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  try {
    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { nrcJobNo },
      select: {
        nrcJobNo: true,
        customerName: true,
        status: true
      }
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Check if job planning exists for this job
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          orderBy: { stepNo: 'asc' },
          select: {
            id: true,
            stepNo: true,
            stepName: true,
            status: true,
            machineDetails: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    const hasJobPlanning = !!jobPlanning;

    // Analyze machine details for each step
    const stepsWithMachineDetails = jobPlanning?.steps.map(step => {
      const hasMachineDetails = step.machineDetails && 
        Array.isArray(step.machineDetails) && 
        step.machineDetails.length > 0;
      
      return {
        stepNo: step.stepNo,
        stepName: step.stepName,
        status: step.status,
        hasMachineDetails,
        machineDetailsCount: hasMachineDetails ? step.machineDetails.length : 0,
        machineDetails: hasMachineDetails ? step.machineDetails : null,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt
      };
    }) || [];

    const totalSteps = stepsWithMachineDetails.length;
    const stepsWithMachines = stepsWithMachineDetails.filter(step => step.hasMachineDetails).length;
    const stepsWithoutMachines = totalSteps - stepsWithMachines;

    res.status(200).json({
      success: true,
      data: {
        job: {
          nrcJobNo: job.nrcJobNo,
          customerName: job.customerName,
          status: job.status
        },
        hasJobPlanning,
        jobPlanning: hasJobPlanning ? {
          jobPlanId: jobPlanning.jobPlanId,
          jobDemand: jobPlanning.jobDemand,
          totalSteps,
          stepsWithMachines,
          stepsWithoutMachines,
          createdAt: jobPlanning.createdAt,
          updatedAt: jobPlanning.updatedAt,
          steps: stepsWithMachineDetails
        } : null
      },
      message: hasJobPlanning 
        ? `Job planning exists with ${totalSteps} steps (${stepsWithMachines} with machines, ${stepsWithoutMachines} without machines)` 
        : 'No job planning found for this job'
    });

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to check job planning status', 500);
  }
};