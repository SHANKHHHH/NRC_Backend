import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';


export const createJob = async (req: Request, res: Response) => {
  // Authorization Check
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

<<<<<<< Updated upstream
  const { nrcJobNo, styleItemSKU, customerName, ...rest } = req.body; //datasets
=======
  const { nrcJobNo, styleItemSKU, customerName, imageURL, machineId, ...rest } = req.body; //datasets
>>>>>>> Stashed changes

  if (!styleItemSKU || !customerName) {
    throw new AppError('Style Item SKU and Customer Name are required', 400);
  }

<<<<<<< Updated upstream
=======
  // Optional: Validate imageURL if present
  if (imageURL && typeof imageURL !== 'string') {
    throw new AppError('imageURL must be a string', 400);
  }

  // Validate machineId if provided
  if (machineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      select: { id: true, machineCode: true }
    });
    
    if (!machine) {
      throw new AppError('Machine not found', 404);
    }
  }

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
      imageURL: imageURL || null,
      machineId: machineId || null,
      sharedCardDiffDate: calculateSharedCardDiffDate(rest.shadeCardApprovalDate),
>>>>>>> Stashed changes
      ...rest,
    },
  });

  res.status(201).json({
    success: true,
    data: { ...job, assignedMachine: machineId || null },
    message: 'Job created successfully',
  });
};


//get all jobs
export const getAllJobs = async (req: Request, res: Response) => {
<<<<<<< Updated upstream
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
  });
=======
  try {
    const userMachineIds = req.userMachineIds; // From middleware
    
    const whereClause: any = {};
    if (userMachineIds !== null && userMachineIds && userMachineIds.length > 0) {
      whereClause.machineId = { in: userMachineIds };
    }
    
    const jobs = await prisma.job.findMany({
      where: whereClause,
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
            status: true,
            machineType: true
          }
        }
      }
    });
>>>>>>> Stashed changes

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
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
  }

  res.status(200).json({
    success: true,
    data: job,
  });
};


export const updateJobByNrcJobNo = async (req: Request, res: Response) => {

  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { nrcJobNo } = req.params;
  
  const job = await prisma.job.update({
    where: { nrcJobNo },
    data: req.body,
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
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
    data: { status: 'inactive' },
  });

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
    data: { status: 'hold' },
  });

  if (!job) {
    throw new AppError('Job not found with that NRC Job No', 404);
  }

  res.status(200).json({
    success: true,
    data: job,
    message: 'Job put on hold successfully',
  });
}; 