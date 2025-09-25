const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testPaperStoreFilteringFinal() {
  try {
    console.log('🧪 Testing Paper Store filtering with actual paperstore user...');
    
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
    
    // 2. Test the jobs endpoint
    console.log('\n2. Testing jobs endpoint...');
    try {
      const jobsResponse = await axios.get(`${BASE_URL}/jobs/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (jobsResponse.data.success) {
        const jobs = jobsResponse.data.data;
        console.log(`✅ Jobs endpoint returned ${jobs.length} jobs`);
        
        if (jobs.length > 10) {
          console.log('❌ PROBLEM: Too many jobs returned! This suggests filtering is not working');
          console.log('First 10 jobs:');
          jobs.slice(0, 10).forEach((job, index) => {
            console.log(`  ${index + 1}. ${job.nrcJobNo} - ${job.jobName || 'No name'}`);
          });
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
    
    // 3. Test job plannings endpoint
    console.log('\n3. Testing job plannings endpoint...');
    try {
      const planningResponse = await axios.get(`${BASE_URL}/job-planning/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (planningResponse.data.success) {
        const plannings = planningResponse.data.data;
        console.log(`✅ Job plannings endpoint returned ${plannings.length} job plannings`);
        
        plannings.forEach((planning, index) => {
          console.log(`  ${index + 1}. ${planning.nrcJobNo} - Plan ID: ${planning.jobPlanId}`);
          console.log(`     Steps: ${planning.steps.map(s => s.stepName).join(', ')}`);
        });
      } else {
        console.log('❌ Job plannings endpoint failed:', planningResponse.data);
      }
    } catch (error) {
      console.log('❌ Error getting job plannings:', error.response?.data || error.message);
    }
    
    // 4. Check if there are any jobs with PaperStore steps
    console.log('\n4. Checking for jobs with PaperStore steps...');
    try {
      const planningResponse = await axios.get(`${BASE_URL}/job-planning/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (planningResponse.data.success) {
        const plannings = planningResponse.data.data;
        const jobsWithPaperStore = plannings.filter(planning => 
          planning.steps.some(step => step.stepName === 'PaperStore')
        );
        
        console.log(`✅ Found ${jobsWithPaperStore.length} jobs with PaperStore steps:`);
        jobsWithPaperStore.forEach((planning, index) => {
          console.log(`  ${index + 1}. ${planning.nrcJobNo}`);
        });
      }
    } catch (error) {
      console.log('❌ Error checking PaperStore steps:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testPaperStoreFilteringFinal();
