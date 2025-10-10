const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMachineDetails() {
  try {
    const steps = await prisma.jobStep.findMany({
      where: { jobPlanningId: 151 },
      select: {
        id: true,
        stepName: true,
        machineDetails: true
      }
    });
    
    console.log('Steps with machine details:');
    console.log(JSON.stringify(steps, null, 2));
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkMachineDetails();
