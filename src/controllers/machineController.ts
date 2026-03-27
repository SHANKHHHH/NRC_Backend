import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';
import { RoleManager } from '../utils/roleUtils';

/**
 * Create a new machine
 */
export const createMachine = async (req: Request, res: Response) => {
  const userRole = req.user?.role;
  if (!userRole || !RoleManager.canPerformProductionAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin, planner, or production_head', 403);
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
  const { status, machineType, isActive, page = '1', limit = '80' } = req.query;
  
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
        },
        jobStepMachines: {
          include: {
            jobStep: {
              include: {
                dispatchProcess: true
              }
            }
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
  const { machineType, page = '1', limit = '80' } = req.query;
  
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
  const { machineType, page = '1', limit = '80' } = req.query;
  
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
  if (!userRole || !RoleManager.canPerformProductionAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin, planner, or production_head', 403);
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
  if (!userRole || !RoleManager.canPerformProductionAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin, planner, or production_head', 403);
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
  if (!userRole || !RoleManager.canPerformProductionAction(userRole)) {
    throw new AppError('You are not authorized to perform this action. Required roles: admin, planner, or production_head', 403);
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

/**
 * Get machine work records with quantities produced and jobs worked.
 * Supports filter=today|yesterday|week|month|quarter|year|custom and custom startDate/endDate (YYYY-MM-DD).
 */
export const getMachineRecord = async (req: Request, res: Response) => {
  const filter = String(req.query.filter ?? 'today').toLowerCase();
  const customStart = typeof req.query.startDate === 'string' ? req.query.startDate : '';
  const customEnd = typeof req.query.endDate === 'string' ? req.query.endDate : '';
  const timezone = 'Asia/Kolkata';

  const toDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  const fromDateKey = (key: string) => {
    const [y, m, day] = key.split('-').map((x) => Number(x));
    return new Date(y, (m || 1) - 1, day || 1);
  };

  const now = new Date();
  let startKey = toDateKey(now);
  let endKey = toDateKey(now);

  switch (filter) {
    case 'yesterday': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      startKey = toDateKey(d);
      endKey = startKey;
      break;
    }
    case 'week': {
      const d = new Date(now);
      const dow = d.getDay();
      const mondayDiff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + mondayDiff);
      startKey = toDateKey(d);
      endKey = toDateKey(now);
      break;
    }
    case 'month':
      startKey = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
      endKey = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      break;
    case 'quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      startKey = toDateKey(new Date(now.getFullYear(), qStart, 1));
      endKey = toDateKey(new Date(now.getFullYear(), qStart + 3, 0));
      break;
    }
    case 'year':
      startKey = toDateKey(new Date(now.getFullYear(), 0, 1));
      endKey = toDateKey(new Date(now.getFullYear(), 11, 31));
      break;
    case 'custom':
      if (!customStart || !customEnd) {
        throw new AppError('startDate and endDate are required for custom filter', 400);
      }
      startKey = customStart;
      endKey = customEnd;
      break;
    case 'today':
    default:
      startKey = toDateKey(now);
      endKey = toDateKey(now);
      break;
  }

  const startAt = fromDateKey(startKey);
  const endAt = new Date(
    fromDateKey(endKey).getFullYear(),
    fromDateKey(endKey).getMonth(),
    fromDateKey(endKey).getDate(),
    23,
    59,
    59,
    999
  );

  const machines = await prisma.machine.findMany({
    where: { isActive: true },
    select: {
      id: true,
      machineCode: true,
      machineType: true,
      unit: true,
      description: true,
      status: true,
    },
    orderBy: { machineCode: 'asc' },
  });

  const byId = new Map<
    string,
    {
      machineId: string;
      machineCode: string;
      machineType: string;
      unit: string;
      description: string;
      status: string;
      totalQuantityProduced: number;
      totalJobsWorkedOn: number;
      totalStepsWorkedOn: number;
      jobs: Array<{
        jobPlanId: number | null;
        jobPlanCode: string | null;
        nrcJobNo: string;
        jobStatus: string | null;
        customerName: string | null;
        workedSteps: Array<{
          jobStepId: number | null;
          stepName: string;
          stepStatus: string | null;
          quantityProduced: number;
          workedAt: string | null;
          startDate: string | null;
          endDate: string | null;
        }>;
      }>;
    }
  >();

  const ensureMachine = (m: any) => {
    if (!byId.has(m.id)) {
      byId.set(m.id, {
        machineId: m.id,
        machineCode: m.machineCode,
        machineType: m.machineType,
        unit: m.unit,
        description: m.description,
        status: m.status,
        totalQuantityProduced: 0,
        totalJobsWorkedOn: 0,
        totalStepsWorkedOn: 0,
        jobs: [],
      });
    }
    return byId.get(m.id)!;
  };

  machines.forEach(ensureMachine);
  const machineByCode = new Map<string, any>();
  for (const m of machines) {
    if (m?.machineCode) machineByCode.set(String(m.machineCode), m);
  }

  const safeNum = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const pickFirstNumber = (...values: any[]): number =>
    values.map(safeNum).find((n): n is number => n != null && n >= 0) ?? 0;
  const normalizedStepName = (name: any) =>
    String(name ?? '')
      .trim()
      .toLowerCase();
  const toTime = (iso: string | null) => {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const buildStepMergeKey = (jobPlanId: number | null, nrcJobNo: string, stepName: string) =>
    `${jobPlanId ?? 'na'}|${nrcJobNo}|${normalizedStepName(stepName)}`;
  const buildJobKey = (jobPlanId: number | null, jobPlanCode: string | null, nrcJobNo: string) =>
    `${jobPlanId ?? 'na'}|${jobPlanCode ?? 'na'}|${nrcJobNo}`;

  const canonicalStepIdByPlanStep = new Map<string, number>();
  const getCanonicalStepId = (jobPlanId: number | null, stepName: string, fallback: number | null) => {
    if (!jobPlanId) return fallback;
    const key = `${jobPlanId}|${normalizedStepName(stepName)}`;
    return canonicalStepIdByPlanStep.get(key) ?? fallback;
  };
  const isCanonicalStepMatch = (
    jobPlanId: number | null,
    stepName: string,
    incomingStepId: number | null
  ) => {
    if (!jobPlanId || !incomingStepId) return true;
    const canonical = canonicalStepIdByPlanStep.get(`${jobPlanId}|${normalizedStepName(stepName)}`);
    if (!canonical) return true;
    return Number(canonical) === Number(incomingStepId);
  };

  const upsertWorkedStep = (
    job: {
      workedSteps: Array<{
        jobStepId: number | null;
        stepName: string;
        stepStatus: string | null;
        quantityProduced: number;
        workedAt: string | null;
        startDate: string | null;
        endDate: string | null;
      }>;
    },
    mergeKey: string,
    nextStep: {
      jobStepId: number | null;
      stepName: string;
      stepStatus: string | null;
      quantityProduced: number;
      workedAt: string | null;
      startDate: string | null;
      endDate: string | null;
    }
  ) => {
    const idx = job.workedSteps.findIndex((s: any) => (s as any).__mergeKey === mergeKey);
    if (idx === -1) {
      job.workedSteps.push({ ...(nextStep as any), __mergeKey: mergeKey } as any);
      return;
    }

    const prev = job.workedSteps[idx] as any;
    const prevTime = toTime(prev.workedAt ?? prev.endDate ?? prev.startDate ?? null);
    const nextTime = toTime(nextStep.workedAt ?? nextStep.endDate ?? nextStep.startDate ?? null);
    const useNext = nextTime >= prevTime;

    prev.jobStepId = nextStep.jobStepId ?? prev.jobStepId;
    prev.stepName = nextStep.stepName || prev.stepName;
    prev.stepStatus = useNext ? nextStep.stepStatus ?? prev.stepStatus : prev.stepStatus;
    prev.quantityProduced = useNext ? nextStep.quantityProduced : prev.quantityProduced;
    prev.workedAt = useNext ? nextStep.workedAt : prev.workedAt;
    prev.startDate = useNext ? nextStep.startDate : prev.startDate;
    prev.endDate = useNext ? nextStep.endDate : prev.endDate;
    job.workedSteps[idx] = prev;
  };

  // Active/in-progress records
  const activeMachineWork = await prisma.jobStepMachine.findMany({
    where: {
      OR: [
        { startedAt: { gte: startAt, lte: endAt } },
        { completedAt: { gte: startAt, lte: endAt } },
      ],
    },
    include: {
      machine: true,
      jobStep: {
        include: {
          jobPlanning: {
            include: {
              purchaseOrder: { select: { customer: true } },
            },
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
      },
      job: {
        select: { status: true, customerName: true, nrcJobNo: true },
      },
    },
  });

  for (const row of activeMachineWork) {
    if (!row.machine) continue;
    const target = ensureMachine(row.machine);

    // Step quantity often lives in step detail table (printingDetails/punching/etc.) when status is stop.
    const qty = pickFirstNumber(
      (row as any).jobStep?.dispatchProcess?.totalDispatchedQty,
      (row as any).jobStep?.dispatchProcess?.quantity,
      (row as any).jobStep?.printingDetails?.quantity,
      (row as any).jobStep?.corrugation?.quantity,
      (row as any).jobStep?.flutelam?.quantity,
      (row as any).jobStep?.punching?.quantity,
      (row as any).jobStep?.sideFlapPasting?.quantity,
      (row as any).jobStep?.qualityDept?.quantity,
      (row as any).jobStep?.paperStore?.quantity,
      (row as any).quantityOK,
      (row as any).quantity,
      (row as any).okQuantity,
      (row as any).requiredQty,
      (row as any).availableQty,
      (row as any).sheetsCount,
      (row as any).formData?.quantity,
      (row as any).formData?.qty,
      (row as any).formData?.quantityOK,
      (row as any).formData?.okQuantity
    );

    const nrcJobNo = row.jobStep?.jobPlanning?.nrcJobNo ?? row.nrcJobNo ?? 'N/A';
    const jobPlanId = row.jobStep?.jobPlanning?.jobPlanId ?? null;
    const jobPlanCode = (row.jobStep?.jobPlanning as any)?.jobPlanCode ?? null;
    const rowJobKey = buildJobKey(jobPlanId, jobPlanCode, nrcJobNo);
    let job = target.jobs.find(
      (j) => buildJobKey(j.jobPlanId ?? null, j.jobPlanCode ?? null, j.nrcJobNo) === rowJobKey
    );
    if (!job) {
      job = {
        jobPlanId,
        jobPlanCode,
        nrcJobNo,
        jobStatus: (row.job as any)?.status ?? 'ACTIVE',
        customerName:
          (row.job as any)?.customerName ??
          row.jobStep?.jobPlanning?.purchaseOrder?.customer ??
          null,
        workedSteps: [],
      };
      target.jobs.push(job);
    }

    const stepName = row.jobStep?.stepName ?? `Step ${row.stepNo ?? ''}`.trim();
    const incomingStepId = row.jobStepId ? Number(row.jobStepId) : null;
    if (!isCanonicalStepMatch(job.jobPlanId, stepName, incomingStepId)) {
      continue;
    }
    const canonicalStepId = getCanonicalStepId(
      row.jobStep?.jobPlanningId ?? row.jobStep?.jobPlanning?.jobPlanId ?? null,
      stepName,
      incomingStepId
    );
    upsertWorkedStep(job, buildStepMergeKey(job.jobPlanId, nrcJobNo, stepName), {
      jobStepId: canonicalStepId,
      stepName,
      stepStatus: row.status ?? null,
      quantityProduced: qty,
      workedAt: row.completedAt ? row.completedAt.toISOString() : row.startedAt ? row.startedAt.toISOString() : null,
      startDate: row.startedAt ? row.startedAt.toISOString() : null,
      endDate: row.completedAt ? row.completedAt.toISOString() : null,
    });
  }

  // Corrugation-table fallback: captures accepted rows that may not yet be reflected
  // in jobStepMachine/completed snapshots.
  const corrRows = await prisma.corrugation.findMany({
    where: { date: { gte: startAt, lte: endAt } },
    include: {
      jobStep: {
        include: {
          jobPlanning: {
            include: {
              purchaseOrder: { select: { customer: true } },
            },
          },
        },
      },
      job: { select: { status: true, customerName: true, nrcJobNo: true } },
    },
  });

  for (const row of corrRows) {
    const machine = row.machineNo ? machineByCode.get(String(row.machineNo)) : null;
    if (!machine) continue;
    const target = ensureMachine(machine);

    const nrcJobNo =
      row.jobStep?.jobPlanning?.nrcJobNo ?? row.jobNrcJobNo ?? (row.job as any)?.nrcJobNo ?? 'N/A';
    const jobPlanId = row.jobStep?.jobPlanning?.jobPlanId ?? null;
    const jobPlanCode = (row.jobStep?.jobPlanning as any)?.jobPlanCode ?? null;
    const stepName = row.jobStep?.stepName ?? 'Corrugation';
    const incomingStepId = row.jobStepId ? Number(row.jobStepId) : null;
    if (!isCanonicalStepMatch(jobPlanId, stepName, incomingStepId)) continue;

    const rowJobKey = buildJobKey(jobPlanId, jobPlanCode, nrcJobNo);
    let job = target.jobs.find(
      (j) => buildJobKey(j.jobPlanId ?? null, j.jobPlanCode ?? null, j.nrcJobNo) === rowJobKey
    );
    if (!job) {
      job = {
        jobPlanId,
        jobPlanCode,
        nrcJobNo,
        jobStatus: (row.job as any)?.status ?? 'ACTIVE',
        customerName:
          (row.job as any)?.customerName ??
          row.jobStep?.jobPlanning?.purchaseOrder?.customer ??
          null,
        workedSteps: [],
      };
      target.jobs.push(job);
    }

    const canonicalStepId = getCanonicalStepId(jobPlanId, stepName, incomingStepId);
    upsertWorkedStep(job, buildStepMergeKey(job.jobPlanId, nrcJobNo, stepName), {
      jobStepId: canonicalStepId,
      stepName,
      stepStatus: row.status ? String(row.status) : null,
      quantityProduced: Number(row.quantity ?? 0),
      workedAt: row.date ? row.date.toISOString() : null,
      startDate: row.jobStep?.startDate ? row.jobStep.startDate.toISOString() : null,
      endDate: row.jobStep?.endDate ? row.jobStep.endDate.toISOString() : null,
    });
  }

  // Completed jobs history (important because JobStepMachine rows may be deleted after completion)
  const completedJobs = await prisma.completedJob.findMany({
    where: { completedAt: { gte: startAt, lte: endAt } },
    select: {
      nrcJobNo: true,
      jobPlanId: true,
      jobPlanCode: true,
      allSteps: true,
      allStepDetails: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const jobPlanIdSet = new Set<number>();
  for (const row of activeMachineWork) {
    const pId = Number((row as any)?.jobStep?.jobPlanningId ?? (row as any)?.jobStep?.jobPlanning?.jobPlanId);
    if (Number.isFinite(pId)) jobPlanIdSet.add(pId);
  }
  for (const cj of completedJobs) {
    const pId = Number((cj as any)?.jobPlanId);
    if (Number.isFinite(pId)) jobPlanIdSet.add(pId);
  }
  if (jobPlanIdSet.size > 0) {
    const plans = await prisma.jobPlanning.findMany({
      where: { jobPlanId: { in: Array.from(jobPlanIdSet) } },
      select: {
        jobPlanId: true,
        steps: { select: { id: true, stepName: true } },
      },
    });
    for (const p of plans) {
      for (const st of p.steps) {
        canonicalStepIdByPlanStep.set(
          `${p.jobPlanId}|${normalizedStepName((st as any).stepName)}`,
          Number((st as any).id)
        );
      }
    }
  }

  const safeArray = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  for (const cj of completedJobs) {
    const allSteps = safeArray(cj.allSteps);
    const allStepDetails = (cj as any).allStepDetails ?? {};
    const detailKeys = [
      'paperStore',
      'printingDetails',
      'corrugation',
      'flutelam',
      'punching',
      'sideFlapPasting',
      'qualityDept',
      'dispatchProcess',
    ];

    const detailByStepId = new Map<number, any>();
    for (const key of detailKeys) {
      const rows = safeArray((allStepDetails as any)?.[key]);
      for (const r of rows) {
        const sid = Number((r as any)?.jobStepId ?? (r as any)?.id);
        if (Number.isFinite(sid)) detailByStepId.set(sid, r);
      }
    }

    for (const s of allSteps) {
      const md = safeArray((s as any)?.machineDetails);
      const first = md[0] ?? null;
      const sid = Number((s as any)?.id ?? (s as any)?.jobStepId);
      const stepDetail = Number.isFinite(sid) ? detailByStepId.get(sid) : null;
      const machineId =
        first?.machineId != null
          ? String(first.machineId)
          : (stepDetail as any)?.machineId != null
          ? String((stepDetail as any).machineId)
          : null;
      if (!machineId || !byId.has(machineId)) continue;
      const target = byId.get(machineId)!;

      const qty = pickFirstNumber(
        (stepDetail as any)?.totalDispatchedQty,
        (stepDetail as any)?.quantity,
        (s as any)?.quantity,
        (s as any)?.quantityOK,
        (s as any)?.okQuantity,
        first?.quantity,
        first?.quantityOK,
        first?.formData?.quantity,
        first?.formData?.qty,
        first?.formData?.quantityOK
      );

      const cjJobKey = buildJobKey(cj.jobPlanId ?? null, cj.jobPlanCode ?? null, cj.nrcJobNo);
      let job = target.jobs.find(
        (j) => buildJobKey(j.jobPlanId ?? null, j.jobPlanCode ?? null, j.nrcJobNo) === cjJobKey
      );
      if (!job) {
        job = {
          jobPlanId: cj.jobPlanId ?? null,
          jobPlanCode: cj.jobPlanCode ?? null,
          nrcJobNo: cj.nrcJobNo,
          jobStatus: 'INACTIVE',
          customerName: null,
          workedSteps: [],
        };
        target.jobs.push(job);
      }

      const stepName = (s as any)?.stepName ?? 'Unknown';
      const incomingStepId = Number.isFinite(sid) ? sid : null;
      if (!isCanonicalStepMatch(job.jobPlanId, stepName, incomingStepId)) {
        continue;
      }
      const canonicalStepId = getCanonicalStepId(
        cj.jobPlanId ?? null,
        stepName,
        incomingStepId
      );
      upsertWorkedStep(job, buildStepMergeKey(job.jobPlanId, cj.nrcJobNo, stepName), {
        jobStepId: canonicalStepId,
        stepName,
        stepStatus: (s as any)?.status ?? null,
        quantityProduced: qty,
        workedAt: (s as any)?.endDate
          ? new Date((s as any).endDate).toISOString()
          : (s as any)?.updatedAt
          ? new Date((s as any).updatedAt).toISOString()
          : cj.updatedAt.toISOString(),
        startDate: (s as any)?.startDate ? new Date((s as any).startDate).toISOString() : null,
        endDate: (s as any)?.endDate ? new Date((s as any).endDate).toISOString() : null,
      });
    }
  }

  const data = Array.from(byId.values()).map((m) => ({
    ...m,
    totalJobsWorkedOn: new Set(m.jobs.map((j) => `${j.jobPlanId ?? 'na'}|${j.nrcJobNo}`)).size,
    totalStepsWorkedOn: m.jobs.reduce((acc, j) => acc + j.workedSteps.length, 0),
    totalQuantityProduced: m.jobs.reduce(
      (acc, j) => acc + j.workedSteps.reduce((s, ws) => s + Number(ws.quantityProduced ?? 0), 0),
      0
    ),
    jobs: m.jobs.map((j) => ({
      ...j,
      workedSteps: j.workedSteps
        .map((ws: any) => {
          const { __mergeKey, ...clean } = ws;
          return clean;
        })
        .sort((a, b) => String(b.workedAt ?? '').localeCompare(String(a.workedAt ?? ''))),
    })),
  }));

  res.status(200).json({
    success: true,
    message: 'Machine record fetched',
    data: {
      period: {
        startDate: startKey,
        endDate: endKey,
        timezone,
      },
      machines: data,
    },
  });
};