const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const JOB_NRC_JOB_NO = 'KAN-0 SIZE PAPER BAG';

async function testFluteLamination() {
  try {
    console.log('🔍 Testing Flute Lamination step detection...');
    
    // 1. Log in
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'corrugationtesting@ex.com',
      password: '1234567'
    });
    const token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
    if (!token) {
      throw new Error('Failed to get access token');
    }
    console.log('✅ Login successful');
    
    // 2. Get job planning steps
    console.log('\n2. Getting job planning steps...');
    const planningResponse = await axios.get(`${BASE_URL}/job-planning/${JOB_NRC_JOB_NO}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const steps = planningResponse.data.data.steps;
    const fluteStep = steps.find(step => step.stepName === 'FluteLaminateBoardConversion');
    
    if (fluteStep) {
      console.log('✅ Found Flute Lamination step:');
      console.log(`  - Step No: ${fluteStep.stepNo}`);
      console.log(`  - Status: ${fluteStep.status}`);
      console.log(`  - Start Date: ${fluteStep.startDate}`);
      console.log(`  - User: ${fluteStep.user}`);
      
      if (fluteStep.status === 'start') {
        console.log('✅ Flute Lamination step is correctly marked as "start" in backend');
      } else {
        console.log('❌ Flute Lamination step status is not "start"');
      }
    } else {
      console.log('❌ Flute Lamination step not found');
    }
    
    // 3. Test step details endpoint
    console.log('\n3. Testing step details endpoint...');
    try {
      const stepDetailsResponse = await axios.get(`${BASE_URL}/job-planning/${JOB_NRC_JOB_NO}/steps/${fluteStep.stepNo}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('✅ Step details endpoint working');
      console.log('Step details:', JSON.stringify(stepDetailsResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Step details endpoint failed:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testFluteLamination();
