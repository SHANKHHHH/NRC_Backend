const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testStopMachine() {
  try {
    console.log('🔍 Testing stopWorkOnMachine functionality...');
    
    // First, let's check the current status of the Punching machine
    const jobStepMachine = await prisma.jobStepMachine.findFirst({
      where: {
        machineId: 'cmfig0ajp000v1ewl93rnuzzj', // Punching machine
        nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      }
    });
    
    if (jobStepMachine) {
      console.log('Current JobStepMachine status:', jobStepMachine.status);
      console.log('Machine ID:', jobStepMachine.machineId);
      console.log('User ID:', jobStepMachine.userId);
      console.log('Started At:', jobStepMachine.startedAt);
      console.log('Completed At:', jobStepMachine.completedAt);
    } else {
      console.log('No JobStepMachine found for this machine');
    }
    
    // Check the JobStep status
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        jobPlanning: {
          nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
        },
        stepNo: 5 // Punching step
      }
    });
    
    if (jobStep) {
      console.log('Current JobStep status:', jobStep.status);
      console.log('Step No:', jobStep.stepNo);
      console.log('Step Name:', jobStep.stepName);
    }
    
    // Check individual step status
    const punchingDetails = await prisma.punching.findMany({
      where: {
        jobNrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      }
    });
    
    console.log('PunchingDetails records:', punchingDetails.length);
    if (punchingDetails.length > 0) {
      console.log('First PunchingDetails status:', punchingDetails[0].status);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStopMachine();
