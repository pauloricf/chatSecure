const express = require('express');
const { prisma } = require('../database/prisma');
const { authenticateToken } = require('../middleware/auth');
const CertificateManager = require('../crypto/certificateManager');

const router = express.Router();

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/certificates/my-certificates:
 *   get:
 *     summary: Listar certificados do usuário
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de certificados obtida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 certificates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       serialNumber:
 *                         type: string
 *                       issuedAt:
 *                         type: string
 *                         format: date-time
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                       revoked:
 *                         type: boolean
 *                       revokedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       status:
 *                         type: string
 *                         enum: [active, expired, revoked]
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/my-certificates', async (req, res) => {
  try {
    const certificates = await prisma.certificate.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        serialNumber: true,
        validFrom: true,
        validTo: true,
        isRevoked: true,
        revokedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const certificatesWithStatus = certificates.map(cert => ({
      id: cert.id,
      serialNumber: cert.serialNumber,
      issuedAt: cert.createdAt,
      expiresAt: cert.validTo,
      revoked: cert.isRevoked,
      revokedAt: cert.revokedAt,
      status: cert.isRevoked ? 'revoked' : 
              new Date() > cert.validTo ? 'expired' : 'active'
    }));

    res.json({
      success: true,
      certificates: certificatesWithStatus
    });

  } catch (error) {
    console.error('Erro ao listar certificados:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/{certificateId}:
 *   get:
 *     summary: Obter detalhes de um certificado específico
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do certificado
 *     responses:
 *       200:
 *         description: Detalhes do certificado obtidos com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 certificate:
 *                   $ref: '#/components/schemas/Certificate'
 *                 verification:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                     expired:
 *                       type: boolean
 *                     revoked:
 *                       type: boolean
 *                     details:
 *                       type: string
 *       404:
 *         description: Certificado não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificate = await prisma.certificate.findFirst({
      where: {
        id: parseInt(certificateId),
        userId: req.user.id
      },
      include: {
        user: {
          select: { username: true, email: true }
        }
      }
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificado não encontrado'
      });
    }

    // Verificar certificado
    const verification = CertificateManager.verifyCertificate(certificate.publicKeyPem);

    res.json({
      success: true,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        subject: certificate.subject,
        publicKeyPem: certificate.publicKeyPem,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        isRevoked: certificate.isRevoked,
        revokedAt: certificate.revokedAt,
        owner: {
          username: certificate.user.username,
          email: certificate.user.email
        }
      },
      verification
    });

  } catch (error) {
    console.error('Erro ao obter certificado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/verify:
 *   post:
 *     summary: Verificar validade de um certificado
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               certificatePem:
 *                 type: string
 *                 description: Certificado em formato PEM
 *             required:
 *               - certificatePem
 *     responses:
 *       200:
 *         description: Verificação realizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 verification:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                     expired:
 *                       type: boolean
 *                     revoked:
 *                       type: boolean
 *                     details:
 *                       type: string
 *       400:
 *         description: Certificado inválido
 *       401:
 *         description: Token inválido ou expirado
 */
router.post('/verify', async (req, res) => {
  try {
    const { certificatePem } = req.body;

    if (!certificatePem) {
      return res.status(400).json({
        success: false,
        message: 'certificatePem é obrigatório'
      });
    }

    // Verificar certificado
    const verification = CertificateManager.verifyCertificate(certificatePem);

    res.json({
      success: true,
      verification
    });

  } catch (error) {
    console.error('Erro ao verificar certificado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/{certificateId}/revoke:
 *   patch:
 *     summary: Revogar um certificado
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: certificateId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do certificado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Motivo da revogação
 *             required:
 *               - reason
 *     responses:
 *       200:
 *         description: Certificado revogado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Certificado revogado com sucesso
 *                 certificateId:
 *                   type: integer
 *                 revokedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Certificado já revogado
 *       404:
 *         description: Certificado não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.patch('/:certificateId/revoke', async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Motivo da revogação é obrigatório'
      });
    }

    // Verificar se certificado existe e pertence ao usuário
    const certificate = await prisma.certificate.findFirst({
      where: {
        id: parseInt(certificateId),
        userId: req.user.id
      }
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificado não encontrado'
      });
    }

    if (certificate.isRevoked) {
      return res.status(400).json({
        success: false,
        message: 'Certificado já foi revogado',
        revokedAt: certificate.revokedAt
      });
    }

    // Revogar certificado
    const updatedCertificate = await prisma.certificate.update({
      where: { id: parseInt(certificateId) },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revocationReason: reason
      },
      select: {
        id: true,
        revokedAt: true
      }
    });

    res.json({
      success: true,
      message: 'Certificado revogado com sucesso',
      certificateId: updatedCertificate.id,
      revokedAt: updatedCertificate.revokedAt
    });

  } catch (error) {
    console.error('Erro ao revogar certificado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/serial/{serialNumber}:
 *   get:
 *     summary: Buscar certificado por número de série
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serialNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de série do certificado
 *     responses:
 *       200:
 *         description: Certificado encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 certificate:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     serialNumber:
 *                       type: string
 *                     subject:
 *                       type: string
 *                     publicKeyPem:
 *                       type: string
 *                     validFrom:
 *                       type: string
 *                       format: date-time
 *                     validTo:
 *                       type: string
 *                       format: date-time
 *                     isRevoked:
 *                       type: boolean
 *                     owner:
 *                       type: object
 *                       properties:
 *                         username:
 *                           type: string
 *       404:
 *         description: Certificado não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/serial/:serialNumber', async (req, res) => {
  try {
    const { serialNumber } = req.params;

    const certificate = await prisma.certificate.findFirst({
      where: { serialNumber },
      include: {
        user: {
          select: { username: true, email: true }
        }
      }
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificado não encontrado'
      });
    }

    res.json({
      success: true,
      certificate: {
        id: certificate.id,
        serialNumber: certificate.serialNumber,
        subject: certificate.subject,
        publicKeyPem: certificate.publicKeyPem,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        isRevoked: certificate.isRevoked,
        revokedAt: certificate.revokedAt,
        owner: {
          username: certificate.user.username
        }
      }
    });

  } catch (error) {
    console.error('Erro ao buscar certificado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/revoked/list:
 *   get:
 *     summary: Listar certificados revogados
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de certificados revogados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 revokedCertificates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       serialNumber:
 *                         type: string
 *                       subject:
 *                         type: string
 *                       revokedAt:
 *                         type: string
 *                         format: date-time
 *                       revocationReason:
 *                         type: string
 *                       owner:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/revoked/list', async (req, res) => {
  try {
    const revokedCertificates = await prisma.certificate.findMany({
      where: { isRevoked: true },
      include: {
        user: {
          select: { username: true }
        }
      },
      orderBy: { revokedAt: 'desc' }
    });

    res.json({
      success: true,
      revokedCertificates: revokedCertificates.map(cert => ({
        id: cert.id,
        serialNumber: cert.serialNumber,
        subject: cert.subject,
        revokedAt: cert.revokedAt,
        revocationReason: cert.revocationReason,
        owner: {
          username: cert.user.username
        }
      }))
    });

  } catch (error) {
    console.error('Erro ao listar certificados revogados:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/certificates/stats/overview:
 *   get:
 *     summary: Obter estatísticas dos certificados
 *     tags: [Certificados]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estatísticas obtidas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalCertificates:
 *                       type: integer
 *                     activeCertificates:
 *                       type: integer
 *                     expiredCertificates:
 *                       type: integer
 *                     revokedCertificates:
 *                       type: integer
 *                     userCertificates:
 *                       type: integer
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const now = new Date();

    const [
      totalCertificates,
      activeCertificates,
      expiredCertificates,
      revokedCertificates,
      userCertificates
    ] = await Promise.all([
      // Total de certificados
      prisma.certificate.count(),
      // Certificados ativos (não revogados e não expirados)
      prisma.certificate.count({
        where: {
          isRevoked: false,
          validTo: { gte: now }
        }
      }),
      // Certificados expirados
      prisma.certificate.count({
        where: {
          isRevoked: false,
          validTo: { lt: now }
        }
      }),
      // Certificados revogados
      prisma.certificate.count({
        where: { isRevoked: true }
      }),
      // Certificados do usuário atual
      prisma.certificate.count({
        where: { userId: req.user.id }
      })
    ]);

    const stats = {
      totalCertificates,
      activeCertificates,
      expiredCertificates,
      revokedCertificates,
      userCertificates
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;