const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
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
      len: [2, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [10, 2000]
    }
  },
  shortDescription: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 500]
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  originalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'EUR',
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  minStockLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    validate: {
      min: 0
    }
  },
  weight: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: true,
    comment: 'Weight in grams'
  },
  dimensions: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Length, width, height in cm'
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of image URLs'
  },
  mainImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of tags for search'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isOnSale: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  salePercentage: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 100
    }
  },
  brand: {
    type: DataTypes.STRING,
    allowNull: true
  },
  model: {
    type: DataTypes.STRING,
    allowNull: true
  },
  warranty: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Warranty period description'
  },
  shippingInfo: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Shipping details, delivery time, etc.'
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
  },
  categoryId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'categories',
      key: 'id'
    }
  }
}, {
  tableName: 'products',
  timestamps: true,
  indexes: [
    {
      fields: ['name']
    },
    {
      fields: ['sku']
    },
    {
      fields: ['categoryId']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['isFeatured']
    },
    {
      fields: ['price']
    }
  ]
});

// Instance methods
Product.prototype.getDiscountedPrice = function() {
  if (this.isOnSale && this.salePercentage) {
    return this.price * (1 - this.salePercentage / 100);
  }
  return this.price;
};

Product.prototype.isInStock = function() {
  return this.stockQuantity > 0;
};

Product.prototype.isLowStock = function() {
  return this.stockQuantity <= this.minStockLevel && this.stockQuantity > 0;
};

Product.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  values.discountedPrice = this.getDiscountedPrice();
  values.inStock = this.isInStock();
  values.lowStock = this.isLowStock();
  return values;
};

module.exports = Product; 