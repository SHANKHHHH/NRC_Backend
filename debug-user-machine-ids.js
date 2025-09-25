const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugUserMachineIds() {
  try {
    console.log('🔍 Debugging getUserMachineIds for paperstore user...');
    
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
    
    // 2. Simulate the getUserMachineIds logic
    const userRole = user.role;
    console.log(`\n🔍 Simulating getUserMachineIds with role: ${userRole}`);
    
    // Parse role if it's a JSON string
    let parsedRole = userRole;
    if (typeof userRole === 'string') {
      try {
        const roles = JSON.parse(userRole);
        if (Array.isArray(roles)) {
          parsedRole = roles;
        }
      } catch {
        // Not JSON, use as is
      }
    }
    
    console.log(`🔍 Parsed role: ${parsedRole}`);
    
    // Check if it's admin/flying squad/planner
    const roleString = Array.isArray(parsedRole) ? parsedRole.join(',') : parsedRole;
    console.log(`🔍 Role string: ${roleString}`);
    
    // Check if it's admin
    const isAdmin = roleString === 'admin' || roleString.includes('admin');
    console.log(`🔍 Is admin: ${isAdmin}`);
    
    // Check if it's flying squad
    const isFlyingSquad = roleString === 'flyingsquad' || roleString.includes('flyingsquad');
    console.log(`🔍 Is flying squad: ${isFlyingSquad}`);
    
    // Check if it's planner
    const isPlanner = roleString === 'planner' || roleString.includes('planner');
    console.log(`🔍 Is planner: ${isPlanner}`);
    
    if (isAdmin || isFlyingSquad || isPlanner) {
      console.log('🔍 User is admin/flying squad/planner - should return null');
      console.log('❌ This means filtering will be bypassed and all jobs returned');
    } else {
      console.log('🔍 User is regular user - should get machine assignments');
      
      // Get user machine assignments
      const userMachines = await prisma.userMachine.findMany({
        where: { userId: user.id },
        select: { machineId: true }
      });
      
      const machineIds = userMachines.map(um => um.machineId);
      console.log(`🔍 User machine IDs: ${machineIds.length > 0 ? machineIds : 'None'}`);
      
      if (machineIds.length === 0) {
        console.log('🔍 User has no machine assignments - will return empty array []');
        console.log('🔍 This should trigger role-based filtering, not admin bypass');
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugUserMachineIds();
