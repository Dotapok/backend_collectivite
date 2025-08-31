const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
idgets de testconst server = http.createServer(app);

// Import de la configuration CORS
const { corsOptions, socketCorsOptions } = require('./config/cors');

// Configuration Socket.IO
const io = socketIo(server, socketCorsOptions);

// Middleware de sécurité et performance
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Configuration CORS
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limite chaque IP à 100 requêtes par fenêtre
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.'
});
app.use('/api/', limiter);

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import de la configuration de la base de données
const { connectDatabase } = require('./config/database');

// Connexion MongoDB
connectDatabase()
  .then(() => {
    console.log('🚀 Serveur prêt à démarrer');
  })
  .catch((err) => {
    console.error('❌ Erreur de connexion MongoDB:', err);
    process.exit(1);
  });

// Import des routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const transactionRoutes = require('./routes/transactions');
const userRoutes = require('./routes/users');
const evaluationRoutes = require('./routes/evaluations');
const { router: notificationRoutes } = require('./routes/notifications');
const statsRoutes = require('./routes/stats');

// Utilisation des routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/health', require('./routes/health'));



// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Nouvelle connexion Socket.IO: ${socket.id}`);

  // Rejoindre une salle spécifique (par utilisateur ou projet)
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`👥 Socket ${socket.id} a rejoint la salle: ${room}`);
  });

  // Quitter une salle
  socket.on('leave-room', (room) => {
    socket.leave(room);
    console.log(`👋 Socket ${socket.id} a quitté la salle: ${room}`);
  });

  // Gestion de la déconnexion
  socket.on('disconnect', () => {
    console.log(`🔌 Déconnexion Socket.IO: ${socket.id}`);
  });
});

// Export de l'instance Socket.IO pour utilisation dans les routes
app.set('io', io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Serveur DTC EKANI démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.NODE_ENV === 'production') {
    // En production, utiliser l'URL Railway
    const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 'https://backendcollectivite.up.railway.app';
    console.log(`📊 API disponible sur: ${railwayUrl}/api`);
    console.log(`🔌 Socket.IO actif sur: ${railwayUrl}`);
  } else {
    // En développement local
    console.log(`📊 API disponible sur: http://localhost:${PORT}/api`);
    console.log(`🔌 Socket.IO actif sur: http://localhost:${PORT}`);
  }
});

// Gestion gracieuse de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 Signal SIGTERM reçu, arrêt gracieux...');
  server.close(() => {
    console.log('✅ Serveur fermé');
    mongoose.connection.close(false, () => {
      console.log('✅ Connexion MongoDB fermée');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Signal SIGINT reçu, arrêt gracieux...');
  server.close(() => {
    console.log('✅ Serveur fermé');
    mongoose.connection.close(false, () => {
      console.log('✅ Connexion MongoDB fermée');
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };
