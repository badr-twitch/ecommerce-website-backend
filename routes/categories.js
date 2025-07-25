const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { isActive: true },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC']
      ]
    });

    res.json(categories);

  } catch (error) {
    console.error('Erreur lors de la récupération des catégories:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des catégories' 
    });
  }
});

// @route   GET /api/categories/:id
// @desc    Get single category by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findOne({
      where: { 
        id,
        isActive: true 
      },
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: Category,
          as: 'children',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'name', 'slug', 'image']
        }
      ]
    });

    if (!category) {
      return res.status(404).json({ 
        error: 'Catégorie non trouvée' 
      });
    }

    res.json({ category });

  } catch (error) {
    console.error('Erreur lors de la récupération de la catégorie:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération de la catégorie' 
    });
  }
});

// @route   POST /api/categories
// @desc    Create a new category
// @access  Private (Admin)
router.post('/', adminAuth, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Le nom doit contenir entre 2 et 100 caractères'),
  body('slug').trim().isLength({ min: 2, max: 100 }).withMessage('Le slug doit contenir entre 2 et 100 caractères'),
  body('parentId').optional().isUUID().withMessage('Parent ID invalide'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('Ordre de tri invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Données invalides',
        details: errors.array() 
      });
    }

    const { name, slug, parentId, description, image, icon, sortOrder = 0 } = req.body;

    // Check if slug is unique
    const existingCategory = await Category.findOne({ where: { slug } });
    if (existingCategory) {
      return res.status(400).json({ 
        error: 'Un slug avec ce nom existe déjà' 
      });
    }

    // Calculate level
    let level = 0;
    if (parentId) {
      const parent = await Category.findByPk(parentId);
      if (!parent) {
        return res.status(400).json({ 
          error: 'Catégorie parente non trouvée' 
        });
      }
      level = parent.level + 1;
    }

    const category = await Category.create({
      name,
      slug,
      description,
      image,
      icon,
      parentId,
      level,
      sortOrder
    });

    res.status(201).json({
      message: 'Catégorie créée avec succès',
      category: category.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la création de la catégorie:', error);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        error: 'Une catégorie avec ce slug existe déjà' 
      });
    }

    res.status(500).json({ 
      error: 'Erreur lors de la création de la catégorie' 
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update a category
// @access  Private (Admin)
router.put('/:id', adminAuth, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('slug').optional().trim().isLength({ min: 2, max: 100 }),
  body('parentId').optional().isUUID(),
  body('sortOrder').optional().isInt({ min: 0 })
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
    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({ 
        error: 'Catégorie non trouvée' 
      });
    }

    // Check if slug is unique (excluding current category)
    if (req.body.slug) {
      const existingCategory = await Category.findOne({
        where: { 
          slug: req.body.slug,
          id: { [require('sequelize').Op.ne]: id }
        }
      });
      if (existingCategory) {
        return res.status(400).json({ 
          error: 'Un slug avec ce nom existe déjà' 
        });
      }
    }

    // Calculate new level if parentId is being changed
    if (req.body.parentId !== undefined) {
      let level = 0;
      if (req.body.parentId) {
        const parent = await Category.findByPk(req.body.parentId);
        if (!parent) {
          return res.status(400).json({ 
            error: 'Catégorie parente non trouvée' 
          });
        }
        level = parent.level + 1;
      }
      req.body.level = level;
    }

    await category.update(req.body);

    res.json({
      message: 'Catégorie mise à jour avec succès',
      category: category.toJSON()
    });

  } catch (error) {
    console.error('Erreur lors de la mise à jour de la catégorie:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la mise à jour de la catégorie' 
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a category
// @access  Private (Admin)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({ 
        error: 'Catégorie non trouvée' 
      });
    }

    // Check if category has products
    const productCount = await Product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer une catégorie qui contient des produits' 
      });
    }

    // Check if category has children
    const childrenCount = await Category.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer une catégorie qui a des sous-catégories' 
      });
    }

    // Soft delete
    await category.update({ isActive: false });

    res.json({
      message: 'Catégorie supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression de la catégorie:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la suppression de la catégorie' 
    });
  }
});

module.exports = router; 