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
 */
export const getUserActivityLogs = async (req: Request, res: Response) => {
  const { userId } = req.params;
  // Removed permission check - all users can view any user's activity logs

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
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
      skip,
      take: limit
    }),
    prisma.activityLog.count({ where: { userId } })
  ]);

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