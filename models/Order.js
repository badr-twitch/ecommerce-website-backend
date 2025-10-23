const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  orderNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Human-readable order number'
  },
  status: {
    type: DataTypes.ENUM(
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    ),
    defaultValue: 'pending',
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  shippingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
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
    currency: {
      type: DataTypes.STRING,
      defaultValue: 'MAD',
      allowNull: false
    },
  // Customer information
  customerFirstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customerLastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Billing address
  billingAddress: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  billingCity: {
    type: DataTypes.STRING,
    allowNull: false
  },
  billingPostalCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  billingCountry: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'France'
  },
  // Shipping address
  shippingAddress: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  shippingCity: {
    type: DataTypes.STRING,
    allowNull: false
  },
  shippingPostalCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  shippingCountry: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'France'
  },
  // Payment information
  paymentMethod: {
    type: DataTypes.ENUM('card', 'paypal', 'bank_transfer', 'cash_on_delivery'),
    allowNull: false
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    defaultValue: 'pending',
    allowNull: false
  },
  paymentTransactionId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Shipping information
  shippingMethod: {
    type: DataTypes.STRING,
    allowNull: true
  },
  trackingNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  estimatedDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  actualDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Notes and comments
  customerNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Timestamps for status changes
  confirmedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  shippedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'orders',
  timestamps: true,
  indexes: [
    {
      fields: ['orderNumber']
    },
    {
      fields: ['status']
    },
    {
      fields: ['userId']
    },
    {
      fields: ['customerEmail']
    },
    {
      fields: ['paymentStatus']
    },
    {
      fields: ['createdAt']
    }
  ]
});

// Instance methods
Order.prototype.calculateTotal = function() {
  return this.subtotal + this.taxAmount + this.shippingAmount - this.discountAmount;
};

Order.prototype.isPaid = function() {
  return this.paymentStatus === 'paid';
};

Order.prototype.canBeCancelled = function() {
  return ['pending', 'confirmed', 'processing'].includes(this.status);
};

Order.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  values.calculatedTotal = this.calculateTotal();
  values.isPaid = this.isPaid();
  values.canBeCancelled = this.canBeCancelled();
  return values;
};

module.exports = Order; 