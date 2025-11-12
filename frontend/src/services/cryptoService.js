import CryptoJS from 'crypto-js';
import forge from 'node-forge';

/**
 * 🔒 SERVIÇO DE CRIPTOGRAFIA HÍBRIDA
 *
 * Este serviço implementa o sistema de criptografia híbrida:
 * 1. Cifra mensagens com AES (chave simétrica) - RÁPIDO para grandes volumes
 * 2. Protege a chave AES com RSA (chave pública do receptor) - SEGURO
 * 3. Assina digitalmente com RSA (chave privada do remetente) - AUTENTICIDADE
 */
class CryptoService {
  /**
   * 🔑 GERAR CHAVE SIMÉTRICA AES
   */
  generateSymmetricKey() {
    try {
      console.log('🔑 Gerando chave simétrica AES-256...');
      return CryptoJS.lib.WordArray.random(256 / 8).toString();
    } catch (error) {
      console.error('❌ Erro ao gerar chave simétrica:', error);
      throw error;
    }
  }

  /**
   * 🔐 CRIPTOGRAFAR COM CHAVE SIMÉTRICA (AES-256-CBC)
   */
  encryptWithSymmetricKey(message, symmetricKey) {
    try {
      console.log('🔐 Cifrando mensagem com AES-256-CBC...');

      const iv = CryptoJS.lib.WordArray.random(128 / 8);
      const encrypted = CryptoJS.AES.encrypt(message, symmetricKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      return {
        encryptedData: encrypted.toString(),
        iv: iv.toString(),
      };
    } catch (error) {
      console.error('❌ Erro na criptografia simétrica:', error);
      throw error;
    }
  }

  /**
   * 🔓 DESCRIPTOGRAFAR COM CHAVE SIMÉTRICA (AES-256-CBC)
   */
  decryptWithSymmetricKey(encryptedData, symmetricKey, ivHex) {
    try {
      console.log('🔓 Decifrando mensagem com AES-256-CBC...');
      console.log('🔍 Debug - encryptedData:', encryptedData);
      console.log('🔍 Debug - symmetricKey:', symmetricKey);
      console.log('🔍 Debug - ivHex:', ivHex);

      // Verificar se os parâmetros estão definidos
      if (!encryptedData) {
        throw new Error('encryptedData está undefined ou vazio');
      }
      if (!symmetricKey) {
        throw new Error('symmetricKey está undefined ou vazio');
      }
      if (!ivHex) {
        throw new Error('ivHex está undefined ou vazio');
      }

      const decrypted = CryptoJS.AES.decrypt(encryptedData, symmetricKey, {
        iv: CryptoJS.enc.Hex.parse(ivHex),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      console.log('✅ Mensagem descriptografada com sucesso');
      return decryptedText;
    } catch (error) {
      console.error('❌ Erro na descriptografia simétrica:', error);
      throw error;
    }
  }

  /**
   * 🔐 CRIPTOGRAFAR CHAVE SIMÉTRICA COM RSA
   */
  encryptSymmetricKey(symmetricKey, recipientPublicKeyPem) {
    try {
      console.log('🔐 Protegendo chave simétrica com RSA...');
      console.log('🔍 Debug - recipientPublicKeyPem tipo:', typeof recipientPublicKeyPem);
      console.log('🔍 Debug - recipientPublicKeyPem valor:', recipientPublicKeyPem);
      console.log('🔍 Debug - recipientPublicKeyPem primeiros 100 chars:', recipientPublicKeyPem?.substring(0, 100));
      console.log(
        '🔍 Debug - recipientPublicKeyPem últimos 100 chars:',
        recipientPublicKeyPem?.substring(recipientPublicKeyPem.length - 100)
      );
      console.log('🔍 Debug - recipientPublicKeyPem length:', recipientPublicKeyPem?.length);

      // Verificar se a chave está no formato PEM correto
      if (!recipientPublicKeyPem || typeof recipientPublicKeyPem !== 'string') {
        throw new Error('Chave pública inválida: deve ser uma string PEM');
      }

      // Verificar se tem os headers PEM corretos
      if (!recipientPublicKeyPem.includes('-----BEGIN') || !recipientPublicKeyPem.includes('-----END')) {
        throw new Error('Chave pública inválida: formato PEM incorreto');
      }

      // Tentar limpar e normalizar a chave PEM
      let cleanedPem = recipientPublicKeyPem.trim();

      // Verificar se tem quebras de linha corretas
      if (!cleanedPem.includes('\n')) {
        // Se não tem quebras de linha, pode estar em uma linha só
        console.log('🔧 Chave PEM sem quebras de linha, tentando corrigir...');

        // Tentar reconstruir o formato PEM correto
        const lines = [];
        const beginMatch = cleanedPem.match(/-----BEGIN [^-]+-----/);
        const endMatch = cleanedPem.match(/-----END [^-]+-----/);

        if (beginMatch && endMatch) {
          const beginHeader = beginMatch[0];
          const endHeader = endMatch[0];
          const keyData = cleanedPem.replace(beginHeader, '').replace(endHeader, '');

          lines.push(beginHeader);
          // Quebrar o conteúdo em linhas de 64 caracteres
          for (let i = 0; i < keyData.length; i += 64) {
            lines.push(keyData.substring(i, i + 64));
          }
          lines.push(endHeader);

          cleanedPem = lines.join('\n');
          console.log('🔧 Chave PEM corrigida:', cleanedPem);
        }
      }

      const publicKey = forge.pki.publicKeyFromPem(cleanedPem);
      const encrypted = publicKey.encrypt(symmetricKey, 'RSA-OAEP');

      return forge.util.encode64(encrypted);
    } catch (error) {
      console.error('❌ Erro ao criptografar chave simétrica:', error);
      throw error;
    }
  }

  /**
   * 🔓 DESCRIPTOGRAFAR CHAVE SIMÉTRICA COM RSA
   */
  decryptSymmetricKey(encryptedKeyBase64, privateKeyPem) {
    try {
      console.log('🔓 Recuperando chave simétrica com RSA...');
      console.log('🔍 Debug - encryptedKeyBase64 length:', encryptedKeyBase64.length);
      console.log('🔍 Debug - privateKeyPem preview:', privateKeyPem.substring(0, 100) + '...');

      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      console.log('🔍 Debug - Private key loaded successfully');
      console.log('🔍 Debug - Private key n length:', privateKey.n.toString(16).length);

      const encryptedKey = forge.util.decode64(encryptedKeyBase64);
      console.log('🔍 Debug - Encrypted key binary length:', encryptedKey.length);

      // Verificar se o tamanho da chave criptografada corresponde ao tamanho da chave RSA
      const expectedSize = Math.ceil(privateKey.n.bitLength() / 8);
      console.log('🔍 Debug - Expected encrypted size:', expectedSize, 'Actual size:', encryptedKey.length);

      if (encryptedKey.length !== expectedSize) {
        throw new Error(
          `Tamanho da chave criptografada incompatível. Esperado: ${expectedSize}, Recebido: ${encryptedKey.length}`
        );
      }

      return privateKey.decrypt(encryptedKey, 'RSA-OAEP');
    } catch (error) {
      console.error('❌ Erro ao descriptografar chave simétrica:', error);
      throw error;
    }
  }

  /**
   * ✍️ ASSINAR MENSAGEM COM CHAVE PRIVADA
   */
  async signMessage(message, senderPrivateKeyPem) {
    try {
      console.log('✍️ Gerando assinatura digital...');

      const privateKey = forge.pki.privateKeyFromPem(senderPrivateKeyPem);
      const md = forge.md.sha256.create();
      md.update(message, 'utf8');

      const signature = privateKey.sign(md);
      return forge.util.encode64(signature);
    } catch (error) {
      console.error('❌ Erro ao assinar mensagem:', error);
      throw error;
    }
  }

  /**
   * ✅ VERIFICAR ASSINATURA DIGITAL
   */
  async verifySignature(message, signatureBase64, senderPublicKeyPem) {
    try {
      console.log('✅ Verificando assinatura digital...');

      const publicKey = forge.pki.publicKeyFromPem(senderPublicKeyPem);
      const signature = forge.util.decode64(signatureBase64);
      const md = forge.md.sha256.create();
      md.update(message, 'utf8');

      return publicKey.verify(md.digest().bytes(), signature);
    } catch (error) {
      console.error('❌ Erro ao verificar assinatura:', error);
      return false;
    }
  }

  /**
   * 🔐 CRIPTOGRAFIA HÍBRIDA COMPLETA COM ENCRYPT-TO-SELF
   */
  async encryptMessage(message, recipientPublicKeyPem, senderPrivateKeyPem) {
    try {
      console.log('🔐 Iniciando criptografia híbrida com Encrypt-to-Self...');

      // 1. Gerar chave simétrica
      const symmetricKey = this.generateSymmetricKey();

      // 2. Criptografar mensagem com chave simétrica
      const { encryptedData, iv } = this.encryptWithSymmetricKey(message, symmetricKey);

      // 3. Criptografar chave simétrica com chave pública do destinatário
      const encryptedKey = this.encryptSymmetricKey(symmetricKey, recipientPublicKeyPem);

      // 4. ENCRYPT-TO-SELF: Criptografar chave simétrica com chave pública do remetente
      const senderPublicKeyPem = this.extractPublicKeyFromPrivateKey(senderPrivateKeyPem);
      const senderEncryptedKey = this.encryptSymmetricKey(symmetricKey, senderPublicKeyPem);

      // 5. Assinar mensagem
      const signature = await this.signMessage(message, senderPrivateKeyPem);

      // 6. Gerar hash da mensagem
      const messageHash = this.hashMessage(message);

      return {
        encryptedMessage: encryptedData,
        encryptedKey: encryptedKey,
        senderEncryptedKey: senderEncryptedKey, // Nova propriedade para Encrypt-to-Self
        iv: iv,
        signature: signature,
        messageHash: messageHash,
      };
    } catch (error) {
      console.error('❌ Erro no processo de criptografia:', error);
      throw error;
    }
  }

  /**
   * 🔑 EXTRAIR CHAVE PÚBLICA DA CHAVE PRIVADA
   */
  extractPublicKeyFromPrivateKey(privateKeyPem) {
    try {
      console.log('🔑 Extraindo chave pública da chave privada...');

      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);

      return forge.pki.publicKeyToPem(publicKey);
    } catch (error) {
      console.error('❌ Erro ao extrair chave pública:', error);
      throw error;
    }
  }

  /**
   * 🔓 DESCRIPTOGRAFIA HÍBRIDA COMPLETA
   */
  async decryptMessage(encryptedMessage, encryptedKey, iv, recipientPrivateKeyPem) {
    try {
      console.log('🔓 Iniciando descriptografia híbrida...');
      console.log('🔍 Debug - encryptedMessage:', encryptedMessage);
      console.log('🔍 Debug - encryptedKey:', encryptedKey);
      console.log('🔍 Debug - iv:', iv);
      console.log('🔍 Debug - recipientPrivateKeyPem:', recipientPrivateKeyPem ? 'Presente' : 'Undefined');

      // 1. Descriptografar chave simétrica
      const symmetricKey = this.decryptSymmetricKey(encryptedKey, recipientPrivateKeyPem);
      console.log('🔍 Debug - symmetricKey descriptografada:', symmetricKey);

      // 2. Descriptografar mensagem
      const decryptedMessage = this.decryptWithSymmetricKey(encryptedMessage, symmetricKey, iv);

      return decryptedMessage;
    } catch (error) {
      console.error('❌ Erro no processo de descriptografia:', error);
      throw error;
    }
  }

  /**
   * 🔍 GERAR HASH DA MENSAGEM
   */
  hashMessage(message) {
    try {
      const hash = CryptoJS.SHA256(message);
      return hash.toString();
    } catch (error) {
      console.error('❌ Erro ao gerar hash:', error);
      throw error;
    }
  }

  /**
   * 🔍 TESTAR COMPATIBILIDADE DE CHAVES RSA
   */
  testKeyCompatibility(publicKeyPem, privateKeyPem) {
    try {
      console.log('🔍 Testando compatibilidade das chaves RSA...');

      const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

      console.log('🔍 Debug - Public key n:', publicKey.n.toString(16).substring(0, 50) + '...');
      console.log('🔍 Debug - Private key n:', privateKey.n.toString(16).substring(0, 50) + '...');
      console.log('🔍 Debug - Public key e:', publicKey.e.toString());
      console.log('🔍 Debug - Private key e:', privateKey.e.toString());

      // Testar se as chaves são do mesmo par
      const testMessage = 'test-message-for-key-compatibility';

      // Criptografar com chave pública
      const encrypted = publicKey.encrypt(testMessage, 'RSA-OAEP');
      console.log('🔍 Debug - Test encryption successful');

      // Descriptografar com chave privada
      const decrypted = privateKey.decrypt(encrypted, 'RSA-OAEP');
      console.log('🔍 Debug - Test decryption result:', decrypted);

      const isCompatible = decrypted === testMessage;
      console.log('🔍 Debug - Keys are compatible:', isCompatible);

      return isCompatible;
    } catch (error) {
      console.error('❌ Erro no teste de compatibilidade:', error);
      return false;
    }
  }

  /**
   * 🔑 GERAR PAR DE CHAVES E CERTIFICADO AUTOASSINADO
   */
  generateKeyPairWithCertificate(userInfo) {
    try {
      console.log('🔑 Gerando par de chaves RSA e certificado autoassinado no cliente...');
      
      // Gerar par de chaves RSA
      const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
      
      const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
      const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
      
      // Criar certificado autoassinado
      const cert = forge.pki.createCertificate();
      
      // Configurar certificado
      cert.publicKey = keyPair.publicKey;
      cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));
      
      // Definir validade (1 ano)
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
      
      // Definir subject e issuer (mesmo para autoassinado)
      const attrs = [
        { name: 'commonName', value: userInfo.username },
        { name: 'emailAddress', value: userInfo.email },
        { name: 'organizationName', value: 'ChatSecure' },
        { name: 'countryName', value: 'BR' },
      ];
      
      cert.setSubject(attrs);
      cert.setIssuer(attrs); // Autoassinado - subject = issuer
      
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
      
      // Assinar certificado com a própria chave privada (autoassinado)
      cert.sign(keyPair.privateKey, forge.md.sha256.create());
      
      const certificatePem = forge.pki.certificateToPem(cert);
      
      console.log('✅ Par de chaves e certificado autoassinado gerados com sucesso');
      
      return {
        privateKey: privateKeyPem,
        publicKey: publicKeyPem,
        certificate: certificatePem,
        serialNumber: cert.serialNumber,
        subject: `CN=${userInfo.username}`,
        issuer: `CN=${userInfo.username}`, // Autoassinado
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter
      };
    } catch (error) {
      console.error('❌ Erro ao gerar par de chaves e certificado:', error);
      throw error;
    }
  }

