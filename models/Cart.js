const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cart = sequelize.define('Cart', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'For guest users'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  itemCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Cart expiration date for guest users'
  }
}, {
  tableName: 'carts',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['sessionId']
    },
    {
      fields: ['isActive']
    }
  ]
});

module.exports = Cart; 