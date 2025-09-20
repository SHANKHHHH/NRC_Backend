const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    // Check if there are any corrugation records
    const corrugations = await prisma.corrugation.findMany({
      select: { id: true, jobStepId: true }
    });
    console.log('Total corrugations:', corrugations.length);
    
    // Check if there are any job steps with corrugation
    const jobSteps = await prisma.jobStep.findMany({
      where: { stepName: 'Corrugation' },
      select: { id: true, machineDetails: true }
    });
    console.log('Job steps with Corrugation:', jobSteps.length);
    
    // Check user machines
    const userMachines = await prisma.userMachine.findMany({
      select: { userId: true, machineId: true, isActive: true }
    });
    console.log('User machine assignments:', userMachines.length);
    
    // Check machines
    const machines = await prisma.machine.findMany({
      select: { id: true, machineCode: true, machineType: true }
    });
    console.log('Available machines:', machines.length);
    machines.forEach(m => console.log('  -', m.id, m.machineCode, m.machineType));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
