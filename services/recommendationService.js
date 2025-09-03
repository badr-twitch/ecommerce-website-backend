const { Op } = require('sequelize');

class RecommendationService {
  constructor() {
    this.similarityThreshold = 0.3;
    this.maxRecommendations = 10;
  }

  // Helper method to get models when needed
  getModels() {
    return require('../models');
  }

  /**
   * Get personalized recommendations for a user
   */
  async getUserRecommendations(userId, limit = 10) {
    try {
      const { User, Order, OrderItem, Product } = this.getModels();
      
      const user = await User.findByPk(userId, {
        include: [
          { model: Order, as: 'orders', include: [{ model: OrderItem, as: 'orderItems' }] },
          { model: Product, as: 'wishlistProducts' }
        ]
      });

      if (!user) {
        throw new Error('User not found');
      }

      const recommendations = {
        basedOnPurchaseHistory: [],
        basedOnWishlist: [],
        basedOnSimilarUsers: [],
        trendingInCategories: [],
        recentlyViewed: []
      };

      // 1. Recommendations based on purchase history
      if (user.orders && user.orders.length > 0) {
        recommendations.basedOnPurchaseHistory = await this.getPurchaseBasedRecommendations(user, limit);
      }

      // 2. Recommendations based on wishlist
      if (user.wishlistProducts && user.wishlistProducts.length > 0) {
        recommendations.basedOnWishlist = await this.getWishlistBasedRecommendations(user, limit);
      }

      // 3. Recommendations based on similar users
      recommendations.basedOnSimilarUsers = await this.getSimilarUserRecommendations(user, limit);

      // 4. Trending products in user's favorite categories
      recommendations.trendingInCategories = await this.getTrendingInCategories(user, limit);

      // 5. Recently viewed products (if we implement view tracking)
      // recommendations.recentlyViewed = await this.getRecentlyViewedRecommendations(user, limit);

      return recommendations;
    } catch (error) {
      console.error('Error getting user recommendations:', error);
      throw error;
    }
  }

