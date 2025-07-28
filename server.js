const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Debug environment variables
console.log('🔍 Environment check:');
console.log('- FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
console.log('- FIREBASE_DATABASE_URL exists:', !!process.env.FIREBASE_DATABASE_URL);

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');

// Parse Firebase service account
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log('✅ Firebase service account loaded successfully');
} catch (error) {
  console.error('❌ Error parsing Firebase service account:', error);
  console.error('❌ FIREBASE_SERVICE_ACCOUNT value:', process.env.FIREBASE_SERVICE_ACCOUNT ? 'EXISTS' : 'MISSING');
  serviceAccount = null;
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    if (!serviceAccount) {
      throw new Error('Firebase service account not available');
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
    
    // Test Firebase Admin functionality
    try {
      admin.auth().getUserByEmail('test@example.com')
        .then(() => console.log('✅ Firebase Admin SDK is working correctly'))
        .catch(() => console.log('⚠️ Firebase Admin SDK initialized but test failed'));
    } catch (testError) {
      console.log('⚠️ Firebase Admin SDK initialized but test failed:', testError.message);
    }
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
} else {
  console.log('✅ Firebase Admin SDK already initialized');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.path} - Body:`, req.body);
  next();
});

// Database configuration
const sequelize = require('./config/database');

// Import models
const User = require('./models/User');
const Product = require('./models/Product');
const Category = require('./models/Category');
const Order = require('./models/Order');
const OrderItem = require('./models/OrderItem');
const Cart = require('./models/Cart');
const CartItem = require('./models/CartItem');
const Review = require('./models/Review');
const PaymentMethod = require('./models/PaymentMethod');
const ShippingAddress = require('./models/ShippingAddress');
const VerificationCode = require('./models/VerificationCode');

// Test database connection and sync models
sequelize.authenticate()
  .then(() => {
    console.log('✅ Connexion à la base de données PostgreSQL établie avec succès.');
    
    // Import models index to ensure associations are loaded
    require('./models/index');
    
    // Sync all models with database
    return sequelize.sync({ force: false }); // Back to normal sync
  })
  .then(() => {
    console.log('✅ Modèles de base de données synchronisés avec succès.');
  })
  .catch(err => {
    console.error('❌ Erreur de connexion à la base de données:', err);
  });

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const paymentMethodRoutes = require('./routes/paymentMethods');
const shippingAddressRoutes = require('./routes/shippingAddresses');
const adminRoutes = require('./routes/admin');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/shipping-addresses', shippingAddressRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Serveur ecommerce français opérationnel',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Serveur ecommerce français démarré sur le port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
});

module.exports = app;
