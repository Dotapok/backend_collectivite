const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Project = require('../models/Project');
const User = require('../models/User');
const { 
  authenticateToken, 
  requireRole, 
  requirePermission, 
  requireOwnership,
  logUserAction 
} = require('../middleware/auth');
const blockchainUtils = require('../utils/blockchain');

const router = express.Router();

// Validation des données de projet
const projectValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Le titre doit contenir entre 5 et 200 caractères'),
  
  body('description')
    .trim()
    .isLength({ min: 20, max: 2000 })
    .withMessage('La description doit contenir entre 20 et 2000 caractères'),
  
  body('category')
    .isIn(['infrastructure', 'social', 'economic', 'environmental', 'governance', 'other'])
    .withMessage('Catégorie de projet invalide'),
  
  body('priority')
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorité invalide'),
  
  body('region')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('La région doit contenir entre 2 et 100 caractères'),
  
  body('budget')
    .isFloat({ min: 0 })
    .withMessage('Le budget doit être un nombre positif'),
  
  body('startDate')
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  body('endDate')
    .isISO8601()
    .withMessage('Date de fin invalide')
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error('La date de fin doit être postérieure à la date de début');
      }
      return true;
    }),
  
  body('objectives')
    .isArray({ min: 1, max: 10 })
    .withMessage('Le projet doit avoir entre 1 et 10 objectifs'),
  
  body('objectives.*')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Chaque objectif doit contenir entre 5 et 200 caractères'),
  
  body('beneficiaries')
    .isArray({ min: 1, max: 20 })
    .withMessage('Le projet doit avoir entre 1 et 20 bénéficiaires'),
  
  body('beneficiaries.*')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Chaque bénéficiaire doit contenir entre 2 et 100 caractères')
];

// GET /api/projects - Liste des projets (avec filtres et pagination)
router.get('/', 
  authenticateToken,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        category,
        priority,
        region,
        entity,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Construire les filtres
      const filters = {};
      
      if (status) filters.status = status;
      if (category) filters.category = category;
      if (priority) filters.priority = priority;
      if (region) filters.region = { $regex: region, $options: 'i' };
      if (entity) filters.entity = entity;
      
      // Recherche textuelle
      if (search) {
        filters.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { region: { $regex: search, $options: 'i' } }
        ];
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      // Compter le total
      const total = await Project.countDocuments(filters);
      
      // Récupérer les projets
      const projects = await Project.find(filters)
        .populate('entity', 'name type')
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      // Calculer les statistiques
      const stats = await Project.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalBudget: { $sum: '$budget' },
            avgBudget: { $avg: '$budget' },
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          projects,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          },
          stats: stats[0] || { totalBudget: 0, avgBudget: 0, count: 0 }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des projets:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/projects/:id - Détails d'un projet
