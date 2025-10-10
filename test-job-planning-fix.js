const fetch = require('node-fetch');

async function testJobPlanningCreation() {
  try {
    // First login to get token
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@gmail.com',
        password: 'admin123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (!loginData.success) {
      console.log('Login failed');
      return;
    }
    
    const token = loginData.acessToken;
    
    // Test job planning creation
    const planningData = {
      nrcJobNo: 'TEST-JOB-001',
      jobDemand: 'medium',
      steps: [
        {
          stepNo: 1,
          stepName: 'PaperStore',
          machineDetails: []
        },
        {
          stepNo: 2,
          stepName: 'Printing',
          machineDetails: [
            {
              machineId: 'test-machine-1',
              unit: 'Mk',
              machineCode: 'PRINT-001',
              machineType: 'Printing'
            }
          ]
        }
      ]
    };
    
    const planningResponse = await fetch('http://localhost:3000/api/job-plannings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(planningData)
    });
    
    const planningResult = await planningResponse.json();
    console.log('Job planning creation response:', planningResult);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testJobPlanningCreation();
