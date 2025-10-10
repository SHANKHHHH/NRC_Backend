/**
 * Test script for Held Machines API
 * 
 * Usage:
 * 1. Make sure the backend server is running
 * 2. Update the AUTH_TOKEN with a valid token
 * 3. Run: node test-held-machines-api.js
 */

const BASE_URL = 'http://localhost:5000';

// REPLACE WITH YOUR ACTUAL AUTH TOKEN
const AUTH_TOKEN = 'your-auth-token-here';

// Test data - update with your actual job/machine data
const TEST_DATA = {
  nrcJobNo: 'NRC-2024-001',
  stepNo: 2,
  machineId: 'your-machine-id',
  holdRemark: 'Test hold - machine maintenance required'
};

async function testHoldMachine() {
  console.log('\n🧪 Test 1: Holding a machine...');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/job-step-machine/${TEST_DATA.nrcJobNo}/steps/${TEST_DATA.stepNo}/machines/${TEST_DATA.machineId}/hold`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          holdRemark: TEST_DATA.holdRemark,
          formData: {
            quantity: 1000,
            testField: 'test value'
          }
        })
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Machine held successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Failed to hold machine');
      console.log('Error:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testGetHeldMachines() {
  console.log('\n🧪 Test 2: Getting all held machines...');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/job-step-machine/held-machines`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Retrieved ${data.data.totalHeldMachines} held machines!`);
      console.log('\nSummary:');
      console.log('─'.repeat(80));
      
      data.data.heldMachines.forEach((machine, index) => {
        console.log(`\n${index + 1}. Machine: ${machine.machineCode} (${machine.machineType})`);
        console.log(`   Job: ${machine.jobDetails?.nrcJobNo} - ${machine.jobDetails?.customerName}`);
        console.log(`   Step: ${machine.stepDetails?.stepNo}. ${machine.stepDetails?.stepName}`);
        console.log(`   Hold Remark: ${machine.holdRemark || 'N/A'}`);
        console.log(`   Held By: ${machine.heldBy?.name || 'N/A'}`);
        console.log(`   Held At: ${machine.heldAt}`);
        
        if (machine.purchaseOrderDetails?.length > 0) {
          console.log(`   Purchase Orders: ${machine.purchaseOrderDetails.length}`);
          machine.purchaseOrderDetails.forEach(po => {
            console.log(`     - PO ${po.poNumber}: ${po.totalPOQuantity} units`);
          });
        }
      });
      
      console.log('\n' + '─'.repeat(80));
      console.log('\n📊 Full Response:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Failed to get held machines');
      console.log('Error:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testResumeWorkOnMachine() {
  console.log('\n🧪 Test 3: Resuming work on machine...');
  
  try {
    const response = await fetch(
      `${BASE_URL}/api/job-step-machine/${TEST_DATA.nrcJobNo}/steps/${TEST_DATA.stepNo}/machines/${TEST_DATA.machineId}/resume`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          formData: {}
        })
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Work resumed successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Failed to resume work');
      console.log('Error:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Held Machines API Tests');
  console.log('═'.repeat(80));
  
  // Check if auth token is set
  if (AUTH_TOKEN === 'your-auth-token-here') {
    console.log('❌ ERROR: Please update AUTH_TOKEN in the script!');
    console.log('   Get a token by logging in to the app first.');
    return;
  }
  
  // Test 1: Hold a machine (optional - uncomment if you want to test holding)
  // await testHoldMachine();
  
  // Test 2: Get all held machines (safe to always run)
  await testGetHeldMachines();
  
  // Test 3: Resume work (optional - uncomment if you held a machine in Test 1)
  // await testResumeWorkOnMachine();
  
  console.log('\n✨ Tests completed!');
  console.log('═'.repeat(80));
}

// Run the tests
runTests();

