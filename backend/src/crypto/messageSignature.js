const forge = require('node-forge');
const crypto = require('crypto');
const CertificateManager = require('./certificateManager');
const { prisma } = require('../database/prisma');

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

  // Verificação versátil da mensagem:
  // 1) verifyMessage(messageData, signature, contentHash, publicKeyPem) -> retorna detalhes
  // 2) verifyMessage(content, signature, senderUserId) -> retorna boolean (fallback usado no WebSocket)
  static async verifyMessage(arg1, signature, arg3, arg4) {
    try {
      // Caso completo com dados e hash conhecido
      if (typeof arg1 === 'object' && typeof arg3 === 'string' && typeof arg4 === 'string') {
        const messageData = arg1;
        const contentHash = arg3;
        const publicKeyPem = arg4;

        const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
        const signatureBytes = forge.util.decode64(signature);

        // Verificar assinatura utilizando o hash fornecido
        const md = forge.md.sha256.create();
        md.update(contentHash, 'utf8');
        const signatureValid = publicKey.verify(md.digest().bytes(), signatureBytes);

        // Recalcular hash a partir dos dados para conferir integridade
        const normalized = {
          content: messageData.content,
          sender: messageData.sender ?? messageData.senderId,
          recipient: messageData.recipient ?? messageData.receiverId,
          timestamp: messageData.timestamp
        };
        const recomputedHash = this.createMessageHash(normalized);
        const hashValid = recomputedHash === contentHash;

        return {
          valid: signatureValid && hashValid,
          signatureValid,
          hashValid,
          details: signatureValid
            ? (hashValid ? 'Assinatura e hash válidos' : 'Assinatura válida, hash divergente')
            : 'Assinatura inválida'
        };
      }

      // Fallback simples usado pelo WebSocket: verificar assinatura baseada apenas no conteúdo
      if (typeof arg1 === 'string' && typeof arg3 === 'string' && typeof arg4 === 'undefined') {
        const content = arg1;
        const senderUserId = arg3;

        // Tentar obter chave pública via certificado ativo; se não houver, usar campo publicKey do usuário
        const certificate = await prisma.certificate.findFirst({
          where: {
            userId: senderUserId,
            isRevoked: false,
            validTo: { gte: new Date() }
          },
          orderBy: { createdAt: 'desc' },
          select: { publicKeyPem: true }
        });

        let keyPem = certificate?.publicKeyPem;
        if (!keyPem) {
          const user = await prisma.user.findUnique({
            where: { id: senderUserId },
            select: { publicKey: true }
          });
          keyPem = user?.publicKey || null;
        }

        if (!keyPem) {
          return false;
        }

        const publicKey = forge.pki.publicKeyFromPem(keyPem);
        const signatureBytes = forge.util.decode64(signature);

        // Verificar assinatura baseada somente no conteúdo (compatibilidade legada)
        const md = forge.md.sha256.create();
        md.update(content, 'utf8');
        return publicKey.verify(md.digest().bytes(), signatureBytes);
      }

      // Formato não reconhecido
      return false;
    } catch (error) {
      console.error('Erro ao verificar mensagem:', error);
      return false;
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