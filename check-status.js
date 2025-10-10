const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkStatus() {
  try {
    console.log('🔍 Checking current status...');
    
    // Get JobStepMachine
    const jsm = await prisma.jobStepMachine.findFirst({
      where: {
        machineId: 'cmfig0ajp000v1ewl93rnuzzj',
        nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      }
    });
    
    console.log('JobStepMachine status:', jsm?.status);
    console.log('JobStepMachine completedAt:', jsm?.completedAt);
    
    // Get JobStep
    const step = await prisma.jobStep.findFirst({
      where: { id: jsm?.jobStepId }
    });
    
    console.log('JobStep status:', step?.status);
    console.log('JobStep endDate:', step?.endDate);
    
    // Get PunchingDetails
    const punching = await prisma.punchingDetails.findFirst({
      where: { jobNrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)' }
    });
    
    console.log('PunchingDetails status:', punching?.status);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();
