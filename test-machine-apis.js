const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ik5SQzAwOCIsImlhdCI6MTc1OTc1NDE4MCwiZXhwIjoxNzYyMzQ2MTgwfQ.wnKuoineGcuQI9Ggy-E2iII9EUM-zrF48ZG86p3ii_A';
const jobNumber = 'BAT-1-2 BG (48 PRS) (31059)';
const stepNo = 5; // Punching step
const machineId = 'cmfig0ajp000v1ewl93rnuzzj'; // Punching machine

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testMachineAPIs() {
  try {
    console.log('🔍 Testing machine-specific APIs...');
    
    // 1. Test getAvailableMachines
    console.log('\n1. Testing getAvailableMachines...');
    const machinesOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const machinesResponse = await makeRequest(machinesOptions);
    console.log('Status:', machinesResponse.status);
    console.log('Response:', JSON.stringify(machinesResponse.data, null, 2));
    
    // 2. Test startWorkOnMachine
    console.log('\n2. Testing startWorkOnMachine...');
    const startOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines/${machineId}/start`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const startData = JSON.stringify({
      formData: {
        status: 'pending',
        remarks: 'Test start',
        okQuantity: '1000'
      }
    });
    
    const startResponse = await makeRequest(startOptions, startData);
    console.log('Status:', startResponse.status);
    console.log('Response:', JSON.stringify(startResponse.data, null, 2));
    
    // 3. Test holdWorkOnMachine
    console.log('\n3. Testing holdWorkOnMachine...');
    const holdOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines/${machineId}/hold`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const holdData = JSON.stringify({
      remarks: 'Test hold'
    });
    
    const holdResponse = await makeRequest(holdOptions, holdData);
    console.log('Status:', holdResponse.status);
    console.log('Response:', JSON.stringify(holdResponse.data, null, 2));
    
    // 4. Test resumeWorkOnMachine
    console.log('\n4. Testing resumeWorkOnMachine...');
    const resumeOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines/${machineId}/resume`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const resumeResponse = await makeRequest(resumeOptions);
    console.log('Status:', resumeResponse.status);
    console.log('Response:', JSON.stringify(resumeResponse.data, null, 2));
    
    // 5. Test stopWorkOnMachine
    console.log('\n5. Testing stopWorkOnMachine...');
    const stopOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines/${machineId}/stop`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const stopResponse = await makeRequest(stopOptions);
    console.log('Status:', stopResponse.status);
    console.log('Response:', JSON.stringify(stopResponse.data, null, 2));
    
    // 6. Test completeWorkOnMachine
    console.log('\n6. Testing completeWorkOnMachine...');
    const completeOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/job-step-machines/${encodeURIComponent(jobNumber)}/steps/${stepNo}/machines/${machineId}/complete`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const completeData = JSON.stringify({
      formData: {
        status: 'accept',
        remarks: 'Test complete',
        okQuantity: '1000',
        wastage: '50',
        dieUsed: '31'
      }
    });
    
    const completeResponse = await makeRequest(completeOptions, completeData);
    console.log('Status:', completeResponse.status);
    console.log('Response:', JSON.stringify(completeResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testMachineAPIs();
