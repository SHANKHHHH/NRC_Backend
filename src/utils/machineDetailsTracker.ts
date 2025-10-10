import { prisma } from '../lib/prisma';

/**
 * Utility to track machine details status in jobs
 * Automatically updates isMachineDetailsFilled flag based on machine assignments
 * present either in JobStep.machineDetails OR in step-detail tables with machine fields.
 */

/**
 * Update the isMachineDetailsFilled flag for a job
 * This checks if any step in the job has machine details filled
 */
export const updateJobMachineDetailsFlag = async (nrcJobNo: string): Promise<void> => {
  try {
    // Get the job planning and all its steps with relevant machine fields
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          select: {
            id: true,
            machineDetails: true,
            // Step-detail relations that may carry machine fields
            printingDetails: { select: { machine: true } },
            corrugation: { select: { machineNo: true } },
            punching: { select: { machine: true } },
            sideFlapPasting: { select: { machineNo: true } }
          }
        }
      }
    });

    if (!jobPlanning) {
      throw new Error(`Job planning not found for ${nrcJobNo}`);
    }

    // Check if any step indicates machine assignment
    const hasAnyMachineDetails = jobPlanning.steps.some(step => {
      const hasArrayDetails = Array.isArray(step.machineDetails) && step.machineDetails.length > 0;
      const hasPrintingMachine = !!step.printingDetails?.machine;
      const hasCorrugationMachine = !!step.corrugation?.machineNo;
      const hasPunchingMachine = !!step.punching?.machine;
      const hasSideFlapMachine = !!step.sideFlapPasting?.machineNo;
      return (
        hasArrayDetails ||
        hasPrintingMachine ||
        hasCorrugationMachine ||
        hasPunchingMachine ||
        hasSideFlapMachine
      );
    });

    // Update the job's machine details flag (if Job record exists)
    // For jobPlanning-only records (like urgent jobs without Job record), skip this update
    const jobExists = await prisma.job.findUnique({ where: { nrcJobNo } });
    if (jobExists) {
      await prisma.job.update({
        where: { nrcJobNo },
        data: { isMachineDetailsFilled: hasAnyMachineDetails }
      });
    } else {
      console.log(`Job record not found for ${nrcJobNo}, skipping isMachineDetailsFilled update`);
    }
  } catch (error) {
    console.error('Error updating job machine details flag:', error);
    throw error;
  }
};