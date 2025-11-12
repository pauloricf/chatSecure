const { PrismaClient } = require('../generated/prisma');

// Instância global do Prisma Client
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Em desenvolvimento, usar uma instância global para evitar múltiplas conexões
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.__prisma;
}

// Função para conectar ao banco
async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao PostgreSQL via Prisma');
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com PostgreSQL:', error);
    throw error;
  }
}

// Função para desconectar do banco
async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('✅ Desconectado do PostgreSQL');
  } catch (error) {
    console.error('❌ Erro ao desconectar do PostgreSQL:', error);
  }
}

// Função para verificar se o banco está conectado
async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Falha na verificação de conexão:', error);
    return false;
  }
}

// Função para executar migrações
async function runMigrations() {
  try {
    console.log('🔄 Executando migrações do Prisma...');
    // As migrações são executadas via CLI: npx prisma migrate deploy
    console.log('✅ Execute: npx prisma migrate deploy para aplicar migrações');
    return true;
  } catch (error) {
    console.error('❌ Erro ao executar migrações:', error);
    throw error;
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseConnection,
  runMigrations
};