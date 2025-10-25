const axios = require('axios');

async function testAPI() {
  try {
    // First, let's try to login
    console.log('Testing login...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'f@ex.com',
      password: '1234567',
      forceLogin: true
    });
    
    console.log('Login response:', loginResponse.data);
    const token = loginResponse.data.acessToken;
    
    // Now let's test the job planning endpoint - first get all job plannings
    console.log('\nTesting job planning endpoint - getting all job plannings...');
    const allJobPlanningsResponse = await axios.get('http://localhost:3000/api/job-planning/', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('All job plannings response:', JSON.stringify(allJobPlanningsResponse.data, null, 2));
    
    // Now test with a specific job number
    console.log('\nTesting specific job planning endpoint...');
    const jobPlanningResponse = await axios.get('http://localhost:3000/api/job-planning/PAG-PKBB-US52-0210-N5', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Specific job planning response:', JSON.stringify(jobPlanningResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAPI();
