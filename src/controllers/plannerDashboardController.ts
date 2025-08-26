import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

// Planner dashboard endpoint
export const getPlannerDashboard = async (req: Request, res: Response) => {
  try {
    // Get all active jobs with their related data
    const jobs = await prisma.job.findMany({
      where: {
        status: 'ACTIVE'
      },
      include: {
        purchaseOrders: true,
        artworks: true,
        machine: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Process each job to check completion status
    const processedJobs = jobs.map(job => {
      // Check PO completion
      const poStatus = job.purchaseOrders && job.purchaseOrders.length > 0 ? 'completed' : 'pending';
      
      // Check machine details completion
      const machineDetailsStatus = job.isMachineDetailsFilled ? 'completed' : 'pending';
      
      // Check artwork completion (using artworkReceivedDate instead of artworks array)
      const artworkStatus = job.artworkReceivedDate ? 'completed' : 'pending';
      
      // Calculate overall progress
      const completedChecks = [poStatus, machineDetailsStatus, artworkStatus].filter(status => status === 'completed').length;
      const overallProgress = Math.round((completedChecks / 3) * 100);

      return {
        nrcJobNo: job.nrcJobNo,
        styleItemSKU: job.styleItemSKU,
        customerName: job.customerName,
        status: job.status,
        poStatus,
        machineDetailsStatus,
        artworkStatus,
        overallProgress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        // Additional details
        poCount: job.purchaseOrders?.length || 0,
        artworkCount: job.artworks?.length || 0,
        hasMachineDetails: job.isMachineDetailsFilled
      };
    });

    // Calculate summary statistics
    const summary = {
      totalJobs: jobs.length,
      poCompleted: processedJobs.filter(job => job.poStatus === 'completed').length,
      machineDetailsCompleted: processedJobs.filter(job => job.machineDetailsStatus === 'completed').length,
      artworkCompleted: processedJobs.filter(job => job.artworkStatus === 'completed').length,
      fullyCompleted: processedJobs.filter(job => job.overallProgress === 100).length,
      partiallyCompleted: processedJobs.filter(job => job.overallProgress > 0 && job.overallProgress < 100).length,
      notStarted: processedJobs.filter(job => job.overallProgress === 0).length
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        jobs: processedJobs
      }
    });

  } catch (error) {
    console.error('Planner dashboard fetch error:', error);
    throw new AppError('Failed to fetch planner dashboard data', 500);
  }
};

// Get specific job planning details
export const getJobPlanningDetails = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo } = req.params;
    
    if (!nrcJobNo) {
      throw new AppError('Job number is required', 400);
    }

    // Get detailed planning information for a specific job
    const job = await prisma.job.findUnique({
      where: { nrcJobNo },
      include: {
        purchaseOrders: {
          select: {
            id: true,
            poNumber: true,
            customer: true,
            status: true,
            createdAt: true
          }
        },
        artworks: {
          select: {
            id: true,
            artworkReceived: true,
            sentForApprovalDate: true,
            approvedDate: true
          }
        },
        machine: {
          select: {
            id: true,
            machineCode: true,
            machineType: true,
            unit: true,
            status: true
          }
        }
      }
    });

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Get job planning separately
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          select: {
            id: true,
            stepNo: true,
            stepName: true,
            machineDetails: true,
            status: true,
            startDate: true,
            endDate: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      data: {
        job,
        jobPlanning
      }
    });

  } catch (error) {
    console.error('Job planning details fetch error:', error);
    throw new AppError('Failed to fetch job planning details', 500);
  }
};
