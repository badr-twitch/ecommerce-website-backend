const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const router = express.Router();

// Import models
const { Review, User, Product, Order, OrderItem } = require('../models');

// Import middleware
const firebaseAuth = require('../middleware/firebaseAuth');
const adminAuth = require('../middleware/adminAuth');

// Import services
const TrustpilotService = require('../services/trustpilotService');
const trustpilotService = new TrustpilotService();

// ==================== PUBLIC REVIEWS ====================

// @route   GET /api/reviews/product/:productId
// @desc    Get reviews for a specific product
// @access  Public
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'newest', rating } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build where clause
    let whereClause = {
      productId: productId,
      status: 'approved'
    };
    
    if (rating) {
      whereClause.rating = parseInt(rating);
    }
    
    // Build order clause
    let orderClause = [];
    switch (sort) {
      case 'helpful':
        orderClause = [
          ['verifiedPurchase', 'DESC'],
          ['helpfulVotes', 'DESC'],
          ['createdAt', 'DESC']
        ];
        break;
      case 'rating':
        orderClause = [
          ['rating', 'DESC'],
          ['createdAt', 'DESC']
        ];
        break;
      case 'oldest':
        orderClause = [['createdAt', 'ASC']];
        break;
      default: // newest
        orderClause = [['createdAt', 'DESC']];
    }
    
    // Get reviews with pagination
    const reviews = await Review.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'id']
        }
      ],
      order: orderClause,
      limit: parseInt(limit),
      offset: offset
    });
    
    // Get rating distribution
    const ratingDistribution = await Review.getRatingDistribution(productId);
    
    // Get average rating
    const averageRating = await Review.getAverageRating(productId);
    
    // Calculate total pages
    const totalPages = Math.ceil(reviews.count / limit);
    
    res.json({
      success: true,
      data: {
        reviews: reviews.rows.map(review => ({
          id: review.id,
          title: review.title,
          content: review.content,
          rating: review.rating,
          helpfulVotes: review.helpfulVotes,
          notHelpfulVotes: review.notHelpfulVotes,
          verifiedPurchase: review.verifiedPurchase,
          trustpilotId: review.trustpilotId,
          createdAt: review.createdAt,
          user: {
            id: review.user.id,
            name: `${review.user.firstName} ${review.user.lastName}`,
            initials: `${review.user.firstName?.[0]}${review.user.lastName?.[0]}`
          },
          mediaUrls: review.mediaUrls || [],
          tags: review.tags || []
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalReviews: reviews.count,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        statistics: {
          averageRating: parseFloat(averageRating?.dataValues?.averageRating || 0).toFixed(1),
          totalReviews: parseInt(averageRating?.dataValues?.totalReviews || 0),
          ratingDistribution: ratingDistribution.map(item => ({
            rating: item.rating,
            count: parseInt(item.dataValues.count)
          }))
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching product reviews:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des avis'
    });
  }
});

// @route   GET /api/reviews/product/:productId/summary
// @desc    Get review summary for a product (for display in product cards)
// @access  Public
router.get('/product/:productId/summary', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const [averageRating, totalReviews, topReviews] = await Promise.all([
      Review.getAverageRating(productId),
      Review.count({
        where: {
          productId: productId,
          status: 'approved'
        }
      }),
      Review.getTopReviews(productId, 3)
    ]);
    
    res.json({
      success: true,
      data: {
        averageRating: parseFloat(averageRating?.dataValues?.averageRating || 0).toFixed(1),
        totalReviews,
        topReviews: topReviews.map(review => ({
          id: review.id,
          rating: review.rating,
          title: review.title,
          content: review.content.substring(0, 150) + (review.content.length > 150 ? '...' : ''),
          verifiedPurchase: review.verifiedPurchase,
          helpfulVotes: review.helpfulVotes
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching review summary:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du résumé des avis'
    });
  }
});

// ==================== AUTHENTICATED USER REVIEWS ====================

// @route   POST /api/reviews
// @desc    Submit a new review
// @access  Authenticated users
router.post('/', firebaseAuth, async (req, res) => {
  try {
    const { productId, title, content, rating, mediaUrls, tags } = req.body;
    const userId = req.user.id;
    
    // Validate required fields
    if (!productId || !title || !content || !rating) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs obligatoires doivent être remplis'
      });
    }
    
    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'La note doit être comprise entre 1 et 5'
      });
    }
    
    // Check if user has already reviewed this product
    const existingReview = await Review.findOne({
      where: {
        productId: productId,
        userId: userId
      }
    });
    
    if (existingReview) {
      return res.status(400).json({
        success: false,
        error: 'Vous avez déjà laissé un avis pour ce produit'
      });
    }
    
    // Check if user has purchased the product (for verified purchase badge)
    const hasPurchased = await OrderItem.findOne({
             include: [
         {
           model: Order,
           as: 'order',
           where: {
             userId: userId,
             status: ['delivered', 'shipped']
           },
           attributes: []
         }
       ],
       where: {
         productId: productId
       }
    });
    
    // Create the review
    const review = await Review.create({
      productId: productId,
      userId: userId,
      title: title.trim(),
      content: content.trim(),
      rating: parseInt(rating),
      mediaUrls: mediaUrls || [],
      tags: tags || [],
      verifiedPurchase: !!hasPurchased,
      status: 'pending' // Requires admin approval
    });
    
    // Get the created review with user info
    const createdReview = await Review.findByPk(review.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName']
        }
      ]
    });
    
    res.status(201).json({
      success: true,
      message: 'Avis soumis avec succès et en attente de modération',
      data: {
        id: createdReview.id,
        title: createdReview.title,
        content: createdReview.content,
        rating: createdReview.rating,
        verifiedPurchase: createdReview.verifiedPurchase,
        status: createdReview.status,
        createdAt: createdReview.createdAt,
        user: {
          name: `${createdReview.user.firstName} ${createdReview.user.lastName}`
        }
      }
    });

  } catch (error) {
    console.error('❌ Error creating review:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'avis'
    });
  }
});

