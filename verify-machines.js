const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyImport() {
  try {
    const count = await prisma.machine.count();
    console.log(`Total machines in database: ${count}`);
    
    const byUnit = await prisma.machine.groupBy({
      by: ['unit'],
      _count: { unit: true }
    });
    
    console.log('\nMachines by unit:');
    byUnit.forEach(group => {
      console.log(`  ${group.unit}: ${group._count.unit} machines`);
    });
    
    const byType = await prisma.machine.groupBy({
      by: ['machineType'],
      _count: { machineType: true }
    });
    
    console.log('\nMachines by type:');
    byType.forEach(group => {
      console.log(`  ${group.machineType}: ${group._count.machineType} machines`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImport();

