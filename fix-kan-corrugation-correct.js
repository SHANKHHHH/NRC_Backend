const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function fixKanCorrugationCorrect() {
  try {
    console.log('🔧 Fixing the correct Corrugation record for KAN-0 SIZE PAPER BAG...');

    // 1. Log in to get a token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'corrugationtesting@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Update the correct in_progress Corrugation record (ID 12) to accept
    console.log('\n2. Updating the correct Corrugation record (ID 12) to accept status...');
    const updateResponse = await axios.put(`${BASE_URL}/corrugation/12`, {
      status: 'accept',
      date: new Date().toISOString(),
      quantity: 10,
      oprName: 'System Fix',
      remarks: 'Fixed by system - step was stuck in in_progress'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Corrugation record updated:', JSON.stringify(updateResponse.data, null, 2));

    // 3. Verify the fix
    console.log('\n3. Verifying the fix...');
    const verifyResponse = await axios.get(`${BASE_URL}/corrugation/by-job/KAN-0 SIZE PAPER BAG`, {
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

fixKanCorrugationCorrect();
