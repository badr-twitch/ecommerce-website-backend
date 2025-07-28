const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

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

async function checkDatabase() {
  try {
    console.log('🔍 Checking database tables...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Check if tables exist
    const tables = await sequelize.showAllSchemas();
    console.log('📋 Available schemas:', tables.map(t => t.name));
    
    // Check specific tables
    const tableNames = ['users', 'products', 'categories', 'orders', 'order_items', 'stock_history'];
    
    for (const tableName of tableNames) {
      try {
        const result = await sequelize.query(`SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        )`);
        
        const exists = result[0][0].exists;
        console.log(`📊 Table '${tableName}': ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
      } catch (error) {
        console.log(`❌ Error checking table '${tableName}':`, error.message);
      }
    }
    
    // Try to create StockHistory table manually if it doesn't exist
    try {
      const stockHistoryExists = await sequelize.query(`SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'stock_history'
      )`);
      
      if (!stockHistoryExists[0][0].exists) {
        console.log('🔧 Creating stock_history table...');
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS "stock_history" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "productId" UUID NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            "changeType" VARCHAR(255) NOT NULL CHECK ("changeType" IN ('in', 'out', 'adjustment', 'initial')),
            "quantity" INTEGER NOT NULL,
            "previousStock" INTEGER NOT NULL,
            "newStock" INTEGER NOT NULL,
            "reason" VARCHAR(255),
            "referenceId" UUID,
            "referenceType" VARCHAR(255),
            "notes" TEXT,
            "performedBy" UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          );
          
          COMMENT ON COLUMN "stock_history"."changeType" IS 'Type of stock change: in (received), out (sold), adjustment (manual), initial (setup)';
          COMMENT ON COLUMN "stock_history"."quantity" IS 'Quantity changed (positive for in, negative for out)';
          COMMENT ON COLUMN "stock_history"."previousStock" IS 'Stock level before change';
          COMMENT ON COLUMN "stock_history"."newStock" IS 'Stock level after change';
          COMMENT ON COLUMN "stock_history"."reason" IS 'Reason for stock change (e.g., "Order #123", "Manual adjustment", "Initial stock")';
          COMMENT ON COLUMN "stock_history"."referenceId" IS 'Reference to related entity (e.g., order ID, adjustment ID)';
          COMMENT ON COLUMN "stock_history"."referenceType" IS 'Type of reference (e.g., "order", "adjustment", "manual")';
          COMMENT ON COLUMN "stock_history"."notes" IS 'Additional notes about the stock change';
          COMMENT ON COLUMN "stock_history"."performedBy" IS 'User ID who performed the stock change';
        `);
        console.log('✅ stock_history table created successfully');
      } else {
        console.log('✅ stock_history table already exists');
      }
    } catch (error) {
      console.error('❌ Error creating stock_history table:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await sequelize.close();
  }
}

checkDatabase(); 