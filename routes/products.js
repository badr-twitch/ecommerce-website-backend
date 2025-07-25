const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Op } = require('sequelize');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const User = require('../models/User');
const { auth, optionalAuth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products with filtering and pagination
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page doit être un nombre positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit doit être entre 1 et 100'),
  query('category').optional().isUUID().withMessage('Category ID invalide'),
  query('search').optional().trim(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Prix minimum invalide'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Prix maximum invalide'),
  query('sort').optional().isIn(['name', 'price', 'createdAt', 'rating']).withMessage('Tri invalide'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Ordre invalide'),
  query('featured').optional().isBoolean().withMessage('Featured doit être un booléen'),
  query('onSale').optional().isBoolean().withMessage('OnSale doit être un booléen')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Paramètres invalides',
        details: errors.array() 
      });
    }

    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sort = 'createdAt',
      order = 'desc',
      featured,
      onSale
    } = req.query;

    // Build where clause
    const whereClause = {
      isActive: true
    };

    // Debug logging
    console.log('🔍 Products API - Query parameters:', req.query);

    if (category) {
      whereClause.categoryId = category;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (minPrice !== undefined) {
      whereClause.price = { [Op.gte]: minPrice };
    }

    if (maxPrice !== undefined) {
      whereClause.price = {
        ...whereClause.price,
        [Op.lte]: maxPrice
      };
    }

    if (featured !== undefined) {
      whereClause.isFeatured = featured;
    }

    if (onSale !== undefined) {
      whereClause.isOnSale = onSale;
    }

    // Debug logging
    console.log('🔍 Products API - Final where clause:', whereClause);

    // Calculate offset
    const offset = (page - 1) * limit;

    // Get products with category
    const { count, rows: products } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Add default rating values for now
    const productsWithRating = products.map(product => {
      const productData = product.toJSON();
      productData.averageRating = 0;
      productData.reviewCount = 0;
      return productData;
    });

    res.json({
      products: productsWithRating,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des produits',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      where: { 
        id,
        isActive: true 
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: Review,
          as: 'reviews',
          where: { isApproved: true },
          required: false,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['firstName', 'lastName']
            }
          ],
          order: [['createdAt', 'DESC']]
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ 
        error: 'Produit non trouvé' 
      });
    }

    const productData = product.toJSON();
    const reviews = productData.reviews || [];
    
    if (reviews.length > 0) {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      productData.averageRating = (totalRating / reviews.length).toFixed(1);
      productData.reviewCount = reviews.length;
    } else {
      productData.averageRating = 0;
      productData.reviewCount = 0;
    }

    res.json({ product: productData });

  } catch (error) {
    console.error('Erreur lors de la récupération du produit:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération du produit' 
    });
  }
});

// @route   POST /api/products
// @desc    Create a new product
// @access  Private (Admin)
router.post('/', adminAuth, [
  body('name').trim().isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('La description doit contenir entre 10 et 2000 caractères'),
  body('price').isFloat({ min: 0 }).withMessage('Prix invalide'),
  body('sku').notEmpty().withMessage('SKU requis'),
  body('categoryId').isUUID().withMessage('Category ID invalide'),
  body('stockQuantity').isInt({ min: 0 }).withMessage('Quantité de stock invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const product = await Product.create(req.body);

    res.status(201).json({
      message: 'Produit créé avec succès',
      product: product.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la création du produit:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        error: 'Un produit avec ce SKU existe déjà' 
      });
    }

    res.status(500).json({ 
      error: 'Erreur lors de la création du produit' 
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Update a product
// @access  Private (Admin)
router.put('/:id', adminAuth, [
  body('name').optional().trim().isLength({ min: 2, max: 200 }),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }),
  body('price').optional().isFloat({ min: 0 }),
  body('stockQuantity').optional().isInt({ min: 0 }),
  body('categoryId').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Produit non trouvé' 
      });
    }

    await product.update(req.body);

    res.json({
      message: 'Produit mis à jour avec succès',
      product: product.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour du produit' 
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete a product
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ 
        error: 'Produit non trouvé' 
      });
    }

    // Soft delete - just mark as inactive
    await product.update({ isActive: false });

    res.json({
      message: 'Produit supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression du produit:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression du produit' 
    });
  }
});

// @route   POST /api/products/:id/reviews
// @desc    Add a review to a product
// @access  Private
router.post('/:id/reviews', auth, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Note invalide'),
  body('title').optional().trim().isLength({ max: 200 }),
  body('comment').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const { rating, title, comment } = req.body;

    // Check if product exists
    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ 
        error: 'Produit non trouvé' 
      });
    }

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      where: {
        productId: id,
        userId: req.user.id
      }
    });

    if (existingReview) {
      return res.status(400).json({ 
        error: 'Vous avez déjà laissé un avis pour ce produit' 
      });
    }

    // Create review
    const review = await Review.create({
      productId: id,
      userId: req.user.id,
      rating,
      title,
      comment
    });

    res.status(201).json({
      message: 'Avis ajouté avec succès',
      review: review.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'avis:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'ajout de l\'avis' 
    });
  }
});

module.exports = router; 