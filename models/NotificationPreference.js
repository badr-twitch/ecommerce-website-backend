const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NotificationPreference = sequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM(
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
    ),
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  emailEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  soundEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  toastEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'notification_preferences',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['type']
    },
    {
      unique: true,
      fields: ['userId', 'type']
    }
  ]
});

module.exports = NotificationPreference; 