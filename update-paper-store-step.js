const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function updatePaperStoreStep() {
  try {
    console.log('🔄 Updating Paper Store step status...\n');

    // 1. Login
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });
    
    const token = loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Update Paper Store step to stop
    console.log('\n2. Updating Paper Store step to stop...');
    const updateResponse = await axios.put(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER/steps/1`, {
      status: 'stop',
      endDate: new Date().toISOString()
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Paper Store step updated:', updateResponse.data);

    // 3. Verify the update
    console.log('\n3. Verifying the update...');
    const verifyResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const paperStoreStep = verifyResponse.data.data.steps.find(step => step.stepName === 'PaperStore');
    console.log('Paper Store step status:', paperStoreStep ? paperStoreStep.status : 'Not found');

  } catch (error) {
    console.error('❌ Update failed:', error.response?.data || error.message);
  }
}

updatePaperStoreStep();
