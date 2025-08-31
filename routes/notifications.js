const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const {
  authenticateToken,
  requirePermission,
  logUserAction
} = require('../middleware/auth');

const router = express.Router();

// Validation pour la création de notification
const notificationValidation = [
  body('type')
    .isIn([
      'project_submitted',
      'project_evaluated',
      'project_approved',
      'project_rejected',
      'project_funded',
      'project_completed',
      'evaluation_requested',
      'budget_allocated',
      'transaction_confirmed',
      'system_alert',
      'user_activity'
    ])
    .withMessage('Type de notification invalide'),
  
  body('title')
    .isLength({ min: 5, max: 200 })
    .withMessage('Le titre doit contenir entre 5 et 200 caractères')
    .trim(),
  
  body('message')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Le message doit contenir entre 10 et 1000 caractères')
    .trim(),
  
  body('recipients')
    .isArray({ min: 1 })
    .withMessage('Au moins un destinataire est requis'),
  
  body('recipients.*')
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorité invalide'),
  
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Les métadonnées doivent être un objet')
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
      'project_submitted', 'project_evaluated', 'project_approved',
      'project_rejected', 'project_funded', 'project_completed',
      'evaluation_requested', 'budget_allocated', 'transaction_confirmed',
      'system_alert', 'user_activity'
    ])
    .withMessage('Type de notification invalide'),
  
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priorité invalide'),
  
  query('read')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Le paramètre read doit être true ou false'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide')
];

