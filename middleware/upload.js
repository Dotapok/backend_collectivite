const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Configuration des types de fichiers autorisés
const ALLOWED_FILE_TYPES = {
  // Documents administratifs
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  
  // Images
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  
  // Archives
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  
  // Textes
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/html': '.html'
};

// Configuration des tailles maximales par type de fichier
const MAX_FILE_SIZES = {
  'image': 5 * 1024 * 1024, // 5MB pour les images
  'document': 10 * 1024 * 1024, // 10MB pour les documents
  'archive': 50 * 1024 * 1024, // 50MB pour les archives
  'default': 5 * 1024 * 1024 // 5MB par défaut
};

// Fonction pour déterminer la catégorie de fichier
function getFileCategory(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('application/') || mimetype.startsWith('text/')) return 'document';
  if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('7z')) return 'archive';
  return 'default';
}

// Fonction pour obtenir la taille maximale autorisée
function getMaxFileSize(mimetype) {
  const category = getFileCategory(mimetype);
  return MAX_FILE_SIZES[category] || MAX_FILE_SIZES.default;
}

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Créer le dossier de destination basé sur le type de fichier et la date
    const category = getFileCategory(file.mimetype);
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    const uploadPath = path.join(__dirname, '..', 'uploads', category, String(year), month);
    
    // Créer le dossier s'il n'existe pas
    fs.mkdirSync(uploadPath, { recursive: true });
    
    cb(null, uploadPath);
  },
  
  filename: (req, file, cb) => {
    // Générer un nom de fichier unique
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const extension = path.extname(file.originalname) || ALLOWED_FILE_TYPES[file.mimetype] || '';
    
    // Nettoyer le nom original du fichier
    const cleanName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
    
    const filename = `${cleanName}_${timestamp}_${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

// Filtre des fichiers
const fileFilter = (req, file, cb) => {
  // Vérifier le type MIME
  if (!ALLOWED_FILE_TYPES[file.mimetype]) {
    return cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
  
  // Vérifier la taille du fichier
  const maxSize = getMaxFileSize(file.mimetype);
  if (file.size && file.size > maxSize) {
    return cb(new Error(`Fichier trop volumineux. Taille maximale: ${Math.round(maxSize / (1024 * 1024))}MB`), false);
  }
  
  // Vérifier l'extension du fichier
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedExt = ALLOWED_FILE_TYPES[file.mimetype];
  
  if (expectedExt && ext !== expectedExt.toLowerCase()) {
    return cb(new Error(`Extension de fichier invalide. Attendu: ${expectedExt}, Reçu: ${ext}`), false);
  }
  
  // Fichier accepté
  cb(null, true);
};

// Configuration de multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: Math.max(...Object.values(MAX_FILE_SIZES)), // Plus grande taille maximale
    files: 10, // Nombre maximum de fichiers
    fieldSize: 2 * 1024 * 1024 // Taille maximale des champs (2MB)
  }
});

// Middleware de validation des fichiers
const validateFiles = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Aucun fichier fourni'
    });
  }
  
  // Vérifier que tous les fichiers sont valides
  const invalidFiles = [];
  
  req.files.forEach(file => {
    if (file.mimetype && !ALLOWED_FILE_TYPES[file.mimetype]) {
      invalidFiles.push({
        filename: file.originalname,
        reason: 'Type de fichier non autorisé'
      });
    }
    
    if (file.size && file.size > getMaxFileSize(file.mimetype)) {
      invalidFiles.push({
        filename: file.originalname,
        reason: 'Fichier trop volumineux'
      });
    }
  });
  
  if (invalidFiles.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Certains fichiers sont invalides',
      invalidFiles
    });
  }
  
  next();
};

// Middleware de nettoyage des fichiers en cas d'erreur
const cleanupOnError = (req, res, next) => {
  // Intercepter les erreurs et nettoyer les fichiers uploadés
  const originalSend = res.send;
  
  res.send = function(data) {
    // Si la réponse est une erreur, nettoyer les fichiers
    if (res.statusCode >= 400 && req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          console.error(`Erreur lors de la suppression du fichier ${file.path}:`, error);
        }
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Middleware pour la gestion des erreurs multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = 'Erreur lors de l\'upload du fichier';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'Fichier trop volumineux';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Trop de fichiers uploadés';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Trop de champs dans le formulaire';
        break;
      case 'LIMIT_FIELD_SIZE':
        message = 'Champ de formulaire trop volumineux';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Fichier inattendu dans le formulaire';
        break;
    }
    
    return res.status(400).json({
      success: false,
      message,
      error: error.code
    });
  }
  
  if (error.message && error.message.includes('Type de fichier non autorisé')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  if (error.message && error.message.includes('Fichier trop volumineux')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// Configuration pour différents types d'upload
const uploadConfigs = {
  // Upload simple (1 fichier)
  single: (fieldName) => [
    upload.single(fieldName),
    validateFiles,
    cleanupOnError
  ],
  
  // Upload multiple (plusieurs fichiers)
  multiple: (fieldName, maxCount = 10) => [
    upload.array(fieldName, maxCount),
    validateFiles,
    cleanupOnError
  ],
  
  // Upload de champs spécifiques
  fields: (fields) => [
    upload.fields(fields),
    validateFiles,
    cleanupOnError
  ],
  
  // Upload de n'importe quel fichier
  any: () => [
    upload.any(),
    validateFiles,
    cleanupOnError
  ]
};

// Fonction utilitaire pour supprimer un fichier
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Erreur lors de la suppression du fichier ${filePath}:`, error);
    return false;
  }
};

// Fonction utilitaire pour obtenir les informations d'un fichier
const getFileInfo = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    }
    return { exists: false };
  } catch (error) {
    console.error(`Erreur lors de la récupération des informations du fichier ${filePath}:`, error);
    return { exists: false, error: error.message };
  }
};

// Fonction utilitaire pour nettoyer les anciens fichiers
const cleanupOldFiles = (directory, maxAgeInDays = 30) => {
  try {
    if (!fs.existsSync(directory)) return;
    
    const files = fs.readdirSync(directory);
    const now = Date.now();
    const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;
    
    files.forEach(filename => {
      const filePath = path.join(directory, filename);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Fichier supprimé: ${filePath}`);
        } catch (error) {
          console.error(`Erreur lors de la suppression de ${filePath}:`, error);
        }
      }
    });
  } catch (error) {
    console.error(`Erreur lors du nettoyage des anciens fichiers:`, error);
  }
};

module.exports = {
  upload,
  uploadConfigs,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZES,
  validateFiles,
  cleanupOnError,
  handleMulterError,
  deleteFile,
  getFileInfo,
  cleanupOldFiles,
  getFileCategory,
  getMaxFileSize
};
