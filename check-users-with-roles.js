const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function checkUsersWithRoles() {
  try {
    console.log('🔍 Checking all users and their roles...');
    
    // 1. Log in as admin user
    console.log('\n1. Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'corrugationtesting@ex.com',
      password: '1234567'
    });
    const token = loginResponse.data.accessToken || loginResponse.data.acessToken || loginResponse.data.data?.accessToken;
    if (!token) {
      throw new Error('Failed to get access token');
    }
    console.log('✅ Admin login successful');
    
    // 2. Get all users
    console.log('\n2. Getting all users...');
    try {
      const usersResponse = await axios.get(`${BASE_URL}/users/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (usersResponse.data.success) {
        const users = usersResponse.data.data;
        console.log(`✅ Found ${users.length} users:`);
        
        users.forEach((user, index) => {
          console.log(`\n${index + 1}. User: ${user.email}`);
          console.log(`   - Name: ${user.name}`);
          console.log(`   - Roles: ${user.roles}`);
          console.log(`   - Active: ${user.isActive}`);
          
          if (user.roles && user.roles.includes('paperstore')) {
            console.log('   ✅ HAS PAPERSTORE ROLE');
          }
        });
      }
    } catch (error) {
      console.log('❌ Error getting users:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.response?.data || error.message);
  }
}

checkUsersWithRoles();
