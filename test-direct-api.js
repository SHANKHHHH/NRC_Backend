const axios = require('axios');

async function testDirectAPI() {
  try {
    // First, login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@test.com',
      password: 'admin123'
    });
    
    const loginData = loginResponse.data;
    console.log('Login response:', loginData);
    
    if (!loginData.acessToken) {
      console.error('No access token received');
      return;
    }
    
    const token = loginData.acessToken;
    
    // Now test job planning creation
    const planningData = {
      nrcJobNo: "TEST-DIRECT-123",
      jobDemand: "medium",
      steps: [
        {
          stepNo: 1,
          stepName: "PaperStore",
          machineDetails: []
        },
        {
          stepNo: 2,
          stepName: "Printing",
          machineDetails: [
            {
              machineId: "direct-machine-1",
              unit: "Mk1",
              machineCode: "PRINT-001",
              machineType: "Printing"
            },
            {
              machineId: "direct-machine-2",
              unit: "Mk2",
              machineCode: "PRINT-002",
              machineType: "Printing"
            }
          ]
        }
      ]
    };
    
    console.log('Sending planning data:', JSON.stringify(planningData, null, 2));
    
    const response = await axios.post('http://localhost:3000/api/job-planning', planningData, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const result = response.data;
    console.log('Response:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testDirectAPI();
