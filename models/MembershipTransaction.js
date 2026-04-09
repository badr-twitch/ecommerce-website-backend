const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MembershipTransaction = sequelize.define('MembershipTransaction', {
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
    type: DataTypes.ENUM('subscription', 'renewal', 'cancellation', 'refund', 'expiration'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'MAD'
  },
  stripePaymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('succeeded', 'failed', 'pending', 'refunded'),
    defaultValue: 'succeeded'
  },
  planId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  billingPeriodStart: {
    type: DataTypes.DATE,
    allowNull: true
  },
  billingPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'membership_transactions',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = MembershipTransaction;
