const express = require('express');
const { prisma } = require('../database/prisma');
const { authenticateToken } = require('../middleware/auth');
const CertificateManager = require('../crypto/certificateManager');

const router = express.Router();

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Listar todos os usuários ativos
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários obtida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Token inválido ou expirado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } }, // Excluir o próprio usuário
          { isActive: true },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        publicKey: true,
        isActive: true,
        lastSeen: true,
        createdAt: true,
      },
      orderBy: { username: 'asc' },
    });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Obter perfil do usuário atual
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário obtido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Token inválido ou expirado
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        publicKey: true,
        isActive: true,
        lastAccess: true,
        createdAt: true,
        updatedAt: true,
        certificates: {
          where: { isRevoked: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            serialNumber: true,
            subject: true,
            validFrom: true,
            validTo: true,
            isRevoked: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    res.json({
      success: true,
      user: {
        ...user,
        certificate: user.certificates[0] || null,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

/**
 * @swagger
 * /api/users/search:
 *   get:
 *     summary: Buscar usuários para contatos
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Termo de busca (username ou email)
 *     responses:
 *       200:
 *         description: Lista de usuários encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *       400:
 *         description: Query inválida (menos de 2 caracteres)
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query deve ter pelo menos 2 caracteres',
      });
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user.id } },
          { isActive: true },
          {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        isActive: true,
        lastAccess: true,
      },
      take: 20,
      orderBy: { username: 'asc' },
    });

    res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error('Erro na busca de usuários:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

/**
 * @swagger
 * /api/users/{userId}/public-key:
 *   get:
 *     summary: Obter chave pública de um usuário
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário
 *     responses:
 *       200:
 *         description: Chave pública obtida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 publicKey:
 *                   type: string
 *                   description: Chave pública em formato PEM
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     fullName:
 *                       type: string
 *       404:
 *         description: Usuário não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/:userId/public-key', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        publicKey: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    res.json({
      success: true,
      publicKey: user.publicKey,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
      },
    });

    console.log('🔑 Debug - Retornando publicKey:', user.publicKey);
    console.log('🔑 Debug - Tipo:', typeof user.publicKey);
    console.log('🔑 Debug - Primeiros 100 chars:', user.publicKey?.substring(0, 100));
  } catch (error) {
    console.error('Erro ao buscar chave pública:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// Verificar certificado de um usuário
router.get('/:userId/certificate/verify', async (req, res) => {
  try {
    const { userId } = req.params;

    // Buscar o certificado mais recente do usuário
    const certificate = await prisma.certificate.findFirst({
      where: { userId, isRevoked: false },
      orderBy: { createdAt: 'desc' },
      select: { certificatePem: true },
    });

    if (!certificate) {
      return res.status(404).json({ error: 'Certificado não encontrado' });
    }

    const verification = CertificateManager.verifyCertificate(certificate.certificatePem);

    res.json({
      userId,
      verification,
    });
  } catch (error) {
    console.error('Erro ao verificar certificado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Regenerar certificado do usuário
router.post('/certificate/regenerate', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Password é obrigatório',
      });
    }

    // Buscar usuário usando Prisma
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        certificates: {
          where: {
            isRevoked: false,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
      });
    }

    // Verificar senha
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'Senha incorreta',
      });
    }

    // Usar transação Prisma
    const result = await prisma.$transaction(async (tx) => {
      // Revogar certificados atuais
      if (user.certificates.length > 0) {
        await tx.certificate.updateMany({
          where: {
            userId: req.user.id,
            isRevoked: false,
          },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
          },
        });
      }

      // Gerar novo certificado
      const certificateData = await CertificateManager.generateUserCertificate({
        username: user.username,
        email: user.email,
        password,
      });

      // Atualizar chave pública do usuário
      await tx.user.update({
        where: { id: req.user.id },
        data: {
          publicKey: certificateData.publicKey,
        },
      });

      // Criar novo certificado SEM chave privada
      const newCertificate = await tx.certificate.create({
        data: {
          userId: req.user.id,
          serialNumber: certificateData.serialNumber,
          publicKeyPem: certificateData.publicKey,
          certificatePem: certificateData.certificate,
          subject: certificateData.subject,
          issuer: certificateData.issuer,
          validFrom: new Date(certificateData.validFrom),
          validTo: new Date(certificateData.validTo),
        },
      });

      return { certificateData, newCertificate };
    });

    res.json({
      message: 'Certificado regenerado com sucesso',
      certificate: {
        id: result.newCertificate.id,
        serialNumber: result.newCertificate.serialNumber,
        publicKeyPem: result.newCertificate.publicKeyPem,
        certificatePem: result.newCertificate.certificatePem,
        subject: result.newCertificate.subject,
        issuer: result.newCertificate.issuer,
        validFrom: result.newCertificate.validFrom,
        validTo: result.newCertificate.validTo,
        // Nova chave privada retornada apenas no response para o cliente armazenar
        privateKey: result.certificateData.privateKey,
      },
    });
  } catch (error) {
    console.error('Erro ao regenerar certificado:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
    });
  }
});

module.exports = router;
