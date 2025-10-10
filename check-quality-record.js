const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkQualityRecord() {
  try {
    console.log('Checking for existing QualityDept records...');
    
    // Find the job step for Quality (step 7) of the specific job
    const jobStep = await prisma.jobStep.findFirst({
      where: {
        stepNo: 7,
        stepName: 'QualityDept',
        jobPlanning: {
          nrcJobNo: 'BAT-1-2 BG (48 PRS) (31059)'
        }
      },
      include: {
        qualityDept: true
      }
    });
    
    if (jobStep) {
      console.log('Found JobStep:', {
        id: jobStep.id,
        stepNo: jobStep.stepNo,
        stepName: jobStep.stepName,
        status: jobStep.status,
        hasQualityDept: !!jobStep.qualityDept,
        qualityDeptId: jobStep.qualityDept?.id
      });
      
      if (jobStep.qualityDept) {
        console.log('QualityDept record exists:', jobStep.qualityDept);
      }
    } else {
      console.log('No QualityDept job step found for this job');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkQualityRecord();
