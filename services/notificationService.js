const { Notification, NotificationPreference, User, Order, Product } = require('../models');
const { Op } = require('sequelize');

class NotificationService {
  constructor(io) {
    this.io = io;
    this.adminRoom = 'admin';
    this.userRooms = new Map(); // userId -> socketId
  }

  // Add user to socket room
  addUserToRoom(userId, socketId) {
    this.userRooms.set(userId, socketId);
  }

  // Remove user from socket room
  removeUserFromRoom(userId) {
    this.userRooms.delete(userId);
  }

  // Get user preferences
  async getUserPreferences(userId) {
    try {
      // Get notification type preferences
      const preferences = await NotificationPreference.findAll({
        where: { userId },
        attributes: ['type', 'enabled', 'emailEnabled', 'soundEnabled', 'toastEnabled']
      });

      const preferencesMap = {};
      preferences.forEach(pref => {
        preferencesMap[pref.type] = {
          enabled: pref.enabled,
          emailEnabled: pref.emailEnabled,
          soundEnabled: pref.soundEnabled,
          toastEnabled: pref.toastEnabled
        };
      });

      // Get global settings from user table
      const { User } = require('../models');
      const user = await User.findByPk(userId, {
        attributes: ['notificationSettings']
      });

      if (user && user.notificationSettings) {
        // Merge global settings with notification preferences
        Object.assign(preferencesMap, user.notificationSettings);
      }

      return preferencesMap;
    } catch (error) {
      console.error('❌ Error getting user preferences:', error);
      return {};
    }
  }

  // Create notification
  async createNotification(data) {
    try {
      const {
        userId = null, // null for admin notifications
        type,
        title,
        message,
        priority = 'medium',
        data = {},
        expiresAt = null
      } = data;

      // Check if user has disabled this notification type
      if (userId) {
        const preferences = await this.getUserPreferences(userId);
        if (preferences[type] && !preferences[type].enabled) {
          return null;
        }
      }

      // Create notification in database
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        priority,
        data,
        expiresAt
      });

      // Send real-time notification
      await this.sendRealTimeNotification(notification, userId);

