import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

// Aggregated dashboard data endpoint
export const getDashboardData = async (req: Request, res: Response) => {
  try {
    // Get query parameters for filtering
    const { nrcJobNo, limit = 10 } = req.query;
    
    // Execute all queries in parallel for better performance
    const [
      jobs,
      jobPlannings,
      machines,
      activityLogs,
      completedJobs,
      purchaseOrders
    ] = await Promise.all([
      // Get recent jobs
      prisma.job.findMany({
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          // Include all relations but ensure they're never null
          paperStores: true,
          printingDetails: true,
          corrugations: true,
          fluteLaminateBoardConversions: true,
          punchings: true,
          sideFlapPastings: true,
          qualityDepts: true,
          dispatchProcesses: true,
          artworks: true,
          purchaseOrders: true,
          user: {
            select: {
              id: true,
              name: true,
              role: true,
              email: true
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
      }),
      
      // Get job plannings with steps
      prisma.jobPlanning.findMany({
        take: Number(limit),
        orderBy: { jobPlanId: 'desc' },
        include: {
          steps: {
            select: {
              stepNo: true,
              stepName: true,
              status: true,
              startDate: true,
              endDate: true
            }
          }
        }
      }),
      
      // Get machine stats
      prisma.machine.findMany({
        select: {
          id: true,
          description: true,
          status: true,
          capacity: true,
          machineType: true
        }
      }),
      
      // Get recent activity logs
      prisma.activityLog.findMany({
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          details: true,
          userId: true,
          nrcJobNo: true,
          createdAt: true
        }
      }),
      
      // Get completed jobs
      prisma.completedJob.findMany({
        take: Number(limit),
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          nrcJobNo: true,
          completedAt: true,
          remarks: true
        }
      }),
      
      // Get purchase orders
      prisma.purchaseOrder.findMany({
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          poNumber: true,
          customer: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    // Ensure all array fields in jobs are never null - convert null to empty arrays
    const safeJobs = jobs.map(job => ({
      ...job,
      paperStores: job.paperStores || [],
      printingDetails: job.printingDetails || [],
      corrugations: job.corrugations || [],
      fluteLaminateBoardConversions: job.fluteLaminateBoardConversions || [],
      punchings: job.punchings || [],
      sideFlapPastings: job.sideFlapPastings || [],
      qualityDepts: job.qualityDepts || [],
      dispatchProcesses: job.dispatchProcesses || [],
      artworks: job.artworks || [],
      purchaseOrders: job.purchaseOrders || []
    }));

    // If specific job number is requested, get detailed data
    let jobDetails = null;
    if (nrcJobNo) {
      const [
        jobData,
        planningData,
        corrugationData,
        printingData,
        punchingData,
        qualityData,
        dispatchData
      ] = await Promise.all([
        prisma.job.findUnique({
          where: { nrcJobNo: String(nrcJobNo) }
        }),
        prisma.jobPlanning.findFirst({
          where: { nrcJobNo: String(nrcJobNo) },
          include: { steps: true }
        }),
        prisma.corrugation.findFirst({
          where: { jobNrcJobNo: String(nrcJobNo) }
        }),
        prisma.printingDetails.findFirst({
          where: { jobNrcJobNo: String(nrcJobNo) }
        }),
        prisma.punching.findFirst({
          where: { jobNrcJobNo: String(nrcJobNo) }
        }),
        prisma.qualityDept.findFirst({
          where: { jobNrcJobNo: String(nrcJobNo) }
        }),
        prisma.dispatchProcess.findFirst({
          where: { jobNrcJobNo: String(nrcJobNo) }
        })
      ]);

      jobDetails = {
        job: jobData,
        planning: planningData,
        corrugation: corrugationData,
        printing: printingData,
        punching: punchingData,
        quality: qualityData,
        dispatch: dispatchData
      };
    }

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalJobs: jobs.length,
          totalMachines: machines.length,
          activeMachines: machines.filter(m => m.status === 'available').length,
          recentActivities: activityLogs.length
        },
        jobs: safeJobs,
        jobPlannings,
        machines,
        activityLogs,
        completedJobs,
        purchaseOrders,
        jobDetails
      }
    });

  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    throw new AppError('Failed to fetch dashboard data', 500);
  }
};

// Get job-specific aggregated data
export const getJobAggregatedData = async (req: Request, res: Response) => {
  try {
    const { nrcJobNo } = req.params;
    
    if (!nrcJobNo) {
      throw new AppError('Job number is required', 400);
    }

    // Fetch all job-related data in parallel
    const [
      job,
      planning,
      corrugation,
      printing,
      punching,
      quality,
      dispatch,
      sideFlap,
      fluteLaminate,
      paperStore
    ] = await Promise.all([
      prisma.job.findUnique({
        where: { nrcJobNo }
      }),
      prisma.jobPlanning.findFirst({
        where: { nrcJobNo },
        include: { steps: true }
      }),
      prisma.corrugation.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.printingDetails.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.punching.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.qualityDept.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.dispatchProcess.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.sideFlapPasting.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.fluteLaminateBoardConversion.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      }),
      prisma.paperStore.findFirst({
        where: { jobNrcJobNo: nrcJobNo }
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        job,
        planning,
        corrugation,
        printing,
        punching,
        quality,
        dispatch,
        sideFlap,
        fluteLaminate,
        paperStore
      }
    });

  } catch (error) {
    console.error('Job aggregated data fetch error:', error);
    throw new AppError('Failed to fetch job data', 500);
  }
}; 