const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Pool } = require('pg');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Firebase Function: Automatically clean up database when user is deleted from Firebase Auth
 * This function triggers when a user is deleted from Firebase Console or programmatically
 */
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
  try {
    console.log('🔍 User deleted from Firebase Auth:', user.uid);
    
    // Find user in database by Firebase UID
    const userQuery = 'SELECT id FROM users WHERE firebase_uid = $1';
    const userResult = await pool.query(userQuery, [user.uid]);
    
    if (userResult.rows.length === 0) {
      console.log('⚠️ User not found in database, nothing to clean up');
      return;
    }
    
    const userId = userResult.rows[0].id;
    console.log('🔍 Found user in database with ID:', userId);
    
    // Start transaction for data consistency
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete related data in correct order (respecting foreign key constraints)
      
      // 1. Delete order items first
      const orderItemsQuery = `
        DELETE FROM order_items 
        WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
      `;
      const orderItemsResult = await client.query(orderItemsQuery, [userId]);
      console.log('✅ Deleted order items:', orderItemsResult.rowCount);
      
      // 2. Delete orders
      const ordersQuery = 'DELETE FROM orders WHERE user_id = $1';
      const ordersResult = await client.query(ordersQuery, [userId]);
      console.log('✅ Deleted orders:', ordersResult.rowCount);
      
      // 3. Delete payment methods
      const paymentMethodsQuery = 'DELETE FROM payment_methods WHERE user_id = $1';
      const paymentMethodsResult = await client.query(paymentMethodsQuery, [userId]);
      console.log('✅ Deleted payment methods:', paymentMethodsResult.rowCount);
      
      // 4. Delete shipping addresses
      const shippingAddressesQuery = 'DELETE FROM shipping_addresses WHERE user_id = $1';
      const shippingAddressesResult = await client.query(shippingAddressesQuery, [userId]);
      console.log('✅ Deleted shipping addresses:', shippingAddressesResult.rowCount);
      
      // 5. Finally delete the user
      const userDeleteQuery = 'DELETE FROM users WHERE id = $1';
      const userDeleteResult = await client.query(userDeleteQuery, [userId]);
      console.log('✅ Deleted user:', userDeleteResult.rowCount);
      
      // Commit transaction
      await client.query('COMMIT');
      
      console.log('✅ Database cleanup completed successfully for user:', user.uid);
      
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('❌ Error during database cleanup:', error);
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Firebase Function error:', error);
    throw error;
  }
});

/**
 * Firebase Function: Clean up storage files when user is deleted
 * This function triggers when a user is deleted and removes their files from Storage
 */
exports.onUserDeletedStorage = functions.auth.user().onDelete(async (user) => {
  try {
    console.log('🔍 Cleaning up storage files for user:', user.uid);
    
    // Get Firebase Storage bucket
    const bucket = admin.storage().bucket();
    
    // Delete all files in user's profile photos folder
    const userFolderPath = `profile-photos/${user.uid}/`;
    
    try {
      const [files] = await bucket.getFiles({ prefix: userFolderPath });
      
      if (files.length > 0) {
        // Delete all files in the user's folder
        await Promise.all(files.map(file => file.delete()));
        console.log('✅ Deleted storage files:', files.length);
      } else {
        console.log('ℹ️ No storage files found for user');
      }
      
    } catch (storageError) {
      console.warn('⚠️ Error cleaning up storage files:', storageError);
      // Don't throw error for storage cleanup failures
    }
    
  } catch (error) {
    console.error('❌ Storage cleanup function error:', error);
    throw error;
  }
}); 