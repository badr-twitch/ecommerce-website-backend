const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockHistory = sequelize.define('StockHistory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  changeType: {
    type: DataTypes.ENUM('in', 'out', 'adjustment', 'initial'),
    allowNull: false,
    comment: 'Type of stock change: in (received), out (sold), adjustment (manual), initial (setup)'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Quantity changed (positive for in, negative for out)'
  },
  previousStock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Stock level before change'
  },
  newStock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Stock level after change'
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Reason for stock change (e.g., "Order #123", "Manual adjustment", "Initial stock")'
  },
  referenceId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Reference to related entity (e.g., order ID, adjustment ID)'
  },
  referenceType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Type of reference (e.g., "order", "adjustment", "manual")'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes about the stock change'
  },
  performedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User ID who performed the stock change'
  }
}, {
  tableName: 'stock_history',
  timestamps: true,
  indexes: [
    {
      fields: ['productId']
    },
    {
      fields: ['changeType']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = StockHistory; 