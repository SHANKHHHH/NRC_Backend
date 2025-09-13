const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

// Test data
const testData = {
  users: [
    { name: 'Test Corrugator A', role: 'corrugator', machineId: 'cmfgsfyyr000aocyrv6j75hzp' },
    { name: 'Test Corrugator B', role: 'corrugator', machineId: 'cmfgsfyyr000aocyrv6j75hzp' },
    { name: 'Test Printer A', role: 'printer', machineId: 'cmfgsfyyr000aocyrv6j75hzp' },
    { name: 'Test Admin', role: 'admin', machineId: null }
  ],
  machines: [
    { id: 'cmfgsfyyr000aocyrv6j75hzp', code: 'P1', type: 'Printing' },
    { id: 'cmfgsfyyr000aocyrv6j75hzp', code: 'C1', type: 'Corrugation' },
    { id: 'cmfgsfyyr000aocyrv6j75hzp', code: 'C2', type: 'Corrugation' }
  ]
};

let authTokens = {};
let createdJobId = null;
let createdPOId = null;
let createdJobStepIds = {};

async function createTestUsers() {
  console.log('🔧 Creating test users...');
  
  for (const user of testData.users) {
    try {
      const userData = {
        name: user.name,
        email: `${user.name.toLowerCase().replace(/\s+/g, '')}@test.com`,
        password: 'password123',
        role: user.role,
        machineId: user.machineId
      };
      
      const response = await axios.post(`${BASE_URL}/api/users/register`, userData);
      console.log(`✅ Created user: ${user.name} (${user.role})`);
    } catch (error) {
      console.log(`⚠️ User ${user.name} might already exist`);
    }
  }
}

async function loginUsers() {
  console.log('🔐 Logging in users...');
  
  for (const user of testData.users) {
    try {
      const response = await axios.post(`${BASE_URL}/api/users/login`, {
        email: `${user.name.toLowerCase().replace(/\s+/g, '')}@test.com`,
        password: 'password123'
      });
      
      console.log(`🔍 Login response for ${user.name}:`, JSON.stringify(response.data, null, 2));
      
      // Check different possible token fields
      const token = response.data.token || response.data.data?.token || response.data.accessToken;
      
      if (token) {
        authTokens[user.role] = token;
        console.log(`✅ Logged in: ${user.name} - Token: ${token.substring(0, 20)}...`);
      } else {
        console.log(`❌ No token found in response for ${user.name}`);
        throw new Error('No token in response');
      }
    } catch (error) {
      console.log(`❌ Failed to login: ${user.name}`);
      console.log(`   Error details:`, error.response?.data || error.message);
    }
  }
}

async function createTestJob() {
  console.log('📦 Creating test job...');
  
  try {
    const jobData = {
      nrcJobNo: 'TEST-FLOW-001',
      styleItemSKU: 'SKU-TEST-001',
      customerName: 'Test Customer',
      jobDemand: 'high', // High demand for testing
      status: 'ACTIVE'
    };
    
    const response = await axios.post(`${BASE_URL}/api/jobs`, jobData, {
      headers: { Authorization: `Bearer ${authTokens.admin}` }
    });
    
    createdJobId = response.data.data.id;
    console.log(`✅ Created job: ${createdJobId}`);
  } catch (error) {
    console.log('❌ Failed to create job:', error.response?.data || error.message);
  }
}

async function createTestPO() {
  console.log('📋 Creating test PO...');
  
  try {
    const poData = {
      poNumber: 'PO-TEST-001',
      customer: 'Test Customer',
      totalPOQuantity: 1000,
      status: 'created'
    };
    
    const response = await axios.post(`${BASE_URL}/api/purchase-orders/create`, poData, {
      headers: { Authorization: `Bearer ${authTokens.admin}` }
    });
    
    createdPOId = response.data.data.id;
    console.log(`✅ Created PO: ${createdPOId}`);
  } catch (error) {
    console.log('❌ Failed to create PO:', error.response?.data || error.message);
  }
}

