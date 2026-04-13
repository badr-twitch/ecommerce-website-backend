/**
 * Fix categories: align slugs with the cosmetics catalog and ensure the
 * "Packages" category exists.
 *
 * Idempotent: re-running the script will skip rows that already match.
 *
 * Run:
 *   node scripts/fix-categories.js
 */

const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../config/database');
const Category = require('../models/Category');

const SLUG_UPDATES = [
  { name: 'Soin de visage',  slug: 'soin-visage' },
  { name: 'Soin capillaire', slug: 'soin-capillaire' },
  { name: 'Maquillage',      slug: 'maquillage' },
  { name: 'Soins du corps',  slug: 'soin-corps' },
  { name: 'Parfums',         slug: 'parfums' },
];

const CATEGORIES_TO_CREATE = [
  { name: 'Packages', slug: 'packages' },
];

async function updateSlug({ name, slug }) {
  const category = await Category.findOne({ where: { name } });

  if (!category) {
    console.log(`  ⚠ SKIP  "${name}" — not found in DB`);
    return;
  }

  if (category.slug === slug) {
    console.log(`  ✓ OK    "${name}" already has slug "${slug}"`);
    return;
  }

  const previousSlug = category.slug;
  await category.update({ slug }, { fields: ['slug'] });
  console.log(`  ✏ UPDATE "${name}" slug "${previousSlug}" → "${slug}"`);
}

async function createIfMissing({ name, slug }) {
  const existing = await Category.findOne({ where: { name } });

  if (existing) {
    if (existing.slug !== slug) {
      await existing.update({ slug }, { fields: ['slug'] });
      console.log(`  ✏ UPDATE "${name}" already exists, slug aligned → "${slug}"`);
    } else {
      console.log(`  ✓ OK    "${name}" already exists with slug "${slug}"`);
    }
    return;
  }

  await Category.create({ name, slug });
  console.log(`  ➕ CREATE "${name}" (slug "${slug}")`);
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection OK.\n');

    console.log('Step 1: aligning existing category slugs');
    for (const entry of SLUG_UPDATES) {
      await updateSlug(entry);
    }

    console.log('\nStep 2: ensuring new categories exist');
    for (const entry of CATEGORIES_TO_CREATE) {
      await createIfMissing(entry);
    }

    console.log('\nFinal categories (name → slug):');
    const all = await Category.findAll({ order: [['name', 'ASC']] });
    for (const c of all) {
      console.log(`  • ${c.name.padEnd(24)} ${c.slug}`);
    }

    console.log('\n✅ Done.');
  } catch (err) {
    console.error('❌ Script failed:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
