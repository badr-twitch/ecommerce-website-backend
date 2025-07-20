const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true
  },
  icon: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Icon class or SVG path'
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  seoTitle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  seoDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  seoKeywords: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'categories',
  timestamps: true,
  indexes: [
    {
      fields: ['name']
    },
    {
      fields: ['slug']
    },
    {
      fields: ['parentId']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['sortOrder']
    }
  ]
});

module.exports = Category; 