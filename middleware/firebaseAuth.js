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

    // Get user from database
    const user = await User.findOne({ 
      where: { firebaseUid: decodedToken.uid } 
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé dans la base de données' 
      });
    }

    // Add user to request object
    req.user = user;
    req.firebaseUser = decodedToken;
    
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