const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testJobPlanning() {
  try {
    console.log('🧪 Testing Job Planning Endpoint...\n');

    // 1. Login with allroles@ex.com
    console.log('1. Logging in with allroles@ex.com...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Test job planning endpoint
    console.log('\n2. Testing job planning endpoint...');
    try {
      const planningResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('✅ Job planning response:', JSON.stringify(planningResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Job planning failed:', error.response?.data || error.message);
    }

    // 3. Test all job plannings endpoint
    console.log('\n3. Testing all job plannings endpoint...');
    try {
      const allPlanningResponse = await axios.get(`${BASE_URL}/job-planning/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('✅ All job plannings response:', JSON.stringify(allPlanningResponse.data, null, 2));
    } catch (error) {
      console.log('❌ All job plannings failed:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testJobPlanning();
