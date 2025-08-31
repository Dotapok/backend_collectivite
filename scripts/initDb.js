const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import des modèles
const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');

// Configuration de la connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:djnoJpkMyBZZoYbOgfLFMjGurMtjEdye@metro.proxy.rlwy.net:12298';

// Données d'initialisation
const initialUsers = [
  {
    username: 'admin',
    email: 'admin@dtc-ekani.cm',
    password: 'Admin@2024',
    firstName: 'Administrateur',
    lastName: 'Système',
    role: 'admin',
    entity: 'DTC EKANI',
    region: 'Cameroun',
    phone: '+237 222 000 000',
    address: 'Yaoundé, Cameroun',
    isActive: true,
    isVerified: true,
    permissions: [
      'create_project', 'edit_project', 'delete_project', 'evaluate_project',
      'approve_project', 'validate_budget', 'view_reports', 'manage_users', 'system_admin'
    ],
    metadata: {
      department: 'Administration',
      position: 'Administrateur Système',
      employeeId: 'ADMIN001'
    },
    certificateInfo: {
      serialNumber: 'CERT_ADMIN_001',
      status: 'valid',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 an
      issuer: 'ANTIC Cameroun'
    }
  },
  {
    username: 'ctd_user',
    email: 'ctd@example.cm',
    password: 'Ctd@2024',
    firstName: 'Jean',
    lastName: 'Dupont',
    role: 'ctd',
    entity: 'Commune de Yaoundé I',
    region: 'Centre',
    phone: '+237 222 111 111',
    address: 'Yaoundé I, Cameroun',
    isActive: true,
    isVerified: true,
    permissions: ['create_project', 'edit_project', 'delete_project', 'view_reports'],
    metadata: {
      department: 'Développement',
      position: 'Chef de Service',
      employeeId: 'CTD001'
    },
    certificateInfo: {
      serialNumber: 'CERT_CTD_001',
      status: 'valid',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      issuer: 'ANTIC Cameroun'
    }
  },
  {
    username: 'minddevel_user',
    email: 'minddevel@example.cm',
    password: 'Minddevel@2024',
    firstName: 'Marie',
    lastName: 'Martin',
    role: 'minddevel',
    entity: 'MINDDEVEL',
    region: 'Cameroun',
    phone: '+237 222 222 222',
    address: 'Yaoundé, Cameroun',
    isActive: true,
    isVerified: true,
    permissions: ['evaluate_project', 'view_reports'],
    metadata: {
      department: 'Évaluation',
      position: 'Évaluateur Principal',
      employeeId: 'MIND001'
    },
    certificateInfo: {
      serialNumber: 'CERT_MIND_001',
      status: 'valid',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      issuer: 'ANTIC Cameroun'
    }
  },
  {
    username: 'minfi_user',
    email: 'minfi@example.cm',
    password: 'Minfi@2024',
    firstName: 'Pierre',
    lastName: 'Durand',
    role: 'minfi',
    entity: 'MINFI',
    region: 'Cameroun',
    phone: '+237 222 333 333',
    address: 'Yaoundé, Cameroun',
    isActive: true,
    isVerified: true,
    permissions: ['approve_project', 'validate_budget', 'view_reports'],
    metadata: {
      department: 'Contrôle Budgétaire',
      position: 'Contrôleur Principal',
      employeeId: 'MINFI001'
    },
    certificateInfo: {
      serialNumber: 'CERT_MINFI_001',
      status: 'valid',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      issuer: 'ANTIC Cameroun'
    }
  }
];

