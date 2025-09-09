const admin = require('firebase-admin');
const User = require('../models/User');

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
    console.log('🔍 Firebase Auth Middleware - Request received');
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Firebase Auth Middleware - No Bearer token');
      return res.status(401).json({ 
        success: false, 
        message: 'Token d\'authentification manquant' 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    console.log('🔍 Firebase Auth Middleware - Token extracted, length:', token.length);
    
    // Verify Firebase token
    console.log('🔍 Firebase Auth Middleware - Verifying token...');
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

    console.log('🔍 Firebase Auth Middleware - User found in database:', !!user);
    if (user) {
      console.log('🔍 Firebase Auth Middleware - User ID:', user.id);
      console.log('🔍 Firebase Auth Middleware - User role:', user.role);
      req.user = user;
    } else {
      console.log('🔍 Firebase Auth Middleware - No user found in database for Firebase UID:', decodedToken.uid);
    }
    
    next();
  } catch (error) {
    console.error('Firebase Auth Error:', error);
    
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

module.exports = firebaseAuth; 