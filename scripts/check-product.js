require('dotenv').config();
const sequelize = require('../config/database');

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/check-product.js <productId>');
  process.exit(1);
}

(async () => {
  try {
    const [rows] = await sequelize.query(
      'SELECT id, name, "isActive" FROM products WHERE id = $1',
      { bind: [id] }
    );
    console.log(rows.length ? rows : 'NOT FOUND');
  } finally {
    await sequelize.close();
  }
})();
