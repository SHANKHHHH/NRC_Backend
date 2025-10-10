const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStatus() {
  try {
    const sfp = await prisma.sideFlapPasting.findFirst({
      where: { jobNrcJobNo: 'VIP-OUTER BOX FRENCHIE JR.BLAZE' }
    });
    
    console.log('SideFlapPasting status:', sfp?.status);
    console.log('Full record:', sfp);
    
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();
