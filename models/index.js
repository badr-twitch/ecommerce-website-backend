const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'ecommerce_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Import models
const User = require('./User');
const Product = require('./Product');
const Category = require('./Category');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Review = require('./Review');

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

module.exports = {
  sequelize,
  User,
  Product,
  Category,
  Order,
  OrderItem,
  Cart,
  CartItem,
  Review
}; 