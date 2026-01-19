import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware";
import { logUserActionWithResource, ActionTypes } from "../lib/logger";
import { autoCompleteJobIfReady } from "../utils/workflowValidator";
import { Machine } from "@prisma/client";
import { getWorkflowStatus } from "../utils/workflowValidator";
import { updateJobMachineDetailsFlag } from "../utils/machineDetailsTracker";
import { getFilteredJobNumbers } from "../middleware/machineAccess";
import { RoleManager } from "../utils/roleUtils";

export const createJobPlanning = async (req: Request, res: Response) => {
  const { nrcJobNo, jobDemand, steps, purchaseOrderId, finishedGoodsQty } =
    req.body;
  if (!nrcJobNo || !jobDemand || !Array.isArray(steps) || steps.length === 0) {
    throw new AppError("nrcJobNo, jobDemand, and steps are required", 400);
  }

  // Validate finished goods quantity (must be >= 0)
  const finishedGoodsQuantity = finishedGoodsQty
    ? parseInt(finishedGoodsQty)
    : 0;
  if (finishedGoodsQuantity < 0) {
    throw new AppError("Finished goods quantity cannot be negative", 400);
  }

  // Log finished goods quantity for debugging
  console.log("📦 [createJobPlanning] Finished goods quantity received:", {
    finishedGoodsQty,
    finishedGoodsQuantity,
    type: typeof finishedGoodsQty,
  });

  // Debug: Log the incoming data
  console.log(
    "Creating job planning with steps:",
    JSON.stringify(steps, null, 2)
  );

  // Debug: Log machine details specifically
  steps.forEach((step: any, index: number) => {
    console.log(
      `Step ${index + 1} (${step.stepName}) machineDetails:`,
      JSON.stringify(step.machineDetails, null, 2)
    );
    if (step.machineDetails && step.machineDetails.length > 0) {
      step.machineDetails.forEach((machine: any, machineIndex: number) => {
        console.log(
          `  Machine ${machineIndex + 1}:`,
          JSON.stringify(machine, null, 2)
        );
        console.log(
          `  Machine ${machineIndex + 1} keys:`,
          Object.keys(machine)
        );
        console.log(
          `  Machine ${machineIndex + 1} machineId:`,
          machine.machineId
        );
        console.log(`  Machine ${machineIndex + 1} unit:`, machine.unit);
      });
    }
  });

  try {
    // Debug: Log the data being passed to Prisma
    const stepsData = steps.map((step: any) => ({
      stepNo: step.stepNo,
      stepName: step.stepName,
      status: "planned" as const, // All new steps start as planned
      machineDetails: step.machineDetails || [],
    }));

    console.log("Steps data for Prisma:", JSON.stringify(stepsData, null, 2));

    // Note: Finished goods are NOT consumed here - they are consumed when dispatch actually uses them
    // finishedGoodsQuantity in JobPlanning is just a reference/selection, not consumption

    const jobPlanning = await prisma.jobPlanning.create({
      data: {
        nrcJobNo,
        jobDemand,
        purchaseOrderId: purchaseOrderId ? parseInt(purchaseOrderId) : null,
        finishedGoodsQty: finishedGoodsQuantity,
        steps: {
          create: stepsData,
        },
      },
      include: {
        steps: true,
      },
    });

    // Log the created job planning to verify finishedGoodsQty was saved
    console.log("✅ [createJobPlanning] Job planning created:", {
      jobPlanId: jobPlanning.jobPlanId,
      nrcJobNo: jobPlanning.nrcJobNo,
      finishedGoodsQty: jobPlanning.finishedGoodsQty,
      purchaseOrderId: jobPlanning.purchaseOrderId,
    });

    // Immediately update the job's machine details flag based on initial steps
    try {
      await updateJobMachineDetailsFlag(nrcJobNo);
    } catch (e) {
      console.warn(
        "Warning: could not update isMachineDetailsFilled on planning create:",
        e
      );
    }

    // Log the job planning creation action
    if (req.user?.userId) {
      await logUserActionWithResource(
        req.user.userId,
        ActionTypes.JOBPLANNING_CREATED,
        `Created job planning for job: ${nrcJobNo} with demand: ${jobDemand}`,
        "JobPlanning",
        jobPlanning.jobPlanId.toString()
      );
    }

    // Ensure finishedGoodsQty is explicitly included in response
    const responseData = {
      ...jobPlanning,
      finishedGoodsQty: jobPlanning.finishedGoodsQty ?? finishedGoodsQuantity,
    };

    console.log(
      "📤 [createJobPlanning] Sending response with finishedGoodsQty:",
      responseData.finishedGoodsQty
    );

    res.status(201).json({
      success: true,
      data: responseData,
      message: "Job planning created successfully",
    });
  } catch (error) {
    console.error("Error creating job planning:", error);
    throw new AppError("Failed to create job planning", 500);
  }
};

// Helper to serialize a Machine object for JSON
function serializeMachine(machine: Machine) {
  return {
    ...machine,
    createdAt: machine.createdAt.toISOString(),
    updatedAt: machine.updatedAt.toISOString(),
  };
}

