const dotenv = require('dotenv');
const sequelize = require('../config/database');

// Load environment variables
dotenv.config();

// Import all models
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');
const Review = require('../models/Review');

async function syncDatabase() {
  try {
    console.log('🔄 Synchronisation de la base de données...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connexion à PostgreSQL établie avec succès.');
    
    // Define associations
    User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
    Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
    Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    User.hasOne(Cart, { foreignKey: 'userId', as: 'cart' });
    Cart.belongsTo(User, { foreignKey: 'userId', as: 'user' });

    Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
    Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

    Product.hasMany(Review, { foreignKey: 'productId', as: 'reviews' });
    Review.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

    Product.hasMany(CartItem, { foreignKey: 'productId', as: 'cartItems' });
    CartItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

    Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'cartItems' });
    CartItem.belongsTo(Cart, { foreignKey: 'cartId', as: 'cart' });

    Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'orderItems' });
    OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

    Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });
    OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

    // Self-referential association for categories
    Category.hasMany(Category, { 
      as: 'children', 
      foreignKey: 'parentId' 
    });
    Category.belongsTo(Category, { 
      as: 'parent', 
      foreignKey: 'parentId' 
    });
    
    // Sync all models (create tables)
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Tables créées/mises à jour avec succès.');
    
    console.log('🎉 Base de données prête !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation:', error);
    process.exit(1);
  }
}

syncDatabase(); 