const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const {
  authenticateToken,
  requireEvaluationPermission,
  requireOwnership,
  logUserAction
} = require('../middleware/auth');

const router = express.Router();

// Validation pour la création/modification d'évaluation
const evaluationValidation = [
  body('projectId')
    .isMongoId()
    .withMessage('ID de projet invalide'),
  
  body('score')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Le score doit être entre 0 et 100'),
  
  body('criteria')
    .isArray({ min: 1 })
    .withMessage('Au moins un critère d\'évaluation est requis'),
  
  body('criteria.*.name')
    .notEmpty()
    .withMessage('Le nom du critère est requis')
    .trim(),
  
  body('criteria.*.score')
    .isFloat({ min: 0 })
    .withMessage('Le score du critère doit être un nombre positif'),
  
  body('criteria.*.maxScore')
    .isFloat({ min: 0 })
    .withMessage('Le score maximum du critère doit être un nombre positif'),
  
  body('criteria.*.weight')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Le poids du critère doit être entre 0 et 1'),
  
  body('criteria.*.comment')
    .optional()
    .trim(),
  
  body('recommendations')
    .optional()
    .isArray()
    .withMessage('Les recommandations doivent être un tableau'),
  
  body('recommendations.*')
    .isLength({ min: 5, max: 200 })
    .withMessage('Chaque recommandation doit contenir entre 5 et 200 caractères')
    .trim(),
  
  body('decision')
    .isIn(['approve', 'reject', 'needs_revision', 'pending'])
    .withMessage('Décision invalide'),
  
  body('comments')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Les commentaires ne peuvent dépasser 1000 caractères')
    .trim()
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
  
  query('decision')
    .optional()
    .isIn(['approve', 'reject', 'needs_revision', 'pending'])
    .withMessage('Décision invalide'),
  
  query('minScore')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Le score minimum doit être entre 0 et 100'),
  
  query('maxScore')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Le score maximum doit être entre 0 et 100'),
  
  query('evaluatorId')
    .optional()
    .isMongoId()
    .withMessage('ID d\'évaluateur invalide'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide')
];

// GET /api/evaluations - Lister toutes les évaluations (avec pagination et filtres)
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
      decision,
      minScore,
      maxScore,
      evaluatorId,
      startDate,
      endDate,
      sortBy = 'evaluationDate',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
    
    if (decision) filters['evaluation.decision'] = decision;
    if (evaluatorId) filters['evaluation.evaluator'] = evaluatorId;
    
    if (minScore || maxScore) {
      filters['evaluation.score'] = {};
      if (minScore) filters['evaluation.score'].$gte = parseFloat(minScore);
      if (maxScore) filters['evaluation.score'].$lte = parseFloat(maxScore);
    }
    
    if (startDate || endDate) {
      filters['evaluation.evaluationDate'] = {};
      if (startDate) filters['evaluation.evaluationDate'].$gte = new Date(startDate);
      if (endDate) filters['evaluation.evaluationDate'].$lte = new Date(endDate);
    }

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Exécuter la requête avec pagination
    const [projects, total] = await Promise.all([
      Project.find(filters)
        .populate('submittedBy', 'username firstName lastName entity region')
        .populate('evaluation.evaluator', 'username firstName lastName entity')
        .sort(sort)
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
        evaluations: projects,
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
    console.error('Erreur lors de la récupération des évaluations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/evaluations/pending - Projets en attente d'évaluation
router.get('/pending', authenticateToken, requireEvaluationPermission, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les projets en attente d'évaluation
    const [projects, total] = await Promise.all([
      Project.find({ 
        status: { $in: ['submitted', 'under_review'] },
        'evaluation.evaluator': { $exists: false }
      })
        .populate('submittedBy', 'username firstName lastName entity region')
        .sort({ 'timeline.submissionDate': 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      Project.countDocuments({ 
        status: { $in: ['submitted', 'under_review'] },
        'evaluation.evaluator': { $exists: false }
      })
    ]);

    // Calculer les informations de pagination
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
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
    console.error('Erreur lors de la récupération des projets en attente:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/evaluations/my - Mes évaluations personnelles
router.get('/my', authenticateToken, requireEvaluationPermission, async (req, res) => {
  try {
    const { page = 1, limit = 20, decision } = req.query;

    // Construire les filtres
    const filters = {
      'evaluation.evaluator': req.user.userId
    };
    
    if (decision) filters['evaluation.decision'] = decision;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Récupérer les évaluations de l'utilisateur
    const [projects, total] = await Promise.all([
      Project.find(filters)
        .populate('submittedBy', 'username firstName lastName entity region')
        .sort({ 'evaluation.evaluationDate': -1 })
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
        evaluations: projects,
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
    console.error('Erreur lors de la récupération de mes évaluations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/evaluations/:projectId - Récupérer l'évaluation d'un projet spécifique
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId)
      .populate('submittedBy', 'username firstName lastName entity region')
      .populate('evaluation.evaluator', 'username firstName lastName entity');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Projet non trouvé'
      });
    }

    // Vérifier si le projet a une évaluation
    if (!project.evaluation || !project.evaluation.evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Ce projet n\'a pas encore été évalué'
      });
    }

    res.json({
      success: true,
      data: { evaluation: project }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de l\'évaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// POST /api/evaluations - Créer une nouvelle évaluation
router.post('/', 
  authenticateToken, 
  requireEvaluationPermission,
  logUserAction('create_evaluation'),
  evaluationValidation,
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
        projectId,
        score,
        criteria,
        recommendations = [],
        decision,
        comments = ''
      } = req.body;

      // Vérifier que le projet existe et est en attente d'évaluation
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      if (project.status !== 'submitted' && project.status !== 'under_review') {
        return res.status(400).json({
          success: false,
          message: 'Ce projet ne peut plus être évalué'
        });
      }

      if (project.evaluation && project.evaluation.evaluator) {
        return res.status(400).json({
          success: false,
          message: 'Ce projet a déjà été évalué'
        });
      }

      // Calculer le score total pondéré
      let totalScore = 0;
      let maxPossibleScore = 0;
      
      criteria.forEach(criterion => {
        const weightedScore = (criterion.score / criterion.maxScore) * criterion.weight;
        totalScore += weightedScore;
        maxPossibleScore += criterion.weight;
      });

      const finalScore = Math.round((totalScore / maxPossibleScore) * 100);

      // Mettre à jour le projet avec l'évaluation
      project.evaluation = {
        score: finalScore,
        evaluator: req.user.userId,
        evaluationDate: new Date(),
        criteria,
        totalScore: finalScore,
        maxPossibleScore: 100,
        recommendations,
        decision,
        comments
      };

      // Mettre à jour le statut du projet
      if (decision === 'approve') {
        project.status = 'evaluated';
        project.timeline.evaluationEndDate = new Date();
      } else if (decision === 'reject') {
        project.status = 'rejected';
        project.timeline.evaluationEndDate = new Date();
      } else if (decision === 'needs_revision') {
        project.status = 'under_review';
        project.timeline.evaluationEndDate = new Date();
      }

      await project.save();

      // Créer une transaction blockchain pour l'évaluation
      const transaction = new Transaction({
        transactionId: `EVAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'project_evaluation',
        blockchain: {
          hash: `0x${Math.random().toString(36).substr(2, 64)}`,
          blockNumber: Math.floor(Math.random() * 1000000) + 1000000,
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
        data: {
          amount: 0,
          description: `Évaluation du projet: ${project.title}`,
          metadata: {
            projectId: project._id,
            projectTitle: project.title,
            score: finalScore,
            decision
          }
        },
        references: {
          projectId: project._id,
          userId: req.user.userId
        },
        typeSpecificData: {
          evaluation: {
            score: finalScore,
            criteria: criteria.map(c => c.name),
            comments,
            decision
          }
        },
        status: 'confirmed'
      });

      await transaction.save();

      // Émettre un événement Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.emit('project_evaluated', {
          projectId: project._id,
          projectTitle: project.title,
          score: finalScore,
          decision,
          evaluator: req.user.username
        });
      }

      res.status(201).json({
        success: true,
        message: 'Évaluation créée avec succès',
        data: { 
          evaluation: project.evaluation,
          project: {
            id: project._id,
            title: project.title,
            status: project.status
          },
          transaction: {
            id: transaction._id,
            hash: transaction.blockchain.hash
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la création de l\'évaluation:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/evaluations/:projectId - Mettre à jour une évaluation existante
router.put('/:projectId', 
  authenticateToken, 
  requireEvaluationPermission,
  logUserAction('update_evaluation'),
  evaluationValidation,
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

      const { projectId } = req.params;
      const {
        score,
        criteria,
        recommendations = [],
        decision,
        comments = ''
      } = req.body;

      // Vérifier que le projet existe et a une évaluation
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      if (!project.evaluation || !project.evaluation.evaluator) {
        return res.status(404).json({
          success: false,
          message: 'Ce projet n\'a pas encore été évalué'
        });
      }

      // Vérifier que l'utilisateur est l'évaluateur original ou un admin
      if (project.evaluation.evaluator.toString() !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez modifier que vos propres évaluations'
        });
      }

      // Calculer le nouveau score total pondéré
      let totalScore = 0;
      let maxPossibleScore = 0;
      
      criteria.forEach(criterion => {
        const weightedScore = (criterion.score / criterion.maxScore) * criterion.weight;
        totalScore += weightedScore;
        maxPossibleScore += criterion.weight;
      });

      const finalScore = Math.round((totalScore / maxPossibleScore) * 100);

      // Sauvegarder l'ancienne évaluation dans l'historique
      const oldEvaluation = { ...project.evaluation.toObject() };
      
      // Mettre à jour l'évaluation
      project.evaluation.score = finalScore;
      project.evaluation.criteria = criteria;
      project.evaluation.totalScore = finalScore;
      project.evaluation.maxPossibleScore = 100;
      project.evaluation.recommendations = recommendations;
      project.evaluation.decision = decision;
      project.evaluation.comments = comments;
      project.evaluation.evaluationDate = new Date();

      // Mettre à jour le statut du projet si nécessaire
      if (decision === 'approve' && project.status !== 'evaluated') {
        project.status = 'evaluated';
        project.timeline.evaluationEndDate = new Date();
      } else if (decision === 'reject' && project.status !== 'rejected') {
        project.status = 'rejected';
        project.timeline.evaluationEndDate = new Date();
      } else if (decision === 'needs_revision' && project.status !== 'under_review') {
        project.status = 'under_review';
        project.timeline.evaluationEndDate = new Date();
      }

      // Ajouter à l'historique
      project.history.push({
        action: 'evaluation_updated',
        description: 'Évaluation mise à jour',
        changedBy: req.user.userId,
        changedAt: new Date(),
        previousValue: oldEvaluation,
        newValue: project.evaluation
      });

      await project.save();

      // Créer une transaction blockchain pour la mise à jour
      const transaction = new Transaction({
        transactionId: `EVAL_UPDATE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'project_evaluation',
        blockchain: {
          hash: `0x${Math.random().toString(36).substr(2, 64)}`,
          blockNumber: Math.floor(Math.random() * 1000000) + 1000000,
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
        data: {
          amount: 0,
          description: `Mise à jour de l'évaluation du projet: ${project.title}`,
          metadata: {
            projectId: project._id,
            projectTitle: project.title,
            score: finalScore,
            decision,
            previousScore: oldEvaluation.score
          }
        },
        references: {
          projectId: project._id,
          userId: req.user.userId
        },
        typeSpecificData: {
          evaluation: {
            score: finalScore,
            criteria: criteria.map(c => c.name),
            comments,
            decision
          }
        },
        status: 'confirmed'
      });

      await transaction.save();

      res.json({
        success: true,
        message: 'Évaluation mise à jour avec succès',
        data: { 
          evaluation: project.evaluation,
          project: {
            id: project._id,
            title: project.title,
            status: project.status
          },
          transaction: {
            id: transaction._id,
            hash: transaction.blockchain.hash
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'évaluation:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/evaluations/stats/overview - Statistiques des évaluations
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    // Statistiques globales
    const totalProjects = await Project.countDocuments();
    const evaluatedProjects = await Project.countDocuments({
      'evaluation.evaluator': { $exists: true }
    });
    const pendingEvaluation = await Project.countDocuments({
      status: { $in: ['submitted', 'under_review'] },
      'evaluation.evaluator': { $exists: false }
    });

    // Statistiques par décision
    const decisionStats = await Project.aggregate([
      {
        $match: {
          'evaluation.evaluator': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$evaluation.decision',
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluation.score' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Statistiques par évaluateur
    const evaluatorStats = await Project.aggregate([
      {
        $match: {
          'evaluation.evaluator': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$evaluation.evaluator',
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluation.score' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'evaluator'
        }
      },
      {
        $unwind: '$evaluator'
      },
      {
        $project: {
          evaluator: {
            username: 1,
            firstName: 1,
            lastName: 1,
            entity: 1
          },
          count: 1,
          avgScore: { $round: ['$avgScore', 2] }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Statistiques par mois (6 derniers mois)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStats = await Project.aggregate([
      {
        $match: {
          'evaluation.evaluator': { $exists: true },
          'evaluation.evaluationDate': { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$evaluation.evaluationDate'
            }
          },
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluation.score' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalProjects,
          evaluatedProjects,
          pendingEvaluation,
          evaluationRate: totalProjects > 0 ? Math.round((evaluatedProjects / totalProjects) * 100) : 0
        },
        byDecision: decisionStats,
        byEvaluator: evaluatorStats,
        monthly: monthlyStats
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

// GET /api/evaluations/stats/my - Mes statistiques d'évaluation
router.get('/stats/my', authenticateToken, requireEvaluationPermission, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Statistiques personnelles
    const myEvaluations = await Project.countDocuments({
      'evaluation.evaluator': userId
    });

    const myApproved = await Project.countDocuments({
      'evaluation.evaluator': userId,
      'evaluation.decision': 'approve'
    });

    const myRejected = await Project.countDocuments({
      'evaluation.evaluator': userId,
      'evaluation.decision': 'reject'
    });

    const myRevision = await Project.countDocuments({
      'evaluation.evaluator': userId,
      'evaluation.decision': 'needs_revision'
    });

    // Score moyen
    const avgScoreResult = await Project.aggregate([
      {
        $match: {
          'evaluation.evaluator': userId
        }
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$evaluation.score' }
        }
      }
    ]);

    const avgScore = avgScoreResult.length > 0 ? Math.round(avgScoreResult[0].avgScore) : 0;

    // Évaluations par mois (6 derniers mois)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStats = await Project.aggregate([
      {
        $match: {
          'evaluation.evaluator': userId,
          'evaluation.evaluationDate': { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$evaluation.evaluationDate'
            }
          },
          count: { $sum: 1 },
          avgScore: { $avg: '$evaluation.score' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalEvaluations: myEvaluations,
          approved: myApproved,
          rejected: myRejected,
          needsRevision: myRevision,
          approvalRate: myEvaluations > 0 ? Math.round((myApproved / myEvaluations) * 100) : 0
        },
        avgScore,
        monthly: monthlyStats
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de mes statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

module.exports = router;
