const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testServerDebug() {
  try {
    console.log('🔍 Testing server debug output...');
    
    // 1. Log in with paperstore user
    console.log('\n1. Logging in with paperstore user...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'paperstore@gmail.com',
      password: '1234567'
    });
    
    if (!loginResponse.data.success) {
      console.log('❌ Login failed:', loginResponse.data);
      return;
    }
    
    const token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
    if (!token) {
      throw new Error('Failed to get access token');
    }
    
    const user = loginResponse.data.data;
    console.log('✅ Login successful');
    console.log('✅ User details:');
    console.log(`  - Email: ${user.email}`);
    console.log(`  - Roles: ${user.roles}`);
    console.log(`  - Name: ${user.name}`);
    
    // 2. Test the jobs endpoint and check for debug output
    console.log('\n2. Testing jobs endpoint (check server console for debug output)...');
    console.log('   Look for debug messages starting with "🔍 [GET USER MACHINE IDS DEBUG]"');
    console.log('   and "🔍 [GET FILTERED JOB NUMBERS DEBUG]"');
    
    try {
      const jobsResponse = await axios.get(`${BASE_URL}/jobs/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (jobsResponse.data.success) {
        const jobs = jobsResponse.data.data;
        console.log(`✅ Jobs endpoint returned ${jobs.length} jobs`);
        
        if (jobs.length > 10) {
          console.log('❌ PROBLEM: Too many jobs returned! Filtering is not working');
          console.log('Expected: Only jobs with PaperStore steps (3 jobs)');
          console.log('Actual: All jobs in database');
        } else {
          console.log('✅ Good: Reasonable number of jobs returned');
          jobs.forEach((job, index) => {
            console.log(`  ${index + 1}. ${job.nrcJobNo} - ${job.jobName || 'No name'}`);
          });
        }
      } else {
        console.log('❌ Jobs endpoint failed:', jobsResponse.data);
      }
    } catch (error) {
      console.log('❌ Error getting jobs:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
  }
}

testServerDebug();
