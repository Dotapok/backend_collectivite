const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  // Informations de base
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  
  evaluatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Statut de l'évaluation
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  // Critères d'évaluation
  criteria: {
    technicalFeasibility: {
      score: {
        type: Number,
        min: 0,
        max: 10,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.25
      },
      comments: String
    },
    
    economicViability: {
      score: {
        type: Number,
        min: 0,
        max: 10,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.25
      },
      comments: String
    },
    
    socialImpact: {
      score: {
        type: Number,
        min: 0,
        max: 10,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.2
      },
      comments: String
    },
    
    environmentalImpact: {
      score: {
        type: Number,
        min: 0,
        max: 10,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.15
      },
      comments: String
    },
    
    administrativeCompliance: {
      score: {
        type: Number,
        min: 0,
        max: 10,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.15
      },
      comments: String
    }
  },
  
  // Score global calculé
  overallScore: {
    type: Number,
    min: 0,
    max: 10,
    required: true
  },
  
  // Recommandation
  recommendation: {
    type: String,
    enum: ['approve', 'approve_with_conditions', 'reject', 'request_modifications'],
    required: true
  },
  
  // Commentaires détaillés
  detailedComments: {
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    conditions: [String]
  },
  
  // Documents d'évaluation
  documents: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['report', 'analysis', 'attachment', 'other'],
      required: true
    },
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Validation et approbation
  validation: {
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    validatedAt: Date,
    validationComments: String,
    
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: Date,
    approvalComments: String
  },
  
  // Métadonnées
  metadata: {
    evaluationMethod: {
      type: String,
      enum: ['standard', 'accelerated', 'comprehensive'],
      default: 'standard'
    },
    
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    
    tags: [String],
    
    region: String,
    category: String
  },
  
  // Dates importantes
  assignedAt: {
    type: Date,
    default: Date.now
  },
  
  startedAt: Date,
  
  completedAt: Date,
  
  dueDate: {
    type: Date,
    required: true
  },
  
  // Historique des modifications
  history: [{
    action: {
      type: String,
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: mongoose.Schema.Types.Mixed,
    previousValues: mongoose.Schema.Types.Mixed
  }],
  
  // Notifications
  notifications: [{
    type: {
      type: String,
      enum: ['assigned', 'reminder', 'completed', 'validated', 'approved', 'rejected'],
      required: true
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    sentTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    message: String,
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: Date
    }]
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index composés pour les requêtes fréquentes
evaluationSchema.index({ projectId: 1, status: 1 });
evaluationSchema.index({ evaluatorId: 1, status: 1 });
evaluationSchema.index({ status: 1, dueDate: 1 });
evaluationSchema.index({ overallScore: 1, status: 1 });

// Index de texte pour la recherche
evaluationSchema.index({
  'detailedComments.strengths': 'text',
  'detailedComments.weaknesses': 'text',
  'detailedComments.recommendations': 'text',
  'detailedComments.conditions': 'text'
});

// Méthodes virtuelles
evaluationSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && new Date() > this.dueDate;
});

evaluationSchema.virtual('daysUntilDue').get(function() {
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

evaluationSchema.virtual('progressPercentage').get(function() {
  if (this.status === 'completed') return 100;
  if (this.status === 'in_progress') return 50;
  if (this.status === 'pending') return 0;
  return 0;
});

// Méthodes d'instance
evaluationSchema.methods.calculateOverallScore = function() {
  let totalScore = 0;
  let totalWeight = 0;
  
  Object.values(this.criteria).forEach(criterion => {
    if (criterion.score !== undefined && criterion.weight !== undefined) {
      totalScore += criterion.score * criterion.weight;
      totalWeight += criterion.weight;
    }
  });
  
  if (totalWeight > 0) {
    this.overallScore = Math.round((totalScore / totalWeight) * 100) / 100;
  } else {
    this.overallScore = 0;
  }
  
  return this.overallScore;
};

evaluationSchema.methods.addHistoryEntry = function(action, userId, details = null, previousValues = null) {
  this.history.push({
    action,
    userId,
    details,
    previousValues,
    timestamp: new Date()
  });
};

evaluationSchema.methods.addNotification = function(type, message, sentTo = []) {
  this.notifications.push({
    type,
    message,
    sentTo,
    sentAt: new Date()
  });
};

evaluationSchema.methods.markAsRead = function(userId) {
  this.notifications.forEach(notification => {
    const existingRead = notification.readBy.find(read => read.userId.equals(userId));
    if (!existingRead) {
      notification.readBy.push({
        userId,
        readAt: new Date()
      });
    }
  });
};

// Méthodes statiques
evaluationSchema.statics.findByProject = function(projectId) {
  return this.find({ projectId }).populate('evaluatorId', 'name email entity');
};

evaluationSchema.statics.findByEvaluator = function(evaluatorId) {
  return this.find({ evaluatorId }).populate('projectId', 'title description status');
};

evaluationSchema.statics.findPending = function() {
  return this.find({ status: 'pending' })
    .populate('projectId', 'title description priority')
    .populate('evaluatorId', 'name email entity');
};

evaluationSchema.statics.findOverdue = function() {
  const now = new Date();
  return this.find({
    status: 'pending',
    dueDate: { $lt: now }
  }).populate('projectId', 'title description priority');
};

// Middleware pre-save
evaluationSchema.pre('save', function(next) {
  // Calculer le score global si les critères ont changé
  if (this.isModified('criteria')) {
    this.calculateOverallScore();
  }
  
  // Ajouter une entrée d'historique pour les modifications
  if (this.isModified() && !this.isNew) {
    const changes = this.modifiedPaths();
    const previousValues = {};
    
    changes.forEach(path => {
      if (path !== 'history' && path !== 'notifications') {
        previousValues[path] = this.get(path);
      }
    });
    
    if (Object.keys(previousValues).length > 0) {
      this.addHistoryEntry('updated', this.evaluatorId, { modifiedFields: changes }, previousValues);
    }
  }
  
  next();
});

// Middleware post-save
evaluationSchema.post('save', function(doc) {
  // Émettre un événement Socket.IO si disponible
  if (global.io) {
    global.io.emit('evaluation:updated', {
      evaluationId: doc._id,
      projectId: doc.projectId,
      status: doc.status,
      overallScore: doc.overallScore
    });
  }
});

module.exports = mongoose.model('Evaluation', evaluationSchema);
