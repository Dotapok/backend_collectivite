const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Identifiant unique
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Type de transaction
  type: {
    type: String,
    enum: [
      'project_submission',    // Soumission de projet
      'project_evaluation',    // Évaluation de projet
      'project_approval',      // Approbation de projet
      'budget_allocation',     // Allocation de budget
      'budget_disbursement',   // Décaissement
      'project_update',        // Mise à jour de projet
      'status_change',         // Changement de statut
      'document_upload',       // Upload de document
      'user_activity',         // Activité utilisateur
      'system_event'           // Événement système
    ],
    required: true
  },
  
  // Informations blockchain
  blockchain: {
    hash: {
      type: String,
      required: true,
      unique: true
    },
    blockNumber: {
      type: Number,
      required: true
    },
    previousHash: String,
    nextHash: String,
    timestamp: {
      type: Date,
      required: true
    },
    nonce: Number,
    difficulty: Number,
    merkleRoot: String
  },
  
  // Informations de signature et validation
  signature: {
    signedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    signatureHash: String,
    publicKey: String,
    certificateSerial: String,
    signatureTimestamp: Date
  },
  
  // Données de la transaction
  data: {
    amount: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'FCFA'
    },
    description: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Références aux entités
  references: {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    evaluationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Evaluation'
    }
  },
  
  // Statut de la transaction
  status: {
    type: String,
    enum: [
      'pending',      // En attente
      'confirmed',    // Confirmée
      'failed',       // Échouée
      'reverted',     // Annulée
      'expired'       // Expirée
    ],
    default: 'pending'
  },
  
  // Informations de confirmation
  confirmation: {
    confirmations: {
      type: Number,
      default: 0
    },
    confirmedAt: Date,
    confirmedBy: [{
      validator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: Date,
      signature: String
    }]
  },
  
  // Informations de gas (pour Ethereum-like)
  gas: {
    gasUsed: Number,
    gasPrice: String,
    gasLimit: Number,
    gasCost: Number
  },
  
  // Adresses blockchain
  addresses: {
    from: String,
    to: String,
    contract: String
  },
  
  // Informations de réseau
  network: {
    chainId: Number,
    networkName: String,
    rpcUrl: String
  },
  
  // Métadonnées spécifiques au type
  typeSpecificData: {
    // Pour les évaluations
    evaluation: {
      score: Number,
      criteria: [String],
      comments: String,
      decision: String
    },
    
    // Pour les changements de statut
    statusChange: {
      previousStatus: String,
      newStatus: String,
      reason: String
    },
    
    // Pour les uploads de documents
    document: {
      fileName: String,
      fileSize: Number,
      mimeType: String,
      documentType: String
    },
    
    // Pour les allocations de budget
    budget: {
      previousAmount: Number,
      newAmount: Number,
      allocationType: String,
      fiscalYear: String
    }
  },
  
  // Informations de traçabilité
  traceability: {
    parentTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    childTransactions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    }],
    relatedTransactions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    }],
    workflowStep: String,
    stepOrder: Number
  },
  
  // Informations de performance
  performance: {
    processingTime: Number, // en millisecondes
    validationTime: Number,
    confirmationTime: Number,
    throughput: Number // transactions par seconde
  },
  
  // Informations de sécurité
  security: {
    encryptionType: String,
    hashAlgorithm: String,
    signatureAlgorithm: String,
    securityLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'high'
    }
  },
  
  // Tags et catégorisation
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
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
  
  // Notifications
  notifications: [{
    type: String,
    message: String,
    createdAt: Date,
    sentTo: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      sentAt: Date,
      readAt: Date
    }]
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimiser les requêtes
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ 'blockchain.hash': 1 });
transactionSchema.index({ 'blockchain.blockNumber': -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ 'signature.signedBy': 1 });
transactionSchema.index({ 'references.projectId': 1 });
transactionSchema.index({ 'blockchain.timestamp': -1 });
transactionSchema.index({ 'confirmation.confirmations': 1 });
transactionSchema.index({ 'gas.gasUsed': -1 });

// Index de texte pour la recherche
transactionSchema.index({ 
  'data.description': 'text', 
  'typeSpecificData.evaluation.comments': 'text' 
});

