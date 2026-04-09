const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderShare = sequelize.define('OrderShare', {
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
  token: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true
  },
  shareType: {
    type: DataTypes.ENUM('status', 'products', 'gift'),
    defaultValue: 'products'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'order_shares',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['token'], unique: true },
    { fields: ['expiresAt'] }
  ]
});

module.exports = OrderShare;
