import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Sanitize string to remove invalid UTF-8 characters and replacement characters
 */
const sanitizeString = (str: any): string => {
  if (!str) return '';
  
  // Handle byte arrays (convert to string first)
  if (Array.isArray(str)) {
    try {
      str = Buffer.from(str).toString('utf8');
    } catch (e) {
      return '';
    }
  }
  
  // Ensure it's a string
  str = String(str);
  
  // Handle Buffer objects
  if (Buffer.isBuffer(str)) {
    try {
      str = str.toString('utf8');
    } catch (e) {
      return '';
    }
  }
  
  // Remove replacement characters and control characters using char codes
  return str
    .split('')
    .filter((char: string) => {
      const charCode = char.charCodeAt(0);
      // Keep printable characters (32-126), newlines (10), tabs (9), and carriage returns (13)
      // Remove replacement character (65533) and other control characters
      return charCode >= 32 || charCode === 9 || charCode === 10 || charCode === 13;
    })
    .join('')
    .replace(/\uFFFD/g, '') // Remove replacement characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
    .trim();
};

/**
 * Extract jobPlanId from activity log details JSON payload
 */
const extractJobPlanIdFromDetails = (details?: string | null): string | null => {
  if (!details) return null;

  try {
    const jsonPart = details.includes('|') ? details.split('|')[0].trim() : details.trim();
    const parsed = JSON.parse(jsonPart);

    if (parsed?.jobPlanId !== undefined && parsed?.jobPlanId !== null) {
      return parsed.jobPlanId.toString();
    }

    if (parsed?.jobPlanning?.jobPlanId !== undefined && parsed?.jobPlanning?.jobPlanId !== null) {
      return parsed.jobPlanning.jobPlanId.toString();
    }
  } catch (error) {
    // Ignore parse errors – we'll fall back to frontend extraction strategies.
  }

  return null;
};

/**
 * Get all activity logs with pagination and filtering
 */
