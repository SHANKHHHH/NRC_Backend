import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Assign machines to a user
 */
export const assignMachinesToUser = async (req: Request, res: Response) => {
  const { userId, machineIds } = req.body;

  if (!userId || !Array.isArray(machineIds) || machineIds.length === 0) {
    throw new AppError('User ID and machine IDs are required', 400);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Validate machines exist
  const machines = await prisma.machine.findMany({
    where: { id: { in: machineIds } },
    select: { id: true, machineCode: true }
  });

  if (machines.length !== machineIds.length) {
    const foundIds = machines.map(m => m.id);
    const missingIds = machineIds.filter(id => !foundIds.includes(id));
    throw new AppError(`Machines not found: ${missingIds.join(', ')}`, 404);
  }

  // Create machine assignments
  const assignments = await prisma.userMachine.createMany({
    data: machineIds.map((machineId: string) => ({
      userId,
      machineId,
      assignedBy: req.user?.userId
    })),
    skipDuplicates: true
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.USER_UPDATED,
      `Assigned machines to user ${user.email}: ${machineIds.join(', ')}`,
      'User',
      userId
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines assigned successfully',
    data: {
      userId,
      assignedMachines: machineIds,
      count: assignments.count
    }
  });
};

/**
 * Remove machines from a user
 */
export const removeMachinesFromUser = async (req: Request, res: Response) => {
  const { userId, machineIds } = req.body;

  if (!userId || !Array.isArray(machineIds) || machineIds.length === 0) {
    throw new AppError('User ID and machine IDs are required', 400);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Remove machine assignments
  const result = await prisma.userMachine.deleteMany({
    where: {
      userId,
      machineId: { in: machineIds }
    }
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.USER_UPDATED,
      `Removed machines from user ${user.email}: ${machineIds.join(', ')}`,
      'User',
      userId
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines removed successfully',
    data: {
      userId,
      removedMachines: machineIds,
      count: result.count
    }
  });
};

/**
 * Get all machines assigned to a user
 */
export const getUserMachines = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    throw new AppError('User ID is required', 400);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Get user's machine assignments
  const userMachines = await prisma.userMachine.findMany({
    where: { userId, isActive: true },
    include: {
      machine: {
        select: {
          id: true,
          machineCode: true,
          machineType: true,
          description: true,
          status: true
        }
      }
    },
    orderBy: { assignedAt: 'desc' }
  });

  res.status(200).json({
    success: true,
    data: userMachines
  });
};

/**
 * Assign machines to a purchase order
 */
export const assignMachinesToPO = async (req: Request, res: Response) => {
  const { poId, machineIds } = req.body;

  if (!poId || !Array.isArray(machineIds) || machineIds.length === 0) {
    throw new AppError('Purchase Order ID and machine IDs are required', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase Order not found', 404);
  }

  // Validate machines exist
  const machines = await prisma.machine.findMany({
    where: { id: { in: machineIds } },
    select: { id: true, machineCode: true }
  });

  if (machines.length !== machineIds.length) {
    const foundIds = machines.map(m => m.id);
    const missingIds = machineIds.filter(id => !foundIds.includes(id));
    throw new AppError(`Machines not found: ${missingIds.join(', ')}`, 404);
  }

  // Create machine assignments
  const assignments = await prisma.purchaseOrderMachine.createMany({
    data: machineIds.map((machineId: string) => ({
      purchaseOrderId: poId,
      machineId,
      assignedBy: req.user?.userId
    })),
    skipDuplicates: true
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.PO_UPDATED,
      `Assigned machines to PO ${po.poNumber}: ${machineIds.join(', ')}`,
      'PurchaseOrder',
      poId.toString()
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines assigned to purchase order successfully',
    data: {
      poId,
      assignedMachines: machineIds,
      count: assignments.count
    }
  });
};

/**
 * Remove machines from a purchase order
 */
export const removeMachinesFromPO = async (req: Request, res: Response) => {
  const { poId, machineIds } = req.body;

  if (!poId || !Array.isArray(machineIds) || machineIds.length === 0) {
    throw new AppError('Purchase Order ID and machine IDs are required', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase Order not found', 404);
  }

  // Remove machine assignments
  const result = await prisma.purchaseOrderMachine.deleteMany({
    where: {
      purchaseOrderId: poId,
      machineId: { in: machineIds }
    }
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.PO_UPDATED,
      `Removed machines from PO ${po.poNumber}: ${machineIds.join(', ')}`,
      'PurchaseOrder',
      poId.toString()
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines removed from purchase order successfully',
    data: {
      poId,
      removedMachines: machineIds,
      count: result.count
    }
  });
};

/**
 * Get all machines assigned to a purchase order
 */
export const getPOMachines = async (req: Request, res: Response) => {
  const { poId } = req.params;

  if (!poId) {
    throw new AppError('Purchase Order ID is required', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parseInt(poId) },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase Order not found', 404);
  }

  // Get PO's machine assignments
  const poMachines = await prisma.purchaseOrderMachine.findMany({
    where: { purchaseOrderId: parseInt(poId) },
    include: {
      machine: {
        select: {
          id: true,
          machineCode: true,
          machineType: true,
          description: true,
          status: true
        }
      }
    },
    orderBy: { assignedAt: 'desc' }
  });

  res.status(200).json({
    success: true,
    data: poMachines
  });
};