// @route   PUT /api/reviews/:reviewId
// @desc    Update user's own review
// @access  Review owner
router.put('/:reviewId', firebaseAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { title, content, rating, mediaUrls, tags } = req.body;
    const userId = req.user.id;
    
    // Find the review
    const review = await Review.findByPk(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Avis non trouvé'
      });
    }
    
    // Check if user owns the review
    if (review.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas autorisé à modifier cet avis'
      });
    }
    
    // Check if review is still editable (not approved yet)
    if (review.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Les avis approuvés ne peuvent plus être modifiés'
      });
    }
    
    // Update the review
    await review.update({
      title: title?.trim() || review.title,
      content: content?.trim() || review.content,
      rating: rating ? parseInt(rating) : review.rating,
      mediaUrls: mediaUrls || review.mediaUrls,
      tags: tags || review.tags,
      status: 'pending' // Reset to pending for re-moderation
    });
    
    // If review was synced to Trustpilot, update it there too
    if (review.trustpilotId && trustpilotService.isConfigured()) {
      try {
        await trustpilotService.updateReview(review.trustpilotId, {
          title: review.title,
          content: review.content,
          rating: review.rating,
          tags: review.tags
        });
      } catch (trustpilotError) {
        console.error('⚠️ Failed to update review on Trustpilot:', trustpilotError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Avis mis à jour avec succès',
      data: {
        id: review.id,
        title: review.title,
        content: review.content,
        rating: review.rating,
        status: review.status,
        updatedAt: review.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating review:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de l\'avis'
    });
  }
});

// @route   DELETE /api/reviews/:reviewId
// @desc    Delete user's own review
// @access  Review owner
router.delete('/:reviewId', firebaseAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    
    // Find the review
    const review = await Review.findByPk(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Avis non trouvé'
      });
    }
    
    // Check if user owns the review
    if (review.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas autorisé à supprimer cet avis'
      });
    }
    
    // If review was synced to Trustpilot, delete it there too
    if (review.trustpilotId && trustpilotService.isConfigured()) {
      try {
        await trustpilotService.deleteReview(review.trustpilotId);
      } catch (trustpilotError) {
        console.error('⚠️ Failed to delete review on Trustpilot:', trustpilotError.message);
      }
    }
    
    // Delete the review
    await review.destroy();
    
    res.json({
      success: true,
      message: 'Avis supprimé avec succès'
    });

  } catch (error) {
    console.error('❌ Error deleting review:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de l\'avis'
    });
  }
});

// ==================== REVIEW INTERACTIONS ====================

// @route   POST /api/reviews/:reviewId/helpful
// @desc    Mark review as helpful
// @access  Authenticated users
router.post('/:reviewId/helpful', firebaseAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    
    const review = await Review.findByPk(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Avis non trouvé'
      });
    }
    
    if (review.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Seuls les avis approuvés peuvent recevoir des votes'
      });
    }
    
    const voteAdded = review.addHelpfulVote(userId);
    
    if (!voteAdded) {
      return res.status(400).json({
        success: false,
        error: 'Vous avez déjà voté pour cet avis'
      });
    }
    
    await review.save();
    
    res.json({
      success: true,
      message: 'Vote ajouté avec succès',
      data: {
        helpfulVotes: review.helpfulVotes,
        notHelpfulVotes: review.notHelpfulVotes
      }
    });

  } catch (error) {
    console.error('❌ Error adding helpful vote:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout du vote'
    });
  }
});

