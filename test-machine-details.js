const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testMachineDetails() {
  try {
    // Test creating a job step with machine details directly
    const testData = {
      stepNo: 1,
      stepName: "TestStep",
      machineDetails: [
        {
          machineId: "test-1",
          unit: "Mk1",
          machineCode: "TEST-001",
          machineType: "Test"
        },
        {
          machineId: "test-2",
          unit: "Mk2",
          machineCode: "TEST-002",
          machineType: "Test"
        }
      ],
      jobPlanningId: 150
    };
    
    console.log('Creating test step with machine details:');
    console.log(JSON.stringify(testData, null, 2));
    
    const result = await prisma.jobStep.create({
      data: testData
    });
    
    console.log('Created step:');
    console.log(JSON.stringify(result, null, 2));
    
    // Now check what was actually stored
    const stored = await prisma.jobStep.findUnique({
      where: { id: result.id },
      select: { machineDetails: true }
    });
    
    console.log('Stored machine details:');
    console.log(JSON.stringify(stored, null, 2));
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

testMachineDetails();
