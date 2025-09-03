const { Review } = require('./models');

console.log('✅ Review model imported successfully');
console.log('Review model:', Review);
console.log('Review table name:', Review.tableName);
console.log('Review attributes:', Object.keys(Review.rawAttributes));
