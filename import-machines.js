const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const machines = [
  // NR Unit - Printing Machines
  { unit: "NR", machineCode: "NR-PR01", machineType: "Printing Heidelber Automatic", capacity: 27000, remarks: "Up to 8 color with varnish" },
  { unit: "NR", machineCode: "NR-PR02", machineType: "Printing Lithrone F Automatio", capacity: 9000, remarks: "Up to 5 color with UV coating" },
  { unit: "NR", machineCode: "NR-PR03", machineType: "Printing Mitsubish Automatic", capacity: 18000, remarks: "Up to 6 color with varnish" },
  { unit: "NR", machineCode: "NR-PR04", machineType: "Printing Printing M Automatic", capacity: 8000, remarks: "1 Color Printing" },
  { unit: "NR", machineCode: "NR-PR05", machineType: "Printing Printing M Automatic", capacity: 15000, remarks: "2 Color Printing" },

  // MK Unit - Corrugation Machines
  { unit: "MK", machineCode: "MK-CR01", machineType: "Corrugatic Corrugatic Automatic", capacity: 10000, remarks: "Reel size up to 107\"" },
  { unit: "MK", machineCode: "MK-CR02", machineType: "Corrugatic 5 Ply Auto Automatio", capacity: 30000, remarks: "Reel size up to 117\"" },
  { unit: "MK", machineCode: "MK-CR03", machineType: "Corrugatic Corrugatic Automatic", capacity: 7000, remarks: "Same as CR01 (107\")" },
  { unit: "MK", machineCode: "MK-CR04", machineType: "Corrugatic 5 Ply Auto Automatio", capacity: 25000, remarks: "Main 5-ply corrugation line" },

  // NR1 Unit - Flute Lamination Machines
  { unit: "NR1", machineCode: "NR1-FL01", machineType: "Flute Lam Flute Lam Automatio", capacity: 20, remarks: "A Flute and B Flute compatible" },
  { unit: "NR1", machineCode: "NR1-FL02", machineType: "Flute Lam Flute Lam Semi Auto", capacity: 100000, remarks: "Reel size up to 158\"" },

  // DG Unit - Manual Punching
  { unit: "DG", machineCode: "DG-MP01", machineType: "Manual Pu Manual Pu Manual", capacity: 5000, remarks: "Auto lamination" },
  { unit: "DG", machineCode: "DG-MP02", machineType: "Manual Pu Punching Manual", capacity: 15000, remarks: "Die punching" },

  // NR Unit - Auto Punching
  { unit: "NR", machineCode: "NR-PC01", machineType: "Auto Pund Auto Pund Automatic", capacity: 8000, remarks: "High-speed die punching" },

  // MK Unit - Manual Pasting
  { unit: "MK", machineCode: "MK-TB01", machineType: "Manual FI Side Flap Manual", capacity: 12000, remarks: "Manual pasting" },
  { unit: "MK", machineCode: "MK-TB02", machineType: "Manual FI Manual Pa Manual", capacity: 10000, remarks: "Auto side flap pasting" },

  // MK Unit - Auto Flap Pasting
  { unit: "MK", machineCode: "MK-PN01", machineType: "Auto Flap Auto Side Automatic", capacity: 15000, remarks: "Auto side flap pasting" },

  // Paper Cutting Machines
  { unit: "NR", machineCode: "NR-CU01", machineType: "Paper Cut Plate Out Automatic", capacity: 20000, remarks: "For CTP/plate making before printing" },
  { unit: "NR", machineCode: "NR-CU02", machineType: "Paper Cut Box Samp Automatic", capacity: 5000, remarks: "For sample or prototype box making" },
  { unit: "NR", machineCode: "NR-CU03", machineType: "Paper Cut Paper Cut Manual", capacity: 8000, remarks: "For sheet size trimming / Inserters" },

  // Foiling Machines
  { unit: "MK", machineCode: "MK-FO01", machineType: "Foiling Ma Foiling Ma Automatio", capacity: 6000, remarks: "For hot stamping/foil work" },

  // Thin Blade Machines
  { unit: "NR", machineCode: "NR-TB01", machineType: "Thin Blade Thin Blade Automatic", capacity: 12000, remarks: "Slitting/scoring" },

  // Pinning Machines
  { unit: "MK", machineCode: "MK-PI01", machineType: "Pinning Pinning M Manual", capacity: 3000, remarks: "Manual stitching" }
];

async function importMachines() {
  try {
    console.log('Starting machine import...');
    
    // Clear existing machines (optional - remove this if you want to keep existing data)
    // await prisma.machine.deleteMany({});
    
    let importedCount = 0;
    let skippedCount = 0;

    for (const machine of machines) {
      try {
        // Check if machine already exists
        const existingMachine = await prisma.machine.findFirst({
          where: { machineCode: machine.machineCode }
        });

        if (existingMachine) {
          console.log(`⚠️  Machine ${machine.machineCode} already exists, skipping...`);
          skippedCount++;
          continue;
        }

        // Create machine
        const newMachine = await prisma.machine.create({
          data: {
            unit: machine.unit,
            machineCode: machine.machineCode,
            machineType: machine.machineType,
            description: `${machine.machineType} - ${machine.remarks}`,
            type: getMachineCategory(machine.machineType),
            capacity: machine.capacity,
            remarks: machine.remarks,
            status: 'available',
            isActive: true
          }
        });

        console.log(`✅ Imported: ${machine.machineCode} - ${machine.machineType}`);
        importedCount++;
      } catch (error) {
        console.error(`❌ Failed to import ${machine.machineCode}:`, error.message);
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`✅ Successfully imported: ${importedCount} machines`);
    console.log(`⚠️  Skipped (already exists): ${skippedCount} machines`);
    console.log(`📝 Total processed: ${machines.length} machines`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to categorize machine types
function getMachineCategory(machineType) {
  if (machineType.toLowerCase().includes('printing')) return 'Printing';
  if (machineType.toLowerCase().includes('corrugatic')) return 'Corrugation';
  if (machineType.toLowerCase().includes('flute')) return 'Flute Lamination';
  if (machineType.toLowerCase().includes('punching')) return 'Punching';
  if (machineType.toLowerCase().includes('pasting')) return 'Pasting';
  if (machineType.toLowerCase().includes('cut')) return 'Cutting';
  if (machineType.toLowerCase().includes('foiling')) return 'Foiling';
  if (machineType.toLowerCase().includes('blade')) return 'Slitting';
  if (machineType.toLowerCase().includes('pinning')) return 'Stitching';
  return 'Other';
}

// Run the import
importMachines();
