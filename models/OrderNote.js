const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderNote = sequelize.define('OrderNote', {
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
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isInternal: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'order_notes',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['orderId'] }
  ]
});

module.exports = OrderNote;
