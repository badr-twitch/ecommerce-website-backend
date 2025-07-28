const { Op } = require('sequelize');
const Product = require('../models/Product');
const StockHistory = require('../models/StockHistory');
const User = require('../models/User');

// Import models index to ensure associations are loaded
require('../models/index');

class InventoryService {
  /**
   * Update product stock and create history record
   */
  async updateStock(productId, quantity, changeType, reason, referenceId = null, referenceType = null, notes = null, performedBy = null) {
    try {
      const product = await Product.findByPk(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const previousStock = product.stockQuantity;
      const newStock = previousStock + quantity;

      if (newStock < 0) {
        throw new Error('Stock cannot be negative');
      }

      // Update product stock
      await product.update({ stockQuantity: newStock });

      // Create stock history record
      await StockHistory.create({
        productId,
        changeType,
        quantity,
        previousStock,
        newStock,
        reason,
        referenceId,
        referenceType,
        notes,
        performedBy
      });

      // Check for low stock alerts
      await this.checkLowStockAlert(product);

      return {
        success: true,
        previousStock,
        newStock,
        change: quantity
      };
    } catch (error) {
      console.error('❌ Inventory update error:', error);
      throw error;
    }
  }

  /**
   * Check if product needs low stock alert
   */
  async checkLowStockAlert(product) {
    try {
      const now = new Date();
      const lastAlert = product.lastStockAlert;
      const daysSinceLastAlert = lastAlert ? (now - new Date(lastAlert)) / (1000 * 60 * 60 * 24) : 999;

      // Only send alert if stock is below minimum and we haven't alerted in the last 24 hours
      if (product.stockQuantity <= product.minStockLevel && daysSinceLastAlert >= 1) {
        await product.update({ lastStockAlert: now });
        
        // TODO: Send email notification to admin
        console.log(`🚨 Low stock alert for product: ${product.name} (Stock: ${product.stockQuantity}, Min: ${product.minStockLevel})`);
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Low stock alert check error:', error);
      return false;
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts() {
    try {
      const Category = require('../models/Category');
      const products = await Product.findAll({
        where: {
          stockQuantity: {
            [Op.lte]: require('sequelize').col('minStockLevel')
          }
        },
        include: [{ model: Category, as: 'category' }],
        order: [['stockQuantity', 'ASC']]
      });

      return products;
    } catch (error) {
      console.error('❌ Get low stock products error:', error);
      throw error;
    }
  }

  /**
   * Get stock history for a product
   */
  async getStockHistory(productId, limit = 50) {
    try {
      const history = await StockHistory.findAll({
        where: { productId },
        include: [
          { 
            model: Product, 
            as: 'product',
            attributes: ['id', 'name', 'sku']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit
      });

      return history;
    } catch (error) {
      console.error('❌ Get stock history error:', error);
      throw error;
    }
  }

  /**
   * Get inventory statistics
   */
  async getInventoryStats() {
    try {
      const totalProducts = await Product.count();
      const lowStockProducts = await Product.count({
        where: {
          stockQuantity: {
            [Op.lte]: require('sequelize').col('minStockLevel')
          }
        }
      });
      const outOfStockProducts = await Product.count({
        where: { stockQuantity: 0 }
      });
      const totalStockValue = await Product.sum('stockQuantity');

      return {
        totalProducts,
        lowStockProducts,
        outOfStockProducts,
        totalStockValue
      };
    } catch (error) {
      console.error('❌ Get inventory stats error:', error);
      throw error;
    }
  }

  /**
   * Bulk update stock levels
   */
  async bulkUpdateStock(updates, performedBy = null) {
    try {
      const results = [];
      
      for (const update of updates) {
        const { productId, quantity, changeType, reason, notes } = update;
        
        try {
          const result = await this.updateStock(
            productId, 
            quantity, 
            changeType, 
            reason, 
            null, 
            'bulk', 
            notes, 
            performedBy
          );
          results.push({ productId, success: true, ...result });
        } catch (error) {
          results.push({ productId, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Bulk stock update error:', error);
      throw error;
    }
  }

  /**
   * Set reorder point for a product
   */
  async setReorderPoint(productId, reorderPoint) {
    try {
      const product = await Product.findByPk(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      await product.update({ reorderPoint });
      return { success: true, reorderPoint };
    } catch (error) {
      console.error('❌ Set reorder point error:', error);
      throw error;
    }
  }
}

module.exports = new InventoryService(); 