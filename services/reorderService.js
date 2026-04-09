const { Op } = require('sequelize');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');

class ReorderService {
  /**
   * Get smart reorder suggestions for a user.
   * Analyzes purchase history to find products ordered 2+ times
   * and predicts when the user might want to reorder.
   * @param {string} userId - The user's database ID
   * @returns {Array} - Suggested products with frequency info
   */
  async getReorderSuggestions(userId) {
    // Get all delivered orders for this user
    const orders = await Order.findAll({
      where: {
        userId,
        status: { [Op.in]: ['delivered', 'shipped'] }
      },
      include: [{
        model: OrderItem,
        as: 'orderItems',
        attributes: ['productId', 'productName', 'productImage', 'unitPrice', 'quantity']
      }],
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'createdAt']
    });

    if (orders.length === 0) return [];

    // Group items by product and track purchase history
    const productHistory = {};

    for (const order of orders) {
      for (const item of order.orderItems) {
        const pid = item.productId;
        if (!productHistory[pid]) {
          productHistory[pid] = {
            productId: pid,
            productName: item.productName,
            productImage: item.productImage,
            lastPrice: item.unitPrice,
            orderDates: [],
            totalQuantity: 0,
            orderCount: 0
          };
        }
        productHistory[pid].orderDates.push(new Date(order.createdAt));
        productHistory[pid].totalQuantity += item.quantity;
        productHistory[pid].orderCount += 1;
      }
    }

    // Filter to products ordered 2+ times
    const repeatedProducts = Object.values(productHistory).filter(p => p.orderCount >= 2);

    if (repeatedProducts.length === 0) return [];

    // Calculate average interval and predict next order
    const suggestions = [];

    for (const product of repeatedProducts) {
      // Sort dates chronologically
      const dates = product.orderDates.sort((a, b) => a - b);

      // Calculate average interval between orders (in days)
      let totalInterval = 0;
      for (let i = 1; i < dates.length; i++) {
        totalInterval += (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
      }
      const avgIntervalDays = Math.round(totalInterval / (dates.length - 1));

      // Predict next order date
      const lastOrderDate = dates[dates.length - 1];
      const predictedNextDate = new Date(lastOrderDate.getTime() + avgIntervalDays * 24 * 60 * 60 * 1000);
      const daysUntilNext = Math.round((predictedNextDate - new Date()) / (1000 * 60 * 60 * 24));

      // Get current product info (price, stock)
      const currentProduct = await Product.findByPk(product.productId, {
        attributes: ['id', 'name', 'price', 'mainImage', 'stockQuantity', 'isActive']
      });

      if (!currentProduct || !currentProduct.isActive) continue;

      const priceChange = currentProduct.price - product.lastPrice;
      const priceDropped = priceChange < 0;

      suggestions.push({
        productId: product.productId,
        name: currentProduct.name || product.productName,
        image: currentProduct.mainImage || product.productImage,
        currentPrice: currentProduct.price,
        lastPaidPrice: product.lastPrice,
        priceDropped,
        priceDifference: Math.abs(priceChange),
        inStock: currentProduct.stockQuantity > 0,
        stockQuantity: currentProduct.stockQuantity,
        orderCount: product.orderCount,
        totalQuantityOrdered: product.totalQuantity,
        avgIntervalDays,
        daysUntilPredictedReorder: daysUntilNext,
        lastOrderDate: lastOrderDate,
        predictedNextDate
      });
    }

    // Sort by proximity to predicted reorder date (most urgent first)
    suggestions.sort((a, b) => a.daysUntilPredictedReorder - b.daysUntilPredictedReorder);

    return suggestions.slice(0, 6); // Max 6 suggestions
  }
}

module.exports = new ReorderService();