  generateKeyPair() {
    try {
      console.log('🔑 Gerando par de chaves RSA no cliente...');
      
      const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
      
      const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
      const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
      
      console.log('✅ Par de chaves gerado com sucesso');
      
      return {
        privateKey: privateKeyPem,
        publicKey: publicKeyPem
      };
    } catch (error) {
      console.error('❌ Erro ao gerar par de chaves:', error);
      throw error;
    }
  }

  /**
   * 🔐 CRIPTOGRAFAR CHAVE PRIVADA COM SENHA DO USUÁRIO
   */
  encryptPrivateKeyWithPassword(privateKeyPem, password) {
    try {
      console.log('🔐 Criptografando chave privada com senha do usuário...');
      
      // Gerar salt aleatório para derivação da chave
      const salt = CryptoJS.lib.WordArray.random(128 / 8);
      
      // Derivar chave da senha usando PBKDF2
      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: 10000
      });
      
      // Gerar IV aleatório
      const iv = CryptoJS.lib.WordArray.random(128 / 8);
      
      // Criptografar a chave privada
      const encrypted = CryptoJS.AES.encrypt(privateKeyPem, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      // Retornar dados necessários para descriptografia
      return {
        encryptedPrivateKey: encrypted.toString(),
        salt: salt.toString(),
        iv: iv.toString()
      };
    } catch (error) {
      console.error('❌ Erro ao criptografar chave privada:', error);
      throw error;
    }
  }

  /**
   * 🔓 DESCRIPTOGRAFAR CHAVE PRIVADA COM SENHA DO USUÁRIO
   */
  decryptPrivateKeyWithPassword(encryptedData, password) {
    try {
      console.log('🔓 CRYPTOSERVICE: Iniciando descriptografia da chave privada...');
      console.log('🔍 CRYPTOSERVICE: Dados recebidos:', {
        hasEncryptedData: !!encryptedData,
        hasPassword: !!password,
        encryptedDataType: typeof encryptedData,
        passwordType: typeof password
      });
      
      const { encryptedPrivateKey, salt, iv } = encryptedData;
      
      console.log('🔍 CRYPTOSERVICE: Campos extraídos:', {
        hasEncryptedPrivateKey: !!encryptedPrivateKey,
        hasSalt: !!salt,
        hasIv: !!iv,
        encryptedPrivateKeyLength: encryptedPrivateKey?.length,
        saltLength: salt?.length,
        ivLength: iv?.length
      });
      
      // Verificar se todos os parâmetros estão presentes
      if (!encryptedPrivateKey || !salt || !iv) {
        console.error('❌ CRYPTOSERVICE: Dados de criptografia incompletos:', {
          encryptedPrivateKey: !!encryptedPrivateKey,
          salt: !!salt,
          iv: !!iv
        });
        throw new Error('Dados de criptografia incompletos');
      }
      
      console.log('🔑 CRYPTOSERVICE: Derivando chave da senha...');
      // Derivar a mesma chave da senha usando o salt original
      const key = CryptoJS.PBKDF2(password, CryptoJS.enc.Hex.parse(salt), {
        keySize: 256 / 32,
        iterations: 10000
      });
      
      console.log('🔓 CRYPTOSERVICE: Executando descriptografia AES...');
      // Descriptografar a chave privada
      const decrypted = CryptoJS.AES.decrypt(encryptedPrivateKey, key, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      
      console.log('🔍 CRYPTOSERVICE: Convertendo resultado para UTF-8...');
      const privateKeyPem = decrypted.toString(CryptoJS.enc.Utf8);
      
      console.log('🔍 CRYPTOSERVICE: Resultado da conversão:', {
        hasResult: !!privateKeyPem,
        resultLength: privateKeyPem?.length,
        startsWithPem: privateKeyPem?.startsWith('-----BEGIN')
      });
      
      if (!privateKeyPem) {
        console.error('❌ CRYPTOSERVICE: Senha incorreta ou dados corrompidos');
        throw new Error('Senha incorreta ou dados corrompidos');
      }
      
      console.log('✅ CRYPTOSERVICE: Chave privada descriptografada com sucesso');
      console.log('🔍 CRYPTOSERVICE: Primeiros 100 chars da chave:', privateKeyPem.substring(0, 100));
      return privateKeyPem;
    } catch (error) {
      console.error('❌ CRYPTOSERVICE: Erro ao descriptografar chave privada:', error);
      console.error('❌ CRYPTOSERVICE: Stack trace:', error.stack);
      throw error;
    }
  }
}

// Criar instância única e exportar
const cryptoService = new CryptoService();
export { cryptoService };
export default cryptoService;
