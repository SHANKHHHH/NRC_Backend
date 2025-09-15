const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Updated machine data from the spreadsheet
const machines = [
  // NR Unit - Printing Machines
  { unit: 'NR', machineCode: 'NR-PR01', machineType: 'Printing', description: 'Heidelber', type: 'Automatic', capacity: 27000, remarks: 'Up to 8 col' },
  { unit: 'NR', machineCode: 'NR-PR02', machineType: 'Printing', description: 'Lithrone F', type: 'Automatic', capacity: 9000, remarks: 'Up to 5 col' },
  { unit: 'NR', machineCode: 'NR-PR03', machineType: 'Printing', description: 'Mitsubish', type: 'Automatic', capacity: 180000, remarks: 'Up to 6 col' },
  { unit: 'NR', machineCode: 'NR-PR04', machineType: 'Printing', description: 'Printing M', type: 'Automatic', capacity: 8000, remarks: '1 Color Pri' },
  { unit: 'NR', machineCode: 'NR-PR05', machineType: 'Printing', description: 'Printing M', type: 'Automatic', capacity: 15000, remarks: '2 Color Pri' },

  // MK Unit - Printing Machines
  { unit: 'MK', machineCode: 'MK-PR01', machineType: 'Printing', description: 'Printing M', type: 'Automatic', capacity: 8000, remarks: '1 Color Pri' },
  { unit: 'MK', machineCode: 'MK-PR02', machineType: 'Printing', description: 'Printing M', type: 'Automatic', capacity: 15000, remarks: '2 Color Pri' },

  // NR1 Unit - Corrugating Machines
  { unit: 'NR1', machineCode: 'NR1-CR01', machineType: 'Corrugatic', description: 'Corrugatic', type: 'Automatic', capacity: 15000, remarks: 'Reel size u' },
  { unit: 'NR1', machineCode: 'NR1-CR02', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'Same as C' },
  { unit: 'NR1', machineCode: 'NR1-CR03', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'Main 5-ply' },
  { unit: 'NR1', machineCode: 'NR1-CR04', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'A Flute an' },

  // MK Unit - Corrugating Machines
  { unit: 'MK', machineCode: 'MK-AP01', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'Same as C' },
  { unit: 'MK', machineCode: 'MK-CR01', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'Main 5-ply' },

  // NR2 Unit - Corrugating Machines
  { unit: 'NR2', machineCode: 'NR2-CR04', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'A Flute an' },

  // DG Unit - Corrugating Machines
  { unit: 'DG', machineCode: 'DG-CR01', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'Main 5-ply' },
  { unit: 'DG', machineCode: 'DG-CR02', machineType: 'Corrugatic', description: '5 Ply Auto', type: 'Automatic', capacity: 10000, remarks: 'A Flute an' },

  // NR1 Unit - Flute Lamination Machines
  { unit: 'NR1', machineCode: 'NR1-FL01', machineType: 'Flute Lam', description: 'Flute Lam', type: 'Automatic', capacity: 30000, remarks: 'Auto lami' },
  { unit: 'NR1', machineCode: 'NR1-FL02', machineType: 'Flute Lam', description: 'Flute Lam', type: 'Semi Auto', capacity: 22000, remarks: 'Auto lami' },

  // NR2 Unit - Flute Lamination Machines
  { unit: 'NR2', machineCode: 'NR2-FL03', machineType: 'Flute Lam', description: 'Flute Lam', type: 'Semi Auto', capacity: 22000, remarks: 'Auto lami' },

  // DG Unit - Flute Lamination Machines
  { unit: 'DG', machineCode: 'DG-FL01', machineType: 'Flute Lam', description: 'Flute Lam', type: 'Semi Auto', capacity: 22000, remarks: 'Auto lami' },

  // NR1 Unit - Manual Punching Machines
  { unit: 'NR1', machineCode: 'NR1-MP01', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },
  { unit: 'NR1', machineCode: 'NR1-MP02', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },
  { unit: 'NR1', machineCode: 'NR1-MP03', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },
  { unit: 'NR1', machineCode: 'NR1-MP04', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },

  // MK Unit - Manual Punching Machines
  { unit: 'MK', machineCode: 'MK-MP01', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },
  { unit: 'MK', machineCode: 'MK-MP02', machineType: 'Manual Pu', description: 'Punching', type: 'Manual', capacity: 7000, remarks: 'Die punch' },

  // NR2 Unit - Manual Punching Machines
  { unit: 'NR2', machineCode: 'NR2-MP05', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },

  // DG Unit - Manual Punching Machines
  { unit: 'DG', machineCode: 'DG-MP01', machineType: 'Manual Pu', description: 'Manual Pu', type: 'Manual', capacity: 7000, remarks: 'Die punch' },
  { unit: 'DG', machineCode: 'DG-MP02', machineType: 'Manual Pu', description: 'Punching', type: 'Manual', capacity: 7000, remarks: 'Die punch' },

  // NR1 Unit - Auto Punching Machines
  { unit: 'NR1', machineCode: 'NR1-AP01', machineType: 'Auto Pund', description: 'Auto Pund', type: 'Automatic', capacity: 25000, remarks: 'High-spee' },
  { unit: 'NR1', machineCode: 'NR1-AP02', machineType: 'Auto Pund', description: 'Auto Pund', type: 'Automatic', capacity: 25000, remarks: 'High-spee' },

  // NR2 Unit - Auto Punching Machines
  { unit: 'NR2', machineCode: 'NR2-AP03', machineType: 'Auto Pund', description: 'Auto Pund', type: 'Automatic', capacity: 25000, remarks: 'High-spee' },

  // NR1 Unit - Manual Side Flap Machines
  { unit: 'NR1', machineCode: 'NR1-MSP01', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },
  { unit: 'NR1', machineCode: 'NR1-MSP02', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },
  { unit: 'NR1', machineCode: 'NR1-MSP03', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },
  { unit: 'NR1', machineCode: 'NR1-MSP04', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },

  // MK Unit - Manual Side Flap Machines
  { unit: 'MK', machineCode: 'MK-MSP01', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },
  { unit: 'MK', machineCode: 'MK-MSP02', machineType: 'Manual FI', description: 'Manual Pa', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },

  // NR Unit - Manual Side Flap Machines
  { unit: 'NR', machineCode: 'NR-MSP01', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },

  // NR2 Unit - Manual Side Flap Machines
  { unit: 'NR2', machineCode: 'NR2-MSP01', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },
  { unit: 'NR2', machineCode: 'NR2-MSP02', machineType: 'Manual FI', description: 'Side Flap', type: 'Manual', capacity: 10000, remarks: 'Manual pa' },

  // NR1 Unit - Auto Side Flap Machines
  { unit: 'NR1', machineCode: 'NR1-ASP01', machineType: 'Auto Flap', description: 'Auto Side', type: 'Automatic', capacity: 30000, remarks: 'Auto side' },

  // DG Unit - Auto Side Flap Machines
  { unit: 'DG', machineCode: 'DG-ASP02', machineType: 'Auto Flap', description: 'Auto Side', type: 'Automatic', capacity: 30000, remarks: 'Auto side' },

  // NR Unit - Paper Cut Machines
  { unit: 'NR', machineCode: 'NR-PC01', machineType: 'Paper Cut', description: 'Plate Out', type: 'Automatic', capacity: 20, remarks: 'For CTP/pl' },
  { unit: 'NR', machineCode: 'NR-PC02', machineType: 'Paper Cut', description: 'Box Samp', type: 'Automatic', capacity: 100000, remarks: 'For sampl' },
  { unit: 'NR', machineCode: 'NR-PC03', machineType: 'Paper Cut', description: 'Paper Cut', type: 'Automatic', capacity: 100000, remarks: 'For sheet' },
  { unit: 'NR', machineCode: 'NR-PC04', machineType: 'Paper Cut', description: 'Paper Cut', type: 'Manual', capacity: 100000, remarks: 'For sheet' },

  // NR1 Unit - Foiling Machines
  { unit: 'NR1', machineCode: 'NR1-FM01', machineType: 'Foiling Ma', description: 'Foiling Ma', type: 'Automatic', capacity: 10000, remarks: 'For hot sta' },

  // MK Unit - Thin Blade Machines
  { unit: 'MK', machineCode: 'MK-TB01', machineType: 'Thin Blade', description: 'Thin Blade', type: 'Automatic', capacity: 5000, remarks: 'Slitting/sc' },
  { unit: 'MK', machineCode: 'MK-TB02', machineType: 'Thin Blade', description: 'Thin Blade', type: 'Automatic', capacity: 5000, remarks: 'Slitting/sc' },

  // MK Unit - Pinning Machines
  { unit: 'MK', machineCode: 'MK-PN01', machineType: 'Pinning', description: 'Pinning M', type: 'Manual', capacity: 5000, remarks: 'Manual sti' },
  { unit: 'MK', machineCode: 'MK-PN02', machineType: 'Pinning', description: 'Pinning M', type: 'Manual', capacity: 5000, remarks: 'Manual sti' },
  { unit: 'MK', machineCode: 'MK-PN03', machineType: 'Pinning', description: 'Pinning M', type: 'Manual', capacity: 5000, remarks: 'Manual sti' }
];

