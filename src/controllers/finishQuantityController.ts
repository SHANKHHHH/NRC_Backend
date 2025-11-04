import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { RoleManager } from '../utils/roleUtils';

/**
 * Get all finish quantities (admin and planner only)
 * Returns finish quantities grouped by job for easy viewing in admin/planner dashboard
 */
export const getAllFinishQuantities = async (req: Request, res: Response) => {
  const userRole = req.user?.role || '';
  
  // Only admin and planner can access
  if (!RoleManager.isAdmin(userRole) && userRole !== 'planner') {
    throw new AppError('Access denied. Only admin and planner roles can view finish quantities.', 403);
  }

  try {
    // Get all finish quantities with job details
    const finishQuantities = await prisma.finishQuantity.findMany({
      include: {
        job: {
          select: {
            nrcJobNo: true,
            customerName: true,
            styleItemSKU: true,
            fluteType: true,
            boxDimensions: true,
            boardSize: true,
            noUps: true,
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            totalPOQuantity: true,
          }
        },
        consumedByPO: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            totalPOQuantity: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Group by job for better organization
    const jobsMap = new Map<string, any>();

    finishQuantities.forEach((fq) => {
      const nrcJobNo = fq.jobNrcJobNo;
      
      if (!jobsMap.has(nrcJobNo)) {
        jobsMap.set(nrcJobNo, {
          nrcJobNo: nrcJobNo,
          jobDetails: fq.job,
          finishQuantities: []
        });
      }

      jobsMap.get(nrcJobNo).finishQuantities.push({
        id: fq.id,
        overDispatchedQuantity: fq.overDispatchedQuantity,
        totalPOQuantity: fq.totalPOQuantity,
        totalDispatchedQuantity: fq.totalDispatchedQuantity,
        status: fq.status,
        purchaseOrder: fq.purchaseOrder,
        consumedByPO: fq.consumedByPO,
        remarks: fq.remarks,
        createdAt: fq.createdAt,
        updatedAt: fq.updatedAt
      });
    });

    const formattedData = Array.from(jobsMap.values());

    // Calculate totals
    const totalAvailable = finishQuantities
      .filter(fq => fq.status === 'available')
      .reduce((sum, fq) => sum + fq.overDispatchedQuantity, 0);
    
    const totalConsumed = finishQuantities
      .filter(fq => fq.status === 'consumed')
      .reduce((sum, fq) => sum + fq.overDispatchedQuantity, 0);

    res.status(200).json({
      success: true,
      count: formattedData.length,
      totalAvailable,
      totalConsumed,
      data: formattedData
    });
  } catch (error) {
    console.error('Error fetching finish quantities:', error);
    throw new AppError('Failed to fetch finish quantities', 500);
  }
};

/**
 * Get finish quantities by job number
 */
export const getFinishQuantitiesByJob = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const userRole = req.user?.role || '';
  
  // Only admin and planner can access
  if (!RoleManager.isAdmin(userRole) && userRole !== 'planner') {
    throw new AppError('Access denied. Only admin and planner roles can view finish quantities.', 403);
  }

  try {
    const finishQuantities = await prisma.finishQuantity.findMany({
      where: { jobNrcJobNo: nrcJobNo },
      include: {
        job: {
          select: {
            nrcJobNo: true,
            customerName: true,
            styleItemSKU: true,
            fluteType: true,
            boxDimensions: true,
            boardSize: true,
            noUps: true,
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            totalPOQuantity: true,
          }
        },
        consumedByPO: {
          select: {
            id: true,
            poNumber: true,
            poDate: true,
            totalPOQuantity: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      count: finishQuantities.length,
      data: finishQuantities
    });
  } catch (error) {
    console.error('Error fetching finish quantities by job:', error);
    throw new AppError('Failed to fetch finish quantities', 500);
  }
};
