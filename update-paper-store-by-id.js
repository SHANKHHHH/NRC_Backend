const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function updatePaperStoreById() {
  try {
    console.log('🔄 Updating Paper Store step by ID...\n');

    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'allroles@ex.com',
      password: '1234567'
    });
    
    const token = loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // First, get the job planning to find the Paper Store step ID
    const planningResponse = await axios.get(`${BASE_URL}/job-planning/VIP- EXPRESSION CSD INNER`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const paperStoreStep = planningResponse.data.data.steps.find(step => step.stepName === 'PaperStore');
    console.log('Paper Store step ID:', paperStoreStep.id);

    // Update Paper Store step by ID using the job step update endpoint
    console.log('\n2. Updating Paper Store step by ID...');
    const updateResponse = await axios.put(`${BASE_URL}/job-planning/step/${paperStoreStep.id}`, {
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

updatePaperStoreById();
