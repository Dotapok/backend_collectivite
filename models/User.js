const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Informations de base
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  // Rôle et entité
  role: {
    type: String,
    enum: ['ctd', 'minddevel', 'minfi', 'admin'],
    required: true
  },
  entity: {
    type: String,
    required: true,
    trim: true
  },
  region: {
    type: String,
    required: true,
    trim: true
  },
  
  // Informations de contact
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  
  // Certificat PKI
  certificateInfo: {
    serialNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    status: {
      type: String,
      enum: ['valid', 'expired', 'revoked', 'pending'],
      default: 'pending'
    },
    issuedAt: Date,
    expiresAt: Date,
    issuer: String
  },
  
  // Statut du compte
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: Date,
  
  // Permissions et rôles spécifiques
  permissions: [{
    type: String,
    enum: [
      'create_project',
      'edit_project',
      'delete_project',
      'evaluate_project',
      'approve_project',
      'validate_budget',
      'view_reports',
      'manage_users',
      'system_admin'
    ]
  }],
  
  // Métadonnées
  metadata: {
    department: String,
    position: String,
    employeeId: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimiser les requêtes
userSchema.index({ role: 1 });
userSchema.index({ entity: 1 });
userSchema.index({ region: 1 });
userSchema.index({ 'certificateInfo.status': 1 });

// Virtual pour le nom complet
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual pour le statut du certificat
userSchema.virtual('certificateStatus').get(function() {
  if (!this.certificateInfo || !this.certificateInfo.expiresAt) {
    return 'no_certificate';
  }
  
  const now = new Date();
  if (this.certificateInfo.expiresAt < now) {
    return 'expired';
  }
  
  const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  if (this.certificateInfo.expiresAt < thirtyDaysFromNow) {
    return 'expiring_soon';
  }
  
  return 'valid';
});

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Méthode pour vérifier les permissions
userSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission) || this.role === 'admin';
};

// Méthode pour obtenir les informations publiques (sans mot de passe)
userSchema.methods.toPublicJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

// Méthode statique pour rechercher des utilisateurs
userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

userSchema.statics.findByEntity = function(entity) {
  return this.find({ entity, isActive: true });
};

userSchema.statics.findByRegion = function(region) {
  return this.find({ region, isActive: true });
};

// Méthode pour mettre à jour la dernière connexion
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
