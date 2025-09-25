const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function fixKanJobCompletely() {
  try {
    console.log('🔧 Completely fixing KAN-0 SIZE PAPER BAG job...');

    // 1. Log in to get a token
    console.log('\n1. Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'corrugationtesting@ex.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken;
    console.log('✅ Login successful');

    // 2. Check current job planning
    console.log('\n2. Checking current job planning...');
    try {
      const planningResponse = await axios.get(`${BASE_URL}/job-planning/KAN-0 SIZE PAPER BAG`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Current planning:', JSON.stringify(planningResponse.data, null, 2));
    } catch (error) {
      console.log('❌ Error getting planning:', error.response?.data || error.message);
    }

    // 3. Check all jobs to see if KAN job exists
    console.log('\n3. Checking all jobs...');
    try {
      const jobsResponse = await axios.get(`${BASE_URL}/jobs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('All jobs:');
      jobsResponse.data.forEach(job => {
        console.log(`  - ${job.nrcJobNo}: ${job.status}`);
      });
    } catch (error) {
      console.log('❌ Error getting jobs:', error.response?.data || error.message);
    }

    // 4. Check job plannings
    console.log('\n4. Checking all job plannings...');
    try {
      const planningsResponse = await axios.get(`${BASE_URL}/job-planning/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('All job plannings:');
      planningsResponse.data.forEach(planning => {
        console.log(`  - ${planning.nrcJobNo}: ${planning.steps?.length || 0} steps`);
      });
    } catch (error) {
      console.log('❌ Error getting plannings:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

fixKanJobCompletely();
