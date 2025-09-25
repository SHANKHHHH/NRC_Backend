const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function checkKanPlanningSteps() {
  try {
    console.log('🔍 Checking job planning steps for KAN-0 SIZE PAPER BAG...');

    // 1. Log in to get a token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'corrugationtesting@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Check job planning steps
    console.log('\n2. Checking job planning steps...');
    const planningResponse = await axios.get(`${BASE_URL}/job-planning/KAN-0 SIZE PAPER BAG`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Job Planning Steps:');
    console.log('Full response:', JSON.stringify(planningResponse.data, null, 2));
    
    if (planningResponse.data.data && planningResponse.data.data.steps) {
      planningResponse.data.data.steps.forEach(step => {
        console.log(`  - ${step.stepName}: ${step.status} (Step No: ${step.stepNo}, ID: ${step.id})`);
        console.log(`    Start Date: ${step.startDate}`);
        console.log(`    End Date: ${step.endDate}`);
        console.log(`    User: ${step.user}`);
        console.log('    ---');
      });
    } else {
      console.log('No steps found or unexpected response structure');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkKanPlanningSteps();
