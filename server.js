const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'FIREBASE_SERVICE_ACCOUNT'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');

// Parse Firebase service account
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('FATAL: Cannot parse FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    if (!serviceAccount) {
      throw new Error('Firebase service account not available');
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
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
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
const { globalLimiter } = require('./middleware/rateLimiter');
app.use(globalLimiter);
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Stripe webhook needs raw body — must be before express.json()
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const paymentProcessor = require('./services/paymentProcessor');
  const Order = require('./models/Order');
  const sig = req.headers['stripe-signature'];

  try {
    const event = paymentProcessor.constructWebhookEvent(req.body, sig);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        console.log(`✅ Stripe: Payment ${pi.id} succeeded`);
        // Update order payment status if order already exists
        const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
        if (order && order.paymentStatus !== 'paid') {
          await order.update({ paymentStatus: 'paid' });
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        console.log(`❌ Stripe: Payment ${pi.id} failed`);
        const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
        if (order) {
          await order.update({ paymentStatus: 'failed' });
        }
        break;
      }
      default:
        console.log(`Stripe webhook: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const sanitizeBody = require('./middleware/sanitize');
app.use(sanitizeBody);

// Request logging middleware (no body in production to prevent leaking sensitive data)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 ${req.method} ${req.path}`);
  }
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
// Review model is now imported through models index
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

// Initialize Notification Service
const NotificationService = require('./services/notificationService');
const notificationService = new NotificationService(io);

// Start membership cron job
const { startMembershipCron } = require('./services/membershipCron');
startMembershipCron(notificationService);
const { startNotificationCleanup } = require('./services/notificationCleanupCron');
startNotificationCleanup();

// Import routes
const { router: authRoutes, setNotificationService: setAuthNotificationService } = require('./routes/auth');
const productRoutes = require('./routes/products');
const { router: orderRoutes, setNotificationService: setOrderNotificationService } = require('./routes/orders');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const paymentMethodRoutes = require('./routes/paymentMethods');
const shippingAddressRoutes = require('./routes/shippingAddresses');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const reviewRoutes = require('./routes/reviews');
const recommendationRoutes = require('./routes/recommendations');
const { router: notificationRoutes, setNotificationService } = require('./routes/notifications');
const { router: membershipRoutes, setNotificationService: setMembershipNotificationService } = require('./routes/membership');

// Set notification service in routes
setNotificationService(notificationService);
setOrderNotificationService(notificationService);
setMembershipNotificationService(notificationService);
setAuthNotificationService(notificationService);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', require('./routes/invoices'));
app.use('/api/orders', require('./routes/orderShare'));
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/shipping-addresses', shippingAddressRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/membership', membershipRoutes);

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const user = await User.findOne({ where: { firebaseUid: decodedToken.uid } });
    if (!user) {
      return next(new Error('User not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  const user = socket.user;

  // Auto-join user room based on verified identity
  socket.join(`user-${user.id}`);

  // Join admin room if user is admin
  if (user.role === 'admin') {
    socket.on('join-admin', () => {
      socket.join('admin');
    });
  }

  socket.on('disconnect', () => {
    // Socket.IO auto-cleans room membership
  });
});

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
  // Only log stack trace in development
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  } else {
    console.error(`Error: ${err.message} | ${req.method} ${req.originalUrl}`);
  }

  // Notify admin of system errors
  if (notificationService) {
    notificationService.notifySystemError(err, {
      url: req.originalUrl,
      method: req.method
    }).catch(() => {});
  }

  res.status(500).json({
    error: 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { message: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Serveur ecommerce français démarré sur le port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket URL: ws://localhost:${PORT}`);
});

// Export for testing
module.exports = { app, server, io, notificationService };
