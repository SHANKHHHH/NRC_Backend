const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createMultiMachineJob() {
  try {
    console.log('Creating job planning with multiple machines...');

    // Create a new job planning
    const jobPlanning = await prisma.jobPlanning.create({
      data: {
        nrcJobNo: 'MULTI-MACHINE-TEST-001',
        jobDemand: 'high',
        purchaseOrderId: null,
        steps: {
          create: [
            // Step 1: PaperStore (no machine required)
            {
              stepNo: 1,
              stepName: 'PaperStore',
              status: 'planned',
              machineDetails: [{
                unit: 'Mk',
                machineCode: null,
                machineType: 'Not Assigned'
              }]
            },
            // Step 2: Printing (2 machines)
            {
              stepNo: 2,
              stepName: 'PrintingDetails',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig046600061ewlu4p3rkyz',
                  machineCode: 'MK-PR01',
                  machineType: 'Printing',
                  machine: {
                    id: 'cmfig046600061ewlu4p3rkyz',
                    description: 'Printing Machine 1',
                    status: 'available',
                    capacity: 15000
                  }
                },
                {
                  unit: 'Mk',
                  machineId: 'cmfig046600061ewlu4p3rkyz2',
                  machineCode: 'MK-PR02',
                  machineType: 'Printing',
                  machine: {
                    id: 'cmfig046600061ewlu4p3rkyz2',
                    description: 'Printing Machine 2',
                    status: 'available',
                    capacity: 12000
                  }
                }
              ]
            },
            // Step 3: Corrugation (1 machine)
            {
              stepNo: 3,
              stepName: 'Corrugation',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k',
                  machineCode: 'DG-CR01',
                  machineType: 'Corrugation',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k',
                    description: '5 Ply Auto Corrugator',
                    status: 'available',
                    capacity: 10000
                  }
                }
              ]
            },
            // Step 4: Flute Lamination (2 machines)
            {
              stepNo: 4,
              stepName: 'FluteLamination',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k2',
                  machineCode: 'FL-LAM01',
                  machineType: 'Flute Lamination',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k2',
                    description: 'Flute Lamination Machine 1',
                    status: 'available',
                    capacity: 8000
                  }
                },
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k3',
                  machineCode: 'FL-LAM02',
                  machineType: 'Flute Lamination',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k3',
                    description: 'Flute Lamination Machine 2',
                    status: 'available',
                    capacity: 7500
                  }
                }
              ]
            },
            // Step 5: Punching (1 machine)
            {
              stepNo: 5,
              stepName: 'Punching',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k4',
                  machineCode: 'PUNCH-01',
                  machineType: 'Punching',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k4',
                    description: 'Punching Machine',
                    status: 'available',
                    capacity: 6000
                  }
                }
              ]
            },
            // Step 6: Die Cutting (2 machines)
            {
              stepNo: 6,
              stepName: 'DieCutting',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k5',
                  machineCode: 'DIE-01',
                  machineType: 'Die Cutting',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k5',
                    description: 'Die Cutting Machine 1',
                    status: 'available',
                    capacity: 5000
                  }
                },
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k6',
                  machineCode: 'DIE-02',
                  machineType: 'Die Cutting',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k6',
                    description: 'Die Cutting Machine 2',
                    status: 'available',
                    capacity: 4500
                  }
                }
              ]
            },
            // Step 7: Flap Pasting (1 machine)
            {
              stepNo: 7,
              stepName: 'FlapPasting',
              status: 'planned',
              machineDetails: [
                {
                  unit: 'Mk',
                  machineId: 'cmfig074n000f1ewlonanyt6k7',
                  machineCode: 'FLAP-01',
                  machineType: 'Flap Pasting',
                  machine: {
                    id: 'cmfig074n000f1ewlonanyt6k7',
                    description: 'Flap Pasting Machine',
                    status: 'available',
                    capacity: 4000
                  }
                }
              ]
            },
            // Step 8: Quality Control (no machine required)
            {
              stepNo: 8,
              stepName: 'QualityControl',
              status: 'planned',
              machineDetails: [{
                unit: 'Mk',
                machineCode: null,
                machineType: 'Not Assigned'
              }]
            },
            // Step 9: Dispatch (no machine required)
            {
              stepNo: 9,
              stepName: 'Dispatch',
              status: 'planned',
              machineDetails: [{
                unit: 'Mk',
                machineCode: null,
                machineType: 'Not Assigned'
              }]
            }
          ]
        }
      },
      include: {
        steps: true
      }
    });

    console.log('✅ Job planning created successfully!');
    console.log('Job Number:', jobPlanning.nrcJobNo);
    console.log('Job ID:', jobPlanning.jobPlanId);
    console.log('Total Steps:', jobPlanning.steps.length);
    
    console.log('\n📋 Step Details:');
    jobPlanning.steps.forEach(step => {
      console.log(`\nStep ${step.stepNo}: ${step.stepName}`);
      console.log(`  Status: ${step.status}`);
      console.log(`  Machines: ${step.machineDetails.length}`);
      
      if (step.machineDetails.length > 1) {
        step.machineDetails.forEach((machine, index) => {
          console.log(`    Machine ${index + 1}: ${machine.machine?.description || 'N/A'} (${machine.machineCode})`);
        });
      } else if (step.machineDetails[0]?.machine) {
        console.log(`    Machine: ${step.machineDetails[0].machine.description} (${step.machineDetails[0].machineCode})`);
      } else {
        console.log(`    Machine: Not Required`);
      }
    });

    console.log('\n🎯 Multi-machine steps:');
    const multiMachineSteps = jobPlanning.steps.filter(step => 
      step.machineDetails.length > 1 && step.machineDetails[0]?.machine
    );
    multiMachineSteps.forEach(step => {
      console.log(`- ${step.stepName}: ${step.machineDetails.length} machines`);
    });

  } catch (error) {
    console.error('❌ Error creating job planning:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createMultiMachineJob();
