const axios = require('axios');

async function getDetailedJobStepInfo() {
  try {
    const authResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'flutetesting@gmail.com',
      password: '1234567'
    });
    
    const token = authResponse.data.acessToken;
    const headers = { 'Authorization': `Bearer ${token}` };
    
    const fluteResponse = await axios.get('http://localhost:3000/api/flute-laminate-board-conversion', { headers });
    
    console.log('🎯 DETAILED JOB STEP INFORMATION FOR flutetesting@gmail.com');
    console.log('=' .repeat(80));
    console.log('User ID: NRC056');
    console.log('Role: flutelaminator');
    console.log('Email: flutetesting@gmail.com');
    console.log('');
    
    if (fluteResponse.data.data && fluteResponse.data.data.length > 0) {
      console.log(`📊 Total Flute Laminate Board Conversion Steps: ${fluteResponse.data.data.length}`);
      console.log('');
      
      fluteResponse.data.data.forEach((step, index) => {
        console.log(`${index + 1}. JobStepID: ${step.id || 'No ID'}`);
        console.log(`   Step Name: ${step.stepName}`);
        console.log(`   Status: ${step.status}`);
        console.log(`   Start Date: ${step.startDate || 'Not started'}`);
        console.log(`   End Date: ${step.endDate || 'Not completed'}`);
        console.log(`   Assigned User: ${step.user || 'Unassigned'}`);
        console.log(`   Machine Details:`);
        
        if (step.machineDetails && step.machineDetails.length > 0) {
          step.machineDetails.forEach((machine, mIndex) => {
            console.log(`     Machine ${mIndex + 1}:`);
            console.log(`       - Machine ID: ${machine.machineId}`);
            console.log(`       - Machine Code: ${machine.machineCode}`);
            console.log(`       - Machine Type: ${machine.machineType}`);
            console.log(`       - Unit: ${machine.unit}`);
          });
        } else {
          console.log(`     No machines assigned`);
        }
        console.log('');
      });
      
      // Summary by status
      const statusCounts = {};
      fluteResponse.data.data.forEach(step => {
        statusCounts[step.status] = (statusCounts[step.status] || 0) + 1;
      });
      
      console.log('📈 STATUS SUMMARY:');
      Object.keys(statusCounts).forEach(status => {
        console.log(`   ${status}: ${statusCounts[status]} steps`);
      });
      
    } else {
      console.log('No flute laminate board conversion steps found.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getDetailedJobStepInfo();
