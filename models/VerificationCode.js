const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VerificationCode = sequelize.define('VerificationCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  code: {
    type: DataTypes.STRING(6),
    allowNull: false,
    validate: {
      len: [6, 6]
    }
  },
  type: {
    type: DataTypes.ENUM('phone_change', 'phone_verification'),
    allowNull: false,
    defaultValue: 'phone_change'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  newPhoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'The new phone number to be set after verification'
  }
}, {
  tableName: 'verification_codes',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'type', 'used']
    },
    {
      fields: ['email', 'code', 'used']
    },
    {
      fields: ['expiresAt']
    }
  ]
});

module.exports = VerificationCode; 