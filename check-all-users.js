const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllUsers() {
  try {
    // Get all users
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, role: true, email: true }
    });
    
    console.log('All users in database:');
    allUsers.forEach(user => {
      console.log('  - User:', user.name, 'Email:', user.email, 'Role:', user.role, 'ID:', user.id);
    });
    
    // Check machine assignments for all users
    console.log('\nMachine assignments:');
    const userMachines = await prisma.userMachine.findMany({
      where: { isActive: true },
      include: { 
        user: { select: { name: true, role: true } },
        machine: { select: { machineCode: true, machineType: true } }
      }
    });
    
    userMachines.forEach(um => {
      console.log(`  - ${um.user.name} (${um.user.role}) -> ${um.machine.machineCode} (${um.machine.machineType})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllUsers();
