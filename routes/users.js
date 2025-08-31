const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const {
  authenticateToken,
  requirePermission,
  requireRole,
  requireAdminPermission,
  logUserAction
} = require('../middleware/auth');

const router = express.Router();

// Validation pour la mise à jour du profil
const profileUpdateValidation = [
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le prénom doit contenir entre 2 et 100 caractères')
    .trim(),
  
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères')
    .trim(),
  
  body('phone')
    .optional()
    .trim(),
  
  body('address')
    .optional()
    .trim(),
  
  body('metadata.department')
    .optional()
    .trim(),
  
  body('metadata.position')
    .optional()
    .trim(),
  
  body('metadata.employeeId')
    .optional()
    .trim()
];

// Validation pour la recherche d'utilisateurs
const userSearchValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  
  query('role')
    .optional()
    .isIn(['ctd', 'minddevel', 'minfi', 'admin'])
    .withMessage('Rôle invalide'),
  
  query('entity')
    .optional()
    .trim(),
  
  query('region')
    .optional()
    .trim(),
  
  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Statut invalide'),
  
  query('search')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Le terme de recherche doit contenir au moins 2 caractères')
];

// GET /api/users/profile - Récupérer le profil de l'utilisateur connecté
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// PUT /api/users/profile - Mettre à jour le profil de l'utilisateur connecté
router.put('/profile', 
  authenticateToken, 
  logUserAction('update_profile'),
  profileUpdateValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: errors.array()
        });
      }

      const { firstName, lastName, phone, address, metadata } = req.body;
      const user = await User.findById(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Mettre à jour les champs autorisés
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (phone !== undefined) user.phone = phone;
      if (address !== undefined) user.address = address;
      
      if (metadata) {
        if (metadata.department !== undefined) user.metadata.department = metadata.department;
        if (metadata.position !== undefined) user.metadata.position = metadata.position;
        if (metadata.employeeId !== undefined) user.metadata.employeeId = metadata.employeeId;
      }

      await user.save();

      const userResponse = user.toPublicJSON();

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        data: { user: userResponse }
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour du profil:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/users - Lister tous les utilisateurs (admin seulement)
router.get('/', 
  authenticateToken, 
  requireAdminPermission,
  userSearchValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres de recherche invalides',
          errors: errors.array()
        });
      }

      const {
        page = 1,
        limit = 20,
        role,
        entity,
        region,
        status,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Construire les filtres
      const filters = {};
      
      if (role) filters.role = role;
      if (entity) filters.entity = { $regex: entity, $options: 'i' };
      if (region) filters.region = { $regex: region, $options: 'i' };
      if (status === 'active') filters.isActive = true;
      if (status === 'inactive') filters.isActive = false;
      
      if (search) {
        filters.$or = [
          { username: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { entity: { $regex: search, $options: 'i' } }
        ];
      }

      // Construire le tri
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculer le skip pour la pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Exécuter la requête avec pagination
      const [users, total] = await Promise.all([
        User.find(filters)
          .select('-password')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        
        User.countDocuments(filters)
      ]);

      // Calculer les informations de pagination
      const totalPages = Math.ceil(total / parseInt(limit));
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: total,
            itemsPerPage: parseInt(limit),
            hasNextPage,
            hasPrevPage
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/users/:id - Récupérer un utilisateur spécifique (admin seulement)
router.get('/:id', 
  authenticateToken, 
  requireAdminPermission,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération de l\'utilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/users/:id - Mettre à jour un utilisateur (admin seulement)
router.put('/:id', 
  authenticateToken, 
  requireAdminPermission,
  logUserAction('update_user'),
  [
    body('firstName')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Le prénom doit contenir entre 2 et 100 caractères')
      .trim(),
    
    body('lastName')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Le nom doit contenir entre 2 et 100 caractères')
      .trim(),
    
    body('role')
      .optional()
      .isIn(['ctd', 'minddevel', 'minfi', 'admin'])
      .withMessage('Rôle invalide'),
    
    body('entity')
      .optional()
      .trim(),
    
    body('region')
      .optional()
      .trim(),
    
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('Le statut actif doit être un booléen'),
    
    body('isVerified')
      .optional()
      .isBoolean()
      .withMessage('Le statut vérifié doit être un booléen'),
    
    body('permissions')
      .optional()
      .isArray()
      .withMessage('Les permissions doivent être un tableau'),
    
    body('permissions.*')
      .optional()
      .isIn([
        'create_project',
        'edit_project',
        'delete_project',
        'evaluate_project',
        'approve_project',
        'validate_budget',
        'view_reports',
        'manage_users',
        'system_admin'
      ])
      .withMessage('Permission invalide')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: errors.array()
        });
      }

      const {
        firstName,
        lastName,
        role,
        entity,
        region,
        isActive,
        isVerified,
        permissions,
        metadata
      } = req.body;

      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Mettre à jour les champs autorisés
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (role !== undefined) user.role = role;
      if (entity !== undefined) user.entity = entity;
      if (region !== undefined) user.region = region;
      if (isActive !== undefined) user.isActive = isActive;
      if (isVerified !== undefined) user.isVerified = isVerified;
      if (permissions !== undefined) user.permissions = permissions;
      
      if (metadata) {
        if (metadata.department !== undefined) user.metadata.department = metadata.department;
        if (metadata.position !== undefined) user.metadata.position = metadata.position;
        if (metadata.employeeId !== undefined) user.metadata.employeeId = metadata.employeeId;
      }

      await user.save();

      const userResponse = user.toPublicJSON();

      res.json({
        success: true,
        message: 'Utilisateur mis à jour avec succès',
        data: { user: userResponse }
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'utilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// DELETE /api/users/:id - Désactiver un utilisateur (admin seulement)
router.delete('/:id', 
  authenticateToken, 
  requireAdminPermission,
  logUserAction('deactivate_user'),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Empêcher la désactivation de l'utilisateur connecté
      if (user._id.toString() === req.user.userId) {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas désactiver votre propre compte'
        });
      }

      // Désactiver l'utilisateur au lieu de le supprimer
      user.isActive = false;
      await user.save();

      res.json({
        success: true,
        message: 'Utilisateur désactivé avec succès'
      });

    } catch (error) {
      console.error('Erreur lors de la désactivation de l\'utilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/users/:id/projects - Récupérer les projets d'un utilisateur
router.get('/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    // Vérifier que l'utilisateur existe
    const user = await User.findById(id).select('username firstName lastName entity');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Construire les filtres
    const filters = { submittedBy: id };
    if (status) filters.status = status;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les projets de l'utilisateur
    const [projects, total] = await Promise.all([
      Project.find(filters)
        .populate('evaluation.evaluator', 'username firstName lastName entity')
        .sort({ 'timeline.submissionDate': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Project.countDocuments(filters)
    ]);

    // Calculer les informations de pagination
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        user,
        projects,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des projets de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/users/:id/transactions - Récupérer les transactions d'un utilisateur
router.get('/:id/transactions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, type, status } = req.query;

    // Vérifier que l'utilisateur existe
    const user = await User.findById(id).select('username firstName lastName entity');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Construire les filtres
    const filters = { 'signature.signedBy': id };
    if (type) filters.type = type;
    if (status) filters.status = status;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les transactions de l'utilisateur
    const [transactions, total] = await Promise.all([
      Transaction.find(filters)
        .populate('references.projectId', 'title category region')
        .sort({ 'blockchain.timestamp': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Transaction.countDocuments(filters)
    ]);

    // Calculer les informations de pagination
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        user,
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des transactions de l\'utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/users/stats/overview - Statistiques des utilisateurs (admin seulement)
router.get('/stats/overview', 
  authenticateToken, 
  requireAdminPermission,
  async (req, res) => {
    try {
      // Statistiques globales
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const verifiedUsers = await User.countDocuments({ isVerified: true });

      // Statistiques par rôle
      const roleStats = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: ['$isActive', 1, 0] }
            },
            verifiedCount: {
              $sum: { $cond: ['$isVerified', 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par entité
      const entityStats = await User.aggregate([
        {
          $group: {
            _id: '$entity',
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: ['$isActive', 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par région
      const regionStats = await User.aggregate([
        {
          $group: {
            _id: '$region',
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: ['$isActive', 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Utilisateurs récents (7 derniers jours)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentUsers = await User.countDocuments({
        createdAt: { $gte: sevenDaysAgo }
      });

      // Utilisateurs avec certificats expirés ou expirant bientôt
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      
      const expiringCertificates = await User.countDocuments({
        'certificateInfo.expiresAt': { $lte: thirtyDaysFromNow }
      });

      res.json({
        success: true,
        data: {
          overview: {
            totalUsers,
            activeUsers,
            verifiedUsers,
            recentUsers,
            expiringCertificates,
            activationRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
            verificationRate: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0
          },
          byRole: roleStats,
          byEntity: entityStats,
          byRegion: regionStats
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/users/search/suggestions - Suggestions de recherche d'utilisateurs
router.get('/search/suggestions', 
  authenticateToken, 
  requirePermission('manage_users'),
  [
    query('q')
      .notEmpty()
      .withMessage('Le terme de recherche est requis')
      .isLength({ min: 2 })
      .withMessage('Le terme de recherche doit contenir au moins 2 caractères')
  ],
  async (req, res) => {
    try {
      const { q } = req.query;

      const suggestions = await User.find({
        $or: [
          { username: { $regex: q, $options: 'i' } },
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { entity: { $regex: q, $options: 'i' } }
        ]
      })
        .select('username firstName lastName email entity role')
        .limit(10)
        .lean();

      res.json({
        success: true,
        data: { suggestions }
      });

    } catch (error) {
      console.error('Erreur lors de la recherche de suggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

module.exports = router;
