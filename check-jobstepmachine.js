const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkJobStepMachine() {
  try {
    console.log('🔍 Checking all JobStepMachine records for job BAT-1-2 BG (48 PRS) (31059)...');
    
    const jobStepMachines = await prisma.jobStepMachine.findMany({
      where: {
        nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      },
      include: {
        machine: true
      }
    });
    
    console.log(`Found ${jobStepMachines.length} JobStepMachine records:`);
    
    jobStepMachines.forEach((jsm, index) => {
      console.log(`\n${index + 1}. JobStepMachine ID: ${jsm.id}`);
      console.log(`   Machine ID: ${jsm.machineId}`);
      console.log(`   Machine Code: ${jsm.machine?.machineCode}`);
      console.log(`   Machine Type: ${jsm.machine?.machineType}`);
      console.log(`   Status: ${jsm.status}`);
      console.log(`   User ID: ${jsm.userId}`);
      console.log(`   Started At: ${jsm.startedAt}`);
      console.log(`   Completed At: ${jsm.completedAt}`);
      console.log(`   Step No: ${jsm.stepNo}`);
    });
    
    // Also check all JobStep records for this job
    console.log('\n🔍 Checking JobStep records...');
    const jobSteps = await prisma.jobStep.findMany({
      where: {
        jobPlanning: {
          nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
        }
      }
    });
    
    console.log(`Found ${jobSteps.length} JobStep records:`);
    jobSteps.forEach((step, index) => {
      console.log(`\n${index + 1}. Step ${step.stepNo}: ${step.stepName}`);
      console.log(`   Status: ${step.status}`);
      console.log(`   User: ${step.user}`);
      console.log(`   Start Date: ${step.startDate}`);
      console.log(`   End Date: ${step.endDate}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJobStepMachine();
