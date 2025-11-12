const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ChatSecure API',
      version: '1.0.0',
      description: 'API para aplicação de mensagens seguras com assinatura digital',
      contact: {
        name: 'ChatSecure Team',
        email: 'support@chatsecure.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Servidor de Desenvolvimento'
      },
      {
        url: `https://api.chatsecure.com`,
        description: 'Servidor de Produção'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT para autenticação'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID único do usuário'
            },
            username: {
              type: 'string',
              description: 'Nome de usuário único'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email do usuário'
            },
            isActive: {
              type: 'boolean',
              description: 'Status ativo do usuário'
            },
            lastSeen: {
              type: 'string',
              format: 'date-time',
              description: 'Último acesso do usuário'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação'
            }
          }
        },
        Message: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID único da mensagem'
            },
            content: {
              type: 'string',
              description: 'Conteúdo da mensagem'
            },
            contentHash: {
              type: 'string',
              description: 'Hash SHA-256 do conteúdo'
            },
            signature: {
              type: 'string',
              description: 'Assinatura digital da mensagem'
            },
            isEncrypted: {
              type: 'boolean',
              description: 'Indica se a mensagem está criptografada'
            },
            isRead: {
              type: 'boolean',
              description: 'Status de leitura da mensagem'
            },
            readAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de leitura'
            },
            deliveredAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de entrega'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação'
            },
            senderId: {
              type: 'string',
              description: 'ID do remetente'
            },
            receiverId: {
              type: 'string',
              description: 'ID do destinatário'
            }
          }
        },
        Certificate: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID único do certificado'
            },
            serialNumber: {
              type: 'string',
              description: 'Número de série do certificado'
            },
            subject: {
              type: 'string',
              description: 'Subject do certificado'
            },
            issuer: {
              type: 'string',
              description: 'Emissor do certificado'
            },
            validFrom: {
              type: 'string',
              format: 'date-time',
              description: 'Data de início da validade'
            },
            validTo: {
              type: 'string',
              format: 'date-time',
              description: 'Data de fim da validade'
            },
            isRevoked: {
              type: 'boolean',
              description: 'Status de revogação'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Mensagem de erro'
            },
            details: {
              type: 'object',
              description: 'Detalhes adicionais do erro'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Autenticação',
        description: 'Endpoints para autenticação e autorização'
      },
      {
        name: 'Usuários',
        description: 'Gerenciamento de usuários'
      },
      {
        name: 'Mensagens',
        description: 'Envio e gerenciamento de mensagens'
      },
      {
        name: 'Certificados',
        description: 'Gerenciamento de certificados digitais'
      },
      {
        name: 'WebSocket',
        description: 'Comunicação em tempo real'
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/websocket/*.js'
  ]
};

const specs = swaggerJsdoc(options);

// Configuração customizada do Swagger UI
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2c3e50; }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 10px; border-radius: 5px; }
  `,
  customSiteTitle: 'ChatSecure API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true
  }
};

module.exports = {
  specs,
  swaggerUi,
  swaggerOptions
};