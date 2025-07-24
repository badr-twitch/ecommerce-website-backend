const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Check for orphaned users (users in database but not in Firebase)
 */
async function checkOrphanedUsers() {
  try {
    console.log('🔍 Checking for orphaned users...\n');
    
    const client = await pool.connect();
    
    // Get all users from database
    const usersQuery = `
      SELECT 
        id,
        firebase_uid,
        email,
        first_name,
        last_name,
        created_at,
        updated_at
      FROM users 
      ORDER BY created_at DESC
    `;
    
    const usersResult = await client.query(usersQuery);
    const users = usersResult.rows;
    
    console.log(`📊 Total users in database: ${users.length}\n`);
    
    if (users.length === 0) {
      console.log('ℹ️ No users found in database');
      return;
    }
    
    // Display all users
    console.log('👥 All Users in Database:');
    console.log('─'.repeat(80));
    users.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user.id} | Firebase UID: ${user.firebase_uid || 'NULL'} | Email: ${user.email} | Name: ${user.first_name} ${user.last_name} | Created: ${user.created_at}`);
    });
    console.log('─'.repeat(80));
    
    // Check for users without Firebase UID
    const orphanedUsers = users.filter(user => !user.firebase_uid);
    if (orphanedUsers.length > 0) {
      console.log(`\n⚠️  Found ${orphanedUsers.length} users without Firebase UID (potentially orphaned):`);
      orphanedUsers.forEach(user => {
        console.log(`   - ID: ${user.id} | Email: ${user.email} | Name: ${user.first_name} ${user.last_name}`);
      });
    } else {
      console.log('\n✅ All users have Firebase UID');
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error checking orphaned users:', error);
  }
}

/**
 * Check user's related data (orders, payments, addresses)
 */
async function checkUserData(userId) {
  try {
    console.log(`\n🔍 Checking data for user ID: ${userId}...\n`);
    
    const client = await pool.connect();
    
    // Check user details
    const userQuery = 'SELECT * FROM users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found in database');
      return;
    }
    
    const user = userResult.rows[0];
    console.log('👤 User Details:');
    console.log('─'.repeat(50));
    console.log(`ID: ${user.id}`);
    console.log(`Firebase UID: ${user.firebase_uid || 'NULL'}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.first_name} ${user.last_name}`);
    console.log(`Created: ${user.created_at}`);
    console.log(`Updated: ${user.updated_at}`);
    console.log('─'.repeat(50));
    
    // Check orders
    const ordersQuery = 'SELECT COUNT(*) as count FROM orders WHERE user_id = $1';
    const ordersResult = await client.query(ordersQuery, [userId]);
    console.log(`📦 Orders: ${ordersResult.rows[0].count}`);
    
    // Check order items
    const orderItemsQuery = `
      SELECT COUNT(*) as count 
      FROM order_items 
      WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
    `;
    const orderItemsResult = await client.query(orderItemsQuery, [userId]);
    console.log(`📋 Order Items: ${orderItemsResult.rows[0].count}`);
    
    // Check payment methods
    const paymentsQuery = 'SELECT COUNT(*) as count FROM payment_methods WHERE user_id = $1';
    const paymentsResult = await client.query(paymentsQuery, [userId]);
    console.log(`💳 Payment Methods: ${paymentsResult.rows[0].count}`);
    
    // Check shipping addresses
    const addressesQuery = 'SELECT COUNT(*) as count FROM shipping_addresses WHERE user_id = $1';
    const addressesResult = await client.query(addressesQuery, [userId]);
    console.log(`🏠 Shipping Addresses: ${addressesResult.rows[0].count}`);
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error checking user data:', error);
  }
}

/**
 * Search user by email
 */
async function searchUserByEmail(email) {
  try {
    console.log(`🔍 Searching for user with email: ${email}...\n`);
    
    const client = await pool.connect();
    
    const userQuery = 'SELECT * FROM users WHERE email = $1';
    const userResult = await client.query(userQuery, [email]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found with this email');
      return null;
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:');
    console.log('─'.repeat(50));
    console.log(`ID: ${user.id}`);
    console.log(`Firebase UID: ${user.firebase_uid || 'NULL'}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.first_name} ${user.last_name}`);
    console.log(`Created: ${user.created_at}`);
    console.log('─'.repeat(50));
    
    client.release();
    return user;
    
  } catch (error) {
    console.error('❌ Error searching user:', error);
    return null;
  }
}

/**
 * Clean up orphaned users (use with caution!)
 */
async function cleanupOrphanedUsers() {
  try {
    console.log('🧹 Cleaning up orphaned users...\n');
    
    const client = await pool.connect();
    
    // Start transaction
    await client.query('BEGIN');
    
    // Find orphaned users (without Firebase UID)
    const orphanedQuery = 'SELECT id FROM users WHERE firebase_uid IS NULL';
    const orphanedResult = await client.query(orphanedQuery);
    const orphanedUsers = orphanedResult.rows;
    
    if (orphanedUsers.length === 0) {
      console.log('✅ No orphaned users found');
      await client.query('ROLLBACK');
      return;
    }
    
    console.log(`⚠️  Found ${orphanedUsers.length} orphaned users to delete`);
    
    for (const user of orphanedUsers) {
      console.log(`🗑️  Deleting user ID: ${user.id}`);
      
      // Delete in correct order (respecting foreign keys)
      await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM orders WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM payment_methods WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM shipping_addresses WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Cleanup completed successfully');
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await client.query('ROLLBACK');
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'check':
      await checkOrphanedUsers();
      break;
      
    case 'user':
      const userId = args[1];
      if (!userId) {
        console.log('❌ Please provide user ID: node checkOrphanedUsers.js user <userId>');
        return;
      }
      await checkUserData(userId);
      break;
      
    case 'search':
      const email = args[1];
      if (!email) {
        console.log('❌ Please provide email: node checkOrphanedUsers.js search <email>');
        return;
      }
      await searchUserByEmail(email);
      break;
      
    case 'cleanup':
      console.log('⚠️  WARNING: This will permanently delete orphaned users!');
      const confirm = args[1];
      if (confirm !== '--confirm') {
        console.log('❌ Use --confirm flag to proceed with cleanup');
        return;
      }
      await cleanupOrphanedUsers();
      break;
      
    default:
      console.log('🔍 Database User Checker');
      console.log('─'.repeat(30));
      console.log('Commands:');
      console.log('  check                    - Check for orphaned users');
      console.log('  user <userId>            - Check specific user data');
      console.log('  search <email>           - Search user by email');
      console.log('  cleanup --confirm        - Clean up orphaned users');
      console.log('');
      console.log('Examples:');
      console.log('  node checkOrphanedUsers.js check');
      console.log('  node checkOrphanedUsers.js user 123');
      console.log('  node checkOrphanedUsers.js search user@example.com');
      console.log('  node checkOrphanedUsers.js cleanup --confirm');
  }
  
  await pool.end();
}

// Run the script
main().catch(console.error); 