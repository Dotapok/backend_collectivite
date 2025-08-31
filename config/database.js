const mongoose = require('mongoose');

/**
 * Configuration de la base de données MongoDB
 */
const databaseConfig = {
  // Options de connexion MongoDB
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10, // Nombre maximum de connexions dans le pool
    serverSelectionTimeoutMS: 5000, // Timeout pour la sélection du serveur
    socketTimeoutMS: 45000, // Timeout pour les opérations socket
    bufferMaxEntries: 0, // Désactiver le buffering
    bufferCommands: false, // Désactiver le buffering des commandes
    autoIndex: process.env.NODE_ENV === 'development', // Index automatiques en développement seulement
    autoCreate: process.env.NODE_ENV === 'development' // Création automatique des collections en développement
  },

  // Options de retry
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
    retryDelayMultiplier: 2
  },

  // Options de monitoring
  monitoring: {
    enabled: process.env.NODE_ENV === 'production',
    logQueries: process.env.NODE_ENV === 'development',
    logSlowQueries: true,
    slowQueryThreshold: 100 // ms
  }
};

/**
 * Établir la connexion MongoDB
 */
async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI non définie dans les variables d\'environnement');
    }

    console.log('🔌 Connexion à MongoDB...');
    
    // Établir la connexion
    await mongoose.connect(mongoUri, databaseConfig.options);
    
    console.log('✅ Connexion MongoDB établie avec succès');
    console.log(`   Base de données: ${mongoose.connection.name}`);
    console.log(`   Hôte: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port}`);
    
    // Configuration des événements de connexion
    setupConnectionEvents();
    
    return mongoose.connection;
    
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    throw error;
  }
}

/**
 * Configurer les événements de connexion MongoDB
 */
function setupConnectionEvents() {
  const connection = mongoose.connection;
  
  // Connexion établie
  connection.on('connected', () => {
    console.log('🟢 MongoDB connecté');
  });
  
  // Connexion perdue
  connection.on('disconnected', () => {
    console.log('🔴 MongoDB déconnecté');
  });
  
  // Erreur de connexion
  connection.on('error', (error) => {
    console.error('❌ Erreur MongoDB:', error);
  });
  
  // Reconnexion
  connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconnecté');
  });
  
  // Fermeture de l'application
  process.on('SIGINT', async () => {
    try {
      await connection.close();
      console.log('🔌 Connexion MongoDB fermée');
      process.exit(0);
    } catch (error) {
      console.error('❌ Erreur lors de la fermeture MongoDB:', error);
      process.exit(1);
    }
  });
  
  // Gestion des erreurs non capturées
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesse rejetée non gérée:', reason);
    if (reason.name === 'MongoError' || reason.name === 'MongooseError') {
      console.error('   Erreur MongoDB détectée, vérifiez la connexion');
    }
  });
}

/**
 * Fermer la connexion MongoDB
 */
async function disconnectDatabase() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Connexion MongoDB fermée');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la fermeture MongoDB:', error);
    throw error;
  }
}

/**
 * Vérifier l'état de la connexion
 */
function getConnectionStatus() {
  const connection = mongoose.connection;
  
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  return {
    readyState: connection.readyState,
    status: states[connection.readyState] || 'unknown',
    name: connection.name,
    host: connection.host,
    port: connection.port,
    isConnected: connection.readyState === 1
  };
}

/**
 * Obtenir les statistiques de la base de données
 */
async function getDatabaseStats() {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Base de données non connectée');
    }
    
    const adminDb = mongoose.connection.db.admin();
    const stats = await adminDb.serverStatus();
    
    return {
      version: stats.version,
      uptime: stats.uptime,
      connections: {
        current: stats.connections.current,
        available: stats.connections.available,
        totalCreated: stats.connections.totalCreated
      },
      memory: {
        resident: Math.round(stats.mem.resident / 1024 / 1024) + ' MB',
        virtual: Math.round(stats.mem.virtual / 1024 / 1024) + ' MB',
        mapped: Math.round(stats.mem.mapped / 1024 / 1024) + ' MB'
      },
      operations: {
        insert: stats.opcounters.insert,
        query: stats.opcounters.query,
        update: stats.opcounters.update,
        delete: stats.opcounters.delete
      }
    };
    
  } catch (error) {
    console.error('Erreur lors de la récupération des stats MongoDB:', error);
    return null;
  }
}

/**
 * Nettoyer les connexions inactives
 */
async function cleanupConnections() {
  try {
    if (mongoose.connection.readyState === 1) {
      // Forcer la fermeture des connexions inactives
      await mongoose.connection.db.admin().command({ ping: 1 });
      console.log('🧹 Connexions MongoDB nettoyées');
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage des connexions:', error);
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getConnectionStatus,
  getDatabaseStats,
  cleanupConnections,
  config: databaseConfig
};