async function createJobPlanning() {
  console.log('📊 Creating job planning...');
  
  try {
    const planningData = {
      nrcJobNo: 'TEST-FLOW-001',
      poId: createdPOId,
      steps: [
        {
          stepNo: 1,
          stepName: 'Printing',
          machineDetails: [
            {
              machineId: 'cmfgsfyyr000aocyrv6j75hzp',
              unit: 'Unit 1',
              machineCode: 'P1',
              machineType: 'Printing'
            }
          ]
        },
        {
          stepNo: 2,
          stepName: 'Corrugation',
          machineDetails: [
            {
              machineId: 'cmfgsfyyr000aocyrv6j75hzp',
              unit: 'Unit 1',
              machineCode: 'C1',
              machineType: 'Corrugation'
            }
          ]
        },
        {
          stepNo: 3,
          stepName: 'Punching',
          machineDetails: [
            {
              machineId: 'cmfgsfyyr000aocyrv6j75hzp',
              unit: 'Unit 1',
              machineCode: 'P1',
              machineType: 'Punching'
            }
          ]
        }
      ]
    };
    
    const response = await axios.post(`${BASE_URL}/api/job-planning`, planningData, {
      headers: { Authorization: `Bearer ${authTokens.admin}` }
    });
    
    console.log(`✅ Created job planning with ${response.data.data.steps.length} steps`);
    
    // Store step IDs for later testing
    response.data.data.steps.forEach(step => {
      createdJobStepIds[step.stepName] = step.id;
    });
  } catch (error) {
    console.log('❌ Failed to create job planning:', error.response?.data || error.message);
  }
}

async function testMachineBasedFiltering() {
  console.log('\n🔍 Testing Machine-Based Filtering...');
  
  // Test Corrugator A (should see only C1 tasks)
  console.log('\n👤 Testing Corrugator A (Machine C1):');
  try {
    const response = await axios.get(`${BASE_URL}/api/corrugation`, {
      headers: { Authorization: `Bearer ${authTokens.corrugator}` }
    });
    
    console.log(`✅ Corrugator A sees ${response.data.count} corrugation tasks`);
    console.log(`   Tasks: ${response.data.data.map(t => t.id).join(', ')}`);
  } catch (error) {
    console.log('❌ Failed to get corrugation tasks for Corrugator A');
  }
  
  // Test Printer A (should see only P1 tasks)
  console.log('\n👤 Testing Printer A (Machine P1):');
  try {
    const response = await axios.get(`${BASE_URL}/api/printing-details`, {
      headers: { Authorization: `Bearer ${authTokens.printer}` }
    });
    
    console.log(`✅ Printer A sees ${response.data.count} printing tasks`);
    console.log(`   Tasks: ${response.data.data.map(t => t.id).join(', ')}`);
  } catch (error) {
    console.log('❌ Failed to get printing tasks for Printer A');
  }
}

async function testHighDemandFiltering() {
  console.log('\n📈 Testing High Demand Filtering...');
  
  // Test Corrugator B (should see all corrugation tasks due to high demand)
  console.log('\n👤 Testing Corrugator B (High Demand):');
  try {
    const response = await axios.get(`${BASE_URL}/api/corrugation`, {
      headers: { Authorization: `Bearer ${authTokens.corrugator}` }
    });
    
    console.log(`✅ Corrugator B sees ${response.data.count} corrugation tasks (high demand)`);
    console.log(`   Tasks: ${response.data.data.map(t => t.id).join(', ')}`);
  } catch (error) {
    console.log('❌ Failed to get corrugation tasks for Corrugator B');
  }
}

async function testAdminAccess() {
  console.log('\n👑 Testing Admin Access...');
  
  // Test Admin (should see all tasks)
  console.log('\n👤 Testing Admin (Full Access):');
  try {
    const response = await axios.get(`${BASE_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${authTokens.admin}` }
    });
    
    console.log(`✅ Admin sees ${response.data.count} jobs`);
    console.log(`   Jobs: ${response.data.data.map(j => j.nrcJobNo).join(', ')}`);
  } catch (error) {
    console.log('❌ Failed to get jobs for Admin');
  }
}

