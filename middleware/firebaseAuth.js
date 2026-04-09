const admin = require('firebase-admin');
const User = require('../models/User');
const logger = require('../services/logger');

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('Error parsing Firebase service account:', error);
  serviceAccount = null;
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
}

const firebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);

    if (!decodedToken) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }

    // Add Firebase user to request object
    req.firebaseUser = decodedToken;

    // Try to get user from database (optional for registration)
    const user = await User.findOne({
      where: { firebaseUid: decodedToken.uid }
    });

    if (user) {
      // Check if account is locked
      if (user.accountLockedUntil && new Date() < new Date(user.accountLockedUntil)) {
        const minutesLeft = Math.ceil((new Date(user.accountLockedUntil) - new Date()) / 60000);
        logger.security('auth_account_locked', { userId: user.id, minutesLeft, ip: req.ip });
        return res.status(423).json({
          success: false,
          message: `Compte verrouillé. Réessayez dans ${minutesLeft} minute(s).`
        });
      }

      // Successful auth — reset failed attempts if any
      if (user.failedLoginAttempts > 0) {
        await user.update({ failedLoginAttempts: 0, accountLockedUntil: null });
      }

      req.user = user;
    }

    logger.debug('auth_token_verified', { firebaseUid: decodedToken.uid, userFound: !!user });
    next();
  } catch (error) {
    logger.security('auth_token_failed', {
      errorCode: error.code || 'unknown',
      ip: req.ip,
      path: req.originalUrl,
    });

    // Track failed attempts for known token-related errors
    if (error.code === 'auth/argument-error' ||
        error.code === 'auth/id-token-expired' ||
        error.code === 'auth/id-token-revoked') {
      // Try to extract uid from the token payload (even if verification failed)
      try {
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (token) {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          if (payload.sub) {
            const user = await User.findOne({ where: { firebaseUid: payload.sub } });
            if (user) {
              const attempts = user.failedLoginAttempts + 1;
              const updateData = { failedLoginAttempts: attempts };
              if (attempts >= 5) {
                updateData.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
                logger.security('auth_account_locked_triggered', { userId: user.id, attempts, ip: req.ip });
              }
              await user.update(updateData);
            }
          }
        }
      } catch (parseErr) {
        // Token unparseable — can't track, skip
      }
    }

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré'
      });
    }

    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        message: 'Token révoqué'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur d\'authentification'
    });
  }
};

const requireEmailVerified = (req, res, next) => {
  if (!req.firebaseUser || !req.firebaseUser.email_verified) {
    return res.status(403).json({
      error: 'Adresse email non vérifiée. Veuillez vérifier votre email avant de continuer.'
    });
  }
  next();
};

// Export firebaseAuth as default for backwards compatibility with all existing route files
// requireEmailVerified is available as a named property
module.exports = firebaseAuth;
module.exports.requireEmailVerified = requireEmailVerified;