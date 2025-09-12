import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

<<<<<<< Updated upstream
=======
// Get all purchase orders
export const getAllPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const userMachineIds = req.userMachineIds; // From middleware
    
    const whereClause: any = {};
    if (userMachineIds !== null && userMachineIds && userMachineIds.length > 0) {
      whereClause.OR = [
        // Direct PO-machine assignments
        {
          purchaseOrderMachines: {
            some: {
              machineId: { in: userMachineIds }
            }
          }
        },
        // POs linked to jobs on user's machines
        {
          job: {
            machineId: { in: userMachineIds }
          }
        }
      ];
    }
    
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        job: {
          select: {
            nrcJobNo: true,
            customerName: true,
            styleItemSKU: true,
            machineId: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        purchaseOrderMachines: {
          include: {
            machine: {
              select: {
                id: true,
                machineCode: true,
                machineType: true
              }
            }
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      count: purchaseOrders.length,
      data: purchaseOrders,
    });
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
>>>>>>> Stashed changes

export const createPurchaseOrder = async (req: Request, res: Response) => {
  const data = req.body;
  const { machineIds, ...poData } = data;
  
  // Validate required field
  if (!poData.customer || typeof poData.customer !== 'string' || !poData.customer.trim()) {
    throw new AppError('Customer is required and must be a non-empty string', 400);
  }
  
  // Only pass allowed fields to Prisma
  const allowedFields = [
    'boardSize', 'customer', 'deliveryDate', 'dieCode', 'dispatchDate', 'dispatchQuantity',
    'fluteType', 'jockeyMonth', 'noOfUps', 'nrcDeliveryDate', 'noOfSheets', 'poDate',
    'poNumber', 'pendingQuantity', 'pendingValidity', 'plant', 'shadeCardApprovalDate',
    'srNo', 'style', 'totalPOQuantity', 'unit', 'userId'
  ];
  const createData: any = { status: 'created' };
  for (const field of allowedFields) {
    if (poData[field] !== undefined) {
      createData[field] = poData[field];
    }
  }
<<<<<<< Updated upstream
=======
  
  // Calculate shared card diff date
  createData.sharedCardDiffDate = calculateSharedCardDiffDate(poData.shadeCardApprovalDate);
  
>>>>>>> Stashed changes
  const purchaseOrder = await prisma.purchaseOrder.create({ data: createData });
  
  // Assign machines to PO if provided
  if (machineIds && Array.isArray(machineIds) && machineIds.length > 0) {
    // Validate machines exist
    const machines = await prisma.machine.findMany({
      where: { id: { in: machineIds } },
      select: { id: true }
    });
    
    if (machines.length !== machineIds.length) {
      const foundIds = machines.map(m => m.id);
      const missingIds = machineIds.filter(id => !foundIds.includes(id));
      throw new AppError(`Machines not found: ${missingIds.join(', ')}`, 404);
    }
    
    // Create machine assignments
    await prisma.purchaseOrderMachine.createMany({
      data: machineIds.map((machineId: string) => ({
        purchaseOrderId: purchaseOrder.id,
        machineId: machineId,
        assignedBy: req.user?.userId
      }))
    });
  }
  
  res.status(201).json({ 
    success: true,
    data: { ...purchaseOrder, assignedMachines: machineIds || [] },
    message: 'Purchase order created successfully',
  });
};


export const updatePurchaseOrderStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) throw new AppError('Status is required', 400);
  if (!['created', 'approved'].includes(status)) throw new AppError('Invalid status value', 400);

  // Update only the status field
  const purchaseOrder = await prisma.purchaseOrder.update({
    where: { id: Number(id) },
    data: { status: status as any },
  });

  let job = null;
  if (status === 'approved') {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) } });
    if (!po) throw new AppError('Purchase order not found', 404);

    // Use po.customer for customerName
    const customerPrefix = po.customer.replace(/\s+/g, '').substring(0, 3).toUpperCase();
    // Get current year and month
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Month with leading zero
    // Get serial number for this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const existingJobsThisMonth = await prisma.job.count({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        customerName: po.customer,
      },
    });
    const serialNumber = (existingJobsThisMonth + 1).toString().padStart(2, '0');
    // Format: SAK24-01-01 (Customer-Year-Month-Serial) - using hyphens instead of slashes
    const generatedNrcJobNo = `${customerPrefix}${year}-${month}-${serialNumber}`;

    job = await prisma.job.create({
      data: {
        nrcJobNo: generatedNrcJobNo,
        styleItemSKU: po.style || '',
        customerName: po.customer,
        fluteType: po.fluteType || undefined,
        boardSize: po.boardSize || undefined,
        noUps: po.noOfUps || undefined,
        srNo: po.srNo || undefined,
        shadeCardApprovalDate: po.shadeCardApprovalDate || undefined,
        diePunchCode: po.dieCode || undefined,
        purchaseOrder: { connect: { id: po.id } },
      },
    });
  }

  res.status(200).json({
    success: true,
    data: purchaseOrder,
    ...(job && { job }),
    message: job ? 'Purchase order status updated and job created.' : 'Purchase order status updated.',
  });
}; 