const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkFlapMachine() {
  try {
    console.log('🔍 Checking Flap Pasting machine status...');
    
    const jobStepMachine = await prisma.jobStepMachine.findFirst({
      where: {
        machineId: 'cmfig0bog00161ewlotyc8rlj',
        nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
      }
    });
    
    if (jobStepMachine) {
      console.log('JobStepMachine found:');
      console.log('  ID:', jobStepMachine.id);
      console.log('  Status:', jobStepMachine.status);
      console.log('  User ID:', jobStepMachine.userId);
      console.log('  Started At:', jobStepMachine.startedAt);
      console.log('  Completed At:', jobStepMachine.completedAt);
    } else {
      console.log('No JobStepMachine record found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFlapMachine();
