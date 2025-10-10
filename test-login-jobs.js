const http = require('http');

async function testLoginAndJobs() {
  try {
    console.log('Testing login with paperstore@gmail.com...');
    
    // Login
    const loginData = JSON.stringify({
      email: 'paperstore@gmail.com',
      password: '1234567'
    });

    const loginResponse = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    }, loginData);

    console.log('Login response:', JSON.stringify(loginResponse, null, 2));

    if (loginResponse.success && loginResponse.acessToken) {
      const token = loginResponse.acessToken;
      console.log('\n✅ Login successful!');
      console.log('Token (first 20 chars):', token.substring(0, 20) + '...');

      // Get jobs
      console.log('\nFetching jobs...');
      const jobsResponse = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/jobs',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('\nJobs API response:');
      console.log('Success:', jobsResponse.success);
      console.log('Count:', jobsResponse.count);
      
      if (jobsResponse.data && jobsResponse.data.length > 0) {
        console.log('\nJobs found:');
        jobsResponse.data.forEach((job, index) => {
          console.log(`${index + 1}. Job ID: ${job.jobPlanId}, Job No: ${job.nrcJobNo}, Steps: ${job.steps ? job.steps.length : 0}`);
        });

        // Check for job 138
        const job138 = jobsResponse.data.find(j => j.jobPlanId === 138);
        if (job138) {
          console.log('\n✅ Job 138 (MULTI-MACHINE-TEST-001) is visible to this user');
        } else {
          console.log('\n❌ Job 138 (MULTI-MACHINE-TEST-001) is NOT visible to this user');
        }
      } else {
        console.log('\nNo jobs returned');
      }

    } else {
      console.log('❌ Login failed or no token received');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          resolve({ error: 'Invalid JSON', raw: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

testLoginAndJobs();
