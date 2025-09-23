import { prisma } from '../lib/prisma';
import { getFilteredJobNumbers } from '../middleware/machineAccess';

/**
 * Helper function to get role-based step data from job plannings
 * This replaces the need to query individual step tables which might be empty
 */
export const getRoleBasedStepData = async (
  userMachineIds: string[] | null,
  userRole: string,
  stepName: string
) => {
  // Get accessible job numbers
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds, userRole);
  
  // Get job plannings with steps for accessible jobs
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: { in: accessibleJobNumbers } },
    include: {
      steps: {
        where: { stepName: stepName },
        select: {
          id: true,
          stepNo: true,
          stepName: true,
          status: true,
          startDate: true,
          endDate: true,
          user: true,
          machineDetails: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { stepNo: 'asc' }
      }
    },
    orderBy: { jobPlanId: 'asc' }
  });

  // Flatten steps and add job information
  const steps = jobPlannings.flatMap(planning => 
    planning.steps.map(step => ({
      ...step,
      nrcJobNo: planning.nrcJobNo,
      jobPlanId: planning.jobPlanId
    }))
  );

  return steps;
};

/**
 * Helper function to get all role-based step data grouped by step type
 * This is used by the main jobs endpoint
 */
export const getAllRoleBasedStepData = async (
  userMachineIds: string[] | null,
  userRole: string
) => {
  // Get accessible job numbers
  const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds, userRole);
  
  // Get job plannings with all steps for accessible jobs
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: { in: accessibleJobNumbers } },
    include: {
      steps: {
        select: {
          id: true,
          stepNo: true,
          stepName: true,
          status: true,
          startDate: true,
          endDate: true,
          user: true,
          machineDetails: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { stepNo: 'asc' }
      }
    },
    orderBy: { jobPlanId: 'asc' }
  });

  // Group steps by job and step type
  const stepsByJob: Record<string, any> = {};
  
  jobPlannings.forEach(planning => {
    if (!stepsByJob[planning.nrcJobNo]) {
      stepsByJob[planning.nrcJobNo] = {
        printingDetails: [],
        fluteLaminateBoardConversions: [],
        corrugations: [],
        punchings: [],
        sideFlapPastings: [],
        qualityDepts: [],
        dispatchProcesses: [],
        paperStores: []
      };
    }

    planning.steps.forEach(step => {
      const stepWithJobInfo = {
        ...step,
        nrcJobNo: planning.nrcJobNo,
        jobPlanId: planning.jobPlanId
      };

      switch (step.stepName) {
        case 'PrintingDetails':
          stepsByJob[planning.nrcJobNo].printingDetails.push(stepWithJobInfo);
          break;
        case 'FluteLaminateBoardConversion':
          stepsByJob[planning.nrcJobNo].fluteLaminateBoardConversions.push(stepWithJobInfo);
          break;
        case 'Corrugation':
          stepsByJob[planning.nrcJobNo].corrugations.push(stepWithJobInfo);
          break;
        case 'Punching':
          stepsByJob[planning.nrcJobNo].punchings.push(stepWithJobInfo);
          break;
        case 'SideFlapPasting':
          stepsByJob[planning.nrcJobNo].sideFlapPastings.push(stepWithJobInfo);
          break;
        case 'QualityDept':
          stepsByJob[planning.nrcJobNo].qualityDepts.push(stepWithJobInfo);
          break;
        case 'DispatchProcess':
          stepsByJob[planning.nrcJobNo].dispatchProcesses.push(stepWithJobInfo);
          break;
        case 'PaperStore':
          stepsByJob[planning.nrcJobNo].paperStores.push(stepWithJobInfo);
          break;
      }
    });
  });

  return stepsByJob;
};
