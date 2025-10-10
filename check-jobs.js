const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkJobs() {
  try {
    console.log('Checking all jobs in database...');
    
    const jobs = await prisma.jobPlanning.findMany({
      include: {
        steps: true
      },
      orderBy: {
        jobPlanId: 'desc'
      }
    });

    console.log(`\nTotal jobs found: ${jobs.length}`);
    console.log('\nJob details:');
    jobs.forEach(job => {
      console.log(`- Job ID: ${job.jobPlanId}, Job No: ${job.nrcJobNo}, Steps: ${job.steps.length}, Demand: ${job.jobDemand}`);
    });

    // Check if job 138 exists
    const job138 = jobs.find(j => j.jobPlanId === 138);
    if (job138) {
      console.log('\n✅ Job 138 found in database');
      console.log(`Job No: ${job138.nrcJobNo}`);
      console.log(`Steps: ${job138.steps.length}`);
    } else {
      console.log('\n❌ Job 138 NOT found in database');
    }

  } catch (error) {
    console.error('Error checking jobs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJobs();
