const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000/api';
const USER_EMAIL = 'flutetesting@gmail.com';
const USER_PASSWORD = '1234567';

let authToken = null;

// Helper function to make authenticated requests
async function makeAuthenticatedRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Error making ${method} request to ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

// 1. Authenticate user
async function authenticateUser() {
  console.log('🔐 Authenticating user...');
  try {
    const response = await makeAuthenticatedRequest('POST', '/auth/login', {
      email: USER_EMAIL,
      password: USER_PASSWORD
    });
    
    if (response.success && response.acessToken) {
      authToken = response.acessToken;
      console.log('✅ Authentication successful');
      console.log('User ID:', response.data.id);
      console.log('User Active:', response.data.userActive);
      console.log('Roles:', response.data.roles);
      return response.data;
    } else {
      throw new Error('Authentication failed');
    }
  } catch (error) {
    console.error('❌ Authentication failed:', error.response?.data || error.message);
    throw error;
  }
}

// 2. Get user profile details
async function getUserProfile() {
  console.log('\n👤 Fetching user profile...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/auth/profile');
    console.log('✅ User profile fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch user profile:', error.response?.data || error.message);
    throw error;
  }
}

// 3. Get user's assigned machines
async function getUserMachines(userId) {
  console.log('\n🔧 Fetching user assigned machines...');
  try {
    const response = await makeAuthenticatedRequest('GET', `/machine-assignments/users/${userId}/machines`);
    console.log('✅ User machines fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch user machines:', error.response?.data || error.message);
    // Return empty data instead of throwing to continue execution
    return { user: { id: userId, email: USER_EMAIL }, assignedMachines: [] };
  }
}

// 4. Get all machines
async function getAllMachines() {
  console.log('\n🏭 Fetching all machines...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/machines');
    console.log('✅ All machines fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch all machines:', error.response?.data || error.message);
    throw error;
  }
}

// 5. Get machine statistics
async function getMachineStats() {
  console.log('\n📊 Fetching machine statistics...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/machines/stats');
    console.log('✅ Machine statistics fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch machine statistics:', error.response?.data || error.message);
    // Return empty data instead of throwing to continue execution
    return { summary: {}, byType: [], byUnit: [] };
  }
}

// 6. Get job planning details (dashboard data)
async function getJobPlanningDetails() {
  console.log('\n📋 Fetching job planning details...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/planner-dashboard');
    console.log('✅ Job planning details fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch job planning details:', error.response?.data || error.message);
    // Return empty data instead of throwing to continue execution
    return { jobs: [], jobPlannings: [], completedJobs: [] };
  }
}

// 7. Get printing details (job steps)
async function getPrintingDetails() {
  console.log('\n🖨️ Fetching printing details (job steps)...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/printing-details');
    console.log('✅ Printing details fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch printing details:', error.response?.data || error.message);
    // Return empty data instead of throwing to continue execution
    return { data: [], count: 0 };
  }
}

// 8. Get dashboard data
async function getDashboardData() {
  console.log('\n📊 Fetching dashboard data...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/dashboard');
    console.log('✅ Dashboard data fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch dashboard data:', error.response?.data || error.message);
    // Return empty data instead of throwing to continue execution
    return { jobs: [], jobPlannings: [], machines: [], activityLogs: [] };
  }
}

// 9. Get activity logs for the user
async function getActivityLogs() {
  console.log('\n📝 Fetching user activity logs...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/activity-logs');
    console.log('✅ Activity logs fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch activity logs:', error.response?.data || error.message);
    return { data: [], count: 0 };
  }
}

// 10. Get completed jobs
async function getCompletedJobs() {
  console.log('\n✅ Fetching completed jobs...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/completed-jobs');
    console.log('✅ Completed jobs fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch completed jobs:', error.response?.data || error.message);
    return { data: [], count: 0 };
  }
}

// 11. Get all jobs with detailed information
async function getAllJobs() {
  console.log('\n📋 Fetching all jobs...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/jobs');
    console.log('✅ All jobs fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch all jobs:', error.response?.data || error.message);
    return { data: [], count: 0 };
  }
}

// 12. Get available machines specifically
async function getAvailableMachines() {
  console.log('\n🟢 Fetching available machines...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/machines/available');
    console.log('✅ Available machines fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch available machines:', error.response?.data || error.message);
    return [];
  }
}

// 13. Get busy machines specifically
async function getBusyMachines() {
  console.log('\n🔴 Fetching busy machines...');
  try {
    const response = await makeAuthenticatedRequest('GET', '/machines/busy');
    console.log('✅ Busy machines fetched successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Failed to fetch busy machines:', error.response?.data || error.message);
    return [];
  }
}

