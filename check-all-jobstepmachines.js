const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllJobStepMachines() {
  try {
    console.log('🔍 Checking all JobStepMachine records...');
    
    const allJobStepMachines = await prisma.jobStepMachine.findMany({
      include: {
        jobStep: {
          include: {
            jobPlanning: {
              select: { nrcJobNo: true }
            }
          }
        },
        machine: {
          select: { machineCode: true, machineType: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log(`📊 Found ${allJobStepMachines.length} JobStepMachine records:`);
    
    for (const jsm of allJobStepMachines) {
      console.log(`  - ID: ${jsm.id}`);
      console.log(`    Job: ${jsm.jobStep.jobPlanning.nrcJobNo}`);
      console.log(`    Step: ${jsm.jobStep.stepName} (${jsm.jobStep.stepNo})`);
      console.log(`    Machine: ${jsm.machine.machineCode} (${jsm.machine.machineType})`);
      console.log(`    Status: ${jsm.status}`);
      console.log(`    User: ${jsm.userId}`);
      console.log(`    Created: ${jsm.createdAt}`);
      console.log(`    Updated: ${jsm.updatedAt}`);
      console.log('    ---');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllJobStepMachines();
