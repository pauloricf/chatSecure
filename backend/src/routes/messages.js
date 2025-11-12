const express = require('express');
const { prisma } = require('../database/prisma');
const { authenticateToken } = require('../middleware/auth');
const MessageSignature = require('../crypto/messageSignature');
const { wsServer } = require('../websocket/server');

const router = express.Router();

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: Enviar mensagem criptografada
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipientId:
 *                 type: string
 *               encryptedMessage:
 *                 type: string
 *               signature:
 *                 type: string
 *               messageHash:
 *                 type: string
 *     responses:
 *       201:
 *         description: Mensagem enviada com sucesso
 *       400:
 *         description: Dados inválidos
 *       404:
 *         description: Destinatário não encontrado
 */
router.post('/', async (req, res) => {
  try {
    const { recipientId, encryptedMessage, encryptedKey, senderEncryptedKey, iv, signature, messageHash } = req.body;

    // Validação básica
    if (!recipientId || !encryptedMessage || !encryptedKey || !iv || !signature || !messageHash) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos são obrigatórios'
      });
    }

    // Verificar se destinatário existe
    const recipient = await prisma.user.findUnique({
      where: { 
        id: recipientId,
        isActive: true
      },
      select: {
        id: true,
        username: true,
        publicKey: true
      }
    });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Destinatário não encontrado'
      });
    }

    // Salvar mensagem no banco
    const message = await prisma.message.create({
      data: {
        content: encryptedMessage,
        encryptedKey: encryptedKey,
        senderEncryptedKey: senderEncryptedKey,
        iv: iv,
        contentHash: messageHash,
        signature,
        senderId: req.user.id,
        receiverId: recipientId,
        isEncrypted: true,
        isRead: false
      },
      include: {
        sender: {
          select: { id: true, username: true }
        },
        receiver: {
          select: { id: true, username: true }
        }
      }
    });

    // Verificar se destinatário está online e enviar via WebSocket
    let delivered = false;
    if (wsServer && wsServer.isUserOnline(recipientId)) {
      try {
        wsServer.sendToUser(recipientId, 'new_message', {
          id: message.id,
          content: message.content,
          encryptedKey: message.encryptedKey,
          senderEncryptedKey: message.senderEncryptedKey,
          iv: message.iv,
          contentHash: message.contentHash,
          signature: message.signature,
          sender: message.sender,
          receiver: message.receiver,
          createdAt: message.createdAt,
          isEncrypted: message.isEncrypted
        });
        
        // Marcar como entregue
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveredAt: new Date() }
        });
        
        delivered = true;
      } catch (wsError) {
        console.error('Erro ao enviar via WebSocket:', wsError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      messageId: message.id,
      sentAt: message.createdAt,
      delivered
    });

  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/send:
 *   post:
 *     summary: Enviar mensagem com assinatura digital
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendMessageRequest'
 *     responses:
 *       201:
 *         description: Mensagem enviada com sucesso
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
 *                   example: Mensagem enviada com sucesso
 *                 messageId:
 *                   type: integer
 *                 sentAt:
 *                   type: string
 *                   format: date-time
 *                 delivered:
 *                   type: boolean
 *       400:
 *         description: Dados inválidos ou assinatura incorreta
 *       404:
 *         description: Destinatário não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.post('/send', async (req, res) => {
  try {
    const { receiverId, content } = req.body;

    // Validação básica
    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: 'receiverId e content são obrigatórios'
      });
    }

    // Verificar se destinatário existe
    const recipient = await prisma.user.findUnique({
      where: { 
        id: parseInt(receiverId),
        isActive: true
      },
      select: {
        id: true,
        username: true,
        publicKey: true
      }
    });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Destinatário não encontrado'
      });
    }

    // Obter certificado ativo do remetente
    const senderCertificate = await prisma.certificate.findFirst({
      where: {
        userId: req.user.id,
        isRevoked: false,
        validTo: { gte: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!senderCertificate) {
      return res.status(400).json({
        success: false,
        message: 'Certificado válido não encontrado'
      });
    }

    // Gerar hash e assinatura da mensagem
    const messageData = {
      content,
      senderId: req.user.id,
      receiverId: parseInt(receiverId),
      timestamp: new Date().toISOString()
    };

    const { hash, signature } = await MessageSignature.signMessage(
      messageData,
      senderCertificate.privateKeyPem
    );

    // Salvar mensagem no banco
    const message = await prisma.message.create({
      data: {
        content,
        contentHash: hash,
        signature,
        senderId: req.user.id,
        receiverId: parseInt(receiverId),
        certificateId: senderCertificate.id,
        isRead: false
      },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true }
        },
        receiver: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    // Verificar se destinatário está online e enviar via WebSocket
    let delivered = false;
    if (wsServer && wsServer.isUserOnline(parseInt(receiverId))) {
      try {
        wsServer.sendToUser(parseInt(receiverId), 'new_message', {
          id: message.id,
          content: message.content,
          sender: message.sender,
          createdAt: message.createdAt
        });
        
        // Marcar como entregue
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveredAt: new Date() }
        });
        
        delivered = true;
      } catch (wsError) {
        console.error('Erro ao enviar via WebSocket:', wsError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      messageId: message.id,
      sentAt: message.createdAt,
      delivered
    });

  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     summary: Listar conversas do usuário
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de conversas obtida com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       lastMessage:
 *                         type: object
 *                         properties:
 *                           content:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           isRead:
 *                             type: boolean
 *                       unreadCount:
 *                         type: integer
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/conversations', async (req, res) => {
  try {
    // Buscar todas as mensagens do usuário (enviadas e recebidas)
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.user.id },
          { receiverId: req.user.id }
        ]
      },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true }
        },
        receiver: {
          select: { id: true, username: true, fullName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Agrupar por conversa e obter última mensagem
    const conversationsMap = new Map();

    messages.forEach(message => {
      const otherUserId = message.senderId === req.user.id 
        ? message.receiverId 
        : message.senderId;
      
      const otherUser = message.senderId === req.user.id 
        ? message.receiver 
        : message.sender;

      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          username: otherUser.username,
          fullName: otherUser.fullName,
          lastMessage: {
            content: message.content,
            createdAt: message.createdAt,
            isRead: message.isRead,
            fromMe: message.senderId === req.user.id
          },
          unreadCount: 0
        });
      }

      // Contar mensagens não lidas recebidas
      if (message.receiverId === req.user.id && !message.isRead) {
        conversationsMap.get(otherUserId).unreadCount++;
      }
    });

    const conversations = Array.from(conversationsMap.values())
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

    res.json({
      success: true,
      conversations
    });

  } catch (error) {
    console.error('Erro ao buscar conversas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/conversation/{userId}:
 *   get:
 *     summary: Obter mensagens de uma conversa específica
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do outro usuário na conversa
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Página para paginação
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Limite de mensagens por página
 *     responses:
 *       200:
 *         description: Mensagens da conversa obtidas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       404:
 *         description: Usuário não encontrado
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/conversation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Verificar se o outro usuário existe
    const otherUser = await prisma.user.findFirst({
      where: { 
        id: userId,
        isActive: true
      },
      select: { id: true, username: true, email: true }
    });

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Buscar mensagens da conversa
    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where: {
          OR: [
            { senderId: req.user.id, receiverId: userId },
            { senderId: userId, receiverId: req.user.id }
          ]
        },
        include: {
          sender: {
            select: { id: true, username: true, email: true }
          },
          receiver: {
            select: { id: true, username: true, email: true }
          },
          certificate: {
            select: { id: true, serialNumber: true, subject: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.message.count({
        where: {
          OR: [
            { senderId: req.user.id, receiverId: userId },
            { senderId: userId, receiverId: req.user.id }
          ]
        }
      })
    ]);

    // Marcar mensagens recebidas como lidas
    await prisma.message.updateMany({
      where: {
        senderId: userId,
        receiverId: req.user.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json({
      success: true,
      messages: messages.reverse(), // Reverter para ordem cronológica
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore: skip + messages.length < totalCount
      }
    });

  } catch (error) {
    console.error('Erro ao buscar mensagens da conversa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/{messageId}/read:
 *   patch:
 *     summary: Marcar mensagem como lida
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da mensagem
 *     responses:
 *       200:
 *         description: Mensagem marcada como lida com sucesso
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
 *                   example: Mensagem marcada como lida
 *                 messageId:
 *                   type: integer
 *                 readAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Mensagem não encontrada
 *       401:
 *         description: Token inválido ou expirado
 */
router.patch('/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Verificar se a mensagem existe e o usuário é o destinatário
    const message = await prisma.message.findFirst({
      where: {
        id: parseInt(messageId),
        receiverId: req.user.id
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        readAt: true,
        isRead: true
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada ou você não é o destinatário'
      });
    }

    if (message.isRead) {
      return res.status(200).json({
        success: true,
        message: 'Mensagem já foi lida',
        messageId: message.id,
        readAt: message.readAt
      });
    }

    // Marcar como lida
    const updatedMessage = await prisma.message.update({
      where: { id: parseInt(messageId) },
      data: {
        isRead: true,
        readAt: new Date()
      },
      select: {
        id: true,
        readAt: true
      }
    });

    // Notificar remetente via WebSocket se estiver online
    if (wsServer && wsServer.isUserOnline(message.senderId)) {
      try {
        wsServer.sendToUser(message.senderId, 'message_read', {
          messageId: message.id,
          readAt: updatedMessage.readAt
        });
      } catch (wsError) {
        console.error('Erro ao notificar via WebSocket:', wsError);
      }
    }

    res.json({
      success: true,
      message: 'Mensagem marcada como lida',
      messageId: updatedMessage.id,
      readAt: updatedMessage.readAt
    });

  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/{messageId}/verify:
 *   get:
 *     summary: Verificar integridade de uma mensagem
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da mensagem
 *     responses:
 *       200:
 *         description: Verificação de integridade realizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messageId:
 *                   type: integer
 *                 sender:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                 verification:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                     hashValid:
 *                       type: boolean
 *                     signatureValid:
 *                       type: boolean
 *                     details:
 *                       type: string
 *       404:
 *         description: Mensagem não encontrada
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/:messageId/verify', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Buscar mensagem e dados do remetente
    const message = await prisma.message.findFirst({
      where: {
        id: parseInt(messageId),
        OR: [
          { senderId: req.user.id },
          { receiverId: req.user.id }
        ]
      },
      include: {
        sender: {
          select: { id: true, username: true, publicKey: true }
        },
        certificate: {
          select: { 
            id: true, 
            publicKeyPem: true, 
            privateKeyPem: true,
            serialNumber: true,
            subject: true
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensagem não encontrada'
      });
    }

    // Verificar integridade
    const messageData = {
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      timestamp: message.createdAt.toISOString()
    };

    const verification = await MessageSignature.verifyMessage(
      messageData,
      message.signature,
      message.contentHash,
      message.certificate.publicKeyPem
    );

    res.json({
      success: true,
      messageId: message.id,
      sender: {
        id: message.sender.id,
        username: message.sender.username
      },
      verification
    });

  } catch (error) {
    console.error('Erro ao verificar mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/stats:
 *   get:
 *     summary: Obter estatísticas de mensagens do usuário
 *     tags: [Mensagens]
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
 *                     totalMessages:
 *                       type: integer
 *                       description: Total de mensagens (enviadas + recebidas)
 *                     sentMessages:
 *                       type: integer
 *                       description: Mensagens enviadas
 *                     receivedMessages:
 *                       type: integer
 *                       description: Mensagens recebidas
 *                     readMessages:
 *                       type: integer
 *                       description: Mensagens recebidas e lidas
 *                     unreadMessages:
 *                       type: integer
 *                       description: Mensagens não lidas
 *                     conversations:
 *                       type: integer
 *                       description: Número de conversas ativas
 *       401:
 *         description: Token inválido ou expirado
 */
router.get('/stats', async (req, res) => {
  try {
    // Buscar estatísticas usando agregações do Prisma
    const [
      totalMessages,
      sentMessages,
      receivedMessages,
      readMessages,
      unreadMessages
    ] = await Promise.all([
      // Total de mensagens
      prisma.message.count({
        where: {
          OR: [
            { senderId: req.user.id },
            { receiverId: req.user.id }
          ]
        }
      }),
      // Mensagens enviadas
      prisma.message.count({
        where: { senderId: req.user.id }
      }),
      // Mensagens recebidas
      prisma.message.count({
        where: { receiverId: req.user.id }
      }),
      // Mensagens lidas
      prisma.message.count({
        where: {
          receiverId: req.user.id,
          isRead: true
        }
      }),
      // Mensagens não lidas
      prisma.message.count({
        where: {
          receiverId: req.user.id,
          isRead: false
        }
      })
    ]);

    // Contar conversas únicas
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.user.id },
          { receiverId: req.user.id }
        ]
      },
      select: {
        senderId: true,
        receiverId: true
      }
    });

    const uniqueUsers = new Set();
    messages.forEach(msg => {
      const otherUserId = msg.senderId === req.user.id ? msg.receiverId : msg.senderId;
      uniqueUsers.add(otherUserId);
    });

    const stats = {
      totalMessages,
      sentMessages,
      receivedMessages,
      readMessages,
      unreadMessages,
      conversations: uniqueUsers.size
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

/**
 * @swagger
 * /api/messages/received/{userId}:
 *   get:
 *     summary: Buscar mensagens recebidas por um usuário específico
 *     tags: [Mensagens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do usuário para buscar mensagens recebidas
 *     responses:
 *       200:
 *         description: Lista de mensagens recebidas
 *       404:
 *         description: Usuário não encontrado
 */
router.get('/received/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    // Buscar mensagens recebidas pelo usuário especificado
    const messages = await prisma.message.findMany({
      where: {
        receiverId: userId
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      messages: messages.map(message => ({
        id: message.id,
        content: message.content,
        encryptedKey: message.encryptedKey,
        iv: message.iv,
        contentHash: message.contentHash,
        signature: message.signature,
        isEncrypted: message.isEncrypted,
        isRead: message.isRead,
        readAt: message.readAt,
        deliveredAt: message.deliveredAt,
        createdAt: message.createdAt,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          email: message.sender.email
        },
        receiver: {
          id: message.receiver.id,
          username: message.receiver.username,
          email: message.receiver.email
        }
      }))
    });

  } catch (error) {
    console.error('Erro ao buscar mensagens recebidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;