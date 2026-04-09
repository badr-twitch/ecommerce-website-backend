const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MembershipGift = sequelize.define('MembershipGift', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING(12),
    allowNull: false,
    unique: true,
    comment: 'Gift redemption code'
  },
  senderUserId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  recipientEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  recipientName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  personalMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  planId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Which plan to gift (monthly/annual)'
  },
  durationDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'MAD'
  },
  stripePaymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'redeemed', 'expired', 'refunded'),
    defaultValue: 'pending'
  },
  redeemedByUserId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  redeemedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Code expiration date (gift must be redeemed before this)'
  }
}, {
  tableName: 'membership_gifts',
  timestamps: true
});

module.exports = MembershipGift;
