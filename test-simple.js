const RecommendationService = require('./services/recommendationService');

async function testSimple() {
  console.log('🧪 Testing Recommendation Service Directly...\n');
  
  try {
    const service = new RecommendationService();
    
    // Test 1: Test rankProducts with null user
    console.log('1️⃣ Testing rankProducts with null user...');
    const testProducts = [
      {
        id: '1',
        name: 'Test Product 1',
        categoryId: 'cat1',
        stockQuantity: 10,
        createdAt: new Date(),
        orderItems: [],
        toJSON: function() { return this; }
      }
    ];
    
    const ranked = service.rankProducts(testProducts, null);
    console.log('✅ rankProducts with null user works:', ranked.length, 'products ranked');
    console.log('');
    
    // Test 2: Test getModels
    console.log('2️⃣ Testing getModels...');
    const models = service.getModels();
    console.log('✅ getModels works, found models:', Object.keys(models));
    console.log('');
    
    console.log('🎉 Basic service tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSimple();