// Get all JobPlannings with steps - Optimized version
export const getAllJobPlannings = async (req: Request, res: Response) => {
  const userMachineIds = req.userMachineIds; // From middleware

  // Get pagination parameters from query (opt-in - only paginate if page param is provided)
  const page = req.query.page ? parseInt(req.query.page as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
  const isPaginated = page !== undefined;
  const skip = isPaginated ? (page - 1) * limit : 0;

  // Get job numbers that are accessible to the user based on machine assignments
  const userRole = req.user?.role || "";
  const accessibleJobNumbers = await getFilteredJobNumbers(
    userMachineIds || null,
    userRole
  );

  // Bypass branch: Roles that should see ALL plannings without deduplication
  // Admin, Planner, Flying Squad, QC Manager, PaperStore, Production Head need to see all versions
  const bypassDeduplicationRoles = [
    "admin",
    "planner",
    "flyingsquad",
    "qc_manager",
    "paperstore",
    "production_head",
  ];
  const shouldBypassDeduplication =
    userMachineIds === null ||
    bypassDeduplicationRoles.some((role) => userRole.includes(role));

  if (shouldBypassDeduplication) {
    const userId = req.user?.userId;
    const queryOptions: any = {
      include: {
        steps: {
          include: {
            paperStore: {
              select: {
                id: true,
                status: true,
              },
            },
            qualityDept: {
              select: {
                id: true,
                startedBy: true,
                status: true,
              },
            },
          },
          orderBy: { stepNo: "asc" },
        },
      },
      orderBy: { jobPlanId: "desc" },
    };

    // Only add pagination if requested
    if (isPaginated) {
      queryOptions.skip = skip;
      queryOptions.take = limit;
    }

    const allPlanningsUnfiltered = (await prisma.jobPlanning.findMany(
      queryOptions
    )) as any[];

    // Filter QC jobs for QC executives: Remove entire job plannings if QC is started by another user
    const isQCRole =
      userRole &&
      (userRole.toLowerCase().includes("qc") ||
        userRole.toLowerCase().includes("quality"));
    let filteredPlannings = allPlanningsUnfiltered;

    if (userId && isQCRole) {
      filteredPlannings = allPlanningsUnfiltered.filter((planning: any) => {
        if (planning.steps && Array.isArray(planning.steps)) {
          // Find QC step
          const qcStep = planning.steps.find(
            (step: any) => step.stepName === "QualityDept"
          );
          if (qcStep) {
            // Check if QC is started by looking at qualityDept.startedBy first, then fallback to JobStep.user
            const startedBy =
              qcStep.qualityDept?.startedBy ||
              (qcStep.status === "start" ? qcStep.user : null);
            // Show job if QC is not started (null) or started by current user
            if (startedBy !== null && startedBy !== userId) {
              // QC is started by another user - hide this job
              return false;
            }
            // Show job if QC is not started or started by current user
            return true;
          }
          // If no QC step found, show the job (might be in progress)
          return true;
        }
        return true;
      });
    }

    // Enrich PaperStore steps with PaperStore table status
    // For PaperStore steps, use the PaperStore.status instead of JobStep.status
    for (const planning of filteredPlannings) {
      if (planning.steps && Array.isArray(planning.steps)) {
        // Enrich PaperStore status
        for (const step of planning.steps) {
          if (step.stepName === "PaperStore" && step.paperStore) {
            // Use PaperStore.status if available (e.g., 'accept'), otherwise use JobStep.status
            step.status = step.paperStore.status || step.status;
          }
        }
      }
    }

    // Build response
    const response: any = {
      success: true,
      count: filteredPlannings.length,
      data: filteredPlannings,
    };

    // Only include pagination metadata if pagination was requested
    if (isPaginated && page !== undefined) {
      const totalCount = await prisma.jobPlanning.count();
      const totalPages = Math.ceil(totalCount / limit);

      response.pagination = {
        currentPage: page,
        totalPages: totalPages,
        totalJobs: totalCount,
        jobsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    }

    return res.status(200).json(response);
  }

  // Paginate the accessible job numbers only if pagination is requested
  const jobNumbersToFetch = isPaginated
    ? accessibleJobNumbers.slice(skip, skip + limit)
    : accessibleJobNumbers;

  // Get ALL job plannings for accessible jobs (NO deduplication)
  // Production roles with machines should see ALL accessible plannings, not just the latest
  const userId = req.user?.userId;
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: { in: jobNumbersToFetch } },
    include: {
      steps: {
        include: {
          paperStore: {
            select: {
              id: true,
              status: true,
            },
          },
          qualityDept: {
            select: {
              id: true,
              startedBy: true,
              status: true,
            },
          },
        },
        orderBy: { stepNo: "asc" },
      },
    },
    orderBy: { jobPlanId: "desc" },
  });

  console.log(
    `🔍 [getAllJobPlannings] Fetched ${jobPlannings.length} job plannings from DB. Accessible job numbers: ${jobNumbersToFetch.length}`
  );
  console.log(
    `🔍 [getAllJobPlannings] Urgent jobs in fetched plannings: ${jobPlannings
      .filter((p: any) => p.jobDemand === "high")
      .map((p: any) => p.nrcJobNo)
      .join(", ")}`
  );

  // Filter QC jobs for QC executives: Remove entire job plannings if QC is started by another user
  // Only show jobs where QC is either not started (startedBy is null) or started by current user
  const isQCRole =
    userRole &&
    (userRole.toLowerCase().includes("qc") ||
      userRole.toLowerCase().includes("quality"));
  let filteredJobPlannings = jobPlannings;

  if (userId && isQCRole) {
    filteredJobPlannings = jobPlannings.filter((planning: any) => {
      if (planning.steps && Array.isArray(planning.steps)) {
        // Find QC step
        const qcStep = planning.steps.find(
          (step: any) => step.stepName === "QualityDept"
        );
        if (qcStep) {
          // Check if QC is started by looking at qualityDept.startedBy first, then fallback to JobStep.user
          const startedBy =
            qcStep.qualityDept?.startedBy ||
            (qcStep.status === "start" ? qcStep.user : null);
          // Show job if QC is not started (null) or started by current user
          if (startedBy !== null && startedBy !== userId) {
            // QC is started by another user - hide this job
            return false;
          }
          // Show job if QC is not started or started by current user
          return true;
        }
        // If no QC step found, show the job (might be in progress or QC step not created yet)
        return true;
      }
      return true;
    });
  }

  // Extract machine IDs more efficiently
  const machineIds = new Set<string>();
  filteredJobPlannings.forEach((planning) => {
    planning.steps.forEach((step: any) => {
      if (Array.isArray(step.machineDetails)) {
        step.machineDetails.forEach((md: any) => {
          const id =
            md && typeof md === "object"
              ? md.machineId || (md as any).id
              : undefined;
          if (id && typeof id === "string") {
            machineIds.add(id);
          }
        });
      }
    });
  });

  // Fetch machines in a single query if needed
  let machines: any[] = [];
  if (machineIds.size > 0) {
    machines = await prisma.machine.findMany({
      where: { id: { in: Array.from(machineIds) } },
      select: {
        id: true,
        description: true,
        status: true,
        capacity: true,
        machineCode: true,
        machineType: true,
        unit: true,
      },
    });
  }
  const machineMap = Object.fromEntries(machines.map((m) => [m.id, m]));

  // For urgent jobs: ALWAYS fetch all machines to populate machineDetails for all steps (except PaperStore)
  // This ensures urgent jobs are visible to all machines of the appropriate type
  let allMachines: any[] = [];
  const hasUrgentJobs = filteredJobPlannings.some(
    (p) => p.jobDemand === "high"
  );
  if (hasUrgentJobs) {
    console.log(`🔍 [Urgent Job] Found urgent jobs, fetching all machines...`);
    allMachines = await prisma.machine.findMany({
      select: {
        id: true,
        machineCode: true,
        machineType: true,
        unit: true,
        description: true,
        status: true,
        capacity: true,
      },
    });
    console.log(
      `🔍 [Urgent Job] Fetched ${allMachines.length} machines for urgent jobs`
    );
    // Add all machines to machineMap if not already there
    for (const m of allMachines) {
      if (!machineMap[m.id]) {
        machineMap[m.id] = m;
      }
    }
    console.log(
      `🔍 [Urgent Job] machineMap now has ${
        Object.keys(machineMap).length
      } machines. Machine types: ${[
        ...new Set(allMachines.map((m) => m.machineType)),
      ].join(", ")}`
    );
  }

  // 4. Replace machineId in each step's machineDetails with the full machine object (serialized)
  // Also enrich PaperStore steps with PaperStore table status
  // ALSO filter machines to only show machines the user has access to
  // For urgent jobs: filter based on startedByMachineId (exclusive to starting machine once started)

  // Fetch JobStepMachine records for urgent job steps to check startedByMachineId
  const urgentJobStepIds = new Set<number>();
  for (const planning of filteredJobPlannings) {
    if (planning.jobDemand === "high") {
      for (const step of planning.steps) {
        if (step.stepNo !== 1) {
          // Exclude PaperStore (step 1)
          urgentJobStepIds.add(step.id);
        }
      }
    }
  }

  // Fetch JobStepMachine records for urgent steps
  // IMPORTANT: For urgent jobs, startedByMachineId should equal machineId (the machine that started owns this record)
  const urgentJobStepMachinesRaw =
    urgentJobStepIds.size > 0
      ? await (prisma as any).jobStepMachine.findMany({
          where: {
            jobStepId: { in: Array.from(urgentJobStepIds) },
            startedByMachineId: { not: null },
          },
          select: {
            jobStepId: true,
            startedByMachineId: true,
            machineId: true,
            status: true,
          },
          orderBy: [
            { status: "asc" }, // in_progress comes before stop (alphabetically)
            { startedAt: "desc" }, // Most recent first
          ],
        })
      : [];

  // CRITICAL: Filter to only include records where startedByMachineId equals machineId
  // This ensures we're using the correct JobStepMachine record (the machine that owns the record is the one that started)
  // This prevents issues where stale records might have startedByMachineId set incorrectly
  const urgentJobStepMachines = urgentJobStepMachinesRaw.filter((jsm: any) => {
    const isValid = jsm.startedByMachineId === jsm.machineId;
    if (!isValid) {
      console.log(
        `🔍 [Urgent Job Map] ⚠️ Filtering out invalid record: Step ${jsm.jobStepId}, machineId: ${jsm.machineId}, startedByMachineId: ${jsm.startedByMachineId} (mismatch!)`
      );
    }
    return isValid;
  });

  if (urgentJobStepMachinesRaw.length > urgentJobStepMachines.length) {
    console.log(
      `🔍 [Urgent Job Map] Filtered out ${
        urgentJobStepMachinesRaw.length - urgentJobStepMachines.length
      } invalid records where startedByMachineId != machineId`
    );
  }

  // Create a map: jobStepId -> startedByMachineId
  // If multiple records exist for the same step, prioritize the one with status 'in_progress'
  const urgentStepMachineMap = new Map<number, string>();
  const stepMachineRecords = new Map<number, any>(); // Track full records for prioritization

  for (const jsm of urgentJobStepMachines) {
    const existing = stepMachineRecords.get(jsm.jobStepId);

    // Priority: in_progress > stop > others
    if (!existing) {
      stepMachineRecords.set(jsm.jobStepId, jsm);
    } else {
      const existingPriority =
        existing.status === "in_progress"
          ? 2
          : existing.status === "stop"
          ? 1
          : 0;
      const currentPriority =
        jsm.status === "in_progress" ? 2 : jsm.status === "stop" ? 1 : 0;

      if (currentPriority > existingPriority) {
        stepMachineRecords.set(jsm.jobStepId, jsm);
      }
    }
  }

  // Build the final map from prioritized records
  // IMPORTANT: Use machineId (not startedByMachineId) because startedByMachineId should equal machineId for the record that started
  for (const [stepId, jsm] of stepMachineRecords) {
    // Use machineId as the source of truth (the machine that owns this JobStepMachine record)
    // startedByMachineId should equal machineId, but machineId is more reliable
    const machineIdToUse = jsm.machineId || jsm.startedByMachineId;
    urgentStepMachineMap.set(stepId, machineIdToUse);
    console.log(
      `🔍 [Urgent Job Map] Step ${stepId} -> Machine ${machineIdToUse} (machineId: ${jsm.machineId}, startedByMachineId: ${jsm.startedByMachineId}, status: ${jsm.status})`
    );

    // Validate that startedByMachineId matches machineId (they should be the same)
    if (
      jsm.startedByMachineId &&
      jsm.machineId &&
      jsm.startedByMachineId !== jsm.machineId
    ) {
      console.log(
        `🔍 [Urgent Job Map] ⚠️ WARNING: Step ${stepId} - startedByMachineId (${jsm.startedByMachineId}) != machineId (${jsm.machineId})`
      );
    }
  }
  if (urgentJobStepIds.size > 0 && urgentJobStepMachines.length === 0) {
    console.log(
      `🔍 [Urgent Job Map] WARNING: Found ${urgentJobStepIds.size} urgent steps but NO startedByMachineId records!`
    );
    console.log(
      `🔍 [Urgent Job Map] Urgent step IDs: ${Array.from(urgentJobStepIds).join(
        ", "
      )}`
    );
  }
  console.log(
    `🔍 [Urgent Job Map] Total urgent steps: ${urgentJobStepIds.size}, Steps with startedByMachineId: ${urgentJobStepMachines.length}`
  );

  for (const planning of filteredJobPlannings) {
    const isUrgentJob = planning.jobDemand === "high";
    console.log(
      `🔍 [getAllJobPlannings] Job ${planning.nrcJobNo}: jobDemand=${
        planning.jobDemand
      }, isUrgentJob=${isUrgentJob}, steps count=${planning.steps?.length || 0}`
    );

    for (const step of planning.steps) {
      // Enrich PaperStore steps with PaperStore table status
      if (step.stepName === "PaperStore" && (step as any).paperStore) {
        // Use PaperStore.status if available (e.g., 'accept'), otherwise use JobStep.status
        (step as any).status = (step as any).paperStore.status || step.status;
      }

      // For urgent jobs: populate machineDetails based on whether step has been started
      if (isUrgentJob && step.stepNo !== 1) {
        // Check if this step has been started by a specific machine
        const startedByMachineId = urgentStepMachineMap.get(step.id);
        const originalMachineDetailsCount = Array.isArray(step.machineDetails)
          ? step.machineDetails.length
          : 0;
        console.log(
          `🔍 [Urgent Job Populate] Step ${step.stepName} (${
            step.id
          }), startedByMachineId: ${
            startedByMachineId || "null"
          }, original machineDetails count: ${originalMachineDetailsCount}`
        );

        if (startedByMachineId) {
          // Step has been started - only show the starting machine
          const startingMachine = allMachines.find(
            (m) => m.id === startedByMachineId
          );
          if (startingMachine) {
            step.machineDetails = [
              {
                id: startingMachine.id,
                machineId: startingMachine.id,
                machineCode: startingMachine.machineCode,
                machineType: startingMachine.machineType,
                unit: startingMachine.unit,
                machine: startingMachine,
              },
            ];
            console.log(
              `🔍 [Urgent Job] Step ${step.stepName} (${step.id}) - already started by machine ${startingMachine.machineCode} (${startingMachine.id}), showing only that machine. machineDetails count: ${step.machineDetails.length}`
            );
          } else {
            console.log(
              `🔍 [Urgent Job] ⚠️ Step ${step.stepName} (${step.id}) - startedByMachineId ${startedByMachineId} not found in allMachines!`
            );
          }
        } else {
          // Step not started yet - show all machines of that step type
          const stepToMachineType: Record<string, string> = {
            PrintingDetails: "Printing",
            Corrugation: "Corrugatic",
            FluteLaminateBoardConversion: "Flute Lam",
            Punching: "Auto Pund", // Will be handled specially to include both Auto Pund and Manual Pu
            SideFlapPasting: "Auto Flap",
            QualityDept: "", // No specific machine type
            DispatchProcess: "", // No specific machine type
          };

          const requiredMachineType = stepToMachineType[step.stepName] || "";
          console.log(
            `🔍 [Urgent Job] Step ${step.stepName} (${step.id}) - not started yet, allMachines.length=${allMachines.length}, requiredMachineType="${requiredMachineType}"`
          );

          // Special handling for Punching step: include both Auto Pund and Manual Pu machines
          // Special handling for SideFlapPasting step: include both Auto Flap and Manual FI machines
          let machinesToAdd: any[] = [];
          if (step.stepName === "Punching") {
            machinesToAdd = allMachines.filter(
              (m) =>
                m.machineType === "Auto Pund" || m.machineType === "Manual Pu"
            );
            console.log(
              `🔍 [Urgent Job] Step ${step.stepName} (${step.id}) - filtering for Punching: found ${machinesToAdd.length} machines (Auto Pund + Manual Pu)`
            );
          } else if (step.stepName === "SideFlapPasting") {
            machinesToAdd = allMachines.filter(
              (m) =>
                m.machineType === "Auto Flap" || m.machineType === "Manual FI"
            );
            console.log(
              `🔍 [Urgent Job] Step ${step.stepName} (${step.id}) - filtering for SideFlapPasting: found ${machinesToAdd.length} machines (Auto Flap + Manual FI)`
            );
          } else if (requiredMachineType) {
            machinesToAdd = allMachines.filter(
              (m) => m.machineType === requiredMachineType
            );
          } else {
            machinesToAdd = allMachines; // For steps without specific machine type, show all machines
          }

          console.log(
            `🔍 [Urgent Job] Step ${step.stepName} (${step.id}) - filtered machines: ${machinesToAdd.length} machines found`
          );
          if (machinesToAdd.length > 0) {
            console.log(
              `🔍 [Urgent Job] Step ${
                step.stepName
              } - machine codes: ${machinesToAdd
                .map((m) => m.machineCode)
                .join(", ")}`
            );
          }

          // Populate with filtered machines for urgent jobs not yet started
          step.machineDetails = machinesToAdd.map((m) => ({
            id: m.id,
            machineId: m.id,
            machineCode: m.machineCode,
            machineType: m.machineType,
            unit: m.unit,
            machine: m,
          }));
          console.log(
            `🔍 [Urgent Job] Step ${step.stepName} (${
              step.id
            }) - not started yet, populated with ${
              machinesToAdd.length
            } machines (type: ${requiredMachineType || "all"})`
          );
        }
      }

      if (Array.isArray(step.machineDetails)) {
        // Check if this urgent step has been started by a specific machine
        const startedByMachineId =
          isUrgentJob && step.stepNo !== 1
            ? urgentStepMachineMap.get(step.id)
            : null;

        // Filter machines to only show machines the user has access to
        step.machineDetails = step.machineDetails
          .map((md: any) => {
            const mid =
              md && typeof md === "object" ? md.machineId || md.id : undefined;
            if (mid && typeof mid === "string" && machineMap[mid]) {
              const base: Record<string, any> =
                md && typeof md === "object" ? (md as Record<string, any>) : {};
              return { ...base, machine: machineMap[mid] };
            }
            return md;
          })
          .filter((md: any) => {
            const machineId = md.id || md.machineId;

            // For urgent jobs (excluding PaperStore):
            if (isUrgentJob && step.stepNo !== 1) {
              // If step has been started by a machine, only show that machine
              if (startedByMachineId) {
                const isStartingMachine = machineId === startedByMachineId;
                console.log(
                  `🔍 [Urgent Job Filter] Step ${step.stepName} (${step.id}), Machine ${machineId}, Started by: ${startedByMachineId}, Show: ${isStartingMachine}`
                );
                return isStartingMachine;
              }
              // If not started yet, show ALL machines (visible to all)
              console.log(
                `🔍 [Urgent Job Filter] Step ${step.stepName} (${step.id}), Machine ${machineId}, Not started yet - showing to all machines`
              );
              return true; // Show all machines for urgent jobs not yet started
            }
            
            // 🎯 NEW: For regular jobs: show on ALL machines (like urgent jobs)
            // When a worker starts the job on a machine, it will be removed from other machines
            // Check if step has been started by a machine (for regular jobs too)
            if (step.stepNo !== 1 && startedByMachineId) {
              const isStartingMachine = machineId === startedByMachineId;
              console.log(`🔍 [Regular Job Filter] Step ${step.stepName} (${step.id}), Machine ${machineId}, Started by: ${startedByMachineId}, Show: ${isStartingMachine}`);
              return isStartingMachine;
            }
            // If not started yet, show ALL machines (visible to all)
            console.log(`🔍 [Regular Job Filter] Step ${step.stepName} (${step.id}), Machine ${machineId}, Not started yet - showing to all machines`);
            return true; // Show all machines for regular jobs not yet started
          });

        // Debug: Log final machineDetails count for urgent job steps
        if (isUrgentJob && step.stepNo !== 1) {
          console.log(
            `🔍 [Final Check] Step ${step.stepName} (${
              step.id
            }) - Final machineDetails count: ${
              step.machineDetails?.length || 0
            }`
          );
          if (step.machineDetails && step.machineDetails.length > 0) {
            const machineCodes = step.machineDetails
              .map((md: any) => md.machineCode || md.id)
              .join(", ");
            console.log(
              `🔍 [Final Check] Step ${step.stepName} - Final machine codes: ${machineCodes}`
            );
          } else {
            console.log(
              `🔍 [Final Check] ⚠️ Step ${step.stepName} (${step.id}) - machineDetails is EMPTY after filtering!`
            );
          }
        }
      }
    }
  }

  // Build response
  const response: any = {
    success: true,
    count: filteredJobPlannings.length,
    data: filteredJobPlannings,
  };

  // Only include pagination metadata if pagination was requested
  if (isPaginated && page !== undefined) {
    const totalJobs = accessibleJobNumbers.length;
    const totalPages = Math.ceil(totalJobs / limit);

    response.pagination = {
      currentPage: page,
      totalPages: totalPages,
      totalJobs: totalJobs,
      jobsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  res.status(200).json(response);
};

// Get all JobPlannings with steps
export const getAllJobPlanningsSimple = async (req: Request, res: Response) => {
  const jobPlannings = await prisma.jobPlanning.findMany({
    select: {
      jobPlanId: true,
      nrcJobNo: true,
      jobDemand: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({
    success: true,
    data: jobPlannings,
  });
};

// Get a JobPlanning by nrcJobNo with steps
export const getJobPlanningByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const jobPlanIdParam = req.query.jobPlanId as string | undefined;
  const jobPlanIdValue = jobPlanIdParam ? Number(jobPlanIdParam) : undefined;
  const jobPlanId =
    jobPlanIdValue !== undefined && !Number.isNaN(jobPlanIdValue)
      ? jobPlanIdValue
      : undefined;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  try {
    const { getJobPlanningData } = await import("../utils/jobPlanningSelector");
    const jobPlanning = await getJobPlanningData(decodedNrcJobNo, jobPlanId);

    if (!jobPlanning) {
      throw new AppError("JobPlanning not found for that NRC Job No", 404);
    }

    res.status(200).json({
      success: true,
      data: jobPlanning,
    });
  } catch (error) {
    console.error("Error in getJobPlanningByNrcJobNo:", error);
    throw new AppError("Failed to get job planning data", 500);
  }
};

// Get job planning by Purchase Order ID
export const getJobPlanningByPurchaseOrderId = async (
  req: Request,
  res: Response
) => {
  const { purchaseOrderId } = req.params;

  try {
    const jobPlannings = await prisma.jobPlanning.findMany({
      where: {
        purchaseOrderId: parseInt(purchaseOrderId),
      },
      include: {
        steps: {
          orderBy: { stepNo: "asc" },
        },
      },
    });

    if (!jobPlannings || jobPlannings.length === 0) {
      throw new AppError("No job planning found for this Purchase Order", 404);
    }

    res.status(200).json({
      success: true,
      count: jobPlannings.length,
      data: jobPlannings,
    });
  } catch (error) {
    console.error("Error in getJobPlanningByPurchaseOrderId:", error);
    throw new AppError("Failed to get job planning by PO ID", 500);
  }
};

// Get all steps for a given nrcJobNo
export const getStepsByNrcJobNo = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;
  const jobPlanIdParam = req.query.jobPlanId as string | undefined;
  const jobPlanIdValue = jobPlanIdParam ? Number(jobPlanIdParam) : undefined;
  const jobPlanId =
    jobPlanIdValue !== undefined && !Number.isNaN(jobPlanIdValue)
      ? jobPlanIdValue
      : undefined;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  try {
    const { getStepsForJob } = await import("../utils/jobPlanningSelector");
    const { steps } = await getStepsForJob(decodedNrcJobNo, jobPlanId);

    if (steps.length === 0) {
      throw new AppError("No steps found for that NRC Job No", 404);
    }

    res.status(200).json({
      success: true,
      count: steps.length,
      data: steps,
    });
  } catch (error) {
    console.error("Error in getStepsByNrcJobNo:", error);
    throw new AppError("Failed to get steps for job", 500);
  }
};

// Get a specific step for a given nrcJobNo and stepNo
export const getStepByNrcJobNoAndStepNo = async (
  req: Request,
  res: Response
) => {
  const { nrcJobNo, stepNo } = req.params;
  const jobPlanIdParam = req.query.jobPlanId as string | undefined;
  const jobStepIdParam = req.query.jobStepId as string | undefined;
  const jobPlanIdValue = jobPlanIdParam ? Number(jobPlanIdParam) : undefined;
  const jobStepIdValue = jobStepIdParam ? Number(jobStepIdParam) : undefined;
  const jobPlanId =
    jobPlanIdValue !== undefined && !Number.isNaN(jobPlanIdValue)
      ? jobPlanIdValue
      : undefined;
  const jobStepId =
    jobStepIdValue !== undefined && !Number.isNaN(jobStepIdValue)
      ? jobStepIdValue
      : undefined;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  console.log(
    `🚨 [getStepByNrcJobNoAndStepNo] Request for stepNo: ${stepNo}, nrcJobNo: ${decodedNrcJobNo}`
  );

  let step: any = null;

  if (jobStepId !== undefined && !Number.isNaN(jobStepId)) {
    step = await prisma.jobStep.findUnique({
      where: { id: jobStepId },
      include: {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true },
        },
      },
    });
    if (
      step &&
      (step.jobPlanning.nrcJobNo !== decodedNrcJobNo ||
        step.stepNo !== Number(stepNo))
    ) {
      step = null;
    }
  }

  if (!step) {
    step = await prisma.jobStep.findFirst({
      where: {
        stepNo: Number(stepNo),
        jobPlanning: {
          nrcJobNo: decodedNrcJobNo,
          ...(jobPlanId !== undefined ? { jobPlanId } : {}),
        },
      },
      include: {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true },
        },
      },
      orderBy: {
        stepNo: "asc",
      },
    });
  }

  console.log(
    `🚨 [getStepByNrcJobNoAndStepNo] Found step: ${step?.stepName} (stepNo: ${step?.stepNo}, ID: ${step?.id})`
  );

  if (!step) {
    throw new AppError("Step not found", 404);
  }

  res.status(200).json({
    success: true,
    data: step,
  });
};

