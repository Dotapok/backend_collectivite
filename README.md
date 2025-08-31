# DTC EKANI Backend

Backend Node.js/Express pour la plateforme DTC EKANI - Gestion Administrative des Projets Territoriaux au Cameroun.

## 🏗️ Architecture

Le backend est construit avec une architecture modulaire et scalable :

- **Express.js** : Framework web pour l'API REST
- **MongoDB** : Base de données NoSQL avec Mongoose ODM
- **Socket.IO** : Communication en temps réel
- **JWT** : Authentification sécurisée
- **PKI** : Infrastructure à clés publiques pour la sécurité
- **Blockchain** : Traçabilité et immutabilité des transactions

## 🚀 Installation et Configuration

### Prérequis

- Node.js >= 18.0.0
- MongoDB >= 6.0
- npm ou yarn

### Installation

1. **Cloner le projet**
```bash
git clone <repository-url>
cd dtc-ekani/backend
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration de l'environnement**
```bash
cp env.example .env
```

Éditer le fichier `.env` avec vos configurations :
```env
# Configuration du serveur
PORT=5000
NODE_ENV=development

# Configuration MongoDB
MONGODB_URI=mongodb://localhost:27017/dtc_ekani

# Configuration JWT
JWT_SECRET=votre_secret_jwt_tres_securise_ici
JWT_EXPIRES_IN=24h

# Configuration des fichiers
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760
```

4. **Initialiser la base de données**
```bash
npm run init-db
```

5. **Démarrer le serveur**
```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## 📊 Structure de la Base de Données

### Collections Principales

#### Users
- Authentification et autorisation
- Rôles : `ctd`, `minddevel`, `minfi`, `admin`
- Certificats PKI
- Permissions granulaires

#### Projects
- Gestion des projets territoriaux
- Workflow d'évaluation et validation
- Documents et pièces jointes
- Historique des modifications

#### Transactions
- Traçabilité blockchain
- Types : soumission, évaluation, approbation, etc.
- Métadonnées et références
- Confirmation et validation

### Index et Performance

La base de données est optimisée avec des index sur :
- Champs de recherche fréquents
- Relations entre collections
- Timestamps pour les requêtes temporelles
- Champs de tri et de filtrage

## 🔐 Authentification et Autorisation

### JWT (JSON Web Tokens)
- Tokens d'accès avec expiration
- Refresh tokens pour la sécurité
- Validation côté serveur

### Rôles et Permissions
- **CTD** : Création et gestion de projets
- **MINDDEVEL** : Évaluation des projets
- **MINFI** : Validation budgétaire et approbation
- **Admin** : Gestion complète du système

### PKI (Public Key Infrastructure)
- Certificats numériques pour les utilisateurs
- Signature des transactions
- Validation de l'identité

## 🌐 API REST

### Base URL
```
http://localhost:5000/api
```

### Endpoints Principaux

#### Authentification
```
POST   /auth/register          # Inscription
POST   /auth/login            # Connexion
GET    /auth/verify           # Vérification du token
POST   /auth/refresh          # Rafraîchissement du token
PUT    /auth/change-password  # Changement de mot de passe
GET    /auth/profile          # Profil utilisateur
PUT    /auth/profile          # Mise à jour du profil
```

#### Projets
```
GET    /projects              # Liste des projets
GET    /projects/:id          # Détails d'un projet
POST   /projects              # Créer un projet
PUT    /projects/:id          # Mettre à jour un projet
DELETE /projects/:id          # Supprimer un projet
```

#### Évaluations
```
GET    /evaluations           # Liste des évaluations
GET    /evaluations/pending   # Projets en attente
GET    /evaluations/my        # Mes évaluations
POST   /evaluations           # Créer une évaluation
PUT    /evaluations/:id       # Mettre à jour une évaluation
```

#### Transactions
```
GET    /transactions          # Liste des transactions
GET    /transactions/:id      # Détails d'une transaction
POST   /transactions          # Créer une transaction
PUT    /transactions/:id/confirm  # Confirmer une transaction
```

#### Utilisateurs
```
GET    /users                 # Liste des utilisateurs (admin)
GET    /users/:id             # Détails d'un utilisateur
PUT    /users/:id             # Mettre à jour un utilisateur
DELETE /users/:id             # Désactiver un utilisateur
```

#### Statistiques
```
GET    /stats/overview        # Vue d'ensemble
GET    /stats/projects        # Statistiques des projets
GET    /stats/transactions    # Statistiques des transactions
GET    /stats/users           # Statistiques des utilisateurs
GET    /stats/performance     # Métriques de performance
```

#### Notifications
```
GET    /notifications         # Mes notifications
GET    /notifications/unread/count  # Nombre de non lues
PUT    /notifications/:id/read      # Marquer comme lue
PUT    /notifications/read-all      # Marquer toutes comme lues
```

