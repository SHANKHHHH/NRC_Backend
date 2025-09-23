const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testStatusUpdateWithLogging() {
  console.log('🧪 Testing Status Update with Logging\n');

  try {
    // Find a planned step to test with
    const testStep = await prisma.jobStep.findFirst({
      where: {
        stepName: 'FluteLaminateBoardConversion',
        status: 'planned'
      },
      include: {
        jobPlanning: {
          select: { nrcJobNo: true, jobPlanId: true }
        }
      }
    });

    if (!testStep) {
      console.log('❌ No planned steps found to test with');
      return;
    }

    console.log(`Testing with step ${testStep.id}`);
    console.log(`Job: ${testStep.jobPlanning.nrcJobNo}`);
    console.log(`Planning: ${testStep.jobPlanning.jobPlanId}`);

    // Test the status update by calling the API endpoint
    const testUserId = 'NRC001';
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ik5SQzAwMSIsImlhdCI6MTc1ODU1MDk0NSwiZXhwIjoxNzYxMTQyOTQ1fQ.GVZ5WHazcjfjVeM-BTYf-3nTjGLVhL2oYJXJC_Qa2HQ';
    
    const apiUrl = `http://localhost:3000/api/job-planning/${testStep.jobPlanning.nrcJobNo}/${testStep.jobPlanning.jobPlanId}/steps/${testStep.id}`;
    
    console.log(`\nAPI URL: ${apiUrl}`);
    console.log('Testing status update to "start"...');
    
    try {
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'start'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ API call successful');
        console.log('Response:', JSON.stringify(result, null, 2));
        
        // Wait a moment for the activity log to be created
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if activity log was created
        console.log('\n=== CHECKING FOR NEW ACTIVITY LOG ===');
        const newLogs = await prisma.activityLog.findMany({
          where: {
            action: 'JobStep Updated',
            userId: testUserId,
            createdAt: {
              gte: new Date(Date.now() - 60000) // Last minute
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        });
        
        if (newLogs.length > 0) {
          console.log(`✅ Found ${newLogs.length} new activity logs:`);
          newLogs.forEach((log, index) => {
            console.log(`\n${index + 1}. Action: ${log.action}`);
            console.log(`   Details: ${log.details}`);
            console.log(`   User: ${log.userId}`);
            console.log(`   Job: ${log.nrcJobNo}`);
            console.log(`   Time: ${log.createdAt}`);
          });
        } else {
          console.log('❌ No new activity logs found');
        }
        
        // Revert the status back to planned
        console.log('\n=== REVERTING STATUS ===');
        const revertResponse = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${testToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'planned'
          })
        });
        
        if (revertResponse.ok) {
          console.log('✅ Status reverted to planned');
        } else {
          console.log('❌ Failed to revert status');
        }
        
      } else {
        const errorText = await response.text();
        console.log(`❌ API call failed: ${response.status} ${response.statusText}`);
        console.log('Error:', errorText);
      }
      
    } catch (error) {
      console.log(`❌ API call error: ${error.message}`);
      console.log('Make sure the server is running with: npm start');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStatusUpdateWithLogging();
