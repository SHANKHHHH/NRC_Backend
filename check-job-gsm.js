const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkJobData() {
  try {
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: 'PAG-PKBB-PB02-0105' },
      select: {
        nrcJobNo: true,
        topFaceGSM: true,
        bottomLinerGSM: true,
        fluteType: true,
        boardSize: true,
        boxDimensions: true,
        jobDemand: true
      }
    });
    
    console.log('Job Data:');
    console.log(JSON.stringify(job, null, 2));
    
    // Check if the values are strings or numbers
    console.log('topFaceGSM type:', typeof job?.topFaceGSM);
    console.log('bottomLinerGSM type:', typeof job?.bottomLinerGSM);
    console.log('topFaceGSM value:', job?.topFaceGSM);
    console.log('bottomLinerGSM value:', job?.bottomLinerGSM);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkJobData();