### Format des Réponses

Toutes les réponses suivent le format standard :
```json
{
  "success": true,
  "message": "Opération réussie",
  "data": {
    // Données de la réponse
  }
}
```

### Gestion des Erreurs

```json
{
  "success": false,
  "message": "Description de l'erreur",
  "errors": [
    {
      "field": "nom_du_champ",
      "message": "Message d'erreur spécifique"
    }
  ]
}
```

## 🔌 Socket.IO - Communication Temps Réel

### Événements Émis

- `project_evaluated` : Projet évalué
- `transaction_created` : Nouvelle transaction
- `transaction_confirmed` : Transaction confirmée
- `new_notification` : Nouvelle notification

### Connexion Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Écouter les événements
socket.on('project_evaluated', (data) => {
  console.log('Projet évalué:', data);
});

// Rejoindre une salle
socket.emit('join-room', 'user_123');
```

## 📁 Structure des Fichiers

```
backend/
├── config/           # Configuration de la base de données
├── middleware/       # Middleware d'authentification et validation
├── models/          # Modèles Mongoose
├── routes/          # Routes de l'API
├── scripts/         # Scripts utilitaires
├── server.js        # Point d'entrée principal
├── package.json     # Dépendances et scripts
└── README.md        # Documentation
```

## 🧪 Tests

### Tests Unitaires
```bash
npm test
```

### Tests d'Intégration
```bash
npm run test:integration
```

### Couverture de Code
```bash
npm run test:coverage
```

## 🚀 Déploiement

### Production
```bash
# Build de production
npm run build

# Démarrage en production
NODE_ENV=production npm start
```

### Docker
```bash
# Construire l'image
docker build -t dtc-ekani-backend .

# Lancer le conteneur
docker run -p 5000:5000 dtc-ekani-backend
```

### Variables d'Environnement de Production

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dtc_ekani
JWT_SECRET=secret_tres_securise_en_production
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX_REQUESTS=100
```

## 🔒 Sécurité

### Mesures Implémentées

- **Helmet** : Sécurisation des en-têtes HTTP
- **CORS** : Configuration des origines autorisées
- **Rate Limiting** : Protection contre les attaques par déni de service
- **Validation** : Validation des données d'entrée avec express-validator
- **Sanitisation** : Nettoyage des données utilisateur
- **PKI** : Certificats numériques pour l'authentification

### Bonnes Pratiques

- Mots de passe hashés avec bcrypt
- Tokens JWT avec expiration
- Validation des permissions à chaque requête
- Logging des actions utilisateur
- Gestion sécurisée des erreurs

## 📊 Monitoring et Logs

### Logs
- **Morgan** : Logs des requêtes HTTP
- **Console** : Logs d'application
- **Fichiers** : Logs persistants (optionnel)

### Métriques
- Temps de réponse des API
- Taux d'erreur
- Utilisation des ressources
- Performance de la base de données

## 🔧 Maintenance

### Sauvegarde de la Base de Données
```bash
# Sauvegarde MongoDB
mongodump --db dtc_ekani --out ./backups/

# Restauration
mongorestore --db dtc_ekani ./backups/dtc_ekani/
```

### Mise à Jour des Dépendances
```bash
# Vérifier les vulnérabilités
npm audit

# Mettre à jour les dépendances
npm update

# Mettre à jour vers les dernières versions
npm audit fix
```

## 📚 Documentation API

### Swagger/OpenAPI
La documentation interactive est disponible à :
```
http://localhost:5000/api-docs
```

### Postman Collection
Une collection Postman est disponible dans le dossier `docs/` pour tester l'API.

## 🤝 Contribution

### Standards de Code
- ESLint pour la qualité du code
- Prettier pour le formatage
- Tests unitaires obligatoires
- Documentation des nouvelles fonctionnalités

### Processus de Développement
1. Fork du projet
2. Création d'une branche feature
3. Développement et tests
4. Pull Request avec description détaillée
5. Review et merge

## 📞 Support

### Contact
- **Email** : support@dtc-ekani.cm
- **Documentation** : https://docs.dtc-ekani.cm
- **Issues** : GitHub Issues

### Communauté
- **Forum** : https://forum.dtc-ekani.cm
- **Discord** : https://discord.gg/dtc-ekani
- **Wiki** : https://wiki.dtc-ekani.cm

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🙏 Remerciements

- Ministère de la Décentralisation et du Développement Local (MINDDEVEL)
- Ministère des Finances (MINFI)
- Agence Nationale des TIC (ANTIC)
- Communauté des développeurs camerounais

---

**DTC EKANI** - Plateforme de Gestion Administrative des Projets Territoriaux  
*Développé avec ❤️ au Cameroun*
