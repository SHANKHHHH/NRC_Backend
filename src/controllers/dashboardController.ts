import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { getFilteredJobNumbers } from '../middleware/machineAccess';
import { getAllJobPlannings, getMajorHoldJobPlanningsCount } from './jobPlanningController';
import { getAllCompletedJobs } from './completedJobController';
import { getAllHeldMachines } from './jobStepMachineController';
import { buildJobWithPODetailsPayload } from './jobController';

/** Run an Express handler and capture JSON body + status (no HTTP caching; reuses same logic as individual routes). */
async function captureHandlerJson<TBody = unknown>(
  handler: (req: Request, res: Response) => Promise<unknown> | unknown,
  req: Request
): Promise<{ statusCode: number; body: TBody }> {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        resolve({ statusCode, body: body as TBody });
        return this;
      },
      send(body: unknown) {
        resolve({ statusCode, body: body as TBody });
        return this;
      },
    } as unknown as Response;
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

/**
 * Single round-trip for Admin / Production Head dashboards: same payloads as
 * GET /api/job-planning, /api/completed-jobs, /api/job-step-machines/held-machines,
 * GET /api/job-planning/major-hold/count — reduces rate-limit pressure (no response caching).
 */
export const getRoleDashboardBundle = async (req: Request, res: Response) => {
  try {
    const [jp, cj, hm, mh] = await Promise.all([
      captureHandlerJson(
        async (r, res) => {
          await Promise.resolve(getAllJobPlannings(r, res));
        },
        req
      ),
      captureHandlerJson(
        async (r, res) => {
          await Promise.resolve(getAllCompletedJobs(r, res));
        },
        req
      ),
      captureHandlerJson(
        async (r, res) => {
          await Promise.resolve(getAllHeldMachines(r, res));
        },
        req
      ),
      captureHandlerJson(
        async (r, res) => {
          await Promise.resolve(getMajorHoldJobPlanningsCount(r, res));
        },
        req
      ),
    ]);

    if (jp.statusCode !== 200) {
      return res.status(jp.statusCode).json(jp.body);
    }

    const emptyCompleted = { success: true, count: 0, data: [] as unknown[] };
    const emptyHeld = {
      success: true,
      message: '',
      data: {
        totalHeldJobs: 0,
        totalHeldMachines: 0,
        queryParameters: { poNumber: null as string | null, includeJobPlanningDetails: true },
        heldJobs: [] as unknown[],
      },
    };

    const completedBody =
      cj.statusCode === 200 && cj.body && typeof cj.body === 'object'
        ? cj.body
        : emptyCompleted;

    const heldBody =
      hm.statusCode === 200 && hm.body && typeof hm.body === 'object'
        ? hm.body
        : emptyHeld;

    const majorBody =
      mh.statusCode === 200 && mh.body && typeof mh.body === 'object'
        ? mh.body
        : { success: true, count: 0 };

    return res.status(200).json({
      success: true,
      data: {
        jobPlanning: jp.body,
        completedJobs: completedBody,
        heldMachines: heldBody,
        majorHoldCount: majorBody,
      },
    });
  } catch (error) {
    console.error('getRoleDashboardBundle error:', error);
    throw new AppError('Failed to load dashboard bundle', 500);
  }
};

/**
 * POST body: { nrcJobNos: string[] } — same per-job shape as GET /api/jobs/:nrcJobNo/with-po-details (no HTTP caching).
 * Reduces rate-limit pressure when list views load many job cards at once.
 */
export const getJobsWithPODetailsBatch = async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new AppError('You must be logged in to view job details', 401);
  }
  const { nrcJobNos } = req.body as { nrcJobNos?: unknown };
  if (!Array.isArray(nrcJobNos) || nrcJobNos.length === 0) {
    throw new AppError('nrcJobNos must be a non-empty array', 400);
  }
  const unique = [...new Set(nrcJobNos.map(String).filter(Boolean))];
  if (unique.length > 500) {
    throw new AppError('Too many job numbers (max 500 per request)', 400);
  }
  const data: Record<string, Awaited<ReturnType<typeof buildJobWithPODetailsPayload>>> = {};
  await Promise.all(
    unique.map(async (nrcJobNo) => {
      try {
        data[nrcJobNo] = await buildJobWithPODetailsPayload(nrcJobNo);
      } catch (e) {
        console.error(`[getJobsWithPODetailsBatch] ${nrcJobNo}:`, e);
        data[nrcJobNo] = null;
      }
    })
  );
  return res.status(200).json({ success: true, data });
};

type JobStepBatchRow = Awaited<
  ReturnType<
    typeof prisma.jobStep.findMany<{
      include: {
        jobPlanning: {
          select: { nrcJobNo: true; jobDemand: true; jobPlanCode: true };
        };
        paperStore: true;
        printingDetails: true;
        corrugation: true;
        flutelam: true;
        punching: true;
        sideFlapPasting: true;
        qualityDept: true;
        dispatchProcess: true;
      };
    }>
  >