  /**
   * Get recommendations based on user's purchase history
   */
  async getPurchaseBasedRecommendations(user, limit = 5) {
    try {
      const { Product, Category, OrderItem } = this.getModels();
      
      // Get all products the user has purchased
      const purchasedProducts = [];
      user.orders.forEach(order => {
        order.orderItems.forEach(item => {
          purchasedProducts.push(item.productId);
        });
      });

      if (purchasedProducts.length === 0) return [];

      // Get categories of purchased products
      const purchasedProductDetails = await Product.findAll({
        where: { id: { [Op.in]: purchasedProducts } },
        include: [{ model: Category, as: 'category' }]
      });

      const favoriteCategories = purchasedProductDetails
        .map(product => product.category?.id)
        .filter(Boolean);

      // Get products in favorite categories that user hasn't purchased
      const recommendations = await Product.findAll({
        where: {
          id: { [Op.notIn]: purchasedProducts },
          categoryId: { [Op.in]: favoriteCategories },
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }
        ],
        order: [['createdAt', 'DESC']],
        limit
      });

      return this.rankProducts(recommendations, user);
    } catch (error) {
      console.error('Error getting purchase-based recommendations:', error);
      return [];
    }
  }

  /**
   * Get recommendations based on user's wishlist
   */
  async getWishlistBasedRecommendations(user, limit = 5) {
    try {
      const { Product, Category, OrderItem } = this.getModels();
      
      if (!user.wishlistProducts || user.wishlistProducts.length === 0) return [];

      // Get categories of wishlist products
      const wishlistCategories = user.wishlistProducts
        .map(product => product.categoryId)
        .filter(Boolean);

      // Get products in wishlist categories that user doesn't have in wishlist
      const recommendations = await Product.findAll({
        where: {
          id: { [Op.notIn]: user.wishlistProducts.map(p => p.id) },
          categoryId: { [Op.in]: wishlistCategories },
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }],
        order: [['createdAt', 'DESC']],
        limit
      });

      return this.rankProducts(recommendations, user);
    } catch (error) {
      console.error('Error getting wishlist-based recommendations:', error);
      return [];
    }
  }

  /**
   * Get recommendations based on similar users
   */
  async getSimilarUserRecommendations(user, limit = 5) {
    try {
      const { Order, OrderItem, Product, Category } = this.getModels();
      
      // Find users with similar purchase patterns
      const similarUsers = await this.findSimilarUsers(user);
      
      if (similarUsers.length === 0) return [];

      // Get products that similar users have purchased
      const similarUserProductIds = [];
      for (const similarUser of similarUsers) {
        const userOrders = await Order.findAll({
          where: { userId: similarUser.id },
          include: [{ model: OrderItem, as: 'orderItems' }]
        });

        userOrders.forEach(order => {
          order.orderItems.forEach(item => {
            similarUserProductIds.push(item.productId);
          });
        });
      }

      // Get products that similar users bought but current user hasn't
      const recommendations = await Product.findAll({
        where: {
          id: { [Op.in]: similarUserProductIds },
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }
        ],
        order: [['createdAt', 'DESC']],
        limit
      });

      return this.rankProducts(recommendations, user);
    } catch (error) {
      console.error('Error getting similar user recommendations:', error);
      return [];
    }
  }

  /**
   * Get trending products in user's favorite categories
   */
  async getTrendingInCategories(user, limit = 5) {
    try {
      const { Product, Category, OrderItem } = this.getModels();
      
      // Get user's favorite categories from purchases and wishlist
      const favoriteCategories = new Set();
      
      // Add categories from purchases
      if (user.orders) {
        user.orders.forEach(order => {
          order.orderItems.forEach(item => {
            if (item.product?.categoryId) {
              favoriteCategories.add(item.product.categoryId);
            }
          });
        });
      }

      // Add categories from wishlist
      if (user.wishlistProducts) {
        user.wishlistProducts.forEach(product => {
          if (product.categoryId) {
            favoriteCategories.add(product.categoryId);
          }
        });
      }

      if (favoriteCategories.size === 0) return [];

      // Get trending products in favorite categories
      const trendingProducts = await Product.findAll({
        where: {
          categoryId: { [Op.in]: Array.from(favoriteCategories) },
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }
        ],
        order: [
          ['orderItems', 'quantity', 'DESC'],
          ['createdAt', 'DESC']
        ],
        limit
      });

      return this.rankProducts(trendingProducts, user);
    } catch (error) {
      console.error('Error getting trending recommendations:', error);
      return [];
    }
  }

  /**
   * Find users with similar purchase patterns
   */
  async findSimilarUsers(user, limit = 5) {
    try {
      const { User, Order, OrderItem } = this.getModels();
      
      // Get user's purchase history
      const userPurchases = new Set();
      if (user.orders) {
        user.orders.forEach(order => {
          order.orderItems.forEach(item => {
            userPurchases.add(item.productId);
          });
        });
      }

      if (userPurchases.size === 0) return [];

      // Find users who bought similar products
      const similarUsers = await User.findAll({
        where: { id: { [Op.ne]: user.id } },
        include: [
          {
            model: Order,
            as: 'orders',
            include: [{ model: OrderItem, as: 'orderItems' }]
          }
        ]
      });

      // Calculate similarity scores
      const userSimilarities = similarUsers.map(similarUser => {
        const similarUserPurchases = new Set();
        if (similarUser.orders) {
          similarUser.orders.forEach(order => {
            order.orderItems.forEach(item => {
              similarUserPurchases.add(item.productId);
            });
          });
        }

        // Calculate Jaccard similarity
        const intersection = new Set([...userPurchases].filter(x => similarUserPurchases.has(x)));
        const union = new Set([...userPurchases, ...similarUserPurchases]);
        const similarity = intersection.size / union.size;

        return { user: similarUser, similarity };
      });

      // Return top similar users
      return userSimilarities
        .filter(item => item.similarity >= this.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(item => item.user);
    } catch (error) {
      console.error('Error finding similar users:', error);
      return [];
    }
  }

  /**
   * Rank products based on relevance to user
   */
  rankProducts(products, user = null) {
    return products.map(product => {
      let score = 0;

      // Base score from popularity (order count)
      score += (product.orderItems?.length || 0) * 10;

      // Bonus for products in user's favorite categories
      if (user && user.orders) {
        const userCategories = new Set();
        user.orders.forEach(order => {
          order.orderItems.forEach(item => {
            if (item.product?.categoryId) {
              userCategories.add(item.product.categoryId);
            }
          });
        });

        if (userCategories.has(product.categoryId)) {
          score += 50;
        }
      }

      // Bonus for recent products
      const daysSinceCreation = (Date.now() - new Date(product.createdAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 30) score += 20;
      else if (daysSinceCreation < 90) score += 10;

      // Bonus for products with stock
      if (product.stockQuantity > 0) score += 15;

      return { ...product.toJSON(), relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get product recommendations for a specific product
   */
  async getProductRecommendations(productId, limit = 6) {
    try {
      const { Product, Category, OrderItem } = this.getModels();
      
      const product = await Product.findByPk(productId, {
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }
        ]
      });

      if (!product) throw new Error('Product not found');

      const recommendations = [];

      // 1. Same category products
      const sameCategoryProducts = await Product.findAll({
        where: {
          id: { [Op.ne]: productId },
          categoryId: product.categoryId,
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [{ model: Category, as: 'category' }],
        order: [['createdAt', 'DESC']],
        limit: Math.floor(limit / 2)
      });

      recommendations.push(...sameCategoryProducts);

      // 2. Frequently bought together
      const frequentlyBoughtTogether = await this.getFrequentlyBoughtTogether(productId, limit - recommendations.length);
      recommendations.push(...frequentlyBoughtTogether);

      return this.rankProducts(recommendations);
    } catch (error) {
      console.error('Error getting product recommendations:', error);
      return [];
    }
  }

  /**
   * Get products frequently bought together
   */
  async getFrequentlyBoughtTogether(productId, limit = 3) {
    try {
      const { OrderItem, Order, Product } = this.getModels();
      
      // Find orders that contain this product
      const ordersWithProduct = await OrderItem.findAll({
        where: { productId },
        include: [{ model: Order, as: 'order' }]
      });

      const orderIds = ordersWithProduct.map(item => item.order.id);

      if (orderIds.length === 0) return [];

      // Find other products in those orders
      const otherProducts = await OrderItem.findAll({
        where: {
          orderId: { [Op.in]: orderIds },
          productId: { [Op.ne]: productId }
        },
        include: [{ model: Product, as: 'product' }]
      });

      // Count frequency
      const productFrequency = {};
      otherProducts.forEach(item => {
        const productId = item.product.id;
        productFrequency[productId] = (productFrequency[productId] || 0) + 1;
      });

      // Get top products
      const topProductIds = Object.entries(productFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([id]) => id);

      if (topProductIds.length === 0) return [];

      return await Product.findAll({
        where: {
          id: { [Op.in]: topProductIds },
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [{ model: Category, as: 'category' }]
      });
    } catch (error) {
      console.error('Error getting frequently bought together:', error);
      return [];
    }
  }

  /**
   * Get category-based recommendations
   */
  async getCategoryRecommendations(categoryId, limit = 8) {
    try {
      const { Product, Category, OrderItem } = this.getModels();
      
      const products = await Product.findAll({
        where: {
          categoryId,
          stockQuantity: { [Op.gt]: 0 }
        },
        include: [
          { model: Category, as: 'category' },
          { model: OrderItem, as: 'orderItems' }
        ],
        order: [
          ['orderItems', 'quantity', 'DESC'],
          ['createdAt', 'DESC']
        ],
        limit
      });

      return this.rankProducts(products);
    } catch (error) {
      console.error('Error getting category recommendations:', error);
      return [];
    }
  }
}

module.exports = RecommendationService;
