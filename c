[1mdiff --git a/src/middleware/machineAccess.ts b/src/middleware/machineAccess.ts[m
[1mindex 05a0131..77d6ad3 100644[m
[1m--- a/src/middleware/machineAccess.ts[m
[1m+++ b/src/middleware/machineAccess.ts[m
[36m@@ -39,9 +39,9 @@[m [mexport const getUserMachineIds = async (userId: string, userRole: string): Promi[m
     }[m
   }[m
 [m
[31m-  // Admins, Flying Squad members, QC Managers, and Planners bypass machine restrictions[m
[32m+[m[32m  // Admins, Flying Squad members, and QC Managers bypass machine restrictions[m
   const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;[m
[31m-  if (RoleManager.isAdmin(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.isPlanner(roleString) || RoleManager.hasRole(roleString, 'qc_manager')) {[m
[32m+[m[32m  if (RoleManager.isAdmin(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.hasRole(roleString, 'qc_manager')) {[m
     return null;[m
   }[m
 [m
[36m@@ -219,10 +219,12 @@[m [mexport const addMachineFiltering = async (req: Request, res: Response, next: Nex[m
 [m
     console.log('🔍 [MACHINE FILTERING DEBUG] Parsed role:', parsedRole);[m
 [m
[31m-    // Admins, Flying Squad members, QC Managers, and Planners bypass machine restrictions[m
[31m-    const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;[m
[31m-    if (userRole && (RoleManager.isAdmin(roleString) || RoleManager.isFlyingSquad(roleString) || RoleManager.isPlanner(roleString) || RoleManager.hasRole(roleString, 'qc_manager'))) {[m
[31m-      console.log('🔍 [MACHINE FILTERING DEBUG] Admin/Planner/Flying Squad/QC Manager - bypassing machine restrictions');[m
[32m+[m[32m    // Admins, Flying Squad, and QC Managers bypass machine restrictions[m
[32m+[m[32m    const rolesArray: string[] = Array.isArray(parsedRole) ? parsedRole : [String(parsedRole)].filter(Boolean);[m
[32m+[m[32m    const bypassRoles = new Set(['admin', 'flyingsquad', 'qc_manager']);[m
[32m+[m[32m    const isBypass = rolesArray.some(r => bypassRoles.has(r));[m
[32m+[m[32m    if (userRole && isBypass) {[m
[32m+[m[32m      console.log('🔍 [MACHINE FILTERING DEBUG] Bypass role detected (Admin/Flying Squad/QC Manager)');[m
       req.userMachineIds = null; // Indicate no filtering needed[m
       req.userRole = userRole; // Pass user role for high demand filtering[m
       return next();[m
[36m@@ -547,22 +549,59 @@[m [mexport const getFilteredJobStepIds = async (userMachineIds: string[] | null, use[m
 [m
 /**[m
  * Get filtered job numbers based on user machine access (for job-level filtering)[m
[32m+[m[32m * Now supports pagination to prevent performance issues with large datasets[m
  */[m
[31m-export const getFilteredJobNumbers = async (userMachineIds: string[] | null, userRole: string): Promise<string[]> => {[m
[32m+[m[32mexport const getFilteredJobNumbers = async ([m
[32m+[m[32m  userMachineIds: string[] | null,[m[41m [m
[32m+[m[32m  userRole: string,[m
[32m+[m[32m  options: { limit?: number; offset?: number } = {}[m
[32m+[m[32m): Promise<string[]> => {[m
[32m+[m[32m  const { limit = 1000, offset = 0 } = options;[m
[32m+[m
   if (userMachineIds === null) {[m
[31m-    // Admin/flying squad - return all job numbers[m
[31m-    const allJobs = await prisma.job.findMany({[m
[31m-      select: { nrcJobNo: true }[m
[31m-    });[m
[31m-    return allJobs.map(job => job.nrcJobNo);[m
[32m+[m[32m    // Admin/Flying Squad/Planner (bypass): return union of Job and JobPlanning job numbers[m
[32m+[m[32m    // (some plannings may not have Jobs yet)[m
[32m+[m[32m    const [jobs, plannings] = await Promise.all([[m
[32m+[m[32m      prisma.job.findMany({[m
[32m+[m[32m        select: { nrcJobNo: true },[m
[32m+[m[32m        orderBy: { createdAt: 'desc' },[m
[32m+[m[32m        take: limit,[m
[32m+[m[32m        skip: offset[m
[32m+[m[32m      }),[m
[32m+[m[32m      prisma.jobPlanning.findMany({[m
[32m+[m[32m        select: { nrcJobNo: true },[m
[32m+[m[32m        orderBy: { createdAt: 'desc' },[m
[32m+[m[32m        take: limit,[m
[32m+[m[32m        skip: offset[m
[32m+[m[32m      })[m
[32m+[m[32m    ]);[m
[32m+[m[32m    const set = new Set<string>();[m
[32m+[m[32m    jobs.forEach(j => set.add(j.nrcJobNo));[m
[32m+[m[32m    plannings.forEach(p => set.add(p.nrcJobNo));[m
[32m+[m[32m    return Array.from(set);[m
   }[m
 [m
   // Special handling for paperstore users - they can see all jobs (no machine restrictions)[m
[32m+[m[32m  // Return union of Job and JobPlanning job numbers (same as bypass users)[m
   if (userRole.includes('paperstore')) {[m
[31m-    const allJobs = await prisma.job.findMany({[m
[31m-      select: { nrcJobNo: true }[m
[31m-    });[m
[31m-    return allJobs.map(job => job.nrcJobNo);[m
[32m+[m[32m    const [jobs, plannings] = await Promise.all([[m
[32m+[m[32m      prisma.job.findMany({[m
[32m+[m[32m        select: { nrcJobNo: true },[m
[32m+[m[32m        orderBy: { createdAt: 'desc' },[m
[32m+[m[32m        take: limit,[m
[32m+[m[32m        skip: offset[m
[32m+[m[32m      }),[m
[32m+[m[32m      prisma.jobPlanning.findMany({[m
[32m+[m[32m        select: { nrcJobNo: true },[m
[32m+[m[32m        orderBy: { createdAt: 'desc' },[m
[32m+[m[32m        take: limit,[m
[32m+[m[32m        skip: offset[m
[32m+[m[32m      })[m
[32m+[m[32m    ]);[m
[32m+[m[32m    const set = new Set<string>();[m
[32m+[m[32m    jobs.forEach(j => set.add(j.nrcJobNo));[m
[32m+[m[32m    plannings.forEach(p => set.add(p.nrcJobNo));[m
[32m+[m[32m    return Array.from(set);[m
   }[m
 [m
   // Include job-level machine filtering (job.machineId) OR step-level machine filtering[m
[36m@@ -605,4 +644,60 @@[m [mexport const getFilteredJobNumbers = async (userMachineIds: string[] | null, use[m
 [m
   const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);[m
   return Array.from(set);[m
[32m+[m[32m};[m
[32m+[m
[32m+[m[32m/**[m
[32m+[m[32m * Get total count of filtered job numbers for pagination[m
[32m+[m[32m */[m
[32m+[m[32mexport const getFilteredJobNumbersCount = async (userMachineIds: string[] | null, userRole: string): Promise<number> => {[m
[32m+[m[32m  if (userMachineIds === null) {[m
[32m+[m[32m    // Admin/flying squad - return total count[m
[32m+[m[32m    return await prisma.job.count();[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // Special handling for paperstore users - they can see all jobs[m
[32m+[m[32m  if (userRole.includes('paperstore')) {[m
[32m+[m[32m    return await prisma.job.count();[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // For other users, get the filtered count using the same logic as getFilteredJobNumbers[m
[32m+[m[32m  const [jobs, jobPlannings] = await Promise.all([[m
[32m+[m[32m    prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),[m
[32m+[m[32m    prisma.jobPlanning.findMany({[m
[32m+[m[32m      select: { nrcJobNo: true, steps: { select: { machineDetails: true, stepNo: true, stepName: true } } }[m
[32m+[m[32m    })[m
[32m+[m[32m  ]);[m
[32m+[m
[32m+[m[32m  const jobLevelAccessible = jobs[m
[32m+[m[32m    .filter(j => (j.machineId && userMachineIds.includes(j.machineId)) || j.jobDemand === 'high')[m
[32m+[m[32m    .map(j => j.nrcJobNo);[m
[32m+[m
[32m+[m[32m  const planningLevelAccessible = jobPlannings[m
[32m+[m[32m    .filter(p => p.steps.some(s => {[m
[32m+[m[32m      // High-demand grants role-based visibility regardless of machine[m
[32m+[m[32m      const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';[m
[32m+[m[32m      if (highDemandJob && isStepForUserRole(s.stepName, userRole)) return true;[m
[32m+[m[41m      [m
[32m+[m[32m      // Role-based visibility: If step matches user role AND has machine assignment, require machine match[m
[32m+[m[32m      if (isStepForUserRole(s.stepName, userRole)) {[m
[32m+[m[32m        const stepMachineIds = parseMachineDetails(s.machineDetails);[m
[32m+[m[32m        if (stepMachineIds.length > 0) {[m
[32m+[m[32m          return stepMachineIds.some(machineId => userMachineIds.includes(machineId));[m
[32m+[m[32m        }[m
[32m+[m[32m        // If no machine details, allow access (for backward compatibility)[m
[32m+[m[32m        return true;[m
[32m+[m[32m      }[m
[32m+[m[41m      [m
[32m+[m[32m      // Machine-based visibility: If step has machine assignment, require machine match[m
[32m+[m[32m      const stepMachineIds = parseMachineDetails(s.machineDetails);[m
[32m+[m[32m      if (stepMachineIds.length > 0) {[m
[32m+[m[32m        return stepMachineIds.some(machineId => userMachineIds.includes(machineId));[m
[32m+[m[32m      }[m
[32m+[m[41m      [m
[32m+[m[32m      return false;[m
[32m+[m[32m    }))[m
[32m+[m[32m    .map(p => p.nrcJobNo);[m
[32m+[m
[32m+[m[32m  const set = new Set<string>([...jobLevelAccessible, ...planningLevelAccessible]);[m
[32m+[m[32m  return set.size;[m
 };[m
\ No newline at end of file[m