>[number];

function buildStepDetailWrapper(jobStep: JobStepBatchRow) {
  return {
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
    paperStore: jobStep.paperStore,
    printingDetails: jobStep.printingDetails,
    corrugation: jobStep.corrugation,
    flutelam: jobStep.flutelam,
    punching: jobStep.punching,
    sideFlapPasting: jobStep.sideFlapPasting,
    qualityDept: jobStep.qualityDept,
    dispatchProcess: jobStep.dispatchProcess,
  };
}

/** Same nested record as GET .../by-step-id/:id — used by Admin/Production dashboards in one query. */
function extractStepTableRow(stepName: string, data: ReturnType<typeof buildStepDetailWrapper>): unknown {
  switch (stepName) {
    case 'PaperStore':
      return data.paperStore ?? null;
    case 'Corrugation':
      return data.corrugation ?? null;
    case 'PrintingDetails':
      return data.printingDetails ?? null;
    case 'FluteLaminateBoardConversion':
      return data.flutelam ?? null;
    case 'Punching':
      return data.punching ?? null;
    case 'SideFlapPasting':
    case 'FlapPasting':
      return data.sideFlapPasting ?? null;
    case 'QualityDept':
      return data.qualityDept ?? null;
    case 'DispatchProcess':
      return data.dispatchProcess ?? null;
    default:
      return null;
  }
}

/**
 * POST body: { steps: { stepId: number; stepName: string }[] }
 * Response: { success: true, data: { [stepId: string]: tableRow | null } } — same shapes as individual by-step-id APIs.
 */
export const getStepDetailsBatch = async (req: Request, res: Response) => {
  const body = req.body as { steps?: Array<{ stepId: unknown; stepName: unknown }> };
  const { steps } = body;

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new AppError('steps must be a non-empty array', 400);
  }
  if (steps.length > 15000) {
    throw new AppError('Too many steps (max 15000)', 400);
  }

  const ids = [
    ...new Set(
      steps
        .map((s) => Number(s?.stepId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  if (ids.length === 0) {
    return res.status(200).json({ success: true, data: {} });
  }

  const jobSteps = await prisma.jobStep.findMany({
    where: { id: { in: ids } },
    include: {
      jobPlanning: {
        select: { nrcJobNo: true, jobDemand: true, jobPlanCode: true },
      },
      paperStore: true,
      printingDetails: true,
      corrugation: true,
      flutelam: true,
      punching: true,
      sideFlapPasting: true,
      qualityDept: true,
      dispatchProcess: true,
    },
  });

  const byId = new Map(jobSteps.map((js) => [js.id, js]));

  const out: Record<string, unknown | null> = {};

  for (const item of steps) {
    const id = Number(item?.stepId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const key = String(id);
    const js = byId.get(id);
    if (!js) {
      out[key] = null;
      continue;
    }
    const wrapper = buildStepDetailWrapper(js);
    out[key] = extractStepTableRow(js.stepName, wrapper);
  }

  return res.status(200).json({ success: true, data: out });
};

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

// Get accurate job counts for status overview
export const getJobCounts = async (req: Request, res: Response) => {
  try {
    const userMachineIds = req.userMachineIds;
    const userRole = req.user?.role || '';
    
    // Get accessible job numbers
    const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds || null, userRole);
    
    // Get active job plannings (jobs that are still in progress)
    const activeJobPlannings = await prisma.jobPlanning.findMany({
      where: { nrcJobNo: { in: accessibleJobNumbers } },
      select: { nrcJobNo: true, jobDemand: true }
    });
    
    // Get completed jobs
    const completedJobs = await prisma.completedJob.findMany({
      where: { nrcJobNo: { in: accessibleJobNumbers } },
      select: { nrcJobNo: true, completedAt: true }
    });
    
    // Count active jobs (job plannings that exist)
    const activeJobs = activeJobPlannings.length;
    
    // Count completed jobs
    const completedJobsCount = completedJobs.length;
    
    // Count high demand jobs
    const highDemandJobs = activeJobPlannings.filter(jp => jp.jobDemand === 'high').length;
    
    // Count in-progress jobs (jobs with at least one step started)
    const inProgressJobs = await prisma.jobPlanning.findMany({
      where: { 
        nrcJobNo: { in: accessibleJobNumbers },
        steps: {
          some: {
            status: { in: ['start', 'stop'] }
          }
        }
      },
      select: { nrcJobNo: true }
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalOrders: activeJobs + completedJobsCount,
        activeJobs: activeJobs,
        completedJobs: completedJobsCount,
        highDemandJobs: highDemandJobs,
        inProgressJobs: inProgressJobs.length,
        notStartedJobs: activeJobs - inProgressJobs.length
      }
    });
    
  } catch (error) {
    console.error('Job counts fetch error:', error);
    throw new AppError('Failed to fetch job counts', 500);
  }
}; 