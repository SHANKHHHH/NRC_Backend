const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function checkSteps() {
  try {
    console.log('🔍 Checking job steps...\n');

    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });
    
    const token = loginResponse.data.acessToken;
    console.log('✅ Login successful');

    const response = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\nSteps:');
    response.data.data.steps.forEach(step => {
      console.log(`  Step ${step.stepNo}: ${step.stepName} - ${step.status}`);
    });

  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkSteps();
