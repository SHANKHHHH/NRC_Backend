const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugMachineStatus() {
  try {
    console.log('🔍 Checking current machine status...');
    
    // Find the printing step for the job
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        stepName: 'PrintingDetails',
        jobPlanning: {
          nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
        }
      },
      include: {
        jobStepMachines: true
      }
    });
    
    if (jobStep) {
      console.log('📋 JobStep Status:', {
        id: jobStep.id,
        stepName: jobStep.stepName,
        status: jobStep.status,
        stepNo: jobStep.stepNo
      });
      
      console.log('🔧 JobStepMachines:');
      for (const jsm of jobStep.jobStepMachines) {
        console.log(`  - Machine ${jsm.machineId}: ${jsm.status} (Updated: ${jsm.updatedAt})`);
      }
      
      // Check individual step
      const printingDetails = await prisma.printingDetails.findFirst({
        where: { jobStepId: jobStep.id }
      });
      
      if (printingDetails) {
        console.log('📝 Individual Step Status:', {
          id: printingDetails.id,
          status: printingDetails.status,
          updatedAt: printingDetails.updatedAt
        });
      } else {
        console.log('❌ No Individual Step record found');
      }
    } else {
      console.log('❌ No JobStep found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugMachineStatus();
