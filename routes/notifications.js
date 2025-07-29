const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const firebaseAuth = require('../middleware/firebaseAuth');
const { adminAuth } = require('../middleware/auth');

// Initialize notification service (will be set by server.js)
let notificationService;

// Set notification service instance
const setNotificationService = (service) => {
  notificationService = service;
};

// Helper function to check if notification service is available
const checkNotificationService = (req, res, next) => {
  if (!notificationService) {
    return res.status(503).json({ 
      error: 'Service de notification non disponible',
      message: 'Le service de notification est en cours d\'initialisation'
    });
  }
  next();
};

// Get user notifications
router.get('/', firebaseAuth, checkNotificationService, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const notifications = await notificationService.getUserNotifications(
      user.id,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('❌ Error getting notifications:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

// Get unread count
router.get('/unread-count', firebaseAuth, checkNotificationService, async (req, res) => {
  try {
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const count = await notificationService.getUnreadCount(user.id);

    res.json({
      success: true,
      data: { count }
    });

  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du nombre de notifications' });
  }
});

// Mark notification as read
router.put('/:id/read', firebaseAuth, checkNotificationService, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const success = await notificationService.markAsRead(id, user.id);

    if (success) {
      res.json({
        success: true,
        message: 'Notification marquée comme lue'
      });
    } else {
      res.status(404).json({ error: 'Notification non trouvée' });
    }

  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ error: 'Erreur lors du marquage de la notification' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', firebaseAuth, checkNotificationService, async (req, res) => {
  try {
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const success = await notificationService.markAllAsRead(user.id);

    if (success) {
      res.json({
        success: true,
        message: 'Toutes les notifications marquées comme lues'
      });
    } else {
      res.status(500).json({ error: 'Erreur lors du marquage des notifications' });
    }

  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Erreur lors du marquage des notifications' });
  }
});

// Get notification preferences
router.get('/preferences', firebaseAuth, checkNotificationService, async (req, res) => {
  try {
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const preferences = await notificationService.getUserPreferences(user.id);

    res.json({
      success: true,
      data: preferences
    });

  } catch (error) {
    console.error('❌ Error getting notification preferences:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des préférences' });
  }
});

// Update notification preferences
router.put('/preferences', firebaseAuth, checkNotificationService, [
  body('preferences').isObject().withMessage('Les préférences doivent être un objet')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { preferences } = req.body;
    const userId = req.firebaseUser.uid;

    // Get user from database
    const { User } = require('../models');
    const user = await User.findOne({ where: { firebaseUid: userId } });
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const success = await notificationService.updatePreferences(user.id, preferences);

    if (success) {
      res.json({
        success: true,
        message: 'Préférences de notification mises à jour'
      });
    } else {
      res.status(500).json({ error: 'Erreur lors de la mise à jour des préférences' });
    }

  } catch (error) {
    console.error('❌ Error updating notification preferences:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des préférences' });
  }
});

