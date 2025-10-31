import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Job Planning Selection Priority:
 * 1. High-demand job plannings (jobDemand = 'high')
 * 2. Most recent job plannings (by createdAt)
 * 3. Highest jobPlanId (as fallback)
 */
export async function selectBestJobPlanning(nrcJobNo: string) {
  console.log(`🔍 [JobPlanningSelector] Selecting best planning for job: ${nrcJobNo}`);
  
  // Get all job plannings for this job
  const jobPlannings = await prisma.jobPlanning.findMany({
    where: { nrcJobNo: nrcJobNo },
    select: { 
      jobPlanId: true, 
      nrcJobNo: true, 
      jobDemand: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' } // Most recent first
  });
  
  if (jobPlannings.length === 0) {
    throw new Error(`No job plannings found for job: ${nrcJobNo}`);
  }
  
  console.log(`🔍 [JobPlanningSelector] Found ${jobPlannings.length} plannings:`, 
    jobPlannings.map(p => ({ id: p.jobPlanId, demand: p.jobDemand, createdAt: p.createdAt })));
  
  // Priority 1: High-demand job plannings
  const highDemandPlannings = jobPlannings.filter(p => p.jobDemand === 'high');
  if (highDemandPlannings.length > 0) {
    // If multiple high-demand plannings, pick the most recent one
    const selected = highDemandPlannings[0]; // Already sorted by createdAt desc
    console.log(`🔍 [JobPlanningSelector] Selected high-demand planning ID ${selected.jobPlanId}`);
    return selected;
  }
  
  // Priority 2: Most recent job planning
  const selected = jobPlannings[0]; // Already sorted by createdAt desc
  console.log(`🔍 [JobPlanningSelector] Selected most recent planning ID ${selected.jobPlanId} (${selected.jobDemand})`);
  return selected;
}

/**
 * Get steps for a job using the best job planning selection
 */
export async function getStepsForJob(nrcJobNo: string) {
  const selectedPlanning = await selectBestJobPlanning(nrcJobNo);
  
  // Get steps only from the selected planning to avoid duplicates
  const steps = await prisma.jobStep.findMany({
    where: {
      jobPlanningId: selectedPlanning.jobPlanId
    },
    include: {
      jobPlanning: {
        select: { jobPlanId: true, nrcJobNo: true }
      },
      jobStepMachines: {
        select: {
          id: true,
          machineId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          userId: true,
          quantity: true,
          remarks: true,
          formData: true,
          machine: {
            select: {
              id: true,
              machineCode: true,
              machineType: true,
              unit: true,
              status: true,
            }
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: { stepNo: 'asc' }
  });
  
  // Enrich machineDetails with JobStepMachine status information and filter by user access
  const enrichedSteps = steps.map(step => {
    // If machineDetails is an array, enrich it with JobStepMachine data
    if (Array.isArray(step.machineDetails) && step.machineDetails.length > 0) {
      step.machineDetails = step.machineDetails
        .map((md: any) => {
          // Find matching JobStepMachine entry
          const jobStepMachine = step.jobStepMachines?.find(
            (jsm: any) => jsm.machineId === (md.machineId || md.id)
          );
          
          // Return enriched machine detail
          return {
            ...md,
            // Override with live status from JobStepMachine
            status: jobStepMachine?.status || md.status || 'available',
            startedAt: jobStepMachine?.startedAt || md.startedAt,
            completedAt: jobStepMachine?.completedAt || md.completedAt,
            userId: jobStepMachine?.userId || md.userId,
            quantity: jobStepMachine?.quantity || md.quantity,
            remarks: jobStepMachine?.remarks || md.remarks,
            formData: jobStepMachine?.formData || md.formData,
            machine: jobStepMachine?.machine || md.machine,
            user: jobStepMachine?.user || md.user,
            // Add count of machines in each status
            _jobStepMachineId: jobStepMachine?.id,
          };
        });
    }
    
    return step;
  });
  
  console.log(`🔍 [JobPlanningSelector] Returning ${enrichedSteps.length} steps from planning ${selectedPlanning.jobPlanId}`);
  
  return {
    steps: enrichedSteps,
    selectedPlanning
  };
}

/**
 * Get job planning data using the best selection
 */
export async function getJobPlanningData(nrcJobNo: string) {
  const selectedPlanning = await selectBestJobPlanning(nrcJobNo);
  
  // Get full job planning data with JobStepMachine details
  const jobPlanning = await prisma.jobPlanning.findUnique({
    where: { jobPlanId: selectedPlanning.jobPlanId },
    include: {
      steps: {
        orderBy: { stepNo: 'asc' },
        include: {
          jobStepMachines: {
            select: {
              id: true,
              machineId: true,
              status: true,
              startedAt: true,
              completedAt: true,
              userId: true,
              quantity: true,
              remarks: true,
              formData: true,
              machine: {
                select: {
                  id: true,
                  machineCode: true,
                  machineType: true,
                  unit: true,
                  status: true,
                }
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });
  
  // Enrich machineDetails with JobStepMachine status information
  if (jobPlanning) {
    jobPlanning.steps = jobPlanning.steps.map(step => {
      // If machineDetails is an array, enrich it with JobStepMachine data
      if (Array.isArray(step.machineDetails) && step.machineDetails.length > 0) {
        step.machineDetails = step.machineDetails.map((md: any) => {
          // Find matching JobStepMachine entry
          const jobStepMachine = step.jobStepMachines?.find(
            (jsm: any) => jsm.machineId === (md.machineId || md.id)
          );
          
          // Return enriched machine detail
          return {
            ...md,
            // Override with live status from JobStepMachine
            status: jobStepMachine?.status || md.status || 'available',
            startedAt: jobStepMachine?.startedAt || md.startedAt,
            completedAt: jobStepMachine?.completedAt || md.completedAt,
            userId: jobStepMachine?.userId || md.userId,
            quantity: jobStepMachine?.quantity || md.quantity,
            remarks: jobStepMachine?.remarks || md.remarks,
            formData: jobStepMachine?.formData || md.formData,
            machine: jobStepMachine?.machine || md.machine,
            user: jobStepMachine?.user || md.user,
            // Add count of machines in each status
            _jobStepMachineId: jobStepMachine?.id,
          };
        });
      }
      
      return step;
    });
  }
  
  return jobPlanning;
}