// Update a specific job step's status, startDate, endDate, and user
export const updateJobStepStatus = async (req: Request, res: Response) => {
  const { nrcJobNo, jobPlanId, jobStepNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  const { status } = req.body;
  let userId = req.user?.userId || req.headers["user-id"];
  if (Array.isArray(userId)) userId = userId[0];

  if (
    !["planned", "start", "stop", "completed", "major_hold"].includes(status)
  ) {
    throw new AppError(
      "Invalid status value. Must be one of: planned, start, stop, completed, major_hold",
      400
    );
  }

  // Find the job step
  const jobStep = await prisma.jobStep.findFirst({
    where: {
      id: Number(jobStepNo),
      jobPlanningId: Number(jobPlanId),
      jobPlanning: { nrcJobNo: decodedNrcJobNo },
    },
  });
  if (!jobStep) {
    throw new AppError(
      "JobStep not found for the given jobPlanId and nrcJobNo",
      404
    );
  }

  // Enforce machine access for all steps including PaperStore
  if (req.user?.userId && req.user?.role) {
    const { checkJobStepMachineAccessWithAction, allowHighDemandBypass } =
      await import("../middleware/machineAccess");
    const bypass = await allowHighDemandBypass(
      req.user.role,
      jobStep.stepName,
      decodedNrcJobNo
    );
    if (!bypass) {
      // Determine action based on status change
      const action =
        req.body.status === "start"
          ? "start"
          : req.body.status === "stop"
          ? "stop"
          : "complete";

      const hasAccess = await checkJobStepMachineAccessWithAction(
        req.user.userId,
        req.user.role,
        jobStep.id,
        action
      );
      if (!hasAccess) {
        throw new AppError("Access Denied", 403);
      }
    }
  }

  // Prepare update data
  const updateData: any = { status };
  const now = new Date();
  if (status === "start") {
    updateData.startDate = now;
    updateData.user = userId || null;
  } else if (status === "stop") {
    updateData.endDate = now;
    updateData.completedBy = userId || null;
  }

  const updatedStep = await prisma.jobStep.update({
    where: { id: Number(jobStepNo) },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === "string") {
    try {
      console.log(
        `Attempting to log activity for user ${userId}, step ${jobStepNo}, status ${status}`
      );
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Job step status updated to ${status}`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId,
          jobStepNo,
          status,
          startDate: updatedStep.startDate,
          endDate: updatedStep.endDate,
        }),
        "JobStep",
        jobStepNo
      );
      console.log(
        `Successfully logged activity for user ${userId}, step ${jobStepNo}`
      );
    } catch (error) {
      console.error(
        `Failed to log activity for user ${userId}, step ${jobStepNo}:`,
        error
      );
    }
  } else {
    console.log(
      `Skipping activity log - userId: ${userId}, type: ${typeof userId}`
    );
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === "stop" && updatedStep.jobPlanningId) {
    try {
      // Use jobPlanId instead of nrcJobNo to avoid affecting other plannings with same nrcJobNo
      const completionResult = await autoCompleteJobIfReady(
        updatedStep.jobPlanningId,
        userId
      );
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: `Job step status updated to ${status} and job automatically completed`,
          autoCompleted: true,
          completedJob: completionResult.completedJob,
        });
      }
    } catch (error) {
      console.error("Error checking auto-completion:", error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: `Job step status updated to ${status}`,
  });
};

// Unified update: status and/or machineDetails
export const upsertStepByNrcJobNoAndStepNo = async (
  req: Request,
  res: Response
) => {
  const { nrcJobNo, stepNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  const jobPlanIdInput = (req.body?.jobPlanId ?? req.query?.jobPlanId) as
    | string
    | number
    | undefined;
  const parsedJobPlanId =
    jobPlanIdInput !== undefined ? Number(jobPlanIdInput) : undefined;
  const jobPlanId =
    parsedJobPlanId !== undefined && !Number.isNaN(parsedJobPlanId)
      ? parsedJobPlanId
      : undefined;

  let userId = req.user?.userId || req.headers["user-id"];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Starting step update for job ${decodedNrcJobNo}, step ${stepNo}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Original nrcJobNo: ${nrcJobNo}, Decoded: ${decodedNrcJobNo}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] User ID: ${userId}, Role: ${userRole}`
  );
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Request body:`, req.body);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Status: ${req.body.status}`);
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Step number as number: ${Number(
      stepNo
    )}`
  );

  // Get the prioritized job planning first
  const { getJobPlanningData } = await import("../utils/jobPlanningSelector");
  const jobPlanning = await getJobPlanningData(decodedNrcJobNo, jobPlanId);

  if (!jobPlanning) {
    throw new AppError("Job planning not found", 404);
  }

  // Find steps with the given step number from the prioritized job planning
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] About to query steps with stepNo: ${Number(
      stepNo
    )}, jobPlanningId: ${jobPlanning.jobPlanId}`
  );

  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanningId: jobPlanning.jobPlanId,
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true },
      },
    },
  });

  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Database query returned ${steps.length} steps`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Found ${steps.length} steps for step number ${stepNo} in job planning ${jobPlanning.jobPlanId}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Query parameters - stepNo: ${Number(
      stepNo
    )}, jobPlanningId: ${jobPlanning.jobPlanId}`
  );
  steps.forEach((s, index) => {
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Step ${index}: ${s.stepName} (step ${s.stepNo}), ID: ${s.id}`
    );
  });

  if (steps.length === 0) {
    throw new AppError(
      "Step not found for that NRC Job No and step number",
      404
    );
  }

  // Use the step with the correct step number (stepNo from URL parameter)
  // Don't filter by role here - role validation happens later
  let step = steps[0]; // Default to first step

  // If there are multiple steps with the same step number, use the first one
  // The step number should be unique per job planning, but if not, we'll use the first match
  if (steps.length > 1) {
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Multiple steps found for step number ${stepNo}, using the first one`
    );
  }

  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Selected step: ${step.stepName} (step ${step.stepNo})`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Selected step ID: ${step.id}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Selected step current status: ${step.status}`
  );

  // Enforce role-based access control and step dependencies for all users
  if (req.user?.userId && req.user?.role) {
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Before role check - Step: ${step.stepName} (step ${step.stepNo})`
    );
    const { isStepForUserRole } = await import("../middleware/machineAccess");

    // Parse role if it's a JSON string
    let parsedRole: string | string[] = req.user.role;
    if (typeof req.user.role === "string") {
      try {
        const roles = JSON.parse(req.user.role);
        if (Array.isArray(roles)) {
          parsedRole = roles;
        }
      } catch {
        // Not JSON, use as is
      }
    }
    const roleString = Array.isArray(parsedRole)
      ? parsedRole.join(",")
      : parsedRole;

    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Role access check - User role: ${req.user.role}, Step: ${step.stepName}, Job demand: ${jobPlanning.jobDemand}`
    );
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] isStepForUserRole result: ${isStepForUserRole(
        step.stepName,
        req.user.role
      )}`
    );

    // Admin and Planner users have access to all steps - bypass role check
    if (RoleManager.isAdmin(roleString) || RoleManager.isPlanner(roleString)) {
      console.log(
        `✅ [upsertStepByNrcJobNoAndStepNo] Admin/Planner user - allowing access to step '${step.stepName}'`
      );
    } else {
      // Always check if the step matches the user's role (even for high demand jobs)
      // High demand jobs bypass machine access but still respect role-based step access
      if (!isStepForUserRole(step.stepName, req.user.role)) {
        console.log(
          `❌ [upsertStepByNrcJobNoAndStepNo] Access denied - User role '${req.user.role}' does not have access to step '${step.stepName}'`
        );
        throw new AppError(
          `User role '${req.user.role}' does not have access to step '${step.stepName}'`,
          403
        );
      }
    }

    // Step dependency validation - different rules for 'start' vs 'stop' status
    // Admin and Planner users can bypass step dependency validation
    if (
      (req.body.status === "start" || req.body.status === "stop") &&
      !RoleManager.isAdmin(roleString) &&
      !RoleManager.isPlanner(roleString)
    ) {
      console.log(
        `🔍 [upsertStepByNrcJobNoAndStepNo] Checking step dependencies for step ${step.stepNo}`
      );

      // Get all steps for this job planning to check dependencies
      const allSteps = await prisma.jobStep.findMany({
        where: { jobPlanningId: jobPlanning.jobPlanId },
        orderBy: { stepNo: "asc" },
      });

      console.log(
        `🔍 [upsertStepByNrcJobNoAndStepNo] Found ${allSteps.length} total steps for job planning`
      );

      // Check if previous steps meet requirements
      const currentStepNo = step.stepNo;
      const previousSteps = allSteps.filter((s) => s.stepNo < currentStepNo);

      console.log(
        `🔍 [upsertStepByNrcJobNoAndStepNo] Previous steps to check: ${previousSteps.length}`
      );
      previousSteps.forEach((prevStep) => {
        console.log(
          `🔍 [upsertStepByNrcJobNoAndStepNo] Previous step ${prevStep.stepNo} (${prevStep.stepName}): status = ${prevStep.status}`
        );
      });

      if (req.body.status === "start") {
        // For START: Previous steps must be started (status = 'start' or 'stop')
        const notStartedSteps = previousSteps.filter(
          (s) => s.status !== "start" && s.status !== "stop"
        );

        if (notStartedSteps.length > 0) {
          const notStartedStepNames = notStartedSteps
            .map((s) => `${s.stepName} (step ${s.stepNo})`)
            .join(", ");
          console.log(
            `❌ [upsertStepByNrcJobNoAndStepNo] Cannot start step ${currentStepNo} - previous steps not started: ${notStartedStepNames}`
          );
          throw new AppError(
            `Cannot start step ${currentStepNo} (${step.stepName}) - previous steps must be started first: ${notStartedStepNames}`,
            400
          );
        }

        console.log(
          `✅ [upsertStepByNrcJobNoAndStepNo] All previous steps started, allowing step ${currentStepNo} to start`
        );
      } else if (req.body.status === "stop") {
        // For STOP: Previous steps must be completed (status = 'stop')
        const notCompletedSteps = previousSteps.filter(
          (s) => s.status !== "stop"
        );

        if (notCompletedSteps.length > 0) {
          const notCompletedStepNames = notCompletedSteps
            .map((s) => `${s.stepName} (step ${s.stepNo})`)
            .join(", ");
          console.log(
            `❌ [upsertStepByNrcJobNoAndStepNo] Cannot stop step ${currentStepNo} - previous steps not completed: ${notCompletedStepNames}`
          );
          throw new AppError(
            `Cannot stop step ${currentStepNo} (${step.stepName}) - previous steps must be completed first: ${notCompletedStepNames}`,
            400
          );
        }

        console.log(
          `✅ [upsertStepByNrcJobNoAndStepNo] All previous steps completed, allowing step ${currentStepNo} to stop`
        );
      }
    } else if (
      RoleManager.isAdmin(roleString) ||
      RoleManager.isPlanner(roleString)
    ) {
      console.log(
        `✅ [upsertStepByNrcJobNoAndStepNo] Admin/Planner user - bypassing step dependency validation`
      );
    }

    console.log(
      `✅ [upsertStepByNrcJobNoAndStepNo] Access granted for step ${step.stepName}`
    );
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] After role check - Step: ${step.stepName} (step ${step.stepNo})`
    );
  }

  const updateData: any = {};

  // Optional status handling
  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!["planned", "start", "stop", "major_hold"].includes(status)) {
      throw new AppError(
        "Invalid status value. Must be one of: planned, start, stop, major_hold",
        400
      );
    }

    // ✅ PROTECTION: For machine-based steps, prevent status updates via this endpoint
    // Machine-based steps should only have status updated via completeWorkOnMachine API
    // Admin and Planner users can bypass this protection
    const machineBasedSteps = [
      "PrintingDetails",
      "Corrugation",
      "FluteLaminateBoardConversion",
      "Punching",
      "SideFlapPasting",
    ];
    const isMachineStep = machineBasedSteps.includes(step.stepName);

    // Parse role to check if user is admin/planner
    let parsedRole: string | string[] = userRole || "";
    if (typeof userRole === "string") {
      try {
        const roles = JSON.parse(userRole);
        if (Array.isArray(roles)) {
          parsedRole = roles;
        }
      } catch {
        // Not JSON, use as is
      }
    }
    const roleString = Array.isArray(parsedRole)
      ? parsedRole.join(",")
      : parsedRole;
    const isAdminOrPlanner =
      RoleManager.isAdmin(roleString) || RoleManager.isPlanner(roleString);

    if (isMachineStep && status === "stop" && !isAdminOrPlanner) {
      console.log(
        `⚠️ [upsertStepByNrcJobNoAndStepNo] Ignoring status='stop' for machine-based step ${step.stepName}`
      );
      console.log(
        `ℹ️  Status for machine steps is controlled by completeWorkOnMachine API based on completion criteria`
      );
      // DO NOT update status for machine-based steps
      // Just log and skip, but still process other fields
    } else {
      // For non-machine steps (PaperStore, Quality, Dispatch) or non-stop statuses, allow status update
      const now = new Date();

      if (status === "planned") {
        updateData.status = "planned";
        updateData.startDate = null;
        updateData.endDate = null;
        updateData.user = null;
      } else if (status === "start") {
        updateData.status = "start";
        updateData.startDate = now;
        updateData.user = userId || null;
      } else if (status === "stop") {
        updateData.status = "stop";
        updateData.endDate = now;
        updateData.completedBy = userId || null;
      } else if (status === "major_hold") {
        updateData.status = "major_hold";
        // Don't clear startDate or endDate for major_hold
      }
    }
  }

  // Optional machineDetails handling
  let machineDetailsProvided = false;
  if (req.body.machineDetails !== undefined) {
    machineDetailsProvided = true;
    updateData.machineDetails = Array.isArray(req.body.machineDetails)
      ? req.body.machineDetails.map((m: any) => ({
          machineId: m.machineId || m.id,
          unit: m.unit,
          machineCode: m.machineCode,
          machineType: m.machineType,
        }))
      : [];
  }

  // Handle form data fields for step completion - store in appropriate step-specific models
  const formDataFields = [
    "quantity",
    "oprName",
    "size",
    "passQuantity",
    "checkedBy",
    "noOfBoxes",
    "dispatchNo",
    "remarks",
    "available",
    "completeRemark",
    "holdRemark",
    "majorHoldRemark",
    "mill",
    "gsm",
    "quality",
    "extraMargin",
    "sheetSize",
  ];
  const hasFormData = formDataFields.some(
    (field) => req.body[field] !== undefined
  );

  // Call storeStepFormData if there's form data or status change
  if (
    hasFormData ||
    req.body.status === "start" ||
    req.body.status === "stop"
  ) {
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Processing step data for step: ${step.stepName}`
    );
    console.log(
      `🔍 [upsertStepByNrcJobNoAndStepNo] Form data received:`,
      req.body
    );

    try {
      // Store form data in the appropriate step-specific model based on step name
      await storeStepFormData(
        step.stepName,
        decodedNrcJobNo,
        step.id,
        req.body
      );
    } catch (formDataError: any) {
      console.error(
        `❌ [upsertStepByNrcJobNoAndStepNo] Error storing form data:`,
        formDataError
      );
      throw new AppError(
        `Failed to store form data: ${formDataError.message}`,
        500
      );
    }
  }

  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Request body status:`,
    req.body.status
  );
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Update data:`, updateData);
  console.log(`🔍 [upsertStepByNrcJobNoAndStepNo] Step ID: ${step.id}`);
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Step current status: ${step.status}`
  );

  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Updated step result:`,
    updatedStep
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Original step ID: ${step.id}, Updated step ID: ${updatedStep.id}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Original step name: ${step.stepName}, Updated step name: ${updatedStep.stepName}`
  );
  console.log(
    `🔍 [upsertStepByNrcJobNoAndStepNo] Original step no: ${step.stepNo}, Updated step no: ${updatedStep.stepNo}`
  );

  if (machineDetailsProvided) {
    await updateJobMachineDetailsFlag(decodedNrcJobNo);
  }

  // Log the job step status update action
  if (userId && typeof userId === "string" && updateData.status) {
    try {
      console.log(
        `Attempting to log activity for user ${userId}, step ${step.id}, status ${updateData.status}`
      );
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Job step status updated to ${updateData.status}`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId: step.jobPlanningId,
          stepNo: stepNo,
          status: updateData.status,
          startDate: updatedStep.startDate,
          endDate: updatedStep.endDate,
        }),
        "JobStep",
        stepNo
      );
      console.log(
        `Successfully logged activity for user ${userId}, step ${step.id}`
      );
    } catch (error) {
      console.error(
        `Failed to log activity for user ${userId}, step ${step.id}:`,
        error
      );
    }
  } else {
    console.log(
      `Skipping activity log - userId: ${userId}, type: ${typeof userId}, status: ${
        updateData.status
      }`
    );
  }

  // Check if job should be automatically completed when step status is set to 'stop'
  if (updateData.status === "stop" && updatedStep.jobPlanningId) {
    try {
      // Use jobPlanId instead of nrcJobNo to avoid affecting other plannings with same nrcJobNo
      const completionResult = await autoCompleteJobIfReady(
        updatedStep.jobPlanningId,
        userId
      );
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: "Step updated successfully and job automatically completed",
          autoCompleted: true,
          completedJob: completionResult.completedJob,
        });
      }
    } catch (error) {
      console.error("Error checking auto-completion:", error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: "Step updated successfully",
  });
};

// Update step status for a given nrcJobNo and stepNo (frontend URL pattern)
export const updateStepStatusByNrcJobNoAndStepNo = async (
  req: Request,
  res: Response
) => {
  const { nrcJobNo, stepNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  const jobPlanIdInput = (req.body?.jobPlanId ?? req.query?.jobPlanId) as
    | string
    | number
    | undefined;
  const parsedJobPlanId =
    jobPlanIdInput !== undefined ? Number(jobPlanIdInput) : undefined;
  const jobPlanId =
    parsedJobPlanId !== undefined && !Number.isNaN(parsedJobPlanId)
      ? parsedJobPlanId
      : undefined;

  const { status } = req.body;
  let userId = req.user?.userId || req.headers["user-id"];
  if (Array.isArray(userId)) userId = userId[0];
  const userRole = req.user?.role;

  console.log(
    `🔍 [StepUpdate] Starting step update for job ${decodedNrcJobNo}, step ${stepNo}, status ${status}`
  );
  console.log(`🔍 [StepUpdate] User ID: ${userId}, Role: ${userRole}`);

  if (
    !["planned", "start", "stop", "completed", "major_hold"].includes(status)
  ) {
    throw new AppError(
      "Invalid status value. Must be one of: planned, start, stop, completed, major_hold",
      400
    );
  }

  // Get the prioritized job planning first
  const { getJobPlanningData } = await import("../utils/jobPlanningSelector");
  const jobPlanning = await getJobPlanningData(decodedNrcJobNo, jobPlanId);

  console.log(
    `🔍 [StepUpdate] Found job planning:`,
    jobPlanning ? `ID ${jobPlanning.jobPlanId}` : "null"
  );

  if (!jobPlanning) {
    throw new AppError("Job planning not found", 404);
  }

  // Find steps with the given step number from the prioritized job planning
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanningId: jobPlanning.jobPlanId,
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true },
      },
    },
  });

  if (steps.length === 0) {
    throw new AppError(
      "Step not found for that NRC Job No and step number",
      404
    );
  }

  // If user has a role, filter by role-appropriate step name
  let step = steps[0]; // Default to first step

  if (userRole) {
    const { isStepForUserRole } = await import("../middleware/machineAccess");

    // Find the step that matches the user's role
    const roleMatchedStep = steps.find((s) =>
      isStepForUserRole(s.stepName, userRole)
    );

    if (roleMatchedStep) {
      step = roleMatchedStep;
    }
    // If no role match found, use the first step (backward compatibility)
  }

  // Prepare update data
  const updateData: any = { status };
  const now = new Date();
  if (status === "start") {
    updateData.startDate = now;
    updateData.user = userId || null;
  } else if (status === "stop") {
    updateData.endDate = now;
    updateData.completedBy = userId || null;
  }

  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
    select: {
      id: true,
      stepNo: true,
      stepName: true,
      machineDetails: true,
      jobPlanningId: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      user: true,
      completedBy: true,
      startDate: true,
      endDate: true,
    },
  });

  // Log the job step status update action
  if (userId && typeof userId === "string") {
    try {
      console.log(
        `Attempting to log activity for user ${userId}, step ${step.id}, status ${status}`
      );
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Job step status updated to ${status}`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId: step.jobPlanning.jobPlanId,
          stepNo,
          status,
          startDate: updatedStep.startDate,
          endDate: updatedStep.endDate,
        }),
        "JobStep",
        stepNo
      );
      console.log(
        `Successfully logged activity for user ${userId}, step ${step.id}`
      );
    } catch (error) {
      console.error(
        `Failed to log activity for user ${userId}, step ${step.id}:`,
        error
      );
    }
  } else {
    console.log(
      `Skipping activity log - userId: ${userId}, type: ${typeof userId}`
    );
  }

  // Check if job should be automatically completed when step is set to 'stop'
  if (status === "stop" && updatedStep.jobPlanningId) {
    try {
      // Use jobPlanId instead of nrcJobNo to avoid affecting other plannings with same nrcJobNo
      const completionResult = await autoCompleteJobIfReady(
        updatedStep.jobPlanningId,
        userId
      );
      if (completionResult.completed) {
        return res.status(200).json({
          success: true,
          data: updatedStep,
          message: `Job step status updated to ${status} and job automatically completed`,
          autoCompleted: true,
          completedJob: completionResult.completedJob,
        });
      }
    } catch (error) {
      console.error("Error checking auto-completion:", error);
      // Continue with normal response even if auto-completion check fails
    }
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: `Job step status updated to ${status}`,
  });
};

