const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function populateMissingData() {
  try {
    console.log('=== Populating Missing Data ===');
    
    // Get all JobStepMachine records that need nrcJobNo and stepNo
    const jobStepMachines = await prisma.jobStepMachine.findMany({
      where: {
        OR: [
          { nrcJobNo: null },
          { stepNo: null }
        ]
      },
      include: {
        jobStep: {
          include: {
            jobPlanning: true
          }
        }
      }
    });

    console.log(`Found ${jobStepMachines.length} JobStepMachine records to update`);

    for (const jsm of jobStepMachines) {
      if (jsm.jobStep && jsm.jobStep.jobPlanning) {
        const nrcJobNo = jsm.jobStep.jobPlanning.nrcJobNo;
        const stepNo = jsm.jobStep.stepNo;
        
        console.log(`\nUpdating JobStepMachine ${jsm.id}:`);
        console.log(`  Setting nrcJobNo: ${nrcJobNo}`);
        console.log(`  Setting stepNo: ${stepNo}`);
        
        // Update the record
        await prisma.jobStepMachine.update({
          where: { id: jsm.id },
          data: {
            nrcJobNo: nrcJobNo,
            stepNo: stepNo
          }
        });
        
        // Also populate individual fields from formData if it exists
        if (jsm.formData && typeof jsm.formData === 'object') {
          const formData = jsm.formData;
          const updateData = {};
          
          // Map formData to individual fields based on step type
          if (stepNo === 1) { // PaperStore
            if (formData.quantity) updateData.quantity = formData.quantity;
            if (formData.requiredQty) updateData.requiredQty = formData.requiredQty;
            if (formData.availableQty) updateData.availableQty = formData.availableQty;
            if (formData.sheetSize) updateData.sheetSize = formData.sheetSize;
            if (formData.gsm) updateData.gsm = formData.gsm;
            if (formData.remarks) updateData.remarks = formData.remarks;
          } else if (stepNo === 2) { // Printing
            if (formData.quantity) updateData.quantity = formData.quantity;
            if (formData.colors || formData.colorsUsed) updateData.colorsUsed = formData.colors || formData.colorsUsed;
            if (formData.processColors) updateData.processColors = formData.processColors;
            if (formData.specialColors) updateData.specialColors = formData.specialColors;
            if (formData.inksUsed) updateData.inksUsed = formData.inksUsed;
            if (formData.coatingType) updateData.coatingType = formData.coatingType;
            if (formData.quantityOK || formData.finalQuantity) updateData.quantityOK = formData.quantityOK || formData.finalQuantity;
            if (formData.remarks) updateData.remarks = formData.remarks;
          } else if (stepNo === 3) { // Corrugation
            if (formData.quantity) updateData.quantity = formData.quantity;
            if (formData.fluteType) updateData.fluteType = formData.fluteType;
            if (formData.gsm1) updateData.gsm1 = formData.gsm1;
            if (formData.gsm2) updateData.gsm2 = formData.gsm2;
            if (formData.size) updateData.size = formData.size;
            if (formData.sheetsCount) updateData.sheetsCount = formData.sheetsCount;
            if (formData.remarks) updateData.remarks = formData.remarks;
          }
          
          if (Object.keys(updateData).length > 0) {
            console.log(`  Populating individual fields:`, updateData);
            await prisma.jobStepMachine.update({
              where: { id: jsm.id },
              data: updateData
            });
          }
        }
      }
    }

    console.log('\n=== Data Population Complete ===');
    
    // Verify the updates
    const updatedRecords = await prisma.jobStepMachine.findMany();
    console.log('\n=== Verification ===');
    updatedRecords.forEach((jsm, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${jsm.id}`);
      console.log(`  nrcJobNo: ${jsm.nrcJobNo || 'NULL'}`);
      console.log(`  stepNo: ${jsm.stepNo || 'NULL'}`);
      console.log(`  status: ${jsm.status}`);
      if (jsm.stepNo === 2) { // Printing
        console.log(`  colorsUsed: ${jsm.colorsUsed || 'NULL'}`);
        console.log(`  inksUsed: ${jsm.inksUsed || 'NULL'}`);
        console.log(`  coatingType: ${jsm.coatingType || 'NULL'}`);
        console.log(`  quantityOK: ${jsm.quantityOK || 'NULL'}`);
      } else if (jsm.stepNo === 3) { // Corrugation
        console.log(`  fluteType: ${jsm.fluteType || 'NULL'}`);
        console.log(`  gsm1: ${jsm.gsm1 || 'NULL'}`);
        console.log(`  gsm2: ${jsm.gsm2 || 'NULL'}`);
        console.log(`  sheetsCount: ${jsm.sheetsCount || 'NULL'}`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

populateMissingData();