      return notification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      return null;
    }
  }

  // Send real-time notification
  async sendRealTimeNotification(notification, userId) {
    try {
      const notificationData = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        data: notification.data,
        createdAt: notification.createdAt,
        isRead: notification.isRead
      };

      // Send to admin room
      this.io.to(this.adminRoom).emit('notification', {
        ...notificationData,
        target: 'admin'
      });

      // Send to specific user if provided
      if (userId) {
        const socketId = this.userRooms.get(userId);
        if (socketId) {
          this.io.to(socketId).emit('notification', {
            ...notificationData,
            target: 'user'
          });
        }
      }

      // Play sound based on priority
      const soundMap = {
        critical: 'critical-alert',
        high: 'high-alert',
        medium: 'medium-alert',
        low: 'low-alert'
      };

      const sound = soundMap[notification.priority] || 'medium-alert';
      
      // Send sound notification to admin
      this.io.to(this.adminRoom).emit('notification-sound', { sound });
      
      // Send sound notification to user if enabled
      if (userId) {
        const preferences = await this.getUserPreferences(userId);
        if (preferences[notification.type]?.soundEnabled) {
          const socketId = this.userRooms.get(userId);
          if (socketId) {
            this.io.to(socketId).emit('notification-sound', { sound });
          }
        }
      }

    } catch (error) {
      console.error('❌ Error sending real-time notification:', error);
    }
  }

  // Order notifications
  async notifyNewOrder(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
          { model: OrderItem, as: 'orderItems', include: [{ model: Product, as: 'product' }] }
        ]
      });

      if (!order) return;

      const totalAmount = order.totalAmount;
      const isHighValue = totalAmount > 500;

      // Create notification
      await this.createNotification({
        type: 'order_new',
        title: `🆕 Nouvelle commande #${order.id}`,
        message: `Commande de ${order.user.firstName} ${order.user.lastName} - ${totalAmount.toFixed(2)} DH`,
        priority: isHighValue ? 'high' : 'medium',
        data: {
          orderId: order.id,
          userId: order.userId,
          totalAmount,
          isHighValue,
          itemsCount: order.orderItems.length
        }
      });

      // High value order notification
      if (isHighValue) {
        await this.createNotification({
          type: 'order_high_value',
          title: `💰 Commande haute valeur #${order.id}`,
          message: `Commande de ${totalAmount.toFixed(2)} DH - ${order.user.firstName} ${order.user.lastName}`,
          priority: 'critical',
          data: {
            orderId: order.id,
            userId: order.userId,
            totalAmount,
            itemsCount: order.orderItems.length
          }
        });
      }

    } catch (error) {
      console.error('❌ Error notifying new order:', error);
    }
  }

  async notifyOrderStatusChange(orderId, oldStatus, newStatus) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
      });

      if (!order) return;

      const statusLabels = {
        pending: 'En attente',
        processing: 'En cours de traitement',
        shipped: 'Expédiée',
        delivered: 'Livrée',
        cancelled: 'Annulée'
      };

      await this.createNotification({
        type: 'order_status_change',
        title: `📦 Statut commande #${order.id} mis à jour`,
        message: `${statusLabels[oldStatus]} → ${statusLabels[newStatus]} - ${order.user.firstName} ${order.user.lastName}`,
        priority: 'medium',
        data: {
          orderId: order.id,
          userId: order.userId,
          oldStatus,
          newStatus
        }
      });

    } catch (error) {
      console.error('❌ Error notifying order status change:', error);
    }
  }

  // Inventory notifications
  async notifyLowStock(productId) {
    try {
      const product = await Product.findByPk(productId);
      if (!product) return;

      await this.createNotification({
        type: 'inventory_low_stock',
        title: `⚠️ Stock faible - ${product.name}`,
        message: `Il ne reste que ${product.stockQuantity} unités en stock`,
        priority: 'high',
        data: {
          productId: product.id,
          productName: product.name,
          currentStock: product.stockQuantity,
          reorderPoint: product.reorderPoint || 10
        }
      });

    } catch (error) {
      console.error('❌ Error notifying low stock:', error);
    }
  }

  async notifyOutOfStock(productId) {
    try {
      const product = await Product.findByPk(productId);
      if (!product) return;

      await this.createNotification({
        type: 'inventory_out_of_stock',
        title: `🚨 Rupture de stock - ${product.name}`,
        message: `Le produit ${product.name} est en rupture de stock`,
        priority: 'critical',
        data: {
          productId: product.id,
          productName: product.name
        }
      });

    } catch (error) {
      console.error('❌ Error notifying out of stock:', error);
    }
  }

  async notifyStockRestored(productId) {
    try {
      const product = await Product.findByPk(productId);
      if (!product) return;

      await this.createNotification({
        type: 'inventory_restored',
        title: `✅ Stock restauré - ${product.name}`,
        message: `Le stock de ${product.name} a été restauré (${product.stockQuantity} unités)`,
        priority: 'medium',
        data: {
          productId: product.id,
          productName: product.name,
          currentStock: product.stockQuantity
        }
      });

    } catch (error) {
      console.error('❌ Error notifying stock restored:', error);
    }
  }

  // User notifications
  async notifyUserRegistration(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) return;

      await this.createNotification({
        type: 'user_registration',
        title: `🎉 Nouvel utilisateur inscrit`,
        message: `${user.firstName} ${user.lastName} (${user.email}) s'est inscrit`,
        priority: 'low',
        data: {
          userId: user.id,
          userEmail: user.email,
          userFirstName: user.firstName,
          userLastName: user.lastName
        }
      });

    } catch (error) {
      console.error('❌ Error notifying user registration:', error);
    }
  }

  // System notifications
  async notifySystemError(error, context = {}) {
    try {
      await this.createNotification({
        type: 'system_error',
        title: `🔧 Erreur système`,
        message: error.message || 'Une erreur système s\'est produite',
        priority: 'critical',
        data: {
          error: error.message,
          stack: error.stack,
          context
        }
      });

    } catch (err) {
      console.error('❌ Error notifying system error:', err);
    }
  }

  // Get notifications for user
  async getUserNotifications(userId, limit = 50, offset = 0) {
    try {
      const notifications = await Notification.findAll({
        where: {
          [Op.or]: [
            { userId },
            { userId: null } // Admin notifications
          ],
          isArchived: false
        },
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      return notifications;
    } catch (error) {
      console.error('❌ Error getting user notifications:', error);
      return [];
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            id: notificationId,
            [Op.or]: [
              { userId },
              { userId: null } // Admin notifications
            ]
          }
        }
      );

      return true;
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      return false;
    }
  }

  // Mark all notifications as read
  async markAllAsRead(userId) {
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            [Op.or]: [
              { userId },
              { userId: null } // Admin notifications
            ],
            isRead: false
          }
        }
      );

      return true;
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      return false;
    }
  }

  // Get unread count
  async getUnreadCount(userId) {
    try {
      const count = await Notification.count({
        where: {
          [Op.or]: [
            { userId },
            { userId: null } // Admin notifications
          ],
          isRead: false,
          isArchived: false
        }
      });

      return count;
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  // Update notification preferences
  async updatePreferences(userId, preferences) {
    try {
      // Handle global settings separately
      const globalSettings = {};
      const notificationPreferences = {};

      // Separate global settings from notification type preferences
      for (const [key, value] of Object.entries(preferences)) {
        if (key === 'globalSounds') {
          globalSettings[key] = value;
        } else {
          notificationPreferences[key] = value;
        }
      }

      // Update notification type preferences
      for (const [type, settings] of Object.entries(notificationPreferences)) {
        await NotificationPreference.upsert({
          userId,
          type,
          enabled: settings.enabled,
          emailEnabled: settings.emailEnabled || false,
          soundEnabled: settings.soundEnabled !== false,
          toastEnabled: settings.toastEnabled !== false
        });
      }

      // Update global settings in user table or separate table
      if (Object.keys(globalSettings).length > 0) {
        const { User } = require('../models');
        await User.update(
          { notificationSettings: globalSettings },
          { where: { id: userId } }
        );
      }

      return true;
    } catch (error) {
      console.error('❌ Error updating notification preferences:', error);
      return false;
    }
  }
}

module.exports = NotificationService; 