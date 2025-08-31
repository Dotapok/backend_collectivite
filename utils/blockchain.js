const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Utilitaires pour la gestion blockchain et la traçabilité administrative
 * Note: Cette implémentation simule une blockchain pour la démonstration
 * En production, intégrer avec une vraie blockchain (Ethereum, Hyperledger, etc.)
 */

class BlockchainUtils {
  constructor() {
    this.difficulty = 4; // Difficulté pour le mining (nombre de zéros requis)
    this.pendingTransactions = [];
    this.chain = [];
    this.nodes = new Set();
    
    // Créer le bloc genesis
    this.createGenesisBlock();
  }
  
  /**
   * Créer le bloc genesis (premier bloc)
   */
  createGenesisBlock() {
    const genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      transactions: [],
      previousHash: '0',
      hash: this.calculateHash(0, Date.now(), [], '0'),
      nonce: 0
    };
    
    this.chain.push(genesisBlock);
  }
  
  /**
   * Calculer le hash d'un bloc
   */
  calculateHash(index, timestamp, transactions, previousHash, nonce = 0) {
    const data = index + timestamp + JSON.stringify(transactions) + previousHash + nonce;
    return crypto.createHash('sha256').update(data).toString('hex');
  }
  
  /**
   * Obtenir le dernier bloc de la chaîne
   */
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }
  
  /**
   * Miner un nouveau bloc
   */
  mineBlock(transactions) {
    const previousBlock = this.getLatestBlock();
    const newIndex = previousBlock.index + 1;
    const newTimestamp = Date.now();
    let nonce = 0;
    let newHash;
    
    // Proof of Work
    do {
      newHash = this.calculateHash(newIndex, newTimestamp, transactions, previousBlock.hash, nonce);
      nonce++;
    } while (newHash.substring(0, this.difficulty) !== '0'.repeat(this.difficulty));
    
    const newBlock = {
      index: newIndex,
      timestamp: newTimestamp,
      transactions,
      previousHash: previousBlock.hash,
      hash: newHash,
      nonce
    };
    
    this.chain.push(newBlock);
    return newBlock;
  }
  
  /**
   * Ajouter une nouvelle transaction
   */
  addTransaction(transaction) {
    // Valider la transaction
    if (!this.isValidTransaction(transaction)) {
      throw new Error('Transaction invalide');
    }
    
    // Générer un hash unique pour la transaction
    transaction.hash = this.generateTransactionHash(transaction);
    transaction.timestamp = Date.now();
    transaction.blockNumber = null; // Sera défini lors du mining
    
    this.pendingTransactions.push(transaction);
    
    return transaction;
  }
  
  /**
   * Valider une transaction
   */
  isValidTransaction(transaction) {
    // Vérifier les champs requis
    if (!transaction.type || !transaction.signedBy || !transaction.data) {
      return false;
    }
    
    // Vérifier la signature (simulation)
    if (!this.verifySignature(transaction)) {
      return false;
    }
    
    // Vérifier que la transaction n'existe pas déjà
    if (this.transactionExists(transaction.hash)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Vérifier la signature d'une transaction (simulation)
   */
  verifySignature(transaction) {
    // En production, implémenter la vraie vérification PKI
    // Pour la démonstration, on accepte toutes les signatures
    return true;
  }
  
  /**
   * Vérifier si une transaction existe déjà
   */
  transactionExists(hash) {
    // Vérifier dans les blocs minés
    for (const block of this.chain) {
      if (block.transactions.some(tx => tx.hash === hash)) {
        return true;
      }
    }
    
    // Vérifier dans les transactions en attente
    return this.pendingTransactions.some(tx => tx.hash === hash);
  }
  
  /**
   * Générer un hash pour une transaction
   */
  generateTransactionHash(transaction) {
    const data = transaction.type + transaction.signedBy + JSON.stringify(transaction.data) + Date.now();
    return crypto.createHash('sha256').update(data).toString('hex');
  }
  
  /**
   * Obtenir le statut d'une transaction
   */
  getTransactionStatus(transactionHash) {
    // Vérifier dans les blocs minés
    for (const block of this.chain) {
      const transaction = block.transactions.find(tx => tx.hash === transactionHash);
      if (transaction) {
        return {
          status: 'confirmed',
          blockNumber: block.index,
          confirmations: this.chain.length - block.index,
          timestamp: block.timestamp,
          hash: block.hash
        };
      }
    }
    
    // Vérifier dans les transactions en attente
    const pendingTx = this.pendingTransactions.find(tx => tx.hash === transactionHash);
    if (pendingTx) {
      return {
        status: 'pending',
        blockNumber: null,
        confirmations: 0,
        timestamp: pendingTx.timestamp,
        hash: null
      };
    }
    
    return null;
  }
  
  /**
   * Obtenir l'historique d'une transaction
   */
  getTransactionHistory(transactionHash) {
    const history = [];
    
    // Rechercher dans tous les blocs
    for (const block of this.chain) {
      const transaction = block.transactions.find(tx => tx.hash === transactionHash);
      if (transaction) {
        history.push({
          action: 'mined',
          blockNumber: block.index,
          timestamp: block.timestamp,
          blockHash: block.hash,
          details: {
            nonce: block.nonce,
            previousHash: block.previousHash
          }
        });
        break;
      }
    }
    
    // Ajouter l'action de création
    const pendingTx = this.pendingTransactions.find(tx => tx.hash === transactionHash);
    if (pendingTx) {
      history.unshift({
        action: 'created',
        timestamp: pendingTx.timestamp,
        details: {
          type: pendingTx.type,
          signedBy: pendingTx.signedBy
        }
      });
    }
    
    return history;
  }
  
  /**
   * Obtenir les statistiques de la blockchain
   */
  getBlockchainStats() {
    const totalTransactions = this.chain.reduce((total, block) => total + block.transactions.length, 0);
    const pendingTransactions = this.pendingTransactions.length;
    const totalBlocks = this.chain.length;
    
    // Calculer la difficulté moyenne
    const avgDifficulty = this.chain.length > 1 
      ? this.chain.slice(1).reduce((sum, block) => sum + block.nonce, 0) / (this.chain.length - 1)
      : 0;
    
    return {
      totalTransactions,
      pendingTransactions,
      totalBlocks,
      averageDifficulty: Math.round(avgDifficulty),
      lastBlockHash: this.getLatestBlock().hash,
      lastBlockTimestamp: this.getLatestBlock().timestamp,
      chainIntegrity: this.isChainValid()
    };
  }
  
  /**
   * Vérifier l'intégrité de la chaîne
   */
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      
      // Vérifier le hash du bloc précédent
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
      
      // Vérifier le hash du bloc actuel
      const calculatedHash = this.calculateHash(
        currentBlock.index,
        currentBlock.timestamp,
        currentBlock.transactions,
        currentBlock.previousHash,
        currentBlock.nonce
      );
      
      if (currentBlock.hash !== calculatedHash) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Créer une transaction administrative
   */
  createAdminTransaction(type, data, signedBy, metadata = {}) {
    const transaction = {
      id: uuidv4(),
      type,
      data,
      signedBy,
      metadata,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    return this.addTransaction(transaction);
  }
  
  /**
   * Créer une transaction de projet
   */
  createProjectTransaction(projectId, action, data, signedBy, metadata = {}) {
    const transaction = {
      id: uuidv4(),
      type: 'project_action',
      projectId,
      action,
      data,
      signedBy,
      metadata,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    return this.addTransaction(transaction);
  }
  
  /**
   * Créer une transaction d'évaluation
   */
  createEvaluationTransaction(evaluationId, projectId, action, data, signedBy, metadata = {}) {
    const transaction = {
      id: uuidv4(),
      type: 'evaluation_action',
      evaluationId,
      projectId,
      action,
      data,
      signedBy,
      metadata,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    return this.addTransaction(transaction);
  }
  
  /**
   * Obtenir les transactions d'un projet
   */
  getProjectTransactions(projectId) {
    const transactions = [];
    
    // Rechercher dans les blocs minés
    for (const block of this.chain) {
      const projectTxs = block.transactions.filter(tx => 
        tx.projectId === projectId || 
        (tx.data && tx.data.projectId === projectId)
      );
      
      projectTxs.forEach(tx => {
        transactions.push({
          ...tx,
          blockNumber: block.index,
          confirmations: this.chain.length - block.index,
          minedAt: block.timestamp
        });
      });
    }
    
    // Rechercher dans les transactions en attente
    const pendingTxs = this.pendingTransactions.filter(tx => 
      tx.projectId === projectId || 
      (tx.data && tx.data.projectId === projectId)
    );
    
    pendingTxs.forEach(tx => {
      transactions.push({
        ...tx,
        blockNumber: null,
        confirmations: 0,
        minedAt: null
      });
    });
    
    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Obtenir les transactions d'un utilisateur
   */
  getUserTransactions(userId) {
    const transactions = [];
    
    // Rechercher dans les blocs minés
    for (const block of this.chain) {
      const userTxs = block.transactions.filter(tx => tx.signedBy === userId);
      
      userTxs.forEach(tx => {
        transactions.push({
          ...tx,
          blockNumber: block.index,
          confirmations: this.chain.length - block.index,
          minedAt: block.timestamp
        });
      });
    }
    
    // Rechercher dans les transactions en attente
    const pendingTxs = this.pendingTransactions.filter(tx => tx.signedBy === userId);
    
    pendingTxs.forEach(tx => {
      transactions.push({
        ...tx,
        blockNumber: null,
        confirmations: 0,
        minedAt: null
      });
    });
    
    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Nettoyer les anciennes transactions en attente
   */
  cleanupOldPendingTransactions(maxAgeInHours = 24) {
    const cutoffTime = Date.now() - (maxAgeInHours * 60 * 60 * 1000);
    const initialCount = this.pendingTransactions.length;
    
    this.pendingTransactions = this.pendingTransactions.filter(tx => 
      tx.timestamp > cutoffTime
    );
    
    const removedCount = initialCount - this.pendingTransactions.length;
    if (removedCount > 0) {
      console.log(`Nettoyage: ${removedCount} transactions en attente supprimées`);
    }
    
    return removedCount;
  }
  
  /**
   * Exporter la blockchain (pour sauvegarde)
   */
  exportBlockchain() {
    return {
      chain: this.chain,
      pendingTransactions: this.pendingTransactions,
      difficulty: this.difficulty,
      exportedAt: Date.now(),
      version: '1.0.0'
    };
  }
  
  /**
   * Importer une blockchain (pour restauration)
   */
  importBlockchain(data) {
    if (!data.chain || !Array.isArray(data.chain)) {
      throw new Error('Format de blockchain invalide');
    }
    
    // Vérifier l'intégrité de la chaîne importée
    const tempChain = data.chain;
    for (let i = 1; i < tempChain.length; i++) {
      const currentBlock = tempChain[i];
      const previousBlock = tempChain[i - 1];
      
      if (currentBlock.previousHash !== previousBlock.hash) {
        throw new Error('Chaîne importée corrompue');
      }
    }
    
    this.chain = data.chain;
    this.pendingTransactions = data.pendingTransactions || [];
    this.difficulty = data.difficulty || this.difficulty;
    
    console.log(`Blockchain importée: ${this.chain.length} blocs, ${this.pendingTransactions.length} transactions en attente`);
    
    return true;
  }
}

// Instance singleton
const blockchainUtils = new BlockchainUtils();

module.exports = blockchainUtils;
