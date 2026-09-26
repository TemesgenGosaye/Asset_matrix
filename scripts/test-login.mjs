#!/usr/bin/env node

async function testLogin() {
  try {
    const response = await fetch('http://localhost:3001/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3001',
      },
      body: JSON.stringify({
        email: 'admin',
        password: 'admin123',
      }),
    });

    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    const text = await response.text();
    console.log('Response:', text);

    const cookies = response.headers.getSetCookie();
    console.log('\nCookies:', cookies);
    
    if (response.status === 200) {
      console.log('\n✓ Login successful!');
    } else {
      console.log('\n✗ Login failed');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin();
