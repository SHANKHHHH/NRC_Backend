import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware';

type DateFilterType =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseDateKeyToLocalRange = (key: string) => {
  const [y, m, day] = key.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, day || 1);
};

const getDateRange = (
  filter: string | undefined,
  customRange?: { start?: string; end?: string }
) => {
  const today = new Date();
  const f = (filter ?? 'today') as DateFilterType;

  switch (f) {
    case 'today': {
      const startKey = toDateKey(
        new Date(today.getFullYear(), today.getMonth(), today.getDate())
      );
      return {
        startKey,
        endKey: startKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(startKey).getFullYear(),
          parseDateKeyToLocalRange(startKey).getMonth(),
          parseDateKeyToLocalRange(startKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'yesterday': {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      const key = toDateKey(d);
      return {
        startKey: key,
        endKey: key,
        startAt: parseDateKeyToLocalRange(key),
        endAt: new Date(
          parseDateKeyToLocalRange(key).getFullYear(),
          parseDateKeyToLocalRange(key).getMonth(),
          parseDateKeyToLocalRange(key).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'week': {
      // Same behavior as frontend: week starts Monday, ends at "today"
      const start = new Date(today);
      const dow = today.getDay();
      const mondayDiff = dow === 0 ? -6 : 1 - dow;
      start.setDate(today.getDate() + mondayDiff);

      const startKey = toDateKey(start);
      const endKey = toDateKey(today);
      return {
        startKey,
        endKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(endKey).getFullYear(),
          parseDateKeyToLocalRange(endKey).getMonth(),
          parseDateKeyToLocalRange(endKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const startKey = toDateKey(start);
      const endKey = toDateKey(end);
      return {
        startKey,
        endKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(endKey).getFullYear(),
          parseDateKeyToLocalRange(endKey).getMonth(),
          parseDateKeyToLocalRange(endKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'quarter': {
      const qStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), qStartMonth, 1);
      const end = new Date(today.getFullYear(), qStartMonth + 3, 0);
      const startKey = toDateKey(start);
      const endKey = toDateKey(end);
      return {
        startKey,
        endKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(endKey).getFullYear(),
          parseDateKeyToLocalRange(endKey).getMonth(),
          parseDateKeyToLocalRange(endKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      const startKey = toDateKey(start);
      const endKey = toDateKey(end);
      return {
        startKey,
        endKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(endKey).getFullYear(),
          parseDateKeyToLocalRange(endKey).getMonth(),
          parseDateKeyToLocalRange(endKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    case 'custom': {
      const startKey = customRange?.start;
      const endKey = customRange?.end;
      if (!startKey || !endKey) return null;
      return {
        startKey,
        endKey,
        startAt: parseDateKeyToLocalRange(startKey),
        endAt: new Date(
          parseDateKeyToLocalRange(endKey).getFullYear(),
          parseDateKeyToLocalRange(endKey).getMonth(),
          parseDateKeyToLocalRange(endKey).getDate(),
          23,
          59,
          59,
          999
        ),
      };
    }

    default:
      return null;
  }
};

const mapMachineStatusToStepStatus = (
  status: string | null | undefined
):
  | 'accept'
  | 'in_progress'
  | 'hold'
  | 'planned' => {
  const s = (status ?? '').toLowerCase();
  if (s === 'in_progress' || s === 'in progress') return 'in_progress';
  if (s === 'hold' || s === 'major_hold') return 'hold';
  if (s === 'stop' || s === 'completed' || s === 'accept') return 'accept';
  return 'planned';
};

const mapStepStatusToStepStatus = (
  status: string | null | undefined
):
  | 'accept'
  | 'in_progress'
  | 'hold'
  | 'planned' => {
  const s = (status ?? '').toLowerCase();
  if (s === 'in_progress' || s === 'in progress') return 'in_progress';
  if (s === 'hold' || s === 'major_hold') return 'hold';
  if (s === 'accept' || s === 'stop') return 'accept';
  return 'planned';
};

const safeJsonArray = (value: unknown): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const safeToNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pickPlannedQty = (obj: any): number | null => {
  // Supports both:
  // - jobStepMachine records (quantity stored on obj.formData)
  // - CompletedJob step JSON (quantity stored directly on the step OR inside machineDetails[0])
  const candidates: any[] = [];

  const fd = obj?.formData ?? {};
  candidates.push(
    fd?.quantity,
    fd?.qty,
    fd?.quantityOK,
    fd?.okQuantity,
    fd?.requiredQty,
    fd?.availableQty,
    fd?.sheetsCount,
    fd?.finishedGoodsQty
  );

  candidates.push(
    obj?.quantityOK,
    obj?.quantity, // generic
    obj?.requiredQty,
    obj?.availableQty,
    obj?.okQuantity,
    obj?.sheetsCount,
    obj?.rejectedQty
  );

  // CompletedJob uses nested step detail objects directly on JobStep:
  // e.g. rawStep.punching.quantity, rawStep.printingDetails.quantity, etc.
  const nested = [
    "paperStore",
    "printingDetails",
    "corrugation",
    "flutelam",
    "punching",
    "sideFlapPasting",
    "qualityDept",
    "dispatchProcess",
  ];
  for (const key of nested) {
    const rel = obj?.[key];
    if (!rel) continue;
    candidates.push(
      rel?.quantity,
      rel?.quantityOK,
      rel?.okQuantity,
      rel?.requiredQty,
      rel?.availableQty,
      rel?.sheetsCount,
      rel?.finishedGoodsQty,
      rel?.totalPOQuantity
    );
  }

  const machineDetails = safeJsonArray(obj?.machineDetails);
  for (const md of machineDetails) {
    const mfd = md?.formData ?? {};
    candidates.push(
      mfd?.quantity,
      mfd?.qty,
      mfd?.quantityOK,
      mfd?.okQuantity,
      mfd?.requiredQty,
      mfd?.availableQty,
      mfd?.sheetsCount,
      mfd?.finishedGoodsQty
    );
    candidates.push(
      md?.quantityOK,
      md?.quantity,
      md?.requiredQty,
      md?.availableQty,
      md?.okQuantity,
      md?.sheetsCount,
      md?.rejectedQty
    );
  }
  for (const c of candidates) {
    const n = safeToNumber(c);
    if (n !== null) return n;
  }
  return null;
};

const pickWastageQty = (obj: any): number | null => {
  const candidates: any[] = [];

  const fd = obj?.formData ?? {};
  candidates.push(fd?.wastageQty, fd?.wastage);
  candidates.push(obj?.wastageQty, obj?.wastage);

  // Nested CompletedJob step details
  const nested = [
    "printingDetails",
    "flutelam",
    "punching",
    "sideFlapPasting",
    "qualityDept",
  ];
  for (const key of nested) {
    const rel = obj?.[key];
    if (!rel) continue;
    candidates.push(rel?.wastageQty, rel?.wastage);
    // qualityDept doesn't use "wastage"; it has rejectedQty
    if (key === "qualityDept") candidates.push(rel?.rejectedQty);
  }

  const machineDetails = safeJsonArray(obj?.machineDetails);
  for (const md of machineDetails) {
    const mfd = md?.formData ?? {};
    candidates.push(mfd?.wastageQty, mfd?.wastage);
    candidates.push(md?.wastageQty, md?.wastage);
  }

  for (const c of candidates) {
    const n = safeToNumber(c);
    if (n !== null) return n;
  }
  return null;
};

export const getUserRecord = async (req: Request, res: Response) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'today';
  const customer =
    typeof req.query.customer === 'string' && req.query.customer.trim()
      ? req.query.customer.trim()
      : undefined;
  const unit =
    typeof req.query.unit === 'string' && req.query.unit.trim()
      ? req.query.unit.trim()
      : undefined;

  const customStart =
    typeof req.query.startDate === 'string' && req.query.startDate.trim()
      ? req.query.startDate.trim()
      : undefined;
  const customEnd =
    typeof req.query.endDate === 'string' && req.query.endDate.trim()
      ? req.query.endDate.trim()
      : undefined;

  const range = getDateRange(filter, { start: customStart, end: customEnd });
  if (!range) {
    throw new AppError('Invalid or missing date range for selected filter', 400);
  }

  const timezone = 'Asia/Kolkata';

  // Load all users for the response (as requested: "all the users").
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'desc' },
  });

  const userById = new Map(users.map((u) => [u.id, u]));

  type WorkedStep = {
    jobStepId: number | string | null;
    stepName: string;
    stepStatus: 'accept' | 'in_progress' | 'hold' | 'planned';
    workedAt: string | null;
    machine: any | null;
    quantities: {
      plannedQty: number | null;
      inProgress: number;
      dispatchedQty: number | null;
      finishedGoodsQty: number | null;
      wastageQty: number | null;
    };
    dates: {
      startDate: string | null;
      endDate: string | null;
    };
    remarks: string | null;
    history: Array<{
      action: string;
      byUserId: string | null;
      byUserName: string | null;
      date: string | null;
      dispatchNo: string | null;
      dispatchedQty: number | null;
      remarks: string | null;
    }>;
  };

  type JobRecord = {
    jobPlanId: number;
    jobPlanCode: string | null;
    nrcJobNo: string;
    jobStatus: string;
    customerName: string | null;
    unit: string | null;
    workedSteps: WorkedStep[];
  };

  type UserRecord = {
    userId: string;
    userName: string | null;
    role: string;
    workSummary: {
      totalJobsWorkedOn: number;
      totalQuantityProduced: number;
      totalWastage: number;
      totalStepsCompleted: number;
      inProgress: {
        totalStepsInProgress: number;
        totalJobsInProgress: number;
        totalQuantityInProgress: number;
      };
    };
    jobs: JobRecord[];
  };

  const userJobMap = new Map<string, Map<number, JobRecord>>();
  const usedStepKeys = new Map<string, Set<string>>();

  const getOrInitUserJob = (userId: string, job: Omit<JobRecord, 'workedSteps'>) => {
    let jobMap = userJobMap.get(userId);
    if (!jobMap) {
      jobMap = new Map<number, JobRecord>();
      userJobMap.set(userId, jobMap);
    }
    let existing = jobMap.get(job.jobPlanId);
    if (!existing) {
      existing = { ...job, workedSteps: [] };
      jobMap.set(job.jobPlanId, existing);
    }
    return existing;
  };

  const addWorkedStep = (
    userId: string,
    job: Omit<JobRecord, 'workedSteps'>,
    stepKey: string,
    step: WorkedStep
  ) => {
    const stepKeySetKey = userId;
    let used = usedStepKeys.get(stepKeySetKey);
    if (!used) {
      used = new Set<string>();
      usedStepKeys.set(stepKeySetKey, used);
    }
    if (used.has(stepKey)) return;
    used.add(stepKey);

    const existingJob = getOrInitUserJob(userId, job);
    existingJob.workedSteps.push(step);
  };

  // 1) In-progress / ongoing steps from jobStepMachine (started/completed in range)
  const jobStepMachines = await prisma.jobStepMachine.findMany({
    where: {
      userId: { not: null },
      OR: [
        { startedAt: { gte: range.startAt, lte: range.endAt } },
        { completedAt: { gte: range.startAt, lte: range.endAt } },
      ],
      status: { in: ['in_progress', 'hold', 'stop', 'completed', 'accept'] },
    },
    include: {
      machine: {
        select: {
          id: true,
          machineCode: true,
          machineType: true,
          description: true,
          unit: true,
        },
      },
      jobStep: {
        include: {
          jobPlanning: {
            include: {
              purchaseOrder: {
                select: { customer: true, unit: true },
              },
            },
          },
          dispatchProcess: {
            select: {
              operatorName: true,
              quantity: true,
              totalDispatchedQty: true,
              finishedGoodsQty: true,
              dispatchHistory: true,
              dispatchDate: true,
              remarks: true,
              jobStepId: true,
            },
          },
        },
      },
      job: {
        select: {
          status: true,
          customerName: true,
          nrcJobNo: true,
        },
      },
    },
  });

  for (const jsm of jobStepMachines) {
    const userId = jsm.userId as string;
    const user = userById.get(userId);
    const stepStatus = mapMachineStatusToStepStatus(jsm.status);

    const jobPlanId = jsm.jobStep.jobPlanning.jobPlanId;
    const nrcJobNo = jsm.jobStep.jobPlanning.nrcJobNo;

    const jobStatus = (jsm.job?.status ?? 'ACTIVE') as string;
    const customerName =
      (jsm.job?.customerName as string | null) ??
      (jsm.jobStep.jobPlanning.purchaseOrder?.customer as string | null) ??
      null;
    const unitFromMachine = (jsm.machine as any)?.unit ?? null;

    // Optional filtering on customer/unit (dashboard filter support)
    if (customer && (!customerName || customerName !== customer)) continue;
    if (unit && (!unitFromMachine || unitFromMachine !== unit)) continue;

    const job = {
      jobPlanId,
      jobPlanCode: (jsm.jobStep.jobPlanning.jobPlanCode as string | null) ?? null,
      nrcJobNo: String(nrcJobNo),
      jobStatus,
      customerName,
      unit: unitFromMachine,
    };

    const jobStepId = jsm.jobStepId;
    const stepName = jsm.jobStep.stepName;

    const workedAtDate = jsm.completedAt ?? jsm.startedAt ?? null;
    const startDate = jsm.startedAt ?? null;
    const endDate = jsm.completedAt ?? null;

    const plannedQty = pickPlannedQty(jsm);
    const wastageQty = pickWastageQty(jsm);

    const dispatchProcess = jsm.jobStep.dispatchProcess;
    const isDispatch = String(stepName).toLowerCase() === 'dispatchprocess';
    const dispatchedQty = isDispatch
      ? safeToNumber(dispatchProcess?.totalDispatchedQty) ??
        safeToNumber(dispatchProcess?.quantity) ??
        null
      : null;
    const finishedGoodsQty = isDispatch ? safeToNumber(dispatchProcess?.finishedGoodsQty) ?? null : null;

    const historyArray = isDispatch
      ? safeJsonArray(dispatchProcess?.dispatchHistory)
      : [];

    const history = isDispatch
      ? historyArray.map((h: any) => ({
          action: 'dispatch_accept',
          byUserId: userId ?? null,
          byUserName: user?.name ?? null,
          date: h?.dispatchDate ? new Date(h.dispatchDate).toISOString() : null,
          dispatchNo: h?.dispatchNo ?? null,
          dispatchedQty: safeToNumber(h?.dispatchedQty) ?? null,
          remarks: h?.remarks ?? null,
        }))
      : [];

    const step: WorkedStep = {
      jobStepId: jobStepId ?? null,
      stepName: String(stepName),
      stepStatus,
      workedAt: workedAtDate ? workedAtDate.toISOString() : null,
      machine: jsm.machine
        ? {
            machineId: jsm.machine.id,
            machineCode: jsm.machine.machineCode,
            machineType: jsm.machine.machineType,
            description: jsm.machine.description,
            unit: jsm.machine.unit,
          }
        : null,
      quantities: {
        plannedQty,
        inProgress: stepStatus === 'in_progress' ? plannedQty ?? 0 : 0,
        dispatchedQty,
        finishedGoodsQty,
        wastageQty,
      },
      dates: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      },
      remarks: (jsm.remarks as string | null) ?? (dispatchProcess?.remarks as string | null) ?? null,
      history,
    };

    const stepKey = `jsm:${jsm.id ?? `${jsm.jobStepId}:${jsm.machineId}`}:${userId}`;
    addWorkedStep(userId, job, stepKey, step);
  }

  // 2) Completed steps from CompletedJob (needed for dispatch completed history)
  const completedJobs = await prisma.completedJob.findMany({
    where: {
      completedAt: { gte: range.startAt, lte: range.endAt },
    },
    select: {
      id: true,
      nrcJobNo: true,
      jobPlanId: true,
      jobPlanCode: true,
      jobDemand: true,
      completedAt: true,
      updatedAt: true,
      allSteps: true,
      allStepDetails: true,
      completedBy: true,
      remarks: true,
    },
  });

  const completedJobPlanNos = Array.from(
    new Set(completedJobs.map((j) => j.nrcJobNo).filter(Boolean))
  );
  const completedJobInfoByJobNo = new Map<
    string,
    { status: string; customerName: string | null }
  >(
    (
      await prisma.job.findMany({
        where: { nrcJobNo: { in: completedJobPlanNos } },
        select: { nrcJobNo: true, status: true, customerName: true },
      })
    ).map((j) => [j.nrcJobNo, { status: j.status as string, customerName: j.customerName }])
  );

  for (const cj of completedJobs) {
    const allSteps = safeJsonArray(cj.allSteps);
    const allStepDetails = cj.allStepDetails ?? {};
    const dispatchDetailsArray = safeJsonArray(
      (allStepDetails as any)?.dispatchProcess
    );

    const jobInfo = completedJobInfoByJobNo.get(cj.nrcJobNo) ?? {
      status: 'ACTIVE',
      customerName: null,
    };

    const baseJob = {
      jobPlanId: cj.jobPlanId,
      jobPlanCode: cj.jobPlanCode ?? null,
      nrcJobNo: String(cj.nrcJobNo),
      jobStatus: jobInfo.status,
      customerName: jobInfo.customerName,
      unit: null as string | null,
    };

    for (const rawStep of allSteps) {
      const stepName = rawStep?.stepName;
      if (!stepName) continue;

      const mappedStatus = mapStepStatusToStepStatus(rawStep?.status);
      // Only record actual work items (accept/in_progress/hold/planned)
      // CompletedJob should mainly give accept/stop, but we keep others.

      const operatorId =
        rawStep?.user ?? rawStep?.completedBy ?? cj.completedBy ?? null;
      if (!operatorId) continue;

      const user = userById.get(String(operatorId));
      const jobStepId = rawStep?.id ?? rawStep?.jobStepId ?? null;

      const machineDetails = safeJsonArray(rawStep?.machineDetails);
      const machine = machineDetails.length
        ? machineDetails[0]
        : null;

      if (unit && machine && machine.unit !== unit) continue;

      // Best-effort quantity extraction from completed-step JSON
      // (supports quantities both on the step object and inside machineDetails[0].formData)
      const plannedQty = pickPlannedQty(rawStep);
      const wastageQty = pickWastageQty(rawStep);

      const isDispatch = String(stepName).toLowerCase() === 'dispatchprocess';

      let dispatchedQty: number | null = null;
      let finishedGoodsQty: number | null = null;
      let history: any[] = [];
      if (isDispatch) {
        // dispatchProcess details are stored in allStepDetails.dispatchProcess
        const dispatchDetailsRow =
          dispatchDetailsArray.find((d: any) => {
            const dsJobStepId = d?.jobStepId ?? d?.id ?? null;
            return dsJobStepId != null && Number(dsJobStepId) === Number(jobStepId);
          }) ?? dispatchDetailsArray[0];

        dispatchedQty =
          safeToNumber(dispatchDetailsRow?.totalDispatchedQty) ??
          safeToNumber(dispatchDetailsRow?.quantity) ??
          safeToNumber(rawStep?.dispatchedQty) ??
          null;
        finishedGoodsQty =
          safeToNumber(dispatchDetailsRow?.finishedGoodsQty) ??
          safeToNumber(rawStep?.finishedGoodsQty) ??
          null;

        const dh = safeJsonArray(dispatchDetailsRow?.dispatchHistory);
        history = dh.map((h: any) => ({
          action: 'dispatch_accept',
          byUserId: String(operatorId),
          byUserName: user?.name ?? null,
          date: h?.dispatchDate ? new Date(h.dispatchDate).toISOString() : null,
          dispatchNo: h?.dispatchNo ?? null,
          dispatchedQty: safeToNumber(h?.dispatchedQty) ?? null,
          remarks: h?.remarks ?? null,
        }));
      }

      const workedAtDate: Date | null =
        (rawStep?.endDate ? new Date(rawStep.endDate) : null) ||
        (rawStep?.updatedAt ? new Date(rawStep.updatedAt) : null) ||
        (cj.updatedAt ? new Date(cj.updatedAt) : null) ||
        (cj.completedAt ? new Date(cj.completedAt) : null);

      const startDateDate: Date | null =
        (rawStep?.startDate ? new Date(rawStep.startDate) : null) ||
        (rawStep?.createdAt ? new Date(rawStep.createdAt) : null);

      const endDateDate: Date | null = rawStep?.endDate
        ? new Date(rawStep.endDate)
        : rawStep?.updatedAt
          ? new Date(rawStep.updatedAt)
          : null;

      // Apply optional customer filter (if provided).
      if (customer && baseJob.customerName && baseJob.customerName !== customer) {
        continue;
      }

      // Ensure each step has a usable "quantity" value.
      // For Dispatch, consumers typically use dispatchedQty/finishedGoodsQty; still fill plannedQty if missing.
      const finalPlannedQty =
        isDispatch && plannedQty == null
          ? dispatchedQty ?? finishedGoodsQty ?? null
          : plannedQty;

      const workedStep: WorkedStep = {
        jobStepId,
        stepName: String(stepName),
        stepStatus: mappedStatus,
        workedAt: workedAtDate ? workedAtDate.toISOString() : null,
        machine: machine
          ? {
              machineCode: machine.machineCode ?? machine.machineCodeKey ?? null,
              machineType: machine.machineType ?? machine.machineTypeKey ?? null,
              unit: machine.unit ?? null,
              description: machine.description ?? null,
            }
          : null,
        quantities: {
          plannedQty: finalPlannedQty,
          inProgress:
            mappedStatus === 'in_progress' ? finalPlannedQty ?? 0 : 0,
          dispatchedQty,
          finishedGoodsQty,
          wastageQty,
        },
        dates: {
          startDate: startDateDate ? startDateDate.toISOString() : null,
          endDate: endDateDate ? endDateDate.toISOString() : null,
        },
        remarks:
          (rawStep?.remarks as string | null) ??
          (rawStep?.holdRemark as string | null) ??
          cj.remarks ??
          null,
        history,
      };

      const job = {
        ...baseJob,
        unit: machine?.unit ?? baseJob.unit,
      };

      const stepKey = `cj:${cj.id}:${jobStepId}:${operatorId}:${stepName}`;
      addWorkedStep(String(operatorId), job, stepKey, workedStep);
    }
  }

  // Compute summaries and finalize response
  const responseUsers: UserRecord[] = users.map((u) => {
    const jobMap = userJobMap.get(u.id);
    const jobs = jobMap ? Array.from(jobMap.values()) : [];

    const allSteps = jobs.flatMap((j) => j.workedSteps);

    const completedSteps = allSteps.filter((s) => s.stepStatus === 'accept');
    const inProgressSteps = allSteps.filter((s) => s.stepStatus === 'in_progress');

    const completedJobIds = new Set(
      completedSteps.map((s) => {
        // jobPlanId can be derived from containing job
        const job = jobs.find((j) => j.workedSteps.includes(s));
        return job?.jobPlanId ?? null;
      }).filter((x): x is number => x !== null)
    );

    const inProgressJobIds = new Set(
      inProgressSteps.map((s) => {
        const job = jobs.find((j) => j.workedSteps.includes(s));
        return job?.jobPlanId ?? null;
      }).filter((x): x is number => x !== null)
    );

    const totalQuantityProduced = completedSteps.reduce((sum, s) => {
      const isDispatch =
        String(s.stepName).toLowerCase() === 'dispatchprocess';
      if (!isDispatch) return sum;
      const produced =
        s.quantities.dispatchedQty ??
        s.quantities.finishedGoodsQty ??
        s.quantities.plannedQty ??
        0;
      return sum + (produced ?? 0);
    }, 0);

    const totalWastage = completedSteps.reduce((sum, s) => {
      return sum + (s.quantities.wastageQty ?? 0);
    }, 0);

    const totalQuantityInProgress = inProgressSteps.reduce((sum, s) => {
      return sum + (s.quantities.inProgress ?? 0);
    }, 0);

    return {
      userId: u.id,
      userName: u.name ?? null,
      role: u.role,
      workSummary: {
        totalJobsWorkedOn: completedJobIds.size,
        totalQuantityProduced,
        totalWastage,
        totalStepsCompleted: completedSteps.length,
        inProgress: {
          totalStepsInProgress: inProgressSteps.length,
          totalJobsInProgress: inProgressJobIds.size,
          totalQuantityInProgress,
        },
      },
      jobs,
    };
  });

  res.status(200).json({
    success: true,
    message: 'User work record fetched',
    data: {
      period: {
        startDate: range.startKey,
        endDate: range.endKey,
        timezone,
      },
      users: responseUsers,
    },
  });
};

