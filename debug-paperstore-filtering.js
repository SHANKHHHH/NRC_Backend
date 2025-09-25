const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function debugPaperStoreFiltering() {
  try {
    console.log('🔍 Debugging Paper Store user filtering...');
    
    // 1. Log in as Paper Store user
    console.log('\n1. Logging in as Paper Store user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'paperstore@ex.com', // Assuming this is the Paper Store user
      password: '1234567'
    });
    
    if (!loginResponse.data.success) {
      console.log('❌ Paper Store user not found, trying with different email...');
      
      // Try with a different email that might have paperstore role
      const altLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'allroles@ex.com',
        password: '1234567'
      });
      
      if (altLoginResponse.data.success) {
        const user = altLoginResponse.data.data;
        console.log('✅ Logged in with user:', user.email);
        console.log('✅ User roles:', user.roles);
        
        if (user.roles && user.roles.includes('paperstore')) {
          console.log('✅ User has paperstore role');
          var token = altLoginResponse.data.accessToken || altLoginResponse.data.acessToken || altLoginResponse.data.data?.accessToken;
        } else {
          console.log('❌ User does not have paperstore role');
          return;
        }
      } else {
        console.log('❌ Could not find a user with paperstore role');
        return;
      }
    } else {
      var token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
      console.log('✅ Paper Store user login successful');
    }
    
    if (!token) {
      throw new Error('Failed to get access token');
    }
    
    // 2. Check user details
    console.log('\n2. Checking user details...');
    const userResponse = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (userResponse.data.success) {
      const user = userResponse.data.data;
      console.log('✅ User details:');
      console.log(`  - Email: ${user.email}`);
      console.log(`  - Roles: ${user.roles}`);
      console.log(`  - Name: ${user.name}`);
    }
    
    // 3. Check jobs endpoint
    console.log('\n3. Checking jobs endpoint...');
    try {
      const jobsResponse = await axios.get(`${BASE_URL}/jobs/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (jobsResponse.data.success) {
        console.log(`✅ Jobs endpoint returned ${jobsResponse.data.data.length} jobs`);
        console.log('First 5 jobs:');
        jobsResponse.data.data.slice(0, 5).forEach((job, index) => {
          console.log(`  ${index + 1}. ${job.nrcJobNo} - ${job.jobName || 'No name'}`);
        });
      }
    } catch (error) {
      console.log('❌ Error getting jobs:', error.response?.data || error.message);
    }
    
    // 4. Check job plannings endpoint
    console.log('\n4. Checking job plannings endpoint...');
    try {
      const planningResponse = await axios.get(`${BASE_URL}/job-planning/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (planningResponse.data.success) {
        console.log(`✅ Job plannings endpoint returned ${planningResponse.data.data.length} job plannings`);
        console.log('Job plannings:');
        planningResponse.data.data.forEach((job, index) => {
          console.log(`  ${index + 1}. ${job.nrcJobNo} - Plan ID: ${job.jobPlanId}`);
        });
      }
    } catch (error) {
      console.log('❌ Error getting job plannings:', error.response?.data || error.message);
    }
    
    // 5. Check if there's role-based filtering in the backend
    console.log('\n5. Checking backend filtering logic...');
    console.log('Looking for role-based filtering in job endpoints...');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.response?.data || error.message);
  }
}

debugPaperStoreFiltering();
