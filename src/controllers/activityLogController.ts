import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

/**
 * Get all activity logs with pagination and filtering
 */
export const getActivityLogs = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin') {
    throw new AppError('You are not authorized to view activity logs', 403);
  }

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

  res.status(200).json({
    success: true,
    data: logs,
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
  const requestingUserId = req.user?.userId;
  const requestingUserRole = req.user?.role;

  // Users can only view their own logs unless they're admin
  if (requestingUserRole !== 'admin' && requestingUserId !== userId) {
    throw new AppError('You can only view your own activity logs', 403);
  }

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

  res.status(200).json({
    success: true,
    data: logs,
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

  res.status(200).json({
    success: true,
    data: logs
  });
};

/**
 * Get activity summary (dashboard stats)
 */
export const getActivitySummary = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin') {
    throw new AppError('You are not authorized to view activity summary', 403);
  }

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
      topUsers
    }
  });
}; 