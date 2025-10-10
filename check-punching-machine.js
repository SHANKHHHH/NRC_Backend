const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPunchingMachine() {
  try {
    console.log('🔍 Checking Punching step machine assignment...');
    
    // Get the job planning for this job
    const jobPlanning = await prisma.jobPlanning.findFirst({
      where: {
        nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      },
      include: {
        steps: {
          where: {
            stepNo: 5 // Punching step
          }
        }
      }
    });
    
    if (jobPlanning && jobPlanning.steps.length > 0) {
      const punchingStep = jobPlanning.steps[0];
      console.log('Punching step details:');
      console.log('  Step No:', punchingStep.stepNo);
      console.log('  Step Name:', punchingStep.stepName);
      console.log('  Status:', punchingStep.status);
      console.log('  Machine Details:', JSON.stringify(punchingStep.machineDetails, null, 2));
      
      // Check if there should be a JobStepMachine record
      const machineDetails = punchingStep.machineDetails;
      if (Array.isArray(machineDetails) && machineDetails.length > 0) {
        const machineInfo = machineDetails[0];
        console.log('\nMachine info from step:');
        console.log('  Machine ID:', machineInfo.machineId);
        console.log('  Machine Code:', machineInfo.machineCode);
        console.log('  Machine Type:', machineInfo.machineType);
        
        // Check if there's a JobStepMachine record for this machine
        const jobStepMachine = await prisma.jobStepMachine.findFirst({
          where: {
            jobStepId: punchingStep.id,
            machineId: machineInfo.machineId
          }
        });
        
        if (jobStepMachine) {
          console.log('\nJobStepMachine record found:');
          console.log('  Status:', jobStepMachine.status);
          console.log('  User ID:', jobStepMachine.userId);
        } else {
          console.log('\nNo JobStepMachine record found for this machine');
          console.log('This suggests the step was completed using the old flow');
        }
      }
    } else {
      console.log('No job planning found for this job');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPunchingMachine();
