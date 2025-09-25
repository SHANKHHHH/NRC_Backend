const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testPaperStoreSync() {
  try {
    console.log('🧪 Testing Paper Store Database Sync...\n');

    // 1. Login with allroles@ex.com
    console.log('1. Logging in with allroles@ex.com...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });

    console.log('Login response:', JSON.stringify(loginResponse.data, null, 2));
    const token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
    console.log('✅ Login successful, token:', token);

    // 2. Check Paper Store status for VIP- EXPRESSION CSD INNER
    console.log('\n2. Checking Paper Store status...');
    const paperStoreResponse = await axios.get(`${BASE_URL}/paper-store/by-job/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Paper Store Status:', paperStoreResponse.data);

    // 3. Check job planning step status
    console.log('\n3. Checking job planning step status...');
    const planningResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Job Planning Steps:');
    let paperStoreStepNo = null;
    if (planningResponse.data.steps) {
      planningResponse.data.steps.forEach(step => {
        console.log(`  - ${step.stepName}: ${step.status} (Step No: ${step.stepNo})`);
        if (step.stepName === 'PaperStore') {
          paperStoreStepNo = step.stepNo;
        }
      });
    }

    // 4. Update job planning step to stop (Paper Store is already completed)
    console.log('\n4. Updating job planning step to stop...');
    if (paperStoreStepNo) {
      try {
        const updateResponse = await axios.put(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER/steps/${paperStoreStepNo}`, {
          status: 'stop',
          endDate: new Date().toISOString()
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Job planning step updated:', updateResponse.data);
      } catch (error) {
        console.log('❌ Job planning step update failed:', error.response?.data || error.message);
      }
    } else {
      console.log('❌ Paper Store step not found in job planning');
    }

    // 5. Verify final status
    console.log('\n5. Verifying final status...');
    const finalPaperStoreResponse = await axios.get(`${BASE_URL}/paper-store/by-job/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Final Paper Store Status:', finalPaperStoreResponse.data);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testPaperStoreSync();
