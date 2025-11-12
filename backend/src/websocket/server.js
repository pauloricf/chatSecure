const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const MessageSignature = require('../crypto/messageSignature');
const { prisma } = require('../database/prisma');

class WebSocketServer {
  constructor() {
    this.clients = new Map(); // Map de userId -> WebSocket
    this.wss = null;
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('🔌 WebSocket Server inicializado');
  }

  async handleConnection(ws, req) {
    try {
      // Extrair token de autenticação
      const token = this.extractToken(req);
      if (!token) {
        ws.close(1008, 'Token de autenticação necessário');
        return;
      }

      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // Se já existe uma conexão para este usuário, fechar a anterior
      const existingWs = this.clients.get(userId);
      if (existingWs && existingWs.readyState === WebSocket.OPEN) {
        console.log(`🔄 Fechando conexão anterior para usuário ${userId}`);
        existingWs.close(1000, 'Nova conexão estabelecida');
      }

      // Armazenar nova conexão
      this.clients.set(userId, ws);
      ws.userId = userId;

      console.log(`👤 Usuário ${userId} conectado via WebSocket`);

      // Configurar handlers
      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnection(ws));
      ws.on('error', (error) => this.handleError(ws, error));

      // Enviar confirmação de conexão
      this.sendToClient(ws, {
        type: 'connection',
        status: 'connected',
        message: 'Conectado com sucesso'
      });

    } catch (error) {
      console.error('Erro na conexão WebSocket:', error);
      ws.close(1008, 'Erro de autenticação');
    }
  }

  extractToken(req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'send_message':
          await this.handleSendMessage(ws, message);
          break;
        case 'typing':
          await this.handleTyping(ws, message);
          break;
        case 'message_read':
          await this.handleMessageRead(ws, message);
          break;
        default:
          this.sendError(ws, 'Tipo de mensagem não reconhecido');
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      this.sendError(ws, 'Erro ao processar mensagem');
    }
  }

  async handleSendMessage(ws, message) {
    try {
      // Verificar se destinatário existe
      const recipient = await prisma.user.findUnique({
        where: { id: message.recipientId }
      });

      if (!recipient) {
        this.sendError(ws, 'Destinatário não encontrado');
        return;
      }

      // Verificar assinatura da mensagem
      const isValidSignature = await MessageSignature.verifyMessage(
        message.content,
        message.signature,
        ws.userId
      );

      if (!isValidSignature) {
        this.sendError(ws, 'Assinatura da mensagem inválida');
        return;
      }

      // Salvar mensagem no banco
      const savedMessage = await this.saveMessage({
        senderId: ws.userId,
        recipientId: message.recipientId,
        content: message.content,
        signature: message.signature,
        messageHash: message.messageHash
      });

      // Enviar para o destinatário se estiver online
      const recipientWs = this.clients.get(message.recipientId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        this.sendToClient(recipientWs, {
          type: 'new_message',
          messageId: savedMessage.id,
          senderId: ws.userId,
          content: message.content,
          signature: message.signature,
          messageHash: message.messageHash,
          sentAt: savedMessage.sent_at
        });

        // Marcar como entregue
        await this.markMessageDelivered(savedMessage.id);
      }

      // Confirmar envio para o remetente
      this.sendToClient(ws, {
        type: 'message_sent',
        messageId: savedMessage.id,
        status: 'sent'
      });

    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      this.sendError(ws, 'Erro ao enviar mensagem');
    }
  }

  async handleTyping(ws, message) {
    try {
      const recipientWs = this.clients.get(message.recipientId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        this.sendToClient(recipientWs, {
          type: 'typing',
          senderId: ws.userId,
          isTyping: message.isTyping
        });
      }
    } catch (error) {
      console.error('Erro ao processar typing:', error);
    }
  }

  async handleMessageRead(ws, message) {
    try {
      // Marcar mensagem como lida
      await this.markMessageRead(message.messageId);

      // Notificar o remetente
      const messageData = await this.getMessageById(message.messageId);
      if (messageData) {
        const senderWs = this.clients.get(messageData.sender_id);
        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
          this.sendToClient(senderWs, {
            type: 'message_read',
            messageId: message.messageId,
            readBy: ws.userId
          });
        }
      }
    } catch (error) {
      console.error('Erro ao marcar mensagem como lida:', error);
    }
  }

  handleDisconnection(ws) {
    if (ws.userId) {
      this.clients.delete(ws.userId);
      console.log(`👤 Usuário ${ws.userId} desconectado`);
    }
  }

  handleError(ws, error) {
    console.error('Erro no WebSocket:', error);
  }

  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  sendError(ws, message) {
    this.sendToClient(ws, {
      type: 'error',
      message: message
    });
  }

  broadcast(data, excludeUserId = null) {
    this.clients.forEach((ws, userId) => {
      if (userId !== excludeUserId && ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, data);
      }
    });
  }

  // Métodos de banco de dados usando Prisma
  async saveMessage(messageData) {
    try {
      const message = await prisma.message.create({
        data: {
          senderId: messageData.senderId,
          recipientId: messageData.recipientId,
          content: messageData.content,
          signature: messageData.signature,
          messageHash: messageData.messageHash
        },
        select: {
          id: true,
          sentAt: true
        }
      });
      
      return {
        id: message.id,
        sent_at: message.sentAt
      };
      
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
      throw new Error('Falha ao salvar mensagem');
    }
  }

  async markMessageDelivered(messageId) {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { deliveredAt: new Date() }
      });
      
    } catch (error) {
      console.error('Erro ao marcar mensagem como entregue:', error);
      throw new Error('Falha ao marcar mensagem como entregue');
    }
  }

  async markMessageRead(messageId) {
    try {
      await prisma.message.update({
        where: { id: messageId },
        data: { readAt: new Date() }
      });
      
    } catch (error) {
      console.error('Erro ao marcar mensagem como lida:', error);
      throw new Error('Falha ao marcar mensagem como lida');
    }
  }

  async getMessageById(messageId) {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          content: true,
          signature: true,
          messageHash: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true
        }
      });
      
      // Converter para formato compatível com código existente
      if (message) {
        return {
          id: message.id,
          sender_id: message.senderId,
          recipient_id: message.recipientId,
          content: message.content,
          signature: message.signature,
          message_hash: message.messageHash,
          sent_at: message.sentAt,
          delivered_at: message.deliveredAt,
          read_at: message.readAt
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Erro ao buscar mensagem:', error);
      throw new Error('Falha ao buscar mensagem');
    }
  }

  // Enviar mensagem para usuário específico
  sendToUser(userId, type, data) {
    const ws = this.clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendToClient(ws, {
        type: type,
        ...data
      });
      return true;
    }
    return false;
  }

  // Verificar se usuário está online
  isUserOnline(userId) {
    const ws = this.clients.get(userId);
    return ws && ws.readyState === WebSocket.OPEN;
  }

  // Obter lista de usuários online
  getOnlineUsers() {
    const onlineUsers = [];
    this.clients.forEach((ws, userId) => {
      if (ws.readyState === WebSocket.OPEN) {
        onlineUsers.push(userId);
      }
    });
    return onlineUsers;
  }
}

// Instância singleton
const wsServer = new WebSocketServer();

function initializeWebSocket(server) {
  wsServer.initialize(server);
}

module.exports = {
  initializeWebSocket,
  wsServer
};