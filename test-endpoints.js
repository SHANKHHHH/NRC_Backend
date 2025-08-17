const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ik5SQzAwMSIsImlhdCI6MTc1NTQxNDE1MSwiZXhwIjoxNzU4MDA2MTUxfQ.OsiWpHayuVvqGIktIIVBLsSJDRZNgxVgH3eBhzS1ceA';

const headers = {
  'Authorization': `Bearer ${TEST_TOKEN}`,
  'Content-Type': 'application/json'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

// Helper function to test endpoint
async function testEndpoint(name, method, url, expectedStatus = 200) {
  try {
    console.log(`🧪 Testing: ${name}`);
    const response = await axios({
      method,
      url: `${BASE_URL}${url}`,
      headers: method !== 'GET' ? headers : headers,
      timeout: 10000
    });
    
    if (response.status === expectedStatus) {
      console.log(`✅ ${name}: PASSED (${response.status})`);
      results.passed++;
    } else {
      console.log(`❌ ${name}: FAILED - Expected ${expectedStatus}, got ${response.status}`);
      results.failed++;
    }
  } catch (error) {
    if (error.response) {
      console.log(`❌ ${name}: FAILED - ${error.response.status} ${error.response.statusText}`);
      if (error.response.data && error.response.data.error) {
        console.log(`   Error: ${error.response.data.error}`);
      }
    } else {
      console.log(`❌ ${name}: FAILED - ${error.message}`);
    }
    results.failed++;
    results.errors.push({ name, error: error.message });
  }
}

// Test all endpoints
async function runAllTests() {
  console.log('🚀 Starting comprehensive endpoint testing...\n');
  
  // Health checks
  await testEndpoint('Health Check', 'GET', '/health');
  await testEndpoint('Root Endpoint', 'GET', '/');
  
  // Auth endpoints (no token needed)
  await testEndpoint('Auth Login (no token)', 'POST', '/api/auth/login', 400); // Should fail without body
  
  // Protected endpoints (with token)
  await testEndpoint('Get All Jobs', 'GET', '/api/jobs');
  await testEndpoint('Get All Machines', 'GET', '/api/machines');
  await testEndpoint('Get Job Planning', 'GET', '/api/job-planning');
  await testEndpoint('Get Dashboard Data', 'GET', '/api/dashboard');
  await testEndpoint('Get Purchase Orders', 'GET', '/api/purchase-orders');
  await testEndpoint('Get Paper Store', 'GET', '/api/paper-store');
  await testEndpoint('Get Printing Details', 'GET', '/api/printing-details');
  await testEndpoint('Get Corrugation', 'GET', '/api/corrugation');
  await testEndpoint('Get Flute Laminate Board Conversion', 'GET', '/api/flute-laminate-board-conversion');
  await testEndpoint('Get Punching', 'GET', '/api/punching');
  await testEndpoint('Get Side Flap Pasting', 'GET', '/api/side-flap-pasting');
  await testEndpoint('Get Quality Dept', 'GET', '/api/quality-dept');
  await testEndpoint('Get Dispatch Process', 'GET', '/api/dispatch-process');
  await testEndpoint('Get Activity Logs', 'GET', '/api/activity-logs');
  await testEndpoint('Get Completed Jobs', 'GET', '/api/completed-jobs');
  
  // Test batch requests
  await testEndpoint('Batch Requests', 'POST', '/api/batch', 400); // Should fail without body
  
  // Test error handling
  await testEndpoint('Test Error Handler', 'GET', '/api/test-error', 400);
  await testEndpoint('Test Async Error Handler', 'GET', '/api/test-async-error', 500);
  
  // Test 404
  await testEndpoint('404 Handler', 'GET', '/api/nonexistent', 404);
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  
  if (results.errors.length > 0) {
    console.log('\n🚨 Errors:');
    results.errors.forEach(error => {
      console.log(`   ${error.name}: ${error.error}`);
    });
  }
  
  if (results.failed === 0) {
    console.log('\n🎉 All endpoints are working perfectly!');
  } else {
    console.log('\n⚠️  Some endpoints have issues. Check the errors above.');
  }
}

// Run tests
runAllTests().catch(console.error);