// @route   POST /api/reviews/:reviewId/not-helpful
// @desc    Mark review as not helpful
// @access  Authenticated users
router.post('/:reviewId/not-helpful', firebaseAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;
    
    const review = await Review.findByPk(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Avis non trouvé'
      });
    }
    
    if (review.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Seuls les avis approuvés peuvent recevoir des votes'
      });
    }
    
    const voteAdded = review.addNotHelpfulVote(userId);
    
    if (!voteAdded) {
      return res.status(400).json({
        success: false,
        error: 'Vous avez déjà voté pour cet avis'
      });
    }
    
    await review.save();
    
    res.json({
      success: true,
      message: 'Vote ajouté avec succès',
      data: {
        helpfulVotes: review.helpfulVotes,
        notHelpfulVotes: review.notHelpfulVotes
      }
    });

  } catch (error) {
    console.error('❌ Error adding not helpful vote:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout du vote'
    });
  }
});

// ==================== ADMIN REVIEW MANAGEMENT ====================

// @route   GET /api/admin/reviews
// @desc    Get all reviews for admin moderation
// @access  Admin
router.get('/admin', firebaseAuth, adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, rating, productId } = req.query;
    const offset = (page - 1) * limit;
    
    // Build where clause
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }
    
    if (rating) {
      whereClause.rating = parseInt(rating);
    }
    
    if (productId) {
      whereClause.productId = productId;
    }
    
    // Get reviews with pagination
    const reviews = await Review.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        },
        {
          model: Product,
          as: 'product',
          attributes: ['name', 'id']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });
    
    // Calculate total pages
    const totalPages = Math.ceil(reviews.count / limit);
    
    res.json({
      success: true,
      data: {
        reviews: reviews.rows.map(review => ({
          id: review.id,
          title: review.title,
          content: review.content,
          rating: review.rating,
          status: review.status,
          verifiedPurchase: review.verifiedPurchase,
          trustpilotId: review.trustpilotId,
          trustpilotStatus: review.trustpilotStatus,
          helpfulVotes: review.helpfulVotes,
          notHelpfulVotes: review.notHelpfulVotes,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          user: {
            id: review.user.id,
            name: `${review.user.firstName} ${review.user.lastName}`,
            email: review.user.email
          },
          product: {
            id: review.product.id,
            name: review.product.name
          },
          mediaUrls: review.mediaUrls || [],
          tags: review.tags || []
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalReviews: reviews.count,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching admin reviews:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des avis'
    });
  }
});

// @route   PUT /api/admin/reviews/:reviewId/status
// @desc    Update review status (approve/reject/flag)
// @access  Admin
router.put('/admin/:reviewId/status', firebaseAuth, adminAuth, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, moderationNotes } = req.body;
    const adminId = req.user.id;
    
    const review = await Review.findByPk(reviewId);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        error: 'Avis non trouvé'
      });
    }
    
    // Validate status
    if (!['pending', 'approved', 'rejected', 'flagged'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide'
      });
    }
    
    // Update review status
    await review.update({
      status,
      moderationNotes: moderationNotes || null,
      moderatedBy: adminId,
      moderatedAt: new Date()
    });
    
    // If approved and Trustpilot is configured, sync to Trustpilot
    if (status === 'approved' && trustpilotService.isConfigured()) {
      try {
        const syncResult = await trustpilotService.syncReviewToTrustpilot(reviewId);
        if (syncResult.success) {
          console.log(`✅ Review ${reviewId} synced to Trustpilot after approval`);
        }
      } catch (syncError) {
        console.error('⚠️ Failed to sync approved review to Trustpilot:', syncError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Avis ${status === 'approved' ? 'approuvé' : status === 'rejected' ? 'rejeté' : 'signalé'} avec succès`,
      data: {
        id: review.id,
        status: review.status,
        moderatedAt: review.moderatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating review status:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du statut'
    });
  }
});

// @route   POST /api/admin/reviews/sync-trustpilot
// @desc    Manually sync pending reviews to Trustpilot
// @access  Admin
router.post('/admin/sync-trustpilot', firebaseAuth, adminAuth, async (req, res) => {
  try {
    if (!trustpilotService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Trustpilot n\'est pas configuré'
      });
    }
    
    const result = await trustpilotService.syncPendingReviews();
    
    res.json({
      success: true,
      message: 'Synchronisation Trustpilot terminée',
      data: result
    });

  } catch (error) {
    console.error('❌ Error syncing reviews to Trustpilot:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la synchronisation Trustpilot'
    });
  }
});

// ==================== TRUSTPILOT WEBHOOK ====================

// @route   POST /api/reviews/trustpilot-webhook
// @desc    Handle Trustpilot webhooks
// @access  Public (Trustpilot calls this)
router.post('/trustpilot-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-trustpilot-signature'];
    
    if (!signature) {
      return res.status(401).json({
        success: false,
        error: 'Signature manquante'
      });
    }
    
    const result = await trustpilotService.processWebhook(req.body, signature);
    
    if (result.success) {
      res.json({ success: true, message: 'Webhook traité avec succès' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }

  } catch (error) {
    console.error('❌ Error processing Trustpilot webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du traitement du webhook'
    });
  }
});

module.exports = router;
