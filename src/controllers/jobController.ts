import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

// @desc    Create a new job
// @route   POST /api/jobs
// @access  Private (Admin or Planner)
export const createJob = async (req: Request, res: Response) => {
  // Authorization Check
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { nrcJobNo, styleItemSKU, customerName, ...rest } = req.body;

  if (!styleItemSKU || !customerName) {
    throw new AppError('Style Item SKU and Customer Name are required', 400);
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
      ...rest,
    },
  });

  res.status(201).json({
    success: true,
    data: job,
    message: 'Job created successfully',
  });
};

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
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

// @desc    Get a single job by NRC Job No
// @route   GET /api/jobs/:nrcJobNo
// @access  Private
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

// @desc    Update a job by NRC Job No
// @route   PUT /api/jobs/:nrcJobNo
// @access  Private
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

// @desc    Deactivate a job by NRC Job No (set status to inactive)
// @route   DELETE /api/jobs/:nrcJobNo
// @access  Private (Admin or Planner)
export const deleteJobByNrcJobNo = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'planner') {
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