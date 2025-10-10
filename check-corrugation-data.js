const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCorrugationData() {
  try {
    const corrugation = await prisma.corrugation.findMany({
      where: { jobNrcJobNo: 'PAG-PKBB-PB02-0105' },
      select: {
        id: true,
        jobNrcJobNo: true,
        gsm1: true,
        gsm2: true,
        flute: true,
        status: true,
        date: true
      }
    });
    
    console.log('Corrugation Records:');
    console.log(JSON.stringify(corrugation, null, 2));
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkCorrugationData();
