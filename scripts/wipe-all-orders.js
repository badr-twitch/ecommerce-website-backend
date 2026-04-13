/**
 * DESTRUCTIVE: wipe every order from the database.
 *
 * Deletes, in order (FK-safe):
 *   - order_status_logs (all)
 *   - order_items       (all)
 *   - orders            (all)
 *
 * Loyalty points, users, products, shipping addresses, etc. are untouched.
 *
 * Usage:
 *   node scripts/wipe-all-orders.js              # dry-run (default) — prints counts, writes nothing
 *   node scripts/wipe-all-orders.js --apply      # actually delete
 *
 * Safety:
 *   - Dry-run is the default. You must pass --apply explicitly.
 *   - Prints DB host + name before doing anything so you can confirm the
 *     target isn't production.
 *   - Wraps deletes in a single transaction.
 */

const dotenv = require('dotenv');
dotenv.config();

const sequelize = require('../config/database');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const OrderStatusLog = require('../models/OrderStatusLog');

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

async function main() {
  console.log(`\nwipe-all-orders — mode: ${MODE}`);

  const cfg = sequelize.config || {};
  console.log(`  target DB: ${cfg.database} @ ${cfg.host}:${cfg.port}`);
  if (!APPLY) {
    console.log('  (dry-run; no rows will be deleted. Re-run with --apply to persist.)');
  } else {
    console.log('  ⚠ --apply set. This WILL delete every order, order item, and order status log.');
  }

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection OK.\n');

    const orderCount = await Order.count();
    const itemCount = await OrderItem.count();
    const logCount = await OrderStatusLog.count();

    console.log('Current row counts:');
    console.log(`  orders:             ${orderCount}`);
    console.log(`  order_items:        ${itemCount}`);
    console.log(`  order_status_logs:  ${logCount}`);

    if (orderCount === 0 && itemCount === 0 && logCount === 0) {
      console.log('\nNothing to delete. Done.');
      return;
    }

    if (!APPLY) {
      console.log(`\n[DRY-RUN] Would delete ${logCount} log(s), ${itemCount} item(s), ${orderCount} order(s).`);
      console.log('Re-run with --apply to actually delete.');
      return;
    }

    const t = await sequelize.transaction();
    try {
      const deletedLogs = await OrderStatusLog.destroy({ where: {}, transaction: t });
      const deletedItems = await OrderItem.destroy({ where: {}, transaction: t });
      const deletedOrders = await Order.destroy({ where: {}, transaction: t });
      await t.commit();
      console.log(`\n✅ Deleted ${deletedLogs} status logs, ${deletedItems} order items, ${deletedOrders} orders.`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    console.error('❌ Wipe failed:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
