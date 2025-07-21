const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentMethod = sequelize.define('PaymentMethod', {
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
  // Payment processor integration
  processorId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment processor ID (e.g., Stripe Payment Method ID)'
  },
  processorType: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Payment processor type (stripe, paypal, etc.)'
  },
  // Safe card information (only what's needed for display)
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Card type: visa, mastercard, amex, etc.'
  },
  last4: {
    type: DataTypes.STRING(4),
    allowNull: false,
    comment: 'Last 4 digits of card'
  },
  expiry: {
    type: DataTypes.STRING(5),
    allowNull: false,
    comment: 'Expiry date in MM/YY format'
  },
  cardholderName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // Card brand for better UX
  brand: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Card brand: Visa, Mastercard, American Express, etc.'
  },
  // Security and status
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Additional metadata
  fingerprint: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Card fingerprint for duplicate detection'
  }
}, {
  tableName: 'payment_methods',
  timestamps: true
});

module.exports = PaymentMethod; 