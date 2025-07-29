const sequelize = require('../config/database');

async function checkDatabaseDetailed() {
  try {
    console.log('🔍 Detailed Database Analysis');
    console.log('=============================');
    
    // Check connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Get all tables
    const tables = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`\n📊 Found ${tables[0].length} tables:`);
    
    for (const table of tables[0]) {
      const tableName = table.table_name;
      
      // Get table info
      const tableInfo = await sequelize.query(`
        SELECT 
          COUNT(*) as row_count,
          pg_size_pretty(pg_total_relation_size('${tableName}')) as size
        FROM "${tableName}"
      `);
      
      // Get column info
      const columns = await sequelize.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);
      
      console.log(`\n📋 Table: ${tableName}`);
      console.log(`   📈 Rows: ${tableInfo[0][0].row_count}`);
      console.log(`   💾 Size: ${tableInfo[0][0].size}`);
      console.log(`   🔧 Columns:`);
      
      columns[0].forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultValue = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`      - ${col.column_name}: ${col.data_type} ${nullable}${defaultValue}`);
      });
    }
    
    // Check for specific important tables
    const importantTables = [
      'users', 'products', 'categories', 'orders', 'order_items',
      'carts', 'cart_items', 'reviews', 'stock_history',
      'notifications', 'notification_preferences'
    ];
    
    console.log('\n🎯 Important Tables Status:');
    for (const tableName of importantTables) {
      const exists = await sequelize.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        )
      `);
      
      const status = exists[0][0].exists ? '✅ EXISTS' : '❌ MISSING';
      console.log(`   ${tableName}: ${status}`);
    }
    
    // Check data counts
    console.log('\n📊 Data Counts:');
    const countQueries = [
      'users', 'products', 'categories', 'orders', 'order_items',
      'carts', 'cart_items', 'reviews', 'stock_history',
      'notifications', 'notification_preferences'
    ];
    
    for (const table of countQueries) {
      try {
        const result = await sequelize.query(`SELECT COUNT(*) as count FROM "${table}"`);
        console.log(`   ${table}: ${result[0][0].count} records`);
      } catch (error) {
        console.log(`   ${table}: ❌ Table not found`);
      }
    }
    
    // Check admin users
    console.log('\n👑 Admin Users:');
    try {
      const adminUsers = await sequelize.query(`
        SELECT id, email, role, "createdAt" 
        FROM users 
        WHERE role = 'admin'
      `);
      
      if (adminUsers[0].length > 0) {
        adminUsers[0].forEach(user => {
          console.log(`   - ${user.email} (${user.role}) - Created: ${user.createdAt}`);
        });
      } else {
        console.log('   ❌ No admin users found');
      }
    } catch (error) {
      console.log('   ❌ Error checking admin users');
    }
    
    console.log('\n🎉 Database analysis complete!');
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await sequelize.close();
  }
}

checkDatabaseDetailed().catch(console.error); 