const initialProjects = [
  {
    title: 'Construction d\'une école primaire à Yaoundé I',
    description: 'Construction d\'une école primaire moderne de 6 salles de classe avec bureau administratif, salle des enseignants et terrain de sport.',
    shortDescription: 'École primaire moderne à Yaoundé I',
    category: 'Éducation',
    subcategory: 'Infrastructure scolaire',
    region: 'Centre',
    department: 'Mfoundi',
    commune: 'Yaoundé I',
    coordinates: {
      latitude: 3.848033,
      longitude: 11.502075
    },
    budget: {
      requested: 45000000,
      approved: 0,
      spent: 0,
      currency: 'FCFA'
    },
    status: 'submitted',
    timeline: {
      submissionDate: new Date(),
      expectedCompletionDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    },
    submittedByEntity: 'Commune de Yaoundé I',
    objectives: [
      {
        description: 'Construire 6 salles de classe modernes',
        measurable: true,
        target: '6 salles',
        achieved: false
      },
      {
        description: 'Améliorer l\'accès à l\'éducation dans la zone',
        measurable: true,
        target: '300 élèves',
        achieved: false
      }
    ],
    beneficiaries: {
      estimatedCount: 300,
      description: 'Élèves du primaire et enseignants',
      type: ['students', 'teachers']
    },
    impact: {
      social: 'Amélioration de l\'accès à l\'éducation',
      economic: 'Création d\'emplois locaux',
      environmental: 'Bâtiment écologique avec panneaux solaires',
      longTerm: 'Développement durable de la communauté'
    },
    tags: ['éducation', 'infrastructure', 'développement durable'],
    priority: 'high'
  },
  {
    title: 'Amélioration du réseau d\'eau potable à Douala',
    description: 'Réhabilitation et extension du réseau d\'eau potable dans les quartiers populaires de Douala pour améliorer l\'accès à l\'eau potable.',
    shortDescription: 'Réseau d\'eau potable à Douala',
    category: 'Eau et Assainissement',
    subcategory: 'Distribution d\'eau',
    region: 'Littoral',
    department: 'Wouri',
    commune: 'Douala I',
    coordinates: {
      latitude: 4.051056,
      longitude: 9.767869
    },
    budget: {
      requested: 75000000,
      approved: 0,
      spent: 0,
      currency: 'FCFA'
    },
    status: 'draft',
    timeline: {
      expectedCompletionDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000)
    },
    submittedByEntity: 'Commune de Douala I',
    objectives: [
      {
        description: 'Réhabiliter 15 km de réseau d\'eau',
        measurable: true,
        target: '15 km',
        achieved: false
      },
      {
        description: 'Connecter 5000 ménages',
        measurable: true,
        target: '5000 ménages',
        achieved: false
      }
    ],
    beneficiaries: {
      estimatedCount: 25000,
      description: 'Ménages et commerces de Douala',
      type: ['households', 'businesses']
    },
    impact: {
      social: 'Amélioration de la santé publique',
      economic: 'Réduction des coûts de santé',
      environmental: 'Réduction de la pollution',
      longTerm: 'Développement urbain durable'
    },
    tags: ['eau', 'santé', 'infrastructure urbaine'],
    priority: 'critical'
  }
];

const initialTransactions = [
  {
    transactionId: 'TX_001',
    type: 'project_submission',
    blockchain: {
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      blockNumber: 1000001,
      timestamp: new Date(),
      nonce: 12345,
      difficulty: 4,
      merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    },
    signature: {
      signedBy: null, // Sera rempli après création des utilisateurs
      signatureHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
      publicKey: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      certificateSerial: 'CERT_CTD_001',
      signatureTimestamp: new Date()
    },
    data: {
      amount: 45000000,
      description: 'Soumission du projet: Construction d\'une école primaire',
      metadata: {
        projectTitle: 'Construction d\'une école primaire à Yaoundé I',
        category: 'Éducation',
        region: 'Centre'
      }
    },
    status: 'confirmed',
    confirmation: {
      confirmations: 6,
      confirmedAt: new Date(),
      confirmedBy: []
    },
    gas: {
      gasUsed: 21000,
      gasPrice: '20000000000',
      gasLimit: 21000,
      gasCost: 0.00042
    },
    addresses: {
      from: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
    },
    network: {
      chainId: 1,
      networkName: 'Ethereum Mainnet',
      rpcUrl: 'https://mainnet.infura.io/v3/your-project-id'
    },
    typeSpecificData: {
      project: {
        fileName: 'projet_ecole.pdf',
        fileSize: 2048576,
        mimeType: 'application/pdf',
        documentType: 'projet'
      }
    },
    tags: ['projet', 'éducation', 'soumission'],
    priority: 'high'
  }
];

