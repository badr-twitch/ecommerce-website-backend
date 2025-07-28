const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

async function addWishlistField() {
  try {
    console.log('🔄 Adding wishlist field to users table...');

    // Add the wishlist column to the users table
    await sequelize.getQueryInterface().addColumn('users', 'wishlist', {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of product IDs in user wishlist'
    });

    console.log('✅ Wishlist field added successfully to users table');

    // Update existing users to have an empty wishlist array
    await sequelize.query(`
      UPDATE users 
      SET wishlist = '[]'::json 
      WHERE wishlist IS NULL
    `);

    console.log('✅ Existing users updated with empty wishlist arrays');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  addWishlistField()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addWishlistField; 