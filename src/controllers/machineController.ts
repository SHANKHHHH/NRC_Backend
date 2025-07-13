import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Create a new machine
 */
export const createMachine = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'production_head') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { unit, machineCode, machineType, description, type, capacity, remarks } = req.body;

  // Validate required fields
  if (!unit || !machineCode || !machineType || !description || !type || !capacity) {
    throw new AppError('Unit, Machine Code, Machine Type, Description, Type, and Capacity are required', 400);
  }

  // Note: Machine code is not unique, so multiple machines can have the same code
  // This allows for multiple machines of the same type in different units

  const machine = await prisma.machine.create({
    data: {
      unit,
      machineCode,
      machineType,
      description,
      type,
      capacity,
      remarks,
    },
  });

  // Log the machine creation action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.MACHINE_CREATED,
      `Created machine: ${machineCode} - ${description}`,
      'Machine',
      machine.id
    );
  }

  res.status(201).json({
    success: true,
    data: machine,
    message: 'Machine created successfully',
  });
};

/**
 * Get all machines with optional filtering
 */
export const getAllMachines = async (req: Request, res: Response) => {
  const { status, machineType, isActive, page = '1', limit = '50' } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: any = {};
  
  if (status) {
    where.status = status;
  }
  
  if (machineType) {
    where.machineType = {
      contains: machineType as string,
      mode: 'insensitive'
    };
  }
  
  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      include: {
        jobs: {
          select: {
            id: true,
            nrcJobNo: true,
            customerName: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.machine.count({ where })
  ]);

  res.status(200).json({
    success: true,
    count: machines.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    data: machines,
  });
};

/**
 * Get available machines (status = available)
 */
export const getAvailableMachines = async (req: Request, res: Response) => {
  const { machineType, page = '1', limit = '50' } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    status: 'available',
    isActive: true
  };
  
  if (machineType) {
    where.machineType = {
      contains: machineType as string,
      mode: 'insensitive'
    };
  }

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      select: {
        id: true,
        unit: true,
        machineCode: true,
        machineType: true,
        description: true,
        type: true,
        capacity: true,
        remarks: true,
        status: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { machineCode: 'asc' },
      skip,
      take: limitNum
    }),
    prisma.machine.count({ where })
  ]);

  res.status(200).json({
    success: true,
    count: machines.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    data: machines,
  });
};

/**
 * Get busy machines (status = busy)
 */
export const getBusyMachines = async (req: Request, res: Response) => {
  const { machineType, page = '1', limit = '50' } = req.query;
  
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {
    status: 'busy',
    isActive: true
  };
  
  if (machineType) {
    where.machineType = {
      contains: machineType as string,
      mode: 'insensitive'
    };
  }

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      include: {
        jobs: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            nrcJobNo: true,
            customerName: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 1 // Get the most recent active job
        }
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.machine.count({ where })
  ]);

  res.status(200).json({
    success: true,
    count: machines.length,
    total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    },
    data: machines,
  });
};

/**
 * Get machine by ID
 */
export const getMachineById = async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const machine = await prisma.machine.findUnique({
    where: { id },
    include: {
      jobs: {
        select: {
          id: true,
          nrcJobNo: true,
          customerName: true,
          status: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!machine) {
    throw new AppError('Machine not found', 404);
  }

  res.status(200).json({
    success: true,
    data: machine,
  });
};

/**
 * Update machine
 */
export const updateMachine = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'production_head') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { id } = req.params;
  
  // Check if machine exists
  const existingMachine = await prisma.machine.findUnique({
    where: { id }
  });

  if (!existingMachine) {
    throw new AppError('Machine not found', 404);
  }

  // Note: Machine code is not unique, so no duplicate check is needed
  // Multiple machines can have the same machine code

  const machine = await prisma.machine.update({
    where: { id },
    data: req.body,
  });

  // Log the machine update action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.MACHINE_UPDATED,
      `Updated machine: ${machine.machineCode} - ${machine.description}`,
      'Machine',
      machine.id
    );
  }

  res.status(200).json({
    success: true,
    data: machine,
    message: 'Machine updated successfully',
  });
};

/**
 * Update machine status
 */
export const updateMachineStatus = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin' && userRole !== 'production_head') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['available', 'busy'].includes(status)) {
    throw new AppError('Valid status (available or busy) is required', 400);
  }

  const machine = await prisma.machine.update({
    where: { id },
    data: { status },
  });

  // Log the machine status update action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.MACHINE_STATUS_UPDATED,
      `Updated machine status to: ${status}`,
      'Machine',
      machine.id
    );
  }

  res.status(200).json({
    success: true,
    data: machine,
    message: `Machine status updated to ${status}`,
  });
};

/**
 * Delete machine (soft delete by setting isActive to false)
 */
export const deleteMachine = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (userRole !== 'admin') {
    throw new AppError('You are not authorized to perform this action', 403);
  }

  const { id } = req.params;
  
  const machine = await prisma.machine.update({
    where: { id },
    data: { isActive: false },
  });

  // Log the machine deletion action
  if (req.user?.userId) {
    await logUserActionWithResource(
      req.user.userId,
      ActionTypes.MACHINE_DELETED,
      `Deactivated machine: ${machine.machineCode}`,
      'Machine',
      machine.id
    );
  }

  res.status(200).json({
    success: true,
    data: machine,
    message: 'Machine deactivated successfully',
  });
};

/**
 * Get machine statistics
 */
export const getMachineStats = async (req: Request, res: Response) => {
  const [totalMachines, availableMachines, busyMachines, inactiveMachines] = await Promise.all([
    prisma.machine.count(),
    prisma.machine.count({ where: { status: 'available', isActive: true } }),
    prisma.machine.count({ where: { status: 'busy', isActive: true } }),
    prisma.machine.count({ where: { isActive: false } })
  ]);

  // Get machines by type
  const machinesByType = await prisma.machine.groupBy({
    by: ['machineType'],
    _count: { machineType: true },
    where: { isActive: true },
    orderBy: { _count: { machineType: 'desc' } }
  });

  // Get machines by unit
  const machinesByUnit = await prisma.machine.groupBy({
    by: ['unit'],
    _count: { unit: true },
    where: { isActive: true },
    orderBy: { _count: { unit: 'desc' } }
  });

  res.status(200).json({
    success: true,
    data: {
      summary: {
        total: totalMachines,
        available: availableMachines,
        busy: busyMachines,
        inactive: inactiveMachines
      },
      byType: machinesByType,
      byUnit: machinesByUnit
    }
  });
}; 