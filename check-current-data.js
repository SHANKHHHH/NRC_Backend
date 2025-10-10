const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log('=== Current JobStepMachine Data ===');
    const jobStepMachines = await prisma.jobStepMachine.findMany();
    console.log('JobStepMachine records:', jobStepMachines.length);
    jobStepMachines.forEach((jsm, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${jsm.id}`);
      console.log(`  JobStepId: ${jsm.jobStepId}`);
      console.log(`  nrcJobNo: ${jsm.nrcJobNo || 'NULL'}`);
      console.log(`  stepNo: ${jsm.stepNo || 'NULL'}`);
      console.log(`  machineId: ${jsm.machineId}`);
      console.log(`  status: ${jsm.status}`);
      console.log(`  userId: ${jsm.userId || 'NULL'}`);
      console.log(`  formData: ${jsm.formData ? JSON.stringify(jsm.formData) : 'NULL'}`);
    });

    console.log('\n=== Current PrintingDetails Data ===');
    const printingDetails = await prisma.printingDetails.findMany();
    console.log('PrintingDetails records:', printingDetails.length);
    printingDetails.forEach((pd, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${pd.id}`);
      console.log(`  jobNrcJobNo: ${pd.jobNrcJobNo}`);
      console.log(`  quantity: ${pd.quantity}`);
      console.log(`  colorsUsed: ${pd.colorsUsed || 'NULL'}`);
      console.log(`  inksUsed: ${pd.inksUsed || 'NULL'}`);
      console.log(`  coatingType: ${pd.coatingType || 'NULL'}`);
      console.log(`  status: ${pd.status}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
