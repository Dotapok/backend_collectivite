const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Transaction = require('../models/Transaction');
const Project = require('../models/Project');
const User = require('../models/User');
const {
  authenticateToken,
  requirePermission,
  requireRole,
  logUserAction
} = require('../middleware/auth');

const router = express.Router();

// Validation pour la création de transaction
const transactionValidation = [
  body('type')
    .isIn([
      'project_submission',
      'project_evaluation',
      'project_approval',
      'budget_allocation',
      'budget_disbursement',
      'project_update',
      'status_change',
      'document_upload',
      'user_activity',
      'system_event'
    ])
    .withMessage('Type de transaction invalide'),
  
  body('data.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Le montant doit être un nombre positif'),
  
  body('data.description')
    .optional()
    .isLength({ min: 5, max: 500 })
    .withMessage('La description doit contenir entre 5 et 500 caractères'),
  
  body('references.projectId')
    .optional()
    .isMongoId()
    .withMessage('ID de projet invalide'),
  
  body('references.userId')
    .optional()
    .isMongoId()
    .withMessage('ID d\'utilisateur invalide'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Priorité invalide')
];

// Validation pour la recherche
const searchValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  
  query('type')
    .optional()
    .isIn([
      'project_submission', 'project_evaluation', 'project_approval',
      'budget_allocation', 'budget_disbursement', 'project_update',
      'status_change', 'document_upload', 'user_activity', 'system_event'
    ])
    .withMessage('Type de transaction invalide'),
  
  query('status')
    .optional()
    .isIn(['pending', 'confirmed', 'failed', 'reverted', 'expired'])
    .withMessage('Statut invalide'),
  
  query('projectId')
    .optional()
    .isMongoId()
    .withMessage('ID de projet invalide'),
  
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('ID d\'utilisateur invalide'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide'),
  
  query('minBlock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Numéro de bloc minimum invalide'),
  
  query('maxBlock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Numéro de bloc maximum invalide')
];

// GET /api/transactions - Lister toutes les transactions (avec pagination et filtres)
router.get('/', authenticateToken, searchValidation, async (req, res) => {
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
      type,
      status,
      projectId,
      userId,
      startDate,
      endDate,
      minBlock,
      maxBlock,
      sortBy = 'blockchain.timestamp',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
    
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (projectId) filters['references.projectId'] = projectId;
    if (userId) filters['signature.signedBy'] = userId;
    
    if (startDate || endDate) {
      filters['blockchain.timestamp'] = {};
      if (startDate) filters['blockchain.timestamp'].$gte = new Date(startDate);
      if (endDate) filters['blockchain.timestamp'].$lte = new Date(endDate);
    }
    
    if (minBlock || maxBlock) {
      filters['blockchain.blockNumber'] = {};
      if (minBlock) filters['blockchain.blockNumber'].$gte = parseInt(minBlock);
      if (maxBlock) filters['blockchain.blockNumber'].$lte = parseInt(maxBlock);
    }

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Exécuter la requête avec pagination
    const [transactions, total] = await Promise.all([
      Transaction.find(filters)
        .populate('signature.signedBy', 'username firstName lastName entity')
        .populate('references.projectId', 'title category region')
        .populate('references.userId', 'username firstName lastName entity')
        .sort(sort)
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
    console.error('Erreur lors de la récupération des transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/transactions/:id - Récupérer une transaction spécifique
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('signature.signedBy', 'username firstName lastName entity')
      .populate('references.projectId', 'title category region budget')
      .populate('references.userId', 'username firstName lastName entity')
      .populate('history.changedBy', 'username firstName lastName entity');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction non trouvée'
      });
    }

    res.json({
      success: true,
      data: { transaction }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// POST /api/transactions - Créer une nouvelle transaction
router.post('/', 
  authenticateToken, 
  logUserAction('create_transaction'),
  transactionValidation,
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
        type,
        data,
        references,
        priority = 'medium',
        tags = []
      } = req.body;

      // Générer un ID unique pour la transaction
      const transactionId = `TX_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Simuler les informations blockchain (dans un vrai projet, ceci viendrait d'un nœud blockchain)
      const blockNumber = Math.floor(Math.random() * 1000000) + 1000000;
      const hash = `0x${Math.random().toString(36).substr(2, 64)}`;
      
      // Créer la nouvelle transaction
      const transaction = new Transaction({
        transactionId,
        type,
        blockchain: {
          hash,
          blockNumber,
          timestamp: new Date(),
          nonce: Math.floor(Math.random() * 1000000),
          difficulty: 4,
          merkleRoot: `0x${Math.random().toString(36).substr(2, 64)}`
        },
        signature: {
          signedBy: req.user.userId,
          signatureHash: `0x${Math.random().toString(36).substr(2, 64)}`,
          publicKey: `0x${Math.random().toString(36).substr(2, 64)}`,
          certificateSerial: `CERT_${Date.now()}`,
          signatureTimestamp: new Date()
        },
        data,
        references,
        priority,
        tags,
        status: 'pending'
      });

      await transaction.save();

      // Émettre un événement Socket.IO pour les mises à jour en temps réel
      const io = req.app.get('io');
      if (io) {
        io.emit('transaction_created', {
          transactionId: transaction._id,
          type,
          hash,
          blockNumber,
          timestamp: transaction.blockchain.timestamp
        });
      }

      res.status(201).json({
        success: true,
        message: 'Transaction créée avec succès',
        data: { transaction }
      });

    } catch (error) {
      console.error('Erreur lors de la création de la transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/transactions/:id/confirm - Confirmer une transaction
router.put('/:id/confirm', 
  authenticateToken, 
  requirePermission('approve_project'),
  logUserAction('confirm_transaction'),
  async (req, res) => {
    try {
      const transaction = await Transaction.findById(req.params.id);
      
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
      }

      if (transaction.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Seules les transactions en attente peuvent être confirmées'
        });
      }

      // Confirmer la transaction
      await transaction.confirm(req.user.userId, `0x${Math.random().toString(36).substr(2, 64)}`);

      // Émettre un événement Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.emit('transaction_confirmed', {
          transactionId: transaction._id,
          hash: transaction.blockchain.hash,
          confirmations: transaction.confirmation.confirmations
        });
      }

      res.json({
        success: true,
        message: 'Transaction confirmée avec succès',
        data: { transaction }
      });

    } catch (error) {
      console.error('Erreur lors de la confirmation de la transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/transactions/:id/fail - Marquer une transaction comme échouée
router.put('/:id/fail', 
  authenticateToken, 
  requirePermission('approve_project'),
  logUserAction('fail_transaction'),
  [
    body('reason')
      .notEmpty()
      .withMessage('La raison de l\'échec est requise')
      .trim()
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

      const { reason } = req.body;
      const transaction = await Transaction.findById(req.params.id);
      
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
      }

      if (transaction.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Seules les transactions en attente peuvent être marquées comme échouées'
        });
      }

      // Marquer la transaction comme échouée
      await transaction.fail(reason);

      // Émettre un événement Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.emit('transaction_failed', {
          transactionId: transaction._id,
          hash: transaction.blockchain.hash,
          reason
        });
      }

      res.json({
        success: true,
        message: 'Transaction marquée comme échouée',
        data: { transaction }
      });

    } catch (error) {
      console.error('Erreur lors du marquage de la transaction comme échouée:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/transactions/project/:projectId - Récupérer toutes les transactions d'un projet
router.get('/project/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Vérifier que le projet existe
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Projet non trouvé'
      });
    }

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les transactions du projet
    const [transactions, total] = await Promise.all([
      Transaction.find({ 'references.projectId': projectId })
        .populate('signature.signedBy', 'username firstName lastName entity')
        .sort({ 'blockchain.timestamp': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Transaction.countDocuments({ 'references.projectId': projectId })
    ]);

    // Calculer les informations de pagination
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        project: {
          id: project._id,
          title: project.title,
          category: project.category,
          region: project.region
        },
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
    console.error('Erreur lors de la récupération des transactions du projet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/transactions/user/:userId - Récupérer toutes les transactions d'un utilisateur
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId).select('username firstName lastName entity');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les transactions de l'utilisateur
    const [transactions, total] = await Promise.all([
      Transaction.find({ 'signature.signedBy': userId })
        .populate('references.projectId', 'title category region')
        .sort({ 'blockchain.timestamp': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Transaction.countDocuments({ 'signature.signedBy': userId })
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

// GET /api/transactions/stats - Statistiques des transactions
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const stats = await Transaction.getStats();
    
    // Statistiques par type
    const typeStats = await Transaction.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$data.amount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Statistiques par statut
    const statusStats = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Statistiques par jour (7 derniers jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyStats = await Transaction.aggregate([
      {
        $match: {
          'blockchain.timestamp': { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$blockchain.timestamp'
            }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$data.amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats,
        byType: typeStats,
        byStatus: statusStats,
        daily: dailyStats
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/transactions/status/:hash - Statut d'une transaction par hash blockchain
router.get('/status/:hash', authenticateToken, async (req, res) => {
  try {
    const { hash } = req.params;

    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Hash de transaction requis'
      });
    }

    // Rechercher la transaction par hash blockchain
    const transaction = await Transaction.findOne({
      'blockchain.hash': hash
    }).populate('references.projectId', 'title status')
      .populate('references.userId', 'username entity')
      .populate('signature.signedBy', 'username entity');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction non trouvée'
      });
    }

    // Vérifier le statut sur la blockchain
    const blockchainStatus = {
      hash: transaction.blockchain.hash,
      blockNumber: transaction.blockchain.blockNumber,
      timestamp: transaction.blockchain.timestamp,
      previousHash: transaction.blockchain.previousHash,
      nextHash: transaction.blockchain.nextHash,
      merkleRoot: transaction.blockchain.merkleRoot,
      difficulty: transaction.blockchain.difficulty,
      nonce: transaction.blockchain.nonce
    };

    // Informations de confirmation
    const confirmationInfo = {
      status: transaction.status,
      confirmations: transaction.confirmation?.confirmations || 0,
      requiredConfirmations: transaction.confirmation?.requiredConfirmations || 1,
      isConfirmed: transaction.status === 'confirmed',
      confirmationTime: transaction.confirmation?.confirmationTime,
      lastConfirmation: transaction.confirmation?.lastConfirmation
    };

    // Informations de signature
    const signatureInfo = {
      isSigned: !!transaction.signature?.signatureHash,
      signedBy: transaction.signature?.signedBy,
      signatureHash: transaction.signature?.signatureHash,
      publicKey: transaction.signature?.publicKey,
      certificateSerial: transaction.signature?.certificateSerial,
      signatureTimestamp: transaction.signature?.signatureTimestamp
    };

    // Métadonnées de la transaction
    const transactionMetadata = {
      type: transaction.type,
      amount: transaction.data?.amount,
      currency: transaction.data?.currency,
      description: transaction.data?.description,
      references: transaction.references,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt
    };

    const result = {
      success: true,
      data: {
        transactionId: transaction.transactionId,
        blockchain: blockchainStatus,
        confirmation: confirmationInfo,
        signature: signatureInfo,
        metadata: transactionMetadata,
        project: transaction.references.projectId,
        user: transaction.references.userId
      }
    };

    res.json(result);

  } catch (error) {
    console.error('Erreur lors de la vérification du statut de la transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/transactions/recent - Transactions récentes
router.get('/recent/list', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const recentTransactions = await Transaction.getRecentTransactions(parseInt(limit));

    res.json({
      success: true,
      data: { transactions: recentTransactions }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des transactions récentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;
