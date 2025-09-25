const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugPaperStoreMachines() {
  try {
    console.log('🔍 Debugging Paper Store user machine assignments...');
    
    // 1. Find the paperstore user
    const user = await prisma.user.findFirst({
      where: { email: 'paperstore@gmail.com' },
      select: { id: true, email: true, role: true }
    });
    
    if (!user) {
      console.log('❌ Paper Store user not found');
      return;
    }
    
    console.log('✅ Found Paper Store user:');
    console.log(`  - ID: ${user.id}`);
    console.log(`  - Email: ${user.email}`);
    console.log(`  - Role: ${user.role}`);
    
    // 2. Check user machine assignments
    const userMachines = await prisma.userMachine.findMany({
      where: { userId: user.id },
      include: { machine: true }
    });
    
    console.log(`\n✅ User has ${userMachines.length} machine assignments:`);
    userMachines.forEach((userMachine, index) => {
      console.log(`  ${index + 1}. Machine ID: ${userMachine.machineId}`);
      console.log(`     - Machine: ${userMachine.machine?.description || 'Unknown'}`);
      console.log(`     - Type: ${userMachine.machine?.machineType || 'Unknown'}`);
    });
    
    // 3. Check if there are any machines assigned to paperstore role
    const paperstoreMachines = await prisma.machine.findMany({
      where: {
        OR: [
          { machineType: { contains: 'Paper', mode: 'insensitive' } },
          { description: { contains: 'Paper', mode: 'insensitive' } }
        ]
      }
    });
    
    console.log(`\n✅ Found ${paperstoreMachines.length} machines that might be for Paper Store:`);
    paperstoreMachines.forEach((machine, index) => {
      console.log(`  ${index + 1}. ${machine.description} (${machine.machineType}) - ID: ${machine.id}`);
    });
    
    // 4. Check job plannings with PaperStore steps and their machine details
    const jobPlannings = await prisma.jobPlanning.findMany({
      where: {
        steps: {
          some: { stepName: 'PaperStore' }
        }
      },
      include: {
        steps: {
          where: { stepName: 'PaperStore' },
          select: { machineDetails: true, stepNo: true }
        }
      }
    });
    
    console.log(`\n✅ Found ${jobPlannings.length} job plannings with PaperStore steps:`);
    jobPlannings.forEach((planning, index) => {
      console.log(`  ${index + 1}. Job: ${planning.nrcJobNo}`);
      planning.steps.forEach(step => {
        console.log(`     - Step ${step.stepNo}: ${JSON.stringify(step.machineDetails)}`);
      });
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugPaperStoreMachines();
