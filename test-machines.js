// Test script for Machine Routes
// Run with: node test-machines.js

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testMachines() {
  try {
    console.log("Testing Machine Management System...\n");

    // Test 1: Create test machines
    // Note: Machine codes are not unique, so multiple machines can have the same code
    const testMachines = [
      {
        unit: "NR1",
        machineCode: "PR01",
        machineType: "Printing",
        description: "Heidelberg 5-Color Printing Machine",
        type: "Automatic",
        capacity: 27000,
        remarks: "Up to 5 color with varnish",
      },
      {
        unit: "NR1",
        machineCode: "CR01",
        machineType: "Corrugation",
        description: "Corrugation Machine 1",
        type: "Semi Auto",
        capacity: 15000,
        remarks: "Single facer corrugation",
      },
      {
        unit: "MK",
        machineCode: "FL01",
        machineType: "Flute Laminator",
        description: "Flute Laminator Machine",
        type: "Manual",
        capacity: 8000,
        remarks: "For flute lamination process",
      },
      {
        unit: "DG",
        machineCode: "PU01",
        machineType: "Punching",
        description: "Die Punching Machine",
        type: "Automatic",
        capacity: 12000,
        remarks: "Die cutting and punching",
      },
      {
        unit: "NR2",
        machineCode: "PR01", // Same machine code as first machine - this is allowed
        machineType: "Printing",
        description: "Heidelberg 6-Color Printing Machine",
        type: "Automatic",
        capacity: 30000,
        remarks: "Up to 6 color with varnish",
      },
    ];

    console.log("Creating test machines...");
    for (const machineData of testMachines) {
      const machine = await prisma.machine.create({
        data: machineData,
      });
      console.log(
        `Created machine: ${machine.machineCode} - ${machine.description}`
      );
    }

    // Test 2: Get all machines
    console.log("\nGetting all machines...");
    const allMachines = await prisma.machine.findMany({
      where: { isActive: true },
      orderBy: { machineCode: "asc" },
    });
    console.log(`Total machines: ${allMachines.length}`);

    // Test 3: Get available machines
    console.log("\nGetting available machines...");
    const availableMachines = await prisma.machine.findMany({
      where: {
        status: "available",
        isActive: true,
      },
      orderBy: { machineCode: "asc" },
    });
    console.log(`Available machines: ${availableMachines.length}`);

    // Test 4: Update some machines to busy status
    console.log("\nUpdating some machines to busy status...");
    const machinesToUpdate = allMachines.slice(0, 2); // Update first 2 machines
    for (const machine of machinesToUpdate) {
      await prisma.machine.update({
        where: { id: machine.id },
        data: { status: "busy" },
      });
      console.log(`Updated ${machine.machineCode} to busy status`);
    }

    // Test 5: Get busy machines
    console.log("\nGetting busy machines...");
    const busyMachines = await prisma.machine.findMany({
      where: {
        status: "busy",
        isActive: true,
      },
      include: {
        jobs: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            nrcJobNo: true,
            customerName: true,
            status: true,
          },
          take: 1,
        },
      },
      orderBy: { machineCode: "asc" },
    });
    console.log(`Busy machines: ${busyMachines.length}`);

    // Test 6: Get machine statistics
    console.log("\nGetting machine statistics...");
    const [totalMachines, availableMachines, busyMachines, inactiveMachines] =
      await Promise.all([
        prisma.machine.count(),
        prisma.machine.count({
          where: { status: "available", isActive: true },
        }),
        prisma.machine.count({ where: { status: "busy", isActive: true } }),
        prisma.machine.count({ where: { isActive: false } }),
      ]);

    console.log("Machine Statistics:");
    console.log(`- Total: ${totalMachines}`);
    console.log(`- Available: ${availableMachines}`);
    console.log(`- Busy: ${busyMachines}`);
    console.log(`- Inactive: ${inactiveMachines}`);

    // Test 7: Get machines by type
    console.log("\nGetting machines by type...");
    const machinesByType = await prisma.machine.groupBy({
      by: ["machineType"],
      _count: { machineType: true },
      where: { isActive: true },
      orderBy: { _count: { machineType: "desc" } },
    });

    console.log("Machines by Type:");
    machinesByType.forEach((type) => {
      console.log(`- ${type.machineType}: ${type._count.machineType}`);
    });

    // Test 8: Get machines by unit
    console.log("\nGetting machines by unit...");
    const machinesByUnit = await prisma.machine.groupBy({
      by: ["unit"],
      _count: { unit: true },
      where: { isActive: true },
      orderBy: { _count: { unit: "desc" } },
    });

    console.log("Machines by Unit:");
    machinesByUnit.forEach((unit) => {
      console.log(`- ${unit.unit}: ${unit._count.unit}`);
    });

    console.log("\nAll machine tests completed successfully!");
    console.log("\nAPI Endpoints to test:");
    console.log("- GET /api/machines (all machines)");
    console.log("- GET /api/machines/available (available machines)");
    console.log("- GET /api/machines/busy (busy machines)");
    console.log("- GET /api/machines/stats (machine statistics)");
    console.log("- GET /api/machines/:id (specific machine)");
    console.log(
      "- POST /api/machines (create machine - admin/production_head)"
    );
    console.log(
      "- PUT /api/machines/:id (update machine - admin/production_head)"
    );
    console.log(
      "- PATCH /api/machines/:id/status (update status - admin/production_head)"
    );
    console.log("- DELETE /api/machines/:id (delete machine - admin only)");
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testMachines();
