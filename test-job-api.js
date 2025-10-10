const http = require('http');

async function testJobAPI() {
  try {
    // First login to get token
    console.log('Logging in...');
    const loginData = JSON.stringify({
      email: 'admin@gmail.com',
      password: 'admin123'
    });

    const loginOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    };

    const loginResponse = await makeRequest(loginOptions, loginData);
    console.log('Login response:', loginResponse);

    if (loginResponse.success && loginResponse.data && loginResponse.data.accessToken) {
      const token = loginResponse.data.accessToken;
      console.log('✅ Login successful, token received');

      // Now test the job API
      console.log('\nFetching jobs...');
      const jobOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/jobs',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const jobResponse = await makeRequest(jobOptions);
      console.log('Job API response:');
      console.log(`Success: ${jobResponse.success}`);
      console.log(`Count: ${jobResponse.count}`);
      console.log(`Jobs found: ${jobResponse.data ? jobResponse.data.length : 0}`);
      
      if (jobResponse.data && jobResponse.data.length > 0) {
        console.log('\nJob details:');
        jobResponse.data.forEach((job, index) => {
          console.log(`${index + 1}. Job ID: ${job.jobPlanId}, Job No: ${job.nrcJobNo}, Steps: ${job.steps ? job.steps.length : 0}`);
        });
      }

      // Check specifically for job 138
      if (jobResponse.data) {
        const job138 = jobResponse.data.find(j => j.jobPlanId === 138);
        if (job138) {
          console.log('\n✅ Job 138 found in API response');
        } else {
          console.log('\n❌ Job 138 NOT found in API response');
        }
      }

    } else {
      console.log('❌ Login failed');
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

testJobAPI();
