const User = require('../models/User');

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    // First, use Firebase auth to get the user
    if (!req.firebaseUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentification requise'
      });
    }

    // Get user from database
    const user = await User.findOne({ 
      where: { firebaseUid: req.firebaseUser.uid } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Compte désactivé'
      });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Droits d\'administrateur requis.'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    console.error('❌ Admin auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur d\'authentification administrateur'
    });
  }
};

module.exports = adminAuth; 