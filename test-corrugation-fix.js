const axios = require('axios');

async function testCorrugationFix() {
  try {
    // Test with a corrugator user
    console.log('🔐 Testing login with corrugator user...');
    
    // Try to login with one of the corrugator users
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'corrugator@example.com', // This user has role: ["corrugator"]
      password: 'password123' // You'll need to use the actual password
    });
    
    if (loginResponse.data.success) {
      const token = loginResponse.data.token;
      console.log('✅ Login successful');
      
      // Test corrugation endpoint
      console.log('🔍 Testing corrugation endpoint...');
      const corrugationResponse = await axios.get('http://localhost:3000/api/corrugation', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('📊 Corrugation response:', {
        success: corrugationResponse.data.success,
        count: corrugationResponse.data.count,
        dataLength: corrugationResponse.data.data?.length || 0
      });
      
      if (corrugationResponse.data.count > 0) {
        console.log('✅ SUCCESS: Corrugation data is now visible!');
        console.log('Sample data:', corrugationResponse.data.data[0]);
      } else {
        console.log('❌ Still no data visible');
      }
    } else {
      console.log('❌ Login failed:', loginResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testCorrugationFix();
