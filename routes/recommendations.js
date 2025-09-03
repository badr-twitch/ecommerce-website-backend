const express = require('express');
const router = express.Router();
const RecommendationService = require('../services/recommendationService');
const firebaseAuth = require('../middleware/firebaseAuth');

const recommendationService = new RecommendationService();

/**
 * @route   GET /api/recommendations/user
 * @desc    Get personalized recommendations for authenticated user
 * @access  Private
 */
router.get('/user', firebaseAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const limit = parseInt(req.query.limit) || 10;

    const recommendations = await recommendationService.getUserRecommendations(userId, limit);

    res.json({
      success: true,
      data: recommendations,
      message: 'Recommandations personnalisées récupérées avec succès'
    });
  } catch (error) {
    console.error('Error getting user recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des recommandations',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/product/:productId
 * @desc    Get product recommendations for a specific product
 * @access  Public
 */
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 6;

    const recommendations = await recommendationService.getProductRecommendations(productId, limit);

    res.json({
      success: true,
      data: recommendations,
      message: 'Recommandations de produit récupérées avec succès'
    });
  } catch (error) {
    console.error('Error getting product recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des recommandations de produit',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/category/:categoryId
 * @desc    Get category-based recommendations
 * @access  Public
 */
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const limit = parseInt(req.query.limit) || 8;

    const recommendations = await recommendationService.getCategoryRecommendations(categoryId, limit);

    res.json({
      success: true,
      data: recommendations,
      message: 'Recommandations de catégorie récupérées avec succès'
    });
  } catch (error) {
    console.error('Error getting category recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des recommandations de catégorie',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/trending
 * @desc    Get trending products across all categories
 * @access  Public
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const categoryId = req.query.categoryId;

    let recommendations;
    if (categoryId) {
      recommendations = await recommendationService.getCategoryRecommendations(categoryId, limit);
    } else {
      // Get trending products from all categories
      const { Product, OrderItem, Category } = require('../models');
      const { Op } = require('sequelize');

      const trendingProducts = await Product.findAll({
        where: {
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

      recommendations = recommendationService.rankProducts(trendingProducts, null);
    }

    res.json({
      success: true,
      data: recommendations,
      message: 'Produits tendance récupérés avec succès'
    });
  } catch (error) {
    console.error('Error getting trending recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des produits tendance',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/similar-users/:userId
 * @desc    Get recommendations based on similar users (admin only)
 * @access  Private (Admin)
 */
router.get('/similar-users/:userId', firebaseAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    // Check if current user is admin (you might want to add adminAuth middleware)
    // For now, we'll allow any authenticated user to access this

    const user = await require('../models').User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const similarUsers = await recommendationService.findSimilarUsers(user, limit);

    res.json({
      success: true,
      data: similarUsers,
      message: 'Utilisateurs similaires récupérés avec succès'
    });
  } catch (error) {
    console.error('Error getting similar users:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des utilisateurs similaires',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/frequently-bought/:productId
 * @desc    Get products frequently bought together with a specific product
 * @access  Public
 */
router.get('/frequently-bought/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 4;

    const frequentlyBoughtTogether = await recommendationService.getFrequentlyBoughtTogether(productId, limit);

    res.json({
      success: true,
      data: frequentlyBoughtTogether,
      message: 'Produits fréquemment achetés ensemble récupérés avec succès'
    });
  } catch (error) {
    console.error('Error getting frequently bought together:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des produits fréquemment achetés ensemble',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/recommendations/insights
 * @desc    Get recommendation insights and analytics (admin only)
 * @access  Private (Admin)
 */
router.get('/insights', firebaseAuth, async (req, res) => {
  try {
    // This would be a more complex endpoint for admin analytics
    // For now, we'll return basic insights
    
    const { Product, OrderItem, User } = require('../models');
    const { Op } = require('sequelize');

    // Get total products
    const totalProducts = await Product.count();

    // Get products with orders
    const productsWithOrders = await Product.count({
      include: [{
        model: OrderItem,
        as: 'orderItems',
        where: { id: { [Op.ne]: null } }
      }]
    });

    // Get conversion rate
    const conversionRate = totalProducts > 0 ? (productsWithOrders / totalProducts * 100).toFixed(2) : 0;

    const insights = {
      totalProducts,
      productsWithOrders,
      conversionRate: `${conversionRate}%`,
      recommendationTypes: [
        'Purchase History Based',
        'Wishlist Based',
        'Similar Users',
        'Trending in Categories',
        'Frequently Bought Together'
      ]
    };

    res.json({
      success: true,
      data: insights,
      message: 'Insights des recommandations récupérés avec succès'
    });
  } catch (error) {
    console.error('Error getting recommendation insights:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des insights des recommandations',
      message: error.message
    });
  }
});

module.exports = router;
