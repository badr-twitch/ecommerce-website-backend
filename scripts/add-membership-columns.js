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
    logging: console.log,
  },
);

async function addMembershipColumns() {
  try {
    console.log('🔄 Ajout des colonnes membership aux utilisateurs...');

    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipStatus" VARCHAR(20) DEFAULT 'none';
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipPlan" VARCHAR(100);
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipPrice" NUMERIC(10,2);
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipCurrency" VARCHAR(10) DEFAULT 'MAD';
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipActivatedAt" TIMESTAMP;
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipExpiresAt" TIMESTAMP;
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipAutoRenew" BOOLEAN DEFAULT true;
    `);
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS "membershipBenefitsSnapshot" JSONB;
    `);

    console.log('✅ Colonnes membership ajoutées avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l’ajout des colonnes membership :', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

addMembershipColumns()
  .then(() => {
    console.log('🎉 Migration membership exécutée avec succès !');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration membership échouée :', error);
    process.exit(1);
  });