async function testStepCreation() {
  console.log('\n➕ Testing Step Creation with Machine Access...');
  
  // Test creating a corrugation step
  console.log('\n👤 Testing Corrugator A creating corrugation step:');
  try {
    const stepData = {
      jobStepId: createdJobStepIds.Corrugation,
      quantity: 100,
      status: 'in_progress'
    };
    
    const response = await axios.post(`${BASE_URL}/api/corrugation`, stepData, {
      headers: { Authorization: `Bearer ${authTokens.corrugator}` }
    });
    
    console.log(`✅ Corrugator A successfully created corrugation step`);
  } catch (error) {
    console.log('❌ Failed to create corrugation step:', error.response?.data || error.message);
  }
}

async function testJobVisibility() {
  console.log('\n👁️ Testing Job Visibility...');
  
  // Test job visibility for different roles
  const roles = ['corrugator', 'printer', 'admin'];
  
  for (const role of roles) {
    console.log(`\n👤 Testing ${role} job visibility:`);
    try {
      const response = await axios.get(`${BASE_URL}/api/jobs`, {
        headers: { Authorization: `Bearer ${authTokens[role]}` }
      });
      
      console.log(`✅ ${role} sees ${response.data.count} jobs`);
      console.log(`   Jobs: ${response.data.data.map(j => j.nrcJobNo).join(', ')}`);
    } catch (error) {
      console.log(`❌ Failed to get jobs for ${role}`);
    }
  }
}

async function testJobPlanningVisibility() {
  console.log('\n📊 Testing Job Planning Visibility...');
  
  // Test job planning visibility for different roles
  const roles = ['corrugator', 'printer', 'admin'];
  
  for (const role of roles) {
    console.log(`\n👤 Testing ${role} job planning visibility:`);
    try {
      const response = await axios.get(`${BASE_URL}/api/job-planning`, {
        headers: { Authorization: `Bearer ${authTokens[role]}` }
      });
      
      console.log(`✅ ${role} sees ${response.data.count} job plannings`);
      console.log(`   Plannings: ${response.data.data.map(jp => jp.nrcJobNo).join(', ')}`);
    } catch (error) {
      console.log(`❌ Failed to get job plannings for ${role}`);
    }
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test job
    if (createdJobId) {
      await prisma.job.delete({ where: { id: createdJobId } });
      console.log('✅ Deleted test job');
    }
    
    // Delete test PO
    if (createdPOId) {
      await prisma.purchaseOrder.delete({ where: { id: createdPOId } });
      console.log('✅ Deleted test PO');
    }
    
    // Delete test users
    for (const user of testData.users) {
      await prisma.user.deleteMany({
        where: { email: `${user.name.toLowerCase().replace(/\s+/g, '')}@test.com` }
      });
    }
    console.log('✅ Deleted test users');
    
  } catch (error) {
    console.log('⚠️ Cleanup failed:', error.message);
  }
}

async function checkServer() {
  console.log('🔍 Checking if server is running...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start the server first with: npm run dev');
    return false;
  }
}

async function runCompleteTest() {
  console.log('🚀 Starting Complete Flow Test...\n');
  
  try {
    const serverRunning = await checkServer();
    if (!serverRunning) {
      return;
    }
    
    await createTestUsers();
    await loginUsers();
    
    // Check if we have any valid tokens
    const validTokens = Object.keys(authTokens).filter(role => authTokens[role]);
    console.log(`\n🔑 Valid tokens: ${validTokens.length}/${testData.users.length}`);
    validTokens.forEach(role => {
      console.log(`   - ${role}: ${authTokens[role].substring(0, 20)}...`);
    });
    
    if (validTokens.length === 0) {
      console.log('❌ No valid tokens - cannot proceed with tests');
      return;
    }
    
    await createTestJob();
    await createTestPO();
    await createJobPlanning();
    
    await testMachineBasedFiltering();
    await testHighDemandFiltering();
    await testAdminAccess();
    await testStepCreation();
    await testJobVisibility();
    await testJobPlanningVisibility();
    
    console.log('\n✅ Complete Flow Test Finished!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// Run the test
runCompleteTest();
