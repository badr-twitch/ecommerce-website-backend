const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  firebaseUid: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Firebase Authentication UID'
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50]
    }
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true, // Allow null for Firebase users
    validate: {
      len: [6, 100]
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [10, 15]
    }
  },
  role: {
    type: DataTypes.ENUM('client', 'admin'),
    defaultValue: 'client',
    allowNull: false
  },
  clientType: {
    type: DataTypes.ENUM('particulier', 'professionnel'),
    defaultValue: 'particulier',
    allowNull: false,
    comment: 'Type of client: particulier (individual) or professionnel (business)'
  },
  // Business fields (for professionnel clients)
  companyName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Company name for professional clients'
  },
  siret: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [14, 14]
    },
    comment: 'SIRET number (14 digits) for French businesses'
  },
  vatNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'VAT/TVA number for professional clients'
  },
  billingAddress: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Billing address for professional clients'
  },
  billingCity: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Billing city for professional clients'
  },
  billingPostalCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Billing postal code for professional clients'
  },
  billingCountry: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'France',
    comment: 'Billing country for professional clients'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  emailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailVerificationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Address fields
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true
  },
  postalCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'France'
  },
  // Additional fields for better user management
  photoURL: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Profile photo URL from Firebase'
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Display name from Firebase'
  },
  wishlist: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of product IDs in user wishlist'
  },
  notificationSettings: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Global notification settings like globalSounds'
  },
  membershipStatus: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'none',
    validate: {
      isIn: [['none', 'active', 'cancelled', 'expired', 'pending']]
    },
    comment: 'Status of paid membership'
  },
  membershipPlan: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Current membership plan identifier'
  },
  membershipPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Membership price at time of subscription'
  },
  membershipCurrency: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'MAD',
    comment: 'Currency used for membership billing'
  },
  membershipActivatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Membership activation date'
  },
  membershipExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Membership expiration date'
  },
  membershipAutoRenew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether membership renews automatically'
  },
  membershipBenefitsSnapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Snapshot of benefits at time of subscription'
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        user.password = await bcrypt.hash(user.password, saltRounds);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
        user.password = await bcrypt.hash(user.password, saltRounds);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // Firebase users don't have passwords in our DB
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  delete values.emailVerificationToken;
  delete values.passwordResetToken;
  delete values.passwordResetExpires;
  return values;
};

module.exports = User; 