const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugUser() {
  try {
    // Get all users with corrugator role
    const corrugatorUsers = await prisma.user.findMany({
      where: { role: 'corrugator' },
      select: { id: true, name: true, role: true }
    });
    
    console.log('Corrugator users:', corrugatorUsers.length);
    corrugatorUsers.forEach(user => {
      console.log('  - User:', user.name, 'ID:', user.id, 'Role:', user.role);
    });
    
    // Check machine assignments for each corrugator
    for (const user of corrugatorUsers) {
      const userMachines = await prisma.userMachine.findMany({
        where: { userId: user.id, isActive: true },
        include: { machine: { select: { id: true, machineCode: true, machineType: true } } }
      });
      
      console.log(`\nUser ${user.name} (${user.id}) machine assignments:`);
      userMachines.forEach(um => {
        console.log('  - Machine:', um.machine.machineCode, um.machine.machineType, 'ID:', um.machine.id);
      });
    }
    
    // Check job steps with corrugation and their machine details
    console.log('\nJob steps with Corrugation:');
    const jobSteps = await prisma.jobStep.findMany({
      where: { stepName: 'Corrugation' },
      select: { 
        id: true, 
        machineDetails: true,
        jobPlanning: {
          select: { nrcJobNo: true }
        }
      }
    });
    
    jobSteps.forEach(js => {
      console.log(`  - Job Step ${js.id} (${js.jobPlanning.nrcJobNo}):`, js.machineDetails);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugUser();
