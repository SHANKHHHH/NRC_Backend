const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ik5SQzAwMSIsImlhdCI6MTc2MTEzNTIwMSwiZXhwIjoxNzYzNzI3MjAxfQ.EsLHzvooiVkF3tjzFODgH2_q32dwtqN-iKfwpSL7e-c';

async function getFullJSONOutput() {
  console.log('🚀 Getting Full JSON Output from Enhanced Held Machines API\n');

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

    console.log('✅ Response 1 - All held machines with job planning details:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(response1.data, null, 2));
    console.log('='.repeat(80));

    // Test 2: Get held machines without job planning details (lighter response)
    console.log('\n📋 Test 2: Get held machines without job planning details');
    const response2 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        includeJobPlanningDetails: 'false'
      }
    });

    console.log('✅ Response 2 - Without job planning details:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(response2.data, null, 2));
    console.log('='.repeat(80));

    // Test 3: Filter by specific PO number
    console.log('\n📋 Test 3: Filter by specific PO number');
    const response3 = await axios.get(`${BASE_URL}/job-step-machines/held-machines`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      params: {
        poNumber: '4525021668', // Using the actual PO number from the first response
        includeJobPlanningDetails: 'true'
      }
    });

    console.log('✅ Response 3 - Filtered by PO 4525021668:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(response3.data, null, 2));
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error testing API:', error.response?.data || error.message);
  }
}

// Run the test
getFullJSONOutput();
