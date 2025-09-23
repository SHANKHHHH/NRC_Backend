import { prisma } from '../lib/prisma';
import { getFilteredJobNumbers } from '../middleware/machineAccess';

/**
 * Unified job data helper that ensures clean role-based data separation
 * This prevents mixing data from different plannings and ensures each role sees only their relevant steps
 */
export class UnifiedJobDataHelper {
  
  /**
   * Get job data with role-specific step filtering
   * This ensures each role only sees their own step data, preventing data mixing
   */
  static async getRoleBasedJobData(userMachineIds: string[] | null, userRole: string) {
    // Get accessible job numbers
    const accessibleJobNumbers = await getFilteredJobNumbers(userMachineIds, userRole);
    
    // Get jobs with basic info
    const jobs = await prisma.job.findMany({
      where: { nrcJobNo: { in: accessibleJobNumbers } },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseOrders: true,
        artworks: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        machine: {
          select: {
            id: true,
            description: true,
            status: true
          }
        }
      }
    });

    // Get ALL job plannings for these jobs
    const allJobPlannings = await prisma.jobPlanning.findMany({
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

    // Group plannings by job
    const planningsByJob = allJobPlannings.reduce((acc, planning) => {
      if (!acc[planning.nrcJobNo]) {
        acc[planning.nrcJobNo] = [];
      }
      acc[planning.nrcJobNo].push(planning);
      return acc;
    }, {} as Record<string, any[]>);

    // Process each job with role-specific filtering
    const processedJobs = jobs.map(job => {
      const jobPlannings = planningsByJob[job.nrcJobNo] || [];
      
      // Get role-specific steps for this job
      const roleSpecificSteps = this.getRoleSpecificSteps(jobPlannings, userRole);
      
      // Group steps by type for this specific role
      const stepsByType = this.groupStepsByType(roleSpecificSteps);
      
      return {
        ...job,
        // Include only role-specific step data
        ...stepsByType,
        // Keep original relations for backward compatibility
        purchaseOrders: job.purchaseOrders || [],
        artworks: job.artworks || [],
        // Include job plannings for reference (filtered by role)
        jobPlannings: jobPlannings.map(p => ({
          jobPlanId: p.jobPlanId,
          steps: p.steps.filter(step => this.isStepForUserRole(step.stepName, userRole))
        }))
      };
    });

    return processedJobs;
  }

  /**
   * Get role-specific steps for a job, ensuring clean separation
   */
  private static getRoleSpecificSteps(jobPlannings: any[], userRole: string) {
    const allSteps = jobPlannings.flatMap(p => p.steps);
    
    // Filter steps based on user role
    return allSteps.filter(step => this.isStepForUserRole(step.stepName, userRole));
  }

  /**
   * Group steps by type for easier frontend consumption
   */
  private static groupStepsByType(steps: any[]) {
    return {
      printingDetails: steps.filter(s => s.stepName === 'PrintingDetails'),
      fluteLaminateBoardConversions: steps.filter(s => s.stepName === 'FluteLaminateBoardConversion'),
      corrugations: steps.filter(s => s.stepName === 'Corrugation'),
      punchings: steps.filter(s => s.stepName === 'Punching'),
      sideFlapPastings: steps.filter(s => s.stepName === 'SideFlapPasting'),
      qualityDepts: steps.filter(s => s.stepName === 'QualityDept'),
      dispatchProcesses: steps.filter(s => s.stepName === 'DispatchProcess'),
      paperStores: steps.filter(s => s.stepName === 'PaperStore')
    };
  }

  /**
   * Get role-specific step data for individual controllers
   */
  static async getRoleSpecificStepData(userMachineIds: string[] | null, userRole: string, stepName: string) {
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
  }

  /**
   * Check if step matches user's role
   */
  private static isStepForUserRole(stepName: string, userRole: string | string[]): boolean {
    const roleStepMapping = {
      'printer': 'PrintingDetails',
      'corrugator': 'Corrugation', 
      'punching_operator': 'Punching',
      'pasting_operator': 'SideFlapPasting',
      'flutelaminator': 'FluteLaminateBoardConversion',
      'paperstore': 'PaperStore',
      'qc_manager': 'QualityDept',
      'dispatch_executive': 'DispatchProcess'
    };

    if (Array.isArray(userRole)) {
      return userRole.some(r => roleStepMapping[r] === stepName);
    }

    if (typeof userRole === 'string') {
      try {
        const roles = JSON.parse(userRole);
        if (Array.isArray(roles)) {
          return roles.some(r => roleStepMapping[r] === stepName);
        }
      } catch {
        // Not JSON, treat as single role string
      }
      return roleStepMapping[userRole] === stepName;
    }

    return false;
  }
}
