const forge = require('node-forge');
const crypto = require('crypto');
const CertificateManager = require('./certificateManager');

class MessageSignature {
  
  // Assinar mensagem
  static signMessage(message, privateKeyPem) {
    try {
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      
      // Criar hash da mensagem
      const messageHash = this.createMessageHash(message);
      
      // Assinar o hash
      const md = forge.md.sha256.create();
      md.update(messageHash, 'utf8');
      
      const signature = privateKey.sign(md);
      const signatureBase64 = forge.util.encode64(signature);
      
      return {
        signature: signatureBase64,
        messageHash,
        algorithm: 'SHA256withRSA'
      };
    } catch (error) {
      console.error('Erro ao assinar mensagem:', error);
      throw new Error('Falha na assinatura da mensagem');
    }
  }

  // Verificar assinatura da mensagem
  static verifySignature(message, signature, publicKeyPem) {
    try {
      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      
      // Recriar hash da mensagem
      const messageHash = this.createMessageHash(message);
      
      // Verificar assinatura
      const md = forge.md.sha256.create();
      md.update(messageHash, 'utf8');
      
      const signatureBytes = forge.util.decode64(signature);
      const verified = publicKey.verify(md.digest().bytes(), signatureBytes);
      
      return {
        valid: verified,
        messageHash,
        reason: verified ? 'Assinatura válida' : 'Assinatura inválida'
      };
    } catch (error) {
      console.error('Erro ao verificar assinatura:', error);
      return {
        valid: false,
        reason: 'Erro na verificação da assinatura'
      };
    }
  }

  // Criar hash da mensagem
  static createMessageHash(message) {
    // Normalizar mensagem para garantir consistência
    const normalizedMessage = JSON.stringify({
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
      sender: message.sender,
      recipient: message.recipient
    });
    
    return crypto.createHash('sha256').update(normalizedMessage).digest('hex');
  }

  // Assinar e preparar mensagem para envio
  static async prepareSignedMessage(messageData, senderPrivateKey) {
    try {
      // Criar estrutura da mensagem
      const message = {
        content: messageData.content,
        sender: messageData.sender,
        recipient: messageData.recipient,
        timestamp: new Date().toISOString()
      };

      // Assinar mensagem
      const signatureData = this.signMessage(message, senderPrivateKey);
      
      // Retornar mensagem completa
      return {
        ...message,
        signature: signatureData.signature,
        messageHash: signatureData.messageHash,
        algorithm: signatureData.algorithm
      };
    } catch (error) {
      console.error('Erro ao preparar mensagem assinada:', error);
      throw new Error('Falha na preparação da mensagem');
    }
  }

  // Verificar mensagem recebida
  static async verifyReceivedMessage(messageData, senderPublicKey) {
    try {
      // Extrair dados da mensagem
      const message = {
        content: messageData.content,
        sender: messageData.sender,
        recipient: messageData.recipient,
        timestamp: messageData.timestamp
      };

      // Verificar assinatura
      const verification = this.verifySignature(
        message, 
        messageData.signature, 
        senderPublicKey
      );

      // Verificar integridade do hash
      const currentHash = this.createMessageHash(message);
      const hashMatch = currentHash === messageData.messageHash;

      return {
        signatureValid: verification.valid,
        hashValid: hashMatch,
        overall: verification.valid && hashMatch,
        details: {
          signatureReason: verification.reason,
          hashReason: hashMatch ? 'Hash íntegro' : 'Hash não confere',
          originalHash: messageData.messageHash,
          computedHash: currentHash
        }
      };
    } catch (error) {
      console.error('Erro ao verificar mensagem:', error);
      return {
        signatureValid: false,
        hashValid: false,
        overall: false,
        details: {
          signatureReason: 'Erro na verificação',
          hashReason: 'Erro no cálculo do hash'
        }
      };
    }
  }

  // Criptografar mensagem (opcional, para confidencialidade)
  static encryptMessage(message, recipientPublicKey) {
    try {
      const publicKey = forge.pki.publicKeyFromPem(recipientPublicKey);
      const encrypted = publicKey.encrypt(message, 'RSA-OAEP');
      return forge.util.encode64(encrypted);
    } catch (error) {
      console.error('Erro ao criptografar mensagem:', error);
      throw new Error('Falha na criptografia da mensagem');
    }
  }

  // Descriptografar mensagem
  static decryptMessage(encryptedMessage, recipientPrivateKey) {
    try {
      const privateKey = forge.pki.privateKeyFromPem(recipientPrivateKey);
      const encryptedBytes = forge.util.decode64(encryptedMessage);
      const decrypted = privateKey.decrypt(encryptedBytes, 'RSA-OAEP');
      return decrypted;
    } catch (error) {
      console.error('Erro ao descriptografar mensagem:', error);
      throw new Error('Falha na descriptografia da mensagem');
    }
  }

  // Validar integridade completa da mensagem
  static async validateMessageIntegrity(messageData, senderCertificate) {
    try {
      // Verificar certificado do remetente
      const certVerification = CertificateManager.verifyCertificate(senderCertificate);
      if (!certVerification.valid) {
        return {
          valid: false,
          reason: `Certificado inválido: ${certVerification.reason}`
        };
      }

      // Extrair chave pública do certificado
      const cert = forge.pki.certificateFromPem(senderCertificate);
      const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);

      // Verificar mensagem
      const messageVerification = await this.verifyReceivedMessage(messageData, publicKeyPem);
      
      return {
        valid: messageVerification.overall,
        certificateValid: certVerification.valid,
        signatureValid: messageVerification.signatureValid,
        hashValid: messageVerification.hashValid,
        details: {
          certificate: certVerification,
          message: messageVerification.details
        }
      };
    } catch (error) {
      console.error('Erro na validação de integridade:', error);
      return {
        valid: false,
        reason: 'Erro na validação de integridade'
      };
    }
  }
}

module.exports = MessageSignature;