// Virtual pour le statut global
transactionSchema.virtual('globalStatus').get(function() {
  if (this.status === 'confirmed' && this.confirmation.confirmations >= 6) {
    return 'finalized';
  }
  if (this.status === 'confirmed') {
    return 'confirmed';
  }
  if (this.status === 'failed') {
    return 'failed';
  }
  if (this.status === 'reverted') {
    return 'reverted';
  }
  return 'pending';
});

// Virtual pour l'âge de la transaction
transactionSchema.virtual('age').get(function() {
  if (!this.blockchain.timestamp) return null;
  
  const now = new Date();
  const transactionTime = new Date(this.blockchain.timestamp);
  const diffTime = Math.abs(now - transactionTime);
  const diffMinutes = Math.ceil(diffTime / (1000 * 60));
  
  if (diffMinutes < 60) return `${diffMinutes} min`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
  return `${Math.floor(diffMinutes / 1440)}j`;
});

// Virtual pour le coût total
transactionSchema.virtual('totalCost').get(function() {
  if (!this.data.amount || !this.gas.gasCost) {
    return this.data.amount || 0;
  }
  return this.data.amount + this.gas.gasCost;
});

// Virtual pour la sécurité du niveau de confirmation
transactionSchema.virtual('confirmationSecurity').get(function() {
  const confirmations = this.confirmation.confirmations || 0;
  
  if (confirmations >= 12) return 'very_high';
  if (confirmations >= 6) return 'high';
  if (confirmations >= 3) return 'medium';
  if (confirmations >= 1) return 'low';
  return 'none';
});

// Middleware pre-save pour l'historique
transactionSchema.pre('save', function(next) {
  if (this.isModified()) {
    const action = this.isNew ? 'created' : 'updated';
    this.history.push({
      action,
      description: `Transaction ${action}`,
      changedAt: new Date()
    });
  }
  next();
});

// Méthode pour ajouter une entrée d'historique
transactionSchema.methods.addHistoryEntry = function(action, description, changedBy, previousValue, newValue) {
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

// Méthode pour confirmer la transaction
transactionSchema.methods.confirm = function(validator, signature) {
  this.status = 'confirmed';
  this.confirmation.confirmations += 1;
  this.confirmation.confirmedAt = new Date();
  this.confirmation.confirmedBy.push({
    validator,
    timestamp: new Date(),
    signature
  });
  
  this.addHistoryEntry(
    'confirmed',
    `Transaction confirmée par ${validator}`,
    validator
  );
  
  return this.save();
};

// Méthode pour échouer la transaction
transactionSchema.methods.fail = function(reason) {
  this.status = 'failed';
  
  this.addHistoryEntry(
    'failed',
    `Transaction échouée: ${reason}`,
    null,
    'pending',
    'failed'
  );
  
  return this.save();
};

// Méthode statique pour rechercher des transactions
transactionSchema.statics.findByType = function(type) {
  return this.find({ type });
};

transactionSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

transactionSchema.statics.findByProject = function(projectId) {
  return this.find({ 'references.projectId': projectId });
};

transactionSchema.statics.findByUser = function(userId) {
  return this.find({ 'signature.signedBy': userId });
};

transactionSchema.statics.findByBlockRange = function(startBlock, endBlock) {
  return this.find({
    'blockchain.blockNumber': { $gte: startBlock, $lte: endBlock }
  });
};

transactionSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    'blockchain.timestamp': { $gte: startDate, $lte: endDate }
  });
};

// Méthode pour calculer les statistiques
transactionSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalAmount: { $sum: '$data.amount' },
        totalGasCost: { $sum: '$gas.gasCost' },
        avgConfirmations: { $avg: '$confirmation.confirmations' },
        avgProcessingTime: { $avg: '$performance.processingTime' }
      }
    }
  ]);
  
  return stats[0] || {
    totalTransactions: 0,
    totalAmount: 0,
    totalGasCost: 0,
    avgConfirmations: 0,
    avgProcessingTime: 0
  };
};

// Méthode pour obtenir les transactions récentes
transactionSchema.statics.getRecentTransactions = async function(limit = 10) {
  return this.find()
    .sort({ 'blockchain.timestamp': -1 })
    .limit(limit)
    .populate('signature.signedBy', 'username firstName lastName')
    .populate('references.projectId', 'title category region');
};

module.exports = mongoose.model('Transaction', transactionSchema);
