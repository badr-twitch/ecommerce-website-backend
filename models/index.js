const sequelize = require('../config/database');

// Import models
const User = require('./User');
const Product = require('./Product');
const Category = require('./Category');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Review = require('./Review')(sequelize); // Call the function with sequelize instance
const StockHistory = require('./StockHistory');
const Notification = require('./Notification');
const NotificationPreference = require('./NotificationPreference');
const OrderStatusLog = require('./OrderStatusLog');
const OrderShare = require('./OrderShare');
const OrderNote = require('./OrderNote');
const MembershipTransaction = require('./MembershipTransaction');
const MembershipGift = require('./MembershipGift');
const AdminAuditLog = require('./AdminAuditLog');

// Define associations
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Wishlist association (User has many products through wishlist array)
User.belongsToMany(Product, { 
  through: 'UserWishlist', 
  foreignKey: 'userId', 
  otherKey: 'productId',
  as: 'wishlistProducts'
});
Product.belongsToMany(User, { 
  through: 'UserWishlist', 
  foreignKey: 'productId', 
  otherKey: 'userId',
  as: 'wishlistedBy'
});

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

// Stock history associations
Product.hasMany(StockHistory, { foreignKey: 'productId', as: 'stockHistory' });
StockHistory.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

User.hasMany(StockHistory, { foreignKey: 'performedBy', as: 'stockChanges' });
StockHistory.belongsTo(User, { foreignKey: 'performedBy', as: 'performedByUser' });

// Notification associations
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(NotificationPreference, { foreignKey: 'userId', as: 'notificationPreferences' });
NotificationPreference.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Order status audit trail
Order.hasMany(OrderStatusLog, { foreignKey: 'orderId', as: 'statusLogs' });
OrderStatusLog.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
User.hasMany(OrderStatusLog, { foreignKey: 'changedBy', as: 'statusChanges' });
OrderStatusLog.belongsTo(User, { foreignKey: 'changedBy', as: 'changedByUser' });

// Order sharing
Order.hasMany(OrderShare, { foreignKey: 'orderId', as: 'shares' });
OrderShare.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

// Membership transactions
User.hasMany(MembershipTransaction, { foreignKey: 'userId', as: 'membershipTransactions' });
MembershipTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Order notes
Order.hasMany(OrderNote, { foreignKey: 'orderId', as: 'notes' });
OrderNote.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
User.hasMany(OrderNote, { foreignKey: 'userId', as: 'orderNotes' });
OrderNote.belongsTo(User, { foreignKey: 'userId', as: 'author' });

// Membership gifts
User.hasMany(MembershipGift, { foreignKey: 'senderUserId', as: 'sentGifts' });
MembershipGift.belongsTo(User, { foreignKey: 'senderUserId', as: 'sender' });
User.hasMany(MembershipGift, { foreignKey: 'redeemedByUserId', as: 'receivedGifts' });
MembershipGift.belongsTo(User, { foreignKey: 'redeemedByUserId', as: 'redeemer' });

// Admin audit log associations
User.hasMany(AdminAuditLog, { foreignKey: 'adminId', as: 'auditLogs' });
AdminAuditLog.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// Self-referential association for categories
Category.hasMany(Category, { 
  as: 'children', 
  foreignKey: 'parentId' 
});
Category.belongsTo(Category, { 
  as: 'parent', 
  foreignKey: 'parentId' 
});

module.exports = {
  sequelize,
  User,
  Product,
  Category,
  Order,
  OrderItem,
  Cart,
  CartItem,
  Review,
  StockHistory,
  Notification,
  NotificationPreference,
  OrderStatusLog,
  OrderShare,
  OrderNote,
  MembershipTransaction,
  MembershipGift,
  AdminAuditLog
}; 