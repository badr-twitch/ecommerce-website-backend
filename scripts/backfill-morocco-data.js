/**
 * One-shot backfill: normalise legacy shipping/order data to the Morocco-only
 * business scope.
 *
 *   - Shipping addresses: country → "Maroc", phone → "+212…" where safely
 *     normalisable.
 *   - Orders: billingCountry/shippingCountry → "Maroc", customerPhone → "+212…"
 *     where safely normalisable.
 *
 * Design rules:
 *   - Dry-run by default. Pass --apply to persist changes.
 *   - Never silently rewrite a clearly foreign phone into a fake Moroccan one.
 *     If a phone cannot be normalised, leave it untouched and report the row
 *     for manual review.
 *   - Use Sequelize `fields:` whitelisting on update so we only touch the
 *     columns being cleaned. This avoids re-running validators on other legacy
 *     data (e.g. malformed historical emails).
 *
 * Run:
 *   node scripts/backfill-morocco-data.js              # dry-run (default)
 *   node scripts/backfill-morocco-data.js --apply      # persist changes
 */

const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../config/database');
const ShippingAddress = require('../models/ShippingAddress');
const Order = require('../models/Order');
const {
  CANONICAL_COUNTRY,
  isMoroccanCountry,
  normalizeMoroccanPhone,
} = require('../utils/morocco');

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

// Decide what to do with a single phone value on a legacy record.
//   - empty/null → leave as-is, no change, no review needed
//   - already canonical +212 form → no change
//   - normalisable Moroccan shape → rewrite to +212…
//   - anything else → flag for manual review, do NOT rewrite
function classifyPhone(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { action: 'skip-empty' };
  }
  const result = normalizeMoroccanPhone(raw);
  if (result.valid) {
    if (result.normalized === raw) return { action: 'already-normalised' };
    return { action: 'normalise', normalized: result.normalized };
  }
  return { action: 'manual-review' };
}

function classifyCountry(raw) {
  if (raw === CANONICAL_COUNTRY) return { action: 'already-canonical' };
  // Accepted aliases (morocco/MA/mar) → canonicalise silently
  if (isMoroccanCountry(raw)) return { action: 'canonicalise' };
  // Anything else ("France", "Belgique", null, etc.) is legacy junk and
  // gets forced to "Maroc" since the business only ships to Morocco. The
  // whole row is still reported so an operator can spot-check.
  return { action: 'force-morocco', previous: raw };
}

async function backfillShippingAddresses() {
  console.log('\n=== Shipping addresses ===');
  const rows = await ShippingAddress.findAll();
  const stats = { scanned: rows.length, updated: 0, skipped: 0, manualReview: [] };

  for (const row of rows) {
    const countryDecision = classifyCountry(row.country);
    const phoneDecision = classifyPhone(row.phone);

    const patch = {};
    if (countryDecision.action === 'canonicalise' || countryDecision.action === 'force-morocco') {
      patch.country = CANONICAL_COUNTRY;
    }
    if (phoneDecision.action === 'normalise') {
      patch.phone = phoneDecision.normalized;
    }

    if (phoneDecision.action === 'manual-review') {
      stats.manualReview.push({
        id: row.id,
        userId: row.userId,
        name: row.name,
        country: row.country,
        phone: row.phone,
        reason: 'phone-not-moroccan',
      });
    }

    if (Object.keys(patch).length === 0) {
      stats.skipped += 1;
      continue;
    }

    if (APPLY) {
      await row.update(patch, { fields: Object.keys(patch) });
    }
    stats.updated += 1;

    const tag = APPLY ? 'UPDATE' : 'WOULD-UPDATE';
    const parts = [];
    if (patch.country) parts.push(`country "${row.country}" → "${patch.country}"`);
    if (patch.phone) parts.push(`phone "${row.phone}" → "${patch.phone}"`);
    console.log(`  [${tag}] address ${row.id}: ${parts.join('; ')}`);
  }

  return stats;
}

async function backfillOrders() {
  console.log('\n=== Orders ===');
  const rows = await Order.findAll();
  const stats = { scanned: rows.length, updated: 0, skipped: 0, manualReview: [] };

  for (const row of rows) {
    const shipCountry = classifyCountry(row.shippingCountry);
    const billCountry = classifyCountry(row.billingCountry);
    const phoneDecision = classifyPhone(row.customerPhone);

    const patch = {};
    if (shipCountry.action === 'canonicalise' || shipCountry.action === 'force-morocco') {
      patch.shippingCountry = CANONICAL_COUNTRY;
    }
    if (billCountry.action === 'canonicalise' || billCountry.action === 'force-morocco') {
      patch.billingCountry = CANONICAL_COUNTRY;
    }
    if (phoneDecision.action === 'normalise') {
      patch.customerPhone = phoneDecision.normalized;
    }

    if (phoneDecision.action === 'manual-review') {
      stats.manualReview.push({
        id: row.id,
        orderNumber: row.orderNumber,
        customerEmail: row.customerEmail,
        customerPhone: row.customerPhone,
        shippingCountry: row.shippingCountry,
        billingCountry: row.billingCountry,
        reason: 'phone-not-moroccan',
      });
    }

    if (Object.keys(patch).length === 0) {
      stats.skipped += 1;
      continue;
    }

    if (APPLY) {
      await row.update(patch, { fields: Object.keys(patch) });
    }
    stats.updated += 1;

    const tag = APPLY ? 'UPDATE' : 'WOULD-UPDATE';
    const parts = [];
    if (patch.shippingCountry) parts.push(`shippingCountry "${row.shippingCountry}" → "${patch.shippingCountry}"`);
    if (patch.billingCountry) parts.push(`billingCountry "${row.billingCountry}" → "${patch.billingCountry}"`);
    if (patch.customerPhone) parts.push(`customerPhone "${row.customerPhone}" → "${patch.customerPhone}"`);
    console.log(`  [${tag}] order ${row.orderNumber || row.id}: ${parts.join('; ')}`);
  }

  return stats;
}

function printSummary(label, stats) {
  console.log(`\n--- ${label} summary ---`);
  console.log(`  scanned:        ${stats.scanned}`);
  console.log(`  updated:        ${stats.updated}${APPLY ? '' : ' (would update in --apply mode)'}`);
  console.log(`  skipped:        ${stats.skipped}`);
  console.log(`  manual review:  ${stats.manualReview.length}`);
  if (stats.manualReview.length > 0) {
    console.log('  ⚠ Rows needing manual review:');
    for (const entry of stats.manualReview) {
      console.log('    ' + JSON.stringify(entry));
    }
  }
}

async function main() {
  console.log(`Morocco backfill — mode: ${MODE}`);
  if (!APPLY) {
    console.log('(dry-run; no writes. Re-run with --apply to persist.)');
  }

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection OK.');

    const addrStats = await backfillShippingAddresses();
    const orderStats = await backfillOrders();

    printSummary('Shipping addresses', addrStats);
    printSummary('Orders', orderStats);

    console.log('\n=== Overall ===');
    console.log(`  mode:              ${MODE}`);
    console.log(`  total scanned:     ${addrStats.scanned + orderStats.scanned}`);
    console.log(`  total updated:     ${addrStats.updated + orderStats.updated}`);
    console.log(`  total skipped:     ${addrStats.skipped + orderStats.skipped}`);
    console.log(`  total manual:      ${addrStats.manualReview.length + orderStats.manualReview.length}`);
    console.log(APPLY ? '✅ Done (changes persisted).' : '✅ Done (dry-run, nothing written).');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
