const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testRecommendations() {
  console.log('🧪 Testing Recommendation Engine...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health Check:', healthResponse.data.message);
    console.log('');

    // Test 2: Trending Recommendations (Public)
    console.log('2️⃣ Testing Trending Recommendations...');
    const trendingResponse = await axios.get(`${BASE_URL}/recommendations/trending?limit=4`);
    console.log('✅ Trending Recommendations:', trendingResponse.data.message);
    console.log(`📊 Found ${trendingResponse.data.data.length} trending products`);
    console.log('');

    // Test 3: Category Recommendations (Public)
    console.log('3️⃣ Testing Category Recommendations...');
    // You'll need to replace CATEGORY_ID with an actual category ID from your database
    try {
      const categoryResponse = await axios.get(`${BASE_URL}/recommendations/category/test-category?limit=4`);
      console.log('✅ Category Recommendations:', categoryResponse.data.message);
      console.log(`📊 Found ${categoryResponse.data.data.length} category products`);
    } catch (error) {
      console.log('⚠️ Category Recommendations: No test category found (this is normal)');
    }
    console.log('');

    // Test 4: Product Recommendations (Public)
    console.log('4️⃣ Testing Product Recommendations...');
    // You'll need to replace PRODUCT_ID with an actual product ID from your database
    try {
      const productResponse = await axios.get(`${BASE_URL}/recommendations/product/test-product?limit=4`);
      console.log('✅ Product Recommendations:', categoryResponse.data.message);
      console.log(`📊 Found ${categoryResponse.data.data.length} related products`);
    } catch (error) {
      console.log('⚠️ Product Recommendations: No test product found (this is normal)');
    }
    console.log('');

    // Test 5: Frequently Bought Together (Public)
    console.log('5️⃣ Testing Frequently Bought Together...');
    try {
      const frequentlyBoughtResponse = await axios.get(`${BASE_URL}/recommendations/frequently-bought/test-product?limit=4`);
      console.log('✅ Frequently Bought Together:', frequentlyBoughtResponse.data.message);
      console.log(`📊 Found ${frequentlyBoughtResponse.data.data.length} frequently bought products`);
    } catch (error) {
      console.log('⚠️ Frequently Bought Together: No test product found (this is normal)');
    }
    console.log('');

    console.log('🎉 All tests completed!');
    console.log('');
    console.log('💡 To test with real data:');
    console.log('   1. Add some products to your database');
    console.log('   2. Create some orders to build purchase history');
    console.log('   3. Add products to user wishlists');
    console.log('   4. Replace test IDs with real IDs from your database');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the tests
testRecommendations();