// 14. Get specific job step details by role
async function getJobStepsByRole() {
  console.log('\n🎯 Fetching job steps by user role...');
  try {
    // Get different types of job steps based on common roles
    const endpoints = [
      '/corrugation',
      '/flute-laminate-board-conversion', 
      '/punching',
      '/side-flap-pasting',
      '/quality-dept',
      '/dispatch-process'
    ];
    
    const roleBasedData = {};
    
    for (const endpoint of endpoints) {
      try {
        const response = await makeAuthenticatedRequest('GET', endpoint);
        roleBasedData[endpoint.replace('/', '')] = response.data || response;
      } catch (error) {
        roleBasedData[endpoint.replace('/', '')] = { data: [], count: 0, error: error.message };
      }
    }
    
    console.log('✅ Role-based job steps fetched successfully');
    return roleBasedData;
  } catch (error) {
    console.error('❌ Failed to fetch role-based job steps:', error.message);
    return {};
  }
}

// Main function to fetch all user details
async function fetchAllUserDetails() {
  console.log('🚀 Starting to fetch details for user:', USER_EMAIL);
  console.log('=' .repeat(80));
  
  try {
    // Step 1: Authenticate
    const authData = await authenticateUser();
    const userId = authData.id;
    
    // Step 2: Get user profile
    const userProfile = await getUserProfile();
    
    // Step 3: Get user's assigned machines
    const userMachines = await getUserMachines(userId);
    
    // Step 4: Get all machines
    const allMachines = await getAllMachines();
    
    // Step 5: Get machine statistics
    const machineStats = await getMachineStats();
    
    // Step 6: Get job planning details
    const jobPlanningDetails = await getJobPlanningDetails();
    
    // Step 7: Get printing details (job steps)
    const printingDetails = await getPrintingDetails();
    
    // Step 8: Get dashboard data
    const dashboardData = await getDashboardData();
    
    // Step 9: Get activity logs
    const activityLogs = await getActivityLogs();
    
    // Step 10: Get completed jobs
    const completedJobs = await getCompletedJobs();
    
    // Step 11: Get all jobs
    const allJobs = await getAllJobs();
    
    // Step 12: Get available machines
    const availableMachines = await getAvailableMachines();
    
    // Step 13: Get busy machines
    const busyMachines = await getBusyMachines();
    
    // Step 14: Get role-based job steps
    const roleBasedJobSteps = await getJobStepsByRole();
    
    // Compile comprehensive report
    const comprehensiveReport = {
      user: {
        authentication: authData,
        profile: userProfile
      },
      machines: {
        userAssigned: userMachines,
        allMachines: allMachines,
        availableMachines: availableMachines,
        busyMachines: busyMachines,
        statistics: machineStats
      },
      jobs: {
        allJobs: allJobs,
        completedJobs: completedJobs,
        planningDetails: jobPlanningDetails,
        printingDetails: printingDetails,
        dashboardData: dashboardData,
        roleBasedSteps: roleBasedJobSteps
      },
      activity: {
        activityLogs: activityLogs
      },
      summary: {
        totalMachines: allMachines.length,
        userAssignedMachines: userMachines.assignedMachines?.length || 0,
        totalJobSteps: printingDetails.count || 0,
        availableMachines: availableMachines.length,
        busyMachines: busyMachines.length,
        totalJobs: allJobs.count || 0,
        completedJobsCount: completedJobs.count || 0,
        activityLogsCount: activityLogs.count || 0
      }
    };
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE USER DETAILS REPORT');
    console.log('='.repeat(80));
    
    console.log('\n👤 USER INFORMATION:');
    console.log('Email:', USER_EMAIL);
    console.log('User ID:', userProfile.id);
    console.log('Roles:', userProfile.roles);
    console.log('Active:', userProfile.isActive);
    console.log('Last Login:', userProfile.lastLogin);
    console.log('Created At:', userProfile.createdAt);
    
    console.log('\n🔧 ASSIGNED MACHINES:');
    if (userMachines.assignedMachines && userMachines.assignedMachines.length > 0) {
      userMachines.assignedMachines.forEach((assignment, index) => {
        console.log(`${index + 1}. ${assignment.machine.machineCode} - ${assignment.machine.machineType}`);
        console.log(`   Unit: ${assignment.machine.unit}, Status: ${assignment.machine.status}`);
        console.log(`   Description: ${assignment.machine.description}`);
        console.log(`   Assigned At: ${assignment.assignedAt}`);
      });
    } else {
      console.log('No machines assigned to this user.');
    }
    
    console.log('\n🏭 MACHINE STATISTICS:');
    if (machineStats.summary) {
      console.log('Total Machines:', machineStats.summary.total || 0);
      console.log('Available:', machineStats.summary.available || 0);
      console.log('Busy:', machineStats.summary.busy || 0);
      console.log('Inactive:', machineStats.summary.inactive || 0);
    }
    
    console.log('\n📊 JOB STEPS SUMMARY:');
    console.log('Total Job Steps:', printingDetails.count || 0);
    if (printingDetails.data && printingDetails.data.length > 0) {
      const stepStatuses = printingDetails.data.reduce((acc, step) => {
        acc[step.status] = (acc[step.status] || 0) + 1;
        return acc;
      }, {});
      console.log('Step Status Breakdown:', stepStatuses);
    }
    
    console.log('\n📋 RECENT JOBS:');
    if (dashboardData.jobs && dashboardData.jobs.length > 0) {
      dashboardData.jobs.slice(0, 5).forEach((job, index) => {
        console.log(`${index + 1}. ${job.nrcJobNo} - ${job.customerName}`);
        console.log(`   Status: ${job.status}, Created: ${job.createdAt}`);
      });
    } else {
      console.log('No recent jobs found.');
    }
    
    console.log('\n📈 DETAILED SUMMARY:');
    console.log('Total Machines in System:', comprehensiveReport.summary.totalMachines);
    console.log('Machines Assigned to User:', comprehensiveReport.summary.userAssignedMachines);
    console.log('Available Machines:', comprehensiveReport.summary.availableMachines);
    console.log('Busy Machines:', comprehensiveReport.summary.busyMachines);
    console.log('Total Jobs:', comprehensiveReport.summary.totalJobs);
    console.log('Completed Jobs:', comprehensiveReport.summary.completedJobsCount);
    console.log('Total Job Steps:', comprehensiveReport.summary.totalJobSteps);
    console.log('Activity Logs:', comprehensiveReport.summary.activityLogsCount);
    
    console.log('\n🎯 ROLE-BASED JOB STEPS:');
    Object.keys(roleBasedJobSteps).forEach(role => {
      const data = roleBasedJobSteps[role];
      if (data.error) {
        console.log(`${role}: Error - ${data.error}`);
      } else {
        console.log(`${role}: ${data.count || data.data?.length || 0} items`);
      }
    });
    
    console.log('\n📝 RECENT ACTIVITY LOGS:');
    if (activityLogs.data && activityLogs.data.length > 0) {
      activityLogs.data.slice(0, 3).forEach((log, index) => {
        console.log(`${index + 1}. ${log.action || 'Unknown action'} - ${log.timestamp || 'No timestamp'}`);
        console.log(`   Details: ${log.details || 'No details'}`);
      });
    } else {
      console.log('No recent activity logs found.');
    }
    
    console.log('\n✅ COMPLETED JOBS:');
    if (completedJobs.data && completedJobs.data.length > 0) {
      completedJobs.data.slice(0, 3).forEach((job, index) => {
        console.log(`${index + 1}. ${job.nrcJobNo || 'Unknown job'} - ${job.customerName || 'Unknown customer'}`);
        console.log(`   Completed: ${job.completedAt || 'No completion date'}`);
      });
    } else {
      console.log('No completed jobs found.');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ All user details fetched successfully!');
    console.log('='.repeat(80));
    
    return comprehensiveReport;
    
  } catch (error) {
    console.error('\n❌ Error fetching user details:', error.message);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  fetchAllUserDetails()
    .then((report) => {
      console.log('\n🎉 Script completed successfully!');
      
      // Optionally save the full report to a JSON file
      const fs = require('fs');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `user-details-report-${timestamp}.json`;
      
      try {
        fs.writeFileSync(filename, JSON.stringify(report, null, 2));
        console.log(`📄 Full report saved to: ${filename}`);
      } catch (error) {
        console.log('⚠️  Could not save report to file:', error.message);
      }
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error.message);
      process.exit(1);
    });
}

// Function to create a formatted summary report
function createSummaryReport(report) {
  const summary = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                          USER DETAILS SUMMARY REPORT                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ User: ${USER_EMAIL.padEnd(65)} ║
║ ID: ${report.user.profile.id.padEnd(69)} ║
║ Roles: ${report.user.profile.roles.join(', ').padEnd(67)} ║
║ Status: ${(report.user.profile.isActive ? 'Active' : 'Inactive').padEnd(66)} ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ MACHINE STATISTICS                                                          ║
║ Total Machines: ${report.summary.totalMachines.toString().padEnd(58)} ║
║ Available: ${report.summary.availableMachines.toString().padEnd(63)} ║
║ Busy: ${report.summary.busyMachines.toString().padEnd(67)} ║
║ Assigned to User: ${report.summary.userAssignedMachines.toString().padEnd(54)} ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ JOB STATISTICS                                                              ║
║ Total Jobs: ${report.summary.totalJobs.toString().padEnd(65)} ║
║ Completed Jobs: ${report.summary.completedJobsCount.toString().padEnd(59)} ║
║ Total Job Steps: ${report.summary.totalJobSteps.toString().padEnd(61)} ║
║ Activity Logs: ${report.summary.activityLogsCount.toString().padEnd(62)} ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ LAST LOGIN: ${report.user.profile.lastLogin || 'Never'.padEnd(65)} ║
║ ACCOUNT CREATED: ${report.user.profile.createdAt || 'Unknown'.padEnd(59)} ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
  
  return summary;
}

// Enhanced main function with summary report
async function fetchAllUserDetailsWithSummary() {
  const report = await fetchAllUserDetails();
  const summary = createSummaryReport(report);
  
  console.log('\n' + summary);
  
  return { report, summary };
}

module.exports = { fetchAllUserDetails, fetchAllUserDetailsWithSummary, createSummaryReport };
