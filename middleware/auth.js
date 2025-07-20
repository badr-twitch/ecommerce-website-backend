const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token d\'accès requis' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Find user
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'Token invalide' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Compte désactivé' 
      });
    }

    // Add user to request
    req.user = user;
    next();

  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token invalide' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expiré' 
      });
    }

    res.status(500).json({ 
      error: 'Erreur d\'authentification' 
    });
  }
};

// Optional auth middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findByPk(decoded.userId);
    
    if (user && user.isActive) {
      req.user = user;
    }

    next();

  } catch (error) {
    // Don't fail on auth errors for optional auth
    next();
  }
};

// Admin auth middleware
const adminAuth = async (req, res, next) => {
  try {
    // First check if user is authenticated
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token d\'accès requis' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Token invalide' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Compte désactivé' 
      });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Accès refusé - Droits administrateur requis' 
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Erreur d\'authentification admin:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token invalide' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expiré' 
      });
    }

    res.status(500).json({ 
      error: 'Erreur d\'authentification' 
    });
  }
};

module.exports = { auth, optionalAuth, adminAuth }; 