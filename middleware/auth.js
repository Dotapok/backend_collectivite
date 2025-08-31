const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware pour authentifier les tokens JWT
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'accès requis'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier si l'utilisateur existe toujours
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    // Ajouter les informations utilisateur à la requête
    req.user = {
      userId: user._id,
      username: user.username,
      role: user.role,
      entity: user.entity,
      permissions: user.permissions
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré'
      });
    }

    console.error('Erreur d\'authentification:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur d\'authentification'
    });
  }
};

/**
 * Middleware pour vérifier les permissions spécifiques
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permission insuffisante'
      });
    }

    next();
  };
};

/**
 * Middleware pour vérifier les rôles spécifiques
 */
const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Rôle insuffisant'
      });
    }

    next();
  };
};

/**
 * Middleware pour vérifier la propriété des ressources
 */
const requireOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
      }

      const resourceId = req.params[resourceIdField];
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'ID de ressource requis'
        });
      }

      const resource = await resourceModel.findById(resourceId);
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Ressource non trouvée'
        });
      }

      // Vérifier la propriété (pour les projets, vérifier submittedBy)
      if (resource.submittedBy && resource.submittedBy.toString() !== req.user.userId.toString()) {
        // Si ce n'est pas le propriétaire, vérifier s'il a des permissions d'admin
        if (req.user.role !== 'admin' && !req.user.permissions.includes('system_admin')) {
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé à cette ressource'
          });
        }
      }

      // Ajouter la ressource à la requête pour utilisation ultérieure
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Erreur lors de la vérification de propriété:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des permissions'
      });
    }
  };
};

/**
 * Middleware pour vérifier les permissions d'évaluation (MINDDEVEL)
 */
const requireEvaluationPermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    // Seuls les utilisateurs MINDDEVEL et admin peuvent évaluer
    if (!['minddevel', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les évaluateurs MINDDEVEL peuvent effectuer cette action'
      });
    }

    // Vérifier si l'utilisateur a la permission d'évaluation
    if (!req.user.permissions.includes('evaluate_project') && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permission d\'évaluation requise'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification des permissions d\'évaluation:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

/**
 * Middleware pour vérifier les permissions d'approbation (MINFI)
 */
const requireApprovalPermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    // Seuls les utilisateurs MINFI et admin peuvent approuver
    if (!['minfi', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les contrôleurs MINFI peuvent effectuer cette action'
      });
    }

    // Vérifier si l'utilisateur a la permission d'approbation
    if (!req.user.permissions.includes('approve_project') && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permission d\'approbation requise'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification des permissions d\'approbation:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

/**
 * Middleware pour vérifier les permissions de création de projet (CTD)
 */
const requireProjectCreationPermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    // Seuls les utilisateurs CTD et admin peuvent créer des projets
    if (!['ctd', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les CTD peuvent créer des projets'
      });
    }

    // Vérifier si l'utilisateur a la permission de création
    if (!req.user.permissions.includes('create_project') && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Permission de création de projet requise'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification des permissions de création:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

/**
 * Middleware pour vérifier les permissions d'administration
 */
const requireAdminPermission = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    // Seuls les administrateurs peuvent accéder
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès administrateur requis'
      });
    }

    // Vérifier si l'utilisateur a les permissions d'administration
    if (!req.user.permissions.includes('system_admin')) {
      return res.status(403).json({
        success: false,
        message: 'Permissions d\'administration requises'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification des permissions d\'administration:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

/**
 * Middleware pour logger les actions des utilisateurs
 */
const logUserAction = (action) => {
  return (req, res, next) => {
    // Ajouter l'action à la requête pour logging ultérieur
    req.userAction = {
      action,
      timestamp: new Date(),
      userId: req.user?.userId,
      username: req.user?.username,
      role: req.user?.role,
      entity: req.user?.entity,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    next();
  };
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  requireOwnership,
  requireEvaluationPermission,
  requireApprovalPermission,
  requireProjectCreationPermission,
  requireAdminPermission,
  logUserAction
};
