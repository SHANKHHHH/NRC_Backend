const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function debugAuth() {
  console.log('🔍 Debugging Authentication Issues...\n');
  
  // 1. Check if users exist in database
  console.log('1️⃣ Checking existing users in database:');
  try {
    const users = await prisma.user.findMany({
      where: {
        email: {
          contains: 'test'
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        machineId: true
      }
    });
    
    console.log(`Found ${users.length} test users:`);
    users.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}`);
    });
  } catch (error) {
    console.log('❌ Error checking users:', error.message);
  }
  
  // 2. Try to create a fresh user
  console.log('\n2️⃣ Creating a fresh test user:');
  try {
    const userData = {
      name: 'Debug Test User',
      email: 'debugtest@test.com',
      password: 'password123',
      role: 'admin',
      machineId: null
    };
    
    const response = await axios.post(`${BASE_URL}/api/users/register`, userData);
    console.log('✅ User created successfully:', response.data);
  } catch (error) {
    console.log('❌ User creation failed:', error.response?.data || error.message);
  }
  
  // 3. Try to login with the fresh user
  console.log('\n3️⃣ Testing login with fresh user:');
  try {
    const loginResponse = await axios.post(`${BASE_URL}/api/users/login`, {
      email: 'debugtest@test.com',
      password: 'password123'
    });
    
    console.log('✅ Login successful!');
    console.log('Token received:', loginResponse.data.token ? 'Yes' : 'No');
    
    // 4. Test the token with a simple API call
    console.log('\n4️⃣ Testing token with API call:');
    try {
      const apiResponse = await axios.get(`${BASE_URL}/api/jobs`, {
        headers: { Authorization: `Bearer ${loginResponse.data.token}` }
      });
      console.log('✅ API call successful! Jobs count:', apiResponse.data.count);
    } catch (apiError) {
      console.log('❌ API call failed:', apiError.response?.data || apiError.message);
    }
    
  } catch (error) {
    console.log('❌ Login failed:', error.response?.data || error.message);
  }
  
  // 5. Clean up
  console.log('\n5️⃣ Cleaning up debug user:');
  try {
    await prisma.user.deleteMany({
      where: { email: 'debugtest@test.com' }
    });
    console.log('✅ Debug user cleaned up');
  } catch (error) {
    console.log('⚠️ Cleanup failed:', error.message);
  }
  
  await prisma.$disconnect();
}

debugAuth();
