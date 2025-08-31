const express = require('express');
const { query, validationResult } = require('express-validator');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const {
  authenticateToken,
  requirePermission,
  logUserAction
} = require('../middleware/auth');

const router = express.Router();

// Validation pour les paramètres de statistiques
const statsValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide'),
  
  query('region')
    .optional()
    .trim(),
  
  query('category')
    .optional()
    .isIn([
      'Infrastructure', 'Éducation', 'Santé', 'Agriculture', 'Énergie',
      'Transport', 'Eau et Assainissement', 'Environnement', 'Culture et Sport', 'Sécurité', 'Autres'
    ])
    .withMessage('Catégorie invalide'),
  
  query('entity')
    .optional()
    .trim(),
  
  query('groupBy')
    .optional()
    .isIn(['day', 'week', 'month', 'quarter', 'year'])
    .withMessage('Groupement invalide')
];

// GET /api/stats/overview - Vue d'ensemble des statistiques
router.get('/overview', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate, region, category, entity } = req.query;

      // Construire les filtres de base
      const baseFilters = {};
      if (startDate || endDate) {
        baseFilters.createdAt = {};
        if (startDate) baseFilters.createdAt.$gte = new Date(startDate);
        if (endDate) baseFilters.createdAt.$lte = new Date(endDate);
      }
      if (region) baseFilters.region = region;
      if (category) baseFilters.category = category;
      if (entity) baseFilters.submittedByEntity = entity;

      // Statistiques des projets
      const projectStats = await Project.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            totalBudget: { $sum: '$budget.requested' },
            approvedBudget: { $sum: '$budget.approved' },
            spentBudget: { $sum: '$budget.spent' },
            avgScore: { $avg: '$evaluation.score' },
            completedProjects: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            activeProjects: {
              $sum: { $cond: [{ $in: ['$status', ['in_progress', 'funded']] }, 1, 0] }
            }
          }
        }
      ]);

      // Statistiques des utilisateurs
      const userStats = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } }
          }
        }
      ]);

      // Statistiques des transactions
      const transactionStats = await Transaction.aggregate([
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            confirmedTransactions: {
              $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
            },
            totalAmount: { $sum: '$data.amount' }
          }
        }
      ]);

      // Statistiques par statut de projet
      const statusStats = await Project.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalBudget: { $sum: '$budget.requested' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par catégorie
      const categoryStats = await Project.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalBudget: { $sum: '$budget.requested' },
            avgScore: { $avg: '$evaluation.score' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par région
      const regionStats = await Project.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: '$region',
            count: { $sum: 1 },
            totalBudget: { $sum: '$budget.requested' },
            avgScore: { $avg: '$evaluation.score' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const stats = {
        projects: projectStats[0] || {
          totalProjects: 0,
          totalBudget: 0,
          approvedBudget: 0,
          spentBudget: 0,
          avgScore: 0,
          completedProjects: 0,
          activeProjects: 0
        },
        users: userStats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          verifiedUsers: 0
        },
        transactions: transactionStats[0] || {
          totalTransactions: 0,
          confirmedTransactions: 0,
          totalAmount: 0
        },
        byStatus: statusStats,
        byCategory: categoryStats,
        byRegion: regionStats
      };

      res.json({
        success: true,
        data: { stats }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques générales:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/projects - Statistiques détaillées des projets
router.get('/projects', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate, region, category, entity, groupBy = 'month' } = req.query;

      // Construire les filtres
      const filters = {};
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.$gte = new Date(startDate);
        if (endDate) filters.createdAt.$lte = new Date(endDate);
      }
      if (region) filters.region = region;
      if (category) filters.category = category;
      if (entity) filters.submittedByEntity = entity;

      // Statistiques temporelles
      const timeFormat = {
        day: '%Y-%m-%d',
        week: '%Y-%U',
        month: '%Y-%m',
        quarter: '%Y-Q%q',
        year: '%Y'
      };

      const temporalStats = await Project.aggregate([
        { $match: filters },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeFormat[groupBy],
                date: '$createdAt'
              }
            },
            count: { $sum: 1 },
            totalBudget: { $sum: '$budget.requested' },
            approvedBudget: { $sum: '$budget.approved' },
            avgScore: { $avg: '$evaluation.score' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Statistiques par évaluateur
      const evaluatorStats = await Project.aggregate([
        { $match: { ...filters, 'evaluation.evaluator': { $exists: true } } },
        {
          $lookup: {
            from: 'users',
            localField: 'evaluation.evaluator',
            foreignField: '_id',
            as: 'evaluator'
          }
        },
        {
          $unwind: '$evaluator'
        },
        {
          $group: {
            _id: '$evaluation.evaluator._id',
            evaluatorName: { $first: '$evaluator.username' },
            evaluatorEntity: { $first: '$evaluator.entity' },
            count: { $sum: 1 },
            avgScore: { $avg: '$evaluation.score' },
            totalBudget: { $sum: '$budget.requested' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques de performance
      const performanceStats = await Project.aggregate([
        { $match: filters },
        {
          $addFields: {
            evaluationTime: {
              $cond: [
                { $and: [
                  { $ne: ['$timeline.evaluationStartDate', null] },
                  { $ne: ['$timeline.evaluationEndDate', null] }
                ]},
                {
                  $divide: [
                    { $subtract: ['$timeline.evaluationEndDate', '$timeline.evaluationStartDate'] },
                    1000 * 60 * 60 * 24 // Convertir en jours
                  ]
                },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgEvaluationTime: { $avg: '$evaluationTime' },
            minEvaluationTime: { $min: '$evaluationTime' },
            maxEvaluationTime: { $max: '$evaluationTime' }
          }
        }
      ]);

      // Statistiques de budget
      const budgetStats = await Project.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalRequested: { $sum: '$budget.requested' },
            totalApproved: { $sum: '$budget.approved' },
            totalSpent: { $sum: '$budget.spent' },
            avgRequested: { $avg: '$budget.requested' },
            avgApproved: { $avg: '$budget.approved' },
            budgetEfficiency: {
              $avg: {
                $cond: [
                  { $gt: ['$budget.approved', 0] },
                  { $divide: ['$budget.spent', '$budget.approved'] },
                  0
                ]
              }
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          temporal: temporalStats,
          evaluators: evaluatorStats,
          performance: performanceStats[0] || {
            avgEvaluationTime: 0,
            minEvaluationTime: 0,
            maxEvaluationTime: 0
          },
          budget: budgetStats[0] || {
            totalRequested: 0,
            totalApproved: 0,
            totalSpent: 0,
            avgRequested: 0,
            avgApproved: 0,
            budgetEfficiency: 0
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques des projets:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/transactions - Statistiques des transactions
router.get('/transactions', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate, groupBy = 'month' } = req.query;

      // Construire les filtres
      const filters = {};
      if (startDate || endDate) {
        filters['blockchain.timestamp'] = {};
        if (startDate) filters['blockchain.timestamp'].$gte = new Date(startDate);
        if (endDate) filters['blockchain.timestamp'].$lte = new Date(endDate);
      }

      // Statistiques temporelles
      const timeFormat = {
        day: '%Y-%m-%d',
        week: '%Y-%U',
        month: '%Y-%m',
        quarter: '%Y-Q%q',
        year: '%Y'
      };

      const temporalStats = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeFormat[groupBy],
                date: '$blockchain.timestamp'
              }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$data.amount' },
            avgGasCost: { $avg: '$gas.gasCost' },
            avgConfirmations: { $avg: '$confirmation.confirmations' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Statistiques par type
      const typeStats = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$data.amount' },
            avgProcessingTime: { $avg: '$performance.processingTime' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par statut
      const statusStats = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$data.amount' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques de performance
      const performanceStats = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            avgProcessingTime: { $avg: '$performance.processingTime' },
            avgConfirmationTime: { $avg: '$performance.confirmationTime' },
            avgGasUsed: { $avg: '$gas.gasUsed' },
            totalGasCost: { $sum: '$gas.gasCost' }
          }
        }
      ]);

      // Statistiques par bloc
      const blockStats = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: {
              $floor: { $divide: ['$blockchain.blockNumber', 1000] }
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
          temporal: temporalStats,
          byType: typeStats,
          byStatus: statusStats,
          performance: performanceStats[0] || {
            avgProcessingTime: 0,
            avgConfirmationTime: 0,
            avgGasUsed: 0,
            totalGasCost: 0
          },
          byBlock: blockStats
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques des transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/users - Statistiques des utilisateurs
router.get('/users', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate, region, entity, groupBy = 'month' } = req.query;

      // Construire les filtres
      const filters = {};
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.$gte = new Date(startDate);
        if (endDate) filters.createdAt.$lte = new Date(endDate);
      }
      if (region) filters.region = region;
      if (entity) filters.entity = entity;

      // Statistiques temporelles
      const timeFormat = {
        day: '%Y-%m-%d',
        week: '%Y-%U',
        month: '%Y-%m',
        quarter: '%Y-Q%q',
        year: '%Y'
      };

      const temporalStats = await User.aggregate([
        { $match: filters },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeFormat[groupBy],
                date: '$createdAt'
              }
            },
            count: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Statistiques par rôle
      const roleStats = await User.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
            verifiedCount: { $sum: { $cond: ['$isVerified', 1, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par entité
      const entityStats = await User.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$entity',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
            roles: { $addToSet: '$role' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par région
      const regionStats = await User.aggregate([
        { $match: filters },
        {
          $group: {
            _id: '$region',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
            entities: { $addToSet: '$entity' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques d'activité
      const activityStats = await User.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
            usersWithCertificates: {
              $sum: { $cond: [{ $ne: ['$certificateInfo.serialNumber', null] }, 1, 0] }
            },
            expiringCertificates: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$certificateInfo.expiresAt', null] },
                      { $lte: ['$certificateInfo.expiresAt', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          temporal: temporalStats,
          byRole: roleStats,
          byEntity: entityStats,
          byRegion: regionStats,
          overview: activityStats[0] || {
            totalUsers: 0,
            activeUsers: 0,
            verifiedUsers: 0,
            usersWithCertificates: 0,
            expiringCertificates: 0
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques des utilisateurs:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/performance - Métriques de performance
router.get('/performance', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate } = req.query;

      // Construire les filtres
      const filters = {};
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.$gte = new Date(startDate);
        if (endDate) filters.createdAt.$lte = new Date(endDate);
      }

      // Métriques de performance des projets
      const projectPerformance = await Project.aggregate([
        { $match: filters },
        {
          $addFields: {
            evaluationTime: {
              $cond: [
                { $and: [
                  { $ne: ['$timeline.evaluationStartDate', null] },
                  { $ne: ['$timeline.evaluationEndDate', null] }
                ]},
                {
                  $divide: [
                    { $subtract: ['$timeline.evaluationEndDate', '$timeline.evaluationStartDate'] },
                    1000 * 60 * 60 * 24
                  ]
                },
                null
              ]
            },
            approvalTime: {
              $cond: [
                { $and: [
                  { $ne: ['$timeline.evaluationEndDate', null] },
                  { $ne: ['$timeline.approvalDate', null] }
                ]},
                {
                  $divide: [
                    { $subtract: ['$timeline.approvalDate', '$timeline.evaluationEndDate'] },
                    1000 * 60 * 60 * 24
                  ]
                },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgEvaluationTime: { $avg: '$evaluationTime' },
            avgApprovalTime: { $avg: '$approvalTime' },
            totalProjects: { $sum: 1 },
            completedProjects: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            avgScore: { $avg: '$evaluation.score' }
          }
        }
      ]);

      // Métriques de performance des transactions
      const transactionPerformance = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            avgProcessingTime: { $avg: '$performance.processingTime' },
            avgConfirmationTime: { $avg: '$performance.confirmationTime' },
            avgGasUsed: { $avg: '$gas.gasUsed' },
            totalGasCost: { $sum: '$gas.gasCost' },
            throughput: { $avg: '$performance.throughput' }
          }
        }
      ]);

      // Métriques de satisfaction utilisateur
      const userSatisfaction = await Project.aggregate([
        { $match: { ...filters, 'evaluation.score': { $exists: true } } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$evaluation.score' },
            highScores: {
              $sum: { $cond: [{ $gte: ['$evaluation.score', 80] }, 1, 0] }
            },
            mediumScores: {
              $sum: { $cond: [
                { $and: [
                  { $gte: ['$evaluation.score', 60] },
                  { $lt: ['$evaluation.score', 80] }
                ]},
                1,
                0
              ]}
            },
            lowScores: {
              $sum: { $cond: [{ $lt: ['$evaluation.score', 60] }, 1, 0] }
            }
          }
        }
      ]);

      // Métriques de temps de réponse
      const responseTimeMetrics = await Project.aggregate([
        { $match: { ...filters, 'timeline.submissionDate': { $exists: true } } },
        {
          $addFields: {
            responseTime: {
              $cond: [
                { $ne: ['$timeline.evaluationStartDate', null] },
                {
                  $divide: [
                    { $subtract: ['$timeline.evaluationStartDate', '$timeline.submissionDate'] },
                    1000 * 60 * 60 * 24
                  ]
                },
                null
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: '$responseTime' },
            minResponseTime: { $min: '$responseTime' },
            maxResponseTime: { $max: '$responseTime' },
            projectsWithResponse: {
              $sum: { $cond: [{ $ne: ['$responseTime', null] }, 1, 0] }
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          projects: projectPerformance[0] || {
            avgEvaluationTime: 0,
            avgApprovalTime: 0,
            totalProjects: 0,
            completedProjects: 0,
            avgScore: 0
          },
          transactions: transactionPerformance[0] || {
            totalTransactions: 0,
            avgProcessingTime: 0,
            avgConfirmationTime: 0,
            avgGasUsed: 0,
            totalGasCost: 0,
            throughput: 0
          },
          satisfaction: userSatisfaction[0] || {
            avgScore: 0,
            highScores: 0,
            mediumScores: 0,
            lowScores: 0
          },
          responseTime: responseTimeMetrics[0] || {
            avgResponseTime: 0,
            minResponseTime: 0,
            maxResponseTime: 0,
            projectsWithResponse: 0
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des métriques de performance:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/blockchain - Statistiques blockchain
router.get('/blockchain', 
  authenticateToken, 
  requirePermission('view_reports'),
  statsValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { startDate, endDate } = req.query;

      // Construire les filtres de base
      const baseFilters = {};
      if (startDate || endDate) {
        baseFilters['blockchain.timestamp'] = {};
        if (startDate) baseFilters['blockchain.timestamp'].$gte = new Date(startDate);
        if (endDate) baseFilters['blockchain.timestamp'].$lte = new Date(endDate);
      }

      // Statistiques des transactions blockchain
      const blockchainStats = await Transaction.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalBlocks: { $addToSet: '$blockchain.blockNumber' },
            uniqueBlocks: { $size: { $addToSet: '$blockchain.blockNumber' } },
            avgBlockSize: { $avg: { $strLenCP: '$blockchain.hash' } },
            totalGasUsed: { $sum: '$blockchain.difficulty' || 0 },
            avgDifficulty: { $avg: '$blockchain.difficulty' || 0 },
            firstTransaction: { $min: '$blockchain.timestamp' },
            lastTransaction: { $max: '$blockchain.timestamp' }
          }
        }
      ]);

      // Statistiques par type de transaction
      const transactionTypeStats = await Transaction.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgConfirmationTime: { $avg: { $subtract: ['$blockchain.timestamp', '$createdAt'] } }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques de performance blockchain
      const performanceStats = await Transaction.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$blockchain.timestamp'
              }
            },
            transactions: { $sum: 1 },
            avgDifficulty: { $avg: '$blockchain.difficulty' || 0 },
            totalGasUsed: { $sum: '$blockchain.difficulty' || 0 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Statistiques de sécurité
      const securityStats = await Transaction.aggregate([
        { $match: baseFilters },
        {
          $group: {
            _id: null,
            transactionsWithSignature: {
              $sum: { $cond: [{ $ne: ['$signature.signatureHash', null] }, 1, 0] }
            },
            transactionsWithCertificate: {
              $sum: { $cond: [{ $ne: ['$signature.certificateSerial', null] }, 1, 0] }
            },
            totalTransactions: { $sum: 1 }
          }
        }
      ]);

      const result = {
        success: true,
        data: {
          overview: blockchainStats[0] || {
            totalTransactions: 0,
            totalBlocks: 0,
            uniqueBlocks: 0,
            avgBlockSize: 0,
            totalGasUsed: 0,
            avgDifficulty: 0,
            firstTransaction: null,
            lastTransaction: null
          },
          transactionTypes: transactionTypeStats,
          performance: performanceStats,
          security: securityStats[0] || {
            transactionsWithSignature: 0,
            transactionsWithCertificate: 0,
            totalTransactions: 0
          }
        }
      };

      res.json(result);

    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques blockchain:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/stats/export - Exporter les statistiques
router.get('/export', 
  authenticateToken, 
  requirePermission('view_reports'),
  logUserAction('export_stats'),
  async (req, res) => {
    try {
      const { format = 'json', startDate, endDate } = req.query;

      // Construire les filtres de base
      const filters = {};
      if (startDate || endDate) {
        filters.createdAt = {};
        if (startDate) filters.createdAt.$gte = new Date(startDate);
        if (endDate) filters.createdAt.$lte = new Date(endDate);
      }

      // Récupérer toutes les données nécessaires
      const [projects, transactions, users] = await Promise.all([
        Project.find(filters).lean(),
        Transaction.find(filters).lean(),
        User.find(filters).select('-password').lean()
      ]);

      const exportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          filters: { startDate, endDate },
          totalRecords: {
            projects: projects.length,
            transactions: transactions.length,
            users: users.length
          }
        },
        data: {
          projects,
          transactions,
          users
        }
      };

      if (format === 'csv') {
        // Logique pour l'export CSV (à implémenter)
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=stats_${Date.now()}.csv`);
        res.send('Format CSV non encore implémenté');
      } else {
        // Export JSON par défaut
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=stats_${Date.now()}.json`);
        res.json(exportData);
      }

    } catch (error) {
      console.error('Erreur lors de l\'export des statistiques:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

module.exports = router;
