const express = require('express');
const mongoose = require('mongoose');
const blockchainUtils = require('../utils/blockchain');

const router = express.Router();

// GET /api/health - Vérification de l'état du serveur
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    };

    // Vérifier la connexion MongoDB
    try {
      if (mongoose.connection.readyState === 1) {
        health.database = {
          status: 'connected',
          name: mongoose.connection.name,
          host: mongoose.connection.host,
          port: mongoose.connection.port
        };
      } else {
        health.database = {
          status: 'disconnected',
          readyState: mongoose.connection.readyState
        };
        health.status = 'degraded';
      }
    } catch (error) {
      health.database = {
        status: 'error',
        error: error.message
      };
      health.status = 'unhealthy';
    }

    // Vérifier la blockchain
    try {
      const blockchainStats = blockchainUtils.getBlockchainStats();
      health.blockchain = {
        status: 'operational',
        totalBlocks: blockchainStats.totalBlocks,
        totalTransactions: blockchainStats.totalTransactions,
        pendingTransactions: blockchainStats.pendingTransactions,
        chainIntegrity: blockchainStats.chainIntegrity
      };
    } catch (error) {
      health.blockchain = {
        status: 'error',
        error: error.message
      };
      health.status = 'unhealthy';
    }

    // Vérifier la mémoire
    const memUsage = process.memoryUsage();
    health.memory = {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
    };

    // Vérifier le CPU
    const cpuUsage = process.cpuUsage();
    health.cpu = {
      user: Math.round(cpuUsage.user / 1000) + ' ms',
      system: Math.round(cpuUsage.system / 1000) + ' ms'
    };

    // Déterminer le code de statut HTTP
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: true,
      data: health
    });

  } catch (error) {
    console.error('Erreur lors de la vérification de santé:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Erreur lors de la vérification de santé',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/health/ready - Vérification de la disponibilité
router.get('/ready', async (req, res) => {
  try {
    // Vérifier que MongoDB est connecté
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        status: 'not_ready',
        message: 'Base de données non connectée',
        timestamp: new Date().toISOString()
      });
    }

    // Vérifier que la blockchain est opérationnelle
    try {
      const blockchainStats = blockchainUtils.getBlockchainStats();
      if (!blockchainStats.chainIntegrity) {
        return res.status(503).json({
          success: false,
          status: 'not_ready',
          message: 'Blockchain corrompue',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      return res.status(503).json({
        success: false,
        status: 'not_ready',
        message: 'Blockchain non opérationnelle',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      status: 'ready',
      message: 'Service prêt à recevoir des requêtes',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erreur lors de la vérification de disponibilité:', error);
    res.status(503).json({
      success: false,
      status: 'not_ready',
      message: 'Erreur lors de la vérification de disponibilité',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/health/live - Vérification de la vitalité
router.get('/live', (req, res) => {
  res.json({
    success: true,
    status: 'alive',
    message: 'Service en vie',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