// Admin routes
router.get('/admin/all', adminAuth, checkNotificationService, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { Notification } = require('../models');

    const notifications = await Notification.findAll({
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('❌ Error getting admin notifications:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

// Create test notification (admin only)
router.post('/admin/test', adminAuth, checkNotificationService, [
  body('type').isIn([
    'order_new',
    'order_status_change',
    'order_high_value',
    'inventory_low_stock',
    'inventory_out_of_stock',
    'inventory_restored',
    'user_registration',
    'user_vip_login',
    'user_verification',
    'revenue_milestone',
    'system_error',
    'system_performance',
    'payment_failure',
    'refund_request'
  ]).withMessage('Type de notification invalide'),
  body('title').notEmpty().withMessage('Le titre est requis'),
  body('message').notEmpty().withMessage('Le message est requis'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Priorité invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, title, message, priority = 'medium', data = {} } = req.body;

    const notification = await notificationService.createNotification({
      type,
      title,
      message,
      priority,
      data
    });

    if (notification) {
      res.json({
        success: true,
        message: 'Notification de test créée',
        data: notification
      });
    } else {
      res.status(500).json({ error: 'Erreur lors de la création de la notification' });
    }

  } catch (error) {
    console.error('❌ Error creating test notification:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la notification' });
  }
});

// Test all notification types (admin only)
router.post('/admin/test-all', adminAuth, checkNotificationService, async (req, res) => {
  try {
    const testNotifications = [
      {
        type: 'order_new',
        title: '🆕 Nouvelle commande #12345',
        message: 'Commande de €150.00 reçue de Jean Dupont',
        priority: 'medium',
        data: { orderId: 12345, amount: 150.00 }
      },
      {
        type: 'order_status_change',
        title: '📦 Statut commande #12345 mis à jour',
        message: 'En attente → En cours de traitement',
        priority: 'medium',
        data: { orderId: 12345, oldStatus: 'pending', newStatus: 'processing' }
      },
      {
        type: 'order_high_value',
        title: '💰 Commande haute valeur #12346',
        message: 'Commande de €500.00 reçue - Vérification requise',
        priority: 'high',
        data: { orderId: 12346, amount: 500.00 }
      },
      {
        type: 'inventory_low_stock',
        title: '⚠️ Stock faible - iPhone 15 Pro',
        message: 'Il ne reste que 3 unités en stock',
        priority: 'high',
        data: { productId: 1, productName: 'iPhone 15 Pro', currentStock: 3 }
      },
      {
        type: 'inventory_out_of_stock',
        title: '🚨 Rupture de stock - MacBook Pro',
        message: 'Le produit MacBook Pro est en rupture de stock',
        priority: 'critical',
        data: { productId: 2, productName: 'MacBook Pro' }
      },
      {
        type: 'inventory_restored',
        title: '✅ Stock restauré - AirPods Pro',
        message: 'Le stock de AirPods Pro a été restauré (25 unités)',
        priority: 'medium',
        data: { productId: 3, productName: 'AirPods Pro', currentStock: 25 }
      },
      {
        type: 'user_registration',
        title: '🎉 Nouveau utilisateur inscrit',
        message: 'Marie Martin s\'est inscrite sur la plateforme',
        priority: 'low',
        data: { userId: 456, userName: 'Marie Martin' }
      },
      {
        type: 'system_error',
        title: '🔧 Erreur système détectée',
        message: 'Problème de connexion à la base de données',
        priority: 'critical',
        data: { error: 'Database connection failed', timestamp: new Date() }
      }
    ];

    const results = [];
    for (const notification of testNotifications) {
      try {
        const result = await notificationService.createNotification(notification);
        results.push({
          type: notification.type,
          success: !!result,
          notification: result
        });
      } catch (error) {
        results.push({
          type: notification.type,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Test de toutes les notifications terminé',
      data: results
    });

  } catch (error) {
    console.error('❌ Error testing all notifications:', error);
    res.status(500).json({ error: 'Erreur lors du test des notifications' });
  }
});

// Test notification with sound (admin only)
router.post('/admin/test-sound', adminAuth, checkNotificationService, [
  body('soundType').isIn(['critical-alert', 'high-alert', 'medium-alert', 'low-alert']).withMessage('Type de son invalide')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { soundType } = req.body;

    // Emit sound to all connected clients
    notificationService.io.emit('notification-sound', { sound: soundType });

    res.json({
      success: true,
      message: `Son de test ${soundType} envoyé`,
      data: { soundType }
    });

  } catch (error) {
    console.error('❌ Error testing sound:', error);
    res.status(500).json({ error: 'Erreur lors du test du son' });
  }
});

// Get notification statistics (admin only)
router.get('/admin/stats', adminAuth, checkNotificationService, async (req, res) => {
  try {
    const { Notification } = require('../models');
    const { Op } = require('sequelize');

    const stats = await Promise.all([
      // Total notifications
      Notification.count(),
      
      // Unread notifications
      Notification.count({ where: { isRead: false } }),
      
      // Notifications by priority
      Notification.count({ where: { priority: 'critical' } }),
      Notification.count({ where: { priority: 'high' } }),
      Notification.count({ where: { priority: 'medium' } }),
      Notification.count({ where: { priority: 'low' } }),
      
      // Notifications by type
      Notification.count({ where: { type: 'order_new' } }),
      Notification.count({ where: { type: 'inventory_low_stock' } }),
      Notification.count({ where: { type: 'system_error' } }),
      
      // Recent notifications (last 24 hours)
      Notification.count({
        where: {
          createdAt: {
            [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        total: stats[0],
        unread: stats[1],
        byPriority: {
          critical: stats[2],
          high: stats[3],
          medium: stats[4],
          low: stats[5]
        },
        byType: {
          order_new: stats[6],
          inventory_low_stock: stats[7],
          system_error: stats[8]
        },
        last24Hours: stats[9]
      }
    });

  } catch (error) {
    console.error('❌ Error getting notification stats:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
});

module.exports = { router, setNotificationService }; 