async function importMachines() {
  try {
    console.log('Starting machine import...');
    
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const machine of machines) {
      try {
        // Check if machine already exists (by machineCode and unit combination)
        const existingMachine = await prisma.machine.findFirst({
          where: { 
            machineCode: machine.machineCode,
            unit: machine.unit
          }
        });

        if (existingMachine) {
          console.log(`⚠️  Machine ${machine.machineCode} in unit ${machine.unit} already exists, skipping...`);
          skippedCount++;
          continue;
        }

        // Create machine
        const newMachine = await prisma.machine.create({
          data: {
            unit: machine.unit,
            machineCode: machine.machineCode,
            machineType: machine.machineType,
            description: machine.description,
            type: machine.type,
            capacity: machine.capacity,
            remarks: machine.remarks,
            status: 'available',
            isActive: true
          }
        });

        console.log(`✅ Imported: ${machine.machineCode} - ${machine.machineType} (${machine.unit})`);
        importedCount++;
      } catch (error) {
        console.error(`❌ Failed to import ${machine.machineCode} in ${machine.unit}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`✅ Successfully imported: ${importedCount} machines`);
    console.log(`⚠️  Skipped (already exists): ${skippedCount} machines`);
    console.log(`❌ Errors: ${errorCount} machines`);
    console.log(`📝 Total processed: ${machines.length} machines`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importMachines();