export const getActivityLogs = async (req: Request, res: Response) => {
  // Removed permission check - all users can view activity logs

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const userId = req.query.userId as string;
  const action = req.query.action as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};
  
  if (userId) {
    where.userId = userId;
  }
  
  if (action) {
    where.action = {
      contains: action,
      mode: 'insensitive'
    };
  }
  
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.activityLog.count({ where })
  ]);

  const logsWithPlan = logs.map((log: any) => ({
    ...log,
    jobPlanId: log.jobPlanId ?? extractJobPlanIdFromDetails(log.details),
  }));

  // Sanitize data to ensure it's UTF-8 compatible and remove replacement characters
  const sanitizedLogs = logsWithPlan.map(log => ({
    ...log,
    details: log.details ? sanitizeString(log.details) : null,
    action: log.action ? sanitizeString(log.action) : log.action,
    user: log.user ? {
      ...log.user,
      name: log.user.name ? sanitizeString(log.user.name) : log.user.name,
      email: log.user.email ? sanitizeString(log.user.email) : log.user.email
    } : log.user
  }));

  res.status(200).json({
    success: true,
    data: sanitizedLogs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
};

/**
 * Get activity logs for a specific user
 * Also includes completed JobStepMachine entries that may not have activity logs
 */
export const getUserActivityLogs = async (req: Request, res: Response) => {
  const { userId } = req.params;
  // Removed permission check - all users can view any user's activity logs

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 1000; // Increase limit to include all relevant logs
  const skip = (page - 1) * limit;

  // Get activity logs
  const [rawActivityLogs, activityLogsTotal] = await Promise.all([
    prisma.activityLog.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: 0,
      take: 5000 // Get all activity logs for the user
    }),
    prisma.activityLog.count({ where: { userId } })
  ]);

  // Get JobStepMachine entries for this user (both started and completed)
  // We need both to show started actions on start date and completed actions on completion date
  const [startedMachines, completedMachines] = await Promise.all([
    // Get started machines - use startedAt for the date
    (prisma as any).jobStepMachine.findMany({
      where: {
        userId: userId,
        startedAt: { not: null }
      },
      include: {
        jobStep: {
          include: {
            jobPlanning: {
              select: {
                nrcJobNo: true,
                jobPlanId: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      },
      take: 1000
    }),
    // Get completed machines - use completedAt/updatedAt for the date
    (prisma as any).jobStepMachine.findMany({
      where: {
        userId: userId,
        status: 'stop',
        completedAt: { not: null }
      },
      include: {
        jobStep: {
          include: {
            jobPlanning: {
              select: {
                nrcJobNo: true,
                jobPlanId: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      },
      take: 1000
    })
  ]);

  // ✅ Get completed non-machine JobSteps (PaperStore, Quality, Dispatch) for this user
  // These steps don't have JobStepMachine records, so we need to query JobStep directly
  // Filter by step names that are non-machine steps
  const nonMachineStepNames = ['PaperStore', 'QualityDept', 'DispatchProcess'];
  const completedNonMachineSteps = await prisma.jobStep.findMany({
    where: {
      user: userId,
      status: 'stop',
      endDate: { not: null },
      stepName: {
        in: nonMachineStepNames
      }
    },
    include: {
      jobPlanning: {
        select: {
          nrcJobNo: true,
          jobPlanId: true
        }
      },
      paperStore: {
        select: {
          available: true,
          quantity: true,
          status: true
        }
      },
      qualityDept: {
        select: {
          quantity: true,
          rejectedQty: true,
          status: true
        }
      },
      dispatchProcess: {
        select: {
          quantity: true,
          totalDispatchedQty: true,
          status: true
        }
      }
    },
    orderBy: {
      endDate: 'desc'
    },
    take: 1000
  });

  const activityLogs = rawActivityLogs.map((log: any) => ({
    ...log,
    jobPlanId: log.jobPlanId ?? extractJobPlanIdFromDetails(log.details),
  }));

  // Convert started JobStepMachine entries to activity log format
  const startedActivityLogs = startedMachines.map((machine: any) => {
    const nrcJobNo = machine.nrcJobNo || machine.jobStep?.jobPlanning?.nrcJobNo || '';
    const jobPlanId = machine.jobStep?.jobPlanning?.jobPlanId || machine.jobStep?.jobPlanningId || null;
    const startedAt = machine.startedAt;

    // Create a synthetic activity log entry for started action
    return {
      id: `machine_started_${machine.id}`,
      userId: machine.userId,
      action: 'Production Step Started',
      details: JSON.stringify({
        message: `Step ${machine.stepNo || 'N/A'} (${machine.jobStep?.stepName || 'Unknown'}) started`,
        nrcJobNo: nrcJobNo,
        jobPlanId: jobPlanId, // Include jobPlanId in details
        stepNo: machine.stepNo,
        stepName: machine.jobStep?.stepName || 'Unknown',
        machineId: machine.machineId,
        startDate: startedAt
      }),
      nrcJobNo: nrcJobNo,
      jobPlanId: jobPlanId, // Include jobPlanId at root level
      createdAt: startedAt, // Use startedAt so it shows in the activity on the day it was started
      updatedAt: machine.updatedAt,
      user: machine.user,
      _isMachineLog: true
    };
  });

  // Convert completed JobStepMachine entries to activity log format
  const completedActivityLogs = completedMachines.map((machine: any) => {
    const formData = machine.formData ? (typeof machine.formData === 'string' ? JSON.parse(machine.formData) : machine.formData) : {};
    const okQuantity = formData['OK Quantity'] || formData['Quantity OK'] || formData['quantity'] || machine.okQuantity || machine.quantityOK || machine.quantity || 0;
    const wastage = formData['Wastage'] || 0;
    const completedAt = machine.completedAt || machine.updatedAt;
    const nrcJobNo = machine.nrcJobNo || machine.jobStep?.jobPlanning?.nrcJobNo || '';
    const jobPlanId = machine.jobStep?.jobPlanning?.jobPlanId || machine.jobStep?.jobPlanningId || null;
    // Use completedAt first (when step was completed), then updatedAt, then createdAt as fallback
    // This ensures activities appear on the completion date, not the last update date
    const activityDate = machine.completedAt || machine.updatedAt || machine.createdAt;

    // Create a synthetic activity log entry
    return {
      id: `machine_${machine.id}`,
      userId: machine.userId,
      action: 'Production Step Completed',
      details: JSON.stringify({
        message: `Step ${machine.stepNo || 'N/A'} (${machine.jobStep?.stepName || 'Unknown'}) completed`,
        nrcJobNo: nrcJobNo,
        jobPlanId: jobPlanId, // Include jobPlanId in details
        stepNo: machine.stepNo,
        stepName: machine.jobStep?.stepName || 'Unknown',
        totalOK: okQuantity,
        totalWastage: wastage,
        completedBy: machine.userId,
        endDate: completedAt,
        machineId: machine.machineId
      }),
      nrcJobNo: nrcJobNo,
      jobPlanId: jobPlanId, // Include jobPlanId at root level
      createdAt: activityDate, // Use completedAt/updatedAt so it shows in the activity on the day it was completed
      updatedAt: machine.updatedAt,
      user: machine.user,
      _isMachineLog: true
    };
  });

  // ✅ Convert completed non-machine JobSteps to activity log format
  const completedNonMachineActivityLogs = completedNonMachineSteps.map((step: any) => {
    const nrcJobNo = step.jobPlanning?.nrcJobNo || '';
    const jobPlanId = step.jobPlanning?.jobPlanId || step.jobPlanningId || null;
    const stepName = step.stepName || 'Unknown';
    const stepNo = step.stepNo || 0;
    const completedAt = step.endDate || step.updatedAt || step.createdAt;
    const activityDate = step.endDate || step.updatedAt || step.createdAt;
    const completedBy = step.user || step.completedBy || userId;

    // Get quantity based on step type
    let quantity = 0;
    let additionalDetails: any = {};
    
    if (step.stepName?.toLowerCase().includes('paperstore') && step.paperStore) {
      quantity = step.paperStore.available || step.paperStore.quantity || 0;
      additionalDetails = {
        available: step.paperStore.available,
        quantity: step.paperStore.quantity
      };
    } else if (step.stepName?.toLowerCase().includes('quality') && step.qualityDept) {
      quantity = step.qualityDept.quantity || 0;
      additionalDetails = {
        quantity: step.qualityDept.quantity,
        rejectedQty: step.qualityDept.rejectedQty
      };
    } else if (step.stepName?.toLowerCase().includes('dispatch') && step.dispatchProcess) {
      quantity = step.dispatchProcess.totalDispatchedQty || step.dispatchProcess.quantity || 0;
      additionalDetails = {
        quantity: step.dispatchProcess.quantity,
        totalDispatchedQty: step.dispatchProcess.totalDispatchedQty
      };
    }

    // Get user details for the activity log
    // JobStep.user is just a userId string, so we'll need to look it up
    // For now, create a basic user object - the frontend can fetch full user details if needed
    const userDetails = step.user ? {
      id: step.user,
      name: step.user, // Will be the userId string
      email: null,
      role: null
    } : null;

    // Create a synthetic activity log entry
    return {
      id: `non_machine_step_${step.id}`,
      userId: completedBy,
      action: 'Production Step Completed',
      details: JSON.stringify({
        message: `Step ${stepNo} (${stepName}) completed`,
        nrcJobNo: nrcJobNo,
        jobPlanId: jobPlanId, // Include jobPlanId in details
        stepNo: stepNo,
        stepName: stepName,
        quantity: quantity,
        completedBy: completedBy,
        endDate: completedAt,
        ...additionalDetails
      }),
      nrcJobNo: nrcJobNo,
      jobPlanId: jobPlanId, // Include jobPlanId at root level for easier access
      createdAt: activityDate, // Use endDate so it shows in the activity on the day it was completed
      updatedAt: step.updatedAt,
      user: userDetails,
      _isNonMachineLog: true
    };
  });

  // Combine all machine logs and non-machine step logs
  const machineActivityLogs = [...startedActivityLogs, ...completedActivityLogs];
  const allStepActivityLogs = [...machineActivityLogs, ...completedNonMachineActivityLogs];

  // Combine and deduplicate - prefer activity logs over machine logs for same step
  const logMap = new Map();
  
  // First, add all activity logs
  activityLogs.forEach(log => {
    const key = `${log.nrcJobNo}_${log.action}_${log.createdAt}`;
    if (!logMap.has(key)) {
      logMap.set(key, log);
    }
  });

  // Then add machine logs and non-machine step logs only if no activity log exists for that action
  allStepActivityLogs.forEach(stepLog => {
    // Create unique key based on action type and date
    const key = `${stepLog.nrcJobNo}_${stepLog.action}_${stepLog.createdAt}`;
    // Only add if no activity log exists for this action
    if (!logMap.has(key)) {
      logMap.set(key, stepLog);
    }
  });

  const allLogs = Array.from(logMap.values());

  // Sanitize data to ensure it's UTF-8 compatible and remove replacement characters
  const sanitizedLogs = allLogs.map(log => ({
    ...log,
    details: log.details ? sanitizeString(log.details) : null,
    action: log.action ? sanitizeString(log.action) : log.action,
    user: log.user ? {
      ...log.user,
      name: log.user.name ? sanitizeString(log.user.name) : log.user.name,
      email: log.user.email ? sanitizeString(log.user.email) : log.user.email
    } : log.user
  })).sort((a, b) => {
    // Sort by createdAt descending
    const dateA = new Date(a.createdAt || a.updatedAt || 0);
    const dateB = new Date(b.createdAt || b.updatedAt || 0);
    return dateB.getTime() - dateA.getTime();
  });

  res.status(200).json({
    success: true,
    data: sanitizedLogs,
    pagination: {
      page,
      limit,
      total: sanitizedLogs.length,
      totalPages: Math.ceil(sanitizedLogs.length / limit)
    }
  });
};

/**
 * Get activity logs for a specific job
 */
export const getJobActivityLogs = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  const logs = await prisma.activityLog.findMany({
    where: {
      details: {
        contains: nrcJobNo
      }
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Sanitize data to ensure it's UTF-8 compatible and remove replacement characters
  const sanitizedLogs = logs.map(log => ({
    ...log,
    details: log.details ? sanitizeString(log.details) : null,
    action: log.action ? sanitizeString(log.action) : log.action,
    user: log.user ? {
      ...log.user,
      name: log.user.name ? sanitizeString(log.user.name) : log.user.name,
      email: log.user.email ? sanitizeString(log.user.email) : log.user.email
    } : log.user
  }));

  res.status(200).json({
    success: true,
    data: sanitizedLogs
  });
};

/**
 * Get activity summary (dashboard stats)
 */
export const getActivitySummary = async (req: Request, res: Response) => {
  // Removed permission check - all users can view activity summary

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayCount, weekCount, monthCount, totalCount] = await Promise.all([
    prisma.activityLog.count({
      where: {
        createdAt: {
          gte: startOfDay
        }
      }
    }),
    prisma.activityLog.count({
      where: {
        createdAt: {
          gte: startOfWeek
        }
      }
    }),
    prisma.activityLog.count({
      where: {
        createdAt: {
          gte: startOfMonth
        }
      }
    }),
    prisma.activityLog.count()
  ]);

  // Get top actions
  const topActions = await prisma.activityLog.groupBy({
    by: ['action'],
    _count: {
      action: true
    },
    orderBy: {
      _count: {
        action: 'desc'
      }
    },
    take: 10
  });

  // Get top users
  const topUsers = await prisma.activityLog.groupBy({
    by: ['userId'],
    _count: {
      userId: true
    },
    orderBy: {
      _count: {
        userId: 'desc'
      }
    },
    take: 10
  });

  // Get recent logs for job creation and status updates
  const recentLogs = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const jobCreations = [];
  const jobStatusUpdates = [];

  for (const log of recentLogs) {
    if (log.action === 'Job Created') {
      try {
        const sanitizedDetails = sanitizeString(log.details || '{}');
        const details = JSON.parse(sanitizedDetails);
        jobCreations.push({
          nrcJobNo: sanitizeString(details.jobNo || details.nrcJobNo || 'Unknown'),
          userId: log.userId || 'Unknown',
          date: log.createdAt
        });
      } catch {}
    }
    if (log.action === 'Job Updated') {
      try {
        const sanitizedDetails = sanitizeString(log.details || '{}');
        const details = JSON.parse(sanitizedDetails);
        jobStatusUpdates.push({
          nrcJobNo: sanitizeString(details.jobNo || details.nrcJobNo || 'Unknown'),
          status: details.updatedFields?.includes('status') ? sanitizeString(details.status || 'Updated') : 'Other',
          userId: log.userId || 'Unknown',
          date: log.createdAt
        });
      } catch {}
    }
  }

  res.status(200).json({
    success: true,
    data: {
      counts: {
        today: todayCount,
        week: weekCount,
        month: monthCount,
        total: totalCount
      },
      topActions,
      topUsers,
      jobCreations,
      jobStatusUpdates
    }
  });
}; 