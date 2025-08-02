const { sequelize } = require('../config/database');
const { Order, OrderItem } = require('../models');
const { Op } = require('sequelize');

const cleanupSampleOrders = async () => {
  try {
    console.log('🧹 Starting cleanup of sample orders...');

    // Find all sample orders with various patterns
    // This covers both old format (ORD-2024-) and new format (ORD-YYYYMMDD-)
    const sampleOrders = await Order.findAll({
      where: {
        [Op.or]: [
          // Old format: ORD-2024-001, ORD-2024-002, etc.
          {
            orderNumber: {
              [Op.like]: 'ORD-2024-%'
            }
          },
          // New format: ORD-20241201-001, ORD-20241202-002, etc.
          {
            orderNumber: {
              [Op.like]: 'ORD-2024%-%'
            }
          },
          // Also check for orders with sample internal notes
          {
            internalNotes: {
              [Op.like]: 'Sample order%'
            }
          },
          // Check for orders with example.com emails
          {
            customerEmail: {
              [Op.like]: '%@example.com'
            }
          }
        ]
      }
    });

    if (sampleOrders.length === 0) {
      console.log('✅ No sample orders found to clean up.');
      return;
    }

    console.log(`📦 Found ${sampleOrders.length} sample orders to remove...`);
    
    // Log some examples of what will be deleted
    const examples = sampleOrders.slice(0, 5).map(order => order.orderNumber);
    console.log(`📋 Examples: ${examples.join(', ')}${sampleOrders.length > 5 ? '...' : ''}`);

    // Get the order IDs
    const orderIds = sampleOrders.map(order => order.id);

    console.log('🗑️ Deleting order items first...');
    
    // Delete order items first (foreign key constraint)
    const deletedItems = await OrderItem.destroy({
      where: {
        orderId: {
          [Op.in]: orderIds
        }
      }
    });

    console.log(`✅ Deleted ${deletedItems} order items`);

    console.log('🗑️ Deleting orders...');
    
    // Delete the orders
    const deletedOrders = await Order.destroy({
      where: {
        id: {
          [Op.in]: orderIds
        }
      }
    });

    console.log(`✅ Cleanup completed successfully!`);
    console.log(`🗑️ Removed ${deletedOrders} orders and ${deletedItems} order items`);
    console.log('🎉 Sample orders have been cleaned up from the database');

    // Verify cleanup
    const remainingSampleOrders = await Order.count({
      where: {
        [Op.or]: [
          {
            orderNumber: {
              [Op.like]: 'ORD-2024-%'
            }
          },
          {
            orderNumber: {
              [Op.like]: 'ORD-2024%-%'
            }
          },
          {
            internalNotes: {
              [Op.like]: 'Sample order%'
            }
          },
          {
            customerEmail: {
              [Op.like]: '%@example.com'
            }
          }
        ]
      }
    });

    if (remainingSampleOrders === 0) {
      console.log('✅ Verification: All sample orders have been successfully removed');
    } else {
      console.log(`⚠️ Warning: ${remainingSampleOrders} sample orders still remain in the database`);
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
};

// Run the cleanup
cleanupSampleOrders(); 