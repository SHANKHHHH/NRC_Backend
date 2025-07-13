// Simple test script to verify the logging system
// Run with: node test-logger.js

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function testLogger() {
  try {
    console.log("Testing Activity Log System...\n");

    // Test 1: Create a test user if not exists
    let testUser = await prisma.user.findFirst({
      where: { id: "NRC999" },
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          id: "NRC999",
          email: "test@example.com",
          password: "hashedpassword",
          role: "admin",
          name: "Test User",
        },
      });
      console.log("Created test user:", testUser.id);
    } else {
      console.log(" Test user exists:", testUser.id);
    }

    // Test 2: Create some activity logs
    const testActions = [
      {
        userId: testUser.id,
        action: "Test Action 1",
        details: "This is a test log entry",
      },
      {
        userId: testUser.id,
        action: "Test Action 2",
        details: "Another test log entry with more details",
      },
      {
        userId: testUser.id,
        action: "Job Created",
        details: "Test job creation log",
      },
    ];

    for (const action of testActions) {
      await prisma.activityLog.create({
        data: action,
      });
    }
    console.log(" Created 3 test activity logs");

    // Test 3: Query activity logs
    const logs = await prisma.activityLog.findMany({
      where: { userId: testUser.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    console.log("\n Recent Activity Logs:");
    logs.forEach((log, index) => {
      console.log(
        `${index + 1}. ${log.action} - ${
          log.details
        } (${log.createdAt.toISOString()})`
      );
    });

    // Test 4: Get activity summary
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const todayCount = await prisma.activityLog.count({
      where: {
        createdAt: { gte: startOfDay },
      },
    });

    const totalCount = await prisma.activityLog.count();

    console.log("\n Activity Summary:");
    console.log(`- Today's activities: ${todayCount}`);
    console.log(`- Total activities: ${totalCount}`);

    // Test 5: Test action grouping
    const topActions = await prisma.activityLog.groupBy({
      by: ["action"],
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 3,
    });

    console.log("\n Top Actions:");
    topActions.forEach((action, index) => {
      console.log(
        `${index + 1}. ${action.action}: ${action._count.action} times`
      );
    });

    console.log("\nAll tests completed successfully!");
    console.log("\nTo view logs in your application:");
    console.log("- GET /api/activity-logs (admin only)");
    console.log("- GET /api/activity-logs/user/NRC999");
    console.log("- GET /api/activity-logs/summary (admin only)");
  } catch (error) {
    console.error(" Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testLogger();
