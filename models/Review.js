const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Review = sequelize.define('Review', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    
    // Review content
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: [3, 200]
      }
    },
    
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [10, 2000]
      }
    },
    
    // Rating system (1-5 stars)
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5
      }
    },
    
    // Review status and moderation
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'flagged'),
      defaultValue: 'pending',
      allowNull: false
    },
    
    moderationNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    moderatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    
    moderatedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // Trustpilot integration
    trustpilotId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true
    },
    
    trustpilotStatus: {
      type: DataTypes.ENUM('pending', 'synced', 'failed', 'not_synced'),
      defaultValue: 'not_synced',
      allowNull: false
    },
    
    trustpilotSyncAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    
    lastTrustpilotSync: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // Review metadata
    helpfulVotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    
    notHelpfulVotes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    
    verifiedPurchase: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    
    // Photo/video support
    mediaUrls: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    
    // Review categories/tags
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    
    // Sentiment analysis
    sentimentScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
      validate: {
        min: -1,
        max: 1
      }
    },
    
    // Review helpfulness tracking
    helpfulVoters: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    
    notHelpfulVoters: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    
    // Foreign keys
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'reviews',
    timestamps: true,
    indexes: [
      {
        fields: ['productId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['rating']
      },
      {
        fields: ['trustpilotId']
      },
      {
        fields: ['trustpilotStatus']
      },
      {
        fields: ['verifiedPurchase']
      },
      {
        fields: ['createdAt']
      },
      {
        fields: ['productId', 'userId'],
        unique: true
      }
    ]
  });

  // Instance methods
  Review.prototype.isHelpful = function() {
    return this.helpfulVotes > this.notHelpfulVotes;
  };

  Review.prototype.getHelpfulnessScore = function() {
    const total = this.helpfulVotes + this.notHelpfulVotes;
    return total > 0 ? (this.helpfulVotes / total) * 100 : 0;
  };

  Review.prototype.canVoteHelpful = function(userId) {
    return !this.helpfulVoters.includes(userId) && !this.notHelpfulVoters.includes(userId);
  };

  Review.prototype.addHelpfulVote = function(userId) {
    if (this.canVoteHelpful(userId)) {
      this.helpfulVoters.push(userId);
      this.helpfulVotes += 1;
      return true;
    }
    return false;
  };

  Review.prototype.addNotHelpfulVote = function(userId) {
    if (this.canVoteHelpful(userId)) {
      this.notHelpfulVoters.push(userId);
      this.notHelpfulVotes += 1;
      return true;
    }
    return false;
  };

  Review.prototype.markAsVerifiedPurchase = function() {
    this.verifiedPurchase = true;
  };

  Review.prototype.syncToTrustpilot = function() {
    this.trustpilotStatus = 'pending';
    this.lastTrustpilotSync = new Date();
  };

  Review.prototype.markTrustpilotSynced = function(trustpilotId) {
    this.trustpilotId = trustpilotId;
    this.trustpilotStatus = 'synced';
    this.lastTrustpilotSync = new Date();
    this.trustpilotSyncAttempts = 0;
  };

  Review.prototype.markTrustpilotFailed = function() {
    this.trustpilotStatus = 'failed';
    this.trustpilotSyncAttempts += 1;
    this.lastTrustpilotSync = new Date();
  };

  // Class methods
  Review.getAverageRating = function(productId) {
    return this.findOne({
      where: { 
        productId, 
        status: 'approved' 
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'averageRating'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalReviews']
      ]
    });
  };

  Review.getRatingDistribution = function(productId) {
    return this.findAll({
      where: { 
        productId, 
        status: 'approved' 
      },
      attributes: [
        'rating',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['rating'],
      order: [['rating', 'DESC']]
    });
  };

  Review.getTopReviews = function(productId, limit = 5) {
    return this.findAll({
      where: { 
        productId, 
        status: 'approved' 
      },
      order: [
        ['verifiedPurchase', 'DESC'],
        ['helpfulVotes', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit
    });
  };

  return Review;
}; 