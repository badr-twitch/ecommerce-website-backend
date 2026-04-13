const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Load environment variables
dotenv.config();

const logger = require('./services/logger');

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'FIREBASE_SERVICE_ACCOUNT', 'AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { vars: missingVars });
  process.exit(1);
}

// Production-only: validate secret strength and HTTPS URLs
if (process.env.NODE_ENV === 'production') {
  if (process.env.JWT_SECRET.length < 32) {
    logger.error('JWT_SECRET must be at least 32 characters in production');
    process.exit(1);
  }
  const frontendUrls = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim());
  const insecureUrls = frontendUrls.filter(u => u && !u.startsWith('https://'));
  if (insecureUrls.length > 0) {
    logger.error('FRONTEND_URL must use HTTPS in production', { insecureUrls });
    process.exit(1);
  }
}

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');

// Parse Firebase service account
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  logger.error('Cannot parse FIREBASE_SERVICE_ACCOUNT');
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
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    logger.info('Firebase Admin SDK initialized');

    // Test Firebase Admin functionality
    admin.auth().getUserByEmail('test@example.com')
      .then(() => logger.info('Firebase Admin SDK verified'))
      .catch(() => logger.warn('Firebase Admin SDK initialized but verification test failed'));
  } catch (error) {
    logger.error('Error initializing Firebase Admin', { error: error.message });
  }
} else {
  logger.info('Firebase Admin SDK already initialized');
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

// Trust reverse proxy (nginx/cloud LB) for correct req.ip and req.secure
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
}));

// Redirect HTTP to HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}
const botProtection = require('./middleware/botProtection');
const progressivePenalty = require('./middleware/progressivePenalty');
const { globalLimiter } = require('./middleware/rateLimiter');

// CORS must come first so rejection responses include CORS headers
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

// Abuse protection: bot detection → progressive penalty → global rate limit
app.use(botProtection);
app.use(progressivePenalty);
app.use(globalLimiter);

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
        logger.info('Stripe payment succeeded', { paymentId: pi.id });
        // Update order payment status if order already exists
        const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
        if (order && order.paymentStatus !== 'paid') {
          await order.update({ paymentStatus: 'paid' });
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        logger.warn('Stripe payment failed', { paymentId: pi.id });
        const order = await Order.findOne({ where: { paymentTransactionId: pi.id } });
        if (order) {
          await order.update({ paymentStatus: 'failed' });
        }
        break;
      }
      default:
        logger.debug('Stripe webhook event', { type: event.type });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook error', { error: err.message });
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const sanitizeBody = require('./middleware/sanitize');
app.use(sanitizeBody);

// Security event logging (auth failures, rate limits, errors, auth successes)
const securityLogger = require('./middleware/securityLogger');
app.use(securityLogger);

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
    logger.info('Database connection established');
    
    // Import models index to ensure associations are loaded
    require('./models/index');
    
    // Sync all models with database
    return sequelize.sync({ force: false });
  })
  .then(() => {
    logger.info('Database models synchronized');
  })
  .catch(err => {
    logger.error('Database connection error', { error: err.message });
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
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/media', require('./routes/media'));
app.use('/api/assistant', require('./routes/assistant'));

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
  logger.error('Unhandled error', {
    error: err.message,
    method: req.method,
    path: req.originalUrl,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });

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
  logger.info('Server started', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  });
});

// Export for testing
module.exports = { app, server, io, notificationService };