// Update any field of a specific step for a given nrcJobNo and stepNo
export const updateStepByNrcJobNoAndStepNo = async (
  req: Request,
  res: Response
) => {
  const { nrcJobNo, stepNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  const userRole = req.user?.role;

  // Find all steps with the given step number for this job
  const steps = await prisma.jobStep.findMany({
    where: {
      stepNo: Number(stepNo),
      jobPlanning: {
        nrcJobNo: decodedNrcJobNo,
      },
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true },
      },
    },
  });

  if (steps.length === 0) {
    throw new AppError(
      "Step not found for that NRC Job No and step number",
      404
    );
  }

  // If user has a role, filter by role-appropriate step name
  let step = steps[0]; // Default to first step

  if (userRole) {
    const { isStepForUserRole } = await import("../middleware/machineAccess");

    // Find the step that matches the user's role
    const roleMatchedStep = steps.find((s) =>
      isStepForUserRole(s.stepName, userRole)
    );

    if (roleMatchedStep) {
      step = roleMatchedStep;
    }
    // If no role match found, use the first step (backward compatibility)
  }
  // Process machine details if provided
  const updateData = { ...req.body };

  // If machineDetails is provided, process it to match the format
  if (req.body.machineDetails) {
    updateData.machineDetails = req.body.machineDetails.map((machine: any) => ({
      id: machine.machineId || machine.id,
      unit: machine.unit,
      machineCode: machine.machineCode,
      machineType: machine.machineType,
    }));
  }

  // Update the step with the processed fields
  const updatedStep = await prisma.jobStep.update({
    where: { id: step.id },
    data: updateData,
  });

  // If machineDetails were updated, automatically update the job's machine details flag
  if (req.body.machineDetails !== undefined) {
    await updateJobMachineDetailsFlag(decodedNrcJobNo);
  }

  res.status(200).json({
    success: true,
    data: updatedStep,
    message: "Step updated successfully",
  });
};