// Fonction principale d'initialisation
async function initializeDatabase() {
  try {
    console.log('🚀 Initialisation de la base de données DTC EKANI...');
    
    // Connexion à MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connexion MongoDB établie');
    
    // Vérifier si la base est déjà initialisée
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log(`ℹ️  ${existingUsers} utilisateur(s) existent déjà, pas d'initialisation nécessaire`);
      return;
    }
    
    console.log('📝 Base vide, initialisation en cours...');
    
    // Créer les utilisateurs
    console.log('👥 Création des utilisateurs...');
    const createdUsers = [];
    for (const userData of initialUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`✅ Utilisateur créé: ${user.username} (${user.role})`);
    }
    
    // Créer les projets
    console.log('📋 Création des projets...');
    const createdProjects = [];
    for (const projectData of initialProjects) {
      // Assigner un utilisateur CTD comme soumissionnaire
      const ctdUser = createdUsers.find(u => u.role === 'ctd');
      if (ctdUser) {
        projectData.submittedBy = ctdUser._id;
      }
      
      const project = new Project(projectData);
      await project.save();
      createdProjects.push(project);
      console.log(`✅ Projet créé: ${project.title}`);
    }
    
    // Créer les transactions
    console.log('🔗 Création des transactions...');
    for (const transactionData of initialTransactions) {
      // Assigner un utilisateur comme signataire
      const ctdUser = createdUsers.find(u => u.role === 'ctd');
      if (ctdUser) {
        transactionData.signature.signedBy = ctdUser._id;
        transactionData.references = {
          projectId: createdProjects[0]._id,
          userId: ctdUser._id
        };
      }
      
      const transaction = new Transaction(transactionData);
      await transaction.save();
      console.log(`✅ Transaction créée: ${transaction.transactionId}`);
    }
    
    // Créer les index pour optimiser les performances
    console.log('📊 Création des index...');
    await createIndexes();
    console.log('✅ Index créés');
    
    // Créer un projet système pour les notifications
    console.log('🔔 Création du projet système pour notifications...');
    const systemProject = new Project({
      title: 'Système - Notifications',
      description: 'Projet système pour les notifications globales et automatiques',
      category: 'Autres',
      region: 'Système',
      submittedBy: createdUsers.find(u => u.role === 'admin')._id,
      submittedByEntity: 'Système',
      status: 'completed',
      budget: { requested: 0, approved: 0, spent: 0, currency: 'FCFA' },
      objectives: [
        {
          description: 'Gérer les notifications système',
          measurable: false,
          target: 'N/A',
          achieved: true
        }
      ],
      beneficiaries: {
        estimatedCount: 0,
        description: 'Utilisateurs du système',
        type: ['system']
      },
      impact: {
        social: 'Amélioration de la communication',
        economic: 'Optimisation des processus',
        environmental: 'Réduction du papier',
        longTerm: 'Système de communication durable'
      },
      tags: ['système', 'notifications'],
      priority: 'low'
    });
    
    await systemProject.save();
    console.log('✅ Projet système créé');
    
    console.log('\n🎉 Initialisation de la base de données terminée avec succès!');
    console.log('\n📊 Résumé:');
    console.log(`   👥 Utilisateurs: ${createdUsers.length}`);
    console.log(`   📋 Projets: ${createdProjects.length}`);
    console.log(`   🔗 Transactions: ${initialTransactions.length}`);
    console.log(`   🔔 Projet système: 1`);
    
    console.log('\n🔑 Comptes de test:');
    console.log('   Admin: admin / Admin@2024');
    console.log('   CTD: ctd_user / Ctd@2024');
    console.log('   MINDDEVEL: minddevel_user / Minddevel@2024');
    console.log('   MINFI: minfi_user / Minfi@2024');
    
    console.log('\n🌐 URL de l\'API: http://localhost:5000/api');
    console.log('📚 Documentation: http://localhost:5000/api/health');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Connexion MongoDB fermée');
  }
}

// Fonction pour créer les index
async function createIndexes() {
  try {
    // Index pour les utilisateurs
    await User.collection.createIndex({ username: 1 }, { unique: true });
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ entity: 1 });
    await User.collection.createIndex({ region: 1 });
    await User.collection.createIndex({ 'certificateInfo.status': 1 });
    
    // Index pour les projets
    await Project.collection.createIndex({ title: 'text', description: 'text' });
    await Project.collection.createIndex({ status: 1 });
    await Project.collection.createIndex({ category: 1 });
    await Project.collection.createIndex({ region: 1 });
    await Project.collection.createIndex({ submittedBy: 1 });
    await Project.collection.createIndex({ 'evaluation.evaluator': 1 });
    await Project.collection.createIndex({ 'timeline.submissionDate': -1 });
    await Project.collection.createIndex({ 'budget.requested': -1 });
    await Project.collection.createIndex({ 'evaluation.score': -1 });
    
    // Index pour les transactions
    await Transaction.collection.createIndex({ transactionId: 1 }, { unique: true });
    await Transaction.collection.createIndex({ 'blockchain.hash': 1 }, { unique: true });
    await Transaction.collection.createIndex({ 'blockchain.blockNumber': -1 });
    await Transaction.collection.createIndex({ type: 1 });
    await Transaction.collection.createIndex({ status: 1 });
    await Transaction.collection.createIndex({ 'signature.signedBy': 1 });
    await Transaction.collection.createIndex({ 'references.projectId': 1 });
    await Transaction.collection.createIndex({ 'blockchain.timestamp': -1 });
    await Transaction.collection.createIndex({ 'confirmation.confirmations': 1 });
    await Transaction.collection.createIndex({ 'gas.gasUsed': -1 });
    
    console.log('✅ Tous les index ont été créés');
  } catch (error) {
    console.error('❌ Erreur lors de la création des index:', error);
    throw error;
  }
}

// Exécuter l'initialisation si le script est appelé directement
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase, createIndexes };
