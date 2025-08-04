import { prisma } from '../lib/prisma';

/**
 * Utility to track machine details status in jobs
 * Automatically updates isMachineDetailsFilled flag based on machineDetails in job steps
 */

/**
 * Update the isMachineDetailsFilled flag for a job
 * This checks if any step in the job has machine details filled
 */
export const updateJobMachineDetailsFlag = async (nrcJobNo: string): Promise<void> => {
  try {
    // Get the job planning and all its steps
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: { nrcJobNo },
      include: {
        steps: {
          select: {
            id: true,
            machineDetails: true
          }
        }
      }
    });

    if (!jobPlanning) {
      throw new Error(`Job planning not found for ${nrcJobNo}`);
    }

    // Check if any step has machine details filled
    const hasAnyMachineDetails = jobPlanning.steps.some(step => 
      step.machineDetails && 
      Array.isArray(step.machineDetails) && 
      step.machineDetails.length > 0
    );

    // Update the job's machine details flag
    await prisma.job.update({
      where: { nrcJobNo },
      data: { isMachineDetailsFilled: hasAnyMachineDetails }
    });
  } catch (error) {
    console.error('Error updating job machine details flag:', error);
    throw error;
  }
};

 