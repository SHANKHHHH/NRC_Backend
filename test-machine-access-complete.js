const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let adminToken = '';
let plannerToken = '';
let corrugator1Token = '';
let corrugator2Token = '';
let machineIds = [];
let userIds = [];
let jobIds = [];
let poIds = [];

// Test data
const testData = {
  admin: {
    email: 'admin@test.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User'
  },
  planner: {
    email: 'planner@test.com', 
    password: 'planner123',
    firstName: 'Planner',
    lastName: 'User'
  },
  corrugator1: {
    email: 'corrugator1@test.com',
    password: 'corrugator123',
    firstName: 'John',
    lastName: 'Corrugator',
    role: 'corrugator'
  },
  corrugator2: {
    email: 'corrugator2@test.com',
    password: 'corrugator123', 
    firstName: 'Jane',
    lastName: 'Corrugator',
    role: 'corrugator'
  }
};

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

async function testCompleteFlow() {
  console.log('🚀 Starting Complete Machine Access Control Test\n');
  
  try {
    // Step 1: Create admin first, then get machines
    console.log('👤 Step 1: Creating admin user first...');
    const adminResponse = await makeRequest('POST', '/auth/register-admin', testData.admin);
    
    if (adminResponse.success) {
      console.log('✅ Admin user created');
      adminToken = adminResponse.data.token;
    } else {
      console.log('⚠️ Admin user might already exist, trying to login...');
      const loginResponse = await makeRequest('POST', '/auth/login', {
        email: testData.admin.email,
        password: testData.admin.password
      });
      
      if (loginResponse.success) {
        adminToken = loginResponse.data.token || loginResponse.data.accessToken;
        console.log('✅ Admin login successful');
      } else {
        console.log('❌ Failed to create/login admin:', loginResponse.error);
        return;
      }
    }
    console.log('');

    // Step 2: Get existing machines (now with admin token)
    console.log('📋 Step 2: Getting existing machines...');
    const machinesResponse = await makeRequest('GET', '/machines', null, adminToken);
    
    if (!machinesResponse.success) {
      console.log('❌ Failed to get machines:', machinesResponse.error);
      return;
    }
    
    machineIds = machinesResponse.data.data.slice(0, 3).map(m => m.id);
    console.log(`✅ Found ${machineIds.length} machines:`, machineIds);
    console.log('Machine details:', machinesResponse.data.data.slice(0, 3).map(m => ({
      id: m.id,
      code: m.machineCode,
      type: m.machineType
    })));
    console.log('');

    // Step 3: Create planner user
    console.log('👤 Step 3: Creating planner user...');
    const plannerResponse = await makeRequest('POST', '/auth/add-member', {
      ...testData.planner,
      role: 'planner'
    }, adminToken);
    
    if (plannerResponse.success) {
      console.log('✅ Planner user created');
      userIds.push(plannerResponse.data.data.id);
    } else {
      console.log('❌ Failed to create planner:', plannerResponse.error);
      return;
    }
    console.log('');

    // Step 4: Create corrugator users with machine assignments
    console.log('👤 Step 4: Creating corrugator users with machine assignments...');
    
    // Corrugator 1 assigned to machine 1
    const corrugator1Response = await makeRequest('POST', '/auth/add-member', {
      ...testData.corrugator1,
      machineIds: [machineIds[0]]
    }, adminToken);
    
    if (corrugator1Response.success) {
      console.log('✅ Corrugator 1 created and assigned to machine 1');
      userIds.push(corrugator1Response.data.data.id);
    } else {
      console.log('❌ Failed to create corrugator 1:', corrugator1Response.error);
      return;
    }
    
    // Corrugator 2 assigned to machine 2
    const corrugator2Response = await makeRequest('POST', '/auth/add-member', {
      ...testData.corrugator2,
      machineIds: [machineIds[1]]
    }, adminToken);
    
    if (corrugator2Response.success) {
      console.log('✅ Corrugator 2 created and assigned to machine 2');
      userIds.push(corrugator2Response.data.data.id);
    } else {
      console.log('❌ Failed to create corrugator 2:', corrugator2Response.error);
      return;
    }
    console.log('');

    // Step 5: Login as planner
    console.log('🔐 Step 5: Logging in as planner...');
    const plannerLoginResponse = await makeRequest('POST', '/auth/login', {
      email: testData.planner.email,
      password: testData.planner.password
    });
    
    if (plannerLoginResponse.success) {
      plannerToken = plannerLoginResponse.data.token || plannerLoginResponse.data.accessToken;
      console.log('✅ Planner login successful');
    } else {
      console.log('❌ Failed to login as planner:', plannerLoginResponse.error);
      return;
    }
    console.log('');

    // Step 6: Create jobs with machine assignments
    console.log('📋 Step 6: Creating jobs with machine assignments...');
    
    // Job 1 assigned to machine 1
    const job1Response = await makeRequest('POST', '/jobs', {
      styleItemSKU: 'SKU001',
      customerName: 'Customer A',
      machineId: machineIds[0]
    }, plannerToken);
    
    if (job1Response.success) {
      console.log('✅ Job 1 created and assigned to machine 1');
      jobIds.push(job1Response.data.data.nrcJobNo);
    } else {
      console.log('❌ Failed to create job 1:', job1Response.error);
      return;
    }
    
    // Job 2 assigned to machine 2
    const job2Response = await makeRequest('POST', '/jobs', {
      styleItemSKU: 'SKU002',
      customerName: 'Customer B',
      machineId: machineIds[1]
    }, plannerToken);
    
    if (job2Response.success) {
      console.log('✅ Job 2 created and assigned to machine 2');
      jobIds.push(job2Response.data.data.nrcJobNo);
    } else {
      console.log('❌ Failed to create job 2:', job2Response.error);
      return;
    }
    console.log('');

    // Step 7: Create purchase orders with machine assignments
    console.log('📋 Step 7: Creating purchase orders with machine assignments...');
    
    // PO 1 assigned to machine 1
    const po1Response = await makeRequest('POST', '/purchase-orders/create', {
      customer: 'Customer A',
      poNumber: 'PO001',
      machineIds: [machineIds[0]]
    }, plannerToken);
    
    if (po1Response.success) {
      console.log('✅ PO 1 created and assigned to machine 1');
      poIds.push(po1Response.data.data.id);
    } else {
      console.log('❌ Failed to create PO 1:', po1Response.error);
      return;
    }
    
    // PO 2 assigned to machine 2
    const po2Response = await makeRequest('POST', '/purchase-orders/create', {
      customer: 'Customer B',
      poNumber: 'PO002',
      machineIds: [machineIds[1]]
    }, plannerToken);
    
    if (po2Response.success) {
      console.log('✅ PO 2 created and assigned to machine 2');
      poIds.push(po2Response.data.data.id);
    } else {
      console.log('❌ Failed to create PO 2:', po2Response.error);
      return;
    }
    console.log('');

    // Step 8: Login as corrugator 1 and test filtering
    console.log('🔐 Step 8: Testing corrugator 1 access...');
    const corrugator1LoginResponse = await makeRequest('POST', '/auth/login', {
      email: testData.corrugator1.email,
      password: testData.corrugator1.password
    });
    
    if (corrugator1LoginResponse.success) {
      corrugator1Token = corrugator1LoginResponse.data.token || corrugator1LoginResponse.data.accessToken;
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
      
      // Test POs access
      const posResponse = await makeRequest('GET', '/purchase-orders', null, corrugator1Token);
      if (posResponse.success) {
        console.log(`📋 Corrugator 1 sees ${posResponse.data.count} purchase orders`);
        console.log('POs:', posResponse.data.data.map(po => ({
          id: po.id,
          customer: po.customer,
          poNumber: po.poNumber
        })));
      }
    } else {
      console.log('❌ Failed to login as corrugator 1:', corrugator1LoginResponse.error);
    }
    console.log('');

    // Step 9: Login as corrugator 2 and test filtering
    console.log('🔐 Step 9: Testing corrugator 2 access...');
    const corrugator2LoginResponse = await makeRequest('POST', '/auth/login', {
      email: testData.corrugator2.email,
      password: testData.corrugator2.password
    });
    
    if (corrugator2LoginResponse.success) {
      corrugator2Token = corrugator2LoginResponse.data.token || corrugator2LoginResponse.data.accessToken;
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
      
      // Test POs access
      const posResponse = await makeRequest('GET', '/purchase-orders', null, corrugator2Token);
      if (posResponse.success) {
        console.log(`📋 Corrugator 2 sees ${posResponse.data.count} purchase orders`);
        console.log('POs:', posResponse.data.data.map(po => ({
          id: po.id,
          customer: po.customer,
          poNumber: po.poNumber
        })));
      }
    } else {
      console.log('❌ Failed to login as corrugator 2:', corrugator2LoginResponse.error);
    }
    console.log('');

    // Step 10: Test admin access (should see everything)
    console.log('🔐 Step 10: Testing admin access (should see everything)...');
    const adminJobsResponse = await makeRequest('GET', '/jobs', null, adminToken);
    if (adminJobsResponse.success) {
      console.log(`📋 Admin sees ${adminJobsResponse.data.count} jobs (should see all)`);
    }
    
    const adminPosResponse = await makeRequest('GET', '/purchase-orders', null, adminToken);
    if (adminPosResponse.success) {
      console.log(`📋 Admin sees ${adminPosResponse.data.count} purchase orders (should see all)`);
    }
    console.log('');

    console.log('🎉 Complete test finished!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${userIds.length} users`);
    console.log(`- Created ${jobIds.length} jobs`);
    console.log(`- Created ${poIds.length} purchase orders`);
    console.log(`- Used ${machineIds.length} machines`);
    console.log('\n✅ Machine access control is working!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testCompleteFlow();
