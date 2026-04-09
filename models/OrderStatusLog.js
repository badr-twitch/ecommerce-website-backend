const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderStatusLog = sequelize.define('OrderStatusLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  previousStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  newStatus: {
    type: DataTypes.STRING,
    allowNull: false
  },
  changedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  changedByRole: {
    type: DataTypes.ENUM('customer', 'admin', 'system'),
    defaultValue: 'system'
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'order_status_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['orderId'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = OrderStatusLog;
