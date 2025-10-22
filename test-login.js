const https = require('https');
const http = require('http');

async function testLogin() {
  try {
    console.log('🔐 Testing login...');
    
    const postData = JSON.stringify({
      email: 'info@nrcontainers.com',
      password: 'adminpassword'
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('Login response:', response);
          
          if (response.success && response.acessToken) {
            console.log('✅ Login successful');
            console.log('Token:', response.acessToken);
          } else {
            console.log('❌ Login failed');
          }
        } catch (e) {
          console.error('Error parsing response:', e);
          console.log('Raw response:', data);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('Request error:', e);
    });
    
    req.write(postData);
    req.end();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();
