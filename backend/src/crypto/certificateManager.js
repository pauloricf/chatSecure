const forge = require('node-forge');
const crypto = require('crypto');
const { prisma } = require('../database/prisma');

class CertificateManager {
  // Gerar par de chaves RSA
  static generateKeyPair() {
    const keyPair = forge.pki.rsa.generateKeyPair(2048);
    const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
    const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);

    console.log('🔑 Debug - Chave pública gerada:', publicKeyPem);
    console.log('🔑 Debug - Tipo da chave pública:', typeof publicKeyPem);
    console.log('🔑 Debug - Primeiros 100 chars:', publicKeyPem.substring(0, 100));

    return {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      privateKeyPem: privateKeyPem,
      publicKeyPem: publicKeyPem,
    };
  }

  // Criar certificado auto-assinado
  static createSelfSignedCertificate(keyPair, userInfo) {
    const cert = forge.pki.createCertificate();

    // Configurar certificado
    cert.publicKey = keyPair.publicKey;
    cert.serialNumber = crypto.randomBytes(16).toString('hex');

    // Definir validade
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
      cert.validity.notBefore.getFullYear() + parseInt(process.env.CERT_VALIDITY_DAYS || 365) / 365
    );

    // Definir subject e issuer (mesmo para auto-assinado)
    const attrs = [
      { name: 'commonName', value: userInfo.username },
      { name: 'emailAddress', value: userInfo.email },
      { name: 'organizationName', value: 'ChatSecure' },
      { name: 'countryName', value: 'BR' },
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Extensões do certificado
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false,
      },
      {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        clientAuth: true,
        emailProtection: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          {
            type: 1, // rfc822Name
            value: userInfo.email,
          },
        ],
      },
    ]);

    // Assinar certificado
    cert.sign(keyPair.privateKey, forge.md.sha256.create());

    return {
      certificate: forge.pki.certificateToPem(cert),
      serialNumber: cert.serialNumber,
      publicKey: keyPair.publicKeyPem,
      privateKey: keyPair.privateKeyPem,
      subject: `CN=${userInfo.username}`,
      issuer: `CN=ChatSecure CA`,
      expiresAt: cert.validity.notAfter,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
    };
  }

  // Gerar certificado para usuário
  static async generateUserCertificate(userInfo) {
    try {
      const keyPair = this.generateKeyPair();
      const certificateData = this.createSelfSignedCertificate(keyPair, userInfo);

      // Retornar apenas os dados do certificado
      // O salvamento será feito na rota de registro
      return certificateData;
    } catch (error) {
      console.error('Erro ao gerar certificado:', error);
      throw new Error('Falha ao gerar certificado');
    }
  }

  // Gerar certificado usando chave pública fornecida pelo cliente
  static async generateUserCertificateWithPublicKey(userInfo) {
    try {
      // Converter chave pública PEM para objeto forge
      const publicKey = forge.pki.publicKeyFromPem(userInfo.publicKey);

      // Criar um objeto keyPair apenas com a chave pública
      const keyPair = {
        publicKey: publicKey,
        privateKey: null, // Não temos a chave privada no servidor
      };

      const certificateData = this.createSelfSignedCertificate(keyPair, userInfo);

      // Retornar apenas os dados do certificado
      return certificateData;
    } catch (error) {
      console.error('Erro ao gerar certificado com chave pública:', error);
      throw new Error('Falha ao gerar certificado com chave pública fornecida');
    }
  }

  // Criptografar chave privada
  static encryptPrivateKey(privateKey, password) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(password, 'salt', 32);
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key);
      cipher.setAAD(Buffer.from('certificate-private-key'));

      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      throw new Error('Falha ao criptografar chave privada');
    }
  }

  // Descriptografar chave privada
  static decryptPrivateKey(encryptedData, password) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = crypto.scryptSync(password, 'salt', 32);

      const decipher = crypto.createDecipheriv(algorithm, key);
      decipher.setAAD(Buffer.from('certificate-private-key'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Falha ao descriptografar chave privada');
    }
  }

  // Verificar certificado
  static verifyCertificate(certificatePem) {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);

      // Verificar se não expirou
      const now = new Date();
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        return { valid: false, reason: 'Certificado expirado' };
      }

      // Verificar assinatura (auto-verificação para certificados auto-assinados)
      const verified = cert.verify(cert);

      if (!verified) {
        return { valid: false, reason: 'Assinatura inválida' };
      }

      return {
        valid: true,
        serialNumber: cert.serialNumber,
        subject: cert.subject.attributes,
        issuer: cert.issuer.attributes,
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter,
      };
    } catch (error) {
      return { valid: false, reason: 'Formato de certificado inválido' };
    }
  }

  // Extrair dados do certificado PEM
  static extractCertificateData(certificatePem) {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      
      // Extrair chave pública do certificado
      const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
      
      // Extrair subject
      const subjectAttrs = cert.subject.attributes;
      const commonName = subjectAttrs.find(attr => attr.name === 'commonName')?.value || 'Unknown';
      const email = subjectAttrs.find(attr => attr.name === 'emailAddress')?.value || '';
      
      // Extrair issuer
      const issuerAttrs = cert.issuer.attributes;
      const issuerCN = issuerAttrs.find(attr => attr.name === 'commonName')?.value || 'Unknown';
      
      return {
        certificate: certificatePem,
        publicKeyPem: publicKeyPem,
        serialNumber: cert.serialNumber,
        subject: `CN=${commonName}`,
        issuer: `CN=${issuerCN}`,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        email: email,
        commonName: commonName
      };
    } catch (error) {
      console.error('Erro ao extrair dados do certificado:', error);
      throw new Error('Falha ao processar certificado');
    }
  }

  // Salvar certificado no banco usando Prisma
  static async saveCertificate(userId, certificateData) {
    try {
      const certificate = await prisma.certificate.create({
        data: {
          userId: userId,
          certificatePem: certificateData.certificate,
          publicKeyPem: certificateData.publicKeyPem,
          serialNumber: certificateData.serialNumber,
          subject: certificateData.subject,
          issuer: certificateData.issuer,
          validFrom: certificateData.validFrom,
          validTo: certificateData.validTo,
        },
      });

      return certificate.id;
    } catch (error) {
      console.error('Erro ao salvar certificado:', error);
      throw new Error('Falha ao salvar certificado no banco de dados');
    }
  }

  // Revogar certificado usando Prisma
  static async revokeCertificate(serialNumber) {
    try {
      await prisma.certificate.update({
        where: { serialNumber: serialNumber },
        data: {
          revoked: true,
          revokedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Erro ao revogar certificado:', error);
      throw new Error('Falha ao revogar certificado');
    }
  }

  // Validar certificado autoassinado
  static validateSelfSignedCertificate(certificatePem) {
    try {
      console.log('🔍 Validando certificado autoassinado...');
      
      const cert = forge.pki.certificateFromPem(certificatePem);
      
      // Verificar se é autoassinado (subject = issuer)
      const subjectCN = cert.subject.attributes.find(attr => attr.name === 'commonName')?.value;
      const issuerCN = cert.issuer.attributes.find(attr => attr.name === 'commonName')?.value;
      
      if (subjectCN !== issuerCN) {
        return { valid: false, reason: 'Certificado não é autoassinado' };
      }
      
      // Verificar validade temporal
      const now = new Date();
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        return { valid: false, reason: 'Certificado expirado ou ainda não válido' };
      }
      
      // Verificar assinatura (autoassinado)
      try {
        const verified = cert.verify(cert);
        if (!verified) {
          return { valid: false, reason: 'Assinatura do certificado inválida' };
        }
      } catch (error) {
        return { valid: false, reason: 'Erro na verificação da assinatura' };
      }
      
      console.log('✅ Certificado autoassinado válido');
      return {
        valid: true,
        serialNumber: cert.serialNumber,
        subject: cert.subject.attributes,
        issuer: cert.issuer.attributes,
        notBefore: cert.validity.notBefore,
        notAfter: cert.validity.notAfter,
        publicKey: forge.pki.publicKeyToPem(cert.publicKey)
      };
    } catch (error) {
      console.error('❌ Erro na validação do certificado:', error);
      return { valid: false, reason: 'Formato de certificado inválido' };
    }
  }
}

module.exports = CertificateManager;
