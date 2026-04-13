/**
 * Nulls every image/photo column populated with old Firebase Storage URLs so
 * stale URLs don't 404 in <img> after the S3 migration. Demo data only —
 * never run against real customer media.
 *
 * Usage:
 *   node scripts/wipe-image-urls.js          # dry-run, prints counts
 *   node scripts/wipe-image-urls.js --apply  # actually clears the columns
 */
const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../config/database');

const apply = process.argv.includes('--apply');

const TARGETS = [
  { table: 'users',       column: 'photoURL',          empty: 'NULL' },
  { table: 'products',    column: 'mainImage',         empty: 'NULL' },
  { table: 'products',    column: 'images',            empty: "'[]'::jsonb" },
  { table: 'categories',  column: 'image',             empty: 'NULL' },
  { table: 'orders',      column: 'refundProofImages', empty: "'[]'::jsonb" },
  { table: 'order_items', column: 'productImage',      empty: 'NULL' },
  { table: 'reviews',     column: 'mediaUrls',         empty: "'[]'::jsonb" },
];

async function detectColumn(table, column) {
  const [rows] = await sequelize.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = :table AND column_name = :column`,
    { replacements: { table, column } }
  );
  return rows[0]?.data_type || null;
}

async function run() {
  await sequelize.authenticate();
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN'}`);
  console.log('---');

  for (const { table, column, empty } of TARGETS) {
    const dataType = await detectColumn(table, column);
    if (!dataType) {
      console.log(`SKIP  ${table}.${column} — column not found`);
      continue;
    }

    const [countRows] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "${column}" IS NOT NULL`
    );
    const n = countRows[0].n;

    if (!apply) {
      console.log(`WOULD CLEAR  ${table}.${column} (${dataType}) — ${n} rows`);
      continue;
    }

    const target = dataType.includes('json') || dataType === 'ARRAY' ? empty : 'NULL';
    await sequelize.query(`UPDATE "${table}" SET "${column}" = ${target}`);
    console.log(`CLEARED      ${table}.${column} — ${n} rows`);
  }

  await sequelize.close();
  console.log('---');
  console.log(apply ? 'Done.' : 'Dry run complete. Re-run with --apply to write.');
}

run().catch((err) => {
  console.error('Wipe failed:', err);
  process.exit(1);
});