// Get workflow status for a job
export const getJobWorkflowStatus = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  try {
    const workflowStatus = await getWorkflowStatus(decodedNrcJobNo);

    res.status(200).json({
      success: true,
      data: workflowStatus,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Failed to get workflow status", 500);
  }
};

// Bulk update all job steps and their details
export const bulkUpdateJobSteps = async (req: Request, res: Response) => {
  const { nrcJobNo } = req.params;

  // URL decode the nrcJobNo parameter to handle spaces and special characters
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);

  const { steps, jobDetails } = req.body;

  try {
    // 1. Update job details if provided (outside transaction)
    if (jobDetails) {
      await prisma.job.update({
        where: { nrcJobNo: decodedNrcJobNo },
        data: jobDetails,
      });
    }

    // 2. Get existing job planning (outside transaction)
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo: decodedNrcJobNo },
      include: {
        steps: {
          include: {
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
      },
    });

    if (!jobPlanning) {
      throw new AppError("Job planning not found", 404);
    }

    // 3. Use transaction only for step updates (with increased timeout)
    await prisma.$transaction(
      async (tx) => {
        for (const stepData of steps) {
          const { stepNo, stepName, status, machineDetails, stepDetails } =
            stepData;

          const step = jobPlanning.steps.find((s) => s.stepNo === stepNo);
          if (!step) continue;

          // Update step basic info
          await tx.jobStep.update({
            where: { id: step.id },
            data: {
              status,
              machineDetails,
              startDate: status === "start" ? new Date() : undefined,
              endDate: status === "stop" ? new Date() : undefined,
              user: req.user?.userId || null,
            },
          });

          // Update step-specific details based on stepName
          if (stepDetails) {
            switch (stepName) {
              case "PaperStore":
                if (step.paperStore) {
                  await tx.paperStore.update({
                    where: { id: step.paperStore.id },
                    data: stepDetails,
                  });
                }
                break;
              case "PrintingDetails":
                if (step.printingDetails) {
                  await tx.printingDetails.update({
                    where: { id: step.printingDetails.id },
                    data: stepDetails,
                  });
                }
                break;
              case "Corrugation":
                if (step.corrugation) {
                  await tx.corrugation.update({
                    where: { id: step.corrugation.id },
                    data: stepDetails,
                  });
                }
                break;
              case "FluteLaminateBoardConversion":
                if (step.flutelam) {
                  await tx.fluteLaminateBoardConversion.update({
                    where: { id: step.flutelam.id },
                    data: stepDetails,
                  });
                }
                break;
              case "Punching":
                if (step.punching) {
                  await tx.punching.update({
                    where: { id: step.punching.id },
                    data: stepDetails,
                  });
                }
                break;
              case "SideFlapPasting":
                if (step.sideFlapPasting) {
                  await tx.sideFlapPasting.update({
                    where: { id: step.sideFlapPasting.id },
                    data: stepDetails,
                  });
                }
                break;
              case "QualityDept":
                if (step.qualityDept) {
                  await tx.qualityDept.update({
                    where: { id: step.qualityDept.id },
                    data: stepDetails,
                  });
                }
                break;
              case "DispatchProcess":
                if (step.dispatchProcess) {
                  await tx.dispatchProcess.update({
                    where: { id: step.dispatchProcess.id },
                    data: stepDetails,
                  });
                }
                break;
            }
          }
        }
      },
      {
        timeout: 15000, // 15 seconds timeout
      }
    );

    // 4. Update job machine details flag (outside transaction)
    await updateJobMachineDetailsFlag(decodedNrcJobNo);

    // 5. Return updated data (outside transaction)
    const updatedData = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo: decodedNrcJobNo },
      include: {
        steps: {
          include: {
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
      },
    });

    res.status(200).json({
      success: true,
      data: updatedData,
      message: "All job steps updated successfully",
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update job steps",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update job step by job step ID directly (solves multiple job plannings issue)
export const updateJobStepById = async (req: Request, res: Response) => {
  const { jobStepId } = req.params;
  const userRole = req.user?.role;

  console.log(`🔍 [updateJobStepById] Starting update for step ${jobStepId}`);
  console.log(
    `🔍 [updateJobStepById] User role: ${userRole} (type: ${typeof userRole})`
  );
  console.log(`🔍 [updateJobStepById] Request body:`, req.body);
  console.log(`🔍 [updateJobStepById] req.user:`, req.user);

  try {
    // Find the specific job step by ID
    const jobStep = await prisma.jobStep.findUnique({
      where: { id: Number(jobStepId) },
      include: {
        jobPlanning: {
          select: { jobPlanId: true, nrcJobNo: true, jobDemand: true },
        },
      },
    });

    if (!jobStep) {
      throw new AppError(`Job step with ID ${jobStepId} not found`, 404);
    }

    // Check if user has access to this step based on role
    if (userRole) {
      const { isStepForUserRole } = await import("../middleware/machineAccess");

      console.log(
        `🔍 [updateJobStepById] Role access check - User role: ${userRole}, Step: ${jobStep.stepName}, Job demand: ${jobStep.jobPlanning.jobDemand}`
      );
      console.log(
        `🔍 [updateJobStepById] isStepForUserRole result: ${isStepForUserRole(
          jobStep.stepName,
          userRole
        )}`
      );

      // Always check if the step matches the user's role (even for high demand jobs)
      // High demand jobs bypass machine access but still respect role-based step access
      if (!isStepForUserRole(jobStep.stepName, userRole)) {
        console.log(
          `❌ [updateJobStepById] Access denied - User role '${userRole}' does not have access to step '${jobStep.stepName}'`
        );
        throw new AppError(
          `User role '${userRole}' does not have access to step '${jobStep.stepName}'`,
          403
        );
      }
      console.log(
        `✅ [updateJobStepById] Access granted for step ${jobStep.stepName}`
      );
    }

    // Process machine details if provided
    const updateData = { ...req.body };

    // If machineDetails is provided, process it to match the format
    if (req.body.machineDetails) {
      updateData.machineDetails = req.body.machineDetails.map(
        (machine: any) => ({
          id: machine.machineId || machine.id,
          unit: machine.unit,
          machineCode: machine.machineCode,
          machineType: machine.machineType,
        })
      );
    }

    // Update the job step
    console.log(`🔍 [updateJobStepById] Updating step with data:`, updateData);
    let updatedStep;
    try {
      updatedStep = await prisma.jobStep.update({
        where: { id: Number(jobStepId) },
        data: updateData,
      });
      console.log(
        `🔍 [updateJobStepById] Step updated successfully:`,
        updatedStep
      );
    } catch (prismaError: any) {
      console.error(`❌ [updateJobStepById] Prisma update error:`, prismaError);
      throw new AppError(`Database update failed: ${prismaError.message}`, 500);
    }

    // Skip machine details flag update for now to avoid 500 errors
    // TODO: Fix updateJobMachineDetailsFlag function

    res.status(200).json({
      success: true,
      data: updatedStep,
      message: `Job step ${jobStepId} updated successfully`,
    });
  } catch (error: any) {
    console.error(`Error updating job step ${jobStepId}:`, error);
    console.error(`Error details:`, error);
    if (error instanceof AppError) {
      throw error;
    }
    // Provide more specific error information
    if (error.code === "P2002") {
      throw new AppError("A step with this data already exists", 400);
    } else if (error.code === "P2025") {
      throw new AppError("Step not found", 404);
    } else if (error.code === "P2003") {
      throw new AppError("Foreign key constraint failed", 400);
    }
    throw new AppError(`Failed to update job step: ${error.message}`, 500);
  }
};

/**
 * Store form data in the appropriate step-specific model
 */
async function storeStepFormData(
  stepName: string,
  nrcJobNo: string,
  jobStepId: number,
  formData: any
) {
  const stepNameLower = stepName.toLowerCase();

  console.log(
    `🔍 [storeStepFormData] Processing step: ${stepName} (${stepNameLower})`
  );
  console.log(`🔍 [storeStepFormData] Job: ${nrcJobNo}, Step ID: ${jobStepId}`);
  console.log(`🔍 [storeStepFormData] Form data:`, formData);

  // Fetch JobStep data to get correct operator name and machine info
  const jobStep = await prisma.jobStep.findUnique({
    where: { id: jobStepId },
    include: {
      jobPlanning: {
        include: {
          steps: true,
        },
      },
    },
  });

  if (!jobStep) {
    throw new Error(`JobStep with ID ${jobStepId} not found`);
  }

  // Get operator name from JobStep user field
  const operatorName = jobStep.user || "System";

  // Get machine info from JobStep machineDetails
  const machineDetails = jobStep.machineDetails as any[];
  const machineInfo = machineDetails?.[0];
  const machineCode = machineInfo?.machineCode || null;
  const machineType = machineInfo?.machineType || null;

  console.log(
    `🔍 [storeStepFormData] JobStep user: ${operatorName}, Machine: ${machineCode}`
  );

  // Calculate shift for auto-population
  const { calculateShift } = await import("../utils/autoPopulateFields");
  const currentDate = new Date();
  const calculatedShift = calculateShift(currentDate);

  // Determine step-specific status based on JobStep status and completion data
  // For non-machine steps (PaperStore, QC, Dispatch), only set to 'accept' if completion data is provided
  let stepStatus: "in_progress" | "accept";
  const nonMachineSteps = ["paperstore", "qualitydept", "dispatchprocess"];
  const isNonMachineStep = nonMachineSteps.some((name) =>
    stepNameLower.includes(name)
  );
  const isDispatchStep = stepNameLower.includes("dispatch");

  if (formData.status === "stop") {
    // For non-machine steps, only accept if completion data exists
    // NOTE: Dispatch handles its own status based on cumulative quantity, so don't override here
    const isQualityStep = stepNameLower.includes("quality");
    const isPaperStoreStep = stepNameLower.includes("paperstore");

    // Check if completion data exists based on step type
    const hasCompletionData = isPaperStoreStep
      ? formData.available || formData.completeRemark || formData.quantity
      : isQualityStep
      ? formData.passQuantity ||
        formData["Pass Quantity"] ||
        formData.rejectedQty ||
        formData["Reject Quantity"]
      : formData.available || formData.completeRemark || formData.quantity;

    if (isNonMachineStep && !isDispatchStep && !hasCompletionData) {
      stepStatus = "in_progress"; // Keep in progress until completion form is filled
    } else if (!isDispatchStep) {
      stepStatus = "accept";
    } else {
      // Dispatch status will be determined later based on cumulative quantity
      stepStatus = "in_progress";
    }
  } else {
    stepStatus = "in_progress"; // default for 'start' or any other status
  }

  console.log(
    `🔍 [storeStepFormData] JobStep status: ${formData.status} → Step status: ${stepStatus}`
  );
  console.log(
    `🔍 [storeStepFormData] Step name: ${stepName}, Step name lower: ${stepNameLower}`
  );

  // Helper function to extract remark fields from formData
  // Only update fields if they're provided in formData, otherwise preserve existing values
  const getRemarkFields = async (stepNameLower: string, jobStepId: number) => {
    // Get existing remark values from database to preserve them if not provided in formData
    let existingRemarks: any = {};

    try {
      if (stepNameLower.includes("paperstore")) {
        const existing = await prisma.paperStore.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            remarks: existing.remarks,
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (stepNameLower.includes("printing")) {
        const existing = await prisma.printingDetails.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            remarks: existing.remarks,
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (stepNameLower.includes("corrugation")) {
        const existing = await prisma.corrugation.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (stepNameLower.includes("flute")) {
        const existing = await prisma.fluteLaminateBoardConversion.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            remarks: existing.remarks,
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (
        stepNameLower.includes("punching") ||
        stepNameLower.includes("die cutting")
      ) {
        const existing = await prisma.punching.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (stepNameLower.includes("flap")) {
        const existing = await prisma.sideFlapPasting.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = {
            completeRemark: existing.completeRemark,
            holdRemark: existing.holdRemark,
            majorHoldRemark: existing.majorHoldRemark,
          };
        }
      } else if (stepNameLower.includes("quality")) {
        const existing = await prisma.qualityDept.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = { remarks: existing.remarks };
        }
      } else if (stepNameLower.includes("dispatch")) {
        const existing = await prisma.dispatchProcess.findUnique({
          where: { jobStepId },
        });
        if (existing) {
          existingRemarks = { remarks: existing.remarks };
        }
      }
    } catch (error) {
      console.log(
        `⚠️ [getRemarkFields] Error fetching existing remarks: ${error}`
      );
    }

    return {
      remarks:
        formData.remarks ||
        formData["Remarks"] ||
        formData["Complete Remark"] ||
        existingRemarks.remarks ||
        null,
      completeRemark:
        formData.completeRemark ||
        formData["Complete Remark"] ||
        formData["completeRemark"] ||
        existingRemarks.completeRemark ||
        null,
      holdRemark:
        formData.holdRemark ||
        formData["Hold Remark"] ||
        formData["holdRemark"] ||
        existingRemarks.holdRemark ||
        null,
      majorHoldRemark:
        formData.majorHoldRemark ||
        formData["Major Hold Remark"] ||
        formData["majorHoldRemark"] ||
        existingRemarks.majorHoldRemark ||
        null,
    };
  };

  // Get remark fields (preserves existing values if not provided in formData)
  const remarkFields = await getRemarkFields(stepNameLower, jobStepId);

  try {
    if (stepNameLower.includes("paperstore")) {
      // Use user input for quantity and available, fallback to null if not provided
      const quantity = formData.quantity
        ? parseInt(formData.quantity) || null
        : null;
      const available = formData.available
        ? parseInt(formData.available) || null
        : null;
      await prisma.paperStore.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: formData.quantity ? quantity : null,
          available: formData.available ? available : null,
          sheetSize: formData.sheetSize,
          mill: formData.mill,
          gsm: formData.gsm,
          quality: formData.quality,
          extraMargin: formData.extraMargin,
          issuedDate: formData.issuedDate
            ? new Date(formData.issuedDate)
            : undefined,
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          available,
          sheetSize: formData.sheetSize || "A4",
          mill: formData.mill,
          gsm: formData.gsm,
          quality: formData.quality,
          extraMargin: formData.extraMargin,
          issuedDate: formData.issuedDate
            ? new Date(formData.issuedDate)
            : new Date(),
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes("printing")) {
      // Use user input for quantity, fallback to null if not provided
      const quantity = formData.quantity
        ? parseInt(formData.quantity) || null
        : null;
      await prisma.printingDetails.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: formData.quantity ? quantity : null,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          noOfColours: formData.noOfColours
            ? parseInt(formData.noOfColours) || null
            : null,
          inksUsed: formData.inksUsed,
          wastage: formData.wastage ? parseInt(formData.wastage) || null : null,
          coatingType: formData.coatingType,
          separateSheets: formData.separateSheets
            ? parseInt(formData.separateSheets) || null
            : null,
          extraSheets: formData.extraSheets
            ? parseInt(formData.extraSheets) || null
            : null,
          machine: machineCode, // Use JobStep machine instead of form data
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          noOfColours: formData.noOfColours
            ? parseInt(formData.noOfColours) || null
            : null,
          inksUsed: formData.inksUsed,
          wastage: formData.wastage ? parseInt(formData.wastage) || null : null,
          coatingType: formData.coatingType,
          separateSheets: formData.separateSheets
            ? parseInt(formData.separateSheets) || null
            : null,
          extraSheets: formData.extraSheets
            ? parseInt(formData.extraSheets) || null
            : null,
          machine: machineCode, // Use JobStep machine instead of form data
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
        },
      });
    } else if (stepNameLower.includes("corrugation")) {
      // Use user input for quantity, fallback to null if not provided
      const quantity =
        formData.quantity || formData["Sheets Count"]
          ? parseInt(formData.quantity || formData["Sheets Count"]) || null
          : null;
      await prisma.corrugation.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          machineNo: machineCode, // Use JobStep machine instead of form data
          size: formData.size || formData["Size"],
          gsm1: formData.gsm1 || formData["GSM1"],
          gsm2: formData.gsm2 || formData["GSM2"],
          flute: formData.flute || formData["Flute Type"],
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          oprName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          machineNo: machineCode, // Use JobStep machine instead of form data
          size: formData.size || formData["Size"],
          gsm1: formData.gsm1 || formData["GSM1"],
          gsm2: formData.gsm2 || formData["GSM2"],
          flute: formData.flute || formData["Flute Type"],
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
        },
      });
    } else if (stepNameLower.includes("flute")) {
      // Use user input for quantity, fallback to null if not provided
      const quantity =
        formData.quantity || formData["OK Quantity"]
          ? parseInt(formData.quantity || formData["OK Quantity"]) || null
          : null;
      await prisma.fluteLaminateBoardConversion.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          film: formData.film || formData["Film Type"],
          adhesive: formData.adhesive || formData["Adhesive"],
          wastage:
            formData.wastage || formData["Wastage"]
              ? parseInt(formData.wastage || formData["Wastage"]) || null
              : null,
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          film: formData.film || formData["Film Type"],
          adhesive: formData.adhesive || formData["Adhesive"],
          wastage:
            formData.wastage || formData["Wastage"]
              ? parseInt(formData.wastage || formData["Wastage"]) || null
              : null,
          remarks: remarkFields.remarks,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (
      stepNameLower.includes("punching") ||
      stepNameLower.includes("die cutting")
    ) {
      // Use user input for quantity, fallback to null if not provided
      const quantity =
        formData.quantity || formData["OK Quantity"]
          ? parseInt(formData.quantity || formData["OK Quantity"]) || null
          : null;
      await prisma.punching.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          machine: machineCode, // Use JobStep machine instead of form data
          die: formData.die || formData["Die Used"],
          wastage:
            formData.wastage || formData["Wastage"]
              ? parseInt(formData.wastage || formData["Wastage"]) || null
              : null,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          machine: machineCode, // Use JobStep machine instead of form data
          die: formData.die || formData["Die Used"],
          wastage:
            formData.wastage || formData["Wastage"]
              ? parseInt(formData.wastage || formData["Wastage"]) || null
              : null,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes("flap")) {
      // Use user input for quantity, fallback to null if not provided
      // Frontend sends 'Quantity' (capitalized) but backend expects 'quantity' (lowercase)
      const quantity = formData.Quantity
        ? parseInt(formData.Quantity) || null
        : formData.quantity
        ? parseInt(formData.quantity) || null
        : null;
      await prisma.sideFlapPasting.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift || null,
          machineNo: machineCode, // Use JobStep machine instead of form data
          adhesive: formData.adhesive || null,
          wastage: formData.Wastage
            ? parseInt(formData.Wastage) || null
            : formData.wastage
            ? parseInt(formData.wastage) || null
            : null,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          operatorName: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift || null,
          machineNo: machineCode, // Use JobStep machine instead of form data
          adhesive: formData.adhesive || null,
          wastage: formData.Wastage
            ? parseInt(formData.Wastage) || null
            : formData.wastage
            ? parseInt(formData.wastage) || null
            : null,
          completeRemark: remarkFields.completeRemark,
          holdRemark: remarkFields.holdRemark,
          majorHoldRemark: remarkFields.majorHoldRemark,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes("quality")) {
      // Use user input for quantity, fallback to null if not provided
      // Frontend sends 'passQuantity' from 'Pass Quantity' field
      const quantity =
        formData.passQuantity || formData["Pass Quantity"]
          ? parseInt(formData.passQuantity || formData["Pass Quantity"]) || null
          : null;

      // Parse individual rejection reason quantities
      const parseRejectionQty = (value: any): number => {
        if (!value) return 0;
        const parsed = parseInt(value.toString());
        return isNaN(parsed) ? 0 : parsed;
      };

      const rejectionReasonAQty = parseRejectionQty(
        formData.rejectionReasonAQty || formData["Rejection Reason A Qty"]
      );
      const rejectionReasonBQty = parseRejectionQty(
        formData.rejectionReasonBQty || formData["Rejection Reason B Qty"]
      );
      const rejectionReasonCQty = parseRejectionQty(
        formData.rejectionReasonCQty || formData["Rejection Reason C Qty"]
      );
      const rejectionReasonDQty = parseRejectionQty(
        formData.rejectionReasonDQty || formData["Rejection Reason D Qty"]
      );
      const rejectionReasonEQty = parseRejectionQty(
        formData.rejectionReasonEQty || formData["Rejection Reason E Qty"]
      );
      const rejectionReasonFQty = parseRejectionQty(
        formData.rejectionReasonFQty || formData["Rejection Reason F Qty"]
      );
      const rejectionReasonOthersQty = parseRejectionQty(
        formData.rejectionReasonOthersQty ||
          formData["Rejection Reason Others Qty"]
      );

      // Calculate total rejectedQty as sum of all reason quantities
      const calculatedRejectedQty =
        rejectionReasonAQty +
        rejectionReasonBQty +
        rejectionReasonCQty +
        rejectionReasonDQty +
        rejectionReasonEQty +
        rejectionReasonFQty +
        rejectionReasonOthersQty;

      // Use calculated total, but fallback to manual entry if provided (for backward compatibility)
      const rejectedQty =
        calculatedRejectedQty > 0
          ? calculatedRejectedQty
          : formData.rejectedQty || formData["Reject Quantity"]
          ? parseInt(formData.rejectedQty || formData["Reject Quantity"]) ||
            null
          : null;
      await prisma.qualityDept.upsert({
        where: { jobStepId },
        update: {
          status: stepStatus,
          quantity: quantity,
          checkedBy: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift || null,
          operatorName: operatorName, // Use JobStep user instead of form data
          rejectedQty: rejectedQty,
          reasonForRejection:
            formData.reasonForRejection ||
            formData["Reason for Rejection"] ||
            null,
          remarks: remarkFields.remarks,
          rejectionReasonAQty:
            rejectionReasonAQty > 0 ? rejectionReasonAQty : null,
          rejectionReasonBQty:
            rejectionReasonBQty > 0 ? rejectionReasonBQty : null,
          rejectionReasonCQty:
            rejectionReasonCQty > 0 ? rejectionReasonCQty : null,
          rejectionReasonDQty:
            rejectionReasonDQty > 0 ? rejectionReasonDQty : null,
          rejectionReasonEQty:
            rejectionReasonEQty > 0 ? rejectionReasonEQty : null,
          rejectionReasonFQty:
            rejectionReasonFQty > 0 ? rejectionReasonFQty : null,
          rejectionReasonOthersQty:
            rejectionReasonOthersQty > 0 ? rejectionReasonOthersQty : null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: stepStatus,
          quantity,
          checkedBy: operatorName, // Use JobStep user instead of form data
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift || null,
          operatorName: operatorName, // Use JobStep user instead of form data
          rejectedQty: rejectedQty,
          reasonForRejection:
            formData.reasonForRejection ||
            formData["Reason for Rejection"] ||
            null,
          remarks: remarkFields.remarks,
          rejectionReasonAQty:
            rejectionReasonAQty > 0 ? rejectionReasonAQty : null,
          rejectionReasonBQty:
            rejectionReasonBQty > 0 ? rejectionReasonBQty : null,
          rejectionReasonCQty:
            rejectionReasonCQty > 0 ? rejectionReasonCQty : null,
          rejectionReasonDQty:
            rejectionReasonDQty > 0 ? rejectionReasonDQty : null,
          rejectionReasonEQty:
            rejectionReasonEQty > 0 ? rejectionReasonEQty : null,
          rejectionReasonFQty:
            rejectionReasonFQty > 0 ? rejectionReasonFQty : null,
          rejectionReasonOthersQty:
            rejectionReasonOthersQty > 0 ? rejectionReasonOthersQty : null,
          // QC fields are only updated by Flying Squad, not by regular operators
        },
      });
    } else if (stepNameLower.includes("dispatch")) {
      // Use user input for quantity, fallback to null if not provided
      const quantity =
        formData.noOfBoxes || formData["No of Boxes"]
          ? parseInt(formData.noOfBoxes || formData["No of Boxes"]) || null
          : null;

      // 🔥 DISPATCH CUMULATIVE TRACKING: Get existing dispatch record to calculate cumulative quantity
      const existingDispatch = await prisma.dispatchProcess.findUnique({
        where: { jobStepId },
      });

      let finalStatus = stepStatus;
      let totalDispatchedQty = 0;
      let dispatchHistory: any[] = [];

      // If quantity is provided and this is not just a status update, handle cumulative tracking
      if (quantity && quantity > 0 && formData.status === "stop") {
        // Calculate cumulative dispatched quantity
        const currentTotal = existingDispatch?.totalDispatchedQty || 0;

        // Get finished goods quantity from job planning
        const finishedGoodsQty = jobStep?.jobPlanning?.finishedGoodsQty || 0;

        // Get job total quantity (PO quantity) to check if fully dispatched
        // First try to get the specific PO linked to this job planning
        let jobQuantity = 0;
        let purchaseOrderId: number | null = null;

        if (jobStep?.jobPlanning?.purchaseOrderId) {
          try {
            purchaseOrderId = jobStep.jobPlanning.purchaseOrderId;
            // Get the specific PO
            const job = await prisma.job.findUnique({
              where: { nrcJobNo },
              include: { purchaseOrders: true },
            });

            const matchingPO = job?.purchaseOrders?.find(
              (po: any) => po.id === purchaseOrderId
            );
            if (matchingPO) {
              jobQuantity = matchingPO.totalPOQuantity || 0;
              console.log(
                `✅ [storeStepFormData] Using specific PO quantity: ${jobQuantity} for PO ID: ${purchaseOrderId}`
              );
            }
          } catch (error) {
            console.error(
              "⚠️ [storeStepFormData] Error fetching job planning PO, falling back to sum:",
              error
            );
          }
        }

        // Fallback to sum of all POs if specific PO not found
        if (jobQuantity === 0) {
          const job = await prisma.job.findUnique({
            where: { nrcJobNo },
            include: { purchaseOrders: true },
          });
          jobQuantity =
            job?.purchaseOrders?.reduce(
              (sum: number, po: any) => sum + (po.totalPOQuantity || 0),
              0
            ) || 0;
          console.log(
            `⚠️ [storeStepFormData] Using sum of all POs: ${jobQuantity}`
          );
        }

        // Get QC quantity (from previous step) - sum all QC records for this job planning
        // This matches the frontend which sums quantities across all records
        let qcQuantity = 0;
        try {
          const jobPlanId = jobStep?.jobPlanning?.jobPlanId;
          if (jobPlanId) {
            // Get all QC steps for this job planning
            const qcSteps =
              jobStep?.jobPlanning?.steps?.filter(
                (s: any) => s.stepName === "QualityDept"
              ) || [];

            // Sum quantities from all QC records
            for (const qcStep of qcSteps) {
              const qcRecord = await prisma.qualityDept.findUnique({
                where: { jobStepId: qcStep.id },
                select: { quantity: true },
              });
              if (qcRecord?.quantity) {
                qcQuantity += qcRecord.quantity;
              }
            }

            console.log(
              `✅ [storeStepFormData] QC Quantity (summed): ${qcQuantity} from ${qcSteps.length} QC record(s)`
            );
          }
        } catch (error) {
          console.error(
            "⚠️ [storeStepFormData] Error fetching QC quantity:",
            error
          );
        }

        // Calculate how much can be dispatched (remaining PO quantity + finished goods)
        const remainingPOQuantity = Math.max(0, jobQuantity - currentTotal);
        const maxDispatchable = remainingPOQuantity + finishedGoodsQty;

        // Actual quantity to dispatch (capped at max dispatchable, but also check against QC quantity)
        const maxFromQC = qcQuantity + finishedGoodsQty;
        const actualDispatchQty = Math.min(
          quantity,
          Math.min(maxDispatchable, maxFromQC)
        );

        // Calculate excess quantity (if user tried to dispatch more than allowed)
        const excessQuantity = Math.max(0, quantity - actualDispatchQty);

        // Calculate new total (only up to PO quantity)
        const newTotal = currentTotal + actualDispatchQty;
        totalDispatchedQty = newTotal;

        // 🔥 NEW LOGIC: Calculate finished goods consumption based on CUMULATIVE totalDispatchedQty
        // Check if totalDispatchedQty (cumulative) > qcQuantity
        const totalFinishedGoodsNeeded = Math.max(
          0,
          totalDispatchedQty - qcQuantity
        );

        // Calculate already consumed finished goods from previous dispatches
        // We need to track this by looking at dispatch history or calculating from previous totalDispatchedQty
        let alreadyConsumedFinishedGoods = 0;

        // If there was a previous dispatch, calculate how much was already consumed
        if (
          existingDispatch?.totalDispatchedQty &&
          existingDispatch.totalDispatchedQty > 0
        ) {
          // Previous total finished goods needed
          const previousTotalFinishedGoodsNeeded = Math.max(
            0,
            existingDispatch.totalDispatchedQty - qcQuantity
          );
          alreadyConsumedFinishedGoods = previousTotalFinishedGoodsNeeded;
        }

        // Calculate additional finished goods needed for this dispatch
        const additionalFinishedGoodsNeeded = Math.max(
          0,
          totalFinishedGoodsNeeded - alreadyConsumedFinishedGoods
        );

        // This is what we need to consume in this dispatch
        const finishedGoodsUsed = additionalFinishedGoodsNeeded;

        console.log(
          `📊 [storeStepFormData] Finished Goods Calculation (Cumulative):`,
          {
            totalDispatchedQty,
            qcQuantity,
            totalFinishedGoodsNeeded,
            previousTotalDispatchedQty:
              existingDispatch?.totalDispatchedQty || 0,
            alreadyConsumedFinishedGoods,
            additionalFinishedGoodsNeeded,
            finishedGoodsUsed,
          }
        );

        // Update dispatch history with actual dispatched quantity
        dispatchHistory = existingDispatch?.dispatchHistory
          ? Array.isArray(existingDispatch.dispatchHistory)
            ? existingDispatch.dispatchHistory
            : JSON.parse(existingDispatch.dispatchHistory as string)
          : [];

        dispatchHistory.push({
          dispatchDate: new Date().toISOString(),
          dispatchedQty: actualDispatchQty,
          dispatchNo:
            formData.dispatchNo ||
            formData["Dispatch No"] ||
            `DISP-${Date.now()}`,
          remarks: formData.remarks || formData["Remarks"] || "",
          operatorName: operatorName,
        });

        // Get finished goods quantity from form data (for storing leftover finished goods)
        // This is the quantity the user enters to STORE (not use)
        const finishedGoodsQtyToStore =
          formData.finishedGoodsQty || formData["Finished Goods Qty"]
            ? parseInt(
                formData.finishedGoodsQty || formData["Finished Goods Qty"]
              ) || 0
            : 0;

        // Get purchaseOrderId if not already set
        if (!purchaseOrderId) {
          const job = await prisma.job.findUnique({
            where: { nrcJobNo },
            include: { purchaseOrders: true },
          });
          const firstPO = job?.purchaseOrders?.[0];
          purchaseOrderId = firstPO?.id || null;
        }

        // Consume finished goods if dispatch exceeds QC quantity
        // Example: PO=1000, QC=600, Dispatch=1000 → 600 from QC, 400 from finished goods
        if (finishedGoodsUsed > 0) {
          try {
            // Get jobPlanId for linking consumed finished goods
            const jobPlanId = jobStep?.jobPlanning?.jobPlanId;

            // Get all available finished goods for this job
            const availableFinishQuantities =
              await prisma.finishQuantity.findMany({
                where: {
                  jobNrcJobNo: nrcJobNo,
                  status: "available",
                },
                orderBy: { createdAt: "asc" }, // Consume oldest first
              });

            const totalAvailable = availableFinishQuantities.reduce(
              (sum, fq) => sum + fq.overDispatchedQuantity,
              0
            );

            if (totalAvailable < finishedGoodsUsed) {
              console.warn(
                `⚠️ [storeStepFormData] Insufficient finished goods. Available: ${totalAvailable}, Needed: ${finishedGoodsUsed}`
              );
              // Still proceed, but log warning
            }

            let remainingToConsume = finishedGoodsUsed;

            // Consume from available records
            for (const fq of availableFinishQuantities) {
              if (remainingToConsume <= 0) break;

              const availableQty = fq.overDispatchedQuantity;
              const consumeFromThis = Math.min(
                remainingToConsume,
                availableQty
              );
              const remainingQty = availableQty - consumeFromThis;

              if (remainingQty > 0) {
                // Partial consumption - update the record
                await prisma.finishQuantity.update({
                  where: { id: fq.id },
                  data: {
                    overDispatchedQuantity: remainingQty,
                    consumedByPOId: purchaseOrderId,
                    remarks: fq.remarks
                      ? `${
                          fq.remarks
                        }\nConsumed ${consumeFromThis} units for jobPlanId ${jobPlanId} on ${new Date().toISOString()}`
                      : `Consumed ${consumeFromThis} units for jobPlanId ${jobPlanId} on ${new Date().toISOString()}`,
                  },
                });
                console.log(
                  `✅ [storeStepFormData] Partially consumed ${consumeFromThis} finished goods (Remaining: ${remainingQty}) from FinishQuantity ID ${fq.id}`
                );
              } else {
                // Full consumption - mark as consumed
                await prisma.finishQuantity.update({
                  where: { id: fq.id },
                  data: {
                    status: "consumed",
                    consumedByPOId: purchaseOrderId,
                    remarks: fq.remarks
                      ? `${
                          fq.remarks
                        }\nFully consumed for jobPlanId ${jobPlanId} on ${new Date().toISOString()}`
                      : `Fully consumed for jobPlanId ${jobPlanId} on ${new Date().toISOString()}`,
                  },
                });
                console.log(
                  `✅ [storeStepFormData] Fully consumed ${consumeFromThis} finished goods from FinishQuantity ID ${fq.id}`
                );
              }

              remainingToConsume -= consumeFromThis;
            }

            if (finishedGoodsUsed > 0) {
              console.log(
                `✅ [storeStepFormData] Consumed ${finishedGoodsUsed} finished goods for dispatch (QC: ${qcQuantity}, Dispatch: ${actualDispatchQty})`
              );
            }
          } catch (error) {
            console.error(
              `❌ [storeStepFormData] Error consuming finished goods:`,
              error
            );
            // Don't throw - allow dispatch to proceed even if finished goods consumption fails
          }
        }

        // Store finished goods quantity in FinishQuantity table (if user entered any)
        // This is for leftover finished goods from production (e.g., PO 500, produced 1000, store 500)
        if (finishedGoodsQtyToStore > 0 && jobQuantity > 0) {
          // Check if there's an existing available FinishQuantity record for this job
          const existingFinishQty = await prisma.finishQuantity.findFirst({
            where: {
              jobNrcJobNo: nrcJobNo,
              status: "available",
            },
            orderBy: { createdAt: "desc" },
          });

          if (existingFinishQty) {
            // Update existing record by adding the new finished goods quantity
            await prisma.finishQuantity.update({
              where: { id: existingFinishQty.id },
              data: {
                overDispatchedQuantity:
                  existingFinishQty.overDispatchedQuantity +
                  finishedGoodsQtyToStore,
                totalDispatchedQuantity: newTotal,
                remarks: `${
                  existingFinishQty.remarks || ""
                }\nAdded ${finishedGoodsQtyToStore} finished goods from dispatch on ${new Date().toISOString()}.`,
              },
            });
            console.log(
              `✅ [storeStepFormData] Updated FinishQuantity: Added ${finishedGoodsQtyToStore} units (Total: ${
                existingFinishQty.overDispatchedQuantity +
                finishedGoodsQtyToStore
              }) for job ${nrcJobNo}`
            );
          } else {
            // Create new FinishQuantity record
            await prisma.finishQuantity.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                purchaseOrderId: purchaseOrderId,
                overDispatchedQuantity: finishedGoodsQtyToStore,
                totalPOQuantity: jobQuantity,
                totalDispatchedQuantity: newTotal,
                status: "available",
                remarks: `Finished goods quantity stored from dispatch. User entered ${finishedGoodsQtyToStore} as leftover finished goods quantity. Total dispatched: ${newTotal}, PO quantity: ${jobQuantity}.`,
              },
            });
            console.log(
              `✅ [storeStepFormData] Created FinishQuantity: ${finishedGoodsQtyToStore} units for job ${nrcJobNo}`
            );
          }
        }

        // If excess quantity exists (from dispatch exceeding limits), also add to FinishQuantity
        if (excessQuantity > 0 && jobQuantity > 0) {
          // Check if there's an existing available FinishQuantity record for this job
          const existingFinishQty = await prisma.finishQuantity.findFirst({
            where: {
              jobNrcJobNo: nrcJobNo,
              status: "available",
            },
            orderBy: { createdAt: "desc" },
          });

          if (existingFinishQty) {
            // Update existing record by adding the excess quantity
            await prisma.finishQuantity.update({
              where: { id: existingFinishQty.id },
              data: {
                overDispatchedQuantity:
                  existingFinishQty.overDispatchedQuantity + excessQuantity,
                totalDispatchedQuantity: newTotal,
                remarks: `${
                  existingFinishQty.remarks || ""
                }\nExcess dispatch quantity ${excessQuantity} added on ${new Date().toISOString()}.`,
              },
            });
            console.log(
              `✅ [storeStepFormData] Updated FinishQuantity: Added excess ${excessQuantity} units (Total: ${
                existingFinishQty.overDispatchedQuantity + excessQuantity
              }) for job ${nrcJobNo}`
            );
          } else {
            // Create new FinishQuantity record for excess quantity
            await prisma.finishQuantity.create({
              data: {
                jobNrcJobNo: nrcJobNo,
                purchaseOrderId: purchaseOrderId,
                overDispatchedQuantity: excessQuantity,
                totalPOQuantity: jobQuantity,
                totalDispatchedQuantity: newTotal,
                status: "available",
                remarks: `Excess quantity from dispatch. User tried to dispatch ${quantity}, but PO quantity is ${jobQuantity}. ${actualDispatchQty} dispatched, ${excessQuantity} added to finish quantity.`,
              },
            });
            console.log(
              `✅ [storeStepFormData] Created FinishQuantity: ${excessQuantity} units for job ${nrcJobNo}`
            );
          }
        }

        // If fully dispatched (or exceeded), set status to 'accept'
        if (newTotal >= jobQuantity) {
          finalStatus = "accept";
          console.log(
            `✅ [storeStepFormData] Dispatch fully completed: ${newTotal} >= ${jobQuantity}`
          );
          if (excessQuantity > 0) {
            console.log(
              `📦 [storeStepFormData] Excess ${excessQuantity} units moved to FinishQuantity`
            );
          }
        } else {
          // Partial dispatch - keep in_progress
          finalStatus = "in_progress";
          console.log(
            `📦 [storeStepFormData] Partial dispatch: ${newTotal} / ${jobQuantity}`
          );
        }
      } else {
        // No quantity change, preserve existing values
        totalDispatchedQty = existingDispatch?.totalDispatchedQty || 0;
        dispatchHistory = existingDispatch?.dispatchHistory
          ? Array.isArray(existingDispatch.dispatchHistory)
            ? existingDispatch.dispatchHistory
            : JSON.parse(existingDispatch.dispatchHistory as string)
          : [];
        // Preserve existing status if record exists
        if (existingDispatch?.status) {
          finalStatus = existingDispatch.status as "in_progress" | "accept";
        }
      }

      // Get finished goods quantity from form data or use from job planning
      const finishedGoodsQtyFromJobPlanning =
        jobStep?.jobPlanning?.finishedGoodsQty || 0;
      const finishedGoodsQtyFromForm =
        formData.finishedGoodsQty || formData["Finished Goods Qty"]
          ? parseInt(
              formData.finishedGoodsQty || formData["Finished Goods Qty"]
            ) || 0
          : finishedGoodsQtyFromJobPlanning;

      const remarkFields = await getRemarkFields(stepNameLower, jobStepId);
      await prisma.dispatchProcess.upsert({
        where: { jobStepId },
        update: {
          status: finalStatus,
          quantity: quantity,
          dispatchNo:
            formData.dispatchNo ||
            formData["Dispatch No"] ||
            `DISP-${Date.now()}`,
          date: formData.date ? new Date(formData.date) : undefined,
          shift: formData.shift,
          operatorName: operatorName,
          dispatchDate:
            formData.dispatchDate || formData["Dispatch Date"]
              ? new Date(formData.dispatchDate || formData["Dispatch Date"])
              : undefined,
          balanceQty:
            formData.balanceQty || formData["Balance Qty"]
              ? parseInt(formData.balanceQty || formData["Balance Qty"]) || null
              : null,
          finishedGoodsQty: finishedGoodsQtyFromForm,
          remarks: remarkFields.remarks,
          totalDispatchedQty: totalDispatchedQty,
          dispatchHistory: dispatchHistory,
        },
        create: {
          jobNrcJobNo: nrcJobNo,
          jobStepId,
          status: finalStatus,
          quantity,
          dispatchNo:
            formData.dispatchNo ||
            formData["Dispatch No"] ||
            `DISP-${Date.now()}`,
          date: formData.date ? new Date(formData.date) : new Date(),
          shift: formData.shift,
          operatorName: operatorName,
          dispatchDate:
            formData.dispatchDate || formData["Dispatch Date"]
              ? new Date(formData.dispatchDate || formData["Dispatch Date"])
              : new Date(),
          balanceQty:
            formData.balanceQty || formData["Balance Qty"]
              ? parseInt(formData.balanceQty || formData["Balance Qty"]) || null
              : null,
          finishedGoodsQty: finishedGoodsQtyFromForm,
          remarks: remarkFields.remarks,
          totalDispatchedQty: totalDispatchedQty,
          dispatchHistory: dispatchHistory,
        },
      });
    }

    // ✅ Log activity for non-machine step completion (PaperStore, Quality, Dispatch)
    // Only log when step is actually completed (status='accept' and JobStep status='stop')
    if (
      stepStatus === "accept" &&
      formData.status === "stop" &&
      isNonMachineStep &&
      operatorName &&
      operatorName !== "System"
    ) {
      try {
        // Get step number from JobStep
        const stepNo = jobStep.stepNo || 0;

        // Get quantity for activity log details
        let quantity = 0;
        if (stepNameLower.includes("paperstore")) {
          quantity = formData.available ? parseInt(formData.available) || 0 : 0;
        } else if (stepNameLower.includes("quality")) {
          quantity =
            formData.passQuantity || formData["Pass Quantity"]
              ? parseInt(formData.passQuantity || formData["Pass Quantity"]) ||
                0
              : 0;
        } else if (stepNameLower.includes("dispatch")) {
          quantity =
            formData.noOfBoxes || formData["No of Boxes"]
              ? parseInt(formData.noOfBoxes || formData["No of Boxes"]) || 0
              : 0;
        }

        await logUserActionWithResource(
          operatorName,
          ActionTypes.PRODUCTION_STEP_COMPLETED,
          JSON.stringify({
            message: `Step ${stepNo} (${stepName}) completed`,
            nrcJobNo: nrcJobNo,
            jobPlanId: jobStep.jobPlanning?.jobPlanId,
            stepNo: stepNo,
            stepName: stepName,
            quantity: quantity,
            completedBy: operatorName,
            endDate: jobStep.endDate || new Date(),
          }),
          "JobStep",
          jobStepId.toString(),
          nrcJobNo
        );
        console.log(
          `✅ [storeStepFormData] Logged activity for step ${stepNo} (${stepName}) completion for user ${operatorName}`
        );
      } catch (error) {
        console.error(
          `❌ [storeStepFormData] Failed to log activity for step completion:`,
          error
        );
        // Don't throw - activity logging is not critical
      }
    }

    console.log(
      `✅ [storeStepFormData] Successfully stored form data for ${stepName}`
    );
  } catch (error) {
    console.error(
      `❌ [storeStepFormData] Error storing form data for ${stepName}:`,
      error
    );
    throw error;
  }
}