router.get('/:id',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id)
        .populate('entity', 'name type region')
        .populate('createdBy', 'name email entity')
        .populate('assignedTo', 'name email entity')
        .populate('evaluations.evaluator', 'name email entity')
        .populate('validation.validatedBy', 'name email entity')
        .populate('validation.approvedBy', 'name email entity');

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      // Log de l'action
      await logUserAction(req.user.id, 'view_project', {
        projectId: project._id,
        projectTitle: project.title
      });

      res.json({
        success: true,
        data: project
      });

    } catch (error) {
      console.error('Erreur lors de la récupération du projet:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// POST /api/projects - Créer un nouveau projet
router.post('/',
  authenticateToken,
  requirePermission('project:create'),
  projectValidation,
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      // Vérifier que l'utilisateur a le droit de créer des projets pour cette entité
      if (req.user.role !== 'admin' && req.user.entity !== req.body.entity) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas le droit de créer des projets pour cette entité'
        });
      }

      // Créer le projet
      const projectData = {
        ...req.body,
        createdBy: req.user.id,
        entity: req.body.entity || req.user.entity,
        status: 'pending',
        progress: 0,
        history: [{
          action: 'created',
          userId: req.user.id,
          timestamp: new Date(),
          details: { source: 'api' }
        }]
      };

      const project = new Project(projectData);
      await project.save();

      // Créer une transaction blockchain
      const blockchainTx = blockchainUtils.createProjectTransaction(
        project._id,
        'created',
        {
          title: project.title,
          budget: project.budget,
          entity: project.entity
        },
        req.user.id,
        {
          action: 'project_creation',
          timestamp: new Date()
        }
      );

      // Log de l'action
      await logUserAction(req.user.id, 'create_project', {
        projectId: project._id,
        projectTitle: project.title,
        blockchainTx: blockchainTx.hash
      });

      // Émettre un événement Socket.IO
      if (req.app.get('io')) {
        req.app.get('io').emit('project:created', {
          projectId: project._id,
          title: project.title,
          entity: project.entity,
          createdBy: req.user.id
        });
      }

      res.status(201).json({
        success: true,
        message: 'Projet créé avec succès',
        data: project,
        blockchainTransaction: blockchainTx.hash
      });

    } catch (error) {
      console.error('Erreur lors de la création du projet:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/projects/:id - Mettre à jour un projet
router.put('/:id',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  projectValidation,
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      // Vérifier les permissions
      if (!requireOwnership(project, req.user) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas le droit de modifier ce projet'
        });
      }

      // Sauvegarder les anciennes valeurs pour l'historique
      const oldValues = {
        title: project.title,
        description: project.description,
        budget: project.budget,
        status: project.status,
        progress: project.progress
      };

      // Mettre à jour le projet
      Object.assign(project, req.body);
      project.history.push({
        action: 'updated',
        userId: req.user.id,
        timestamp: new Date(),
        details: { 
          modifiedFields: Object.keys(req.body),
          previousValues: oldValues
        }
      });

      await project.save();

      // Créer une transaction blockchain
      const blockchainTx = blockchainUtils.createProjectTransaction(
        project._id,
        'updated',
        {
          title: project.title,
          budget: project.budget,
          status: project.status,
          progress: project.progress
        },
        req.user.id,
        {
          action: 'project_update',
          timestamp: new Date(),
          modifiedFields: Object.keys(req.body)
        }
      );

      // Log de l'action
      await logUserAction(req.user.id, 'update_project', {
        projectId: project._id,
        projectTitle: project.title,
        blockchainTx: blockchainTx.hash,
        modifiedFields: Object.keys(req.body)
      });

      // Émettre un événement Socket.IO
      if (req.app.get('io')) {
        req.app.get('io').emit('project:updated', {
          projectId: project._id,
          title: project.title,
          status: project.status,
          updatedBy: req.user.id
        });
      }

      res.json({
        success: true,
        message: 'Projet mis à jour avec succès',
        data: project,
        blockchainTransaction: blockchainTx.hash
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour du projet:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// DELETE /api/projects/:id - Supprimer un projet
router.delete('/:id',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      // Vérifier les permissions
      if (!requireOwnership(project, req.user) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas le droit de supprimer ce projet'
        });
      }

      // Vérifier que le projet peut être supprimé
      if (project.status === 'completed' || project.status === 'in_progress') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de supprimer un projet en cours ou terminé'
        });
      }

      // Créer une transaction blockchain avant la suppression
      const blockchainTx = blockchainUtils.createProjectTransaction(
        project._id,
        'deleted',
        {
          title: project.title,
          budget: project.budget,
          entity: project.entity,
          reason: req.body.reason || 'Suppression par l\'utilisateur'
        },
        req.user.id,
        {
          action: 'project_deletion',
          timestamp: new Date(),
          reason: req.body.reason
        }
      );

      // Log de l'action
      await logUserAction(req.user.id, 'delete_project', {
        projectId: project._id,
        projectTitle: project.title,
        blockchainTx: blockchainTx.hash,
        reason: req.body.reason
      });

      // Supprimer le projet
      await Project.findByIdAndDelete(req.params.id);

      // Émettre un événement Socket.IO
      if (req.app.get('io')) {
        req.app.get('io').emit('project:deleted', {
          projectId: project._id,
          title: project.title,
          deletedBy: req.user.id
        });
      }

      res.json({
        success: true,
        message: 'Projet supprimé avec succès',
        blockchainTransaction: blockchainTx.hash
      });

    } catch (error) {
      console.error('Erreur lors de la suppression du projet:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PATCH /api/projects/:id/status - Mettre à jour le statut d'un projet
router.patch('/:id/status',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  body('status')
    .isIn(['pending', 'approved', 'in_progress', 'completed', 'cancelled', 'rejected'])
    .withMessage('Statut invalide'),
  body('reason').optional().trim().isLength({ min: 5, max: 500 }),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      // Vérifier les permissions
      if (!requireOwnership(project, req.user) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas le droit de modifier ce projet'
        });
      }

      const oldStatus = project.status;
      project.status = req.body.status;
      
      if (req.body.reason) {
        project.history.push({
          action: 'status_changed',
          userId: req.user.id,
          timestamp: new Date(),
          details: {
            oldStatus,
            newStatus: req.body.status,
            reason: req.body.reason
          }
        });
      }

      await project.save();

      // Créer une transaction blockchain
      const blockchainTx = blockchainUtils.createProjectTransaction(
        project._id,
        'status_changed',
        {
          oldStatus,
          newStatus: req.body.status,
          reason: req.body.reason
        },
        req.user.id,
        {
          action: 'status_change',
          timestamp: new Date()
        }
      );

      // Log de l'action
      await logUserAction(req.user.id, 'change_project_status', {
        projectId: project._id,
        projectTitle: project.title,
        oldStatus,
        newStatus: req.body.status,
        blockchainTx: blockchainTx.hash
      });

      // Émettre un événement Socket.IO
      if (req.app.get('io')) {
        req.app.get('io').emit('project:status_changed', {
          projectId: project._id,
          title: project.title,
          oldStatus,
          newStatus: req.body.status,
          changedBy: req.user.id
        });
      }

      res.json({
        success: true,
        message: 'Statut du projet mis à jour avec succès',
        data: {
          id: project._id,
          status: project.status,
          history: project.history.slice(-5) // Derniers 5 événements
        },
        blockchainTransaction: blockchainTx.hash
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PATCH /api/projects/:id/progress - Mettre à jour le progrès d'un projet
router.patch('/:id/progress',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  body('progress')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Le progrès doit être entre 0 et 100'),
  body('notes').optional().trim().isLength({ min: 5, max: 1000 }),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      // Vérifier les permissions
      if (!requireOwnership(project, req.user) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas le droit de modifier ce projet'
        });
      }

      const oldProgress = project.progress;
      project.progress = req.body.progress;
      
      if (req.body.notes) {
        project.history.push({
          action: 'progress_updated',
          userId: req.user.id,
          timestamp: new Date(),
          details: {
            oldProgress,
            newProgress: req.body.progress,
            notes: req.body.notes
          }
        });
      }

      await project.save();

      // Créer une transaction blockchain
      const blockchainTx = blockchainUtils.createProjectTransaction(
        project._id,
        'progress_updated',
        {
          oldProgress,
          newProgress: req.body.progress,
          notes: req.body.notes
        },
        req.user.id,
        {
          action: 'progress_update',
          timestamp: new Date()
        }
      );

      // Log de l'action
      await logUserAction(req.user.id, 'update_project_progress', {
        projectId: project._id,
        projectTitle: project.title,
        oldProgress,
        newProgress: req.body.progress,
        blockchainTx: blockchainTx.hash
      });

      // Émettre un événement Socket.IO
      if (req.app.get('io')) {
        req.app.get('io').emit('project:progress_updated', {
          projectId: project._id,
          title: project.title,
          progress: req.body.progress,
          updatedBy: req.user.id
        });
      }

      res.json({
        success: true,
        message: 'Progrès du projet mis à jour avec succès',
        data: {
          id: project._id,
          progress: project.progress,
          history: project.history.slice(-5)
        },
        blockchainTransaction: blockchainTx.hash
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour du progrès:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/projects/:id/history - Historique d'un projet
router.get('/:id/history',
  authenticateToken,
  param('id').isMongoId().withMessage('ID de projet invalide'),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const project = await Project.findById(req.params.id)
        .select('history title')
        .populate('history.userId', 'name email entity');

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé'
        });
      }

      res.json({
        success: true,
        data: {
          projectId: project._id,
          title: project.title,
          history: project.history
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/projects/entity/:entityId - Projets d'une entité
router.get('/entity/:entityId',
  authenticateToken,
  param('entityId').isMongoId().withMessage('ID d\'entité invalide'),
  async (req, res) => {
    try {
      const validationErrors = validationResult(req);
      if (!validationErrors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: validationErrors.array()
        });
      }

      const { page = 1, limit = 20, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const filters = { entity: req.params.entityId };
      if (status) filters.status = status;

      const total = await Project.countDocuments(filters);
      const projects = await Project.find(filters)
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      res.json({
        success: true,
        data: {
          projects,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des projets de l\'entité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

module.exports = router;
