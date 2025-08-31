#!/usr/bin/env node

/**
 * Script de test pour vérifier la configuration du backend
 * Vérifie que tous les composants peuvent être importés correctement
 */

console.log('🧪 Test de configuration du backend DTC EKANI...\n');

// Test 1: Variables d'environnement
console.log('1️⃣ Vérification des variables d\'environnement...');
try {
  require('dotenv').config();
  
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];
  const missingVars = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
      console.log(`   ❌ ${varName} manquant`);
    } else {
      console.log(`   ✅ ${varName} configuré`);
    }
  });
  
  if (missingVars.length > 0) {
    console.log(`\n⚠️  Variables manquantes: ${missingVars.join(', ')}`);
    console.log('   Créer un fichier .env basé sur env.example');
  } else {
    console.log('   ✅ Toutes les variables requises sont configurées');
  }
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 2: Modèles
console.log('\n2️⃣ Test des modèles...');
try {
  const User = require('./models/User');
  console.log('   ✅ Modèle User importé');
  
  const Project = require('./models/Project');
  console.log('   ✅ Modèle Project importé');
  
  const Transaction = require('./models/Transaction');
  console.log('   ✅ Modèle Transaction importé');
  
  const Evaluation = require('./models/Evaluation');
  console.log('   ✅ Modèle Evaluation importé');
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 3: Middleware
console.log('\n3️⃣ Test des middlewares...');
try {
  const auth = require('./middleware/auth');
  console.log('   ✅ Middleware auth importé');
  
  const upload = require('./middleware/upload');
  console.log('   ✅ Middleware upload importé');
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 4: Utilitaires
console.log('\n4️⃣ Test des utilitaires...');
try {
  const blockchain = require('./utils/blockchain');
  console.log('   ✅ Utilitaires blockchain importés');
  
  const dbConfig = require('./config/database');
  console.log('   ✅ Configuration base de données importée');
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 5: Routes
console.log('\n5️⃣ Test des routes...');
try {
  const authRoutes = require('./routes/auth');
  console.log('   ✅ Routes auth importées');
  
  const projectRoutes = require('./routes/projects');
  console.log('   ✅ Routes projects importées');
  
  const transactionRoutes = require('./routes/transactions');
  console.log('   ✅ Routes transactions importées');
  
  const evaluationRoutes = require('./routes/evaluations');
  console.log('   ✅ Routes evaluations importées');
  
  const userRoutes = require('./routes/users');
  console.log('   ✅ Routes users importées');
  
  const notificationRoutes = require('./routes/notifications');
  console.log('   ✅ Routes notifications importées');
  
  const statsRoutes = require('./routes/stats');
  console.log('   ✅ Routes stats importées');
  
  const healthRoutes = require('./routes/health');
  console.log('   ✅ Routes health importées');
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 6: Dépendances
console.log('\n6️⃣ Test des dépendances...');
try {
  const express = require('express');
  console.log('   ✅ Express importé');
  
  const mongoose = require('mongoose');
  console.log('   ✅ Mongoose importé');
  
  const socketIo = require('socket.io');
  console.log('   ✅ Socket.IO importé');
  
  const bcryptjs = require('bcryptjs');
  console.log('   ✅ bcryptjs importé');
  
  const jsonwebtoken = require('jsonwebtoken');
  console.log('   ✅ jsonwebtoken importé');
  
  const multer = require('multer');
  console.log('   ✅ multer importé');
  
  const { v4: uuidv4 } = require('uuid');
  console.log('   ✅ uuid importé');
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

// Test 7: Configuration
console.log('\n7️⃣ Test de la configuration...');
try {
  const packageJson = require('./package.json');
  console.log(`   ✅ package.json lu (version: ${packageJson.version})`);
  
  if (packageJson.scripts.start) {
    console.log(`   ✅ Script de démarrage: ${packageJson.scripts.start}`);
  }
  
  if (packageJson.scripts.dev) {
    console.log(`   ✅ Script de développement: ${packageJson.scripts.dev}`);
  }
  
  if (packageJson.scripts['init-db']) {
    console.log(`   ✅ Script d'initialisation DB: ${packageJson.scripts['init-db']}`);
  }
} catch (error) {
  console.log(`   ❌ Erreur: ${error.message}`);
}

console.log('\n🎯 Résumé des tests:');
console.log('   Si tous les tests sont passés (✅), le backend est prêt à être démarré.');
console.log('   Si des erreurs sont présentes (❌), vérifiez la configuration.');
console.log('\n🚀 Pour démarrer le backend:');
console.log('   npm run dev     - Mode développement');
console.log('   npm start       - Mode production');
console.log('   npm run init-db - Initialiser la base de données');
console.log('\n📚 Documentation: README.md');