/**
 * Consume finished goods quantity for a job
 * Reduces available finished goods by the requested amount
 */
async function consumeFinishedGoods(
  nrcJobNo: string,
  requestedQty: number,
  purchaseOrderId: number | null
) {
  try {
    // Get all available finished goods for this job
    const availableFinishQuantities = await prisma.finishQuantity.findMany({
      where: {
        jobNrcJobNo: nrcJobNo,
        status: "available",
      },
      orderBy: { createdAt: "asc" }, // Consume oldest first
    });

    const totalAvailable = availableFinishQuantities.reduce(
      (sum, fq) => sum + fq.overDispatchedQuantity,
      0
    );

    if (totalAvailable < requestedQty) {
      throw new AppError(
        `Insufficient finished goods. Available: ${totalAvailable}, Requested: ${requestedQty}`,
        400
      );
    }

    let remainingToConsume = requestedQty;

    // Consume from available records
    for (const fq of availableFinishQuantities) {
      if (remainingToConsume <= 0) break;

      const availableQty = fq.overDispatchedQuantity;
      const consumeFromThis = Math.min(remainingToConsume, availableQty);
      const remainingQty = availableQty - consumeFromThis;

      if (remainingQty > 0) {
        // Partial consumption - update the record
        await prisma.finishQuantity.update({
          where: { id: fq.id },
          data: {
            overDispatchedQuantity: remainingQty,
            consumedByPOId: purchaseOrderId,
            remarks: fq.remarks
              ? `${
                  fq.remarks
                }; Consumed ${consumeFromThis} units (${new Date().toISOString()})`
              : `Consumed ${consumeFromThis} units (${new Date().toISOString()})`,
          },
        });
      } else {
        // Full consumption - mark as consumed
        await prisma.finishQuantity.update({
          where: { id: fq.id },
          data: {
            status: "consumed",
            consumedByPOId: purchaseOrderId,
            remarks: fq.remarks
              ? `${fq.remarks}; Fully consumed (${new Date().toISOString()})`
              : `Fully consumed (${new Date().toISOString()})`,
          },
        });
      }

      remainingToConsume -= consumeFromThis;
    }

    console.log(
      `✅ [consumeFinishedGoods] Consumed ${requestedQty} finished goods for job ${nrcJobNo}`
    );
  } catch (error) {
    console.error(
      `❌ [consumeFinishedGoods] Error consuming finished goods:`,
      error
    );
    throw error;
  }
}
<<<<<<< HEAD

