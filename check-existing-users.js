const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkExistingUsers() {
  try {
    console.log('🔍 Checking existing users in database...');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    });
    
    console.log(`✅ Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. User: ${user.email}`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Name: ${user.name}`);
      console.log(`   - Role: ${user.role}`);
      console.log(`   - Active: ${user.isActive}`);
      
      if (user.role && user.role.includes('paperstore')) {
        console.log('   ✅ HAS PAPERSTORE ROLE');
      }
    });
    
    // Check if any user has paperstore role
    const paperStoreUsers = users.filter(user => 
      user.role && user.role.includes('paperstore')
    );
    
    if (paperStoreUsers.length > 0) {
      console.log(`\n✅ Found ${paperStoreUsers.length} users with paperstore role:`);
      paperStoreUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.name})`);
      });
    } else {
      console.log('\n❌ No users found with paperstore role');
      console.log('🔧 Adding paperstore role to an existing user...');
      
      // Add paperstore role to the first user
      if (users.length > 0) {
        const firstUser = users[0];
        const currentRole = firstUser.role || '';
        const updatedRole = currentRole ? `${currentRole},paperstore` : 'paperstore';
        
        await prisma.user.update({
          where: { id: firstUser.id },
          data: { role: updatedRole }
        });
        
        console.log(`✅ Added paperstore role to ${firstUser.email}`);
        console.log(`✅ Updated role: ${updatedRole}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkExistingUsers();
