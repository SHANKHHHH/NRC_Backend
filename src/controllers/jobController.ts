import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';


export const createJob = async (req: Request, res: Response) => {
  // Authorization Check
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
    throw new AppError('You are not authorized to perform this action', 403);
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
  
  // Get serial number for this month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  const existingJobsThisMonth = await prisma.job.count({
    where: {
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
      customerName: customerName,
    },
  });
  
  const serialNumber = (existingJobsThisMonth + 1).toString().padStart(2, '0');
  
  // Format: SAK24-01-01 (Customer-Year-Month-Serial) - using hyphens instead of slashes
  const generatedNrcJobNo = `${customerPrefix}${year}-${month}-${serialNumber}`;

  const job = await prisma.job.create({
    data: {
      nrcJobNo: generatedNrcJobNo,  
      styleItemSKU,
      customerName,
      imageURL: imageURL || null,
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

  res.status(201).json({
    success: true,
    data: job,
    message: 'Job created successfully',
  });
};


//get all jobs
export const getAllJobs = async (req: Request, res: Response) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    success: true,
    count: jobs.length,
    data: jobs,
  });
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
    },
  });
};


export const updateJobByNrcJobNo = async (req: Request, res: Response) => {

  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { nrcJobNo } = req.params;
  const { imageURL, ...rest } = req.body;

  // Optional: Validate imageURL if present
  if (imageURL && typeof imageURL !== 'string') {
    throw new AppError('imageURL must be a string', 400);
  }

  const job = await prisma.job.update({
    where: { nrcJobNo },
    data: {
      ...rest,
      ...(imageURL !== undefined ? { imageURL } : {}),
    },
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
  }

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
};


export const deleteJobByNrcJobNo = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin') {
    throw new AppError('You are not authorized to perform this action', 403);
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