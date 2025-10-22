const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ik5SQzAwMSIsImlhdCI6MTc2MTEzNTIwMSwiZXhwIjoxNzYzNzI3MjAxfQ.EsLHzvooiVkF3tjzFODgH2_q32dwtqN-iKfwpSL7e-c';

// Test the enhanced held-machines API
async function testEnhancedHeldMachinesAPI() {
  console.log('🚀 Testing Enhanced Held Machines API\n');

  try {
    // Test 1: Get all held machines with job planning details
    console.log('📋 Test 1: Get all held machines with job planning details');
    const response1 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
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

    // Test 2: Filter by specific PO number
    console.log('\n📋 Test 2: Filter by specific PO number');
    const response2 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        poNumber: 'PO-12345', // Replace with actual PO number
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
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        includeJobPlanningDetails: 'false'
      }
    });

    console.log('✅ Response 3 - Without job planning details:');
    console.log(`   Total held jobs: ${response3.data.data.totalHeldJobs}`);
    console.log(`   Query parameters:`, response3.data.data.queryParameters);

    // Test 4: Get held machines for a specific job
    console.log('\n📋 Test 4: Get held machines for specific job');
    const response4 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        nrcJobNo: 'NRC-2024-001', // Replace with actual job number
        includeJobPlanningDetails: 'true'
      }
    });

    console.log('✅ Response 4 - Filtered by job:');
    console.log(`   Total held jobs: ${response4.data.data.totalHeldJobs}`);
    console.log(`   Query parameters:`, response4.data.data.queryParameters);

    // Display sample response structure
    if (response1.data.data.heldJobs.length > 0) {
      console.log('\n📊 Sample Response Structure:');
      const sampleJob = response1.data.data.heldJobs[0];
      console.log(JSON.stringify({
        jobDetails: {
          nrcJobNo: sampleJob.jobDetails.nrcJobNo,
          customerName: sampleJob.jobDetails.customerName,
          // ... other job details
        },
        jobPlanningDetails: sampleJob.jobPlanningDetails ? {
          jobPlanningId: sampleJob.jobPlanningDetails.jobPlanningId,
          purchaseOrderDetails: sampleJob.jobPlanningDetails.purchaseOrderDetails,
          allStepsDetails: sampleJob.jobPlanningDetails.allStepsDetails?.length || 0,
          // ... other planning details
        } : null,
        purchaseOrders: sampleJob.purchaseOrders?.length || 0,
        totalHeldMachines: sampleJob.totalHeldMachines
      }, null, 2));
    }

  } catch (error) {
    console.error('❌ Error testing API:', error.response?.data || error.message);
  }
}

// Run the tests
testEnhancedHeldMachinesAPI();

// Example usage with different scenarios
console.log('\n🔧 Example Usage Scenarios:');
console.log('1. Get all held machines with full job planning details:');
console.log('   GET /api/job-step-machines/held-machines?includeJobPlanningDetails=true');
console.log('\n2. Filter by specific PO number:');
console.log('   GET /api/job-step-machines/held-machines?poNumber=PO-12345&includeJobPlanningDetails=true');
console.log('\n3. Get held machines without job planning details (faster):');
console.log('   GET /api/job-step-machines/held-machines?includeJobPlanningDetails=false');
console.log('\n4. Filter by job number:');
console.log('   GET /api/job-step-machines/held-machines?nrcJobNo=NRC-2024-001&includeJobPlanningDetails=true');