// 🎯 NEW: Production Head continuation endpoint
// Allows Production Head to continue a step (e.g., Corrugation after Printing)
export const continueStepByProductionHead = async (req: Request, res: Response) => {
  const { nrcJobNo, stepNo, jobPlanId } = req.body;
  const userId = req.user?.userId;
  const userRole = req.user?.role;
  
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }
  
  // Check if user is Production Head or Admin
  if (userRole !== 'production_head' && userRole !== 'admin') {
    throw new AppError('Only Production Head or Admin can continue steps', 403);
  }
  
  if (!nrcJobNo || !stepNo) {
    throw new AppError('nrcJobNo and stepNo are required', 400);
  }
  
  // URL decode the nrcJobNo parameter
  const decodedNrcJobNo = decodeURIComponent(nrcJobNo);
  
  // Find the Printing step (stepNo = 2) to get its PrintingDetails
  const printingStep = await prisma.jobStep.findFirst({
    where: {
      jobPlanning: {
        nrcJobNo: decodedNrcJobNo,
        ...(jobPlanId ? { jobPlanId: Number(jobPlanId) } : {})
      },
      stepNo: 2, // Printing step
      stepName: 'PrintingDetails'
    },
    include: {
      jobPlanning: {
        select: {
          jobPlanId: true,
          nrcJobNo: true
        }
      },
      printingDetails: true
    }
  });
  
  if (!printingStep) {
    throw new AppError('Printing step not found', 404);
  }
  
  if (!printingStep.printingDetails) {
    throw new AppError('PrintingDetails record not found for this job', 404);
  }
  
  // Update PrintingDetails to mark it as continued by Production Head
  const updatedPrintingDetails = await prisma.printingDetails.update({
    where: { id: printingStep.printingDetails.id },
    data: {
      productionHeadContinued: true
    } as any,
    select: {
      id: true,
      jobNrcJobNo: true,
      productionHeadContinued: true,
      status: true
    }
  });
  
  // Log the action
  if (userId) {
    try {
      await logUserActionWithResource(
        userId,
        ActionTypes.JOBSTEP_UPDATED,
        JSON.stringify({
          message: `Production Head continued step ${stepNo} (Corrugation) after Printing`,
          nrcJobNo: decodedNrcJobNo,
          jobPlanId: printingStep.jobPlanning.jobPlanId,
          stepNo: stepNo,
          stepName: 'Corrugation',
          continuedBy: userId
        }),
        'PrintingDetails',
        printingStep.printingDetails.id.toString()
      );
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't throw - activity logging is not critical
    }
  }
  
  console.log(`✅ Production Head (${userId}) continued step ${stepNo} (Corrugation) for job ${decodedNrcJobNo}`);
  
  res.status(200).json({
    success: true,
    message: `Step ${stepNo} (Corrugation) continued successfully`,
    data: {
      printingDetailsId: updatedPrintingDetails.id,
      jobNrcJobNo: updatedPrintingDetails.jobNrcJobNo,
      productionHeadContinued: updatedPrintingDetails.productionHeadContinued,
      status: updatedPrintingDetails.status
    }
  });
};
