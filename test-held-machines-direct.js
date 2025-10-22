const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testHeldMachinesAPI() {
  console.log('🚀 Testing Enhanced Held Machines API (Direct Test)\n');

  try {
    // First, let's try to create a test user and get a token
    console.log('📋 Step 1: Creating test user...');
    
    try {
      const registerResponse = await axios.post(`${BASE_URL}/auth/register`, {
        name: 'Test Admin',
        email: 'testadmin@test.com',
        password: '1234567',
        roles: ['admin']
      });
      
      if (registerResponse.data.success) {
        console.log('✅ Test user created successfully');
      }
    } catch (registerError) {
      if (registerError.response?.status === 409) {
        console.log('✅ Test user already exists');
      } else {
        console.log('❌ Error creating test user:', registerError.response?.data || registerError.message);
      }
    }

    // Now try to login
    console.log('\n📋 Step 2: Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'testadmin@test.com',
      password: '1234567'
    });

    const token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
    
    if (!token) {
      console.log('❌ Failed to get access token');
      console.log('Login response:', loginResponse.data);
      return;
    }

    console.log('✅ Login successful, token obtained');

    // Test 1: Get all held machines with job planning details
    console.log('\n📋 Test 1: Get all held machines with job planning details');
    const response1 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        includeJobPlanningDetails: 'true'
      }
    });

    console.log('✅ Response 1 - All held machines:');
    console.log(`   Total held jobs: ${response1.data.data.totalHeldJobs}`);
    console.log(`   Total held machines: ${response1.data.data.totalHeldMachines}`);
    console.log(`   Query parameters:`, response1.data.data.queryParameters);
    
    if (response1.data.data.heldJobs.length > 0) {
      const firstJob = response1.data.data.heldJobs[0];
      console.log(`   First job: ${firstJob.jobDetails.nrcJobNo}`);
      console.log(`   Job planning details included: ${firstJob.jobPlanningDetails ? 'Yes' : 'No'}`);
      if (firstJob.jobPlanningDetails) {
        console.log(`   Job planning ID: ${firstJob.jobPlanningDetails.jobPlanningId}`);
        console.log(`   Steps count: ${firstJob.jobPlanningDetails.allStepsDetails.length}`);
      }
    }

    // Test 2: Filter by specific PO number (if any POs exist)
    console.log('\n📋 Test 2: Filter by specific PO number');
    const response2 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        poNumber: 'PO-12345', // This might not exist, but let's test
        includeJobPlanningDetails: 'true'
      }
    });

    console.log('✅ Response 2 - Filtered by PO:');
    console.log(`   Total held jobs for PO: ${response2.data.data.totalHeldJobs}`);
    console.log(`   Query parameters:`, response2.data.data.queryParameters);

    // Test 3: Get held machines without job planning details (lighter response)
    console.log('\n📋 Test 3: Get held machines without job planning details');
    const response3 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        includeJobPlanningDetails: 'false'
      }
    });

    console.log('✅ Response 3 - Without job planning details:');
    console.log(`   Total held jobs: ${response3.data.data.totalHeldJobs}`);
    console.log(`   Query parameters:`, response3.data.data.queryParameters);

    // Display sample response structure
    if (response1.data.data.heldJobs.length > 0) {
      console.log('\n📊 Sample Response Structure:');
      const sampleJob = response1.data.data.heldJobs[0];
      console.log(JSON.stringify({
        jobDetails: {
          nrcJobNo: sampleJob.jobDetails.nrcJobNo,
          customerName: sampleJob.jobDetails.customerName,
          styleItemSKU: sampleJob.jobDetails.styleItemSKU,
          status: sampleJob.jobDetails.status,
          jobDemand: sampleJob.jobDetails.jobDemand
        },
        jobPlanningDetails: sampleJob.jobPlanningDetails ? {
          jobPlanningId: sampleJob.jobPlanningDetails.jobPlanningId,
          purchaseOrderDetails: sampleJob.jobPlanningDetails.purchaseOrderDetails,
          allStepsDetails: sampleJob.jobPlanningDetails.allStepsDetails?.length || 0
        } : null,
        purchaseOrders: sampleJob.purchaseOrders?.length || 0,
        totalHeldMachines: sampleJob.totalHeldMachines,
        steps: sampleJob.steps?.length || 0
      }, null, 2));
    } else {
      console.log('\n📊 No held machines found - showing empty response structure:');
      console.log(JSON.stringify({
        success: true,
        message: "Found 0 jobs with held machines",
        data: {
          totalHeldJobs: 0,
          totalHeldMachines: 0,
          queryParameters: {
            poNumber: null,
            includeJobPlanningDetails: true
          },
          heldJobs: []
        }
      }, null, 2));
    }

  } catch (error) {
    console.error('❌ Error testing API:', error.response?.data || error.message);
    
    // If it's an auth error, let's try to see what the actual response is
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('\n🔍 Auth Error Details:');
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
    }
  }
}

// Run the test
testHeldMachinesAPI();
