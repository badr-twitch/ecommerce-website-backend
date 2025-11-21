const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Migration script to add professional client type fields to the users table
 * This adds:
 * - clientType (ENUM: 'particulier', 'professionnel')
 * - companyName
 * - siret
 * - vatNumber
 * - billingAddress
 * - billingCity
 * - billingPostalCode
 * - billingCountry
 */
async function addProfessionalClientFields() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔄 Starting migration: Adding professional client fields...');

    // Check if clientType column already exists
    const existingColumns = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'clientType'
    `, { type: QueryTypes.SELECT });

    if (existingColumns && existingColumns.length > 0) {
      console.log('⚠️  clientType column already exists. Skipping migration.');
      await transaction.rollback();
      return;
    }

    // Step 1: Create ENUM type for clientType
    console.log('📝 Step 1: Creating clientType ENUM...');
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_users_clientType" AS ENUM ('particulier', 'professionnel');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `, { transaction });

    // Step 2: Add clientType column
    console.log('📝 Step 2: Adding clientType column...');
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "clientType" "enum_users_clientType" 
      DEFAULT 'particulier' NOT NULL;
    `, { transaction });

    // Step 3: Add business fields
    console.log('📝 Step 3: Adding business fields...');
    
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "companyName" VARCHAR(255);
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "siret" VARCHAR(14);
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "vatNumber" VARCHAR(255);
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "billingAddress" TEXT;
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "billingCity" VARCHAR(255);
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "billingPostalCode" VARCHAR(255);
    `, { transaction });

    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS "billingCountry" VARCHAR(255) DEFAULT 'France';
    `, { transaction });

    // Step 4: Add comments to columns
    console.log('📝 Step 4: Adding column comments...');
    await sequelize.query(`
      COMMENT ON COLUMN users."clientType" IS 'Type of client: particulier (individual) or professionnel (business)';
      COMMENT ON COLUMN users."companyName" IS 'Company name for professional clients';
      COMMENT ON COLUMN users."siret" IS 'SIRET number (14 digits) for French businesses';
      COMMENT ON COLUMN users."vatNumber" IS 'VAT/TVA number for professional clients';
      COMMENT ON COLUMN users."billingAddress" IS 'Billing address for professional clients';
      COMMENT ON COLUMN users."billingCity" IS 'Billing city for professional clients';
      COMMENT ON COLUMN users."billingPostalCode" IS 'Billing postal code for professional clients';
      COMMENT ON COLUMN users."billingCountry" IS 'Billing country for professional clients';
    `, { transaction });

    // Commit transaction
    await transaction.commit();
    console.log('✅ Migration completed successfully!');
    console.log('📊 New columns added:');
    console.log('   - clientType (ENUM: particulier, professionnel)');
    console.log('   - companyName');
    console.log('   - siret');
    console.log('   - vatNumber');
    console.log('   - billingAddress');
    console.log('   - billingCity');
    console.log('   - billingPostalCode');
    console.log('   - billingCountry');
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the migration
if (require.main === module) {
  addProfessionalClientFields()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = addProfessionalClientFields;

