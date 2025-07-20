const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 200]
    }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [0, 1000]
    }
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the review is from a verified purchase'
  },
  isApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether the review is approved by admin'
  },
  helpfulCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'products',
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
  }
}, {
  tableName: 'reviews',
  timestamps: true,
  indexes: [
    {
      fields: ['productId']
    },
    {
      fields: ['userId']
    },
    {
      fields: ['rating']
    },
    {
      fields: ['isApproved']
    }
  ]
});

module.exports = Review; 