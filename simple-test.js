const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function makeRequest(method, url, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

async function testWithExistingAdmin() {
  console.log('🚀 Testing Machine Access Control with Existing Admin\n');
  
  // Use your existing admin credentials
  const adminCredentials = {
    email: 'info@nrcontainers.com',
    password: 'adminpassword'
  };
  
  try {
    // Step 1: Login as admin
    console.log('🔐 Step 1: Logging in as admin...');
    const adminLoginResponse = await makeRequest('POST', '/auth/login', adminCredentials);
    
    if (!adminLoginResponse.success) {
      console.log('❌ Failed to login as admin:', adminLoginResponse.error);
      return;
    }
    
    const adminToken = adminLoginResponse.data.token || adminLoginResponse.data.accessToken;
    console.log('✅ Admin login successful');
    console.log('');

    // Step 2: Get machines
    console.log('📋 Step 2: Getting machines...');
    const machinesResponse = await makeRequest('GET', '/machines', null, adminToken);
    
    if (!machinesResponse.success) {
      console.log('❌ Failed to get machines:', machinesResponse.error);
      return;
    }
    
    const machines = machinesResponse.data.data;
    console.log(`✅ Found ${machines.length} machines`);
    console.log('Machine details:', machines.slice(0, 3).map(m => ({
      id: m.id,
      code: m.machineCode,
      type: m.machineType,
      description: m.description
    })));
    console.log('');

    // Step 3: Create test users with machine assignments
    console.log('👤 Step 3: Creating test users...');
    
    // Create corrugator 1 assigned to first machine
    const corrugator1Response = await makeRequest('POST', '/auth/add-member', {
      email: 'corrugator1@test.com',
      password: 'password123',
      role: 'corrugator',
      firstName: 'John',
      lastName: 'Corrugator',
      machineIds: [machines[0].id]
    }, adminToken);
    
    if (corrugator1Response.success) {
      console.log('✅ Corrugator 1 created and assigned to machine 1');
    } else {
      console.log('❌ Failed to create corrugator 1:', corrugator1Response.error);
    }
    
    // Create corrugator 2 assigned to second machine
    const corrugator2Response = await makeRequest('POST', '/auth/add-member', {
      email: 'corrugator2@test.com',
      password: 'password123',
      role: 'corrugator',
      firstName: 'Jane',
      lastName: 'Corrugator',
      machineIds: [machines[1].id]
    }, adminToken);
    
    if (corrugator2Response.success) {
      console.log('✅ Corrugator 2 created and assigned to machine 2');
    } else {
      console.log('❌ Failed to create corrugator 2:', corrugator2Response.error);
    }
    console.log('');

    // Step 4: Create planner user
    console.log('👤 Step 4: Creating planner user...');
    const plannerResponse = await makeRequest('POST', '/auth/add-member', {
      email: 'planner@test.com',
      password: 'password123',
      role: 'planner',
      firstName: 'Planner',
      lastName: 'User'
    }, adminToken);
    
    if (plannerResponse.success) {
      console.log('✅ Planner user created');
    } else {
      console.log('❌ Failed to create planner:', plannerResponse.error);
    }
    console.log('');

    // Step 5: Login as planner and create jobs
    console.log('🔐 Step 5: Logging in as planner...');
    const plannerLoginResponse = await makeRequest('POST', '/auth/login', {
      email: 'planner@test.com',
      password: 'password123'
    });
    
    if (!plannerLoginResponse.success) {
      console.log('❌ Failed to login as planner:', plannerLoginResponse.error);
      return;
    }
    
    const plannerToken = plannerLoginResponse.data.token || plannerLoginResponse.data.accessToken;
    console.log('✅ Planner login successful');
    console.log('');

    // Step 6: Create jobs with machine assignments
    console.log('📋 Step 6: Creating jobs with machine assignments...');
    
    // Job 1 assigned to machine 1
    const job1Response = await makeRequest('POST', '/jobs', {
      styleItemSKU: 'SKU001',
      customerName: 'Customer A',
      machineId: machines[0].id
    }, plannerToken);
    
    if (job1Response.success) {
      console.log('✅ Job 1 created and assigned to machine 1');
      console.log('Job details:', {
        nrcJobNo: job1Response.data.data.nrcJobNo,
        customer: job1Response.data.data.customerName,
        machineId: job1Response.data.data.assignedMachine
      });
    } else {
      console.log('❌ Failed to create job 1:', job1Response.error);
    }
    
    // Job 2 assigned to machine 2
    const job2Response = await makeRequest('POST', '/jobs', {
      styleItemSKU: 'SKU002',
      customerName: 'Customer B',
      machineId: machines[1].id
    }, plannerToken);
    
    if (job2Response.success) {
      console.log('✅ Job 2 created and assigned to machine 2');
      console.log('Job details:', {
        nrcJobNo: job2Response.data.data.nrcJobNo,
        customer: job2Response.data.data.customerName,
        machineId: job2Response.data.data.assignedMachine
      });
    } else {
      console.log('❌ Failed to create job 2:', job2Response.error);
    }
    console.log('');

    // Step 7: Test corrugator 1 access
    console.log('🔐 Step 7: Testing corrugator 1 access...');
    const corrugator1LoginResponse = await makeRequest('POST', '/auth/login', {
      email: 'corrugator1@test.com',
      password: 'password123'
    });
    
    if (corrugator1LoginResponse.success) {
      const corrugator1Token = corrugator1LoginResponse.data.token || corrugator1LoginResponse.data.accessToken;
      console.log('✅ Corrugator 1 login successful');
      
      // Test jobs access
      const jobsResponse = await makeRequest('GET', '/jobs', null, corrugator1Token);
      if (jobsResponse.success) {
        console.log(`📋 Corrugator 1 sees ${jobsResponse.data.count} jobs`);
        console.log('Jobs:', jobsResponse.data.data.map(j => ({
          nrcJobNo: j.nrcJobNo,
          customer: j.customerName,
          machineId: j.machineId
        })));
      }
    } else {
      console.log('❌ Failed to login as corrugator 1:', corrugator1LoginResponse.error);
    }
    console.log('');

    // Step 8: Test corrugator 2 access
    console.log('🔐 Step 8: Testing corrugator 2 access...');
    const corrugator2LoginResponse = await makeRequest('POST', '/auth/login', {
      email: 'corrugator2@test.com',
      password: 'password123'
    });
    
    if (corrugator2LoginResponse.success) {
      const corrugator2Token = corrugator2LoginResponse.data.token || corrugator2LoginResponse.data.accessToken;
      console.log('✅ Corrugator 2 login successful');
      
      // Test jobs access
      const jobsResponse = await makeRequest('GET', '/jobs', null, corrugator2Token);
      if (jobsResponse.success) {
        console.log(`📋 Corrugator 2 sees ${jobsResponse.data.count} jobs`);
        console.log('Jobs:', jobsResponse.data.data.map(j => ({
          nrcJobNo: j.nrcJobNo,
          customer: j.customerName,
          machineId: j.machineId
        })));
      }
    } else {
      console.log('❌ Failed to login as corrugator 2:', corrugator2LoginResponse.error);
    }
    console.log('');

    console.log('🎉 Test completed!');
    console.log('\n📊 Expected Results:');
    console.log('- Corrugator 1 should only see jobs assigned to machine 1');
    console.log('- Corrugator 2 should only see jobs assigned to machine 2');
    console.log('- Admin should see all jobs');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testWithExistingAdmin();
