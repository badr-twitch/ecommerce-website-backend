const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'ecommerce_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log
  }
);

async function addPromotionColumns() {
  try {
    console.log('🔄 Adding promotion columns to products table...');
    
    // Add saleStartDate column
    await sequelize.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS "saleStartDate" TIMESTAMP;
    `);
    console.log('✅ Added saleStartDate column');
    
    // Add saleEndDate column
    await sequelize.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS "saleEndDate" TIMESTAMP;
    `);
    console.log('✅ Added saleEndDate column');
    
    // Add comment to saleStartDate
    await sequelize.query(`
      COMMENT ON COLUMN products."saleStartDate" IS 'Start date for the sale promotion';
    `);
    
    // Add comment to saleEndDate
    await sequelize.query(`
      COMMENT ON COLUMN products."saleEndDate" IS 'End date for the sale promotion';
    `);
    
    console.log('✅ Successfully added all promotion columns!');
    
  } catch (error) {
    console.error('❌ Error adding promotion columns:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the migration
addPromotionColumns()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
