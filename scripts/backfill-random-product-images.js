/**
 * Backfills placeholder product photos for demo data after the Firebase
 * Storage wipe. For every product whose `mainImage` is NULL / `images` is
 * empty, assigns deterministic picsum.photos URLs seeded on the product id,
 * so re-running the script does not churn URLs.
 *
 * Demo data only — do NOT run against real merchandise media.
 *
 * Design rules (matches backfill-morocco-data.js / wipe-image-urls.js):
 *   - Dry-run by default. Pass --apply to persist changes.
 *   - Prints target DB host/name before mutating.
 *   - Idempotent: only fills products whose image columns are empty. Pass
 *     --force to overwrite everything (useful right after wipe-image-urls).
 *
 * Usage:
 *   node scripts/backfill-random-product-images.js              # dry-run
 *   node scripts/backfill-random-product-images.js --apply      # persist
 *   node scripts/backfill-random-product-images.js --apply --force
 */

const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../config/database');
const Product = require('../models/Product');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

const IMAGES_PER_PRODUCT = 3;
const IMAGE_SIZE = 800;

function seededImage(productId, index) {
  const seed = `${productId}-${index}`;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${IMAGE_SIZE}/${IMAGE_SIZE}`;
}

function needsBackfill(product) {
  if (FORCE) return true;
  const hasMain = typeof product.mainImage === 'string' && product.mainImage.length > 0;
  const imgs = Array.isArray(product.images) ? product.images : [];
  return !hasMain || imgs.length === 0;
}

async function run() {
  await sequelize.authenticate();
  const cfg = sequelize.config || {};
  console.log(`Mode: ${MODE}${FORCE ? ' (FORCE overwrite)' : ''}`);
  console.log(`DB:   ${cfg.host}:${cfg.port}/${cfg.database} as ${cfg.username}`);
  console.log('---');

  const products = await Product.findAll({
    attributes: ['id', 'name', 'mainImage', 'images'],
    order: [['name', 'ASC']],
  });
  console.log(`Found ${products.length} products total`);

  const targets = products.filter(needsBackfill);
  console.log(`${targets.length} need images${FORCE ? '' : ' (mainImage null or images empty)'}`);

  if (targets.length === 0) {
    console.log('Nothing to do.');
    await sequelize.close();
    return;
  }

  let updated = 0;
  for (const product of targets) {
    const urls = Array.from({ length: IMAGES_PER_PRODUCT }, (_, i) => seededImage(product.id, i));
    const mainImage = urls[0];

    if (!APPLY) {
      console.log(`WOULD SET  ${product.name}`);
      console.log(`           main    : ${mainImage}`);
      console.log(`           gallery : ${urls.length} images`);
      continue;
    }

    await product.update(
      { mainImage, images: urls },
      { fields: ['mainImage', 'images'] }
    );
    updated += 1;
    console.log(`UPDATED    ${product.name}`);
  }

  await sequelize.close();
  console.log('---');
  if (APPLY) {
    console.log(`Done. Updated ${updated} product(s).`);
  } else {
    console.log('Dry run complete. Re-run with --apply to persist.');
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