// GET /api/notifications - Récupérer les notifications de l'utilisateur connecté
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
      priority,
      read,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {
      'recipients.user': req.user.userId
    };
    
    if (type) filters.type = type;
    if (priority) filters.priority = priority;
    if (read === 'true') filters['recipients.readAt'] = { $exists: true };
    if (read === 'false') filters['recipients.readAt'] = { $exists: false };
    
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Exécuter la requête avec pagination
    const [notifications, total] = await Promise.all([
      Project.aggregate([
        {
          $match: filters
        },
        {
          $unwind: '$notifications'
        },
        {
          $match: {
            'notifications.recipients.user': req.user.userId
          }
        },
        {
          $project: {
            _id: '$notifications._id',
            type: '$notifications.type',
            title: '$notifications.title',
            message: '$notifications.message',
            priority: '$notifications.priority',
            createdAt: '$notifications.createdAt',
            metadata: '$notifications.metadata',
            readAt: {
              $filter: {
                input: '$notifications.recipients',
                as: 'recipient',
                cond: { $eq: ['$$recipient.user', req.user.userId] }
              }
            }
          }
        },
        {
          $addFields: {
            isRead: { $gt: [{ $size: '$readAt' }, 0] }
          }
        },
        {
          $sort: sort
        },
        {
          $skip: skip
        },
        {
          $limit: parseInt(limit)
        }
      ]),
      
      Project.aggregate([
        {
          $match: filters
        },
        {
          $unwind: '$notifications'
        },
        {
          $match: {
            'notifications.recipients.user': req.user.userId
          }
        },
        {
          $count: 'total'
        }
      ])
    ]);

    const totalCount = total.length > 0 ? total[0].total : 0;

    // Calculer les informations de pagination
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// GET /api/notifications/unread - Récupérer le nombre de notifications non lues
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const unreadCount = await Project.aggregate([
      {
        $match: {
          'notifications.recipients.user': req.user.userId,
          'notifications.recipients.readAt': { $exists: false }
        }
      },
      {
        $unwind: '$notifications'
      },
      {
        $match: {
          'notifications.recipients.user': req.user.userId,
          'notifications.recipients.readAt': { $exists: false }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const count = unreadCount.length > 0 ? unreadCount[0].total : 0;

    res.json({
      success: true,
      data: { unreadCount: count }
    });

  } catch (error) {
    console.error('Erreur lors du comptage des notifications non lues:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
});

// PUT /api/notifications/:id/read - Marquer une notification comme lue
router.put('/:id/read', 
  authenticateToken, 
  logUserAction('mark_notification_read'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      // Trouver le projet contenant la notification
      const project = await Project.findOne({
        'notifications._id': id,
        'notifications.recipients.user': userId
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      // Marquer la notification comme lue
      const notification = project.notifications.id(id);
      if (notification) {
        const recipient = notification.recipients.find(r => r.user.toString() === userId);
        if (recipient) {
          recipient.readAt = new Date();
          await project.save();
        }
      }

      res.json({
        success: true,
        message: 'Notification marquée comme lue'
      });

    } catch (error) {
      console.error('Erreur lors du marquage de la notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// PUT /api/notifications/read-all - Marquer toutes les notifications comme lues
router.put('/read-all', 
  authenticateToken, 
  logUserAction('mark_all_notifications_read'),
  async (req, res) => {
    try {
      const userId = req.user.userId;

      // Marquer toutes les notifications non lues comme lues
      const result = await Project.updateMany(
        {
          'notifications.recipients.user': userId,
          'notifications.recipients.readAt': { $exists: false }
        },
        {
          $set: {
            'notifications.$[].recipients.$[recipient].readAt': new Date()
          }
        },
        {
          arrayFilters: [
            { 'recipient.user': userId },
            { 'recipient.readAt': { $exists: false } }
          ]
        }
      );

      res.json({
        success: true,
        message: 'Toutes les notifications ont été marquées comme lues',
        data: { modifiedCount: result.modifiedCount }
      });

    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// POST /api/notifications - Créer une nouvelle notification (admin seulement)
router.post('/', 
  authenticateToken, 
  requirePermission('system_admin'),
  logUserAction('create_notification'),
  notificationValidation,
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
        title,
        message,
        recipients,
        priority = 'medium',
        metadata = {}
      } = req.body;

      // Vérifier que tous les destinataires existent
      const existingUsers = await User.find({
        _id: { $in: recipients }
      }).select('_id username firstName lastName');

      if (existingUsers.length !== recipients.length) {
        return res.status(400).json({
          success: false,
          message: 'Certains destinataires n\'existent pas'
        });
      }

      // Créer la notification
      const notification = {
        type,
        title,
        message,
        priority,
        metadata,
        recipients: recipients.map(userId => ({
          user: userId,
          sentAt: new Date()
        }))
      };

      // Ajouter la notification à tous les projets (ou créer un projet système)
      // Pour simplifier, on ajoute à un projet système
      let systemProject = await Project.findOne({ title: 'Système - Notifications' });
      
      if (!systemProject) {
        systemProject = new Project({
          title: 'Système - Notifications',
          description: 'Projet système pour les notifications globales',
          category: 'Autres',
          region: 'Système',
          submittedBy: req.user.userId,
          submittedByEntity: 'Système',
          status: 'completed',
          budget: { requested: 0, approved: 0, spent: 0 }
        });
      }

      systemProject.notifications.push(notification);
      await systemProject.save();

      // Émettre des événements Socket.IO pour les notifications en temps réel
      const io = req.app.get('io');
      if (io) {
        recipients.forEach(userId => {
          io.to(`user_${userId}`).emit('new_notification', {
            id: notification._id,
            type,
            title,
            message,
            priority,
            metadata,
            createdAt: notification.createdAt
          });
        });
      }

      res.status(201).json({
        success: true,
        message: 'Notification créée avec succès',
        data: { notification }
      });

    } catch (error) {
      console.error('Erreur lors de la création de la notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// DELETE /api/notifications/:id - Supprimer une notification (admin seulement)
router.delete('/:id', 
  authenticateToken, 
  requirePermission('system_admin'),
  logUserAction('delete_notification'),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Trouver et supprimer la notification
      const result = await Project.updateMany(
        { 'notifications._id': id },
        { $pull: { notifications: { _id: id } } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Notification supprimée avec succès'
      });

    } catch (error) {
      console.error('Erreur lors de la suppression de la notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  }
);

// GET /api/notifications/stats - Statistiques des notifications (admin seulement)
router.get('/stats/overview', 
  authenticateToken, 
  requirePermission('system_admin'),
  async (req, res) => {
    try {
      // Statistiques globales
      const totalNotifications = await Project.aggregate([
        {
          $unwind: '$notifications'
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 }
          }
        }
      ]);

      const totalCount = totalNotifications.length > 0 ? totalNotifications[0].count : 0;

      // Statistiques par type
      const typeStats = await Project.aggregate([
        {
          $unwind: '$notifications'
        },
        {
          $group: {
            _id: '$notifications.type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par priorité
      const priorityStats = await Project.aggregate([
        {
          $unwind: '$notifications'
        },
        {
          $group: {
            _id: '$notifications.priority',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Statistiques par jour (7 derniers jours)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const dailyStats = await Project.aggregate([
        {
          $unwind: '$notifications'
        },
        {
          $match: {
            'notifications.createdAt': { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$notifications.createdAt'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Notifications non lues par utilisateur
      const unreadByUser = await Project.aggregate([
        {
          $unwind: '$notifications'
        },
        {
          $unwind: '$notifications.recipients'
        },
        {
          $match: {
            'notifications.recipients.readAt': { $exists: false }
          }
        },
        {
          $group: {
            _id: '$notifications.recipients.user',
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            user: {
              username: 1,
              firstName: 1,
              lastName: 1,
              entity: 1
            },
            count: 1
          }
        },
        { $sort: { count: -1 } }
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalNotifications: totalCount
          },
          byType: typeStats,
          byPriority: priorityStats,
          daily: dailyStats,
          unreadByUser
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

// Fonction utilitaire pour créer des notifications automatiques
async function createAutomaticNotification(type, title, message, recipients, metadata = {}) {
  try {
    // Créer la notification
    const notification = {
      type,
      title,
      message,
      priority: 'medium',
      metadata,
      recipients: recipients.map(userId => ({
        user: userId,
        sentAt: new Date()
      }))
    };

    // Ajouter à un projet système
    let systemProject = await Project.findOne({ title: 'Système - Notifications' });
    
    if (!systemProject) {
      systemProject = new Project({
        title: 'Système - Notifications',
        description: 'Projet système pour les notifications automatiques',
        category: 'Autres',
        region: 'Système',
        submittedBy: null, // Système
        submittedByEntity: 'Système',
        status: 'completed',
        budget: { requested: 0, approved: 0, spent: 0 }
      });
    }

    systemProject.notifications.push(notification);
    await systemProject.save();

    // Émettre des événements Socket.IO
    const io = require('../server').io;
    if (io) {
      recipients.forEach(userId => {
        io.to(`user_${userId}`).emit('new_notification', {
          id: notification._id,
          type,
          title,
          message,
          priority: notification.priority,
          metadata,
          createdAt: notification.createdAt
        });
      });
    }

    return notification;
  } catch (error) {
    console.error('Erreur lors de la création automatique de notification:', error);
    return null;
  }
}

// Exporter la fonction pour utilisation dans d'autres modules
module.exports = {
  router,
  createAutomaticNotification
};
