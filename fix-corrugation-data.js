const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndFixCorrugationData() {
  try {
    const jobNo = 'PAG-PKBB-PB02-0105';
    
    // Check JobStep status
    const jobStep = await prisma.jobStep.findFirst({
      where: { 
        jobPlanning: {
          nrcJobNo: jobNo
        },
        stepName: 'Corrugation'
      },
      select: {
        id: true,
        stepName: true,
        status: true,
        startDate: true,
        endDate: true
      }
    });
    
    console.log('JobStep Status:');
    console.log(JSON.stringify(jobStep, null, 2));
    
    // Check Corrugation individual step
    const corrugation = await prisma.corrugation.findFirst({
      where: { jobNrcJobNo: jobNo },
      select: {
        id: true,
        status: true,
        gsm1: true,
        gsm2: true,
        flute: true,
        quantity: true,
        size: true
      }
    });
    
    console.log('Corrugation Individual Step:');
    console.log(JSON.stringify(corrugation, null, 2));
    
    // Check Job data for correct values
    const job = await prisma.job.findFirst({
      where: { nrcJobNo: jobNo },
      select: {
        nrcJobNo: true,
        topFaceGSM: true,
        bottomLinerGSM: true,
        fluteType: true
      }
    });
    
    console.log('Job Data:');
    console.log(JSON.stringify(job, null, 2));
    
    // Fix the Corrugation data if needed
    if (corrugation && (corrugation.gsm1 === null || corrugation.gsm2 === null)) {
      console.log('\n🔧 Fixing Corrugation data...');
      
      const updateData = {
        gsm1: job?.topFaceGSM || '240',
        gsm2: job?.bottomLinerGSM || '120',
        flute: job?.fluteType || '3PLY',
        status: 'accept' // Set to accept since the step is completed
      };
      
      const updated = await prisma.corrugation.update({
        where: { id: corrugation.id },
        data: updateData
      });
      
      console.log('✅ Updated Corrugation data:');
      console.log(JSON.stringify(updated, null, 2));
    } else if (!corrugation) {
      console.log('\n🔧 Creating new Corrugation record...');
      
      // Get the JobStep ID
      const jobStepId = jobStep?.id;
      if (!jobStepId) {
        console.log('❌ JobStep not found, cannot create Corrugation record');
        return;
      }
      
      const newCorrugation = await prisma.corrugation.create({
        data: {
          jobNrcJobNo: jobNo,
          jobStepId: jobStepId,
          gsm1: job?.topFaceGSM || '240',
          gsm2: job?.bottomLinerGSM || '120',
          flute: job?.fluteType || '3PLY',
          status: 'accept',
          date: new Date()
        }
      });
      
      console.log('✅ Created new Corrugation record:');
      console.log(JSON.stringify(newCorrugation, null, 2));
    } else {
      console.log('✅ Corrugation data is already correct');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkAndFixCorrugationData();
