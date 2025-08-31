/**
 * Configuration CORS pour DTC EKANI Backend
 * Gère les origines autorisées pour tous les environnements
 */

// Origines autorisées pour CORS
const allowedOrigins = [
  'http://localhost:3000',                    // Développement local
  'https://collectivite.up.railway.app',     // Frontend Railway
  'https://backendcollectivite.up.railway.app' // Backend Railway
];

// Configuration CORS pour Express
const corsOptions = {
  origin: function (origin, callback) {
    // Permettre les requêtes sans origine (comme les apps mobiles, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`🚫 Origine CORS bloquée: ${origin}`);
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 heures
};

// Configuration CORS pour Socket.IO
const socketCorsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
};

module.exports = {
  allowedOrigins,
  corsOptions,
  socketCorsOptions
};
