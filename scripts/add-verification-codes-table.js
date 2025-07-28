const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

async function addVerificationCodesTable() {
  try {
    console.log('🔄 Creating verification_codes table...');

    // Create the verification_codes table
    await sequelize.getQueryInterface().createTable('verification_codes', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
        userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
      email: {
        type: DataTypes.STRING,
        allowNull: false
      },
      code: {
        type: DataTypes.STRING(6),
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('phone_change', 'phone_verification'),
        allowNull: false,
        defaultValue: 'phone_change'
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      used: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      newPhoneNumber: {
        type: DataTypes.STRING,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Add indexes
    await sequelize.getQueryInterface().addIndex('verification_codes', ['userId', 'type', 'used']);
    await sequelize.getQueryInterface().addIndex('verification_codes', ['email', 'code', 'used']);
    await sequelize.getQueryInterface().addIndex('verification_codes', ['expiresAt']);

    console.log('✅ verification_codes table created successfully');

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
  addVerificationCodesTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addVerificationCodesTable; 