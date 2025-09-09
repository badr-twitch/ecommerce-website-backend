const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testOrdersAPI() {
  console.log('🧪 Testing Orders API...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing server health...');
    try {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      console.log('✅ Server is running:', healthResponse.data.message);
    } catch (error) {
      console.log('❌ Server health check failed:', error.message);
      return;
    }

    // Test 2: Get orders (will fail without auth, but we can test the endpoint exists)
    console.log('\n2️⃣ Testing orders endpoint...');
    try {
      await axios.get(`${BASE_URL}/orders`);
      console.log('❌ Orders endpoint should require authentication');
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('✅ Orders endpoint exists and requires authentication');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Test 3: Test with invalid order ID
    console.log('\n3️⃣ Testing invalid order ID...');
    try {
      await axios.get(`${BASE_URL}/orders/invalid-id`);
      console.log('❌ Should have failed with invalid ID');
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 404) {
        console.log('✅ Invalid order ID properly rejected');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    console.log('\n🎉 Orders API tests completed!');
    console.log('\n📝 To test with authentication:');
    console.log('1. Start your frontend application');
    console.log('2. Log in as a user');
    console.log('3. Navigate to /orders or /profile');
    console.log('4. Check the browser console for any errors');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the tests
testOrdersAPI();
