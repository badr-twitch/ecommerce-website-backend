const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  totalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  productName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Snapshot of product name at time of order'
  },
  productSku: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Snapshot of product SKU at time of order'
  },
  productImage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Snapshot of product image at time of order'
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  }
}, {
  tableName: 'order_items',
  timestamps: true,
  indexes: [
    {
      fields: ['orderId']
    },
    {
      fields: ['productId']
    }
  ]
});

module.exports = OrderItem; 