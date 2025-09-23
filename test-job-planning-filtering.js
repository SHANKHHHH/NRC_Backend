const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testJobPlanningFiltering() {
  console.log('🧪 Testing Job Planning Filtering\n');

  try {
    const testJobNo = 'VIP- EXPRESSION CSD INNER';
    
    console.log(`=== TESTING JOB: ${testJobNo} ===`);
    
    // Get all plannings for this job
    const plannings = await prisma.jobPlanning.findMany({
      where: { nrcJobNo: testJobNo },
      select: {
        jobPlanId: true,
        steps: {
          select: {
            id: true,
            stepNo: true,
            stepName: true,
            status: true,
            machineDetails: true
          },
          orderBy: { stepNo: 'asc' }
        }
      },
      orderBy: { jobPlanId: 'asc' }
    });

    console.log(`Found ${plannings.length} plannings:`);
    plannings.forEach((planning, index) => {
      console.log(`\nPlanning ${index + 1} (ID: ${planning.jobPlanId}):`);
      planning.steps.forEach(step => {
        console.log(`  Step ${step.stepNo}: ${step.stepName} (ID: ${step.id}, Status: ${step.status})`);
      });
    });

    // Test flutelaminator user
    const flutelaminatorUser = await prisma.user.findFirst({
      where: { 
        role: { contains: 'flutelaminator' },
        isActive: true
      },
      select: { id: true, name: true, role: true }
    });

    if (flutelaminatorUser) {
      console.log(`\n=== TESTING WITH FLUTELAMINATOR: ${flutelaminatorUser.name} ===`);
      
      // Get user's machine access
      const userMachines = await prisma.userMachine.findMany({
        where: { 
          userId: flutelaminatorUser.id,
          isActive: true 
        },
        select: { machineId: true }
      });

      const userMachineIds = userMachines.map(um => um.machineId);
      console.log(`User machine IDs: ${userMachineIds.join(', ')}`);

      // Test the current filtering logic
      const [jobs, jobPlannings] = await Promise.all([
        prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),
        prisma.jobPlanning.findMany({
          select: { nrcJobNo: true, steps: { select: { machineDetails: true, stepNo: true, stepName: true } } }
        })
      ]);

      // Job-level access
      const jobLevelAccessible = jobs
        .filter(j => (j.machineId && userMachineIds.includes(j.machineId)) || j.jobDemand === 'high')
        .map(j => j.nrcJobNo);

      // Planning-level access
      const planningLevelAccessible = jobPlannings
        .filter(p => p.steps.some(s => {
          const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';
          if (highDemandJob && s.stepName === 'FluteLaminateBoardConversion') return true;
          if (s.stepName === 'FluteLaminateBoardConversion') return true;
          
          if (Array.isArray(s.machineDetails) && s.machineDetails.length > 0) {
            return s.machineDetails.some((m) => {
              const mid = (m && typeof m === 'object') ? (m.machineId || m.machineld || m.id) : m;
              return typeof mid === 'string' && userMachineIds.includes(mid);
            });
          }
          return false;
        }))
        .map(p => p.nrcJobNo);

      const allAccessible = [...new Set([...jobLevelAccessible, ...planningLevelAccessible])];
      
      console.log(`\nFiltering results:`);
      console.log(`  Job-level accessible: ${jobLevelAccessible.length}`);
      console.log(`  Planning-level accessible: ${planningLevelAccessible.length}`);
      console.log(`  Total accessible: ${allAccessible.length}`);
      
      const isJobAccessible = allAccessible.includes(testJobNo);
      console.log(`  ${testJobNo}: ${isJobAccessible ? '✅ Accessible' : '❌ Not accessible'}`);

      if (isJobAccessible) {
        console.log('\n✅ Job should be visible to flutelaminator');
        console.log('The issue might be in the frontend or API response formatting.');
      } else {
        console.log('\n❌ Job is not accessible to flutelaminator');
        console.log('This explains why it\'s not showing up.');
      }
    }

    // Test printer user to see if they can see this job
    console.log('\n=== TESTING WITH PRINTER USER ===');
    
    const printerUser = await prisma.user.findFirst({
      where: { 
        role: { contains: 'printer' },
        isActive: true
      },
      select: { id: true, name: true, role: true }
    });

    if (printerUser) {
      console.log(`Testing with printer: ${printerUser.name} (${printerUser.role})`);
      
      // Get user's machine access
      const userMachines = await prisma.userMachine.findMany({
        where: { 
          userId: printerUser.id,
          isActive: true 
        },
        select: { machineId: true }
      });

      const userMachineIds = userMachines.map(um => um.machineId);
      console.log(`User machine IDs: ${userMachineIds.join(', ')}`);

      // Test the current filtering logic for printer
      const [jobs, jobPlannings] = await Promise.all([
        prisma.job.findMany({ select: { nrcJobNo: true, machineId: true, jobDemand: true } }),
        prisma.jobPlanning.findMany({
          select: { nrcJobNo: true, steps: { select: { machineDetails: true, stepNo: true, stepName: true } } }
        })
      ]);

      // Planning-level access for printer
      const planningLevelAccessible = jobPlannings
        .filter(p => p.steps.some(s => {
          const highDemandJob = jobs.find(j => j.nrcJobNo === p.nrcJobNo)?.jobDemand === 'high';
          if (highDemandJob && s.stepName === 'PrintingDetails') return true;
          if (s.stepName === 'PrintingDetails') return true;
          
          if (Array.isArray(s.machineDetails) && s.machineDetails.length > 0) {
            return s.machineDetails.some((m) => {
              const mid = (m && typeof m === 'object') ? (m.machineId || m.machineld || m.id) : m;
              return typeof mid === 'string' && userMachineIds.includes(mid);
            });
          }
          return false;
        }))
        .map(p => p.nrcJobNo);

      const isJobAccessible = planningLevelAccessible.includes(testJobNo);
      console.log(`  ${testJobNo}: ${isJobAccessible ? '✅ Accessible to printer' : '❌ Not accessible to printer'}`);

      if (isJobAccessible) {
        console.log('✅ This explains why the job is showing up in printing section');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testJobPlanningFiltering();
