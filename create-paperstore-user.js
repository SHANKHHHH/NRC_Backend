const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function createPaperStoreUser() {
  try {
    console.log('🔧 Creating a user with paperstore role...');
    
    // 1. Log in as admin
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
    
    // 2. Create a user with paperstore role
    console.log('\n2. Creating user with paperstore role...');
    try {
      const createResponse = await axios.post(`${BASE_URL}/auth/register`, {
        name: 'Paper Store User',
        email: 'paperstore@ex.com',
        password: '1234567',
        roles: ['paperstore']
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (createResponse.data.success) {
        console.log('✅ Paper Store user created successfully');
        console.log('✅ User details:', createResponse.data.data);
      } else {
        console.log('❌ Failed to create user:', createResponse.data);
      }
    } catch (createError) {
      if (createError.response?.status === 409) {
        console.log('✅ User already exists, updating roles...');
        
        // Try to update the existing user's roles
        try {
          const updateResponse = await axios.put(`${BASE_URL}/users/paperstore@ex.com`, {
            roles: ['paperstore']
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (updateResponse.data.success) {
            console.log('✅ User roles updated successfully');
          } else {
            console.log('❌ Failed to update user roles:', updateResponse.data);
          }
        } catch (updateError) {
          console.log('❌ Error updating user roles:', updateError.response?.data || updateError.message);
        }
      } else {
        console.log('❌ Error creating user:', createError.response?.data || createError.message);
      }
    }
    
    // 3. Test login with the new user
    console.log('\n3. Testing login with Paper Store user...');
    try {
      const testLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'paperstore@ex.com',
        password: '1234567'
      });
      
      if (testLoginResponse.data.success) {
        const user = testLoginResponse.data.data;
        console.log('✅ Paper Store user login successful');
        console.log('✅ User details:');
        console.log(`  - Email: ${user.email}`);
        console.log(`  - Roles: ${user.roles}`);
        console.log(`  - Name: ${user.name}`);
        
        // 4. Test jobs endpoint with this user
        console.log('\n4. Testing jobs endpoint with Paper Store user...');
        const testToken = testLoginResponse.data.accessToken || testLoginResponse.data.acessToken || testLoginResponse.data.data?.accessToken;
        
        const jobsResponse = await axios.get(`${BASE_URL}/jobs/`, {
          headers: { Authorization: `Bearer ${testToken}` }
        });
        
        if (jobsResponse.data.success) {
          const jobs = jobsResponse.data.data;
          console.log(`✅ Jobs endpoint returned ${jobs.length} jobs for Paper Store user`);
          
          if (jobs.length > 10) {
            console.log('❌ PROBLEM: Too many jobs returned! Filtering is not working properly');
          } else {
            console.log('✅ Good: Reasonable number of jobs returned');
            jobs.forEach((job, index) => {
              console.log(`  ${index + 1}. ${job.nrcJobNo} - ${job.jobName || 'No name'}`);
            });
          }
        } else {
          console.log('❌ Jobs endpoint failed:', jobsResponse.data);
        }
      } else {
        console.log('❌ Paper Store user login failed:', testLoginResponse.data);
      }
    } catch (testError) {
      console.log('❌ Error testing Paper Store user:', testError.response?.data || testError.message);
    }
    
  } catch (error) {
    console.error('❌ Create user failed:', error.response?.data || error.message);
  }
}

createPaperStoreUser();
