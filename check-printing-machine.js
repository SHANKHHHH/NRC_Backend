const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPrintingMachine() {
  try {
    console.log('Checking JobStepMachine records for printing machine...');
    const records = await prisma.jobStepMachine.findMany({
      where: { machineId: 'cmfig046600061ewlu4p3rkyz' },
      include: { machine: true, user: true }
    });
    
    console.log('JobStepMachine records:');
    console.log(JSON.stringify(records, null, 2));
    
    console.log('\nChecking Machine table...');
    const machine = await prisma.machine.findUnique({
      where: { id: 'cmfig046600061ewlu4p3rkyz' }
    });
    
    console.log('Machine record:');
    console.log(JSON.stringify(machine, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPrintingMachine();
