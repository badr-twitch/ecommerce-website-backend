const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

async function addPhoneField() {
  try {
    console.log('🔄 Checking if phone field exists in users table...');

    // Check if the phone column already exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'phone'
    `);

    if (results.length > 0) {
      console.log('✅ Phone field already exists in users table');
      return;
    }

    console.log('🔄 Adding phone field to users table...');

    // Add the phone column to the users table
    await sequelize.getQueryInterface().addColumn('users', 'phone', {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        len: [10, 15]
      }
    });

    console.log('✅ Phone field added successfully to users table');

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
  addPhoneField()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addPhoneField; 