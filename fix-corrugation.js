const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function fixCorrugation() {
  try {
    console.log('🔧 Fixing Corrugation step for VIP- EXPRESSION CSD INNER...');

    // 1. Log in to get a token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Update the in_progress Corrugation record to accept
    console.log('\n2. Updating Corrugation record to accept status...');
    const updateResponse = await axios.put(`${BASE_URL}/corrugation/VIP- EXPRESSION CSD INNER`, {
      status: 'accept',
      date: new Date().toISOString(),
      quantity: 500,
      oprName: 'System Fix',
      remarks: 'Fixed by system - step was stuck in in_progress'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Corrugation record updated:', JSON.stringify(updateResponse.data, null, 2));

    // 3. Update the job planning step to stop
    console.log('\n3. Updating job planning step to stop...');
    const stepResponse = await axios.put(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER/steps/3`, {
      status: 'stop',
      endDate: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Job planning step updated:', JSON.stringify(stepResponse.data, null, 2));

    // 4. Verify the fix
    console.log('\n4. Verifying the fix...');
    const verifyResponse = await axios.get(`${BASE_URL}/corrugation/by-job/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Final Corrugation Records:');
    verifyResponse.data.data.forEach(record => {
      console.log(`  - ID ${record.id}: ${record.status} (jobStepId: ${record.jobStepId})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

fixCorrugation();
