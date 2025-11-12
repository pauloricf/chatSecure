const express = require('express');
const bcrypt = require('bcrypt');
const { prisma } = require('../database/prisma');
const { generateToken } = require('../middleware/auth');
const CertificateManager = require('../crypto/certificateManager');

const router = express.Router();

// Registro de usuário
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar novo usuário
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                 token:
 *                   type: string
 *                 certificate:
 *                   type: object
 *       400:
 *         description: Dados inválidos
 *       409:
 *         description: Usuário já existe
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, certificate } = req.body;

    // Validação básica
    if (!username || !email || !password || !certificate) {
      return res.status(400).json({
        error: 'Username, email, password e certificate são obrigatórios'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password deve ter pelo menos 8 caracteres'
      });
    }

    // Validar formato do certificado
    if (!certificate.includes('-----BEGIN CERTIFICATE-----') || !certificate.includes('-----END CERTIFICATE-----')) {
      return res.status(400).json({
        error: 'Formato de certificado inválido'
      });
    }

    // Validar certificado autoassinado
    const certValidation = CertificateManager.validateSelfSignedCertificate(certificate);
    if (!certValidation.valid) {
      return res.status(400).json({
        error: `Certificado inválido: ${certValidation.reason}`
      });
    }

    // Extrair dados do certificado
    const certificateData = CertificateManager.extractCertificateData(certificate);

    // Verificar se o commonName do certificado corresponde ao username
    if (certificateData.commonName !== username) {
      return res.status(400).json({
        error: 'O nome comum do certificado deve corresponder ao username'
      });
    }

    // Verificar se o email do certificado corresponde ao email fornecido
    if (certificateData.email !== email) {
      return res.status(400).json({
        error: 'O email do certificado deve corresponder ao email fornecido'
      });
    }

    // Verificar se usuário já existe
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Usuário ou email já existe'
      });
    }

    // Hash da senha
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    console.log('🔑 Debug - Recebendo certificado autoassinado do cliente');
    console.log('🔑 Debug - Serial Number:', certificateData.serialNumber);
    console.log('🔑 Debug - Subject:', certificateData.subject);

    // Usar transação Prisma
    const result = await prisma.$transaction(async (tx) => {
      // Criar usuário
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          password: passwordHash,
          publicKey: certificateData.publicKeyPem
        },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true
        }
      });

      // Salvar certificado recebido do cliente
      const savedCertificate = await tx.certificate.create({
        data: {
          userId: newUser.id,
          serialNumber: certificateData.serialNumber,
          publicKeyPem: certificateData.publicKeyPem,
          certificatePem: certificateData.certificate,
          subject: certificateData.subject,
          issuer: certificateData.issuer,
          validFrom: certificateData.validFrom,
          validTo: certificateData.validTo
        }
      });

      return { user: newUser, certificate: savedCertificate };
    });

    // Gerar token JWT
    const token = generateToken(result.user.id);

    res.json({
      message: 'Usuário registrado com sucesso',
      user: result.user,
      token,
      certificate: {
        id: result.certificate.id,
        serialNumber: result.certificate.serialNumber,
        publicKeyPem: result.certificate.publicKeyPem,
        certificatePem: result.certificate.certificatePem,
        subject: result.certificate.subject,
        issuer: result.certificate.issuer,
        validFrom: result.certificate.validFrom,
        validTo: result.certificate.validTo
        // Chave privada NUNCA é retornada - permanece apenas no cliente
      }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// Login de usuário
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Fazer login
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username ou email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                 token:
 *                   type: string
 *                 certificate:
 *                   type: object
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Credenciais inválidas
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validação básica
    if (!username || !password) {
      return res.status(400).json({
        error: 'Username e password são obrigatórios'
      });
    }

    // Buscar usuário com certificado
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email: username }
        ]
      },
      include: {
        certificates: {
          where: {
            isRevoked: false
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Credenciais inválidas'
      });
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Credenciais inválidas'
      });
    }

    // Atualizar último acesso
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    });

    // Gerar token
    const token = generateToken(user.id);

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      },
      token,
      certificate: user.certificates[0] ? {
        id: user.certificates[0].id,
        serialNumber: user.certificates[0].serialNumber,
        publicKeyPem: user.certificates[0].publicKeyPem,
        certificatePem: user.certificates[0].certificatePem,
        subject: user.certificates[0].subject,
        issuer: user.certificates[0].issuer,
        validFrom: user.certificates[0].validFrom,
        validTo: user.certificates[0].validTo,
        isRevoked: user.certificates[0].isRevoked
        // Chave privada não é armazenada no banco - cliente deve usar a obtida no registro
      } : null
    });

    console.log('🔑 Debug - Certificate retornado no login (sem chave privada):', user.certificates[0]?.id);

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
});

// Renovar token
/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Renovar token JWT
 *     tags: [Autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token JWT expirado
 *     responses:
 *       200:
 *         description: Token renovado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Token não fornecido
 *       401:
 *         description: Token inválido ou usuário não encontrado
 */
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Token é obrigatório'
      });
    }

    // Verificar token atual (mesmo que expirado)
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    // Verificar se usuário ainda existe
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Usuário não encontrado'
      });
    }

    // Gerar novo token
    const newToken = generateToken(decoded.userId);

    res.json({
      token: newToken
    });

  } catch (error) {
    console.error('Erro ao renovar token:', error);
    res.status(401).json({
      error: 'Token inválido'
    });
  }
});

module.exports = router;