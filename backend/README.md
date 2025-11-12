# ChatSecure Backend

Backend seguro para aplicação de mensagens com assinatura digital, garantindo **sigilo**, **integridade** e **autenticidade**.

## 🔐 Características de Segurança

- **Assinatura Digital**: Todas as mensagens são assinadas digitalmente usando RSA-2048
- **Certificados Ad-hoc**: Geração automática de certificados auto-assinados para cada usuário
- **Integridade**: Verificação de hash SHA-256 para garantir que mensagens não foram alteradas
- **Autenticidade**: Validação de identidade através de certificados digitais
- **Confidencialidade**: Suporte a criptografia de mensagens (opcional)
- **WebSocket Seguro**: Comunicação em tempo real com autenticação JWT

## 🏗️ Arquitetura

```
src/
├── server.js              # Servidor principal Express
├── database/
│   └── connection.js      # Configuração PostgreSQL + Migrações
├── crypto/
│   ├── certificateManager.js  # Geração e gerenciamento de certificados
│   └── messageSignature.js    # Assinatura e verificação de mensagens
├── websocket/
│   └── server.js          # Servidor WebSocket para tempo real
├── middleware/
│   ├── auth.js            # Autenticação JWT
│   └── errorHandler.js    # Tratamento de erros
└── routes/
    ├── auth.js            # Registro e login
    ├── users.js           # Gerenciamento de usuários
    ├── messages.js        # Envio e recebimento de mensagens
    └── certificates.js    # Gerenciamento de certificados
```

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+
- PostgreSQL 12+
- npm ou yarn

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatsecure
DB_USER=postgres
DB_PASSWORD=sua_senha_postgres

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=sua_chave_secreta_jwt_muito_forte
JWT_EXPIRES_IN=24h

# WebSocket Configuration
WS_PORT=3002

# Security
BCRYPT_ROUNDS=12

# Certificate Configuration
CERT_VALIDITY_DAYS=365
```

### 3. Configurar banco de dados

Crie o banco de dados PostgreSQL:

```sql
CREATE DATABASE chatsecure;
```

### 4. Executar migrações

As migrações são executadas automaticamente na inicialização do servidor.

### 5. Iniciar servidor

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

## 📡 API Endpoints

### Autenticação

- `POST /api/auth/register` - Registrar usuário
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Renovar token

### Usuários

- `GET /api/users/profile` - Perfil do usuário
- `GET /api/users/search?q=termo` - Buscar usuários
- `GET /api/users/:userId/public-key` - Chave pública de usuário
- `POST /api/users/private-key` - Obter chave privada (requer senha)
- `POST /api/users/certificate/regenerate` - Regenerar certificado

### Mensagens

- `POST /api/messages/send` - Enviar mensagem
- `GET /api/messages/conversations` - Listar conversas
- `GET /api/messages/conversation/:userId` - Mensagens de conversa
- `PATCH /api/messages/:messageId/read` - Marcar como lida
- `GET /api/messages/:messageId/verify` - Verificar integridade
- `GET /api/messages/stats` - Estatísticas

### Certificados

- `GET /api/certificates/my-certificates` - Meus certificados
- `GET /api/certificates/:certificateId` - Detalhes do certificado
- `POST /api/certificates/verify` - Verificar certificado
- `PATCH /api/certificates/:certificateId/revoke` - Revogar certificado
- `GET /api/certificates/revoked/list` - Lista de revogação (CRL)

## 🔌 WebSocket

Conecte-se ao WebSocket em `/ws` com token JWT:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token=SEU_JWT_TOKEN');
```

### Eventos WebSocket

**Enviar:**
- `send_message` - Enviar mensagem
- `typing` - Indicar digitação
- `message_read` - Marcar como lida

**Receber:**
- `connection_established` - Conexão estabelecida
- `new_message` - Nova mensagem
- `message_sent` - Confirmação de envio
- `message_read` - Mensagem foi lida
- `user_typing` - Usuário digitando

## 🔐 Fluxo de Segurança

### 1. Registro de Usuário

1. Usuário fornece username, email e senha
2. Sistema gera par de chaves RSA-2048
3. Cria certificado auto-assinado
4. Criptografa chave privada com senha do usuário
5. Armazena dados no banco de dados

### 2. Envio de Mensagem

1. Cliente assina mensagem com chave privada
2. Calcula hash SHA-256 da mensagem
3. Envia mensagem + assinatura + hash
4. Servidor verifica assinatura e integridade
5. Armazena mensagem se válida
6. Entrega via WebSocket se destinatário online

### 3. Verificação de Mensagem

1. Cliente recebe mensagem
2. Obtém certificado do remetente
3. Verifica validade do certificado
4. Verifica assinatura da mensagem
5. Recalcula hash para verificar integridade
6. Exibe status de verificação

## 🛡️ Recursos de Segurança

### Certificados Digitais

- **RSA-2048**: Chaves de 2048 bits
- **SHA-256**: Hash seguro para assinaturas
- **Auto-assinados**: Certificados gerados localmente
- **Revogação**: Sistema de revogação de certificados
- **Validade**: Certificados com prazo de validade

### Proteções

- **Rate Limiting**: Limite de requisições por IP
- **CORS**: Controle de origem cruzada
- **Helmet**: Headers de segurança
- **JWT**: Tokens seguros para autenticação
- **bcrypt**: Hash seguro de senhas
- **Validação**: Validação rigorosa de entrada

## 🔧 Desenvolvimento

### Scripts disponíveis

```bash
npm run dev      # Servidor com nodemon
npm start        # Servidor produção
npm run migrate  # Executar migrações
npm run seed     # Popular banco com dados teste
```

### Estrutura do Banco

```sql
-- Usuários
users (id, username, email, password_hash, public_key, private_key_encrypted, certificate)

-- Mensagens
messages (id, sender_id, recipient_id, content, signature, message_hash, encrypted, sent_at, delivered_at, read_at)

-- Certificados
certificates (id, user_id, certificate_pem, public_key_pem, serial_number, issued_at, expires_at, revoked, revoked_at)
```

## 📝 Exemplo de Uso

### Registrar usuário

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "password": "senha123456"
  }'
```

### Enviar mensagem

```bash
curl -X POST http://localhost:3001/api/messages/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -d '{
    "recipientId": "uuid-do-destinatario",
    "content": "Olá, esta é uma mensagem segura!",
    "signature": "assinatura-digital-base64",
    "messageHash": "hash-sha256-da-mensagem"
  }'
```

## 🚨 Considerações de Segurança

1. **Chaves Privadas**: Nunca são transmitidas ou armazenadas em texto plano
2. **Senhas**: Sempre hasheadas com bcrypt e salt
3. **Tokens JWT**: Configurar chave secreta forte
4. **HTTPS**: Usar HTTPS em produção
5. **Firewall**: Configurar firewall adequadamente
6. **Backup**: Fazer backup regular do banco de dados

## 📄 Licença

MIT License - veja arquivo LICENSE para detalhes.