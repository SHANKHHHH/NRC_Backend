const { PrismaClient } = require('@prisma/client');
const { RoleManager } = require('./dist/utils/roleUtils');

const prisma = new PrismaClient();

async function testRoleParsing() {
  try {
    // Get a corrugator user
    const corrugatorUser = await prisma.user.findFirst({
      where: { 
        OR: [
          { role: 'corrugator' },
          { role: { contains: 'corrugator' } }
        ]
      }
    });
    
    if (!corrugatorUser) {
      console.log('❌ No corrugator user found');
      return;
    }
    
    console.log('👤 Found corrugator user:', {
      name: corrugatorUser.name,
      email: corrugatorUser.email,
      role: corrugatorUser.role,
      roleType: typeof corrugatorUser.role
    });
    
    // Test role conversion
    const roleString = typeof corrugatorUser.role === 'string' ? corrugatorUser.role : JSON.stringify(corrugatorUser.role);
    console.log('🔄 Converted role string:', roleString);
    
    // Test RoleManager functions
    console.log('🔍 Testing RoleManager functions:');
    console.log('  - isAdmin:', RoleManager.isAdmin(roleString));
    console.log('  - isFlyingSquad:', RoleManager.isFlyingSquad(roleString));
    console.log('  - hasRole(corrugator):', RoleManager.hasRole(roleString, 'corrugator'));
    console.log('  - getUserRoles:', RoleManager.getUserRoles(roleString));
    
    // Test machine access
    const userMachines = await prisma.userMachine.findMany({
      where: { userId: corrugatorUser.id, isActive: true },
      include: { machine: { select: { machineCode: true, machineType: true } } }
    });
    
    console.log('🔧 User machine assignments:', userMachines.length);
    userMachines.forEach(um => {
      console.log(`  - ${um.machine.machineCode} (${um.machine.machineType})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testRoleParsing();
