import { prisma } from '../lib/prisma';
import { checkJobReadyForCompletion, autoCompleteJobIfReady } from './workflowValidator';
import { logUserActionWithResource, ActionTypes } from '../lib/logger';

/**
 * Background scheduler to automatically check and complete jobs
 * This runs periodically to ensure jobs are completed automatically
 */

let schedulerInterval: NodeJS.Timeout | null = null;
let isCheckRunning = false;
let consecutiveDbFailures = 0;
let lastDbFailureLogAt = 0;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // cap at 5 minutes

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt: number): number {
  const base = Math.pow(2, Math.max(0, attempt)); // 1s, 2s, 4s, ...
  return Math.min(base * 1000, MAX_BACKOFF_MS);
}

/**
 * Start the auto-completion scheduler
 * @param intervalMs - Interval in milliseconds (default: 5 minutes)
 */
export const startAutoCompletionScheduler = (intervalMs: number = 5 * 60 * 1000) => {
  if (schedulerInterval) {
    console.log('Auto-completion scheduler is already running');
    return;
  }

  console.log(`Starting auto-completion scheduler with ${intervalMs / 1000} second intervals`);
  
  schedulerInterval = setInterval(async () => {
    await safeCheckAndCompleteReadyJobs();
  }, intervalMs);

  // Run once immediately with better error handling and backoff
  safeCheckAndCompleteReadyJobs();
};

/**
 * Stop the auto-completion scheduler
 */
export const stopAutoCompletionScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Auto-completion scheduler stopped');
  }
};

/**
 * Check and complete all jobs that are ready for completion
 */
export const checkAndCompleteReadyJobs = async () => {
  try {
    console.log('Running auto-completion check...');
    
    // Get all active job plannings
    const jobPlannings = await prisma.jobPlanning.findMany({
      include: {
        steps: {
          include: {
            dispatchProcess: true
          }
        }
      }
    });

    let completedCount = 0;
    let checkedCount = 0;

    for (const jobPlanning of jobPlannings) {
      try {
        checkedCount++;
        
        // Check if job is ready for completion
        const completionCheck = await checkJobReadyForCompletion(jobPlanning.nrcJobNo);
        
        if (completionCheck.isReady) {
          console.log(`Job ${jobPlanning.nrcJobNo} is ready for completion, auto-completing...`);
          
          // Auto-complete the job
          const result = await autoCompleteJobIfReady(jobPlanning.nrcJobNo, 'system');
          
          if (result.completed) {
            completedCount++;
            console.log(`Successfully auto-completed job ${jobPlanning.nrcJobNo}`);
            
            // Log the completion
            await logUserActionWithResource(
              'system',
              ActionTypes.JOB_COMPLETED,
              `Auto-completed job: ${jobPlanning.nrcJobNo} by background scheduler`,
              'CompletedJob',
              result.completedJob.id.toString(),
              jobPlanning.nrcJobNo
            );
          } else {
            console.log(`Failed to auto-complete job ${jobPlanning.nrcJobNo}: ${result.reason}`);
          }
        }
      } catch (error) {
        console.error(`Error processing job ${jobPlanning.nrcJobNo}:`, error);
      }
    }

    console.log(`Auto-completion check completed. Checked: ${checkedCount}, Completed: ${completedCount}`);
    
  } catch (error) {
    console.error('Error in checkAndCompleteReadyJobs:', error);
  }
};

/**
 * Wrapper that adds retry with exponential backoff for transient DB connectivity errors (e.g., Prisma P1001)
 * and prevents overlapping runs / log spamming when the DB is down.
 */
async function safeCheckAndCompleteReadyJobs(): Promise<void> {
  if (isCheckRunning) {
    return; // avoid overlapping work
  }
  isCheckRunning = true;
  try {
    await checkAndCompleteReadyJobs();
    // success clears failure count
    consecutiveDbFailures = 0;
  } catch (error: any) {
    const message: string = (error && error.message) || '';
    const code: string | undefined = (error && error.code) || undefined;

    const isDbDown = code === 'P1001' || message.includes("Can't reach database server");
    if (isDbDown) {
      consecutiveDbFailures += 1;
      const backoffMs = computeBackoffMs(consecutiveDbFailures);
      const now = Date.now();
      // rate-limit failure logs to once per 60s
      if (now - lastDbFailureLogAt > 60_000) {
        console.warn(
          `Auto-completion scheduler: database unreachable (P1001). ` +
          `Consecutive failures: ${consecutiveDbFailures}. Retrying in ${Math.round(backoffMs / 1000)}s.`
        );
        lastDbFailureLogAt = now;
      }
      await sleep(backoffMs);
    } else {
      console.error('Error in auto-completion scheduler:', error);
    }
  } finally {
    isCheckRunning = false;
  }
}

/**
 * Manually trigger a completion check for a specific job
 */
export const triggerCompletionCheck = async (nrcJobNo: string) => {
  try {
    console.log(`Manually triggering completion check for job ${nrcJobNo}`);
    
    const completionCheck = await checkJobReadyForCompletion(nrcJobNo);
    
    if (completionCheck.isReady) {
      const result = await autoCompleteJobIfReady(nrcJobNo, 'system');
      
      if (result.completed) {
        console.log(`Successfully auto-completed job ${nrcJobNo}`);
        return { success: true, completed: true, completedJob: result.completedJob };
      } else {
        console.log(`Failed to auto-complete job ${nrcJobNo}: ${result.reason}`);
        return { success: true, completed: false, reason: result.reason };
      }
    } else {
      console.log(`Job ${nrcJobNo} is not ready for completion: ${completionCheck.reason}`);
      return { success: true, completed: false, reason: completionCheck.reason };
    }
    
  } catch (error) {
    console.error(`Error in triggerCompletionCheck for job ${nrcJobNo}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Get scheduler status
 */
export const getSchedulerStatus = () => {
  return {
    isRunning: schedulerInterval !== null,
    interval: schedulerInterval ? '5 minutes' : 'not set'
  };
};