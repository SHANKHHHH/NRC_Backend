const axios = require('axios');

async function getDetailedUserJobSteps() {
  try {
    // First authenticate
    const authResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'flutetesting@gmail.com',
      password: '1234567'
    });
    
    const token = authResponse.data.acessToken;
    const userId = authResponse.data.data.id;
    
    console.log('🔐 Authenticated as:', userId);
    console.log('📧 Email:', 'flutetesting@gmail.com');
    console.log('🎭 Role:', authResponse.data.data.roles);
    console.log('');
    
    const headers = { 'Authorization': `Bearer ${token}` };
    
    // Get flute laminate board conversion details (specific to flutelaminator role)
    console.log('🔍 Checking Flute Laminate Board Conversion Job Steps...');
    try {
      const fluteResponse = await axios.get('http://localhost:3000/api/flute-laminate-board-conversion', { headers });
      console.log('✅ Flute Laminate Board Conversion Steps:', fluteResponse.data.count || 0);
      
      if (fluteResponse.data.data && fluteResponse.data.data.length > 0) {
        fluteResponse.data.data.forEach((step, index) => {
          console.log(`${index + 1}. JobStepID: ${step.id}`);
          console.log(`   Step Name: ${step.stepName}`);
          console.log(`   Status: ${step.status}`);
          console.log(`   Machine Details: ${JSON.stringify(step.machineDetails)}`);
          console.log(`   Start Date: ${step.startDate}`);
          console.log(`   End Date: ${step.endDate}`);
          console.log(`   User: ${step.user}`);
          console.log('');
        });
      } else {
        console.log('   No flute laminate board conversion steps found.');
      }
    } catch (error) {
      console.log('❌ Error fetching flute laminate steps:', error.response?.data?.message || error.message);
    }
    
    // Get all job planning details
    console.log('📋 Checking All Job Planning Details...');
    try {
      const planningResponse = await axios.get('http://localhost:3000/api/planner-dashboard', { headers });
      console.log('✅ Job Planning Data Available:', !!planningResponse.data);
      
      if (planningResponse.data.jobPlannings && planningResponse.data.jobPlannings.length > 0) {
        console.log('📊 Total Job Plannings:', planningResponse.data.jobPlannings.length);
        
        // Look for steps with flutelaminator role
        let foundFluteSteps = false;
        planningResponse.data.jobPlannings.forEach(planning => {
          if (planning.steps && planning.steps.length > 0) {
            planning.steps.forEach(step => {
              if (step.stepName && step.stepName.toLowerCase().includes('flute')) {
                if (!foundFluteSteps) {
                  console.log('🎯 Found Flute Steps:');
                  foundFluteSteps = true;
                }
                console.log(`   Job: ${planning.nrcJobNo}`);
                console.log(`   JobStepID: ${step.id}`);
                console.log(`   Step Name: ${step.stepName}`);
                console.log(`   Status: ${step.status}`);
                console.log(`   Machine Details: ${JSON.stringify(step.machineDetails)}`);
                console.log('');
              }
            });
          }
        });
        
        if (!foundFluteSteps) {
          console.log('   No flute-related steps found in job plannings.');
        }
      } else {
        console.log('   No job plannings found.');
      }
    } catch (error) {
      console.log('❌ Error fetching job planning:', error.response?.data?.message || error.message);
    }
    
    // Get printing details (includes all job steps)
    console.log('🖨️ Checking All Printing Details (Job Steps)...');
    try {
      const printingResponse = await axios.get('http://localhost:3000/api/printing-details', { headers });
      console.log('✅ Total Job Steps:', printingResponse.data.count || 0);
      
      if (printingResponse.data.data && printingResponse.data.data.length > 0) {
        // Filter for steps that might be relevant to flutelaminator
        const relevantSteps = printingResponse.data.data.filter(step => 
          step.stepName && (
            step.stepName.toLowerCase().includes('flute') ||
            step.stepName.toLowerCase().includes('laminate') ||
            step.stepName.toLowerCase().includes('conversion')
          )
        );
        
        if (relevantSteps.length > 0) {
          console.log(`🎯 Found ${relevantSteps.length} relevant steps for flutelaminator:`);
          relevantSteps.forEach((step, index) => {
            console.log(`${index + 1}. JobStepID: ${step.jobStepId}`);
            console.log(`   Step Name: ${step.stepName}`);
            console.log(`   Status: ${step.status}`);
            console.log(`   Machine Details: ${JSON.stringify(step.machineDetails)}`);
            console.log(`   Job Planning: ${step.jobPlanning?.nrcJobNo || 'N/A'}`);
            console.log(`   Start Date: ${step.startDate}`);
            console.log(`   End Date: ${step.endDate}`);
            console.log('');
          });
        } else {
          console.log('   No flute/laminate related steps found in printing details.');
        }
      } else {
        console.log('   No job steps found in printing details.');
      }
    } catch (error) {
      console.log('❌ Error fetching printing details:', error.response?.data?.message || error.message);
    }
    
    // Get machines that this user might have access to
    console.log('🔧 Checking Machine Access...');
    try {
      const machinesResponse = await axios.get('http://localhost:3000/api/machines', { headers });
      console.log('✅ Total Machines Available:', machinesResponse.data.count || 0);
      
      // Look for flute-related machines
      const fluteMachines = machinesResponse.data.data.filter(machine => 
        machine.machineType && (
          machine.machineType.toLowerCase().includes('flute') ||
          machine.machineType.toLowerCase().includes('laminate')
        )
      );
      
      if (fluteMachines.length > 0) {
        console.log(`🎯 Found ${fluteMachines.length} flute/laminate machines:`);
        fluteMachines.forEach((machine, index) => {
          console.log(`${index + 1}. Machine ID: ${machine.id}`);
          console.log(`   Machine Code: ${machine.machineCode}`);
          console.log(`   Machine Type: ${machine.machineType}`);
          console.log(`   Status: ${machine.status}`);
          console.log(`   Unit: ${machine.unit}`);
          console.log(`   Description: ${machine.description}`);
          console.log('');
        });
      } else {
        console.log('   No flute/laminate specific machines found.');
      }
    } catch (error) {
      console.log('❌ Error fetching machines:', error.response?.data?.message || error.message);
    }
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data || error.message);
  }
}

getDetailedUserJobSteps();
