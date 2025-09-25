const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function updateCorrectPaperStore() {
  try {
    console.log('🔄 Updating correct Paper Store step...\n');

    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });
    
    const token = loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // Update Paper Store step (step 1) to stop
    console.log('\n2. Updating Paper Store step (step 1) to stop...');
    const updateResponse = await axios.put(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER/steps/1`, {
      status: 'stop',
      endDate: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Paper Store step updated:', updateResponse.data);

    // Verify the update
    console.log('\n3. Verifying the update...');
    const verifyResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('All steps after update:');
    verifyResponse.data.data.steps.forEach(step => {
      console.log(`  Step ${step.stepNo}: ${step.stepName} - ${step.status}`);
    });

  } catch (error) {
    console.error('❌ Update failed:', error.response?.data || error.message);
  }
}

updateCorrectPaperStore();
