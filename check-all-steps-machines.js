const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllStepsMachines() {
  try {
    // Get all steps for the job
    const jobSteps = await prisma.jobStep.findMany({
      where: {
        jobPlanning: {
          nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
        }
      },
      orderBy: { stepNo: 'asc' }
    });
    
    console.log('All JobSteps for BAT-1-2 BG (48 PRS) (31059):');
    jobSteps.forEach((step, index) => {
      console.log(`\nStep ${index + 1}:`);
      console.log('  ID:', step.id);
      console.log('  Step No:', step.stepNo);
      console.log('  Step Name:', step.stepName);
      console.log('  Status:', step.status);
      console.log('  Machine Details:', JSON.stringify(step.machineDetails, null, 2));
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllStepsMachines();
