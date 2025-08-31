const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Informations de base
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Classification
  category: {
    type: String,
    enum: [
      'Infrastructure',
      'Éducation',
      'Santé',
      'Agriculture',
      'Énergie',
      'Transport',
      'Eau et Assainissement',
      'Environnement',
      'Culture et Sport',
      'Sécurité',
      'Autres'
    ],
    required: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  
  // Localisation
  region: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  commune: {
    type: String,
    trim: true
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  
  // Budget et financement
  budget: {
    requested: {
      type: Number,
      required: true,
      min: 0
    },
    approved: {
      type: Number,
      default: 0,
      min: 0
    },
    spent: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: 'FCFA'
    }
  },
  
  // Statut et workflow
  status: {
    type: String,
    enum: [
      'draft',           // Brouillon
      'submitted',       // Soumis
      'under_review',    // En cours d'évaluation
      'evaluated',       // Évalué
      'approved',        // Approuvé
      'rejected',        // Rejeté
      'funded',          // Financé
      'in_progress',     // En cours d'exécution
      'completed',       // Terminé
      'cancelled'        // Annulé
    ],
    default: 'draft'
  },
  
  // Dates importantes
  timeline: {
    submissionDate: Date,
    evaluationStartDate: Date,
    evaluationEndDate: Date,
    approvalDate: Date,
    fundingDate: Date,
    startDate: Date,
    expectedCompletionDate: Date,
    actualCompletionDate: Date
  },
  
  // Soumission et propriétaire
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  submittedByEntity: {
    type: String,
    required: true
  },
  
  // Évaluation
  evaluation: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    evaluator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    evaluationDate: Date,
    criteria: [{
      name: String,
      score: Number,
      maxScore: Number,
      weight: Number,
      comment: String
    }],
    totalScore: Number,
    maxPossibleScore: Number,
    recommendations: [String],
    decision: {
      type: String,
      enum: ['approve', 'reject', 'needs_revision', 'pending']
    },
    comments: String
  },
  
  // Validation MINFI
  minfiValidation: {
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    validationDate: Date,
    budgetValidation: {
      type: String,
      enum: ['pending', 'approved', 'rejected']
    },
    comments: String
  },
  
  // Documents et pièces jointes
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    size: Number,
    mimeType: String
  }],
  
  // Objectifs et indicateurs
  objectives: [{
    description: String,
    measurable: Boolean,
    target: String,
    achieved: Boolean
  }],
  
  // Bénéficiaires
  beneficiaries: {
    estimatedCount: Number,
    description: String,
    type: [String] // ['population', 'students', 'patients', 'farmers', etc.]
  },
  
  // Impact et durabilité
  impact: {
    social: String,
    economic: String,
    environmental: String,
    longTerm: String
  },
  
  // Suivi et reporting
  progress: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    milestones: [{
      title: String,
      description: String,
      targetDate: Date,
      completedDate: Date,
      status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'delayed']
      }
    }],
    challenges: [String],
    solutions: [String]
  },
  
  // Historique des modifications
  history: [{
    action: String,
    description: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: Date,
    previousValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }],
  
  // Tags et métadonnées
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Notifications
  notifications: [{
    type: String,
    message: String,
    createdAt: Date,
    readBy: [{
      user: {
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

// Index pour optimiser les requêtes
projectSchema.index({ title: 'text', description: 'text' });
projectSchema.index({ status: 1 });
projectSchema.index({ category: 1 });
projectSchema.index({ region: 1 });
projectSchema.index({ submittedBy: 1 });
projectSchema.index({ 'evaluation.evaluator': 1 });
projectSchema.index({ 'timeline.submissionDate': -1 });
projectSchema.index({ 'budget.requested': -1 });
projectSchema.index({ 'evaluation.score': -1 });

// Virtual pour le statut global
projectSchema.virtual('globalStatus').get(function() {
  if (this.status === 'completed') return 'completed';
  if (this.status === 'cancelled') return 'cancelled';
  if (this.status === 'in_progress') return 'active';
  if (this.status === 'funded') return 'funded';
  if (this.status === 'approved') return 'approved';
  if (this.status === 'evaluated') return 'evaluated';
  if (this.status === 'under_review') return 'reviewing';
  if (this.status === 'submitted') return 'submitted';
  return 'draft';
});

// Virtual pour la durée du projet
projectSchema.virtual('duration').get(function() {
  if (!this.timeline.startDate || !this.timeline.expectedCompletionDate) {
    return null;
  }
  
  const start = new Date(this.timeline.startDate);
  const end = new Date(this.timeline.expectedCompletionDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
});

// Virtual pour le budget restant
projectSchema.virtual('remainingBudget').get(function() {
  return this.budget.approved - this.budget.spent;
});

// Virtual pour l'efficacité budgétaire
projectSchema.virtual('budgetEfficiency').get(function() {
  if (this.budget.approved === 0) return 0;
  return ((this.budget.approved - this.budget.spent) / this.budget.approved) * 100;
});

// Middleware pre-save pour l'historique
projectSchema.pre('save', function(next) {
  if (this.isModified()) {
    // Ajouter automatiquement l'action dans l'historique
    const action = this.isNew ? 'created' : 'updated';
    this.history.push({
      action,
      description: `Projet ${action}`,
      changedAt: new Date()
    });
  }
  next();
});

// Méthode pour ajouter une entrée d'historique
projectSchema.methods.addHistoryEntry = function(action, description, changedBy, previousValue, newValue) {
  this.history.push({
    action,
    description,
    changedBy,
    changedAt: new Date(),
    previousValue,
    newValue
  });
  return this.save();
};

// Méthode pour mettre à jour le statut
projectSchema.methods.updateStatus = function(newStatus, changedBy, reason) {
  const previousStatus = this.status;
  this.status = newStatus;
  
  // Mettre à jour les dates appropriées
  const now = new Date();
  switch (newStatus) {
    case 'submitted':
      this.timeline.submissionDate = now;
      break;
    case 'under_review':
      this.timeline.evaluationStartDate = now;
      break;
    case 'evaluated':
      this.timeline.evaluationEndDate = now;
      break;
    case 'approved':
      this.timeline.approvalDate = now;
      break;
    case 'funded':
      this.timeline.fundingDate = now;
      break;
    case 'in_progress':
      this.timeline.startDate = now;
      break;
    case 'completed':
      this.timeline.actualCompletionDate = now;
      break;
  }
  
  // Ajouter à l'historique
  this.addHistoryEntry(
    'status_changed',
    `Statut changé de ${previousStatus} à ${newStatus}. ${reason || ''}`,
    changedBy,
    previousStatus,
    newStatus
  );
  
  return this.save();
};

// Méthode statique pour rechercher des projets
projectSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

projectSchema.statics.findByCategory = function(category) {
  return this.find({ category });
};

projectSchema.statics.findByRegion = function(region) {
  return this.find({ region });
};

projectSchema.statics.findByEntity = function(entity) {
  return this.find({ submittedByEntity: entity });
};

projectSchema.statics.findByBudgetRange = function(min, max) {
  return this.find({
    'budget.requested': { $gte: min, $lte: max }
  });
};

// Méthode pour calculer les statistiques
projectSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalProjects: { $sum: 1 },
        totalBudget: { $sum: '$budget.requested' },
        approvedBudget: { $sum: '$budget.approved' },
        spentBudget: { $sum: '$budget.spent' },
        avgScore: { $avg: '$evaluation.score' }
      }
    }
  ]);
  
  return stats[0] || {
    totalProjects: 0,
    totalBudget: 0,
    approvedBudget: 0,
    spentBudget: 0,
    avgScore: 0
  };
};

module.exports = mongoose.model('Project', projectSchema);
