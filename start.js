#!/usr/bin/env node

/**
 * Script de démarrage pour le backend DTC EKANI
 * Vérifie la configuration et démarre le serveur
 */

const fs = require('fs');
const path = require('path');

// Charger dotenv seulement en développement local
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Fonction pour afficher un message coloré
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Fonction pour vérifier les variables d'environnement requises
function checkEnvironment() {
  log('\n🔍 Vérification de l\'environnement...', 'cyan');
  
  const requiredVars = [
    'MONGODB_URI',
    'JWT_SECRET'
  ];
  
  const missingVars = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
      log(`❌ ${varName} manquant`, 'red');
    } else {
      log(`✅ ${varName} configuré`, 'green');
    }
  });
  
  if (missingVars.length > 0) {
    log('\n⚠️  Variables d\'environnement manquantes!', 'yellow');
    
    if (process.env.NODE_ENV === 'production') {
      log('🔧 En production, configurez ces variables dans Railway:', 'yellow');
      log('   - Allez dans votre projet Railway', 'cyan');
      log('   - Variables d\'environnement', 'cyan');
      log('   - Ajoutez MONGODB_URI et JWT_SECRET', 'cyan');
    } else {
      log('Créer un fichier .env basé sur env.example', 'yellow');
      log('Exemple:', 'yellow');
      log('MONGODB_URI=mongodb://localhost:27017/dtc_ekani', 'cyan');
      log('JWT_SECRET=votre_secret_jwt_tres_securise_ici', 'cyan');
    }
    
    log('\n', 'reset');
    return false;
  }
  
  log('✅ Environnement configuré correctement', 'green');
  return true;
}

// Fonction pour vérifier la connexion MongoDB
async function checkMongoDB() {
  log('\n🗄️  Vérification de la connexion MongoDB...', 'cyan');
  
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    
    log('✅ Connexion MongoDB réussie', 'green');
    await mongoose.disconnect();
    return true;
  } catch (error) {
    log('❌ Erreur de connexion MongoDB:', 'red');
    log(`   ${error.message}`, 'red');
    log('\n💡 Solutions possibles:', 'yellow');
    log('   1. Démarrer MongoDB localement', 'cyan');
    log('   2. Vérifier l\'URL de connexion', 'cyan');
    log('   3. Vérifier les permissions réseau', 'cyan');
    log('\n', 'reset');
    return false;
  }
}

// Fonction pour initialiser la base de données
async function initializeDatabase() {
  try {
    log('   📝 Import du script d\'initialisation...', 'cyan');
    
    // Utiliser le script existant
    const { initializeDatabase: initDb } = require('./scripts/initDb');
    
    // Vérifier si des utilisateurs existent déjà
    const mongoose = require('mongoose');
    const User = require('./models/User');
    
    await mongoose.connect(process.env.MONGODB_URI);
    const userCount = await User.countDocuments();
    await mongoose.disconnect();
    
    if (userCount === 0) {
      log('   🗄️  Base vide, initialisation complète...', 'cyan');
      await initDb();
      log('   ✅ Base de données initialisée avec succès', 'green');
    } else {
      log(`   ℹ️  ${userCount} utilisateur(s) existent déjà, pas d'initialisation nécessaire`, 'cyan');
    }
    
  } catch (error) {
    log('❌ Erreur lors de l\'initialisation de la base de données:', 'red');
    log(`   ${error.message}`, 'red');
    throw error;
  }
}

// Fonction pour afficher les informations de démarrage
function showStartupInfo() {
  log('\n🚀 DTC EKANI Backend', 'bright');
  log('================================', 'blue');
  
  log('\n📋 Informations:', 'cyan');
  log(`   Port: ${process.env.PORT || 5000}`, 'white');
  log(`   Environnement: ${process.env.NODE_ENV || 'development'}`, 'white');
  log(`   Base de données: ${process.env.MONGODB_URI}`, 'white');
  
  if (process.env.NODE_ENV === 'production') {
    const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 'https://backendcollectivite.up.railway.app';
    log(`   URL publique: ${railwayUrl}`, 'white');
  }
  
  log('\n🔗 URLs:', 'cyan');
  
  if (process.env.NODE_ENV === 'production') {
    // En production, utiliser l'URL Railway
    const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 'https://backendcollectivite.up.railway.app';
    log(`   API: ${railwayUrl}/api`, 'white');
    log(`   Santé: ${railwayUrl}/api/health`, 'white');
    log(`   Socket.IO: ${railwayUrl}`, 'white');
  } else {
    // En développement local
    log(`   API: http://localhost:${process.env.PORT || 5000}/api`, 'white');
    log(`   Santé: http://localhost:${process.env.PORT || 5000}/api/health`, 'white');
    log(`   Socket.IO: http://localhost:${process.env.PORT || 5000}`, 'white');
  }
  
  log('\n📚 Commandes utiles:', 'cyan');
  log('   npm run dev          - Mode développement', 'white');
  log('   npm start            - Mode production', 'white');
  log('   npm run init-db      - Initialiser la base de données', 'white');
  log('   npm test             - Lancer les tests', 'white');
  
  log('\n🔑 Comptes de test (après init-db):', 'cyan');
  log('   Admin: admin / Admin@2024', 'white');
  log('   CTD: ctd_user / Ctd@2024', 'white');
  log('   MINDDEVEL: minddevel_user / Minddevel@2024', 'white');
  log('   MINFI: minfi_user / Minfi@2024', 'white');
  
  log('\n', 'reset');
}

// Fonction principale
async function main() {
  try {
    showStartupInfo();
    
    // Vérifier l'environnement
    if (!checkEnvironment()) {
      process.exit(1);
    }
    
    // Vérifier MongoDB
    if (!await checkMongoDB()) {
      process.exit(1);
    }
    
    // Initialiser la base de données si nécessaire
    if (process.env.NODE_ENV === 'production' || process.env.AUTO_INIT_DB === 'true') {
      log('🗄️  Initialisation automatique de la base de données...', 'cyan');
      try {
        await initializeDatabase();
        log('✅ Base de données initialisée avec succès', 'green');
      } catch (error) {
        log('⚠️  Erreur lors de l\'initialisation de la BD:', 'yellow');
        log(`   ${error.message}`, 'yellow');
        // Continuer le démarrage même si l'init échoue
      }
    }
    
    log('✅ Toutes les vérifications sont passées!', 'green');
    log('🚀 Démarrage du serveur...', 'bright');
    
    // Importer et démarrer le serveur
    const { server } = require('./server');
    
    // Gestion des erreurs non capturées
    process.on('uncaughtException', (error) => {
      log('\n❌ Erreur non capturée:', 'red');
      log(error.stack, 'red');
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      log('\n❌ Promesse rejetée non gérée:', 'red');
      log(`Raison: ${reason}`, 'red');
      process.exit(1);
    });
    
  } catch (error) {
    log('\n❌ Erreur lors du démarrage:', 'red');
    log(error.stack, 'red');
    process.exit(1);
  }
}

// Exécuter le script principal
if (require.main === module) {
  main();
}

module.exports = { main, checkEnvironment, checkMongoDB };
