/**
 * Migration: Add refund request fields to Orders table
 *
 * Adds: refund_requested to status ENUM, plus new columns for
 * refundRequestedAt, refundReason, refundDescription, refundProofImages,
 * refundAffectedItems, refundRejectionReason
 *
 * Run: node scripts/migrate-refund-fields.js
 */

const sequelize = require('../config/database');

async function migrate() {
  const t = await sequelize.transaction();

  try {
    console.log('Starting refund fields migration...');

    // 1. Add 'refund_requested' to the status ENUM type
    // PostgreSQL requires ALTER TYPE to add new enum values
    console.log('Adding refund_requested to status enum...');
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'refund_requested'
          AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'enum_orders_status'
          )
        ) THEN
          ALTER TYPE "enum_orders_status" ADD VALUE 'refund_requested';
        END IF;
      END
      $$;
    `);
    // COMMIT is required after ADD VALUE before using the new enum value
    await t.commit();

    // Start a new transaction for the column additions
    const t2 = await sequelize.transaction();

    try {
      // 2. Add refundRequestedAt column
      console.log('Adding refundRequestedAt column...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundRequestedAt'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundRequestedAt" TIMESTAMP WITH TIME ZONE;
          END IF;
        END
        $$;
      `, { transaction: t2 });

      // 3. Add refundReason column (enum)
      console.log('Adding refundReason column...');
      // First create the enum type if it doesn't exist
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_orders_refundReason') THEN
            CREATE TYPE "enum_orders_refundReason" AS ENUM (
              'defective', 'wrong_item', 'damaged_in_shipping', 'not_as_described', 'missing_parts'
            );
          END IF;
        END
        $$;
      `, { transaction: t2 });

      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundReason'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundReason" "enum_orders_refundReason";
          END IF;
        END
        $$;
      `, { transaction: t2 });

      // 4. Add refundDescription column
      console.log('Adding refundDescription column...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundDescription'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundDescription" TEXT;
          END IF;
        END
        $$;
      `, { transaction: t2 });

      // 5. Add refundProofImages column (JSON array)
      console.log('Adding refundProofImages column...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundProofImages'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundProofImages" JSON DEFAULT '[]';
          END IF;
        END
        $$;
      `, { transaction: t2 });

      // 6. Add refundAffectedItems column (JSON array)
      console.log('Adding refundAffectedItems column...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundAffectedItems'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundAffectedItems" JSON DEFAULT '[]';
          END IF;
        END
        $$;
      `, { transaction: t2 });

      // 7. Add refundRejectionReason column
      console.log('Adding refundRejectionReason column...');
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'refundRejectionReason'
          ) THEN
            ALTER TABLE "orders" ADD COLUMN "refundRejectionReason" TEXT;
          END IF;
        END
        $$;
      `, { transaction: t2 });

      await t2.commit();
      console.log('Migration completed successfully!');
    } catch (error) {
      await t2.rollback();
      throw error;
    }
  } catch (error) {
    // First transaction may already be committed
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
