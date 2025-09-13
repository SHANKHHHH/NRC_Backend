import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Assign machines to a user
 */
export const assignMachinesToUser = async (req: Request, res: Response) => {
  const { userId, machineIds } = req.body;

  if (!userId || !machineIds || !Array.isArray(machineIds)) {
    throw new AppError('userId and machineIds array are required', 400);
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

  // Check for existing assignments
  const existingAssignments = await prisma.userMachine.findMany({
    where: {
      userId,
      machineId: { in: machineIds }
    },
    select: { machineId: true }
  });

  const existingMachineIds = existingAssignments.map(em => em.machineId);
  const newMachineIds = machineIds.filter(id => !existingMachineIds.includes(id));

  if (newMachineIds.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'All machines are already assigned to this user',
      data: { assignedMachines: machineIds }
    });
  }

  // Create new assignments
  await prisma.userMachine.createMany({
    data: newMachineIds.map(machineId => ({
      userId,
      machineId,
      assignedBy: req.user?.userId
    }))
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.USER_UPDATED,
      `Assigned machines to user ${user.email}: ${newMachineIds.join(', ')}`,
      'User',
      userId
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines assigned successfully',
    data: { 
      assignedMachines: machineIds,
      newlyAssigned: newMachineIds
    }
  });
};

/**
 * Remove machines from a user
 */
export const removeMachinesFromUser = async (req: Request, res: Response) => {
  const { userId, machineIds } = req.body;

  if (!userId || !machineIds || !Array.isArray(machineIds)) {
    throw new AppError('userId and machineIds array are required', 400);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Remove assignments
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
      removedCount: result.count,
      removedMachines: machineIds
    }
  });
};

/**
 * Get all machines assigned to a user
 */
export const getUserMachines = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const userMachines = await prisma.userMachine.findMany({
    where: { 
      userId,
      isActive: true 
    },
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
    data: {
      user: {
        id: user.id,
        email: user.email
      },
      assignedMachines: userMachines.map(um => ({
        id: um.id,
        assignedAt: um.assignedAt,
        assignedBy: um.assignedBy,
        isActive: um.isActive,
        machine: um.machine
      }))
    }
  });
};

/**
 * Assign machines to a purchase order
 */
export const assignMachinesToPO = async (req: Request, res: Response) => {
  const { purchaseOrderId, machineIds } = req.body;

  if (!purchaseOrderId || !machineIds || !Array.isArray(machineIds)) {
    throw new AppError('purchaseOrderId and machineIds array are required', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase order not found', 404);
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

  // Check for existing assignments
  const existingAssignments = await prisma.purchaseOrderMachine.findMany({
    where: {
      purchaseOrderId,
      machineId: { in: machineIds }
    },
    select: { machineId: true }
  });

  const existingMachineIds = existingAssignments.map(em => em.machineId);
  const newMachineIds = machineIds.filter(id => !existingMachineIds.includes(id));

  if (newMachineIds.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'All machines are already assigned to this purchase order',
      data: { assignedMachines: machineIds }
    });
  }

  // Create new assignments
  await prisma.purchaseOrderMachine.createMany({
    data: newMachineIds.map(machineId => ({
      purchaseOrderId,
      machineId,
      assignedBy: req.user?.userId
    }))
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.PO_UPDATED,
      `Assigned machines to PO ${po.poNumber || po.id}: ${newMachineIds.join(', ')}`,
      'PurchaseOrder',
      purchaseOrderId.toString()
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines assigned to purchase order successfully',
    data: { 
      assignedMachines: machineIds,
      newlyAssigned: newMachineIds
    }
  });
};

/**
 * Remove machines from a purchase order
 */
export const removeMachinesFromPO = async (req: Request, res: Response) => {
  const { purchaseOrderId, machineIds } = req.body;

  if (!purchaseOrderId || !machineIds || !Array.isArray(machineIds)) {
    throw new AppError('purchaseOrderId and machineIds array are required', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase order not found', 404);
  }

  // Remove assignments
  const result = await prisma.purchaseOrderMachine.deleteMany({
    where: {
      purchaseOrderId,
      machineId: { in: machineIds }
    }
  });

  // Log the action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.PO_UPDATED,
      `Removed machines from PO ${po.poNumber || po.id}: ${machineIds.join(', ')}`,
      'PurchaseOrder',
      purchaseOrderId.toString()
    );
  }

  res.status(200).json({
    success: true,
    message: 'Machines removed from purchase order successfully',
    data: { 
      removedCount: result.count,
      removedMachines: machineIds
    }
  });
};

/**
 * Get all machines assigned to a purchase order
 */
export const getPOMachines = async (req: Request, res: Response) => {
  const { poId } = req.params;

  if (!poId) {
    throw new AppError('poId is required', 400);
  }

  const poIdNum = parseInt(poId);
  if (isNaN(poIdNum)) {
    throw new AppError('Invalid poId', 400);
  }

  // Validate PO exists
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poIdNum },
    select: { id: true, poNumber: true }
  });

  if (!po) {
    throw new AppError('Purchase order not found', 404);
  }

  const poMachines = await prisma.purchaseOrderMachine.findMany({
    where: { purchaseOrderId: poIdNum },
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
    data: {
      purchaseOrder: {
        id: po.id,
        poNumber: po.poNumber
      },
      assignedMachines: poMachines.map(pom => ({
        id: pom.id,
        assignedAt: pom.assignedAt,
        assignedBy: pom.assignedBy,
        machine: pom.machine
      }))
    }
  });
};
