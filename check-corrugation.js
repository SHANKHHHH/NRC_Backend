const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function checkCorrugation() {
  try {
    console.log('🔍 Checking Corrugation records for VIP- EXPRESSION CSD INNER...');

    // 1. Log in to get a token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Check Corrugation records
    console.log('\n2. Checking Corrugation records...');
    const corrugationResponse = await axios.get(`${BASE_URL}/corrugation/by-job/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Corrugation Records:', JSON.stringify(corrugationResponse.data, null, 2));

    // 3. Check job planning steps
    console.log('\n3. Checking job planning steps...');
    const planningResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Job Planning Steps:');
    if (planningResponse.data.steps) {
      planningResponse.data.steps.forEach(step => {
        console.log(`  - ${step.stepName}: ${step.status} (Step No: ${step.stepNo})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkCorrugation();
